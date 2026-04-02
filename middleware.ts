import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/portal/:path*",
    "/api/admin/:path*",
    "/api/gallery/:path*",
    "/api/transfer-certificates/:path*",
    "/api/erp/:path*",
  ],
};
