# Release — «תביעת מילואים בביטוח לאומי» (221) — 05.10.2026

Authorized by Guy in the task message (the explicit approval replaces §7 of `docs/PLAN-RESERVE-DUTY-CLAIM.md`: migration on staging and production, and the release).
Release order was site first, then DB (the site tolerates a DB without 221: no `photoGuide` ⇒ no guide row).

## What is live
| Layer | State | Evidence |
|---|---|---|
| master | `df73583` (fast-forward from `7d73d96`); branch `feature/reserve-duty-claim` pushed first | `git push` 7d73d96..df73583 |
| Production DB | 221 applied 17:12 UTC, ledger `20261005171222` | `build_client_portal` live body == 221 (44014 chars = 220 + 3 lines; `verify-221-body.mjs --live prod`); built-in template `reserve_duty_claim` exactly once (4 answers, no `clientLinkUrl`); `assert_domain_function_invariants()` ok; anon/authenticated cannot execute `build_client_portal`; journey_templates 4 → 5 rows |
| Drift check before applying | live prod body == 220 (43767 chars) | `verify-221-body.mjs --live prod --against 220` |
| Backup before 221 | schema `backup_r6_221_20261005` (journey_templates) + `C:/Users/guyas/PIVO/backups/r6-221-20261005` (definitions of 496 functions, policies, triggers, indexes, cron; `build_client_portal.sql` = the pre-221 function; README with restore) | `prod-backup-before-migration.mjs` |
| Site | Vercel `dpl_ETCrq7fxDrSYuhi9jGStsSMZCDgT` READY, alias crm.yasharcpa.co.il, `aliasError: null` | live bundle `main-DfkHGz_I.js` contains `reserve_duty_claim`, the sample wording and `govforms.gov.il`; `/guides/reserve-duty-claim/step-6.webp` 200 `image/webp` 35880 bytes |
| Edge functions / cron / worker | untouched | — |
| Staging | 221 applied; staging == production | `staging-test-single-source.mjs` 24/0 |

Production smoke after applying (counts only, nothing printed): `build_client_portal` is STABLE, SECURITY DEFINER, no DML; for all 22 clients `live` and `preview` return `ok`, max 14 items, 0 items with a photo guide. No request was created on any real client; no message was sent to anyone.

## Validation
- `tsc` clean · unit 1100/0 (29 new: `photoGuides`, `photoGuideRow`, `templateCarryNote`, `reserveDutyDemo`) · SQL `test-221-reserve-duty-claim.sql` 32/32 inside the rolled-back dry-run (214 → 221 together) · `verify-221-body.mjs` 221 = 220 + 3 lines.
- Browser, demo backend: customer portal 256/0 at 1280/390/375/360 (touch emulation asserted active on phones); office 92/0 at 1280/390 plus dark mode; zero console errors, no horizontal overflow, only external request is the blocked BTL tab.
- Browser, **staging with the real database** (45/0): library → «＋ בקשה חדשה» → draft (explanation + guide key + 4 answers persisted) → «איך זה ייראה» (inert) → «רק לפרסם» (zero e-mails) → page link → phone 390: card, guide with six screenshots, no server call from opening the guide or the link → answer → `portal_submit_step` once (status completed, ball `me`, value saved) → real F5 on both sides → «הושלמו» shows the answer; a second request from the library creates a new row and leaves the completed one untouched; 360 wide on real data. Test client deleted afterwards; 25 tables scanned, no leftovers.
- Regression: the rep-approval guide QA (`scripts/qa-guide.mjs`) 80 pass / 6 fail — the same two stale expectations at three widths that fail on the baseline worktree before this round.
- The local production build (`vite build`, same commit) contains no demo data (`reserveDutyPayload`, `__reserveDutyAnswer`, `d-reserve`, `demoPortal`, the first answer option: 0 hits in `dist/assets`).

## Not verified
- A real phone (emulation only), a real first-time user finding and understanding it, the BTL site itself (blocked in tests; `href`/`target`/`rel` checked), the library row on the live site (the browser pane is not signed in and must not sign in as Guy).
- Step 6 is phrased conditionally («אם המערכת לא מאפשרת…»): the block on an already-paid self-employed claim was not found in a written BTL source. «Two weeks» in step 3 vs another BTL page's wording was not settled.

## Restore (see README in the backup folder)
1. Run `build_client_portal.sql`, then `revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;`
2. `delete from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;` (requests already created from it stay; without the guide key they just show no guide).
3. `node scripts/verify-221-body.mjs --live prod --against 220` ⇒ «live body == 220».
