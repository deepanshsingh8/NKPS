import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. `server-only` turns any import of this
// file from a client component into a build error, so the key can never be
// bundled for the browser (it would be undefined there anyway, but the import
// chain is the mistake worth catching).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
