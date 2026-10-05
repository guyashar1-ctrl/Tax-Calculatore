# Follow-up — 6101 spouse filings and release state (review 2)

Continues `CLAUDE-NI-INCOME-REVIEW2-RESULT-2026-10-05.md` in the same worktree; nothing there was reverted. Uncommitted, not deployed, no shared-DB access.

## Reachability of a spouse 6101 (verified from source)
- The only creation path is the RPC `smart_form_start` (206). It returns `subject_not_supported` for any `p_subject_role` other than `'client'` (line 267), and the site always sends `'client'` (`smartForms/api.ts:192`). No later migration redefines it or inserts into `smart_form_filings`.
- `authenticated` has **SELECT only** on `smart_form_filings` (206 lines 112–118); writes go through RPCs. So a spouse filing cannot be created from the product today. `subjectRole: 'client' | 'spouse'` in the types is not reachability.
- Not checked: whether a spouse row exists in production from a manual insert. Read-only check for release: `select count(*) from smart_form_filings where subject_role <> 'client';` (expected 0).

## Focused guard (defense in depth)
- `btl6101/resolve.ts`: `subjectRole === 'spouse'` ⇒ permanent `blocker` `subject_not_supported` («טופס 6101 לבן/בת זוג עדיין לא נתמך…»). Effect through existing gates: «נעל» disabled while blockers exist (`Btl6101Lifecycle.tsx:183`), and `snapshotFor` sends it in `blockers` so the server lock refuses with `has_blockers` (206/209). No lock ⇒ no signing, no submission. Manual entry of every field does not bypass it.
- Test: `btlIncomeEvidence.test.ts` «6101 לבן/בת זוג — טופס מעורב לעולם אינו מוכן» (3 purposes; client filing unaffected). Mutation check: disabling the guard fails it.
- Not visually checked: the workspace needs a real filing, and a spouse filing cannot be created (above).
- Full fix (subject-specific identity, address, occupations, advance) remains its own task; remove the guard only together with it and with a 206 change that allows `'spouse'`.

## Runs after this change
`tsc` clean · unit tests 1047/0.

## Remaining release checks (not yet done)
1. Migration 219 on a real Supabase database (staging or a branch): apply, confirm both new `when` branches exist and keep the body's line endings, then propose → accept → reload for client and spouse, including clearing `niIncomeBasisMonthly` and the empty list. Local PGlite already covered the function in isolation (`docs/NI-INCOME-219-PGLITE-CHECK.mjs`).
2. `fetchSucceededJobsPage` against real PostgREST (`persons:result->persons`, ordering, paging) — never executed on a real database.
3. Worker update on the office PC, then one real BTL read of a client with a declaration and one with an assessment (live portal not inspected so far).
4. Read-only production count of spouse filings (above).
5. Deploy order: DB 219 → site → worker. Phone check on a real device not done (emulation and synthetic events only).

## Mounted-hook regression (review 2, final section) — fixed

- `btlIncomeEvidence.ts`: `newestComplete` (newest **complete** read by read time; partial/failed/missing never supersede) and `retainCompleteReads` (per-subject memory; same object when unchanged). `deriveIncomeReads` takes `retained` and picks the newest complete read per subject across history, memory and the live job — a late history fetch cannot overwrite a newer live read.
- `useBtlIncomeReads`: per-client memory (`{key, reads}`; another client ⇒ empty) merged with the live job **in the same render** (no window between A leaving and being remembered), persisted by an effect. History is refetched when a live job of this client succeeds (backup only).
- Browser, mounted `AuthoritiesPanel` + real hook, one open screen, `?test-btl-sync&case=live-sequence` (buttons switch the live job): valid history ⇒ «הצהרה · יוני 2025»; A complete without declaration ⇒ «טעון אימות … לא נמצאה כתקפה»; then B queued / running / spouse-only / client income failed / partial / truncated / person failed / failed job / no job ⇒ stays «טעון אימות» at every step; C complete valid ⇒ verified, and stays verified when B starts. With `&delay=15000` (history pending): loading shows «בודק…»; A before history ⇒ warn; B queued ⇒ warn; history (valid, older than A) arrives ⇒ still warn; C ⇒ verified.
- Control: with the memory disabled the same open-screen sequence returns «הצהרה · יוני 2025» right after B queued — the reported bug; restored afterwards.
- Unit: 2 new tests replay the hook's per-render transitions (history ready and late); mutation (ignoring memory) fails them. Totals: tsc clean · unit 1049/0 · vite build ok.
- Not exercised in the browser: switching to another client inside the same mounted panel (covered by keying: memory and history state are ignored unless their key matches). 6101 workspace/lifecycle use the same hook; not separately clicked through (a real filing needs the DB).
