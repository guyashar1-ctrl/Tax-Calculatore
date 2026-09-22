# Requests page — independent product investigation (2026-09-19, second pass)

Discovery only. No production change, no email, no state-changing action (the only dialog I opened
was Din's preview, cancelled). Evidence: production UI on Guy's card, production DB (read-only),
code on `master` (migrations ≤ 191). Where this pass disagrees with the first pass
(`FINDINGS-REQUESTS-COMMUNICATION-MODEL-2026-09-19.md`), it says so.

---

## A · Findings from the current implementation

1. **Blue is not "I have something to do"; it is `ball='me'`, and `ball='me'` is written for four
   different reasons.** On Guy's card the two visible blue dots are Din's BTL card (a genuine
   decision: send instructions) and «הרשאה לתשלום חודשי» — which is *waiting for the client to enter a
   card in Paperless*; its own body says so («פייפרלס תבקש מהלקוח את הכרטיס… כשתראה שהכרטיס הוזן – לסמן»).
   The four hidden `ball='me'` steps (kyc + 3 alignment) are internal office work.
2. **Gray is five different things** with one look: waiting for client (published), waiting for
   client (published but *never announced* — see 4), waiting for authority (SHAAM), waiting for
   previous accountant, and locked-behind-dependency. And **"PIVO is working" has no representation
   at all**: Din's `btl.check_representation` job is in `needs_human` since 07:29 today and the card
   is unchanged ("בטיפול · הכדור אצלי").
3. **Red is used for two opposite things.** `needs_attention` is set by the server both for blocked /
   expired (a problem) and by `portal_submit_step` when the *client finished* a request
   (`status='in_progress', ball='me', needs_attention=true` → "review it"). Same dot.
4. **Three of Guy's four gray client requests were published after the last email to the client.**
   Last page email (`process_open`): 17.08 10:45. «הקמת הרשאה לחיוב חשבון» created 04.09, «חיבור
   פייפרלס לרשות המסים» 27.08, «מסמכים מהלקוח» 04.09. They are live on the personal page, the client
   was never told, and nothing on the screen says so. "Waiting for client" is technically true and
   operationally false.
5. **«התחל» is a bookkeeping flag with no client-visible effect** (full trace in B).
6. **The counters disagree because they answer different questions with the same word** (C).
7. **«בקשת ייצוג» at the top is a completed milestone pinned by design** (D).
8. **Every outbound send is a separate, type-specific path with a separate discoverability rule**;
   nothing can answer "what is ready to go out to whom" (E). The reason Din is excluded from
   «שלח שוב את הקישור» is structural: that flow sends the *owner's page* to `clients.email`; Din's
   item on that page is bucket `office` ("PIVO will send soon"), and her mail is a different function,
   stage and address.
9. Correction to pass one: `accountant_notifications` has 9 kinds in production, including
   `client_request_completed` (10 rows) and `client_document_uploaded` (5). There is still no
   notification for "BTL confirmed" or "job needs a human".
10. The same numbers are re-derived on four surfaces: tab badge, «הפעולה הבאה», client directory
    («X מתוך Y»), and the Tasks page («קליטת גיא ישר · עכשיו: … · 5 מתוך 15 הושלמו», bucket
    `mine`/`others` from `summarizeClientOnboarding`).

---

## B · The gray «התחל» buttons — exact trace

**Where it renders.** One place: the generic card `JourneyRow` in `OnboardingTab.tsx` (~line 1478):
`step.status === 'pending' && !extSendable && step.stepType !== 'paperless_tax_authority'` →
`<button className="btn btn-sm btn-secondary">התחל</button>` → `run(step, 'start')`. A disabled
«התחל» also renders on `locked` steps without an external party. On Guy's card it appears on
«הקמת הרשאה לחיוב חשבון במוסדות» (`custom_request`, ball=client) and «מסמכים מהלקוח»
(`client_documents`, ball=client). The dedicated cards (paperless, retainer, release, representation,
BTL, intake, kyc, opening call) do not render it; `paperless_tax_authority` renders «הלקוח השלים» instead.

**What it does.** `advance_onboarding_step(step, 'start')` (168): `status := 'in_progress'`;
`ball` unchanged (`coalesce(nullif(p_payload->>'ball',''), null)` → keeps the old value); one
`onboarding_events` row `status_changed pending→in_progress` by `accountant`; no email, no
dependency unlock (only closing statuses unlock), no portal change — `build_client_portal` renders
`pending` and `in_progress` identically (`bucket='action'`), no reminder, no automation.

**What changes visually.** The status word: «ממתין» → «בטיפול»; the buttons: «התחל» → «סיימתי» +
«ממתין ללקוח». Nothing else, on any surface.

**Why it exists.** It is the generic engine's (31) manual start for office-internal steps
(`internal_setup`, `kyc`, `data_import`…) where "in progress" meant a person picked it up. Those
steps were later hidden from this page (LEGACY_AUTO_OFFICE_TYPES), and the button survived on the
generic card that client-facing `custom_request` / `client_documents` fall through to.

**Does the system already infer "started"?** Yes, for the client's side: `portal-upload-document`
moves `locked/pending → in_progress` on first upload; `portal_submit_step` completes the step
(or `waiting_client` while items remain). So on a client-facing request the office's «התחל» is
redundant with what the client's own action does.

**Would removing it break a workflow?** The only casualty: on a `pending` client request the
office can no longer reach «ממתין ללקוח» (it appears only in `in_progress`). For `ball='client'`
steps that is not a loss — `pending/client` already *means* waiting for the client. Manual
internal tasks (`custom_request` with `ball='me'`) keep an ownership need; there «התחל» is at most a
"picked up" toggle.

**Product evaluation.**
- Does the accountant need to explicitly start a client request? No — it asks the client, not him.
- Can the system infer start? It already does for the client; for internal work the first real
  action (opening an institution, sending, uploading) is the start.
- Ownership/acknowledgement value? Only for manual internal tasks, and even there «בטיפול» carries no
  consequence.
- Accident prevention? None — it changes nothing that can go wrong.
- Can the real next action replace it? Yes: for a client request the office's real actions are
  "tell the client" (send) and "it arrived / I did it for them" (complete). For internal work the
  verb of the work («כניסה לב״ל», «בצע יישור קו»).

**Recommendation:** remove «התחל» from all client-facing cards; `pending/client` renders as waiting
with the completion action in ⋯ («התקבל / סמן כהושלם»). Keep an implicit start everywhere
(first real action ⇒ `in_progress`). For manual internal tasks keep one quiet toggle «בטיפולי»
only if Guy wants a "picked up" mark (decision L-6); otherwise drop it there too.

---

## C · Exact breakdown of the current counters (Guy's card, live data)

15 non-cancelled steps. Open (`isStepOpen`) = 9; awaits-me (`stepAwaitsMe`) = 6; done = 6
(5 in «בקשות שהושלמו» + the representation milestone).

| Step | status/ball | in «9 בקשות פתוחות» | in badge «6» | rendered | dot |
|---|---|---|---|---|---|
| ייצוג בביטוח לאומי — דין | in_progress / me | ✓ | ✓ | card | blue |
| הרשאה לתשלום חודשי | pending / me | ✓ | ✓ | card | blue (should be waiting) |
| הקמת הרשאה לחיוב חשבון במוסדות | pending / client | ✓ | – | card + «התחל» | gray |
| חיבור פייפרלס לרשות המסים | pending / client | ✓ | – | card | gray |
| מסמכים מהלקוח | pending / client | ✓ | – | card + «התחל» | gray |
| institution_alignment_btl / vat / income | pending / me ×3 | ✓✓✓ | ✓✓✓ | one «יישור קו» group card | gray (no active class) |
| kyc_identification | pending / me | ✓ | ✓ | **not rendered** (LEGACY_AUTO_OFFICE_TYPES) | – |
| representation | completed | – | – | milestone at top | green |
| BTL — גיא, paperless ×2, custom ×2 | completed ×5 | – | – | collapsed «עבר» | – |

- «9 בקשות פתוחות» — `nextActionForClient` → `deriveNextAction.openRequests` = `isStepOpen` over all
  steps, ball ignored, hidden steps included. Its sub-line «הראשונה: יישור קו · מס הכנסה» is
  `nextStepForClient` (urgency sort), which picks an alignment step because `ball='me'` beats
  `ball='client'`.
- Badge «6» — `ClientWorkspace.journeyBadge` = `stepAwaitsMe` over all steps: Din + retainer + 3
  alignment + kyc. Four of the six are not visible as cards.
- Visible blue: 2. Visible gray: 3 client + the alignment group.
- Tasks page: «קליטת גיא ישר · 5 מתוך 15 הושלמו» — a fourth derivation (`summarizeClientOnboarding`,
  which does not exclude hidden types either).

**Recommendation.** Show **one** number for the client, with the same definition on the tab badge
and on the page: *actions waiting for me on this page* = blue cards actually rendered (send /
review / decide / fix). For Guy today: **1** (Din). Retire «N בקשות פתוחות» as a headline — a
count that includes "nobody in the office needs to act" is not an "open request" in the user's
language; replace with a quiet waiting line: «ממתינים · 4 אצל הלקוח (3 טרם נשלחו) · 1 אצל פייפרלס».
Internal office work («העבודה שלי») gets its own small count, not merged into the badge
(decision L-1). Hidden steps must never be counted anywhere they cannot be seen.

---

## D · The «בקשת ייצוג» card — state and ordering

- **What it is:** `milestone('ms-representation', …)` in `OnboardingTab.tsx` (~1865) — rendered when
  a `representation` step is `completed/verified` (`doneRepStep`). Not a step card, no actions, no
  dot class other than `is-done` (green ✓), excluded from `doneSteps` so it does not appear in
  «עבר».
- **Current state:** step completed 15.07.26; `representation_requests.status='active'`; text
  «הושלמה · 15.07.26 · מיוצג פעיל». Nothing pending, nothing counted, nothing for Guy to do.
- **Why first:** by design — "אבני-דרך שהובילו לכאן": approved quotation, then completed
  representation, are pinned above the open list so the sequence "doesn't start in the middle".
  Then `repStep` (an *open* representation) would come, then `authRepSteps` (Din) — always before
  client rows regardless of `sort_order` — then client rows by `pending_sort_order ?? sort_order`
  (290 → 300 → 310 → 320).
- **What completes it:** for the general representation, only `status='active'` via the manual
  «סמן כמיוצג פעיל» in the execution center (after SHAAM approval). For a client like שמעון
  (`awaiting_authorities` since 27.08) the card is open, gray, «ממתין לאישור הרשויות · הכדור אצל
  הרשות», and there is no prompt to go and check SHAAM — the process is "open" with no action
  and no due date.
- **Recommendation:** milestones become a one-line context strip under the client header
  («מיוצג פעיל מ-15.07.26 · הצעה אושרה 14.07»), not the first card. An open representation that
  needs me (`awaiting_accountant` / `awaiting_stamp`) is a blue card at the top with the verb
  («להפיק את טופס ייפוי הכוח»). `awaiting_authorities` is a gray waiting card with *what will close
  it and when to look* («הוגש לשע״ם 27.08 · לבדוק אחרי 14 יום»), and after that window it turns into
  a blue "check" action — or PIVO checks (decision L-4).

---

## E · Map of all current sending entry points

| Entry point (where) | Recipient | Function / stage | Preview gate | Logged as |
|---|---|---|---|---|
| Page bar «שלח שוב את הקישור» / «עדכן את דף הלקוח → לעדכן ולשלוח קישור» (`SendPortalDialog`, `PublishCasePrompt`) | owner, `clients.email` | `send-process-open-email` (event: process_open / documents_sent / status_update) | `EmailPreviewDialog` | `email_messages` kind=event, no step_id |
| Din's card body «שלח הוראות אישור» (`AuthorityRepresentationStepCard` → `NiInstructionsDialog`) | subject only (`spouse_email`/`email`) | `send-onboarding-email` stage `ni_approve` | address dialog → preview | kind `ni_approve`, step_id, `execution.instructionsSentAt` |
| Prerequisites gate «שלח להשלמת פרטים» (`PrerequisiteGate` → `ParticipantLinkDialog`) | subject **or owner** (`recipient_role`, 167) | `send-onboarding-email` stage `prerequisites` | preview | kind `prerequisites`, `participant_links.sent_at` |
| External-party request «פתח טיוטת מייל לשליחה» / «שלח תזכורת» (generic card) | `payload.externalParty.contact` / prev accountant | `send-step-email` (`step_reminder`) | editable preview | kind `step_reminder`, step_id |
| Release letter (`ReleaseStepCard` → `ReleaseLetterDialog`) | prev accountant | `send-release-email` | preview | kind `release` |
| Execution center: signature email / «עדכון ללקוח» | signers[].email / owner | `send-onboarding-email` stage `sign` / `active` | preview | kind `sign` / `active` |
| Request review «שלח מייל שוב» | owner | stage `onboard` (`force`) | preview | kind `onboard` |
| Documents workspace «שלח ללקוח» | owner | `send-process-open-email` (documents_sent) | preview | kind `documents_sent` |
| Quotation / charge / apply-link (`App.tsx`) | lead / owner | `send-quotation-email`, `send-charge-payment-request-email`, `send-apply-link-email` | preview | quotation kinds |
| Automatic email steps (`payload.autoAction`) | per step | `execute_automatic_step` → `send-step-email` internal | none (armed at publish) | kind per step |
| Cron reminders | signers / niClient / niSpouse / portal | `representation-reminders`, `quotation-reminders` | none (system copy) | `representation_reminder_*` |
| Retainer «הרשאה לתשלום חודשי» | — | **no email at all** (Paperless asks the client) | — | — |

Nothing computes "what is ready to send"; the owner's page email lists *everything* on the page
(not what is new since the last mail), and every other lane is discovered by opening its card.

---

## F · Two genuinely different UX models (plus the one I reject)

**Model 1 — "Inbox by question" (derive, regroup, one send tray).**
The page is four fixed sections that answer the four questions, in this order: **לטיפולי** (blue,
counted), **ממתינים** (gray, grouped by *whom*: הלקוח / פייפרלס / רשות / רו״ח קודם / PIVO), **העבודה
שלי** (internal, own quiet count), **עבר** (collapsed). One primary page action «שלח בקשות» opens a
tray of everything ready to go out, grouped by recipient. All of it is derived from existing data.
Cards are not chronological; the order inside a section is urgency then `sort_order`.
*Trade-off:* the process narrative ("first Paperless, then retainer") is weakened — dependencies show
as a lock line on the child, not as nesting; and "ready to send" is inferred (published-after-last-mail,
reference-without-instructions), which is right today but must be maintained per kind.

**Model 2 — "Process timeline with an action rail".**
Keep today's single chronological list (milestones → representation → BTL → client rows with nesting)
as the narrative, and add a fixed **rail at the top**: «הפעולה הבאה» becomes an action list (1–3
verbs with buttons: «שלח לדין את ההוראות», «עדכן את גיא על 3 בקשות חדשות») and «ממתינים» becomes a
one-line summary. The list below loses «התחל» and the milestone card, gains a waiting line per card.
*Trade-off:* keeps the approved card language and nesting almost untouched; but two representations of
the same item (rail + card) is the duplication the convergence audit removed, and the list still mixes
"mine" and "waiting" so the eye has to read the dots.

**Rejected — Model 3, "recipient-first" page** (sections per person: גיא / דין / רשויות / משרד).
Answers "who" well and "what next" badly: Guy's three unsent requests and his retainer wait would sit
under his own name next to nothing actionable, and Din's single item becomes a section. Recipient is
the right grouping *inside the send tray*, not for the page.

---

## G · Recommended model: Model 1, with the tray as the only "send"

Why: it is the only model whose first section is, by construction, the badge; it removes the need to
read dot colors by making the *section* the meaning; it keeps the internal state machine invisible
(five gray reasons collapse into "waiting · at whom · since when"); and — the important finding of
this pass — **it needs no new domain object to be honest**: "ready to send" for the owner is
`published_at > last owner mail` (both stored), and for Din it is `referenceNumber && !instructionsSentAt`
(stored). Pass one recommended a new communications table; for *this screen's* clarity that is not
required. It remains the right layering later for the Office-wide «תקשורת» view (follow-ups, drafts
across clients), but it should not gate the Requests page fix.

Do not preserve "blue = ball with me". Replace with **blue = there is a button here I should press
now** (send / review / decide / fix). Gray = nothing to press. Red = a real problem (blocked, failed,
expired), never "client finished — review" (that is blue). No fourth color for PIVO: a PIVO line
inside the gray/blue card («PIVO בודק בב״ל… / נתקע: חלון ב״ל סגור — התחבר») is enough.

---

## H · Proposed hierarchy — Guy's card, real items, today

```
גיא ישר · מיוצג פעיל                                             [בקשות 1] [תיק מס] [מסמכים] …
מיוצג פעיל מ-15.07.26 · ייפוי כוח ב״ל שלך אושר 09.09                (context strip, was 2 cards)

■ לטיפולי · 1                                                 [שלח בקשות ▸  לדין 1 · לגיא 3]
● ייצוג בביטוח לאומי — דין וולוצקי ישר
  PIVO הזין את ייפוי הכוח בב״ל · אסמכתא 75071159 · לאשר עד 15.11
  דין צריכה לאשר — ההוראות עוד לא נשלחו אליה                    [שלח לדין את ההוראות]  ⋯
  ⚠ בדיקת אישור מהיום 07:29 נתקעה: חלון ב״ל סגור                 [התחבר והרץ שוב]

■ ממתינים · 4                                                  (quiet, not counted)
  אצל גיא — בדף האישי · הדף נשלח לאחרונה 17.08 · 3 בקשות נוספו אחריו ← [כלול ב«שלח בקשות»]
  ○ הקמת הרשאה לחיוב חשבון במוסדות · 0/3 · בדף מ-04.09                      ⋯
  ○ חיבור פייפרלס לרשות המסים · בדף מ-27.08                                 ⋯ (סמן שבוצע)
  ○ מסמכים מהלקוח · 0/1 · בדף מ-04.09                                       ⋯
  אצל פייפרלס
  ○ הרשאה לתשלום חודשי · ממתינים שגיא יזין כרטיס בפייפרלס · מ-16.08        ⋯ (הכרטיס הוזן)

■ העבודה שלי · 1                                               (own count, not the badge)
  ○ יישור קו ללקוח · 0 מתוך 3 · ביטוח לאומי [כניסה] · מע״מ [כניסה] · מס הכנסה [כניסה]
  ＋ משימה פנימית

▸ עבר · 6   (בקשת ייצוג · ייצוג ב״ל גיא · פייפרלס ×2 · מדריכים ×2)
```

`kyc_identification` stays hidden and uncounted (as today) unless L-7 says otherwise. «תיאום מס»
is not on this card — it is an office task for a different client («לעשות תיאום מס» · יריב רכס)
and lives on the Tasks page; a manual task for this client would sit under «העבודה שלי».

**Edge cases, same model:**

| Case | Where | Look | Line |
|---|---|---|---|
| PIVO working (job queued/running for a step) | ממתינים · PIVO (or inside the card it belongs to) | gray, PIVO line | «PIVO מזין ייפוי כוח בב״ל… (התחיל 07:29)» |
| Waiting for client (announced) | ממתינים · אצל הלקוח | gray | «בדף מ-04.09 · הדף נשלח 05.09 · נפתח 06.09» |
| Waiting for client (never announced) | ממתינים · אצל הלקוח + tray | gray + «טרם נשלח» pill; counted in the tray, not the badge | «בדף מ-04.09 · טרם נשלח» |
| Waiting for authority (שמעון, SHAAM since 27.08) | ממתינים · אצל הרשות | gray | «הוגש לשע״ם 27.08 · לבדוק אחרי 10.09» → after the window: moves to לטיפולי «לבדוק בשע״ם» |
| Ready to send to owner | tray «לגיא · 3» | — | one page mail, preview |
| Ready to send to Din | לטיפולי card + tray «לדין · 1» | blue | «שלח לדין את ההוראות» |
| Blocked / failed automation | לטיפולי | red dot, PIVO line | «נתקע: חלון ב״ל סגור — התחבר והרץ שוב» / «נכשל ×3 — בצע ידנית» |
| Manually-startable internal item | העבודה שלי | gray, verb button | «כניסה» / «בצע» — no «התחל» |
| Process open, no action for me (client's BTL after send; retainer wait) | ממתינים | gray | «נשלח לדין 19.09 · ממתינים לאישור בב״ל עד 15.11» |
| Client finished, needs my review (`portal_submit_step`) | לטיפולי | blue (not red) | «גיא מילא — לבדיקה» [בדוק] |
| Expired BTL reference | לטיפולי | red | «האסמכתא פגה 15.11 — להזין מחדש» [הזן שוב ב-PIVO] |

---

## I · Pressing the primary «שלח בקשות» — step by step

1. Click → the server (one RPC, read-only) computes the **ready set** for this client:
   - owner group: client-facing steps with `published_at` later than the last owner mail
     (`email_messages` kind ∈ process_open/documents_sent/status_update) or never mailed, plus
     documents sent since; recipient `clients.email`;
   - per other person: BTL `referenceNumber && !instructionsSentAt` (→ Din), prerequisites links
     created and not sent; recipient by role from the card (`spouse_email`);
   - external parties (prev accountant) are listed as a third group only if a draft exists
     (decision L-2).
2. Tray dialog, grouped by recipient, each group: name · address · what is included (item list) ·
   «תצוגה מקדימה» · checkbox on the group. Missing address → group shows «אין כתובת — הוסף» inline
   (writes to the card), never a silent skip.
3. «שלח» → one call per group, each through its **existing** function (`send-process-open-email`
   for the owner, `send-onboarding-email ni_approve` for Din), sequentially, with the existing
   idempotency keys; a failure is shown per group, others proceed.
4. On success: log rows as today; Din's card → gray «נשלח לדין היום · ממתינים לאישור בב״ל עד 15.11»,
   moves to ממתינים; the three owner requests lose «טרם נשלח»; tray count → 0; badge 1 → 0.
5. Nothing is auto-sent, nothing changes step status except through the existing triggers.

---

## J · What should be blue, gray, completed, hidden, attention

- **Blue (counted):** send-ready to a non-owner person (Din); representation
  `awaiting_accountant`/`awaiting_stamp`; client finished → review; SHAAM check due; deadline-driven
  manual actions; manual internal task only if L-1 says internal work counts.
- **Gray (not counted):** waiting for client / Paperless / authority / prev accountant; locked;
  PIVO running; BTL sent-awaiting; retainer awaiting card.
- **Red (counted):** blocked, failed after retries, expired reference, `needs_human` on a job.
- **Completed:** «עבר», collapsed, plus the context strip for the two milestones.
- **Hidden:** `kyc_identification`, `internal_setup`, `first_month_review`, `rep_client_approval`
  (execution-owned) — and therefore excluded from every count.
- **Pill, not color:** «טרם נשלח» on waiting-for-client cards that post-date the last mail.

---

## K · UI/product vs domain/state-machine changes

**UI / product only (no schema, no SQL):** sections and ordering; badge = blue cards on the page;
remove «התחל» from client-facing cards (keep implicit start); milestone strip; card status sentence =
"what happened · who acts · since when"; «טרם נשלח» pill (derivable from `published_at` vs
`email_messages`); PIVO line on cards (derivable from `automation_jobs` by client + `input.role`);
red only for blocked/failed/expired; the send tray dialog (client-side composition of existing calls).

**Server-derived, no schema:** one RPC `client_ready_to_send(p_client_id)` returning the grouped ready
set (so the tray and the badge cannot drift); one function for the card's attention state
(`mine / waiting(whom) / pivo / blocked / done`) so the Tasks page and the client directory use it too.

**Small state-machine/data changes (worth doing, not blocking):**
- `retainer_authorization` is generated `pending / ball='me'` while it waits for the client's card:
  generator + trigger should set `ball='client'` once the retainer was updated (small migration +
  backfill of open rows), otherwise the UI must special-case the type.
- `portal_submit_step` sets `needs_attention=true` for "review": either stop using the flag for that
  (use `status='in_progress' & completion_method` / an event) or the UI must read `needs_attention &&
  status='in_progress'` as review. Prefer the server fix.
- SHAAM waiting: a `due_date` on the `representation` step when it enters `awaiting_authorities`
  (e.g. +14 days) so "check" becomes actionable without a new object.
- Optional: `automation_jobs.step_id` so a job is attached to its card instead of matched by
  client + role.

**Not required for this screen:** a new communications table, recipient override for `ni_approve`,
reminder-engine changes. (They remain the right basis for an Office-wide «תקשורת» view later.)

---

## L · Product decisions that genuinely remain

1. Does internal office work («העבודה שלי»: alignment, manual tasks) count in the tab badge, or
   only client-facing actions?
2. Which recipients does «שלח בקשות» gather: owner + household persons only, or also external
   parties (prev accountant) when a draft is ready?
3. Should BTL instructions to the insured person go out **automatically** the moment PIVO gets the
   reference (office switch, like automatic email steps), or always through the tray?
4. SHAAM `awaiting_authorities`: manual "check after N days" item, or a scheduled PIVO check job
   (needs the SHAAM window connected)? And N?
5. Retainer: keep it as a gray watch with «הכרטיס הוזן», or trust Paperless's own card-request mail
   and drop the office action entirely?
6. Keep a "picked up" mark («בטיפולי») on manual internal tasks, or no start state anywhere?
7. `kyc_identification` — stays hidden and uncounted, or joins «העבודה שלי»?
8. Expired BTL reference: PIVO re-enters automatically (new job) or the accountant re-triggers?
