// btlTracking.mjs — הקריאה של מסך «מעקב ייפוי כוח» בביטוח לאומי, בלי דפדפן.
//
// ‼ למה קובץ נפרד: כל מה שכאן הוא **טהור** — מחרוזות נכנסות, החלטה יוצאת.
// הגרידה מה-DOM נשארת ב-btlSession.mjs ומחזירה טבלה כמערך מחרוזות; הבחירה,
// ההשוואה וסיווג הסטטוס קורים כאן, ולכן אפשר לבדוק אותם בלי Chrome ובלי
// סשן מאומת (worker/test/btl-tracking.mjs). זו בדיוק השכבה שבה נולדה
// התקלה של «קיים ⇒ מאושר», ולכן זו השכבה שחייבת בדיקות.
//
// ‼ החוק היחיד שאסור לשבור: **היעדר ראיה חיובית אינו אישור.** מחרוזת סטטוס
// שלא זוהתה במדויק מסווגת 'unknown' ולעולם לא 'approved'. אין כאן includes
// על 'מאושר' — «לא מאושר» מכיל אותו, וגם «ממתין לאישור» מכיל 'אישור'.

/**
 * ניקוי טקסט מהמסך לפני השוואה מדויקת. ‼ לא "trim" תמים:
 *  · תווי כיווניות ורוחב-אפס (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069,
 *    U+FEFF) מוזרקים ע"י דפי RTL ואינם נראים — השוואה ישירה נכשלת בשקט.
 *  · NBSP (U+00A0) הוא רווח לכל דבר בעין ולא לכל דבר ב-===.
 *  · נורמליזציית NFC — «מאושר» עם ניקוד/צירוף שונה נראה זהה ואינו זהה.
 *  · נקודתיים/נקודה בסוף — עיצוב, לא תוכן.
 */
export function normalizeStatusText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ \s]+/g, ' ')
    .replace(/["'״׳]/g, '"')
    .trim()
    .replace(/[.:]+$/, '')
    .trim();
}

/**
 * המצבים שמסך המעקב יכול להציג, בשפה של PIVO. ‼ 'unknown' אינו תקלה אלא
 * תשובה: ראינו שורה, לא הבנו את הסטטוס שלה, ולכן איננו מכריעים דבר.
 * 'not_found' נשאר בידי הקורא (אין שורה — אין סטטוס).
 */
export const BTL_POA_STATES = ['approved', 'pending', 'expired', 'cancelled', 'unknown'];

/**
 * מפת הניסוחים **המדויקים** שנצפו חי במסך המעקב (23.09.2026, חשבון אמיתי):
 * «ממתין לאישור» (אדום) ו«מאושר». השאר נוספו כניסוחים סבירים של אותו מסך
 * ומסווגים תמיד ל**חומרה גבוהה יותר** — כלומר לעולם לא ל'approved'. שינוי
 * ניסוח אצל ביטוח לאומי ייפול ל'unknown' ויהיה גלוי, לא ייקרא כהצלחה.
 */
const EXACT_STATES = new Map([
  ['מאושר', 'approved'],
  ['מאושרת', 'approved'],
  ['ממתין לאישור', 'pending'],
  ['ממתינה לאישור', 'pending'],
  ['ממתין', 'pending'],
  ['פג תוקף', 'expired'],
  ['פג התוקף', 'expired'],
  ['פקע', 'expired'],
  ['בוטל', 'cancelled'],
  ['מבוטל', 'cancelled'],
  ['בוטלה', 'cancelled'],
  ['נדחה', 'cancelled'],
  ['נדחתה', 'cancelled'],
  ['לא מאושר', 'cancelled'],
]);

/**
 * טקסט עמודת «סטטוס» ⇒ מצב קנוני. ‼ התאמה מדויקת בלבד, אחרי נרמול.
 * מחרוזת ריקה או לא מוכרת ⇒ 'unknown'. אין ענף שמחזיר 'approved' מניחוש.
 */
export function classifyPoaStatus(rawStatus) {
  const t = normalizeStatusText(rawStatus);
  if (!t) return 'unknown';
  return EXACT_STATES.get(t) ?? 'unknown';
}

/** האם המצב הזה הוא ראיה חיובית לייצוג פעיל. נקודת ההכרעה היחידה במערכת. */
export function isApprovedState(state) {
  return state === 'approved';
}

/** ‼ ספרות בלבד, בלי אפסים מובילים — ב"ל משמיטה אפס מוביל בת.ז. (ראה sameIdNumber). */
export function normalizeIdNumber(value) {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export function sameIdNumber(a, b) {
  const x = normalizeIdNumber(a);
  const y = normalizeIdNumber(b);
  return x.length > 0 && x === y;
}

/** אסמכתא להשוואה: ספרות בלבד בלי אפסים מובילים (ב-URL היא מרופדת ל-10). */
export function normalizeReference(value) {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export function sameReference(a, b) {
  const x = normalizeReference(a);
  const y = normalizeReference(b);
  return x.length > 0 && x === y;
}

/**
 * ‼ ב"ל מציגה DD/MM/YYYY; NiTracking.deadline הוא YYYY-MM-DD, והשרת עושה
 * `::date`. ממירים פעם אחת, כאן, לפני שהערך עוזב את העובד. צורה לא מזוהה
 * מוחזרת null — לא תאריך מנוחש.
 */
export function toIsoDate(display) {
  const m = normalizeStatusText(display).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${m[3]}-${mm}-${dd}`;
}

// ‼ עוגן מבני מאומת בסשן אמיתי (16.09.2026, אומת שוב 23.09.2026): כותרות
// העמודה כפי שנקראו מילה-במילה מתוך מסך המעקב (`#SherutData_GridViewMainList`,
// GridView קלאסי של ASP.NET) — לא מתיאור מילולי, שהיה קרוב ולא מדויק
// ("זהות/ח.פ מעסיק" מול "זהות/תיק מעסיק" בפועל, "מועד אחרון" מול
// "מ/עד תאריך"). ניסוח חדש ⇒ 'columns_not_found', לא ניחוש.
export const TRACKING_COLUMNS = {
  reference: ['אסמכתא'],
  idNumber: ['זהות/תיק מעסיק', 'זהות/ח.פ מעסיק'],
  name: ['שם'],
  status: ['סטטוס'],
  deadline: ['מ/עד תאריך', 'מועד אחרון'],
};

/**
 * סדר העדיפות כשנמצאה יותר משורה אחת לאותה ת.ז.. ‼ הבחירה אינה "הראשונה
 * שמצאתי" ואינה "הכי חדשה": היא לפי **כמה השורה פעילה**, כי זו השאלה
 * שהקורא שואל ("האם יש ייפוי כוח שמחייב אותנו עכשיו"). ממתין לאישור קודם
 * למאושר, מאושר קודם לפג/בוטל, ולא-מוכר אחרון — כדי שרישום היסטורי לא
 * יוצג כסיפור הנוכחי.
 */
const STATE_PRIORITY = { pending: 0, approved: 1, expired: 2, cancelled: 3, unknown: 4 };

/**
 * בוחר מבין כל הטבלאות בעמוד את טבלת המעקב. ‼ לא "הראשונה שיש בה
 * «אסמכתא»": במסך המעקב יש **שתי** טבלאות שבשתיהן מופיעות המילים «אסמכתא»
 * ו«סטטוס» — פאנל הסינון שבראש המסך (סטטוס: / אסמכתא: / טקסט: / סוג:)
 * וטבלת הנתונים עצמה. בחירה בראשונה הייתה מחזירה «לא נמצא» בשקט על לקוח
 * שכן קיים. מנקדים לפי **כמה** מכותרות העמודה המוכרות מופיעות, ומעדיפים
 * טבלה עם שורות נתונים.
 */
export function pickTrackingTable(tables) {
  const labelSets = Object.values(TRACKING_COLUMNS);
  let best = null;
  for (const t of tables ?? []) {
    const header = (t?.headerCells ?? []).map(normalizeStatusText);
    const hit = (labels) => header.some((c) => labels.includes(c));
    if (!hit(TRACKING_COLUMNS.reference) || !hit(TRACKING_COLUMNS.status)) continue;
    const score = labelSets.filter(hit).length;
    const rows = (t?.dataRows ?? []).length;
    if (!best || score > best.score || (score === best.score && rows > best.rows)) {
      best = { table: t, score, rows };
    }
  }
  return best?.table ?? null;
}

/**
 * בוחר שורה אחת מטבלת המעקב.
 *
 * @param table  {headerCells: string[], dataRows: string[][]} — כפי שנגרד
 *               מהדף — או `{tables: [...]}` וכאן בוחרים את הנכונה.
 * @param lookup {referenceNumber?, idNumber?} — אסמכתא כשהיא ידועה (מסלול
 *               הבדיקה), ת.ז. כשאין עדיין אסמכתא (מסלול ההתאמה ביצירה).
 *
 * ‼ לעולם לא "השורה הראשונה": העמודות ממופות לפי הכותרות, כל השורות
 * נבדקות, והבחירה מוסברת ב-`reason`/`candidates`. התאמה כפולה לאותה
 * **אסמכתא** נשארת דו-משמעית (אסמכתא היא מזהה ייחודי — כפילות היא אנומליה);
 * התאמה כפולה לאותה **ת.ז.** היא מצב נורמלי (היסטוריה של בקשות) ומוכרעת
 * לפי STATE_PRIORITY, עם `ambiguous:true` על התוצאה כשהיו מועמדים שקולים.
 */
export function selectTrackingRow(table, lookup) {
  const picked = Array.isArray(table?.tables) ? pickTrackingTable(table.tables) : table;
  const headerCells = (picked?.headerCells ?? []).map(normalizeStatusText);
  const dataRows = picked?.dataRows ?? [];
  if (!headerCells.length) return { found: false, reason: 'table_not_found' };

  const colIndex = (labels) => headerCells.findIndex((c) => labels.includes(c));
  const idxRef = colIndex(TRACKING_COLUMNS.reference);
  const idxId = colIndex(TRACKING_COLUMNS.idNumber);
  const idxName = colIndex(TRACKING_COLUMNS.name);
  const idxStatus = colIndex(TRACKING_COLUMNS.status);
  const idxDeadline = colIndex(TRACKING_COLUMNS.deadline);
  if (idxRef < 0 || idxStatus < 0) return { found: false, reason: 'columns_not_found', headerCells };

  const read = (cells) => ({
    referenceNumber: idxRef >= 0 ? normalizeStatusText(cells[idxRef]) : null,
    idNumber: idxId >= 0 ? normalizeStatusText(cells[idxId]) : null,
    name: idxName >= 0 ? normalizeStatusText(cells[idxName]) : null,
    rawStatus: normalizeStatusText(cells[idxStatus]),
    deadlineRaw: idxDeadline >= 0 ? normalizeStatusText(cells[idxDeadline]) : null,
  });

  // ‼ שורות ריק/סיכום/עימוד של GridView: בלי אסמכתא הן אינן רשומות.
  const rows = dataRows.map(read).filter((r) => normalizeReference(r.referenceNumber).length > 0);

  const byReference = !!normalizeReference(lookup?.referenceNumber);
  let matches;
  if (byReference) {
    matches = rows.filter((r) => sameReference(r.referenceNumber, lookup.referenceNumber));
  } else if (normalizeIdNumber(lookup?.idNumber)) {
    if (idxId < 0) return { found: false, reason: 'id_column_not_found', headerCells };
    matches = rows.filter((r) => sameIdNumber(r.idNumber, lookup.idNumber));
  } else {
    return { found: false, reason: 'no_lookup_key' };
  }

  if (matches.length === 0) {
    return { found: false, reason: byReference ? 'reference_not_found' : 'id_not_found' };
  }
  if (byReference && matches.length > 1) {
    // ‼ אסמכתא היא מזהה ייחודי אצל ביטוח לאומי. שתי שורות עם אותה אסמכתא
    // אינן "היסטוריה" אלא משהו שלא הבנּו — לא מכריעים סטטוס עליו.
    return { found: false, reason: 'ambiguous_match', count: matches.length };
  }

  const scored = matches
    .map((r) => ({ ...r, status: classifyPoaStatus(r.rawStatus) }))
    .sort((a, b) => STATE_PRIORITY[a.status] - STATE_PRIORITY[b.status]);
  const best = scored[0];
  const tied = scored.filter((r) => r.status === best.status).length > 1;

  return {
    found: true,
    referenceNumber: best.referenceNumber,
    idNumber: best.idNumber,
    name: best.name,
    status: best.status,
    rawStatus: best.rawStatus,
    deadline: toIsoDate(best.deadlineRaw),
    deadlineRaw: best.deadlineRaw,
    /** ‼ כמה שורות ענו על החיפוש — נשמר כדי ש"בחרנו אחת מכמה" לא ייעלם. */
    candidates: scored.length,
    /** שתי שורות באותה עדיפות: בחרנו, אבל הקורא צריך לדעת שזו בחירה. */
    ambiguous: tied,
    /** הסטטוסים של כל המועמדים — לאבחון, בלי פרטים מזהים נוספים. */
    candidateStates: scored.map((r) => r.status),
  };
}
