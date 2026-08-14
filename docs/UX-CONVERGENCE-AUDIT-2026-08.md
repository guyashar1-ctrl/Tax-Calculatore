# PIVO — Product-Wide UX / Visual / Responsive Audit (2026-08-14)

> Exploration pass only. No code, migrations, commits or pushes were made in this audit.
> Baseline: master @ `ba145c1` (deployed to production). Dev server against production DB,
> sample-data injection active for clients/tasks lists; real-data evidence via `?test-case=`
> and `?portal=` routes (e2e sandbox client רותי + one active test client).

**Evidence method disclosure:** the in-app browser's screenshot capture is broken in this
environment ("Browser pane is not displayed, so the page is not compositing frames" — retried
this session, still failing). All visual evidence below is from the *live rendered app* via
DOM text extraction, accessibility-tree reads, and computed-layout measurements
(`getBoundingClientRect`, `scrollWidth`, computed styles) at 1440×900, 1920×1000, 390×844 and
375×812 — not from source inspection alone. Visual qualities that only pixels can show
(color rendering, anti-aliasing, subtle alignment) could not be observed directly and are
not claimed.

---

## 1. Executive assessment — why it still doesn't feel like the designed product

The **product model is now largely right**: five peer case tabs, two global tabs, derived
"waiting" semantics, portal filtered to client-owned actions only, institution alignment as
one capability, tax-fact governance, publish/draft discipline. Almost none of the "feels
wrong" comes from the model. It comes from five compounding delivery-layer failures:

1. **There is no shared layout system.** Every workspace picks its own width
   (1280 / 1040 / 880 / 760 / unbounded in CSS, plus **11 more** inline widths inside
   `features/annualReport` alone). The same person moving between tabs experiences a
   different product geometry each time. Worst case measured: Tasks — the default landing
   screen — renders an **880px column inside a 1920px viewport (45.8% utilization, ~512px
   dead space each side)**, and its own *empty* state is unconstrained, so the page
   physically changes width the moment the first task exists.

2. **Two visual generations coexist.** `index.css` predates the token system (220 hardcoded
   font sizes vs 3 token uses) while `pivo-design.css` is tokenized. The result is
   **4 modal systems, 2 drawers, ~35 badge/chip classes, 4 empty-state implementations,
   5 card implementations, 14 distinct modal widths, 10 breakpoints** — the "one product
   language" goal is structurally impossible until this collapses.

3. **Prototype transcription without shell adaptation.** The approved references are
   standalone HTML pages; their *viewport-relative* choices (880px centered body, mobile
   reorder arrows under 700px) were transcribed as *absolute* rules. Hence the Tasks
   small-canvas bug, and hence **76 mobile-only ▲▼ reorder buttons rendering on desktop**
   rows at 1920px.

4. **Accumulation surfaces were never pruned.** The active-client תהליך tab now stacks:
   lifecycle stepper + echoed office task ("באיחור 110 ימים") + payments alert + sent-emails
   log + pinned note — five concept areas, four of which duplicate other tabs. The case
   header stacks identity row + tags + representation badge + open-task counter. Each
   milestone added a block; nothing removed one.

5. **Status language is saturated.** 24 of 38 visible tasks carry the identical red
   "באיחור" pill; every sample client row says "לקוח פעיל · עודכן היום". When everything
   shouts, nothing is read — the opposite of "I immediately understand what needs my
   attention."

None of these require re-deciding the product. They require one convergence run with a
shared layout/primitive layer first, then per-surface pruning against the references.

---

## 2. Full surface inventory

### Global navigation (journeyUi ON — the shipping default)
- Header: logo → tasks · **לקוחות** (`#/clients`, PersonDirectory) · **משימות** (`#/tasks`,
  TasksWorkspace, badge = open ball-me/stuck) · avatar menu → המשרד (`#/firm`), ידע מס
  (`#/reference`), dark-mode, logout. Mobile bottom nav mirrors the two tabs.

### Office surfaces
| Surface | Route | Component |
|---|---|---|
| Tasks workspace | `#/tasks` (alias `#/desk`) | `TasksWorkspace.tsx` |
| Person directory | `#/clients`, quick view `#/clients/p/{id}` | `PersonDirectory.tsx` + `ui/Sheet` + `PersonQuickView` |
| Client case | `#/client/{id}[/{tab}]` | `ClientWorkspace.tsx` |
| — תהליך | tab `journey` | `JourneyTab.tsx` → `OnboardingTab` (embedded) |
| — תיק מס | tab `taxfile` | `TaxFileTab.tsx` (+ dossier sub-screen `ClientDossierTab`) |
| — מסמכים | tab `docs` | `DocumentsWorkspace.tsx` |
| — הסכם ותשלומים | tab `pay` | `AgreementPaymentsTab.tsx` |
| — פעילות | tab `log` | `ActivityTab.tsx` + `SentEmailViewer` |
| Institution focus (takeover) | in-tab state | `InstitutionAlignment.tsx` (`.ial-focus`, 760px) |
| Annual report (1301) | `#/annual/{id}/{year}` | `features/annualReport/*` (8 modes) |
| Quotations pipeline | `#/quotations` (no nav tab; entered from lead rows) | `QuotationsPipeline.tsx` |
| Quotation builder | `#/quotation/{id}` | `QuotationBuilder.tsx` (4 preview tabs, device toggle) |
| Representation review | `#/request/{id}` | `RepresentationRequestReview.tsx` (+ SigningRoom, PoaProduceEditor) |
| Firm console | `#/firm` | `FirmProfileConsole.tsx` (11 sections) |
| Tax knowledge | `#/reference` | `features/taxCenter/TaxCenter.tsx` (8 tools) |

Key dialogs: TaskForm, NewPersonDialog, RepresentationOnboardingDialog, AddRequestDialog,
JourneyTemplatesDialog, ClientPagePreviewDialog, SendPortalDialog, PublishCasePrompt,
EmailPreviewDialog (all mail), SendIntakeModal, ReleaseLetterDialog, AddChargeDialog,
ConfirmDialog, ClientDeleteDialog, InlineComposer (inline).

### Public surfaces (query-param routes, evaluated pre-auth in this order)
`?onboard=` (client, rep data fill) · `?sign=` (client/spouse, signing room) · `?intake=`
(client, tax-status questionnaire) · `?portal=` (client, **the** landing page) · `?quote=`
(lead/client, quotation) · `?release=` (**previous accountant**, letter + sign + material
uploads) · `?apply=` (lead, minimal application).

### Legacy / dead / URL-only
- Flag-gated legacy (off by default): `ClientList` + `ClientsOnboardingSection` (personDirectory=false);
  `ClientCockpitTab`, `TasksActivityTab`, old 5-tab set, 3-tab header (journeyUi=false).
- **Dead code:** `TaskBoard.tsx`, `TaskCard.tsx`, `OnboardingWaitingSection.tsx` (only imported
  by dead TaskBoard), `features/annualReport/TaxSnapshot.tsx`. No `MyDesk.tsx`/`TasksPage.tsx` exist.
- URL-only, no UI entry: `#/request-new`, `#/calculator/{id}`, `#/documents/{id}`.
- 14 dev-only `?test-*` routes (DEV-guarded).

**Same-mental-model check:** onboarding requests / document requests / custom requests /
tax-status update / prev-accountant collection / institution alignment all flow through one
`onboarding_steps` system and one portal builder — the unified model is real in the data
layer and in the office Process view. The remaining "separate products" feeling is visual
(public shell fragmentation, §8) and the active-client Process tab (§6), not architectural.

---

## 3. Desktop findings (measured at 1440×900 and 1920×1000)

1. **Shell:** `.app > .main` = 1280px card on grey canvas (pivo-design.css:36,57). A dead
   competing rule `.main{max-width:1300px}` (index.css:349) never wins. Below 1100px the
   constraint releases.
2. **Tasks:** `.tw-wrap{max-width:880px}` (pivo-design.css:2489) — single unopposed rule, no
   media query, transcribed from the prototype's standalone page. @1920: 880px content,
   512/528px empty flanks *inside* an already-centered card → reads as broken, not calm.
   The zero-tasks state omits `tw-wrap` → full 1280px. Same screen, two widths.
3. **Per-workspace divergence:** PersonDirectory 1040px · Institution focus 760px ·
   ClientWorkspace/Documents/Quotations unbounded (1236px content) · annualReport screens
   700–1320px inline (11 values; 1300/1320 exceed the shell and silently clip).
4. **Desktop shows mobile controls:** 76 ▲▼ reorder buttons (19×15px) on Tasks rows at
   desktop widths, alongside the drag grip — double affordance + noise. Prototype shows
   arrows only ≤700px.
5. **Density:** production task row = 81px (14px font) vs reference ≈61px (12.5–13.5px);
   38 tasks = ~3,080px of scroll. Client directory row = 72px.
6. **Case header (active client):** name + ת.ז. + phone + city + primary CTA + ⋯ + badge +
   3 hashtags + "6 משימות פתוחות ←". Reference: name + badge + **one** meta line.
7. Missing from Tasks vs reference: client filter and label filter controls (search exists;
   an external client-filter chip appears only when arriving from a client card).

## 4. Mobile findings (390×844; portal + office process also at 375×812 with real data)

1. **No horizontal overflow anywhere measured** (tasks, directory, case tabs, office process,
   portal). RTL held throughout.
2. **Tap targets:** case tabs 44px high ✓; FAB ✓; bottom nav 65px ✓; **reorder arrows
   19×15px ✗** (the only reorder affordance on touch, since drag is desktop-only).
3. **Case header cost:** content starts at y≈286px — a third of the viewport consumed before
   the first piece of case content. Header condensation needed (reference keeps crumb+h1+meta
   ≈120px).
4. Tasks one-handed: row open ✓, complete via drawer ✓, reorder ✗ (tiny arrows), no
   due-grouping → long scroll to find "today".
5. Portal (real data, 375px): single column, action cards with one button each, no overflow,
   understandable without zoom ✓.
6. Not verified on device-width: Documents dense state, annualReport screens, firm console
   (code-inventoried only).

## 5. Lifecycle findings (scenarios A–M)

| # | Scenario | State | Verdict |
|---|---|---|---|
| A | New lead | Directory row + quick view + continuation dialog | Sound; lead rows show identity facts, not next action (§13 note) |
| B | Onboarding client (רותי, real data) | Office process: stage groups, one-open accordion, correct ownership line ("ממתין לרו״ח קודם" after this week's fix), IAL one card 2/3 | **Matches reference** ✓ |
| C | Existing office client (real data) | Calm: request empty-state + "הקמת תיק במערכת · התחל יישור קו" | **Matches reference** ✓ |
| D | Active client after onboarding | תהליך tab = junk drawer (stepper + task echo + payments + emails + note) | **Worst single-surface deviation** (§6) |
| E | Active + document request | Office group row 2/3 + portal card "להעלות 3 מסמכים · 2 מתוך 3 התקבלו" | ✓ verified both sides |
| F | Tax Status Update | Portal "עדכון סטטוס מיסויי" ✓; Tax File "עדכן סטטוס מיסויי" ✓; office Process still labels the same object "שאלון פתיחת תיק" (`STEP_TYPE_LABELS`, types/onboarding.ts:76) | Naming drift — same object, three surfaces, two names |
| G | Waiting on prev accountant | One office group, ball + primary status agree, portal shows nothing ✓ (13 security assertions green) | ✓ (release page itself code-inventoried, not live-walked) |
| H | IAL incomplete | One group "רשויות · 2 מתוך 3" with 3 compact boxes | ✓ |
| I | Overdue/upcoming payment | Journey tab shows "3 חובות קרובים" while Pay tab shows "אין תשלומים עתידיים" (same client; partly a dev-fixture artifact, but the *duplication of home* is structural) | Decide one home (§11, Q-C3) |
| J | Many documents | Not observable (0 docs in fixtures; no dense real set touched) | **Gap — verify in next run** |
| K | Many tasks (38) | Overdue wall: 24 identical "באיחור" pills, flat list | Scanning fails at 40; will fail worse at 100 (§8) |
| L | Sparse client | Tax File sentence + intentional authority empty-state ✓; Documents empty state is controls-dominant with filter-worded message ✗; Pay = three stacked "אין…" cards ✗ | Mixed |
| M | Long history | Activity day-groups + filters ✓; events with empty note text render as blank rows | Minor |

## 6. Process / Requests — core model findings

**What's right (verified, real data):** group = primary unit; one-open accordion; collapsed
summary line "title · status(owner-consistent) · progress · הכדור · age/due"; IAL one group;
prev-accountant one group owned externally; drafts/publish bar; requests empty state.

**What's wrong:**
1. **Active-client תהליך** must converge to the reference shape: hero ("לקוח פעיל") +
   collapsed completed-onboarding history + "יישור קו מחדש" + open requests. Remove: the
   4-station lifecycle stepper (the header badge already carries the stage), the echoed
   office task block (Tasks owns it), the sent-emails section (Activity owns it), the
   payments alert section (Pay owns it — keep at most a link chip).
2. **Row control noise:** every open request row shows סמן כרשות · ⋯ · ↑ · ↓ permanently;
   the reference reveals row actions on hover/expand. Move secondary actions into the row's
   expanded body or ⋯ menu.
3. **Naming:** apply the approved glossary — the intake object is "עדכון סטטוס מיסויי"
   everywhere (office step label, email dialog heading "מייל שאלון פתיחת תיק", template
   names), and standardize רו״ח קודם phrasing.

## 7. Client Landing (portal) — verified with real data, desktop + 375px

Compliant with the intended model: greeting → "מה צריך ממך" → 3 action group-cards with
progress + one button each → quiet "✓ 4 דברים שכבר הושלמו" → reply-to-email footer. No
office / prev-accountant / future items. Quotation-signature action verified via security
suite (8a/8b) though not currently present on the sandbox client's page.

Remaining work: **PublicPortalPage is the visual-system's worst outlier** — 57 inline style
objects, 28 hardcoded font sizes, zero tokens, fixed 560px card. The client experience of
"one relationship page" is also weakened by the public shell fragmentation: portal 560px ·
apply 440px · onboard 460px · release 640px cards, each hand-built. One shared public shell
(brand header, card, typography) with per-route content keeps the technical token routes
while making them *feel* like one place.

## 8. Tasks — findings + IA re-evaluation

**Findings vs reference:** 3 buckets ✓ with counts ✓; derived waiting (requests,
questionnaires, sent quotations, journey summaries) ✓ implemented in code; search ✓;
manual order + due-jump ✓; drawer ✓; create-choice (משימה / בקשת מסמכים) ✓. Deviations:
880px cap; 81px rows; movers on desktop; missing client/label filter controls; no
due-grouping so overdue saturates; "ממתין לאחרים 0" renders as an empty peer tab.

**Three-bucket re-evaluation (requested):** the accountant's opening question is "מה אני
צריך לעשות עכשיו?". A generic לביצוע/בתהליך/בוצע model answers it *worse*: accountant tasks
rarely have a meaningful self-"in progress" state, and folding "waiting on others" into
"בתהליך" destroys the one distinction that matters (can I act now?). **Recommendation: keep
the ownership semantics, change the presentation** —

- **Primary screen = לטיפולי**, due-grouped (באיחור (collapsed beyond ~5) → היום → השבוע →
  בהמשך → ללא תאריך), manual order within groups.
- **"ממתין לאחרים" demoted from peer tab to a collapsed calm section** at the bottom of the
  same screen ("N דברים ממתינים לאחרים ▸" — one line each when opened, ownership label per
  item: ממתין ללקוח / לרו״ח קודם / לרשות). It stays derived, unordered, non-competing.
- **הושלמו** stays a secondary view (tab or toggle).

This removes navigation (one screen answers everything), scales to 100+ (waiting items and
old overdue stop occupying prime space), and preserves every data rule (derived vs
persisted, due-priority, manual order, doc links, client association). Tradeoff: the
waiting count is less prominent — mitigated by the section header count. This is
**product decision C1** (§23) since it modifies the approved tasks reference.

## 9. Documents

Product semantics all present and correct (label required, לבדיקה fallback, year+label,
inheritance, multi-client links, task links, request-document shortcut, "internal to office"
footer). Presentation issues: (1) empty state = full toolbar + 6 year chips + נהל תוויות +
הוסף menu above "אין פריטים שמתאימים לסינון" — a filter message when nothing was filtered;
replace with an intentional first-run state (one sentence + העלה קובץ / בקש מסמך מהלקוח).
(2) נהל תוויות is a rare admin action sitting at top level. (3) Search placeholder dropped
the reference's cross-entity scope (לקוח, משימה) — confirm global search intent. (4) Dense
state (500 docs) unverified — must be exercised next run.

## 10. Tax File / 1301 / Tax Status

The strongest tab: sentence-first ✓, three reference sections ✓, collapsed rows with
summaries ✓, provenance lines ✓, pending-proposal cards ✓, "עדכן סטטוס מיסויי" entry ✓,
empty authorities state intentional ✓. Minor: sparse row summaries degrade to name-echo
("שכיר — שכיר", "נכסים והשקעות — נכסים") — fall back to a real hint or hide the summary;
dossier ("התיק") is fine as detail-on-demand but shares the header-noise problem. The
annualReport screens work but live in their own visual world (11 inline widths) — adopt the
shell, do not redesign the engine. No professional fact found hidden by presentation gates.

## 11. Agreement & Payments

Structure matches the reference (agreement lines, annual-report pricing with breakdown,
future, history). Issues: sparse state = three stacked "אין…" cards (make one calm line +
"+ הצעת מחיר"); the upcoming-charges alert currently also renders inside תהליך — payments
information should have **one** home (Q-C3).

## 12. Activity

Reference-shaped ✓ (chips, day groups, email viewer). Fix: skip events with empty bodies;
ensure it owns communications exclusively (Process drops its emails section, §6).

## 13. Quick View

Right scope, right role (orientation + contextual actions + פתח תיק מלא) — keep it. Two
adjustments: lead with "מה קורה עכשיו" instead of re-listing the identity facts the row just
showed; and the *row itself* should prefer next-action/work-state over ת.ז.+phone+email
(the directory currently prints 3 PII facts per row — data-model exposure; the
customers-v3 reference leads with name · case-type · next action).

## 14. Previous accountant / external party

Office side verified: one group, correct external ownership language, real-time shared
`onboarding_steps` row, no duplicated state found. Release page (`?release=`, 640px card:
letter + signature + per-item uploads over time) matches the "only what they need" rule by
construction — not live-walked this run; carry into next run's QA matrix. Unify the
רו״ח קודם / רואה החשבון הקודם phrasing.

## 15. Visual-system inconsistencies (fix centrally, not per screen)

From the dedicated CSS audit (full details in the audit transcript):
- **Widths:** no token; 5 CSS page widths + 11 inline (annualReport) + 5 public card widths.
- **Breakpoints:** 10 literal values (760 *and* 768; 1000/1024/1080/1100 all fire between
  1000–1100px); JS `MOBILE_BREAKPOINT` unsynced.
- **Tokens:** `--fs-11` referenced ~10× but never defined, with 3 different fallbacks in one
  block (tw-pill 10px / tw-vcount 10.5px / tw-meta 11px — meant to be one size); two radius
  scales (`--radius/--radius-lg` vs `--r-*`); `--sp-*` has **zero** TSX adoption;
  `index.css` has 220 hardcoded font sizes.
- **Primitives:** 4 modal systems (119 uses of `.modal` render with a scrim opacity
  authored for a *different* system — `.modal-backdrop` defined twice, .55 vs .28);
  2 drawers (different edge, width, z-index 61 vs 900 vs 1000); ~35 chip/badge classes
  (`.date-chip` and `.date-pill` are the same element twice); 4 empty-state families
  (`.cw-empty` defined twice); 5 card families; 14 modal widths.
- Canonical direction: `ui.css` primitives (`ui-modal`, `EmptyState`, `Sheet`) are the only
  fully tokenized family — standardize on them.

## 16. Accessibility / practical usability

- Tap targets: reorder arrows 19×15px (fix to ≥44px); case tabs/FAB/bottom nav pass.
- Hover-revealed actions: fine on desktop, ensure expanded-row alternatives on touch.
- Focus/scroll-lock: only the `ui-modal` family has a coherent scrim/z-order story; the
  other three modal systems differ — consolidation (§15) is also the a11y fix.
- Contrast: `--faint` (#9aa2b1-class) meta text on white is borderline (~2.8:1) at 10–11px —
  re-check after typography consolidation.
- Keyboard: arrows exist as drag alternative ✓; verify modal focus-trap once consolidated.
- RTL: no breaks observed in any walked surface, including 375px.

## 17. Top root causes (ranked by leverage)

| # | Root cause | Affected | Type | Risk to fix |
|---|---|---|---|---|
| 1 | No shared width/layout system (incl. `.tw-wrap:880` bug, empty-vs-filled width flip, annualReport inline widths, public card fragmentation) | Every screen | Implementation | Low–medium (visual regression sweep needed) |
| 2 | Two design generations → quadruplicated primitives (modals/chips/empty/cards/drawers), token gaps (`--fs-11`, radius, `--sp`) | Every screen | Implementation | Medium (119 modal call sites) |
| 3 | Prototype-transcription artifacts (mobile movers on desktop, per-screen breakpoints, densities 61→81px) | Tasks, directory, process rows | Implementation | Low |
| 4 | Accumulation surfaces never pruned (active-client תהליך, case header, quick-view identity block, Pay alert duplication) | Client case | Product-approved pruning + implementation | Low once decided |
| 5 | Urgency/status saturation (no due-grouping, identical pills, repeated stage badges) | Tasks, directory | Implementation (+C1) | Low |
| 6 | Empty states filter-worded / controls-dominant | Documents, Pay, Tasks-waiting | Implementation | Low |
| 7 | Same-object naming drift (שאלון פתיחת תיק ↔ עדכון סטטוס מיסויי; רו״ח קודם variants) | Process, emails, templates | Implementation (glossary approved) | Low |
| 8 | Public shell fragmentation (5 hand-built card pages, PublicPortalPage untokenized) | All client-facing pages | Implementation | Low–medium (brand rendering QA) |

## 18. Duplication / redundancy map

- Office task → echoed in active-client תהליך (drop; Tasks owns).
- Payments alert → תהליך + הסכם ותשלומים (pick Pay; Q-C3).
- Sent emails → תהליך section + פעילות timeline (pick Activity).
- Client identity → directory row + quick-view facts + case header (each surface should add,
  not repeat: row=who+what-next, quick view=what-now+actions, header=identity once).
- Lifecycle → header badge + 4-station stepper in תהליך (badge wins).
- Ownership → primary status + הכדור line now consistent (fixed this week); keep single source
  `stepStatusLabel`.
- Task counts → header nav badge + case-header "N משימות פתוחות" + תהליך echo (nav badge +
  case link are enough).

## 19. Approved-reference deviations found

| Reference | Production deviation | Disposition |
|---|---|---|
| tasks-v3: filters row (client+label) | Missing | Restore |
| tasks-v3: movers mobile-only | Rendered on desktop | Fix |
| tasks-v3: ~61px rows, 13.5px base | 81px, 14px | Converge |
| client-case v3-final2: one meta line under name | Identity row + hashtags + counters | Converge (prune) |
| v3-final2 active-client תהליך: hero + history + realign | Stepper + 4 extra sections | Converge (Q-C2 confirms) |
| v3-final2 client view: aggregate "בטיפול שלנו" line | Portal shows client-actions only | **Keep production** — superseded by the approved unified-landing decision (Phase 5) |
| docs search scope incl. לקוח/משימה | Placeholder scoped to file/folder/label/year | Confirm intent, likely restore |
| Intake naming | Office still "שאלון פתיחת תיק" | Apply approved term |

## 20. What should NOT be changed

Two-tab global nav + five-tab case IA · portal bucket filtering & token security model
(mig. 97/98, 13-assertion suite) · derived-not-persisted waiting semantics · journey
stage/group/accordion structure of the office Process (onboarding + existing verified
correct) · institution-alignment capability model incl. focus takeover · tax-fact
governance & provenance (M1/M2) · documents label/year/inheritance semantics · draft/publish
model and "publish ≠ email" (D4) · email preview-before-send policy · quick-view role ·
Hebrew copy voice · existing Hebrew texts except the named glossary items.

## 21. Convergence implementation plan (one milestone, ordered by leverage)

**Phase 0 — Layout system (unblocks everything):**
tokens `--page-max` (=1280) / `--content-max` variants; delete `.tw-wrap` 880 cap (keep an
optional reading-measure on the *list column* only if wanted); align PersonDirectory /
ial-focus wrappers to system; wrap annualReport screens in the shell container (kill 11
inline widths); consolidate breakpoints to 2 (≈720 mobile / 1100 shell-release) + sync
`useMediaQuery`; one shared public-page shell used by portal/apply/onboard/release/quote/
intake/sign.

**Phase 1 — Primitive consolidation:**
standardize on `ui.css` family: one modal (migrate `.modal`/`.modal-box`/`.doc-modal` call
sites), one drawer, one chip/badge API, one EmptyState, one card; define `--fs-11`; kill the
legacy radius pair; fix the double `.modal-backdrop`/`.cw-empty`; tokenize
PublicPortalPage; delete dead files (TaskBoard, TaskCard, OnboardingWaitingSection,
TaxSnapshot) and decide the three URL-only routes.

**Phase 2 — Tasks workspace:**
reference density (≤64px rows); due-groups with collapsed old-overdue; grip desktop /
≥44px arrows mobile only; client + label filters; apply C1 decision (waiting as collapsed
section); verify at 10/50/100 tasks; empty states per bucket.

**Phase 3 — Process pruning (client case):**
active-client view → hero + collapsed onboarding history + realign + open requests; remove
stepper/task-echo/emails/payments sections (link chips where useful); row secondary actions
into expanded body/⋯; glossary rename (עדכון סטטוס מיסויי office-side, רו״ח קודם unification).

**Phase 4 — Documents presentation:**
first-run empty state with CTAs; toolbar hierarchy (labels admin behind menu); dense-state
QA with a real 100+ doc fixture; search scope decision.

**Phase 5 — Case header + secondary tabs:**
header to identity + badge + one meta line + one primary action (+ ⋯); quick-view leads with
"מה קורה עכשיו"; directory row → name · type · next-action (PII out of the row); Pay sparse
state to one line; Activity skips empty events.

**Phase 6 — Mobile & QA sweep:**
case-header condensation (~180px), tap-target pass, keyboard/focus pass on the consolidated
modal, full QA matrix: 3 lifecycles × 5 tabs × {1280,1440,1920,390,375} + portal + release,
with real-data states incl. dense docs/tasks and long names.

## 22. Acceptance criteria for the next run

1. Every workspace's content column ≥ 96% of the shell width at 1440 & 1920 (except
   deliberate reading-measure surfaces, each annotated in code) — and identical width in
   empty vs filled states.
2. `grep` finds one modal, one drawer, one empty-state, one chip implementation in use;
   zero references to undefined tokens; zero duplicate class definitions across CSS files.
3. Tasks: rows ≤64px; zero ▲▼ on desktop; all touch targets ≥44px; due-groups render at
   10/50/100 fixtures; client+label filters work.
4. Active-client תהליך contains only: hero/history/realign/requests (+link chips); no list
   from another tab renders inside it.
5. All public pages render through the shared shell; PublicPortalPage has zero hardcoded
   font sizes.
6. Glossary: "שאלון פתיחת תיק" appears nowhere user-facing.
7. Portal security suite (13) + institution suite (32) + typecheck + build green; real-data
   browser walk of both lifecycles at desktop+375 documented in the final report.
8. No horizontal overflow at 375/390/430 on any walked surface.

## 23. True Product unknowns (only these need answers)

**C1 — Tasks IA:** keep "ממתין לאחרים" as a peer tab (approved reference), or demote to a
collapsed section under לטיפולי (my recommendation, §8)? Options: (a) keep 3 tabs,
(b) 2 tabs (לטיפולי+הושלמו) with waiting as collapsed section — **recommended**, (c) generic
לביצוע/בתהליך/בוצע — recommend against (loses the actionable/waiting distinction).

**C2 — Lifecycle stepper on active clients:** the ליד→הצעה→קליטה→פעיל stepper came from the
journey-center plan; the frozen reference's active view has none (header badge + "צפה
בקליטה" history instead). Confirm removal for active clients (recommended); keep it only
during pre-active stages, or drop entirely?

**C3 — Payments attention home:** upcoming/overdue charges surface today in both תהליך and
הסכם ותשלומים. Recommended: a small chip on the case header (or Pay tab badge) linking to
Pay; תהליך stops rendering a payments section. Alternative: keep in תהליך only during
onboarding (retainer setup) and Pay afterwards.

## 24. Recommended model for the implementation run

Sonnet (this class) for the full milestone — the work is high-volume, mechanically
specified, and gated by measurable acceptance criteria; this audit removes the discovery
burden. Sequence phases 0–1 first and checkpoint-commit before touching screens; run the
browser QA gate per phase, not once at the end. Escalate to Opus/Fable only if C1–C3
answers reopen design questions beyond §21's specs.

## 25. Evidence & measurements (method + coverage)

- Live app measurements this session: Tasks @1440/@1920 (880px cap, 81px rows, 76 desktop
  arrows 19×15px, 24/38 overdue pills, waiting=0 tab), directory @1920 (1040px, 72px rows,
  PII rows), case tabs walk (active client: junk-drawer Process, Pay/Activity/Docs states),
  mobile 390 (no overflow; header→286px; tab heights 44px), portal + office process with
  **real production data** at desktop+375 (verified this week incl. ownership-copy fix and
  "עדכון סטטוס מיסויי" label).
- Code-layer audits: full route/surface inventory; full CSS width/breakpoint/token/primitive
  audit with file:line references (see §15).
- **Not observed live:** pixel rendering (screenshot tool broken — stated above), release
  page, quotation/sign/intake/onboard public pages, annualReport screens, firm console, tax
  center, dense documents, 100+ real tasks. These are inventory-informed only and are
  explicitly in the Phase 6 QA matrix.
