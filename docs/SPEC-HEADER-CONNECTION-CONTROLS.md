# SPEC — Header connection controls (שע״ם · ביטוח לאומי)

Status: closed Product/UX spec, ready to implement. No new product decisions are needed.
Scope: only the two controls rendered by `src/components/AuthorityConnectionButtons.tsx`
and the state derived in `src/hooks/useAuthorityConnections.ts`.
Out of scope: the Clients page, the authority-card automation UX, `ShaamReadinessProvider`'s
readiness contract (it stays the single source of truth for "green").

## 1. Principle

- GRAY = not connected right now. Nothing is asked of you. Click to connect.
- ORANGE = PIVO stopped and is waiting for **you**, in a window it opened, **because you clicked**.
- GREEN = confirmed ready for automation (the existing `readiness.ready` value, unchanged).
- There is no fourth color. "Connecting", "worker offline" and "failed" are all gray with a
  different tooltip and a different popover, never a different color.
- Orange is never derived from passive observation. Only from a `needs_human` connect job
  that is younger than 20 minutes.

## 2. State table (per authority, independent)

| State | Dot | Tooltip (title + aria-label) | User meaning | Click |
|---|---|---|---|---|
| idle | gray, filled | שע״ם: `לא מחובר לשע״ם · לחיצה פותחת את חלון ההתחברות` · ב״ל: `לא מחובר לביטוח לאומי · לחיצה פותחת את מערכת ייצוג לקוחות` | Not connected. Nothing to do. | Create connect job → `connecting` |
| idle, worker offline | gray, **hollow ring** (same size, 1.5px stroke) | `מחשב האוטומציה כבוי` | The office machine is off. | No job. Open popover P-OFFLINE. |
| connecting | gray, filled, slow opacity pulse (1.2s; static under `prefers-reduced-motion`) | שע״ם: `מתחבר לשע״ם…` · ב״ל: `מתחבר לביטוח לאומי…` | PIVO is working. Wait. | Ignored (no second job). |
| needs_you | orange, filled | שע״ם: `חלון שע״ם ממתין לך` · ב״ל: `חלון ביטוח לאומי ממתין לך` | Do the auth step in the window PIVO opened. | Open popover P-NEEDS-YOU (does not re-run the job by itself). |
| ready | green, filled | שע״ם: `מחובר לשע״ם` · ב״ל: `מחובר לביטוח לאומי` | Automation can run now. | Open popover P-READY (disconnect is a deliberate second click). |
| failed | gray, filled | same as idle | It didn't work, and the SHAAM window won't fix it. | Create connect job → `connecting` (a click is the retry). |

Only the dot carries state. Button text, size and border do not change between states
(today `is-pending`/`is-on` also recolor the border and label; drop that, keep the dot only).

## 3. Transitions and derivation rules

Implement in `useAuthorityConnections.ts`. Wording below is the rule, not code.

1. `worker offline` (heartbeat stale or no worker row) → `idle, worker offline`. Overrides everything.
2. `readiness.ready` true → `ready`. For ב״ל: `status.btl.connected` true → `ready`. Unchanged.
3. Open connect job in `needs_human`, created ≤ 20 min ago → `needs_you`. Older → ignored for display (it is still cancelled on the next click, as today).
4. Open connect job in `queued`/`running`, created ≤ 45 s ago → `connecting`. Older → `failed` with reason `timeout` (cancel the job).
5. Connect job with status `failed`, and its id equals the job started by a click in this browser tab (`lastStartedJobId` ref), not yet acknowledged → `failed`. Show P-FAILED once. Any other failed job → `idle`.
6. Everything else → `idle`. **This includes "portal alive but GMF/VAT/nikui not ready or not fresh".** Delete the branch that maps `shaamAlive && !ready` to an `awaiting_*` phase. That partial state is explained at the point of use by the card-level automation control, not in the header.
7. `needs_you` → `ready` happens by itself (worker monitor). Close P-NEEDS-YOU when it does.
8. `needs_you` → a different `needs_you` (fallback path: portal done, GMF password asked) → update the popover text in place, stay orange.
9. `ready` → not ready (heartbeat stale, layer measurement aged out, direct negative measurement) → `idle`. Silent. No toast, no text.
10. Click while `worker offline` never creates a job.
11. Re-run from P-NEEDS-YOU ("הבא את החלון לחזית") cancels the stale job and creates a new one **but keeps the dot orange** until the worker reports something else. Do not pass through `connecting` for a re-run.
12. The failed connect job must actually be fetched: the query in `refresh()` currently filters to `queued/running/needs_human`, so the `failed` branch of `message` is dead code and failures are invisible today.

## 4. The popover (one small anchored panel, one component, four contents)

- Anchored under the control, RTL, max-width 36ch, one or two sentences, optional single button.
- Opens automatically once per entry into `needs_you` and `failed`. Never auto-opens for `idle`, `ready`, `connecting`, `worker offline`.
- Closes on: Esc, click outside, the state leaving `needs_you`/`failed`, or its own button.
- Re-openable by clicking the control.
- At most one popover at a time. If both authorities enter `needs_you`, the most recent transition owns the auto-open; the other is reachable by click.
- Header copy is owned by the UI, keyed by the job's `errorCode`. The worker's `needsHuman` prose is not rendered in the header (it stays for logs).

### P-NEEDS-YOU (orange)

Keyed by `errorCode`:

- `awaiting_shaam_auth`: `בחלון שע״ם: בחרו אישור דיגיטלי והזינו PIN. PIVO תמשיך לבד.`
- `awaiting_gmf_auth`: `בחלון שע״ם: הזינו את הסיסמה של מערכת גביית מס הכנסה. PIVO תמשיך לבד.`
- `awaiting_vat_auth`: `בחלון שע״ם: הזינו את הסיסמה של מערכת מע״מ. PIVO תמשיך לבד.`
- `awaiting_nikui_auth`: `בחלון שע״ם: הזינו את הסיסמה של מערכת מגן (ניכויים). PIVO תמשיך לבד.`
- `awaiting_btl_auth`: `בחלון ביטוח לאומי: הזינו קוד משתמש וסיסמה, ואת הקוד שנשלח לנייד. PIVO תמשיך לבד.`

Button (text link style): `הבא את החלון לחזית` → rule 11.

### P-READY (green, on click only)

Line: שע״ם: `מחובר לשע״ם` · ב״ל: `מחובר לביטוח לאומי`
Button: שע״ם: `התנתק משע״ם` · ב״ל: `התנתק מביטוח לאומי` → disconnect job, dot returns to gray.

### P-OFFLINE (gray ring, on click only)

Line: `מחשב האוטומציה כבוי. כשיופעל במחשב המשרד אפשר יהיה להתחבר מכאן.`
No button.

### P-FAILED (gray, auto-opens once)

Line 1: `החיבור לא הצליח.`
Line 2 (optional, from the job's `errorDetail`, first sentence only, max ~90 chars): e.g. `לא נמצאה התקנה של Google Chrome במחשב האוטומציה.`
Timeout variant (rule 4): line 1 = `מחשב האוטומציה לא הגיב.`, no line 2.
Button: `נסה שוב` → same as clicking the control.

## 5. Copy audit — what happens to every existing string

| Today | Decision |
|---|---|
| `.authconn-note` persistent line (any content) | **Delete the element.** Nothing persistent next to the controls, ever. |
| `מחשב האוטומציה אינו פעיל. יש להפעיל את העובד המקומי במחשב המשרד כדי להתחבר לשע״ם.` (persistent, 3 lines in the header) | Delete. Replaced by ring + tooltip `מחשב האוטומציה כבוי` + P-OFFLINE on click. |
| `שלב N מתוך 4 — …` (PHASE_TITLE for awaiting phases) | Delete. Step counters expose internal layers the user does not control. |
| `מכין את החיבור לשע״ם…` / `פותח את חלון ביטוח לאומי…` | Replace with `מתחבר לשע״ם…` / `מתחבר לביטוח לאומי…` (tooltip only). |
| `שע״ם מוכן לאוטומציה · לחצו כדי להתנתק` / `ביטוח לאומי מחובר · לחצו כדי להתנתק` | Replace with `מחובר לשע״ם` / `מחובר לביטוח לאומי`. Disconnect moves into P-READY. |
| `לא מחובר לשע״ם · לחצו כדי לפתוח את חלון ההתחברות` | Keep, reworded: `לא מחובר לשע״ם · לחיצה פותחת את חלון ההתחברות`. |
| `לא מחובר לביטוח לאומי · לחצו כדי לפתוח את מערכת ייצוג לקוחות` | Keep, reworded: `לא מחובר לביטוח לאומי · לחיצה פותחת את מערכת ייצוג לקוחות`. |
| Tooltip = `PHASE_TITLE — message` concatenation | Delete the concatenation. One tooltip string per state. |
| Worker `SHAAM_AUTH_PENDING` `…ואז אמשיך אוטומטית, בלי צורך ללחוץ שוב.` | Not rendered in the header any more (UI owns copy by `errorCode`). Worker string may stay for logs. |
| Worker `GMF/VAT/NIKUI_AUTH_PENDING` `שלב 2 מתוך 3 …` / `האוטומציה לא מזינה סיסמאות.` | Same. (Also inconsistent: "מתוך 3" vs "מתוך 4"; moot once unrendered.) |
| Worker `BTL_AUTH_PENDING` `…ואז הנורית תידלק בירוק לבד, בלי צורך ללחוץ שוב.` | Same. |
| `uiError` text on job-creation failure (`לא הצלחתי ליצור את הפעולה`) | Show via P-FAILED line 2, once. Not persistent. |

## 6. Visual details

- Dot: 7px as today. Ring variant: same box, `border:1.5px solid var(--ink-4)`, transparent fill.
- Colors: gray `var(--ink-4)`, orange `var(--warn)`, green `var(--success)`. No border/label recolor.
- Pulse: `@keyframes` opacity 1 → .35 → 1, 1.2s, ease-in-out, infinite; disabled under `prefers-reduced-motion`.
- The header must not reflow between states: the control's width is constant, the popover overlays.

## 7. Acceptance checks (browser)

1. Open PIVO with worker offline → both controls gray ring, no text anywhere in the header. Hover shows `מחשב האוטומציה כבוי`. Click opens P-OFFLINE, no job row is created.
2. Open PIVO with worker online and no session → gray, no text. Nothing turns orange without a click.
3. Seed a `needs_human` connect job dated 2 hours ago → control stays gray.
4. Click שע״ם → gray pulse; when the worker reports `needs_human` → orange, P-NEEDS-YOU opens with the `awaiting_shaam_auth` line.
5. Simulate readiness true → green, popover closes by itself, no click needed.
6. Simulate heartbeat stale → gray, no text, no toast.
7. Simulate worker `failed` (`chrome_not_found`) on the job started by the click → gray, P-FAILED opens once with the detail; dismiss; header is clean; click again retries.
8. Click green → P-READY; `התנתק` → gray.
9. Both authorities orange → exactly one popover open.
