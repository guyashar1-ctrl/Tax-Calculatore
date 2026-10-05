# Result — retain income evidence per subject (review 2)

Worktree: `C:/Users/guyas/pivo-wt/ni-income-basis` (uncommitted, not deployed, no production or shared-DB writes).

## What changed

- **Evidence is resolved per subject across history.** `src/features/nationalInsurance/btlIncomeEvidence.ts`: `collectIncomeEvidence` walks succeeded `btl.sync_file` jobs newest→oldest in pages of 5, until every needed subject (client; spouse when edited on this card or being filed) has a *complete* income read, or the history ends. No recent-job limit. A page error throws (partial history is never read as "no evidence"). Source is the existing `automation_jobs.result` (the same record `btl_portal_facts` is ingested from), so no second model and no migration; projection fetches only `result->persons` (`fetchSucceededJobsPage`, `src/lib/automationJobs.ts`; replaces the single-job `fetchLatestSucceededAutomationJob`).
- **Newest complete read wins; missing never erases.** `latestCompleteIncomeReads` (`niIncome.ts`) skips jobs where the subject is absent, failed, partial (pre-219 single row), or truncated (`candidatesComplete:false`).
- **Loading / error / client switch are explicit.** `NiIncomeRead` gained `{ok:false, unavailable:'loading'|'error'}`; `niIncomeTrust` returns `unverified` (`checking` / `unavailable`) for automation-sourced values in those states. Manual entries stay trusted. `deriveIncomeReads` ignores state keyed to another client/role set and a live job of another client. A completed live job's read for a subject takes precedence immediately.
- **Propagation.** `useBtlIncomeReads(clientId, liveJob, withSpouse)` is a thin wrapper; consumers already read `reads[role]`, so the state flows through the authority card (client + spouse), 6101 workspace, 6101 lifecycle, and the alignment summary (`AlignmentStatusView`, which previously called `niClientIncomeTrust(client)` with no evidence; note: nothing in production currently mounts it — only its test harness).
- **6101 spouse filings.** Spouse filings are reachable (`filing.subjectRole` is `'client'|'spouse'` in `smartForms/api.ts` and the workspace reads it). `resolve6101`/`currentBtlState` take `subjectRole`; "הכנסה לפני" now uses that person's facts (`spouseNi*`) and that person's evidence. A spouse filing never offers the client's income as verified; without spouse facts it stays missing.
- Test seam for the browser harness only: `setIncomeEvidenceFetcherForHarness` (null in production).

## Evidence (what was actually run)

- `npx tsc --noEmit -p .` — clean.
- `node scripts/run-unit-tests.mjs` — 1046 passed, 0 failed (includes 13 new in `btlIncomeEvidence.test.ts`).
- Mutation check: ignoring `subjectRole` in `resolve6101` fails the spouse test (then restored).
- `vite build` — succeeds (output to a temp dir).
- Browser (synthetic data, dev server port 5203, case `?test-btl-sync&case=…`), real hook wiring with injected history:
  - `evidence-contradicted-spouse-only` → «16,500 לחודש · טעון אימות — בקריאה מב"ל ב-01/10/2026 ההצהרה הזו לא נמצאה כתקפה».
  - `evidence-contradicted-failed-income` → same.
  - `evidence-restored` → «הצהרה · יוני 2025» (trusted).
  - `evidence-loading` (fetch never resolves) → «בודק מול הקריאה האחרונה מב"ל…» (no warning tone, not verified).
  - `evidence-error` → «טעון אימות — לא ניתן היה לבדוק מול הקריאה האחרונה מב"ל».
  - Console shows only the pre-existing `ERR_UNSAFE_PORT` network errors of the DB-less harness.

New regression tests cover: complete contradictory client read followed by spouse-only success; contradictory read followed by failed / partial / truncated / person-failed / person-missing jobs; reload of both sequences (fresh derivation gives identical results); later complete valid declaration restores trust, later complete different amount contradicts; 12 irrelevant newer jobs without any cap and history exhaustion; page-error ⇒ error state; delayed fetch (card + 6101 not verified while loading, verified after); manual entry preserved while loading; client switching before the fetch completes and a stale live job from another client; live job precedence; partial approval; spouse 6101.

## Limitations (not proved)

- The React hook wrapper has no automated render test (no DOM test library in the project). Its logic is the tested pure functions; wiring was checked in the browser harness above. Client switching *inside the browser* was not exercised — covered only at the pure-function level.
- Full real database propose → accept → reload (migration 219 + governed columns) is still a separate release check, unchanged by this work. No isolated database was available here.
- `fetchSucceededJobsPage` (PostgREST `result->persons` alias and ordering) ran only against a fake pager; it has never executed against a real database. Verify on staging before release.
- A client with no complete read for a subject triggers a scan of that client's whole succeeded-job history on each mount (stops early otherwise). Acceptable now; a durable per-subject fact would remove it.
- Phone interaction and live BTL navigation: not re-checked.

## Pre-existing adjacent gaps (recorded, not fixed)

- 6101 for a spouse filing still takes occupations, identity, address, advance, etc. from the client's card (`currentBtlState` / `resolve6101`); only the income fields were moved to the subject. This needs its own review.
- `AlignmentStatusView` has no production caller; the card is the live surface.
