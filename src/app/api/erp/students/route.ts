import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { studentSchema } from "@/lib/validations";
import { createPortalUser } from "@/lib/create-portal-user";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const classId = request.nextUrl.searchParams.get("class_id");

    if (!classId) {
      // Fetch all students with their enrollment/class info
      const { data: allStudents, error } = await admin
        .from("students")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (error) {
        console.error("Fetch all students error:", error);
        return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
      }

      if (!allStudents || allStudents.length === 0) {
        return NextResponse.json({ data: [] });
      }

      // Fetch enrollments with class info for all students
      const { data: enrollments } = await admin
        .from("student_enrollments")
        .select("student_id, roll_number, id, class_id, stream_id, status, classes(name, section)")
        .in("student_id", allStudents.map((s) => s.id));

      const merged = allStudents.map((s) => {
        const enrollment = (enrollments ?? []).find((e) => e.student_id === s.id);
        const cls = enrollment?.classes as unknown as { name: string; section: string } | null;
        return {
          ...s,
          roll_number: enrollment?.roll_number ?? null,
          enrollment_id: enrollment?.id ?? null,
          class_id: enrollment?.class_id ?? null,
          stream_id: enrollment?.stream_id ?? null,
          enrollment_status: enrollment?.status ?? null,
          class_name: cls?.name ?? null,
          class_section: cls?.section ?? null,
        };
      });

      return NextResponse.json({ data: merged });
    }

    // Get enrollments for the class
    const { data: enrollments, error: enrollError } = await admin
      .from("student_enrollments")
      .select("id, student_id, roll_number, class_id, stream_id, status")
      .eq("class_id", classId);

    if (enrollError) {
      console.error("Fetch enrollments error:", enrollError);
      return NextResponse.json({ error: "Failed to fetch enrollments" }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const studentIds = enrollments.map((e) => e.student_id);

    const { data: students, error: studentError } = await admin
      .from("students")
      .select("*")
      .in("id", studentIds)
      .order("full_name", { ascending: true });

    if (studentError) {
      console.error("Fetch students by class error:", studentError);
      return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
    }

    const merged = (students ?? []).map((s) => {
      const enrollment = enrollments.find((e) => e.student_id === s.id);
      return {
        ...s,
        roll_number: enrollment?.roll_number ?? null,
        enrollment_id: enrollment?.id ?? null,
        class_id: enrollment?.class_id ?? null,
        stream_id: enrollment?.stream_id ?? null,
        enrollment_status: enrollment?.status ?? null,
      };
    });

    return NextResponse.json({ data: merged });
  } catch (err) {
    console.error("Fetch students error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { class_id, roll_number, stream_id, ...studentFields } = body;

    const result = studentSchema.safeParse(studentFields);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    // Insert student
    const { data: student, error: studentError } = await admin
      .from("students")
      .insert({
        admission_no: result.data.admission_no.trim(),
        full_name: result.data.full_name.trim(),
        father_name: result.data.father_name?.trim() || null,
        mother_name: result.data.mother_name?.trim() || null,
        date_of_birth: result.data.date_of_birth || null,
        gender: result.data.gender || null,
        address: result.data.address?.trim() || null,
        phone: result.data.phone?.trim() || null,
        email: result.data.email?.trim() || null,
        blood_group: result.data.blood_group || null,
        category: result.data.category?.trim() || null,
        aadhar_number: result.data.aadhar_number?.trim() || null,
        previous_school: result.data.previous_school?.trim() || null,
      })
      .select("id")
      .single();

    if (studentError) {
      console.error("Create student error:", studentError);
      return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
    }

    // Create enrollment if class_id provided
    if (class_id && student) {
      const { error: enrollError } = await admin
        .from("student_enrollments")
        .insert({
          student_id: student.id,
          class_id,
          roll_number: roll_number ? parseInt(roll_number, 10) : null,
          stream_id: stream_id || null,
        });

      if (enrollError) {
        console.error("Enrollment error:", enrollError);
        // Student was created but enrollment failed — still return success
        return NextResponse.json({
          success: true,
          data: student,
          warning: "Student created but enrollment failed",
        });
      }

    }

    let userCreated = false;
    const studentEmail = result.data.email?.trim();
    if (studentEmail && student) {
      const userResult = await createPortalUser({
        email: studentEmail,
        fullName: result.data.full_name.trim(),
        role: "student",
        phone: result.data.phone || null,
      });
      if (userResult.success && userResult.userId) {
        await admin
          .from("profiles")
          .update({ student_id: student.id })
          .eq("id", userResult.userId);
      }
      userCreated = userResult.success;
    }

    return NextResponse.json({ success: true, data: student, userCreated });
  } catch (err) {
    console.error("Create student error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, enrollment_id, roll_number, class_id, stream_id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "Student id required" }, { status: 400 });
    }

    const { error } = await admin
      .from("students")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Update student error:", error);
      return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
    }

    // Update enrollment fields (roll_number, class_id, stream_id)
    if (enrollment_id) {
      const enrollmentUpdate: Record<string, unknown> = {};
      if (roll_number !== undefined) {
        enrollmentUpdate.roll_number = roll_number ? parseInt(roll_number, 10) : null;
      }
      if (class_id) {
        enrollmentUpdate.class_id = class_id;
      }
      if (stream_id !== undefined) {
        enrollmentUpdate.stream_id = stream_id || null;
      }

      if (Object.keys(enrollmentUpdate).length > 0) {
        const { error: enrollErr } = await admin
          .from("student_enrollments")
          .update(enrollmentUpdate)
          .eq("id", enrollment_id);

        if (enrollErr) {
          console.error("Update enrollment error:", enrollErr);
          return NextResponse.json({ error: "Student updated but enrollment change failed" }, { status: 500 });
        }

        // Student subjects sync no longer needed (student_subjects table removed)
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update student error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Bulk delete: { ids: string[] }
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids: string[] = body.ids;

      // Delete enrollments first
      await admin.from("student_enrollments").delete().in("student_id", ids);

      // Delete linked profiles (auth users whose student_id matches)
      const { data: linkedProfiles } = await admin
        .from("profiles")
        .select("id")
        .in("student_id", ids);

      if (linkedProfiles && linkedProfiles.length > 0) {
        for (const p of linkedProfiles) {
          await admin.auth.admin.deleteUser(p.id);
        }
      }

      const { error } = await admin.from("students").delete().in("id", ids);

      if (error) {
        console.error("Bulk student delete error:", error);
        return NextResponse.json({ error: "Failed to delete students" }, { status: 500 });
      }

      return NextResponse.json({ success: true, deleted: ids.length });
    }

    // Single delete: { id }
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Student id required" }, { status: 400 });
    }

    // Delete enrollments first (in case cascade isn't set up)
    await admin.from("student_enrollments").delete().eq("student_id", id);

    const { error } = await admin.from("students").delete().eq("id", id);

    if (error) {
      console.error("Delete student error:", error);
      return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete student error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
