"use client";

import { useSession } from "@nkps/shared/components/providers/SessionProvider";

/**
 * Client-side check for whether the signed-in user is an admin.
 *
 * Used to hide admin-only actions (buttons/dialogs) from editors on pages an
 * editor can otherwise reach via a granted feature. This is a UX guard only —
 * the underlying API routes still enforce admin-only access server-side, so a
 * missing button is defence-in-depth, not the security boundary.
 *
 * Returns `null` while the role is still loading so callers can render nothing
 * (rather than flashing an admin button to an editor before the role resolves).
 *
 * Reads the shell's shared session rather than resolving the role itself —
 * four of these mount per admin page and each used to cost its own
 * getUser() -> profiles pair.
 */
export function useIsAdmin(): boolean | null {
  const { loading, profile } = useSession();
  if (loading) return null;
  return profile?.role === "admin";
}

/**
 * Whether the signed-in user is a super admin (migration 135): an admin who
 * may refund fee payments directly and approve refund requests. Same UX-only
 * caveat as `useIsAdmin` — the refund and approve routes re-check server-side.
 *
 * Returns `null` while loading. False for every editor and for an admin who
 * has not been granted the flag.
 */
export function useIsSuperAdmin(): boolean | null {
  const { loading, profile } = useSession();
  if (loading) return null;
  return profile?.role === "admin" && profile.is_super_admin === true;
}
