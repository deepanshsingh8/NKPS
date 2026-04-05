import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUserSchema } from "@/lib/validations";

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

    const body = await request.json();
    const result = createUserSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { full_name, email, phone, role } = result.data;

    // Generate a default password
    const password =
      body.password || `NKPS@${Math.random().toString(36).slice(-8)}`;

    const supabase = createAdminClient();

    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (error) {
      console.error("Create user error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create user" },
        { status: 500 }
      );
    }

    // Update the profile: set phone and flag for forced password change
    if (newUser.user) {
      await supabase
        .from("profiles")
        .update({
          phone: phone || null,
          must_change_password: true,
        })
        .eq("id", newUser.user.id);
    }

    // For student role: create a students record and link it to the profile
    if (role === "student" && newUser.user) {
      const { data: studentRecord, error: studentError } = await supabase
        .from("students")
        .insert({
          admission_no: email.split("@")[0], // default admission_no from email prefix
          full_name,
          email,
          phone: phone || null,
        })
        .select("id")
        .single();

      if (!studentError && studentRecord) {
        // Link the profile to the student record
        await supabase
          .from("profiles")
          .update({ student_id: studentRecord.id })
          .eq("id", newUser.user.id);
      } else {
        console.error("Failed to create student record:", studentError);
      }
    }

    return NextResponse.json({
      success: true,
      user: newUser.user,
      generated_password: password,
    });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
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
      return NextResponse.json({ error: "User id required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check if user is a student with a linked students record
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, student_id")
      .eq("id", id)
      .single();

    // Delete linked students record if exists
    if (profile?.student_id) {
      await supabase.from("students").delete().eq("id", profile.student_id);
    }

    // Delete the auth user (this cascades to profiles via Supabase's built-in trigger)
    const { error } = await supabase.auth.admin.deleteUser(id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
