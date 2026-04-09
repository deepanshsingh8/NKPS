import { z } from "zod";

export const contactFormSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  subject: z.string().min(1, "Please select a subject"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

export const galleryUploadSchema = z.object({
  alt: z.string().min(2, "Alt text is required"),
  category: z.enum([
    "academics",
    "sports",
    "cultural",
    "campus",
    "events",
  ]),
});

export type GalleryUploadData = z.infer<typeof galleryUploadSchema>;

export const tcUploadSchema = z.object({
  studentName: z.string().min(2, "Student name is required"),
  academicYear: z.string().min(4, "Academic year is required"),
});

export type TCUploadData = z.infer<typeof tcUploadSchema>;

// =============================================================
// ERP Validation Schemas
// =============================================================

export const createUserSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number").optional().or(z.literal("")),
  role: z.enum(["admin", "editor", "teacher", "student"], {
    message: "Please select a role",
  }),
});

export type CreateUserData = z.infer<typeof createUserSchema>;

export const attendanceBulkSchema = z.object({
  class_id: z.string().uuid("Invalid class"),
  date: z.string().min(1, "Date is required"),
  entries: z.array(
    z.object({
      student_id: z.string().uuid("Invalid student"),
      status: z.enum(["present", "absent", "late", "holiday"]),
    })
  ).min(1, "At least one attendance entry is required"),
});

export type AttendanceBulkData = z.infer<typeof attendanceBulkSchema>;

export const resultsBulkSchema = z.object({
  class_id: z.string().uuid("Invalid class"),
  subject_id: z.string().uuid("Invalid subject"),
  exam_type_id: z.string().uuid("Invalid exam type"),
  entries: z.array(
    z.object({
      student_id: z.string().uuid("Invalid student"),
      marks_obtained: z.number().min(0, "Marks cannot be negative"),
    })
  ).min(1, "At least one result entry is required"),
});

export type ResultsBulkData = z.infer<typeof resultsBulkSchema>;

export const feePaymentSchema = z.object({
  student_id: z.string().uuid("Invalid student"),
  fee_structure_id: z.string().uuid("Invalid fee structure"),
  amount_paid: z.number().positive("Amount must be positive"),
  payment_method: z.enum(["cash", "online", "cheque", "bank_transfer"], {
    message: "Please select a payment method",
  }),
  month: z.string().min(1, "Month is required").optional().or(z.literal("")),
});

export type FeePaymentData = z.infer<typeof feePaymentSchema>;

export const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  section: z.string().min(1, "Section is required"),
  academic_year_id: z.string().uuid("Invalid academic year"),
  class_teacher_id: z.string().uuid("Invalid teacher").optional().or(z.literal("")),
});

export type ClassData = z.infer<typeof classSchema>;

export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().optional().or(z.literal("")),
  is_elective: z.boolean().optional(),
});

export type SubjectData = z.infer<typeof subjectSchema>;

export const streamSchema = z.object({
  name: z.string().min(1, "Stream name is required"),
  code: z.string().optional().or(z.literal("")),
});

export type StreamData = z.infer<typeof streamSchema>;

export const classSubjectAssignSchema = z.object({
  class_id: z.string().uuid("Invalid class"),
  subject_id: z.string().uuid("Invalid subject"),
  teacher_id: z.string().uuid("Invalid teacher").optional().or(z.literal("")),
});

export type ClassSubjectAssignData = z.infer<typeof classSubjectAssignSchema>;

export const feeStructureSchema = z.object({
  academic_year_id: z.string().uuid("Invalid academic year"),
  class_name: z.string().min(1, "Class name is required"),
  fee_type: z.string().min(1, "Fee type is required"),
  amount: z.number().positive("Amount must be positive"),
  frequency: z.enum(["monthly", "quarterly", "annual", "one_time"], {
    message: "Please select a frequency",
  }),
});

export type FeeStructureData = z.infer<typeof feeStructureSchema>;

export const timetablePeriodSchema = z.object({
  class_id: z.string().uuid("Invalid class"),
  subject_id: z.string().uuid("Invalid subject"),
  teacher_id: z.string().uuid("Invalid teacher"),
  day_of_week: z.number().int().min(0).max(6, "Day must be between 0 (Sunday) and 6 (Saturday)"),
  period_number: z.number().int().positive("Period number must be positive"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
});

export type TimetablePeriodData = z.infer<typeof timetablePeriodSchema>;

export const calendarEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().or(z.literal("")),
  event_type: z.enum(["exam", "holiday", "event", "pta_meeting", "other"], {
    message: "Please select an event type",
  }),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional().or(z.literal("")),
  class_id: z.string().uuid("Invalid class").optional().or(z.literal("")),
});

export type CalendarEventData = z.infer<typeof calendarEventSchema>;

// =============================================================
// Registration Requests
// =============================================================

export const registrationRequestSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number").optional().or(z.literal("")),
  role: z.enum(["teacher", "student"], {
    message: "Please select a role",
  }),
});

export type RegistrationRequestData = z.infer<typeof registrationRequestSchema>;

// =============================================================
// Student Records
// =============================================================

export const studentSchema = z.object({
  admission_no: z.string().min(1, "Admission number is required"),
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  father_name: z.string().optional().or(z.literal("")),
  mother_name: z.string().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional(),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional(),
  category: z.string().optional().or(z.literal("")),
  aadhar_number: z.string().optional().or(z.literal("")),
  previous_school: z.string().optional().or(z.literal("")),
});

export type StudentData = z.infer<typeof studentSchema>;

export const enrollmentStatusSchema = z.enum(['active', 'passed', 'failed', 'terminated', 'exited']);

export const studentBulkUploadSchema = z.object({
  students: z.array(
    z.object({
      admission_no: z.string().min(1, "Admission number is required"),
      full_name: z.string().min(2, "Name is required"),
      class_name: z.string().min(1, "Class is required"),
      section: z.string().optional().or(z.literal("")),
      stream: z.string().optional().or(z.literal("")),
      father_name: z.string().optional().or(z.literal("")),
      mother_name: z.string().optional().or(z.literal("")),
      date_of_birth: z.string().optional().or(z.literal("")),
      gender: z.string().optional().or(z.literal("")),
      phone: z.string().optional().or(z.literal("")),
      address: z.string().optional().or(z.literal("")),
      roll_number: z.number().int().optional(),
      email: z.string().optional().or(z.literal("")),
      blood_group: z.string().optional().or(z.literal("")),
      category: z.string().optional().or(z.literal("")),
      aadhar_number: z.string().optional().or(z.literal("")),
      previous_school: z.string().optional().or(z.literal("")),
    })
  ).min(1, "At least one student is required"),
});

export type StudentBulkUploadData = z.infer<typeof studentBulkUploadSchema>;

// Staff bulk upload
export const staffBulkUploadSchema = z.object({
  category: z.string().min(1, "Category is required"),
  staff: z.array(
    z.object({
      name: z.string().min(2, "Name is required"),
      subject: z.string().min(1, "Subject/designation is required"),
      email: z.string().optional().or(z.literal("")),
      phone: z.string().optional().or(z.literal("")),
      date_of_birth: z.string().optional().or(z.literal("")),
      address: z.string().optional().or(z.literal("")),
      qualifications: z.string().optional().or(z.literal("")),
    })
  ).min(1, "At least one staff member is required"),
});

export type StaffBulkUploadData = z.infer<typeof staffBulkUploadSchema>;
