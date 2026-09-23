// staging-anonymize.mjs — ניקוי מידע אישי מעותקי פרודקשן ב-staging.
//
// ‼ נולד מממצא (23.09.2026): staging-clone.mjs עובד לפי **רשימת חסימה** של
// עמודות, וכל עמודה שאינה בה מועתקת כמו שהיא. עמודות שנוספו אחרי שהרשימה
// נכתבה עברו לסביבה עם ת.ז. אמיתיות:
//   · clients.tax_files[].fileNumber — אצל יחיד מספר התיק **הוא** הת.ז.
//   · representation_requests.identification — כל בלוק הזיהוי (שם, ת.ז.,
//     תאריך לידה, כתובת, טלפון, מייל, מספר מסמך משני).
//   · clients.spouse_first_name / spouse_last_name / spouse / activity[].text.
//
// ‼ הפונקציות טהורות ונבדקות ב-scripts/staging-anonymize.test.mjs. הבדיקה
// האמיתית היא `findRealIdLeaks` — היא לא סומכת על רשימה אלא מחפשת בפועל כל
// ת.ז. אמיתית מהפרודקשן בכל ערך בכל שורה, ולכן עמודה חדשה שתישכח ברשימה
// תיתפס בה.

/** מספר תיק לרשות — מוחלף בת.ז. הסינתטית של השורה; מבנה התיק נשמר. */
export function scrubTaxFiles(taxFiles, syntheticId) {
  if (!Array.isArray(taxFiles)) return taxFiles ?? null;
  return taxFiles.map((f) => (f && typeof f === 'object' && f.fileNumber
    ? { ...f, fileNumber: syntheticId }
    : f));
}

const IDENTIFICATION_SYNTHETIC = {
  lastName: 'בדיקה',
  birthDate: '1980-01-01',
  address: 'רחוב הבדיקה 1',
  city: 'עיר בדיקה',
  email: 'delivered@resend.dev',
  phone: '052-0000000',
  secondaryValue: '0000000',
};

/**
 * בלוק הזיהוי של בקשת ייצוג: כל ערך אישי מוחלף, המפתחות והשדות המבניים
 * (מצב משפחתי, סוג המסמך המשני) נשמרים — כך המסך מקבל את אותה צורה.
 */
export function syntheticIdentification(ident, { idNumber, firstName }) {
  if (!ident || typeof ident !== 'object') return ident ?? null;
  const out = { ...ident };
  if ('idNumber' in out) out.idNumber = idNumber;
  if ('firstName' in out) out.firstName = firstName;
  // ‼ לפי **נוכחות המפתח** ולא לפי ערכו: ב-clone הערכים כבר מאופסים בצד
  // הפרודקשן (IDENTIFICATION_SOURCE_SQL), וכאן רק ממלאים ערכי בדיקה.
  for (const [k, v] of Object.entries(IDENTIFICATION_SYNTHETIC)) if (k in out) out[k] = v;
  return out;
}

/**
 * ביטויי SQL שרצים **בתוך הפרודקשן** (כמו רשימת החסימה ב-staging-clone):
 * המבנה עובר, הערכים האישיים לא יוצאים מהמסד בכלל.
 */
export const IDENTIFICATION_SOURCE_SQL = `(select jsonb_object_agg(e.key, case when e.key in ('familyStatus','familyStatusYear','secondaryType') then e.value else 'null'::jsonb end)
   from jsonb_each(case when jsonb_typeof(t.identification) = 'object' then t.identification else '{}'::jsonb end) e)`;
export const TAX_FILES_SOURCE_SQL = `(select jsonb_agg(case when f ? 'fileNumber' then (f - 'fileNumber') || '{"fileNumber":"__SYN__"}'::jsonb else f end)
   from jsonb_array_elements(case when jsonb_typeof(t.tax_files) = 'array' then t.tax_files else '[]'::jsonb end) f)`;

/** מחליף כל הופעה של ערך סודי בתוך מחרוזות, בכל עומק. */
export function redactSecrets(value, secrets, replacement = 'בדיקה') {
  const list = [...secrets].filter((s) => typeof s === 'string' && s.trim().length >= 3);
  const walk = (v) => {
    if (typeof v === 'string') return list.reduce((acc, s) => acc.split(s).join(replacement), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/**
 * שער האימות: מחפש ת.ז. אמיתיות (מהפרודקשן) בכל ערך בכל שורה. מחזיר
 * { table, rowId, path } לכל פגיעה — בלי הערך עצמו, כדי שאפשר יהיה להדפיס.
 * השוואה בלי אפסים מובילים, כמו בכל מקום אחר בפרויקט.
 */
export function findRealIdLeaks(realIds, rowsByTable) {
  const real = new Set([...realIds].map((v) => String(v).replace(/^0+/, '')).filter(Boolean));
  const hits = [];
  for (const [table, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) {
      const walk = (v, path) => {
        if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${Array.isArray(v) ? '[]' : k}` : k);
          return;
        }
        for (const m of String(v ?? '').match(/\d{8,9}/g) ?? []) {
          if (real.has(m.replace(/^0+/, ''))) hits.push({ table, rowId: row.id, path });
        }
      };
      walk(row, '');
    }
  }
  return hits;
}
