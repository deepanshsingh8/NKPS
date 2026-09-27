import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous, cookie-free client for server components that render public
 * content.
 *
 * Two reasons not to reach for the others:
 *  - server.ts reads cookies(), and reading cookies opts the whole route out
 *    of static rendering — a page with `revalidate = 300` then runs a function
 *    and a query on every single visit.
 *  - admin.ts is the service role, which ignores RLS. A public page built on
 *    it is one forgotten `.eq("is_public", true)` away from publishing a row
 *    nobody meant to publish. This client is held to exactly what the anon
 *    policies allow a website visitor to see.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
