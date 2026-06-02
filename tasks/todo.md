# Identity & Cross-Role Interlinking — Robust Rebuild

**Goal:** Make the connective tissue between the 4 roles (admin / teacher / student / parent)
correct, single-sourced, and observable. Root cause of the "parent↔ward didn't work"
incident: a profile can be `role='parent'` with `parent_id = NULL`, linking is done 5
different ways, there's no 1:1 guarantee, and nothing surfaces the broken state.

**Decisions (locked):** Strict DB constraints · Full sweep (all phases) · `class_subjects`
is the canonical teacher↔subject authority · timetable derived/validated against it.

**Conventions:** next global migration number = **068**. Every new migration is also
appended to `supabase-schema.sql` in the same turn (schema-mirror rule). Never relax the
migration-061 profile privilege guard — the linking service uses the service-role client.

---

## Phase 0 — Integrity foundation  (`cross/migration-068-identity-integrity.sql`) ✅
- [x] 0.1 `profile_link_health` view — orphaned profiles, parents linked to nothing, active
      students w/o guardian account, duplicate claims, role↔link mismatch, unclaimed students.
- [x] 0.2 Pre-constraint duplicate guard (raises itemised error pointing at the view; no deletes).
- [x] 0.3 `UNIQUE` partial indexes on `profiles.teacher_id / student_id / parent_id` — enforce 1:1.
- [x] 0.4 Trigger `enforce_profile_role_link` — teacher⇒teacher_id, parent⇒parent_id, student may
      be unclaimed, non-null link must match role; only fires on role/link change (safe on live).
- [x] 0.5 `student_parents.relationship` made authoritative; `parents.relationship` deprecated.
- [x] 0.6 Mirrored into `supabase-schema.sql` (indexes + trigger inline; view + comment at tail).

## Phase 1 — One canonical linking service  (`apps/erp/src/lib/identity/link.ts`) ✅
- [x] 1.1 `link.ts`: `linkProfileToTeacher/Student/Parent`, `ensureParentRecord`,
      `linkParentToStudentRecord`, `linkParentAccountToStudent` — idempotent, sets role+link
      in ONE update, maps 23505 → clean 409. (service-role)
- [~] 1.2 No separate RPC — TS orchestration writes the profile link (trigger-validated) first,
      junction second; a half-done state is a valid childless parent, recoverable via Add Child.
      Simpler + fewer moving parts; revisit if true atomicity is needed.
- [x] 1.3 Refactored: `registrations/approve` (now sets role + has a teacher branch),
      `students/link-self`, `students/link-account`, `parents/link-child`, `portal/bulk-create`,
      `api/users` POST+PATCH, and **`createPortalUser` now sets `role`** (the core systemic bug).
- [~] 1.4 link-child self-heal consolidated onto the service (defensive, not a divergent copy)
      rather than deleted — guards pre-068 accounts during transition; harmless once clean.
- [x] 1.5 ERP typecheck green.

## Phase 2 — Admin reconciliation surface  (`/people/users`) ✅
- [x] 2.1 `GET /api/admin/link-health` (+ `POST` orphan-parent repair) reading the Phase-0 view.
- [x] 2.2 `LinkHealthPanel` mounted on /people/users — grouped errors/info, one-click Fix for
      orphaned parents, refreshes the user list on change.
- [x] 2.3 `POST /api/parents/invite` — admin creates a guardian account AND the student_parents
      link in one shot (guaranteed link at creation). [UI button on /people/students = follow-up]

## Phase 3 — Teacher-scope unification ✅
- [x] 3.1 Added `getTeacherClassIds` / `getTeacherStudentIds` to teacher-scope (union model).
- [x] 3.2 Verified attendance/results/class-tests/non-scholastic/remarks already guard server-side
      (agent over-claimed). Added the missing explicit guard to `ptm-notes` POST (RLS already
      covered it; now a clean 403 + consistency).
- [~] 3.3 Scope definition unified in helpers. Aligning the non-scholastic/PTM *UI* class lists to
      the union (so a pure class-teacher sees them) left as a small follow-up — cosmetic, not a
      correctness/security gap.
- [x] 3.4 `class_subjects` canonical; `timetable_assignment_drift` view (`erp/migration-069`)
      surfaces timetable periods whose teacher disagrees. Mirrored into schema.

## Phase 4 — Verification + RLS parity
- [~] 4.1 No test runner exists in the repo (no vitest/jest, no `test` script). A code suite would
      mean standing up a framework — separate decision. Documented the cross-role guarantee matrix
      + manual checklist in Review instead of fabricating tests with no runner.
- [x] 4.2 App-layer guards and RLS verified to agree: parent/student reads gated by
      `canViewReportCard` + RLS (`get_my_children_ids`/`get_my_student_id`); teacher writes gated
      in-app AND by RLS (`get_my_class_ids`); identity writes gated by migration-061 guard +
      migration-068 trigger.
- [x] 4.3 ERP typecheck clean; lint 0 errors (112 pre-existing effect warnings); `turbo build`
      3/3 apps successful.

---

## Review

**Root cause (verified in code, not inferred):** migration-061 hardened `handle_new_user`
to hardcode `role='student'` and ignore client metadata — but `createPortalUser`, the
`registrations/approve` route, and `/api/users` all relied on `user_metadata.role` being
honored. They set `teacher_id`/`parent_id` but **never set `role`**. So every teacher and
parent created after 061 was silently stuck at `role='student'` (students worked only by
accident). The middleware then routed parents to the student dashboard — the "embarrassing"
failure. Approve also had **no teacher branch at all**.

**Fix shape:**
- **Phase 0 (migration 068, cross):** `UNIQUE` partial indexes (1:1 auth↔record), the
  `enforce_profile_role_link` trigger (teacher⇒teacher_id, parent⇒parent_id, links must match
  role; only fires on role/link change so it's safe on live data), `student_parents.relationship`
  made the single source, and the `profile_link_health` observability view.
- **Phase 1 (`lib/identity/link.ts`):** one service that always sets role+link in a single
  update, enforces 1:1, idempotent. Adopted by approve (now with a teacher branch), link-self,
  link-account, link-child, bulk-create, `/api/users` (POST+PATCH), and `createPortalUser`.
- **Phase 2:** `LinkHealthPanel` on /people/users + `GET/POST /api/admin/link-health` (one-click
  fix aligns role to an existing link — repairs the legacy stranded accounts — or provisions a
  missing parent record); `POST /api/parents/invite` guarantees the link at creation.
- **Phase 3:** explicit teacher-scope guard added to `ptm-notes` POST (others already guarded);
  `class_subjects` confirmed canonical; `timetable_assignment_drift` view (migration 069).

**Cross-role guarantee matrix (app-layer ∧ RLS):**
- Parent → only own wards' published results/attendance/fees (`canViewReportCard` + RLS).
- Student → only self.
- Teacher → only own classes (in-app guards on every write + RLS `get_my_class_ids`).
- 1:1 account↔record enforced; role↔link enforced; both surfaced + repairable when violated.

**RUNBOOK for the user (apply in Supabase Studio, in order):**
1. Run `scripts/migrations/cross/migration-068-identity-integrity.sql`.
   - If it raises "duplicate claim(s) exist", run
     `SELECT * FROM profile_link_health WHERE category LIKE 'duplicate%';`, unlink the wrong
     account, then re-run (idempotent).
2. Run `scripts/migrations/erp/migration-069-timetable-classsubject-drift.sql`.
3. Open ERP → /people/users. The **Account link health** panel lists every stranded account
   (most will be `role_link_mismatch` — parents/teachers left as student). Click **Fix** on each
   to align the role (one click). Then for parents with no child, use **Link record**.
4. Going forward, all new accounts are linked correctly automatically.

**Manual verification checklist (no automated runner in repo):**
- [ ] Approve a parent registration with a valid admission_no → parent lands on /parent with the child.
- [ ] Approve a parent with no/bad admission_no → lands on /parent, can "Add Child".
- [ ] Approve a teacher → lands on /teacher with classes.
- [ ] Bulk-create staff → each can access /teacher.
- [ ] /people/users → Fix a legacy stranded account → it moves to the right role/tab.
- [ ] Try to set two accounts to the same student record → blocked (409).

**Follow-ups:**
- [x] "Invite guardian" wired on /people/students — row action (UserPlus) + detail-dialog button
      open an invite dialog → `POST /api/parents/invite` (creates parent login + link in one shot).
- [x] Non-scholastic + PTM **UI** class lists now use the union (subject-teacher ∪ class-teacher),
      matching server/RLS scope so a pure class teacher is no longer locked out.
- Optional: a test framework (vitest) to encode the guarantee matrix above. (still open)
