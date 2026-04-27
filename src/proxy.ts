import { type NextRequest } from "next/server";
import { updateSession } from "@nkps/shared/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/cms/:path*",
    "/erp/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/portal/:path*",
    "/api/erp/:path*",
    "/api/cms/:path*",
    "/api/admin/:path*",
    "/api/portal/:path*",
    "/api/staff/:path*",
    "/api/transfer-certificates/:path*",
  ],
};
