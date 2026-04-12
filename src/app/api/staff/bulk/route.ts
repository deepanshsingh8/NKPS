import { NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";
import { staffBulkUploadSchema } from "@/lib/validations";
import { createPortalUser } from "@/lib/create-portal-user";

const VALID_CATEGORIES = [
  "management", "admin", "pgt", "tgt", "prt",
  "motherTeachers", "prePrimaryCoordinator", "primaryCoordinator",
  "middleCoordinator", "seniorCoordinator",
  "additionalStaff", "busDriver", "peon",
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

      const records = batch.map((s, idx) => {
        const dob = s.date_of_birth?.trim() || null;
        const validDob = dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null;
        return {
          name: s.name.trim(),
          subject: s.subject.trim(),
          category,
          email: s.email?.trim() || null,
          phone: s.phone?.trim() || null,
          date_of_birth: validDob,
          address: s.address?.trim() || null,
          qualifications: s.qualifications?.trim() || null,
          sort_order: sortOrder + i + idx,
        };
      });

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

    // Auto-create portal users for staff with emails (non-blocking)
    let usersCreated = 0;
    const staffWithEmails = staff.filter((s) => s.email?.trim());
    const failedNames = errors.map((e) => e.name);

    for (const s of staffWithEmails) {
      if (failedNames.includes(s.name.trim())) continue;
      const userResult = await createPortalUser({
        email: s.email!.trim(),
        fullName: s.name.trim(),
        role: "teacher",
        phone: s.phone || null,
      });
      if (userResult.success) usersCreated++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      usersCreated,
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
