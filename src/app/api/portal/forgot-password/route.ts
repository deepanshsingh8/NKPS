import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildPasswordResetEmail } from "@/lib/email";
import { SCHOOL } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Derive the site origin from the request so the reset link always points
    // at the same host the user is currently on (production, Vercel preview,
    // localhost) — falling back to the configured site URL.
    const { SITE_URL } = await import("@/lib/seo");
    const origin = request.headers.get("origin") || SITE_URL;
    const redirectTo = `${origin}/auth/callback?next=/portal/reset-password`;

    const supabase = createAdminClient();

    // Ask Supabase to generate a one-time recovery link for this email.
    // If the email isn't registered, Supabase returns an error — we swallow
    // it and return success so the endpoint doesn't leak membership info.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      if (error) {
        console.error("generateLink error:", error.message);
      }
      return NextResponse.json({ success: true });
    }

    const resetLink = data.properties.action_link;

    // Best-effort: personalise the greeting using the user's profile name.
    let fullName: string | undefined;
    const userId = data.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.full_name) fullName = profile.full_name;
    }

    try {
      const html = buildPasswordResetEmail({
        fullName,
        email: normalizedEmail,
        resetLink,
        expiresInMinutes: 60,
      });
      await sendEmail(
        normalizedEmail,
        `Reset your ${SCHOOL.shortName} portal password`,
        html
      );
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      return NextResponse.json(
        { error: "We couldn't send the reset email. Please try again in a moment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
