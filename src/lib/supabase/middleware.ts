import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PAGES = ["/portal/login", "/admin/login"];

const PROTECTED_PREFIXES = ["/admin", "/teacher", "/student"];

function getDashboardPath(role: string): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    default:
      return "/portal/login";
  }
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isLoginPage(pathname: string): boolean {
  return LOGIN_PAGES.some((page) => pathname === page);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // API routes: only refresh session, don't redirect
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Unauthenticated users accessing protected routes → redirect to portal login
  if (!user && isProtectedRoute(pathname) && !isLoginPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    // Try to get cached role from cookie
    let role: string = request.cookies.get("x-user-role")?.value ?? "";

    // If no cached role, fetch from profiles table and set cookie
    if (!role) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      role = profile?.role ?? "student";

      // Cache the role in a cookie on the response
      supabaseResponse.cookies.set("x-user-role", role, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour
      });
    }

    const dashboard = getDashboardPath(role);

    // Redirect logged-in users away from login pages to their dashboard
    if (isLoginPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Role-based access control
    if (pathname.startsWith("/admin") && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/teacher") && role !== "teacher") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/student") && role !== "student") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
