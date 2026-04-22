export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  category: "academics" | "sports" | "cultural" | "campus" | "events";
  gallery_event_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface GalleryEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  academic_year: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TransferCertificate {
  id: string;
  student_name: string;
  admission_no: string | null;
  file_url: string;
  academic_year: string;
  upload_date: string;
  created_at: string;
}

export interface SiteMedia {
  id: string;
  slot: string;
  page: string;
  section: string;
  label: string;
  current_url: string;
  default_url: string;
  alt_text: string;
  sort_order: number;
  updated_at: string;
  created_at: string;
}

export type StaffCategory = 'management' | 'admin' | 'pgt' | 'tgt' | 'prt' | 'motherTeachers' | 'prePrimaryCoordinator' | 'primaryCoordinator' | 'middleCoordinator' | 'seniorCoordinator' | 'additionalStaff' | 'busDriver' | 'peon';

export interface StaffMember {
  id: string;
  name: string;
  subject: string;
  category: StaffCategory;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  qualifications: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SectionCardType = 'hero_slider' | 'testimonials' | 'latest_updates' | 'facilities_preview' | 'leadership' | 'legacy_timeline' | 'why_choose_us' | 'activities' | 'annual_events' | 'campus_facilities';

export interface SectionCard {
  id: string;
  section: SectionCardType;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  quote: string | null;
  name: string | null;
  role: string | null;
  initials: string | null;
  date: string | null;
  cta_text: string | null;
  cta_link: string | null;
  icon: string | null;
  link: string | null;
  image_url: string | null;
  designation: string | null;
  message: string | null;
  year: string | null;
  season: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  author_name: string | null;
  meta_description: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================
// ERP System Types
// =============================================================

export type UserRole = 'admin' | 'editor' | 'teacher' | 'student' | 'parent';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  teacher_id: string | null;
  student_id: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Teachers (dedicated entity table)
// =============================================================

export interface Teacher {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_joining: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  qualifications: string | null;
  specialization: string | null;
  address: string | null;
  aadhar_number: string | null;
  photo_url: string | null;
  is_active: boolean;
  staff_member_id: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Students (standalone entity, no auth required)
// =============================================================

export type Gender = 'male' | 'female' | 'other';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface Student {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  mother_name: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  blood_group: BloodGroup | null;
  category: string | null;
  aadhar_number: string | null;
  religion: string | null;
  nationality: string | null;
  photo_url: string | null;
  previous_school: string | null;
  admission_date: string;
  admission_class: string | null;
  is_active: boolean;
  is_alumni: boolean;
  alumni_passing_year: string | null;
  alumni_academic_year_id: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Parents (dedicated entity table)
// =============================================================

export type ParentRelationship = 'father' | 'mother' | 'guardian';

export interface Parent {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  alternate_phone: string | null;
  occupation: string | null;
  address: string | null;
  relationship: ParentRelationship;
  aadhar_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentParent {
  id: string;
  student_id: string;
  parent_id: string;
  relationship: ParentRelationship;
  is_primary_contact: boolean;
  created_at: string;
}

// =============================================================
// Academic Structure
// =============================================================

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
}

export interface Stream {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Class {
  id: string;
  name: string;
  section: string;
  academic_year_id: string;
  class_teacher_id: string | null;
  stream_id: string | null;
  sort_order: number;
  room: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  is_elective: boolean;
  created_at: string;
}

export interface StreamSubject {
  id: string;
  stream_id: string;
  subject_id: string;
  is_mandatory: boolean;
  sort_order: number;
}

export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
}

// =============================================================
// Enrollments
// =============================================================

export type EnrollmentStatus = 'active' | 'passed' | 'failed' | 'terminated' | 'exited';

export interface StudentEnrollment {
  id: string;
  student_id: string;
  class_id: string;
  academic_year_id: string;
  stream_id: string | null;
  roll_number: number | null;
  enrollment_date: string;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Attendance
// =============================================================

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day';

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

// =============================================================
// Exams & Results
// =============================================================

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
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Fees & Payments
// =============================================================

export type FeeFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';
export type FeeClassLevel = 'all' | 'nursery_ukg' | 'i_v' | 'vi_viii' | 'ix_x' | 'xi_xii';

export interface FeeStructure {
  id: string;
  academic_year_id: string;
  class_name: string;
  class_level: FeeClassLevel;
  fee_type: string;
  amount: number;
  due_date: string | null;
  frequency: FeeFrequency;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'cash' | 'online' | 'cheque' | 'bank_transfer' | 'upi' | 'gateway';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'partial' | 'failed' | 'refunded';

export interface FeePayment {
  id: string;
  student_id: string;
  fee_structure_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: PaymentMethod;
  receipt_number: string | null;
  month: string | null;
  academic_year_id: string | null;
  status: PaymentStatus;
  payment_order_id: string | null;
  gateway_payment_id: string | null;
  gateway_receipt: string | null;
  recorded_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentGateway = 'razorpay' | 'stripe' | 'manual';
export type PaymentOrderStatus = 'created' | 'attempted' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface PaymentOrder {
  id: string;
  student_id: string;
  parent_id: string | null;
  fee_structure_id: string;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  gateway_signature: string | null;
  status: PaymentOrderStatus;
  month: string | null;
  notes: Record<string, unknown>;
  callback_url: string | null;
  webhook_verified: boolean;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

// =============================================================
// Timetable
// =============================================================

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
  is_break: boolean;
}

// =============================================================
// Calendar
// =============================================================

export type CalendarEventType = 'exam' | 'holiday' | 'event' | 'pta_meeting' | 'sports' | 'cultural' | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  start_date: string;
  end_date: string | null;
  is_school_wide: boolean;
  class_id: string | null;
  academic_year_id: string | null;
  created_by: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================
// Registration Requests
// =============================================================

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'teacher' | 'student' | 'parent';
  student_admission_no: string | null;
  relationship: ParentRelationship | null;
  status: RegistrationStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// =============================================================
// Notifications
// =============================================================

export type NotificationType = 'info' | 'warning' | 'success' | 'fee_reminder' | 'result_published' | 'attendance_alert' | 'announcement';

export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  type: NotificationType;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// =============================================================
// Mandatory Public Disclosure
// =============================================================

export type DisclosureSection = 'general' | 'result_academics' | 'staff' | 'infrastructure';

export interface DisclosureItem {
  id: string;
  section: DisclosureSection;
  field_key: string;
  label: string;
  value: string;
  sort_order: number;
  updated_at: string;
}

export interface DisclosureDocument {
  id: string;
  doc_key: string;
  label: string;
  file_url: string | null;
  file_name: string | null;
  sort_order: number;
  updated_at: string;
}

export type ExamClass = 'X' | 'XII';

export interface DisclosureBoardResult {
  id: string;
  exam_class: ExamClass;
  academic_year: string;
  registered: number;
  passed: number;
  pass_percentage: number;
  remarks: string | null;
  sort_order: number;
  updated_at: string;
}

export interface StudentWithClass extends Student {
  class_name?: string;
  section?: string;
  roll_number?: number | null;
  enrollment_id?: string;
  class_id?: string;
}

export interface TeacherWithProfile extends Teacher {
  profile_id?: string;
  avatar_url?: string | null;
}

export interface ClassWithTeacher extends Class {
  class_teacher?: Teacher | null;
  student_count?: number;
}

export interface ClassSubjectWithDetails extends ClassSubject {
  subject?: Subject;
  teacher?: Teacher | null;
}
