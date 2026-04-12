import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { studentBulkUploadSchema } from "@/lib/validations";
import { createPortalUser } from "@/lib/create-portal-user";

export async function POST(request: Request) {
  try {
    // Verify admin auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = studentBulkUploadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { students } = result.data;
    const admin = createAdminClient();

    // Fetch current academic year
    const { data: currentYear } = await admin
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .single();

    if (!currentYear) {
      return NextResponse.json(
        { error: "No current academic year is set. Please set one first." },
        { status: 400 }
      );
    }

    // Fetch all classes for the current academic year
    const { data: allClasses } = await admin
      .from("classes")
      .select("id, name, section")
      .eq("academic_year_id", currentYear.id);

    const classMap = new Map<string, string>();
    for (const c of allClasses || []) {
      // Key: "className|section" (case-insensitive)
      const key = `${c.name.trim().toLowerCase()}|${c.section.trim().toLowerCase()}`;
      classMap.set(key, c.id);
    }

    // Sort order helper
    const CLASS_ORDER = [
      "Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V",
      "VI", "VII", "VIII", "IX", "X", "XI", "XII",
    ];
    const SECTION_ORDER = ["A", "B", "C", "D", "E"];

    function getSortOrder(name: string, section: string): number {
      // Match base class name (e.g. "XII" from "XII Science")
      const base = name.split(" ")[0];
      const classIdx = CLASS_ORDER.findIndex(
        (c) => c.toLowerCase() === base.toLowerCase()
      );
      const secIdx = SECTION_ORDER.findIndex(
        (s) => s.toLowerCase() === section.toLowerCase()
      );
      return (classIdx === -1 ? 99 : classIdx) * 10 + (secIdx === -1 ? 0 : secIdx);
    }

    // Auto-create missing classes from student data
    const neededClasses = new Set<string>();
    for (const s of students) {
      let resolvedName = s.class_name.trim();
      if (s.stream && s.stream.trim()) {
        resolvedName = `${resolvedName} ${s.stream.trim()}`;
      }
      const section = (s.section || "A").trim();
      const key = `${resolvedName.toLowerCase()}|${section.toLowerCase()}`;
      if (!classMap.has(key)) {
        neededClasses.add(`${resolvedName}|||${section}`);
      }
    }

    let classesCreated = 0;
    for (const entry of neededClasses) {
      const [name, section] = entry.split("|||");
      const { data: created, error: createErr } = await admin
        .from("classes")
        .insert({
          name,
          section,
          academic_year_id: currentYear.id,
          sort_order: getSortOrder(name, section),
        })
        .select("id")
        .single();

      if (createErr) {
        // Could be a race-condition duplicate — try fetching it
        const { data: existing } = await admin
          .from("classes")
          .select("id")
          .eq("name", name)
          .eq("section", section)
          .eq("academic_year_id", currentYear.id)
          .single();
        if (existing) {
          classMap.set(`${name.toLowerCase()}|${section.toLowerCase()}`, existing.id);
        }
      } else if (created) {
        classMap.set(`${name.toLowerCase()}|${section.toLowerCase()}`, created.id);
        classesCreated++;
      }
    }

    let inserted = 0;
    let updated = 0;
    const errors: { admission_no: string; error: string }[] = [];

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      for (const s of batch) {
        // Resolve class name: if stream is provided, combine with class (e.g., "XI" + "Science" → "XI Science")
        let resolvedClassName = s.class_name.trim();
        if (s.stream && s.stream.trim()) {
          resolvedClassName = `${resolvedClassName} ${s.stream.trim()}`;
        }

        const section = (s.section || "A").trim();
        const classKey = `${resolvedClassName.toLowerCase()}|${section.toLowerCase()}`;
        const classId = classMap.get(classKey);

        if (!classId) {
          errors.push({
            admission_no: s.admission_no,
            error: `Class "${resolvedClassName} - ${section}" not found. Create it first in Classes management.`,
          });
          continue;
        }

        // Upsert student
        const studentRecord = {
          admission_no: s.admission_no.trim(),
          full_name: s.full_name.trim(),
          father_name: s.father_name?.trim() || null,
          mother_name: s.mother_name?.trim() || null,
          date_of_birth: s.date_of_birth || null,
          gender: s.gender || null,
          phone: s.phone?.trim() || null,
          address: s.address?.trim() || null,
          email: s.email?.trim() || null,
          blood_group: s.blood_group?.trim() || null,
          category: s.category?.trim() || null,
          aadhar_number: s.aadhar_number?.trim() || null,
          previous_school: s.previous_school?.trim() || null,
        };

        const { data: upserted, error: upsertError } = await admin
          .from("students")
          .upsert(studentRecord, { onConflict: "admission_no" })
          .select("id, admission_no")
          .single();

        if (upsertError) {
          errors.push({
            admission_no: s.admission_no,
            error: upsertError.message,
          });
          continue;
        }

        if (upserted) {
          // Create/update enrollment
          await admin.from("student_enrollments").upsert(
            {
              student_id: upserted.id,
              class_id: classId,
              roll_number: s.roll_number || null,
            },
            { onConflict: "student_id,class_id" }
          );
          inserted++;
        }
      }
    }

    // Auto-create portal users for students with emails
    let usersCreated = 0;
    const failedAdmissions = new Set(errors.map((e) => e.admission_no));

    for (const s of students) {
      const email = s.email?.trim();
      if (!email || failedAdmissions.has(s.admission_no)) continue;

      const { data: studentRow } = await admin
        .from("students")
        .select("id")
        .eq("admission_no", s.admission_no.trim())
        .single();

      const userResult = await createPortalUser({
        email,
        fullName: s.full_name.trim(),
        role: "student",
        phone: s.phone || null,
      });

      if (userResult.success && userResult.userId && studentRow) {
        await admin
          .from("profiles")
          .update({ student_id: studentRow.id })
          .eq("id", userResult.userId);
        usersCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      usersCreated,
      classesCreated,
      errors,
      total: students.length,
    });
  } catch (err) {
    console.error("Bulk student upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
