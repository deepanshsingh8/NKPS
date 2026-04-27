"use client";

import { LoginCard } from "@nkps/shared/components/auth/LoginCard";

export default function CmsLoginPage() {
  return (
    <LoginCard
      formTitle="Sign in to CMS"
      formSubtitle="Manage gallery, articles, transfer certificates, and site content"
      brandHeadline="NKPS Content"
      brandTagline="Welcome to the NKPS Content Management System. Sign in to update photos, articles, and public-facing content."
      roleBadges={[
        { label: "Administrators", color: "bg-gold-500" },
        { label: "Editors", color: "bg-blue-400" },
      ]}
      redirectByRole={{
        admin: "/cms",
        editor: "/cms",
      }}
    />
  );
}
