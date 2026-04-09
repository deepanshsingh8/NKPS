import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { studentBulkUploadSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    // Verify admin auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = studentBulkUploadSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { students } = result.data;
    const admin = createAdminClient();

    // Fetch current academic year
    const { data: currentYear } = await admin
      .from("academic_years")
      .select("id")
      .eq("is_current", true)
      .single();

    if (!currentYear) {
      return NextResponse.json(
        { error: "No current academic year is set. Please set one first." },
        { status: 400 }
      );
    }

    // Fetch all classes for the current academic year
    const { data: allClasses } = await admin
      .from("classes")
      .select("id, name, section")
      .eq("academic_year_id", currentYear.id);

    const classMap = new Map<string, string>();
    for (const c of allClasses || []) {
      // Key: "className|section" (case-insensitive)
      const key = `${c.name.trim().toLowerCase()}|${c.section.trim().toLowerCase()}`;
      classMap.set(key, c.id);
    }

    let inserted = 0;
    let updated = 0;
    const errors: { admission_no: string; error: string }[] = [];

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      for (const s of batch) {
        // Resolve class name: if stream is provided, combine with class (e.g., "XI" + "Science" → "XI Science")
        let resolvedClassName = s.class_name.trim();
        if (s.stream && s.stream.trim()) {
          resolvedClassName = `${resolvedClassName} ${s.stream.trim()}`;
        }

        const section = (s.section || "A").trim();
        const classKey = `${resolvedClassName.toLowerCase()}|${section.toLowerCase()}`;
        const classId = classMap.get(classKey);

        if (!classId) {
          errors.push({
            admission_no: s.admission_no,
            error: `Class "${resolvedClassName} - ${section}" not found. Create it first in Classes management.`,
          });
          continue;
        }

        // Upsert student
        const studentRecord = {
          admission_no: s.admission_no.trim(),
          full_name: s.full_name.trim(),
          father_name: s.father_name?.trim() || null,
          mother_name: s.mother_name?.trim() || null,
          date_of_birth: s.date_of_birth || null,
          gender: s.gender || null,
          phone: s.phone?.trim() || null,
          address: s.address?.trim() || null,
          email: s.email?.trim() || null,
          blood_group: s.blood_group?.trim() || null,
          category: s.category?.trim() || null,
          aadhar_number: s.aadhar_number?.trim() || null,
          previous_school: s.previous_school?.trim() || null,
        };

        const { data: upserted, error: upsertError } = await admin
          .from("students")
          .upsert(studentRecord, { onConflict: "admission_no" })
          .select("id, admission_no")
          .single();

        if (upsertError) {
          errors.push({
            admission_no: s.admission_no,
            error: upsertError.message,
          });
          continue;
        }

        if (upserted) {
          // Create/update enrollment
          await admin.from("student_enrollments").upsert(
            {
              student_id: upserted.id,
              class_id: classId,
              roll_number: s.roll_number || null,
            },
            { onConflict: "student_id,class_id" }
          );
          inserted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      errors,
      total: students.length,
    });
  } catch (err) {
    console.error("Bulk student upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
