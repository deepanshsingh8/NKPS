import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { linkChildSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    // Authenticate the caller
    const serverSupabase = await createClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify caller is a parent with a linked parent record
    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("role, parent_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "parent") {
      return NextResponse.json(
        { error: "Forbidden: parent access required" },
        { status: 403 }
      );
    }

    if (!profile.parent_id) {
      return NextResponse.json(
        { error: "Parent profile not set up. Please contact the school administration." },
        { status: 403 }
      );
    }

    // Validate request body
    const body = await request.json();
    const result = linkChildSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { admission_no, date_of_birth, relationship } = result.data;
    const supabase = createAdminClient();

    // Look up student by admission number
    const { data: student } = await supabase
      .from("students")
      .select("id, date_of_birth, full_name, admission_no, photo_url, is_active")
      .eq("admission_no", admission_no)
      .single();

    if (!student || !student.is_active) {
      return NextResponse.json(
        { error: "No student found with this admission number" },
        { status: 404 }
      );
    }

    // Verify date of birth
    if (!student.date_of_birth) {
      return NextResponse.json(
        {
          error:
            "This student's date of birth has not been recorded in the system. Please contact the school administration.",
        },
        { status: 422 }
      );
    }

    if (student.date_of_birth !== date_of_birth) {
      return NextResponse.json(
        { error: "The date of birth does not match our records" },
        { status: 400 }
      );
    }

    // Check for existing link
    const { data: existingLink } = await supabase
      .from("student_parents")
      .select("id")
      .eq("student_id", student.id)
      .eq("parent_id", profile.parent_id)
      .single();

    if (existingLink) {
      return NextResponse.json(
        { error: "This child is already linked to your account" },
        { status: 409 }
      );
    }

    // Determine primary contact status
    const { count } = await supabase
      .from("student_parents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id);

    const isPrimary = (count ?? 0) === 0;

    // Create the junction record
    const { error: insertError } = await supabase
      .from("student_parents")
      .insert({
        student_id: student.id,
        parent_id: profile.parent_id,
        relationship,
        is_primary_contact: isPrimary,
      });

    if (insertError) {
      // Handle unique constraint violation (race condition)
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "This child is already linked to your account" },
          { status: 409 }
        );
      }
      console.error("Failed to link child:", insertError);
      return NextResponse.json(
        { error: "Failed to link child. Please try again." },
        { status: 500 }
      );
    }

    // Fetch enrollment info to return full child data
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("class_id, roll_number, classes(name, section)")
      .eq("student_id", student.id)
      .limit(1)
      .single();

    const classInfo = enrollment?.classes as unknown as {
      name: string;
      section: string;
    } | null;

    return NextResponse.json({
      success: true,
      child: {
        student_id: student.id,
        relationship,
        is_primary_contact: isPrimary,
        student: {
          id: student.id,
          admission_no: student.admission_no,
          full_name: student.full_name,
          photo_url: student.photo_url,
        },
        class_name: classInfo?.name ?? null,
        section: classInfo?.section ?? null,
        roll_number: enrollment?.roll_number ?? null,
      },
    });
  } catch (err) {
    console.error("Link child error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
