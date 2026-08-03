# PIVO Client Lifecycle — Implementation Plan

> **Status:** Plan only. No code written. Prepared 2026-08-03 for execution by Opus.
> **Product decisions baked in (final, approved by Guy):**
> 1. The automatic representation-link email after quotation approval **stays automatic** — hardened for idempotency.
> 2. **Paperless connection confirmed → payment authorization unlocked** is a **mandatory, hard dependency** (operational reason: the recurring authorization is created *inside the client's Paperless account*, so it cannot exist before the client does).
> 3. Paperless invite link (`https://www.paperless.tax/invite?rid=Rtb0kamvcs7`) is **firm configuration**, never hard-coded.
> 4. Retainer flow v1: accountant creates the authorization in Paperless → pastes the link into PIVO → PIVO prepares the email → accountant previews & sends → PIVO tracks completion.
> - All client-facing emails except the approved representation-link automation require **preview + explicit approval**. Previous-accountant emails additionally require **editing**. Internal notifications, drafts, tasks, timeline logging: automatic.
> - Hebrew UI, RTL, current minimal PIVO design language. No visual redesign.

**Verified live facts (checked against production DB on 2026-08-03):**
- `cron.job` has exactly 2 jobs, both **active**: `quotation-reminders-daily` (06:00 UTC daily → auto-sends client reminder emails) and `weekly-backup` (Sunday 03:00 UTC → emails the full unencrypted DB dump). Both authenticate with the same vault secret `quotation_reminder_cron_secret`.
- There is **no Paperless API integration anywhere** in the codebase (only a catalog item named `paperless` in `src/data/defaultServiceCatalog.ts:117`). Therefore v1 *must* use the paste-link approach — confirmed, not assumed.
- The repo has **no `package.json` and no test runner** (known issue, CLAUDE.md §5.1). Automated unit testing is not currently possible; the testing plan below reflects that honestly.

---

## A. Current-state verification

### A.1 Entities and storage (all in Supabase Postgres; no business data in browser storage)

| Area | Reality | Files / objects |
|---|---|---|
| Leads | Own table, 16 cols, `converted_client_id → clients(id)` SET NULL. Lead-only fields never copied on conversion: `phone`, `business_name`, `dealer_type`, `notes`, `has_previous_accountant`, `prev_accountant_name/email/phone` | `supabase/09-quotations.sql:20`, `src/hooks/useLeads.ts`, `src/types/quotations.ts:13` |
| Clients | 129-column table, app-generated text `id`. `representation_request_id` and `assigned_accountant_id` are **unenforced** (no FK) | `supabase/01-schema.sql:87` + 05/06/07/08/23 |
| Quotations | Two mutually exclusive parents (`lead_id`, `client_id`), `public_token` unique partial idx, frozen `snapshot` jsonb, `events` jsonb, `representation_request_id` (no FK), `representation_sent_at` / `representation_error`, `auto_reminder_*` | `supabase/09,10,12,13,24,25`, `src/types/quotations.ts:270` |
| Representation requests | `onboarding_token` UNIQUE; `signers` jsonb with per-signer `signToken` (queried by `.contains()`, unindexed); `execution` jsonb; status chain `pending_fill → awaiting_accountant → pending_signature → awaiting_stamp → awaiting_authorities → active` | `src/components/RepresentationExecutionCenter.tsx`, `signing-session` edge fn |
| Tasks | `client_id → clients` **ON DELETE CASCADE**; system tasks = `client_id IS NULL` + unique title index; trigger `sync_rep_task_ball` matches title `'להשלים ייצוג%'` (fragile, string-match) | `supabase/22-system-tasks.sql`, `28-rep-task-ball.sql` |
| Documents | Metadata row + Storage object at `{user_id}/{client_id}/{doc_id}`; derived ids `engagement-<qid>`, `poa-pdf-<reqId>`, `signed-poa-<reqId>`; `client_id` CASCADE | `src/hooks/useDocumentStore.ts:243-266` |
| Email log | `email_messages` (18 cols, full `html` copy for most kinds), statuses updated by `resend-webhook`. **53 of 72 rows have NULL `client_id`** (lead-stage sends); UI compensates by address matching (`ClientEmailsSection.tsx:86`) | table created out-of-band (not in repo SQL) |
| Firm settings | `profiles.settings` jsonb; established pattern: `settings.quotations.emailTemplate` read/written in `QuotationSettings.tsx:274-281` | |
| Public links | `?quote=` → `quotations.public_token`; `?onboard=` → `representation_requests.onboarding_token`; `?sign=` → signer token in jsonb; `?intake=` → `clients.intake_token` or rep token. All resolved by SECURITY DEFINER RPCs granted to `anon` | `25/26-…sql`, `08-…sql:13`, `27-…sql:145` |
| Quotation approval | `approve_quotation(token, signature, name)` RPC → `open_quotation_representation()` in one transaction: creates client (dedup: `client_id` → `converted_client_id` → email match), creates rep request + signers + task, converts lead, links quotation | `supabase/26-quotation-representation-reuse.sql:16,249` |
| Auto rep email | 4 paths: manual dialog · manual resend (no preview) · **auto from client's browser after approval** (server stamps `representation_sent_at` on success, `representation_error` on failure) · **auto retry on accountant login** (`src/App.tsx:241-264` — claim is client-side: reads `q.representationSentAt`, in-session `Set` dedup, writes back via `updateQuotation`) | `supabase/functions/send-onboarding-email/index.ts` |
| Idempotency today | Auto-reminder: correct atomic claim (`UPDATE … WHERE auto_reminder_sent_at IS NULL`, release on failure). Rep email: **claim is client-side → race windows** (two tabs; failed `updateQuotation` write; client browser + accountant login racing) | `quotation-reminders/index.ts:84-109` |

### A.2 Classification

**Reusable as-is (do not touch):** `approve_quotation` transaction core, representation execution center + state machine, `EmailPreviewDialog` (read-only and editable modes), email log + `resend-webhook` status updates, `useEmailMessages`, quotation snapshot freezing, public-token RPC pattern, `ClientPageState`, brand derivation (`deriveQuotationBrand`), notification queue architecture (`accountant_notifications` + claim-by-attempts).

**Must change:** `send-onboarding-email` (server-side claim + idempotency key + log-all-attempts), `App.tsx:241-264` safety net (stop client-side claiming), `open_quotation_representation` (also create engagement + steps), `weekly-backup` (drop email attachment), `send-quotation-email` / `send-release-email` (server-side recipient validation), `resend-webhook` (fail closed without secret), `notify-accountant` error surfacing + `EMAIL_KIND_LABEL` additions, `SendIntakeModal` + manual reminder + onboard resend (add preview), `FirmProfileConsole` (Paperless settings), `ClientWorkspace` tabs (add onboarding tab).

**Remove / retire:** `stage:'ni_approve'` dead branch in `send-onboarding-email` (keep server code, delete nothing in phase 0 — mark deprecated); `src/hooks/useLocalStorage.ts` (zero call sites); duplicate client-side conversion path `App.tsx:1079→525` (phase 2+: route through server RPC instead — **do not** delete the manual "create representation" dialog UX, only its private duplicate of the conversion logic).

**Untouched:** leads/clients tables themselves (until phase 6), all public tokens, signatures, documents, annual-report module, tax calculator, task board.

---

## B. Target workflow

### B.1 Person lifecycle (derived events, not hand-set)

```
Lead ──(quotation sent)──► In quotation ──(quotation approved)──► Onboarding ──(all steps done/skipped)──► Active client ──► Archived
   └─(closed)─► Closed lead (revivable)                                                                └─► Former client (revivable)
```
Phase 6 makes this a real column on the person; phases 1-5 *derive* it: has engagement in `onboarding` ⇒ "בקליטה"; else current behavior.

### B.2 Engagement state machine

`onboarding → active → ended` | `cancelled` (from any state, accountant action; cancelling cascades open steps to `cancelled`, halts prepared emails).

### B.3 Onboarding step generic state machine

```
locked ──► pending ──► in_progress ──► waiting_client ──► completed ──► verified
   │           │            │               │                │
   └───────────┴────────────┴───── blocked ─┴──── failed ────┘        skipped / cancelled (terminal)
```
Transitions only via server RPC (`advance_onboarding_step`) which enforces: a step leaves `locked` **only** when its `depends_on_step_id` target is `completed`/`verified`/`skipped`.

### B.4 Tracks, steps, triggers, ownership

| # | Track | Step (`step_type`) | Scope | Created when | Initial status | Ball | Completion condition |
|---|---|---|---|---|---|---|---|
| 1 | authorities | `representation` | person | engagement has representation config | mirrors rep request | derived | rep request reaches `active` — **status auto-synced from `representation_requests`, single source of truth, no second state machine** |
| 1 | authorities | `file_opening` (new business: VAT/IT/NI registration) | person | person fact `business_transfer=false` + no existing files | `pending` | me | manual checklist done |
| 2 | prev_accountant | `release_letter` | person | person fact `has_previous_accountant` | `pending` (draft auto-prepared) | me | sent + marked replied/completed |
| 2 | prev_accountant | `materials_received` | person | with `release_letter` | `locked` (dep: release_letter) | prev_accountant | manual checklist (ledgers, trial balance, last return, depreciation forms, 106) |
| 3 | tools | `paperless_invite` | person | Paperless needed (service sold **OR a retainer step exists** — billing runs through Paperless) **AND** client is not already in Paperless (§L triage) | `pending` | me | invite email sent |
| 3 | tools | `paperless_connection` | person | whenever Paperless is needed — **this step always exists and is the single anchor** the retainer depends on, in every migration path (§L) | `locked` (dep: paperless_invite) in the new-client path; `pending` in the transfer path (card shows pull-from-previous-representative instructions) | client / me | **manual confirmation click** (v1); `completion_method` ready for future API auto-confirm. In the transfer path, confirmation = "transfer completed, client now under our representative" |
| 3 | tools | `data_import` | person | client has history in **another accounting software** (§L: `dataSource='other_software'`) | `locked` (dep: paperless_connection) | me | uniform-format export file (מבנה אחיד) obtained → imported into Paperless. File checklist item is mirrored in the prev-accountant materials list when a previous accountant exists |
| 3 | tools | `data_verification` | person | client has any history (either scenario in §L) | `locked` (dep: `data_import` when it exists, else `paperless_connection`) | me | checklist verified inside Paperless: documents present, income present, expenses present, opening balances sane |
| 4 | payment | `retainer_authorization` | **engagement** | engagement has monthly items | **`locked` (dep: `paperless_connection`) — the mandatory dependency** | me → client | link recorded + email sent + client completed + verified |
| 5 | internal | `internal_setup` | engagement | always | `pending` | me | checklist: tax file numbers in card, assignee, reporting frequencies |
| 5 | internal | `kyc_identification` | person | representation exists | `pending` (silent) | me | identification documents verified (data already collected by rep flow) |
| 6 | review | `first_month_review` | engagement | on engagement activation | `pending`, due +30d | me | manual |

**Person-scope rule:** partial unique index prevents a second live person-scope step of the same type per client; composing engagement #2 links to the existing completed step (auto-`skipped` in the new journey view with note "הושלם בקליטה קודמת").

**The mandatory dependency, explicitly:**
```
paperless_connection.status ∈ {completed, verified, skipped(already-connected)}
        └──► retainer_authorization: locked → pending   (RPC-enforced, UI shows 🔒)
```
`skipped` unlocks **only** when skip reason is `already_connected` / `transferred_rep` — a paperless step skipped as "not required" is impossible while a retainer step exists (composer guarantees, RPC re-validates).

### B.5 Reminders (prepare, never auto-send)

Daily cron (new, reuses vault-secret pattern): scans open steps → **creates/refreshes system tasks and flags** — sends nothing. Rules: paperless waiting >7d ⇒ task "תזכורת פייפרלס מוכנה"; retainer incomplete and `billing_start_month` ≤ 10 days away ⇒ step flagged `needs_attention` + urgent task (red, MyDesk) — note: **cannot unlock a locked retainer step** (hard dependency wins; the task tells the accountant to chase the Paperless connection); rep request stuck per existing flow.

---

## C. Data model (all additive; nothing renamed/deleted)

### C.1 New: `engagements` — `supabase/30-engagements.sql`
| Column | Type | Why |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `user_id` | uuid NOT NULL → auth.users | RLS pattern parity |
| `client_id` | text NOT NULL → clients(id) ON DELETE CASCADE | engagement is meaningless without the person; CASCADE matches tasks/docs so existing client-delete UX doesn't break |
| `quotation_id` | text → quotations(id) ON DELETE SET NULL, **UNIQUE** | one engagement per approved quotation; unique = idempotency for approval retries |
| `status` | text CHECK (`onboarding`,`active`,`ended`,`cancelled`) NOT NULL default `onboarding` | B.2 |
| `monthly_total` / `billing_start_month` | numeric / text `YYYY-MM` | frozen from snapshot at creation — retainer step reads these, never recomputes from a live catalog |
| `approved_at`,`activated_at`,`ended_at`,`created_at`,`updated_at` | timestamptz | audit |
RLS: owner-only + `is_authorized()` restrictive, same as 15-security. Index on `(user_id, status)`, `(client_id)`.

### C.2 New: `onboarding_steps` — `supabase/31-onboarding-steps.sql`
| Column | Type | Why |
|---|---|---|
| `id` uuid PK; `user_id` uuid NOT NULL | | |
| `engagement_id` | uuid → engagements ON DELETE CASCADE, **nullable** | nullable so person-level steps can exist for pre-existing clients with no engagement (backfill: "already connected to Paperless") |
| `client_id` | text NOT NULL → clients ON DELETE CASCADE | person-scope queries + RLS convenience |
| `step_type` | text CHECK (enumerated B.4 list) | |
| `track` | text CHECK (`authorities`,`prev_accountant`,`tools`,`payment`,`internal`,`review`) | grouping in UI |
| `scope` | text CHECK (`person`,`engagement`) | dedup rule |
| `status` | text CHECK (B.3 list) NOT NULL | |
| `ball` | text CHECK (`me`,`client`,`authority`,`prev_accountant`,`system`) | timeline owner display |
| `depends_on_step_id` | uuid → onboarding_steps(id) | **the real dependency edge** (paperless→retainer, invite→connection, release→materials) |
| `due_date` date; `needs_attention` boolean default false | reminders §B.5 | |
| `payload` | jsonb default '{}' | type-specific data — paperless steps: `{paperlessStatus: 'none'\|'other_rep'\|'self', dataSource: 'none'\|'other_software'\|'paperless', softwareName?}` (§L triage answers, stored once as person facts); retainer: `{amount, billing_start_month, auth_url, provider_ref}`; checklists for materials/setup/verification |
| `completion_method` | text CHECK (`manual`,`auto`,`system`) | future API confirm swaps `manual`→`auto` with zero schema change |
| `completed_by` uuid; `completed_at`,`verified_at`,`created_at`,`updated_at` | | who/when audit |
Constraints: UNIQUE `(engagement_id, step_type)` where engagement_id not null (composer idempotency); partial UNIQUE `(client_id, step_type)` WHERE `scope='person' AND status NOT IN ('cancelled','skipped')` (one live person-step); index `(user_id, status)`, `(client_id)`.

### C.3 New: `onboarding_events` — same migration
`id` uuid PK, `user_id`, `step_id` → steps CASCADE, `engagement_id` nullable, `type` text (created/status_changed/email_prepared/email_sent/reminder_prepared/blocked/note), `actor` text CHECK (`accountant`,`client`,`system`), `note` text, `meta` jsonb, `at` timestamptz default now(). **This is the timeline's source**; UI merges it with `email_messages` (by `meta.step_id`).

### C.4 Additive columns on existing tables
| Table | Column | Why |
|---|---|---|
| `email_messages` | `idempotency_key text`; partial UNIQUE `(user_id, idempotency_key)` WHERE not null — `supabase/29-email-idempotency.sql` | duplicate-send prevention at the log layer (decision 1). Keys: `onboard:<requestId>` (auto rep email), `step:<stepId>:<kind>:<seq>` |
| `email_messages` | `step_id uuid` (no FK — table predates repo migrations; keep loose like existing `request_id`) | timeline linkage |
| `tasks` | `onboarding_step_id uuid → onboarding_steps(id) ON DELETE SET NULL` | replaces fragile title-matching for new step tasks (existing `'להשלים ייצוג%'` trigger untouched in phase 1) |
| `profiles.settings` (jsonb, no DDL) | `settings.paperless = { inviteUrl }`; `settings.commTemplates = { paperless_invite: {subject, body}, retainer_request: {...}, ... }` | firm configuration per decision 3; follows the established `settings.quotations.emailTemplate` pattern; server default templates live in `functions/_shared/templates.ts`, settings only *override* |

### C.5 Phase-5/6 additive columns (listed now, executed later)
`clients`: `business_name`, `dealer_type`, `has_previous_accountant`, `prev_accountant_name/email/phone`, `referral_source`, `business_transfer boolean`, `lifecycle_stage`, `merged_from_lead_id` — phase 5 copies prev-accountant facts (fixes release-letter-reads-dead-lead), phase 6 completes unification. Nothing dropped from `leads`.

---

## D. Backend and server functions

### D.1 SQL functions (SECURITY DEFINER, `authenticated` unless noted)

**`create_engagement_for_quotation(p_quotation_id text) → uuid`** — new, `supabase/32-engagement-on-approval.sql`
Validates quotation belongs to caller (or is called internally from `approve_quotation`), status=`approved`, has `client_id`. INSERT engagement ON CONFLICT (`quotation_id`) DO NOTHING; freeze `monthly_total`/`billing_start_month` from snapshot; call `generate_onboarding_steps`. Idempotent by the unique constraint. Called from: (a) inside `approve_quotation` (same transaction, after `open_quotation_representation`), (b) App on-login backfill for previously approved quotations, (c) manual convert path.

**`generate_onboarding_steps(p_engagement_id uuid) → int`** — new
Pure composer per B.4 rules, reading: engagement snapshot items (monthly? paperless service?), representation config, client facts (prev accountant — phase 1 reads from linked lead via `converted_client_id`, phase 5 from client columns). Creates steps with correct `depends_on_step_id` wiring; ON CONFLICT do nothing (idempotent); person-scope dedup: if live person-step exists for client, link nothing — journey view finds it by `client_id`. Guarantees: retainer step ⇒ paperless steps exist.

**`advance_onboarding_step(p_step_id uuid, p_action text, p_payload jsonb) → jsonb`** — new
The **only** write path for step status (UI never updates the table directly). Validates ownership; validates transition against B.3 matrix; **enforces the lock rule** (refuse leaving `locked` unless dependency satisfied; refuse `skip` of paperless with reason `not_required` while a retainer step exists); merges payload (validates `auth_url` is https when action=`record_link`); writes `onboarding_events`; creates/closes the linked task via `onboarding_step_id`. Returns updated step. Transaction: single statement scope.

**`sync_representation_step()`** — new trigger on `representation_requests` (pattern of `28-rep-task-ball.sql`): status change ⇒ update the matching `step_type='representation'` row (status+ball) and, on POA fully signed, fire the "prepare welcome/paperless email" event (creates draft task, sends nothing).

**Changed: `approve_quotation`** — appends `create_engagement_for_quotation` call. **No change** to signature, return shape, token handling, or `open_quotation_representation` internals ⇒ existing public links and approved quotations unaffected.

### D.2 Edge functions

**Changed: `send-onboarding-email`** (decision 1 hardening)
- Server-side atomic claim for the auto path: `UPDATE quotations SET representation_sent_at = now() WHERE id = … AND representation_sent_at IS NULL` **before** calling Resend; zero rows ⇒ return `{ok:true, alreadySent:true}` (idempotent no-op). On Resend failure: release claim, write `representation_error`, **insert a `failed` row in `email_messages`** (today failures aren't always logged).
- `idempotency_key = 'onboard:'+requestId` on the log insert; unique-violation ⇒ treat as already-sent, not error.
- Applies to **both** the public `quotationToken` path and the JWT `requestId` path when the request is quotation-linked. Manual dialog resend keeps working (explicit resend passes `force:true` → new key `onboard:<requestId>:r<N>`).
- Retry semantics: only a genuine failure (claim released) is retriable; the App safety net (below) can no longer double-send by construction.

**Changed: `App.tsx:241-264` safety net** — stops writing `representationSentAt` client-side; just invokes the function (server claims); still per-session `Set`-deduped; still logs `representationError` for the banner via the function's response. Admin login can no longer cause duplicates (server claim) — requirement satisfied.

**New: `send-step-email`** — one function for paperless invite / retainer request / step reminders.
Inputs: `{stepId, kind, preview?, overrides?{subject,body}, to?}`. JWT-only (accountant), never public. Validation: step belongs to caller; `kind` allowed for `step_type`; recipient **forced server-side** to the client's stored email (an explicit `to` override is allowed but must match client email, spouse email, or be confirmed via `allowOther:true` which is logged) — recipient validation requirement. Template: `_shared/templates.ts` defaults (paperless invite body covers: photograph/upload expense documents, email/computer upload, follow business activity & expected authority payments, issue digital income documents) merged with `settings.commTemplates` override merged with per-send `overrides`. Placeholders: `{{clientName}}`, `{{firmName}}`, `{{paperlessInviteUrl}}`, `{{amount}}`, `{{billingStartMonth}}`, `{{authUrl}}`. `preview:true` ⇒ returns html, sends nothing (existing pattern). Send: inserts `email_messages` with `idempotency_key='step:'+stepId+':'+kind+':'+seq`, `step_id`, then advances the step via `advance_onboarding_step` semantics (event `email_sent`). Failure: `{ok:false}`, step untouched, failed row logged.

**New: `onboarding-reminders`** (cron, daily, vault secret — **separate secret** `onboarding_cron_secret`): implements B.5. Sends **no client email**. Creates/refreshes tasks (`onboarding_step_id` link), sets `needs_attention`, writes events. Idempotent per day per step (event-existence check).

**Changed (phase 0, security):** `weekly-backup` — remove the Resend attachment path entirely; keep bucket upload; send a short **status-only** email (row counts, success/failure, no data) to `profiles.email` (resolved by `user_id`, not hard-coded address). `send-quotation-email` / `send-release-email` — server re-validates `to`: quotation → must equal the stored lead/client email; release → free recipient stays (it's the point) but subject/body length caps + the send is refused if `clientId` doesn't belong to caller (already) + full `html` copy now stored in the log (evidence gap). `resend-webhook` — refuse all requests when `RESEND_WEBHOOK_SECRET` unset (fail closed). `notify-accountant` — no logic change; UI surfaces `error IS NOT NULL AND attempts >= 3` rows (E below); add `notify_*` + missing kinds to `EMAIL_KIND_LABEL`.

---

## E. Frontend changes

| Screen | Change |
|---|---|
| **Client card — new tab "קליטה"** (`ClientWorkspace.tsx` + new `clientTabs/OnboardingTab.tsx`) | Shown when client has any engagement/steps. Top: ball line (reuse `RepresentationNextStep` visual language — one line, colored badge, title, sub). Below: 4-6 track groups, each step a row: icon by status, title, owner chip, due date, primary action button. **Locked steps**: 🔒 + "ייפתח אחרי אישור חיבור פייפרלס" — visible but disabled (the dependency must be *seen* to be understood). Bottom: unified timeline (`onboarding_events` ⋈ `email_messages by step_id`), newest first. Empty state: "אין קליטה פעילה". Errors: inline per step, red, with retry. Mobile: tracks stack vertically; action buttons full-width. |
| **Paperless step card** | On first open — the §L triage (two questions, defaults prefilled from lead facts, answers saved as person facts, never re-asked): (1) "הלקוח כבר עובד עם פייפרלס?" לא / כן, אצל מייצג אחר / כן, עצמאית; (2) if no: "יש היסטוריה לייבא?" עסק חדש — אין / כן, מתוכנה אחרת (+שם התוכנה). The card then renders the matching variant: **new-client** — "הכן מייל הזמנה" → `EmailPreviewDialog` **editable** (template prefilled; missing `settings.paperless.inviteUrl` ⇒ blocking notice with settings link) → send → "ממתינים לחיבור" → **"אשר חיבור"** (confirm dialog) ⇒ retainer unlocks; **transfer** — no invite email; instruction card "משיכת הלקוח מהמייצג הקודם בפייפרלס" with a checklist → **"אשר שהעברה הושלמה"** ⇒ same completion event ⇒ retainer unlocks; **self-connected** — link-to-firm instructions → confirm. Import/verification sub-cards appear below per §L. |
| **Retainer step card** | While locked: explanation of why + shortcut to the paperless step. When pending: shows frozen amount + billing month (read-only, from engagement); field "קישור הרשאת התשלום מפייפרלס" (URL validation: https, non-empty; stored via `advance_onboarding_step record_link`); then "הכן מייל" → editable preview → send → "ממתינים ללקוח"; "הלקוח השלים" (+ optional provider reference) → completed; "אומת" → verified. Near-billing flag renders the card red with the date. |
| **MyDesk** | Step tasks appear via existing task list (they're real tasks). New collapsible section "ממתינים לאישורך": steps with prepared-but-unsent drafts + reminder-ready flags. Uses existing card styles. |
| **QuotationsPipeline** | Existing failure banners stay; approved-quotation rows link to the client's onboarding tab ("לקליטה ←"). |
| **ClientList** | Badge "בקליטה" (derived: any engagement `onboarding`) next to existing representation pipeline chip. No column redesign. |
| **FirmProfileConsole** | New section "פייפרלס ותקשורת": invite-link field (validated https), template editors for `paperless_invite` / `retainer_request` (subject+body, placeholder legend, "שחזר ברירת מחדל"). |
| **Admin alerts** | App-level banner (pattern of existing pipeline banners) for: failed `accountant_notifications` (≥3 attempts), rep-email failures (existing), steps `needs_attention`. |
| **Preview-gap fixes (policy)** | Manual quotation reminder, onboard resend, `SendIntakeModal` — all routed through `EmailPreviewDialog` (read-only preview + send button) — 3 small wires, no new components. |
| **Lead form** | Adds nothing in phases 0-4 (facts already collected). Phase 5: `referral_source`, `business_transfer` toggle. |
| **Untouched screens** | Task board, tax calculator, annual report, documents tab, representation execution center (only the sync trigger reads its state). |

---

## F. Communication matrix (target state)

| Communication | Trigger | Auto? | Preview | Editable | Template source | Recipient validation | Idempotency / duplicates | Log |
|---|---|---|---|---|---|---|---|---|
| Quotation email | button | manual | builder tab (exists) | subject+message | settings.quotations | server: must match stored lead/client email *(new)* | status flip after success (exists) | full html |
| **Representation link** | **quotation approved (approved automation)** | **auto** | none (approved) | fixed template | function COPY | server: request's stored email | **server atomic claim + `onboard:<reqId>` key** | full html + failed attempts *(new)* |
| Rep link resend | button | manual | **preview added** | no | same | same | `:r<N>` key | full html |
| Signature email(s) | button | manual | read-only (exists) | no | function COPY | per-signer stored email | per-signer stamps (exists) | full html |
| "Representation active" | button | manual | exists | no | function COPY | stored email | manual | full html |
| Intake questionnaire | button | manual | **preview added** | no | function COPY | typed, confirmed in modal | token minted once (exists) | full html |
| **Paperless invite** | step action, prepared after POA signed | manual | **editable preview** | subject+body | `_shared` default ⊕ settings override | server-forced to client email | `step:` key | full html + step link |
| **Retainer request** | step action (unlocked by paperless only) | manual | **editable preview** | subject+body | same | same | `step:` key | full html + step link |
| Step reminders | cron **prepares**, accountant sends | manual send | editable preview | subject+body | same | same | `step:…:seq` | full html |
| Auto quotation reminder | cron 06:00 (live today) | **auto — pending Guy's decision #2** | none | no | server-built | stored email | atomic claim (exists, good) | row, no html → **add html** |
| Release letter (prev accountant) | dialog | manual, never auto | full-body editing = preview | everything | `releaseLetter.ts` defaults | free recipient (by design), caps added | manual | **html now stored** *(new)* + PDF (exists) |
| Internal notifications (3 kinds) | DB triggers + flush | auto (approved) | — | — | function | accountant only | attempts-claim (exists) | full html, labeled *(new)* |
| Backup status | cron weekly | auto | — | — | function | profile email | weekly | row *(no data payload — new)* |

---

## G. Migration and backwards compatibility

**Iron rules:** additive only; ids never change; no deletes; every pointer update recorded. Phases 0-4 require **zero data migration** — they only add tables/columns, so "onboarding can begin without the lead/client unification" is satisfied by construction.

**Backfill (phase 1, idempotent script, rerunnable):**
1. For every `quotations.status='approved'` with `client_id`: `create_engagement_for_quotation` (unique constraint makes reruns no-ops). Engagements for old quotations get steps generated; person-scope steps for clients who obviously completed them are then bulk-marked: reps `active` ⇒ representation step completed (the sync trigger handles it); **existing clients already in Paperless ⇒ accountant marks "כבר מחובר" from the UI, or a one-time checklist screen listing all backfilled engagements for triage** (explicit requirement covered); clients with active payment authorization ⇒ retainer step → `verified` with note `pre-existing`.
2. Dry run mode: script runs with `--report`: prints per-client planned engagements/steps, writes nothing. Guy approves the Hebrew report before live run.
3. Test first on a Supabase **development branch** (full copy), verify, then production during a quiet window.

**Verification queries (run pre/post, both environments):** count approved quotations = count engagements; no step rows without valid client; no retainer step whose dependency pointer is null or non-paperless; every `quotations.public_token` still resolves via `get_quotation`; every `onboarding_token` resolves via `get_onboarding`; `email_messages` count unchanged.

**Feature flag:** `settings.flags.onboardingTab` — UI renders the new tab only when true; data model works regardless. Rollback layer 1 = flag off (data stays, UI reverts). Layer 2 = drop new tables (touch nothing existing — they're additive). Layer 3 = restore from the pre-migration backup (manual backup + bucket copy taken before phase 1 rollout).

**Phase 6 (person unification)** keeps the full plan from `docs/LIFECYCLE-REDESIGN.md` part ג׳ — unchanged, still last, still gated on its own dry-run report and Guy's approval.

---

## H. Security fixes (phase 0 — shippable independently, before all feature work)

1. **Backup email:** stop attaching the DB dump; bucket upload stays; status-only email; owner resolved by `user_id` not hard-coded strings. Files: `weekly-backup/index.ts`.
2. **Recipient/content validation:** `send-quotation-email` — `to` must equal stored record email; `send-release-email` — ownership check (exists) + length caps + store html copy. (Full server-side template rebuild deferred — would require porting browser HTML builders to Deno; documented as phase-5 hardening.)
3. **Webhook:** `resend-webhook` fails closed when secret unset; **deployment checklist verifies `RESEND_WEBHOOK_SECRET` is actually set** (cannot be verified from repo).
4. **Silent failures:** banner for dead `accountant_notifications`; label additions in `emailActivity.ts`.
5. **Rep-email idempotency:** the server claim from D.2 (this is phase 0, per Guy's ordering — it's the approved automation's safety).
6. **Logs hygiene:** failure rows store error class + Resend id only, never full addresses in `error` strings; edge-function console logging reviewed for PII (audit found none egregious; verify during implementation).
7. Separate cron secret for the new reminder job; note that both existing jobs share one secret (rotate into two during phase 0 — dashboard action, documented).

---

## I. Testing plan

**Constraint (honest):** no `package.json`/test runner exists in the repo (CLAUDE.md §5.1). Until it is restored, "unit tests" are not runnable in CI. The plan therefore uses: (a) **SQL assertion scripts** run via Supabase MCP/psql against the dev branch; (b) **edge-function tests** via `supabase functions serve` + scripted curl cases; (c) **browser QA** per CLAUDE.md §1 (mandatory screenshots, golden path + edge case); (d) **verification queries** from §G. If Guy approves restoring `package.json` (open issue), Vitest unit tests for composer/state-machine logic become possible — flagged, not assumed.

Concrete cases (each = scripted SQL setup + expected assertion, or browser scenario):
1. New lead → quotation → approve on public page ⇒ engagement exists, steps exist, retainer `locked`, dependency points at paperless step.
2. Existing client second engagement ⇒ person steps not duplicated; only engagement-scope steps created.
3. Duplicate approval callback (call `approve_quotation` twice, same token) ⇒ one engagement, one rep request, one email claim.
4. Auto rep email: claim race — two concurrent invokes ⇒ exactly one Resend call, second returns `alreadySent` (curl ×2 against served function).
5. Failed rep email ⇒ claim released, `representation_error` set, failed log row; next login retries once; success clears error.
6. Admin login with already-sent quotation ⇒ zero sends (assert no new `email_messages`).
7. Paperless new / already-connected / transfer modes ⇒ correct statuses; already-connected unlocks retainer immediately.
8. Retainer before paperless: `advance_onboarding_step` on locked step ⇒ refused with typed error; UI shows locked card (screenshot).
9. Retainer after paperless confirm ⇒ unlocked; paste bad link (http, empty) ⇒ validation error; good link ⇒ stored; email preview renders amount+month from engagement (not live catalog).
10. Missing payment link ⇒ "הכן מייל" disabled with reason.
11. Billing-month proximity ⇒ reminder cron flags step + creates urgent task; rerun same day ⇒ no duplicate task.
12. No-retainer engagement (one-time / tax refund) ⇒ no payment step, no paperless auto-add unless sold.
13. Prev accountant missing email ⇒ release step blocked-with-reason, task created.
14. Public-link regression: previously issued `?quote=`/`?onboard=`/`?sign=`/`?intake=` tokens all resolve after every phase (scripted).
15. Email duplicate prevention: same `idempotency_key` twice ⇒ unique violation handled as no-op.
16. Rollback: flag off ⇒ old UI intact (browser); drop-tables script on branch ⇒ existing flows unaffected (SQL asserts).
17. Cancel engagement mid-onboarding ⇒ open steps cancelled, prepared drafts gone from "ממתינים לאישורך".
18. Manual QA (browser, per CLAUDE.md): full golden path new-client journey with screenshots at every step; console clean.
19. §L Scenario 1 end-to-end: triage answers (no Paperless, history in other software) ⇒ steps invite→connection→import→verification created with correct dependency chain; retainer unlocks at *connection*, while import is still open (assert both states simultaneously).
20. §L Scenario 2 end-to-end: triage answers (Paperless under another rep) ⇒ **no invite step**, connection step pending with transfer card; confirm transfer ⇒ retainer unlocks; verification checklist still open.
21. Triage persistence: second engagement for the same person ⇒ triage not re-asked (person facts reused); changing a wrong triage answer via "שנה מסלול" resets only unstarted steps, never completed ones.

---

## J. Execution phases for Opus

**Order unchanged from Guy's suggestion — the audit confirms it's safe** (0 is independent; 1-2 are additive foundations; 3-4 depend on 2; 5 is parallelizable after 2; 6 last).

### Phase 0 — Security + rep-email idempotency
Scope: H.1-H.7 + D.2 `send-onboarding-email` claim + `App.tsx` safety-net change + `29-email-idempotency.sql`. Untouched: all UI except banners/labels. Acceptance: tests 4,5,6,15; webhook fail-closed verified; backup email contains no data. Rollback: redeploy previous function versions (edge functions are individually versioned); SQL is one additive column.
### Phase 1 — Engagement + steps foundation
Scope: `30-engagements.sql`, `31-onboarding-steps.sql`, `32-engagement-on-approval.sql` (RPCs + trigger), backfill script + dry-run report → **Guy approves report** → live backfill. No UI. Acceptance: tests 1,2,3,14; verification queries green on branch then prod. Rollback: flag never on; tables droppable.
### Phase 2 — Onboarding engine UI
Scope: onboarding tab, ball line, tracks, timeline, task linkage (`tasks.onboarding_step_id`), MyDesk section, preview-gap fixes (policy), triage screen for backfilled engagements. Acceptance: tests 7 (partial), 8 UI, 17, 18; screenshots. Rollback: `settings.flags.onboardingTab=false`.
### Phase 3 — Paperless invitation + connection
Scope: settings section, `_shared/templates.ts`, `send-step-email` (invite kinds), paperless card modes, confirm-connection, skip logic. Acceptance: tests 7, 12; email preview/edit/send QA with `delivered@resend.dev`. Rollback: flag + function version.
### Phase 4 — Retainer dependency + tracking
Scope: retainer card, link recording, retainer email kind, `onboarding-reminders` cron (new secret), near-billing escalation. Acceptance: tests 8,9,10,11; the mandatory dependency demonstrably enforced server-side (test 8 via direct RPC call, not just UI). Rollback: cron unschedule + flag.
### Phase 5 — Prev-accountant track + communication center polish
Scope: `33-prev-accountant-on-client.sql` (copy fields lead→client, additive), release step statuses (draft/ready/sent/delivered/replied/completed/blocked) wired to existing dialog + delivery webhook, materials checklist, release html logging, lead form additions (`referral_source`, `business_transfer`), server-side template rebuild hardening deferred from phase 0. Acceptance: test 13 + release flow QA. Rollback: additive columns ignored by old UI.
### Phase 6 — One person, one record
Scope: per `LIFECYCLE-REDESIGN.md` part ג׳ — own dry-run, report, approval, quiet-window run. Not started until phases 0-5 are stable in production. Acceptance: its own verification suite + all public-link regression. Rollback: its three-layer plan.

---

## K. Final execution checklist for Opus

**Order:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6; within each phase: SQL → edge functions → frontend → QA → report.
**Migrations to apply (in order):** `29-email-idempotency.sql`, `30-engagements.sql`, `31-onboarding-steps.sql`, `32-engagement-on-approval.sql`, `33-prev-accountant-on-client.sql` (phase 5). Apply via `apply_migration` on the dev branch first, production only after branch verification.
**Secrets / environment (verify in dashboard, cannot be verified from repo):** `RESEND_WEBHOOK_SECRET` set; new `onboarding_cron_secret` in vault; rotation of the shared cron secret; `RESEND_API_KEY` unchanged.
**Feature flags:** `settings.flags.onboardingTab` (phase 2+), off by default until QA passes.
**Must pass before merge (per phase):** the phase's numbered tests from §I; browser QA with screenshots (CLAUDE.md §1 — no "done" without visual proof); console error check; public-link regression (test 14) after **every** phase touching SQL.
**Production verification (after each deploy):** §G verification queries; send one test email of each new kind to `delivered@resend.dev`; confirm cron jobs list matches expectation (`select * from cron.job`).
**Rollback triggers:** any public link failing to resolve; duplicate client email observed; step transition bypassing the paperless→retainer lock; backfill report counts mismatching. Action: flag off → function version rollback → SQL layer per phase notes → restore backup (last resort).
**Final report (Hebrew, per CLAUDE.md):** what was built, what was tested in the browser with screenshots, verification query results, anything skipped, open items.

---

## L. Paperless migration paths (addendum, approved scope)

### L.1 The two real-world scenarios — and the design principle that unifies them

- **Scenario 1 — client migrating from another accounting software:** invite → client connects → import history via the uniform-format export file (מבנה אחיד) → verify import → continue.
- **Scenario 2 — client already in Paperless under another representative:** pull the client from the previous representative inside Paperless → verify transfer → verify data completeness → continue.

**Do not model these as two hard-coded flows.** They are combinations of two orthogonal person facts:

| Fact | Values | Usual source |
|---|---|---|
| `paperlessStatus` — is the client in Paperless today? | `none` / `other_rep` / `self` | previous-accountant conversation; triage if unknown |
| `dataSource` — where does bookkeeping history live? | `none` (new business) / `other_software` (+ name) / `paperless` | lead facts `business_transfer` + `has_previous_accountant`; triage if unknown |

The composer maps facts → steps; adding a future combination (e.g., client self-managed in a third product with an API) is a mapping change, not a new flow.

| paperlessStatus | dataSource | Steps composed (tools track) |
|---|---|---|
| `none` | `none` | invite → connection |
| `none` | `other_software` | invite → connection → data_import → data_verification *(Scenario 1)* |
| `other_rep` | `paperless` | connection (transfer variant, no invite) → data_verification *(Scenario 2)* |
| `self` | `paperless` | connection (link-to-firm variant) → data_verification |

### L.2 Which questions, and when (last-responsible-moment rule)

1. **Lead stage (facts only, optional):** `has_previous_accountant`, `business_transfer` already exist; phase 5 adds optional "מערכת הנה"ח נוכחית" free-text + "עובד עם פייפרלס?" tri-state, default **unknown**. Never mandatory — a lead call is not an interrogation.
2. **Quotation:** nothing asked (deal answers deal questions; these are person facts).
3. **First open of the Paperless step:** the triage (E, Paperless card) — at most two questions, prefilled from lead facts, skipped entirely when facts are already known. Answers are stored as **person facts** (step payload + person columns in phase 5+), so engagement #2 never re-asks.
4. Wrong answer discovered later: "שנה מסלול" action re-runs the composer — resets only `locked`/`pending` steps, never touches completed ones, writes an `onboarding_events` entry.

### L.3 Interactions with the other tracks

- **Previous-accountant track:** Scenario 1's uniform-format file is usually *held by the previous accountant* — the `data_import` prerequisite appears as an item in the prev-accountant **materials checklist** (one fact, two views; checking it in either place checks both). Scenario 2's release letter template gains an optional paragraph requesting the Paperless transfer; the transfer confirmation lives in the paperless step, not in the letter step. A stalled previous accountant blocks `data_import` (status `blocked`, ball=prev_accountant) but **never** blocks connection or retainer.
- **Representation track:** fully parallel, no dependency either direction — authorities don't care where the bookkeeping data lives.
- **Paperless connection:** the **single anchor event** in every path — "the client exists in Paperless under our representative". Scenario 1 reaches it via invite+signup; Scenario 2 via representative transfer; self via linking. Completion is the same event with the same consequences.
- **Historical data migration:** always **downstream of connection, never upstream of money**. Import and verification can take weeks (files from a reluctant accountant) — they run in parallel with the retainer and the rest of onboarding. They must be completed *or explicitly skipped with a reason* before the engagement flips to `active`, so history is never silently forgotten — but they delay nothing else.
- **Retainer authorization:** dependency unchanged and single: `paperless_connection` completed (any variant). Explicitly: **history import does NOT gate the retainer** — the authorization needs the client's Paperless account to exist, not his 2024 expenses.

### L.4 Edge cases

- Previous accountant refuses to hand over the uniform file ⇒ `data_import` blocked; client can often export it himself from the old software or request it via the software vendor — the card lists both fallbacks; last resort: skip-with-reason (documented gap in history).
- Transfer pulled but data arrives partial ⇒ `data_verification` fails its checklist ⇒ status `failed` + task; retry after chasing the previous representative. Retainer unaffected.
- Client claims to be in Paperless but isn't found ⇒ flip triage to `none` via "שנה מסלול"; invite path composes.
- New business that starts mid-onboarding to use another invoicing tool ⇒ out of scope for onboarding; note in card.

---

## Conflicts and open decisions

**Conflicts between decisions and codebase (resolved in this plan):**
1. Decision 2's operational gate vs. the earlier recommendation (POA-first) — plan follows Decision 2; the near-billing reminder can only *escalate*, never unlock (B.5).
2. The auto quotation reminder **is live in production** (verified in `cron.job`) while the standing policy says reminder *sending* requires approval. Not silently changed — needs Guy's explicit call (below).
3. No test runner exists — §I adapts; restoring `package.json` is recommended but out of scope.
4. Rep-email claim was client-side — moved server-side (Decision 1's requirements make this mandatory, not optional).
5. Release letter currently depends on the dead lead row — fixed in phase 5 by additive copy, before unification.

**Open decisions for Guy (final):**
1. Auto quotation reminder: keep fully automatic / convert to "prepared + one-click approve" / off.
2. Paperless invite email timing default: after POA signed (planned) — or immediately at approval.
3. Near-billing escalation window: 10 days (planned) — confirm or change.
4. Approve default Hebrew texts for the two new templates before phase 3 QA.
