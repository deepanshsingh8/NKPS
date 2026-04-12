import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildWelcomeEmail } from "@/lib/email";
import { generateSecurePassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    // Verify the caller is an admin
    const serverSupabase = await createClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile } = await serverSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "Registration request ID is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch the registration request
    const { data: registration, error: fetchError } = await supabase
      .from("registration_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !registration) {
      return NextResponse.json(
        { error: "Registration request not found" },
        { status: 404 }
      );
    }

    if (registration.status !== "pending") {
      return NextResponse.json(
        { error: `This request has already been ${registration.status}` },
        { status: 400 }
      );
    }

    // Generate a cryptographically secure temporary password
    const password = generateSecurePassword();
    const { full_name, email, phone, role } = registration;

    // Create the Supabase auth user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (createError) {
      console.error("Create user error:", createError);
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 }
      );
    }

    // Update profile with phone and forced password change
    if (newUser.user) {
      await supabase
        .from("profiles")
        .update({
          phone: phone || null,
          must_change_password: true,
        })
        .eq("id", newUser.user.id);
    }

    // For student role: create a students record and link it
    if (role === "student" && newUser.user) {
      const { data: studentRecord, error: studentError } = await supabase
        .from("students")
        .insert({
          admission_no: email.split("@")[0],
          full_name,
          email,
          phone: phone || null,
        })
        .select("id")
        .single();

      if (!studentError && studentRecord) {
        await supabase
          .from("profiles")
          .update({ student_id: studentRecord.id })
          .eq("id", newUser.user.id);
      } else {
        console.error("Failed to create student record:", studentError);
      }
    }

    // For parent role: create a parents record, link profile, and create student_parents junction
    if (role === "parent" && newUser.user) {
      const { data: parentRecord, error: parentError } = await supabase
        .from("parents")
        .insert({
          full_name,
          email,
          phone: phone || "",
          relationship: registration.relationship || "guardian",
        })
        .select("id")
        .single();

      if (!parentError && parentRecord) {
        await supabase
          .from("profiles")
          .update({ parent_id: parentRecord.id })
          .eq("id", newUser.user.id);

        // If student_admission_no was provided, look up the student and create the junction record
        if (registration.student_admission_no) {
          const { data: studentRecord } = await supabase
            .from("students")
            .select("id")
            .eq("admission_no", registration.student_admission_no)
            .single();

          if (studentRecord) {
            const { error: junctionError } = await supabase
              .from("student_parents")
              .insert({
                student_id: studentRecord.id,
                parent_id: parentRecord.id,
                relationship: registration.relationship || "guardian",
                is_primary_contact: true,
              });

            if (junctionError) {
              console.error("Failed to create student_parents link:", junctionError);
            }
          } else {
            console.error(
              "Student not found for admission_no:",
              registration.student_admission_no
            );
          }
        }
      } else {
        console.error("Failed to create parent record:", parentError);
      }
    }

    // Update registration request status
    await supabase
      .from("registration_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Send welcome email with credentials
    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.nkpublicschool.com"}/portal/login`;
      const html = buildWelcomeEmail({
        fullName: full_name,
        email,
        password,
        loginUrl,
        role,
      });
      await sendEmail(email, "Your NKPS Portal Account is Ready", html);
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
    }

    return NextResponse.json({
      success: true,
      user: newUser.user,
      generated_password: password,
    });
  } catch (err) {
    console.error("Approve registration error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
