import { NextResponse } from "next/server";
import { BUILD_ID } from "@nkps/shared/lib/build-id";

// GET /api/version — the build this deployment is running. Public and
// unauthenticated on purpose: it carries nothing but an opaque build token, and
// the page that polls it (PWARegister) may be sitting on the login screen.
// Never cached, or a CDN would answer for the previous deployment.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: BUILD_ID },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
