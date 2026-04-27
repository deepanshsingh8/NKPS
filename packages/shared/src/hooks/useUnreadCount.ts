"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@nkps/shared/lib/admin-api";

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchCounts = async () => {
      try {
        const [contactRes, regRes] = await Promise.all([
          // Each app exposes its own unread/pending endpoint at a stable URL.
          // - In apps/cms, /api/contact/unread-count returns CMS contact unread.
          // - In apps/erp (or root pre-3.5c), /api/erp/registrations/pending-count
          //   returns pending registration count.
          // Cross-app 404s fail silently (CmsSidebar doesn't use the
          // pendingRegistration value; ErpSidebar doesn't use unreadCount).
          adminFetch("/api/contact/unread-count"),
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
