import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

export async function GET() {
  const admin = await verifyAdminOrEditor();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error } = await admin
    .from("contact_submissions")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
