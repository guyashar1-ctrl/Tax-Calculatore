# MIGRATION_PLAN.md — from today's app to the MVP

> **Status:** Plan for review — **no implementation yet.**
> **Owner:** גיא ישר (solo CPA).
> **Last updated:** 2026-06-13.
> **Companion docs:** [PRODUCT_VISION.md](PRODUCT_VISION.md) · [MVP_DATA_MODEL.md](MVP_DATA_MODEL.md) · [ENGAGEMENT_TEMPLATES.md](ENGAGEMENT_TEMPLATES.md)

A safe, ordered path from the current working application to the MVP, **preserving existing functionality, data, and workflows** at every step. Nothing is rebuilt from scratch; everything is added incrementally beside what works today.

---

## 1. Guiding principles

1. **Additive, non-destructive.** New tables/fields are added alongside existing data and backfilled. Nothing is dropped or overwritten.
2. **Strangler-fig / parallel run.** New screens are built beside the old ones behind a flag. The old screen stays reachable and working until the new one is validated; only then is it retired.
3. **Back up before every schema change.** Export the Supabase data before each migration; migrations are idempotent and reversible; verify row counts and spot-check a real client after each.
4. **Value-first ordering.** Each phase ships something useful on its own, and respects dependencies (ownership/links before the screens that rely on them).
5. **Approval gate per phase.** Each phase ends with browser QA (per [CLAUDE.md](CLAUDE.md) §1) + a data-integrity check, then your explicit go-ahead before the next.
6. **Real data is sacred.** No destructive action on real client data without explicit confirmation (CLAUDE.md §7).

---

## 2. Current → MVP mapping (nothing is lost)

| Today | Becomes | Notes |
|---|---|---|
| Client + ~50-field `ClientForm` | **Client** (identity) + **TaxProfile** (permanent tax facts) | Fields split; all preserved. The 1301 Validation-First already reads these. |
| Tasks (`MyDesk`, `TasksPage`, `TaskForm`) | **Task** + **Work Center** | Map current statuses/ball-in-court → the 5 statuses. |
| `DocumentManager` (+ Supabase Storage) | **Document** (client-owned) + **Document Library** | Add `clientId` ownership, category, status, links. |
| Representation flow (`RepresentationRequest*`, `SignaturePad`, POA PDF) | **Engagement** (type=representation) + **RepresentationRegistry** | The flow becomes the representation engagement; its result populates the registry. |
| 1301 engine (`annualReport/`: fields, tree, engine, SyncConfirmation) | **Engagement** (type=annual_return) — questionnaire + checklist + output | Wrapped, **reused as-is**, not rebuilt. |
| Tax calculator + reference | **Tax tools** (unchanged) + feeds the annual-return output | Stays available. |
| "missing/requested" items | **DocumentRequest** | Promoted to explicit objects with reminders. |
| — (new) | **Engagement** as a first-class container | Backfilled from existing data (see Phase 1). |

---

## 2.5 The current schema already anticipates this evolution

Reading the live schema ([supabase/01-schema.sql](supabase/01-schema.sql)) confirms the app was built toward this direction — so we **evolve, not replace**:

- **Documents are already client-owned** (`documents.client_id`) — the ownership principle holds today.
- **The `clients` table already holds the permanent Tax Profile** (~80 fields incl. jsonb `spouse`/`children`/`properties`/`foreign_accounts`, plus representation/SHAAM/VAT settings). Tax Profile is a *resurfacing* of existing columns — not a data migration.
- **The `cases` table is the Engagement seed** (commented "מוכן לעתיד"); `tasks.case_id` already links tasks to it. Engagements grow out of `cases`.

Net effect: most phases are additive, and every screen you use today keeps working.

## 3. Data-migration safety rules

- Snapshot Supabase (and any remaining localStorage) **before** each phase.
- Every migration script is **idempotent** (safe to re-run) and has a documented rollback.
- After each migration: assert row counts match, and manually open one real client to confirm nothing is missing/mangled.
- Keep the old read path alive during parallel run so a problem never blocks daily work.

---

## 4. Phased roadmap

### Phase 0 — Foundations & safety *(no visible change)*
- **Build:** add the new tables additively — `Engagement`, `DocumentEngagementLink`, `DocumentTaskLink`, `DocumentRequest`, `RepresentationRecord`, `TaxProfile`. Add `clientId` to documents and the status enum to tasks. No UI wiring yet.
- **Data:** backfill `clientId` ownership onto existing documents; map current task statuses → the 5 statuses.
- **Preserves:** everything; the app runs unchanged.
- **Verify:** counts match; app behaves identically.
- **Risk:** low (purely additive).

### Phase 1 — Document Library + document ownership  ← recommended first
- **Build:** the client-first **Document Library** (categories, search, filters, tags, years, statuses), reusing `DocumentManager`. Establish "where used" links.
- **Data:** backfill engagement/task links for existing documents where known.
- **Preserves:** existing document upload/view; old document screen stays until validated.
- **Verify:** every existing document appears, owned by the right client; reuse-across-engagements works.
- **Risk:** low–medium. **Highest value-to-risk first step** (it also establishes the Document model everything else links to).

### Phase 2 — Work Center + bidirectional links
- **Build:** the **Work Center** (tasks by status across clients, attention strip), augmenting/replacing `MyDesk` + `TasksPage`. Wire `DocumentTaskLink` / `DocumentEngagementLink`; convert "missing" items into `DocumentRequest`s with reminders.
- **Preserves:** all existing tasks; old task screens parallel-run.
- **Verify:** every task appears in the right status; document↔task links resolve both directions.
- **Risk:** medium.

### Phase 3 — Engagement Workspace (wrap existing engines)
- **Build:** the **Engagement Workspace** shell (stage pipeline + "מה נדרש" + output). Wrap the **1301 engine** as the annual-return engagement; wrap the **representation flow** as the representation engagement (populating the registry). Add Capital Declaration & Bookkeeping shells with their pipelines.
- **Data:** backfill engagements from existing representation requests and any in-progress 1301 sessions.
- **Preserves:** the 1301 questionnaire/output and the representation/signing flow work exactly as today, now inside the engagement shell.
- **Verify:** run a real 1301 and a real representation end-to-end inside the new shell.
- **Risk:** medium–high (the central object; do it after the spine is stable).

### Phase 4 — Client Workspace + Tax Profile + Representation Registry
- **Build:** the **Client Workspace** hub (header with representation badges + insights, engagements, open items, tax-profile snapshot, timeline, documents). Split the ~50 client fields into **Client** + **TaxProfile**; surface the **Representation Registry**.
- **Data:** backfill `TaxProfile` from existing client records (carefully — the trickiest migration); backfill representation records from migrated representation data.
- **Preserves:** the full client file; old `ClientForm` parallel-runs until the split is verified field-by-field.
- **Verify:** no field lost in the split; representation status matches reality.
- **Risk:** high (the field split). Strong backups + field-level verification.

### Phase 5 — Client Portal (MVP) + retire replaced screens
- **Build:** the **Client Portal** action center (requests, uploads, sign, status) on the same objects, reusing existing auth + signing. After parallel-run validation, retire the old screens fully replaced by the new surfaces.
- **Preserves:** the existing onboarding/representation client experience, now generalized.
- **Verify:** a real client completes upload + signature end-to-end through the portal.
- **Risk:** medium.

---

## 5. Recommended first step

**Phase 0 → Phase 1 (Document Library).** Phase 0 is invisible and safe; Phase 1 then delivers immediate daily value (a real structured repository), mostly reuses `DocumentManager`, and establishes the Document-ownership + link foundation that Phases 2–5 all build on.

---

## 6. Explicitly out of scope for this roadmap (post-MVP)

External integrations (bookkeeping/payroll/SHAAM connectors), operational AI agents, the Communications Hub, and the Agent Workspace (PRODUCT_VISION §18). The MVP leaves seams for all of them; none require revisiting this migration.

---

## 7. What stays unchanged vs what evolves

**Stays unchanged (preserved, keeps working throughout):**

- Auth (Supabase + Google + dev login) and `profiles`.
- The `clients` table and the full `ClientForm` (all ~80 fields) — untouched.
- The `tasks` table and the `MyDesk` / `TasksPage` screens.
- Document storage, `useDocumentStore`, and the `DocumentManager` screen.
- The representation flow (`RepresentationRequest*`, signing, POA PDF) and `representation_requests` table.
- The 1301 `annualReport` engine.
- Tax calculator + reference, Vercel deploy, RLS, storage buckets.

**Evolves (additive surfacing/wrapping — no loss):**

| Today | Evolves into | Phase | Existing thing kept? |
|---|---|---|---|
| `documents` | + tags/status/many-to-many links + **Document Library** screen | 1 | Yes — `DocumentManager` stays |
| `tasks` | **Work Center** (cross-client, statuses *derived*) + `DocumentRequest` for missing items | 2 | Yes — task screens stay |
| `cases` | **Engagements** (first-class workflow) + **Engagement Workspace** wrapping 1301 & representation | 3 | Yes — engines reused as-is |
| `clients` (~80 fields) | surfaced as **Tax Profile** + insights in **Client Workspace** | 4 | Yes — no field migration |
| `representation_requests` / `representation_status` | **Representation Registry** (per authority) | 4 | Yes — backfilled |
| representation client-fill flow | **Client Portal** | 5 | Yes — generalized |

## 8. Database changes per phase

All additive; each phase's DDL is one new migration file, reversible.

| Phase | Database changes | Notes |
|---|---|---|
| **1 — Document Library** | `documents` + `tags`, `status`; new `document_task_links`; backfill from `linked_to` | `supabase/07-document-library.sql` (written, **not applied**) |
| **2 — Work Center** | new `document_requests`; `documents.status` gains `requested` | **`tasks`: no schema change** — the 5 statuses are *derived* from existing `status` / `ball_with` / `progress` |
| **3 — Engagement Workspace** | add columns to `cases` (`type`, `status`, `stage`, `period`, `due`, `owner`) → cases become engagements; new `document_engagement_links` | Reuses `tasks.case_id`; 1301 + representation wrapped, not migrated |
| **4 — Client Workspace** | new `representation_records` (backfilled from `representation_status` + `representation_requests`) | **`clients`: no schema change** — Tax Profile resurfaces existing columns |
| **5 — Client Portal** | none required | Reuses documents, requests, representation records, tasks, auth |

> Roadmap for review. No database migration is applied until you approve this plan and then explicitly authorize the apply for that phase. The Phase 1 migration file stays on `feature/mvp-migration`, unapplied.
