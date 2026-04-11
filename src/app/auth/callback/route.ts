import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal/login";

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/login?error=missing_code`);
  }

  // Password recovery must be handled on the reset-password page itself,
  // not here — otherwise the recovery token becomes a silent magic login.
  if (next.startsWith("/portal/reset-password")) {
    return NextResponse.redirect(
      `${origin}/portal/reset-password?code=${encodeURIComponent(code)}`
    );
  }

  let response = NextResponse.redirect(`${origin}${next}`);

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
    return NextResponse.redirect(
      `${origin}/portal/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return response;
}
