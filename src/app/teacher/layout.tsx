"use client";

import { TeacherSidebar } from "@/components/portal/TeacherSidebar";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <TeacherSidebar />
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
