# M1 — Resumable representation onboarding · deferred ID · office visibility

Implementation report, 2026-09-17. Nothing committed. Migration 191 applied to **staging only**; production untouched.
Source of truth for the design: `docs/FINDINGS-REPRESENTATION-RESUME-AND-PROCESS-VISIBILITY.md`.

## 1. Files changed (M1 only)

New
- `supabase/191-onboarding-resume-and-deferred-id.sql`
- `src/utils/representationInsight.ts`
- `scripts/staging-test-onboarding-resume.mjs` (44 assertions)

Modified
- `src/components/OnboardingPage.tsx` — step-transition save, rehydrate, resume banner, spouse-delegation memory, "upload later" per person, submitted-screen copy
- `src/types/index.ts` — `OnboardingIdentification.draft / identityDeferred / identityDeferredAt`, `OnboardingDraft`
- `src/components/RepresentationRequestReview.tsx` — progress line (pending_fill) + missing-ID warning (submitted); passes `insight` to the status row
- `src/components/RepresentationNextStep.tsx` — pending_fill sub-line = real progress; "· חסר צילום תעודה: …" on office statuses
- `src/components/RepresentationExecutionCenter.tsx` — soft gate (ConfirmDialog) before "שלח ללקוח" when identity evidence is missing
- `src/components/clientTabs/OnboardingTab.tsx`, `JourneyTab.tsx`, `ClientWorkspace.tsx`, `App.tsx` — `repNote` threaded to the representation card in «בקשות»
- `supabase/functions/portal-upload-document/index.ts` — `id_card_spouse` → category `id_card` (one line; **not yet deployed** to staging/prod — the sync itself is a DB trigger and does not depend on it)
- `scripts/staging-test-p0-security.mjs` — anon allow-list gains `save_onboarding_step`, `touch_onboarding`

Not mine (pre-existing uncommitted work in the tree, left untouched): `TaxFileTab.tsx`, `TaxFileEdit.tsx`, `AlignmentStatusView.tsx`, `AuthorityCheckPanel.tsx`, `AutomationCheckCard.tsx`, `pivo-design.css`, `index.css`, `niPersons.ts`, `NiNextActionButton.tsx`, `shaamRepresentationAction.ts`, `worker/*`, `190-btl-representation-timestamps.sql`, `.claude/*`, `docs/prototypes/*`, `docs/SHAAM-AUTOMATION-HANDOFF.md`.

## 2. Migration / schema (191)

No new tables, no new columns, no new status values, no backfill.
- `save_onboarding_step(p_token, p_step 1..3, p_values jsonb)` → jsonb — anon, token-scoped; closed field list per step; server validation (ID checksum via new `_israeli_id_valid`, dates, email, phone, enums, years, length ≤120); writes `identification.draft = {step, savedAt, openedAt, lastActivityAt, values}`; refuses after `onboarding_status='submitted'` or `status<>'pending_fill'`.
- `touch_onboarding(p_token)` → boolean — records `draft.openedAt` / `lastActivityAt`. Separate from `get_onboarding` on purpose so `public_link_health` (176) cannot stamp "opened".
- `get_onboarding` — return type extended (drop/create) with `draft jsonb` (empty once submitted) and `spouse_fill {requestedAt, submittedAt, token}`.
- `submit_onboarding_full` — old 22-arg signature dropped; new one adds `p_identity_deferred text[] default null`; body = 166 + server ID-checksum check, `draft` removed, `identityDeferred/At` written, then `ensure_identity_document_requests` + `sync_identity_docs_to_client_documents`.
- `ensure_identity_document_requests(request, persons[])` — adds `id_card` / `id_card_spouse` items (label per chosen secondary doc) to the client's `client_documents` step (payload **and** `draft_payload`, so publish doesn't drop them; reopens a closed one), or creates one (published unless lifecycle `lead|quoted`, per 135). Title via `_documents_title(n)` ("להעלות מסמך אחד" / "להעלות N מסמכים").
- `sync_identity_docs_to_client_documents(client)` — identity_docs ⇒ marks the matching item done (documentId, doneAt, source) and completes the step when nothing non-optional remains (via `_set_step_status`). Called from `onboarding_identity_doc_append` (175, redefined) and a new `AFTER INSERT` trigger on `client_documents` steps (generator runs after onboarding).
- Trigger `onboarding_steps_client_documents_identity` (`AFTER UPDATE OF payload`) — `client_documents` item `id_card`/`id_card_spouse` with a `documentId` ⇒ appended to `representation_requests.identity_docs` (idempotent by documentId). No loop: the reverse sync is a no-op when the id is already present.
- `assert_domain_function_invariants` — same body as 165 with the two new anon RPCs allow-listed; `select` at the end passes.

## 3. Persistence behavior

Customer typing is written to the server **at each successful "המשך"** (steps 1→2, 2→3, 3→4), never per keystroke and never at step 4. The write replaces that step's field-set as a unit (a cleared field disappears). `draft.step` only ever increases. Submit is still the single canonical write to `identification` + `clients.*`; it deletes the draft. ID uploads remain immediate (unchanged).

## 4. Resume behavior

On open, `get_onboarding` returns the draft; the form seeds office prefill, then overrides with the customer's own draft values, and jumps to `min(draft.step + 1, 4)` with a dismissible "ממשיכים מאיפה שעצרתם" banner. Works after refresh, tab close, and on any device with the same link. A "✓ נשמר" flash confirms each save; a save failure blocks the transition with a clear message instead of silently advancing.

## 5. Deferred ID

Per required person at step 4: upload now, or "אין לי את המסמך זמין כרגע - אעלה אותו מאוחר יותר" (warm card, undo link "בכל זאת יש לי - לצרף עכשיו"). Only *non-deferred* missing docs block submit; the error text now offers the deferral. Submit sends `p_identity_deferred` = deferred persons still missing. The submitted screen lists "צילום התעודה - כשיהיה זמין" as action #1 and adjusts the count ("נשארו שלוש פעולות"). No new `RepresentationStatus`; the request goes to `awaiting_accountant` as before, and "missing" is derived (`identityRequirements(scope) − identity_docs`).

## 6. ID / document convergence

One truth per direction, both server-side:
- Onboarding upload ⇒ `identity_docs` ⇒ `client_documents.id_card[_spouse]` marked done (and step completes if last). Verified: item done with documentId, step `in_progress`/`completed`.
- Portal upload to `id_card[_spouse]` ⇒ trigger ⇒ `identity_docs[person]` appended (`via: 'client_documents'`). Verified with the real `portal-upload-document` edge function on staging.
- Deferral ⇒ item added to the existing docs request (or one created). A customer who uploaded during onboarding never sees a second `id_card` item (item is born done via the insert trigger when the generator runs later).

## 7. Office visibility

- «בקשות» representation card: `⏱ הלקוח שמר עד שלב 2 מתוך 4 · ממשיך ב«מצב משפחתי» · היום` / `הקישור טרם נפתח` before submit; `⚠ חסר צילום תעודה: נועה ברק (בחר/ה להעלות מאוחר יותר) · ממתין להעלאה בדף האישי («מסמכים מהלקוח»)` after. Also says "הבקשה טרם פורסמה ללקוח" when the docs request is still a draft (quote path).
- Request page: same two lines inside "ייצוג שהתבקש" block; status row (`RepresentationNextStep`) carries the progress / missing-ID suffix.
- Execution center: "שלח ללקוח" opens *"לשלוח לחתימה בלי צילום תעודה?"* with the names; "ביטול" / "שלח בכל זאת". No hard block, no new status.
- The request never disappears or looks complete: the docs request sits under it in «בקשות» as `0/1 · הכדור אצל הלקוח`.

## 8. Spouse resume

`get_onboarding.spouse_fill` restores `spouseLink` when a spouse token was minted, so step 3 shows the delegation card (not the spouse ID/birth/secondary fields) and step 4 hides the spouse's doc. Fixed a latent bug on the way: when delegated, the client form no longer sends `p_spouse_secondary_type/value/birth_date` (the default "parentId" would have overwritten what the spouse chose in their own link).

## 9. Security boundaries

Preserved: token→request→client resolution in `SECURITY DEFINER`; both new RPCs `anon`-granted only and allow-listed in the invariants; closed per-step key list (foreign key → `field_not_allowed`); server validation mirrors the UI; **no writes after submission** (draft, touch, submit, upload all refuse); no PII in URLs; draft returned only to the holder of the onboarding token and only before submission; spouse token exposed only to the client-token holder who minted it (same as `request_spouse_onboarding` already did). Wrong token: read empty, write `invalid_token`; token A cannot touch request B (tested). New: submit now also rejects an ID number failing the checksum.

## 10. Backward compatibility

Old rows have no `draft` → `get_onboarding` returns `{}`, form opens at step 1 with office prefill (browser-verified on a 2026-07-02 staging row). Submitted/active rows untouched; `get_onboarding` returns `{}` draft for them. `identity_docs` null ⇒ no requirement, as before. Existing `client_documents.id_card` items keep working and now also feed `identity_docs`. Quote-created requests: unchanged creation; their (draft) docs request receives the deferred item and the office is told it's unpublished. No data migration.

## 11. Tests / typecheck / build

- `tsc --noEmit`: clean. `vite build`: ✓ (8.6 s; pre-existing chunk-size warning).
- `staging-test-onboarding-resume.mjs`: **44/44**.
- Regression suites on staging after 191: `p0-security` 29/29 · `authz-boundaries` 53/53 · `single-source` 24/24 · `edge-atomic` 60/60 · `portal-security` 13/13 · `domain-invariants` 55/55 (after the documented `seed-staging` — the seed's email gate flags 2 `example.com` rows from 2026-08-12, pre-existing).

## 12. Browser QA (staging, `npm run dev:staging`, real DB)

1. Step 1 → המשך → refresh: resumed at step 2, values present in DB and rehydrated ✓
2. Steps 1–2 → navigate away → reopen: resumed at step 3 with banner ✓
3. No ID → "upload later" → submit: success screen with deferral as action #1; office shows `awaiting_accountant` + ⚠ missing ID + docs request 0/1 ✓
4. Portal (`?portal=`) shows "להעלות מסמך אחד"; upload via the real edge function → `identity_docs` filled, docs request completed, review page shows "דנה כהן ✓" — no second ask ✓
5. Upload during onboarding → item born/marked done in docs request (server test 7/7ב) ✓
6. Delegate spouse → leave → reopen: delegation card restored, spouse fields not re-asked, spouse doc not requested from the client ✓
7. Pre-191 pending request opens at step 1, no errors from 191 ✓
8. Submitted/active rows: server tests + staging suites, no regressions ✓
9. Wrong / other-request token: cannot read or write (server tests 3) ✓
10. Send-for-signature with missing ID → confirm dialog; cancel = no send ✓
Mobile (375 px): steps 3–4 incl. the defer card render correctly, RTL intact. Desktop screenshots captured inline during the run.

Console: two pre-existing items only — a React `font`/`fontWeight` shorthand warning on the family-status buttons (in HEAD before M1) and `409 POST /rest/v1/tasks` from the office session's system-task insert.

## 13. Deviations from the brief

- "Last activity" is tracked at open + each save, not on every interaction (by design: no per-keystroke traffic).
- The «בקשות» card note reads from the requests list that the office app loads once per session (existing behavior); a request submitted while the office tab is open shows the new note after reload.
- No new reminder audience for `pending_fill`; the reminder engine (186) was left as is.

## 14. Known issues

- `portal-upload-document` change not deployed yet (`node scripts/deploy-edge-function.mjs <staging|prod> portal-upload-document`). Without it a spouse ID uploaded from the portal lands with category `other` (still linked correctly).
- 191 must be applied to production (`scripts/prod-apply-migration.mjs`) together with the frontend deploy: the new `submit_onboarding_full` signature is required by the new `OnboardingPage`; the old page keeps working against the new function (extra param has a default).

## 15. Retention — intentionally unresolved

Unsubmitted drafts (ID number, birth date, address) now live on `representation_requests.identification.draft` under a non-expiring capability token. No purge job was added. `draft.savedAt` / `lastActivityAt` are in place so a policy ("purge draft values after N days of inactivity, keep the request") is one function + one cron away. Decision for Guy: N, and whether the office should be notified before purge.

## 16. Visual verification

Rendered and verified in the real browser against staging (customer page desktop + mobile, portal, office «בקשות», request page, execution-center dialog). The execution-center dialog was verified through the DOM because the pane returned a black frame after `scroll_to`; its text and both buttons were read live.
