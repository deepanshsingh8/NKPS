import { NextResponse } from "next/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { createClient } from "@nkps/shared/lib/supabase/server";
import { linkSelfStudentSchema } from "@nkps/shared/lib/validations";
import { rateLimit, clientIp } from "@nkps/shared/lib/rate-limit";

// A student claiming their own record at first login. Mirrors the parent
// link-child verification (admission number + date of birth) but writes
// profiles.student_id. Only links when the account isn't already linked, so a
// student can't repoint their login at another student's record.
export async function POST(request: Request) {
  try {
    const serverSupabase = await createClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("role, student_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "student") {
      return NextResponse.json(
        { error: "Forbidden: student access required" },
        { status: 403 }
      );
    }
    if (profile.student_id) {
      return NextResponse.json(
        { error: "Your account is already linked to a student record." },
        { status: 409 }
      );
    }

    // Rate-limit by user and IP to stop a stolen account from brute-forcing
    // admission_no/DOB pairs against the directory.
    const userLimit = rateLimit({
      name: "link-self:user",
      key: user.id,
      max: 5,
      windowSeconds: 30 * 60,
    });
    if (!userLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }
    const ipLimit = rateLimit({
      name: "link-self:ip",
      key: clientIp(request),
      max: 20,
      windowSeconds: 30 * 60,
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const result = linkSelfStudentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { admission_no, date_of_birth } = result.data;
    const admin = createAdminClient();

    const { data: student } = await admin
      .from("students")
      .select("id, date_of_birth, full_name, admission_no, is_active")
      .eq("admission_no", admission_no)
      .single();

    // Collapse "no such admission no" and "DOB mismatch" into one generic
    // message so the admission_no space can't be enumerated.
    const verifyFailed = NextResponse.json(
      {
        error:
          "We couldn't verify a student with those details. Double-check the admission number and date of birth, then try again.",
      },
      { status: 400 }
    );
    if (!student || !student.is_active) return verifyFailed;
    if (!student.date_of_birth) {
      return NextResponse.json(
        {
          error:
            "This student's date of birth has not been recorded yet. Please contact the school administration.",
        },
        { status: 422 }
      );
    }
    if (student.date_of_birth !== date_of_birth) return verifyFailed;

    // Guard against two accounts claiming the same student record.
    const { data: alreadyClaimed } = await admin
      .from("profiles")
      .select("id")
      .eq("student_id", student.id)
      .maybeSingle();
    if (alreadyClaimed) {
      return NextResponse.json(
        {
          error:
            "This student record is already connected to another account. Please contact the school administration.",
        },
        { status: 409 }
      );
    }

    const { error: linkErr } = await admin
      .from("profiles")
      .update({ student_id: student.id })
      .eq("id", user.id)
      .is("student_id", null);
    if (linkErr) {
      console.error("link-self: failed to set student_id:", linkErr);
      return NextResponse.json(
        { error: "Failed to connect your account. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      student: { full_name: student.full_name, admission_no: student.admission_no },
    });
  } catch (err) {
    console.error("link-self error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
