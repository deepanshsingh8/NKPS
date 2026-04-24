import { NextRequest, NextResponse } from "next/server";
import { verifyAdminOrEditor } from "@/lib/verify-admin";

const CLASS_ORDER = [
  "Nursery", "LKG", "UKG",
  "I", "II", "III", "IV", "V",
  "VI", "VII", "VIII", "IX", "X",
  "XI", "XII",
];

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdminOrEditor("students");
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { class_id, target_academic_year_id } = body;

    if (!class_id || !target_academic_year_id) {
      return NextResponse.json(
        { error: "class_id and target_academic_year_id are required" },
        { status: 400 }
      );
    }

    // 1. Fetch source class details
    const { data: sourceClass, error: classErr } = await admin
      .from("classes")
      .select("id, name, section, academic_year_id")
      .eq("id", class_id)
      .single();

    if (classErr || !sourceClass) {
      return NextResponse.json({ error: "Source class not found" }, { status: 404 });
    }

    // 2. Fetch the source academic year name (for alumni passing year)
    const { data: sourceYear } = await admin
      .from("academic_years")
      .select("id, name")
      .eq("id", sourceClass.academic_year_id)
      .single();

    // 3. Fetch all enrollments for this class
    const { data: enrollments, error: enrollErr } = await admin
      .from("student_enrollments")
      .select("id, student_id, stream_id, status")
      .eq("class_id", class_id);

    if (enrollErr) {
      return NextResponse.json({ error: "Failed to fetch enrollments" }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ error: "No students enrolled in this class" }, { status: 400 });
    }

    // 4. Check for active students — all must be marked before promotion
    const activeStudents = enrollments.filter((e) => e.status === "active");
    if (activeStudents.length > 0) {
      return NextResponse.json(
        {
          error: `${activeStudents.length} student(s) still have 'active' status. Please mark all student statuses (passed/failed/terminated/exited) before promoting.`,
        },
        { status: 400 }
      );
    }

    // 5. Group enrollments by status
    const passed = enrollments.filter((e) => e.status === "passed");
    const failed = enrollments.filter((e) => e.status === "failed");
    const terminated = enrollments.filter((e) => e.status === "terminated" || e.status === "exited");

    // 6. Determine next class name
    const currentIdx = CLASS_ORDER.indexOf(sourceClass.name);
    const isClassXII = sourceClass.name === "XII";
    const nextClassName = currentIdx >= 0 && currentIdx < CLASS_ORDER.length - 1
      ? CLASS_ORDER[currentIdx + 1]
      : null;

    // 7. Fetch all classes in the target academic year
    const { data: targetClasses } = await admin
      .from("classes")
      .select("id, name, section")
      .eq("academic_year_id", target_academic_year_id);

    if (!targetClasses || targetClasses.length === 0) {
      return NextResponse.json(
        { error: "No classes found for the target academic year. Please create classes first." },
        { status: 400 }
      );
    }

    const summary = {
      promoted: 0,
      retained: 0,
      graduated: 0,
      skipped: terminated.length,
      errors: [] as string[],
      warnings: [] as string[],
    };

    // Helper: find a target class by name and section, with fallback
    const findTargetClass = (name: string, preferredSection: string) => {
      // Try exact match first
      const exact = targetClasses.find(
        (c) => c.name === name && c.section === preferredSection
      );
      if (exact) return exact;

      // Fallback: any section of same class name
      const fallback = targetClasses.find((c) => c.name === name);
      if (fallback) {
        summary.warnings.push(
          `Section ${preferredSection} not found for ${name}, used ${fallback.section} instead`
        );
      }
      return fallback || null;
    };

    // 8. Process passed students
    if (isClassXII) {
      // XII passed → alumni
      for (const enrollment of passed) {
        const { error } = await admin
          .from("students")
          .update({
            is_active: false,
            is_alumni: true,
            alumni_passing_year: sourceYear?.name ?? null,
            alumni_academic_year_id: sourceClass.academic_year_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", enrollment.student_id);

        if (error) {
          summary.errors.push(`Failed to mark alumni: student ${enrollment.student_id}`);
        } else {
          summary.graduated++;
        }
      }
    } else if (nextClassName) {
      // Non-XII passed → promote to next class
      const targetClass = findTargetClass(nextClassName, sourceClass.section);
      if (!targetClass) {
        summary.errors.push(
          `Target class ${nextClassName} not found in the target academic year`
        );
      } else {
        const newEnrollments = passed.map((e) => ({
          student_id: e.student_id,
          class_id: targetClass.id,
          stream_id: e.stream_id,
          status: "active" as const,
        }));

        if (newEnrollments.length > 0) {
          const { error, count } = await admin
            .from("student_enrollments")
            .upsert(newEnrollments, {
              onConflict: "student_id,class_id",
              ignoreDuplicates: true,
            });

          if (error) {
            summary.errors.push(`Failed to create promotion enrollments: ${error.message}`);
          } else {
            summary.promoted = count ?? newEnrollments.length;
          }
        }

      }
    }

    // 9. Process failed students → re-enroll in same class name in target year
    if (failed.length > 0) {
      const retainClass = findTargetClass(sourceClass.name, sourceClass.section);
      if (!retainClass) {
        summary.errors.push(
          `Target class ${sourceClass.name}-${sourceClass.section} not found for retained students`
        );
      } else {
        const retainEnrollments = failed.map((e) => ({
          student_id: e.student_id,
          class_id: retainClass.id,
          stream_id: e.stream_id,
          status: "active" as const,
        }));

        const { error, count } = await admin
          .from("student_enrollments")
          .upsert(retainEnrollments, {
            onConflict: "student_id,class_id",
            ignoreDuplicates: true,
          });

        if (error) {
          summary.errors.push(`Failed to create retained enrollments: ${error.message}`);
        } else {
          summary.retained = count ?? retainEnrollments.length;
        }

      }
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err) {
    console.error("Promote students error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
