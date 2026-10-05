# Release — NI income: declaration vs assessment, basis «?» (219) — 05.10.2026

Authorized by Guy (docs/CLAUDE-NI-INCOME-RELEASE-2026-10-05.md in the main project).

## What is live
| Layer | State | Evidence |
|---|---|---|
| master | `ddea715` (on `bf6c12a`/220; fast-forward) — `0224cda` feature + `ddea715` harness fix | `git push` bf6c12a..ddea715 |
| Production DB | 219 applied 11:18 UTC, ledger `20261005111847` | `_tax_fact_field_op` 94→96 branches, md5 `58fb89477d60cbb65401bf9c4d2bddd4` = staging; `ni_income_list`/`spouse_ni_income_list` jsonb; both in `_governed_client_columns()`; anon/authenticated without EXECUTE; no CR in body |
| Backup before 219 | schema `backup_ni219_20261005` (clients, tax_fact_changes) + `C:/Users/guyas/PIVO/backups/ni219-20261005` (definitions + README) | prod-backup-before-migration.mjs |
| Site | Vercel `dpl_GBoTCw5VAANGjoYMWksCSjKEZuqT` READY, alias crm.yasharcpa.co.il, aliasError null | live bundle `main-DCQGlEzc.js` contains the new strings and the history query; test-screen data absent; «שונה מההצהרה» absent |
| Worker (guy-office-pc) | `C:/Users/guyas/PIVO/worker-production` detached at `ddea715`; restarted via `worker/restart-worker.ps1` with no queued/running jobs; deps unchanged | new instance `ef749131…` heartbeat 11:20:40 UTC and claiming |
| Edge functions | untouched by this release | — |

## Staging validation (this run)
- 219 applied to staging (file CRLF, live body LF — line-ending detection exercised for real) and re-applied: identical md5.
- `scripts/staging-test-219-ni-income.mjs`: 25/25 over real PostgREST as the office user — history query alias/order/paging (5+5+2)/isolation; latest complete client read found beyond page 1; propose → accept → reload for client and spouse; null clearing; empty list; field_meta automation; audit with old value 47,800; `update_client_fields` rejects both new columns; stale_conflict preserved a changed value; other client untouched. Fixtures removed (0 left).
- Browser against staging, real app (`?` not harness): legacy 47,800 «טעון אימות»; spouse verified from real history; «אשר 4 שינויים» clicked → persisted (4 accepted rows) → after reload: «הכנסה מוצהרת —», «47,800 ₪ לשנה (2025)», «ממוצע מחושב ≈ 3,983 ₪ לחודש», basis 16,708 ÷ 3 ≈ 5,569; spouse «16,500 · הצהרה · יוני 2025». Then a complete contradicting spouse read + partial/failed/truncated reads → after reload still «טעון אימות … לא נמצאה כתקפה»; a later valid complete read restored it. Help at 390 and 360: fully on screen (12px edges), no horizontal overflow, both formulas.
- **Found and fixed on staging:** the dev test screen installed its fake history source at module level, and App.tsx imports it in every build — real history came back empty everywhere (would have shipped). Fixed in `ddea715`; production bundle verified free of it.

## Checks on the integrated candidate
`tsc` clean · unit 1071/0 · worker btl-file-sync 47/0 · btl-tracking 93/0 · vite build ok. (Earlier runs reported 1,049 on the pre-rebase branch; 1,071 includes 220's tests.)

## Production read-only findings
- Non-client 6101 filings: 0 (one client filing in total).
- One real client with an automation-written monthly income that came from an annual assessment (47,800, «שומה עצמית» Jan–Dec 2025, written 05.10 06:08 UTC). It now shows «טעון אימות». Correction = per-client read + «אשר שינויים» (not done automatically).
- Pre-existing, not changed: the office role can UPDATE its own `clients` rows directly via PostgREST (RLS `clients_update_own`), including every governed column. The governed protection lives in `update_client_fields`. The new columns behave exactly like existing governed ones.

## Not done / needs Guy
- Live BTL smoke read: the office worker reports BTL **not connected**. Needs a manual BTL sign-in on the office PC; then «קריאת התיק בביטוח לאומי» on the two cases (declaration 16,500; assessment 47,800) and approval of the proposed changes.
- Production UI check on real clients: the browser pane is not signed in to production (Google sign-in) and must not sign in as Guy.
- Real phone: emulation only.
- Drop `backup_ni219_20261005` once satisfied.
