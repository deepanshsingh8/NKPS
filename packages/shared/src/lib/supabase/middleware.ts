import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  FEATURE_CATALOG,
  featureKeyForPath,
  isAdminOnlyPath,
} from "@nkps/shared/lib/permissions";
import { getErpUrl } from "@nkps/shared/lib/cross-app";
import {
  buildCsp,
  createNonce,
  type CspSources,
} from "@nkps/shared/lib/security/csp";
import {
  isCsrfExempt,
  passesOriginCheck,
} from "@nkps/shared/lib/security/csrf";

// updateSession is the whole proxy for apps/erp and apps/cms. In order:
//   1. /api/*  — CSRF origin check on writes, then straight through. No CSP
//      (JSON isn't a document), no session, no DB call.
//   2. pages   — a fresh CSP nonce, then the app's auth + role gate.
// The app passes a ProxyPolicy naming which gate to run and its own CSP
// origins / webhook exemptions; the mechanism lives here so the two apps
// cannot drift apart.
//
// The ERP app serves:
//   /              admin dashboard
//   /login         admin login
//   /people, /exams, /fees, /timetable, /calendar, /attendance, /academics,
//     /registrations  — admin/staff sub-areas, plus teachers with the
//     matching editor_permissions feature_key.
//   /portal/*      portal login + password flows (any role)
//   /teacher/*     teacher dashboard (teacher role only)
//   /student/*     student dashboard (student role only)
//   /parent/*      parent dashboard (parent role only)
//   /auth/*        Supabase auth callbacks (no proxy needed)
//
// The CMS app serves /, /login, /offline and the six CMS feature pages
// (gallery, articles, site-media, disclosure, transfer-certificates, contact)
// to admins, staff and teachers holding a CMS grant — see cmsGate. Portal
// flows (change-password, settings) live on the ERP. Website has no proxy.

export interface ProxyPolicy {
  app: "erp" | "cms";
  /** Third-party origins this app's pages load from, beyond the baseline. */
  csp: CspSources;
  /** Exact /api paths called server-to-server (webhooks). They send no
   *  Origin / Sec-Fetch-Site and authenticate themselves in the route. */
  csrfExemptPaths?: readonly string[];
}

const CMS_FEATURE_KEYS = FEATURE_CATALOG.filter((f) => f.group === "cms").map(
  (f) => f.key
);

const LOGIN_PAGES = ["/login", "/portal/login"];

const PORTAL_PUBLIC_PAGES = [
  "/portal/login",
  "/portal/register",
  "/portal/forgot-password",
  "/portal/reset-password",
];

function getDashboardPath(role: string): string {
  switch (role) {
    case "admin":
    case "staff":
      return "/";
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

function isLoginPage(pathname: string): boolean {
  return LOGIN_PAGES.some((page) => pathname === page);
}

function isPortalPublic(pathname: string): boolean {
  return PORTAL_PUBLIC_PAGES.some((page) => pathname === page);
}

// Inside apps/erp, every page route is "protected" except the explicit
// login / portal-public / auth-callback paths.
function isProtectedRoute(pathname: string): boolean {
  if (isLoginPage(pathname)) return false;
  if (isPortalPublic(pathname)) return false;
  if (pathname.startsWith("/auth/")) return false;
  // The PWA offline fallback must be reachable with no session — the service
  // worker precaches it, and it renders no user data.
  if (pathname === "/offline") return false;
  return true;
}

// Admin-side pages are everything that isn't /portal, /teacher, /student,
// /parent, /auth, or /login. Used to decide editor permission gating.
function isAdminAreaPath(pathname: string): boolean {
  return (
    !pathname.startsWith("/portal") &&
    !pathname.startsWith("/teacher") &&
    !pathname.startsWith("/student") &&
    !pathname.startsWith("/parent") &&
    !pathname.startsWith("/auth") &&
    pathname !== "/login"
  );
}

export async function updateSession(
  request: NextRequest,
  policy: ProxyPolicy
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  // API routes bail out BEFORE getUser(). Nothing below runs for them — no
  // redirect, no role gate — so the GoTrue round trip getUser() makes would
  // be bought and thrown away on every single API call.
  //
  // The refreshed-cookie side effect it also carried is not load-bearing here:
  // Bearer-authed handlers (verify-admin / verify-portal) never read the
  // session cookie, and every cookie-authed handler builds its own server
  // client and calls getUser() itself — inside a route handler that write goes
  // through Next's cookie store and lands on the response the same way.
  //
  // What does run is the CSRF origin check (lib/security/csrf.ts): header
  // reads only, no DB.
  if (pathname.startsWith("/api/")) {
    if (
      !isCsrfExempt(request, policy.csrfExemptPaths ?? []) &&
      !passesOriginCheck(request)
    ) {
      return NextResponse.json(
        { error: "Cross-origin request blocked" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, policy.csp);

  // Every pass-through response forwards the nonce on the REQUEST: Next reads
  // the nonce out of the request's CSP header while rendering, and getNonce()
  // reads x-nonce. Built fresh each time because Supabase's setAll below
  // rewrites the request cookies and needs a new response to carry them.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };

  let supabaseResponse = forward();
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
          supabaseResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const gate = policy.app === "cms" ? cmsGate : erpGate;
  const response = (await gate(request, supabase)) ?? supabaseResponse;
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

type ProxySupabase = ReturnType<typeof createServerClient>;

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/** ERP auth + role gate. Returns a redirect, or null to let the request
 *  through. */
async function erpGate(
  request: NextRequest,
  supabase: ProxySupabase
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated → bounce to the right login page based on what they
  // were trying to reach.
  if (!user && isProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    // Admin-area paths → /login; portal/teacher/student/parent → /portal/login.
    url.pathname = isAdminAreaPath(pathname) ? "/login" : "/portal/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    // The profile lookup and the editor-permission lookup are independent, so
    // they are issued together: this runs on every page navigation, and back
    // to back they cost two serial round trips before any HTML is produced.
    // The permission row is only consulted further down (non-admins on
    // admin-area paths); fetching it up front costs a concurrent query, not
    // extra latency.
    const featureKeyForRequest = isAdminAreaPath(pathname)
      ? featureKeyForPath(pathname)
      : null;

    const [profileRes, permRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, must_change_password")
        .eq("id", user.id)
        .single(),
      featureKeyForRequest
        ? supabase
            .from("editor_permissions")
            .select("feature_key")
            .eq("editor_id", user.id)
            .eq("feature_key", featureKeyForRequest)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const profile = profileRes.data;
    const role = profile?.role ?? "student";
    const mustChangePassword = profile?.must_change_password ?? false;
    const dashboard = getDashboardPath(role);

    // Force password change — redirect everywhere except the change-password,
    // reset-password, and settings pages themselves.
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

    // If password already changed, don't let users sit on the change-password page.
    if (!mustChangePassword && pathname === "/portal/change-password") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Logged-in user on a login page → bounce to their dashboard.
    if (isLoginPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Admin-area role gate. Admin/staff may enter freely; teachers are allowed
    // in only if they hold at least one editor capability (per-feature gate
    // below filters them further). Students and parents are bounced.
    if (
      isAdminAreaPath(pathname) &&
      role !== "admin" &&
      role !== "staff" &&
      role !== "teacher"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }

    // Per-feature capability gate on the admin area. Admins bypass; everyone
    // else (staff and teachers) must hold the matching editor_permissions row.
    // Admin-only paths (e.g. /administration/users) reject all non-admins.
    if (isAdminAreaPath(pathname) && role !== "admin") {
      if (isAdminOnlyPath(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = role === "teacher" ? "/teacher" : "/";
        return NextResponse.redirect(url);
      }
      const featureKey = featureKeyForRequest;
      if (featureKey) {
        if (!permRes.data) {
          const url = request.nextUrl.clone();
          url.pathname = role === "teacher" ? "/teacher" : "/";
          return NextResponse.redirect(url);
        }
      } else if (pathname !== "/" && role === "teacher") {
        // Teacher hit an admin-area page that has no feature mapping (e.g. an
        // unmapped dashboard). Without a grant, they go back to /teacher.
        // Staff is allowed on the admin root and unmapped pages — their
        // sidebar will guide them to what they can actually use.
        const url = request.nextUrl.clone();
        url.pathname = "/teacher";
        return NextResponse.redirect(url);
      }
    }

    // Role-specific portal gates.
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
    if (pathname.startsWith("/parent") && role !== "parent") {
      const url = request.nextUrl.clone();
      url.pathname = dashboard;
      return NextResponse.redirect(url);
    }
  }

  return null;
}

/**
 * CMS auth + role gate — the same rules as the ERP admin area, applied to the
 * CMS's pages:
 *   - no session → /login (except /login and the /offline fallback);
 *   - must_change_password → the ERP's /portal/change-password, which is where
 *     that flow lives (the CMS has no /portal routes);
 *   - admin → everything; staff → the CMS root, plus each feature page they
 *     hold the grant for; teachers → the same, but only once they hold at
 *     least one CMS-group grant;
 *   - students, parents, and teachers with no CMS grant → their own ERP
 *     dashboard. Before this gate any signed-in account could load the CMS
 *     page shells; the API routes were already gated by verifyAdminOrEditor.
 * A signed-in account that cannot use the CMS is left on /login so it can sign
 * out and go to the right app.
 */
async function cmsGate(
  request: NextRequest,
  supabase: ProxySupabase
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  // The PWA offline fallback must be reachable with no session — the service
  // worker precaches it, and it renders no user data.
  if (pathname === "/offline") return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return isLogin ? null : redirectTo(request, "/login");

  // Issued together for the same reason as in erpGate: this runs on every
  // CMS navigation.
  const [profileRes, grantsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single(),
    supabase
      .from("editor_permissions")
      .select("feature_key")
      .eq("editor_id", user.id)
      .in("feature_key", CMS_FEATURE_KEYS),
  ]);

  const role: string = profileRes.data?.role ?? "student";
  if (profileRes.data?.must_change_password) {
    return NextResponse.redirect(getErpUrl("/portal/change-password"));
  }

  const grants = new Set<string>(
    (grantsRes.data ?? []).map((g: { feature_key: string }) => g.feature_key)
  );
  const canEnter =
    role === "admin" ||
    role === "staff" ||
    (role === "teacher" && grants.size > 0);

  if (isLogin) return canEnter ? redirectTo(request, "/") : null;
  if (!canEnter) {
    return NextResponse.redirect(getErpUrl(getDashboardPath(role)));
  }

  // Per-feature gate, as in the ERP admin area. The root is every editor's
  // landing page; a feature page needs its own grant; an unmapped page is
  // open to staff and closed to teachers (see permissions.ts).
  if (role !== "admin" && pathname !== "/") {
    const featureKey = featureKeyForPath(pathname);
    if (featureKey ? !grants.has(featureKey) : role === "teacher") {
      return redirectTo(request, "/");
    }
  }

  return null;
}
