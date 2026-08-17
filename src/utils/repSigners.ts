// ─── עזרי חותמים על בקשת ייצוג ────────────────────────────────────────────
import { Client, RepresentationRequest, RepSigner, RepSignStatus } from '../types';

/**
 * האם הייצוג בב"ל מכסה בפועל גם את בן/בת הזוג. הדגל coversSpouse הוא "ברירת
 * המחדל ללקוח נשוי" (110) — הוא נקבע עוד לפני שהלקוח הצהיר על מצבו המשפחתי,
 * ולכן הוא חל רק כשהלקוח נשוי בפועל. לקוח שהצהיר שאינו נשוי ⇒ מסלול יחיד,
 * בלי קשר לדגל.
 */
export function effectiveNiCoversSpouse(
  client: Pick<Client, 'familyStatus' | 'authorityRepresentations'> | undefined | null,
): boolean {
  return !!client?.authorityRepresentations?.nationalInsurance?.coversSpouse
    && client.familyStatus === 'married';
}

/**
 * רשימת החותמים של הבקשה, עם תאימות לאחור: בקשה ישנה ללא signers → חותם יחיד
 * שנגזר מ-clientName/clientEmail.
 */
export function getRequestSigners(req: RepresentationRequest): RepSigner[] {
  if (req.signers && req.signers.length > 0) return req.signers;
  return [{
    id: 'client',
    role: 'client',
    name: req.clientName || req.clientEmail || 'הנישום',
    email: req.clientEmail || '',
    signStatus: 'pending',
  }];
}

/** האם הבקשה מערבת שני בני זוג (שני חותמים). */
export function isSpouseRequest(req: RepresentationRequest): boolean {
  return getRequestSigners(req).length > 1;
}

/**
 * מצב חתימה אפקטיבי של חותם. כולל גזירה מהזרימה הקיימת של הנישום — חתימתו
 * נשמרת כיום ב-identification.signatureDataUrl, וברגע שהבקשה עברה את שלב
 * חתימת הלקוח הנישום נחשב חתום. חתימת בן/בת הזוג מסומנת דרך signStatus.
 */
export function effectiveSignStatus(req: RepresentationRequest, signer: RepSigner): RepSignStatus {
  if (signer.signStatus === 'signed') return 'signed';
  if (signer.role === 'client') {
    if (req.identification?.signatureDataUrl) return 'signed';
    if (['awaiting_stamp', 'awaiting_authorities', 'active'].includes(req.status)) return 'signed';
  }
  return 'pending';
}

/** כמה חתמו מתוך כמה — לתצוגת "1 מתוך 2 חתמו". */
export function signedCount(req: RepresentationRequest): { signed: number; total: number } {
  const signers = getRequestSigners(req);
  return {
    signed: signers.filter(s => effectiveSignStatus(req, s) === 'signed').length,
    total: signers.length,
  };
}
