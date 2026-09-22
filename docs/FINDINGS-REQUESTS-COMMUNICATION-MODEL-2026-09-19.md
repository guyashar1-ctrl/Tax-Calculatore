# Findings — Requests, Client Requirements, Outbound Communication, Office Management (2026-09-19)

Discovery only. Nothing was changed in production, no migration, no email sent.
Grounded in: production DB (read-only queries), production UI (Guy's own card, 19.09.2026),
and the code on `master` (migrations up to 191).

The production example used throughout: **Guy's card → «בקשות» → «ייצוג בביטוח לאומי — דין וולוצקי ישר»**.
PIVO holds reference `75071159` (deadline 15.11.2026), no instructions sent, the card is blue,
collapsed, and reads «בטיפול · הכדור אצלי · 2 ימים». Today at 07:29 a `btl.check_representation`
job for Din landed in `needs_human` (BTL window closed). Parallel example: יאיר סלע — same shape,
reference `75074203` created by the worker on 16.09.

---

## 1 · Current system — what is actually happening

**The Requests page is a list of `onboarding_steps`.** Every row on «בקשות» is one step row.
There is no other request object. A step has `status` (locked / pending / in_progress /
waiting_client / completed / verified / skipped / blocked / failed / cancelled), `ball`
(me / client / authority / prev_accountant / external / system), `needs_attention`, `due_date`,
`published_at`, `payload` (jsonb).

**Two request types are mirrors, not sources.**
- `representation` mirrors `representation_requests.status` through the trigger
  `sync_representation_step` (168): `awaiting_authorities → in_progress / ball=authority`;
  only `active → completed`. `active` is written by one manual click — «סמן כמיוצג פעיל» in
  step 7 of the execution center — after SHAAM approval. BTL has no influence on it.
- `authority_representation` (per person, 157) mirrors `representation_requests.execution.<track>`
  through `sync_authority_representation_steps`: reference and no instructions → `in_progress /
  ball=me`; instructions sent → `waiting_client / ball=client`; deadline passed → `blocked /
  ball=me / needs_attention`; `confirmedAt` (or tax file `repStatus='active'`) → `completed`.

**Automation is a separate table.** `automation_jobs` (btl.create_representation,
btl.check_representation, shaam.*) run in the local worker; on `succeeded` the trigger
`sync_btl_representation_from_job` (187/190) writes `enteredAt / referenceNumber / deadline /
confirmedAt` into `execution.<track>`, which then moves the step. While a job is queued/running or
in `needs_human`, **the step does not change** — it stays `ball=me`. The only place a running or
stuck job is visible is the pink button's error line in the tax file / execution center. `ball='system'`
exists in the type but is never written by any migration.

**What the row colors are.** `flowItem()` in `OnboardingTab.tsx` gives the timeline dot exactly
three classes: `is-active` when `stepAwaitsMe(step)` (= `ball==='me' && open && status!=='locked'`),
`is-danger` when blocked/failed/needs_attention, `is-done` for milestones. Everything else — open
but the ball is with the client, the authority, the previous accountant, or locked — is the default
gray dot. Gray means "open, someone else's move", not "inactive".

**Three different counters, three definitions.**
- Tab badge «בקשות 6» = `stepAwaitsMe` over *all* of the client's steps — including the four steps
  the page deliberately hides (`kyc_identification` and the three `institution_alignment_*`, which
  are shown as one «יישור קו» card without a dot). Visible blue dots on the page: 2.
- «הפעולה הבאה: 9 בקשות פתוחות» = `isStepOpen` (status not in completed/verified/skipped/cancelled),
  regardless of ball, including hidden steps.
- Client directory «X מתוך Y הושלמו» and the tasks-desk buckets use `isStepOpen` again.
- The header badge «משימות 4» is the separate `tasks` table (office tasks), unrelated to steps.

**The BTL "send instructions" flow.** Three entry points, one dialog:
1. «בקשות» → `AuthorityRepresentationStepCard` → the card is **collapsed by default**; the status
   sentence «האסמכתא התקבלה (75071159) — נדרש לשלוח הוראות אישור.» and the button «שלח הוראות אישור»
   only appear after clicking the title.
2. «תיק מס» → NI card per person. Since 16.09 (`niRepresentationAction`) the cell offers
   «בדוק קבלת הייצוג» once a reference exists — it no longer offers "send".
3. Execution center: if the reference exists *before* the signature email goes out, the instructions
   ride inside the signature email (`instructionsSentWith='signature'`); there is no standalone send there.

The click opens `NiInstructionsDialog` — step 1: confirm/edit the subject's canonical address
(writes `clients.spouse_email` / `clients.email`); step 2 («המשך»): `EmailPreviewDialog`, which asks
`send-onboarding-email` with `preview:true, stage:'ni_approve', niRole` and renders the real HTML
(verified in production: subject «נשאר צעד אחד בביטוח הלאומי, דין», to `din@example.com`, reference,
deadline, site link, phone). Buttons: «שלח ללקוח» / «ביטול» / «פתיחה בכרטיסייה חדשה».

**After «שלח ללקוח».** `record_email_sent` (170) writes, in one transaction: an `email_messages`
row (kind `ni_approve`, `step_id`, `meta.niRole`, html, idempotency key `ni_approve:<request>:<role>`)
and `execution.<track>.instructionsSentAt / instructionsSentWith='standalone'`. The trigger then moves
the step to `waiting_client / ball=client` (gray). The personal page item switches from «האסמכתא
התקבלה — נשלח הוראות אישור בקרוב» (bucket `office`) to a `message` item with the reference and the BTL
link — on **Guy's** page, since Din has no page. Completion comes only from `confirmedAt`: a manual
«בדוק קבלת הייצוג» (btl.check_representation) or manual entry. Nothing schedules the check. No
accountant notification exists for "client approved" (`accountant_notifications` kinds:
quotation_approved, onboarding_submitted, poa_signed only). Reminders (`representation-reminders`,
186) are per audience `sign / niClient / niSpouse / portal`, office-switch off by default, system
copy, counters kept inside `execution.reminders.<audience>` — in production every request has
`reminders: null`, i.e. no reminder has ever fired.

**Recipient.** For `ni_approve` the server forces the recipient to be the subject
(`effectiveRecipientRole = niRole`); the address is the card's canonical field. The only place where
a recipient can differ from the subject is the prerequisites link (`request_participant_links.recipient_role`,
167). Everything owner-facing goes to `clients.email` through the personal page. External parties
(`payload.externalParty.contact`, prev accountant) and signers (`signers[].email`) are separate lanes.

**Bundling.** The owner's personal page *is* the bundle: `send-process-open-email` lists all portal
items from `get_client_portal` in one mail. There is no bundling for a subject-person (Din): each
`ni_approve` is its own email; a prerequisites link to Din is another email; nothing groups by recipient.

**Office Management («ניהול המשרד»).** Sections: identity/branding/design/contact/signature/channels,
«התראות למשרד», «תהליכים» (M2 catalog explanations), «פייפרלס ותקשורת», «ייצוג» (reminder cadence +
template overrides), «חיבור לשע״ם», «בקשות מסמכים», «מסמכים ללקוחות», «פעילות מייל», «הצעות מחיר»,
«עובדים». «פעילות מייל» (`EmailActivityModule`) is a flat table over `email_messages`: to-address,
subject, Resend delivery status, sent time, «צפייה». No client name, no originating request, no
draft/ready/awaiting, no follow-up due, no action. Production shows 147 rows (145 delivered, 17 opened,
2 failed).

---

## 2 · Why Guy is experiencing the confusion

1. **"Open" has two meanings and the page uses both.** The counters say 9 (any unfinished step),
   the badge says 6 (my move, including hidden steps), the eye sees 2 blue + 3 gray + 1 green.
   Nothing on the page states which number means "needs me now".
2. **Gray is "someone else's move", but it is counted as open** — so a card that asks nothing of
   Guy still inflates «9 בקשות פתוחות» and «נותרו N שלבים פתוחים», and the client directory's
   «מתוך». Business-process-unfinished and accountant-attention are the same axis today.
3. **A process that waits on an authority looks like an open request.** `awaiting_authorities` is
   `in_progress` for weeks (שמעון לזימי since 27.08) and can only close by a manual click that
   nobody is prompted to make; the same for BTL `confirmedAt`, which needs a manual check job.
4. **The BTL row is blue because the system thinks Guy owes a decision — but it hides the decision.**
   The collapsed row says «בטיפול · הכדור אצלי · 2 ימים»; the actual ask («send instructions to
   Din, here is what will go out») is behind a click, then a dialog, then another click. The row
   speaks in process state, not in "what happened / who must act / what will they receive".
5. **The same requirement is described three ways on three surfaces**: «בקשות» offers *send*, «תיק מס»
   offers *check*, the personal page says *will send soon*. Each is derived from the same
   `execution.<track>` but with a different rule.
6. **PIVO's own work is invisible in the request model.** A running or stuck job (today: Din's
   check is `needs_human`) leaves the card unchanged; the page cannot say "PIVO is doing X" or
   "PIVO is stuck on Y".
7. **Communication has no object.** "Was it sent, to whom, what, is a follow-up due" is scattered
   across `execution.<track>.instructionsSentAt`, `email_messages`, `participant_links.sent_at`,
   `quotations.representation_sent_at`, `steps.payload.autoExecutedAt`, `execution.reminders.*`,
   `steps.payload.reminder`. The Office can only see the after-the-fact log.

---

## 3 · Current domain map (what exists today)

| Object | Table / field | Role today | Lifecycle |
|---|---|---|---|
| Business process (representation) | `representation_requests.status` | source of truth for the representation journey | pending_fill → awaiting_accountant → pending_signature → awaiting_stamp → awaiting_authorities → active (manual) |
| Per-authority per-person execution | `representation_requests.execution.<track>` (NiTracking) | facts: entered / reference / deadline / instructionsSent / confirmed | timestamps, written by trigger (jobs) or UI |
| Request / requirement | `onboarding_steps` | the only thing the Requests page shows; owner = card, subject = `payload.subjectRole` | status × ball × needs_attention; `representation` and `authority_representation` are derived mirrors |
| Automation job | `automation_jobs` | worker work item | queued → running → succeeded / failed / needs_human / cancelled; not reflected on steps |
| Communication log | `email_messages` | after-the-fact record + Resend delivery status; `step_id`, `request_id`, `kind`, `meta` | sent / delivered / opened / bounced / failed — no draft, no awaiting, no follow-up |
| Routed ask (prerequisites only) | `request_participant_links` | link to a role, `recipient_role` may differ from subject, `sent_at/opened_at/submitted_at/expires_at` | best precedent for a routed outbound requirement |
| Internal outbound queue | `accountant_notifications` | mails to the accountant (3 kinds) | pending → sent / suppressed, attempts |
| Reminder state | `execution.reminders.<audience>`, `steps.payload.reminder` | counters for the cron | claim/release CAS |
| Office task | `tasks` | manual/system office work | open/done × ball_with (me / client / authority / stuck) |
| Personal page | `get_client_portal()` (derived) | the owner's bundle of everything client-facing | published_at / draft_payload / pending_cancel |

Relationships: client 1—1 representation_request; request 1—n steps (`payload.representationRequestId`);
step 1—n email_messages (`step_id`); client 1—n automation_jobs (`client_id`, `input.role`) — jobs are
**not** linked to a step; participant_link n—1 step.

---

## 4 · Communication flow today (BTL example)

```
worker: btl.create_representation succeeded
  → trigger 187/190 writes execution.nationalInsuranceSpouse{enteredAt, referenceNumber, deadline}
  → trigger 157 sets step authority_representation = in_progress / ball=me   (blue, collapsed)
  → portal item (owner's page, bucket office): «האסמכתא התקבלה — נשלח הוראות אישור בקרוב»
Guy: opens the card → «שלח הוראות אישור» → NiInstructionsDialog (address) → «המשך» → EmailPreviewDialog
  → «שלח ללקוח» → send-onboarding-email(stage ni_approve, niRole=spouse)
  → recipient = subject (spouse_email), no override, no bundling
  → Resend 200 → record_email_sent: email_messages(kind ni_approve, step_id) + execution.instructionsSentAt
  → trigger 157 sets step = waiting_client / ball=client   (gray, still "open")
  → portal item becomes `message` with reference + BTL link (still on Guy's page)
cron (if switched on in Office → «ייצוג»): representation-reminders niSpouse, system copy, afterDays × maxReminders
Guy: «בדוק קבלת הייצוג» (manual) → btl.check_representation → result approved → confirmedAt
  → step completed → «בקשות שהושלמו» ; handleSaveExecution flips the card's NI registry to active
```

Deadline passes without confirmation → step `blocked / ball=me / needs_attention` (red) «האסמכתא פגה».

---

## 5 · Answers to the 18 questions

1. **Why still open** — `representation`: it mirrors `representation_requests.status`, and
   `awaiting_authorities` maps to `in_progress` (gray, ball=authority). `authority_representation`:
   after PIVO's POA it is `in_progress / ball=me` — the system's position is that Guy still owes an
   action (send instructions), so it is blue and counted; after sending it becomes `waiting_client`
   (gray) and stays "open" until BTL approval is *observed*.
2. **Exact completion condition** — `representation`: `representation_requests.status='active'`
   (manual «סמן כמיוצג פעיל», step 7). `authority_representation`: `execution.<track>.confirmedAt`
   set (btl.check_representation result `approved`, or manual) OR the person's NI tax file
   `repStatus='active'`. Skip/block are disabled for both types (menu).
3. **Gray today** — open step (`isStepOpen`) that is not `stepAwaitsMe`: ball ∈ {client, authority,
   prev_accountant, external, system} or `locked`. "Someone else's move".
4. **Why gray is counted** — every "open" counter uses `isStepOpen(status)` only; ball is ignored.
   The badge is the exception (`stepAwaitsMe`) but counts hidden steps.
5. **Blue today** — `ball==='me' && open && !locked`. For mirrored types the ball is written by the
   sync trigger from `execution` facts.
6. **Decoration or semantics** — semantics, but lossy: (status, ball, needs_attention, job state,
   sent state) collapse into gray / blue / red / green; "PIVO working", "waiting for authority",
   "waiting for client", "sent, awaiting completion" all render identically (gray).
7. **Where the send flow lives** — `OnboardingTab.tsx` `AuthorityRepresentationStepCard` (button
   inside the collapsed body) and `TaxFileTab.tsx` (flag path), both via `NiInstructionsDialog.tsx`;
   the execution center only piggybacks on the signature email.
8. **Where the preview is** — `EmailActivity/EmailPreviewDialog.tsx`, server-rendered by
   `send-onboarding-email` with `preview:true`. Same component gates every client email in PIVO.
9. **Why not obvious** — collapsed card; row text is a status sentence not an ask; the button says
   "send" (implies immediate), the preview is the third screen; nothing on the page or in the Office
   says "there is a message waiting for your review to Din"; the tax file offers a different action.
10. **After send** — see §4: log row + `instructionsSentAt`, step → waiting_client (gray), portal
    message item, optional cron reminders, completion only via manual check or manual entry, no
    accountant notification on approval, red on deadline.
11. **Where recipient selection is stored** — it isn't a stored choice. `ni_approve`: recipient is
    always the subject, address = canonical card field. Prerequisites links store `recipient_role`.
    External: `payload.externalParty.contact`. Signers: `signers[].email`. Owner: `clients.email`.
12. **Din vs Guy routing** — only by type: BTL approval for Din always goes to Din; everything else
    always goes to the owner's page. No override, no per-requirement recipient.
13. **Bundling for the same recipient** — owner: yes, implicitly (the page email). Subject (Din):
    no — every requirement is its own email; two spouse requirements = two emails.
14. **Visible from Office Management** — «פעילות מייל»: sent log with delivery status and body;
    reminder cadence settings under «ייצוג»; process explanations under «תהליכים». Nothing about
    drafts, pending sends, what is awaiting whom, or follow-ups.
15. **Existing generic object** — `email_messages` is the closest (client_id, request_id, step_id,
    kind, to_email, delivery status, idempotency, meta, html) but it is append-only after send.
    `request_participant_links` is the best *shape* for a routed ask (role, sent, opened, submitted,
    expiry). Neither is a lifecycle object that exists *before* sending.
16. **What must change** — one outbound-communication object with one lifecycle (draft → ready →
    sent → awaiting → done/expired/cancelled), recipient as a *role* resolved server-side, included
    requirements, origin (client/step/request), preview key, follow-up policy; every sender creates
    or resolves it instead of only logging afterwards; the Office reads that object; the Requests
    page references the same rows (see §7).
17. **State mapping today** —
    - needs accountant: step `ball=me` & open & !locked; blocked/failed/needs_attention; job
      `needs_human`/`failed` (visible only in the button); request `awaiting_accountant`/`awaiting_stamp`;
      task `ball_with` me/stuck.
    - PIVO working: `automation_jobs` queued/running — **not represented on any step**.
    - waiting for client: step `waiting_client`/ball=client; request `pending_fill`/`pending_signature`;
      participant link sent & not submitted; `rep_client_approval` pending.
    - waiting for authority: `representation` in_progress & ball=authority (SHAAM). For BTL there is
      no such state — "waiting for BTL" is modeled as waiting-for-client.
    - completed: step completed/verified/skipped; request `active`; `confirmedAt`; email delivered.
18. **Explicit or inferred** — almost all inferred, at several layers: ball by trigger from facts,
    color from (status, ball), "open" from a status set, "sent" from a timestamp or a log row,
    "PIVO working" from a different table, counters re-derived per screen with different rules.
    Only `needs_attention`, `status` and `ball` are stored — and two of them are themselves derived
    for the two types in question.

---

## 6 · Exactly three directions

### Direction A — "Attention state on top of the existing steps" (derive, don't restructure)

Keep `onboarding_steps` as the only request object. Add one **server-derived attention state**
per step — `mine · pivo · client · authority · external · blocked · done` — computed from
(status, ball, needs_attention, latest `automation_jobs` for that client/role, `execution` facts,
`email_messages` presence). Everything that counts or colors reads only that.

- **A. Requests page** — three flat groups: «דורש אותי» (mine/blocked), «PIVO עובד» (pivo), «ממתינים»
  (client/authority/external, each row saying to whom and since when), «עבר» (done). The counter and
  the badge count `mine + blocked` only, and only rendered cards. Gray disappears as a meaning: the
  dot color = attention state (blue mine, pink pivo, gray waiting, red blocked, green done).
- **B. Client requirements** — remain steps. Created as today (generator, triggers, «＋ בקשה»).
  Grouped by attention state, not by kind. Link to origin via `payload.representationRequestId`.
- **C. Recipient routing** — generalize 167: `payload.recipientRole` on the step (default = subject),
  editable from the card's ⋯ menu; senders read it. No bundling beyond the owner's page.
- **D. Outbound communication** — unchanged mechanics (per-step dialog + `EmailPreviewDialog`),
  but every card gets a one-line **communication summary** derived from `email_messages`/timestamps:
  «טרם נשלח · מוכן לשליחה ל-דין» / «נשלח 3.9 ל-דין · נפתח» / «תזכורת בעוד 4 ימים». The BTL card's
  primary action becomes «לבדוק ולשלוח ל-דין» and opens the preview directly (address inline).
- **E. Office Management** — new «תקשורת» section: a query over steps × email_messages × jobs,
  cross-client, columns: client, requirement, recipient, state (ready / sent / awaiting / follow-up due),
  last send, link to the card. Read-mostly; "send" still happens on the card.
- **F. Follow-up** — reminders stay in `representation-reminders` + step reminders; the Office view
  shows "next reminder" computed from the same jsonb counters. Completion as today.
- **G. Impact** — UI + one SQL function/view for attention state + small payload key. No new table,
  no backfill. Email functions: read `recipientRole`. Reminders: unchanged. Office: one new read view.

Weakness: communication still has no identity — "ready but not sent" is inferred from the absence
of a log row; no bundling per recipient; the Office view is a projection of half a dozen jsonb
timestamps and will drift as new kinds appear.

### Direction B — "Outbound communication is a first-class object"

Keep steps as the requirement. Add **one table `outbound_communications`** — the single lifecycle
for anything PIVO sends to a person: `{client_id, origin (request_id, step_ids[]), kind/template,
recipient_role (client|spouse|external|signer|prev_accountant), recipient_snapshot (resolved at send),
channel, status: draft|ready|sent|awaiting|completed|expired|cancelled, overrides (subject/body),
sent_at, next_follow_up_at, follow_up_count, follow_up_policy, completed_at, completion_rule}`.
`email_messages` gets `communication_id` (history rows of the same object). Automation gets the
attention state from Direction A (needed regardless).

- **A. Requests page** — same grouping as A (mine / PIVO / waiting / done), plus a **«מוכן לשליחה»
  tray** at the top of the page: communications in `ready`, grouped by recipient («לדין · 1 · אישור
  ייפוי כוח בביטוח לאומי», «לגיא · הדף האישי · 3 בקשות»). A requirement whose communication is
  `ready` is *not* blue by itself; the tray is the blue thing. A requirement whose communication is
  `awaiting` is gray with «נשלח ל-דין 16.9 · ממתינים לאישור בב״ל».
- **B. Client requirements** — steps, created as today. Each requirement that needs someone to act
  gets (or joins) a communication when its trigger fires: for BTL, the 187 trigger creates a `ready`
  communication of kind `ni_approve` to role `spouse` with `step_ids=[step]` — instead of setting
  `ball=me`. The owner's page is one communication of kind `portal_page` with many step_ids.
- **C. Recipient routing** — `recipient_role` lives on the communication, defaulting from the
  requirement's subject (Din) or owner; changing it re-resolves the address server-side from the card.
  Override = edit the recipient of the ready communication (one control, in the tray or the card).
- **D. Outbound communication** — one composer: pick a ready communication → preview (server-rendered,
  `EmailPreviewDialog` as today) → «שלח». Bundling = a communication with several step_ids to one
  recipient; the tray offers «אחד לכל אחד / מייל אחד» when two ready communications share a recipient
  and kind-compatibility. On send: `record_email_sent` links the log row, moves the communication to
  `awaiting`, stamps the facts it stamps today (`instructionsSentAt`, `participant_links.sent_at`).
- **E. Office Management** — «תקשורת» = the table itself, cross-client: client · origin · requirement(s)
  · recipient · state · sent · next follow-up · «פתח בכרטיס». Same rows as the card; the same «שלח»/
  «שלח תזכורת»/«בטל» actions, because they act on the same object. No duplicate state by construction.
- **F. Follow-up** — `next_follow_up_at` is set from the office policy at send time; the cron
  (`representation-reminders` generalized) reads communications where `status=awaiting` and
  `next_follow_up_at <= now()` — one engine, no per-audience jsonb counters. Completion: the
  requirement's completion rule (confirmedAt, submitted_at, declaredAt…) completes the communication;
  expiry (deadline) moves it to `expired` and the requirement to `blocked`.
- **G. Impact** — schema (new table + `email_messages.communication_id`), migration + backfill
  (existing `email_messages` → completed communications by kind/step; existing `instructionsSentAt`
  without confirmedAt → `awaiting`; Din's current state → `ready`), state machine (sync triggers write
  a communication instead of `ball=me`; attention state function), email functions (every sender
  creates/resolves the object before Resend), reminders (one generic engine), Office (new section),
  UI (tray, card summary, office view).

### Direction C — "The requirement carries its own communication lane"

No new table. Extend `onboarding_steps` with explicit columns: `attention_state`, `recipient_role`,
`comm_status` (none / ready / sent / acknowledged), `last_sent_at`, `next_follow_up_at`. Bundling is
a "send batch" action: one email per recipient containing all `ready` steps for that recipient
(the page email pattern), stamping each step.

- **A. Requests page** — groups by `attention_state`; a step with `comm_status=ready` is a blue row
  with «מוכן לשליחה ל-דין»; sent steps are gray with the sent line. Counter = `mine`.
- **B. Client requirements** — steps; BTL trigger sets `comm_status=ready, recipient_role=spouse`.
- **C. Routing** — `recipient_role` column, editable per step.
- **D. Communication** — «שלח» on a step or «שלח הכול ל-דין» on the group; preview per recipient
  (the server composes one mail from N steps); on send `comm_status=sent` on each step + log rows.
- **E. Office** — «תקשורת» = steps where `comm_status in (ready, sent)` across clients, with
  follow-up columns; actions call the same step RPCs.
- **F. Follow-up** — `next_follow_up_at` per step; cron sends per step (or per recipient batch).
- **G. Impact** — migration adding columns + backfill from `execution` timestamps and
  `email_messages`; triggers rewritten; senders write to steps; reminders re-pointed; Office UI.

Weakness: it is exactly the collapse §9 of the foundation forbids — a message becomes N step stamps,
"what was sent to whom, in one mail" has no row, the page email cannot be represented honestly, and
every future communication that is not 1:1 with a requirement (release letter follow-up, documents
sent, status update) has to invent a pseudo-step.

---

## 7 · Recommended direction: **B**, staged (A's attention state first)

- **Clear mental model** — three nouns that map to Guy's questions: *requirement* (what the person
  must do), *communication* (what we sent / will send, to whom, what), *job* (what PIVO is doing).
  The Requests page answers "what needs me" with one number; the tray answers "what is ready to go
  out"; the Office answers "what is out there and waiting".
- **Low cognitive load** — a ready message is one object with one «שלח», not a decision hidden in
  a collapsed card; a sent message is a line, not a color.
- **Scales to many workflows** — documents sent, signature requests, questionnaires, release letter,
  status updates, future contact requests all become rows of the same table with a `kind`; the Office
  view never needs a new column per workflow.
- **Automation/human separation** — jobs never set `ball=me`; they produce facts and, when a person
  must act, a *ready communication*. "PIVO working" is a state of its own.
- **No duplicate state** — the card and the Office render the same row; `email_messages` remains the
  immutable history under it.
- **Aggregation later** — jobs and communications both hang off the client and the step, so a future
  "PIVO did 4 things, 2 messages are out" summary is a group-by.

Why not A: it fixes the counters and the colors (worth doing first) but leaves communication as an
inference; Guy's principle — every outbound communication manageable from the Office — cannot be met
by a projection that has no "before sending" state. Why not C: it welds the message to the
requirement; it is cheaper than B but reintroduces the confusion the foundation already outlawed
(a step is a requirement, a step is not a mail).

Staging: (1) attention state + counters + card communication summary (A's UI, no schema);
(2) `outbound_communications` for the three lanes that already exist as scattered timestamps —
`ni_approve`, prerequisites links, personal-page email — with backfill; (3) migrate reminders and the
remaining senders (release, documents, quotation, step emails); (4) Office «תקשורת» replaces «פעילות מייל».

---

## 8 · Engineering impact of the recommendation

| Area | Required | Notes |
|---|---|---|
| UI | yes | Requests page regrouping by attention state; tray «מוכן לשליחה»; card communication line; Office «תקשורת»; single composer reusing `EmailPreviewDialog` |
| State machine | yes | server function for attention state; `sync_authority_representation_steps` writes `ball=client` + a ready communication instead of `ball=me`; job states surface as `pivo`; expiry rule |
| Schema / data model | yes | new `outbound_communications`; `email_messages.communication_id`; optional `automation_jobs.step_id` to link jobs to requirements |
| Migrations / backfill | yes | backfill communications from `email_messages` (kind+step), from `execution.<track>` timestamps, from `request_participant_links`; in-flight Din/Yair rows become `ready` |
| Email | yes | every sender creates/resolves a communication before Resend and links the log row; recipient still resolved server-side from the card by role; `ni_approve` gains `recipient_role` |
| Reminders | yes | `representation-reminders` generalized over `next_follow_up_at`; per-audience jsonb counters retired after backfill; system copy kept |
| Office Management | yes | new section over the table with actions; «פעילות מייל» becomes its history tab |

Stage 1 alone: UI + one server function, no migration.

---

## 9 · Product decisions still required

1. **Default recipient for a requirement whose subject is not the owner** (Din's BTL approval):
   subject (today) or owner? And is the default per kind, per office, or per client?
2. **Is a PIVO-prepared, not-yet-sent message "needs my attention"?** i.e. does the tray count in
   the blue badge, or is «מוכן לשליחה» its own number?
3. **Auto-send policy per kind** — may the office switch `ni_approve` (and similar) to send
   automatically when the reference arrives, as auto-email steps already do, or does every new kind
   keep the manual preview gate (EMAIL-POLICY)?
4. **Bundling rules** — may a subject-person's BTL instructions be merged into the owner's page
   email when the recipient is the owner? May two different kinds to the same recipient be one mail?
5. **"Waiting for authority" and the open counter** — should `awaiting_authorities` (SHAAM) and
   "sent, awaiting BTL confirmation" appear outside the open counter entirely, and should PIVO
   run the check job on a schedule (which requires the BTL/SHAAM window to be connected)?
6. **Office «תקשורת» scope** — an operational inbox with send/remind/cancel actions across clients,
   or monitoring with links back to the card?
7. **Accountant notification on client completion** (BTL approved, prerequisites submitted) — wanted
   by mail, in-app, or not at all?
8. **Reminder copy** — stays system-owned (today) or editable per office like the portal card text?
