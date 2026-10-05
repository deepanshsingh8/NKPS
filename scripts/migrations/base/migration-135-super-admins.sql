-- Migration 135 — super admins.
--
-- Fee refunds are money leaving the school. Until now every `admin` login
-- could refund a payment directly and approve any editor-filed refund request
-- (migration 056). The school wants a smaller circle: a refund is *requested*
-- by whoever handles the desk and *approved* by one of a named few. This adds
-- the flag that names them.
--
-- ── profiles.is_super_admin ────────────────────────────────────────────────
-- A super admin is an admin with one extra right: approving refunds directly
-- or by approving a refund request (apps/erp/src/app/api/fees/**). It grants
-- nothing else; every other admin screen behaves as before.
--
-- ── Who may set it ─────────────────────────────────────────────────────────
-- Only the service role, i.e. /api/users PATCH after its own checks (a super
-- admin, or any admin while no super admin exists yet — the bootstrap). The
-- column is added to guard_profile_privileged_cols() as service-role-only:
-- unlike role/is_active, a browser admin session may NOT flip it, otherwise
-- any admin could promote themselves through the anon client. The
-- column-level GRANT from migration 061 (full_name, phone, avatar_url only)
-- already keeps `authenticated` away from it; the trigger is the second lock.
--
-- ── Invariant ──────────────────────────────────────────────────────────────
-- Only an admin can be a super admin. A trigger clears the flag the moment a
-- row's role leaves 'admin' (demotion through /api/users), and a CHECK
-- guarantees the pair never disagree whatever path wrote the row.
--
-- Safe to re-run. Filed under base/: profiles is shared by every tier.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_super_admin IS
  'Admin who may refund fee payments directly and approve refund requests '
  '(migration 135). Set only through /api/users; cleared when role leaves admin.';

-- Clear the flag when the role moves away from admin. BEFORE the guard and
-- link triggers in alphabetical firing order does not matter here: the row
-- is normalised whichever order fires, and the CHECK below is the backstop.
CREATE OR REPLACE FUNCTION public.sync_profile_super_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'admin' THEN
    NEW.is_super_admin := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_profile_super_admin ON public.profiles;
CREATE TRIGGER sync_profile_super_admin
  BEFORE INSERT OR UPDATE OF role, is_super_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_super_admin();

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_super_admin_is_admin;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_super_admin_is_admin
  CHECK (NOT is_super_admin OR role = 'admin');

-- Lock the column. Same function as migration 061, plus the new clause:
-- is_super_admin may change only on the service role — admins included in
-- the refusal, which is the point.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Not even an admin session may grant or revoke super admin from a client.
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin may only be changed through the server';
  END IF;

  IF public.get_user_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  -- A regular authenticated user (parent/student/teacher/staff editing their
  -- own row) must not touch role/access columns.
  IF NEW.role                  IS DISTINCT FROM OLD.role
     OR NEW.is_active             IS DISTINCT FROM OLD.is_active
     OR NEW.must_change_password  IS DISTINCT FROM OLD.must_change_password
     OR NEW.teacher_id            IS DISTINCT FROM OLD.teacher_id
     OR NEW.student_id            IS DISTINCT FROM OLD.student_id
     OR NEW.parent_id             IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile columns';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger itself already exists (migration 061); CREATE OR REPLACE on the
-- function is enough. Recreate defensively for a DB that never had it.
DROP TRIGGER IF EXISTS guard_profile_privileged_cols ON public.profiles;
CREATE TRIGGER guard_profile_privileged_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_cols();

-- Who the super admins are is not a secret to the people who can see the
-- users list, and the fees screens need to know whether the signed-in admin
-- is one. SELECT on profiles is table-wide already; nothing to grant.
