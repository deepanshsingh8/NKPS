import { type NextRequest } from "next/server";
import { updateSession } from "@nkps/shared/lib/supabase/middleware";

// apps/erp serves admin (root /), /portal, /teacher, /student, /parent.
// Auth, role gating, and editor permission checks live in @nkps/shared
// updateSession.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths EXCEPT static assets + Next.js internals + auth callback.
    // updateSession will check auth and role gates on what it sees.
    "/((?!_next/static|_next/image|_next/dev|favicon.ico).*)",
  ],
};
