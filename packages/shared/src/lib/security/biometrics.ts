"use client";

import { createClient } from "@nkps/shared/lib/supabase/client";

// Face ID / fingerprint, on Supabase's own WebAuthn MFA.
//
// ── Why not hand-rolled ─────────────────────────────────────────────────────
// The obvious shape for this feature is a webauthn_credentials table, a
// challenge store, and an assertion verifier written against WebCrypto —
// several hundred lines of security-critical parsing (COSE keys, ASN.1 DER
// signatures, rpIdHash and flag checks) that would ship into a school's ERP
// without ever having been exercised against a real authenticator.
//
// @supabase/auth-js ships all of that as a first-party MFA factor type. The
// browser ceremony, the challenge lifecycle and the signature verification are
// theirs; what is left here is naming things and handling the failure cases.
// The API is marked experimental upstream, which is why every call below is
// treated as "may not be available" rather than "will work".
//
// ── What a passkey here does and does not do ────────────────────────────────
// Registering one adds an MFA factor to the account. Authenticating with it
// asks the device for Face ID / fingerprint and, on success, returns a fresh
// session at AAL2. That is what unlocks the app.
//
// It is deliberately NOT a way to sign in from signed out: an MFA factor
// verifies against an existing session, and passwordless first-factor sign-in
// is a different feature with a different threat model.

export interface BiometricFactor {
  id: string;
  friendlyName: string;
  createdAt: string;
}

/**
 * Does this device have a built-in authenticator (Face ID, Touch ID, Windows
 * Hello, a fingerprint reader) that we can register?
 *
 * Checked before offering the button rather than after: a "Set up Face ID"
 * control that always throws is worse than no control.
 */
export async function isBiometricCapable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  if (!window.isSecureContext) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** A name the user will recognise in a device list, e.g. "iPhone · Safari". */
export function describeThisDevice(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const platform =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : "Device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  return `${platform} · ${browser}`;
}

export async function listBiometricFactors(): Promise<BiometricFactor[]> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  // listFactors buckets by type; webauthn may be absent on older servers.
  const all = (data.all ?? []).filter(
    (f) => f.factor_type === "webauthn" && f.status === "verified"
  );
  return all.map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name || "Registered device",
    createdAt: f.created_at,
  }));
}

export type BiometricResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unsupported" | "error"; message: string };

// The browser throws NotAllowedError both when the user dismisses the prompt
// and when it times out. Neither is worth an error toast — the user knows what
// they just did — so they are reported separately from real failures.
function classify(error: unknown): BiometricResult {
  const name = (error as { name?: string })?.name;
  const message =
    (error as { message?: string })?.message ?? "Could not complete the request";
  if (name === "NotAllowedError" || name === "AbortError") {
    return { ok: false, reason: "cancelled", message: "Cancelled" };
  }
  if (name === "NotSupportedError" || name === "SecurityError") {
    return { ok: false, reason: "unsupported", message };
  }
  return { ok: false, reason: "error", message };
}

/** Register this device. Prompts for Face ID / fingerprint immediately. */
export async function registerBiometric(
  friendlyName = describeThisDevice()
): Promise<BiometricResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.webauthn.register({
      friendlyName,
    });
    if (error) return classify(error);
    return { ok: true };
  } catch (error) {
    return classify(error);
  }
}

/** Prompt for Face ID / fingerprint against an already-registered factor. */
export async function authenticateBiometric(
  factorId: string
): Promise<BiometricResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.webauthn.authenticate({
      factorId,
    });
    if (error) return classify(error);
    return { ok: true };
  } catch (error) {
    return classify(error);
  }
}

export async function removeBiometric(factorId: string): Promise<BiometricResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return classify(error);
    return { ok: true };
  } catch (error) {
    return classify(error);
  }
}
