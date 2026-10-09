-- migration-138-whatsapp-outbound.sql
--
-- Outbound WhatsApp from the office: bus notices to every family riding a bus,
-- and fee reminders to one family. SAFE TO RE-RUN.
--
-- Migration 113 built the channel for the inbound assistant and logged each
-- message in whatsapp_messages. An office-initiated send needs two things that
-- log cannot say: WHO pressed the button and WHICH action a message belonged
-- to. "Bus 9 ran late on Tuesday, 38 families were told" is one row here and
-- 38 rows there.
--
-- ── What is stored, and what is not ─────────────────────────────────────────
-- body_text is the text the office typed. It is school-authored and carries
-- no parent data, so it is kept in full — the office needs to see what was
-- said. Phone numbers stay OUT of both tables: whatsapp_messages keeps
-- phone_last4 only, exactly as before (call_logs precedent).

CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  kind text NOT NULL CHECK (kind IN ('bus_notice', 'fee_reminder')),

  -- Who pressed Send. SET NULL rather than RESTRICT: a staff member leaving
  -- must not make the history undeletable, and the audit_log row keeps the
  -- actor independently.
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role text,

  -- Exactly one of these is set, by kind. Not enforced with a CHECK so a
  -- future kind (a class notice, say) does not need a schema change.
  bus_id uuid REFERENCES buses(id) ON DELETE SET NULL,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE SET NULL,

  template_name text NOT NULL,
  body_text text,

  -- Families the action tried to reach, and how it went. skipped_count is
  -- students with no usable number — the figure the office should act on.
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'completed', 'failed')),

  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_bus
  ON whatsapp_broadcasts (bus_id, created_at DESC) WHERE bus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_student
  ON whatsapp_broadcasts (student_id, created_at DESC) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_actor
  ON whatsapp_broadcasts (actor_id, created_at DESC);

-- ── Tie each message to its action, its student and its sender ──────────────
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES whatsapp_broadcasts(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_broadcast
  ON whatsapp_messages (broadcast_id) WHERE broadcast_id IS NOT NULL;
-- Per-student history, and the "one fee reminder per family per day" rule
-- reads this index.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_student
  ON whatsapp_messages (student_id, created_at DESC) WHERE student_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Enabled with NO policies, intentionally: service-role only, like every
-- table migration 113 created. The office reads this through the API routes,
-- which gate on the transport / fees feature keys.
ALTER TABLE whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_broadcasts IS
  'RLS enabled with NO policies, intentionally: service-role only. One row per '
  'office-initiated WhatsApp action (bus notice, fee reminder); the messages '
  'it produced are whatsapp_messages rows with this broadcast_id.';
