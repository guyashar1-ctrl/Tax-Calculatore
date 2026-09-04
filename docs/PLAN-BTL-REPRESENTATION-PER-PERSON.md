# BTL representation per person — investigation and implementation-ready recommendation

> Written 3.9.2026 against HEAD `b496240` (master, 1 commit ahead of `origin/master`, unpushed).
> Investigation only: no code, no migration, no commit. Companion of
> `docs/PLAN-BTL-PER-PERSON.md` (the approved two-person BTL card) and
> `docs/PLAN-PERSON-AND-COUPLE-MODEL.md` (binding ownership model).
>
> Not reopened here: one BTL card, separate person blocks. Not collapsed here: client and spouse
> representation are two values.

---

## A · Current commit / deploy state of the BTL per-person milestone

| Item | State |
|---|---|
| `HEAD` | `b496240` (header connection-controls). `origin/master` is `4c2bc32`; HEAD is 1 ahead, **unpushed**. |
| BTL per-person code | **Uncommitted** in the working tree: `src/components/clientTabs/TaxFileTab.tsx`, `src/utils/authorityRows.ts`, `src/features/taxFile/authorityAutomation.ts`, `src/features/taxFile/editModel.ts`, `src/types/index.ts`, `src/types/taxFacts.ts`, `src/components/clientTabs/__TestTaxFileV6.tsx` (modified); `src/utils/niPersons.ts`, `supabase/154-btl-per-person.sql` (untracked). |
| Its CSS (`.txf-person*`) | Already **committed inside `b496240`** — swept in by that commit's broad `git add` while my edit was on disk. Content intact; attribution is under the header commit. |
| Deployed code (`origin/master` → Vercel) | `git ls-tree origin/master src/utils/niPersons.ts` → nothing; `authorityRows.ts` at origin has no `persons`. **Production UI still shows the pre-154 single-set BTL card.** |
| Production DB | Migration 154 **is applied** (five `spouse_ni_*` columns + `_tax_fact_field_op` branches). Schema is ahead of deployed code; safe because the columns are nullable and the branches are additive — the old UI never reads or writes them. |
| Pending | One clean commit of the nine files above, then push (which also ships `b496240`). Staging DB does not have 154. |

Housekeeping noticed, not touched: `git fetch` reports permission errors deleting stale `.git/worktrees/{shaam-open-income-tax-file,vc,verify,verify2,wt-docs-master}` — leftover worktree metadata, cosmetic.

---

## B · Exact current representation ownership model

BTL representation is recorded in **three places**, with different granularity. None of them is "one global card fact", but only two of the three are per person.

### B1 · `clients.authority_representations.nationalInsurance` — one record per authority, one status

```
{ status: 'none'|'in_process'|'active', targets?: ('client'|'spouse')[], coversSpouse?: boolean /* legacy */ }
```
- `targets` = **for whom** the request was made (`types/index.ts:1300`). Missing ⇒ `['client']`; legacy `coversSpouse:true` ⇒ `['client','spouse']` — both handled only through `targetsOf()` (`utils/repScope.ts`).
- `status` is a **single value for the whole record**, even with two targets. It moves:
  - to `in_process` when the request is opened (`RepresentationOnboardingDialog`, `QuotationRepresentationEditor`, `open_quotation_representation`);
  - to `active` in `App.handleSaveExecution` (`App.tsx:1491`) **only when every requested NI track has `confirmedAt`** — per person aware on the way in, but collapsed to one value on the way out;
  - to `active` wholesale in `App.handleMarkActive` (`App.tsx:1530`) — "authorities approved" for SHAAM sets **every** authority key active, NI included, regardless of NI confirmations.
- Consequence: `status:'active'` with `targets:['client','spouse']` cannot say "client yes, spouse no". This is the ambiguity the product case is about.

### B2 · `representation_requests.execution.nationalInsurance` / `.nationalInsuranceSpouse` — per person, the only real evidence

`NiTracking` (`types/index.ts:1071`): `enteredAt`, `referenceNumber`, `deadline`, `instructionsSentAt`, `instructionsSentWith`, `confirmedAt`. Keyed by `NI_EXEC_KEY[role]`. Written from `RepresentationExecutionCenter` → `NiTrack` per person (4 steps; step 4 "אושר — הייצוג בב״ל פעיל" = `confirmedAt`). `scope` on the request is the historical snapshot of `targets` (141).

One request per client in practice: `clients.representation_request_id` is singular, `handleOpenClientRepresentation` finds the one request, and `handleAttachRepresentation` **overwrites** `authorityRepresentations` and resets `representationStatus` to `pending_fill`.

### B3 · `clients.tax_files[]` where `authority='national_insurance'` — per person, manual registry

`{ owner: 'client'|'spouse'|'joint', fileNumber?, repStatus: 'none'|'pending'|'active' }`. `joint` = the employer/deductions file, not a person. Edited only in `TaxFilesSection` (inside `ClientDossierTab` / legacy `TaxNITab`), created by `autofill_internal_setup` (44) for `owner:'client'` with `repStatus:'pending'`, and by "צור מבנה מומלץ". **Nothing syncs it from B1/B2.** The BTL card (pre-154 `repOf`, and the 154 `niRepresentationOf`) reads it first.

### B4 · Cross-card and "elsewhere"
- `spouse_client_id` + `resolvePersonAuthority(client, spouseClient, 'nationalInsurance')` — "represented via the other card" (`utils/personRepresentation.ts`).
- `spouse_represented_elsewhere` — spouse has a business handled by another accountant (`SpouseToClientDialog`, `SpouseRelationshipCard`, `PersonalContactsTab`). Not consulted by the BTL card today.

### B5 · Production data (read-only, 3.9.2026)
- 13 clients with an NI record: 6 `active` (all `targets` absent ⇒ client only), 7 `in_process` (1 `['client','spouse']`, 1 legacy `coversSpouse`, 5 absent).
- **No request has ever had a spouse NI track** (`execution.nationalInsuranceSpouse` is null everywhere); 4 active requests have `nationalInsurance.confirmedAt`.
- NI `tax_files`: one married client already has `owner:client repStatus:active` + `owner:spouse repStatus:none` — **the exact scenario in this brief already exists in data**, and the uncommitted 154 resolver renders it as "ייצוג פעיל" vs "אין ייצוג".

---

## C · Can client and spouse representation be determined independently today?

**Yes — but only by reading B2 or B3; B1 alone cannot distinguish them.**

| Role | Proves "active" | Proves "pending" | Proves "none" | Legacy fallback |
|---|---|---|---|---|
| client | `tax_files[NI, owner=client].repStatus='active'`; or request `execution.nationalInsurance.confirmedAt`; or B1 `status:'active'` **when `targetsOf` is exactly `['client']`** | `tax_files…repStatus='pending'`; or B1 `in_process` with `targets ∋ client`; or request track with `enteredAt/referenceNumber` and no `confirmedAt` | none of the above, and no cross-card hit | absent `targets` ⇒ `['client']` |
| spouse | `tax_files[NI, owner=spouse].repStatus='active'`; or request `execution.nationalInsuranceSpouse.confirmedAt`; or, if linked, the spouse card's own `owner=client` file / own record | `tax_files…owner=spouse repStatus='pending'`; or B1 `in_process` with `targets ∋ spouse`; or spouse track without `confirmedAt` | none of the above; also when `targetsOf` lacks `spouse` | `coversSpouse:true` ⇒ `['client','spouse']` (via `targetsOf`) |

**Where `coversSpouse` creates ambiguity:** only if read raw. Through `targetsOf` it is exactly `targets:['client','spouse']` and inherits the same limitation: a two-target record with `status:'active'` does not say whether the spouse's track was ever confirmed. In production this is currently moot (the only `coversSpouse` record is `in_process`, and no spouse track exists anywhere), but it becomes real the moment `handleMarkActive` runs on a two-target client.

**Gap in the uncommitted 154 resolver** (`utils/niPersons.ts niRepresentationOf`): for a spouse **without** an NI `tax_files` entry it falls back to the primary record's `status` when `targets ∋ spouse`. After `handleMarkActive` that would show the spouse as "מיוצג" with no per-person evidence. Fix belongs to this milestone (G-2).

**What the tax file cannot see today:** `TaxFileTab` receives `client`, `spouseClient`, `steps` — not the representation request. Per-person `confirmedAt` (B2) is therefore invisible to the card unless App passes it down (G-2).

---

## D · Does a real "request representation" flow exist, and how does it work?

**Yes for opening a first request; no for adding a person to an existing one.**

Entry points that exist (all create a **full** representation request with signers, POA documents, SHAAM entries, NI tracks):
1. `RepresentationOnboardingDialog` — from "+ אדם חדש", lead conversion, and the journey's "התחלת ייצוג" button, which `journeyPresentation.ts:115/253` offers **only when `!client.representationStatus`** (never had any request). NI row has a per-person chooser (`showTargets`, chips; a "גם לבן/בת הזוג" checkbox when the spouse isn't known yet). Default for a married client: `targets:['client','spouse']`.
2. `QuotationRepresentationEditor` → `open_quotation_representation` on quote approval. For a client that **already has** a request it merges **by authority key only** ("הקיים גובר", migration 26): an existing `nationalInsurance` key keeps its `targets`; a spouse target in the new quote is silently dropped.
3. Legacy "+ בקשת ייצוג" (`ClientList`), same dialog.

Execution/tracking that exists: `RepresentationExecutionCenter` → one `NiTrack` per requested person (entered → reference+deadline → instructions sent with the signature email → confirmed). `RepresentationNextStep` and `RepresentationAuthorityData` are already per person. `rep_client_approval` step (131/133) is an accelerator, not the source of truth.

What does **not** exist:
- Any operation "add BTL for the spouse" on a client whose request already exists. `handleAttachRepresentation` would overwrite the whole registry and restart onboarding (`pending_fill`) — destructive for an active client.
- Any request-catalog item for representation (`AddRequestDialog.tsx:32` says so explicitly).
- Any sync from `execution.*.confirmedAt` to `tax_files[].repStatus`.
- Any office-side step for "person still not represented" (the nearest precedent is `sync_representation_upgrade_step`: an auto-opened, auto-closed `onboarding_steps` row of `scope:'person'` derived from a client-level condition).

Paperwork: BTL POA is entered manually on the BTL portal per person (skill `btl-request-representation`), yields a reference number + deadline, and the insured confirms it themselves; no document is generated by PIVO for BTL (2279 is SHAAM-only).

---

## E · Behaviour to implement for "primary active, spouse not"

Per-person states the product must show (existing vs proposed):

| State | Existing system evidence | Copy (existing vocabulary) |
|---|---|---|
| ייצוג פעיל | B3 `active` / B2 `confirmedAt` / B1 single-target `active` | `TAX_FILE_REP_STATUS_LABELS.active` = «ייצוג פעיל» (or `REP_AREA_STATUS_LABELS.active` = «מיוצג») |
| בקשת ייצוג ממתינה | B3 `pending` / B1 `in_process ∋ role` / B2 track without `confirmedAt` | «בתהליך» — with the track's detail when available («ממתין לאישור המבוטח», «אסמכתא 73882698 · עד 12.10») |
| אין ייצוג | no evidence for this role, spouse not a target, no cross-card hit | «אין ייצוג» |
| מיוצג/ת במקום אחר | `resolvePersonAuthority(...).source==='spouse'` (linked card), or `spouseRepresentedElsewhere` | «כבר מיוצג/ת · הושג בקליטה של X» / «מיוצג/ת אצל רו״ח אחר» — existing strings |
| לא ידוע | proposed, minimal: married spouse with no ID and no evidence | «—» (the tax file's normal "no fact" mark), never a made-up "אין" |

The scenario: client block shows «ייצוג פעיל»; spouse block shows «אין ייצוג» **and an actionable affordance in the spouse block**, never a card-level button. The affordance must only do what the product supports today:

- If the client has **no** representation request at all (`!client.representationStatus`) → «בקש ייצוג» opens `RepresentationOnboardingDialog` via the existing `onStartRepresentation` (the same gate `journeyPresentation` uses), pre-seeded so NI targets include the spouse. This is the one honest wiring available now.
- If a request **exists** and its NI `targets ∋ spouse` but the spouse track isn't confirmed → not "בקש", but «המשך במרכז הייצוג →» via `onOpenRepresentation` (existing navigation to the execution center where `NiTrack` for the spouse lives).
- If a request exists and NI `targets ∌ spouse` → **no supported path**. Show «אין ייצוג» and a disabled/explanatory affordance («הוספת בן/בת הזוג לייצוג ב״ל אינה נתמכת עדיין — פתיחה ממרכז הייצוג») rather than a button that would call `handleAttachRepresentation`. This is the genuine gap in §H.

---

## F · Three UX options inside the two-person BTL card

All keep the approved structure (one card, two person blocks, one card-level automation control) and the existing tokens.

### Option 1 — Status in the existing «ייצוג» row + inline action in the same row (recommended)
- Layout: no new element. The «ייצוג» fact row of each person block carries the per-person label; when the state is «אין ייצוג» or «בתהליך», a small link-button sits at the end of the value (`.ui-linkbtn`, same as «פתיחת הכרטיס»): «בקש ייצוג», «המשך במרכז הייצוג →», or an explanatory note.
- Status display: text + existing `tone:'ok'` for active; `warn` tone for «אין ייצוג» only when the other person is active (so a couple where neither is represented stays calm).
- Action placement: inside the person's grid cell — unambiguous by construction.
- Tradeoffs: zero new chrome; the action is small and easy to miss; the row value gets long on narrow widths.
- Mobile: the `.txf-kv` cell wraps naturally; the link drops to its own line inside the cell.

### Option 2 — Person-header status pill + action in the header
- Layout: the sub-header (`.txf-person-head`) gains a status pill after the ID («ייצוג פעיל» / «אין ייצוג») and, when actionable, the link-button at the header's end (where «הנתונים בכרטיס של X» sits for a linked spouse). The «ייצוג» grid row stays as is.
- Tradeoffs: highest visibility — the answer "represented?" is readable before opening the grid; but it duplicates the «ייצוג» row (two places saying the same), and the header already carries name + ID + linked-note; a third element crowds it.
- Mobile: header wraps to two lines; acceptable but denser than Option 1.

### Option 3 — Per-person footer line (like `SrcLine`) carrying status + action
- Layout: below each person's grid, next to «ערוך», a second line «ייצוג בב״ל: אין ייצוג · בקש ייצוג». The «ייצוג» grid row is removed for BTL.
- Tradeoffs: keeps the grid short and groups all person-level actions (edit, request) in one line; but it moves representation out of the fact grid where every other authority shows it, and for a linked spouse (no «ערוך») the footer would exist only for this.
- Mobile: one extra line per person; fine.

**Recommendation: Option 1.** It changes the fewest things, the «ייצוג» row is where the tax file already answers this question for every authority, and the action sitting *inside that person's cell* satisfies "which person does this apply to" without a new pattern. Option 2 is the fallback if Guy finds the inline link too quiet.

---

## G · Implementation-ready plan (Sonnet)

Guard-rails: no new tables; no new request kind; no `handleAttachRepresentation` on an existing client; Hebrew UI only; hooks in `TaxFileTab` before any conditional return; do not touch `b496240`.

**G-0 · Ship the 154 milestone first** — commit the nine files listed in §A as one commit (message in the repo's Hebrew style), push, verify `crm.yasharcpa.co.il` via the API per the deploy memory. Apply `154-btl-per-person.sql` to staging (`evdfxjqrkgugssfrdoxd`) so staging scripts can run.

**G-1 · Data / model — no schema change.** Decision to record in code comments: per-person NI representation is derived from (1) `tax_files[NI, owner]`, (2) the request's NI execution track for that role, (3) `authorityRepresentations.nationalInsurance` targets — in that order. No new field.

**G-2 · Resolver (`src/utils/niPersons.ts`)**
- Extend `NiPerson` with `representation: NiRepresentationLine` computed once in `niPersons()` (drop the separate `niRepresentationOf` call from `authorityRows.ts`).
- Add an optional `niExecution?: { client?: NiTracking; spouse?: NiTracking }` argument (from the linked request's `execution.nationalInsurance` / `nationalInsuranceSpouse`) and a `representationStatus?: RepresentationStatus` argument.
- New order in `niRepresentationOf`: B3 file for that owner → B2 track for that role (`confirmedAt` ⇒ active; `enteredAt|referenceNumber` ⇒ pending with detail) → B1: `in_process ∋ role` ⇒ pending; `active` ⇒ active **only if `targetsOf(...)` is exactly `[role]`**, otherwise pending (a two-target record without per-person evidence is not proof) → cross-card via `resolvePersonAuthority` → `spouseRepresentedElsewhere` ⇒ «מיוצג/ת אצל רו״ח אחר» → «—».
- Add `NiRepresentationLine.kind: 'active'|'pending'|'none'|'elsewhere'|'unknown'` and `detail?: string` (reference number / deadline from the track).
- Add `niRepresentationAction(person, client, ctx): { kind: 'start'|'continue'|'unsupported'|null; label: string; note?: string }` using exactly the gates in §E (`!client.representationStatus` → `start`; request exists and `targets ∋ role` and not confirmed → `continue`; request exists and `targets ∌ role` → `unsupported`).

**G-3 · Plumbing** — `App.tsx` already holds `requests`; pass to `ClientWorkspace` → `TaxFileTab` a minimal `niExecution` (both `NiTracking`s of the request found by `representationRequestId ?? requests.find(r => r.linkedClientId === id)`), plus `onStartRepresentation` and `onOpenRepresentation` (both exist on `ClientWorkspace`; `TaxFileTab` gets them as new optional props). Extend `startRepresentation` to accept an optional seed `{ niTargets: ['client','spouse'] }` so the dialog opens with the spouse pre-selected (`RepresentationOnboardingDialog` state init at line ~138).

**G-4 · `authorityRows.ts`** — the «ייצוג» fact for each BTL person gets `v` from `person.representation.v` (+ `detail` appended with « · »), `tone` `ok` for active, `warn` for `none` only when the other person is `active`; add `niAction?: { kind, label, note }` on the fact (optional field on `AuthorityRowFact`, BTL only).

**G-5 · `TaxFileTab.tsx`** — in the two-person branch, when a fact has `niAction`: render the value, then a `.ui-linkbtn` with the label; `start` → `onStartRepresentation?.(seed)`, `continue` → `onOpenRepresentation?.()`, `unsupported` → render `note` as `txf-note` (no button). Nothing in the single-person branch changes.

**G-6 · Alignment / completeness (`utils/authorityFlags.ts`)** — add one flag, computed from the resolver (not from raw fields):
- Condition: `familyStatus==='married'` AND client person is `active` AND spouse person is `none` AND spouse not `elsewhere` AND `!spouseRepresentedElsewhere`.
- `key: 'niSpouseNotRepresented'`, `severity: 'medium'`, `title: 'בן/בת הזוג אינו/ה מיוצג/ת בביטוח לאומי'`, `why: 'הייצוג בב״ל הוא לכל אדם בנפרד; רק {client.firstName} מיוצג/ת.'`, `actions: ['task']`, `taskTitle: 'ייצוג בביטוח לאומי לבן/בת הזוג'`. No `request` action (there is no client-facing request for this).
- Completion: the flag disappears when the spouse resolves to `active|pending|elsewhere` — no step, no `flagKey` request. Surfaces once, in «דורש טיפול» (the card row already shows the per-person state; the flag is the actionable summary — same pattern as debit-authorization flags).
- Do **not** add an `onboarding_steps` row (the `representation_upgrade` precedent exists, but that would be a new workflow — §H).

**G-7 · Consistency fix (small, in scope)** — `App.handleSaveExecution`: when a person's `confirmedAt` is set, also set `tax_files[NI, owner=role].repStatus='active'` if such a file exists (do not create one). This makes B3 stop drifting from B2 for future confirmations; no backfill.

**G-8 · Tests** — `__TestTaxFileV6.tsx` cases: `couple-rep-split` (client file active, spouse file none — the production case), `couple-rep-pending-spouse` (targets both, `niExecution.spouse` with reference, no confirm), `couple-rep-norequest` (no `representationStatus` → «בקש ייצוג»), `couple-rep-unsupported` (request exists, targets client only), `couple-rep-elsewhere`. Pass `niExecution`/handlers as harness props. Staging script T15: `handleSaveExecution` path is client-side — cover with the harness, not SQL.

**G-9 · Browser QA** — for each case: the spouse block's «ייצוג» value, the affordance text, that clicking «בקש ייצוג» opens the dialog with NI targets `[client,spouse]` pre-selected, that «המשך במרכז הייצוג» lands on the spouse `NiTrack`; «דורש טיפול» shows the flag only in `couple-rep-split`; mobile 375px; unmarried and `single-ni` unchanged; no console errors.

**G-10 · Migration / compatibility** — none needed. Absent `targets` still means client only; `coversSpouse` still maps through `targetsOf`; existing `active` single-target records keep rendering as active.

---

## H · Genuine Product/Data unknowns

1. **Adding the spouse to an existing NI representation.** No supported operation. Options: (a) a new lightweight "add person to authority" path on the existing request (a second `NiTrack`, `targets` update, no restart); (b) treat it as a new request for the spouse's own card (requires promoting the spouse to a client first); (c) leave unsupported and rely on the flag + task. This decides what «בקש ייצוג» does for an already-represented client.
2. **`handleMarkActive` sets NI active for everyone.** Should "authorities approved" (SHAAM) stop touching `nationalInsurance` now that NI is confirmed per person by the insured? Recommendation: yes, but it changes an existing behaviour outside this card.
3. **Backfilling `tax_files[].repStatus` from `execution.confirmedAt`** for the 4 already-confirmed requests — data correction, not a code decision.
4. **`spouseRepresentedElsewhere` and BTL.** Should a spouse flagged "business handled elsewhere" show «מיוצג/ת אצל רו״ח אחר» in the BTL block, or «—»? (Scenario D in the couple model says "not managed unless asked".)
5. **Flag severity/placement.** `medium` in «דורש טיפול» vs an office-side step like `representation_upgrade`. The plan uses the flag; a step would be a new workflow.
