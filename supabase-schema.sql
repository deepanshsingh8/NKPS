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
  file_url text NOT NULL,
  academic_year text NOT NULL,
  upload_date date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

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
  category text NOT NULL CHECK (category IN ('management', 'admin', 'pgt', 'tgt', 'prt', 'motherTeachers', 'additionalStaff', 'busDriver', 'peon')),
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

-- 2k. Student Parents (many-to-many)
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
  marked_by uuid REFERENCES profiles(id) NOT NULL,
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
  UNIQUE(name, academic_year_id)
);

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
  entered_by uuid REFERENCES profiles(id) NOT NULL,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_id, exam_type_id)
);

-- 2p. Fee Structures
CREATE TABLE fee_structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  academic_year_id uuid REFERENCES academic_years(id) NOT NULL,
  class_name text NOT NULL,
  class_level text NOT NULL DEFAULT 'all'
    CHECK (class_level IN ('all', 'nursery_ukg', 'i_v', 'vi_viii', 'ix_x', 'xi_xii')),
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
  recorded_by uuid REFERENCES profiles(id),
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
  created_by uuid REFERENCES profiles(id) NOT NULL,
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
  reviewed_by uuid REFERENCES profiles(id),
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
