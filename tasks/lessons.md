# Lessons

## 2026-05-29 — Don't attribute unexpected working-tree changes to your own subagents

**What happened:** During a stress-test/fix task I found many changes in `git status`
that I hadn't made (migration-061 security hardening, a website nav/CTA redesign,
edits to `email.ts`/`supabase-schema.sql`). I assumed my own read-only audit
subagents had ignored their instructions and made them. The user pushed back, and
investigation showed the real cause: **multiple concurrent `claude` CLI sessions were
running in the same working directory.** A separate session authored that work.

**Why I was wrong:** My audit subagents had already returned read-only reports
(the auth agent explicitly said "No fixes were applied"). The real tells were
"file modified since read" errors mid-edit (a concurrent writer) and a `git status`
far larger than my own diff.

**How to apply next time — when unexpected changes appear in the tree:**
1. Before blaming subagents, run `ps aux | grep claude` to count concurrent sessions,
   and `stat`/`find -mmin` to see file mtimes vs. when your own edits happened.
2. Remember a git working tree has ONE shared HEAD and ONE shared set of files across
   all sessions in that directory. `git checkout -b` moves HEAD for *every* session.
   Uncommitted changes are not branch-isolated.
3. Running two agents in one working tree is a collision hazard — recommend separate
   `git worktree`s/clones. Surface the overlap; don't bulldoze or commit shared state.
4. Report faithfully: when you realize an earlier explanation was wrong, correct it
   plainly rather than quietly moving on.

---

## 2026-09-09 — A projection is a silent gate: unused arguments are a smell

**What happened:** The Ask assistant, asked to break 942 students down by
`has_transport`, answered "NO" for all 942 — while the same query's
`has_transport: "yes"` filter correctly matched 744. The user spotted the
contradiction in the assistant's own reply.

**Why:** `runStudentReport` projects only the columns declared by the fields it
is handed. `computeGroupCounts` was handed the *output* fields, then resolved a
*group-by* field against those rows. `resolve()` reads straight off the row, so
a missing column did not throw — it read `undefined` and fell out of the field's
else branch. Uniform, plausible, wrong.

**How to apply next time:**
1. **When code resolves a field, check the query projected that field.** In this
   codebase `source`/`columns` on a `ReportField` is what puts a column in the
   SELECT. Resolving anything not in the projected set is undefined behaviour
   that looks like data.
2. **An argument that is accepted and then `void`ed is a bug marker.**
   `computeGroupCounts(groupBy, rows, fields)` voided `fields` at the bottom.
   That was the missing wiring, sitting in plain sight, passing review.
3. **Fix the shape, not the symptom.** The function now resolves group keys only
   against the fields that were actually projected, so the failure is
   unreachable rather than merely corrected.
4. **A new read path needs the same permission gate as the old one.** Grouping by
   `father_mobile` enumerates parent numbers as effectively as a column of them
   would, so group keys go through `resolveAiFields` too.

## 2026-09-09 — "The last one" is not "the one the answer is about"

**What happened:** The assistant answered "198 students have not opted for
transport" above a table headed "744 students". Both numbers were right; the
pairing was not.

**Why:** The runner kept a single `lastRunId` and the UI showed it. But the model
routinely counts one side of a split and then the other to check its arithmetic,
so the final query is often not the one being reported on. And two report calls
in one round run under `Promise.all`, so "last" was decided by whichever promise
settled second — non-deterministic.

**How to apply next time:**
1. When an agent can act N times per turn, **the UI cannot assume the Nth action
   is the answer.** Return all of them, labelled, and let the user see which.
2. `Promise.all` preserves *array* order, not completion order. Collect from the
   resolved array, never by assigning inside the async callback.
3. The tool already required a `purpose` string for the audit log. Reusing it as
   the UI label cost nothing — **audit fields often make good user-facing
   provenance.**
4. Prompt guidance ("finish with the query your answer is about") is a nudge;
   labelling the table with what it actually is, is the guarantee. Prefer the
   guarantee, add the nudge.

---

## 2026-09-10 — Validate SQL with a parser before handing someone a script

**What happened:** I told the user to run `_verify-ai-feature-migrations.sql`.
It failed immediately: `ERROR: 42601: syntax error at or near "check"`. The
script's CTE column was named `check`, a fully reserved Postgres keyword.

**Why it survived review:** Postgres tolerates a reserved word as a column
*label* after an explicit `AS`, so `SELECT 'x' AS check` parses fine. It only
fails where the name is referenced bare — 140 lines later in the final SELECT.
The bug was invisible at the definition and only real at the use site. I had
also added seven new checks to this file without ever parsing it.

**How to apply next time:**
1. **`pglast` is the actual Postgres parser (libpg_query) as a Python package.**
   `pip install pglast`, then `parse_sql(open(f).read())`. No database, no
   connection string, no credentials. There is now no excuse for shipping a
   `.sql` file unparsed.
2. Sweep the whole repo, not just the file you touched — one loop over
   `scripts/**/*.sql` plus `supabase-schema.sql` took seconds and would have
   caught this the day it was written.
3. **A migration is code the user runs by hand.** They cannot iterate on it the
   way I can, and a syntax error costs them a round trip. Hold SQL to a higher
   bar than TypeScript, which at least has a typechecker in the loop.
4. Reserved words that read as ordinary nouns are the trap: `check`, `order`,
   `user`, `table`, `column`, `default`, `references`. If a column name is one
   of those, rename it — quoting it just moves the problem.
