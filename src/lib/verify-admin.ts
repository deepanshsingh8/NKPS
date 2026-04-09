import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * Use for routes editors should access (gallery, TCs, site-media, disclosure, staff, calendar).
 */
export async function verifyAdminOrEditor() {
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

  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) return null;
  return admin;
}

