# PLAN — Implementing the "Onboarding Management Redesign" Design Package
**Date:** 2026-08-05 · **Status: PLANNING ONLY — no code, DB, or data changed**
**Package:** "PIVO Design Package" (18 screen files + 5 state boards + Product Review + Coverage Checklist + Coverage Map + github.md), built against `guyashar1-ctrl/Tax-Calculatore@266f530` — **exactly the current HEAD of `master`**.

---

## 0. Repository state (verified)

- Branch: `master` · HEAD: `266f530` ("feat(documents): תיקיות בכרטיס הלקוח…") · clean except untracked: `docs/GAP-ONBOARDING-SPEC-2026-08-05.md`, `docs/PLAN-ONBOARDING-SEND-POLICY.md`, `docs/PIVO-CLIENT-LIFECYCLE-VISUAL.{html,pdf}`, `scripts/design-export-*.mjs`, `כל המסכים ב HTML/`.
- Live DB (`uoweoqtuiettozagwgdw`): 24 tables with **real data** — 16 clients, 14 tasks, 9 representation requests, 3 quotations, 3 engagements, 33 onboarding steps, 101 sent emails, 7 annual-report sessions. 12 active edge functions.
- Migration numbering: live max is **66b**; next free number is **67**, already claimed by `PLAN-ONBOARDING-SEND-POLICY` (which supersedes the GAP spec's competing claim). New migrations in this plan start at **68**.
- Two kill switches exist and must survive every phase: `profiles.settings.flags.onboardingTab=false` and `flags.journeyUi=false`.

## 1. Binding constraints this plan inherits (closed decisions — not reopened)

From `PLAN-JOURNEY-CENTER.md` (executed, merged), `JOURNEY-CENTER-STATUS.md`, and `PLAN-ONBOARDING-SEND-POLICY.md`:

1. Two-tab main nav (משימות · לקוחות); quotations = header tool; המשרד/ידע מס in avatar menu. ✔ Design complies.
2. Four client-card tabs: המסע · התיק · מסמכים · משימות; click on client → always Journey. ✔ Design complies.
3. Journey page shows **no tasks**; counters count journey requests only. ✔ Design complies.
4. **Exposure ≠ sending** — three separate actions: add as draft · open on client page · send the page. ✔ Design states this verbatim in screen 05's subtitle.
5. One template system — no separate email-templates screen; the email derives from the request's wording. ⚠ Screen 13 shows a "תבניות המייל של הבקשות" section — see Unresolved Decision U6.
6. Release letter: previous accountant signs, client is CC only. ✔ Screen 15 states this explicitly.
7. Done = grey, not green; color only for exceptions; minimalism. ✔ Design's own stated rule.
8. No new dependencies · Hebrew/RTL · 375px mobile QA · browser QA is the only proof of done · additive-only SQL · statuses only via `advance_onboarding_step` · no auto-emails · test sends only to `delivered@resend.dev` · destructive tests only on the E2E sandbox account.

## 2. Design-system reality

The package has **no token system** — every mockup uses inline styles on one fixed palette (canvas `#edeceA`, surface `#f8f7f5`, action `#3f5f8f`, danger `#a63a3a`, accent `#55337d`, text `#25282d/#63686f`, radii 7–14px, Heebo body / Manrope wordmark / Frank Ruhl Libre for client-facing headings only). The app **does** have a token system: `src/index.css` (3,980 lines — token layer + dark theme + `.pivo-light`), `src/components/ui/ui.css` (primitives), `src/components/ui/pivo-design.css` (1,803 lines — PIVO structural layer).

**Implementation rule: translate the package's de-facto palette into the existing token layer; never copy inline styles.** Client-facing surfaces (portal/quote/sign/intake/release + emails/PDFs) take their design from `FirmDocDesign` (design studio) via `quotationBranding.ts` / `_shared/designSystem.ts` — those token paths are firm branding, not app skin, and are barely touched.

## 3. Classification of the whole package

**A. Visual-only (restyle on existing data/logic)** — the large majority, and the package says so itself ("המלצות ויזואליות — בלי שינוי לוגיקה"): shell/header/nav/avatar/mobile bar, tasks board, clients table, journey chrome, dossier rail, documents manager, representation center (process explicitly unchanged), annual report, quotations list/builder, office settings, public pages' layout polish.

**B. Existing functionality that only needs repositioning** (data already stored, just surfaced elsewhere):
- Quotation send/delivery/view history (screens 04, 12 "מעקב" tab) — already in `quotations.events` + `email_messages` (delivered_at/opened_at/clicked_at via Resend webhook). Display-only.
- Copy-client-details block in the representation center (09) — data on the client record.
- Email log with per-client attribution (13, 17) — `EmailActivityModule` + `ClientEmailsSection` exist; design merges/expands them.
- Submission board / professional exceptions on active client (06) — reposition of `ClientCockpitTab` content.
- Onboarding columns per clients-list segment (02) — `OnboardingGrid` data merged into `ClientList` per-tab columns.
- Rep pipeline panel on the "בהצעה" tab (02) — counts from `representation_requests`.

**C. Missing UI states** (additive UI, no logic): load-failure and retry states, filtered-empty vs true-empty, save-failure with kept value (dossier), partial multi-upload failure list, duplicate folder name error, folder-delete policy dialog text (policy already real: files promote to root), already-signed / bad-link / retry on public pages (mostly exist — verify parity), "no permission" screen, migration banner styling, undo toast.

**D. Product-logic changes** — exactly the five flagged in the package as «לוגיקה חדשה — דורש החלטה» (§5 below), plus the already-approved send-policy work (`PLAN-ONBOARDING-SEND-POLICY`, migration 67) which the design's screen-05 dialogs assume.

**E. DB/migration requirements** — only from D: migration 67 (send policy — already planned), 68 (close-readiness categories, if approved), 69 (proposed-changes queue, if approved), 70 (spouse recipient/token — recommend defer). Everything in A–C requires **zero** migrations.

**F. Risks to existing assets** — global mitigations baked into every phase: never mint tokens to "refresh" pages; never redeploy edge functions except for approved migrations; quotation-settings changes apply to future quotations only (existing rule); sent emails/PDFs are frozen records; `.pivo-light` public-page tokens isolated from app-skin changes; all destructive/e-mail tests on the E2E sandbox + `delivered@resend.dev`; `public_link_health()` run after every phase that touches SQL.

## 4. The five proposed product-logic changes — analysis & recommendation

### 4.1 Client-page send history ("נשלח לאחרונה")
- **Today:** `email_messages` already records every send (to, subject, kind, sent/delivered/opened/clicked, client_id, step_id). But there is **no "send the portal page" action at all** — every email is per-request; the portal link is copied manually. So there is nothing to show history *of*.
- **Design proposes:** a "שלח שוב ללקוח" button with "last sent D.M · to X", and a resend dialog listing exactly what the client will see (and what's excluded).
- **Required changes:** exactly `PLAN-ONBOARDING-SEND-POLICY` stage 2 — new email kind `client_page` through `send-step-email` (or a thin sibling), a send button + `EmailPreviewDialog` variant whose item summary is built from `get_client_portal` output, and a "last sent" line derived by querying `email_messages where kind='client_page' and client_id=…`. **No new table, no new column.** Migration 67 (already specified) is a prerequisite only for the questionnaire-exposure part.
- **Backward-compat risks:** low. Additive kind; `mint_portal_token` is idempotent so resend can never mint a second link.
- **Recommendation: APPROVE.** It is the already-written send-policy plan; the design merely gives it its screen.

### 4.2 Separate spouse recipient/token
- **Today:** the portal token belongs to the client (`clients.portal_token`, one permanent link). The spouse exists as (a) flat fields + `spouse jsonb` on the client, (b) a **signer** with their own `sign_token` (`?sign=` works per person today), (c) NI execution tracked per insured. There is no per-request "recipient" field and no spouse portal.
- **Design proposes:** each request carries a precise recipient (לקוח · בן/בת זוג · רו״ח קודם · איש קשר · המשרד), and the spouse gets **their own portal token/page**.
- **Required changes:** `payload.recipient` on `onboarding_steps` (additive) + UI in `AddRequestDialog`; then — the heavy part — a second portal token store, `get_client_portal` filtered by recipient, email routing per recipient, portal rendering per audience. Touches the token semantics you explicitly told me to preserve.
- **Backward-compat risks:** high. `get_client_portal` serves live clients right now; recipient-filtering bugs would hide or leak requests on real pages. A second permanent link per household breaks "one permanent link is the client's only home" unless carefully scoped.
- **Recommendation: DEFER the token; APPROVE the label.** Add `recipient` as a display/routing label on requests (additive payload field, shown in UI and email addressing) without a separate portal. The spouse-signing need is already covered by per-signer `?sign=` links. Revisit a spouse portal when a real case demands one.

### 4.3 Approval workflow for proposed Tax Profile ("תמונת המס") changes
- **Today:** no pending-change concept anywhere (grep confirms). `submit_onboarding_full`, `save_intake_answer` write directly to the card (with "blank never overwrites" coalesce protection); documents-screen AI extraction (`onApplyExtractedData`) writes directly with **no gate**; the only approval pattern is `SyncConfirmation` (annual report → card).
- **Design proposes:** all four writers (questionnaire, AI extraction, annual report, update-request) *propose*; a "שינויים שממתינים לאישורך" table in the dossier with per-field provenance; the accountant approves/rejects; screen 05's close dialog embeds the same approval card.
- **Required changes:** new table `proposed_changes` (id, client_id, field_path, proposed_value, current_value_snapshot, source, source_ref, status, created_at, decided_at) + RPCs `propose_client_change` / `decide_client_change` (migration 69, additive); reroute the AI-extraction write and the intake write paths to propose instead of write; dossier UI section; badge counts on the rail.
- **Backward-compat risks:** medium. Rerouting `save_intake_answer`'s card-sync would change what a live client's questionnaire does mid-flight — sequence it so the queue exists and is visible *before* any writer is rerouted; annual report keeps `SyncConfirmation` (it already *is* an approval — just restyle it).
- **Recommendation: APPROVE, SCOPED.** Phase A: build the queue + reroute **AI extraction only** (today's riskiest ungated write). Phase B (separate approval): reroute questionnaire writes. Annual report unchanged.

### 4.4 Onboarding-close categories (blocker / warning / background)
- **Today:** `close_onboarding` + `onboarding_close_readiness` return `not_ready` + a readiness list; the UI shows a `window.confirm` with prose and a `p_force` override.
- **Design proposes:** the server classifies each open condition as חוסם / אזהרה שממשיכה ברקע / תהליך רקע; a real close dialog groups them, embeds the tax-picture approval card (→ 4.3), and requires an explicit override checkbox with a logged reason.
- **Required changes:** migration 68 — additive: `onboarding_close_readiness` returns a `category` per item (pure classification of the existing conditions; no behavior change to `close_onboarding` gates); new `OnboardingCloseDialog` component replacing `window.confirm`; log the override reason into `onboarding_events`.
- **Backward-compat risks:** low. Classification is read-only metadata on an existing RPC response; `p_force` semantics unchanged. Care: this RPC is not in the protected set (`sync_representation_step` / `generate_onboarding_steps` are — untouched).
- **Recommendation: APPROVE.** Matches GAP Tier-A gap #2; small, additive, high daily value.

### 4.5 Progressive loading / pagination + assignee-on-row
- **Today:** all lists render fully; real scale is 16 clients / 45 tasks / 38 documents — nothing is slow. `employees` table + `EmployeesPanel` exist; tasks/clients have no assignee surfaced per row.
- **Design proposes:** staged loading ("מוצגות 6 מתוך 14") on clients/tasks/documents, and a "מטפל" column as the precondition for a "מה שלי" filter.
- **Required changes:** for staged loading — client-side slicing now, real pagination (range queries) later; for assignee — surfacing existing data is trivial, but a real "mine" filter needs an assignee column consistently written on tasks/clients.
- **Backward-compat risks:** none technical; the risk is wasted work — at current scale this is speculative.
- **Recommendation: DEFER pagination** (the designed states can be added later without redesign). **Show the "מטפל" column where data exists** (visual-only), defer the "mine" filter until assignment is actually practiced.

## 5. Phased implementation plan

Ordering principle: shared foundation first (tokens → shell), then internal screens from lowest to highest coupling, product-logic phases gated on approval, public client-facing pages **last** with the smallest possible diff. The app builds, runs, and passes browser QA after every phase; every phase is one revertible commit series on a feature branch (`redesign/phase-N-…`), merged to `master` only after browser acceptance passes. Vercel deploys from `master`, so merging = shipping; phases not ready to ship stay on their branch.

---

### Phase 0 — Baseline & safety net
- **Screens/routes:** none changed.
- **Actions:** verify live values of `flags.journeyUi` / `flags.onboardingTab`; run `select public_link_health()`; refresh live-function snapshot (`scripts/dump-live-functions.mjs` → `supabase/live-2026-08-XX/`); baseline screenshots (desktop + 375px, light + dark) of all 13 internal routes and all 6 public token pages using the E2E sandbox account; record the real dev port from `preview_logs`.
- **Visual/logic:** none. **Migrations:** none. **Dependencies:** none. **Risk:** none.
- **Verification:** screenshot inventory complete; `public_link_health()` clean.
- **Rollback:** n/a.

### Phase 1 — Design-system foundation (tokens + primitives)
- **Screens/routes:** all internal screens change appearance at once; no structure changes.
- **Files:** `src/index.css` (token values only: canvas/surface/action/danger/accent/borders/text ramp, mapped into the existing `--desk/--page/--card/--br/--tx*/--ok/--warn/--err` names + dark-theme equivalents), `src/components/ui/ui.css` (`ui-btn*`, `ui-modal` radii, toast), `src/components/ui/pivo-design.css` (frame/typography scale), `ui/States.tsx` (one empty/loading/error template per the design), `ui/Toast.tsx` (undo support).
- **Visual/logic:** visual-only. **Migrations:** none. **Dependencies:** Phase 0.
- **Risk:** medium — global cascade. Explicitly out of scope: `.pivo-light` client-page values and everything derived from `FirmDocDesign` (portal/quote/emails/PDFs must be pixel-identical after this phase).
- **Verification:** side-by-side vs Phase-0 baselines on every internal route; **public pages diffed and unchanged**; dark mode; console clean.
- **Acceptance tests:** open `#/tasks`, `#/clients`, one client card → new palette; open sandbox `?portal=` and `?quote=` → identical to baseline.
- **Rollback:** revert the CSS commits (no JS/DB coupling).

### Phase 2 — App shell (screen 16)
- **Screens/routes:** header/nav/avatar menu/mobile bottom bar on all routes; login, no-permission, initial-loading states; failed-mail + migration banners.
- **Files:** `src/App.tsx` (nav ~1427–1544, mobile bar ~1836–1853, auth gate ~1402–1415), `FailedNotificationsBanner.tsx`, `LegacyMigrationBanner.tsx`, login/no-access components.
- **Visual/logic:** visual-only (nav architecture already matches the closed decisions). **Migrations:** none. **Dependencies:** Phase 1.
- **Risk:** medium — `App.tsx` is a 1,953-line god component shared with all flows; edits must be surgical.
- **Verification:** all breakpoints; avatar menu; banners; legacy deep-links `#/desk`, `#/client/:id/overview`, `#/client/:id/onboarding` still redirect; `journeyUi=false` still restores legacy nav.
- **Acceptance tests:** log out/in (magic link screen restyled); visit an unauthorized account (sandbox) → styled no-permission screen; mobile bar shows only משימות/לקוחות.
- **Rollback:** revert commits; flag `journeyUi=false` remains the emergency escape.

### Phase 3 — Tasks (screens 01 + client-tasks half of 17)
- **Screens/routes:** `#/tasks` (+`#/desk` alias), `#/client/:id/tasks`.
- **Files:** `TaskBoard.tsx`, `TaskCard.tsx`, `TaskForm.tsx`, `utils/taskUtils.ts`, `clientTabs/TasksActivityTab.tsx`, `OnboardingWaitingSection.tsx` (placement only).
- **Visual/logic:** visual + additive states (undo toast, visible zero-count group, filtered-no-results vs true-empty, load-failure). Excluded pending decisions: staged "show more" (→ 4.5), drag-reorder persistence (optional, flag U8).
- **Migrations:** none. **Dependencies:** Phases 1–2. **Risk:** low.
- **Verification:** golden path — create task → edit → complete (toast + undo) → delete (confirm) → refresh persists; grouping/sort orders unchanged vs `taskUtils`.
- **Acceptance tests:** as above on desktop + 375px; pinned group behavior preserved (localStorage pins); client-tasks tab shows identical language filtered to the client.
- **Rollback:** revert; no data shape touched.

### Phase 4 — Clients list (screen 02)
- **Screens/routes:** `#/clients` (all five segment tabs + leads).
- **Files:** `ClientList.tsx` (887), `OnboardingGrid.tsx` (columns fold into per-segment table), `RepSignersStatus.tsx`, `quotations/LeadsPanel.tsx`, `QuickCreateClient.tsx`, `ClientDeleteDialog.tsx`.
- **Visual/logic:** visual + repositioning (segment-specific columns; rep-pipeline counts panel on "בהצעה"; advanced-filters panel). "מטפל" column shows existing data only. Excluded: staged scroll loading (→ 4.5), "מה שלי" filter (→ 4.5), Excel export (optional, U8).
- **Migrations:** none. **Dependencies:** Phase 3 (shared table idiom). **Risk:** medium — Guy's main working screen; segment counts logic (`lifecycleStage` + open-steps count) must not change.
- **Verification:** counts per tab match pre-change values against live data; row click still always opens Journey; delete dialog still enumerates related rows.
- **Acceptance tests:** switch all five tabs; search; advanced filter; create lead → appears in לידים; mobile card layout.
- **Rollback:** revert; `OnboardingGrid` kept intact until the fold-in is verified, then removed in a separate commit.

### Phase 5 — Journey: lead, quotation, active client (screens 03, 04, 06)
- **Screens/routes:** `#/client/:id/journey` in stages lead/quoted/active.
- **Files:** `clientTabs/JourneyTab.tsx`, `clientTabs/ClientCockpitTab.tsx`, `ClientWorkspace.tsx` (header/chips/badges — also fixes the duplicated rep-status display, Product Review §3.3), `EmailActivity/ClientEmailsSection.tsx`.
- **Visual/logic:** visual + repositioning. Quotation send/view history rendered from existing `quotations.events` + `email_messages`; "מה יקרה כשתאושר" panel is static explanatory content; active-client exceptions/submission board reposition `ClientCockpitTab` data; lead "לא רלוונטי" state — verify existing lead status supports it (it does: leads keep a status; if a value is missing it is a one-line additive enum in the lead record, flag U8 if so). "שלח שוב ללקוח" footer appears only after Phase 7.
- **Migrations:** none. **Dependencies:** Phase 4. **Risk:** medium — must render cleanly for the majority case: active client with no engagement and no quotation history (14 of 16 live clients).
- **Verification:** open one client per lifecycle stage on the sandbox; legacy client (no engagement) renders with no empty-state errors; expired/approved quotation states.
- **Acceptance tests:** lead → build quotation CTA routes to builder; quotation stage shows history timeline with real timestamps; active client shows folded "מה היה עד כה".
- **Rollback:** revert; JourneyTab is self-contained.

### Phase 6 — Send-policy foundation (**approved product logic — gated on your explicit go**)
- **Screens/routes:** no new screen; enables screen-05/06 dialogs. Implements `PLAN-ONBOARDING-SEND-POLICY` stages 1–3.
- **Files:** migration **67** (additive: `get_client_portal` shows the questionnaire in `pending`/`in_progress`; new idempotent `ensure_intake_token` called on exposure, not send), `supabase/functions/send-step-email` (new kind `client_page`) or thin sibling, `EmailPreviewDialog.tsx` (open-items summary built from `get_client_portal` + "last sent" line from `email_messages`), `OnboardingTab.tsx:487-494` (decouple expose from the email dialog), rename `sendNow` → `visibleNow`.
- **Visual/logic:** **product logic.** **Migrations:** 67. **Dependencies:** Phases 1–2 only (can run parallel to 3–5).
- **Risk:** high-ish — `get_client_portal` serves live client pages. Mitigations: pull live definition first, archive under `supabase/live-*`, additive change only, `public_link_health()` after, verify a live client's portal renders identically for already-published items.
- **Verification:** sandbox client — add draft (no email, invisible on portal) → expose (visible on portal, **no email sent**, no token minted twice) → send page (one email to `delivered@resend.dev`, `email_messages` row kind `client_page`) → resend (same link, "last sent" line updates).
- **Acceptance tests:** the three-action separation exactly as the iron rule states; questionnaire visible on portal before any email exists.
- **Rollback:** UI revert + migration 67 is additive (old behavior preserved for published items); edge-function version rollback via redeploy of previous version.

### Phase 7 — Onboarding journey screen (screen 05)
- **Screens/routes:** `#/client/:id/journey` in stage onboarding — the package's namesake screen.
- **Files:** `clientTabs/OnboardingTab.tsx`, `clientTabs/AddRequestDialog.tsx` (recipient label per 4.2's approved subset; requirement builder; "ייפתח רק אחרי" dependency selector — **verify against existing `depends_on_step_id` support before promising UI**, additive if missing → flag), `clientTabs/OnboardingProcessBuilder.tsx`, `clientTabs/JourneyTemplatesDialog.tsx`, `utils/onboardingNext.ts`, new `OnboardingCloseDialog.tsx` (replaces `window.confirm`; categories arrive with migration 68 if 4.4 approved — otherwise ships with the existing flat readiness list), terminology renames (בקשה · פתח בדף הלקוח · המשרד · 5 visible states · «לא נדרש») — **UI strings only, after grepping emails/templates for each renamed word** (Product Review §11 warning).
- **Visual/logic:** visual + the three-action UI (logic from Phase 6) + optional migration-68 close categories.
- **Migrations:** 68 (only if 4.4 approved). **Dependencies:** Phases 5, 6. **Risk:** **high** — 3 live engagements; the daily working screen.
- **Verification:** full flow on sandbox: build process → publish → add draft request → expose → send page → advance/skip (paperless gate refuses without valid skipReason) → close with open items (categories or flat) → override logs a reason to `onboarding_events`.
- **Acceptance tests:** desktop + 375px; locked retainer row shows the paperless lock hint; failure state ("הפתיחה נכשלה — נשארה טיוטה") on a forced error; live clients' screens spot-checked read-only.
- **Rollback:** revert UI commits; migration 68 additive; `onboardingTab=false` remains the nuclear option.

### Phase 8 — Client File / dossier (screen 07)
- **Screens/routes:** `#/client/:id/dossier`.
- **Files:** `clientTabs/ClientDossierTab.tsx`, `clientTabs/PersonalContactsTab.tsx` (2,066 lines — restyle in slices), `clientTabs/TaxNITab.tsx`, `clientTabs/dossierSection.tsx` (rail + badges), `clientTabs/TaxFilesSection.tsx`, "בקשת עדכון מהלקוח" dialog (uses Phase-6 draft/expose primitives), save-failure state, field search, update-history panel.
- **Visual/logic:** visual + additive states. The "שינויים שממתינים לאישורך" queue ships **only if 4.3 approved** → migration 69 + `propose/decide` RPCs + rerouting AI-extraction writes (Phase 9 hooks into it).
- **Migrations:** 69 (only if 4.3 approved). **Dependencies:** Phase 7 (shared request primitives). **Risk:** medium-high — immediate-save on ~50 real-data fields; no field may lose its value on failed save.
- **Verification:** edit field → network-fail simulation → value stays in field + retry works; search opens all groups; mobile rail→selector.
- **Acceptance tests:** golden path edit+save on sandbox; proposed-change approve/reject if enabled; registered-file amber chip unchanged.
- **Rollback:** revert; migration 69 additive (queue table unused if UI reverted).

### Phase 9 — Documents (screen 08)
- **Screens/routes:** `#/documents/:clientId` (+ docs tab).
- **Files:** `DocumentManager.tsx` (1,686), `useDocumentStore.ts`, preview pane, dialogs (new folder, rename+duplicate-name error, delete with real policy text, folder upload progress + partial-failure list, move, copy-to-client, edit+replace-file, AI results).
- **Visual/logic:** visual + additive states. AI-extraction "החל על התיק" becomes a proposed change **only if 4.3 approved** (design flags this inline); otherwise the current direct-write stays with its existing confirmation.
- **Migrations:** none (69 already exists if 4.3 approved). **Dependencies:** Phase 8. **Risk:** medium — folder system shipped days ago; storage bucket paths untouched.
- **Verification:** upload/rename/move/delete-folder (files promote to root — confirm live behavior matches dialog text); multi-select ZIP/copy; cross-folder search.
- **Acceptance tests:** full folder golden path on sandbox + one failure path (oversize file) on desktop + 375px.
- **Rollback:** revert; no schema/storage change.

### Phase 10 — Representation center (screen 09)
- **Screens/routes:** `#/request-new`, `#/request/:id`, `#/request-fill/:id`.
- **Files:** `RepresentationRequestReview.tsx`, `RepresentationExecutionCenter.tsx`, `RepresentationNextStep.tsx`, `RepresentationRequestForm.tsx`, `RepresentationOnboardingDialog.tsx`, `RepSignersStatus.tsx`.
- **Visual/logic:** **visual-only by declared contract** — the process (7 steps, NI per insured, joint send, two NI files) is a protected area. Copy-details block = repositioning of existing client data. Mail-not-delivered recovery = existing `email_messages` failure data surfaced.
- **Migrations:** none. **Dependencies:** Phase 1–2 only (independent of 6–9). **Risk:** medium — 9 live representation requests; discipline: zero behavior change.
- **Verification:** walk a sandbox request through form→review→execution; signature/stamp dialog unchanged functionally; joint-send preview only.
- **Acceptance tests:** existing golden path re-run identical to pre-phase recording; no email leaves without preview.
- **Rollback:** revert; nothing else depends on it.

### Phase 11 — Annual report (screen 10)
- **Screens/routes:** `#/annual/:clientId/:year`.
- **Files:** `features/annualReport/*` (AnnualReport, Entry, Questionnaire, CoverageGate, CoverageRail, SyncConfirmation, Output, TaxConstantsDashboard, TreeMapView).
- **Visual/logic:** visual + terminology (מה חסר לדוח · טופס 1301 · עץ ההחלטות — UI strings only) + additive states (override confirmation with audit already partially exists — verify; document-tracking click-cycle exists — restyle). `SyncConfirmation` restyled, not rerouted.
- **Migrations:** none. **Dependencies:** Phase 1–2. **Risk:** low-medium — internal tool, 7 live sessions; answers data untouched.
- **Verification:** open a live session read-only; run a sandbox year end-to-end through the five stages.
- **Acceptance tests:** questionnaire "לא בטוח" flows into open items; sync dialog approve/skip; output mapping renders.
- **Rollback:** revert.

### Phase 12 — Quotations list + builder (screens 11, 12)
- **Screens/routes:** `#/quotations`, `#/quotation/:id`.
- **Files:** `quotations/QuotationsPipeline.tsx`, `quotations/QuotationBuilder.tsx` (1,838 — slices), `QuotationSettings.tsx`, catalog panel, `QuotationEmailsPanel.tsx` (becomes the "מעקב" tab data source), send dialog, validation gate (client-side jump-to-field), approved-quote lock (verify current behavior; enforce in UI if missing — additive).
- **Visual/logic:** visual + repositioning (tracking tab = existing events/emails). Settings remain future-quotations-only (existing rule, restated in UI). **`QuotationWebView` (the public rendering) untouched** except tokens from the studio.
- **Migrations:** none. **Dependencies:** Phase 5 (journey quotation rows link here). **Risk:** medium — 3 live quotations; sent artifacts frozen.
- **Verification:** draft → validate (errors block send) → test-send to self → send to sandbox → tracking tab shows timeline; existing sent quotation opens read-only identical.
- **Acceptance tests:** the existing `?quote=` page for a **live** token renders byte-identically pre/post phase.
- **Rollback:** revert.

### Phase 13 — Office settings + email log + design studio (screens 13, 17-email-log, 18)
- **Screens/routes:** `#/firm` (all sections).
- **Files:** `FirmProfileConsole.tsx` (910), `LogoAssetsPanel.tsx`, `EmailActivityModule.tsx`, `QuotationDesignStudio.tsx`, `EmployeesPanel.tsx`, notifications section, paperless section.
- **Visual/logic:** visual + additive states (four save-button states, RLS-error save-failure with kept draft, "בקרוב" idiom). Notification matrix = existing single-gate toggles (commit d8f5bca) restyled. **Templates section (U6) excluded until decided.** Studio gains contrast warning (client-side check) — its saved contract ("applies to live links, past emails frozen") is existing behavior, now stated in UI.
- **Migrations:** none. **Dependencies:** Phase 1–2. **Risk:** low-medium — `profiles` writes only; branding changes affect live links **by design** (warn in UI, as the package does).
- **Verification:** each section saves; studio change → sandbox portal reflects it, past sent email unchanged; failed-mail detail panel resend goes through preview.
- **Acceptance tests:** save-failure path (forced) keeps draft in browser; employees color drives "מטפל" column.
- **Rollback:** revert; `FirmDocDesign` values are user data, untouched by rollback.

### Phase 14 — Public client pages (screens 14, 15) — **last, smallest diff**
- **Screens/routes:** `?portal=`, `?quote=`, `?sign=`, `?intake=`, `?release=`, `?onboard=`.
- **Files:** `PublicPortalPage.tsx`, `PublicQuotationPage.tsx`, `PublicSignPage.tsx`, `PublicIntakePage.tsx` + `PublicIntake.tsx`, `PublicReleasePage.tsx`, `OnboardingPage.tsx`, `ui/ClientPageState.tsx`.
- **Visual/logic:** minimal alignment only. The portal was designed and browser-tested this week and the package itself discourages changing it; most "design" here is firm branding via the studio (Phase 13) and already applies. Work is limited to: state parity (bad-link/already-signed/failure/retry exist — verify each), the spouse-directed-request display (label only, per 4.2 decision), the "what never appears here" checklist audit, and mobile polish.
- **Migrations:** none. **Dependencies:** Phases 6, 13. **Risk:** **high per unit of change** — real clients hold these links; hence last, and near-zero diff.
- **Verification:** every token type on the sandbox account in every designed state, desktop + 375px, light forced (`.pivo-light`); `public_link_health()`; a live client's portal opened read-only and compared to pre-phase screenshot.
- **Acceptance tests:** portal golden path (upload, questionnaire continue, locked item), sign already-signed state, release partial-upload state, quote approved/expired states.
- **Rollback:** revert single-page commits; tokens and server responses untouched.

### Phase 15 (optional hygiene) — dead code removal
`clientTabs/OverviewTab.tsx`, `clientTabs/TaxProfileTab.tsx`, `MyDesk.tsx`, `ClientForm.tsx`, `__Test*` components kept behind DEV — remove after Phases 2–8 confirm no references. Zero user-visible change; separate commit; trivially revertible.

## 6. Design-to-code coverage matrix

| # | Design file | Route(s) | Component(s) | Classification | Phase |
|---|---|---|---|---|---|
| 01 | Tasks | `#/tasks`, `#/desk` | `TaskBoard`, `TaskForm`, `taskUtils` | Visual + states (staged-load deferred) | 3 |
| 02 | Clients | `#/clients` | `ClientList`, `OnboardingGrid`, `LeadsPanel` | Visual + repositioning (pagination/mine-filter deferred) | 4 |
| 03 | Journey — Lead | `#/client/:id/journey` | `JourneyTab` | Visual + states | 5 |
| 04 | Journey — Quotation | `#/client/:id/journey` | `JourneyTab` + quotations data | Repositioning (history exists in DB) | 5 |
| 05 | Journey — Onboarding | `#/client/:id/journey` | `OnboardingTab`, `AddRequestDialog`, `OnboardingProcessBuilder`, `JourneyTemplatesDialog` | Visual + product logic (send policy, close dialog) | 6+7 |
| 06 | Journey — Active | `#/client/:id/journey` | `JourneyTab`, `ClientCockpitTab` | Visual + repositioning | 5 |
| 07 | Client File | `#/client/:id/dossier` | `ClientDossierTab`, `PersonalContactsTab`, `dossierSection`, `TaxFilesSection` | Visual + states; proposed-changes queue = decision | 8 |
| 08 | Documents | `#/documents/:id` | `DocumentManager`, `useDocumentStore` | Visual + states; AI-approval = decision | 9 |
| 09 | Representation | `#/request-new`, `#/request/:id`, `#/request-fill/:id` | `RepresentationRequestReview`, `ExecutionCenter`, et al. | Visual-only (protected process) | 10 |
| 10 | Annual Report | `#/annual/:id/:year` | `features/annualReport/*` | Visual + terminology | 11 |
| 11 | Quotations List | `#/quotations` | `QuotationsPipeline`, `QuotationSettings`, catalog | Visual + repositioning | 12 |
| 12 | Quotation Builder | `#/quotation/:id` | `QuotationBuilder`, `QuotationEmailsPanel` | Visual + repositioning (tracking tab) | 12 |
| 13 | Office Settings | `#/firm` | `FirmProfileConsole` + panels | Visual + states (templates section = U6) | 13 |
| 14 | Client Portal | `?portal=` | `PublicPortalPage` | Minimal alignment (recently shipped & tested) | 14 |
| 15 | Public Pages | `?quote= ?sign= ?intake= ?release= ?onboard=` | `PublicQuotationPage`, `PublicSignPage`, `PublicIntake(Page)`, `PublicReleasePage`, `OnboardingPage` | Minimal alignment; state parity audit | 14 |
| 16 | App Shell + Tax Tools | all; `#/reference`, `#/calculator/:id` | `App.tsx`, `TaxCenter`, `TaxCalculator` | Visual + states ("save as scenario" = U8) | 2 (+11-adjacent for tools) |
| 17 | Client Tasks + Email Log | `#/client/:id/tasks`; `#/firm→פעילות מייל` | `TasksActivityTab`, `EmailActivityModule` | Visual + repositioning | 3 + 13 |
| 18 | Design Studio | `#/firm→עיצוב` | `QuotationDesignStudio`, `quotationDesignPresets` | Visual + contrast check | 13 |
| — | State boards + Onboarding Management | — | direction reference only | — | — |
| — | Product Review / Coverage docs | — | source for this plan's classifications | — | — |

Package gaps (declared by the package itself): the seven inner Tax-Center tools designed as one frame only; annual-report "עץ ההחלטות"/"מסד נתוני מס" not fully designed; internal `TaxCalculator` designed from visible fields only; no mobile frames for screens 09–12, 15, 16. These screens get the token/idiom treatment without a per-screen mockup.

## 7. Unresolved product decisions requiring approval

- **U1 (=4.1) Send history / send-the-page:** recommend **approve** (it is the send-policy plan). Gates Phase 6.
- **U2 (=4.2) Spouse recipient/token:** recommend **label now, token deferred**. Affects Phases 7, 14 display only.
- **U3 (=4.3) Proposed-changes queue:** recommend **approve scoped to AI extraction first**; questionnaire rerouting as a later explicit step. Gates parts of Phases 8, 9; migration 69.
- **U4 (=4.4) Close categories:** recommend **approve**; migration 68. Gates part of Phase 7.
- **U5 (=4.5) Pagination + "mine" filter:** recommend **defer**; show "מטפל" column only.
- **U6 Screen 13 "תבניות המייל של הבקשות":** conflicts with the closed one-template-system ruling (2026-08-05). Options: (a) drop the section; (b) reinterpret it as a read-only display of `_shared/stepTemplates.ts` system templates (paperless etc.) with the existing customization point. Recommend (b) — but it's your ruling to reopen or not.
- **U7 Quotation-builder toggle "לשלוח את הדף האישי אוטומטית" (designed off):** adds an auto-send setting that the send-policy explicitly avoids. Recommend **drop the toggle** (auto-*expose* is the open GAP question, and even that is "notify Guy, not the client").
- **U8 Minor opt-ins:** task drag-reorder persistence; clients Excel export; calculator "שמור כתרחיש"; lead "לא רלוונטי" enum value if missing. Each trivial and additive — batch-approve or drop.
- **U9 Untracked plan docs:** commit `docs/GAP-ONBOARDING-SPEC-2026-08-05.md`, `docs/PLAN-ONBOARDING-SEND-POLICY.md`, and this file to git (recommended), or keep untracked.

## 8. Recommended implementation order

0 → 1 → 2 → 3 → 4 → 5 → **[approval gate: U1–U5]** → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → (15).
Phases 10–13 are independent of 6–9 and can interleave if a lighter week is needed; 14 is always last. Every phase ends browser-verified (desktop + 375px, dark mode, clean console) and individually revertible; `master` stays deployable throughout.

## 9. Statement of no changes

This session made **no changes** to application code, the database, production data, edge functions, public links, tokens, emails, PDFs, or existing quotations. The design package was extracted to the session scratchpad only. The single file created is this planning document.
