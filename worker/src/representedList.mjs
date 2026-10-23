// representedList.mjs — «רשימת מיוצגים» בפורטל המייצגים: שורה לכל נושא מס בתיק.
//
// ‼ נצפה חי 23.10.2026 (קריאה בלבד, בלשונית שגיא התחבר בה): החיפוש לפי מספר תיק שולח
// POST ‎/srReshMeyuzagimApi/api/ReshMeyuzagim/ShlifReshMeyuzagim‎ עם
//   {misOsekMeyazeg, misTik, tarTchilatYezugMe/Ad, kodMaarach, kodKvutza, tik91, harshaaCheshbon, …}
// והתשובה listReshMeyuzagim — שורה לכל נושא מס:
//   iORmKodMaarach 1 «מס הכנסה» / 2 «מעמ» · oRmSugMyzg «ראשי» / «נוסף» ·
//   oRmTaarihOrca «30/11/2026» (או "0") + oRmMekorOrca «למיוצגים» ·
//   oRmBank/oRmSnif/oRmCheshbon + oPirteiBank «12-170-48047» (הרשאה לחיוב חשבון; 0/"" = אין).
// ‼ המסך זוכר סינונים. סינון פעיל (למשל «הרשאה לחיוב חשבון» מסומן) מסתיר שורות — ולכן
//   היעדר הרשאה אינו מוכח: תשובה כזו לא משמשת. גם שורה של תיק אחר — לא.
// ‼ טהור — נבדק ב-test/representedList.test.mjs.

const num = (v) => { const n = Number(String(v ?? '').replace(/\D/g, '')); return Number.isFinite(n) ? n : null; };
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** החיפוש שנשלח בפועל: רק מספר תיק, בלי שום סינון אחר. */
export function searchIsUnfiltered(post, fileNumber) {
  let p;
  try { p = typeof post === 'string' ? JSON.parse(post) : post; } catch { return false; }
  if (!p || num(p.misTik) !== num(fileNumber)) return false;
  return Number(p.kodMaarach ?? 0) === 0 && String(p.kodKvutza ?? '0') === '0'
    && Number(p.tik91 ?? 0) === 0 && Number(p.harshaaCheshbon ?? 0) === 0
    && !text(p.tarTchilatYezugMe) && !text(p.tarTchilatYezugAd);
}

function rowOf(r) {
  const until = text(r.oRmTaarihOrca);
  const account = text(r.oPirteiBank) || (num(r.oRmBank) ? `${num(r.oRmBank)}-${num(r.oRmSnif)}-${text(r.oRmCheshbon)}` : '');
  return {
    subject: Number(r.iORmKodMaarach) === 1 ? 'income_tax' : Number(r.iORmKodMaarach) === 2 ? 'vat' : `other:${r.iORmKodMaarach}`,
    subjectRaw: text(r.iORmShemMaarach),
    repType: text(r.oRmSugMyzg) || null,
    extensionUntil: /\d{2}\/\d{2}\/\d{4}/.test(until) ? until : null,
    extensionSource: text(r.oRmMekorOrca) || null,
    debitAccount: account || null,
  };
}

/** @returns {{ok:true, rows: object[]} | {ok:false, reason:string}} */
export function parseRepresentedList(body, { fileNumber, post }) {
  if (!searchIsUnfiltered(post, fileNumber)) return { ok: false, reason: 'filters_active' };
  const list = body?.listReshMeyuzagim;
  if (!Array.isArray(list)) return { ok: false, reason: 'no_list' };
  const mine = list.filter((r) => num(r.iORmMisTikMeyuzag) === num(fileNumber));
  if (mine.length !== list.length) return { ok: false, reason: 'other_file_rows' };
  return { ok: true, rows: mine.map(rowOf) };
}

/** שדות לתוצאת הקריאה של מס הכנסה (טקסט — כמו שאר result.fields). */
export function incomeTaxFieldsFrom(rows) {
  const it = rows.find((r) => r.subject === 'income_tax');
  if (!it) return {};
  return {
    ...(it.repType ? { repType: it.repType } : {}),
    debitAuthorization: it.debitAccount ? `קיימת · ${it.debitAccount}` : 'אין הרשאה',
    ...(it.extensionUntil ? { extensionUntil: it.extensionUntil, extensionSource: it.extensionSource ?? '' } : {}),
  };
}
