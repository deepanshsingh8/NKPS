import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  featureKeyForPath,
  featureGroupForPath,
  isAdminOnlyPath,
} from "@nkps/shared/lib/permissions";

const LOGIN_PAGES = [
  "/portal/login",
  "/cms/login",
  "/erp/login",
];

const PROTECTED_PREFIXES = ["/cms", "/erp", "/teacher", "/student", "/parent"];

function getDashboardPath(role: string): string {
  switch (role) {
    case "admin":
    case "editor":
      return "/erp";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    case "parent":
      return "/parent";
    default:
      return "/portal/login";
  }
}

function loginPageForPath(pathname: string): string {
  if (pathname === "/cms" || pathname.startsWith("/cms/")) return "/cms/login";
  if (pathname === "/erp" || pathname.startsWith("/erp/")) return "/erp/login";
  return "/portal/login";
}

function isProtectedRoute(pathname: string): boolean {
  // /student-life is a public page, not a protected ERP route
  if (pathname.startsWith("/student-life")) return false;
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

  // Unauthenticated users accessing protected routes → redirect to the login
  // page for the module they're trying to enter (CMS or ERP).
  if (!user && isProtectedRoute(pathname) && !isLoginPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = loginPageForPath(pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Fetch role and password-change flag from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "student";
    const mustChangePassword = profile?.must_change_password ?? false;

    const dashboard = getDashboardPath(role);

    // Force password change — redirect everywhere except change-password, reset-password, and settings
    if (
      mustChangePassword &&
      pathname !== "/portal/change-password" &&
      pathname !== "/portal/reset-password" &&
      pathname !== "/portal/settings"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/change-password";
      return NextResponse.redirect(url);
    }

    // If password already changed, don't let them stay on the change-password page
    if (!mustChangePassword && pathname === "/portal/change-password") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Redirect logged-in users away from login pages to their dashboard
    if (isLoginPage(pathname)) {
      const url = request.nextUrl.clone();
      // CMS login lands admin/editor on /cms; everyone else on their role
      // dashboard. ERP login behaves the same as the generic dashboard map.
      if (pathname === "/cms/login" && (role === "admin" || role === "editor")) {
        url.pathname = "/cms";
      } else {
        url.pathname = dashboard;
      }
      return NextResponse.redirect(url);
    }

    // Module-level role gate. Only admin/editor may enter /cms or /erp admin
    // surfaces. Other roles get bounced to their own dashboard.
    const moduleGroup = featureGroupForPath(pathname);
    if (moduleGroup && role !== "admin" && role !== "editor") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Editor feature-level access control.
    // Admins skip this entirely. Editors are blocked from admin-only routes
    // and from features they have not been granted.
    if (moduleGroup && role === "editor") {
      if (isAdminOnlyPath(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = `/${moduleGroup}`;
        return NextResponse.redirect(url);
      }

      const featureKey = featureKeyForPath(pathname);
      if (featureKey) {
        const { data: perm } = await supabase
          .from("editor_permissions")
          .select("feature_key")
          .eq("editor_id", user.id)
          .eq("feature_key", featureKey)
          .maybeSingle();

        if (!perm) {
          const url = request.nextUrl.clone();
          url.pathname = `/${moduleGroup}`;
          return NextResponse.redirect(url);
        }
      }
    }

    if (pathname.startsWith("/teacher") && role !== "teacher") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/student") && !pathname.startsWith("/student-life") && role !== "student") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/parent") && role !== "parent") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
