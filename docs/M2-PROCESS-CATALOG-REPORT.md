# M2 — Office Management explains every process («תהליכים»)

Completion report, 2026-09-17. Companion to `docs/M1-REPRESENTATION-RESUME-REPORT.md` and
`docs/FINDINGS-REPRESENTATION-RESUME-AND-PROCESS-VISIBILITY.md`. No migration; no production deploy.

## What was built

- **`src/lib/processDefinition.ts`** — the vocabulary: `ProcessDefinition` / `ProcessStage`, actors
  (הלקוח · המשרד · המערכת · רשות/גורם חיצוני), stage kinds (fixed / conditional / optional / configurable),
  classification (multi_stage / single_step / sub_process / internal). Pure TS, no React.
- **`src/lib/representationJourney.ts`** — the single product-facing Representation definition
  (9 stages, each bound to the real `RepresentationStatus` values it covers and to the real step types
  `representation`, `authority_representation`, `rep_client_approval`). Exports `customerProcessMap()`
  so the customer's simplified map is derived from the same list.
- **`src/lib/processCatalog.ts`** — the inventory: 12 definitions (see below) + `NOT_A_PROCESS`
  (what is deliberately not listed, and why).
- **`src/components/office/ProcessCatalogSection.tsx` + `processCatalog.css`** — «ניהול המשרד → תהליכים»:
  grouped list, one calm definition at a time (purpose · trigger · actors · numbered stages with actor chips,
  amber "מופיע כש…" for conditional, blue "אופציונלי" for optional, ∥ for parallel · expandable details:
  requires / blocks / deferrable / substages / "הושלם פירושו" / fixed-vs-configurable + link to the section
  where it is configured · "הסתיים כש…" · "איפה זה חי" · sub-processes). Paperless additionally shows the
  office's real `office_journey_defaults` per client kind (which of the four steps is born).
- **`RepresentationSettingsSection`** now derives its spine from `REP_STAGES`; mails/portal card/reminders are
  bound to stage keys instead of hand-numbered stages; the settings-only notes stay local.
- **`OnboardingPage.ProcessMap`** (customer) now derives from `customerProcessMap({ niIncluded })`: 4 milestones,
  5 when National Insurance is included — same order as the office, mentions saving/resume, deferred ID and the
  personal-area approval.
- **Invariants**: `scripts/test-process-catalog.ts` (153 checks, no DB) and
  `scripts/staging-test-process-catalog.ts` (32 checks against live SQL: `sync_representation_step` statuses,
  `ensure_rep_client_approval_step` wiring, generator conditions for Paperless/prev-accountant/kyc/file-opening,
  `default_journey_entries` per client kind, `request_creatable_step_types()`).

## Inventory and classification

| Process | Class | Source of truth | Office shows |
|---|---|---|---|
| קליטת לקוח — מהצעת מחיר לתיק פעיל | multi-stage (7) | quotations.status → engagements → generator → close_onboarding | תהליכים |
| ייצוג מול הרשויות | multi-stage (9, 2 parallel) | representation_requests.status + execution; derived steps | תהליכים + ייצוג (same list) |
| ↳ ייצוג בביטוח לאומי — לאדם | sub-process (4) | execution.nationalInsurance[Spouse]; authority_representation step (157/165) | תהליכים |
| פייפרלס — הרשמה, חיבור ותשלום | multi-stage (4, 2 conditional) | generate_onboarding_steps + office_journey_defaults | תהליכים (+ real defaults strip) · בקשות מסמכים |
| חומרים מרו״ח קודם | multi-stage (3 + conditional upgrade) | generator (_generate_step deps) + representation_upgrade | תהליכים · בקשות מסמכים |
| מסמכים מהלקוח | single-step | client_documents checklist | תהליכים |
| עדכון סטטוס מס | single-step (resumable questionnaire) | annual_report_sessions | תהליכים |
| בקשה מהמשרד | single-step | custom_request.requirements | תהליכים |
| הקמת הרשאה לחיוב חשבון | single-step (template over custom_request) | bankDebitRequest.ts | תהליכים |
| שליחת מסמך ללקוח | single-step (template over custom_request) | clientGuide.ts | תהליכים |
| יישור קו מול הרשויות | internal (3 + opening call) | institution_alignment_* steps | תהליכים |
| הקמה פנימית של התיק | internal | internal_setup, kyc, file_opening, first_month_review | תהליכים |

Intentionally not listed (shown under "מה בכוונה אינו ברשימה"): draft/publish mechanics, paperless data
import/verification steps, engagement renewal/end, the office's annual-report tool, SHAAM/BTL office automation.

Every `OnboardingStepType` is either bound to a catalog stage or explicitly excluded (checked by the test).

## Why this is not a workflow engine

Nothing in the catalog creates steps, moves status or evaluates conditions. Transitions stay in SQL
(generator, triggers, `advance_onboarding_step`, `guard_representation_status`); office configuration stays in
`office_journey_defaults` / `profiles.settings`. The catalog is prose + bindings, and the two tests fail when the
bindings or the anchored SQL rules drift.
