// paperlessModel.mjs — הלוגיקה הטהורה של פייפרלס: מה ראינו ומה צריך לעשות.
// בלי Chrome, כדי שתיבדק ביחידה (worker/test/paperlessModel.test.mjs).
//
// ‼ נצפה חי 26.10.2026 (קריאה בלבד) — worker/test/fixtures/paperless-2026-10-26/README.md:
//   · בעסק של המשרד, טבלת הריטיינר נטענת מ-‎/clients/all/<עסק>‎ (לקוח לכל עוסק
//     שנמשך: sNumber = ת״ז, sPLID = מזהה העוסק אצל המשרד, fee.iMonthlyFee = לפני
//     מע״מ, fee.sCardSuffix / Payment.sCreditNumber רק אחרי שהלקוח הזין כרטיס)
//     ומ-‎/fees/get‎ (שורה לכל חודש: sClientID, sPeriod 'YYMM', bCharged).
//   · אמצעי התשלום נקרא מהטקסט בטבלה — הקודים המספריים לא תועדו.

const PAYMENT_LABELS = [
  ['סליקת אשראי', 'credit'],
  ['העברה בנקאית', 'bank'],
  ['מסב', 'masav'],
  ['לא לתשלום', 'none'],
];

/** «סליקת אשראי» ⇒ 'credit'. תא ריק ⇒ 'none'. טקסט לא מוכר ⇒ 'unknown' (לא מנחשים). */
export function paymentMethodFromLabel(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'none';
  for (const [label, key] of PAYMENT_LABELS) if (t === label) return key;
  return 'unknown';
}

export const sameId = (a, b) => {
  const x = String(a ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const y = String(b ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return !!x && x === y;
};

/** הלקוח ברשימת הריטיינר לפי ת״ז. שניים עם אותה ת״ז ⇒ ambiguous (לא בוחרים). */
export function findRetainerClient(clientsAll, idNumber) {
  const hits = (Array.isArray(clientsAll) ? clientsAll : []).filter(c => sameId(c?.sNumber, idNumber));
  if (hits.length > 1) return { ambiguous: true };
  return hits[0] ? { client: hits[0] } : { client: null };
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * מה ראינו בפייפרלס על הלקוח הזה — זו התוצאה שהשרת מתרגם לסימונים (304).
 * @param dealer  { sBusinessNumber, sBusinessName } מכרטיס העוסק אצל המשרד, אם נקרא
 * @param row     { paymentLabel, withVatText } משורת הטבלה, אם נמצאה
 */
export function observationFrom({ clientsAll, fees, idNumber, dealer = null, row = null }) {
  const { client, ambiguous } = findRetainerClient(clientsAll, idNumber);
  if (ambiguous) return { ambiguous: true };
  const fee = client?.fee ?? {};
  const cardEntered = !!(fee.sCardSuffix || client?.Payment?.sCreditNumber);
  const chargedPeriods = (Array.isArray(fees) ? fees : [])
    .filter(f => client && f?.sClientID === client.sID && f?.bCharged)
    .map(f => String(f.sPeriod))
    .sort();
  return {
    dealerFound: !!(dealer || client?.sPLID),
    businessNumber: String(dealer?.sBusinessNumber ?? client?.sNumber ?? ''),
    businessName: String(dealer?.sBusinessName ?? client?.sBusinessName ?? ''),
    inRetainer: !!client?.sPLID,
    paymentMethod: row ? paymentMethodFromLabel(row.paymentLabel) : (client ? 'unknown' : null),
    amountBeforeVat: num(fee.iMonthlyFee),
    amountWithVat: num(String(row?.withVatText ?? '').replace(/[^\d.]/g, '')),
    cardEntered,
    chargedPeriods,
  };
}

/**
 * מה לעשות בריטיינר. ‼ לא דורסים: אמצעי תשלום אחר (העברה/מס״ב) או סכום אחר
 * שכבר הוגדר ⇒ conflict, אלא אם המשרד ביקש במפורש «עדכן לסכום שבהסכם».
 */
export function retainerPlan(observed, { monthlyBeforeVat, overrideAmount = false }) {
  const agreed = Number(monthlyBeforeVat);
  const pm = observed?.paymentMethod;
  const amount = observed?.amountBeforeVat;
  const amountSet = amount != null && amount > 0;
  const amountMatches = amountSet && Math.abs(amount - agreed) < 0.01;
  const paymentOther = pm === 'bank' || pm === 'masav' || pm === 'unknown';
  const conflict = (!overrideAmount && ((amountSet && !amountMatches) || paymentOther))
    ? { paperlessBeforeVat: amountSet ? amount : null, agreedBeforeVat: agreed, paperlessPayment: pm }
    : null;
  if (conflict) return { setPayment: false, setAmount: false, conflict };
  return {
    setPayment: pm !== 'credit',
    setAmount: !amountMatches,
    conflict: null,
  };
}

/**
 * העוסק אצל המשרד: קודם לפי ת״ז (מכרטיסים שנקראו), ואחרת לפי שם מלא — רק
 * כשיש בדיוק אחד בלי ת״ז. ‼ שניים באותו שם ⇒ לא בוחרים.
 * @param candidates [{ sID, sFirstName, sFamilyName, sBusinessNumber }]
 */
export function matchDealer(candidates, { idNumber, firstName, lastName }) {
  const list = Array.isArray(candidates) ? candidates : [];
  const byId = list.filter(d => sameId(d.sBusinessNumber, idNumber));
  if (byId.length === 1) return { dealer: byId[0], by: 'id' };
  if (byId.length > 1) return { ambiguous: true };
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const byName = list.filter(d => !String(d.sBusinessNumber ?? '').replace(/\D/g, '')
    && norm(d.sFirstName) === norm(firstName) && norm(d.sFamilyName) === norm(lastName));
  if (byName.length === 1) return { dealer: byName[0], by: 'name' };
  if (byName.length > 1) return { ambiguous: true };
  return { dealer: null };
}
