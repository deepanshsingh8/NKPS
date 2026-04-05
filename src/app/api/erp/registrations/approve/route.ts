import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildWelcomeEmail } from "@/lib/email";

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

    // Generate a temporary password
    const password = `NKPS@${Math.random().toString(36).slice(-8)}`;
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
        { error: createError.message || "Failed to create user account" },
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
      const loginUrl = `${request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/login`;
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
