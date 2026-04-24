import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeatureKey } from "@/lib/permissions";

/**
 * Verifies the current request is from an authenticated admin user.
 * Reads the access token from the Authorization header (sent by the browser client).
 * Returns the admin (service role) Supabase client if verified, null otherwise.
 */
export async function verifyAdmin() {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const accessToken = authHeader.slice(7);
  const admin = createAdminClient();

  // Validate the token and get the user
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) return null;

  // Verify user is an admin
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;
  return admin;
}

/**
 * Like verifyAdmin but also allows the "editor" role.
 * If a featureKey is provided, editors must have that feature granted in
 * editor_permissions; admins always pass.
 */
export async function verifyAdminOrEditor(featureKey?: FeatureKey) {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const accessToken = authHeader.slice(7);
  const admin = createAdminClient();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  if (profile.role === "admin") return admin;
  if (profile.role !== "editor") return null;

  // Editor — check feature permission if a key was supplied.
  if (featureKey) {
    const { data: perm } = await admin
      .from("editor_permissions")
      .select("feature_key")
      .eq("editor_id", user.id)
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (!perm) return null;
  }

  return admin;
}

/**
 * Same as verifyAdminOrEditor but also returns the authenticated user so the
 * caller can log actor_id / set created_by / etc. Returns null if
 * unauthorized.
 */
export async function verifyAdminOrEditorWithUser(featureKey?: FeatureKey) {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const accessToken = authHeader.slice(7);
  const admin = createAdminClient();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  if (profile.role === "admin") return { admin, user };
  if (profile.role !== "editor") return null;

  if (featureKey) {
    const { data: perm } = await admin
      .from("editor_permissions")
      .select("feature_key")
      .eq("editor_id", user.id)
      .eq("feature_key", featureKey)
      .maybeSingle();
    if (!perm) return null;
  }
  return { admin, user };
}
