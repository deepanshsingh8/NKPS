-- Migration 049: School-specific feature requirements
-- Adds:
--   §4 stream_subjects.requirement_type ('compulsory' | 'elective')
--   §5 student_subjects.elective_slot (smallint, NULL for non-electives)
--      elective_slot_options (admin-editable allowed subjects per slot)
--   §6 Mathematics — Standard / Advanced subjects (seeded if missing)
--   §7 Backfill any 'Arts' stream rows to 'Humanities' (label-only rename)
--   §8 subjects.category ('languages' | 'academic' | 'co_curricular')
--   §9 subjects.nickname (short label for compact UI)
--   §2 §3 timetable_templates + timetable_template_periods
--      (presets for 8/6/5/4-period days with configurable lunch position)

begin;

-- ─────────────────────────────────────────────────────────────────
-- §8 §9 Subject category + nickname
-- ─────────────────────────────────────────────────────────────────
alter table subjects
  add column if not exists nickname text;

alter table subjects
  add column if not exists category text
    check (category in ('languages', 'academic', 'co_curricular'));

create index if not exists idx_subjects_category on subjects(category);

-- ─────────────────────────────────────────────────────────────────
-- §4 stream_subjects requirement type (compulsory vs elective per stream)
-- Old `is_mandatory` boolean is preserved for backward compatibility;
-- requirement_type is the new authoritative field.
-- ─────────────────────────────────────────────────────────────────
alter table stream_subjects
  add column if not exists requirement_type text
    check (requirement_type in ('compulsory', 'elective'));

-- Backfill from is_mandatory: true => compulsory, false => elective
update stream_subjects
   set requirement_type = case when is_mandatory then 'compulsory' else 'elective' end
 where requirement_type is null;

-- ─────────────────────────────────────────────────────────────────
-- §5 Elective slots on student_subjects (Class 11/12)
-- Slot 5 = "Elective 5", Slot 6 = "Elective 6". NULL = compulsory subject.
-- ─────────────────────────────────────────────────────────────────
alter table student_subjects
  add column if not exists elective_slot smallint
    check (elective_slot is null or elective_slot between 1 and 9);

create index if not exists idx_student_subjects_elective_slot
  on student_subjects(student_id, elective_slot)
  where elective_slot is not null;

-- A student may only fill each elective slot once.
create unique index if not exists uniq_student_elective_slot
  on student_subjects(student_id, elective_slot)
  where elective_slot is not null;

-- Per-slot allowed subject list (admin-editable so new options can be added later).
create table if not exists elective_slot_options (
  id uuid default gen_random_uuid() primary key,
  slot smallint not null check (slot between 1 and 9),
  subject_id uuid references subjects(id) on delete cascade not null,
  label text,                       -- e.g. "Elective 5"
  applies_to_classes text[] default array['XI','XII']::text[],
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(slot, subject_id)
);

create index if not exists idx_elective_slot_options_slot on elective_slot_options(slot);

alter table elective_slot_options enable row level security;

create policy "Public can read elective_slot_options"
  on elective_slot_options for select using (true);

create policy "Admins manage elective_slot_options"
  on elective_slot_options for all
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────
-- §7 Arts → Humanities backfill (in case any historical row slipped through)
-- ─────────────────────────────────────────────────────────────────
update streams
   set name = 'Humanities', code = coalesce(code, 'HUM')
 where lower(name) = 'arts';

-- ─────────────────────────────────────────────────────────────────
-- §6 Seed Mathematics — Standard / Advanced
-- Existing plain "Mathematics" rows are NOT auto-migrated; admin must reassign.
-- ─────────────────────────────────────────────────────────────────
insert into subjects (name, code, nickname, category, is_elective, is_active)
values
  ('Mathematics — Standard', '241', 'Math (Std)', 'academic', false, true),
  ('Mathematics — Advanced', '041', 'Math (Adv)', 'academic', false, true)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────
-- §2 §3 Timetable templates
-- Presets describe the SHAPE of a school day: ordered slots with
-- start_time/end_time, kind ('teaching' | 'lunch' | 'break'), and
-- whether they're a fixed non-teaching slot the auto-generator must skip.
-- ─────────────────────────────────────────────────────────────────
create table if not exists timetable_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,                 -- "A.1 Regular", "A.2 Special day", etc.
  code text unique,                          -- "A1", "A2", "A3", "A4"
  description text,
  teaching_period_count integer not null check (teaching_period_count > 0),
  is_active boolean default true,
  is_system boolean default false,           -- true for the four built-ins; can be cloned but not deleted
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists timetable_template_periods (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references timetable_templates(id) on delete cascade not null,
  position integer not null,                 -- ordering within the day (1..N including breaks)
  kind text not null check (kind in ('teaching', 'lunch', 'break')),
  label text,                                -- "Period 1", "Lunch", "Short break"
  start_time time not null,
  end_time time not null,
  unique(template_id, position),
  check (end_time > start_time)
);

create index if not exists idx_template_periods_template
  on timetable_template_periods(template_id, position);

alter table timetable_templates enable row level security;
alter table timetable_template_periods enable row level security;

create policy "Public can read timetable_templates"
  on timetable_templates for select using (true);
create policy "Admins manage timetable_templates"
  on timetable_templates for all
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

create policy "Public can read timetable_template_periods"
  on timetable_template_periods for select using (true);
create policy "Admins manage timetable_template_periods"
  on timetable_template_periods for all
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- updated_at trigger (uses helper from migration 045)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists trg_timetable_templates_updated_at on timetable_templates;
    create trigger trg_timetable_templates_updated_at
      before update on timetable_templates
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- §2 Seed the four built-in templates with 20-minute lunch
-- Times are conventional — admin can clone+edit.
-- A.1 Regular: 8 teaching periods + lunch after period 4
-- A.2 Special day: 6 teaching periods + lunch after period 3
-- A.3 Online (main school): 5 teaching periods + lunch after period 3
-- A.4 Online (pre-primary): 4 teaching periods + lunch after period 2
-- ─────────────────────────────────────────────────────────────────
do $$
declare
  v_template_id uuid;
begin
  -- A.1 Regular — 8 periods
  if not exists (select 1 from timetable_templates where code = 'A1') then
    insert into timetable_templates (name, code, description, teaching_period_count, is_system)
    values ('A.1 Regular', 'A1', 'Standard school day — 8 teaching periods with a 20-minute lunch break.', 8, true)
    returning id into v_template_id;

    insert into timetable_template_periods (template_id, position, kind, label, start_time, end_time) values
      (v_template_id, 1, 'teaching', 'Period 1', '08:00', '08:40'),
      (v_template_id, 2, 'teaching', 'Period 2', '08:40', '09:20'),
      (v_template_id, 3, 'teaching', 'Period 3', '09:20', '10:00'),
      (v_template_id, 4, 'teaching', 'Period 4', '10:00', '10:40'),
      (v_template_id, 5, 'lunch',    'Lunch',    '10:40', '11:00'),
      (v_template_id, 6, 'teaching', 'Period 5', '11:00', '11:40'),
      (v_template_id, 7, 'teaching', 'Period 6', '11:40', '12:20'),
      (v_template_id, 8, 'teaching', 'Period 7', '12:20', '13:00'),
      (v_template_id, 9, 'teaching', 'Period 8', '13:00', '13:40');
  end if;

  -- A.2 Special day — 6 periods
  if not exists (select 1 from timetable_templates where code = 'A2') then
    insert into timetable_templates (name, code, description, teaching_period_count, is_system)
    values ('A.2 Special day', 'A2', 'Half/event day — 6 teaching periods with a 20-minute lunch break.', 6, true)
    returning id into v_template_id;

    insert into timetable_template_periods (template_id, position, kind, label, start_time, end_time) values
      (v_template_id, 1, 'teaching', 'Period 1', '08:00', '08:40'),
      (v_template_id, 2, 'teaching', 'Period 2', '08:40', '09:20'),
      (v_template_id, 3, 'teaching', 'Period 3', '09:20', '10:00'),
      (v_template_id, 4, 'lunch',    'Lunch',    '10:00', '10:20'),
      (v_template_id, 5, 'teaching', 'Period 4', '10:20', '11:00'),
      (v_template_id, 6, 'teaching', 'Period 5', '11:00', '11:40'),
      (v_template_id, 7, 'teaching', 'Period 6', '11:40', '12:20');
  end if;

  -- A.3 Online — main school (I to XII), 5 periods
  if not exists (select 1 from timetable_templates where code = 'A3') then
    insert into timetable_templates (name, code, description, teaching_period_count, is_system)
    values ('A.3 Online — main school', 'A3', 'Online classes I–XII: 5 teaching periods with a 20-minute lunch break.', 5, true)
    returning id into v_template_id;

    insert into timetable_template_periods (template_id, position, kind, label, start_time, end_time) values
      (v_template_id, 1, 'teaching', 'Period 1', '09:00', '09:40'),
      (v_template_id, 2, 'teaching', 'Period 2', '09:40', '10:20'),
      (v_template_id, 3, 'teaching', 'Period 3', '10:20', '11:00'),
      (v_template_id, 4, 'lunch',    'Lunch',    '11:00', '11:20'),
      (v_template_id, 5, 'teaching', 'Period 4', '11:20', '12:00'),
      (v_template_id, 6, 'teaching', 'Period 5', '12:00', '12:40');
  end if;

  -- A.4 Online — pre-primary, 4 periods
  if not exists (select 1 from timetable_templates where code = 'A4') then
    insert into timetable_templates (name, code, description, teaching_period_count, is_system)
    values ('A.4 Online — pre-primary', 'A4', 'Online pre-primary: 4 teaching periods with a 20-minute lunch break.', 4, true)
    returning id into v_template_id;

    insert into timetable_template_periods (template_id, position, kind, label, start_time, end_time) values
      (v_template_id, 1, 'teaching', 'Period 1', '09:30', '10:00'),
      (v_template_id, 2, 'teaching', 'Period 2', '10:00', '10:30'),
      (v_template_id, 3, 'lunch',    'Lunch',    '10:30', '10:50'),
      (v_template_id, 4, 'teaching', 'Period 3', '10:50', '11:20'),
      (v_template_id, 5, 'teaching', 'Period 4', '11:20', '11:50');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- §5 Seed default elective slot options
-- Slot 5: Informatics Practices, Physical Education
-- Slot 6: Hindustani Music (Vocal), Painting
-- Subjects are created on the fly if missing so the seed is idempotent.
-- ─────────────────────────────────────────────────────────────────
do $$
declare
  v_subject_id uuid;
  rec record;
begin
  for rec in
    select * from (values
      ('Informatics Practices',     '065', 'IP',          'academic',     5, 1),
      ('Physical Education',        '048', 'PE',          'co_curricular',5, 2),
      ('Hindustani Music (Vocal)',  '034', 'Hind. Music', 'co_curricular',6, 1),
      ('Painting',                  '049', 'Painting',    'co_curricular',6, 2)
    ) as t(subj_name, subj_code, subj_nick, subj_cat, slot, sort)
  loop
    -- Ensure subject exists
    select id into v_subject_id
      from subjects
     where lower(name) = lower(rec.subj_name)
     limit 1;

    if v_subject_id is null then
      insert into subjects (name, code, nickname, category, is_elective, is_active)
      values (rec.subj_name, rec.subj_code, rec.subj_nick, rec.subj_cat, true, true)
      returning id into v_subject_id;
    end if;

    -- Ensure slot option exists
    insert into elective_slot_options (slot, subject_id, label, sort_order)
    values (rec.slot, v_subject_id, 'Elective ' || rec.slot, rec.sort)
    on conflict (slot, subject_id) do nothing;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- Backfill subject categories where obvious (best-effort; admin can edit)
-- ─────────────────────────────────────────────────────────────────
update subjects set category = 'languages'
 where category is null
   and lower(name) ~ '(english|hindi|sanskrit|french|german|spanish|urdu|punjabi)';

update subjects set category = 'co_curricular'
 where category is null
   and lower(name) ~ '(physical education|art|painting|music|dance|drama|sports|gk|general knowledge|moral|library|computer activity)';

-- Everything else defaults to 'academic' (still admin-editable).
update subjects set category = 'academic'
 where category is null;

commit;
