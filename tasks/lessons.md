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
