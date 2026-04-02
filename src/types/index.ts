export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  category: "academics" | "sports" | "cultural" | "campus" | "events";
  sort_order: number;
  created_at: string;
}

export interface TransferCertificate {
  id: string;
  student_name: string;
  file_url: string;
  academic_year: string;
  upload_date: string;
  created_at: string;
}

export interface ContactSubmission {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// =============================================================
// ERP System Types
// =============================================================

export type UserRole = 'admin' | 'teacher' | 'student';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface Class {
  id: string;
  name: string;
  section: string;
  academic_year_id: string;
  class_teacher_id: string | null;
  sort_order: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
}

export interface StudentEnrollment {
  id: string;
  student_id: string;
  class_id: string;
  roll_number: number | null;
  enrollment_date: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'holiday';

export interface Attendance {
  id: string;
  student_id: string;
  class_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: string;
  remarks: string | null;
  created_at: string;
}

export interface ExamType {
  id: string;
  name: string;
  academic_year_id: string;
  max_marks: number;
  weightage: number | null;
  sort_order: number;
}

export interface Result {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  exam_type_id: string;
  marks_obtained: number;
  max_marks: number;
  grade: string | null;
  remarks: string | null;
  entered_by: string;
  created_at: string;
  updated_at: string;
}

export type FeeFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';

export interface FeeStructure {
  id: string;
  academic_year_id: string;
  class_name: string;
  fee_type: string;
  amount: number;
  due_date: string | null;
  frequency: FeeFrequency;
  created_at: string;
}

export type PaymentMethod = 'cash' | 'online' | 'cheque' | 'bank_transfer';
export type PaymentStatus = 'paid' | 'partial' | 'pending' | 'refunded';

export interface FeePayment {
  id: string;
  student_id: string;
  fee_structure_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: PaymentMethod | null;
  receipt_number: string | null;
  month: string | null;
  status: PaymentStatus;
  recorded_by: string;
  remarks: string | null;
  created_at: string;
}

export interface TimetablePeriod {
  id: string;
  class_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  room: string | null;
}

export type CalendarEventType = 'exam' | 'holiday' | 'event' | 'pta_meeting' | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  start_date: string;
  end_date: string | null;
  class_id: string | null;
  created_by: string;
  created_at: string;
}
