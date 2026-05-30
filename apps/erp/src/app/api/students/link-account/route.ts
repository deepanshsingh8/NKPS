import { NextResponse } from "next/server";
import { verifyAdmin } from "@nkps/shared/lib/verify-admin";
import { z } from "zod";

// Admin repair tool: connect an existing student/parent login to a student
// record by admission number. Fixes accounts that were created without a link
// (or linked to the wrong id). Admin-only — account↔record links are a
// privilege boundary, same as /admin users management.

// GET ?admission_no=... → resolve a student for the "verify before link" step.
export async function GET(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admissionNo = new URL(request.url).searchParams.get("admission_no")?.trim();
  if (!admissionNo) {
    return NextResponse.json({ error: "admission_no is required" }, { status: 400 });
  }

  const { data: student } = await admin
    .from("students")
    .select("id, full_name, admission_no, is_active, student_enrollments(status, classes(name, section))")
    .eq("admission_no", admissionNo)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ found: false });
  }

  const enrollments = (student.student_enrollments as unknown as
    | { status: string; classes: { name: string; section: string } | null }[]
    | null) ?? [];
  const active = enrollments.find((e) => e.status === "active") ?? enrollments[0];
  const cls = active?.classes ?? null;

  return NextResponse.json({
    found: true,
    student: {
      full_name: student.full_name,
      admission_no: student.admission_no,
      is_active: student.is_active,
      class_label: cls ? `${cls.name} — ${cls.section}` : null,
    },
  });
}

const linkAccountSchema = z.object({
  profile_id: z.string().uuid(),
  admission_no: z.string().trim().min(1),
  relationship: z.enum(["father", "mother", "guardian"]).optional(),
});

export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = linkAccountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { profile_id, admission_no, relationship } = parsed.data;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, student_id, parent_id, full_name, email, phone")
    .eq("id", profile_id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (profile.role !== "student" && profile.role !== "parent") {
    return NextResponse.json(
      { error: "Only student or parent accounts can be linked to a student record." },
      { status: 400 }
    );
  }

  const { data: student } = await admin
    .from("students")
    .select("id, full_name, admission_no")
    .eq("admission_no", admission_no.trim())
    .maybeSingle();
  if (!student) {
    return NextResponse.json(
      { error: `No student found with admission number "${admission_no}".` },
      { status: 404 }
    );
  }

  // ---- Student account: set profiles.student_id ----
  if (profile.role === "student") {
    const { data: claimedBy } = await admin
      .from("profiles")
      .select("id")
      .eq("student_id", student.id)
      .neq("id", profile_id)
      .maybeSingle();
    if (claimedBy) {
      return NextResponse.json(
        {
          error: `${student.full_name}'s record is already linked to another account. Unlink that first.`,
        },
        { status: 409 }
      );
    }
    const { error } = await admin
      .from("profiles")
      .update({ student_id: student.id })
      .eq("id", profile_id);
    if (error) {
      console.error("link-account: set student_id failed:", error);
      return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      linked: { student_name: student.full_name, admission_no: student.admission_no },
    });
  }

  // ---- Parent account: ensure parents row + student_parents junction ----
  let parentId = profile.parent_id as string | null;
  if (!parentId && profile.email) {
    const { data: existing } = await admin
      .from("parents")
      .select("id")
      .eq("email", profile.email)
      .maybeSingle();
    parentId = existing?.id ?? null;
  }
  if (!parentId) {
    const { data: created, error: createErr } = await admin
      .from("parents")
      .insert({
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone || "",
        relationship: relationship || "guardian",
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("link-account: provision parent failed:", createErr);
      return NextResponse.json({ error: "Failed to set up parent record" }, { status: 500 });
    }
    parentId = created.id;
  }
  if (profile.parent_id !== parentId) {
    await admin.from("profiles").update({ parent_id: parentId }).eq("id", profile_id);
  }

  const { data: existingLink } = await admin
    .from("student_parents")
    .select("id")
    .eq("student_id", student.id)
    .eq("parent_id", parentId)
    .maybeSingle();
  if (existingLink) {
    return NextResponse.json({
      success: true,
      alreadyLinked: true,
      linked: { student_name: student.full_name, admission_no: student.admission_no },
    });
  }

  const { count } = await admin
    .from("student_parents")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id);

  const { error: insertErr } = await admin.from("student_parents").insert({
    student_id: student.id,
    parent_id: parentId,
    relationship: relationship || "guardian",
    is_primary_contact: (count ?? 0) === 0,
  });
  if (insertErr && insertErr.code !== "23505") {
    console.error("link-account: junction insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to link parent to student" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    linked: { student_name: student.full_name, admission_no: student.admission_no },
  });
}
