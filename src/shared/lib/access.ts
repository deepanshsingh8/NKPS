import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureKey } from "@/shared/lib/permissions";

// Cookie-auth gating helper. Most routes use createClient() (cookies) and
// only need to know whether the calling profile is an admin or an editor with
// a particular feature_key granted. verifyAdmin* in verify-admin.ts solves the
// same problem for Bearer-auth routes.
export async function callerHasAdminOrEditorPerm(
  supabase: SupabaseClient,
  userId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", userId)
    .single();
  if (!profile) return false;
  if (profile.must_change_password) return false;
  if (profile.role === "admin") return true;
  if (profile.role !== "editor") return false;
  const { data: perm } = await supabase
    .from("editor_permissions")
    .select("feature_key")
    .eq("editor_id", userId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  return !!perm;
}
