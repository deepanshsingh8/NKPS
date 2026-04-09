import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";

// Higher class names that require stream-based subject assignment
const HIGHER_CLASSES = ["XI", "XII"];

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { class_id, student_id } = await request.json();

    if (!class_id) {
      return NextResponse.json(
        { error: "class_id is required" },
        { status: 400 }
      );
    }

    // 1. Fetch class details to determine if it's a higher class
    const { data: classData, error: classError } = await admin
      .from("classes")
      .select("id, name, section")
      .eq("id", class_id)
      .single();

    if (classError || !classData) {
      return NextResponse.json(
        { error: "Class not found" },
        { status: 404 }
      );
    }

    const isHigherClass = HIGHER_CLASSES.includes(classData.name);

    // 2. Fetch all class_subjects for this class
    const { data: classSubjects, error: csError } = await admin
      .from("class_subjects")
      .select("id, subject_id")
      .eq("class_id", class_id);

    if (csError) {
      return NextResponse.json(
        { error: "Failed to fetch class subjects" },
        { status: 500 }
      );
    }

    if (!classSubjects || classSubjects.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: 0,
        message: "No subjects assigned to this class",
      });
    }

    // 3. Fetch student enrollments (optionally filtered to a single student)
    let enrollmentQuery = admin
      .from("student_enrollments")
      .select("id, student_id, stream_id")
      .eq("class_id", class_id);

    if (student_id) {
      enrollmentQuery = enrollmentQuery.eq("student_id", student_id);
    }

    const { data: enrollments, error: enrollError } = await enrollmentQuery;

    if (enrollError) {
      return NextResponse.json(
        { error: "Failed to fetch enrollments" },
        { status: 500 }
      );
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: 0,
        message: "No students enrolled in this class",
      });
    }

    // 4. For higher classes, fetch stream-subject mappings
    let streamSubjectMap: Record<string, Set<string>> = {};
    if (isHigherClass) {
      const streamIds = [
        ...new Set(
          enrollments
            .map((e) => e.stream_id)
            .filter((id): id is string => id !== null)
        ),
      ];

      if (streamIds.length > 0) {
        const { data: streamSubjects } = await admin
          .from("stream_subjects")
          .select("stream_id, subject_id")
          .in("stream_id", streamIds);

        if (streamSubjects) {
          for (const ss of streamSubjects) {
            if (!streamSubjectMap[ss.stream_id]) {
              streamSubjectMap[ss.stream_id] = new Set();
            }
            streamSubjectMap[ss.stream_id].add(ss.subject_id);
          }
        }
      }
    }

    // 5. Build the student_subjects rows to upsert
    const rowsToInsert: { student_id: string; class_subject_id: string }[] = [];
    const validPairs = new Set<string>(); // "studentId:classSubjectId"
    let skippedNoStream = 0;

    for (const enrollment of enrollments) {
      let applicableClassSubjects = classSubjects;

      if (isHigherClass) {
        if (!enrollment.stream_id) {
          skippedNoStream++;
          continue;
        }

        const streamSubjectIds = streamSubjectMap[enrollment.stream_id];
        if (!streamSubjectIds) {
          skippedNoStream++;
          continue;
        }

        // Filter class_subjects to only those whose subject is in the stream
        applicableClassSubjects = classSubjects.filter((cs) =>
          streamSubjectIds.has(cs.subject_id)
        );
      }

      for (const cs of applicableClassSubjects) {
        const key = `${enrollment.student_id}:${cs.id}`;
        validPairs.add(key);
        rowsToInsert.push({
          student_id: enrollment.student_id,
          class_subject_id: cs.id,
        });
      }
    }

    // 6. Upsert student_subjects (batch insert with ON CONFLICT DO NOTHING)
    let created = 0;
    if (rowsToInsert.length > 0) {
      // Process in batches of 500 to avoid payload limits
      const BATCH_SIZE = 500;
      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
        const { data: inserted, error: insertError } = await admin
          .from("student_subjects")
          .upsert(batch, { onConflict: "student_id,class_subject_id", ignoreDuplicates: true })
          .select("id");

        if (insertError) {
          console.error("Upsert student_subjects error:", insertError);
          return NextResponse.json(
            { error: "Failed to sync student subjects: " + insertError.message },
            { status: 500 }
          );
        }

        created += inserted?.length ?? 0;
      }
    }

    // 7. Clean up orphaned rows — remove student_subjects that no longer apply
    // Get all existing student_subjects for these students in this class
    const studentIds = enrollments.map((e) => e.student_id);
    const classSubjectIds = classSubjects.map((cs) => cs.id);

    const { data: existingRows } = await admin
      .from("student_subjects")
      .select("id, student_id, class_subject_id")
      .in("student_id", studentIds)
      .in("class_subject_id", classSubjectIds);

    if (existingRows) {
      const toDelete = existingRows.filter((row) => {
        const key = `${row.student_id}:${row.class_subject_id}`;
        return !validPairs.has(key);
      });

      if (toDelete.length > 0) {
        const deleteIds = toDelete.map((r) => r.id);
        await admin
          .from("student_subjects")
          .delete()
          .in("id", deleteIds);
      }
    }

    return NextResponse.json({
      success: true,
      created,
      total_links: rowsToInsert.length,
      skipped_no_stream: skippedNoStream,
      message: `Synced ${rowsToInsert.length} student-subject links${skippedNoStream > 0 ? ` (${skippedNoStream} students skipped - no stream assigned)` : ""}`,
    });
  } catch (error) {
    console.error("Sync student subjects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
