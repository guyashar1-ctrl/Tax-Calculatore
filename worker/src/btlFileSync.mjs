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

/** «עיסוקים בתקופה» — כאן כל שורה היא עיסוק אחד עם התאריכים שלו. */
export function parseOccupationRecords(tables) {
  const t = pickTable(tables, OCC_HEADERS);
  if (!t.ok) return { ok: false, reason: t.reason };
  const records = [];
  for (const row of t.table.dataRows) {
    const label = cell(row, t.cols['עיסוקים']);
    const fromDate = parseBtlDate(cell(row, t.cols['מתאריך']));
    if (!label || !fromDate || isNoOccupation(label)) continue;
    const toRaw = cell(row, t.cols['עד תאריך']);
    const toDate = toRaw ? parseBtlDate(toRaw) : null;
    if (toRaw && !toDate) continue;
    records.push({ label, fromDate, toDate });
  }
  return { ok: true, records };
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
  const seen = new Set();
  for (const r of records) {
    const key = `${r.label}|${r.fromDate}|${r.toDate ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
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
  return chains
    .filter(c => c.toDate == null || c.toDate >= asOf)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.sourceLabel.localeCompare(b.sourceLabel));
}

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

// ─── הכנסות ─────────────────────────────────────────────────────────────────

const INCOME_HEADERS = ['שנה', 'מחודש', 'עד חודש', 'מקור מידע', 'מקור הכנסה', 'סכום הכנסה', 'תאריך קבלה', 'סטטוס'];

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
      monthlyAmount: amount,
      receivedDate: parseBtlDate(cell(r, t.cols['תאריך קבלה'])),
      status: cell(r, t.cols['סטטוס']) || null,
    });
  }
  return { ok: true, rows };
}

/**
 * ההכנסה הישירה שעליה נשענות המקדמות: רשומה **תקפה**, מהשנה האחרונה, ואם
 * יש כמה — זו שהתקבלה אחרונה. עצמאי קודם לשאר מקורות. ‼ אין רשומה תקפה ⇒
 * null («אין ערך במקור»), לא 0.
 */
export function selectDirectIncome(rows) {
  const valid = (rows ?? []).filter(r => r.status === 'תקף');
  if (valid.length === 0) return null;
  const maxYear = Math.max(...valid.map(r => r.year));
  const ofYear = valid.filter(r => r.year === maxYear);
  const pool = ofYear.some(r => r.incomeSource === 'עצמאי') ? ofYear.filter(r => r.incomeSource === 'עצמאי') : ofYear;
  pool.sort((a, b) => (b.receivedDate ?? '').localeCompare(a.receivedDate ?? ''));
  const pick = pool[0];
  return { ...pick, alternatives: pool.length - 1 };
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
 * בתוצאות «חיפוש מיוצגים» — השורה של הת.ז. הזו. ‼ התאמה מדויקת לפי ת.ז.
 * בלבד; שורה אחרת (למשל תיק מעסיק שמכיל את המספר) אינה «נמצא».
 */
export function findRepresentedRow(tables, idNumber) {
  const t = pickTable(tables, SEARCH_HEADERS);
  if (!t.ok) return { found: false, reason: t.reason };
  const matches = [];
  t.table.dataRows.forEach((r, index) => {
    if (sameIdNumber(cell(r, t.cols['זהות/תיק מעסיק']), idNumber)) {
      matches.push({
        index,
        type: cell(r, t.cols['סוג']) || null,
        receivedDate: parseBtlDate(cell(r, t.cols['תאריך קליטה'])),
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

async function readOccupations(portal, asOf, pairs) {
  const list = await portal.openOccupationList();
  if (!list.ok) return { ok: false, reason: list.reason };
  const seg = parseOccupationSegments(list.tables);
  if (!seg.ok) return { ok: false, reason: seg.reason };

  const drilled = new Set();
  const records = [];
  const failedDrills = [];
  let queue = segmentsToDrill(seg.segments, asOf).map(s => s.index);
  while (queue.length && drilled.size < MAX_OCCUPATION_DRILLS) {
    const i = queue.shift();
    if (drilled.has(i)) continue;
    drilled.add(i);
    const d = await portal.drillSegment(i);
    if (!d.ok) { failedDrills.push(i); continue; }
    const r = parseOccupationRecords(d.tables);
    if (!r.ok) { failedDrills.push(i); continue; }
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
  await run('occupations', () => readOccupations(portal, asOf, pairs));
  await run('directIncome', async () => {
    const r = await portal.openIncomeList();
    if (!r.ok) return { ok: false, reason: r.reason };
    const list = parseIncomeList(r.tables);
    if (!list.ok) return { ok: false, reason: list.reason };
    return { ok: true, value: selectDirectIncome(list.rows), rows: list.rows.length };
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
