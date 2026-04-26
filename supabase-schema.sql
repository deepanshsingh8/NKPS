-- =============================================================================
-- NK Public School — Complete Database Schema v2 (ERP + CMS)
-- Run this in the Supabase SQL Editor on a FRESH project to set up everything.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CMS Tables (copied verbatim from the legacy schema)
-- ─────────────────────────────────────────────────────────────────────────────

-- Gallery Images
CREATE TABLE IF NOT EXISTS gallery_images (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  src text NOT NULL,
  alt text NOT NULL,
  category text NOT NULL CHECK (category IN ('academics', 'sports', 'cultural', 'campus', 'events')),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Transfer Certificates
CREATE TABLE IF NOT EXISTS transfer_certificates (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_name text NOT NULL,
  admission_no text,
  file_url text NOT NULL,
  academic_year text NOT NULL,
  upload_date date DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  tc_number text,
  issue_date date,
  last_attended_date date,
  reason_for_leaving text,
  conduct text,
  class_last_attended text,
  remarks text,
  is_generated boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_tc_admission_no ON transfer_certificates(admission_no);
CREATE INDEX IF NOT EXISTS idx_tc_student_name ON transfer_certificates(student_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_tc_number ON transfer_certificates(tc_number) WHERE tc_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tc_student_id ON transfer_certificates(student_id);

-- Contact Submissions
CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Site Media
CREATE TABLE IF NOT EXISTS site_media (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  slot text NOT NULL UNIQUE,
  page text NOT NULL,
  section text NOT NULL,
  label text NOT NULL,
  current_url text NOT NULL,
  default_url text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Section Cards
CREATE TABLE IF NOT EXISTS section_cards (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  section text NOT NULL CHECK (section IN ('hero_slider', 'testimonials', 'latest_updates', 'facilities_preview', 'leadership', 'legacy_timeline', 'why_choose_us', 'activities', 'annual_events', 'campus_facilities')),
  title text,
  subtitle text,
  description text,
  quote text,
  name text,
  role text,
  initials text,
  date text,
  cta_text text,
  cta_link text,
  icon text,
  link text,
  image_url text,
  designation text,
  message text,
  year text,
  season text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Staff Members (website faculty + non-teaching staff)
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'management', 'admin', 'pgt', 'tgt', 'prt',
    'motherTeachers', 'prePrimaryCoordinator', 'primaryCoordinator',
    'middleCoordinator', 'seniorCoordinator',
    'additionalStaff', 'busDriver', 'peon'
  )),
  photo_url text,
  email text,
  phone text,
  date_of_birth date,
  address text,
  qualifications text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(name, category)
);

-- Disclosure Items (text key-value for sections A, C-text, D, E)
CREATE TABLE IF NOT EXISTS disclosure_items (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  section text NOT NULL CHECK (section IN ('general', 'result_academics', 'staff', 'infrastructure')),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Disclosure Documents (section B — uploadable PDFs)
CREATE TABLE IF NOT EXISTS disclosure_documents (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  doc_key text NOT NULL UNIQUE,
  label text NOT NULL,
  file_url text,
  file_name text,
  sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Disclosure Board Results (section C — structured board exam data)
CREATE TABLE IF NOT EXISTS disclosure_board_results (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  exam_class text NOT NULL CHECK (exam_class IN ('X', 'XII')),
  academic_year text NOT NULL,
  registered integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  pass_percentage numeric(5,2) NOT NULL DEFAULT 0,
  remarks text,
  sort_order integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(exam_class, academic_year)
);

-- Gallery Events (event-based photo categorization)
CREATE TABLE IF NOT EXISTS gallery_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  academic_year text,
  cover_image_url text,
  is_public boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add gallery_event_id FK on gallery_images (nullable; existing images won't be linked)
ALTER TABLE gallery_images
  ADD COLUMN IF NOT EXISTS gallery_event_id uuid REFERENCES gallery_events(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ERP Tables (in FK-dependency order)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Academic Years (referenced by many tables)
CREATE TABLE academic_years (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2b. Streams
CREATE TABLE streams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2c. Teachers (must exist before profiles and classes)
CREATE TABLE teachers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  phone text,
  date_of_joining date,
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  qualifications text,
  specialization text,
  address text,
  aadhar_number text,
  photo_url text,
  is_active boolean DEFAULT true,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2d. Students
CREATE TABLE students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admission_no text NOT NULL UNIQUE,
  full_name text NOT NULL,
  father_name text,
  mother_name text,
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  address text,
  phone text,
  email text,
  blood_group text CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  category text,
  aadhar_number text,
  religion text,
  nationality text DEFAULT 'Indian',
  photo_url text,
  previous_school text,
  admission_date date DEFAULT CURRENT_DATE,
  admission_class text,
  is_active boolean DEFAULT true,
  is_alumni boolean DEFAULT false,
  alumni_passing_year text,
  alumni_academic_year_id uuid REFERENCES academic_years(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2e. Parents
CREATE TABLE parents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text UNIQUE,
  phone text NOT NULL,
  alternate_phone text,
  occupation text,
  address text,
  relationship text NOT NULL DEFAULT 'father'
    CHECK (relationship IN ('father', 'mother', 'guardian')),
  aadhar_number text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2f. Profiles (auth-user linking — references teachers, students, parents)
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role text NOT NULL DEFAULT 'student'
    CHECK (role IN ('admin', 'editor', 'teacher', 'student', 'parent')),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  is_active boolean DEFAULT true,
  must_change_password boolean DEFAULT false,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES parents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2g. Subjects
CREATE TABLE subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  is_active boolean DEFAULT true,
  is_elective boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2h. Classes (references academic_years, teachers, streams)
CREATE TABLE classes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  section text NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id) NOT NULL,
  class_teacher_id uuid REFERENCES teachers(id),
  stream_id uuid REFERENCES streams(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0,
  room text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX classes_name_section_stream_year_unique
  ON classes (name, section, academic_year_id, COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'));

-- 2i. Stream Subjects
CREATE TABLE stream_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id uuid REFERENCES streams(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  is_mandatory boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  UNIQUE(stream_id, subject_id)
);

-- 2j. Class Subjects
CREATE TABLE class_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  teacher_id uuid REFERENCES teachers(id),
  UNIQUE(class_id, subject_id)
);

-- 2k. Student Subjects (resolved student ↔ class_subject link; references
-- class_subjects so teacher reassignments auto-propagate to students).
CREATE TABLE IF NOT EXISTS student_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  class_subject_id uuid REFERENCES class_subjects(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, class_subject_id)
);

CREATE INDEX IF NOT EXISTS idx_student_subjects_student ON student_subjects(student_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_class_subject ON student_subjects(class_subject_id);

ALTER TABLE student_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read student_subjects"
  ON student_subjects FOR SELECT USING (true);

CREATE POLICY "Admins can insert student_subjects"
  ON student_subjects FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update student_subjects"
  ON student_subjects FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete student_subjects"
  ON student_subjects FOR DELETE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can read student_subjects for their classes"
  ON student_subjects FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_subject_id IN (
      SELECT id FROM class_subjects WHERE teacher_id = auth.uid()
    )
  );

-- 2l. Student Parents (many-to-many)
CREATE TABLE student_parents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES parents(id) ON DELETE CASCADE NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('father', 'mother', 'guardian')),
  is_primary_contact boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, parent_id)
);

-- 2l. Student Enrollments
CREATE TABLE student_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id) NOT NULL,
  stream_id uuid REFERENCES streams(id) ON DELETE SET NULL,
  roll_number integer,
  enrollment_date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'passed', 'failed', 'terminated', 'exited')),
  has_transport boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, class_id)
);

-- 2m. Attendance
CREATE TABLE attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'half_day')),
  marked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  remarks text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, class_id, date)
);

-- 2n. Exam Types
CREATE TABLE exam_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id) NOT NULL,
  max_marks integer NOT NULL DEFAULT 100,
  weightage numeric(5,2),
  sort_order integer DEFAULT 0,
  kind text NOT NULL DEFAULT 'term_exam' CHECK (kind IN ('term_exam', 'class_test', 'practical')),
  upper_header text,
  class_level text NOT NULL DEFAULT 'all'
    CHECK (class_level IN ('all', 'nursery_ukg', 'i_v', 'vi_viii', 'ix_x', 'xi_xii')),
  UNIQUE(name, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_types_year_level
  ON exam_types(academic_year_id, class_level);

-- 2o. Results
CREATE TABLE results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  exam_type_id uuid REFERENCES exam_types(id) ON DELETE CASCADE NOT NULL,
  marks_obtained numeric(5,2) NOT NULL,
  max_marks numeric(5,2) NOT NULL DEFAULT 100,
  grade text,
  remarks text,
  entered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_id, exam_type_id),
  CONSTRAINT results_marks_in_range CHECK (marks_obtained >= 0 AND marks_obtained <= max_marks)
);

-- 2p. Fee Structures
CREATE TABLE fee_structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  academic_year_id uuid REFERENCES academic_years(id) NOT NULL,
  class_name text NOT NULL,
  class_level text NOT NULL DEFAULT 'all'
    CHECK (class_level IN ('all', 'nursery_ukg', 'i_v', 'vi_viii', 'ix_x', 'xi_xii')),
  stream_id uuid REFERENCES streams(id) ON DELETE SET NULL,
  fee_type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  due_date date,
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'annual', 'one_time')),
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2q. Payment Orders (must be before fee_payments)
CREATE TABLE payment_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES parents(id) ON DELETE SET NULL,
  fee_structure_id uuid REFERENCES fee_structures(id) NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  gateway text NOT NULL CHECK (gateway IN ('razorpay', 'stripe', 'manual')),
  gateway_order_id text UNIQUE,
  gateway_payment_id text,
  gateway_signature text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'attempted', 'paid', 'failed', 'refunded', 'expired')),
  month text,
  notes jsonb DEFAULT '{}',
  callback_url text,
  webhook_verified boolean DEFAULT false,
  ip_address inet,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- 2r. Fee Payments
CREATE TABLE fee_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  fee_structure_id uuid REFERENCES fee_structures(id) NOT NULL,
  amount_paid numeric(10,2) NOT NULL,
  payment_date date DEFAULT CURRENT_DATE,
  payment_method text NOT NULL
    CHECK (payment_method IN ('cash', 'online', 'cheque', 'bank_transfer', 'upi', 'gateway')),
  receipt_number text UNIQUE,
  month text,
  academic_year_id uuid REFERENCES academic_years(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'partial', 'failed', 'refunded')),
  payment_order_id uuid REFERENCES payment_orders(id) ON DELETE SET NULL,
  gateway_payment_id text,
  gateway_receipt text,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2s. Timetable Periods
CREATE TABLE timetable_periods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES subjects(id),
  teacher_id uuid REFERENCES teachers(id),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  period_number integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  is_break boolean DEFAULT false,
  UNIQUE(class_id, day_of_week, period_number)
);

-- 2t. Calendar Events
CREATE TABLE calendar_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  event_type text NOT NULL
    CHECK (event_type IN ('exam', 'holiday', 'event', 'pta_meeting', 'sports', 'cultural', 'other')),
  start_date date NOT NULL,
  end_date date,
  is_school_wide boolean DEFAULT true,
  class_id uuid REFERENCES classes(id),
  academic_year_id uuid REFERENCES academic_years(id),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2u. Registration Requests
CREATE TABLE registration_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL CHECK (role IN ('teacher', 'student', 'parent')),
  student_admission_no text,
  relationship text CHECK (relationship IN ('father', 'mother', 'guardian')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2v. Notifications
CREATE TABLE notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'warning', 'success', 'fee_reminder', 'result_published', 'attendance_alert', 'announcement')),
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- CMS indexes
CREATE INDEX IF NOT EXISTS idx_gallery_images_event ON gallery_images(gallery_event_id);
CREATE INDEX IF NOT EXISTS idx_gallery_events_date ON gallery_events(event_date DESC);

-- Students
CREATE INDEX idx_students_admission_no ON students(admission_no);
CREATE INDEX idx_students_is_active ON students(is_active);
CREATE INDEX idx_students_alumni ON students(is_alumni) WHERE is_alumni = true;

-- Teachers
CREATE INDEX idx_teachers_employee_id ON teachers(employee_id);
CREATE INDEX idx_teachers_is_active ON teachers(is_active);

-- Parents
CREATE INDEX idx_parents_email ON parents(email);
CREATE INDEX idx_parents_phone ON parents(phone);

-- Student Parents
CREATE INDEX idx_student_parents_student_id ON student_parents(student_id);
CREATE INDEX idx_student_parents_parent_id ON student_parents(parent_id);

-- Profiles
CREATE INDEX idx_profiles_teacher_id ON profiles(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX idx_profiles_student_id ON profiles(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX idx_profiles_parent_id ON profiles(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_profiles_role ON profiles(role);

-- Classes
CREATE INDEX idx_classes_academic_year_id ON classes(academic_year_id);
CREATE INDEX idx_classes_class_teacher_id ON classes(class_teacher_id);
CREATE INDEX idx_classes_stream_id ON classes(stream_id);

-- Class Subjects
CREATE INDEX idx_class_subjects_class_id ON class_subjects(class_id);
CREATE INDEX idx_class_subjects_teacher_id ON class_subjects(teacher_id);

-- Student Enrollments
CREATE INDEX idx_enrollments_student_id ON student_enrollments(student_id);
CREATE INDEX idx_enrollments_class_id ON student_enrollments(class_id);
CREATE INDEX idx_enrollments_academic_year_id ON student_enrollments(academic_year_id);
CREATE INDEX idx_enrollments_status ON student_enrollments(status);
CREATE INDEX idx_enrollments_active ON student_enrollments(student_id, class_id, academic_year_id) WHERE status = 'active';

-- Attendance
CREATE INDEX idx_attendance_student_date ON attendance(student_id, date);
CREATE INDEX idx_attendance_class_date ON attendance(class_id, date);

-- Results
CREATE INDEX idx_results_student_id ON results(student_id);
CREATE INDEX idx_results_class_subject ON results(class_id, subject_id);
CREATE INDEX idx_results_exam_type_id ON results(exam_type_id);

-- Fee Structures
CREATE INDEX idx_fee_structures_academic_year_id ON fee_structures(academic_year_id);
CREATE INDEX idx_fee_structures_class_name ON fee_structures(class_name);
CREATE INDEX idx_fee_structures_stream_id ON fee_structures(stream_id);

-- Fee Payments
CREATE INDEX idx_fee_payments_student_id ON fee_payments(student_id);
CREATE INDEX idx_fee_payments_status ON fee_payments(status);
CREATE INDEX idx_fee_payments_payment_order_id ON fee_payments(payment_order_id) WHERE payment_order_id IS NOT NULL;

-- Payment Orders
CREATE INDEX idx_payment_orders_student_id ON payment_orders(student_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_gateway_order_id ON payment_orders(gateway_order_id);

-- Notifications
CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, created_at DESC) WHERE is_read = false;

-- Stream Subjects
CREATE INDEX idx_stream_subjects_stream_id ON stream_subjects(stream_id);
CREATE INDEX idx_stream_subjects_subject_id ON stream_subjects(subject_id);

-- Timetable
CREATE INDEX idx_timetable_class_day ON timetable_periods(class_id, day_of_week);
CREATE INDEX idx_timetable_teacher_id ON timetable_periods(teacher_id);
-- A teacher cannot be in two places at the same slot. Partial because
-- teacher_id is nullable (e.g. break/free period rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_teacher_slot_unique
  ON timetable_periods (teacher_id, day_of_week, period_number)
  WHERE teacher_id IS NOT NULL;

-- Calendar Events
CREATE INDEX idx_calendar_events_dates ON calendar_events(start_date, end_date);
CREATE INDEX idx_calendar_events_academic_year ON calendar_events(academic_year_id);

-- Registration Requests
CREATE UNIQUE INDEX idx_registration_requests_pending_email
  ON registration_requests(email) WHERE status = 'pending';
CREATE INDEX idx_registration_requests_status
  ON registration_requests(status, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper Functions + Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get entity IDs for current user
CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS UUID AS $$
  SELECT student_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_teacher_id()
RETURNS UUID AS $$
  SELECT teacher_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_parent_id()
RETURNS UUID AS $$
  SELECT parent_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_children_ids()
RETURNS SETOF UUID AS $$
  SELECT sp.student_id FROM student_parents sp
  WHERE sp.parent_id = public.get_my_parent_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_class_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM classes WHERE class_teacher_id = public.get_my_teacher_id()
  UNION
  SELECT class_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id, new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atomic per-student finalize: unpublish any active prior + insert new
-- version in a single transaction. Used by /api/erp/results/finalize-marksheet.
-- See migration 032 for full context.
CREATE OR REPLACE FUNCTION public.finalize_marksheet_one(
  p_student_id uuid,
  p_class_id uuid,
  p_exam_type_id uuid,
  p_snapshot jsonb,
  p_schema_version text,
  p_published_by uuid,
  p_unpublish_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_id uuid;
  v_latest_version int;
  v_new_id uuid;
  v_new_version int;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_latest_version
  FROM marksheet_publications
  WHERE student_id = p_student_id AND exam_type_id = p_exam_type_id;
  v_new_version := v_latest_version + 1;

  SELECT id INTO v_active_id
  FROM marksheet_publications
  WHERE student_id = p_student_id
    AND exam_type_id = p_exam_type_id
    AND unpublished_at IS NULL
  LIMIT 1;

  IF v_active_id IS NOT NULL THEN
    UPDATE marksheet_publications
    SET unpublished_at = now(),
        unpublish_reason = p_unpublish_reason,
        unpublished_by = p_published_by
    WHERE id = v_active_id;
  END IF;

  INSERT INTO marksheet_publications (
    student_id, class_id, exam_type_id, version, snapshot, schema_version, published_by
  ) VALUES (
    p_student_id, p_class_id, p_exam_type_id, v_new_version,
    p_snapshot, p_schema_version, p_published_by
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'new_id', v_new_id,
    'version', v_new_version,
    'refinalized', v_active_id IS NOT NULL
  );
END;
$$;

-- Year-final variant of finalize_marksheet_one (migration 033). Same shape,
-- but keyed on academic_year_id and forces kind='year_final'.
CREATE OR REPLACE FUNCTION public.finalize_year_final_one(
  p_student_id uuid,
  p_class_id uuid,
  p_academic_year_id uuid,
  p_snapshot jsonb,
  p_schema_version text,
  p_published_by uuid,
  p_unpublish_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_id uuid;
  v_latest_version int;
  v_new_id uuid;
  v_new_version int;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_latest_version
  FROM marksheet_publications
  WHERE student_id = p_student_id
    AND academic_year_id = p_academic_year_id
    AND kind = 'year_final';
  v_new_version := v_latest_version + 1;

  SELECT id INTO v_active_id
  FROM marksheet_publications
  WHERE student_id = p_student_id
    AND academic_year_id = p_academic_year_id
    AND kind = 'year_final'
    AND unpublished_at IS NULL
  LIMIT 1;

  IF v_active_id IS NOT NULL THEN
    UPDATE marksheet_publications
    SET unpublished_at = now(),
        unpublish_reason = p_unpublish_reason,
        unpublished_by = p_published_by
    WHERE id = v_active_id;
  END IF;

  INSERT INTO marksheet_publications (
    student_id, class_id, exam_type_id, academic_year_id, kind,
    version, snapshot, schema_version, published_by
  ) VALUES (
    p_student_id, p_class_id, NULL, p_academic_year_id, 'year_final',
    v_new_version, p_snapshot, p_schema_version, p_published_by
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'new_id', v_new_id,
    'version', v_new_version,
    'refinalized', v_active_id IS NOT NULL
  );
END;
$$;

-- Apply set_updated_at trigger to all tables with updated_at
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_parents_updated_at
  BEFORE UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_student_enrollments_updated_at
  BEFORE UPDATE ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_results_updated_at
  BEFORE UPDATE ON results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fee_structures_updated_at
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fee_payments_updated_at
  BEFORE UPDATE ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Phase 4+ tables added via migration 031. Wrapped in DO so re-running is
-- idempotent: drop-if-exists, then recreate.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'gallery_events',
    'section_cards',
    'staff_members',
    'grade_scales',
    'class_exam_configs',
    'pdf_header_configs',
    'pdf_footer_configs',
    'non_scholastic_subjects',
    'non_scholastic_sub_subjects',
    'exam_schedules',
    'admit_card_templates',
    'result_masters',
    'class_tests',
    'student_remarks',
    'articles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'set_updated_at_' || t, t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        'set_updated_at_' || t,
        t
      );
    END IF;
  END LOOP;
END $$;

-- Money / max-marks CHECK constraints (migration 031). DROP IF EXISTS keeps
-- this idempotent across re-runs.
ALTER TABLE exam_types
  DROP CONSTRAINT IF EXISTS exam_types_max_marks_positive;
ALTER TABLE exam_types
  ADD CONSTRAINT exam_types_max_marks_positive CHECK (max_marks > 0);

ALTER TABLE fee_structures
  DROP CONSTRAINT IF EXISTS fee_structures_amount_positive;
ALTER TABLE fee_structures
  ADD CONSTRAINT fee_structures_amount_positive CHECK (amount > 0);

ALTER TABLE fee_payments
  DROP CONSTRAINT IF EXISTS fee_payments_amount_positive;
ALTER TABLE fee_payments
  ADD CONSTRAINT fee_payments_amount_positive CHECK (amount_paid > 0);

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_amount_positive;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_amount_positive CHECK (amount > 0);

-- Audit / filter indexes (migration 031).
CREATE INDEX IF NOT EXISTS idx_results_entered_by ON results(entered_by);
CREATE INDEX IF NOT EXISTS idx_class_test_results_entered_by ON class_test_results(entered_by);
CREATE INDEX IF NOT EXISTS idx_non_scholastic_assessments_entered_by ON non_scholastic_assessments(entered_by);
CREATE INDEX IF NOT EXISTS idx_student_remarks_author_id ON student_remarks(author_id);
CREATE INDEX IF NOT EXISTS idx_class_tests_created_by ON class_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_results_is_published ON results(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_class_tests_is_published ON class_tests(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_payment_orders_expires_at ON payment_orders(expires_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security — CMS Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Gallery Images: public read, authenticated write
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view gallery images"
  ON gallery_images FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert gallery images"
  ON gallery_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update gallery images"
  ON gallery_images FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete gallery images"
  ON gallery_images FOR DELETE
  USING (auth.role() = 'authenticated');

-- Transfer Certificates: public read, authenticated write
ALTER TABLE transfer_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view transfer certificates"
  ON transfer_certificates FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert transfer certificates"
  ON transfer_certificates FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete transfer certificates"
  ON transfer_certificates FOR DELETE
  USING (auth.role() = 'authenticated');

-- Contact Submissions: authenticated read/write (submitted via service role key)
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact submissions"
  ON contact_submissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update contact submissions"
  ON contact_submissions FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can insert contact submissions"
  ON contact_submissions FOR INSERT
  WITH CHECK (true);

-- Site Media
ALTER TABLE site_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site_media"
  ON site_media FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update site_media"
  ON site_media FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert site_media"
  ON site_media FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Section Cards
ALTER TABLE section_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read section_cards"
  ON section_cards FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert section_cards"
  ON section_cards FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update section_cards"
  ON section_cards FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete section_cards"
  ON section_cards FOR DELETE
  USING (auth.role() = 'authenticated');

-- Staff Members
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view staff members"
  ON staff_members FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert staff members"
  ON staff_members FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update staff members"
  ON staff_members FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete staff members"
  ON staff_members FOR DELETE
  USING (auth.role() = 'authenticated');

-- Disclosure Items
ALTER TABLE disclosure_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read disclosure_items"
  ON disclosure_items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update disclosure_items"
  ON disclosure_items FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert disclosure_items"
  ON disclosure_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete disclosure_items"
  ON disclosure_items FOR DELETE USING (auth.role() = 'authenticated');

-- Disclosure Documents
ALTER TABLE disclosure_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read disclosure_documents"
  ON disclosure_documents FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update disclosure_documents"
  ON disclosure_documents FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert disclosure_documents"
  ON disclosure_documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete disclosure_documents"
  ON disclosure_documents FOR DELETE USING (auth.role() = 'authenticated');

-- Disclosure Board Results
ALTER TABLE disclosure_board_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read disclosure_board_results"
  ON disclosure_board_results FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert disclosure_board_results"
  ON disclosure_board_results FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update disclosure_board_results"
  ON disclosure_board_results FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete disclosure_board_results"
  ON disclosure_board_results FOR DELETE USING (auth.role() = 'authenticated');

-- Gallery Events
ALTER TABLE gallery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view gallery events"
  ON gallery_events FOR SELECT
  USING (is_public = true);

CREATE POLICY "Admins full access to gallery events"
  ON gallery_events FOR ALL
  USING (public.get_user_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security — ERP Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles ────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (public.get_user_role() IN ('admin', 'editor'));

CREATE POLICY "Teachers can read student profiles in their classes"
  ON profiles FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND student_id IN (
      SELECT se.student_id FROM student_enrollments se
      WHERE se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Teachers ────────────────────────────────────────────────────────────────
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read teachers"
  ON teachers FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert teachers"
  ON teachers FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update teachers"
  ON teachers FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete teachers"
  ON teachers FOR DELETE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can update own record"
  ON teachers FOR UPDATE
  USING (id = public.get_my_teacher_id());

-- ── Students ────────────────────────────────────────────────────────────────
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all students"
  ON students FOR SELECT
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can read students in their classes"
  ON students FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND id IN (
      SELECT se.student_id FROM student_enrollments se
      WHERE se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

CREATE POLICY "Teachers can update students in their classes"
  ON students FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND id IN (
      SELECT se.student_id FROM student_enrollments se
      WHERE se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

CREATE POLICY "Students can read own record"
  ON students FOR SELECT
  USING (id = public.get_my_student_id());

CREATE POLICY "Parents can read children records"
  ON students FOR SELECT
  USING (id IN (SELECT public.get_my_children_ids()));

CREATE POLICY "Admins can insert students"
  ON students FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update students"
  ON students FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete students"
  ON students FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Parents ─────────────────────────────────────────────────────────────────
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all parents"
  ON parents FOR SELECT
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can insert parents"
  ON parents FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update parents"
  ON parents FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete parents"
  ON parents FOR DELETE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Parents can read own record"
  ON parents FOR SELECT
  USING (id = public.get_my_parent_id());

CREATE POLICY "Parents can update own record"
  ON parents FOR UPDATE
  USING (id = public.get_my_parent_id());

-- ── Student Parents ─────────────────────────────────────────────────────────
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to student_parents"
  ON student_parents FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Parents can read own links"
  ON student_parents FOR SELECT
  USING (parent_id = public.get_my_parent_id());

CREATE POLICY "Students can read own parent links"
  ON student_parents FOR SELECT
  USING (student_id = public.get_my_student_id());

-- ── Academic Years ──────────────────────────────────────────────────────────
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read academic years"
  ON academic_years FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert academic years"
  ON academic_years FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update academic years"
  ON academic_years FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete academic years"
  ON academic_years FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Subjects ────────────────────────────────────────────────────────────────
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read subjects"
  ON subjects FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert subjects"
  ON subjects FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update subjects"
  ON subjects FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete subjects"
  ON subjects FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Streams ─────────────────────────────────────────────────────────────────
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read streams"
  ON streams FOR SELECT USING (true);

CREATE POLICY "Admins can insert streams"
  ON streams FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update streams"
  ON streams FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete streams"
  ON streams FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Stream Subjects ─────────────────────────────────────────────────────────
ALTER TABLE stream_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read stream_subjects"
  ON stream_subjects FOR SELECT USING (true);

CREATE POLICY "Admins can insert stream_subjects"
  ON stream_subjects FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update stream_subjects"
  ON stream_subjects FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete stream_subjects"
  ON stream_subjects FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Classes ─────────────────────────────────────────────────────────────────
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read classes"
  ON classes FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert classes"
  ON classes FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update classes"
  ON classes FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete classes"
  ON classes FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Exam Types ──────────────────────────────────────────────────────────────
ALTER TABLE exam_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read exam types"
  ON exam_types FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert exam types"
  ON exam_types FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update exam types"
  ON exam_types FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete exam types"
  ON exam_types FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Class Subjects ──────────────────────────────────────────────────────────
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read class subjects"
  ON class_subjects FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert class subjects"
  ON class_subjects FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update class subjects"
  ON class_subjects FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete class subjects"
  ON class_subjects FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Student Enrollments ─────────────────────────────────────────────────────
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all enrollments"
  ON student_enrollments FOR SELECT
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can insert enrollments"
  ON student_enrollments FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update enrollments"
  ON student_enrollments FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete enrollments"
  ON student_enrollments FOR DELETE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can read enrollments for their classes"
  ON student_enrollments FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Teachers can insert enrollments for their classes"
  ON student_enrollments FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Teachers can update enrollments for their classes"
  ON student_enrollments FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Students can read own enrollment"
  ON student_enrollments FOR SELECT
  USING (student_id = public.get_my_student_id());

CREATE POLICY "Parents can read children enrollments"
  ON student_enrollments FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()));

-- ── Attendance ──────────────────────────────────────────────────────────────
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to attendance"
  ON attendance FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can read attendance for their classes"
  ON attendance FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Teachers can insert attendance for their classes"
  ON attendance FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Teachers can update attendance for their classes"
  ON attendance FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Students can read own attendance"
  ON attendance FOR SELECT
  USING (student_id = public.get_my_student_id());

CREATE POLICY "Parents can read children attendance"
  ON attendance FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()));

-- ── Results ─────────────────────────────────────────────────────────────────
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to results"
  ON results FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can read results for their classes"
  ON results FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

CREATE POLICY "Teachers can insert results for their class-subject combos"
  ON results FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
    AND subject_id IN (
      SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
    )
  );

CREATE POLICY "Teachers can update results for their class-subject combos"
  ON results FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
    AND subject_id IN (
      SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
    )
  );

CREATE POLICY "Students can read own published results"
  ON results FOR SELECT
  USING (student_id = public.get_my_student_id() AND is_published = true);

CREATE POLICY "Parents can read children published results"
  ON results FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()) AND is_published = true);

-- ── Fee Structures ──────────────────────────────────────────────────────────
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read fee structures"
  ON fee_structures FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fee structures"
  ON fee_structures FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update fee structures"
  ON fee_structures FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete fee structures"
  ON fee_structures FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Fee Payments ────────────────────────────────────────────────────────────
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to fee payments"
  ON fee_payments FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Students can read own fee payments"
  ON fee_payments FOR SELECT
  USING (student_id = public.get_my_student_id());

CREATE POLICY "Parents can read children fee payments"
  ON fee_payments FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()));

-- ── Payment Orders ──────────────────────────────────────────────────────────
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to payment orders"
  ON payment_orders FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Parents can read own payment orders"
  ON payment_orders FOR SELECT
  USING (parent_id = public.get_my_parent_id());

CREATE POLICY "Parents can create payment orders for children"
  ON payment_orders FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'parent'
    AND student_id IN (SELECT public.get_my_children_ids())
  );

CREATE POLICY "Students can read own payment orders"
  ON payment_orders FOR SELECT
  USING (student_id = public.get_my_student_id());

-- ── Timetable Periods ──────────────────────────────────────────────────────
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read timetable periods"
  ON timetable_periods FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert timetable periods"
  ON timetable_periods FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update timetable periods"
  ON timetable_periods FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete timetable periods"
  ON timetable_periods FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Calendar Events ─────────────────────────────────────────────────────────
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read calendar events"
  ON calendar_events FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update calendar events"
  ON calendar_events FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete calendar events"
  ON calendar_events FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Registration Requests ───────────────────────────────────────────────────
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit registration"
  ON registration_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read all registrations"
  ON registration_requests FOR SELECT
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can update registrations"
  ON registration_requests FOR UPDATE
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete registrations"
  ON registration_requests FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ── Notifications ───────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());

CREATE POLICY "Admins have full access to notifications"
  ON notifications FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Teachers can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (public.get_user_role() = 'teacher');


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Seed Data — Mandatory Public Disclosure
-- ─────────────────────────────────────────────────────────────────────────────

-- Section A — General Information
INSERT INTO disclosure_items (section, field_key, label, value, sort_order) VALUES
  ('general', 'school_name', 'Name of the School', 'NK Public School', 0),
  ('general', 'affiliation_no', 'Affiliation No.', '1730446', 1),
  ('general', 'school_code', 'School Code', '14399', 2),
  ('general', 'address', 'Complete Address with Pin Code', 'Grand Sikar Road, Rajawas, Jaipur, Rajasthan – 302013', 3),
  ('general', 'principal_name', 'Principal Name & Qualification', 'Mrs. Prema Kavia', 4),
  ('general', 'school_email', 'School Email ID', 'nkps.rajawas@gmail.com', 5),
  ('general', 'contact_details', 'Contact Details (Landline/Mobile)', '+91-9785500046, +91-9785500048', 6)
ON CONFLICT (field_key) DO NOTHING;

-- Section C — Result & Academics (text fields)
INSERT INTO disclosure_items (section, field_key, label, value, sort_order) VALUES
  ('result_academics', 'fee_structure', 'Fee Structure of the School', '', 0),
  ('result_academics', 'academic_calendar', 'Annual Academic Calendar', '', 1),
  ('result_academics', 'smc_list', 'List of School Management Committee (SMC)', '', 2),
  ('result_academics', 'pta_members', 'List of Parents Teachers Association (PTA) Members', '', 3)
ON CONFLICT (field_key) DO NOTHING;

-- Section D — Staff (Teaching)
INSERT INTO disclosure_items (section, field_key, label, value, sort_order) VALUES
  ('staff', 'principal', 'Principal', 'Mrs. Prema Kavia', 0),
  ('staff', 'total_teachers', 'Total No. of Teachers (PGT / TGT / PRT)', '100+ (PGT: 25+, TGT: 35+, PRT: 40+)', 1),
  ('staff', 'teacher_section_ratio', 'Teacher-Section Ratio', '1:1.5', 2),
  ('staff', 'special_educator', 'Details of Special Educator', '', 3),
  ('staff', 'counsellor', 'Details of Counsellor and Wellness Teacher', '', 4)
ON CONFLICT (field_key) DO NOTHING;

-- Section E — School Infrastructure
INSERT INTO disclosure_items (section, field_key, label, value, sort_order) VALUES
  ('infrastructure', 'campus_area', 'Total Campus Area (in sq. mtrs.)', '20,000 sq. mtrs.', 0),
  ('infrastructure', 'classrooms', 'Number and Size of Classrooms', '60+ Classrooms', 1),
  ('infrastructure', 'labs', 'Number and Size of Laboratories (incl. Computer Labs)', '5 Labs (Physics, Chemistry, Biology, Computer, Math)', 2),
  ('infrastructure', 'internet', 'Internet Facility', 'Yes', 3),
  ('infrastructure', 'girls_toilets', 'Number of Girls'' Toilets', '', 4),
  ('infrastructure', 'boys_toilets', 'Number of Boys'' Toilets', '', 5),
  ('infrastructure', 'youtube_link', 'Link of YouTube Video of School Inspection', '', 6)
ON CONFLICT (field_key) DO NOTHING;

-- Section B — Documents
INSERT INTO disclosure_documents (doc_key, label, sort_order) VALUES
  ('affiliation_letter', 'Copies of Affiliation/Upgradation Letter and Recent Extension of Affiliation', 0),
  ('society_registration', 'Copies of Societies/Trust/Company Registration/Renewal Certificate', 1),
  ('noc', 'Copy of No Objection Certificate (NOC) Issued by the State Govt/UT', 2),
  ('rte_recognition', 'Copy of Recognition Certificate under RTE Act, 2009, and Its Renewal', 3),
  ('building_safety', 'Copy of Valid Building Safety Certificate (as per National Building Code)', 4),
  ('fire_safety', 'Copy of Valid Fire Safety Certificate Issued by the Competent Authority', 5),
  ('deo_certificate', 'Copy of DEO Certificate Submitted for Affiliation/Self-Certification by School', 6),
  ('water_health_sanitation', 'Copy of Valid Water, Health and Sanitation Certificates', 7)
ON CONFLICT (doc_key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Storage Buckets (create manually in Supabase Dashboard > Storage)
-- ─────────────────────────────────────────────────────────────────────────────

-- Bucket: "gallery" (Public)
--   SELECT: Allow public access
--   INSERT: Allow authenticated users
--   DELETE: Allow authenticated users

-- Bucket: "transfer-certificates" (Public)
--   SELECT: Allow public access
--   INSERT: Allow authenticated users
--   DELETE: Allow authenticated users

-- Bucket: "avatars" (Public)
--   SELECT: Allow public access
--   INSERT/UPDATE/DELETE: Managed via service role (API route)

-- Bucket: "site-media" (Public)
--   SELECT: Allow public access
--   INSERT: Allow authenticated users
--   DELETE: Allow authenticated users

-- Bucket: "staff-photos" (Public)
--   SELECT: Allow public access
--   INSERT: Allow authenticated users
--   UPDATE: Allow authenticated users
--   DELETE: Allow authenticated users

-- Bucket: "disclosure-documents" (Public)
--   SELECT: Allow public access
--   INSERT: Allow authenticated users
--   DELETE: Allow authenticated users

-- ============================================
-- EDITOR PERMISSIONS (per-feature access for editor role)
-- ============================================

CREATE TABLE editor_permissions (
  editor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (editor_id, feature_key)
);

CREATE INDEX idx_editor_permissions_editor ON editor_permissions(editor_id);

ALTER TABLE editor_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read editor permissions"
  ON editor_permissions FOR SELECT
  USING (public.get_user_role() = 'admin');

CREATE POLICY "Editors can read their own permissions"
  ON editor_permissions FOR SELECT
  USING (editor_id = auth.uid());

CREATE POLICY "Admins can insert editor permissions"
  ON editor_permissions FOR INSERT
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete editor permissions"
  ON editor_permissions FOR DELETE
  USING (public.get_user_role() = 'admin');

-- ============================================
-- ARTIFACTS (long-form news/announcements; surfaced on Latest Updates + own pages)
-- ============================================

CREATE TABLE IF NOT EXISTS articles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL,
  cover_image_url text,
  author_name text,
  meta_description text,
  tags text[] DEFAULT '{}',
  is_published boolean DEFAULT false,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published articles"
  ON articles FOR SELECT
  USING (is_published = true);

CREATE POLICY "Authenticated can read all articles"
  ON articles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert articles"
  ON articles FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update articles"
  ON articles FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete articles"
  ON articles FOR DELETE TO authenticated
  USING (true);

-- ============================================
-- STUDENT REMARKS (class teacher's overall comment per student per exam,
-- shown at the bottom of the printed report card — distinct from the
-- per-subject results.remarks column)
-- ============================================

CREATE TABLE IF NOT EXISTS student_remarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_type_id uuid NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  remark text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, exam_type_id)
);

CREATE INDEX IF NOT EXISTS idx_student_remarks_student ON student_remarks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_remarks_exam ON student_remarks(exam_type_id);

ALTER TABLE student_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own remarks" ON student_remarks;
CREATE POLICY "Students read own remarks"
  ON student_remarks FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT student_id FROM profiles WHERE id = auth.uid() AND student_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Parents read linked children remarks" ON student_remarks;
CREATE POLICY "Parents read linked children remarks"
  ON student_remarks FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT sp.student_id
      FROM student_parents sp
      JOIN profiles p ON p.parent_id = sp.parent_id
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers read all remarks" ON student_remarks;
CREATE POLICY "Teachers read all remarks"
  ON student_remarks FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'editor'))
  );

DROP POLICY IF EXISTS "Teachers upsert remarks" ON student_remarks;
CREATE POLICY "Teachers upsert remarks"
  ON student_remarks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

DROP POLICY IF EXISTS "Teachers update remarks" ON student_remarks;
CREATE POLICY "Teachers update remarks"
  ON student_remarks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

DROP POLICY IF EXISTS "Admins delete remarks" ON student_remarks;
CREATE POLICY "Admins delete remarks"
  ON student_remarks FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- GRADE MASTER (admin-defined grade scales, globally or per-class)
-- ============================================

CREATE TABLE IF NOT EXISTS grade_scales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('scholastic', 'non_scholastic')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_scales_one_default_per_scope
  ON grade_scales(scope)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS grade_bands (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grade_scale_id uuid NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
  label text NOT NULL,
  min_pct numeric(5,2) NOT NULL CHECK (min_pct >= 0 AND min_pct <= 100),
  max_pct numeric(5,2) NOT NULL CHECK (max_pct >= 0 AND max_pct <= 100),
  remark text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT grade_bands_pct_range CHECK (min_pct <= max_pct)
);

CREATE INDEX IF NOT EXISTS idx_grade_bands_scale ON grade_bands(grade_scale_id);

CREATE TABLE IF NOT EXISTS class_grade_scales (
  class_id uuid PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  grade_scale_id uuid NOT NULL REFERENCES grade_scales(id) ON DELETE RESTRICT,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_grade_scales_scale ON class_grade_scales(grade_scale_id);

ALTER TABLE grade_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_grade_scales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read grade_scales" ON grade_scales;
CREATE POLICY "Authenticated can read grade_scales"
  ON grade_scales FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage grade_scales" ON grade_scales;
CREATE POLICY "Admins can manage grade_scales"
  ON grade_scales FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read grade_bands" ON grade_bands;
CREATE POLICY "Authenticated can read grade_bands"
  ON grade_bands FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage grade_bands" ON grade_bands;
CREATE POLICY "Admins can manage grade_bands"
  ON grade_bands FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read class_grade_scales" ON class_grade_scales;
CREATE POLICY "Authenticated can read class_grade_scales"
  ON class_grade_scales FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage class_grade_scales" ON class_grade_scales;
CREATE POLICY "Admins can manage class_grade_scales"
  ON class_grade_scales FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- CLASS EXAM CONFIGS (per-class weightage / applicability / max-marks override)
-- Final result composition reads from here; absence of a row = exam applies
-- to the class with the defaults defined on exam_types.
-- ============================================

CREATE TABLE IF NOT EXISTS class_exam_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exam_type_id uuid NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  is_applicable boolean NOT NULL DEFAULT true,
  weightage numeric(5,2),
  max_marks_override numeric(5,2),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT class_exam_configs_unique UNIQUE (class_id, exam_type_id),
  CONSTRAINT class_exam_configs_weightage_range
    CHECK (weightage IS NULL OR (weightage >= 0 AND weightage <= 100)),
  CONSTRAINT class_exam_configs_max_marks_positive
    CHECK (max_marks_override IS NULL OR max_marks_override > 0)
);

CREATE INDEX IF NOT EXISTS idx_class_exam_configs_class ON class_exam_configs(class_id);
CREATE INDEX IF NOT EXISTS idx_class_exam_configs_exam ON class_exam_configs(exam_type_id);

ALTER TABLE class_exam_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read class_exam_configs" ON class_exam_configs;
CREATE POLICY "Authenticated can read class_exam_configs"
  ON class_exam_configs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage class_exam_configs" ON class_exam_configs;
CREATE POLICY "Admins can manage class_exam_configs"
  ON class_exam_configs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- PDF TEMPLATE CONFIGS (per-template header/footer content for report cards,
-- admit cards, etc. — admin-editable; fallback to SCHOOL constants if a row
-- for the requested template_key is missing)
-- ============================================

CREATE TABLE IF NOT EXISTS pdf_header_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  school_name text NOT NULL,
  address_line text NOT NULL,
  affiliation text,
  affiliation_number text,
  logo_url text,
  motto text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdf_footer_configs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  disclaimer_text text,
  show_signatures boolean NOT NULL DEFAULT true,
  signature_labels jsonb NOT NULL DEFAULT '["Class Teacher","Principal"]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pdf_header_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_footer_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read pdf_header_configs" ON pdf_header_configs;
CREATE POLICY "Authenticated can read pdf_header_configs"
  ON pdf_header_configs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage pdf_header_configs" ON pdf_header_configs;
CREATE POLICY "Admins can manage pdf_header_configs"
  ON pdf_header_configs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read pdf_footer_configs" ON pdf_footer_configs;
CREATE POLICY "Authenticated can read pdf_footer_configs"
  ON pdf_footer_configs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage pdf_footer_configs" ON pdf_footer_configs;
CREATE POLICY "Admins can manage pdf_footer_configs"
  ON pdf_footer_configs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- NON-SCHOLASTIC MASTERS (co-scholastic subject + sub-subject taxonomy)
-- Teachers grade students on these alongside academic subjects; entry grid
-- is built in Phase 2.
-- ============================================

CREATE TABLE IF NOT EXISTS non_scholastic_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS non_scholastic_sub_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_subject_id uuid NOT NULL REFERENCES non_scholastic_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade_scale_id uuid REFERENCES grade_scales(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT non_scholastic_sub_subjects_parent_name_unique UNIQUE (parent_subject_id, name)
);

CREATE INDEX IF NOT EXISTS idx_non_scholastic_sub_subjects_parent
  ON non_scholastic_sub_subjects(parent_subject_id);
CREATE INDEX IF NOT EXISTS idx_non_scholastic_sub_subjects_scale
  ON non_scholastic_sub_subjects(grade_scale_id);

ALTER TABLE non_scholastic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_scholastic_sub_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read non_scholastic_subjects" ON non_scholastic_subjects;
CREATE POLICY "Authenticated can read non_scholastic_subjects"
  ON non_scholastic_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage non_scholastic_subjects" ON non_scholastic_subjects;
CREATE POLICY "Admins can manage non_scholastic_subjects"
  ON non_scholastic_subjects FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read non_scholastic_sub_subjects" ON non_scholastic_sub_subjects;
CREATE POLICY "Authenticated can read non_scholastic_sub_subjects"
  ON non_scholastic_sub_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage non_scholastic_sub_subjects" ON non_scholastic_sub_subjects;
CREATE POLICY "Admins can manage non_scholastic_sub_subjects"
  ON non_scholastic_sub_subjects FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- EXAM SCHEDULES (subject × class × date × time × room per exam type)
-- Distinct from timetable_periods which models regular daily class periods.
-- ============================================

CREATE TABLE IF NOT EXISTS exam_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_type_id uuid NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  start_time time,
  end_time time,
  room text,
  invigilator_teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT exam_schedules_unique UNIQUE (exam_type_id, class_id, subject_id),
  CONSTRAINT exam_schedules_time_order CHECK (
    start_time IS NULL OR end_time IS NULL OR start_time < end_time
  )
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_exam_class ON exam_schedules(exam_type_id, class_id);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_date ON exam_schedules(exam_date);

-- Migration 034: lock down the IST assumption on the time columns.
COMMENT ON COLUMN exam_schedules.start_time IS
  'Local clock time in Asia/Kolkata (IST, UTC+05:30). No timezone applied at read time — all consumers assume IST.';
COMMENT ON COLUMN exam_schedules.end_time IS
  'Local clock time in Asia/Kolkata (IST, UTC+05:30). See start_time.';
COMMENT ON COLUMN exam_schedules.exam_date IS
  'Calendar date in Asia/Kolkata. Stored as `date`, no timezone applied.';

ALTER TABLE exam_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read exam_schedules" ON exam_schedules;
CREATE POLICY "Authenticated can read exam_schedules"
  ON exam_schedules FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage exam_schedules" ON exam_schedules;
CREATE POLICY "Admins can manage exam_schedules"
  ON exam_schedules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- ADMIT CARD TEMPLATES (reusable PDF layouts for admit card generation)
-- ============================================

CREATE TABLE IF NOT EXISTS admit_card_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  orientation text NOT NULL DEFAULT 'portrait'
    CHECK (orientation IN ('portrait', 'landscape')),
  background_image_url text,
  show_photo boolean NOT NULL DEFAULT true,
  show_admission_no boolean NOT NULL DEFAULT true,
  show_roll_no boolean NOT NULL DEFAULT true,
  show_class_section boolean NOT NULL DEFAULT true,
  show_father_name boolean NOT NULL DEFAULT true,
  show_mother_name boolean NOT NULL DEFAULT false,
  show_dob boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT false,
  show_address boolean NOT NULL DEFAULT false,
  show_schedule boolean NOT NULL DEFAULT true,
  show_instructions boolean NOT NULL DEFAULT true,
  instructions_text text,
  signature_labels jsonb NOT NULL DEFAULT '["Principal","Exam Controller"]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admit_card_templates_one_default
  ON admit_card_templates(is_default)
  WHERE is_default = true;

ALTER TABLE admit_card_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read admit_card_templates" ON admit_card_templates;
CREATE POLICY "Authenticated can read admit_card_templates"
  ON admit_card_templates FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage admit_card_templates" ON admit_card_templates;
CREATE POLICY "Admins can manage admit_card_templates"
  ON admit_card_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- RESULT MASTER (Phase 3 — admin-configurable result rules per class+year)
-- ============================================

CREATE TABLE IF NOT EXISTS result_masters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,

  -- Basic rules
  pass_mark_mode text NOT NULL DEFAULT 'percentage',
  pass_mark_value numeric(6,2) NOT NULL DEFAULT 33,
  pass_criteria_type text NOT NULL DEFAULT 'all_main_subjects',
  pass_criteria_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Display
  show_rank boolean NOT NULL DEFAULT false,
  show_extra_separately boolean NOT NULL DEFAULT true,
  include_non_scholastic boolean NOT NULL DEFAULT false,
  non_scholastic_placement text NOT NULL DEFAULT 'below',

  -- Grading override (NULL = use class_grade_scales or scope default)
  grade_scale_id uuid REFERENCES grade_scales(id) ON DELETE SET NULL,

  -- Grace marks (percentage points; applied before pass check; covers main + optional)
  grace_marks_per_subject_max numeric(5,2) NOT NULL DEFAULT 0,
  grace_marks_total_max numeric(5,2) NOT NULL DEFAULT 0,
  grace_marks_condition text NOT NULL DEFAULT 'failing_only',

  -- Rounding
  rounding_mode text NOT NULL DEFAULT 'none',
  rounding_precision integer NOT NULL DEFAULT 0,
  round_raw_marks boolean NOT NULL DEFAULT false,

  -- Best-of rules (NULL = use all exams of that kind)
  class_test_best_of integer,
  practical_best_of integer,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT result_masters_unique UNIQUE (class_id, academic_year_id),
  CONSTRAINT result_masters_pass_mark_mode_check
    CHECK (pass_mark_mode IN ('percentage', 'raw_marks')),
  CONSTRAINT result_masters_pass_mark_value_check
    CHECK (pass_mark_value >= 0),
  CONSTRAINT result_masters_non_scholastic_placement_check
    CHECK (non_scholastic_placement IN ('below', 'above', 'separate_page')),
  CONSTRAINT result_masters_grace_per_subject_range
    CHECK (grace_marks_per_subject_max >= 0 AND grace_marks_per_subject_max <= 100),
  CONSTRAINT result_masters_grace_total_range
    CHECK (grace_marks_total_max >= 0 AND grace_marks_total_max <= 100),
  CONSTRAINT result_masters_grace_condition_check
    CHECK (grace_marks_condition IN ('failing_only', 'any_subject')),
  CONSTRAINT result_masters_rounding_mode_check
    CHECK (rounding_mode IN ('none', 'half_up', 'half_down', 'ceil', 'floor')),
  CONSTRAINT result_masters_rounding_precision_check
    CHECK (rounding_precision BETWEEN 0 AND 2),
  CONSTRAINT result_masters_class_test_best_of_positive
    CHECK (class_test_best_of IS NULL OR class_test_best_of > 0),
  CONSTRAINT result_masters_practical_best_of_positive
    CHECK (practical_best_of IS NULL OR practical_best_of > 0)
);

CREATE INDEX IF NOT EXISTS idx_result_masters_class_year
  ON result_masters(class_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_result_masters_academic_year
  ON result_masters(academic_year_id);

CREATE TABLE IF NOT EXISTS result_master_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  result_master_id uuid NOT NULL REFERENCES result_masters(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'main',
  pass_mark_value_override numeric(6,2),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT result_master_subjects_unique UNIQUE (result_master_id, subject_id),
  CONSTRAINT result_master_subjects_role_check
    CHECK (role IN ('main', 'optional')),
  CONSTRAINT result_master_subjects_override_nonneg
    CHECK (pass_mark_value_override IS NULL OR pass_mark_value_override >= 0)
);

CREATE INDEX IF NOT EXISTS idx_result_master_subjects_master
  ON result_master_subjects(result_master_id);
CREATE INDEX IF NOT EXISTS idx_result_master_subjects_subject
  ON result_master_subjects(subject_id);

ALTER TABLE result_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_master_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read result_masters" ON result_masters;
CREATE POLICY "Authenticated can read result_masters"
  ON result_masters FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage result_masters" ON result_masters;
CREATE POLICY "Admins can manage result_masters"
  ON result_masters FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated can read result_master_subjects" ON result_master_subjects;
CREATE POLICY "Authenticated can read result_master_subjects"
  ON result_master_subjects FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage result_master_subjects" ON result_master_subjects;
CREATE POLICY "Admins can manage result_master_subjects"
  ON result_master_subjects FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- NON-SCHOLASTIC ASSESSMENTS (Phase 2 — migration-023)
-- Per-student grade for each non-scholastic sub-subject in a given exam.
-- ============================================

CREATE TABLE IF NOT EXISTS non_scholastic_assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exam_type_id uuid NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  sub_subject_id uuid NOT NULL REFERENCES non_scholastic_sub_subjects(id) ON DELETE CASCADE,
  grade_label text NOT NULL,
  remarks text,
  entered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT non_scholastic_assessments_unique
    UNIQUE (student_id, exam_type_id, sub_subject_id)
);

CREATE INDEX IF NOT EXISTS idx_nsa_student ON non_scholastic_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_nsa_exam ON non_scholastic_assessments(exam_type_id);
CREATE INDEX IF NOT EXISTS idx_nsa_class_exam ON non_scholastic_assessments(class_id, exam_type_id);
CREATE INDEX IF NOT EXISTS idx_nsa_sub_subject ON non_scholastic_assessments(sub_subject_id);

ALTER TABLE non_scholastic_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to non_scholastic_assessments"
  ON non_scholastic_assessments;
CREATE POLICY "Admins full access to non_scholastic_assessments"
  ON non_scholastic_assessments FOR ALL
  USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Teachers can read assessments for their classes"
  ON non_scholastic_assessments;
CREATE POLICY "Teachers can read assessments for their classes"
  ON non_scholastic_assessments FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

DROP POLICY IF EXISTS "Teachers can insert assessments for their classes"
  ON non_scholastic_assessments;
CREATE POLICY "Teachers can insert assessments for their classes"
  ON non_scholastic_assessments FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

DROP POLICY IF EXISTS "Teachers can update assessments for their classes"
  ON non_scholastic_assessments;
CREATE POLICY "Teachers can update assessments for their classes"
  ON non_scholastic_assessments FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

DROP POLICY IF EXISTS "Students can read own published assessments"
  ON non_scholastic_assessments;
CREATE POLICY "Students can read own published assessments"
  ON non_scholastic_assessments FOR SELECT
  USING (
    student_id = public.get_my_student_id()
    AND is_published = true
  );

DROP POLICY IF EXISTS "Parents can read children published assessments"
  ON non_scholastic_assessments;
CREATE POLICY "Parents can read children published assessments"
  ON non_scholastic_assessments FOR SELECT
  USING (
    student_id IN (SELECT public.get_my_children_ids())
    AND is_published = true
  );

-- ============================================
-- CLASS TESTS (Phase 3 — migration-024)
-- Dedicated frequent-entry flow for class tests. Sibling of exam_types —
-- exam_types.kind='class_test' lightweight path continues to work for
-- schools that prefer that model.
-- ============================================

CREATE TABLE IF NOT EXISTS class_tests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  test_date date,
  max_marks numeric(5,2) NOT NULL DEFAULT 100,
  weightage numeric(5,2),
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT class_tests_max_marks_positive CHECK (max_marks > 0),
  CONSTRAINT class_tests_weightage_pct CHECK (
    weightage IS NULL OR (weightage >= 0 AND weightage <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_class_tests_class_subject
  ON class_tests(class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_class_tests_class
  ON class_tests(class_id);
CREATE INDEX IF NOT EXISTS idx_class_tests_date
  ON class_tests(test_date);

CREATE TABLE IF NOT EXISTS class_test_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_test_id uuid NOT NULL REFERENCES class_tests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained numeric(5,2) NOT NULL,
  max_marks numeric(5,2) NOT NULL,
  grade text,
  remarks text,
  entered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT class_test_results_unique UNIQUE (class_test_id, student_id),
  CONSTRAINT class_test_results_marks_in_range CHECK (
    marks_obtained >= 0 AND marks_obtained <= max_marks
  )
);

CREATE INDEX IF NOT EXISTS idx_class_test_results_test
  ON class_test_results(class_test_id);
CREATE INDEX IF NOT EXISTS idx_class_test_results_student
  ON class_test_results(student_id);

ALTER TABLE class_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to class_tests" ON class_tests;
CREATE POLICY "Admins full access to class_tests"
  ON class_tests FOR ALL
  USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Teachers can read class_tests for their classes" ON class_tests;
CREATE POLICY "Teachers can read class_tests for their classes"
  ON class_tests FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

DROP POLICY IF EXISTS "Teachers can insert class_tests for their class-subject combos" ON class_tests;
CREATE POLICY "Teachers can insert class_tests for their class-subject combos"
  ON class_tests FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
    AND subject_id IN (
      SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can update class_tests for their class-subject combos" ON class_tests;
CREATE POLICY "Teachers can update class_tests for their class-subject combos"
  ON class_tests FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
    AND subject_id IN (
      SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Teachers can delete class_tests for their class-subject combos" ON class_tests;
CREATE POLICY "Teachers can delete class_tests for their class-subject combos"
  ON class_tests FOR DELETE
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
    AND subject_id IN (
      SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Students can read own published class_tests" ON class_tests;
CREATE POLICY "Students can read own published class_tests"
  ON class_tests FOR SELECT
  USING (
    is_published = true
    AND class_id IN (
      SELECT class_id FROM student_enrollments
      WHERE student_id = public.get_my_student_id()
        AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Parents can read children published class_tests" ON class_tests;
CREATE POLICY "Parents can read children published class_tests"
  ON class_tests FOR SELECT
  USING (
    is_published = true
    AND class_id IN (
      SELECT class_id FROM student_enrollments
      WHERE student_id IN (SELECT public.get_my_children_ids())
        AND status = 'active'
    )
  );

ALTER TABLE class_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to class_test_results" ON class_test_results;
CREATE POLICY "Admins full access to class_test_results"
  ON class_test_results FOR ALL
  USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Teachers can read class_test_results for their classes" ON class_test_results;
CREATE POLICY "Teachers can read class_test_results for their classes"
  ON class_test_results FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_test_id IN (
      SELECT id FROM class_tests
      WHERE class_id IN (SELECT public.get_my_class_ids())
    )
  );

DROP POLICY IF EXISTS "Teachers can insert class_test_results for their class-subject combos" ON class_test_results;
CREATE POLICY "Teachers can insert class_test_results for their class-subject combos"
  ON class_test_results FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'teacher'
    AND class_test_id IN (
      SELECT id FROM class_tests
      WHERE class_id IN (SELECT public.get_my_class_ids())
        AND subject_id IN (
          SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
        )
    )
  );

DROP POLICY IF EXISTS "Teachers can update class_test_results for their class-subject combos" ON class_test_results;
CREATE POLICY "Teachers can update class_test_results for their class-subject combos"
  ON class_test_results FOR UPDATE
  USING (
    public.get_user_role() = 'teacher'
    AND class_test_id IN (
      SELECT id FROM class_tests
      WHERE class_id IN (SELECT public.get_my_class_ids())
        AND subject_id IN (
          SELECT subject_id FROM class_subjects WHERE teacher_id = public.get_my_teacher_id()
        )
    )
  );

DROP POLICY IF EXISTS "Students can read own published class_test_results" ON class_test_results;
CREATE POLICY "Students can read own published class_test_results"
  ON class_test_results FOR SELECT
  USING (
    student_id = public.get_my_student_id()
    AND class_test_id IN (SELECT id FROM class_tests WHERE is_published = true)
  );

DROP POLICY IF EXISTS "Parents can read children published class_test_results" ON class_test_results;
CREATE POLICY "Parents can read children published class_test_results"
  ON class_test_results FOR SELECT
  USING (
    student_id IN (SELECT public.get_my_children_ids())
    AND class_test_id IN (SELECT id FROM class_tests WHERE is_published = true)
  );

-- ============================================
-- PUBLISH WORKFLOW (Phase 5 — migration-025)
-- Two-stage publish: online is_published on `results` (stays editable) and
-- finalized PDF snapshots stored in `marksheet_publications`.
-- ============================================

-- `kind = 'per_exam'` (legacy default): one snapshot per exam_type_id,
-- academic_year_id is NULL.
-- `kind = 'year_final'` (migration 033): year-end aggregate; exam_type_id is
-- NULL, academic_year_id carries the year. CHECK enforces the relationship.
CREATE TABLE IF NOT EXISTS marksheet_publications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exam_type_id uuid REFERENCES exam_types(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'per_exam'
    CHECK (kind IN ('per_exam', 'year_final')),
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  schema_version text NOT NULL DEFAULT 'v1',
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  unpublished_at timestamptz,
  unpublish_reason text,
  unpublished_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT marksheet_publications_version_positive
    CHECK (version > 0),
  CONSTRAINT marksheet_publications_unpublish_consistent
    CHECK (
      (unpublished_at IS NULL AND unpublish_reason IS NULL)
      OR (unpublished_at IS NOT NULL)
    ),
  CONSTRAINT marksheet_publications_kind_consistent
    CHECK (
      (kind = 'per_exam'
        AND exam_type_id IS NOT NULL
        AND academic_year_id IS NULL)
      OR (kind = 'year_final'
        AND exam_type_id IS NULL
        AND academic_year_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marksheet_version_unique_per_exam
  ON marksheet_publications(student_id, exam_type_id, version)
  WHERE kind = 'per_exam';
CREATE UNIQUE INDEX IF NOT EXISTS idx_marksheet_version_unique_year_final
  ON marksheet_publications(student_id, academic_year_id, version)
  WHERE kind = 'year_final';
CREATE UNIQUE INDEX IF NOT EXISTS idx_marksheet_active_one_per_exam
  ON marksheet_publications(student_id, exam_type_id)
  WHERE kind = 'per_exam' AND unpublished_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marksheet_active_one_year_final
  ON marksheet_publications(student_id, academic_year_id)
  WHERE kind = 'year_final' AND unpublished_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marksheet_class_exam
  ON marksheet_publications(class_id, exam_type_id);
CREATE INDEX IF NOT EXISTS idx_marksheet_student
  ON marksheet_publications(student_id);
CREATE INDEX IF NOT EXISTS idx_marksheet_year_final_year
  ON marksheet_publications(academic_year_id, class_id)
  WHERE kind = 'year_final';

CREATE TABLE IF NOT EXISTS publish_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL CHECK (
    event_type IN (
      'publish_results',
      'unpublish_results',
      'finalize_marksheet',
      'unpublish_marksheet',
      're_finalize_marksheet',
      'finalize_year_final',
      'unpublish_year_final',
      're_finalize_year_final',
      'revert_alumni',
      'admin_audit'
    )
  ),
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  exam_type_id uuid REFERENCES exam_types(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  acted_at timestamptz DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_publish_events_exam
  ON publish_events(exam_type_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_publish_events_student
  ON publish_events(student_id, acted_at DESC);

ALTER TABLE marksheet_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to marksheet_publications" ON marksheet_publications;
CREATE POLICY "Admins full access to marksheet_publications"
  ON marksheet_publications FOR ALL
  USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Teachers can read marksheet_publications for their classes" ON marksheet_publications;
CREATE POLICY "Teachers can read marksheet_publications for their classes"
  ON marksheet_publications FOR SELECT
  USING (
    public.get_user_role() = 'teacher'
    AND class_id IN (SELECT public.get_my_class_ids())
  );

ALTER TABLE publish_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read publish_events" ON publish_events;
CREATE POLICY "Admins read publish_events"
  ON publish_events FOR SELECT
  USING (public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025 — Roll Number dynamic reordering (mirrored from scripts/migration-025-roll-number-auto.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- Migration 025: Roll Number dynamic reordering.
--
-- Replaces the historical NULL-by-default `student_enrollments.roll_number`
-- with an auto-assigned system:
--   * Column `roll_number_manual` lets admins pin a row so auto-recompute
--     never touches it (conservative default for any row already set).
--   * Function `recompute_roll_numbers(class_id, sort_key)` assigns
--     sequential 1..N within the class (section is already baked into
--     `class_id` via UNIQUE(name, section, academic_year_id, stream_id)).
--   * Partial unique index enforces per-class uniqueness for active rows.
--   * Triggers on enrollment INSERT / DELETE, status UPDATE, and student
--     `full_name` UPDATE keep the numbering tight without manual intervention.
--
-- Sort key handling:
--   * `'name'`            → `students.full_name ASC` (alphabetical, default).
--   * `'admission_no'`    → `students.admission_no ASC`.
--   * `'previous_rank'`   → computed by the caller (see
--     `src/lib/final-result.ts::computeRanksForClass`) because rank depends
--     on Phase 4 result-master configuration that is awkward to re-derive in
--     plain SQL. The API route passes an ordered student id list to the
--     companion function `apply_roll_numbers(class_id, ordered_student_ids)`.
--
-- Idempotent: safe to re-run. Triggers and functions use CREATE OR REPLACE.
-- The backfill DO block at the bottom only touches classes that have active
-- enrollments, and the conservative "mark manual on drift" step runs before
-- the mass recompute so existing manual work is preserved.

-- ─── Diagnostic reference (read-only; commented for reference) ──────────────
-- Current roll_number distribution per class (uncomment to inspect):
-- SELECT c.name, c.section, count(*) AS active,
--        count(*) FILTER (WHERE se.roll_number IS NULL) AS null_roll
-- FROM student_enrollments se
-- JOIN classes c ON c.id = se.class_id
-- WHERE se.status = 'active'
-- GROUP BY c.id, c.name, c.section
-- ORDER BY c.sort_order;

-- ─── 1. Column + index ───────────────────────────────────────────────────────

ALTER TABLE student_enrollments
  ADD COLUMN IF NOT EXISTS roll_number_manual boolean NOT NULL DEFAULT false;

-- Partial unique: (class_id, roll_number) must be unique among active rows.
CREATE UNIQUE INDEX IF NOT EXISTS student_enrollments_class_rollno_active_unique
  ON student_enrollments (class_id, roll_number)
  WHERE status = 'active' AND roll_number IS NOT NULL;

-- ─── 2. Core recompute function ─────────────────────────────────────────────
-- Orders active enrollments for p_class_id by p_sort_key, then assigns
-- sequential numbers 1..N skipping rows with roll_number_manual=true (those
-- keep their current number; the running counter still increments over them
-- to prevent collisions with manual pins).
-- Two-phase update (null out first, then re-number) avoids transient unique
-- violations on the partial index when rows swap numbers.
-- Design choice: `previous_rank` sort is NOT implemented in this function —
-- see apply_roll_numbers() below. Keeps this function dependency-free on the
-- Phase 4 result engine.

CREATE OR REPLACE FUNCTION recompute_roll_numbers(
  p_class_id uuid,
  p_sort_key text DEFAULT 'name'
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter integer := 0;
  v_row RECORD;
  v_taken_manual int[] := ARRAY[]::int[];
  v_updated int := 0;
BEGIN
  IF p_sort_key NOT IN ('name', 'admission_no') THEN
    RAISE EXCEPTION 'recompute_roll_numbers: unsupported sort_key %, allowed: name, admission_no (previous_rank uses apply_roll_numbers)', p_sort_key;
  END IF;

  -- Collect manual pins so the sequential counter can skip those numbers.
  SELECT COALESCE(array_agg(roll_number ORDER BY roll_number), ARRAY[]::int[])
    INTO v_taken_manual
  FROM student_enrollments
  WHERE class_id = p_class_id
    AND status = 'active'
    AND roll_number_manual = true
    AND roll_number IS NOT NULL;

  -- Phase 1: null out all non-manual roll numbers so we can reassign cleanly.
  UPDATE student_enrollments
     SET roll_number = NULL
   WHERE class_id = p_class_id
     AND status = 'active'
     AND roll_number_manual = false;

  -- Phase 2: walk the ordered list and assign the next free number.
  FOR v_row IN
    SELECT se.id, s.full_name, s.admission_no
    FROM student_enrollments se
    JOIN students s ON s.id = se.student_id
    WHERE se.class_id = p_class_id
      AND se.status = 'active'
      AND se.roll_number_manual = false
    ORDER BY
      CASE WHEN p_sort_key = 'name'         THEN s.full_name    END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'admission_no' THEN s.admission_no END ASC NULLS LAST,
      s.full_name ASC,
      se.id ASC
  LOOP
    v_counter := v_counter + 1;
    -- Skip any number a manual row already holds.
    WHILE v_counter = ANY(v_taken_manual) LOOP
      v_counter := v_counter + 1;
    END LOOP;

    UPDATE student_enrollments
       SET roll_number = v_counter
     WHERE id = v_row.id;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

-- Companion function for `previous_rank` — accepts a caller-computed ordered
-- list of student_ids and applies 1..N to those rows' enrollments in that
-- class. Shares the manual-pin skip logic with recompute_roll_numbers.

CREATE OR REPLACE FUNCTION apply_roll_numbers(
  p_class_id uuid,
  p_ordered_student_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter integer := 0;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_taken_manual int[] := ARRAY[]::int[];
  v_updated int := 0;
BEGIN
  SELECT COALESCE(array_agg(roll_number ORDER BY roll_number), ARRAY[]::int[])
    INTO v_taken_manual
  FROM student_enrollments
  WHERE class_id = p_class_id
    AND status = 'active'
    AND roll_number_manual = true
    AND roll_number IS NOT NULL;

  UPDATE student_enrollments
     SET roll_number = NULL
   WHERE class_id = p_class_id
     AND status = 'active'
     AND roll_number_manual = false;

  -- Apply in caller-supplied order first.
  FOREACH v_student_id IN ARRAY p_ordered_student_ids
  LOOP
    SELECT id INTO v_enrollment_id
    FROM student_enrollments
    WHERE class_id = p_class_id
      AND student_id = v_student_id
      AND status = 'active'
      AND roll_number_manual = false
    LIMIT 1;

    IF v_enrollment_id IS NULL THEN
      CONTINUE;
    END IF;

    v_counter := v_counter + 1;
    WHILE v_counter = ANY(v_taken_manual) LOOP
      v_counter := v_counter + 1;
    END LOOP;

    UPDATE student_enrollments
       SET roll_number = v_counter
     WHERE id = v_enrollment_id;
    v_updated := v_updated + 1;
  END LOOP;

  -- Any unranked active students (not in p_ordered_student_ids) get numbered
  -- next, alphabetically by full_name — keeps ordering deterministic.
  FOR v_enrollment_id IN
    SELECT se.id
    FROM student_enrollments se
    JOIN students s ON s.id = se.student_id
    WHERE se.class_id = p_class_id
      AND se.status = 'active'
      AND se.roll_number_manual = false
      AND se.roll_number IS NULL
    ORDER BY s.full_name ASC, se.id ASC
  LOOP
    v_counter := v_counter + 1;
    WHILE v_counter = ANY(v_taken_manual) LOOP
      v_counter := v_counter + 1;
    END LOOP;

    UPDATE student_enrollments
       SET roll_number = v_counter
     WHERE id = v_enrollment_id;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

-- ─── 3. Trigger functions ───────────────────────────────────────────────────

-- INSERT: new enrollment → recompute that class alphabetically.
CREATE OR REPLACE FUNCTION trg_enrollment_insert_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM recompute_roll_numbers(NEW.class_id, 'name');
  END IF;
  RETURN NEW;
END;
$$;

-- DELETE: removed enrollment → recompute that class.
CREATE OR REPLACE FUNCTION trg_enrollment_delete_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' THEN
    PERFORM recompute_roll_numbers(OLD.class_id, 'name');
  END IF;
  RETURN OLD;
END;
$$;

-- UPDATE of status or class_id: recompute both the old and new class if
-- anything affecting roll-number membership changed.
CREATE OR REPLACE FUNCTION trg_enrollment_update_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.class_id IS DISTINCT FROM NEW.class_id THEN
    IF OLD.class_id IS NOT NULL THEN
      PERFORM recompute_roll_numbers(OLD.class_id, 'name');
    END IF;
    IF NEW.class_id IS NOT NULL AND NEW.class_id IS DISTINCT FROM OLD.class_id THEN
      PERFORM recompute_roll_numbers(NEW.class_id, 'name');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- UPDATE of students.full_name: recompute every active class the student is
-- currently enrolled in.
CREATE OR REPLACE FUNCTION trg_student_name_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    FOR v_class_id IN
      SELECT DISTINCT class_id FROM student_enrollments
      WHERE student_id = NEW.id AND status = 'active'
    LOOP
      PERFORM recompute_roll_numbers(v_class_id, 'name');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 4. Triggers ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS enrollment_after_insert_recompute ON student_enrollments;
CREATE TRIGGER enrollment_after_insert_recompute
  AFTER INSERT ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION trg_enrollment_insert_recompute();

DROP TRIGGER IF EXISTS enrollment_after_delete_recompute ON student_enrollments;
CREATE TRIGGER enrollment_after_delete_recompute
  AFTER DELETE ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION trg_enrollment_delete_recompute();

DROP TRIGGER IF EXISTS enrollment_after_update_recompute ON student_enrollments;
CREATE TRIGGER enrollment_after_update_recompute
  AFTER UPDATE OF status, class_id ON student_enrollments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.class_id IS DISTINCT FROM NEW.class_id)
  EXECUTE FUNCTION trg_enrollment_update_recompute();

DROP TRIGGER IF EXISTS student_after_name_update_recompute ON students;
CREATE TRIGGER student_after_name_update_recompute
  AFTER UPDATE OF full_name ON students
  FOR EACH ROW
  WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name)
  EXECUTE FUNCTION trg_student_name_recompute();

-- ─── 5. Backfill (idempotent) ───────────────────────────────────────────────
-- Step A: For each class with active enrollments whose current roll-number
-- ordering diverges from alphabetical, mark every row in that class as manual.
-- Conservative: preserves pre-existing manual work (the old NULL-default
-- system allowed admins to hand-enter roll numbers; those numbers should
-- survive the automated migration).
-- Step B: Run recompute_roll_numbers() for every class with active
-- enrollments. Rows now flagged manual keep their numbers; NULL rows get
-- sequential numbers in whatever gaps remain.

DO $$
DECLARE
  v_class RECORD;
  v_alphabetical_order uuid[];
  v_current_order uuid[];
BEGIN
  FOR v_class IN
    SELECT DISTINCT c.id AS class_id
    FROM classes c
    JOIN student_enrollments se ON se.class_id = c.id
    WHERE se.status = 'active'
  LOOP
    -- Alphabetical order of student_ids, nulls last.
    SELECT COALESCE(array_agg(se.student_id ORDER BY s.full_name ASC, se.id ASC), ARRAY[]::uuid[])
      INTO v_alphabetical_order
    FROM student_enrollments se
    JOIN students s ON s.id = se.student_id
    WHERE se.class_id = v_class.class_id
      AND se.status = 'active'
      AND se.roll_number IS NOT NULL;

    -- Current order by existing roll_number.
    SELECT COALESCE(array_agg(se.student_id ORDER BY se.roll_number ASC), ARRAY[]::uuid[])
      INTO v_current_order
    FROM student_enrollments se
    WHERE se.class_id = v_class.class_id
      AND se.status = 'active'
      AND se.roll_number IS NOT NULL;

    -- If diverged (and non-empty), pin everyone in this class as manual.
    IF array_length(v_current_order, 1) IS NOT NULL
       AND v_current_order IS DISTINCT FROM v_alphabetical_order THEN
      UPDATE student_enrollments
         SET roll_number_manual = true
       WHERE class_id = v_class.class_id
         AND status = 'active'
         AND roll_number IS NOT NULL;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_class_id uuid;
BEGIN
  FOR v_class_id IN
    SELECT DISTINCT class_id
    FROM student_enrollments
    WHERE status = 'active'
  LOOP
    PERFORM recompute_roll_numbers(v_class_id, 'name');
  END LOOP;
END $$;
-- Migration 026: Parent-Teacher Meeting notes (Phase 6 Chunk B).
--
-- Two sibling tables:
--   1. `ptm_notes` — one row per (student, meeting_date). Records meeting
--      attendance plus teacher/parent remarks and action points. Teachers
--      create & edit; parents read their own children's notes.
--   2. `school_meeting_counts` — the "Total School Meetings" counter that
--      the legacy platform shows at the top of the PTM grid. Scoped by
--      (academic_year, optional exam_type, optional class) so a school can
--      track year-wide, per-exam, or per-class meeting tallies. Uniqueness
--      over nullable scope columns is enforced via a COALESCE'd unique
--      index (regular UNIQUE constraints can't express this in Postgres).
--
-- RLS in summary:
--   - admins: full access.
--   - teachers: read/write rows for students in their class scope
--     (`public.get_my_class_ids()`).
--   - parents: read-only for their own children (`get_my_children_ids()`).
--   - editors with `ptm_notes` feature key: enforced at the API layer via
--     verifyAdminOrEditor (matches the pattern used by Phase 2/3/5
--     features — SQL-level RLS doesn't know about editor_permissions).

-- =============================================================
-- ptm_notes
-- =============================================================

CREATE TABLE IF NOT EXISTS ptm_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_type_id uuid REFERENCES exam_types(id) ON DELETE SET NULL,
  meeting_date date NOT NULL,
  attendance text NOT NULL,
  teacher_remarks text,
  parent_remarks text,
  action_points text,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT ptm_notes_attendance_check
    CHECK (attendance IN ('present', 'absent')),
  CONSTRAINT ptm_notes_unique_per_date UNIQUE (student_id, meeting_date)
);

CREATE INDEX IF NOT EXISTS idx_ptm_notes_student ON ptm_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_ptm_notes_exam ON ptm_notes(exam_type_id);
CREATE INDEX IF NOT EXISTS idx_ptm_notes_date ON ptm_notes(meeting_date DESC);

-- Trigger: refresh updated_at on update.
CREATE OR REPLACE FUNCTION public.ptm_notes_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ptm_notes_set_updated_at ON ptm_notes;
CREATE TRIGGER ptm_notes_set_updated_at
  BEFORE UPDATE ON ptm_notes
  FOR EACH ROW EXECUTE FUNCTION public.ptm_notes_touch_updated_at();

ALTER TABLE ptm_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ptm_notes" ON ptm_notes;
CREATE POLICY "Admins manage ptm_notes"
  ON ptm_notes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Teachers read ptm_notes for own classes" ON ptm_notes;
CREATE POLICY "Teachers read ptm_notes for own classes"
  ON ptm_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM student_enrollments se
      WHERE se.student_id = ptm_notes.student_id
        AND se.status = 'active'
        AND se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

DROP POLICY IF EXISTS "Teachers write ptm_notes for own classes" ON ptm_notes;
CREATE POLICY "Teachers write ptm_notes for own classes"
  ON ptm_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_enrollments se
      WHERE se.student_id = ptm_notes.student_id
        AND se.status = 'active'
        AND se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

DROP POLICY IF EXISTS "Teachers update ptm_notes for own classes" ON ptm_notes;
CREATE POLICY "Teachers update ptm_notes for own classes"
  ON ptm_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM student_enrollments se
      WHERE se.student_id = ptm_notes.student_id
        AND se.status = 'active'
        AND se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

DROP POLICY IF EXISTS "Teachers delete ptm_notes for own classes" ON ptm_notes;
CREATE POLICY "Teachers delete ptm_notes for own classes"
  ON ptm_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM student_enrollments se
      WHERE se.student_id = ptm_notes.student_id
        AND se.status = 'active'
        AND se.class_id IN (SELECT public.get_my_class_ids())
    )
  );

DROP POLICY IF EXISTS "Parents read ptm_notes for own children" ON ptm_notes;
CREATE POLICY "Parents read ptm_notes for own children"
  ON ptm_notes FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()));

-- =============================================================
-- school_meeting_counts
-- =============================================================

CREATE TABLE IF NOT EXISTS school_meeting_counts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  exam_type_id uuid REFERENCES exam_types(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  total_meetings integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT school_meeting_counts_nonneg CHECK (total_meetings >= 0)
);

-- Uniqueness over nullable scope keys: treat NULL as a sentinel so
-- (year, NULL, NULL) and (year, exam_X, NULL) coexist but duplicates
-- within either slot are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS school_meeting_counts_scope_unique
  ON school_meeting_counts(
    academic_year_id,
    COALESCE(exam_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_school_meeting_counts_year
  ON school_meeting_counts(academic_year_id);

DROP TRIGGER IF EXISTS school_meeting_counts_set_updated_at ON school_meeting_counts;
CREATE TRIGGER school_meeting_counts_set_updated_at
  BEFORE UPDATE ON school_meeting_counts
  FOR EACH ROW EXECUTE FUNCTION public.ptm_notes_touch_updated_at();

ALTER TABLE school_meeting_counts ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user — the counter is displayed on teacher
-- and parent screens alike and has no PII.
DROP POLICY IF EXISTS "Authenticated read school_meeting_counts" ON school_meeting_counts;
CREATE POLICY "Authenticated read school_meeting_counts"
  ON school_meeting_counts FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage school_meeting_counts" ON school_meeting_counts;
CREATE POLICY "Admins manage school_meeting_counts"
  ON school_meeting_counts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Teachers manage school_meeting_counts for own classes" ON school_meeting_counts;
CREATE POLICY "Teachers manage school_meeting_counts for own classes"
  ON school_meeting_counts FOR ALL
  USING (
    -- Year-wide / school-wide rows (class_id NULL) allowed for any teacher
    -- since they reflect institution-level meeting totals.
    class_id IS NULL
    OR class_id IN (SELECT public.get_my_class_ids())
  )
  WITH CHECK (
    class_id IS NULL
    OR class_id IN (SELECT public.get_my_class_ids())
  );
-- Migration 027: PTM Format templates (Phase 6 Chunk C).
--
-- Admin-configurable template for the printable handout given to parents
-- BEFORE a parent-teacher meeting. Separate from `ptm_notes` (which stores
-- post-meeting records) — this is the pre-meeting artifact with:
--   - student header (name, roll, admission no, father/mother, photo)
--   - subject-wise performance snapshot from `results` for a chosen exam
--   - blank space for teacher's face-to-face remarks
--   - parent signature line
--
-- Model mirrors `admit_card_templates` — a thin row of boolean toggles +
-- text knobs, one row per template, with an `is_default` flag so a
-- one-click "generate for class X using the default template" flow works
-- without forcing the admin to pick a template every time. Multiple
-- templates coexist (e.g. one for primary and one for senior) and the
-- default can be toggled via a partial unique index.

CREATE TABLE IF NOT EXISTS ptm_formats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,

  intro_text text,
  closing_text text,

  show_student_details boolean NOT NULL DEFAULT true,
  show_photo boolean NOT NULL DEFAULT false,
  show_father_name boolean NOT NULL DEFAULT true,
  show_mother_name boolean NOT NULL DEFAULT true,
  show_performance_snapshot boolean NOT NULL DEFAULT true,
  show_teacher_remarks_section boolean NOT NULL DEFAULT true,
  teacher_remarks_lines integer NOT NULL DEFAULT 6,
  show_parent_signature boolean NOT NULL DEFAULT true,

  signature_labels jsonb NOT NULL DEFAULT '["Class Teacher","Parent Signature"]'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT ptm_formats_remarks_lines_positive
    CHECK (teacher_remarks_lines >= 0 AND teacher_remarks_lines <= 20)
);

-- Only one default row can be active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ptm_formats_single_default
  ON ptm_formats(is_default)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.ptm_formats_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ptm_formats_set_updated_at ON ptm_formats;
CREATE TRIGGER ptm_formats_set_updated_at
  BEFORE UPDATE ON ptm_formats
  FOR EACH ROW EXECUTE FUNCTION public.ptm_formats_touch_updated_at();

ALTER TABLE ptm_formats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read ptm_formats" ON ptm_formats;
CREATE POLICY "Authenticated read ptm_formats"
  ON ptm_formats FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage ptm_formats" ON ptm_formats;
CREATE POLICY "Admins manage ptm_formats"
  ON ptm_formats FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Seed one default template so the "Download" flow works out of the box
-- before an admin ever opens the Settings page.
INSERT INTO ptm_formats (name, is_default, intro_text, closing_text)
VALUES (
  'Default PTM Format',
  true,
  'Dear Parent, this handout summarises your child''s recent performance. Please bring it to the upcoming parent-teacher meeting for reference and signature.',
  'Thank you for your continued support. We look forward to discussing your child''s progress.'
)
ON CONFLICT (name) DO NOTHING;
-- Migration 028: Supplementary Exam workflow (Phase 8).
--
-- Schools allow students who fail one or two subjects in a main exam to
-- retest those subjects only. Pass criteria for supplementary is usually
-- "minimum X marks in original" (eligibility) and "pass in retest"
-- (qualification). Legacy platform stores these as
--   MinForSupplementary=25, SupplementarySubs=2
-- per Result Master configuration.
--
-- The retest is recorded against the *same* parent_exam_type_id (it's not
-- a new exam type — the supplementary marks substitute into the original
-- exam's slot for purposes of final-result recompute).
--
-- supplementary_pass_action controls how the substitution flows into the
-- final result:
--   - 'cap_at_pass_mark': substitute = pass_mark (most schools — discourages
--     the "save your scores" gaming pattern). Default.
--   - 'use_retest_marks': substitute = actual retest marks_obtained.

-- =============================================================
-- Result Masters: supplementary settings columns
-- =============================================================
ALTER TABLE result_masters
  ADD COLUMN IF NOT EXISTS min_for_supplementary numeric(6,2);
ALTER TABLE result_masters
  ADD COLUMN IF NOT EXISTS max_supplementary_subjects integer NOT NULL DEFAULT 2;
ALTER TABLE result_masters
  ADD COLUMN IF NOT EXISTS supplementary_pass_action text
    NOT NULL DEFAULT 'cap_at_pass_mark';

ALTER TABLE result_masters
  DROP CONSTRAINT IF EXISTS result_masters_supp_threshold_nonneg;
ALTER TABLE result_masters
  ADD CONSTRAINT result_masters_supp_threshold_nonneg
  CHECK (min_for_supplementary IS NULL OR min_for_supplementary >= 0);

ALTER TABLE result_masters
  DROP CONSTRAINT IF EXISTS result_masters_max_supp_subs_nonneg;
ALTER TABLE result_masters
  ADD CONSTRAINT result_masters_max_supp_subs_nonneg
  CHECK (max_supplementary_subjects >= 0);

ALTER TABLE result_masters
  DROP CONSTRAINT IF EXISTS result_masters_supp_pass_action_check;
ALTER TABLE result_masters
  ADD CONSTRAINT result_masters_supp_pass_action_check
  CHECK (supplementary_pass_action IN ('cap_at_pass_mark', 'use_retest_marks'));

-- =============================================================
-- supplementary_attempts
-- =============================================================
CREATE TABLE IF NOT EXISTS supplementary_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_exam_type_id uuid NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  retest_date date,
  marks_obtained numeric(6,2) NOT NULL,
  max_marks numeric(6,2) NOT NULL,
  passed boolean NOT NULL,
  entered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT supplementary_attempts_unique
    UNIQUE (student_id, parent_exam_type_id, subject_id),
  CONSTRAINT supplementary_attempts_marks_range
    CHECK (marks_obtained >= 0 AND marks_obtained <= max_marks),
  CONSTRAINT supplementary_attempts_max_positive
    CHECK (max_marks > 0)
);

CREATE INDEX IF NOT EXISTS idx_supplementary_attempts_student
  ON supplementary_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_supplementary_attempts_exam_subject
  ON supplementary_attempts(parent_exam_type_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_supplementary_attempts_class
  ON supplementary_attempts(class_id);

CREATE OR REPLACE FUNCTION public.supplementary_attempts_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplementary_attempts_set_updated_at ON supplementary_attempts;
CREATE TRIGGER supplementary_attempts_set_updated_at
  BEFORE UPDATE ON supplementary_attempts
  FOR EACH ROW EXECUTE FUNCTION public.supplementary_attempts_touch_updated_at();

ALTER TABLE supplementary_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage supplementary_attempts" ON supplementary_attempts;
CREATE POLICY "Admins manage supplementary_attempts"
  ON supplementary_attempts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Teachers read supplementary_attempts for own classes" ON supplementary_attempts;
CREATE POLICY "Teachers read supplementary_attempts for own classes"
  ON supplementary_attempts FOR SELECT
  USING (class_id IN (SELECT public.get_my_class_ids()));

DROP POLICY IF EXISTS "Teachers write supplementary_attempts for own classes" ON supplementary_attempts;
CREATE POLICY "Teachers write supplementary_attempts for own classes"
  ON supplementary_attempts FOR INSERT
  WITH CHECK (class_id IN (SELECT public.get_my_class_ids()));

DROP POLICY IF EXISTS "Teachers update supplementary_attempts for own classes" ON supplementary_attempts;
CREATE POLICY "Teachers update supplementary_attempts for own classes"
  ON supplementary_attempts FOR UPDATE
  USING (class_id IN (SELECT public.get_my_class_ids()));

DROP POLICY IF EXISTS "Teachers delete supplementary_attempts for own classes" ON supplementary_attempts;
CREATE POLICY "Teachers delete supplementary_attempts for own classes"
  ON supplementary_attempts FOR DELETE
  USING (class_id IN (SELECT public.get_my_class_ids()));

DROP POLICY IF EXISTS "Parents read supplementary_attempts for own children" ON supplementary_attempts;
CREATE POLICY "Parents read supplementary_attempts for own children"
  ON supplementary_attempts FOR SELECT
  USING (student_id IN (SELECT public.get_my_children_ids()));

-- ============================================
-- TEACHER ABSENCES + SUBSTITUTIONS (migration 031)
-- ============================================
-- Planning layer on top of timetable_periods. teacher_absences records who
-- is absent on which date (with optional half_day flag). substitutions
-- records the per-period substitute assignments (one row per affected
-- period once an admin assigns a substitute; absence of a row = unassigned).
-- Substitute-availability is computed by the API via time-range overlap on
-- timetable_periods.start_time/end_time, since classes can run staggered
-- schedules (period_number alone is not a reliable shared time key).

CREATE TABLE IF NOT EXISTS teacher_absences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  absence_date date NOT NULL,
  half_day text NOT NULL DEFAULT 'full'
    CHECK (half_day IN ('full', 'first_half', 'second_half')),
  reason text,
  marked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_absences_date
  ON teacher_absences(absence_date);

CREATE INDEX IF NOT EXISTS idx_teacher_absences_teacher
  ON teacher_absences(teacher_id);

CREATE TABLE IF NOT EXISTS substitutions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  absence_id uuid NOT NULL REFERENCES teacher_absences(id) ON DELETE CASCADE,
  timetable_period_id uuid NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  substitute_teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  note text,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (absence_id, timetable_period_id)
);

CREATE INDEX IF NOT EXISTS idx_substitutions_absence
  ON substitutions(absence_id);

CREATE INDEX IF NOT EXISTS idx_substitutions_substitute_teacher
  ON substitutions(substitute_teacher_id);

CREATE INDEX IF NOT EXISTS idx_substitutions_period
  ON substitutions(timetable_period_id);

CREATE OR REPLACE FUNCTION public.teacher_absences_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS teacher_absences_set_updated_at ON teacher_absences;
CREATE TRIGGER teacher_absences_set_updated_at
  BEFORE UPDATE ON teacher_absences
  FOR EACH ROW EXECUTE FUNCTION public.teacher_absences_touch_updated_at();

CREATE OR REPLACE FUNCTION public.substitutions_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS substitutions_set_updated_at ON substitutions;
CREATE TRIGGER substitutions_set_updated_at
  BEFORE UPDATE ON substitutions
  FOR EACH ROW EXECUTE FUNCTION public.substitutions_touch_updated_at();

ALTER TABLE teacher_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage teacher_absences" ON teacher_absences;
CREATE POLICY "Admins manage teacher_absences"
  ON teacher_absences FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

ALTER TABLE substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage substitutions" ON substitutions;
CREATE POLICY "Admins manage substitutions"
  ON substitutions FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 034 — exam_schedules timezone documentation
-- ═══════════════════════════════════════════════════════════════════════════
-- (Already applied inline above next to the exam_schedules table.)

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 035 — publish_events admin audit event types
-- ═══════════════════════════════════════════════════════════════════════════
-- (CHECK constraint above already includes the new values.)

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 036 — Clean integer thresholds on default scholastic grade bands
-- (mirrored from scripts/migration-036-grade-bands-clean-bounds.sql)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE grade_bands SET max_pct = 90.00
  WHERE label = 'A'  AND min_pct = 80.00 AND max_pct = 89.99;
UPDATE grade_bands SET max_pct = 80.00
  WHERE label = 'B+' AND min_pct = 70.00 AND max_pct = 79.99;
UPDATE grade_bands SET max_pct = 70.00
  WHERE label = 'B'  AND min_pct = 60.00 AND max_pct = 69.99;
UPDATE grade_bands SET max_pct = 60.00
  WHERE label = 'C'  AND min_pct = 50.00 AND max_pct = 59.99;
UPDATE grade_bands SET max_pct = 50.00
  WHERE label = 'D'  AND min_pct = 40.00 AND max_pct = 49.99;
UPDATE grade_bands SET max_pct = 40.00
  WHERE label = 'F'  AND min_pct =  0.00 AND max_pct = 39.99;
