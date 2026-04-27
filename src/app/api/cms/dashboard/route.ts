import { NextResponse } from "next/server";
import { getCallerAccess } from "@nkps/shared/lib/verify-admin";
import type { FeatureKey } from "@nkps/shared/lib/permissions";

// CMS-side dashboard counts. Privileged stats never appear in the response
// for an editor who lacks the grant, so nothing leaks into the DOM.
export async function GET() {
  const access = await getCallerAccess();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { admin, isAdmin, permissions } = access;
  const can = (key: FeatureKey) => isAdmin || permissions.has(key);

  const [galleryRes, tcRes, unreadRes] = await Promise.all([
    can("gallery")
      ? admin.from("gallery_images").select("*", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    can("transfer_certificates")
      ? admin.from("transfer_certificates").select("*", { count: "exact", head: true })
      : Promise.resolve({ count: null }),
    can("contact")
      ? admin
          .from("contact_submissions")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false)
      : Promise.resolve({ count: null }),
  ]);

  const stats: Partial<
    Record<"galleryCount" | "tcCount" | "unreadCount", number>
  > = {};
  if (can("gallery")) stats.galleryCount = galleryRes.count ?? 0;
  if (can("transfer_certificates")) stats.tcCount = tcRes.count ?? 0;
  if (can("contact")) stats.unreadCount = unreadRes.count ?? 0;

  return NextResponse.json({ stats });
}
