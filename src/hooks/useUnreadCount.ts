"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchCount = async () => {
      try {
        const res = await adminFetch("/api/admin/contact/unread-count");
        if (res.ok) {
          const data = await res.json();
          if (mounted) setUnreadCount(data.count ?? 0);
        }
      } catch {
        // Silently fail — badge just won't show
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { unreadCount };
}
