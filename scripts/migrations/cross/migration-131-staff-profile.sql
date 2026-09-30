-- Migration 131 — full staff profile + the Admin / Additional Staff split.
--
-- The school sent its staff record format ("Staff Details in ERP 2026" and the
-- teacher-registration proforma): basic details, official info, contact, bank
-- and statutory numbers, driving licence, capacity-building trainings, and
-- notices issued by the management. This adds the storage for all of it.
--
-- ── Why a separate table, not more columns on staff_members ────────────────
-- staff_members is readable by every teacher login (migration 128). PAN, bank
-- account, Aadhaar, UAN/PF/ESI must not be. `staff_details` is 1:1 with
-- staff_members and readable only by admins and editors granted `staff`.
-- There are no write policies: every write goes through /api/staff/[id]/profile
-- on the service-role client after verifyAdminOrEditor('staff').
--
-- ── Data change ─────────────────────────────────────────────────────────────
-- "Additional Staff" now means Scout & Guide / NCC / coaches / PTI, and gets a
-- teacher login (lib/staff-roles.ts). Office assistants and front-desk staff
-- were filed there before and hold back-office "staff" logins; the school puts
-- them under Admin. Moving them keeps their category agreeing with the login
-- they already have. Matched on the designation text, explicit list only; a row
-- whose name already exists under 'admin' is left alone (UNIQUE(name, category)).
--
-- Filed under cross/, not cms/ or erp/: the table hangs off staff_members
-- (CMS) and references buses (ERP).
--
-- SAFE TO RE-RUN.

BEGIN;

-- ─── 1. Office staff: Additional Staff → Admin ──────────────────────────────

UPDATE public.staff_members sm
   SET category = 'admin', updated_at = now()
 WHERE sm.category = 'additionalStaff'
   AND lower(btrim(sm.subject)) IN (
     'office assistant', 'oa', 'front desk', 'front office', 'receptionist'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.staff_members o
      WHERE o.category = 'admin' AND o.name = sm.name
   );

-- ─── 2. staff_details (1:1) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_details (
  staff_member_id uuid PRIMARY KEY
    REFERENCES public.staff_members(id) ON DELETE CASCADE,

  -- Employee basic details
  employee_no           text,
  date_of_joining       date,
  gender                text CHECK (gender IN ('male', 'female', 'other')),
  father_name           text,
  mother_name           text,
  spouse_name           text,
  caste_category        text CHECK (caste_category IN
                          ('general', 'obc', 'sc', 'st', 'mbc', 'sbc', 'ews')),
  blood_group           text CHECK (blood_group IN
                          ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  aadhaar_number        text CHECK (aadhaar_number ~ '^[0-9]{12}$'),
  name_as_per_aadhaar   text,
  pan_number            text CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  marital_status        text CHECK (marital_status IN ('unmarried', 'married', 'divorcee')),
  marriage_date         date,
  relieving_date        date,
  relieving_reason      text,

  -- Official info
  designation                         text,
  department                          text,
  appointed_subject                   text,
  additional_subject                  text,
  emp_group                           text,
  reporting_authority                 text,
  employee_level                      text,
  employee_status                     text,
  probation_date                      date,
  confirmation_date                   date,
  notice_period                       text,
  highest_academic_qualification      text,
  highest_professional_qualification  text,
  tenth_board                         text,
  tenth_roll_no                       text,
  tenth_passing_year                  smallint CHECK (tenth_passing_year BETWEEN 1940 AND 2100),
  ctet_qualified                      boolean,
  ctet_roll_no                        text,
  ctet_pass_year                      smallint CHECK (ctet_pass_year BETWEEN 1940 AND 2100),
  rtet_qualified                      boolean,
  rtet_roll_no                        text,
  rtet_pass_year                      smallint CHECK (rtet_pass_year BETWEEN 1940 AND 2100),
  school_location                     text,
  voter_id                            text,
  passport_no                         text,
  passport_expiry                     date,
  punch_machine_id                    text,
  cbse_oasis_uid                      text,
  udise_national_code                 text,
  nic_id                              text,
  bus_id                              uuid REFERENCES public.buses(id) ON DELETE SET NULL,
  remarks                             text,

  -- Contact info (line 1, mobile and email stay on staff_members)
  alternate_mobile      text CHECK (alternate_mobile ~ '^[6-9][0-9]{9}$'),
  office_contact        text,
  address_line2         text,
  city                  text,
  state                 text,
  pincode               text CHECK (pincode ~ '^[0-9]{6}$'),
  permanent_address     text,
  permanent_pincode     text CHECK (permanent_pincode ~ '^[0-9]{6}$'),

  -- Bank, statutory & experience
  bank_account_no       text,
  ifsc_code             text CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name             text,
  bank_branch_address   text,
  name_as_per_bank      text,
  payment_mode          text CHECK (payment_mode IN ('bank_transfer', 'cheque', 'cash')),
  experience            text,
  experience_detail     text,
  uan_no                text,
  pf_no                 text,
  esi_no                text,
  apply_max_pf_limit    boolean NOT NULL DEFAULT false,

  -- Driving licence (the number itself stays on staff_members.license_number)
  license_issue_date    date,
  license_expiry_date   date,
  license_issue_place   text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_details IS
  'Full staff profile, 1:1 with staff_members. Holds PAN/bank/Aadhaar, so it is '
  'readable by admins and staff-feature editors only; writes go through '
  '/api/staff/[id]/profile. Field list: packages/shared/src/lib/staff-profile-fields.ts.';

-- Emp No. is the school's own number: unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS staff_details_employee_no_key
  ON public.staff_details (lower(btrim(employee_no)))
  WHERE employee_no IS NOT NULL AND btrim(employee_no) <> '';

CREATE INDEX IF NOT EXISTS staff_details_bus_id_idx
  ON public.staff_details (bus_id) WHERE bus_id IS NOT NULL;

-- ─── 3. Capacity-building programmes / trainings / workshops ───────────────

CREATE TABLE IF NOT EXISTS public.staff_trainings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id       uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  program_name          text NOT NULL,
  from_date             date,
  to_date               date,
  duration              text,
  organizing_institute  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_trainings_dates_ordered
    CHECK (from_date IS NULL OR to_date IS NULL OR to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS staff_trainings_staff_member_idx
  ON public.staff_trainings (staff_member_id, from_date);

-- ─── 4. Notices issued to a staff member, with their clarification ─────────

CREATE TABLE IF NOT EXISTS public.staff_notices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  issued_by        text NOT NULL CHECK (issued_by IN ('management', 'principal', 'vice_principal')),
  issue_date       date NOT NULL,
  reason           text NOT NULL,
  clarification    text,
  recorded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_notices_staff_member_idx
  ON public.staff_notices (staff_member_id, issue_date DESC);

-- ─── 5. updated_at triggers ─────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_staff_details_updated_at ON public.staff_details;
CREATE TRIGGER trg_staff_details_updated_at
  BEFORE UPDATE ON public.staff_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_trainings_updated_at ON public.staff_trainings;
CREATE TRIGGER trg_staff_trainings_updated_at
  BEFORE UPDATE ON public.staff_trainings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_notices_updated_at ON public.staff_notices;
CREATE TRIGGER trg_staff_notices_updated_at
  BEFORE UPDATE ON public.staff_notices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. RLS: read for admins + staff-feature editors, no client writes ─────

ALTER TABLE public.staff_details   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notices   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_details_select_staff_feature" ON public.staff_details;
CREATE POLICY "staff_details_select_staff_feature"
  ON public.staff_details FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'admin'
    OR (SELECT public.has_editor_feature('staff'))
  );

DROP POLICY IF EXISTS "staff_trainings_select_staff_feature" ON public.staff_trainings;
CREATE POLICY "staff_trainings_select_staff_feature"
  ON public.staff_trainings FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'admin'
    OR (SELECT public.has_editor_feature('staff'))
  );

DROP POLICY IF EXISTS "staff_notices_select_staff_feature" ON public.staff_notices;
CREATE POLICY "staff_notices_select_staff_feature"
  ON public.staff_notices FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'admin'
    OR (SELECT public.has_editor_feature('staff'))
  );

REVOKE ALL ON public.staff_details, public.staff_trainings, public.staff_notices FROM anon;

COMMIT;
