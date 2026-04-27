import { type NextRequest } from "next/server";
import { updateSession } from "@nkps/shared/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Root project (transitional) only serves ERP/portal/teacher/student/parent
// after Phase 3.5b. CMS routes were extracted to apps/cms; the website was
// extracted to apps/website in 3.4b. CMS-related matchers removed below.
export const config = {
  matcher: [
    "/erp/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/portal/:path*",
    "/api/erp/:path*",
    "/api/admin/:path*",
    "/api/portal/:path*",
    "/api/staff/:path*",
  ],
};
