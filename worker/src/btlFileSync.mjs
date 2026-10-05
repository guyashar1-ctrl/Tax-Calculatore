// btlFileSync.mjs — הלוגיקה הטהורה של «עדכן נתונים מביטוח לאומי».
//
// ‼ החלוקה מכוונת, בדיוק כמו btlTracking.mjs: הדף מחזיר **טקסט בלבד**
// (טבלאות כמערכי מחרוזות, זוגות תווית/ערך), וכל ההכרעה — מיפוי עמודות,
// תאריכים, בחירת רשומה, שרשור עיסוקים — קורית כאן, בלי Chrome, ונבדקת
// ב-worker/test/btl-file-sync.test.mjs על נתונים שנצפו בהקלטה.
//
// ‼ כל העוגנים כאן נצפו בהקלטה של גיא (23.09.2026, «יישור קוו ביטוח לאומי
// + מחשבון»), על מבוטח אמיתי:
//   · ריכוז מידע (v101_rikuzmedagalash): «דמי ביטוח: 2026 / 7-9 בסיס : עצמאי
//     47,583 ד"ב : 2026/1 סכום : 2062», «יתרה: 0», «עיסוק: עצמאי מ-01/06/25
//     תלמיד להשכלה גבוהה מ-01/10/23 עד 30/09/26».
//   · רשימת עיסוקים (v135_reshimatisukim): טבלת **תקופות** — כל שורה היא
//     צירוף מעמדות לטווח תאריכים («עצמאי, תלמיד להשכלה גבוהה» 01/06/2025–
//     30/09/2026), לא שורה לכל עיסוק.
//   · עיסוקים בתקופה (v135tk_isukimbetkufa): הפירוט של שורה אחת — כאן כל
//     עיסוק מופיע עם התאריכים **שלו** («תלמיד להשכלה גבוהה» 01/10/2024–
//     30/09/2025 ו-01/10/2025–30/09/2026; «עצמאי» מ-01/06/2025 בלי סוף).
//   · רשימת הכנסות (v141_reshimathachnasot): שנה · מחודש · עד חודש · מקור
//     מידע · מקור הכנסה · סכום הכנסה · תאריך קבלה · תיקון מקדמות · סטטוס.
//   · הרשאות לחיוב (v258_horaotkeva): מתאריך · עד תאריך · סטטוס · פרטי חשבון.
//   · לפי ימי ערך ריאלי (v536_s_cisuiimbyyomerech): … · סכום מצטבר.
//
// ‼ נוסף אחרי בדיקה חיה לקריאה בלבד (28.09.2026, מסכי המייצג):
//   · פירוט עיסוק (v135z_perutisuk) — «עיסוקים בתקופה» → «הצגת פרטי רשומה»:
//     מתאריך · עד תאריך · תאריך רישום · הכנסה להגדרה · שעות עבודה בשבוע
//     (שלושה כפתורי רדיו נעולים: «1 עד 11 שעות» / «12 עד 19 שעות» / «20 שעות
//     ומעלה») · שורת ההגדרה («עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר
//     הממוצע») · משלח יד · מקור מידע · «מצב: תקף».
//   · בתוצאות «חיפוש מיוצגים» יש עמודות נוספות: הרשאה לגימלאות · הרשאה
//     לחיוב («חשבון בנק») · מזהה פנקס · סטטוס («ממתין לאישור»), ובעמודת
//     הפעולות לעיתים «ממתין תוקף».
//
// ‼ בדיקה חיה שנייה (28.09.2026, קריאה בלבד, כמה מבוטחים, פלט ממוסך):
//   · ריכוז מידע (v101_rikuzmedagalash): מצב משפחתי · תושבות («כן») · חובת
//     תשלום («עצמאי», «עובד (+)») · כיסוי ביטוחי («זו"ש מ- MM/YY») · ביקורת
//     גביה (תווית כפולה; «MM/YY-MM/YY») · הסדר תשלומים · אכיפה · תיק ניכויים
//     — ריקים אצל רובם. ‼ ריכוז המידע אינו המסך שנפתח תמיד: הפורטל פותח את
//     המסך האחרון שנצפה במבוטח, ולכן מזהים אותו לפי הכתובת.
//   · תיק מסמכים (my_scanimages): פעולות · תאור («דין וחשבון», «יפויי כוח») ·
//     עמ' · תאריך. לכפתור הצפייה יש נתיב סריקה אטום (144–192 תווים), יציב בין
//     טעינות באותו סשן. אין מספר אסמכתא. בלי מסמכים — אין טבלה ואין הודעה.
//   · רשימת הודעות (v311_s611_hodaot): תאריך · סוג הודעה · מצב · מען.
//   · גמלאות (vgimla_s_gimlaot): שנה · תאור גמלה («מילואים», «אבטלה») · גמלה
//     ברוטו · ניכוי מס · החזר חוב ברוטו · החזר מס. בלי גמלאות — אין טבלה.
//   · «הרשאה לגימלאות» ו«מזהה פנקס» — ריקות בכל השורות שנבדקו.
//   · דמי ביטוח (v241_dmeibituach): טבלה שנתית עם כותרת כפולה — שורת קבוצות
//     («עצמאי», «לא עובד») מעל: פעולות · שנה · לפי שומה · מס מקביל · ביטוח
//     בריאות · [חיוב · בסיס סופי שנתי · דמי ביטוח לשנה] לכל קבוצה · סה"כ דמי ביטוח.
//   · חוב גמלה (v261_chovotgimla) ורשימת תכתובות (v842_s_matalot): «לא נמצאו
//     נתונים» אצל המבוטח שנבדק — ולכן נקראת רק הספירה, לא התוכן.

import { sameIdNumber } from './btlTracking.mjs';

export { sameIdNumber };

/** רווחים מנורמלים. */
export function norm(s) {
  return String(s ?? '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
}

/** ת.ז. להצגה בלוג — שלוש ספרות אחרונות בלבד. */
export function maskId(id) {
  const d = String(id ?? '').replace(/\D/g, '');
  return d ? `…${d.slice(-3)}` : '—';
}

/** «15/06/2025» ⇒ «2025-06-15»; «01/10/23» ⇒ «2023-10-01». אחרת null. */
export function parseBtlDate(s) {
  const m = norm(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * «47,583» ⇒ 47583; «2,062 ח» ⇒ 2062; «-320» ⇒ -320; «320 ז» ⇒ -320.
 * ‼ ח/ז: חובה/זכות — כך הפורטל מסמן בעמודות החובה והזכות של מצב החשבון.
 * ריק או לא-מספר ⇒ null (ולא 0: «אין ערך» אינו «אפס»).
 */
export function parseMoney(s) {
  const t = norm(s);
  const m = t.match(/(-)?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(ח|ז)?$/);
  if (!m) return null;
  let n = Number(m[2].replace(/,/g, '') + (m[3] ?? ''));
  if (!Number.isFinite(n)) return null;
  if (m[1] === '-' || m[4] === 'ז') n = -n;
  return n;
}

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** «יוני» / «6» ⇒ 6. */
export function parseMonth(s) {
  const t = norm(s).replace(/['׳"״]/g, '');
  if (/^\d{1,2}$/.test(t)) { const n = Number(t); return n >= 1 && n <= 12 ? n : null; }
  const i = HEBREW_MONTHS.findIndex(m => m === t || m.startsWith(t) && t.length >= 3);
  return i >= 0 ? i + 1 : null;
}

// ─── טבלאות ─────────────────────────────────────────────────────────────────

/**
 * מתוך כל הטבלאות שנגרדו — זו שיש בה את **כל** הכותרות הנדרשות. ‼ לא
 * «הראשונה שמכילה מילה»: בעמודים האלה יש טבלאות מעטפת ופאנלים שמכילים את
 * המילים. יותר ממועמדת אחת עם אותן כותרות ⇒ ambiguous, לא ניחוש.
 */
export function pickTable(tables, requiredHeaders) {
  const hits = [];
  for (const t of tables ?? []) {
    const headers = (t.headerCells ?? []).map(norm);
    const cols = {};
    let all = true;
    for (const h of requiredHeaders) {
      const i = headers.indexOf(h);
      if (i < 0) { all = false; break; }
      cols[h] = i;
    }
    if (all) hits.push({ table: t, cols });
  }
  if (hits.length === 0) return { ok: false, reason: 'table_not_found' };
  // אותה טבלה עשויה להיגרד פעמיים (טבלה בתוך טבלה) — מאחדים לפי תוכן.
  const uniq = [...new Map(hits.map(h => [JSON.stringify(h.table.dataRows), h])).values()];
  if (uniq.length > 1) return { ok: false, reason: 'ambiguous_table' };
  return { ok: true, ...uniq[0] };
}

const cell = (row, i) => norm(row?.[i]);

// ─── עיסוקים ───────────────────────────────────────────────────────────────

const OCC_HEADERS = ['עיסוקים', 'מתאריך', 'עד תאריך'];

/** «( ללא עיסוק )» — תקופה בלי עיסוק. אינה עיסוק ואין לה פירוט. */
function isNoOccupation(label) {
  return /ללא\s*עיסוק/.test(label);
}

/**
 * «רשימת עיסוקים» — שורות **תקופה**. כל שורה: טווח תאריכים וצירוף
 * מעמדות מופרד בפסיקים. `index` הוא מיקום השורה בטבלה, כדי שהסשן יוכל
 * ללחוץ על הפירוט שלה.
 */
export function parseOccupationSegments(tables) {
  const t = pickTable(tables, OCC_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const segments = [];
  t.table.dataRows.forEach((row, index) => {
    const label = cell(row, t.cols['עיסוקים']);
    const fromDate = parseBtlDate(cell(row, t.cols['מתאריך']));
    if (!label || !fromDate) return;
    const toRaw = cell(row, t.cols['עד תאריך']);
    const toDate = toRaw ? parseBtlDate(toRaw) : null;
    if (toRaw && !toDate) return;
    const names = isNoOccupation(label) ? [] : label.split(',').map(norm).filter(Boolean);
    segments.push({
      index, label, names, fromDate, toDate,
      drillable: names.length > 0 && (t.table.rowHasAction?.[index] ?? true),
    });
  });
  return { ok: true, segments };
}

/**
 * «עיסוקים בתקופה» — כאן כל שורה היא עיסוק אחד עם התאריכים שלו. `index` —
 * מיקום השורה בטבלה, כדי שהסשן יוכל לפתוח את «פירוט עיסוק» שלה.
 */
export function parseOccupationRecords(tables) {
  const t = pickTable(tables, OCC_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const records = [];
  t.table.dataRows.forEach((row, index) => {
    const label = cell(row, t.cols['עיסוקים']);
    const fromDate = parseBtlDate(cell(row, t.cols['מתאריך']));
    if (!label || !fromDate || isNoOccupation(label)) return;
    const toRaw = cell(row, t.cols['עד תאריך']);
    const toDate = toRaw ? parseBtlDate(toRaw) : null;
    if (toRaw && !toDate) return;
    records.push({ label, fromDate, toDate, index });
  });
  return { ok: true, records };
}

// ─── פירוט עיסוק ────────────────────────────────────────────────────────────

const HOURS_BANDS = [
  [/^1\s*עד\s*11\b/, '1_11'],
  [/^12\s*עד\s*19\b/, '12_19'],
  [/^20\s*שעות\s*ומעלה/, '20_plus'],
];

/** תווית כפתור הרדיו ⇒ הטווח. ‼ טווח כפי שב"ל רשם — לא מומר למספר שעות. */
export function hoursBandFromLabel(label) {
  const t = norm(label);
  for (const [re, band] of HOURS_BANDS) if (re.test(t)) return band;
  return null;
}

const MAX_DETAILS_PER_SEGMENT = 2;

/**
 * אילו רשומות בפירוט התקופה לפתוח ל«פירוט עיסוק»: רק עיסוק עצמאי שבתוקף
 * (שם השעות וההכנסה להגדרה רלוונטיים ל-6101 ולהגדרת עצמאי). ‼ לא פותחים
 * כל רשומה — כל לחיצה היא ניווט בחלון של הרו"ח.
 */
export function recordsToDetail(tables, asOf) {
  const r = parseOccupationRecords(tables);
  if (!r.ok) return [];
  return r.records
    .filter(x => /^עצמאי/.test(x.label) && (x.toDate == null || x.toDate >= asOf))
    .map(x => x.index)
    .slice(0, MAX_DETAILS_PER_SEGMENT);
}

/**
 * «פירוט עיסוק» ⇒ נתונים. הקלט מהסשן: זוגות תווית/ערך, מצב כפתורי הרדיו,
 * ושורות טקסט שמכילות «הגדרה» או «מצב:» בלבד (שם הפקיד ושורת «יצירה» לא
 * יוצאים מהדף). ‼ שדה שלא נמצא ⇒ null, לא 0 ולא ניחוש. שורת ההגדרה נשמרת
 * כלשונה; הכלל (שעות · אחוז מהשכר הממוצע) מפורק רק בנוסח שנצפה.
 */
export function parseOccupationDetail(raw) {
  const v = (label) => pairValues(raw?.pairs, label)[0] ?? '';
  const fromDate = parseBtlDate(v('מתאריך'));
  if (!fromDate) return { ok: false, reason: 'detail_unparseable' };
  const toRaw = v('עד תאריך');
  const toDate = toRaw ? parseBtlDate(toRaw) : null;
  const checked = (raw.radios ?? []).filter(r => r?.checked);
  const lines = (raw.lines ?? []).map(norm).filter(Boolean);
  const definitionText = lines.find(l => /לפי הגדרה|עונה להגדרה/.test(l)) ?? null;
  const rule = definitionText?.match(/לפי הגדרה של\s*(\d+)\s*שעות\s*ו-?\s*(\d+)\s*%\s*מהשכר הממוצע/);
  const statusLine = lines.find(l => /^מצב\s*:/.test(l));
  const heading = norm(raw.heading ?? '').match(/^עיסוק\s*-\s*(.+)$/);
  return {
    ok: true,
    value: {
      label: heading ? norm(heading[1]) : null,
      fromDate,
      toDate,
      hoursBand: checked.length === 1 ? hoursBandFromLabel(checked[0].label) : null,
      definitionIncome: parseMoney(v('הכנסה להגדרה')),
      definitionText,
      definitionRule: rule ? { weeklyHours: Number(rule[1]), averageWagePct: Number(rule[2]) } : null,
      profession: v('משלח יד') || null,
      registeredDate: parseBtlDate(v('תאריך רישום')),
      status: statusLine ? norm(statusLine.replace(/^מצב\s*:/, '')) || null : null,
    },
  };
}

/**
 * מצמיד לכל רשומה את הפירוט שנפתח לה — רק אחרי אימות: הכותרת בדף הפירוט
 * היא של המבוטח הזה, והפירוט הוא של אותה רשומה (אותו «מתאריך»). ‼ פירוט
 * שלא אומת נזרק עם אזהרה; הרשומה עצמה נשארת.
 */
export function attachDetails(records, details, idNumber) {
  const warnings = [];
  for (const det of details ?? []) {
    const rec = records.find(r => r.index === det.index);
    if (!rec) continue;
    if (!det.ok) { warnings.push(`detail_failed:${rec.label}`); continue; }
    const hdr = parseInsuredHeader(det.pairs);
    if (!hdr.idNumber || !sameIdNumber(hdr.idNumber, idNumber)) { warnings.push(`detail_identity_unverified:${rec.label}`); continue; }
    const p = parseOccupationDetail(det);
    if (!p.ok) { warnings.push(`detail_unparseable:${rec.label}`); continue; }
    if (p.value.fromDate !== rec.fromDate || (p.value.label && p.value.label !== rec.label)) {
      warnings.push(`detail_mismatch:${rec.label}`);
      continue;
    }
    const { label: _l, fromDate: _f, toDate, ...rest } = p.value;
    rec.detail = { ...rest, periodFrom: rec.fromDate, periodTo: toDate ?? null };
  }
  return warnings;
}

/** השורות שצריך לפרט: אלה שעדיין בתוקף היום או אחריו. */
export function segmentsToDrill(segments, asOf) {
  return segments.filter(s => s.drillable && (s.toDate == null || s.toDate >= asOf));
}

/**
 * מאחד רשומות של אותו עיסוק לרצף אחד כשהן צמודות (סוף + יום = התחלה) או
 * חופפות. ‼ עיסוקים **שונים** לעולם לא מאוחדים ולא נחתכים זה מול זה — אדם
 * יכול להיות עצמאי וסטודנט באותה תקופה. הרשומות המקוריות נשמרות
 * ב-`sourcePeriods`, כך שדבר מהמקור לא אובד באיחוד.
 *
 * ‼ «בתוקף» = בלי תאריך סיום, או שתאריך הסיום היום או אחריו.
 */
export function buildOccupationChains(records, asOf) {
  const byLabel = new Map();
  const seen = new Map();
  for (const r of records) {
    const key = `${r.label}|${r.fromDate}|${r.toDate ?? ''}`;
    if (seen.has(key)) {
      // אותה רשומה משתי תקופות — הפירוט שנקרא באחת מהן לא הולך לאיבוד.
      const first = seen.get(key);
      if (!first.detail && r.detail) first.detail = r.detail;
      continue;
    }
    seen.set(key, r);
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label).push(r);
  }
  const chains = [];
  for (const [label, list] of byLabel) {
    list.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    let cur = null;
    for (const r of list) {
      const continues = cur && (cur.toDate == null || r.fromDate <= addDays(cur.toDate, 1));
      if (continues) {
        cur.sourcePeriods.push({ fromDate: r.fromDate, toDate: r.toDate });
        if (cur.toDate != null && (r.toDate == null || r.toDate > cur.toDate)) cur.toDate = r.toDate;
      } else {
        cur = { sourceLabel: label, fromDate: r.fromDate, toDate: r.toDate, sourcePeriods: [{ fromDate: r.fromDate, toDate: r.toDate }] };
        chains.push(cur);
      }
    }
  }
  // ‼ הפירוט של הרצף = זה של הרשומה המאוחרת ביותר שנפתחה לה (המצב הנוכחי).
  for (const c of chains) {
    const withDetail = list0(byLabel.get(c.sourceLabel))
      .filter(r => r.detail && r.fromDate >= c.fromDate && (c.toDate == null || r.fromDate <= c.toDate))
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0];
    if (withDetail) c.detail = withDetail.detail;
  }
  return chains
    .filter(c => c.toDate == null || c.toDate >= asOf)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.sourceLabel.localeCompare(b.sourceLabel));
}

function list0(x) { return x ?? []; }

/**
 * רצף שמתחיל לפני כל מה שפורט עד כה עשוי להמשיך אחורה: הרשומה הראשונה
 * שלו מתחילה באמצע תקופה קודמת. אם התקופה שמכילה את היום שלפני כן כוללת
 * את אותו עיסוק — צריך לפרט גם אותה. ‼ כך תאריך ההתחלה אינו תלוי בשורה
 * שבמקרה פירטנו.
 */
export function extensionTargets(chains, segments, drilled) {
  const out = new Set();
  for (const c of chains) {
    const dayBefore = addDays(c.fromDate, -1);
    const s = segments.find(x => x.fromDate <= dayBefore && (x.toDate == null || x.toDate >= dayBefore));
    if (s && s.drillable && !drilled.has(s.index) && s.names.includes(c.sourceLabel)) out.add(s.index);
  }
  return [...out];
}

/**
 * «עצמאי מ-01/06/25 תלמיד להשכלה גבוהה מ-01/10/23 עד 30/09/26» ⇒ עיסוקים
 * עם תאריכים. ‼ שנה בשתי ספרות — ולכן זו **בדיקת עקביות** מול הפירוט ולא
 * מקור. שם שלא ניתן להפריד בוודאות מוחזר כמו שהוא.
 */
export function parseOccupationSummary(text) {
  const t = norm(text);
  const re = /(.+?)\s*מ-?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s*עד\s*(\d{1,2}\/\d{1,2}\/\d{2,4}))?/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    out.push({ sourceLabel: norm(m[1]), fromDate: parseBtlDate(m[2]), toDate: m[3] ? parseBtlDate(m[3]) : null });
  }
  return out;
}

/** אזהרות כשהסיכום של הפורטל אינו מתיישב עם הפירוט. לא חוסם — מתועד. */
export function compareWithSummary(chains, summary) {
  const warnings = [];
  for (const s of summary) {
    const c = chains.find(x => x.sourceLabel === s.sourceLabel);
    if (!c) { warnings.push(`occupation_in_summary_only:${s.sourceLabel}`); continue; }
    if (s.fromDate && s.fromDate !== c.fromDate) warnings.push(`start_differs:${s.sourceLabel}:${s.fromDate}`);
    if ((s.toDate ?? null) !== (c.toDate ?? null)) warnings.push(`end_differs:${s.sourceLabel}:${s.toDate ?? 'open'}`);
  }
  return warnings;
}

// ─── ריכוז מידע וכותרת המבוטח ──────────────────────────────────────────────

/** ערכי תווית מתוך הזוגות שנגרדו («יתרה:» ⇒ כל הערכים שנמצאו לה). */
export function pairValues(pairs, label) {
  const want = norm(label).replace(/:$/, '');
  return (pairs ?? [])
    .filter(p => norm(p.label).replace(/:$/, '') === want)
    .map(p => norm(p.value))
    .filter(Boolean);
}

/**
 * «2026 / 7-9 בסיס : עצמאי 47,583 ד"ב : 2026/1 סכום : 2062» ⇒
 * { year:2026, fromMonth:7, toMonth:9, months:3, basisCategory:'עצמאי',
 *   periodBasis:47583, advanceMonthly:2062 }.
 * ‼ «סכום» הוא המקדמה החודשית — ‏2,062 בכל אחד מחודשי 2026 בפירוט החודשים.
 */
export function parseAdvanceLine(text) {
  const t = norm(text);
  const period = t.match(/(\d{4})\s*\/\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/) ?? t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (!period) return null;
  let year, a, b;
  if (period[1].length === 4) { year = Number(period[1]); a = Number(period[2]); b = Number(period[3]); }
  else { a = Number(period[1]); b = Number(period[2]); year = Number(period[3]); }
  const fromMonth = Math.min(a, b), toMonth = Math.max(a, b);
  if (fromMonth < 1 || toMonth > 12) return null;
  const basis = t.match(/בסיס\s*:\s*([^\d:]*?)\s*(\d{1,3}(?:,\d{3})+|\d+)/);
  const amount = t.match(/סכום\s*:\s*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!basis || !amount) return null;
  return {
    year, fromMonth, toMonth, months: toMonth - fromMonth + 1,
    basisCategory: norm(basis[1]) || null,
    periodBasis: parseMoney(basis[2]),
    advanceMonthly: parseMoney(amount[1]),
    raw: t,
  };
}

/**
 * כותרת המבוטח שמופיעה בראש כל מסך אחרי שנפתח: «שם · זהות: … · טלפון ·
 * יתרה: 0 · הרשאת חיוב: חשבון בנק · ח.עתידי: לא».
 */
export function parseInsuredHeader(pairs) {
  const id = pairValues(pairs, 'זהות')[0] ?? null;
  const balances = pairValues(pairs, 'יתרה').map(parseMoney).filter(n => n != null);
  const debit = pairValues(pairs, 'הרשאת חיוב')[0] ?? null;
  return { idNumber: id ? id.replace(/\D/g, '') : null, balance: balances.length ? balances[0] : null, debitType: debit };
}

// ─── ריכוז מידע: מה ב"ל רושם על המבוטח ─────────────────────────────────────

const FAMILY_STATUS = [
  [/^רווק/, 'single'], [/^נשו/, 'married'], [/^גרו/, 'divorced'], [/^אלמ/, 'widowed'],
  [/^פרוד/, 'separated'], [/ידוע/, 'common_law'],
];

/** «רווק» / «נשואה» ⇒ קוד. נוסח שלא מוכר ⇒ null (והנוסח נשמר כלשונו). */
export function familyStatusCode(raw) {
  const t = norm(raw);
  if (!t) return null;
  const hit = FAMILY_STATUS.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
}

/**
 * התוויות שנקראות — רק מה שיש לו משמעות ברורה ושימוש: השוואה לכרטיס (מצב
 * משפחתי), סיווג לתשלום (חובת תשלום), וסימנים לטיפול (אכיפה, הסדר, ביקורת).
 * ‼ לא: שם, כתובת, טלפון, סניף, תאריך לידה — קיימים בכרטיס ואינם מתעדכנים מכאן.
 */
export const SUMMARY_FACT_LABELS = {
  familyStatus: 'מצב משפחתי',
  residency: 'תושבות',
  paymentObligation: 'חובת תשלום',
  coverage: 'כיסוי ביטוחי',
  enforcement: 'אכיפה',
  paymentArrangement: 'הסדר תשלומים',
  collectionAudit: 'ביקורת גביה',
  withholdingFile: 'תיק ניכויים',
};

/**
 * `pairs` מריכוז המידע (כולל תוויות עם ערך ריק) ⇒ עובדות. ‼ תווית שנמצאה
 * עם ערך ריק = «אין» לפי ב"ל (raw:null); תווית שלא נמצאה = המפתח חסר (לא
 * נקרא). בלי «מצב משפחתי» ו«חובת תשלום» — זה לא ריכוז המידע (ok:false).
 */
export function parseSummaryFacts(pairs) {
  const byLabel = new Map();
  for (const p of pairs ?? []) {
    const label = norm(p.label).replace(/:$/, '');
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(norm(p.value));
  }
  if (!byLabel.has('מצב משפחתי') || !byLabel.has('חובת תשלום')) return { ok: false, reason: 'summary_labels_missing' };
  const value = {};
  for (const [key, label] of Object.entries(SUMMARY_FACT_LABELS)) {
    if (!byLabel.has(label)) continue;
    const vals = [...new Set(byLabel.get(label).filter(Boolean))];
    value[key] = { raw: vals.length ? vals.join(' · ').slice(0, 120) : null };
  }
  if (value.familyStatus) value.familyStatus.code = familyStatusCode(value.familyStatus.raw);
  // «זו"ש מ- 06/25» ⇒ החודש שממנו. נוסח אחר ⇒ רק הגולמי.
  const cov = value.coverage?.raw?.match(/מ-?\s*(\d{1,2})\/(\d{2,4})/);
  if (cov) value.coverage.sinceMonth = `${cov[2].length === 2 ? '20' + cov[2] : cov[2]}-${cov[1].padStart(2, '0')}`;
  return { ok: true, value };
}

// ─── תיק מסמכים ─────────────────────────────────────────────────────────────

const DOC_HEADERS = ['תאור', 'תאריך'];

/**
 * «תיק מסמכים» ⇒ מסמכים (תיאור · עמודים · תאריך · הפניית סריקה מגובבת).
 * ‼ `scanRefs[i]` — טביעה של נתיב הסריקה (לא הנתיב עצמו), לשורה i.
 * טבלה ריקה (empty) ⇒ רשימה ריקה = «אין מסמכים» לפי ב"ל.
 */
export function parseDocumentList(tables, scanRefs = []) {
  const t = pickTable(tables, DOC_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const pagesCol = (t.table.headerCells ?? []).map(norm).findIndex(h => /^עמ/.test(h));
  const items = [];
  t.table.dataRows.forEach((row, i) => {
    const description = cell(row, t.cols['תאור']).slice(0, 120);
    const date = parseBtlDate(cell(row, t.cols['תאריך']));
    if (!description || !date) return;
    const pages = pagesCol >= 0 ? Number(cell(row, pagesCol)) : NaN;
    items.push({
      description, date,
      ...(Number.isInteger(pages) && pages > 0 ? { pages } : {}),
      ...(scanRefs[i] ? { scanRef: scanRefs[i] } : {}),
    });
  });
  items.sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  return { ok: true, items };
}

/** «דין וחשבון» — הדוח שטופס 6101 הוא (וגם דוחות רב-שנתיים אחרים). */
export function isReportDocument(description) {
  return /דין\s*ו?חשבון/.test(norm(description));
}

// ─── רשימת הודעות ───────────────────────────────────────────────────────────

const NOTICE_HEADERS = ['תאריך', 'סוג הודעה'];

/**
 * ‼ רק הודעות שמשפיעות על סיווג, דוח/6101, מסמכים חסרים, החלטת רשות או
 * מילואים נשמרות — ורק המטא-דאטה (סוג · תאריך · מצב), לא תוכן. דף תשלומים,
 * אישור תשלום, תזכורת חוב, הודעת שחרור מצה"ל וכו' ⇒ נספרות בלבד.
 */
const NOTICE_CATEGORIES = [
  ['report', /דין\s*ו?חשבון|6101/],
  ['documents', /מסמכ|חסר/],
  ['reserve_duty', /מילואים|תגמול/],
  ['assessment', /שומה/],
  ['representation', /יפוי|ייפוי/],
  ['decision', /החלטה|זכאות|דחיי|ערעור/],
  ['insured_update', /^עדכונים\s*למבוטח/],
];

export function noticeCategory(type) {
  const t = norm(type);
  const hit = NOTICE_CATEGORIES.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}

export function parseNoticeList(tables) {
  const t = pickTable(tables, NOTICE_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const stateCol = (t.table.headerCells ?? []).map(norm).indexOf('מצב');
  const items = [];
  let otherCount = 0;
  for (const row of t.table.dataRows) {
    const date = parseBtlDate(cell(row, t.cols['תאריך']));
    const type = cell(row, t.cols['סוג הודעה']).slice(0, 120);
    if (!date || !type) continue;
    const category = noticeCategory(type);
    if (!category) { otherCount++; continue; }
    items.push({ date, type, category, ...(stateCol >= 0 && cell(row, stateCol) ? { state: cell(row, stateCol).slice(0, 60) } : {}) });
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
  return { ok: true, items: items.slice(0, 40), otherCount };
}

// ─── גמלאות — מילואים ───────────────────────────────────────────────────────

const BENEFIT_HEADERS = ['שנה', 'תאור גמלה', 'גמלה ברוטו'];

/**
 * «גמלאות» ⇒ שורות המילואים בלבד (שנה · ברוטו · ניכוי מס · החזרים). גמלאות
 * אחרות ⇒ נספרות בלבד. ‼ אלה סכומים שנתיים ששולמו — לא מצב תביעה ולא
 * תאריכי תשלום; אין במסך הזה פעולה למייצג.
 */
export function parseReserveDutyBenefits(tables) {
  const t = pickTable(tables, BENEFIT_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const hs = (t.table.headerCells ?? []).map(norm);
  const col = h => hs.indexOf(h);
  const rows = [];
  let otherBenefitsCount = 0;
  for (const row of t.table.dataRows) {
    const year = Number(cell(row, t.cols['שנה']));
    const benefit = cell(row, t.cols['תאור גמלה']);
    if (!Number.isInteger(year) || year < 1990 || !benefit) continue;
    if (!/מילואים/.test(benefit)) { otherBenefitsCount++; continue; }
    const money = h => (col(h) >= 0 ? parseMoney(cell(row, col(h))) : null);
    rows.push({
      year, benefit: benefit.slice(0, 60),
      gross: parseMoney(cell(row, t.cols['גמלה ברוטו'])),
      taxWithheld: money('ניכוי מס'),
      debtRepaymentGross: money('החזר חוב ברוטו'),
      taxRefund: money('החזר מס'),
    });
  }
  rows.sort((a, b) => b.year - a.year || (b.gross ?? 0) - (a.gross ?? 0));
  return { ok: true, rows, otherBenefitsCount };
}

// ─── דמי ביטוח שנתיים ───────────────────────────────────────────────────────

/**
 * «דמי ביטוח» ⇒ שורה לכל שנה. `rows` — תאי הטבלה כפי שנגרדו (כולל שורת
 * הקבוצות שמעל הכותרות). ‼ השיוך של [חיוב · בסיס · דמי ביטוח] לסיווג נעשה לפי
 * הסדר: שמות הקבוצות הלא-ריקים בשורה שמעל ⇔ כל «חיוב» בשורת הכותרות. מספר
 * שונה ⇒ לא מנחשים (ok:false).
 */
export function parseAnnualContributions(rows) {
  const clean = (rows ?? []).map(r => (r ?? []).map(norm));
  const h = clean.findIndex(r => r.includes('שנה') && r.some(c => /^סה"?כ דמי ביטוח$/.test(c)));
  if (h < 0) return { ok: false, reason: 'table_not_found' };
  const header = clean[h];
  const groups = h > 0 ? clean[h - 1].filter(Boolean) : [];
  const chargeCols = header.map((c, i) => (c === 'חיוב' ? i : -1)).filter(i => i >= 0);
  if (groups.length !== chargeCols.length) return { ok: false, reason: 'group_mismatch' };
  const col = (name) => header.indexOf(name);
  const totalCol = header.findIndex(c => /^סה"?כ דמי ביטוח$/.test(c));
  const years = [];
  for (const r of clean.slice(h + 1)) {
    const year = Number(r[col('שנה')]);
    if (!Number.isInteger(year) || year < 1990) continue;
    const yn = r[col('לפי שומה')];
    const classes = [];
    groups.forEach((classification, g) => {
      const i = chargeCols[g];
      const charge = r[i] || null;
      const annualBase = parseMoney(r[i + 1]);
      const annualContribution = parseMoney(r[i + 2]);
      if (charge || annualBase != null || annualContribution != null) classes.push({ classification, charge, annualBase, annualContribution });
    });
    years.push({
      year,
      byAssessment: yn === 'כן' ? true : yn === 'לא' ? false : null,
      classes,
      total: parseMoney(r[totalCol]),
    });
  }
  years.sort((a, b) => b.year - a.year);
  return { ok: true, years: years.slice(0, 12) };
}

// ─── הכנסות ─────────────────────────────────────────────────────────────────

const INCOME_HEADERS = ['שנה', 'מחודש', 'עד חודש', 'מקור מידע', 'מקור הכנסה', 'סכום הכנסה', 'תאריך קבלה', 'סטטוס'];

/**
 * «רשימת הכנסות» — כל שורה **כלשונה**. ‼ `amount` הוא «סכום הכנסה» בלי
 * יחידה: «הצהרה» היא הכנסה חודשית (16,500), «שומה עצמי» לינואר–דצמבר היא
 * הכנסה שנתית (47,800). עד 219 השדה נקרא monthlyAmount — וכך שומה שנתית
 * נרשמה «לחודש». הפירוש נעשה ב-PIVO (niIncome.ts), לא כאן.
 */
export function parseIncomeList(tables) {
  const t = pickTable(tables, INCOME_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const rows = [];
  for (const r of t.table.dataRows) {
    const year = Number(cell(r, t.cols['שנה']));
    const amount = parseMoney(cell(r, t.cols['סכום הכנסה']));
    if (!Number.isInteger(year) || year < 1990 || amount == null) continue;
    rows.push({
      year,
      fromMonth: parseMonth(cell(r, t.cols['מחודש'])),
      toMonth: parseMonth(cell(r, t.cols['עד חודש'])),
      infoSource: cell(r, t.cols['מקור מידע']) || null,
      incomeSource: cell(r, t.cols['מקור הכנסה']) || null,
      amount,
      receivedDate: parseBtlDate(cell(r, t.cols['תאריך קבלה'])),
      status: cell(r, t.cols['סטטוס']) || null,
    });
  }
  return { ok: true, rows };
}

const incomeSortKey = (r) => [String(r.year).padStart(4, '0'), String(r.toMonth ?? 0).padStart(2, '0'),
  String(r.fromMonth ?? 0).padStart(2, '0'), r.receivedDate ?? ''].join('|');

/**
 * ההצהרה החודשית האחרונה של העצמאי — **רק** «מקור מידע: הצהרה», «מקור
 * הכנסה: עצמאי», «תקף». ‼ שומה אינה הצהרה ואינה נבחרת כאן גם כשהיא חדשה
 * יותר; שכיר אינו עצמאי. שתי הצהרות לאותה תקופה באותו יום בסכום שונה ⇒
 * לא בוחרים (ambiguous). אין ⇒ null, לא 0.
 *
 * ‼ הצורה (`monthlyAmount`) נשמרת לאתר שלפני 219, שקורא רק אותה: כך הוא
 * לעולם לא מקבל שומה שנתית בתור הכנסה חודשית.
 */
export function selectDeclaredIncome(rows) {
  const pool = (rows ?? []).filter(r => norm(r.status) === 'תקף' && norm(r.incomeSource) === 'עצמאי'
    && /הצהרה/.test(norm(r.infoSource)) && Number.isFinite(r.amount) && r.amount >= 0);
  if (pool.length === 0) return null;
  pool.sort((a, b) => incomeSortKey(b).localeCompare(incomeSortKey(a)));
  const tied = pool.filter(r => incomeSortKey(r) === incomeSortKey(pool[0]));
  if (new Set(tied.map(r => r.amount)).size > 1) return null;
  const pick = pool[0];
  return { ...pick, monthlyAmount: pick.amount, alternatives: pool.length - 1 };
}

/**
 * כמה שורות נשמרות בתוצאה. ‼ הבחירה ב-PIVO (הצהרה/שומה, תחרות בין שורות)
 * נשענת על **כל** שורות «הצהרה»/«שומה» — הן נשמרות כולן (עד תקרה שלא
 * צפויה להיחצות: שורה לשנה). רק שורות הקשר אחרות (שכיר, מקור אחר) נחתכות.
 */
export const MAX_INCOME_CANDIDATES = 200;
export const MAX_INCOME_CONTEXT = 40;

/**
 * הראיה מרשימת ההכנסות כפי שנשלחת ל-PIVO — בלתי תלויה בסדר הטבלה.
 * `candidatesComplete:false` ⇒ אפילו שורות הבחירה נחתכו: PIVO אינו מסיק
 * מזה «אין» ואינו מציע לנקות. `omitted` — כמה שורות לא נשלחו בכלל.
 */
export function incomeEvidence(rows) {
  const all = rows ?? [];
  const isCandidate = (r) => /הצהרה|שומה/.test(norm(r.infoSource));
  // ‼ סדר מלא (לא רק תקופה): שורות עם אותה תקופה מוכרעות לפי תוכנן, כדי
  // שאותה טבלה בסדר אחר תשלח בדיוק את אותן שורות.
  const full = (r) => [incomeSortKey(r), String(r.amount ?? '').padStart(12, '0'),
    norm(r.infoSource), norm(r.incomeSource), norm(r.status)].join('|');
  const byNewest = (a, b) => full(b).localeCompare(full(a));
  const candidates = all.filter(isCandidate).sort(byNewest);
  const context = all.filter(r => !isCandidate(r)).sort(byNewest);
  const records = [...candidates.slice(0, MAX_INCOME_CANDIDATES), ...context.slice(0, MAX_INCOME_CONTEXT)];
  return {
    records,
    rows: all.length,
    omitted: all.length - records.length,
    candidatesComplete: candidates.length <= MAX_INCOME_CANDIDATES,
  };
}

// ─── הרשאות לחיוב ───────────────────────────────────────────────────────────

const DEBIT_HEADERS = ['מתאריך', 'עד תאריך', 'סטטוס'];

/**
 * האם יש הרשאה לחיוב פעילה. ‼ «פרטי חשבון» **לא נקראים** — אין בהם צורך,
 * והם מידע רגיש. טבלה שנמצאה בלי שורה פתוחה ⇒ false (המקור אומר «אין»);
 * טבלה שלא נמצאה ⇒ ok:false (לא הצלחנו לקרוא) — שני דברים שונים.
 */
export function parseDebitAuthorizations(tables) {
  const t = pickTable(tables, DEBIT_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const statuses = t.table.dataRows
    .map(r => ({ status: cell(r, t.cols['סטטוס']), from: parseBtlDate(cell(r, t.cols['מתאריך'])) }))
    .filter(r => r.status || r.from);
  const open = statuses.filter(r => r.status === 'פתוח');
  return {
    ok: true,
    active: open.length > 0,
    openSince: open.map(r => r.from).filter(Boolean).sort()[0] ?? null,
    rows: statuses.length,
  };
}

// ─── מצב חשבון ──────────────────────────────────────────────────────────────

const LEDGER_HEADERS = ['יום ערך', 'סכום מצטבר'];

/**
 * היתרה = «סכום מצטבר» בשורה העליונה (הטבלה ממוינת מהחדש לישן — נצפה).
 * ‼ המוסכמה בכרטיס: חיובי=חוב, שלילי=זכות. בפורטל, אחרי שורת «מקדמה» בחובה
 * הסכום המצטבר עולה ל-2,062 ואחרי «תקבול» הוא חוזר ל-0 — כלומר חיובי=חוב
 * גם שם. זכות («-» או «ז») לא נצפתה עדיין — ממופה לשלילי לפי הסימן.
 */
export function parseLedgerBalance(tables) {
  const t = pickTable(tables, LEDGER_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const row = t.table.dataRows.find(r => parseBtlDate(cell(r, t.cols['יום ערך'])));
  if (!row) return { ok: true, balance: 0, empty: true };
  const balance = parseMoney(cell(row, t.cols['סכום מצטבר']));
  if (balance == null) return { ok: false, reason: 'unparseable_balance' };
  return { ok: true, balance, asOfDate: parseBtlDate(cell(row, t.cols['יום ערך'])) };
}

// ─── חיפוש מיוצגים ─────────────────────────────────────────────────────────

const SEARCH_HEADERS = ['זהות/תיק מעסיק', 'שם', 'סוג', 'תאריך קליטה'];

/**
 * עמודות נוספות בתוצאות החיפוש (נצפו 28.09.2026). ‼ טקסט כלשונו, ורק כשיש
 * ערך; «מזהה פנקס» ו«שם» לא נקראים — אין בהם צורך.
 */
const SEARCH_EXTRA = {
  benefitsAuthorization: 'הרשאה לגימלאות',
  debitAuthorization: 'הרשאה לחיוב',
  status: 'סטטוס',
  pendingAction: 'פעולות',
};

/**
 * בתוצאות «חיפוש מיוצגים» — השורה של הת.ז. הזו. ‼ התאמה מדויקת לפי ת.ז.
 * בלבד; שורה אחרת (למשל תיק מעסיק שמכיל את המספר) אינה «נמצא».
 */
export function findRepresentedRow(tables, idNumber) {
  const t = pickTable(tables, SEARCH_HEADERS);
  if (!t.ok) return { found: false, reason: t.reason };
  const matches = [];
  t.table.dataRows.forEach((r, index) => {
    if (sameIdNumber(cell(r, t.cols['זהות/תיק מעסיק']), idNumber)) {
      const extra = {};
      const headers = (t.table.headerCells ?? []).map(norm);
      for (const [key, header] of Object.entries(SEARCH_EXTRA)) {
        const i = headers.indexOf(header);
        const value = i >= 0 ? cell(r, i) : '';
        if (value) extra[key] = value;
      }
      matches.push({
        index,
        type: cell(r, t.cols['סוג']) || null,
        receivedDate: parseBtlDate(cell(r, t.cols['תאריך קליטה'])),
        ...extra,
      });
    }
  });
  if (matches.length === 0) return { found: false, reason: 'not_found' };
  if (matches.length > 1) return { found: false, reason: 'ambiguous' };
  return { found: true, ...matches[0] };
}

// ─── הרכבה: אדם אחד, ואז כמה אנשים ─────────────────────────────────────────
//
// ‼ `portal` מוזרק — בייצור הוא פונקציות הסשן (btlInsuredSession.mjs),
// בבדיקות הוא מזויף. כך הבידוד בין בני הזוג, כשל חלקי ונפילת סשן נבדקים
// בלי Chrome.
//
// ‼ כל מקטע נקרא בנפרד ומדווח בנפרד: { ok:true, value } או { ok:false,
// reason }. value:null במקטע שהצליח = «המקור אומר שאין» — שונה מ-ok:false
// = «לא הצלחנו לקרוא». הצד של PIVO **לא כותב** דבר על מקטע שנכשל.

const MAX_OCCUPATION_DRILLS = 6;

function sectionError(e) {
  return { ok: false, reason: 'unexpected', detail: (e instanceof Error ? e.message : String(e)).slice(0, 160) };
}

function isSessionLost(e) {
  return e?.name === 'BtlSessionLost';
}

async function readOccupations(portal, asOf, pairs, idNumber) {
  const list = await portal.openOccupationList();
  if (!list.ok) return { ok: false, reason: list.reason };
  const seg = parseOccupationSegments(list.tables);
  if (!seg.ok) return { ok: false, reason: seg.reason };

  const drilled = new Set();
  const records = [];
  const failedDrills = [];
  const detailWarnings = [];
  let queue = segmentsToDrill(seg.segments, asOf).map(s => s.index);
  while (queue.length && drilled.size < MAX_OCCUPATION_DRILLS) {
    const i = queue.shift();
    if (drilled.has(i)) continue;
    drilled.add(i);
    const d = await portal.drillSegment(i, { detailRows: (tables) => recordsToDetail(tables, asOf) });
    if (!d.ok) { failedDrills.push(i); continue; }
    const r = parseOccupationRecords(d.tables);
    if (!r.ok) { failedDrills.push(i); continue; }
    detailWarnings.push(...attachDetails(r.records, d.details, idNumber));
    records.push(...r.records);
    if (d.returned === false) break;
    if (queue.length === 0) queue = extensionTargets(buildOccupationChains(records, asOf), seg.segments, drilled);
  }
  // ‼ אם אף שורה בתוקף לא פורטה — אין לנו תאריכים מלאים. לא ממציאים מתוך
  // שורות התקופה (שבהן «עצמאי, תלמיד…» הוא צירוף ולא עיסוק).
  const current = segmentsToDrill(seg.segments, asOf);
  if (current.length > 0 && records.length === 0) return { ok: false, reason: 'occupation_detail_unavailable' };

  const value = buildOccupationChains(records, asOf);
  const summary = parseOccupationSummary(pairValues(pairs, 'עיסוק')[0] ?? '');
  const warnings = compareWithSummary(value, summary);
  if (failedDrills.length) warnings.push(`drill_failed:${failedDrills.join(',')}`);
  warnings.push(...detailWarnings);
  return { ok: true, value, warnings, drilled: drilled.size };
}

/** אדם אחד — פותח, מאמת זהות, וקורא כל מקטע בנפרד. */
export async function readInsured(portal, subject, { asOf, log = () => {} } = {}) {
  const base = { role: subject.role, label: subject.label ?? null };
  const opened = await portal.open(subject.idNumber);
  if (!opened.ok) {
    log(`לא נפתח תיק ${maskId(subject.idNumber)}: ${opened.reason}${opened.detail ? ` · ${opened.detail}` : ''} · ${(opened.steps ?? []).join(',')}`);
    return { ...base, ok: false, errorCode: opened.reason };
  }
  const sections = {};
  const run = async (key, fn) => {
    try { sections[key] = await fn(); } catch (e) { if (isSessionLost(e)) throw e; sections[key] = sectionError(e); }
  };

  let pairs = opened.pairs ?? [];
  await run('summary', async () => {
    const r = await portal.readInfo();
    if (!r.ok) return { ok: false, reason: r.reason };
    pairs = r.pairs;
    return { ok: true };
  });

  const header = parseInsuredHeader(pairs);
  await run('advance', async () => {
    const line = pairValues(pairs, 'דמי ביטוח')[0];
    if (!line) return { ok: false, reason: 'advance_line_not_found' };
    const a = parseAdvanceLine(line);
    return a ? { ok: true, value: a } : { ok: false, reason: 'advance_line_unparseable' };
  });
  await run('occupations', () => readOccupations(portal, asOf, pairs, subject.idNumber));
  await run('directIncome', async () => {
    const r = await portal.openIncomeList();
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.empty) return { ok: true, value: null, records: [], rows: 0, omitted: 0, candidatesComplete: true, empty: true };
    const list = parseIncomeList(r.tables);
    if (!list.ok) return { ok: false, reason: list.reason };
    // ‼ records — השורות כלשונן (219); PIVO בוחר ומפרש. value — ההצהרה
    // בלבד, לאתר שלפני 219 (נבחרת מכל השורות, לא מהחתך).
    return { ok: true, value: selectDeclaredIncome(list.rows), ...incomeEvidence(list.rows) };
  });
  await run('debitAuthorization', async () => {
    const r = await portal.openDebitAuthorizations();
    const table = r.ok ? parseDebitAuthorizations(r.tables) : { ok: false, reason: r.reason };
    const headerSays = header.debitType ? !/^(אין|לא|-|—)$/.test(header.debitType) : null;
    if (!table.ok && headerSays == null) return { ok: false, reason: table.reason };
    return {
      ok: true,
      value: (table.ok && table.active) || headerSays === true,
      openSince: table.ok ? table.openSince : null,
      source: table.ok ? 'table' : 'header',
    };
  });
  await run('balance', async () => {
    const r = await portal.openLedger();
    const ledger = r.ok ? parseLedgerBalance(r.tables) : { ok: false, reason: r.reason };
    if (ledger.ok) {
      const warnings = header.balance != null && header.balance !== ledger.balance ? ['header_balance_differs'] : [];
      return { ok: true, value: ledger.balance, source: 'ledger', warnings };
    }
    if (header.balance != null) return { ok: true, value: header.balance, source: 'header', warnings: [ledger.reason] };
    return { ok: false, reason: ledger.reason };
  });

  // ‼ עובדות ריכוז המידע — מאותם זוגות שכבר נקראו; בלי ניווט נוסף. אם ריכוז
  // המידע עצמו לא נקרא, לא «מנחשים» מזוגות של מסך אחר.
  await run('summaryFacts', async () => {
    if (!sections.summary?.ok) return { ok: false, reason: 'summary_unavailable' };
    const f = parseSummaryFacts(pairs);
    return f.ok ? { ok: true, value: f.value } : { ok: false, reason: f.reason };
  });
  if (portal.openDocuments) {
    await run('documents', async () => {
      const r = await portal.openDocuments();
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.empty) return { ok: true, value: { items: [] }, empty: true };
      const d = parseDocumentList(r.tables, r.scanRefs);
      return d.ok ? { ok: true, value: { items: d.items } } : { ok: false, reason: d.reason };
    });
  }
  if (portal.openNotices) {
    await run('notices', async () => {
      const r = await portal.openNotices();
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.empty) return { ok: true, value: { items: [], otherCount: 0 }, empty: true };
      const n = parseNoticeList(r.tables);
      return n.ok ? { ok: true, value: { items: n.items, otherCount: n.otherCount } } : { ok: false, reason: n.reason };
    });
  }
  if (portal.openBenefits) {
    await run('reserveDuty', async () => {
      const r = await portal.openBenefits();
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.empty) return { ok: true, value: { rows: [], otherBenefitsCount: 0 }, empty: true };
      const b = parseReserveDutyBenefits(r.tables);
      return b.ok ? { ok: true, value: { rows: b.rows, otherBenefitsCount: b.otherBenefitsCount } } : { ok: false, reason: b.reason };
    });
  }

  if (portal.openAnnualContributions) {
    await run('annualContributions', async () => {
      const r = await portal.openAnnualContributions();
      if (!r.ok) return { ok: false, reason: r.reason };
      if (r.empty) return { ok: true, value: { years: [] }, empty: true };
      const a = parseAnnualContributions(r.rows);
      return a.ok ? { ok: true, value: { years: a.years } } : { ok: false, reason: a.reason };
    });
  }
  // ‼ תכתובות וחוב גמלה: רק «יש / אין / כמה» — אין דוגמה עם נתונים, ולכן אין
  // מיפוי עמודות ואין תוכן.
  for (const [key, open] of [['correspondence', portal.openCorrespondence], ['benefitDebt', portal.openBenefitDebt]]) {
    if (!open) continue;
    await run(key, async () => {
      const r = await open();
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, value: { count: r.empty ? 0 : r.count } };
    });
  }

  const okCount = Object.values(sections).filter(s => s.ok).length;
  log(`${maskId(subject.idNumber)}: ${okCount}/${Object.keys(sections).length} מקטעים נקראו`);
  return { ...base, ok: true, representation: { found: true, ...opened.representation }, sections };
}

/**
 * כמה אנשים, כל אחד בבידוד. ‼ כשל של אחד לא נוגע בתוצאה של האחר. נפילת
 * סשן עוצרת את מי שנשאר (אי אפשר לקרוא בלי סשן), אבל מה שכבר נקרא נשאר.
 */
export async function readSubjects(portal, subjects, { asOf, log = () => {} } = {}) {
  const persons = [];
  let sessionLost = false;
  for (const subject of subjects) {
    if (sessionLost) { persons.push({ role: subject.role, label: subject.label ?? null, ok: false, errorCode: 'session_lost' }); continue; }
    try {
      persons.push(await readInsured(portal, subject, { asOf, log }));
    } catch (e) {
      if (isSessionLost(e)) {
        sessionLost = true;
        persons.push({ role: subject.role, label: subject.label ?? null, ok: false, errorCode: 'session_lost' });
        continue;
      }
      persons.push({ role: subject.role, label: subject.label ?? null, ok: false, errorCode: 'unexpected', detail: sectionError(e).detail });
    }
  }
  return { persons, sessionLost };
}
