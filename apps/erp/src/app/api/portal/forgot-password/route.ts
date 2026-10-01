import { NextResponse } from "next/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { sendEmail, buildPasswordResetEmail } from "@nkps/shared/lib/email";
import { SCHOOL } from "@nkps/shared/lib/constants";
import { rateLimit, clientIp } from "@nkps/shared/lib/rate-limit";
import {
  generateSetPasswordLink,
  RECOVERY_LINK_TTL_MINUTES,
  SET_PASSWORD_PATH,
} from "@nkps/shared/lib/auth-links";

// Always wait at least this long before responding so an attacker can't tell
// from latency whether the email was registered or not.
const MIN_RESPONSE_MS = 600;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const finalize = async <T>(payload: T, status = 200) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
    return NextResponse.json(payload as object, { status });
  };

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return finalize({ error: "Email is required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Two-tier rate limit: prevents both per-IP floods and per-target spamming.
    const ipLimit = rateLimit({
      name: "forgot-password:ip",
      key: clientIp(request),
      max: 10,
      windowSeconds: 15 * 60,
    });
    if (!ipLimit.ok) {
      return finalize(
        { error: "Too many requests. Try again later." },
        429
      );
    }
    const emailLimit = rateLimit({
      name: "forgot-password:email",
      key: normalizedEmail,
      max: 3,
      windowSeconds: 15 * 60,
    });
    if (!emailLimit.ok) {
      // Don't reveal that this specific email is throttled — return the
      // standard success shape so we don't leak which addresses are registered.
      return finalize({ success: true });
    }

    const supabase = createAdminClient();

    // Mint a one-time recovery token and wrap it in our own /auth/confirm
    // link, always on the configured ERP URL — never the request's Origin
    // (see lib/auth-links.ts for why). If the email isn't registered, Supabase
    // returns an error; we swallow it and return success so the endpoint
    // doesn't leak membership info.
    const link = await generateSetPasswordLink(
      supabase,
      normalizedEmail,
      SET_PASSWORD_PATH
    );

    if (!link.ok) {
      console.error("generateLink error:", link.error);
      return finalize({ success: true });
    }
    const resetLink = link.url;

    // Best-effort: personalise the greeting using the user's profile name.
    let fullName: string | undefined;
    const userId = link.userId;
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
        expiresInMinutes: RECOVERY_LINK_TTL_MINUTES,
      });
      await sendEmail(
        normalizedEmail,
        `Reset your ${SCHOOL.shortName} portal password`,
        html
      );
    } catch (emailError) {
      // Same response as an unknown address. Reporting the failure here would
      // tell a caller that this address IS registered (only registered
      // addresses reach the send), which is the enumeration the rest of this
      // route is built to prevent. The failure is logged for us instead.
      console.error("Failed to send password reset email:", emailError);
    }

    return finalize({ success: true });
  } catch (err) {
    console.error("Forgot password API error:", err);
    return finalize({ error: "Internal server error" }, 500);
  }
}
