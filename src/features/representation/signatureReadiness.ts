// ─── האם טופס ייפוי הכוח באמת מוכן לחתימה (04.10.2026) ──────────────────────
// ‼ עד היום «מוכן לחתימה» במרכז הייצוג היה «יש מסמך עם קובץ», ובמסך הבקשות
// «דורש הפקת טופס» נגזר מהסטטוס בלבד (awaiting_accountant) — אצל עידן אותה
// בקשה הוצגה בשני המצבים בבת אחת. ההכרעה כאן היא המקור היחיד לשניהם, והיא
// נשענת רק על מה שהחתימה עצמה משתמשת בו: signature_documents (הקובץ והשדות)
// ורשימת החותמים.
// ‼ טהור. השרת (prepare_request_for_signing, 218) אוכף את אותם כללים לפני
// שליחה; כאן הם מוצגים — כולל מה חסר ואיך מתקנים.

import type { RepresentationRequest, RepSignatureDocument, RepSigner, SignatureField } from '../../types';
import { signatureDocumentsOf } from '../../utils/repDocuments';
import { getRequestSigners } from '../../utils/repSigners';

/** סטטוסים שבהם הלקוח כבר חתם — הטופס הוא היסטוריה, לא «מוכנות». */
const SIGNED_STATUSES = new Set(['awaiting_stamp', 'awaiting_authorities', 'active']);

export type SignatureProblemCode =
  | 'no_pdf'               // מסמך בלי קובץ
  | 'not_prepared'         // הטופס הגיע משע״ם, ועוד לא נוצרו לו מקומות חתימה (ההכנה עוד לא רצה)
  | 'layout_mismatch'      // הטופס שונה מהתבנית — ההכנה האוטומטית נעצרה (218)
  | 'held_sent'            // טופס חדש הגיע אחרי שהבקשה נשלחה ללקוח — לא צורף בשקט (218)
  | 'no_signer_field'      // במסמך אין אף מקום חתימה של חותם
  | 'signer_without_field' // חותם ברשימה שאין לו מקום חתימה באף מסמך
  | 'owner_without_field'  // טופס של אדם (person:spouse) בלי מקום חתימה של אותו אדם
  | 'unknown_signer'       // מקום חתימה משויך למי שאינו ברשימת החותמים
  | 'no_office_field'      // במסמך אין מקום לחתימה/חותמת של המשרד
  | 'out_of_page';         // מקום מחוץ לגבולות העמוד, או בעמוד שאינו קיים

export interface SignatureProblem {
  code: SignatureProblemCode;
  docKey?: string;
  signerId?: string;
  /** משפט אחד, בשפת המשרד. */
  text: string;
}

export interface SignaturePlace {
  /** מזהה החותם כפי שנשמר בשדה ('client' / 'spouse' / 'accountant' / 'static'). */
  signerId: string;
  /** «עידן רוקח» / «המשרד» / «סימון קבוע של המשרד». */
  who: string;
  /** 'client' | 'spouse' | 'office' | 'static' — לצבע ולמקרא. */
  tone: SignaturePlaceTone;
  /** כמה מקומות במסמך. */
  count: number;
  /** «חתימה» / «חותמת» / «✓». */
  what: string;
}

export type SignaturePlaceTone = 'client' | 'spouse' | 'office' | 'static';

export interface SignatureDocReadiness {
  key: string;
  title: string;
  places: SignaturePlace[];
}

export type SignatureReadinessState = 'no_form' | 'incomplete' | 'ready' | 'signed';

export interface SignatureReadiness {
  state: SignatureReadinessState;
  problems: SignatureProblem[];
  docs: SignatureDocReadiness[];
}

const isSignerKind = (f: SignatureField) => f.kind === 'signature';
const isOfficeKind = (f: SignatureField) => f.kind === 'stamp' || f.kind === 'signature';
const isStaticKind = (f: SignatureField) => f.kind === 'label' || f.kind === 'check' || f.kind === 'cross';

/** מי חותם במקום הזה — בשם, לא במזהה. */
export function signerDisplayName(signerId: string, signers: RepSigner[]): string {
  if (signerId === 'accountant') return 'המשרד';
  if (signerId === 'static') return 'סימון קבוע של המשרד';
  const s = signers.find(x => x.id === signerId);
  if (s?.name?.trim()) return s.name.trim();
  return signerId === 'spouse' ? 'בן/בת הזוג' : signerId === 'client' ? 'הלקוח' : signerId;
}

export function placeTone(signerId: string, signers: RepSigner[]): SignaturePlaceTone {
  if (signerId === 'accountant') return 'office';
  if (signerId === 'static') return 'static';
  const s = signers.find(x => x.id === signerId);
  return (s?.role ?? signerId) === 'spouse' ? 'spouse' : 'client';
}

function fieldWhat(f: SignatureField): string {
  if (f.kind === 'stamp') return 'חותמת';
  if (f.kind === 'signature') return 'חתימה';
  if (f.kind === 'check') return '✓';
  if (f.kind === 'cross') return '✗';
  if (f.kind === 'label') return 'טקסט';
  return 'מילוי';
}

/** «עידן רוקח · חתימה» — מה רואים על הטופס במקום הזה. */
export function placeLabel(f: SignatureField, signers: RepSigner[]): string {
  if (f.signerId === 'static') return f.kind === 'check' ? '✓ יסומן מראש על ידי המשרד' : 'יסומן מראש על ידי המשרד';
  if (f.signerId === 'accountant') return f.kind === 'stamp' ? 'חתימה וחותמת המשרד' : 'חתימת המשרד';
  return `${fieldWhat(f)} · ${signerDisplayName(f.signerId, signers)}`;
}

function placesOf(doc: RepSignatureDocument, signers: RepSigner[]): SignaturePlace[] {
  const map = new Map<string, SignaturePlace>();
  for (const f of doc.fields) {
    const k = `${f.signerId}|${f.kind}`;
    const prev = map.get(k);
    if (prev) { prev.count += 1; continue; }
    map.set(k, {
      signerId: f.signerId, who: signerDisplayName(f.signerId, signers), tone: placeTone(f.signerId, signers),
      count: 1, what: fieldWhat(f),
    });
  }
  const order: SignaturePlaceTone[] = ['client', 'spouse', 'office', 'static'];
  return [...map.values()].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
}

const inside = (f: SignatureField) =>
  [f.xPct, f.yPct, f.widthPct, f.heightPct].every(n => Number.isFinite(n))
  && f.xPct >= -0.001 && f.yPct >= -0.001 && f.widthPct > 0 && f.heightPct > 0
  && f.xPct + f.widthPct <= 1.001 && f.yPct + f.heightPct <= 1.001 && f.pageIndex >= 0;

/**
 * @param pageCounts מספר העמודים לכל pdfDocId, כשהקובץ כבר נטען (בתצוגה). בלעדיו
 *   נבדקים רק הגבולות בתוך העמוד.
 */
export function signatureReadiness(
  req: RepresentationRequest,
  opts: { pageCounts?: Record<string, number> } = {},
): SignatureReadiness {
  const docs = signatureDocumentsOf(req);
  const signers = getRequestSigners(req);
  const docInfo = docs.map(d => ({ key: d.key, title: d.title, places: placesOf(d, signers) }));
  if (SIGNED_STATUSES.has(req.status)) return { state: 'signed', problems: [], docs: docInfo };

  const problems: SignatureProblem[] = [];
  const many = docs.length > 1;
  const where = (d: RepSignatureDocument) => (many ? `בטופס «${d.title}»: ` : '');

  // ‼ טופס שהגיע משע״ם להגשה שעדיין אין לה מסמך חתימה — המקומות נוצרים אוטומטית
  // בפתיחת מרכז הייצוג (194), ועד אז הטופס אינו «מוכן לחתימה».
  const shaam = req.execution?.shaam ?? {};
  for (const [key, t] of Object.entries(shaam)) {
    if (!t || t.replacement || !t.formDocumentId) continue;
    if (!docs.some(d => d.key === key)) {
      // ‼ 218 · השרת מכין את המקומות כשהטופס מגיע; כשלא הכין — אומר למה (formPreparation).
      const prep = t.formPreparation?.state;
      if (prep === 'layout_mismatch') {
        problems.push({ code: 'layout_mismatch', docKey: key, text: 'הטופס שהגיע משע״ם שונה מהתבנית המוכרת, ולכן מקומות החתימה לא נוצרו אוטומטית — צריך לסמן אותם ידנית.' });
      } else if (prep === 'held_sent') {
        problems.push({ code: 'held_sent', docKey: key, text: 'טופס חדש הגיע משע״ם אחרי שהבקשה נשלחה ללקוח, ולכן לא צורף אוטומטית — צריך להחליט אם להחליף את הטופס.' });
      } else {
        problems.push({ code: 'not_prepared', docKey: key, text: 'הטופס הגיע משע״ם, ומקומות החתימה עוד לא נוצרו בו.' });
      }
    }
  }

  if (docs.length === 0) {
    return { state: problems.length ? 'incomplete' : 'no_form', problems, docs: docInfo };
  }

  const known = new Set(signers.map(s => s.id));
  for (const d of docs) {
    if (!d.pdfDocId) {
      problems.push({ code: 'no_pdf', docKey: d.key, text: `${where(d)}קובץ הטופס חסר.` });
      continue;
    }
    if (!d.fields.some(f => known.has(f.signerId) && isSignerKind(f))) {
      problems.push({ code: 'no_signer_field', docKey: d.key, text: `${where(d)}אין בטופס מקום לחתימת הלקוח.` });
    }
    // ‼ טופס 2279 הוא ייפוי הכוח של אדם אחד (המפתח person:X). מי שהטופס שלו חותם עליו —
    // גם כשהוא לא «בן הזוג הרשום» (מע״מ אישי של בן/בת הזוג).
    const owner = /^person:(client|spouse)$/.exec(d.key)?.[1];
    if (owner && known.has(owner) && !d.fields.some(f => f.signerId === owner && isSignerKind(f))) {
      problems.push({
        code: 'owner_without_field', docKey: d.key, signerId: owner,
        text: `${where(d)}זה ייפוי הכוח של ${signerDisplayName(owner, signers)}, ואין בו מקום חתימה עבור ${signerDisplayName(owner, signers)}.`,
      });
    }
    if (!d.fields.some(f => f.signerId === 'accountant' && isOfficeKind(f))) {
      problems.push({ code: 'no_office_field', docKey: d.key, text: `${where(d)}אין בטופס מקום לחתימה ולחותמת של המשרד.` });
    }
    const strangers = [...new Set(d.fields
      .filter(f => f.signerId !== 'accountant' && f.signerId !== 'static' && !known.has(f.signerId) && !isStaticKind(f))
      .map(f => f.signerId))];
    for (const id of strangers) {
      problems.push({
        code: 'unknown_signer', docKey: d.key, signerId: id,
        text: `${where(d)}יש מקום חתימה של ${signerDisplayName(id, signers)}, שאינו ברשימת החותמים — הוא לא יקבל קישור לחתימה.`,
      });
    }
    const pages = d.pdfDocId ? opts.pageCounts?.[d.pdfDocId] : undefined;
    const bad = d.fields.filter(f => !inside(f) || (pages !== undefined && f.pageIndex >= pages));
    if (bad.length) {
      problems.push({ code: 'out_of_page', docKey: d.key, text: `${where(d)}${bad.length === 1 ? 'מקום אחד מסומן' : `${bad.length} מקומות מסומנים`} מחוץ לעמודי הטופס.` });
    }
  }
  for (const s of signers) {
    if (!docs.some(d => d.fields.some(f => f.signerId === s.id && isSignerKind(f)))) {
      problems.push({
        code: 'signer_without_field', signerId: s.id,
        text: `אין בטופס מקום חתימה של ${signerDisplayName(s.id, signers)}.`,
      });
    }
  }
  // ‼ משפט אחד לכל חוסר: «אין מקום לדנה» כבר אומר גם «אין בטופס היחיד מקום לחותם»
  // וגם «אין בטופס של דנה מקום לדנה».
  const missingSigner = new Set(problems.filter(p => p.code === 'signer_without_field').map(p => p.signerId));
  const shown = problems.filter(p =>
    !(p.code === 'owner_without_field' && missingSigner.has(p.signerId))
    && !(p.code === 'no_signer_field' && docs.length === 1 && missingSigner.size > 0));
  return { state: shown.length ? 'incomplete' : 'ready', problems: shown, docs: docInfo };
}

/** «עידן רוקח חותם/ת · המשרד: חתימה וחותמת» — שורה אחת לרשימת המסמכים. */
export function placesSentence(doc: SignatureDocReadiness): string {
  const parts = doc.places.filter(p => p.tone !== 'static').map(p =>
    p.tone === 'office' ? 'המשרד: חתימה וחותמת' : `${p.who}: ${p.count === 1 ? 'חתימה' : `${p.count} חתימות`}`);
  const statics = doc.places.filter(p => p.tone === 'static').reduce((n, p) => n + p.count, 0);
  if (statics) parts.push(statics === 1 ? 'סימון קבוע אחד' : `${statics} סימונים קבועים`);
  return parts.join(' · ');
}
