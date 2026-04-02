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

    // Update the profile with phone if provided (trigger creates profile but may not include phone)
    if (phone && newUser.user) {
      await supabase
        .from("profiles")
        .update({ phone })
        .eq("id", newUser.user.id);
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
