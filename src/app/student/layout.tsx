"use client";

import { StudentSidebar } from "@/components/portal/StudentSidebar";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <StudentSidebar />
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
