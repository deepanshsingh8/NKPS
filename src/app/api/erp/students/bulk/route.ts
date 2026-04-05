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

    const { class_id, students } = result.data;
    const admin = createAdminClient();

    let inserted = 0;
    let updated = 0;
    const errors: { admission_no: string; error: string }[] = [];

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      // Upsert students (on conflict by admission_no)
      const studentRecords = batch.map((s) => ({
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
      }));

      const { data: upsertedStudents, error: upsertError } = await admin
        .from("students")
        .upsert(studentRecords, { onConflict: "admission_no" })
        .select("id, admission_no");

      if (upsertError) {
        // If batch fails, try individually
        for (const record of studentRecords) {
          const { data: single, error: singleError } = await admin
            .from("students")
            .upsert(record, { onConflict: "admission_no" })
            .select("id, admission_no")
            .single();

          if (singleError) {
            errors.push({
              admission_no: record.admission_no,
              error: singleError.message,
            });
          } else if (single) {
            // Create enrollment
            const studentRow = batch.find(
              (s) => s.admission_no.trim() === single.admission_no
            );
            await admin.from("student_enrollments").upsert(
              {
                student_id: single.id,
                class_id,
                roll_number: studentRow?.roll_number || null,
              },
              { onConflict: "student_id,class_id" }
            );
            inserted++;
          }
        }
        continue;
      }

      if (!upsertedStudents) continue;

      // Check which were inserts vs updates
      inserted += upsertedStudents.length;

      // Create enrollments for all upserted students
      const enrollmentRecords = upsertedStudents.map((s) => {
        const studentRow = batch.find(
          (b) => b.admission_no.trim() === s.admission_no
        );
        return {
          student_id: s.id,
          class_id,
          roll_number: studentRow?.roll_number || null,
        };
      });

      const { error: enrollError } = await admin
        .from("student_enrollments")
        .upsert(enrollmentRecords, { onConflict: "student_id,class_id" });

      if (enrollError) {
        console.error("Enrollment upsert error:", enrollError);
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
