"use client";

import { LoginCard } from "@nkps/shared/components/auth/LoginCard";

export default function ErpLoginPage() {
  return (
    <LoginCard
      formTitle="Sign in to ERP"
      formSubtitle="Access your dashboard, records, results, fees and more"
      brandHeadline="NKPS ERP"
      brandTagline="Welcome to the NKPS school operations platform. Sign in to access your role-specific dashboard."
      roleBadges={[
        { label: "Administrators", color: "bg-gold-500" },
        { label: "Teachers", color: "bg-blue-400" },
        { label: "Students", color: "bg-emerald-400" },
        { label: "Parents", color: "bg-rose-400" },
      ]}
      redirectByRole={{
        admin: "/",
        editor: "/",
        teacher: "/teacher",
        student: "/student",
        parent: "/parent",
      }}
      registerHref="/portal/register"
    />
  );
}
