-- _apply-ai-feature-migrations.sql
--
-- The AI assistant feature's three migrations, concatenated in apply order.
-- Generated from the individual files — do not edit this copy; edit the
-- originals under scripts/migrations/ and regenerate.
--
--   110  base/  school_profile              (school identity + AI settings)
--   111  erp/   export_events.source        (+ ai_run_id column)
--   112  erp/   ai audit tables             (+ the FK back to export_events)
--
-- Order matters: 112 adds a foreign key onto the ai_run_id column that 111
-- creates. Running 112 first fails.
--
-- Wrapped in a single transaction so a failure half-way leaves nothing behind.
-- Every statement is transaction-safe (no CREATE INDEX CONCURRENTLY).
--
-- All three are idempotent — IF NOT EXISTS on tables, indexes and constraints,
-- and the school_profile seed is guarded by WHERE NOT EXISTS — so re-running
-- this file is safe.
--
-- Paste into Supabase Studio's SQL editor, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/_apply-ai-feature-migrations.sql

BEGIN;

-- ==========================================================================
-- base/migration-110-school-profile.sql
-- ==========================================================================

-- migration-110-school-profile.sql
--
-- The school's own identity, moved out of TypeScript and into the database.
--
-- ── Numbering ───────────────────────────────────────────────────────────────
-- This feature owns a reserved block: 110 school_profile, 111 export_events
-- source, 112 ai_audit, and 113 is held for the WhatsApp tables.
--
-- The block exists because sequential numbering failed here. 098 landed on
-- main as cms/migration-098-restrict-staff-pii.sql, then 099, 100 and 101 were
-- each claimed by a parallel branch mid-session — twice onto a number this
-- work had already taken. Renumbering into a gap terminates that race; the
-- gap itself is harmless, since apply order is by number and nothing reads the
-- sequence as contiguous.
--
-- Still re-run the check before adding a file:
--   ls scripts/migrations/*/ | grep -oE 'migration-[0-9]+' | sort | uniq -d
--
-- Filed under base/ rather than erp/ because the public website and the CMS
-- read it too; a website-only deployment still needs the school's name.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- Today the school's name, address, phones, affiliation number, leadership
-- and geo coordinates are a hardcoded object in
-- packages/shared/src/lib/constants.ts, and the website assistant's system
-- prompt hardcodes the staff roster on top of that. Two consequences:
--
--   1. The assistant's answers drift from the database every time someone
--      joins or leaves, silently, because nothing links the two.
--   2. A second school means editing TypeScript and redeploying.
--
-- This table fixes both for the surfaces that read it. It is deliberately NOT
-- a multi-tenancy migration: there is no school_id on any other table, and
-- adding one across 77 tables and 260 policies is its own project. What this
-- does is stop new work hardcoding the school, so that project gets smaller
-- rather than larger.
--
-- ── Single row, by construction ─────────────────────────────────────────────
-- `singleton` is a fixed-value column with a unique constraint, so a second
-- row is a database error rather than a support ticket about which row won.
-- When real multi-tenancy arrives, drop the constraint and the column: every
-- reader already goes through getSchoolProfile(), so the shape is ready.
--
-- ── AI columns ──────────────────────────────────────────────────────────────
-- ai_tone and ai_languages steer generated text (report-card remarks, parent
-- replies) per school rather than per deployment. ai_enabled is an off switch
-- a school can hold: it disables every assistant surface without a redeploy,
-- which is what a nervous principal asks for in week one.

CREATE TABLE IF NOT EXISTS school_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one row. See the note above.
  singleton boolean NOT NULL DEFAULT true,

  -- Identity
  name text NOT NULL,
  short_name text,
  tagline text,
  description text,
  founded_year integer,
  motto text,

  -- Affiliation (CBSE and equivalents)
  board text,
  affiliation_number text,
  school_code text,
  udise_code text,

  -- Contact
  address_line1 text,
  city text,
  state text,
  pin_code text,
  phones text[] NOT NULL DEFAULT '{}',
  emails text[] NOT NULL DEFAULT '{}',
  website_url text,
  office_hours text,

  -- Geo, for transport and map surfaces. Nullable: a school that has not set
  -- a pin should read as "unknown", never as (0, 0) off the coast of Africa.
  latitude numeric(10, 7),
  longitude numeric(10, 7),

  -- Social
  social jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Assistant configuration
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_tone text NOT NULL DEFAULT 'warm',
  ai_languages text[] NOT NULL DEFAULT ARRAY['en'],
  ai_disclaimer text,

  -- WhatsApp Business (Meta Cloud API). Ids, not secrets — the access token
  -- stays in the environment, never in a table an admin screen can read.
  whatsapp_phone_number_id text,
  whatsapp_waba_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT school_profile_singleton_true CHECK (singleton = true),
  CONSTRAINT school_profile_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT school_profile_ai_tone_known CHECK (ai_tone IN ('warm', 'formal', 'neutral')),
  CONSTRAINT school_profile_languages_not_empty CHECK (cardinality(ai_languages) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS school_profile_one_row
  ON school_profile (singleton);

DROP TRIGGER IF EXISTS set_updated_at_school_profile ON school_profile;
CREATE TRIGGER set_updated_at_school_profile
  BEFORE UPDATE ON school_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Readable by everyone including anonymous visitors: the public website and
-- the visitor-facing assistant both render from this row, and every column
-- here is already published on the school's own website or its CBSE
-- disclosure page. Nothing private belongs in this table — note the WhatsApp
-- access token is deliberately absent.
--
-- Writes are admin-only.
ALTER TABLE school_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read school profile" ON school_profile;
CREATE POLICY "Anyone can read school profile"
  ON school_profile FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage school profile" ON school_profile;
CREATE POLICY "Admins manage school profile"
  ON school_profile FOR ALL
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ── Seed ────────────────────────────────────────────────────────────────────
-- Mirrors packages/shared/src/lib/constants.ts SCHOOL as of 2026-09-09, so
-- nothing visible changes when readers switch over. ai_enabled stays false:
-- the assistant surfaces are turned on deliberately, not by running a
-- migration.
INSERT INTO school_profile (
  name, short_name, tagline, description, founded_year,
  board, affiliation_number,
  address_line1, city, state, pin_code,
  phones, emails, office_hours,
  latitude, longitude,
  social, ai_enabled, ai_tone, ai_languages
)
SELECT
  'NK Public School',
  'NKPS',
  'Empowering Young Minds Since 1985',
  'NK Public School, affiliated to CBSE, is a premier educational institution in Jaipur offering holistic education from Nursery to Class XII.',
  1985,
  'CBSE',
  '1730406',
  'Grand Sikar Road, Rajawas',
  'Jaipur',
  'Rajasthan',
  '302013',
  ARRAY['+91-9785500046', '+91-9785500048'],
  ARRAY['nkps.rajawas@gmail.com', 'principalnkpsraj@gmail.com'],
  'Mon–Sat, 9:00 AM – 3:00 PM',
  27.0688458,
  75.7495752,
  jsonb_build_object(
    'facebook',  'https://www.facebook.com/nkpsrajawas',
    'instagram', 'https://www.instagram.com/nkps_rajawas',
    'youtube',   'https://www.youtube.com/channel/UCjXhDycJ_b8dJmfLlYbsM6w'
  ),
  false,
  'warm',
  ARRAY['en', 'hi']
WHERE NOT EXISTS (SELECT 1 FROM school_profile);

-- ==========================================================================
-- erp/migration-111-export-events-source.sql
-- ==========================================================================

-- migration-111-export-events-source.sql
--
-- Record whether an export was taken by a person or produced by the
-- assistant, without disturbing what `dataset` has always meant.
--
-- ── Numbering ───────────────────────────────────────────────────────────────
-- This feature owns a reserved block: 110 school_profile, 111 export_events
-- source, 112 ai_audit, and 113 is held for the WhatsApp tables.
--
-- The block exists because sequential numbering failed here. 098 landed on
-- main as cms/migration-098-restrict-staff-pii.sql, then 099, 100 and 101 were
-- each claimed by a parallel branch mid-session — twice onto a number this
-- work had already taken. Renumbering into a gap terminates that race; the
-- gap itself is harmless, since apply order is by number and nothing reads the
-- sequence as contiguous.
--
-- Still re-run the check before adding a file:
--   ls scripts/migrations/*/ | grep -oE 'migration-[0-9]+' | sort | uniq -d
--
--
-- ── Why a new column and not a new dataset value ────────────────────────────
-- The obvious move is to widen the `dataset` CHECK with an 'ai_query' value.
-- That would be wrong. `dataset` answers "which corpus left the school" —
-- students, staff, fees_dues, and so on — and every existing count, index and
-- future dashboard reads it that way. An AI-produced student sheet is still
-- the student corpus; only the route differs. Adding 'ai_query' would silently
-- reclassify those rows out of 'students' and make "how many student exports
-- happened this term" quietly wrong from the day the feature ships.
--
-- So `dataset` keeps its meaning and `source` carries the new axis. The
-- default is 'manual', which is exactly what every existing row is, so the
-- backfill is the default and no UPDATE is needed.
--
-- ── ai_run_id ───────────────────────────────────────────────────────────────
-- Points at the ai_query_runs row (added in migration 112) that produced
-- the sheet, so an auditor can go from "this CSV left the school" to the
-- question that was asked and the filters that actually ran. Nullable and
-- unconstrained for now: the FK is added alongside ai_query_runs so this
-- migration stays independently applicable.

ALTER TABLE export_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE export_events
  ADD COLUMN IF NOT EXISTS ai_run_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_events_source_known'
  ) THEN
    ALTER TABLE export_events
      ADD CONSTRAINT export_events_source_known
      CHECK (source IN ('manual', 'ai'));
  END IF;
END $$;

-- Auditors ask "what did the assistant hand out?" far more often than they
-- ask about any single actor, so this is the index that earns its keep.
CREATE INDEX IF NOT EXISTS idx_export_events_ai
  ON export_events (created_at DESC)
  WHERE source = 'ai';

COMMENT ON COLUMN export_events.source IS
  'How the export was produced: manual (a person used an export screen) or ai '
  '(the assistant produced the sheet). Distinct from dataset, which names the '
  'corpus and keeps its original meaning.';

COMMENT ON COLUMN export_events.ai_run_id IS
  'ai_query_runs.id that produced this export, when source = ''ai''. Lets an '
  'auditor trace a downloaded sheet back to the question and the scoped '
  'filters that produced it.';

-- ==========================================================================
-- erp/migration-112-ai-audit.sql
-- ==========================================================================

-- migration-112-ai-audit.sql
--
-- The audit trail for every assistant interaction.
--
-- ── Numbering ───────────────────────────────────────────────────────────────
-- This feature owns a reserved block: 110 school_profile, 111 export_events
-- source, 112 ai_audit, and 113 is held for the WhatsApp tables.
--
-- The block exists because sequential numbering failed here. 098 landed on
-- main as cms/migration-098-restrict-staff-pii.sql, then 099, 100 and 101 were
-- each claimed by a parallel branch mid-session — twice onto a number this
-- work had already taken. Renumbering into a gap terminates that race; the
-- gap itself is harmless, since apply order is by number and nothing reads the
-- sequence as contiguous.
--
-- Still re-run the check before adding a file:
--   ls scripts/migrations/*/ | grep -oE 'migration-[0-9]+' | sort | uniq -d
--
--
-- ── Why this is four tables and not one ─────────────────────────────────────
-- A single "ai_log" row per request cannot answer the question that actually
-- matters in an audit: *did the assistant ever read something the caller was
-- not entitled to?* Answering that needs the model's request and the server's
-- rewrite of it side by side, per tool call, which is a different grain from
-- the conversation and from the message.
--
-- ── The security signal ─────────────────────────────────────────────────────
-- ai_tool_calls stores BOTH args_raw (what the model asked for) and
-- args_scoped (what actually ran after the server injected the row scope).
-- The delta between them is the alarm: a model that tried to widen its own
-- scope shows up as a diff, and error_code = 'scope_violation' is countable.
-- Storing only the executed arguments would hide exactly the attempt worth
-- knowing about.
--
-- ── What is deliberately NOT stored ─────────────────────────────────────────
-- No row contents, ever. Counts, field KEYS and filter shapes only. An audit
-- table that copies the student data it is auditing doubles the blast radius
-- of the thing it exists to protect. Where the rows themselves matter, follow
-- ai_query_runs.id and re-run the query under a fresh authorization check.
--
-- ── RLS: enabled, zero policies, ON PURPOSE ─────────────────────────────────
-- These tables are service-role only. RLS is enabled with no policies so that
-- any client credential reads them as empty.
--
-- The explicit COMMENT on each table saying so is not decoration. An
-- unpolicied table under RLS returns an empty result rather than an error, so
-- the next person to read this schema cannot otherwise distinguish "locked
-- down deliberately" from "someone forgot the policy" — which is precisely
-- how bus_stops/bus_stop_fees came to silently understate transport fees.

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Where the request came in. whatsapp has no Supabase session, so user_id
  -- is null there and parent_id carries the identity.
  channel text NOT NULL CHECK (channel IN ('erp_web', 'portal_web', 'whatsapp')),
  feature text NOT NULL CHECK (feature IN ('ask', 'remarks', 'parent')),

  -- Actor. SET NULL so the trail outlives the account, matching export_events
  -- and historical_corrections.
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role text,
  parent_id uuid REFERENCES parents(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,

  -- The scope this conversation ran under, denormalised so an auditor can
  -- filter without joining every tool call. scope_hash is the fingerprint the
  -- export path re-checks before letting a download proceed.
  scope_kind text NOT NULL CHECK (scope_kind IN ('all', 'classes', 'students')),
  scope_hash text NOT NULL,

  model text NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'error', 'aborted')),
  error_code text,

  started_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_actor
  ON ai_conversations (actor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_channel
  ON ai_conversations (channel, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_parent
  ON ai_conversations (parent_id, started_at DESC) WHERE parent_id IS NOT NULL;

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  seq integer NOT NULL,

  role text NOT NULL CHECK (role IN ('user', 'assistant')),

  -- The human's own words are kept because support cannot debug "the
  -- assistant gave a wrong answer" without them. The assistant's data-bearing
  -- output is NOT kept here — follow ai_query_runs instead.
  content text,

  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  stop_reason text,
  latency_ms integer,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages (conversation_id, seq);

-- ── Tool calls ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_seq integer,

  tool_name text NOT NULL,

  -- The pair that makes this table worth having. See the header.
  args_raw jsonb,
  args_scoped jsonb,
  scope_applied jsonb,

  -- Shape of what came back, never the contents.
  row_count integer,
  preview_row_count integer,
  field_keys text[] NOT NULL DEFAULT '{}',
  sensitive_included boolean NOT NULL DEFAULT false,

  duration_ms integer,
  error_code text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_conversation
  ON ai_tool_calls (conversation_id, created_at);
-- The alert query: scope violations, newest first.
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_errors
  ON ai_tool_calls (created_at DESC) WHERE error_code IS NOT NULL;

-- ── Query runs ──────────────────────────────────────────────────────────────
-- The handle behind an answer. Holds the SCOPED filters, so re-running is
-- guaranteed to reproduce what the caller was entitled to and nothing wider.
--
-- Deliberately stores no rows: the on-screen table and the CSV re-execute
-- under a fresh authorization check rather than serving a cached result. That
-- costs a second query and means the export re-states its own total, but it
-- keeps a teacher who lost a class between preview and download from
-- exporting stale rows.
CREATE TABLE IF NOT EXISTS ai_query_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,

  filters jsonb NOT NULL,
  field_keys text[] NOT NULL DEFAULT '{}',
  total integer NOT NULL DEFAULT 0,
  capped boolean NOT NULL DEFAULT false,

  -- Re-derived on every read; a mismatch is a 403, not a stale download.
  scope_hash text NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  -- Checked lazily at read. There is no cron anywhere in this repo, so
  -- nothing here may depend on a sweeper existing.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  exported_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_query_runs_conversation
  ON ai_query_runs (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_runs_expiry
  ON ai_query_runs (expires_at);

-- Close the loop opened in migration 111: an exported sheet points back at the
-- question that produced it. Added here because the target table exists now.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_events_ai_run_id_fkey'
  ) THEN
    ALTER TABLE export_events
      ADD CONSTRAINT export_events_ai_run_id_fkey
      FOREIGN KEY (ai_run_id) REFERENCES ai_query_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_query_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ai_conversations IS
  'RLS enabled with NO policies, intentionally: service-role access only. Any '
  'client credential reads this as empty. Do not add a policy without deciding '
  'what a non-admin should be able to learn about other people''s questions.';
COMMENT ON TABLE ai_messages IS
  'RLS enabled with NO policies, intentionally: service-role access only.';
COMMENT ON TABLE ai_tool_calls IS
  'RLS enabled with NO policies, intentionally: service-role access only. '
  'args_raw vs args_scoped is the scope-widening signal; keep both.';
COMMENT ON TABLE ai_query_runs IS
  'RLS enabled with NO policies, intentionally: service-role access only. '
  'Stores scoped filters, never rows — readers re-execute under a fresh '
  'authorization check.';

COMMIT;
