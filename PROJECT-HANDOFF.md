# PROJECT-HANDOFF.md

**Authoritative handoff for a fresh implementation session.**
Written 2026-08-07. Evidence taken from the repository and the live database, not from conversation memory.

| | |
|---|---|
| Repo | `guyashar1-ctrl/Tax-Calculatore` |
| Product | PIVO — CRM for a single accountant (Guy Yashar), Hebrew, RTL |
| Stack | React 18 + Vite 5 + TypeScript · Supabase (Postgres, Auth, Storage, Edge Functions/Deno) · Resend · Vercel |
| Live Supabase project | `uoweoqtuiettozagwgdw` (eu-west-1) |
| Production | `crm.yasharcpa.co.il`, deployed from `master` |

> **`CLAUDE.md` §5 is stale.** It claims localStorage-only storage and a missing `package.json`. Both are false. Trust the code and this document.

---

## 1. Product vision and approved lifecycle

One person moves along one track. The card is born at quotation **send**, and the journey page is the card.

```
Lead → Quotation → Approval → Representation → Onboarding Journey → Active client
                                                      │
                        ┌─────────────────────────────┼─────────────────────────────┐
                        │            │           │            │            │        │
                   Prev accountant  Paperless  Payment auth  Questionnaire  Close   │
                   (conditional)   (conditional) (after PL)  (conditional)          │
```

| Stage | Meaning | Where it lives |
|---|---|---|
| **Lead** | A person we spoke to. Lives in the `leads` table; may have a client card. No portal, no requests. | `#/clients` → לידים tab; `JourneyTab` lead chapter |
| **Quotation** | A priced offer. **Sending it creates the permanent client card and the permanent portal token.** | `QuotationBuilder`, `PublicQuotationPage` (`?quote=`) |
| **Approval** | Client approves and signs on the public page. Creates the engagement and generates onboarding steps. | `approve_quotation` RPC fan-out |
| **Representation** | Power of attorney across authorities (income tax, deductions, VAT, NI). 7 income-tax steps, an NI track per insured, one joint send. **Protected area — do not redesign.** | `RepresentationRequestReview`, `RepresentationExecutionCenter` |
| **Onboarding Journey** | One ordered list of requests derived from what was sold. | `OnboardingTab` embedded in `JourneyTab` |
| **Previous accountant** | Release letter → previous accountant signs on their own page and uploads materials. **The client does not sign; they are CC'd only.** Rule 16 objection window = 3 business days. | `release_letter`, `materials_received`, `PublicReleasePage` (`?release=`) |
| **Paperless** | Client connects their bookkeeping account. | `paperless_invite`, `paperless_connection` |
| **Payment authorization** | Monthly billing mandate. **Created inside the client's Paperless account, therefore hard-locked behind it.** | `retainer_authorization` |
| **Tax questionnaire** | Intake questionnaire feeding the dossier. | `intake_questionnaire`, `PublicIntakePage` (`?intake=`) |
| **Closing onboarding** | An explicit decision, blocked while required steps remain. | `close_onboarding` RPC |
| **Active client** | Ongoing work: filings, annual report, tasks, occasional requests. | `JourneyTab` active chapter + `ClientCockpitTab` |

---

## 2. Approved product decisions

Each is binding. Where the code enforces it, the enforcement point is named.

1. **One person, one record.** A lead that becomes a client is the same person — `leads.converted_client_id`. Never counted twice. Clicking a person always opens their journey (`ClientList.handleRowClick`, `journeyUi` branch).
2. **Onboarding starts only after quotation approval.** `generate_onboarding_steps` runs from `approve_quotation`; no other path creates an engagement.
3. **The representation email is sent automatically after approval.** This is the one approved automatic client email — `App.tsx:802`, `send-onboarding-email` with `force: true`, plus a 24-hour conditional nudge (`App.tsx:~309`) that only fires if the client signed but never filled the representation form.
4. **Paperless must precede payment authorization.** Enforced server-side, not in the UI: `retainer_authorization.depends_on_step_id = paperless_connection.id` at creation; `advance_onboarding_step` returns `error:'locked'`; skipping paperless returns `error:'paperless_required'` unless `skipReason ∈ {already_connected, transferred_rep, not_applicable}`.
5. **Every other client email requires an explicit manual action.** Nothing auto-sends. `EmailPreviewDialog` is the single gate: recipient, subject and body are shown, and the send happens on click. Deliberate non-send points are marked in code (`App.tsx:939-942` form production, `App.tsx:982-987` activation, `JourneyTab:399` portal page).
6. **One permanent client portal link.** `clients.portal_token`, minted once by `ensure_client_for_quotation`; `mint_portal_token` is idempotent. Re-sending never mints a second link. The portal is the client's only home.
7. **One ordered onboarding journey.** One list, ordered by `sort_order`, reorderable by the accountant. No parallel "progress" list duplicating the same steps.
8. **Required/optional is a property of each step, not of its type.** `OnboardingStep.requiredForClose`. The same type can be required in one journey and optional in another. *(Model implemented in code; DB column not yet applied — see §7.)*
9. **Normal closure is blocked while required steps are incomplete.** Enforced by the server: `close_onboarding` returns `{ok:false, error:'not_ready', readiness}` unless `p_force`.
10. **Manual override rules.** Override is a visually secondary action inside the close dialog — never a second permanent button, and no second browser confirm. It calls `close_onboarding(p_force := true, p_reason)`, which writes a `status_changed` row to `onboarding_events` with `{forced:true, readiness}` and queues an `onboarding_closed` notification. Skipped required steps remain open as requests.
11. **Completed onboarding becomes an active-client workflow.** The engagement flips to `active`, `refresh_lifecycle_stage_for` moves the person to `active`, the onboarding progress UI disappears, and any remaining requests are presented as open requests of an active client.
12. **Preserve everything that already exists.** Existing clients, sent quotations, PDFs, email records, public tokens, documents and signatures are immutable history. Branding changes affect live links by design and must be announced; past emails and PDFs never change.

Also standing: Hebrew/RTL everywhere · no new dependencies · "done = grey, not green" · colour only for exceptions · browser QA is the only accepted proof of done.

---

## 3. Architecture and relevant files

**No router library.** Hash routing in `src/lib/appRoute.ts` (there is no `vercel.json` on `master`, so path routing would 404 on refresh; the hash also avoids colliding with `?token` params).

| Route | Component |
|---|---|
| `#/tasks` (`#/desk`) | `src/components/TaskBoard.tsx` |
| `#/clients` | `src/components/ClientList.tsx` (+ `OnboardingGrid`, `quotations/LeadsPanel`) |
| `#/client/:id/:tab` | `src/components/ClientWorkspace.tsx` → tabs המסע / התיק / מסמכים / משימות |
| `#/documents/:id` | `src/components/DocumentManager.tsx` |
| `#/annual/:id/:year` | `src/features/annualReport/*` |
| `#/quotations`, `#/quotation/:id` | `src/components/quotations/*` |
| `#/firm` | `src/components/FirmProfileConsole.tsx` |
| `#/request-new`, `#/request/:id`, `#/request-fill/:id` | `RepresentationRequestForm/Review/FillForm` |
| `#/calculator/:id`, `#/reference` | `TaxCalculator`, `features/taxCenter/TaxCenter` |

**Public token pages** (checked before auth, `App.tsx:196-220`, wrapped in `.pivo-light`): `?quote=` `?portal=` `?sign=` `?intake=` `?release=` `?onboard=`.

**Journey core:** `clientTabs/JourneyTab.tsx` (chapters, next action, quotation timeline, lead facts) · `clientTabs/OnboardingTab.tsx` (request rows, progress header, close dialog, process builder switch) · `clientTabs/OnboardingProcessBuilder.tsx` · `clientTabs/AddRequestDialog.tsx` · `clientTabs/ClientCockpitTab.tsx` (exceptions, submissions board, tasks, year files) · `utils/journeyPresentation.ts` (pure derivations) · `types/onboarding.ts` (**the single source for close rules**).

**Design layer:** `src/index.css` (~4,000 lines, tokens + dark theme + `.pivo-light`), `components/ui/ui.css`, `components/ui/pivo-design.css`. The approved design package's palette, type scale and radii **already match these tokens exactly** — the package was generated from this codebase. Its real contribution is composition, not colour.

**Kill switches** in `profiles.settings.flags`: `journeyUi=false` restores the old 3-tab nav and 5-tab client card; `onboardingTab=false` removes all onboarding UI. Both must keep working.

**Edge functions (12):** `send-quotation-email`, `send-onboarding-email`, `send-step-email`, `send-release-email`, `notify-accountant`, `signing-session`, `portal-upload-document`, `ocr-document`, `backfill-email-html`, `quotation-reminders`, `resend-webhook`, `weekly-backup`. All email leaves only from these, via Resend.

---

## 4. Exact status of Phases 0–5

| Phase | Status | Evidence |
|---|---|---|
| **0 — Baseline** | **Fully implemented** | Branch created, typecheck baseline, `public_link_health()` clean, planning docs committed (`db0cfb2`) |
| **1 — Design system** | **Not implemented — and correctly so.** | Verified the token layer, `--fs-*` scale, `--r-*` radii and the shared empty/loading/error components already match the package character-for-character. Zero changes were needed. This is a finding, not an omission |
| **2 — App shell** | **Not implemented — and correctly so.** | Two-tab nav, edge tool, four-item avatar menu already matched design 16. Zero changes |
| **3 — Tasks** | **Partially implemented** | Done: page head, ball-chip counts, סוג column, responsive column drop. Not done: staged loading, drag-reorder persistence |
| **4 — Clients** | **Partially implemented** | Done: shared page head, row `⋯` menu, one lifecycle axis, «הכל» = all, operational view separated, advanced-filter badge fixed, archived de-emphasis, שע״ם label disambiguation. Not done: ת.ז./אימייל/מטפל columns (your ruling), pagination, "mine" filter |
| **5 — Journey** | **Partially implemented** | Done: next-action panel, lead facts, not-relevant state, quotation event timeline, approval-consequences, exceptions, submissions board, office tasks, year-file rows, folded history, onboarding progress header, close actions, close dialog, per-step required model. Not done: send-history/resend, "בקש עדכון מהלקוח", expandable authority table |

**Nothing in Phases 0–5 should be described as complete.** The onboarding close path in particular has only ever been exercised against the isolated preview, never against the live RPC.

---

## 5. Deviation register

Every known gap, explained. No opaque labels.

### A. Deferred by explicit decision

| # | Item | What exists | What is missing | Why deferred |
|---|---|---|---|---|
| 1 | **Client-page send history** | `email_messages` records every send with delivery/open stamps | There is **no "send the portal page" action at all**; the link is copied manually. No "last sent to X on Y" line, no resend dialog | Approved in principle; implementation is `docs/PLAN-ONBOARDING-SEND-POLICY.md` stages 1–3, requires migration 67-equivalent for `ensure_intake_token` |
| 2 | **Spouse recipient / token** | Spouse exists as flat fields, a `spouse` jsonb, and a **signer with their own `?sign=` token**. NI tracked per insured | No per-request recipient field; no separate portal token for a spouse | Token deferred: `get_client_portal` serves live pages, and recipient-filtering bugs would hide or leak requests. Label-only was approved |
| 3 | **Proposed tax-profile changes queue** | `SyncConfirmation` (annual report → card) is the only approval gate | Questionnaire and AI document extraction **write to the card directly, ungated**. No `proposed_changes` table, no propose/decide RPCs | Approved scoped to AI extraction first; not built |
| 4 | **Onboarding close categories** | Server returns a flat `blocking` array | No blocker / warning / background classification | Superseded by the per-step required/optional model, which is a better answer to the same problem |
| 5 | **Pagination and "מה שלי"** | All lists render fully; `employees` table and panel exist | No staged loading; no assignee-based filter | Real scale is 16 clients / 45 tasks / 38 documents. `Client.assigneeId` is explicitly `// מוכן לעתיד — כרגע לא בשימוש`, so a מטפל column would render empty |
| 6 | **Firm request-email templates** | `_shared/stepTemplates.ts` is shared by Vite and Deno so settings show exactly what the server sends | Design 13's separate templates section | Conflicts with the closed "one template system" ruling. Needs your decision: drop, or show read-only |
| 7 | **Auto-send portal page on approval** | — | Design 12's toggle (shown off) | Contradicts decision §2.5. Recommended: drop the toggle permanently |
| 8 | **Minor opt-ins** | — | Task drag-reorder persistence, clients Excel export, calculator "שמור כתרחיש", lead "לא רלוונטי" enum if absent | Each trivial and additive; batch-approve or drop |

### B. Product gaps found during review, still open

| # | Gap | Detail |
|---|---|---|
| 9 | **`generate_onboarding_steps` does not set `required_for_close`** | New engagements would take the `true` default for every step. Per-journey optionality for `data_import` / `data_verification` needs template work |
| 10 | **Journey templates carry no required/optional** | `journey_templates` (1 row live) stores a set of requests; it has no per-step required flag |
| 11 | **No way to edit an existing step's required flag** | Only creation offers the control |
| 12 | **`OnboardingJourneyMap` unreachable** | Rendered only when `!embedded`; the journey always embeds. Replaced by the progress header, but the map component is now dead code |
| 13 | **Custom-request naming fragility** | `payload.title` is now declared and honoured for every type, but nothing prevents a caller writing the name elsewhere |
| 14 | **Closing onboarding does not complete representation** | A client closed while representation is still in process correctly remains in the representation pipeline. Confirm this is intended |

### C. Package items never carried through

| # | Item |
|---|---|
| 15 | Design 05's expandable authority table inside the journey representation row |
| 16 | Design 06's "שלח שוב ללקוח" and "נשלח לאחרונה" on the active-client requests panel |
| 17 | Design 02's ת.ז. / אימייל / מטפל columns (hidden by your ruling) |
| 18 | Per-wizard designs for the seven Tax-Centre tools; annual-report engine screens; internal calculator — the package itself declares these undesigned |

---

## 6. Branches and commits

| Branch | Head | Role |
|---|---|---|
| `master` | `266f5302602773d67eeab7d20fdda8cd2e34378f` | Production. **Untouched throughout.** |
| `redesign/design-package-phases-0-5` | `d59c58a1c1be573e499096bf6c0c194dcada0287` | **The product branch.** 13 commits ahead of master. This is what ships |
| `review/phases-0-5-visual` | `3ff17ddda62a152d61842b3ff49b8e1ef9be9556` | **Review-only. Must never merge.** |

**Product branch commits (oldest → newest):**
`db0cfb2` planning docs · `2b45b93` tasks head/counts/type column · `86f9618` clients page head · `d78c22c` journey counter strip · `6290d3e` next action + lead facts + quotation timeline · `488d8d0` active-client composition · `a2d8a2f` lead wiring + DEV fixture harness · `91785eb` review-pass polish · `678928c` clients row menu + people count · `cd5b314` page-head wrapping at 375px · `b4470be` onboarding progress/actions + one lifecycle axis · `4b698c7` close blocked while required incomplete · `d59c58a` per-step required/optional model

**Review-only files — 11 files, 863 lines, none of which may reach `master`:**
`src/review/ReviewApp.tsx` · `src/review/fixtures.ts` · `src/review/closeReadiness.ts` · `src/review/supabaseStub.ts` · `src/review/main.review.tsx` · `src/review/review.css` · `index.review.html` · `vite.review.config.ts` · `vercel.json` (overrides the build command) · `.gitignore` (+`dist-review`) · `package.json` (+`build:review`, `dev:review`)

**Nothing needs transferring from review to product.** Every product change was authored on the product branch and the review branch is a rebase of it. `git diff redesign/design-package-phases-0-5..review/phases-0-5-visual` shows additions only.

One product file is DEV-only and *does* live on the product branch: `src/components/clientTabs/__TestJourney.tsx`, reached via `?test-journey`, compiled out of production by `import.meta.env.DEV`.

---

## 7. Database state

**Live counts (2026-08-07): 16 clients · 3 engagements · 33 onboarding steps · 3 quotations · 9 representation requests · 101 emails · 16 documents · 1 journey template. `public_link_health()` → `allHealthy: true` across 20 tokens.** This is real client data.

**Applied:** migrations `01` … `67` (latest `67-document-folders.sql`). Applied manually, not by CI. Live function snapshots in `supabase/live-2026-08-04/` and `supabase/live-2026-08-05/`.

**Written and NOT applied:** `supabase/68-onboarding-required-for-close.sql`. Verified against the live schema — `information_schema.columns` returns **0** rows for `onboarding_steps.required_for_close`, so the column does not exist.

**Live RPC behaviour today (read from `pg_get_functiondef`):**
- `close_onboarding(p_engagement_id, p_force, p_reason)` → checks ownership; if `status <> 'onboarding'` returns `{ok:true, noop:true}`; calls `onboarding_close_readiness`; **if not ready and not forced returns `{ok:false, error:'not_ready', readiness}`**; otherwise sets `status='active'`, logs the event, calls `refresh_lifecycle_stage_for`, queues `onboarding_closed`.
- `onboarding_close_readiness(p_engagement_id)` → today computes three type-specific counters (`retainer`, `releaseLetter`, `intake`) plus a `blocking` array of every open step **except** `representation_upgrade` and `first_month_review`. Two leniencies: a questionnaire in `waiting_client` counts as satisfied, and a release letter whose `due_date` has passed counts as `no_objection`.
- Read-only check on all three live engagements: `ready = false`, blocking = 6, 8, 6. **The server would refuse to close all of them.**

**Proposed schema change (migration 68):** add `required_for_close boolean` nullable → backfill → set `default true`, `not null`; add trailing `p_required_for_close boolean default true` to `create_onboarding_request`; replace `onboarding_close_readiness` with a single rule (`required_for_close` and not satisfied, minus the release-letter objection window).

**Backfill rules and their risk:**

| Rule | Value | Risk |
|---|---|---|
| `representation_upgrade`, `first_month_review` | `false` | None — reproduces today's exclusions |
| `intake_questionnaire` **in `waiting_client`** | `false` | **The delicate one.** Migration 68 removes the "sent = satisfied" leniency. Marking exactly the rows that relied on it keeps every currently-closable engagement closable. Get this wrong and live onboardings lock |
| everything else | `true` | None — reproduces today's blocking set |

**Rollback:** restore both functions from `supabase/live-2026-08-05/`, then `alter table public.onboarding_steps drop column required_for_close`. No other code reads the column.

**Standing SQL rules:** additive only · pull the live definition before `CREATE OR REPLACE` and archive it under `supabase/live-*` · one `.sql` file per migration plus a line in `supabase/MIGRATIONS.md` · run `public_link_health()` after each · status changes only through `advance_onboarding_step`.

---

## 8. The required/optional step model

**Single source of truth:** `src/types/onboarding.ts` — `DEFAULT_OPTIONAL_STEP_TYPES`, `SATISFIED_STATUSES`, `isStepRequiredForClose`, `isStepSatisfiedForClose`, `blockingStepsForClose`. Migration 68 is the server mirror.

| Layer | State |
|---|---|
| **Templates** | ❌ `journey_templates` has no required/optional field. Must be added so a journey can declare its own optionality |
| **Generated steps** | ❌ `generate_onboarding_steps` does not set the column. New steps would default to `true` |
| **Custom request creation** | ✅ `AddRequestDialog` has one checkbox, "נדרש לסגירת הקליטה", default checked; passes `p_required_for_close` |
| **Editing existing steps** | ❌ Not built |
| **Readiness calculation** | ✅ in code; ⚠️ server still type-based until 68 is applied |
| **Override** | ✅ Secondary link inside the close dialog, labelled "סגור בכל זאת · N נדרשים יישארו פתוחים". No second confirm |
| **Persistence** | ⚠️ `requiredForClose` is on the TS type and maps automatically via `stepFromDb` snake→camel, but the column does not exist yet |
| **Audit trail** | ✅ Forced closure writes `status_changed` to `onboarding_events` with `{forced:true, readiness}` and queues an `onboarding_closed` notification. Creation logs `{requiredForClose}` |

**Rules as approved:** a conditional step's *existence is its condition* — the generator only creates a release letter when there is a previous accountant, a retainer with monthly billing, paperless when it is in the journey — so a conditional step that exists is required. The questionnaire blocks until submitted, explicitly skipped, or marked optional. The only surviving leniency is the release-letter objection window (Rule 16), which is law rather than discretion.

---

## 9. Placeholder screens, actions and tabs

**In the product (real placeholders):**
- `clientTabs/OverviewTab.tsx` and `clientTabs/TaxProfileTab.tsx` — **zero importers, dead code.**
- `MyDesk.tsx`, `ClientForm.tsx` — no live imports.
- `OnboardingJourneyMap.tsx` — unreachable (§5 gap 12).
- `FirmProfileConsole` "בקרוב" items — deliberately inert.

**In the review environment only (not product):** client-card tabs התיק / מסמכים / משימות render an out-of-scope note; «התחל דוח שנתי», «+ משימה», «מרכז הייצוג», «הכן מכתב שחרור» open a toast (7 `setToast` call sites); the shell is a reproduction of `App.tsx`'s header; card-less leads are absent because `App` injects that panel.

---

## 10. Test and deployment setup

**Scripts (`package.json`):** `dev` · `build` (`tsc && vite build`) · `preview` · `test:setup` / `test:status` / `test:reset` · `verify:close-rules` · *(review branch only)* `build:review`, `dev:review`.

**There is no unit-test framework and no linter.** The only automated checks are `tsc --noEmit`, `vite build`, and `scripts/verify-close-rules.mjs` — 13 cases run against both the UI rule and the migration's rule, failing if either side drifts. All 13 pass.

**Manual QA is the accepted proof.** Dev server via `preview_start` with `.claude/launch.json` (`autoPort` — 5173 is often taken; read the real port from the logs). Sample clients are injected only when `import.meta.env.DEV && VITE_DEV_BYPASS_AUTHZ`; production builds compile all `?test-*` harnesses, dev auto-login and the seed away.

**Deployment:** Vercel builds the frontend from `master`. GitHub Actions (`.github/workflows/deploy-edge-functions.yml`) deploys **all** edge functions on pushes to `master` touching `supabase/functions/**`. Migrations are applied by hand.

**Isolated review environment** (review branch): `vite.review.config.ts` intercepts resolution of `src/lib/supabase.ts` and substitutes `src/review/supabaseStub.ts`, so no Supabase client, URL or key enters the bundle; `envPrefix` is set to an unused prefix so no `VITE_*` is inlined. Audited output contains none of `uoweoqtuiettozagwgdw`, `supabase.co`, the anon JWT, `GoTrueClient`, `@supabase/supabase-js`, `functions/v1`, `api.resend.com`. Network log after exercising every state: zero matching requests. Only `close_onboarding` is answered locally, through the shared rules.

---

## 11. Production-safety constraints

1. **Real client data is live.** Never delete, reset, advance a stage, or email a real client. Destructive testing only on the E2E sandbox; test sends only to `delivered@resend.dev`.
2. **No email leaves without a preview and a click**, except the approved automatic representation email (§2.3).
3. **Never mint a token to "refresh" a page.** Publishing a request does not issue a link.
4. **Sent quotations, PDFs and email records are immutable.** Quotation-settings changes apply to future quotations only.
5. **Branding changes reach live links immediately** (`?portal=` `?quote=` `?sign=` `?intake=` `?release=`) — announce before changing. Past emails and PDFs never change.
6. **SQL additive only.** Archive the live definition before replacing a function; `public_link_health()` after every migration.
7. **`git add` specific files only.** Parallel sessions run in this repo. Never stage `scripts/design-export-*`, `docs/PIVO-*`, or `כל המסכים ב HTML/`.
8. **Both kill switches must keep working** (`journeyUi`, `onboardingTab`).
9. **Do not merge the review branch.** Its `vercel.json` would redirect production's build command to the fixture app.
10. **Gmail dark mode inverts colours** — email backgrounds need explicit fills.
11. **Screenshot capture in this environment is unreliable** (stale and offset frames). Verify by DOM measurement and computed style, and say so.

---

## 12. Definition of done for the approved specification

The specification is done when all of the following hold **against production data on `master`**, each verified in a browser:

1. A lead can be created, edited, marked not-relevant, and converted by sending a quotation — and the same person is never counted twice anywhere.
2. Sending a quotation creates the client card and the permanent portal link, and the tracking timeline shows sent / delivered / viewed / reminded / approved from real records.
3. Approving a quotation opens the engagement, generates the ordered journey from what was sold, and sends exactly one automatic email: the representation link.
4. The onboarding journey shows one ordered list with, per step: its state, who holds the ball, whether it is required, and — only when blocked — the exact blocking step.
5. Paperless → payment authorization is unbreakable from the UI and from the API.
6. The previous-accountant flow runs end to end: letter prepared and sent, previous accountant signs on their own page and uploads materials, the checklist and the event log both reflect it, and the client never signs.
7. The questionnaire blocks closure when required, and does not when optional.
8. Required/optional is set from the journey template, adjustable per step at creation **and afterwards**, persisted in the database, and honoured identically by UI and RPC.
9. Normal closure is refused while any required step is open; the close dialog lists only those steps; the single secondary override closes with a recorded reason and leaves skipped steps open as requests.
10. After closure the person is an active client: the onboarding UI is gone, counts and pipelines update, and the next-action line never says "הכול מסודר" while work remains.
11. All six public links work for existing tokens, and `public_link_health()` is clean.
12. Both kill switches restore the previous experience.
13. `tsc`, `vite build` and `npm run verify:close-rules` pass; every screen verified at desktop and 375px, light and dark.
14. No existing client, quotation, document, signature or email record was altered.

---

## 13. Recommended execution order

Not another sequence of isolated preview patches. Each step ends verifiable against real data, and the app stays shippable throughout.

**Step 1 — Land what already works.** Review `redesign/design-package-phases-0-5` (13 commits) against production data with `journeyUi` on. Everything in it is UI composition on existing logic and needs no migration. Merging it early stops the branch drifting from `master`.

**Step 2 — Decide the six open product questions** before writing code: firm email-templates section (§5 #6), auto-send toggle (#7), minor opt-ins (#8), whether closure should complete representation (#14), whether ת.ז./אימייל/מטפל return (#17), and whether the annual "בקש עדכון" action is in scope.

**Step 3 — Complete the required/optional model, in this order:**
   a. Add the required flag to `journey_templates`.
   b. Teach `generate_onboarding_steps` to set `required_for_close` from the template.
   c. Add the edit-existing-step control.
   d. Extend `verify-close-rules.mjs` to cover template-driven generation.
   e. **Then** apply migration 68 — schema, backfill, functions — on a Supabase branch first, verifying that all three live engagements keep their current readiness, before touching production.

**Step 4 — Close the loop on closure.** Exercise the real `close_onboarding` on the E2E sandbox: blocked, optional-only, fully complete, and forced. Confirm the audit rows in `onboarding_events` and the notification queue.

**Step 5 — Send policy (deviation #1).** Implement `docs/PLAN-ONBOARDING-SEND-POLICY.md`: expose-vs-send separation, the `client_page` email kind, the open-items summary and the "last sent" line. This is the largest remaining user-visible gap.

**Step 6 — Proposed-changes queue (deviation #3), scoped to AI extraction first.** Today document extraction writes to the client card with no gate; that is the riskiest ungated write in the product.

**Step 7 — Clean-up.** Remove the dead components (§9), and either restore or delete `OnboardingJourneyMap`.

**Step 8 — Public pages last**, with the smallest possible diff, since real clients hold those links.

Throughout: one concern per branch, browser verification before any "done", and the isolated review environment (`review/phases-0-5-visual`) rebased rather than merged whenever a demo is needed.

---

## Appendix — key reading

`docs/PLAN-JOURNEY-CENTER.md` (the executed "journey is the card" plan and its closed decisions) · `docs/PLAN-ONBOARDING-SEND-POLICY.md` (the send policy, newest) · `docs/GAP-ONBOARDING-SPEC-2026-08-05.md` (gap analysis) · `docs/PLAN-DESIGN-PACKAGE-IMPLEMENTATION-2026-08-05.md` (the phased plan these branches followed) · `supabase/MIGRATIONS.md` · `supabase/live-2026-08-05/` (live function snapshots). `SPEC.md` predates the whole lifecycle domain and is a frozen historical artifact.
