# Approved milestone: clear request groups, opening rules, Paperless and business details

## Outcome and approval
Guy approved the four-screen proposal on 2026-10-05 and requests a complete implementation milestone. Implement the office request catalog, opening-rule configuration, client-workspace requests, and public client page as coherent surfaces with clear rectangular rows and persistent groups for compound requests. Include the earlier unresolved Paperless/business-name/home-office requirements in this same milestone. Do not return only a plan or another cosmetic pass.

The approved direction supersedes older UI decisions that fragment a compound request by actor, completion bucket or origin. Preserve business invariants, historical records, identity, permissions and existing engine behavior. A display group is not a historical parent request that can be reopened.

## Read and inspect first
These artifacts are local in `C:/Users/guyas/Desktop/code Projects/Tax Calculator/`; do not assume they already exist in your worktree or GitHub:
- This brief.
- `docs/prototypes/requests-approved-2026-10-05/reference.html`: exact copy of the approved interactive reference. Open it in a browser and exercise all four screen buttons and disclosure interactions before implementation. The top four buttons are prototype navigation, NOT production navigation or public access to office screens.
- Companion screenshots in that folder: `library-1024.png`, `rules-1024.png`, `case-1024.png`, `portal-360.png`.
- `docs/REQUESTS-STRUCTURE-EXPLORATION-2026-10-05.md`: findings and reasoning. Its earlier “not approved” statements describe the preceding discovery; this brief records the later approval.
- `docs/CODEX-COLLABORATION.md`, `docs/DESIGN-AUTOMATION-EXECUTION.md`, current `CLAUDE.md`, `docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md`, relevant current flow implementation and rollout documents.

Independently inspect current branches/worktrees and the actual intended target. Main checkout is dirty and outdated; Codex previously inspected `C:/Users/guyas/pivo-wt/integration`, but that is not proof of today's deployment. Preserve all unrelated work, including concurrent NI-income fixes. Avoid concurrent edits to another active worktree. Do not reset, pull, merge, commit, push or deploy merely to start this task. Choose an isolated implementation workspace if necessary, bringing the reference and brief into it unchanged.

Useful starting points: `LibraryPage.tsx`, `FlowsPage.tsx`, `components/flows/`, `features/flows/`, `OnboardingTab.tsx`, `PublicPortalPage.tsx`, `PersonalContactsTab.tsx`, `TaxFileTab.tsx`, `types/onboarding.ts`, portal builders/submission RPCs, request prerequisite collection, canonical client fields and communication records. Validate the findings rather than accepting earlier comments as evidence of current behavior.

## 1. Unified catalog and persistent groups
- Office catalog includes custom AND built-in/system requests together. No separate second-class “automatically opened” list that sends users elsewhere to understand a request. Preserve restrictions on editing protected system behavior; expose supported configuration in context.
- Simple request = one row. Compound request = stable named group with clear child rows. Match the reference hierarchy, border treatment, spacing, Hebrew/RTL clarity, state/action placement and progressive disclosure. Preserve the app shell and implement genuine controls, not prototype messages.
- Each work row exposes name/subject, truthful state, actor where relevant, and one appropriate next action plus access to detail/history. Important work must be discoverable regardless of entry point or whether it is part of onboarding.
- Children remain together when responsibility/status changes, including completed and future children in an expanded group. A user can collapse the group. Do not hide a live child under a completed-only ancestor or move it into an unrelated internal-work bucket.
- Recurring work or renewal creates/uses a distinct lifecycle and period within the appropriate group; never reopen/rewrite historical completed work. Group identity and membership must be stable across reload, filters, office and portal views. Do not infer identity from translated titles.
- One real request appears once even when referenced by several flows. Preserve server-side deduplication and ownership/subject distinctions. Not every checkbox is a request: mechanical setup checks live inside the meaningful setup request.
- Group state is derived, handles parallel work, and explains what can happen now. Avoid a misleading single “waiting on client” when the office has an available action. Counts include only applicable work and are consistent across views.

## 2. Opening rules replace route jargon at the main UI level
- Present “מתי פותחים בקשות?” / simple opening rules: when, for whom, which requests/groups, how they reach the recipient. Keep content editing at the request's home.
- Retain the existing engine, versions, dependencies, manual/yearly flows, pause/resume and cancellation semantics where required; provide accessible detail instead of deleting capabilities or building a second engine.
- Do not change publication, email, reminder or authority-execution policies as a side effect of redesign. Values in the mock are examples, not production configuration. Distinguish visible in portal from emailed, with real per-item evidence.
- Explain legacy missing-flow linkage through its operational consequence and a safe recovery action. Inspect the underlying attach logic: recovery must not duplicate completed work or silently send messages. Do not “fix” real customer records as part of UI testing.
- Rule/template changes do not silently rewrite active/historical client cases. Existing work remains visible even when its source template/rule is unavailable.

## 3. Client workspace and public page
- Match the approved stable-group design in both surfaces, with office controls in the workspace and clear recipient actions in the public page.
- Keep useful office progress visible to the client as a concise summary; never leak internal notes, tax details not intended for that recipient, or office-only controls.
- Maintain server-enforced owner/subject/recipient boundaries, spouse-specific actions, signed links and expiration rules. Do not solve visibility by merely hiding forbidden controls in CSS.
- Preserve adding single/group requests, documents, signatures, representation, history and communication access. Standalone requests not attached to a flow must work.
- Handle loading, empty, failed reads, partial completion, “not needed,” missing prerequisites and very long titles without pretending success or losing work.

## 4. Paperless: signup, business facts, setup and payment
The original incident remains part of this task: Guy says Ilan already registered in Paperless; PIVO shows connection work 0/5 and a missing business name while Paperless shows one. Previous source inspection found a generic “the client registered” intro and manual checklists, not a verified external integration. Do not claim that intro proves registration or that 0/5 means no account.

- Separate signup/account linkage, business-details collection, office setup and payment. Preserve paths for no account, own account, previous representative, and not applicable. Paperless-to-tax-authority connection appears only when applicable under the existing verified business rules; its omission from the four-row example is not authorization to remove it.
- Show actual evidence/source/date: client declaration, office confirmation or verified integration if one actually exists. Fix unsupported success copy. Keep manual confirmation and safe correction paths.
- Inspect Ilan's relevant current state read-only if already authorized access is available; otherwise reproduce with an anonymized fixture and report the live-data limitation. Explain the remaining real-record action, never silently patch it.
- Expose canonical business name for viewing/editing in tax-file business details, with a direct contextual path from requests. Reuse `clients.business_name`/the current canonical equivalent and the established save/audit path; no duplicate value on a request. Office and client collection write the same source safely without stale overwrites. A corrected PIVO name does not imply it changed in Paperless.
- Retain a manual Paperless setup checklist covering identity/name, dealer type and sale type, home-office percentage, advance frequency/rate, withholding rate, NI amount/payment setting, bookkeeping method, and existing necessary setup steps (e.g. pull dealers and retainer dependencies). Some settings may be unknown/not applicable; do not turn missing into zero or mark a disabled automation completed.
- The screenshots are evidence of fields to inspect, not authority for tax amounts or proof that every field must be forced to match an unrelated PIVO field. Map semantics before comparing. Store/check office confirmation separately from canonical authority facts; never overwrite verified facts with Paperless settings.
- Keep current bookkeeping and other disabled automations OFF. No new Paperless integration, external writes, signup, card collection in PIVO or automated payments in this milestone. Preserve existing payment completion evidence and alternative payment paths.

## 5. Home-office intake, approval and manual update
Use the approved room-count direction rather than requiring area as the default:
1. “האם יש בבית חדר שמשמש רק לעבודה בעסק?”
2. If yes: total rooms in the home INCLUDING the business rooms.
3. Number of those rooms used exclusively for business.

Use the reference's explicit room-count explanation consistently (excluding kitchen/bath/toilet); do not imply legal authority for that convention. Retain a note/office correction path for unequal rooms or other nonstandard layouts. Calculation is a proposed ratio, not automatic tax entitlement.

- Validate positive counts, business rooms not greater than total, sane numeric precision and incomplete answers. Preserve reported facts even when the resulting ratio exceeds the cap.
- Guy's office rule is a maximum approved 25%. Show the calculated ratio separately from the proposed capped percentage and office-approved percentage; above-cap cases require visible office review, never silent rewriting of the original answer. The cap is a user requirement, not a legal conclusion established by Codex.
- An unanswered request, “no exclusive room,” an explicit office-approved 0%, and “updated in Paperless” are distinct. A “no” answer completes the client's collection but must not fabricate office approval or an external update.
- Persist client answers, source/date, office approval with actor/date and effective date through the canonical business data model. Show approved value in tax file and setup request. Client and office entry must converge on the same canonical data with history and permissions.
- A material later change to answers must flag the existing approval/external confirmation for review; preserve their history, do not continue presenting them as current. Provide a safe resubmission/correction path.
- Integrate collection into reusable request catalog, appropriate new-client rules, manual existing-client requests, portal and existing communication mechanisms. Do not bulk reopen completed onboardings or send requests to existing clients automatically. Record a separate manual confirmation when the approved value has been entered in Paperless.

## Execution, validation and completion
Own routine implementation/design choices within the approved direction. Challenge incorrect technical assumptions with evidence. Stop only for a consequential unresolved business change, missing authorization/access, manual authentication recovery, or the bounded execution limit. Do not repeatedly ask Guy to choose mechanics or approve intermediary CSS.

Use the applicable local `emil-design-eng` skill after reading it. Check `design-taste-frontend` scope: dashboard/multistep product UI is excluded, so do not force a landing-page style. Follow `docs/DESIGN-AUTOMATION-EXECUTION.md`, including independent investigation of relevant existing screens where authorized; screenshots do not establish complete external workflows. Stop on authentication failure; never retry passwords or work around login restrictions.

Prefer `/goal` only if available in this Claude session, using this milestone as its objective and completion criteria. Bound this run to one full implementation and up to four focused test/fix cycles; choose supported syntax rather than inventing flags. A cap reached is incomplete work, not success. Otherwise follow the same completion contract in a normal run.

Implement → meaningful tests → browser QA → compare reference → fix → recheck. Required evidence:
- Typecheck, build and appropriate existing tests; targeted lifecycle/grouping, room validation/approval staleness, canonical save and access tests.
- If schema/RPC changes are needed, prepare migrations and validate them on an isolated local/test DB with fixtures. Do not change production/shared databases without separate authorization. Explicitly report unexecuted DB checks.
- Office catalog → edit/view group → opening rule → create fixture client work → act/complete → reload → group stays intact. Include single requests, completed parent/new child, parallel work, old unlinked flow, non-Paperless client and repeated annual work.
- Client form → save → office review → approve → tax-file value → separate manual Paperless confirmation. Test no/unknown/above-cap/invalid/changed answers and refresh persistence. Test source-aware registration and name updates from both office and portal.
- Validate document, signature, representation/spouse, retainer and communication boundaries; no accidental emails, duplicate requests, unauthorized records or authority submissions during QA.
- Render and interact at desktop and 390/360 CSS px, compare all four surfaces to reference, include expanded groups/forms and error/long-text states. Check focus, touch targets, keyboard obstruction where testable and horizontal overflow. Screenshots and a build alone are insufficient.

Finish with a concise Hebrew report of behavior delivered, exact workspace/branch/files, tests actually run and results, desktop/phone evidence, any deviations, remaining live-data/deployment requirements and limitations. Update project decisions to reflect the approved stable-group display model. Do not claim independent-user or real-device verification unless performed. Leave a complete reviewable implementation; do not commit/push/deploy, send real messages or mutate production records in this run.
