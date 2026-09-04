# BTL per person — investigation and implementation spec

> Written 3.9.2026 against HEAD `4c2bc32` (master). Investigation only: no code, no migration,
> no commit. This is the handoff for the next implementation run.
> Companion documents: `docs/PLAN-PERSON-AND-COUPLE-MODEL.md` (binding ownership model),
> `src/features/taxFile/authorityAutomation.ts` (card-level automation contract),
> `docs/PLAN-TAX-FILE-EDIT.md` (edit path).

Repo state at investigation time: working tree has only untracked docs/prototypes and
`tsconfig.tsbuildinfo`; no stash; two detached worktrees (`wt-pdf`, `epic-mcclintock`) that do
not touch the files below. Nothing here was modified.

---

## A · Current model

### A1 · Primary client and spouse — canonical representation

There is **no person entity**. A `Client` row (`public.clients`) is one person = one card. The
spouse exists in three layers on the *primary client's* row, none of them with an id:

| Layer | Where | What it holds | Written by |
|---|---|---|---|
| Flat identity/contact | `src/types/index.ts:491-509` → columns `spouse_name`, `spouse_id_number`, `spouse_working`, `spouse_income` (01-schema), `spouse_first_name`, `spouse_last_name`, `spouse_birth_year` (110), `spouse_email` (113), `spouse_phone` (114) | name, ID, birth year, contact | onboarding form, representation request, manual edit |
| Nested calc object | `Client.spouse: SpouseData \| null` (`types/index.ts:389-440`, column `spouse jsonb`) | full tax-calc profile incl. `idNumber`, `birthDate`, `gender`, `niType` | legacy family-unit calculator; seeded into a new card on promotion |
| Link to a real card | `Client.spouseClientId` (`types/index.ts:541`, column `spouse_client_id`, migration 150) + `spouseRepresentedElsewhere` | address of the spouse's own card when they are a client | `App.tsx:873`, `App.tsx:913` — written on both cards in the same operation |

Marital status: `Client.familyStatus` (`family_status`), plus `marriageYear/divorceYear/widowhoodYear`.
`registeredSpouseVerified` (140) says *whether* the registered-spouse choice was verified; *who* lives
only in `taxFiles[income_tax].owner` (`features/annualReport/profile.ts:87 registeredOwnerOf`).

**The established person vocabulary is a role, not a name or gender:**

- `RepTarget = 'client' | 'spouse'` (`types/index.ts:1261`) — "for whom" in `authorityRepresentations[a].targets`
- `TaxFileOwner = 'client' | 'spouse' | 'joint'` (`types/index.ts:282`) — "on whose name" in `taxFiles[]`
- `RepSignerRole = 'client' | 'spouse'` (`types/index.ts:888`) — signers, and `NI_EXEC_KEY` (`:1112`)
- `ShaamSubmission.key = 'person:client' | 'person:spouse'` (`:1010`) — per-person SHAAM entries
- `EmployerInfo.belongsToSpouse`, `BusinessInfo.belongsToSpouse` — per-item person flag

Resolution of role → person is done by pure helpers, never by string labels:
`clientDisplayName/spouseDisplayName` (`profile.ts:72`), `client.idNumber / client.spouseIdNumber`,
`taxFileOwnerLabel(client, authority, owner)` (`profile.ts:118`, already BTL-aware: `joint` = the
deductions/employer file). Cross-card reads go through `utils/personRepresentation.ts`
(`resolvePersonAuthority`, `resolveIncomeTaxHousehold`, `findSpouseClient`, `seedClientFromEmbeddedSpouse`).

Conclusion: the spouse is **scattered flat fields + a legacy nested object + an optional link**; not a
first-class entity, but the *role key* `'client' | 'spouse'` is a consistent, repo-wide identity that
every person-scoped structure already uses. That is what BTL should bind to.

### A2 · Current BTL data ownership — every field

All BTL facts other than the file number are **client-level singletons** on the primary card:

| Card label | Client key | DB column | Added | Governed key | Read by | Written by |
|---|---|---|---|---|---|---|
| ת.ז. | `idNumber` | `id_number` | 01 | — | `authorityRows.ts` (context only) | identity flows |
| מספר תיק | `taxFiles[].fileNumber` where `authority='national_insurance'` | `tax_files jsonb` | 07 | `taxFiles` (whole array) | `authorityRows.ts numbersOf` (**joins all owners with " · "**), `TaxFilesSection`, `TaxSnapshot` | `TaxFileTab.buildTaxFilesPatch` (owner `client` only), `TaxFilesSection`, `autofill_internal_setup` (44) |
| עיסוקים | `niOccupations: NiOccupation[]` | `ni_occupations jsonb` | 92 | `niOccupations` | `authorityRows`, `AlignmentStatusView`, `TaxFileTab` | `TaxFileTab:482-499`, `InstitutionAlignment.finish:589` |
| בסיס למקדמות | `niIncomeBasisMonthly` | `ni_income_basis_monthly` | 94 | ✓ | same | `editModel authNi`, alignment |
| מקדמה חודשית | `niAdvanceMonthly` | `ni_advance_monthly` | 01 | ✓ | same + `TaxNITab` (legacy) | same + legacy |
| יתרה | `niBalance` | `ni_balance` | 92 | ✓ | same + `authorityFlags` | same |
| הרשאה לחיוב | `niDebitAuthorization` | `ni_debit_authorization` | 92 | ✓ | same + `authorityFlags` | same |
| ייצוג | `taxFiles[national_insurance].repStatus` (card) **and** `authorityRepresentations.nationalInsurance{status,targets}` (person) | `tax_files`, `authority_representations` | 07 / 141 | `taxFiles` | `authorityRows repOf` uses **taxFiles**; `personRepresentation` uses **authorityRepresentations.targets** | rep request flows |
| (legacy) סניף | `niBranchName` | `ni_branch_name` | 01 | not governed | `TaxNITab` only | legacy |
| BTL POA tracking | `execution.nationalInsurance` / `nationalInsuranceSpouse` (`NiTracking`) | `representation_requests.execution` | — | — | `RepresentationExecutionCenter` | same |

Server-side the governed write path is one `case p_key` switch with fixed column names
(`_tax_fact_field_op`, `supabase/91-tax-fact-transactions.sql:23`, extended for NI in 92:381-395 and
94:213). There is no notion of "for whom" — the key *is* the column.

Usage count of the five NI keys (excluding types): `authorityRows.ts` 16, `__TestAlignmentStatus` 10,
`sampleClientWorkspace.ts` 9, `AlignmentStatusView.tsx` 8, `InstitutionAlignment.tsx` 6,
`editModel.ts` 5, `TaxFileTab.tsx` 5, `authorityFlags.ts` 2, `TaxNITab.tsx` 2,
`scripts/staging-test-institution-alignment.mjs` 24.

### A3 · Structured occupations

`NiOccupation` (`types/index.ts:328`) has `id`, `type`, employee/self-employed details, dates — **no
person field**. The whole `niOccupations` array implicitly belongs to the primary client:
`OccupationsEditor` (`InstitutionAlignment.tsx:815`) has no person selector, the alignment step for BTL
(`INSTITUTIONS.btl`, `:116`) is run for the client's ID, and `TaxFileTab` saves the draft to the single
key (`:482-499`). A spouse's occupations cannot be recorded today at all.

### A4 · Current BTL automation contract

`AUTHORITY_AUTOMATION.national_insurance` (`authorityAutomation.ts`) is `available:false`,
`supportedFieldKeys` empty, `capability: BTL_READ_FILE`. The worker has `btl.connect`/`btl.disconnect`
only (`worker/src/dispatcher.mjs`). Production `automation_jobs`: 20 succeeded `shaam.sync_income_tax_file`,
**zero** BTL read jobs ever.

Identity in the contract today = `client_id` on the job (`automation_jobs.client_id`), and the only
input is `{ fileNumber }` (SHAAM 134). `automation_jobs_open_unique` is on `(client_id, action_type)`.
`AuthorityFieldResult.fieldKey` is the client key; proposals are `{ fieldKey, patch: {[fieldKey]: v} }`
(`TaxFileTab.approveAuthorityChanges:540-620`). Nothing in job, result, field result or proposal names a
person — the contract assumes **one authority record per client**.

### A5 · Production data (read-only count, 3.9.2026, no identifiers copied)

| Fact | Count |
|---|---|
| clients / married / `spouse_client_id` set / `spouse_represented_elsewhere` | 22 / 10 / 0 / 0 |
| clients with any of `ni_balance, ni_income_basis_monthly, ni_debit_authorization, ni_occupations≠[]` | 1 (single, full alignment data, field_meta = institution_alignment) |
| clients with `ni_advance_monthly` | 3 (1 real single + 2 `sample-*` fixtures) |
| married clients with any NI fact | 2 — both `sample-*` fixtures; plus 1 real married client with `field_meta.niOccupations=manual` but an **empty** list |
| clients with an NI `taxFiles` entry | 4; owner `spouse` 1; owner `joint` 0; >1 NI file 1 (the same married client: `client` active + `spouse` none, both with numbers) |
| `authorityRepresentations.nationalInsurance` present | 13; `targets ⊇ ['spouse']` 1 (in_process); legacy `coversSpouse=true` 1 (in_process) |
| `tax_fact_changes` on `ni*` keys | 5 accepted, all `institution_alignment`, one client |
| BTL POA obtained for a spouse (`nationalInsuranceSpouse.referenceNumber`) | none seen; migration 150 comment states none |

---

## B · Gap analysis — what prevents person-scoped BTL today

**Data model**
1. Five scalar/list NI facts have exactly one slot per card (`ni_*` columns). No place to store the spouse's
   balance/advance/basis/authorization/occupations unless the spouse has their own card.
2. `NiOccupation` has no person key; the list is one collection.
3. File number *is* already person-scoped (`taxFiles[].owner`), but the card collapses it:
   `numbersOf()` joins every owner's number into one string, and `hasOwnData` treats the spouse's file
   number as "own data".
4. Representation truth is split: `taxFiles[].repStatus` (per file/owner) vs
   `authorityRepresentations.nationalInsurance.targets` (per person). The card reads the first; the
   person resolver reads the second. Not a blocker, but the per-person card must pick one rule.
5. Migration 44 (`autofill_internal_setup`) writes the NI file number **as the ID number** with owner
   `client`, contradicting the standing decision "BTL file number is never derived from the ID". Only
   affects clients autofilled with `nationalInsurance` in their authorities.

**API**
6. `_tax_fact_field_op` maps key → column; there are no spouse NI keys, so `propose/accept/
   record_manual_fact_change` cannot persist spouse values independently. `GOVERNED_FACT_KEYS`,
   `GOVERNED_FIELD_LABELS`, `editModel authNi`, `dbMappers` all need the new keys.
7. `TaxFileTab.buildTaxFilesPatch(authority, number)` updates the `owner='client'` file (or the first
   file) — no owner parameter; the same is true of `currentTaxFile`.

**Automation contract**
8. `buildInput(client)` returns a single input; there is no subject list.
9. `AuthorityFieldResult` has no person attribute; `interpret()` returns per-key results, so two persons
   with the same underlying field would collide unless the key itself is person-specific.
10. `AuthorityCheckResult.runError` is one string — no partial-failure-per-person.
11. Approval de-dupes by `fieldKey` and reads `oldRaw = client[fieldKey]` — works only if the key is
    person-specific.
12. The worker has no BTL read handler and no per-subject verification (the SHAAM handler's
    `verifyFileDetailsFor` is the precedent to copy).

**UI**
13. `authorityRows.ts` BTL block emits one flat fact list; `TaxFileTab` renders one `.txf-kv` grid per
    row; the occupations editor is mounted once per BTL card; the edit draft has one `sectionOccDrafts`.
14. `AlignmentStatusView` and `authorityFlags` read the flat keys without saying whose they are.
15. `InstitutionAlignment.btl` collects for the client only (no spouse step) — out of scope for this
    milestone but must stay consistent (writes go to the client keys, which remains correct).

---

## C · Existing patterns to reuse (do not invent)

| Need | Reuse | Where |
|---|---|---|
| Person identity key | `'client' \| 'spouse'` (`RepTarget` / `TaxFileOwner` / `RepSignerRole`) | `types/index.ts` |
| Person display name / ID | `clientDisplayName`, `spouseDisplayName`, `client.idNumber`, `client.spouseIdNumber` | `features/annualReport/profile.ts` |
| Per-person file number | `taxFiles[].owner` + `taxFileOwnerLabel()` (already BTL-aware, `joint` = employer file) | `profile.ts:118`, `TaxFilesSection.suggestFiles` |
| Per-person representation | `targetsOf(areas,'nationalInsurance')` (with `coversSpouse` fallback), `resolvePersonAuthority(client, spouseClient, 'nationalInsurance')`, `spousePersonAuthorities` | `utils/repScope.ts`, `utils/personRepresentation.ts` |
| Per-person BTL POA tracking | `execution.nationalInsurance` / `nationalInsuranceSpouse` via `NI_EXEC_KEY[role]` | `types/index.ts:1108-1115`, `RepresentationExecutionCenter.tsx:199,327,702` |
| Per-person SHAAM entries | `shaamEntries['person:spouse']` | `types/index.ts:1097` |
| Spouse flat facts with their own governed key | `spouseWorking` (governed), `spouseNoIncomeEligible` (153), `spouseEmail`, `spousePhone` | `taxFacts.ts`, 153 |
| Per-item person flag on lists | `EmployerInfo.belongsToSpouse` / `BusinessInfo.belongsToSpouse` + list editor field | `listModel.ts:100`, `PersonalContactsTab` |
| Linked-card read-through (no copying) | `resolveIncomeTaxHousehold` + "תיק משותף · בכרטיס של X" rows | `authorityRows.ts` income-tax block, `SpouseRelationshipCard` |
| Seeding a promoted spouse card | `seedClientFromEmbeddedSpouse` | `personRepresentation.ts` |
| Card automation plumbing | `AUTHORITY_AUTOMATION` spec, `buildAuthorityCheck`, `AuthorityCheckPanel` components, `useAutomationJob` per authority | `features/taxFile/authorityAutomation.ts`, `clientTabs/AuthorityCheckPanel.tsx` |
| Worker identity guard | `verifyFileDetailsFor` before extracting anything | `worker/src/handlers/shaamSyncIncomeTaxFile.mjs` |
| Person-scoped test fixtures | `__TestSpouseLink.tsx` (YAIR/MICHAL), `__TestTaxFileV6.tsx` (`?test-taxfile&case=…&client=`) | `src/components/…` |

---

## D · Migration / backward-compatibility assessment

**Historical flat `ni_*` values belong to the primary client — by construction, not by assumption.**
Every writer of those keys has always operated on the primary client: the alignment BTL step runs
for the client's file and has no person control; `TaxFileTab` edits are on the client's own card;
legacy `TaxNITab` edits the card; `sampleClientWorkspace` fixtures are per card. Production confirms the
only real NI facts are on a single (unmarried) client. Therefore:

- **Safe to read the flat keys as the `client` person's values** (compatibility read). No data
  migration. No "unassigned" state is needed for scalars — there is no ambiguous historical value.
- **`niOccupations`**: same reasoning; the one married client with `field_meta.niOccupations` has an
  empty list. Treat as the client's list. Do **not** add a person field to `NiOccupation`; the
  spouse gets a separate list under a spouse key (mirrors `nationalInsuranceSpouse`, not
  `belongsToSpouse`, because BTL occupations are read from the person's own BTL account, not from a
  household-wide list).
- **`taxFiles` NI entries are already person-scoped** (owner). One real married client already has
  `client` + `spouse` NI files. The card must stop joining them; nothing to migrate.
- **Not safe to auto-assign:** an NI file number equal to the client's ID written by
  `autofill_internal_setup` (44). It is a *derived* value against the standing rule. Do not "fix" it in
  this milestone; flag it as a product decision (I.3). The card should keep showing what is stored.
- **`coversSpouse` legacy** is already handled by `targetsOf` (→ `['client','spouse']`). Keep.
- **Linked spouse cards (`spouse_client_id`)**: 0 in production. For them the spouse's BTL facts live
  on the spouse's own card (`ni_*` there) and are *read through*, exactly like income tax. The new
  `spouseNi*` keys on the primary card are used only while the spouse is **not** a separate card.
  On promotion (`handleSpousePromotion`), seed the new card's `ni*` from the owner's `spouseNi*`
  together with their `field_meta` (this is the plan's "זריעה", the same as identity fields; it is not
  "moving status"). After seeding, the owner's `spouseNi*` are dormant (read-through wins). Whether to
  null them out is I.4.

Compatibility reads are preferable to migration: no rows change, every existing reader keeps meaning
"the client", and the new keys start empty.

---

## E · Three UX options inside the existing BTL card, and a recommendation

All three keep the `TRow` card, the `.txf-kv` grid, the small status marks, one "אשר N שינויים", the
calm hierarchy, and the single card-level action "בדוק מול ביטוח לאומי". They differ in hierarchy and
interaction.

### Option A — Two person blocks stacked inside one card (recommended)

Layout: the BTL `TRow` keeps its name/summary/action. When open, the body is two blocks in order
primary → spouse, each with a small sub-header line (`.txf-spouse-name` style: name · ת.ז. · one-line
status such as "מיוצג/ת" / "לא מיוצג/ת" / "ייצוג הושג בכרטיס של X"), then that person's own `.txf-kv`
grid: מספר תיק, עיסוקים, בסיס למקדמות, מקדמה חודשית, יתרה, הרשאה לחיוב, ייצוג. Summary line of
the closed card: `יאיר · מקדמה 2,055 ₪ · אין יתרה — מיכל · לא מיוצגת` (each person's summary, joined).
Card exception (⚠) names the person: "אין הרשאה לחיוב · מיכל".

Editing: "ערוך" per block (each block has its own `SrcLine`); the occupations editor mounts inside the
block being edited; drafts are keyed by person. Only the edited person's keys are written.

Automation/status: one click, one job, subjects = every person with a resolvable BTL identity. Results
come back keyed by person; each block gets its own marks and its own per-field authority lines; the
summary strip shows one line per person ("יאיר: 5 נבדקו · 1 שינוי", "מיכל: הקריאה נכשלה — …"). One
approve button approves everything orange in the card; because each proposal's `fieldKey` is
person-specific, the aggregate approval can never write to the wrong person.

Pros: both people visible at once — the question "whose data" is answered by the block header without
interaction; single action honours the card-level contract; per-person edit and marks fall out of
person-specific keys; degrades to today's card for an unmarried client (one block, no sub-header).
Cons: open-card height doubles for couples; the closed summary is longer; needs a small new
sub-header element (reuse `.txf-spouse-name/.txf-spouse-status` tokens).
Mobile/density: `.txf-kv` is `auto-fill minmax(180px)` so each block already reflows to one column;
blocks stack; the person header is the only added row. Acceptable.

### Option B — One authority row per person ("ביטוח לאומי · יאיר", "ביטוח לאומי · מיכל")

Layout: `buildAuthorityRows` emits two `national_insurance` rows for a couple, each a full `TRow` with
its own summary, exception, action button, edit and approve.
Editing: identical to today per row.
Automation: each row would need its own job → either two `action_type`s or a person in the input plus
a change to `automation_jobs_open_unique` (today `(client_id, action_type)`), and `AUTOMATED_AUTHORITIES`
(static hook order) would have to become "authority × person", which is exactly the fixed-length
constraint the screen comments warn about.
Pros: maximal clarity per person; no new inner structure.
Cons: doubles card chrome; two "בדוק" buttons for one authority contradicts "one control per
authority card"; the row list order becomes data-dependent (hook order risk); breaks the
one-job-per-card model; two rows named "ביטוח לאומי" read as duplication in a dense list.
Mobile: two long cards; worst density.

### Option C — One card with a person switcher (segmented control) and one grid

Layout: card body has a two-segment control [יאיר | מיכל] above one `.txf-kv` grid showing the
selected person; the closed summary shows both persons; a small badge on the inactive segment shows its
orange count after a check.
Editing: edits the visible person only.
Automation: one job, results per person; marks shown for the visible person; approve applies to both
(the button says "אשר 3 שינויים · 2 אצל מיכל").
Pros: constant height; smallest diff in `TaxFileTab` rendering.
Cons: the user must remember which tab is active — the question "whose data" is answered only by a
small control, and a changed value on the hidden person is invisible until they switch; approving
changes you cannot currently see violates the "the accountant saw every comparison before clicking"
rule in `approveAuthorityChanges`; adds a new interaction pattern that exists nowhere else in the
tax file.
Mobile: best density, worst legibility of ownership.

**Recommendation: Option A.** It is the only one that keeps both the card-level automation contract
and "always visible whose data", and it composes from existing pieces (person sub-header from the
spouse card tokens, the same grid, the same marks, the same summary component with a per-person line).

---

## F · Recommended target data model (not implemented)

Principle: keep the primary client's five keys as they are (they *are* the `client` person's facts —
compatibility read), add a parallel set for the spouse **as first-class governed keys**, bind
everything to the role key `'client' | 'spouse'`, and derive the person's identity through existing
helpers. No labels like "husband/wife" anywhere; gender is never used.

### F1 · Types (`src/types/index.ts`)

```ts
/** מפתח האדם בכרטיס — אותו אוצר מילים כמו RepTarget / TaxFileOwner. */
export type PersonRole = 'client' | 'spouse';

/** עובדות ב״ל של אדם אחד — צורת קריאה בלבד; האחסון נשאר מפתחות שטוחים. */
export interface NiPersonFacts {
  occupations?: NiOccupation[];
  incomeBasisMonthly?: number;
  advanceMonthly?: number;
  balance?: number;
  debitAuthorization?: boolean;
}

/** הצמדת מפתח אדם → מפתח שטוח על Client. הלקוח = המפתחות הקיימים (תאימות). */
export const NI_FACT_KEYS: Record<PersonRole, Record<keyof NiPersonFacts, keyof Client & string>> = {
  client: { occupations: 'niOccupations', incomeBasisMonthly: 'niIncomeBasisMonthly',
            advanceMonthly: 'niAdvanceMonthly', balance: 'niBalance', debitAuthorization: 'niDebitAuthorization' },
  spouse: { occupations: 'spouseNiOccupations', incomeBasisMonthly: 'spouseNiIncomeBasisMonthly',
            advanceMonthly: 'spouseNiAdvanceMonthly', balance: 'spouseNiBalance', debitAuthorization: 'spouseNiDebitAuthorization' },
};

// On Client (all optional, NULL = unknown, never derived from the client's values):
spouseNiOccupations?: NiOccupation[];
spouseNiIncomeBasisMonthly?: number;
spouseNiAdvanceMonthly?: number;
spouseNiBalance?: number;
spouseNiDebitAuthorization?: boolean;
```

Person identity (derived, not stored):

```ts
export interface NiPerson {
  role: PersonRole;
  name: string;            // clientDisplayName / spouseDisplayName
  idNumber: string;        // client.idNumber / client.spouseIdNumber ('' = missing)
  /** owner-matched taxFiles entry for national_insurance; joint (employer) file is NOT a person */
  file?: TaxFileInfo;
  /** source of truth for this person's facts: this card, or the linked spouse card */
  source: { kind: 'own' } | { kind: 'linked'; client: Client };
  represented: PersonAuthorityState;   // resolvePersonAuthority(...)
}
```

`niPersons(client, spouseClient): NiPerson[]` — `[client]` when not married; `[client, spouse]` when
`familyStatus==='married'` (spouse present even when name/ID are missing, so the gap is visible); for
the `spouse` role, `source` is `linked` when `spouseClientId` resolves, otherwise `own`.

### F2 · Schema (one migration, next number 154)

```sql
alter table public.clients
  add column if not exists spouse_ni_occupations          jsonb,
  add column if not exists spouse_ni_income_basis_monthly numeric,
  add column if not exists spouse_ni_advance_monthly      numeric,
  add column if not exists spouse_ni_balance              numeric,
  add column if not exists spouse_ni_debit_authorization  boolean;
-- + five `when 'spouseNi…' then` branches in _tax_fact_field_op (same shape as 92:381-395),
--   injected with the anchored-text technique used in 146/151, verified both ways.
```

No data migration. `dbMappers` needs nothing (generic camel↔snake).

Rejected alternatives and why:
- One `spouse_ni jsonb` governed as a single key: aggregate approval of three changed fields would
  create three proposals whose `old_value` snapshots the whole object; the second `accept` fails
  `stale_conflict` after the first writes. Per-field keys are what the governed path is built for.
- A `client_persons` table: correct long-term, but every existing person-scoped structure in the repo
  is role-keyed on the card; introducing a second identity now would duplicate `spouseClientId` and
  the plan's "one column, no migration" decision. Out of scope for this milestone.
- `NiOccupation.person`: puts the person inside items of a list that is read from one person's
  account; a spouse list is a separate observation, not a filtered view.

### F3 · Governance surface

- `GOVERNED_FACT_KEYS` += the five `spouseNi*` keys; `GOVERNED_FIELD_LABELS` with person-neutral
  labels ("יתרה בביטוח לאומי · בן/בת הזוג"); at render time the label is prefixed with the actual name.
- `editModel.EDIT_SECTIONS`: add `authNiSpouse` mirroring `authNi` (four scalar fields, `governed:true`).
- `taxFiles`: file number per person via `owner`; `buildTaxFilesPatch(authority, number, owner)`.

---

## G · Recommended automation identity model

Every BTL observation is bound to a person at **four** points, so a wrong-person write is impossible by
construction, not by discipline:

1. **Input (job creation)** — `buildInput(client, spouseClient)` returns
   `{ input: { subjects: [{ role, idNumber, fileNumber?, label }] } }` for every `NiPerson` whose
   `idNumber` is present and whose source is `own`; a `linked` spouse is **not** a subject of this
   card's job (their card runs its own). Missing ID ⇒ that person is excluded and the card shows
   "אין ת.ז. ל-X — לא נבדק/ה" (unsupported, not failed). No subjects ⇒ `blocked`.
   One job per card click; `automation_jobs_open_unique` stays `(client_id, action_type)`.
2. **Worker** — new handler `btl.read_file` iterates subjects; for each: navigate for that ID, then a
   `verifySubjectOnScreen(page, idNumber)` guard modelled on `verifyFileDetailsFor` before reading a
   single value; result is `{ system:'btl', bySubject: { [role]: { idNumber, fields, unavailable,
   error? } } }`. A subject that fails does not fail the job; the job fails only if every subject fails.
   The worker types nothing that is a credential (existing rule).
3. **Interpretation** — `AuthorityFieldResult` gains `person: PersonRole` and `personLabel`.
   `interpret()` emits results with **person-specific `fieldKey`s** (`NI_FACT_KEYS[role][fact]`), so a
   spouse result can only ever carry a `spouseNi*` key. `buildAuthorityCheck` gains `runErrorByPerson`
   and a per-person summary; `runError` stays for job-level failure.
4. **Proposal / approval** — unchanged mechanics: `fieldKey` is already the person; `oldRaw =
   client[fieldKey]` snapshots the right person; `stale_conflict` protects each person independently;
   `runId` gate unchanged. Provenance note: `"ב״ל · <name> (ת.ז. …): <raw>"` so the ledger line names
   the person.

The subject's ID number is the identity carried into the authority; the role is the identity carried
back into the card. Neither is a name.

---

## H · Implementation plan (ordered, for the next run)

Guard-rails for every step: Hebrew UI text only; no new dependencies; no edits to `SPEC.md`; hooks in
`TaxFileTab` stay before any conditional return; do not resurrect per-field ⟳ controls.

**1. Types and governance (no UI yet)**
- `src/types/index.ts`: `PersonRole`, `NiPersonFacts`, `NI_FACT_KEYS`, five `spouseNi*` fields on
  `Client` (doc comments: NULL = unknown; never derived from the client's own values).
- `src/types/taxFacts.ts`: add keys + labels.
- `src/features/taxFile/editModel.ts`: `authNiSpouse` section.
- `supabase/154-btl-per-person.sql`: five columns + five `_tax_fact_field_op` branches (anchored
  injection + bidirectional verification as in 146/151). Apply to **staging first**, then production,
  and record in `supabase/MIGRATIONS.md`. Do not touch 44.

**2. Person resolver**
- `src/utils/niPersons.ts` (new, pure): `niPersons(client, spouseClient)`, `niFactsOf(person, client,
  spouseClient)` (reads own keys or the linked card's `ni*`), `niFileOf(person)` (owner-matched
  `taxFiles` entry; `joint` excluded), `niPersonSummary(person)`. Unit-style checks via a `?test-`
  harness (repo has no vitest).

**3. Rows**
- `src/utils/authorityRows.ts`: BTL block emits `persons: { role, name, idNumber, facts[] }[]` in
  addition to `facts` (keep `facts` = primary person for every other consumer). Stop `numbersOf`
  joining owners for BTL; `hasOwnData`/`present` per person; summary and exception name the person
  when there are two.

**4. TaxFileTab**
- Render person blocks for the BTL row (Option A): sub-header (reuse `.txf-spouse-name/-status`
  tokens; add `.txf-person` in `pivo-design.css`), one grid per person, marks per field.
- Edit: `editingSection` id `auth-national_insurance:<role>`; drafts keyed by role;
  `sectionOccDrafts` per role; save writes only that role's keys; `buildTaxFilesPatch(authority,
  number, owner)`; `startSectionEdit` accepts `owner`.
- Linked spouse: block is read-only with "הנתונים בכרטיס של X → פתיחה" (`onOpenSpouseClient`).
- Missing spouse ID/name: block shows "טרם התקבלו פרטי בן/בת הזוג" and disables its subject.

**5. Automation contract (no live read yet)**
- `authorityAutomation.ts`: `person`/`personLabel` on `AuthorityFieldResult`; `buildInput` signature
  gains `spouseClient`; `runErrorByPerson`; per-person summary in `AuthorityCheckSummary`.
- `AuthorityCheckPanel.tsx`: summary renders one line per person when >1.
- BTL spec stays `available:false` until the handler exists; add `supportedFieldKeys` **only** when a
  screen anchor was observed live (memory: one sample is not evidence).

**6. Worker (separate, gated on an authenticated BTL session)**
- `worker/src/handlers/btlReadFile.mjs` + `dispatcher.mjs` registration; per-subject guard; result
  `bySubject`. Only after anchors are documented from a live session.

**7. Promotion seeding**
- `personRepresentation.seedClientFromEmbeddedSpouse`: seed `ni*` from `spouseNi*` (+ copy their
  `field_meta` entries in the same write path `App.tsx:handleSpousePromotion` uses). Decision I.4
  governs whether the owner's `spouseNi*` are then cleared.

**8. Other readers**
- `AlignmentStatusView.tsx`: label the BTL block with the client's name (it is the client's data).
- `authorityFlags.ts`: extend to `spouseNi*` with the person in the flag title.
- `__TestTaxFileV6.tsx`: cases `couple` (both with facts), `couple-nospouseid`, `couple-linked`,
  `couple-onlyspouse` (spouse has BTL, client none), `divorced`.
- `scripts/staging-test-institution-alignment.mjs`: T13 — `record_manual_fact_change` on
  `spouseNiBalance` writes only that column; T14 — `stale_conflict` on spouse key does not block a
  client key.

**9. Browser QA (mandatory before "done")**
- `preview_start` dev → `?test-taxfile&case=couple`: both blocks visible, names/IDs correct, edit one
  person, save, reload, the other person unchanged; screenshot.
- `?test-taxfile&case=complex` (single): card identical to today (regression).
- `?test-taxfile&client=<sandbox uuid>` on the E2E account: manual edit of `spouseNiBalance` lands in
  the ledger with the person in the label; console has no errors.
- Mobile width (375) via the iframe probe: blocks stack, no horizontal scroll.

**10. Regression risks to check explicitly**
- Hook order in `TaxFileTab` (`AUTOMATED_AUTHORITIES` unchanged).
- Clients with an NI `taxFiles` owner `spouse` but unmarried `familyStatus` (data drift): show the file
  under a spouse block only when married; otherwise surface it as an inconsistency line, never hide it.
- `present` for the BTL row must not flip for existing singles.
- `approveAuthorityChanges` de-dupe by `fieldKey` still correct (keys are unique per person).
- `TaxFilesSection` and `TaxSnapshot` unaffected (they already read `owner`).
- `PersonalContactsTab`/`ClientDossierTab` legacy editors: no change; they never wrote NI keys.

---

## I · Product decisions still genuinely required

1. **BTL for a spouse who is "represented elsewhere"** (`spouseRepresentedElsewhere=true`, not linked):
   show a block at all? Recommendation: show the header with "מיוצג/ת אצל רו״ח אחר", no facts, not a
   subject. Needs Guy's confirmation because the plan's scenario D says "not managed unless asked".
2. **Marital-status change (divorce/widowhood) with stored `spouseNi*`**: keep read-only under a
   "בן/בת זוג לשעבר" header, or hide? Data must not be deleted silently either way. Not decidable from
   the model.
3. **NI file numbers equal to the ID written by `autofill_internal_setup` (44)**: treat as unknown,
   flag, or keep? Existing decision says never derive; the data already exists.
4. **After promoting the spouse to a card**: clear the owner's `spouseNi*` after seeding (one source of
   truth) or leave dormant? Plan H1 recommends "only displayed"; choose explicitly.
5. **Aggregate approval scope with two orange persons**: one button for the whole card (recommended,
   consistent with the contract) vs one per person. Cosmetic but visible.
6. **`joint` NI file (employer/deductions)**: stays outside both person blocks as a third line
   ("עבור תיק הניכויים")? Recommendation yes; confirm.
7. **Representation line source**: `taxFiles[].repStatus` (card, today) vs
   `authorityRepresentations.targets` (person). Recommendation: person block shows the person-level
   value from `resolvePersonAuthority`, with the file's `repStatus` as fallback. Confirm.
