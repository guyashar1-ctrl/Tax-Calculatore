# PIVO · UX/UI Design Review & Redesign Strategy

**Role:** Principal Product Designer / Senior UX Consultant review
**Date:** 2026-08-01
**Sources analyzed:** Claude Design project `77baf2d1` — `PIVO · מוקאפ.dc.html` (app shell) + its 11 imported screen components (מסך02, 03, 04, 07, 08, 09, 10, 12, 16, 17, 18, 24), `support.js` (prototype runtime — not design content), the prior system audit (`ביקורת מערכת · PIVO`), the content-redesign document (`תוכן מחדש · PIVO`), `משימות · מינימלי`, and the 26 original screen exports in `כל המסכים ב HTML/`.
**Audience:** Claude Opus 5 (implementer) and Guy (product owner). **This document contains no code — it is the specification for a later implementation pass.**

---

## 1. Executive summary

The mockup is a genuinely strong second iteration. The prior audit correctly diagnosed the system's real problems — duplicated tax data, two products crammed into one nav bar, "modes" promoted to "screens", and self-counting UI — and the mockup fixes most of them. The visual language (Heebo, hairline dividers instead of card borders, one accent blue, quiet chips, tabular numerals) is already closer to Linear/Stripe than 95% of internal tools. **Do not restart. Refine, systematize, and complete.**

What still stands between this mockup and a world-class product falls into four buckets:

1. **Internal inconsistencies** — two competing "selected" styles, two competing knowledge-navigation patterns (shell chips vs. in-screen sidebar), three different reds, red meaning "overdue" on one screen and "coming up" on another, half-pixel font sizes, three date formats, and vocabulary drift (אצלי/אני, תקוע/תקועה).
2. **Missing states** — the mockup shows one happy path per screen. There are no loading, error, saving, confirmation, or (except quotes) empty states; no focus styles at all (`outline: none` with no replacement is an accessibility failure); hover-only actions have no touch/keyboard equivalent story beyond `:focus-within`.
3. **Missing screens** — the mockup covers 11 of the product's surfaces. Login, the populated quotes list, leads, the quotation builder, the representation-request flow, new-client, and 6 of the 8 knowledge tools have no redesigned version. Opus 5 must extend the system to them, not invent a second language.
4. **Unspecified interactions** — the File tab (התיק) shows values but never shows *editing*; the hub's "בקש מהלקוח" button has no defined behavior; the 1301 questionnaire has only yes/no questions and no numeric-input pattern; the tax database has an "עדכן שנת מס" button with no defined flow.

Sections 3–5 give the per-screen verdicts, section 6 the global principles, section 7 the design-system tokens and component inventory, section 8 the phased roadmap.

---

## 2. What the mockup gets right — preserve these decisions

These are load-bearing decisions. Opus 5 must not "improve" them away:

- **Hairlines over cards.** Groups are separated by 1px lines (`#ececee` for sections, `#f0f0f2` for rows) and whitespace, not boxes. This is the single biggest source of the calm feel.
- **One accent color** (`#0b6bcb`), used only for the primary action and links. Gray does the rest.
- **Rows, not cards, for lists.** Dense grid rows with 4–5 columns max, tabular numerals, ellipsis truncation.
- **Two-level navigation split:** operational system (משימות / לקוחות / הצעות ולידים) in the main nav; ידע מס and the 1301 flow accessed from context. This resolves the audit's finding #02 — keep it.
- **The client card header pattern:** name, quiet meta line (ת.ז. · phone · city), one primary CTA, tabs with count badges, tax classification demoted to a single quiet line at the tab bar's end.
- **"מה הבא בתור" + "חסר כדי להתקדם" as the hub's spine** — the screen answers "what do I do next", not "what does this client have".
- **Master-detail with per-group status** for long forms (התיק, 1301) — one group at a time, weighted progress, group-level help text written by a professional for a professional.
- **The prune-and-audit duality in 1301** (questionnaire for filling; "מה נגזם ולמה" for trust). This is a differentiating feature; the toggle must survive.
- **Single source of truth for tax numbers** (מסך17) with citation + "מצוטט ב־" column, and year-over-year delta.
- **Answer-first calculators** (מסך24): the computed number at 34px, the breakdown under it, the *one relevant* table beside it with the active bracket highlighted.
- **The quotes empty state** (מסך12): headline, one explanatory paragraph, a numbered 3-step "what will happen", one primary CTA + one text link. This is the template for every empty state in the product.
- **Empty ≠ missing** in התיק ("אין עסקים — לא נדרש" vs "חסר: הכנסה חודשית"). This distinction is professionally meaningful; codify it.
- **Hover-revealed row actions with `:focus-within` parity**, LTR-isolated filenames inside RTL rows, `margin-inline` logical properties, `font-variant-numeric: tabular-nums` everywhere numbers align.
- **Copy that leads with the user's question** ("אפשר לנכות את זה?" — תשובה עם מקור).

---

## 3. Screen-by-screen review

Format per screen: what works → problems (and why users struggle) → decisions (change / remove / merge / relocate) → primary focus & hierarchy → copy.

### 3.0 App shell & navigation (`PIVO · מוקאפ.dc.html`)

**Works:** 54px single header; brand + 3 operational tabs + badge; utility cluster right; client sub-header appears only in client context; knowledge sub-header only in knowledge context; content card on `#ececed` canvas.

**Problems:**
- **Two knowledge navigations exist at once.** The shell renders tool chips (הוצאות מוכרות / ביטוח לאומי / מסד נתוני מס) in its knowledge header, while מסך18 renders its own 8-item sidebar. In the assembled prototype the expenses screen shows *both*. Two different navigation systems for the same 8 tools is exactly the class of bug the audit was written to kill.
- **"ידע מס" and "המשרד" are visually identical utility links**, but one opens an entire second product area and the other (undefined) presumably opens settings. Discoverability of the knowledge area — half the product's value — hangs on a 13px gray text button.
- **Breadcrumb lives at the bottom of the page**, outside the app card, next to a prototype-only instruction line. Users scan top-left (top-right in RTL) for "where am I"; nobody looks at the footer.
- **No global search / command palette.** For a keyboard-heavy professional user, ⌘K ("dtype client name → jump to card; type tool name → open tool") is the single cheapest "premium" feature and it stitches the two product areas together without polluting the nav.
- Client header actions: "התחל דוח שנתי" is always the blue primary even when a report is already in progress (state missing), and "שאלון" as a sibling button is ambiguous — a user cannot predict how "שאלון" differs from "התחל דוח שנתי".
- The avatar is inert. No account menu, no logout, no theme toggle (the product already has dark-mode work in `index.css`).

**Decisions:**
1. **Kill the shell's knowledge tool-chips. The in-screen sidebar (מסך18 pattern) is the one navigation** for all 8 tools. The shell contributes only a "ידע מס" entry point and the area-level year selector (see 3.10).
2. Promote "ידע מס" to a visually distinct entry — same row, but with an icon + label treatment or separated by a divider from "המשרד", signaling "this opens an area, not a page".
3. Move the breadcrumb into the header line of the content area (or drop it entirely — the client sub-header and knowledge sidebar already answer "where am I"; a breadcrumb is only needed inside the client card and 1301 flow). Delete the footer instruction line (prototype artifact).
4. Add a command palette (Phase 4 — nice-to-have but high leverage).
5. Client header: "התחל דוח שנתי" becomes stateful — "התחל דוח שנתי" / "המשך דוח 2025 · 34/55". Rename "שאלון" or remove it; two doors to the same room confuse. "משימה" → "+ משימה".
6. Avatar opens a small menu: המשרד, מצב כהה, התנתקות.

**Primary focus:** the active tab's content. The header must never compete — it already doesn't; keep it that way when adding anything above.

---

### 3.1 מסך02 · משימות (main task list)

**Works:** search + 4 ball-filter chips + one primary button in a single row; three groups (לטיפול מיידי / בתהליך / הושלמו); 4-data-column rows (title · client · date · ball); urgency dot inside the title's leading edge; late dates red+bold; hover-revealed delete; groups with zero rows disappear.

**Problems:**
- **Two ball-states share one color.** `הלקוח` and `תקועה` are both `#b25000`. "Stuck" is the most decision-relevant state in the system (it's why the "ball" concept exists) and it is currently indistinguishable from routine waiting.
- **Dot semantics overlap date semantics.** Dot: red=urgent, amber=late. Date: red=late. So "late" is encoded twice (amber dot + red date) while "urgent but not late" gets a red dot and a black date. Two overlapping encodings for one axis; a user cannot verbalize the rule, so it reads as noise.
- **"הושלמו" is expanded by default** and its rows still show an *unchecked* circle. Completed tasks with unchecked checkboxes contradict the control's meaning.
- **No row-level edit affordance.** The only visible action is delete (✕). Clicking the row presumably opens the edit modal, but nothing signals that; and delete-as-the-only-icon makes destruction the most discoverable action.
- A task with no date (`לבקש אישורי יתרות בנק`) renders an empty cell — indistinguishable from a rendering bug. Stuck/undated tasks need an explicit token.
- No empty state for "search matched nothing", no bulk selection, no sort control (acceptable to omit sort — grouping is the sort — but say so deliberately).

**Decisions:**
1. **One lateness/urgency system, one encoding:** date column carries it alone. Overdue → red bold date + "באיחור X ימים" tooltip. Due within 7 days → semibold black. Everything else → gray. **Delete the dot entirely.** (If Guy wants a manual "urgent" flag, it becomes a small flag glyph after the title, not a color.)
2. **Give תקועה its own treatment:** distinct color token (see §7 palette) *and* pull stuck tasks into their own group between לטיפול מיידי and בתהליך, or badge them "תקועה · אין תאריך". A stuck task must never look like a healthy waiting task.
3. Collapse הושלמו by default (header row with count, chevron to expand — pattern already exists in `משימות · מינימלי`). Completed rows: filled check, strikethrough title at 60% ink.
4. Whole row clickable → opens edit modal; hover shows ✎ + ✕ (edit before delete, right-to-left order: ✎ then ✕). Delete always confirms.
5. Undated tasks show "ללא תאריך" in the date column at `#86868b`.
6. Empty search result: "אין משימות שמתאימות ל'{query}'" + "נקה חיפוש" link — reuse the EmptyState component (§7).

**Hierarchy:** group header (13.5/600) → title (14/500) → everything else 13/400 gray. Correct as designed; keep.

**Copy:** unify **אצלי** (not אני), **תקועה** (not תקוע) everywhere — the chips, the ball column, the edit modal. Group names: "לטיפול מיידי" is good; consider "השבוע" instead of "בתהליך" only if grouping becomes date-driven — otherwise keep.

---

### 3.2 מסך03 · חלון עריכת משימה (task edit modal)

**Works:** modal over a blurred, dimmed ghost of the list (context without competition); 4 visible fields (משימה, לקוח, דד-ליין, הכדור אצל, תיאור) + "שדות נוספים" progressive disclosure for the 4 create-time fields; delete demoted to quiet gray text on the opposite side of ביטול/שמור.

**Problems:**
- **Selected-state grammar conflict:** the ball selector uses black pill (`#1d1d1f` bg, white text) while filter chips elsewhere use gray (`#ececee`). This is actually the *right* distinction (see §6 principle 5) — but it's nowhere stated, and מסך24 violates it. Codify, don't fix by accident.
- Fields are static value boxes in the prototype; the implementation spec is missing: which fields are inline-editable, what the date picker looks like, what validating an empty title does.
- No task metadata (created date, completion history) and no link from "לקוח: דוד כהן" to the client card — users will constantly want to jump from a task to its client.
- No unsaved-changes guard, no keyboard spec (Esc = close-with-guard, ⌘Enter = save), no focus trap / `role="dialog"` semantics.

**Decisions:**
1. Keep the layout exactly. Specify: title = text input; client = searchable select (same component as the settlement search, §3.5); deadline = date input with native picker; description = auto-growing textarea; ball = black-pill segmented control.
2. Client name inside the modal is a link (opens client card, modal closes with guard).
3. Add a quiet last line above the footer: "נוצרה 12.03.26 · הושלמה —" (12/`#86868b`). One line, no section.
4. Esc/click-outside with dirty state → "לצאת בלי לשמור?" confirm. Delete → confirm dialog naming the task.
5. This modal is the **only** task editor — the same component opens from משימות, from the client's tasks tab, and from the hub.

---

### 3.3 מסך04 · לקוחות (client list)

**Works:** header with count (and "3 מתוך 7" when filtered); one primary (+ לקוח חדש) and one secondary (בקשת ייצוג) action; filters collapsed behind a text button; active filters as removable chips; **the filtered-by column re-enters the table while the filter is active** (this rule is excellent and must ship); exception flag under the name ("שע״ם אינו פעיל" — only the exception is shown, not seven green dots); tasks column with red late-count.

**Problems:**
- **"מס וייצוג" column concatenates two dimensions** ("שכיר · ב״ל שכיר", "שכיר + עסק") into a free-text string. It can't be scanned vertically and can't be filtered reliably. The audit killed decorative columns; this one survived half-transformed.
- Only the name is clickable; the row highlights on hover but clicking the row body does nothing. Fitts's law says the row is the target.
- Facet panel's explanatory sentence ("מוצגים רק פילטרים שיש להם יותר מערך אחד…") is designer-to-designer text living in the UI. The *behavior* is right; the sentence explaining it is not needed by an end user.
- The red "3 באיחור" is informational only — the obvious intent (click → that client's late tasks) is unspecified.
- No spec for scale: at 100+ clients the list needs sticky header + virtualization guidance, and the search must cover ת.ז. (placeholder already promises it — good).
- No empty state (first-run: zero clients) and no "no results" state.

**Decisions:**
1. Split "מס וייצוג" into a single **classification token** column (שכיר / עצמאי / חברה / שכיר+עסק — one word, 13/gray) — details live in the client card. Representation status appears only as an exception flag (like שע״ם) when *not* active.
2. Whole row clickable → client card (מרכז שליטה tab). Name keeps its link styling for affordance.
3. "3 באיחור" clickable → client card → tasks tab, pre-scrolled.
4. Delete the facet-panel explainer sentence. Keep the behavior.
5. Empty state (reuse template): "עוד אין לקוחות" + מה יקרה + "+ לקוח חדש" primary + "טען נתוני דוגמה" as quiet dev-only link (never styled as a peer of real actions — audit finding on מסך11).

---

### 3.4 מסך07 · כרטיס לקוח · מרכז שליטה (client hub)

**Works:** two-column layout — "מה הבא בתור" (due list, 1.55fr) as the star; right rail with "חסר כדי להתקדם", "מה זז לאחרונה", and a pinned note. The blocker line under a due item ("חסרים: טופס 106, אישור קרן פנסיה") puts the problem and its cause on one line. This screen now answers the right question.

**Problems:**
- **Red is spent on the wrong thing.** The first two due items (09.05, 10.05) are red+bold because they're *near*, not late. On מסך02, red = overdue. Same color, opposite meanings, one product. This will train users to ignore red — the one color that must never be ignorable.
- "3 בתוך 21 יום" (header meta) is cryptic — a count of what, within what window, why 21?
- **"בקש מהלקוח" has no defined behavior.** This is the highest-value interaction on the screen: it should compose the client email (visible, user-approved — per the established email rule) requesting the missing document, and log it. If it just opens a mailto, say so; if it creates a task, say so. Unspecified = will be implemented wrong.
- "מה זז לאחרונה" contains a *future* event ("שע״ם חודש לשנה הקרובה · 15.06.26") — a renewal date inside a recent-activity feed breaks the feed's contract.
- Due rows aren't clickable (no path from "שכר 04/2026" to the task itself).
- The pinned note introduces a fifth background color family (`#fbf9f2`/`#7a5216`) used nowhere else — acceptable as a deliberate "sticky note" exception, but it must enter the token table or it will multiply.

**Decisions:**
1. Apply the global red rule (§6.3): overdue → red; due ≤7 days → semibold ink; else gray. Blockers stay `danger-text` on their own line.
2. Replace "3 בתוך 21 יום" with "הקרובות · 4" or drop it; the list is short enough to speak for itself.
3. Spec "בקש מהלקוח": opens the email composer pre-filled ("שלום דוד, לצורך הדוח השנתי חסר לנו…"), sending is explicit, and on send an activity entry + a "הכדור אצל הלקוח" task update are written. "העלה" opens the documents tab's upload dialog with the category preselected.
4. Split the right rail: "מה זז לאחרונה" = past only. Renewals/expiries (שע״ם, ייפוי כוח) get one quiet line under the header meta or inside "חסר כדי להתקדם" when within 60 days.
5. Due rows clickable → task edit modal.
6. Cap "מה הבא בתור" at 5 items + "כל המשימות ←" link to the tasks tab (single source of the full list; hub shows the head of the queue).

**Primary focus:** the top item of "מה הבא בתור". Everything on this screen exists to serve that row.

---

### 3.5 מסך08 · כרטיס לקוח · התיק (client file)

**Works:** 9-group master-detail; per-group state word (הושלם / חלקי / חסר / ריק / count); segmented progress strip; search mode that flips the whole panel into cross-group field results with "לא מולא" in red; per-group professional help text ("גיל הילד ביום 31.12 של שנת המס הוא שקובע"); footer provenance ("עודכן 15.01.24", "אישור מנורה מבטחים · התקבל"); empty-but-not-required groups don't block completion.

**Problems:**
- **Editing is completely unspecified.** Every field is a gray value box. Is it click-to-edit? Is there an edit mode per group? Where does "שמור" live relative to a dirty group? For the biggest form in the product, this is the biggest open question. The header's global "שמור" button contradicts the group-at-a-time model.
- **The promised settlement search field is missing.** The audit's headline fix for this screen ("תפריט 1,200 יישובים → שדה חיפוש שמציג עשר תוצאות, מצטט מרשימת מסך 25") is not in the mockup — the field just shows a static value. Opus 5 must build the typeahead: search-as-you-type, 10 results max, each result showing zone + זיכוי %, value cited from the settlements dataset.
- Progress strip weights all groups equally (`flex: 1`) while מסך16 weights by field count. Same component, two behaviors — unify on **weighted**.
- Search results are read-only; there's no "jump to this field" from a result.
- Repeaters (add a second child, second employer, second bank) have no add/remove affordance anywhere.
- OCR exists in the product (`geminiVision.ts` — ID card extraction) but the identity group has no "מלא מצילום ת.ז." action — a signature workflow left on the table.

**Decisions:**
1. **Inline editing, group-scoped saving:** fields are always inputs (styled as the current quiet boxes, border appears on focus). Editing any field marks the group dirty; a group-level footer swaps "הבא · X" for "שמור · ביטול". The header's global "שמור" is removed. No modes, no global dirty state spanning groups.
2. Build the settlement typeahead as a **reusable SearchSelect** (also used for: client picker in task modal, expense search in מסך18).
3. Progress strip: weighted by required-field count; green = complete, amber = partial, `#ececee` = untouched, and *not counted* when group is "לא נדרש". One component shared with 1301.
4. Search results clickable → opens the group with the field focused and highlighted for ~2s.
5. Repeater pattern: group content ends with "+ הוסף מעביד" quiet text button; each repeated block gets a hover-revealed ✕ with confirm.
6. Identity group header gains one secondary action: "מלא מצילום ת.ז." → upload → OCR → prefilled fields marked "מזוהה מצילום — לאשר" until confirmed.

---

### 3.6 מסך09 · כרטיס לקוח · מסמכים (documents)

**Works:** count next to title; one primary action; filters that *are* the counts ("2024 · 4", "תלוש שכר · 2") with empty options removed; description as the primary line and the raw filename demoted to a 12px LTR second line; no size column; hover delete.

**Problems:**
- Category chips have no active state in the prototype (years do) — trivially incomplete, but the interaction (multi-select? single?) is unstated. 
- No upload flow: what happens after "העלאת מסמך"? (dropzone? category/year assignment? OCR suggestion of description?) Drag-and-drop onto the whole table area is table stakes for a documents screen.
- Rows aren't clickable → no preview. A documents list where you can't open the document is a filing cabinet with painted-on drawers.
- Delete has no confirm and the files live in IndexedDB — destruction is real and irreversible.
- No empty state ("עוד אין מסמכים ללקוח הזה" + upload CTA), no upload-progress/failure state.

**Decisions:**
1. Filters: single-select per axis (one year, one category), active = gray chip, click again to clear — same grammar as everywhere.
2. Row click → preview panel/lightbox (PDF/image) with metadata sidebar and מחיקה inside it; row hover keeps quick ✕ (with confirm dialog naming the file).
3. Upload: button *and* full-table dropzone; after pick, a single small dialog: description (prefilled from filename, OCR-suggested when image), category, year → שמירה. Uploading rows show an inline progress line; failures show inline "ההעלאה נכשלה · נסה שוב".
4. Empty state via the standard template.

---

### 3.7 מסך10 · כרטיס לקוח · משימות (client tasks tab)

**Works:** the audit's sharpest fix, fully realized — no client column, no filter bar, no column headers; grouped by **אצל מי הכדור** with an action hint per group ("לעבוד", "להתקשר"); note line under titles carrying real content ("דיסקונט ומזרחי, נכון ל-31.12.2025").

**Problems:**
- Same red-for-upcoming bug as the hub (09.05/10.05 red without being overdue).
- "להתקשר" is a caption, not an action — one tap-to-act opportunity missed (the client's phone number is one tab away).
- "+ משימה" doesn't state that the client is prefilled (it must be).
- הושלמו expanded; same fix as מסך02.
- Overlap with the hub's "מה הבא בתור" is fine (hub = head of queue) but only if the rule from §3.4.6 is implemented; otherwise two full lists drift apart.

**Decisions:** apply the red rule; make the group hint a real quiet action where possible ("להתקשר ↗" → tel: link / copies number); prefill client on + משימה; collapse completed. Reuse the exact row component from מסך02 minus the client column (one TaskRow component, `showClient` prop).

---

### 3.8 מסך12 · הצעות מחיר (quotes — empty state)

**Works:** the canonical empty state (see §2). The three numbered steps teach the lead→client lifecycle at the exact moment the user cares.

**Problems:**
- **Two primary CTAs for one action:** "+ הצעה חדשה" (header) and "צור הצעה ראשונה" (body) are both blue. In an empty screen the header button is redundant scaffolding — precisely the audit's finding #05 applied back at the mockup.
- **The populated state doesn't exist.** This is now the biggest gap in the quotes area: no list design (columns, statuses, status colors), no leads tab design, despite the nav item being "הצעות ולידים". The old screens (12–14) were judged merge/keep but their *new* form was never drawn.
- The empty-state paragraph is one sentence too dense (three lifecycle facts in one breath).

**Decisions:**
1. Empty state: remove the header "+ הצעה חדשה"; the body CTA is the only blue element. Header shows title only.
2. **Spec the populated screen** (for Opus 5 to build in the mockup language):
   - Two tabs under the title: **הצעות · N** / **לידים · N** (tab grammar identical to client-card tabs).
   - Quotes rows: נמען (primary, link when client exists) · סכום (tabular) · סטטוס (one word) · נשלחה (date) · hover actions (שכפול, ✕).
   - Status vocabulary and encoding: טיוטה (gray) · נשלחה (ink) · נחתמה (success) · פגה/נדחתה (gray, strikethrough optional). **No status filter until statuses exist in data** (filters appear when there's something to filter — the audit's rule, applied forward).
   - Leads rows: שם · מקור (הצעה / ידני) · הצעה אחרונה · status flag if stale >30 days. Primary action per lead: "צור הצעה".
   - "ליד חדש" is a quiet text link, not a button — the system creates leads automatically from quotes; manual is the exception (stated in the old מסך13 and worth honoring).
3. Copy: split the paragraph — "ההצעה נשלחת לנמען, והליד נוצר אוטומטית." / "עם החתימה — הליד הופך ללקוח." (second sentence can live in step 03 only).
4. **Client-facing note:** everything the recipient sees (quote page, emails) must carry the accountant's name/brand, not PIVO's (PIVO is the tool; the office is the sender). The builder's live preview must reflect that.

---

### 3.9 מסך16 · דוח 1301 · שאלון (annual report questionnaire)

**Works:** context line above the title (דוח שנתי 1301 · דוד כהן · שנת מס 2025); weighted progress bar + "34 מתוך 55 שדות פעילים"; group-at-a-time with per-group state (9/11); the "מה נגזם ולמה" audit mode with its honest table (פעילים/נגזמו/ממתינים per group + prune reason); field-number captions (שדה 158) under every question; pruned-count note under the group list.

**Problems:**
- **Two "advance" actions compete:** header "שמור והמשך" (primary blue) vs. footer "הבא · נקודות זיכוי" (gray). Which one does a user press after answering? Ambiguity at the highest-frequency decision point of the flow.
- **Only boolean questions exist.** A real 1301 needs amounts (הכנסה חודשית משכירות, sums from 106). There is no currency-input pattern, no "amount pulled from document X, confirm" pattern — the two most common non-boolean interactions are undesigned.
- A "כן" answer that should expand follow-up fields (e.g., "התקבלה הכנסה מהשכרת דירה? → כמה?") has no expansion pattern.
- Exit semantics unspecified: is progress saved per answer (it should be — answers are the state), and where does "יציאה" go?
- The audit-mode intro sentence ("זהו מסך שלך, לא של הלקוח") is designer commentary; the audience distinction matters but belongs in one calm caption, not a manifesto.

**Decisions:**
1. **One advance action.** Footer "הבא · {next group}" becomes the primary (blue) and also saves; the header keeps only a quiet "שמירה אוטומטית ✓" indicator and "יציאה". On the last group the footer becomes "סיום ובדיקה".
2. Design the two missing input patterns in the same grammar:
   - **Currency:** the question row's answer zone becomes a 130px right-aligned tabular input with ₪ suffix; source hint under the field caption ("מתוך טופס 106 — 182,400 ₪ · אשר או תקן").
   - **Conditional expansion:** answering כן slides in indented follow-up rows under the question (same row grammar, 24px indent, hairline-connected). Answering לא collapses and clears them with an undo toast.
3. Autosave on every answer; "יציאה" returns to the client hub, which shows "המשך דוח 2025 · 34/55" as the header CTA (closing the loop with §3.0.5).
4. Audit-mode caption: "מה המערכת כללה, גזמה או ממתינה לו — לכל 116 השורות." One line.

---

### 3.10 מסך17 · מסד נתוני מס (tax database)

**Works:** subtitle states the contract ("המקום היחיד שבו מספר מס נערך. כל תצוגה אחרת מצטטת מכאן."); per-row citation; "מצוטט ב־" column; delta vs. previous year; footer verification line.

**Problems:**
- **Year selection is still screen-local**, and מסך24 hardcodes "2026", and מסך18's sidebar says "ידע מס · 2026". The audit's own fix ("בורר שנת המס עולה לרמת האפליקציה") was not carried into the mockup. Three places declare a year; none share it.
- "מצוטט ב־" values are dead text — the whole point of the column is navigation to the citing tool.
- "עדכן שנת מס" is a button with no flow behind it: who edits values, is there a confirm ("שינוי כאן מתגלגל לכל הכלים"), is there an edit history? For a professional's source of truth, provenance of *edits* matters as much as provenance of values.
- The verification status appears here, in מסך18's sidebar footer, and in the shell's knowledge header ("אומת 07.2026") — three copies of the meta-fact about not copying facts.

**Decisions:**
1. **One year selector for the whole knowledge area**, in the knowledge sidebar header ("ידע מס · [2026 ▾]"). All tools — including מסך24 and the bracket tool — read it. The 1301 flow's year comes from the report, not this selector.
2. "מצוטט ב־" entries are links to the citing tool.
3. Editing flow: row hover → "עריכה"; inline edit with mandatory source field ("אסמכתא — חובה"); confirm dialog stating the citing tools; a quiet "עודכן 12.07.26 · גיא" line on edited rows. "עדכן שנת מס" → creates the next year prefilled from the current one, marked "טיוטה — טרם אומת" until verified.
4. Verification status lives **only** in the sidebar footer. Remove from the shell header and from this screen's footer (keep this screen's footer sentence about the single-source contract — it's the product's promise — but one sentence, not two).

---

### 3.11 מסך18 · ידע מס · הוצאות מוכרות (knowledge shell + expenses tool)

**Works:** the 8-tool sidebar (gateway deleted, one click between tools); title + question-led subtitle; search; verdict columns (מס הכנסה / מע״מ) in words; **color only on the risk column** — the one column where color is information.

**Problems:**
- The shell-vs-sidebar duplication (see §3.0.1 — resolved there).
- Sidebar footer text ("כל הנתונים אומתו 07/2026. הבדיקה הבאה 10/2026.") duplicated by shell header — resolved by §3.10.4.
- Search has no defined behavior/empty result.
- Rows are terminal — no way to see the full rule (conditions, ceiling amounts, the actual תקרה number cited from מסך17).
- Six rows is a demo; the real list is long — no grouping/scale plan (travel, vehicle, home office…).

**Decisions:**
1. Row click → expansion in place (not navigation): the row opens to show the full rule — תקרה (cited value + link to מסך17 row), conditions, and the source line. Same expansion grammar as 1301 conditionals.
2. Search filters rows live; empty → standard "אין הוצאה שתואמת" + suggestion to check נושאים מקצועיים.
3. At >15 rows, introduce category group headers (same GroupHeader component as tasks).
4. This screen's sidebar + header pattern is the **template for the other 7 tools**; Opus 5 rebuilds מסכים 19–26 into it (see §5).

---

### 3.12 מסך24 · ידע מס · ביטוח לאומי (NI calculator)

**Works:** subtitle states the design intent as a user benefit; type-of-insured selector + income input → **the answer at 34px**, breakdown rows, over-cap line; only the relevant table shown, active bracket highlighted (`#f5f8fc` + bold); notes carry the professional caveats (52% מוכר כהוצאה; מדרגה צמודת מדד ולא 60%).

**Problems:**
- Selection grammar violation: the insured-type selector is a *calculation input* (it changes the answer) but uses the gray filter-chip style. Per the grammar (§6.5) inputs that change data/answers are black pills. (Defensible either way — but pick one and write it down; my call: black pill, because the answer changes.)
- Hardcoded "2026" (fixed by the area year selector, §3.10.1).
- 'לא עובד' note says a minimum payment applies, but the calculator outputs 0 for income 0 — the note and the math contradict. Implement the actual minimum (data question for Guy, flag in implementation).
- The subtitle "לא ארבע טבלאות במקביל" describes the old design's sin — self-referential copy. The user never saw the four tables.

**Decisions:** black-pill the selector; bind year to the area selector; implement the minimum-payment floor with a visible line in the breakdown ("מינימום דמי ביטוח — 
XX ₪"); subtitle → "בוחרים סוג מבוטח ומקבלים את התשלום שחל". This screen is the **template for all calculators** (שכר דירה, מדרגות, נקודות זיכוי): inputs top, answer big, breakdown, source table with highlighted row, caveat note.

---

## 4. Cross-cutting issues (system-level)

1. **Selection grammar (codify §6.5):** gray chip = "changes what I see" (filters, view toggles, year switcher, sidebar nav). Black pill = "changes data or an answer" (ball selector, questionnaire answers, calculator inputs). Audit every screen against this.
2. **The red rule (codify §6.3):** red = overdue/blocking/missing-required, nothing else. Current violations: מסך07 and מסך10 (upcoming dates), and three different red hexes (`#d70015`, `#8b1a1a`, plus warning-ish `#b25000` used for both warnings and the stuck state). Collapse to the §7 tokens.
3. **Focus styles do not exist.** Inputs have `outline: none`, nothing defines a replacement, and hover-revealed actions rely on `:focus-within` alone. Define one focus ring (§7.9) applied to every interactive element. This is a hard accessibility requirement, not polish.
4. **Contrast:** `#86868b` at 12–12.5px on white ≈ 3.4:1 — below WCAG AA (4.5:1). Rule: `#86868b` only at ≥13.5px or for genuinely decorative text; metadata that must be readable uses `#6e6e73` (≈4.9:1).
5. **Touch parity for hover actions:** on coarse pointers, row actions render at 40% opacity always (media `(hover: none)`), or the row's tap opens the item where actions live.
6. **Glyph icons (✕ ⋮⋮ ▾ ☾ ‹) are OS-font-dependent** and render inconsistently. Replace with a tiny inline-SVG set (16px, 1.5px stroke, `currentColor`): close, drag, chevron, check, plus, search, external, flag. No icon library dependency (no new packages without asking — project rule).
7. **Date format:** three formats live in the mockups (`26.04.26`, `26.04.2026`, `22/04/25`). Standard: **dd.mm.yy** in lists, **dd.mm.yyyy** in forms/detail. Always tabular-nums.
8. **Vocabulary table (single source):** אצלי · הלקוח · רשויות · תקועה (ball); הושלם/חלקי/חסר/לא נדרש (group states); דד-ליין → **תאריך יעד** (loanword in a Hebrew-first product; "עד מתי" in captions is fine).
9. **Prototype artifacts must not ship:** the footer instruction line, "בפרוטוטייפ מודגם כרטיס אחד" tooltips, locked gray rows, `openableClient` gating, the DEV login button and auto-login debug text on the old login screen.
10. **Redundant self-description:** several screens explain their own design rationale to the user (מסך04 facet note, מסך16 audit intro, מסך17/18 double verification lines, מסך24 subtitle). One calm caption max; rationale belongs in this document, not the UI.

---

## 5. Missing screens & states — the completion list for Opus 5

The mockup covers 11 surfaces. The following must be designed **in the established language** (shell, tokens, components from §7) before/while implementing:

| # | Surface | Base | What to design |
|---|---------|------|----------------|
| M1 | התחברות | old 01 | Strip DEV button + debug copy; logo, two fields, one button. Office name present (PIVO is the tool; the office is the identity clients see). |
| M2 | לקוח חדש (modal) | old 06 | Already right per audit — restyle only: 5 fields, one sentence, שמירה. |
| M3 | הצעות — populated + לידים tab | §3.8.2 | Rows, statuses, lead lifecycle. |
| M4 | בונה הצעת מחיר | old 14 | Keep split builder/preview; one empty-message (in the preview); accountant branding in preview; align controls to token system. |
| M5 | בקשת ייצוג flow | old 11 + RepresentationFillForm/Review | Accountant-side modal (keep), client-side fill page (client-facing = office branding, larger type, single-column), review+sign step. Status chain pending_fill → awaiting_accountant → awaiting_authorities → active shown as one quiet progress line in the client card, not a dashboard. |
| M6 | Knowledge tools 19–26 | מסך18 + מסך24 templates | ניהול ספרים (wizard), נקודות זיכוי (wizard; value cited from מסך17), שכר דירה (calculator; recommended track visually dominant), מדרגות ומס יסף (calculator; table cited from מסך17 — no local copy), יישובים מוטבים (list = the source dataset + search; the file's typeahead cites it), נושאים מקצועיים (plain list; "waiting room" per audit). |
| M7 | המשרד / settings | none | Minimal: office details (name on client-facing surfaces), email settings, data export. One page, one column. |
| M8 | Global states | none | Skeleton rows for lists (3 gray bars per row grammar); toast (bottom-start, RTL-aware) for save/undo; confirm dialog (one component: title, one sentence, מחיקה=danger); error banner for failed loads ("לא הצלחנו לטעון — נסה שוב"); offline note if relevant. |
| M9 | Responsive pass | none | The app is desktop-first (accountant at a desk) — legitimate. Define graceful ≥768px behavior: client card columns stack (hub rail below list), master-detail becomes accordion, tables drop to 3 columns. Phone = read-only triage of tasks (nice-to-have). |
| M10 | Dark mode | index.css groundwork exists | Token-level inversion only (§7.1 defines both values per token). No per-screen dark styling. |

---

## 6. Global design principles

1. **Every screen answers one question.** Tasks: "במה אני מטפל עכשיו?" Hub: "מה הדבר הבא ללקוח הזה?" File: "מה חסר בתיק?" Knowledge: "מה החוק אומר — ומה המקור?" If an element doesn't serve the screen's question, it moves to where its question is asked.
2. **A number appears once, where it leads to action.** No metric cards restating badges; no counting the UI itself. (Already the audit's law — re-affirmed for all new screens.)
3. **Red is a promise.** Red = overdue / blocking / required-and-missing. Never proximity, never decoration. Amber = waiting on someone else. If everything can be red, nothing is.
4. **Constant-in-context is invisible.** Inside a client card, the client's name appears once (header). Inside a knowledge tool, the year appears once (sidebar). Inside a group, the group name appears once.
5. **Two selection grammars, never mixed:** gray chip changes what you *see*; black pill changes what you *save* (or the answer you're computing). Hovering either never looks like the selected state of the other.
6. **Modes are not screens.** Panels, modals, tabs and steps get no page title, no action bar, no year selector of their own. The background stays visible but blurred/dimmed and never interactive.
7. **Empty states teach; loaded states work.** Empty = headline + one sentence + numbered "what will happen" (when a lifecycle exists) + one CTA. No filters, no metrics, no tabs over nothing. The moment data exists, the teaching disappears.
8. **Facts have provenance.** Every tax number shows its source and is stored once (מסך17). Every document/answer that came from OCR or a form shows "from where" until confirmed. Every edit to shared data is attributed and dated.
9. **Progressive disclosure over completeness.** Default view = what's needed for the current decision; "שדות נוספים", row expansion, and audit modes carry the rest. Nothing is deleted from the product — it's re-homed behind one intentional click.
10. **Hebrew-first, professionally toned.** Copy leads with the user's question, states the answer, then the source. No system self-narration, no jargon, no English in user-facing text. Client-facing surfaces carry the office's name, not PIVO's.

---

## 7. Design system recommendations (tokens & components)

### 7.1 Color tokens

| Token | Light | Usage |
|---|---|---|
| `ink-1` | `#1d1d1f` | Titles, primary text, black pills |
| `ink-2` | `#4b4b50` | Body/secondary cell text |
| `ink-3` | `#6e6e73` | Metadata that must be readable (AA at 12px) |
| `ink-4` | `#86868b` | Decorative/large-only metadata (≥13.5px) |
| `ink-quiet` | `#b0b0b6` / `#c7c7cc` | Disabled, empty checkboxes, drag handles |
| `accent` | `#0b6bcb` (hover `#095bad`, deep `#063f78`) | Primary buttons, links — **the only blue** |
| `danger` | `#d70015` | Overdue, blocking, destructive hover. *Retire `#8b1a1a`* → flags use `danger` at 12.5px |
| `warn` | `#b25000` | "Waiting on someone else" (ball הלקוח/רשויות), partial states. *Retire `#8a5b0f`, `#7a5216` (pinned note text may keep its pair — see `note-*`)* |
| `stuck` | `#7a3ea1` | The תקועה state only (already used for רשויות in one screen — reassign: רשויות=warn, תקועה=stuck) |
| `success` | `#34c759` | Completed segments, check hover. Never for text on white (fails contrast) — text version `#2b5f2b` |
| `progress-partial` | `#ffcc00` | Progress segments only |
| `surface-0/1/2` | `#fff` / `#fafafa` (hover) / `#f2f2f4` (inputs, secondary buttons) | |
| `field-read` | `#f7f7f8` | Read-only value boxes |
| `field-missing` | `#fdf2f2` bg + `danger` text | Required & empty |
| `hairline-1/2` | `#ececee` (sections) / `#f0f0f2` (rows) | |
| `canvas` | `#ececed` | Page background behind the app card |
| `note-bg/text` | `#fbf9f2` / `#7a5216` | Pinned note only — the single sanctioned exception |
| `focus` | `accent` at 40% opacity, 2px ring | All interactive elements |

Dark mode: define the dark value for each token once (index.css already has groundwork); screens never hardcode hex.

### 7.2 Typography
Heebo throughout; Space Mono only for step/section numerals in marketing-ish surfaces (empty-state steps).
**Scale (retire half-pixel sizes 14.5/13.5/12.5/11.5):** 12 (captions/labels) · 13 (metadata, chips) · 14 (body, cells) · 15 (emphasized body) · 17 (modal/section titles) · 20 (page titles) · 24 (client name) · 34 (calculator answers). Weights: 400/500/600 only. `letter-spacing: -.01em` at ≥17px. `tabular-nums` on every number, everywhere.

### 7.3 Spacing & radius
4px base grid: 4/8/12/16/20/24/32 (retire 7/9/11/13/22/26 one-offs). Row vertical padding: 8px (dense lists) / 12px (data tables). Radius: **6** chips · **8** inputs/buttons · **12** cards/panels · **14** modals/app frame.

### 7.4 Buttons
Primary (accent bg, white, 500) — **max one per view**. Secondary (`surface-2` bg, ink-1). Quiet (text-only, ink-3→ink-1 hover; accent when it navigates). Danger appears only inside confirm dialogs and as quiet-text ("מחק משימה"). Sizes: 32px (default) / 28px (in-row).

### 7.5 Forms
Inputs = `surface-2` fill, no border, 8px radius, focus ring per 7.1; labels 12/ink-3 above; "חובה" 11.5→12/danger only when empty; read-only = `field-read`; missing-required = `field-missing`. Black-pill segmented control for closed choices (§6.5). SearchSelect (typeahead, ≤10 results) for any list >8 options. Currency input: right-aligned tabular + ₪ suffix.

### 7.6 Tables/lists
CSS grid rows, header row 12/500/ink-4 (omit entirely when ≤3 self-evident columns — מסך10 rule), `hairline-2` between rows, hover `surface-1`, whole row clickable when a detail exists, hover/focus-revealed actions (edit then delete), ≤5 data columns, first column `minmax(0,·fr)` + ellipsis. GroupHeader: title 13.5/600 + count 12.5/ink-4 + optional hint; collapsible; collapsed-by-default for הושלמו.

### 7.7 Cards
Almost none. The app frame and modals are the only shadowed surfaces. The pinned note is the only tinted card. Everything else: hairlines + whitespace.

### 7.8 Icons
Inline SVG, 16px, 1.5px stroke, `currentColor`, ~8 glyphs total (§4.6). No emoji, no font glyphs, no library.

### 7.9 States
Focus: 2px accent ring on every interactive element. Loading: skeleton rows matching the row grammar (never spinners inside lists; a spinner only for full-screen first load). Error: inline banner + retry, never a toast for load failures. Save: autosave where possible + quiet "נשמר ✓"; explicit שמירה only in modals/groups. Destructive: always a confirm dialog naming the object. Toast: bottom, RTL-aware, with undo where reversible.

### 7.10 Reusable component inventory (build once, use everywhere)
`AppShell` · `PageHeader` (title+count+actions) · `TabBar` (nav & client card & quotes) · `FilterChip` · `SelectPill` (black) · `TaskRow` (+`showClient`) · `DataTable` grammar · `GroupHeader` · `ProgressSegments` (weighted) · `MasterDetail` (sidebar list + pane: התיק, 1301, ידע מס) · `Modal` (ghost-blur backdrop) · `ConfirmDialog` · `EmptyState` (headline/sentence/steps/CTA) · `SearchSelect` · `PinnedNote` · `AnswerBlock` (34px number + breakdown) · `SkeletonRow` · `Toast`.

---

## 8. Implementation roadmap

Phases are ordered so each ships value alone and later phases reuse earlier components. Map to the existing codebase (`src/components/…`); the modified `TaskBoard.tsx`/`index.css` work-in-progress aligns with Phase 1.

### Phase 0 — Foundations (prerequisite, small)
Tokens (§7.1–7.3) as CSS variables in `index.css` incl. dark values · focus ring · icon set · vocabulary constants (ball/status labels) in `types/index.ts` labels · date formatter (dd.mm.yy / dd.mm.yyyy). **Also: restore `package.json` (known project issue) before any dependency-touching work.**

### Phase 1 — High impact: the operational core
1. App shell: two-level nav, knowledge entry, stateful client CTA, remove prototype artifacts (§3.0).
2. Tasks list rebuild per §3.1 (incl. the red rule + the overdue-comparison bug already flagged in the audit — **fix the date comparison in code**, it breaks the product's most important signal).
3. Task edit modal per §3.2.
4. Clients list per §3.3.
5. EmptyState component + empty/loading/confirm states for these three screens.

### Phase 2 — High impact: the client card
6. Hub per §3.4 (incl. "בקש מהלקוח" email flow — reuse the existing visible-email rule).
7. תיק per §3.5 (inline group editing, settlement SearchSelect, weighted progress, repeaters, OCR entry).
8. Documents per §3.6 (preview, dropzone upload, confirms).
9. Client tasks per §3.7 (reuse TaskRow).

### Phase 3 — Medium: revenue & flows
10. Quotes empty + populated + leads (M3, §3.8) and builder alignment (M4).
11. Representation-request flow restyle (M5).
12. New-client modal (M2), login cleanup (M1).

### Phase 4 — Medium: knowledge area
13. Knowledge shell: sidebar as sole nav + area year selector (§3.10.1, §3.11).
14. מסד נתוני מס editing/provenance/links (§3.10) — all tools read from it.
15. Expenses row-expansion (§3.11); NI fixes (§3.12); rebuild tools 19–26 on the two templates (M6).
16. 1301 questionnaire: single advance action, currency & conditional patterns, autosave (§3.9).

### Phase 5 — Nice-to-have: polish & reach
17. Command palette (⌘K). 18. Dark mode via tokens (M10). 19. Responsive pass (M9). 20. המשרד settings (M7). 21. A11y audit: contrast sweep, keyboard walkthrough, `role`/`aria` on modal, tabs, comboboxes.

### Explicitly out of scope for the redesign
Tax-calculation logic, storage model (localStorage/IndexedDB), the email/notification system's behavior (only its entry points move), and SPEC.md.

---

## Appendix A — Known data/logic items surfaced by this review (not design, must not be lost)
- Overdue marking compares wrongly (flags future dates) — old audit, still open; Phase 1 item.
- NI minimum payment for 'לא עובד' not implemented in the calculator math (§3.12).
- Ball-state color reassignment (רשויות: warn; תקועה: stuck) touches `types/index.ts` label/color mapping.
- Filters must be derived from data (hide single-value facets) — currently static lists in the prototype.

## Appendix B — Open product questions for Guy (block nothing; defaults chosen)
1. Manual "urgent" flag on tasks — keep as a flag glyph, or let date-proximity alone drive grouping? *(Default chosen: date-driven; flag optional later.)*
2. Is ידע מס forever a private reference (current assumption), or a future client-facing product? The prior audit already flagged that a "yes" reshapes the map. *(Default: private.)*
3. Phone-sized usage: is read-only task triage on mobile worth Phase 5 effort? *(Default: yes, read-only.)*
