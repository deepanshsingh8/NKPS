"use client";

import { UpcomingEvents } from "@/components/shared/UpcomingEvents";

export default function ParentCalendarPage() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white mb-6">
        School Calendar
      </h1>
      <UpcomingEvents limit={20} />
    </div>
  );
}
