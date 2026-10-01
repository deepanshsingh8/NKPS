import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { linkErrorPath, safeNext } from "@/lib/auth-confirm";

// PKCE code-exchange callback for Supabase-hosted auth flows.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/login?error=missing_code`);
  }

  const isPasswordReset = next.startsWith("/portal/reset-password");

  // Always exchange the code server-side. This avoids the PKCE "code verifier
  // not found" error that occurs when the reset link is opened in a different
  // browser/context (e.g. Gmail in-app browser on mobile).
  const response = NextResponse.redirect(
    `${origin}${isPasswordReset ? "/portal/reset-password" : next}`
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // The reason stays in the server log; the browser gets a fixed code.
    console.error("[auth/callback] exchangeCodeForSession failed:", error.code ?? error.message);
    return NextResponse.redirect(`${origin}${linkErrorPath(next)}`);
  }

  return response;
}
