// ─── 208 · מה שע״ם דורשת לבקשה — לפני השליחה לחתימה ─────────────────────────
// ‼ 28.09.2026 · בריצה החיה הראשונה שע״ם כתבה ביצירת הבקשה «בהמשך תתבקש לצרף:
// טופס ייפוי כוח חתום. צילום תעודת הזהות או רישיון נהיגה של הלקוח». הדרישה
// הזו חייבת להיות גלויה בדף הייצוג עוד לפני «שלח ללקוח», ולהגיע ללקוח יחד עם
// בקשת החתימה: אין צילום ⇒ בקשת העלאה; יש צילום ⇒ «אשר שזה שלך / החלף».
// ‼ קיום קובץ בתיק אינו אישור הלקוח. רק clientConfirmedAt (נכתב בשרת, 208).
// הכול כאן טהור — נגזר מהמעקב ומ-identity_docs; השרת (prepare_request_for_signing)
// עושה את אותה הכרעה ברגע השליחה.

import type { ShaamRequestTracking, ShaamIdentityDocKind } from './shaamRepresentation';
import { shaamIdentityDocKind } from './shaamRepresentation';
import type { RepIdentityDocEntry, RepresentationRequest, RepTarget } from '../../types';

export type ShaamCreationDocKind = 'poa' | ShaamIdentityDocKind | 'other';

export interface ShaamCreationRequirement {
  label: string;
  kind: ShaamCreationDocKind;
}

/**
 * «בהמשך תתבקש לצרף» מרגע היצירה. תאום של shaam_creation_requirements (SQL):
 * creationAttach כשיש, אחרת מה שבין «בהמשך תתבקש לצרף:» ל«נא לוודא» ב-creationNotice.
 */
export function shaamCreationRequirements(t: ShaamRequestTracking | undefined | null): ShaamCreationRequirement[] {
  let items: string[] = [];
  if (Array.isArray(t?.creationAttach)) {
    items = t!.creationAttach!.map(s => String(s).trim());
  } else {
    const text = String(t?.creationNotice?.text ?? '').replace(/\s+/g, ' ');
    const m = /בהמשך תתבקש לצרף:?\s*(.*?)\s*נא לוודא/.exec(text);
    if (!m) return [];
    items = m[1].split(/\.\s*/).map(s => s.trim());
  }
  return items
    .map(s => s.replace(/\.\s*$/, '').trim())
    .filter(Boolean)
    .map(label => ({
      label,
      kind: /ייפוי\s*(ה)?כוח/.test(label) ? 'poa' as const : (shaamIdentityDocKind(label) ?? 'other' as const),
    }));
}

/** אילו סוגי מסמך (docKind ב-identity_docs) עונים על דרישה. תאום של shaam_doc_kinds_accepted. */
export const SHAAM_DOC_KINDS_ACCEPTED: Record<ShaamIdentityDocKind, string[]> = {
  idOrLicense: ['idCard', 'driverLicense'],
  idCard: ['idCard'],
  driverLicense: ['driverLicense'],
  passport: ['passport'],
  idOrPassport: ['idCard', 'passport'],
};

export type ShaamPreSigningStatus =
  | 'to_sign'                 // טופס ייפוי הכוח — ממתין לחתימה
  | 'signed'                  // נחתם
  | 'missing'                 // אין בתיק ⇒ הלקוח יתבקש להעלות
  | 'awaiting_confirmation'   // יש בתיק ⇒ הלקוח יתבקש לאשר או להחליף
  | 'confirmed'               // הלקוח אישר / העלה בעצמו
  | 'manual';                 // מסמך שאינו מזהה (צו ירושה וכד') — לטיפול המשרד

export interface ShaamPreSigningDoc {
  key: string;
  label: string;
  kind: ShaamCreationDocKind;
  person: RepTarget;
  personName: string;
  status: ShaamPreSigningStatus;
  /** המסמכים שבתיק שעונים על הדרישה (מזהים בלבד). */
  documents: RepIdentityDocEntry[];
  statusText: string;
  /** מה הלקוח יתבקש לעשות בשליחה. null = כלום. */
  clientAction: string | null;
}

export function personOfSubmission(key: string): RepTarget {
  return key === 'person:spouse' ? 'spouse' : 'client';
}

function docsFor(request: Pick<RepresentationRequest, 'identityDocs'>, person: RepTarget, kind: ShaamIdentityDocKind): RepIdentityDocEntry[] {
  const accepted = SHAAM_DOC_KINDS_ACCEPTED[kind];
  const list = (request.identityDocs?.[person] ?? []) as RepIdentityDocEntry[];
  // ‼ אותה הכרעה כמו בשרת: קבוצת הסוג הראשונה לפי סדר ההעדפה שיש לה מסמך.
  for (const k of accepted) {
    const hits = list.filter(e => (e.docKind || 'idCard') === k);
    if (hits.length) return hits;
  }
  return [];
}

/**
 * דרישות שע״ם של הגשה אחת, ומה מצבן. ריק ⇒ אין מעקב/אין דרישות ידועות.
 * @param signed כל החותמים של הטופס הזה חתמו.
 */
export function shaamPreSigningDocs(args: {
  tracking: ShaamRequestTracking | undefined | null;
  submissionKey: string;
  request: Pick<RepresentationRequest, 'identityDocs'>;
  personName: string;
  signed: boolean;
}): ShaamPreSigningDoc[] {
  const { tracking, submissionKey, request, personName, signed } = args;
  if (!tracking?.requestNumber || tracking.replacement) return [];
  const person = personOfSubmission(submissionKey);
  return shaamCreationRequirements(tracking).map((req, i): ShaamPreSigningDoc => {
    const base = { key: `${submissionKey}:${i}`, label: req.label, kind: req.kind, person, personName, documents: [] as RepIdentityDocEntry[] };
    if (req.kind === 'poa') {
      return { ...base, status: signed ? 'signed' : 'to_sign',
        statusText: signed ? 'נחתם' : 'ממתין לחתימה',
        clientAction: signed ? null : 'לחתום על ייפוי הכוח' };
    }
    if (req.kind === 'other') {
      return { ...base, status: 'manual', statusText: 'מסמך שאינו מזהה - לטיפול המשרד', clientAction: null };
    }
    const docs = docsFor(request, person, req.kind);
    const confirmed = docs.filter(d => !!d.clientConfirmedAt);
    if (confirmed.length) {
      return { ...base, documents: confirmed, status: 'confirmed',
        statusText: 'אושר ע"י הלקוח', clientAction: null };
    }
    if (docs.length) {
      const names = docs.map(d => d.fileName).filter(Boolean).join(' + ');
      return { ...base, documents: docs, status: 'awaiting_confirmation',
        statusText: `יש בתיק${names ? ` (${names})` : ''} - ממתין לאישור הלקוח`,
        clientAction: 'לאשר שהצילום שבתיק הוא שלו, או להעלות צילום אחר' };
    }
    return { ...base, status: 'missing', statusText: 'אין בתיק',
      clientAction: 'להעלות צילום תעודת זהות או רישיון נהיגה' };
  });
}

/** מה עוד חסר מהלקוח לפני שידור לשע״ם — משפט אחד, או null. */
export function shaamClientDocumentsPending(items: ShaamPreSigningDoc[]): string | null {
  const open = items.filter(d => d.status === 'missing' || d.status === 'awaiting_confirmation');
  if (!open.length) return null;
  const who = [...new Set(open.map(d => d.personName).filter(Boolean))].join(', ');
  return open.some(d => d.status === 'missing')
    ? `רשות המסים דורשת צילום תעודה מזהה${who ? ` של ${who}` : ''}, ועדיין אין אותו - השידור ימתין עד שהלקוח יעלה.`
    : `רשות המסים דורשת צילום תעודה מזהה${who ? ` של ${who}` : ''}, והלקוח עוד לא אישר שהצילום שבתיק הוא שלו - השידור ימתין לאישור.`;
}

/** «מה יישלח ללקוח» — שורות לפי הסדר: חתימה, ואז כל דרישת מסמך פתוחה. */
export function shaamSendPreview(items: ShaamPreSigningDoc[]): string[] {
  return items.filter(d => d.clientAction).map(d =>
    d.kind === 'poa' ? `חתימה על ייפוי הכוח (${d.personName})` : `${d.personName}: ${d.clientAction}`);
}
