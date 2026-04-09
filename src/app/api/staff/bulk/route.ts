import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";
import { staffBulkUploadSchema } from "@/lib/validations";

const VALID_CATEGORIES = [
  "management", "admin", "pgt", "tgt", "prt",
  "motherTeachers", "additionalStaff", "busDriver", "peon",
];

export async function POST(request: Request) {
  const admin = await verifyAdminOrEditor();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = staffBulkUploadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { category, staff } = result.data;

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    let inserted = 0;
    const errors: { name: string; error: string }[] = [];

    // Get current max sort_order for this category
    const { data: maxRow } = await admin
      .from("staff_members")
      .select("sort_order")
      .eq("category", category)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    let sortOrder = (maxRow?.sort_order ?? -1) + 1;

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < staff.length; i += BATCH_SIZE) {
      const batch = staff.slice(i, i + BATCH_SIZE);

      const records = batch.map((s, idx) => ({
        name: s.name.trim(),
        subject: s.subject.trim(),
        category,
        email: s.email?.trim() || null,
        phone: s.phone?.trim() || null,
        date_of_birth: s.date_of_birth || null,
        address: s.address?.trim() || null,
        qualifications: s.qualifications?.trim() || null,
        sort_order: sortOrder + i + idx,
      }));

      const { error: insertError } = await admin
        .from("staff_members")
        .insert(records);

      if (insertError) {
        // If batch fails, try individually
        for (const record of records) {
          const { error: singleError } = await admin
            .from("staff_members")
            .insert(record);

          if (singleError) {
            errors.push({
              name: record.name,
              error: singleError.message,
            });
          } else {
            inserted++;
          }
        }
        continue;
      }

      inserted += batch.length;
    }

    sortOrder += staff.length;

    return NextResponse.json({
      success: true,
      inserted,
      errors,
      total: staff.length,
    });
  } catch (err) {
    console.error("Bulk staff upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
