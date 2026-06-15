# PHASE_1_BUILD_SPEC.md — Document Library

> **Status:** Implementation-ready spec for review — **no code written yet.**
> **Branch:** `feature/mvp-migration` (master untouched).
> **Companion docs:** [MIGRATION_PLAN.md](MIGRATION_PLAN.md) · [MVP_DATA_MODEL.md](MVP_DATA_MODEL.md) · [PRODUCT_VISION.md](PRODUCT_VISION.md)

## Safety rules (apply to all of Phase 1)

- All work on `feature/mvp-migration`; **never** on `master`; nothing merged without explicit approval.
- **Additive & non-destructive:** no existing column/table/screen removed. `DocumentManager` keeps working throughout (parallel run).
- **Reuse, don't rebuild:** Phase 1 extends the existing `useDocumentStore` + `documents` table.
- **Small checkpoints:** a commit after each milestone; every change reversible.

---

## 1. Current state (the foundation we build on)

Already exists and works — confirmed in the repo:

- **`public.documents` table** ([supabase/01-schema.sql](supabase/01-schema.sql)): `id, user_id, client_id (FK→clients), storage_path, file_name, file_type, file_size, category, year (text: 'general'|'2024'…), description, notes, linked_to (text, e.g. "task:abc"), linked_label, uploaded_at`. Per-user RLS.
- **Document ownership is already client-first** — `client_id` FK. (The MVP ownership principle is satisfied today.)
- **Storage:** private bucket `client-documents`, path `{user_id}/{client_id}/{doc_id}`, per-user RLS.
- **Service:** [`useDocumentStore`](src/hooks/useDocumentStore.ts) — `saveDoc / getDocsByClient / getDoc / deleteDoc`; `DocCategory` enum + Hebrew labels.

**Gaps vs the MVP model:** no `tags`; no document `status` (requested/received/verified); only a *single* `linked_to` string (not many-to-many); no "where used" query.

---

## 2. Database / schema changes (additive only)

New migration file: `supabase/07-document-library.sql`.

```sql
-- 2.1 documents: add tags + status (existing rows default to received)
alter table public.documents add column if not exists tags   text[] not null default '{}';
alter table public.documents add column if not exists status  text   not null default 'received';
-- status ∈ 'received' | 'verified' | 'superseded'  ('requested' arrives in Phase 2 with DocumentRequest)

-- 2.2 many-to-many: document ↔ task (tasks already exist)
create table if not exists public.document_task_links (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  document_id  text not null references public.documents(id) on delete cascade,
  task_id      text not null references public.tasks(id)     on delete cascade,
  created_at   timestamptz not null default now(),
  unique (document_id, task_id)
);
create index if not exists dtl_user_idx on public.document_task_links(user_id);
create index if not exists dtl_doc_idx  on public.document_task_links(document_id);
create index if not exists dtl_task_idx on public.document_task_links(task_id);

alter table public.document_task_links enable row level security;
create policy "dtl_select_own" on public.document_task_links for select using (auth.uid() = user_id);
create policy "dtl_insert_own" on public.document_task_links for insert with check (auth.uid() = user_id);
create policy "dtl_delete_own" on public.document_task_links for delete using (auth.uid() = user_id);

-- 2.3 backfill links from the existing single linked_to string (idempotent, non-destructive)
insert into public.document_task_links (user_id, document_id, task_id)
select d.user_id, d.id, substring(d.linked_to from 6)
from public.documents d
where d.linked_to like 'task:%'
  and exists (select 1 from public.tasks t where t.id = substring(d.linked_to from 6))
on conflict (document_id, task_id) do nothing;
```

`linked_to` / `linked_label` are **kept** (not dropped) — backward compatible. The `document_engagement_links` table is **deferred to Phase 3** (engagements don't exist yet).

---

## 3. New entities & relationships

- **`documents.tags`** (text[]) and **`documents.status`** — additive columns.
- **`document_task_links`** — the first true many-to-many link; bidirectional ("docs for a task" / "tasks for a doc"). Same per-user RLS pattern as every existing table.
- Relationship unchanged: `documents.client_id` = ownership; links = usage.

---

## 4. Required screens

**`DocumentLibrary`** — a new component, mounted as a new per-client view **beside** the existing `DocumentManager` (behind a simple flag/new entry point; DocumentManager stays live).

- **Top:** client context + search box + filter row (category · year · status · tags).
- **List:** each document — icon, title, category, year, status pill, "used in N" count.
- **Detail panel ("where used"):** selected document's linked tasks (and engagements once Phase 3 lands), plus tags/category/year/status, and a "link to task" action.
- **Upload:** reuse the existing upload (adds category/year/tags).

(Matches the approved `document_library_mvp` wireframe.)

---

## 5. User flows

1. **Browse & filter** a client's library (search + category/year/status/tags). Client-side filtering over `getDocsByClient`.
2. **Upload** a document → `saveDoc` (now with tags/status). Appears immediately (existing `crm:docs-changed` event).
3. **"Where used"** — select a document → see its linked tasks.
4. **Link** an existing document to a task → row in `document_task_links` (reuse across contexts; no re-upload).
5. **Verify/supersede** — set a document's status (received → verified, or supersede an old version).

---

## 6. API / service architecture

The app has **no separate API server** — React hooks call Supabase directly (Postgres + Storage) with RLS. Phase 1 stays in that pattern:

- **Extend `useDocumentStore`:** `saveDoc` writes `tags` + `status`; `rowToStoredDoc` reads them; add `setStatus(docId, status)`.
- **New `useDocumentLinks` hook:** `getTasksForDoc(docId)`, `getDocsForTask(taskId)`, `linkDocToTask(docId, taskId)`, `unlinkDocFromTask(docId, taskId)` — all `supabase.from('document_task_links')`, RLS-scoped.
- **`StoredDoc` type** gains `tags: string[]` and `status: 'received'|'verified'|'superseded'`.
- No change to storage paths or buckets.

---

## 7. Migration steps (ordered)

1. **Pre-flight backup.** Export `documents` (+ `tasks`) rows and list the `client-documents` bucket. Recommended: apply/test on a **Supabase branch** first (the project supports branching) before the live project.
2. **Apply `07-document-library.sql`** (additive columns + link table + RLS + idempotent backfill). Verify: column added, link rows = count of valid `linked_to:task:*`.
3. **Frontend, behind a flag:** extend `useDocumentStore`, add `useDocumentLinks`, build `DocumentLibrary`, add its entry point. `DocumentManager` untouched.
4. **Checkpoint commit** after the migration, and again after the UI.
5. **Browser QA** (§9) on a real client.

---

## 8. Risks & rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| RLS misconfigured on the new link table | Copy the exact per-user policy pattern used by every table; test read/write as the real user | `drop table document_task_links` (new, additive) |
| Backfill creates wrong/duplicate links | Idempotent `on conflict do nothing`; existence check on `task_id`; verify counts | Truncate the link table and re-run |
| Migration hits the single live Supabase project | Back up first; test on a Supabase branch; migration is additive (no drops) | Drop the two new columns + table; data intact |
| New UI regresses document behavior | Built beside `DocumentManager`, flag-gated, parallel run | Hide the flag; old screen unaffected |
| Branch/commit mistakes | All on `feature/mvp-migration`; master never touched | `git checkout master` / discard branch |

**Net:** every Phase 1 change is additive and reversible; worst case is dropping two empty-ish columns and one new table, with `master` and all data intact.

---

## 9. Definition of done (browser QA per CLAUDE.md §1)

On a real client, in the browser: the library lists existing documents; filter + search work; upload adds a document with tags; selecting a document shows "where used"; linking to a task persists and resolves both directions; **`DocumentManager` still works unchanged**; no console errors; before/after screenshots.

---

## 10. Out of scope for Phase 1 (later phases)

- `DocumentRequest` + `requested` status + reminders → **Phase 2**.
- `document_engagement_links` + engagement "where used" → **Phase 3**.
- `source` column, AI auto-classification surfacing, full Client Workspace → later phases.

> No code is written until this spec is approved and you authorize starting Phase 1.
