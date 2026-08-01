# PIVO · Implementation Specification v1.0

**Purpose:** This is the complete, self-contained specification for implementing the PIVO redesign. The implementer (Claude Opus 5) is assumed to have **no prior context** — everything needed is in this document. Where this spec conflicts with the design mockups in the Claude Design project, **this spec wins** (it resolves the mockups' inconsistencies deliberately; see §1 Decision Log).

**Companion document:** `PIVO-UX-REVIEW.md` (the rationale behind every decision here). Read it if you want the "why"; you do not need it to implement.

---

## 0. Context, constraints, and rules of engagement

### 0.1 What PIVO is
A CRM + tax toolset for a solo Israeli accountant (Guy). Areas: tasks (משימות), clients (לקוחות), quotes & leads (הצעות ולידים), client cards with four tabs (מרכז שליטה / התיק / מסמכים / משימות), an annual-report flow (דוח 1301), and a professional knowledge area (ידע מס) with 8 tools backed by a single tax-data source (מסד נתוני מס).

### 0.2 Tech reality
- React + Vite + TypeScript (`strict: true`). All state in localStorage (`crm_clients`, `crm_tasks`, `crm_representation_requests`) and IndexedDB (files). No server.
- Key files: `src/App.tsx` (routing/state), `src/types/index.ts` (types + Hebrew labels), `src/components/*` (one component per screen), `src/index.css` (global styles; dark-mode groundwork exists), `src/utils/taskUtils.ts` (task grouping), `src/utils/geminiVision.ts` (OCR).
- `package.json` is missing from the working tree (known issue). **Restore it from git HEAD before anything else.**

### 0.3 Hard rules (non-negotiable)
1. **All UI text Hebrew, RTL.** Use logical CSS properties (`margin-inline-*`, `padding-inline-*`, `text-align: start/end`). Embedded Latin content (filenames, emails) gets `direction: ltr` in an isolated span.
2. **No new npm dependencies** without asking the owner first.
3. **Never delete or reinitialize user data.** If localStorage holds more than the sample data (7 clients / 15 tasks), it is real work data.
4. **PIVO is the tool's brand; the accountant's office name is the identity on every client-facing surface** (quote pages, emails, representation forms, login screen footer).
5. **Emails are never sent as a side effect.** Any flow that produces an email shows a visible, editable composer and sends only on explicit user action.
6. Do not edit `SPEC.md`, the PDF templates in `חומרים/`, or `.claude/settings.local.json`.
7. **QA in a real browser before reporting any screen done** (see §9 acceptance criteria). "It compiles" is not "it works".
8. Prototype artifacts must never ship: demo-only tooltips ("בפרוטוטייפ מודגם כרטיס אחד"), locked demo rows, footer instruction lines, DEV login buttons, auto-login debug text.

### 0.4 Defaults convention
Sections 5 (states), 6 (accessibility), 7 (responsive) define **global defaults that apply to every screen**. Screen specs in §4 list only what is *specific* to that screen. If a screen spec is silent on loading/error/empty/responsive/a11y — apply the defaults exactly.

---

## 1. Decision log — resolved ambiguities

Every item below was ambiguous or contradictory in the mockups. These are final decisions; do not re-litigate during implementation.

| # | Question | Decision |
|---|----------|----------|
| D1 | Two "selected" styles exist (gray chip vs. black pill). Which where? | **Gray chip = changes what you see** (filters, view toggles, sidebar nav, year selector). **Black pill = changes what you save or the computed answer** (task ball selector, 1301 answers, calculator inputs incl. the NI insured-type selector). Never mixed. |
| D2 | Red means "overdue" on one screen, "upcoming" on another. | **Red = overdue, blocking, or required-and-missing. Nothing else.** Due within 7 days = semibold ink-1, not red. Everything later = ink-2/ink-3. |
| D3 | Three red hexes (`#d70015`, `#8b1a1a`, dark ambers) in use. | One `--danger` token (§2). `#8b1a1a` retired. |
| D4 | Ball-state colors: הלקוח and תקועה shared one color; רשויות was purple. | **אצלי = ink-3 · הלקוח = warn · רשויות = warn · תקועה = stuck (purple).** Stuck is the only ball state with a unique hue. |
| D5 | Urgency dot vs. red date — two encodings of one axis. | **Dot deleted.** The date column alone encodes lateness (D2). No manual "urgent" flag in v1. |
| D6 | Tasks group names and whether הושלמו is expanded. | Groups: **לטיפול מיידי** (overdue + due ≤7 days) · **תקועות** (ball=תקועה, any date) · **בהמשך** (everything else open) · **הושלמו** (collapsed by default). This replaces the mockup's לטיפול מיידי/בתהליך/הושלמו — stuck tasks must never hide inside a healthy group. |
| D7 | Vocabulary drift (אצלי/אני, תקוע/תקועה, דד-ליין). | Canonical: **אצלי · הלקוח · רשויות · תקועה**; **תאריך יעד** (not דד-ליין); group states **הושלם / חלקי / חסר / לא נדרש**. Define once in `types/index.ts` labels; no screen hardcodes variants. |
| D8 | Date formats (`26.04.26`, `26.04.2026`, `22/04/25`). | **dd.mm.yy in lists and tables; dd.mm.yyyy in forms and detail views.** One shared formatter. Always `tabular-nums`. |
| D9 | Knowledge navigation: shell header chips vs. in-screen sidebar. | **Sidebar only.** The app shell contributes no knowledge-tool navigation. |
| D10 | Year selector appeared per-screen (tax DB) and hardcoded elsewhere. | **One year selector for the whole knowledge area**, in the knowledge sidebar header. All 8 tools read it. The 1301 flow's year comes from the report itself, never from this selector. |
| D11 | 1301: header "שמור והמשך" vs. footer "הבא · X" both advance. | **Footer button is the single primary advance** ("הבא · {group}", blue; last group: "סיום ובדיקה"). Answers autosave individually; header shows quiet "נשמר ✓" + "יציאה". |
| D12 | התיק: global header "שמור" vs. group-at-a-time editing. | **Group-scoped save.** Fields are always editable; editing marks the group dirty; the group footer swaps "הבא · X" for "שמור / ביטול". No global save button. |
| D13 | Client header buttons "התחל דוח שנתי" + "שאלון" (ambiguous pair). | "שאלון" **removed**. One stateful CTA: "התחל דוח שנתי" → when a report exists: "המשך דוח {year} · {done}/{total}". Second button: "+ משימה". |
| D14 | Quotes empty state has two blue CTAs (header + body). | In empty state the header shows the title only; the body CTA is the only primary. Header "+ הצעה חדשה" appears only when ≥1 quote exists. |
| D15 | Verification status ("אומת 07.2026") shown in 3 places. | Shown **only** in the knowledge sidebar footer. |
| D16 | NI calculator: 'לא עובד' note promises a minimum payment; math returns 0. | Implement the minimum-payment floor. The minimum value is a row in מסד נתוני מס (add it there); the breakdown shows "מינימום דמי ביטוח" when the floor applies. Value must be verified by the owner before release — mark the row "טרם אומת" until he confirms. |
| D17 | Progress bars: equal segments (התיק) vs. weighted (1301). | **Weighted by required-field count** everywhere. Groups marked "לא נדרש" are excluded from the bar and the totals. |
| D18 | Is ידע מס a private reference or a client-facing product? | **Private reference** (owner's standing assumption). If this ever changes, the knowledge area becomes a separate product — out of scope. |
| D19 | Mobile support level. | Desktop-first. Graceful ≥768px behavior per §7. Phone-width (<768) gets a read-only tasks view only, and only in Phase 5. |
| D20 | Icons: font glyphs (✕ ▾ ⋮⋮ ☾) render inconsistently. | Small inline-SVG set (§3.16), `currentColor`, no icon library. |
| D21 | `#86868b` fails WCAG AA at 12px. | `--ink-4` allowed only at ≥13.5px or for purely decorative text. Readable metadata at 12–13px uses `--ink-3`. |
| D22 | Where does the "3 באיחור" red count on a client row lead? | Clicking it opens the client card → משימות tab. |
| D23 | Manual lead creation vs. auto-created leads. | Leads auto-create when a quote is sent to an unknown recipient. "ליד חדש" is a quiet text link (exception path), never a primary button. |
| D24 | Completed task rows showed unchecked circles. | Completed rows: filled check (success), title struck through at 60% opacity. Clicking the check on a completed task un-completes it (undo path). |

---

## 2. Design tokens

Implement as CSS variables in `src/index.css` under `:root` (light) and the existing dark-mode scope. **No screen or component may hardcode a hex that exists here.** Dark values are starting points — verify contrast in the browser during Phase 0 QA and adjust lightness only.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--ink-1` | `#1d1d1f` | `#f2f2f4` | Titles, primary text, black pills |
| `--ink-2` | `#4b4b50` | `#c9c9ce` | Body text, table cells |
| `--ink-3` | `#6e6e73` | `#a0a0a8` | Readable metadata (min size 12px) |
| `--ink-4` | `#86868b` | `#7c7c85` | Metadata ≥13.5px / decorative only (D21) |
| `--ink-quiet` | `#c7c7cc` | `#55555c` | Disabled, empty check circles, drag handles |
| `--accent` | `#0b6bcb` | `#5aa2e6` | Primary buttons, links. The only blue. |
| `--accent-hover` | `#095bad` | `#74b3ec` | |
| `--danger` | `#d70015` | `#ff5d5d` | Overdue / blocking / missing-required / destructive |
| `--warn` | `#b25000` | `#e08a3c` | Waiting on others (הלקוח, רשויות), partial states |
| `--stuck` | `#7a3ea1` | `#b585d6` | The תקועה ball state only |
| `--success` | `#34c759` | `#34c759` | Progress segments, filled checks (never small text) |
| `--success-text` | `#2b5f2b` | `#6fd98a` | Success wording |
| `--progress-partial` | `#ffcc00` | `#d4a900` | Progress segments only |
| `--surface-0` | `#ffffff` | `#1f1f21` | App card, modals |
| `--surface-1` | `#fafafa` | `#26262a` | Row hover |
| `--surface-2` | `#f2f2f4` | `#2c2c30` | Inputs, secondary buttons, gray chips |
| `--field-read` | `#f7f7f8` | `#242427` | Read-only value boxes |
| `--field-missing-bg` | `#fdf2f2` | `#3a2224` | Required & empty fields (text = `--danger`) |
| `--hairline-1` | `#ececee` | `#2a2a2e` | Section separators |
| `--hairline-2` | `#f0f0f2` | `#242428` | Row separators |
| `--canvas` | `#ececed` | `#161618` | Page background behind the app card |
| `--note-bg` / `--note-text` | `#fbf9f2` / `#7a5216` | `#2e2a1f` / `#d8b46a` | Pinned note ONLY — the single sanctioned tinted card |
| `--focus-ring` | `rgba(11,107,203,.4)` | `rgba(90,162,230,.5)` | 2px ring, all interactive elements |

**Typography.** Heebo everywhere. Sizes (px): **12, 13, 14, 15, 17, 20, 24, 34** — retire every half-pixel size (11.5/12.5/13.5/14.5/19). Migration: 11.5→12, 12.5→12 or 13 by role, 13.5→13 or 14 by role, 14.5→14, 19→20. Weights 400/500/600 only. `letter-spacing: -0.01em` at ≥17px. `font-variant-numeric: tabular-nums` on every numeric display. Space Mono only for step numerals inside EmptyState.

**Spacing.** 4px grid: 4, 8, 12, 16, 20, 24, 32. Dense list row padding-block 8; data table rows 12. Retire 7/9/11/13/22/26.

**Radius.** 6 = chips · 8 = inputs/buttons · 12 = panels/cards · 14 = modals + app frame.

---

## 3. Shared components

Build these once (Phase 0–1) and reuse; screens must not re-implement local variants. For each: anatomy → behavior → a11y notes (states follow §5/§6 defaults).

### 3.1 AppShell
Header 54px inside a `--surface-0` card (radius 14, subtle shadow) on `--canvas`. Contents, start-to-end (RTL): brand mark + "PIVO" wordmark · main nav tabs (משימות · לקוחות · הצעות ולידים) · utility cluster (ידע מס entry, avatar menu). Active tab: 2px `--accent` underline, ink-1, weight 600; inactive: ink-3, 400. משימות tab shows an open-tasks count (12px ink-4 tabular) — the ONLY place this total appears. **No breadcrumb, no footer text.** The knowledge entry is separated from the avatar by a 1px hairline divider and labeled "ידע מס" (13/ink-3, hover ink-1).
Avatar (26px circle, initial) opens a menu: המשרד · מצב כהה (toggle) · התנתקות. Menu = standard popover: closes on Esc/outside click, `role="menu"`.
**Sub-headers** are owned by context, not the shell: the client card renders its own header block (§4.7); the knowledge area renders its sidebar (§4.15). The shell never renders knowledge tool chips (D9).

### 3.2 PageHeader
Title (20/600) + optional count (13/ink-4 tabular, shows "N" or "X מתוך N" when filtered) + up to two actions aligned end (one primary max). Bottom hairline-1, padding-block-end 12.

### 3.3 TabBar
Text tabs with optional count badge (12px ink-4), active = 2px accent underline + 600. Used by: main nav, client card tabs, quotes/leads tabs. Keyboard: arrow keys move, Enter/Space activates; `role="tablist"`.

### 3.4 FilterChip (gray grammar, D1)
Padding 4×12, radius 6, 13px. Idle: transparent bg, ink-3. Hover: `--surface-2`. Active: `--surface-2` bg (darkened one step: `#ececee` light), ink-1, 500. Active chips that represent removable filters render a trailing ✕ (12px) — clicking anywhere on the chip removes the filter. `aria-pressed` reflects state.

### 3.5 SelectPill (black grammar, D1)
Same geometry as FilterChip but radius 8, 13–14px. Idle: `--surface-2`, ink-2. Selected: `--ink-1` bg, white text, 500. Grouped pills = `role="radiogroup"`; arrow keys move selection.

### 3.6 TaskRow
Grid row: check circle (17px) · title (14/500, ellipsis) · [client (13/ink-2, link)] · due date (13 tabular, end-aligned) · ball word (12–13, colored per D4) · hover/focus actions (edit ✎ then delete ✕). `showClient` prop hides the client column inside client context. Row body click (not on controls) opens the task modal. Date rendering per D2: overdue = `--danger` 600 + tooltip "באיחור X ימים"; due ≤7 days = ink-1 600; else ink-2 400; no date = "ללא תאריך" ink-4. Completed rows per D24.
Check circle: idle `--ink-quiet` border; hover border `--success`; click completes with a 150ms fill animation and a Toast "המשימה הושלמה · ביטול" (undo).

### 3.7 GroupHeader
Chevron (rotates when collapsed) · title (13/600) · count (12/ink-4 tabular) · optional hint text (12/ink-4). Whole header clickable to collapse/expand; state persists per screen in localStorage. `aria-expanded`.

### 3.8 DataTable grammar
CSS grid; header row 12/500/ink-4 with bottom hairline-1 — **omit the header row entirely when ≤3 columns whose content is self-evident**. Rows separated by hairline-2, hover `--surface-1`, padding-block 12. Max 5 data columns. First column `minmax(0,·fr)` + ellipsis. If a detail view exists, the whole row is clickable and gets `cursor: pointer` + focusability.

### 3.9 ProgressSegments
Horizontal 5px strip, radius 3, 2px gaps. One segment per included group, **width proportional to that group's required-field count** (D17). Colors: complete `--success` · partial `--progress-partial` · untouched `--hairline-1`. Groups marked "לא נדרש" are excluded entirely. Always paired with a text ratio ("34 מתוך 55") — the bar is never the only carrier. `role="img"` + `aria-label` with the ratio.

### 3.10 MasterDetail
Sidebar (206–236px) of items: name (13–14) + trailing state word/count (12, `--warn` when incomplete, ink-4 when fine). Active item: `--surface-2` bg, 600. Pane on the other side. Used by: התיק, 1301, ידע מס. Sidebar is `role="tablist"` (vertical); arrow keys navigate.

### 3.11 Modal
Centered panel (max-width 560, radius 14, shadow) over the current screen **blurred (2.5px) and dimmed (rgba(20,20,22,.28))**; background stays visible but inert. Title row (17/600) + close ✕. Focus trapped; Esc and outside-click close — **with a confirm if dirty** ("לצאת בלי לשמור?"). `role="dialog"` `aria-modal` `aria-labelledby`. Return focus to the opener on close.

### 3.12 ConfirmDialog
Small modal: title (17/600), one sentence naming the object ("למחוק את 'דיווח מע״מ 03/2026'?"), buttons ביטול (secondary) + the destructive verb (danger bg). Never a bare "אישור". Initial focus on ביטול.

### 3.13 EmptyState
Headline (17–18/600) · one sentence (14/ink-2, max ~62ch) · optional numbered steps (Space Mono numerals, hairline-separated rows) when a lifecycle is worth teaching · one primary CTA + optional quiet text link. **No filters, metrics, or tabs render around an empty collection** — they appear only once data exists.

### 3.14 SearchSelect
Text input; typing shows a popover of ≤10 matches; each option may carry a trailing meta value (e.g., settlement zone + זיכוי %). Arrow keys + Enter select; Esc closes; exact `combobox`/`listbox` ARIA pattern. Empty query = closed. No match = "אין תוצאה ל'{q}'" row (non-selectable). Used for: settlements (1,200 options), client picker, any list >8 options.

### 3.15 AnswerBlock
Caption (12/ink-3) · the answer (34/600 tabular + unit at 15/ink-3) · breakdown rows (label ink-2 / value ink-1 tabular, hairline-2 separated) · caveat note (12/ink-4, ≥13.5px if it must be read — then ink-3). Template for all calculators.

### 3.16 Icons
Inline SVG, 16×16 viewBox, 1.5px stroke, `currentColor`, `aria-hidden` (adjacent text labels carry meaning). Set: close, chevron-down, chevron-start, check, plus, search, edit (pencil), external, drag (6 dots), moon, phone. No emoji or font glyphs anywhere.

### 3.17 Toast
Bottom-start (RTL-aware), `--ink-1` bg / white text (inverted in dark), radius 8, auto-dismiss 5s, optional action ("ביטול"). One at a time; new replaces old. `role="status"`.

### 3.18 PinnedNote
`--note-bg` card, radius 12, label row ("הערה מוצמדת" 12/600/`--note-text`) + עריכה quiet action, body 13/ink-2/1.6. Click עריכה → inline textarea + שמירה/ביטול. The only tinted card in the product.

---

## 4. Screen specifications

Template per screen — **Keep / Remove / Add / Rename / Change → Behavior → Edge cases → States → Responsive/A11y deltas** (defaults from §5–§7 apply when silent).

---

### 4.1 App shell & navigation (`App.tsx`)

**Keep:** single 54px header; 3 operational tabs; content card on canvas; client and knowledge sub-contexts rendered inside content.
**Remove:** bottom breadcrumb line and any footer text; knowledge tool chips from the shell; the "המשרד" bare text button (moves into avatar menu).
**Add:** avatar menu (המשרד / מצב כהה / התנתקות); hairline divider before "ידע מס"; open-count badge on משימות.
**Change:** "ידע מס" opens the knowledge area (last-visited tool, default הוצאות מוכרות).
**Behavior:** navigation state survives refresh (URL hash or persisted route). Entering a client card highlights לקוחות as active. Theme toggle flips the dark-mode class and persists.
**Edge cases:** open-count = 0 → badge hidden. Unknown route → redirect to משימות.
**A11y delta:** nav is `<nav>`; tab order: brand → tabs → ידע מס → avatar.

---

### 4.2 Login

**Keep:** minimal single-purpose layout — logo, two fields, one primary button.
**Remove:** "כניסה כמשתמש בדיקה (DEV בלבד)" button; "auto-login פעיל…" debug text; the filler sentence "היכנס כדי לגשת ללקוחות…".
**Add:** office name line under the logo (12/ink-4) — rule 0.3.4.
**Behavior:** on auth failure show inline error under the button: "פרטי ההתחברות שגויים" (danger, 13) — never an alert().
**Edge cases:** submit with empty fields → field-level required marks, no request.
**States:** button shows in-progress label "מתחבר…" (disabled) during auth.

---

### 4.3 משימות — main task list (`TaskBoard.tsx` / `TasksPage.tsx`)

**Keep:** one toolbar row (search 290px + ball FilterChips: הכל/אצלי/הלקוח/רשויות/תקועה + primary "+ משימה חדשה" at the end); hairline-separated groups; 4-data-column TaskRows; hover actions.
**Remove:** urgency dot (D5); column headers (self-evident at ≤5 columns); any "פג"/late second line under dates; type/description columns.
**Add:** תקועות group (D6); edit ✎ hover action before ✕; empty-search state; undo toast on complete; confirm on delete.
**Rename:** groups per D6; chip "תקוע" → "תקועה".
**Change:** הושלמו collapsed by default (D24 row styling); whole row opens modal; date logic per D2 computed against *today* (this fixes the known bug where future dates were flagged late — verify with a task due next month).
**Behavior:** search filters on title+client, live; chips filter by ball; both compose. Groups with zero visible rows disappear (except: if ALL groups empty due to filter/search → EmptyState "אין משימות שמתאימות" + "נקה סינון" link). Group order: לטיפול מיידי, תקועות, בהמשך, הושלמו.
**Edge cases:** task with no date → "ללא תאריך", grouped in בהמשך (or תקועות if ball=תקועה). Task completed while filtered → row animates out of its group into הושלמו. >100 tasks → no pagination; groups keep it scannable, but completed tasks older than 90 days collapse under a "הצג ישנות" link within הושלמו.
**States:** first-run with zero tasks → EmptyState: "עוד אין משימות" / one sentence / "+ משימה חדשה".
**Responsive delta (≥768 tablet):** ball column drops; ball shown as a small colored word under the title.

---

### 4.4 חלון משימה — create/edit modal (`TaskForm.tsx`)

**Keep:** Modal (§3.11) with ghost background; field order: משימה, לקוח + תאריך יעד (2-col), הכדור אצל (SelectPill row), תיאור, "שדות נוספים" disclosure (סוג, סטטוס, שנת מס, דחיפות), footer: מחק משימה (quiet, start) · ביטול + שמור (end).
**Remove:** nothing structural.
**Add:** client name is a link to the client card (guarded close); meta line above footer: "נוצרה {dd.mm.yyyy} · הושלמה {date|—}" (12/ink-4); delete → ConfirmDialog; dirty-close guard.
**Rename:** "דד-ליין" → "תאריך יעד" (D7).
**Change:** all fields are real inputs — title text input (required), client SearchSelect, date native picker, description autosize textarea, ball SelectPill.
**Behavior:** שמור validates (title required → field-missing style + "חובה" 12/danger); Esc/outside with changes → guard; ⌘/Ctrl+Enter saves. Create-mode differences: title "משימה חדשה", no delete, no meta line; when opened from a client context the client field is prefilled and shown as a read-only value with "שנה" quiet link.
**Edge cases:** client deleted since task creation → client field shows "לקוח לא קיים" (warn) and SearchSelect open on focus. Overdue date renders danger inside the picker display too.
**A11y delta:** initial focus = title field (edit: first field); labels bound to inputs.

---

### 4.5 לקוחות — client list (`ClientList.tsx`)

**Keep:** PageHeader with count and ratio; actions "+ לקוח חדש" (primary) and "בקשת ייצוג" (secondary); search ("חפש שם, ת.ז. או טלפון" — must actually match all three); collapsed filter panel behind quiet "סינון" toggle; active filters as removable chips; **filtered-by column joins the table while its filter is active**; exception flag line under the name (danger, 12): shown only for שע״ם לא פעיל or ייצוג לא פעיל.
**Remove:** the facet-panel explainer sentence; any facet whose values are identical across all rows (facets derive from data, not static lists).
**Add:** whole-row click → client card; "N באיחור" click → client card משימות tab (D22); empty & no-results states.
**Change:** the combined "מס וייצוג" column becomes a one-word classification column **"סיווג"** (שכיר / עצמאי / חברה / שכיר+עסק, 13/ink-3). Columns: שם (+flag line) · טלפון (tabular) · סיווג · [filtered column] · משימות (count + red late count, end-aligned).
**Behavior:** facets single-select per axis; selecting adds a chip and (for city etc.) its column; clearing removes both. Count label: "7" or "3 מתוך 7".
**Edge cases:** two clients same name → phone disambiguates (no special UI). >50 clients → sticky table header (the one header row that exists here), no pagination.
**States:** zero clients → EmptyState "עוד אין לקוחות" + sentence + "+ לקוח חדש"; sample-data loader appears only as a quiet dev link here and nowhere else. No results → "אין לקוח שתואם ל'{q}'" + נקה link.

---

### 4.6 לקוח חדש — modal (`ClientForm.tsx` entry)

**Keep:** the old screen's concept: exactly 5 fields (שם מלא, ת.ז., טלפון, אימייל, סיווג) + one sentence: "את שאר הפרטים משלימים בתיק הלקוח."
**Change:** restyle to Modal + §7.5 form tokens; סיווג = SelectPill row.
**Behavior:** שמירה creates the client and navigates straight into its card (מרכז שליטה). ת.ז. validated (9 digits + checksum); duplicate ת.ז. → inline error "כבר קיים לקוח עם ת.ז. זו" + link to that client.

---

### 4.7 כרטיס לקוח — frame + מרכז שליטה (hub)

**Client card frame (all four tabs share it):**
"‹ לקוחות" quiet back link · client name (24/600) · meta line (ת.ז. · טלפון · עיר — 13/ink-3 tabular; phone click-to-copy with toast) · actions: stateful report CTA per D13 + "+ משימה" (prefilled client) · TabBar: מרכז שליטה / התיק / מסמכים / משימות · {open count} · tax classification line at the bar's end (12/ink-3).

**Hub — Keep:** two-column layout — "מה הבא בתור" (wide) · rail: "חסר כדי להתקדם", "מה זז לאחרונה", PinnedNote. Blocker line under a due item ("חסרים: טופס 106…", 12/danger).
**Remove:** the "3 בתוך 21 יום" header meta; future-dated items from the activity feed.
**Add:** rows clickable → task modal; cap list at 5 + "כל המשימות ←" link to the tasks tab; renewal line (שע״ם / ייפוי כוח expiring ≤60 days) appears inside "חסר כדי להתקדם" as "שע״ם פג ב-15.06.26 · חדש" — not in the feed.
**Change:** date colors per D2 (upcoming ≠ red).
**"בקש מהלקוח" behavior (fully specified):** opens the email composer prefilled — recipient = client email, subject "מסמכים חסרים — {office name}", body listing the missing items in Hebrew. User edits and sends explicitly (rule 0.3.5). On send: activity entry "נשלחה בקשה ל{item}" + the related task's ball flips to הלקוח. If the client has no email → the button becomes "העתק רשימה" (copies the request text; toast confirms).
**"העלה" behavior:** jumps to מסמכים tab with the upload dialog open and category preselected.
**Edge cases:** no open tasks → "מה הבא בתור" shows a one-line calm state: "אין משימות פתוחות ללקוח הזה · + משימה" (no boxed EmptyState inside a populated screen). No note → PinnedNote renders as a quiet "+ הוסף הערה" text link only. Empty activity → section hidden entirely (a heading over nothing violates principle; the hub may have a one-column rail).
**Responsive delta:** <1024px the rail stacks under the due list.

---

### 4.8 כרטיס לקוח · התיק (client file — the big form)

**Keep:** MasterDetail with 9 groups (זהות, בן/בת זוג, ילדים, נקודות זיכוי, מעבידים, עסקים, נדל״ן, בנקים וני״ע, פנסיה וגמל); per-group state word; group help sentence (professional content — keep the existing texts verbatim); footer provenance line; search mode flipping the pane into cross-group field results; "לא נדרש" ≠ "חסר" semantics.
**Remove:** global header "שמור" (D12); the 1,200-option settlement dropdown.
**Add:**
- **Inline editing, group-scoped save (D12):** fields always editable (quiet `--surface-2` inputs, focus ring on entry); first change marks group dirty → footer swaps "הבא · X" for "שמור" (primary) + "ביטול" (revert group). Switching groups or searching while dirty → guard dialog (שמור / בטל שינויים / הישאר).
- **Settlement SearchSelect** (§3.14): options cited from the settlements dataset (the same one the knowledge tool uses — single source), each result shows zone + זיכוי %.
- **Repeaters:** groups ילדים/מעבידים/בנקים end with "+ הוסף {item}" quiet button; each block gets hover ✕ + ConfirmDialog.
- **"לא נדרש" toggle:** groups עסקים/נדל״ן/בן־זוג offer a one-line switch "לא רלוונטי ללקוח זה" that sets the group's state to לא נדרש (excluded from progress, D17).
- **OCR entry:** זהות group header action "מלא מצילום ת.ז." → upload → OCR → fields prefilled and marked "מזוהה מצילום — לאשר" (warn tint) until the user saves the group. OCR failure → inline "לא הצלחנו לקרוא את הצילום — מלא ידנית" (no modal).
- Search results clickable → opens the containing group, focuses the field, 2s highlight.
**Change:** progress strip → ProgressSegments weighted (D17); header subtitle keeps "X קבוצות דורשות השלמה · Y מתוך Z סגורות".
**Edge cases:** required-and-empty field = field-missing style + "חובה" tag; a group can be saved with missing required fields (state stays חסר) — the file never blocks saving partial truth. Search with no match: "אין שדה בשם הזה בתיק".
**States:** per-group save shows "נשמר ✓" quietly in the footer for 2s.
**Responsive delta:** <1024px MasterDetail becomes an accordion (group headers stacked; one open at a time).

---

### 4.9 כרטיס לקוח · מסמכים (`DocumentManager.tsx`)

**Keep:** PageHeader (title + count + "העלאת מסמך" primary); search; year and category FilterChips **with counts baked in** ("2024 · 4"); options with zero documents never render; table: תיאור (+filename 12/ink-4/LTR-isolated second line) · קטגוריה · שנה · הועלה; no size column; hover ✕.
**Add:**
- **Row click → preview**: overlay (Modal grammar, larger) rendering PDF/image with a metadata side strip (description, category, year, uploaded date) and actions: הורדה · מחיקה (confirm). Unsupported type → "אין תצוגה מקדימה · הורדה".
- **Upload flow:** button + whole-table dropzone (drag-over shows a dashed `--accent` outline + "שחרר כדי להעלות"). After file pick: small dialog — תיאור (prefilled from filename; if image and OCR succeeds, suggested description), קטגוריה, שנה → שמירה. Multi-file drop → dialog iterates ("מסמך 2 מתוך 3").
- Upload progress: temporary row at table top with an inline progress bar; failure → row shows "ההעלאה נכשלה · נסה שוב / הסר".
- Delete → ConfirmDialog naming the file.
**Change:** filters single-select per axis, composable (year AND category).
**Edge cases:** file >10MB → pre-upload inline error "הקובץ גדול מדי (מקסימום 10MB)". IndexedDB write failure → error banner §5.3.
**States:** zero documents → EmptyState "עוד אין מסמכים ללקוח הזה" + upload CTA (dropzone still active). Filters hidden while empty (D14 principle).

---

### 4.10 כרטיס לקוח · משימות

**Keep:** grouped by ball with hint captions; no client column (TaskRow `showClient=false`); no filter bar; no table header; note line under titles.
**Add:** "להתקשר" hint becomes an action when the group is ממתין ללקוח and the client has a phone: quiet link "להתקשר ↗" → `tel:` link and copies the number (toast). "+ משימה" prefills the client (already in frame spec).
**Change:** group headers: **אצלי · N** (hint "לעבוד") / **ממתין ללקוח · N** ("להתקשר") / **ברשויות · N** / **תקועות · N** / **הושלמו** (collapsed). Date colors per D2.
**Edge cases:** all groups empty → calm one-liner as in hub (§4.7 edge cases).
**Sync rule:** this list is the full task set for the client; the hub shows its head (≤5 by date). One data source, two projections.

---

### 4.11 הצעות ולידים (quotes + leads)

**Structure:** one page, PageHeader "הצעות ולידים", TabBar: **הצעות · N** / **לידים · N**.

**Empty state (no quotes ever):** exactly the mockup's design — headline "עוד לא הפקת הצעת מחיר", one short paragraph ("ההצעה נשלחת לנמען, והליד נוצר אוטומטית — גם אם הוא לא קיים במערכת."), 3 numbered steps (01 בונים את ההצעה / 02 שולחים לנמען — הליד נוצר מעצמו / 03 הלקוח חותם — הליד הופך ללקוח), primary "צור הצעה ראשונה" + quiet link "הוסף ליד ידנית". **No header button, no tabs, no filters in this state** (D14). Tabs appear once ≥1 quote or lead exists.

**Quotes tab (populated):** rows — נמען (14/500; link when the recipient became a client) · סכום (tabular) · סטטוס (one word) · נשלחה (dd.mm.yy) · hover actions (שכפול, ✕ with confirm). Status vocabulary + rendering: **טיוטה** (ink-4) · **נשלחה** (ink-1) · **נחתמה** (`--success-text`) · **פגה** (ink-4). No status filter until >10 quotes AND ≥2 statuses present; then FilterChips.
Row click: טיוטה → opens the builder; others → read-only view of the sent quote (what the client saw) + event line ("נשלחה 12.07 · נצפתה 13.07 · נחתמה 15.07" — show only events that exist).

**Leads tab:** rows — שם · מקור (הצעה / ידני) · הצעה אחרונה (date or —) · staleness flag ">30 יום ללא מענה" (12/warn) · primary quiet action per row "צור הצעה". "ליד חדש" = quiet text link above the table (D23). Lead with signed quote auto-converts to client — the lead row disappears and a toast links to the new client card.
**Leads empty (quotes exist):** one-liner "אין לידים פתוחים — ליד נוצר אוטומטית כששולחים הצעה לנמען חדש."

**Edge cases:** deleting a signed quote is not allowed (✕ hidden; the quote is a record). Quote to an existing client skips lead creation entirely.

---

### 4.12 בונה הצעת מחיר (quote builder)

**Keep:** the split layout — service/settings groups on one side, **live preview of the exact client-facing page** on the other, including the signature area.
**Remove:** duplicate empty-messages — when no services are added yet, exactly ONE message, inside the preview ("ההצעה עדיין ריקה — הוסף שירות משמאל"), because there it also teaches what will appear.
**Change:** all controls adopt §2/§3 tokens; preview carries the **office name and accountant branding**, never PIVO branding (rule 0.3.4); "שלח" opens the email composer (rule 0.3.5) with the quote link — sending is explicit.
**Behavior:** builder autosaves as טיוטה on every change ("נשמר ✓" quiet). Leaving is always safe.
**Edge cases:** recipient email invalid → inline error at send time; sending to an address that matches an existing client links the quote to that client.

---

### 4.13 בקשות ייצוג (representation flow)

Three surfaces, three audiences:
1. **Accountant creates (modal over clients list):** keep the short single-purpose form as-is; restyle with tokens. Opens from "בקשת ייצוג" on the clients page.
2. **Client fills (standalone client-facing page):** office branding, larger type (16px body), single column, one step per screen (details → uploads → signature), progress text "שלב 2 מתוך 3". SignaturePad keeps a visible "נקה וחתום שוב" option. This page must be comfortable on a phone (it's the one truly mobile surface — full responsive support required regardless of D19).
3. **Accountant reviews + signs:** document summary, the client's uploads inline-previewable, signature, "אשר וחתום" primary.
**Status display:** in the client card frame, an in-progress request renders one quiet line under the meta line: "בקשת ייצוג · ממתין ללקוח" (state words: ממתין ללקוח → ממתין לבדיקתך → ממתין לרשויות → פעיל; the middle state is `--warn` because the ball is with the accountant). No dashboard, no cards.
**Edge cases:** client submits with a missing required document → cannot submit; field-missing styling. PDF generation failure → error banner with retry, request state unchanged.

---

### 4.14 דוח 1301 (annual report flow)

**Entry:** only from the client card CTA (D13). No nav-bar entry anywhere.
**Frame:** context line "דוח שנתי 1301 · {client} · שנת מס {year}" (12/ink-4) over title "שאלון · {group}" (20/600). Header end: quiet "נשמר ✓" indicator + "יציאה" (returns to hub; CTA there shows continue state per D13). ProgressSegments (weighted) + "X מתוך Y שדות פעילים".
**Keep:** MasterDetail group list with done/total per group; per-question field-number caption ("שדה 158"); pruned-note under the sidebar ("61 שדות נגזמו מתוך 116."); the **audit mode** toggle "מה נגזם ולמה" → table of all groups incl. pruned ones (קבוצה+סיבה · פעילים · נגזמו · ממתינים), caption one line: "מה המערכת כללה, גזמה או ממתינה לו — לכל {N} השורות."
**Remove:** header "שמור והמשך" (D11); the "זהו מסך שלך, לא של הלקוח" essay.
**Add — the two missing input patterns:**
- **Currency question:** answer zone = 130px end-aligned tabular input + "₪" suffix. When a source document holds the value: caption under the field number — "מתוך טופס 106 — 182,400 ₪ · אשר או תקן"; the input is prefilled; editing it marks it "תוקן ידנית" (12/ink-4).
- **Conditional expansion:** answering כן on a gate question slides in indented follow-up rows (24px indent, same grammar). Switching to לא collapses them and clears their values with a Toast "התשובות נמחקו · ביטול".
**Change:** footer "הבא · {next group}" is the primary (accent); last group → "סיום ובדיקה" → opens audit mode as the review step, with a final "סגור דוח" secondary that returns to the hub.
**Behavior:** every answer autosaves immediately. Options are SelectPills (D1). A question already answered shows its pill selected on return.
**Edge cases:** third option "לא ידוע" allowed where the source data defines it; renders as a third pill, and the group's done-count treats it as answered. Changing an answer that prunes an already-answered group → ConfirmDialog stating what will be discarded.
**States:** report loading (pulling file data) → skeleton of sidebar + 3 question rows.

---

### 4.15 ידע מס — knowledge area shell

**Structure:** entered via the shell's "ידע מס". Layout = MasterDetail: sidebar (206px) with header "ידע מס · [year ▾]" (the **single** knowledge-area year selector, D10 — a FilterChip-styled dropdown listing available years from the tax DB), then the 8 tools: הוצאות מוכרות · ניהול ספרים · נקודות זיכוי · שכר דירה · מדרגות ומס יסף · ביטוח לאומי · יישובים מוטבים · נושאים מקצועיים, then a divider and **מסד נתוני מס** (set apart — it's the source, not a tool). Sidebar footer (12/ink-4): "אומת {mm.yyyy} · בדיקה הבאה {mm.yyyy}" — the only place this appears (D15).
**Behavior:** year change re-renders every tool's numbers; tools never own a year control. Last-visited tool persists.
**Edge cases:** selected year missing a value some tool needs → that tool shows inline "אין נתון לשנה זו במסד" with a link to the DB row.

---

### 4.16 מסד נתוני מס (tax database)

**Keep:** subtitle contract line ("המקום היחיד שבו מספר מס נערך. כל תצוגה אחרת מצטטת מכאן."); table: נתון · ערך {year} (+delta vs. previous year, 12/ink-3) · אסמכתא · מצוטט ב־; one closing sentence about propagation.
**Remove:** the screen-local year buttons (D10); the duplicate verification line (D15).
**Add:**
- "מצוטט ב־" entries are links → open the citing tool.
- **Edit flow:** row hover → "עריכה" quiet action → the value becomes an input + a required "אסמכתא" input → שמירה opens ConfirmDialog listing the citing tools ("השינוי יתגלגל ל: מדרגות מס, 1301") → on confirm, row gains provenance line "עודכן {date}" (12/ink-4).
- **"עדכן שנת מס"** → creates next year's row-set prefilled from the current year, every row tagged **"טרם אומת"** (warn, 12) until individually confirmed via a per-row "אומת ✓" action; the sidebar year selector includes the new year immediately, and any tool citing an unverified value shows the tag beside the number.
- New row (Phase 4, for D16): "מינימום דמי ביטוח לאומי (חודשי)".
**Edge cases:** editing a value used by an open 1301 report → the confirm dialog adds "דוחות פתוחים יחושבו מחדש".

---

### 4.17 ידע מס · הוצאות מוכרות (expenses)

**Keep:** title + subtitle ("״אפשר לנכות את זה?״ — תשובה עם מקור"); search; columns הוצאה (+source line) · מס הכנסה · מע״מ · סיכון; **color only on the risk column** (נמוך=ink-3 · בינוני=warn · גבוה=danger).
**Add:** row click → in-place expansion showing the full rule: תקרה (value cited from the tax DB with a link to its row), conditions, source citation. One row expanded at a time. Search live-filters; no match → "אין הוצאה שתואמת ל'{q}'" + suggestion link to נושאים מקצועיים. At >15 rows introduce category GroupHeaders.
**Remove:** any self-referential subtitle copy if present.

---

### 4.18 ידע מס · ביטוח לאומי (NI calculator)

**Keep:** insured-type selector + monthly income input → AnswerBlock (payment at 34px, breakdown: דמי ביטוח לאומי / דמי בריאות / over-cap line) · the ONE relevant rate table with the active bracket highlighted (`#f5f8fc` light / step-up in dark, 600) · caveat notes (52% recognized as expense; the reduced bracket is CPI-linked).
**Change:** insured-type selector = **SelectPill (black)** — it changes the answer (D1). Year comes from the area selector (D10); remove local "2026".
**Add (D16):** minimum-payment floor for 'לא עובד' (and any type where the law sets one): when the floor applies, breakdown shows "מינימום דמי ביטוח — {value} ₪" and the total honors it. Value cited from the tax DB (with "טרם אומת" tag passthrough).
**Rename:** subtitle → "בוחרים סוג מבוטח ומקבלים את התשלום שחל".
**Edge cases:** income empty/0 → total shows the floor if one applies, otherwise 0 with note "אין הכנסה — אין חבות" per type; income above cap → over-cap line switches to "לא חייב"; non-numeric input stripped live.

---

### 4.19 Remaining knowledge tools (rebuild on the two templates)

All adopt the knowledge shell (§4.15). Two templates: **Wizard** (question → answer with explanation) and **Calculator** (AnswerBlock + cited table). No tool holds its own copy of a tax number — everything cites the DB.

| Tool | Template | Specifics |
|---|---|---|
| ניהול ספרים | Wizard | Questions determine the bookkeeping addendum + required books; result = a stated verdict with the addendum name, the "why", and the source. |
| נקודות זיכוי | Wizard | Result shows total points AND the shekel value/month+year — value cited from the DB row (per selected year). Each point line names its legal basis. |
| שכר דירה | Calculator | Three tracks compared (פטור / 10% / שולי); **the recommended track is visually dominant** (its column bolded + "המסלול המשתלם" caption); the other two remain visible for professional judgment. Exemption ceiling cited. |
| מדרגות ומס יסף | Calculator | Bracket table rendered FROM the DB (no local copy); quick calculator above it (income → tax, active bracket highlighted, מס יסף line appears only above the threshold). |
| יישובים מוטבים | List + search | The full official list IS the dataset the file's SearchSelect cites. Search by name; columns: יישוב · % זיכוי · תקרה. Side calculator: pick settlement + income → benefit. |
| נושאים מקצועיים | Plain list | Titled entries, chronology-free, search. Explicitly a "waiting room": no design investment beyond list + detail text. |

---

### 4.20 המשרד (settings) — new, minimal

One column, three groups: פרטי המשרד (office name — feeds every client-facing surface; email; phone) · דוא״ל (the sending address, test-send button using the safe test recipient) · נתונים (ייצוא כל הנתונים לקובץ; the ONLY place a data-reset may exist, double-confirmed, typed confirmation "מחיקה"). Entered from the avatar menu.

---

## 5. Global state defaults

**5.1 Loading.** Lists/tables: 3–5 SkeletonRows matching the exact row grammar (gray bars: title-width, meta-width). Never a spinner inside a list. Full-app first load: centered brand mark pulse. Anything cached from localStorage renders instantly — skeletons appear only for genuinely async work (IndexedDB reads, OCR, PDF generation).
**5.2 Saving.** Autosave wherever the data model allows (task modal excepted — explicit שמור). Quiet "נשמר ✓" (12/ink-4, 2s fade) near the acting control. Failures: Toast "השמירה נכשלה — נסה שוב" + the dirty state preserved.
**5.3 Errors.** Load failure → inline banner in place of the content: one sentence ("לא הצלחנו לטעון את המסמכים") + "נסה שוב" quiet button. Never alert(), never a toast for load failures, never a blank screen.
**5.4 Empty.** First-run empties use EmptyState (§3.13). In-context empties inside populated screens use a one-line calm state (§4.7). Filter/search empties always include the escape hatch ("נקה סינון").
**5.5 Destructive.** Always ConfirmDialog naming the object. Complete-task is the exception (undo Toast instead — it's reversible).

## 6. Accessibility requirements (product-wide)

1. **Focus ring on every interactive element:** 2px `--focus-ring`, offset 2px, `:focus-visible` only. Removing an outline without replacement is a defect.
2. **Contrast:** body/metadata text meets 4.5:1 (D21 governs ink-4 usage); verify dark tokens in-browser during Phase 0.
3. **Hover-revealed actions:** also revealed by `:focus-within`; on `(hover: none)` pointers they render always-visible at reduced opacity.
4. **Keyboard:** modals trap focus, Esc closes (with guard), focus returns to opener. Tabs/radiogroups use arrow keys. Row actions reachable by Tab. ⌘/Ctrl+Enter submits modals.
5. **Semantics:** dialogs (`role=dialog` + aria-modal + labelledby), tabs (tablist/tab/tabpanel), comboboxes per §3.14, toasts (`role=status`), progress (`aria-label` with the ratio). Hebrew `aria-label` on icon-only buttons ("מחיקת משימה", "סימון כהושלמה").
6. **Zoom:** 200% browser zoom must not break layouts (grid columns collapse per §7 rather than overflow).

## 7. Responsive rules

Breakpoints: **≥1280 full · 1024–1279 condensed · 768–1023 stacked · <768 out of scope** (except: representation client-fill page §4.13.2, and the Phase-5 read-only tasks view).
- Condensed: two-column layouts (hub) reduce gaps; tables keep all columns.
- Stacked: hub rail stacks under the main list; MasterDetail becomes accordion; tables drop to their 3 essential columns (each table spec's first three data columns); toolbar rows wrap (search full-width first line).
- The app card keeps 22–24px padding ≥1024, 16px below.
- No horizontal scroll anywhere at any breakpoint.

## 8. Data & logic fixes (required, not optional)

| # | Fix | Detail |
|---|---|---|
| L1 | **Overdue computation bug** | Lateness must compare due date to *today*; currently future dates can be flagged late. Acceptance: a task due next month renders gray; one due yesterday renders danger + "באיחור יום". |
| L2 | Ball color mapping | Central mapping per D4 in `types/index.ts`; no component-local color literals. |
| L3 | Vocabulary constants | D7 canonical strings defined once and imported. |
| L4 | Date formatter | One util: `list` (dd.mm.yy) / `form` (dd.mm.yyyy) modes; used everywhere; no inline date formatting. |
| L5 | Derived filters | Facets/filters computed from the data; single-valued facets and zero-count options never render. |
| L6 | Settlements single source | One dataset consumed by the knowledge tool AND the file's SearchSelect. |
| L7 | Tax-value citations | Tools read the tax DB by key+year; adding "מינימום דמי ביטוח" row (D16). No numeric tax literal inside a component. |
| L8 | Task group order/logic | §4.3 grouping (incl. תקועות) implemented in `taskUtils.ts`, shared by main list and client tab. |

## 9. Phases & acceptance criteria

Each phase ends with an in-browser QA pass (dev server, real clicks, screenshots) covering the listed checks **plus**: no console errors, focus ring visible on Tab-walk, dark mode toggle sane, no horizontal scroll at 1024px.

**Phase 0 — Foundations.** Restore `package.json`. Tokens + typography + spacing into `index.css` (both themes). Focus ring. Icon set. L2–L4. Components: FilterChip, SelectPill, GroupHeader, Modal, ConfirmDialog, Toast, EmptyState, SkeletonRow.
*Accept:* a token contrast sample page verified in both themes; existing screens still function (regressions expected only in spacing).

**Phase 1 — Operational core.** §4.1 shell · §4.3 tasks (incl. L1, L8) · §4.4 task modal · §4.5 clients · §4.6 new client · their states.
*Accept:* create→edit→complete→undo→delete a task end-to-end; future-dated task not red; stuck task appears in תקועות; filter to zero rows shows escape hatch; client row click opens card; "N באיחור" lands on the tasks tab.

**Phase 2 — Client card.** §4.7 frame+hub (incl. the "בקש מהלקוח" composer) · §4.8 file (inline group save, SearchSelect, repeaters, OCR entry) · §4.9 documents (preview, dropzone) · §4.10 client tasks.
*Accept:* edit a group → dirty → save → provenance updates; settlement search returns ≤10 cited results; upload→preview→delete a document with confirm; hub top item opens the modal; email composer requires explicit send.

**Phase 3 — Revenue & flows.** §4.11 quotes+leads (empty and populated) · §4.12 builder · §4.13 representation restyle · §4.2 login cleanup.
*Accept:* quote to unknown recipient creates a lead; signing converts lead→client (toast link); empty state shows exactly one blue CTA; builder preview shows office branding; client fill-page usable at 375px width.

**Phase 4 — Knowledge area.** §4.15 shell + year selector · §4.16 tax DB (edit/provenance/citation links, D16 row) · §4.17 expenses · §4.18 NI · §4.19 six tools · §4.14 1301 (advance action, currency + conditional patterns, autosave).
*Accept:* changing the area year updates every tool; editing a DB value warns with citing tools and propagates; NI floor applies for 'לא עובד'; 1301 answers survive exit/re-enter; audit mode counts reconcile with the sidebar.

**Phase 5 — Polish.** Command palette (⌘K: clients, tools, actions) · dark-mode verification sweep · §7 responsive pass · §4.20 settings · full a11y audit (§6 checklist walked screen-by-screen) · <768 read-only tasks view (optional, last).

### Out of scope
Tax calculation formulas, storage architecture, email backend behavior, SPEC.md, the authorities' PDF templates.

---

## Appendix A — Copy bank (canonical Hebrew strings)
Ball: אצלי · הלקוח · רשויות · תקועה. Groups: לטיפול מיידי · תקועות · בהמשך · הושלמו. File states: הושלם · חלקי · חסר · לא נדרש. Field label: תאריך יעד. Buttons: "+ משימה חדשה" · "+ לקוח חדש" · "העלאת מסמך" · "צור הצעה ראשונה" · "התחל דוח שנתי" / "המשך דוח {year} · {x}/{y}". Confirmations: "למחוק את '{name}'?" · "לצאת בלי לשמור?". Empty escapes: "נקה סינון" · "נקה חיפוש". Quote statuses: טיוטה · נשלחה · נחתמה · פגה. Representation states: ממתין ללקוח · ממתין לבדיקתך · ממתין לרשויות · פעיל.

## Appendix B — Items requiring owner confirmation (do not block; ship with the noted safeguard)
1. NI minimum-payment value (D16) — ships tagged "טרם אומת" until confirmed in the tax DB.
2. Dark-token exact values (§2) — ship after in-browser contrast check, may be tuned.
3. Read-only phone tasks view (Phase 5) — build last, skippable.
