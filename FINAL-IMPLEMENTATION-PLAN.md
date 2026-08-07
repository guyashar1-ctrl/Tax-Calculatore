# FINAL-IMPLEMENTATION-PLAN.md — Completing and Shipping Phases 0–5

**Written 2026-08-07 · revised same day with the Gate-1 product rulings (§4 — all eight decisions closed). Supersedes the execution guidance in `PROJECT-HANDOFF.md` §13 wherever they differ.**
This is the single authoritative plan for finishing the approved Phases 0–5 scope end to end — one continuous implementation cycle, not another series of isolated previews and review patches.

Every load-bearing claim in this plan was re-verified on 2026-08-07 against:
- the repository (branch `redesign/design-package-phases-0-5`, head `4e955a0`; `master`, head `266f530`),
- the live database `uoweoqtuiettozagwgdw` (read-only SQL),
- the five planning documents listed in the Appendix.

Where this plan contradicts `PROJECT-HANDOFF.md`, the contradiction is stated explicitly in §3 with evidence. Do not resolve conflicts by re-reading the handoff — this document wins.

---

## 0. How to execute this plan

- **Executor:** a fresh Claude Code session, running continuously. The opening prompt is in §22.
- **Stop only at the three remaining human gates** (§20): staging-environment creation, production migration approval, production deployment approval — plus any genuine blocker not resolvable from the repository. (Gate 1 — the product-decision lock — closed 2026-08-07; the rulings are in §4.)
- **All reporting to Guy is in Hebrew, jargon-free** (CLAUDE.md §0). This plan is in English because its reader is the implementing session.
- Standing rules inherited unchanged: browser QA is the only proof of done · additive-only SQL, archive live definitions before `CREATE OR REPLACE` · statuses change only via `advance_onboarding_step` · no new dependencies · Hebrew/RTL · test emails only to `delivered@resend.dev` · `git add` specific files only (never `git add .` — §16 WP-9 lists the stray root artifacts) · both kill switches (`journeyUi`, `onboardingTab`) must keep working.

---

## 1. Frozen product scope

### 1.1 In scope (this cycle, nothing else)

1. **Everything already implemented on `redesign/design-package-phases-0-5`** (14 commits, 21 files, UI-only except one unapplied SQL file): tasks page head/counters/type column; clients page head, row menu, one lifecycle axis; journey next-action panel, lead facts, quotation timeline, active-client composition, onboarding progress header, close dialog, per-step required model (UI side).
2. **Completion of the per-step required/optional model** — the only unfinished product mechanism in the approved scope (handoff §2.8, and constraints 4/6 of this cycle):
   - revised migration 68 (schema + backfill + readiness + `create_onboarding_request` patch — see §12),
   - required/optional flag on journey-template entries, carried through `save_journey_template` / `apply_journey_template`,
   - explicit flag values written by `generate_onboarding_steps`,
   - an edit control for the flag on existing steps,
   - extended `verify-close-rules.mjs`.
3. **One correctness fix inside the readiness rule:** the release-letter objection window must not count as "no objection" when the letter was never sent (§10.3 — defect found during verification).
4. **The approved automatic representation send (D1, decided 2026-08-07):** a server-side, atomic, idempotent send of the representation email immediately at quotation approval — independent of accountant login and of any dialog checkbox — plus removal of the 24-hour client-email nudge (converted to an internal accountant notification only). Includes migration 72 and edge-function changes (§11.1, §12.3, WP-6). **Edge-function changes are therefore now in scope** (previously none existed on the branch).
5. **The quotation-expiry reminder becomes a firm setting, default OFF (D2, decided 2026-08-07):** visible and controllable in the firm notification settings; when OFF the cron sends nothing; the atomic guard is preserved for firms that enable it.
6. **A persistent staging environment** (§14) and the full integration/browser test cycle on it (§17).
7. **Phases-0–5 cleanup** (§18): dead files, unreachable component, stale comments, `.gitignore` hardening.
8. **Merge to `master`, production migration, deployment, and post-deploy smoke tests** (§19).

### 1.2 Explicitly out of scope

| Item | Why | Where it's parked |
|---|---|---|
| Send-policy foundation ("שלח את הדף ללקוח", `client_page` email kind, `ensure_intake_token`, questionnaire exposure) | Design-plan **Phase 6 — declared out of scope for this cycle** by the product owner | `docs/PLAN-ONBOARDING-SEND-POLICY.md` (note: its "migration 67" numbering is stale — 67 is taken by document-folders; renumber when picked up) |
| "שלח שוב ללקוח" / "נשלח לאחרונה" on active-client requests | Depends on the send-policy foundation | Deviation register #1/#16 |
| "בקש עדכון מהלקוח" | Belongs to the dossier screen (design Phase 8) | Deviation register |
| Proposed-changes queue (AI extraction gate) | Design Phase 8/9 territory | Handoff §13 step 6 |
| Spouse recipient/token, pagination, "מה שלי" filter, ת.ז./אימייל/מטפל columns, Excel export, drag-reorder persistence, "שמור כתרחיש" | Deferred by explicit prior decisions (deviation register #2, #5, #8, #17) | — |
| Firm email-templates section (design 13) | **Dropped — D3 ruling 2026-08-07** (conflicts with the closed one-template ruling) | — |
| Expandable authority table in the journey representation row (design 05) | Screen-05 element = design Phase 7, not Phases 0–5 | Deviation register #15 |
| Native `window.confirm`/`window.prompt` still in `OnboardingTab.tsx` (paperless skip `:296`, skip/block/note prompts `:303–315`) | Pre-existing, part of the Phase-7 screen; not introduced by this branch | Flag for Phase 7 |
| Ready-to-send state, per-item close decisions, template auto-selection by client type | GAP-doc ideas superseded or never approved (see §3.9) | `docs/GAP-ONBOARDING-SPEC-2026-08-05.md` |
| Phase 6+ of the design plan generally (screens 05 detail, 07–18) | Constraint of this cycle | `docs/PLAN-DESIGN-PACKAGE-IMPLEMENTATION-2026-08-05.md` |

---

## 2. Requirements traceability matrix

Legend: ✅ done · ◐ partial · ❌ missing · state verified 2026-08-07. "AT" = acceptance test (all ATs run on staging unless marked PROD-RO = production read-only).

### 2.1 Approved lifecycle decisions (handoff §2)

| # | Requirement | State | Evidence | Missing work | DB impact | Email/link risk | AT |
|---|---|---|---|---|---|---|---|
| R1 | One person, one record; click always opens journey | ✅ | `leads.converted_client_id`; `ClientList.handleRowClick` (branch) | — | none | none | Lead→convert→counted once; row click opens journey in all 5 tabs |
| R2 | Onboarding only after quotation approval | ✅ | `approve_quotation` → `generate_onboarding_steps` (live def, `supabase/live-2026-08-05/`) | — | none | none | Approve on staging → engagement + ordered steps exist |
| R3 | Representation email sent automatically, immediately after approval — server-side, atomic, idempotent (D1 ruling) | ❌ **not implemented** | Today approval sends nothing (`PublicQuotationPage.tsx:124–126`); the sends that exist are a manual checkbox dialog (`App.tsx:796–802`, no preview) and a client-side 24h nudge (`App.tsx:292–326`) — neither satisfies D1 | §11.1 target model: migration 72 hook in `approve_quotation` (pg_net, transactional enqueue), internal-secret auth in `send-onboarding-email`, nudge removed → internal notification; failure visible + retryable | **migration 72** + vault secret | **This IS the email-risk item** — see §11 | §17.5 AT-1…AT-4 |
| R4 | Paperless precedes payment authorization | ✅ server-side | `depends_on_step_id` at creation; `advance_onboarding_step` → `error:'locked'` / `'paperless_required'`; live steps show `retainer_authorization` `locked` (2 rows) | Regression test only | none | none | API + UI attempts to advance retainer before paperless both refuse; skip allowed only with valid `skipReason` |
| R5 | Every other client email = explicit action + preview; quotation-expiry reminder = firm setting, default OFF (D2 ruling) | ◐ | 7 `EmailPreviewDialog` mounts; 4 preview-less manual paths documented-accepted (§11.2); reminder cron currently sends unconditionally | WP-6: setting gate in `quotation-reminders` (default OFF) + visible toggle in firm notification settings | none | see §11 | §17.5 AT-5; inventory §11 re-verified before merge |
| R6 | One permanent portal link | ✅ | `mint_portal_token` idempotent (live def); `public_link_health()` = allHealthy over 20 tokens (run 2026-08-07) | — | none | Never mint to "refresh" | Resend/re-open flows never change `portal_token` (compare before/after) |
| R7 | One ordered journey list | ✅ | `sort_order` (migration 56), `reorder_onboarding_steps` | — | none | none | Reorder in builder → portal order matches |
| R8 | Required/optional per step, not per type | ◐ | UI model complete: `src/types/onboarding.ts:294–335`; **column absent in live DB** (information_schema: 0 rows, verified) | Migration 68 revised + applied; template/generator/edit layers (§7–§8) | **column + 3 function replacements** | none | §12.5 validation matrix |
| R9 | Closure blocked while required steps open | ◐ | Server: live `close_onboarding` refuses (verified: all 3 live engagements `ready:false`, blocking 6/8/6). UI: `OnboardingTab.tsx:598–621` close dialog | Pre-existing UI/server divergence on release-letter window (§3.6) resolved by migration 68 | via 68 | none | Blocked/optional-only/complete/forced matrix on staging against the real RPC |
| R10 | Manual override: secondary link, one click, audited | ✅ UI / ◐ audit | `OnboardingTab.tsx:609–618` ("סגור בכל זאת · N נדרשים יישארו פתוחים", no second confirm); `close_onboarding` logs `{forced, readiness}` | `p_reason` is always `null` from UI → server default note. Acceptable; optionally pass a fixed reason string (WP-5) | none | none | Forced close → `onboarding_events` row has `forced:true` + readiness snapshot; `onboarding_closed` notification queued |
| R11 | Closure → active client, UI updates | ✅ code | `refresh_lifecycle_stage_for`; JourneyTab active chapter | Never exercised against the real RPC — integration test | none | none | Close on staging → stage flips, onboarding UI gone, counts update |
| R12 | Preserve everything existing | ✅ by construction | Branch touches no edge function, no data path; only new SQL is unapplied 68 | §13 impact analysis + migration rehearsal | backfill only | branding unchanged | §13 checks; PROD-RO pass after deploy |

### 2.2 Branch phases 0–5 (handoff §4)

| Phase | State | Evidence | Missing work in scope? |
|---|---|---|---|
| 0 Baseline | ✅ | commit `db0cfb2` | no |
| 1 Design system | ✅ (verified no-op) | tokens already match package | no |
| 2 App shell | ✅ (verified no-op) | — | no |
| 3 Tasks | ◐ | `2b45b93`; staged loading + drag-reorder not done | **no — both deferred** (deviation #5/#8) |
| 4 Clients | ◐ | `86f9618`, `678928c`, `b4470be`; columns/pagination/mine not done | **no — all deferred/ruled out** (#5/#17) |
| 5 Journey | ◐ | `d78c22c`…`d59c58a`; send-history / בקש עדכון / authority table not done | **no — all out of scope** (§1.2). The required/optional completion (§2.1 R8) is the only remaining build work |

### 2.3 The required/optional model, layer by layer (handoff §8, re-verified)

| Layer | State | Evidence | Work |
|---|---|---|---|
| UI rule (single source) | ✅ | `types/onboarding.ts`: `DEFAULT_OPTIONAL_STEP_TYPES` = exactly `representation_upgrade`, `first_month_review`; `SATISFIED_STATUSES` = completed/verified/skipped; cancelled → not required | Add release-letter "sent" guard (§10.3) |
| DB column | ❌ | `information_schema` → 0 rows for `onboarding_steps.required_for_close` (live, 2026-08-07) | Migration 68 §12 |
| Server readiness | ❌ (type-based) | live `onboarding_close_readiness`: blanket blocking array minus 2 types; sub-verdict leniencies **inert** (§3.6) | Migration 68 §12 |
| `create_onboarding_request` param | ❌ live / ⚠ migration text **regressive** | Migration 68 as written **rewrites the function and drops** the step-type whitelist, ownership check via client, dependency locking, ball/scope logic, engagement fallback, `sort_order+10` (full table §12.2) | **Revise before applying** |
| Templates | ❌ | `journey_templates` columns: id/user_id/name/description/entries/timestamps only (live, verified); entries = `[{stepType, payload}]` | §7 |
| Generator | ❌ | live `generate_onboarding_steps`: none of its 12 inserts includes the column; never reads `journey_templates` | §8.1 |
| Custom-request creation UI | ✅ | `AddRequestDialog.tsx:49,77,289–297` — checkbox default checked, passes `p_required_for_close` | — |
| Edit existing step | ❌ | grep: no toggle/RPC exists | §8.2 |
| Mapper/persistence | ✅ | `dbMappers.ts:247–252` generic snake→camel; `select('*')` — works the moment the column exists | — |
| Audit | ✅/◐ | creation logs `{requiredForClose}` (in 68); forced close logs readiness | edit control must log too (§8.2) |
| Verify script | ◐ | `verify-close-rules.mjs`: 13 cases, hand-copied rules, substring drift-guard; **never tests the fallback branch**; imports nothing from `src/` | §17.1 |

### 2.4 This cycle's own constraints

| Constraint | Plan section |
|---|---|
| No merge before plan + integration + staging verification | §19 sequence; merge is WP-10 |
| Environment separation; destructive tests never on production clients | §14 |
| Only the post-approval representation email automatic by default; nudge ruled out as client email (D1); reminder = firm setting default OFF (D2) | §11, §17.5 |
| Paperless before payment | R4 above |
| Required/optional per step, from template, editable on generated step | §7–§8 |
| Existing data intact | §13 |
| Migration 68 not "ready"; revise | §12 (confirmed: it is **not** ready — regressive rewrite found) |
| 3-business-day window correctly labeled | §10.2 (verdict: **implemented business rule, no authoritative citation**) |
| `review/phases-0-5-visual` never merges | §16, §19 pre-merge check |
| Phase 6 out of scope | §1.2 |

---

## 3. Contradictions found and resolved

1. **Handoff §2.3 vs code — "sent automatically after approval".** `App.tsx:802` is inside `handleCreateRepresentation`, reachable only from the accountant's `RepresentationOnboardingDialog`, gated on a checkbox (`if (!sendEmail) return` at `:796`). Quotation approval itself sends nothing (`PublicQuotationPage.tsx:124–126`, explicit comment). The only automatic sender for this email is the 24h effect. **Resolution (D1 ruling, 2026-08-07):** the handoff described the *approved* behavior, not the implemented one. The gap is real implementation work: build the immediate server-side send (§11.1), remove the 24h client email, keep the manual dialog path only for representation requests created outside the quotation flow.
2. **Handoff §6 — "13 commits", "review branch is a rebase of product".** Actual: 14 commits (the handoff's own commit `4e955a0` is head); review branch forked at `d59c58a`, one commit behind, missing `PROJECT-HANDOFF.md`. **Resolution:** cosmetic; review branch may be re-cut for demos, never merged.
3. **Handoff §7/§8 — "Rule 16 … is law rather than discretion".** No citation exists anywhere in the repo; the trail ends at a self-declared working assumption ("שתי הנחות עבודה שלי") in `docs/ONBOARDING-JOURNEY-DESIGN.md:261`; the code even disagrees with itself — `releaseLetter.ts:99` says **כלל 16** (institute conduct rule) while `types/onboarding.ts:324` and migration 68 say **תקנה 16** (regulation). **Resolution:** §10.2 relabels it; D7 asks Guy to confirm; system behavior unchanged by default.
4. **Stated email policy vs `quotation-reminders`.** A daily pg_cron job (06:00 UTC, live; schedule **absent from repo SQL** — only `12-quotation-reminders.sql` scaffolding exists) emails clients/leads automatically one business day before quotation expiry, with a correct atomic claim (`auto_reminder_sent_at`). This contradicts "only the representation email is automatic". **Resolution (D2 ruling, 2026-08-07):** not approved as automatic — becomes a firm setting, visible in notification settings, **default OFF**; the atomic guard is preserved for explicit opt-in. The `cron.schedule` text is committed to the repo for visibility.
5. **Migration 68 "verified against live schema" (handoff §7) vs its content.** The schema/backfill/readiness parts are sound, but its `create_onboarding_request` is a from-scratch rewrite that silently drops eleven behaviors of the live function (§12.2). **Resolution:** revise 68 in place before any application; the parity script passing proves only the readiness rule, exactly as constraint 8 suspected.
6. **Handoff §7 — the live leniencies vs reality.** Live `ready` requires the blocking array to be empty, and that array excludes only the two long-tail types — so the "questionnaire sent = satisfied" and "release-letter window passed" leniencies are **inert**: live blocks on both. Consequence today: branch UI (`blockingStepsForClose`) can compute an empty list while the server still refuses, so the close dialog could read "0 נדרשים". **Resolution:** migration 68 (revised) makes server and UI agree; the backfill's "delicate" intake rule affects **zero rows** (live DB has no `intake_questionnaire` steps at all — verified 2026-08-07), so the risk the handoff flagged is currently nil, though the rule stays for safety.
7. **`PLAN-ONBOARDING-SEND-POLICY.md` numbering.** Its "migration 67" is taken by `67-document-folders.sql`; `ensure_intake_token` exists nowhere in code. Out of scope this cycle; renumber when picked up.
8. **CLAUDE.md §5** is stale (localStorage-only, missing package.json) — already flagged by the handoff; trust code. WP-9 adds a one-line correction note.
9. **GAP doc (2026-08-05) vs later decisions.** Its "ready-to-send" state, per-item close decisions, template auto-selection, and questionnaire-as-mandatory-generated-step were superseded: per-item close → replaced by the per-step required model (deviation #4); auto-add questionnaire → rejected by the send-policy clarification ("adding sends nothing"; the questionnaire enters via + בקשה only); the rest never approved. The GAP doc is background reading, not requirements.
10. **Handoff §13 step 1 ("land what already works" — merge early)** vs this cycle's constraint 1. **Resolution:** no merge until §19; the branch stays current by rebasing onto `master` if `master` moves (it has not: `266f530` unchanged).

---

## 4. Product decisions — **ANSWERED (Gate 1 closed, 2026-08-07)**

All eight decisions were ruled by the product owner on 2026-08-07. They are binding; do not re-open them. Gate 1 no longer stops execution.

| # | Decision | **Ruling** | Plan impact |
|---|---|---|---|
| **D1** | Automatic representation email & the 24h nudge | **The representation email must be sent automatically, immediately after quotation approval — server-side, atomic, idempotent; independent of accountant login and of any dialog checkbox; retry-safe with no duplicates; visible in the client's email history and audit trail.** The current checkbox flow does not satisfy this. The 24h client-email nudge is **removed as a client email** and converted to an internal accountant notification only — it is not a substitute for the immediate send | §11.1 target model · migration 72 (§12.3) · WP-6 · §17.5 AT-1…AT-4 · §19 sequence · §21 items 2, 19 |
| **D2** | Daily quotation-expiry reminder cron | **Not currently approved as automatic.** Becomes a visible, controllable firm notification setting, **default OFF** — when OFF, no client email is sent automatically. The atomic guard is preserved for firms that explicitly enable it | WP-6 · §17.5 AT-5 · §11 policy |
| **D3** | Firm email-templates screen (design 13) | **Dropped from the current specification** | §1.2 stands |
| **D4** | Quotation-builder automatic portal-page send toggle (design 12) | **Dropped.** Sending the onboarding/client page remains an explicit accountant action | §1.2 stands |
| **D5** | Minor opt-ins batch (drag-reorder persistence, Excel export, "שמור כתרחיש", lead enum) | **Out of this cycle** | §1.2 stands |
| **D6** | Closing onboarding while representation is still in progress | **Confirmed as intended.** Representation remains visible in its dedicated pipeline and continues independently | Documented rule; regression-covered in WP-7 |
| **D7** | 3-business-day release-letter objection window | **Kept as an internal firm business rule for now.** Must not be described as law, a regulation, or a verified professional rule anywhere. Fix the defect so the window can satisfy the step **only after the letter was actually sent** | §10.2 wording pass · §10.3 fix in migration 68 + TS mirror |
| **D8** | Staging environment | **Separate free-tier Supabase project** for persistent staging, synthetic test data, all test email recipients `delivered@resend.dev` | §14, WP-2 |

Closed questions that must NOT be re-asked: tasks tab stays; four client-card tabs; one template system; client is CC-only on release letter; ת.ז./אימייל/מטפל columns hidden; journey page shows no tasks; intake questionnaire is not auto-generated.

---

## 5. Final lifecycle and state-transition model

**Person:** `leads` row (optionally `converted_client_id`) → `clients.lifecycle_stage ∈ {lead, quote, onboarding, active, archived}`, derived solely by `derive_lifecycle_stage` / `refresh_lifecycle_stage_for` (triggers on `quotations`/`engagements`; never written directly).

**Engagement:** born in `approve_quotation` fan-out (`ensure_client_for_quotation` → `copy_lead_facts_to_client` → `open_quotation_representation` → `create_engagement_for_quotation` → `generate_onboarding_steps` → `create_deferred_collection_tasks` → **new, migration 72: transactional enqueue of the representation-email send** — §11.1). `engagements.status: onboarding → active` — the only transition, performed only by `close_onboarding`. `process_published_at` gates the portal.

**Approval-transaction email semantics (D1):** the send request is enqueued *inside* the approval transaction (pg_net queue insert — rolled back if approval rolls back, dispatched by the background worker only after commit). The enqueue block is exception-safe: an email-side failure can never abort an approval. Delivery is claimed atomically on `quotations.representation_sent_at` (`…is("representation_sent_at", null)`), so retries, double-clicks on the public approve button, and any later manual resend can never produce a duplicate. Failures leave the claim released, write `representation_error`, and surface as an internal accountant notification; the send and its outcome land in `email_messages` as today.

**Step:** `onboarding_steps.status` (10 statuses; portal shows a 4-bucket projection), `ball ∈ {me, client, prev_accountant, authority}`, `sort_order`, `depends_on_step_id`, `payload` (incl. `published`, dual-voice wording, requirements), and — after migration 68 — `required_for_close boolean not null default true`. **Every status change goes through `advance_onboarding_step`** (dependency enforcement, paperless skip reasons, event logging). Representation status is mirrored in by trigger `sync_representation_step` — the journey never writes representation state.

**Close:** `close_onboarding(p_engagement_id, p_force, p_reason)` — ownership check → noop if already non-onboarding → `onboarding_close_readiness` → refuse `{error:'not_ready', readiness}` unless forced → set active, log `status_changed {forced, readiness}`, `refresh_lifecycle_stage_for`, queue `onboarding_closed`. After 68: readiness = "no step where `required_for_close` and status ∉ {completed, verified, skipped, cancelled}, except a release letter whose objection window legitimately elapsed (§10.3)".

Kill switches preserved: `journeyUi=false` → legacy 3-tab nav + 5-tab card; `onboardingTab=false` → all onboarding UI hidden. Both read from `profiles.settings.flags`; `journeyUi` defaults **on** (`App.tsx:249–250`, `!== false`).

---

## 6. The exact required/optional data model

- **Column:** `public.onboarding_steps.required_for_close boolean` — nullable at add, backfilled, then `default true` + `not null`.
- **TS:** `OnboardingStep.requiredForClose?: boolean` (already on the type); `null → undefined` via the generic mapper — no mapper change needed (verified `dbMappers.ts:30–36`).
- **Effective-value rule (identical in UI and SQL):** `cancelled` → not required; else the column value; (fallback for pre-column rows: `stepType ∉ {representation_upgrade, first_month_review}` — after `not null` this branch is dead in SQL but stays in TS for safety).
- **Satisfied rule:** status ∈ {completed, verified, skipped} OR the release-letter window (§10.3).
- **Origins of the value (resolves constraint 6):**
  1. **Composer-generated steps** (`generate_onboarding_steps`): explicit per-type values (§8.1). A conditional step's existence is its condition — if the composer created it, it is required; only the two long-tail types are optional.
  2. **Template-applied steps**: the template entry's `requiredForClose` (§7).
  3. **Manually added steps**: the `AddRequestDialog` checkbox (exists, default checked).
  4. **Any existing step**: editable afterward via the new RPC (§8.2).
- **Audit:** creation logs `{requiredForClose}`; edits log `{requiredForClose: {from, to}}`; forced close logs the full readiness snapshot.

---

## 7. Journey-template changes

`journey_templates.entries` stays jsonb; each entry gains an optional key:
`{ stepType, payload, requiredForClose?: boolean }` — absent = type default (backward compatible with the 1 live template, 8 entries, verified shape `{stepType, payload}`).

- **`save_journey_template`** (replace, archive live def first): capture each step's effective value — `coalesce(required_for_close, step_type not in ('representation_upgrade','first_month_review'))` — into the entry. Keep all existing behavior (strips per-client payload keys, resets `done:false`, excludes representation/internal/long-tail types).
- **`apply_journey_template`** (replace, archive first): pass the entry's flag as the 4th argument to `create_onboarding_request` — `coalesce((e->>'requiredForClose')::boolean, true)`. Existing dedup rules (by type; custom by title) unchanged.
- **UI (`JourneyTemplatesDialog.tsx`):** per-entry "נדרש" checkbox when viewing/editing a template; display a small "רשות" tag on optional entries. No new screens.

## 8. Generated-step and edit-step behavior

### 8.1 `generate_onboarding_steps` (migration 70)
Add an explicit `required_for_close` value to each of its 12 `insert` statements: `false` for `representation_upgrade` and `first_month_review`, `true` for everything else. **Behavior-preserving** relative to the column default — the point is that generation no longer depends on the default. The function still does not read `journey_templates` (template auto-selection was never approved). Validate with the composer's `p_dry_run => true` against the one live `draft` quotation on staging.

### 8.2 Edit control (migration 71 + UI)
- New RPC `set_onboarding_step_required(p_step_id text, p_required boolean)`: ownership check via the step's client, refuse on closed statuses ∈ {completed, verified, cancelled} (skipped is allowed — un-skipping semantics stay out), update the column, `log_onboarding_event(…, 'note', 'עודכן: נדרש לסגירה', {requiredForClose:{from,to}})`. Additive; not routed through `advance_onboarding_step` because it is not a status change.
- UI: in the open step row's secondary actions (`OnboardingTab.tsx`), a toggle "נדרש לסגירת הקליטה" mirroring the AddRequestDialog wording; the existing "רשות" chip (`:1800`) reflects it live. Close-dialog list recomputes.

## 9. Questionnaire completion rules

- The questionnaire blocks closure iff its step exists, is `required_for_close`, and its status ∉ {completed, verified, skipped, cancelled}. The live "waiting_client = satisfied" leniency is **removed** by migration 68 — and verified to affect zero live rows (no `intake_questionnaire` steps exist in the DB at all, 2026-08-07).
- The questionnaire is **not** auto-generated (closed decision): it enters via + בקשה, where the checkbox decides required/optional; born `published=false` when the process is already published.
- Making it non-blocking without cancelling: uncheck at creation, or the §8.2 toggle, or `advance … skip` with a reason.

## 10. Previous-accountant flow

### 10.1 The flow (unchanged, regression-tested)
Release letter prepared in `ReleaseLetterDialog` → sent by `send-release-email` to the **previous accountant**, client **CC only** (client never signs — closed decision) → previous accountant opens `?release=` (`PublicReleasePage`), signs (`release_portal_sign`), uploads materials (`portal-upload-document`, `tokenKind=release`) → checklist + `onboarding_events` reflect both the page and Guy's manual marks (two channels, neither locks the other) → `materials_received` step tracks the eight items.

### 10.2 The 3-business-day objection window — correct labeling (constraint 9)
**Verdict: an implemented business rule with no authoritative citation** — option (b). Evidence: the number 3 exists in exactly one code location (`ReleaseLetterDialog.tsx:145`, `addBusinessDays(new Date(), 3)` — a local helper skipping only Fri/Sat, ignoring Israeli holidays); the letter text asks for a reply "בתוך כ-3 ימי עסקים" citing כלל 16; `types/onboarding.ts:324` calls the same thing תקנה 16 and asserts it is "חוקית ולא שיקול דעת"; the documentation trail terminates at an explicitly self-labeled working assumption. No rule text, no link, no reference document anywhere.
**D7 ruling (2026-08-07):** the 3-business-day period is kept as an **internal firm business rule for now**. It must not be described as law, a regulation, or a verified professional rule — anywhere: code comments (`types/onboarding.ts:316–325`), migration comments (68's "ההקלה החוקית"), and docs get a wording pass in WP-3 replacing those claims with "כלל עבודה פנימי של המשרד". The letter text itself is unchanged (Guy approved it). Behavior: 3 business days kept, plus the §10.3 sent-guard fix.

### 10.3 Defect fix (in migration 68 revised + TS mirror)
Live and migration-68 predicates count `no_objection` whenever `due_date <= current_date` — **with no check that the letter was ever sent**. Since `set_due` lets any step get an arbitrary due date, a never-sent letter with a past due date silently satisfies closure. Fix in both rules: the window applies only when the step has left preparation — `status not in ('pending','locked')` — i.e., silence counts as consent only after silence was actually solicited. Impact on live data: none (the one past-flow release letter is `waiting_client`; the two `pending` ones are blocking today and stay blocking). Add verify-script cases for both sides.

## 11. Email policy — every send path, classified

### 11.1 The representation email — current state and the approved target model (D1)

**Current state (verified):** quotation approval itself sends **nothing** (`PublicQuotationPage.tsx:124–126`). What exists today: (a) a manual checkbox-send in the accountant's creation dialog (`App.tsx:796–802`, `force:true`, no body preview), and (b) a client-side 24h effect (`App.tsx:292–326`) that fires only on accountant login. **Neither satisfies the D1 ruling.**

**Target model (build in WP-6):**
1. **Immediate automatic send at approval, server-side.** `approve_quotation` (migration 72, additive block at the end of its fan-out) enqueues a `pg_net` `http_post` to `send-onboarding-email` — inside the transaction, so a rolled-back approval sends nothing, and dispatch happens only after commit. The block is wrapped in an exception handler: **an email failure can never fail an approval.** Auth via an internal secret held in Vault (reuse the `verify_quotation_cron_secret` pattern from migration 12); `send-onboarding-email` gains an internal-secret branch alongside its existing auth.
2. **Idempotent, duplicate-proof.** The existing atomic claim (`update quotations … set representation_sent_at … where representation_sent_at is null`, `send-onboarding-email/index.ts:350–359`) plus the `onboard:<requestId>` idempotency key remain the single dedup gate. Repeated approval calls, pg_net retries, and later manual resends all hit the same claim — at most one automatic email per quotation, ever.
3. **Failure visibility and safe retry.** On failure the claim is released and `representation_error` is written (existing mechanism); a `representation_link_missing` internal accountant notification is queued (extend the daily attention job from migration 34 to detect approved-with-no-send > 24h). Manual recovery stays the existing resend in `RepresentationRequestReview` — which goes through the claim, so it cannot duplicate a send that already succeeded.
4. **24h client nudge removed.** The `App.tsx:292–326` effect is deleted; its condition becomes the internal notification above. **No client email leaves via any 24-hour mechanism.**
5. **The creation-dialog checkbox path survives only for representation requests created outside the quotation flow** (direct `RepresentationOnboardingDialog` use). For quotation-born requests the automatic send has already happened; the dialog send remains claim-protected against duplication.
6. **Audit:** every send (success or failure) is a row in `email_messages` (kind `onboard`) with delivery stamps via the Resend webhook, visible in the client's email history — unchanged plumbing, now exercised by the automatic path.

### 11.2 Full inventory (verified per-file 2026-08-07; "Target" = after WP-6)

| Path | Recipient | Trigger | Preview? | Target classification |
|---|---|---|---|---|
| **NEW: `approve_quotation` → pg_net → `send-onboarding-email`** | client | automatic, at approval commit | — (approved automatic) | **The one default-enabled automatic client email** |
| `App.tsx:313` 24h nudge | client | automatic (login effect) | — | **REMOVED as client email** → internal `representation_link_missing` notification |
| `quotation-reminders` edge fn | client/lead | daily pg_cron | — | **Firm setting, default OFF**; atomic guard kept for opt-in |
| `App.tsx:802` rep creation dialog | client | accountant dialog + checkbox | body: no | Manual path for non-quotation requests only; claim-protected |
| `App.tsx:1173` quotation send | client/lead | explicit button | inline iframe preview (`QuotationBuilder.tsx:988`) | Accepted (preview exists, different idiom) |
| `RepresentationExecutionCenter.tsx:157,187` signer fan-out / remind | client + spouse signers | explicit button | read-only preview on separate button (deliberate, `:147–148`) | Accepted, documented |
| `ReleaseLetterDialog.tsx:117` | prev accountant, CC client | explicit dialog | editable body in dialog | Accepted (the dialog *is* the preview) |
| `EmailPreviewDialog` (7 mounts) | client | explicit | ✅ full gate | Policy-conformant |
| `notify-accountant` | **Guy only** | auto (login + public-page flush) | — | Internal — allowed automatic |
| `weekly-backup` | **Guy only** | weekly cron | — | Internal. ⚠ note: emails a full unencrypted DB dump — record as a standing risk, out of scope |
| `resend-webhook`, `portal-upload-document`, `signing-session`, `ocr-document`, `backfill-email-html` | — | — | — | send no email |

**Deliberate non-send anchors** (keep, verify in regression): `App.tsx:943–945` (form production), `App.tsx:988–990` (activation), `App.tsx:281–284` (post-signature), `JourneyTab.tsx:398–399` (portal note — a UI promise, not a guard).

### 11.3 The final email policy (binding)

1. **The representation email immediately following quotation approval is the only client email enabled automatically by default.**
2. **The quotation-expiry reminder is controlled by a firm setting and defaults OFF.**
3. **Every other client email requires an explicit accountant action and preview unless separately approved.**
4. **Internal accountant notifications are not client emails and may remain automatic.**

Any test sends: `delivered@resend.dev` only; on staging all fixture clients use that address, so even a mistake is safe.

## 12. Migration 68 — revision, backfill, validation, rollback

### 12.1 Status
Written, **unapplied** (header says so; column absent; not in `MIGRATIONS.md`). **Do not apply as written.**

### 12.2 Why it must be revised
Its `create_onboarding_request` is a from-scratch rewrite that drops, vs the live definition (`supabase/live-2026-08-05/create_onboarding_request.sql`): the client lookup + `client_not_found` + ownership check; the 12-type whitelist (`step_type_not_allowed`); the empty-requirements guard (`no_requirements`); the fallback to the latest non-onboarding engagement; per-type `ball`; `scope='person'`; dependency validation + `locked` birth status; `sort_order = max+10`; id from column default; `status` in the return. Applying it would regress request creation for every future step.

### 12.3 Revised content (edit `supabase/68-onboarding-required-for-close.sql` in place — it was never applied, the number stays)
1. Schema: `add column if not exists required_for_close boolean` + comment. *(unchanged)*
2. Backfill (unchanged three passes; note: pass 2 — intake in `waiting_client` → false — currently matches **zero rows**, keep defensively):
   `representation_upgrade`/`first_month_review` → false · intake in waiting_client → false · rest → true. Then `set default true`, `set not null`.
3. `create_onboarding_request`: **take the live definition verbatim** and make exactly three edits — trailing `p_required_for_close boolean default true`; `required_for_close` in the insert column list with `coalesce(p_required_for_close, true)`; add `requiredForClose` to the event meta. Nothing else changes.
4. `onboarding_close_readiness`: the single rule, **plus the §10.3 sent-guard**:
   blocking = steps of the engagement where `status not in ('completed','verified','skipped','cancelled') and required_for_close and not (step_type='release_letter' and status not in ('pending','locked') and due_date is not null and due_date <= current_date)`. Return shape `{ok, engagementId, alreadyClosed, blocking, ready}` — the dropped sub-verdicts (`retainer`/`releaseLetter`/`intake`) are read by **no caller**: branch UI discards the payload and computes locally (`OnboardingTab.tsx:275–278`); master UI only counts. Verified.
5. Header keeps the "requires explicit approval" warning until applied; on application add the ledger line to `supabase/MIGRATIONS.md`.
6. Migrations 69 (templates), 70 (generator), 71 (edit RPC) as §7–§8 — each its own file + ledger line, each preceded by archiving the live definition it replaces into `supabase/live-2026-08-<date>/`.
7. **Migration 72 — automatic representation send at approval (D1):** archive the live `approve_quotation`; append an exception-safe block after its existing fan-out that enqueues the pg_net `http_post` to `send-onboarding-email` with the internal secret (new Vault secret + verifier function in the `verify_quotation_cron_secret` pattern). `approve_quotation` is in the protected list — the change is **strictly additive at the end of the function**, touches none of the existing fan-out, and a failure inside the block is swallowed (logged to `onboarding_events`/`representation_error`, never aborting approval). Also: the daily attention job (migration 34's schedule) gains the `representation_link_missing` internal-notification check; the `quotation-reminders` schedule text is committed to the repo as documentation.

### 12.4 Application order
Staging first (WP-3/4/6), full validation, then production only at Gate 3 (§19). Note 72's coupling to the edge-function change: the updated `send-onboarding-email` (internal-secret branch) must be deployed **before** 72 activates the hook — sequencing handled in §19.

### 12.5 Validation matrix (staging with prod-clone data, then production post-apply)
- For **each of the 3 live engagements**: sorted set of blocking step ids identical before vs after; `ready=false` before and after. (Recorded baseline 2026-08-07: blocking counts 6/8/6.)
- `create_onboarding_request` negative tests: bad type → `step_type_not_allowed`; foreign client → ownership error; custom with no requirements → `no_requirements`; dependency on open step → born `locked`; `sort_order` continues max+10.
- Close matrix via the **real RPC**: blocked (required open) → `not_ready` + correct list; optional-only open → closes; complete → closes; forced → closes + `{forced:true}` event + notification; release letter sent + window elapsed → closes; release letter never sent + past due → **blocks**.
- `public_link_health()` clean after every migration.
- `npm run verify:close-rules` green (extended cases).
- **Migration 72 (staging):** the §17.5 acceptance tests AT-1…AT-4, plus: an approval whose email enqueue is forced to fail still approves cleanly (engagement + steps created, error recorded, notification queued).

### 12.6 Rollback
`CREATE OR REPLACE` the replaced functions from their archived predecessors (`supabase/live-2026-08-05/` for 68's pair; `supabase/live-2026-08-<date>/` for 69–72 — including `approve_quotation`, which restores the no-auto-send behavior in one statement), then `alter table public.onboarding_steps drop column required_for_close`. No other code reads the column (frontend tolerates its absence via the fallback branch). Rehearse the rollback once on staging before Gate 3.

## 13. Existing-data impact analysis

Protected inventory (live, 2026-08-07): 16 clients · 2 leads (both converted) · 3 engagements (all `onboarding`, all published) · 33 steps · 3 quotations (2 approved, 1 draft) · 9 representation requests · 101 emails · 16+ documents · 20 public tokens (all healthy) · 1 journey template.

- The branch changes **no** edge function, **no** data-write path, **no** public page. The only data-affecting artifact is migration 68 (+69–71), whose backfill is provably behavior-preserving (§12.5) — and whose riskiest rule matches zero rows.
- Immutable by rule: sent quotations, PDFs, `email_messages`, signatures, tokens. No branding changes in this cycle → live links unaffected.
- The existing template gains nothing until re-saved; absent entry flags read as type defaults.
- Post-deploy PROD-RO pass (§19.5) opens every client read-only and diff-checks `public_link_health()`.

## 14. Environments and the staging strategy (D8)

| Env | What | Data | Emails |
|---|---|---|---|
| **Local dev** | vite via `.claude/launch.json` (`autoPort` — read the real port from logs); `VITE_DEV_BYPASS_AUTHZ` injects sample clients (note: only `useClients`/`useTasks` are stubbed — the Supabase client still points at whatever URL is configured) | in-memory samples | none |
| **Staging (new, persistent)** | Second free-tier Supabase project (D8 ruling). Schema+functions replicated from a prod schema-only dump (`supabase db dump` / CLI, read-only against prod); edge functions — **including the WP-6-modified `send-onboarding-email` and `quotation-reminders`** — deployed by CLI to the staging ref; secrets set (`RESEND_API_KEY` may be shared); frontend runs locally with `.env.staging` (`vite --mode staging`) | (a) **synthetic fixture set** for destructive lifecycle tests — every client email = `delivered@resend.dev`; (b) **one-time prod data clone** for migration rehearsal only | only `delivered@resend.dev` can ever receive |
| **Production** | unchanged (`uoweoqtuiettozagwgdw`, Vercel from `master`, functions via GitHub Action) | real | real |

Rules: destructive/lifecycle/close tests **only on staging**. The in-prod E2E sandbox user (`e2e-test@firm.local`, allowlisted, RLS-isolated) is retained **only** for post-deploy smoke (§19.5) — no more destructive testing in prod, which retires the sharpest risk in `setup-test-env.mjs` (service-role deletes against production tables). Do **not** schedule the reminder/backup crons on staging. Staging setup steps, checks and the fixture seed script are WP-2. Creating the project is **Gate 2a** (Guy's Supabase org; free tier — confirm no cost).

## 15. Permanent portal-link behavior (documented, unchanged)

One token per client (`clients.portal_token`), minted once by `ensure_client_for_quotation`; `mint_portal_token` idempotent (`where portal_token is null` — the strongest guarantee in the system). No action in this cycle mints, rotates, or auto-sends links. `?portal=` `?quote=` `?sign=` `?intake=` `?release=` `?onboard=` all keep resolving for existing tokens; `public_link_health()` after every migration and in every smoke pass. "Send the page" remains manual-copy until the (out-of-scope) send policy ships.

## 16. Work packages

> Each WP: goal · files/functions · DB · tasks · tests · acceptance · dependencies · rollback/safety. One commit series per WP, Hebrew commit messages, specific-file `git add` only. WPs 3–6 each end with `tsc --noEmit` + `vite build` + `verify:close-rules` green.

**WP-0 — Plan lock & decision table. ✅ CLOSED 2026-08-07.** All eight decisions ruled and recorded in §4; the plan below already reflects them. The implementing session starts at WP-1.

**WP-1 — Baseline snapshot.** Goal: pre-change reference. Tasks: `git fetch`; confirm `master`=`266f530` (else rebase branch first); record live counts, readiness JSON of the 3 engagements, `public_link_health()`; baseline screenshots of tasks/clients/journey at desktop+375px, light+dark (dev fixtures OK). No DB writes. Acceptance: baselines stored under the session scratchpad + summarized in the WP commit message (docs only). Rollback: n/a.

**WP-2 — Staging environment (Gate 2a).** Goal: persistent, isolated staging per §14. Files: `scripts/seed-staging.mjs` (new), `.env.staging.example` (new; real `.env.staging` stays untracked), staging notes in `docs/` . DB: staging project created; prod schema-only dump applied; edge functions deployed to staging ref; one-time prod data clone (for §12.5) + synthetic fixture seed (≥1 client per lifecycle stage; an onboarding client with paperless+retainer+release-letter+custom steps; all emails `delivered@resend.dev`). Tests: app boots against staging; `public_link_health()` on staging; auth works with a staging user. Acceptance: full journey page renders on staging for every fixture stage; zero requests to the prod URL while in staging mode (network log). Deps: WP-1. Safety: prod access read-only (dump only); never point staging scripts at the prod ref — hardcode the staging ref in `seed-staging.mjs` and refuse `uoweoqtuiettozagwgdw`.

**WP-3 — Migration 68 revision + staging application.** Goal: §12.3 exactly. Files: `supabase/68-onboarding-required-for-close.sql`, `scripts/verify-close-rules.mjs` (new cases: fallback branch, cancelled, release-letter sent/not-sent), `src/types/onboarding.ts` (§10.3 mirror **+ the D7 wording pass — no "law"/"regulation" claims anywhere**), `supabase/live-2026-08-07/` archives. DB: staging only. Tests: §12.5 matrix on staging (prod-clone side for parity; fixture side for the close matrix). Acceptance: §12.5 all green on staging; rollback rehearsed once on staging and re-applied. Deps: WP-2. Rollback: §12.6.

**WP-4 — Template + generator + edit-control (migrations 69–71 + UI).** Goal: §7 + §8 complete. Files: `supabase/69-template-required-flag.sql`, `supabase/70-generator-explicit-required.sql`, `supabase/71-set-step-required.sql`, `JourneyTemplatesDialog.tsx`, `OnboardingTab.tsx` (toggle + chip), `types/onboarding.ts` if needed. DB: staging. Tests: save template from a fixture client with mixed flags → entries carry them; apply to a fresh fixture client → steps carry them; dry-run composer on the draft quotation → explicit values; full approve on a fixture → generated steps have explicit values; toggle a step → chip, close-gate list, and event log all update; toggling completed/cancelled refused. Acceptance: constraint 6 satisfied end-to-end on staging: template → generated step → edited step → readiness honors it identically in UI and RPC. Deps: WP-3. Rollback: restore archived defs; 69–71 additive.

**WP-5 — Close-flow integration + audit polish.** Goal: the close path proven against the real RPC (it never has been). Files: `OnboardingTab.tsx` (only if defects found; plus optionally pass a fixed Hebrew `p_reason` from the override link instead of null). DB: none beyond WP-3/4. Tests: the §12.5 close matrix through the **browser** on staging fixtures, including: dialog lists only required-open steps; override closes in one click; skipped required steps remain visible as open requests of an active client; `journeyUi=false` and `onboardingTab=false` both restore legacy behavior with the new column present. Acceptance: every §2.1 R9–R11 AT green in browser; console clean. Deps: WP-4.

**WP-6 — Email-policy implementation (D1/D2).** Goal: the §11.3 policy true in code.
*Files/functions:* `supabase/functions/send-onboarding-email/index.ts` (internal-secret auth branch; no change to claim/idempotency/logging) · `supabase/functions/quotation-reminders/index.ts` (firm-setting gate before any send; skip counted and logged when OFF) · `supabase/72-auto-representation-send.sql` (§12.3 item 7: `approve_quotation` additive block, Vault secret, attention-job check) · `src/App.tsx` (delete the 24h send effect `:292–326` and the now-dead `autoRepHandled` ref; keep `representationError` surfacing) · notifications catalog (`_shared/accountantNotifications.ts` + settings UI — two entries born automatically per the existing pattern: `representation_link_missing` [internal, default ON] and the quotation-reminder client-email toggle [default OFF]) · repo copy of the `quotation-reminders` `cron.schedule` text · §11 inventory copied into `docs/EMAIL-POLICY.md` as the standing reference.
*DB:* migration 72, staging first. *Tests:* §17.5 AT-1…AT-5 on staging, plus the §12.5 forced-failure case, plus: reminder toggle ON on staging → cron run sends once with the atomic claim intact.
*Acceptance:* approval → exactly one automatic email with **no accountant session involved**; 24h mechanism produces an internal notification and zero client emails; reminders silent while OFF; `email_messages` audit matches expectations after every test.
*Deps:* WP-2 (staging). *Rollback:* restore archived `approve_quotation` (kills the hook in one statement); redeploy previous function versions; revert the App.tsx commit — each independent.

**WP-7 — Full integration pass on staging.** Goal: the end-to-end proof this cycle exists for. Tests (browser, staging fixtures): lead → quotation → client approves+signs on `?quote=` **with no accountant session open** → engagement + ordered steps + **exactly one automatic representation email arrives at `delivered@resend.dev`, recorded in `email_messages` and the client's email history** → builder reorder/add draft/expose → portal reflects (private window) → paperless path incl. skip-reason guard → retainer unlock only after paperless (UI + direct API attempt) → release letter: send (to `delivered@resend.dev`), previous-accountant page sign+upload, checklist+events update, window behavior per §10.3 → custom request round-trip → close: blocked → resolve/skip → close → active-client journey (onboarding UI gone, counts correct, next-action never "הכול מסודר" while work remains) → both kill switches → `#/desk`-era deep links. Desktop+375px, light+dark, RTL glance (number ranges), console clean throughout; screenshot at each station. Acceptance: the §21 checklist rows 1–12 all green **on staging**. Deps: WP-3–6.

**WP-8 — Prod-shape verification.** Goal: nothing about real data breaks. Tests: on staging's prod-clone: open all 16 clients' journey pages read-only, all render (esp. active clients with no engagement); the 3 engagements show correct progress/blocking; representation rows mirror the 9 requests; migration parity (§12.5) re-confirmed post-WP-4. Acceptance: zero rendering errors, parity green. Deps: WP-7.

**WP-9 — Cleanup (Phases 0–5 debris only).** Goal: ship clean. Files: delete `clientTabs/OverviewTab.tsx`, `clientTabs/TaxProfileTab.tsx` (zero importers — verified); **delete `OnboardingJourneyMap.tsx`** (unreachable in production — `!embedded` + `journeyUi` default-on; superseded by the progress header) and update its two references (`OnboardingTab.tsx:33,559`, `__TestOnboarding.tsx:184`); remove stale comments (`ClientWorkspace.tsx:2,10`, `index.css:1162` MyDesk section comment); add to `.gitignore` on the product branch: `dist-review/`, `scripts/design-export-*.mjs`, `כל המסכים ב HTML/`, `docs/PIVO-CLIENT-LIFECYCLE-VISUAL.*`; one-line staleness note at the top of `CLAUDE.md` §5 pointing at `PROJECT-HANDOFF.md`; note in `PLAN-ONBOARDING-SEND-POLICY.md` that "migration 67" must be renumbered. Tests: `tsc` + `vite build` + grep for dangling imports; dev harnesses still run. Acceptance: build green, `?test-journey` and `?test-onboarding` still work in dev. Deps: WP-7 (delete only after the integration pass, so nothing verified is missing). Rollback: revert commit.

**WP-10 — Merge, production migration, deploy (Gates 3 + 4).** See §19. Deps: WP-1–9 all green.

**WP-11 — Post-deploy smoke + closeout.** See §19.5, §21. Deps: WP-10.

---

## 17. Test strategy

### 17.1 Automated (runs at every WP boundary and pre-merge)
`tsc --noEmit` · `vite build` · `npm run verify:close-rules` extended to ≥20 cases: the 13 existing + fallback-branch (undefined `requiredForClose`), cancelled, release-letter {sent, not-sent} × {due passed, not passed}, optional-open-only. Keep the substring drift-guard against the migration file, updated for the §10.3 clause. (A real test framework remains out of scope — no new dependencies.)

### 17.2 Integration (staging, scripted where possible, SQL-verified)
The §12.5 matrix (RPC-level, both data sets) + `email_messages` audits after every flow + `public_link_health()` after every migration + negative-path RPC tests (bad tokens, foreign ownership, locked advance, paperless skip reasons).

### 17.5 Email-policy acceptance tests (mandatory, staging — Gate-4 blockers)
- **AT-1 — Automatic send without accountant login:** approve a fixture quotation from the public `?quote=` page with **no authenticated accountant session anywhere**; exactly one representation email arrives at `delivered@resend.dev`; `quotations.representation_sent_at` set; one `email_messages` row (kind `onboard`) linked to the client.
- **AT-2 — No duplicates on retry/repeat:** call `approve_quotation` again for the same quotation, and force a re-dispatch of the queued request; total representation emails for that quotation remains **one** (claim + idempotency key hold).
- **AT-3 — Failure is safe, visible, retryable:** with the send forced to fail (bad function secret on staging), approval still completes fully (engagement, steps, portal); the claim is released, `representation_error` is set, the internal notification appears; a subsequent manual resend succeeds and still results in exactly one delivered email.
- **AT-4 — The 24-hour mechanism sends no client email:** simulate an approved quotation >24h old with no send; assert **zero** new `email_messages` client rows from any 24h path, and that the `representation_link_missing` internal accountant notification is queued instead.
- **AT-5 — Reminders silent while OFF:** with the firm setting at its default (OFF), run `quotation-reminders` against a fixture quotation expiring tomorrow; zero client emails, zero `auto_reminder_sent_at` claims; flip the setting ON → exactly one reminder with the atomic claim.

### 17.3 Browser acceptance (staging)
WP-7's end-to-end script — the only accepted proof of done per CLAUDE.md §1. Screenshots archived per station; console `level=error` clean; if the inner preview pane can't capture, use claude-in-chrome (known limitation).

### 17.4 Visual verification matrix (requirement 18)
Every screen touched by the 14 commits (tasks, clients, journey in all chapters, close dialog) × {desktop 1280, mobile 375} × {light, dark} × RTL sanity (number ranges, no horizontal scroll at 375). Public pages: rendered once each on staging fixtures to prove non-regression (they were not modified — the check is cheap insurance).

## 18. Cleanup — see WP-9 (scoped strictly to Phases 0–5 debris).

## 19. Deployment and rollback

### 19.1 Pre-merge checklist (hard requirements)
- WP-0…WP-9 complete; §21 rows 1–13 green on staging.
- `master` still `266f530` (else rebase, rerun WP-7 smoke subset).
- `git diff master..HEAD --stat` reviewed: the 21 known files + WP changes (now including `supabase/functions/send-onboarding-email`, `supabase/functions/quotation-reminders`, migrations 68–72, notification catalog); **no** `src/review/**`, `vercel.json`, `index.review.html`, `vite.review.config.ts` (those exist only on `review/phases-0-5-visual`, which **never merges** — its `vercel.json` would hijack the production build).
- Untracked root artifacts not staged (now `.gitignore`-protected via WP-9).
- On-demand backup: `supabase db dump` (schema+data) archived locally before touching prod.

### 19.2 Production migration window (Gate 3 — explicit approval to run SQL on prod)
Apply in order: 68 (revised) → 69 → 70 → 71. After each: `public_link_health()`. After 68: §12.5 parity queries on the 3 real engagements (blocking sets unchanged, `ready=false`). **Migration 72 is NOT applied in this window** — it waits for the updated edge functions (19.3), otherwise the hook would call a function version without the internal-secret branch. The old frontend (still deployed) is compatible: it never reads the column and only consumes `readiness.blocking`/counts, both preserved.

### 19.3 Frontend + functions deploy, then activate the hook (Gate 4 — go-live approval)
1. Merge `redesign/design-package-phases-0-5` → `master` with `--no-ff` · push · watch the Vercel deployment to success.
2. The branch now touches `supabase/functions/**` (WP-6), so the GitHub Action deploys **all** edge functions on this push — watch it to success. Set the new internal-secret Vault value on prod before this step.
3. **Apply migration 72** (still under Gate 3's SQL approval, executed here for ordering) — the automatic send is now live. Interim states are safe: before 72, approvals behave as today (the merged frontend no longer has the 24h client send, and the internal notification covers any approval landing in the gap — check for such approvals and send manually via the existing resend).
4. Run `public_link_health()` and the §19.5 smoke.

### 19.3a Production activation check for the auto-send (safe)
No test approval is performed in production. Verify instead: migration 72 present (`pg_get_functiondef(approve_quotation)` contains the hook); Vault secret set; `send-onboarding-email` deployed version includes the secret branch; pg_net queue empty of failures. The behavioral proof lives in staging AT-1…AT-4; the first real approval is additionally covered by the failure-notification path.

### 19.4 Rollback sequence (fastest first)
1. **Auto-send only:** restore the archived `approve_quotation` (one `CREATE OR REPLACE`) — approvals keep working, sends stop; everything else stays deployed.
2. **Frontend:** `git revert -m 1 <merge-commit>` + push (Vercel redeploys old UI; fully compatible with migrations applied — the column simply goes unread beyond defaults). Note: the revert also reverts the edge-function sources, and the workflow redeploys the previous versions — do step 1 first so no hook calls a function without the secret branch.
3. **Behavioral:** kill switches `journeyUi=false` / `onboardingTab=false` (no deploy needed).
4. **DB (only if the functions themselves misbehave):** §12.6, rehearsed on staging. Order: hook first, frontend second, DB last; never leave the new frontend running against rolled-back functions.

### 19.5 Post-deployment smoke (production — safe/read-only only; constraint 2)
Login as Guy → tasks + clients screens render with real counts → open **one** real client journey read-only → `select public_link_health()` → open the sandbox user's portal link in a private window (read-only) → console clean → toggle `journeyUi` off/on once and confirm both states (settings write to Guy's own profile only) → verify `email_messages` gained **zero** rows during the smoke → confirm the 3 engagements' readiness unchanged → §19.3a activation checks → confirm the quotation-reminder firm setting reads **OFF** and the notification-settings screen shows both new entries. **No** step advancement, no sends, no closes, no test approvals, no test-data creation in prod.

## 20. Human approval gates (the only planned stops)

| Gate | When | What Guy approves |
|---|---|---|
| **1** | ✅ **Closed 2026-08-07** | The decision table §4 — all eight ruled |
| **2a** | WP-2 | Creating the staging Supabase project in his org |
| **3** | After WP-9, before prod SQL | Applying migrations 68–72 to production (72 executed at the §19.3 ordering point) |
| **4** | After 19.1–19.2 checks pass | Merge + push + deploy of frontend **and edge functions**, and activation of the automatic send (go-live) |

Plus: any genuine blocker (credentials, external service) — stop exactly there with one precise action for Guy, in Hebrew.

## 21. Final completion checklist (objective definition of done)

All verified in a browser; 1–13 on staging during WP-7/8, then 14–18 in production after deploy.

1. ☐ Lead → quotation → approval → engagement + ordered journey, person never counted twice.
2. ☐ Quotation approval triggers **exactly one** automatic representation email — server-side, with no accountant login involved — recorded in `email_messages` and the client's email history; retries/repeats never duplicate it; failure is visible and safely retryable (§17.5 AT-1…AT-3 green on staging).
2a. ☐ No 24-hour mechanism sends any client email (internal notification only); quotation reminders send nothing while the firm setting is OFF, and the setting is visible and defaults OFF (AT-4, AT-5 green).
3. ☐ Journey shows one ordered list: state, ball, required-flag, blocking dependency only when locking.
4. ☐ Paperless → payment unbreakable from UI and API.
5. ☐ Previous-accountant flow end-to-end; client never signs; §10.3 window honors "sent" guard.
6. ☐ Questionnaire blocks when required, not when optional; never auto-generated.
7. ☐ Required/optional: template entry → generated step → editable afterward → persisted → honored identically by UI and RPC (the §12.5 matrix).
8. ☐ Normal closure refused while required steps open; dialog lists exactly those; one-click override with audit row + notification; skipped steps survive as open requests.
9. ☐ Post-closure: active client, onboarding UI gone, counts/pipelines update, honest next-action line.
10. ☐ Both kill switches restore the previous experience (with migrations applied).
11. ☐ `tsc`, `vite build`, `verify:close-rules` (extended) all green.
12. ☐ Visual matrix §17.4 complete (desktop/375, light/dark, RTL).
13. ☐ Cleanup done; build contains no review files; dead files gone.
14. ☐ Migrations 68–72 applied to production in the §19 order; parity queries green; ledger updated; live defs archived; §19.3a activation checks green.
15. ☐ `master` merged, pushed; Vercel deploy **and** the edge-functions workflow both succeeded.
16. ☐ Production smoke §19.5 all green; `public_link_health()` clean.
17. ☐ No existing client, quotation, document, signature, email record, or token altered (PROD-RO diff).
18. ☐ Closeout report to Guy in Hebrew: what shipped, what was verified, screenshots, the two standing risks noted (weekly-backup unencrypted dump; native prompts deferred to Phase 7).

## 22. Recommended execution order and the opening prompt

**Order:** WP-1 → WP-2 (Gate 2a) → WP-3 → WP-4 → WP-5 → WP-6 → WP-7 → WP-8 → WP-9 → WP-10 (Gates 3, 4) → WP-11. Strictly sequential except WP-6, which may interleave after WP-2. (WP-0 / Gate 1 closed 2026-08-07 — decisions recorded in §4.)

**Opening prompt for the fresh implementation session (give this to Claude verbatim):**

```
אתה מבצע את FINAL-IMPLEMENTATION-PLAN.md שבשורש הפרויקט — מקצה לקצה, ברצף,
בלי לפתוח מחדש החלטות סגורות. סדר קריאה לפני שורת קוד ראשונה:
CLAUDE.md (במיוחד §0 ו-§1) → FINAL-IMPLEMENTATION-PLAN.md כולו → PROJECT-HANDOFF.md
(רקע; כשהם סותרים — התוכנית גוברת, הסתירות מפורטות בסעיף 3 שלה).

עובדים על הענף redesign/design-package-phases-0-5. אסור למזג את
review/phases-0-5-visual לעולם. אין מיזוג ל-master, אין הרצת מיגרציה בפרודקשן,
ואין פריסה — לפני שער האישור המתאים (סעיף 20 בתוכנית).

כל החלטות המוצר כבר הוכרעו ורשומות בסעיף 4 (שער 1 סגור) — לא שואלים אותן שוב.
בפרט: מייל הייצוג נשלח אוטומטית מיד עם אישור ההצעה, מצד השרת, בלי תלות
בכניסת רו"ח ובלי כפילויות (סעיף 11.1); מנגנון 24 השעות לא שולח מייל ללקוח —
רק התראה פנימית; תזכורת פקיעת הצעה כבויה כברירת מחדל ונשלטת בהגדרות המשרד.

מתחילים ב-WP-1 וממשיכים לפי סדר חבילות העבודה (סעיף 22) בלי לעצור, למעט
שלושת השערים שנותרו (2a, 3, 4) וחסם אמיתי שאי אפשר לפתור מהריפו. חמשת מבחני
הקבלה של מדיניות המייל (סעיף 17.5) הם תנאי עצירה לפני go-live.

כללי ברזל: כל בדיקה הרסנית — רק על סביבת ה-staging שתוקם ב-WP-2, לעולם לא על
לקוחות אמיתיים; מיילים בבדיקות רק אל delivered@resend.dev; QA בדפדפן לפני כל
"סיימתי", כולל מובייל 375 ומצב כהה; SQL תוספתי בלבד עם ארכוב ההגדרה החיה לפני
כל החלפה; git add על קבצים ספציפיים בלבד; כל דיווח לגיא — בעברית, בלי ז'רגון.
```

---

## Appendix — evidence sources

Verified 2026-08-07: live DB reads (counts, `information_schema`, readiness of all 3 engagements, `journey_templates` shape, `public_link_health()`, migration `max(version)=20260805133532`, zero `intake_questionnaire` rows, no Supabase branches) · `git diff master..branch` (21 files; only SQL = unapplied 68; no edge functions; no vercel.json) · per-file code verification of: the email inventory (§11), the required/optional layers (§2.3), the release-letter trail (§10.2), the review-branch composition, the test-infrastructure reality (§14).
Documents: `PROJECT-HANDOFF.md` · `docs/PLAN-JOURNEY-CENTER.md` · `docs/PLAN-ONBOARDING-SEND-POLICY.md` · `docs/GAP-ONBOARDING-SPEC-2026-08-05.md` · `docs/PLAN-DESIGN-PACKAGE-IMPLEMENTATION-2026-08-05.md` · `supabase/MIGRATIONS.md` · `supabase/live-2026-08-05/` · `docs/testing.md` · `PHASE_1_APPLY_CHECKLIST.md`.
