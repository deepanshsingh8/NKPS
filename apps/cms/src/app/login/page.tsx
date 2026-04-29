"use client";

import { LoginCard } from "@nkps/shared/components/auth/LoginCard";
import { getErpUrl } from "@nkps/shared/lib/cross-app";

export default function CmsLoginPage() {
  return (
    <LoginCard
      formTitle="Sign in to CMS"
      formSubtitle="Manage gallery, articles, transfer certificates, and site content"
      brandHeadline="NKPS Content"
      brandTagline="Welcome to the NKPS Content Management System. Sign in to update photos, articles, and public-facing content."
      roleBadges={[
        { label: "Administrators", color: "bg-gold-500" },
        { label: "Staff", color: "bg-blue-400" },
      ]}
      // Teachers with editor capability normally enter CMS via the
      // "Switch to admin tools" link in the teacher portal (cookie-shared
      // session). They aren't listed here so a direct CMS-login attempt
      // gets a clear "no access" message and is steered to the right portal.
      redirectByRole={{
        admin: "/",
        staff: "/",
      }}
      // CMS doesn't host its own forgot-password flow — point at the ERP
      // app, which owns /portal/forgot-password and the email/reset chain.
      forgotPasswordHref={getErpUrl("/portal/forgot-password")}
    />
  );
}
