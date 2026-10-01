import { NextResponse } from "next/server";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { rateLimit } from "@nkps/shared/lib/rate-limit";
import { MIN_PASSWORD_LENGTH } from "@nkps/shared/lib/password-policy";

// Sets the caller's own password and clears their `must_change_password` flag,
// in that order, using the service-role client.
//
// Why this route exists: migration 061 locked the `must_change_password`
// column (along with role/link columns) against writes from the browser
// (authenticated) client — only the service-role client or an admin may change
// it. The forced-password-change and reset-password flows used to clear the
// flag directly from the browser, which now fails silently, leaving the user
// stuck in a loop where every login bounces them back to /portal/change-password.
//
// Why it also OWNS the password write: this route used to take the flag clear
// on trust, on the strength of a valid access token alone, while the browser
// called supabase.auth.updateUser() separately just before. Nothing tied the
// two together. A user who logged in with the temporary password mailed to
// them (see create-portal-user.ts and registrations/approve) could POST here
// directly, clear the flag, and keep that emailed password indefinitely — with
// the whole dashboard open to them. (Account emails now carry a set-password
// link rather than a password, but an admin-issued temporary password is still
// handed over in person, and the flag exists to end exactly that state.)
//
// Doing the password write here makes the two inseparable: the flag can only
// drop after Supabase Auth has accepted a new password for this user.
//
// This route deliberately does NOT use the verifyAdmin* helpers: those fail
// closed when `must_change_password = true`, which is exactly the state every
// legitimate caller of this endpoint is in. We only need to prove the request
// carries a valid access token, and we act on that token's own user — a caller
// can never affect anyone else's row.

// The floor comes from lib/password-policy.ts, the same constant the
// change-password and reset-password forms check, so the server can never
// reject a password the form called acceptable. Keep Supabase Auth's own
// minimum (dashboard setting) at least this high.

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let newPassword: unknown;
  try {
    ({ newPassword } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof newPassword !== "string" ||
    newPassword.length < MIN_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Metered per user, not per IP: this is an authenticated service-role write,
  // and a legitimate caller uses it once. Generous enough to absorb retries
  // after a network failure.
  const limit = await rateLimit({
    name: "complete-password-change",
    key: user.id,
    max: 10,
    windowSeconds: 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.resetSeconds) } }
    );
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    user.id,
    { password: newPassword }
  );

  if (passwordError) {
    console.error("Failed to set new password:", passwordError);
    // Supabase Auth's weak/same-password messages are written for the person
    // choosing the password ("Password should contain at least one..."), so
    // those two pass through. Anything else is an internal failure.
    const userFacing =
      passwordError.code === "weak_password" || passwordError.code === "same_password";
    return NextResponse.json(
      {
        error: userFacing
          ? passwordError.message
          : "Could not set that password. Please try again.",
      },
      { status: 400 }
    );
  }

  // Only now — the password is genuinely changed, so the flag has been earned.
  const { error } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to clear must_change_password:", error);
    return NextResponse.json(
      { error: "Failed to finalize the password change." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
