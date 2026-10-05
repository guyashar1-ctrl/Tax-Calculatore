# Release — «צפייה בבקשה» (222) — 05.10.2026

Authorized by Guy in the task messages (the explicit approval replaces §12.3/12.5 of `docs/PLAN-REQUEST-PREVIEW-2026-10-05.md`: migration on staging and production, push to master, verify the deployment — after every acceptance test passes).
Release order: backup → 222 on production → verification → site (push to master). The new site calls `preview_request_sample`, so the DB had to come first (the opposite of 221).

## What is live
| Layer | State | Evidence |
|---|---|---|
| master | `fde1b7f` (fast-forward from `b73708f`); branch `feature/request-preview` pushed first. The migration file itself came in with `dcb6628`. | `git push` b73708f..fde1b7f |
| Production DB | 222 applied 20:42 UTC, ledger `20261005204241` | `verify-222-body.mjs --live prod --after` (10 functions: live body == derived 222) · `verify-migration-functions.mjs … --prod` (9 functions, 9 identical) · `build_client_portal` / `ensure_rep_client_approval_step` / `shaam_require_client_approval` / `generate_onboarding_steps` + 6 new helpers, `preview_request_sample` STABLE · anon cannot execute any of them · authenticated can execute only `preview_request_sample` (which checks the office itself) |
| Drift check before applying | live prod bodies == 221 baseline | `verify-222-body.mjs --live prod` (4 functions, no drift) |
| Backup before 222 | schema `backup_r7_222_20261005` (journey_templates, 5 rows) + `C:/Users/guyas/PIVO/backups/r7-222-20261005` (definitions of 496 functions, policies, triggers, indexes, cron; the four replaced functions also as `pre-222-<name>.sql`) | `prod-backup-before-migration.mjs` |
| Site | Vercel production deployment of `fde1b7f` (see the record at the end of this file) | — |
| Edge functions / cron / worker | untouched | — |
| Staging | 222 applied (earlier); staging == production | `verify-222-body.mjs --live staging --after`, `verify-migration-functions.mjs` (9/9) |

Production smoke after applying (counts only): `build_client_portal` is STABLE, SECURITY DEFINER; for all 22 clients `live` and `preview` return `ok`, max 14 items. Before applying, the same comparison ran inside a rolled-back transaction on production: 44 real pages (22 clients × 2 modes), **0 differences** (`qa-222-identity.mjs --target prod`). No request was created on any real client; no message was sent to anyone.

## What was built
- **Server (222).** The request branches of the client page moved, word for word, into one function (`_portal_step_items`) that both `build_client_portal` (the real page) and the new `preview_request_sample` (STABLE; Postgres itself forbids writes) call. The wording builders of the generators (`rep_client_approval`, onboarding system steps) were extracted into payload functions that the generators and the sample builder share. `verify-222-body.mjs` proves the derived regions equal the released 221/216/217 sources.
- **Client page as a view.** `PortalView` with three modes (`live` / `sample` / `officeView`); every action is injected (`portal/portalActions.ts`); sample mode makes no network call.
- **«צפייה» drawer** (`src/features/requestPreview/`): library rows, group members, documents shelf, «＋ בקשה חדשה» in the client card, the flows builder («הוספת בקשה»), the opening rules and the request editor (live card). Tabs: client page · mail · documents · «המסך שנפתח». State axes; URL focus `#/firm/library/view:<kind>:<id>`; back closes.
- **«המסך שנפתח».** Five screens a client reaches by personal link are pure views + loaders drawn on sample data: details (`?onboard=`), signing room (`?sign=`), previous accountant (`?release=`; the letter is built by the office's own letter code from the office template), questionnaire (`?intake=`), BTL 6101 signing (`?sign-form=`).
- **Demo (`?office-app`)** answers from fixtures captured from staging (147 of 151 cases; `capture-request-preview-fixtures.mjs`). Not in the production bundle.
- **Anchors.** `CLAUDE.md` §12.4 item 9, §12.5 row, new §12.6; `docs/testing.md` «צפייה בבקשה».
- **Unit-test runner** stubs `?url` imports.

## Validation
- `tsc` clean · unit 1181/0 (baseline 1128) · `vite build` clean; the production bundle has no fixture or fake-backend markers.
- SQL, rolled-back dry-runs on staging: `test-222-request-preview.sql` 51/0 · `test-notices-flows.sql` 121/0 · `test-r4-engine.sql` 143/0 · `test-r4-notices.sql` 42/0 · `test-220-business-details.sql` 79/0 · `test-221-reserve-duty-claim.sql` 32/0 · `staging-test-onboarding-roundtrip.mjs` real 6/0 and synthetic 6/0 · `staging-test-single-source.mjs` 24/0.
- Page identity (P.1): staging 152 real pages + 104 synthetic variants (208 pages) 0 differences; production 44 real pages 0 differences. Generators: 15 variants identical before/after.
- Browser, `scripts/qa-request-preview.mjs`: **666 passed / 0 failed**, widths 1280, 390 and 360, chapters a–k (every library row opens and every tab and state switches; network trap; the QA client's real `?portal=` page compared text-for-text with the drawer; picker «＋ בקשה חדשה» (preview creates nothing, «הוספה ל…» creates exactly one); the opened screens; rules/builder/editor; demo with zero outgoing requests; regression; dark mode; counts of the test user unchanged before/after).
- Rep-approval guide QA (`scripts/qa-guide.mjs`, demo backend): 86/0. The six failures reported after 221 were stale wording expectations; they now follow the released wording that was verified in the browser.

## Not verified
- A real phone (emulation at 390/360 only), a real first-time user finding and understanding the drawer.
- The live production site was not opened signed in (the browser pane is not signed in and must not sign in as Guy). Only the deployment record and the bundle are checked.
- 4 of the 151 demo cases have no fixture («אין דוגמה בהדגמה»): annual-flow cases that cannot be captured from a single sample request.
- `verify-migration-ownership.mjs --target=prod` lists 39 functions that differ from their canonical owner file; none belongs to 222 (all pre-existing, from other migrations).

## Restore
1. Run the four `pre-222-*.sql` files from the backup folder, then `revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;`.
2. `drop function public.preview_request_sample(jsonb), public._portal_step_items(...)` and the other new helpers (list in `supabase/222-request-preview.sql`).
3. `node scripts/verify-222-body.mjs --live prod` ⇒ «live body == source» (the 221 baseline).
4. Without 222 the new site shows «לא הצלחתי לטעון את התצוגה» in every drawer — roll the site back too (Vercel: promote `dpl_HqLAWdMjVPMfaf9Y9CyZRYf6AdGX`, the 221 deployment).

## Deployment record
Vercel `dpl_EYDjs6Udk68UZ5oqbbyUAmVpmqZe` (production, commit `fde1b7f`): READY, `aliasError: null`, aliases include `crm.yasharcpa.co.il`. It sat QUEUED for about a minute behind the branch preview build, as expected.
Live check (one read-only round from a browser tab, no sign-in): `main-Cf9RsM-z.js` contains `preview_request_sample`, `rp-sample-badge` and the sample wording; `demoLibraryForPreview` / `__fakeBackend` are absent; the lazy chunk `linkedRenderers-cpRyDshU.js` is served (200); `/guides/rep-approval/step-1.webp` 200. The library itself was not opened on the live site (not signed in).
