# Findings — Representation resume/persistence incident + Office Management process visibility

> Discovery run, 2026-09-17, against `master` @ `6c34856` (+ uncommitted worktree) and production DB (read-only).
> No code, migrations or commits were made. Companion to `docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md`.

---

## A. ROOT CAUSE

**The customer-facing representation form (`?onboard=<token>`, [OnboardingPage.tsx](../src/components/OnboardingPage.tsx)) keeps steps 1–3 (identity, contact, family/spouse) exclusively in React component state and writes them to the server only in one all-or-nothing call at the end of step 4 (`submit_onboarding_full`). Step 4's "Next" is blocked client-side until an ID image exists (`validateStep(4)` → `missingIdentity`). So a customer who reaches step 4 without an ID image cannot trigger the only persistence point; closing/refreshing discards everything they typed.**

Evidence chain:

| # | Fact | Where |
|---|---|---|
| 1 | All form fields are `useState` in the component; there is no draft save, no `localStorage`/`sessionStorage`, no partial RPC. | `OnboardingPage.tsx:60-100`; grep confirms no storage APIs in any public page |
| 2 | The **only** write of typed data is `supabase.rpc('submit_onboarding_full', …)` in `handleSubmit()`, called from `handleNext()` when `step >= lastStep (4)`. | `OnboardingPage.tsx:330-395` |
| 3 | `handleNext()` runs `validateStep(4)` first; it returns `יש לצרף <doc> של <person>` when `missingIdentity(idRequirements, idDocs)` is non-empty → `handleSubmit` never runs. | `OnboardingPage.tsx:281-286, 321-327` |
| 4 | Server-side `submit_onboarding_full` (latest: [166-authorization-boundaries.sql:153](../supabase/166-authorization-boundaries.sql)) does **not** check `identity_docs` at all. The ID gate is frontend-only. | `166:153-292` |
| 5 | On re-open, `get_onboarding` ([142-identity-evidence.sql](../supabase/142-identity-evidence.sql)) returns only what the *office* knew (`prefill`, `known_*`) plus `identity_docs`. Nothing the customer typed exists server-side, so the form re-mounts at step 1 with office prefill only. | `OnboardingPage.tsx:107-150` |
| 6 | The one thing that *is* durable mid-flow is the ID photo itself: `onboarding-upload-id` writes a `documents` row + `representation_requests.identity_docs` immediately, and `get_onboarding` rehydrates it. So the system is, ironically, resumable *only* for the artifact the customer didn't have. | [onboarding-upload-id/index.ts](../supabase/functions/onboarding-upload-id/index.ts), [175-edge-atomic-writes.sql:109](../supabase/175-edge-atomic-writes.sql) |
| 7 | Production confirms the pattern: request `9cec3ac2…` created 2026-09-01 from the office dialog (`prefill` present, `onboard` email `delivered`), still `pending_fill/pending`, `identification = null`, `identity_docs = null`, 0 `id_card` documents. Also: **zero** production requests have any `identity_docs` — the ID step (shipped 2026-08-27, `c2cf51d`) has never been completed by a real customer. | prod query, this run |

The ID requirement is where the problem surfaced; the actual defect is **no persistence boundary before the final gate**. Any other blocker at step 4 (spouse ID, upload error, 10 MB limit, rate limit, wrong file type) produces the identical loss.

Secondary contributing factors:
- The UI signals progress ("שלב 3 מתוך 4", a progress bar, "✓ הקובץ התקבל" on uploads) and the ProcessMap says "ממלאים כאן - וזהו", which reads as "saved as you go".
- The office has no signal that a link was opened or partially filled. `representation_requests` has no `opened_at`/progress column; the only office-side signal is `flag_missing_representation_links` (24h after **quote** approval only — not for office-dialog links) and the `RepresentationStepCard` text "ממתין שהלקוח ימלא את פרטיו".

---

## B. REPRESENTATION WORKFLOW (as implemented)

Source of state: `representation_requests.status` (6 values, CHECK-constrained by [155](../supabase/155-request-vs-representation-boundary.sql):§6), `onboarding_status` (`pending|submitted`), `execution` jsonb, `signers[]`, plus derived `onboarding_steps` rows (`representation`, `rep_client_approval`, `authority_representation`).

| # | Stage (code name) | Customer sees | Actor | Entry | Completion / persistence | Required? | If not done | Office Mgmt shows definition? | Office shows instance status? |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Request created — `status='pending_fill'`, `onboarding_status='pending'` | Nothing yet (email `rep_onboard` or WhatsApp link; or auto-redirect 2.2 s after quote approval) | Office / system | `handleCreateRepresentation` (App.tsx:1264-1380) or `approve_quotation`→`open_quotation_representation` | Row in `representation_requests`; trigger `ensure_representation_step` creates `onboarding_steps(step_type='representation', status='waiting_client', ball='client', published_at=now())` ([109](../supabase/109-representation-step-always.sql)) | — | — | Stage 0 "פתיחת בקשה" prose in `RepresentationSettingsSection` | `RepresentationStepCard` → "ממתין שהלקוח ימלא את פרטיו"; portal item `rep_fill` |
| 1a | Fill: personal (step 1), contact (2), family+spouse (3) | 4-step form | Customer | Opens `?onboard=` | **Not persisted until 2** | Required | Lost on exit | Stage 1 prose ("ממלא פרטים… ומצלם תעודה") | No — no partial state exists |
| 1b | Optional spouse delegation (`request_spouse_onboarding` → `?spousefill=`) | "אין לי מושג…" button | Customer → spouse | Married + spouse has own SHAAM submission | `spouse_onboarding_token` written immediately; spouse writes only spouse keys into `identification` via `submit_spouse_onboarding` **without touching status** ([149](../supabase/149-spouse-fills-own-details.sql)) | Conditional | Client submits without it; office sees "spouse fill pending" (`spouseFillRequestedAt` && !`spouseFillSubmittedAt`) | Mentioned in stage 1 prose | `RepresentationRequestReview` shows pending |
| 1c | ID photo per required person (step 4) | Upload cards per person | Customer | `identityRequirements(scope, people, secondary)` — derived from **scope** (incomeTax ⇒ client [+spouse if married]; vat/withholding ⇒ per `targetsOf`); NI adds nothing | Persisted **immediately** (`documents` + `identity_docs`) | Frontend-required; server-optional; **no downstream consumer** | Blocks step 2 in UI only | Stage 1 prose | `RepresentationRequestReview.tsx:636` one info line "צילומי תעודות: … טרם התקבל"; nothing else |
| 2 | Submit → `awaiting_accountant`, `onboarding_status='submitted'` | "קיבלנו הכול" + next-actions + ProcessMap(current=2) | Customer | `handleSubmit` | `submit_onboarding_full`: writes `identification`, `clients.*` canonical fields, `signers`, status; trigger `sync_representation_step` → step `in_progress`/`me`; `notify_onboarding_submitted` queues office notification | Required | — | Stage 1→2 prose | Yes (step card + `RepresentationNextStep`) |
| 3 | Office enters details in SHAAM (per person) — `execution.incomeTax.enteredAt`, `execution.shaamEntries[person:*]`; registered-spouse decision | Nothing | Office (manual, or worker `shaam.*` jobs) | status `awaiting_accountant` | `execution` patch via `updateRequest` | Required | Blocks form production | Stage 2 prose | Execution center track "מס הכנסה" step 1 |
| 4 | Office produces POA PDF(s) — `signatureSetup` / `signatureDocuments[]` (`PoaProduceEditor`) | Nothing | Office | after 3 | request columns | Required | — | Stage 2 prose | Exec center step 2 |
| 5 | (NI, parallel) Office enters POA in BTL per person — `execution.nationalInsurance[Spouse].enteredAt/referenceNumber/deadline`; since [157](../supabase/157-authority-representation-request.sql) mirrored as `authority_representation` steps with server-derived `payload.prerequisites` ([165](../supabase/165-request-prerequisites.sql)) | Nothing until instructions | Office (manual or worker `btl.*`) | NI in scope | `execution` + derived step | Conditional on NI scope | NI representation never activates; does not block SHAAM path | Stage 3 prose | `AuthorityRepresentationStepCard`, exec center NI track |
| 6 | Send signature email(s) — `execution.signatureEmailSentAt`, status → `pending_signature` | `rep_sign` mail (+NI instructions if reference exists) | Office | after 4 (and NI ref if included) | `send-onboarding-email`, `email_messages.request_id` | Required | — | Stage 2 prose | Exec center step 3 |
| 7 | Signers sign — `signers[].signStatus`, `signature_values` | `?sign=<signToken>` (`PublicSignPage` / `signing-session`) | Customer (+spouse) | `pending_signature` | per-signer submit; status → `awaiting_stamp` when all signed; `notify_poa_signed` | Required | Reminder audience `sign` (186) | Stage 2 | Exec center step 4 |
| 8 | Office signs + stamps → `signedPdfStoredId` per doc | Nothing | Office | `awaiting_stamp` | request columns | Required | — | Stage 2 | Exec center step 5 |
| 9 | Office marks "sent to SHAAM" → `awaiting_authorities`; trigger creates `rep_client_approval` step (`ensure_rep_client_approval_step`, [131](../supabase/131-rep-client-approval.sql)/[186](../supabase/186-representation-office-settings.sql)) | Portal card "זירוז אישור הייצוג באזור האישי" with gov.il link + "אישרתי באזור האישי" | Office → customer (optional) | — | step row, `payload` snapshot of office template | Customer part **optional** (`DEFAULT_OPTIONAL_STEP_TYPES`) | Representation still activates; reminder audience `portal` | Stage 4 prose + editable portal card | Exec center "מס הכנסה" block; hidden from «בקשות» (`EXECUTION_OWNED_TYPES`) |
| 10 | Office marks active → `status='active'` (terminal, `guard_representation_status`) ; `rep_client_approval` auto-completed; `clients.representation_status` derived ([155](../supabase/155-request-vs-representation-boundary.sql):§8) | `rep_active` mail (sent on click only) | Office | authority approved | trigger cascade | Required | — | Stage 5 prose | Step card "הייצוג פעיל" |
| 11 | (NI) Customer confirms reference at BTL → `execution.nationalInsurance[Spouse].confirmedAt` (office marks) | `rep_ni_approve` instructions / portal item | Customer → office marks | after 5 | `execution` | Conditional | NI not active; reminders `niClient`/`niSpouse` | Stage 3 | NI track |

**The Tax Authority approval step (§G)** is stage 9: `rep_client_approval`.

---

## C. REQUEST CREATION — when does it become persistent?

- **Link generation = row creation.** Both entry points insert a full `representation_requests` row with `onboarding_token` (32-hex, generated in the browser in `saveRepresentationRequest`, or in SQL in `open_quotation_representation`) at `status='pending_fill'`, `onboarding_status='pending'`. A **client card** exists at that moment too (placeholder name "ממתין למילוי <dd/MM HH:mm>" via `makeEmptyClient`, or born at quote per [49](../supabase/49-client-born-at-quote.sql)). The `representation` onboarding step is created by trigger. So Office Management "knows" about the process from second zero — as one opaque `pending_fill` item.
- **First open by the customer**: nothing is written. No `opened_at`, no event. (Contrast: portal marks `portal_token_last_used_at`; participant links mark `opened_at`.)
- **Draft/in-progress**: does not exist. The model has exactly two customer-side states before the office acts: `pending` and `submitted`. There is no "partial", no progress pointer, no per-step timestamp.
- **First server-side state from customer input**: either an ID upload (`identity_docs`), a spouse delegation (`spouse_onboarding_token`), or the final submit. 
- **Modeled states today** (actual): invitation/link ✔ (row + token) · draft ✘ · in-progress ✘ · submitted ✔ (`awaiting_accountant`) · waiting-for-customer ✔ only as `pending_fill` / `pending_signature` (ball=client) · waiting-for-office ✔ (`awaiting_accountant`, `awaiting_stamp`) · waiting-for-authority ✔ · active ✔ (terminal). Tokens never expire (`get_onboarding` has no expiry; `public_link_health` counts them as permanent).
- **Duplicates**: no unique index on `linked_client_id`; `ensure_representation_step` takes the latest by `created_at`. `open_quotation_representation` reuses an existing request for the same quote (26). `submit_onboarding_full` refuses re-submission after status leaves `pending_fill` (166 PF3). Upload refuses after `onboarding_status='submitted'` (409).

---

## D. PERSISTENCE MAP

| Data | Where | When written | Who can read it later |
|---|---|---|---|
| Scope, prefill, signers skeleton, token | `representation_requests` | link creation | office; `get_onboarding` (customer, via token) |
| Steps 1–3 answers (name, ID number, birth date, secondary ID, phone, email, city, address, family status/year, spouse name/ID/birth/secondary) | **React state only** | never until submit | nobody |
| Spouse delegation token | `representation_requests.spouse_onboarding_token` | on button click | both tokens |
| Spouse's own identity keys | `identification.spouse*` | `submit_spouse_onboarding` (status untouched) | office |
| ID photos | `documents` (category `id_card`) + `identity_docs` | immediately per upload | office (documents tab, review line), customer (rehydrated) |
| Everything from steps 1–3 + canonical client fields + signers + status flip | `representation_requests.identification`, `clients.*`, `signers`, `status` | `submit_onboarding_full` (single transaction) | office |
| Signature values | `signature_values`, `signers[].signStatus` | per signer submit | — |
| Execution timestamps | `execution` jsonb | office clicks | — |

**What can currently be lost:** exactly the steps 1–3 answers, and only them. Nothing else in the journey has a comparable gap (every later stage writes on the action itself).

---

## E. INTERRUPTION / RESUME MATRIX (Representation)

| Stage | Data entered | Persisted when | Refresh | Browser close | Reopen link | Other device | Can resume? | Lost | Blocking requirement |
|---|---|---|---|---|---|---|---|---|---|
| Link received, not opened | — | row exists | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |
| Step 1 (identity) | 6 fields | never | ✘ | ✘ | ✘ | ✘ | restart at step 1 (office prefill only) | all | client-side validation only |
| Step 2 (contact) | 4 fields | never | ✘ | ✘ | ✘ | ✘ | restart | steps 1–2 | — |
| Step 3 (family/spouse) | up to 8 fields | never | ✘ | ✘ | ✘ | ✘ | restart | steps 1–3 | spouse ID/birth (or delegate) |
| Step 3 → spouse link created | token | immediately | ✔ token survives; but form state lost | same | same | same | spouse can proceed; **client restarts** — and on restart `spouseDelegated` is false again (state), so the UI re-demands spouse fields the spouse is already filling | client's typed data; delegation *awareness* | — |
| Step 4 upload done, not submitted | ID files | immediately | ✔ files shown again after restart | ✔ | ✔ | ✔ | files yes; **form no** | steps 1–3 | — |
| Step 4 without ID | — | — | — | — | — | — | cannot pass gate | steps 1–3 on exit | **ID photo (UI-only rule)** |
| Submitted | all | ✔ | ✔ shows "קיבלנו הכול" | ✔ | ✔ | ✔ | n/a (further edits by office) | — | — |
| Signature (`?sign=`) | strokes | per signer submit | strokes lost before submit (single screen, acceptable) | same | ✔ | ✔ | ✔ | unsent strokes | all signers |
| NI confirmation / portal approval | click | on click | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |

**False "saved" impressions:** progress bar + "שלב n מתוך 4"; "✓ הקובץ התקבל" (true for files, misleading for the form); ProcessMap "ממלאים כאן - וזהו"; and the office card "הקישור נשלח… כשימלא - הפרטים ייכנסו לכרטיס מעצמם".

**Smallest sensible persistence boundaries:** per *step transition* (on each "המשך" click after validation passes), not per keystroke. Three writes at most, each already validated client-side, each replaceable on the next transition. The spouse-fill RPC (149) is the exact precedent: partial keys into `identification`, status untouched.

---

## F. ID REQUIREMENT — exact rules and feasibility of "upload later"

**Rules today**
- *Who/what*: [identityEvidence.ts](../src/utils/identityEvidence.ts) — derived from `scope` (per person, not per authority); doc kind from chosen secondary ID; NI never requires one.
- *Frontend*: hard gate in `validateStep(4)`; error text names the person and document.
- *Backend*: `onboarding-upload-id` validates token/open request/type/size/rate; `onboarding_identity_doc_append` (175) atomic append. `submit_onboarding_full` **does not require** `identity_docs`. No CHECK constraint, no NOT NULL.
- *Storage*: file in `client-documents/<user>/<client>/<docId>`, `documents` row with `label_id` (D4, 179), `category='id_card'`, `status='received'`.
- *Downstream*: **no consumer**. Not used by POA production, `signing-session`, `pdfFormFiller`, the SHAAM/BTL worker handlers, or activation. The office sees a single informational line. Business rationale is only the comment in 142 ("הרשויות רוצות את התעודה עצמה") — i.e. it's a document the office wants on file before/for submission to authorities, not a system dependency.
- *Overlap*: the journey generator's `client_documents` default checklist already contains `id_card` ("צילום תעודת זהות") for new-business and default variants ([default_journey_entries](../supabase/live-2026-09-04/default_journey_entries.sql)); the portal uploads it via `portal-upload-document`. No linkage/dedupe with `identity_docs`. A customer can be asked for the same photo twice.

**Is the ID required to CREATE the process?** No — the process exists before the customer opens the link. **Is it required to submit?** Only by the UI. **Is it required before a later milestone?** By product intent, yes: before the office produces/submits the POA (stages 3–9). By code, nowhere.

**Feasibility of "I don't have it now — I'll upload later": technically feasible with the current model, and consistent with existing precedents** (spouse delegation 149 = "third-party info doesn't block the filer"; prerequisites 165 = "missing canonical info is a derived server state, with an office path and a customer path to the same write").

If adopted:
- **State**: request stays `pending_fill` until the customer submits; on submit with a deferred ID it becomes `awaiting_accountant` (ball=office) *and* carries a derived "missing identity evidence" condition. Whether to name that a distinct status is a product decision (§P); the data model does not need a new enum value if it is represented as a derived prerequisite (like `payload.prerequisites` in 165), computed from `scope` ∖ `identity_docs`.
- **Persisted safely**: everything from steps 1–3 (already goes to `identification`/`clients.*` today on submit).
- **Milestone to keep blocked**: office "produce POA / send for signature" (exec center step 2 / handleSendAll) — a *gate with override*, not a hard block, since the office may obtain the ID by other means (WhatsApp) and upload it from the card. Today nothing blocks there; adding a soft gate is new behavior.
- **Resume channel**: the customer needs a way to upload later. Two existing channels: (a) the same `?onboard=` link — currently returns 409 `already_submitted` for uploads after submit (166/175 rule "after submission the link is not a write channel"); would need a narrow exception for identity docs while `status='pending_fill'|'awaiting_accountant'`; or (b) the portal (`?portal=`) via a `client_documents`-style requirement — already wired, visible in «בקשות», reminders exist, and it fits rule "documents are requests with lifecycles" (foundation §16 "where it does not apply: documents"). (b) is the more coherent home; it needs `identity_docs` and the checklist item to converge (one write, one source).
- **Office needs to see**: on the representation card/exec center: "צילום תעודה חסר — <person>", who's asked, when, and a "upload from here" action (already exists generically in DocumentsTab; needs to land in `identity_docs`).

If **not** adopted (keep hard gate): then the fix must at minimum persist steps 1–3 so the customer can return with the ID later — the office gains nothing in visibility but the customer no longer restarts.

---

## G. TAX AUTHORITY APPROVAL STEP

- Entity: `onboarding_steps.step_type='rep_client_approval'`, created by `ensure_rep_client_approval_step` when `representation_requests.status` becomes `awaiting_authorities` (trigger `sync_representation_step`, [168:435](../supabase/168-journey-engine-invariants.sql)); auto-completed when status becomes `active`. Payload text is a snapshot of `REP_CLIENT_APPROVAL` / office override (`profiles.settings.representation.templates.portalCard`, 186). `clientTitle`/`clientCta`/gov.il URL are system-owned (`REP_PORTAL_CARD_FIXED`).
- Customer: portal item (bucket action) with link and "אישרתי באזור האישי" (`portal_submit_step`); it's a **declaration**, not evidence — the office still verifies in SHAAM ([rep-approval-is-accelerator memory], `useRepApprovalStep`).
- Office Management: **defined** in `RepresentationSettingsSection` stage 4 prose ("HAPPENS[4]") + editable portal card + reminder audience `portal`. **Instance**: shown only inside `RepresentationExecutionCenter` "מס הכנסה" block; deliberately hidden from «בקשות» (`EXECUTION_OWNED_TYPES`, `AUTO`/`DEFAULT_OPTIONAL`) and never blocks close.
- Not represented at all in `RequestDefaultsSection` (the "בקשות מסמכים" journey editor), where representation is a single "אבן דרך" line.

---

## H. PAPERLESS WORKFLOW MODEL

- **Definition** = four `onboarding_steps` types: `paperless_invite` → `paperless_connection` → {`paperless_tax_authority`, `retainer_authorization`}. Created by `generate_onboarding_steps` ([168:1468](../supabase/168-journey-engine-invariants.sql), SQL) at engagement creation; also by catalog (`PAPERLESS_SEQUENCE` in `AddRequestDialog.tsx`, browser), by `set_paperless_path`, and `paperless_tax_authority` by a `clients` trigger when a dealer becomes licensed ([132](../supabase/132-paperless-tax-authority-on-becoming-licensed.sql)).
- **Conditions** (SQL, in the generator): `v_needs_paperless = (monthly item OR item name ~ 'הנהלת חשבונות|פייפרלס|paperless') AND paperless_status <> 'not_applicable'`; `paperless_tax_authority` additionally `v_licensed` (template kind ∈ licensed_dealer/company OR `clients.dealer_type` OR `vat_status='authorizedDealer'`) and not previously cancelled (117); `retainer_authorization` if `v_has_monthly`. Office can enable/disable/reorder per `client_kind` via `office_journey_defaults.entries` (135–137; snapshot frozen per engagement).
- **Ordering**: `dependsOn` edges (`onboarding_step_dependencies`, 78/168) + `sortIndex`. Data-driven in the defaults; enforced in SQL (`locked` until parent satisfied).
- **Labels/copy**: office labels `STEP_TYPE_LABELS` (TS); customer copy is a `payload` snapshot written by the generator (SQL literals duplicated from `PAPERLESS_TAX_AUTHORITY` in TS — acknowledged in the comment); portal rendering in `build_client_portal` per `step_type` branch.
- **Completion**: `advance_onboarding_step` (customer via `portal_submit_step`, office via card); `paperless_connection` has a 5-item checklist (`PAPERLESS_SETUP_CHECKLIST`, TS) whose 5th item is derived from `retainer.payload.cardEnteredAt`; server dependency `paperless_connection → retainer_authorization` enforced.
- **Next step**: `nextStepForClient` (TS, `onboardingNext.ts`) over open steps; server `unlock_dependent_steps`.
- **Office Management representation**: `RequestDefaultsSection` renders the tree from `office_journey_defaults` (real data) but the *condition* text comes from `REQUEST_META[stepType].cond` (TS prose: "כשההצעה כוללת שירות חודשי או הנהלת חשבונות", "עוסק מורשה וחברה בלבד") and `SYSTEM_DEPENDS_ON` (TS copy of the seed). The component's header comment states this explicitly: "תיאור בלבד. שום דבר כאן אינו מחולל בקשות — הוא מסביר מה השרת עושה". So: **the list, order, on/off and items are the real definition; the "when" and "who" are explanatory copies of the SQL.**

---

## I. REPRESENTATION VS PAPERLESS

| | Paperless | Representation |
|---|---|---|
| Workflow definition | 4 step types + edges, seeded in `default_journey_entries`, evaluated in `generate_onboarding_steps` | Implicit: `RepresentationStatus` enum (6) + `execution` jsonb sub-tracks + 2 derived step types; no list anywhere in code that enumerates the stages |
| Stage model | one `onboarding_steps` row per stage | one `onboarding_steps` row for the *whole* process (`representation`), status mirrored from `status`; sub-stages live in `execution`, `signers`, `signatureDocuments`; NI per person → `authority_representation` rows (157); portal approval → `rep_client_approval` row |
| Ordering | `dependsOn` + `sortIndex` (data) | hardcoded order in `sync_representation_step` CASE, `RepresentationNextStep`, `representationAction`, exec center JSX, `ProcessMap`, `STAGES` |
| Conditional stages | facts (`monthly`, `licensed`, …) in SQL + office variants | scope (`scope` jsonb) drives who/what: `identityRequirements`, `shaamSubmissions`, NI per person; family status drives spouse signer |
| Applicability by client kind | yes (`client_kind`) | no; by scope/family only |
| Persistence | per stage (customer click → `portal_submit_step`) | per office action; **none** during customer fill |
| Progress/status | `status`/`ball` per row + checklist | `status` + `execution.*At` + `signers[].signStatus` |
| Next-step | `nextStepForClient` + server unlock | `RepresentationNextStep` / `representationAction` (TS) |
| Office Mgmt | `RequestDefaultsSection` (data + prose) | `RepresentationSettingsSection` (prose `STAGES`/`HAPPENS` + templates/reminders); `RequestDefaultsSection` shows one opaque "אבן דרך" |
| Customer-facing | portal items from `build_client_portal` | `OnboardingPage` (4-step map), `PublicSignPage`, portal `rep_*` items (5 states) |
| Source of truth | `onboarding_steps` rows (+ engagement snapshot) | `representation_requests` |

Duplication/hardcoding found (see §J). Genuine differences: representation is a **document-and-signature workflow with per-person authority tracks and an external approval**, largely office-executed; paperless is a **checklist of customer/office actions**. Forcing representation's inner stages into one `onboarding_steps` row per sub-stage would fight the existing `rep_requests_guard_status`, the exec center, reminders (186) and the per-person NI model. What *can* be reused: the **step-with-ball-and-payload row as the office/customer "index" entry** (already done for `representation`, `rep_client_approval`, `authority_representation`), the **prerequisite pattern** (165) for "missing thing blocks next action", and the **portal item primitives** for customer-side resumable actions.

---

## J. SOURCE OF TRUTH — where the representation stage list lives (and drifts)

There is **no single definition** of "what the representation process consists of". Independent hardcoded lists, each with a different count/wording:

1. `RepresentationStatus` + `REPRESENTATION_STATUS_LABELS` — 6 statuses ([types/index.ts:844,1244](../src/types/index.ts)).
2. `sync_representation_step` CASE (SQL, 168) — 6 statuses → step status/ball/note.
3. `representationAction` ACTIONS — 6 (office card wording).
4. `RepresentationNextStep` — ~9 branches (adds execution sub-states).
5. `RepresentationExecutionCenter` JSX — 5+N "Step" components per track, NI track steps.
6. `build_client_portal` `v_rep_item` — 5 customer states.
7. `OnboardingPage.ProcessMap` — 4 customer steps.
8. `RepresentationSettingsSection.STAGES/HAPPENS` — 6 office-facing stages, prose.
9. `REP_MAIL_KINDS`/`ARTIFACTS` — artifacts pinned to stage numbers by hand.
10. `docs/מפת-תהליך-הייצוג.html`, `docs/prototypes/representation-settings.html`.

Drift is real already: the customer map says 4 steps ("ממלאים כאן - וזהו"), the office spine says 6, the enum says 6 different ones, and the NI/portal-approval sub-stages appear in some lists and not others. Paperless has the same shape of duplication but smaller: SQL generator ↔ `REQUEST_META.cond` ↔ `SYSTEM_DEPENDS_ON` ↔ `PAPERLESS_TAX_AUTHORITY` copy ↔ portal SQL literals (the repo's own inventory doc lists 14 generators, 3 in the browser).

---

## K. OFFICE MANAGEMENT GAP — "What happens when I send a representation request?"

Partially answered today by `RepresentationSettingsSection` (ניהול המשרד → ייצוג): stages 0–5, prose per stage, artifacts per stage, reminders, defaults. What it **cannot** answer reliably:
- Which steps the *customer* will be walked through (4-step form, spouse delegation, ID per person) — only prose, not the real requirement logic (`identityRequirements`, `shaamSubmissions`).
- Which stages are conditional and on what (NI scope, married, spouse has own file, scope per authority×person) — prose only.
- When documents are needed and what blocks (nothing blocks in code; prose implies ID is required).
- The list is not derived from anything the runtime uses, so it will silently diverge (it already doesn't match `ProcessMap`).
- In the other office screen (`RequestDefaultsSection`) representation is opaque ("מוצגת מעל הבקשות ולא כבקשה").

---

## L. INSTANCE VISIBILITY — a concrete request

Can see: status + ball (`RepresentationStepCard`, `RepresentationNextStep`), execution progress per track, signers, emails sent (`EmailStatusRow`), NI references/deadlines, prerequisites for NI (165), spouse-fill pending, ID docs received/not (one line), resend link.
Cannot see: whether the link was opened; which step the customer reached; what they entered before abandoning; whether they lack a document vs. never started; any reminder for `pending_fill` (reminder audiences are `sign|niClient|niSpouse|portal` only); `flag_missing_representation_links` fires only for quote-born requests after 24h. For the 2026-09-01 production case the office has seen "ממתין שהלקוח ימלא את פרטיו" for 16 days with nothing else.

---

## M. OTHER WORKFLOW EVIDENCE (light inventory)

| Flow | Multi-stage? | Stage definition | Office shows stages? | Resume problem? |
|---|---|---|---|---|
| Intake questionnaire (`?intake=`, `PublicIntake`) | yes, per question | `annual_report_sessions.current_question_id` + `save_intake_answer` per answer | office sees session state | **No** — resumable by design; the best in-repo precedent |
| Client portal requests (`custom_request`, `client_documents`, bank debit, prev-accountant…) | per requirement | `payload.requirements[]`/`checklist[]` | yes («בקשות») | mostly no — each requirement writes on action; multi-field free requests submit all fields at once (small forms) |
| Quotation (`?quote=`) | approve = one click | `quotations.status` | pipeline | no |
| Signature (`?sign=`) | one screen per signer | `signers[]` | exec center | no (unsent strokes only) |
| Release portal (`?release=`) | per item | checklist | yes | no |
| Participant link (`?participant=`, 165) | few fields | `request_participant_links` + `requirements_for_step` | yes (prerequisites) | no (small form) |
| Spouse fill (`?spousefill=`) | one screen | 149 | review shows pending | same all-at-once pattern as onboarding but short; uploads durable |
| Apply page (`?apply=`) | one form | `submit-application` | leads | no (short) |

Shared root cause? **No.** Only the representation onboarding form is a long multi-step wizard with a terminal-only write. Other flows are either single-screen or already persist per action. No central fix is warranted; the reusable *patterns* are the intake questionnaire (server progress pointer) and 149/165 (partial canonical writes with history).

---

## N. DATA MODEL / MIGRATIONS

Current model supports a durable incomplete request **without new tables**:
- `representation_requests.identification` (jsonb) is already the target for customer-supplied identity data and is already written partially by `submit_spouse_onboarding` without status change.
- `identity_docs` is already incremental.
- Missing: a progress marker (which step reached / when last saved) and, if deferral is adopted, a derived "missing evidence" projection.

What a migration would be needed for (if the product decisions go that way):
1. New RPC(s) `save_onboarding_step(p_token, p_step, p_values)` writing into `identification` (or a sibling `draft` jsonb) with an `updatedAt`; new `anon` grant → must be added to `assert_domain_function_invariants` v_anon_ok list (164/165 pattern), and locked by the event trigger (160).
2. `get_onboarding` return-type change (needs DROP/CREATE, 42P13) to return the draft + `spouseFillRequestedAt`.
3. Optional columns `onboarding_opened_at`, `onboarding_progress` (or inside `identification`).
4. If a distinct visible status for "submitted, ID deferred" is wanted: **CHECK constraints** on `representation_requests.status`, `clients.representation_status`, `onboarding_status` (155 §6) must be relaxed, and every CASE over the enum (§J items 1–8, `sync_representation_step`, portal builder, reminders) extended. Strong reason to prefer a *derived* condition over a new enum value.
5. If deferred-ID convergence with `client_documents`: linkage rule (uploading to `identity_docs` marks the checklist item, or the checklist item writes `identity_docs`) — one write site.
6. Upload channel after submit: narrow the 409 in `onboarding-upload-id`/`onboarding_identity_doc_append` to "after `pending_signature`" instead of "after submitted", or route via portal.

Backward compatibility: 15 existing requests (11 submitted, 4 `pending_fill`) are unaffected by adding jsonb keys; `identification` absent → old behavior. Abandoned drafts: 4 `pending_fill` rows already sit forever (tokens don't expire); a draft adds PII to them (see §O). Cleanup/expiry does not exist for onboarding tokens today; 97 prepared expiry columns for portal/intake only.

---

## O. SECURITY / PRIVACY

- **Token model**: `?onboard=` is an unauthenticated capability token (32 hex, unique index), non-expiring, resolved server-side (`SECURITY DEFINER`, `anon` execute explicitly allow-listed). A draft would make *more* PII readable by whoever holds the link (today `get_onboarding` exposes only office-known name/email/prefill). Mitigations available in-repo: expiry column pattern (97), rotate-on-resend (portal `mint_portal_token`), and returning only *what the form needs* (already the practice: 149 returns spouse-scoped subset).
- **Rate limiting**: uploads are rate-limited per client (20/h); RPC writes are not — a draft-save RPC needs the same restraint (write only on step transition, server-side validation of formats: `isValidIsraeliId` exists only in TS today).
- **Cross-client exposure**: none new — token→request→client resolution is server-side; must keep the 166 rule "after submission the link is not a write channel" for everything except (possibly) identity uploads.
- **Sensitive abandoned drafts**: ID numbers, birth dates, addresses of people who never finished. Needs an explicit retention rule (product decision) — there is no cleanup job for `representation_requests` today.
- **Document ownership**: files land under the owner client (`user_id/client_id`), labels D4-compliant; spouse's doc labeled "בן/בת הזוג" — fine.
- **Genuine constraint vs convenience**: real requirements are (1) no PII in URLs, (2) token-scoped reads, (3) no writes after the office took over, (4) retention. Everything else is implementation.

---

## P. PRODUCT DECISIONS (genuinely open)

1. **ID deferral**: may a customer submit the representation request without the ID photo(s)? Options: (a) hard gate stays, only add resumability; (b) explicit "אין לי כרגע — אעלה אחר כך" that submits and leaves a visible missing-document condition; (c) always optional at submit, office chases. Recommendation: (b).
2. **If (b): where does "upload later" live** — same `?onboard=` link reopened, or the personal page (`?portal=`) as a documents request (converging with the `client_documents` `id_card` item)? Recommendation: portal, single home, one write site.
3. **What does the missing ID block on the office side** — nothing (info only, as today), or a soft gate before "send for signature"/"submit to SHAAM" with an override? Recommendation: soft gate with override at "send for signature".
4. **Visibility timing**: should the office see "customer opened the link / reached step 3 / last active 5 days ago" on the card, and get a reminder audience `fill` (like `sign`)? Recommendation: yes, both; reminders default off like the others.
5. **Draft retention**: how long may an unsubmitted draft (with ID number, address) live on a non-expiring link? Recommendation: keep the link alive; purge draft *values* (not the request) after N days of inactivity; N is Guy's call (30?).
6. **Spouse delegation on resume**: when the client returns, should the form remember that the spouse was delegated (today lost with state)? Recommendation: yes, derived from `spouse_onboarding_token`/`spouseFillRequestedAt` (already persisted) — mechanical if 4 is yes.
7. **Office Management "process definition" scope for Representation**: keep the prose spine (6 stages) as the definition surface and make it *derived* (stage list + conditions + actor from one TS descriptor that the exec center, next-step, portal preview and customer ProcessMap also render from), or accept prose with a "verified against code on <date>" note? Recommendation: one descriptor in TS (not a workflow engine), consumed by both office screens and the customer map; SQL keeps owning transitions.
8. **Should the `RequestDefaultsSection` milestone expand** to show representation's constituent stages (read-only), or link to the ייצוג section? Recommendation: link.

Already decided by existing code/docs (not reopened): order details → signature → submission → active (`onboarding-map-vs-finish-conflict`); portal approval is an accelerator, not a gate; documents/questionnaires/signatures are requests with lifecycles, canonical-field gaps are prerequisites (§16); no email as side-effect; active is terminal.

---

## Q. IMPLEMENTATION DECISIONS (Claude decides)

Save-on-step-transition mechanics and RPC shape; where the draft sits (`identification` keys vs. `identification.draft`); `get_onboarding` extension; rehydrating `step` and `spouseDelegated` from server; anon grant + invariants list update; server-side format validation; `onboarding-upload-id` 409 boundary; converging `identity_docs` with the `client_documents` checklist (one write, trigger direction); exec-center/`RepresentationRequestReview` rendering of the missing-ID condition; adding a `fill` reminder audience to `repTemplates.ts` + `representation-reminders`; deriving `ProcessMap`/`STAGES` from one descriptor; test harness updates (`__TestOnboarding`, staging scripts); copy for the "אעלה אחר כך" choice consistent with 149's tone; accessibility of the new choice; a `scripts/staging-test-*.mjs` check that the descriptor matches `sync_representation_step` (like the existing PORTAL_STEP_TYPES check).

---

## R. RECOMMENDED TARGET MODEL (smallest robust direction)

1. **Persist the representation form at each step transition** (server-side, token-scoped, into `representation_requests.identification` with `draftUpdatedAt` + `draftStep`), status unchanged (`pending_fill`). Rehydrate on open. No new tables, no new statuses. Precedent: 149.
2. **Make the ID an explicitly deferrable requirement**: at step 4 the customer may choose "אעלה אחר כך"; submit proceeds; the missing evidence becomes a **derived condition** on the request (computed from `scope` and `identity_docs`, like `payload.prerequisites`), surfaced on the representation card and in the exec center, with a soft gate before "send for signature". The later upload goes through the personal page as a documents requirement that writes `identity_docs` (converging with the existing `client_documents.id_card` item so the customer is never asked twice).
3. **Office visibility of the customer's progress** on the instance: opened / step reached / last activity / deferred documents; optional `fill` reminder audience alongside `sign`.
4. **Process definition in Office Management** stays in the existing ייצוג section, but the stage list, actors and conditional rules come from **one TS descriptor** (`representationJourney.ts`) that also drives the customer `ProcessMap` and the portal preview — replacing three hardcoded lists with one. Not a generic engine; SQL transitions (`sync_representation_step`, guards) stay as they are, with a staging check that the descriptor and the SQL CASE agree.
5. Leave Paperless as is; do not merge the two models.

---

## S. MILESTONES

- **M1 — Resumable fill + deferred ID (customer + office instance)**: items R1–R3. One milestone, because the deferral choice only makes sense once the draft survives, and the office signal is what turns a deferred ID from a silent hole into follow-up work. Blocked on product decisions 1–6.
- **M2 — Representation process definition in Office Management**: item R4. Independent; touches UI + a descriptor + a staging invariant script; no DB change. Can run in parallel or after M1. Blocked on decisions 7–8.
- Not in scope: other flows, workflow engine, NI/BTL automation, paperless.

---

## T. CODE MAP

**Customer-facing**: `src/components/OnboardingPage.tsx` (form, `validateStep`, `handleSubmit`, `uploadIdDoc`, `makeSpouseLink`, `ProcessMap`), `SpouseFillPage.tsx`, `PublicSignPage.tsx`, `PublicPortalPage.tsx` (`rep_fill/rep_sign/…` items), `PublicQuotationPage.tsx` (auto-redirect to `?onboard=`), `PublicParticipantPage.tsx`; routing in `src/App.tsx:380-415`.
**Utils/types**: `src/utils/identityEvidence.ts`, `repScope.ts` (`shaamSubmissions`, `targetsOf`), `repSigners.ts`, `repDocuments.ts`, `representationAction.ts`, `onboardingNext.ts`, `clientFacingRows.ts` (`CLIENT_FACING_TYPES`, `EXECUTION_OWNED_TYPES`); `src/types/index.ts` (`RepresentationStatus`, `RepresentationRequest`, `OnboardingIdentification`, `RepresentationExecution`, `NiTracking`), `src/types/onboarding.ts` (`OnboardingStepType`, `PORTAL_STEP_TYPES`, `PAPERLESS_*`, `REP_CLIENT_APPROVAL`), `src/types/journeyDefaults.ts` (`REQUEST_META`, `SYSTEM_DEPENDS_ON`, `CATALOG_STEP_TYPES`).
**Office**: `src/components/RepresentationOnboardingDialog.tsx`, `RepresentationRequestReview.tsx` (`idEvidence`, resend), `RepresentationExecutionCenter.tsx`, `RepresentationNextStep.tsx`, `clientTabs/OnboardingTab.tsx` (`RepresentationStepCard`, `AuthorityRepresentationStepCard`), `office/RepresentationSettingsSection.tsx` (`STAGES`, `HAPPENS`, `ARTIFACTS`), `office/RequestDefaultsSection.tsx`, `FirmProfileConsole.tsx` (nav), `hooks/useRepresentationRequests.ts`, `hooks/useJourneyDefaults.ts`, `hooks/useRepApprovalStep.ts`; App.tsx `saveRepresentationRequest`/`handleCreateRepresentation` (1264–1380).
**Edge functions**: `onboarding-upload-id`, `portal-upload-document`, `send-onboarding-email`, `signing-session`, `representation-reminders`, `_shared/repTemplates.ts` (`REP_MAIL_KINDS`, `REP_REMINDER_AUDIENCES`).
**SQL (latest definitions)**: `get_onboarding` (142), `submit_onboarding_full` (166), `request_spouse_onboarding`/`get_spouse_onboarding`/`submit_spouse_onboarding` (149), `onboarding_identity_doc_append` (175), `open_quotation_representation` (166), `approve_quotation` (102), `ensure_representation_step` + triggers (109), `sync_representation_step`, `_set_step_status`, `generate_onboarding_steps` (168), `ensure_rep_client_approval_step` (186), `guard_representation_status` + CHECK constraints + `clients.representation_status` derivation (155), `sync_authority_representation_steps`/`requirements_for_step`/`missing_prerequisites`/participant links (165, 167), `build_client_portal` (live-2026-09-04 snapshot; patched by 164/173), `public_link_health` (176), `default_journey_entries` + `office_journey_defaults` (135–137), `assert_domain_function_invariants` + anon allow-list (160, 164, 165), `notify_onboarding_submitted`/`flag_missing_representation_links` (27, 102).
**Tables**: `representation_requests` (columns incl. `onboarding_token`, `onboarding_status`, `identification`, `identity_docs`, `spouse_onboarding_token`, `prefill`, `scope`, `execution`, `signers`, `signature_*`), `clients`, `onboarding_steps`, `onboarding_step_dependencies`, `onboarding_events`, `documents`, `document_labels`, `email_messages`, `accountant_notifications`, `request_participant_links`, `office_journey_defaults`, `engagements`, `annual_report_sessions` (intake precedent).
**Status enums**: `RepresentationStatus` (6), `onboarding_status` (`pending|submitted`), `OnboardingStepStatus` (10), `OnboardingBall` (6).
**Docs**: `docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md` (§16), `docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md`, `docs/INVENTORY-JOURNEY-GENERATION.md`, `docs/prototypes/representation-settings.html`, `docs/מפת-תהליך-הייצוג.html`.
