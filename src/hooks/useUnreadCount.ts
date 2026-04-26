"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchCounts = async () => {
      try {
        const [contactRes, regRes] = await Promise.all([
          adminFetch("/api/admin/contact/unread-count"),
          adminFetch("/api/erp/registrations/pending-count"),
        ]);

        if (mounted) {
          if (contactRes.ok) {
            const data = await contactRes.json();
            setUnreadCount(data.count ?? 0);
          }
          if (regRes.ok) {
            const data = await regRes.json();
            setPendingRegistrationCount(data.count ?? 0);
          }
        }
      } catch {
        // Silently fail — badges just won't show
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { unreadCount, pendingRegistrationCount };
}
