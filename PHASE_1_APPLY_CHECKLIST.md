# PHASE_1_APPLY_CHECKLIST.md — applying the Document Library migration

> **Status:** Pre-apply checklist for review — **nothing applied yet.**
> **Migration file:** [supabase/07-document-library.sql](supabase/07-document-library.sql) (on `feature/mvp-migration`).
> **Scope:** this checklist covers **only the database migration** (the additive columns + link table). UI code is a separate later milestone.

This migration is **additive and reversible**. It touches **metadata only** — never the files in Storage, never any other table.

---

## 1. What will be backed up (before applying)

- **Read-only pre-check:** confirm the `documents` table matches the expected shape and that `tags` / `status` do **not** already exist.
- **Baseline counts (recorded before):**
  - total `documents` rows,
  - `documents` where `linked_to LIKE 'task:%'` (the expected number of links to be created).
- **Export of affected metadata:** a full dump of the `documents` rows (and the `tasks` id list used to validate links) saved to a local backup file on the branch.
- **Not needed:** no Storage/file backup — the files themselves are untouched by this migration. (Supabase's own automatic backups remain as an extra net.)

## 2. What will be changed (exactly)

- `documents`: **add** column `tags text[]` (default `{}`) and column `status text` (default `received`). Existing rows automatically get `tags = {}`, `status = received`.
- **Create** table `document_task_links` (`id, user_id, document_id, task_id, created_at`, unique on `document_id+task_id`) + 3 indexes + per-user RLS (select/insert/delete own).
- **Backfill** `document_task_links` from each document's existing `linked_to = 'task:<id>'`, only where that task actually exists.

**Explicitly NOT changed:** no column or table is dropped; `linked_to` / `linked_label` are kept; no other table; no Storage files; no application code (that's a later milestone).

## 3. How success is verified

1. `documents` now has `tags` and `status` columns; **total row count equals the baseline** (no rows lost or added).
2. Every existing document shows `status = received`.
3. `document_task_links` row count **equals** the pre-check "expected links" number — no orphans, no duplicates.
4. RLS check: querying as the signed-in user returns only that user's rows.
5. **Browser QA** (per [CLAUDE.md](CLAUDE.md) §1): open the app, load a real client's documents in the existing `DocumentManager` — they still appear exactly as before; **no console errors**. Screenshot before/after.

If any check fails, stop and roll back (§4) before proceeding.

## 4. How rollback works

Because the change is purely additive, rollback restores the exact prior shape (the SQL is in the migration file):

```sql
drop table if exists public.document_task_links;
alter table public.documents drop column if exists tags;
alter table public.documents drop column if exists status;
```

- `linked_to` was never modified, so the original links remain intact after rollback.
- Storage files were never touched — nothing to restore there.
- No app code changed in this step — nothing to revert on the frontend.
- If ever needed, the §1 metadata export can restore `documents` rows — though an additive migration should never require it.

## 5. Apply method (to be chosen at apply time)

One of: (a) test on a **Supabase branch** first, then live; (b) **direct** apply to the live project after §1; (c) **you run** the SQL yourself in the Supabase SQL editor. To be decided only after this checklist is approved.

---

## 6. Sandbox test result — PASSED (2026-06-16)

Branching needs Pro (project is Free), so the migration was validated in a throwaway `phase1_test` schema in the same project, seeded to mirror the live shape (5 docs, 4 task-links, 1 valid task, 2 tasks). The live `public` tables were never touched.

- Documents: 5 → **5** (none lost) · all `status = received`.
- Link table: **exactly 1** link created (the valid task); **idempotent** (re-ran backfill → still 1, no duplicates).
- `tags` + `status` added; `linked_to` **preserved** (`task:gone1` unchanged).
- Migration ran with **no errors**.
- Cleanup: sandbox dropped (0 remaining). Live `documents` confirmed **0 new columns, still 5 rows** — untouched.

**Conclusion:** the migration is safe and behaves exactly as specified. Ready to apply to live **on approval**.

> No migration is applied to the live database until this checklist is approved **and** you authorize the apply and its method.
