// ─── «אני מאשר את חתימת בן/ת הזוג על טופס ייפוי הכוח» ────────────────────────
// ‼ תיבה בשלב «טעינת מסמכים» בשע״ם. סימון שלה הוא הצהרה של המייצג מול
// הרשות — ולכן העובד מסמן אותה רק כש-PIVO **הוכיחה** מהטופס החתום עצמו:
// נשואים, בעלי התיק במ"ה ידועים, שני בני הזוג חתמו בתיבות שלהם, ויש חתימת
// מייצג + חותמת. כל חוסר ⇒ false, והעובד עוצר לפני העלאה.

import type { Client, RepresentationRequest, RepSignatureDocument } from '../../types';
import { registeredOwnerOf } from '../annualReport/profile';

export interface SpouseSignatureProof {
  ok: boolean;
  /** כשלא הוכח — משפט אחד שמסביר מה חסר. */
  reason?: string;
}

export function spouseSignatureProof(
  request: RepresentationRequest,
  client: Client | null | undefined,
  doc: RepSignatureDocument | undefined,
  married: boolean,
): SpouseSignatureProof {
  if (!married) return { ok: false, reason: 'הלקוח אינו נשוי — אין חתימת בן/בת זוג לאשר.' };
  if (!client) return { ok: false, reason: 'אין כרטיס לקוח מקושר.' };
  const owner = registeredOwnerOf(client);
  if (!owner) return { ok: false, reason: 'טרם הוכרע מי בן/בת הזוג הרשום/ה במס הכנסה.' };
  if (!doc?.signedPdfStoredId) return { ok: false, reason: 'אין טופס חתום סופי.' };

  const sigOf = (signer: string) => doc.fields.filter(f => f.signerId === signer && f.kind === 'signature');
  const clientSig = sigOf('client');
  const spouseSig = sigOf('spouse');
  if (clientSig.length !== 1 || spouseSig.length !== 1) {
    return { ok: false, reason: 'בטופס אין בדיוק תיבת חתימה אחת לכל אחד מבני הזוג.' };
  }
  const accountant = doc.fields.filter(f => f.signerId === 'accountant' && (f.kind === 'stamp' || f.kind === 'signature'));
  if (accountant.length === 0) return { ok: false, reason: 'בטופס אין חתימת מייצג/חותמת משרד.' };

  const values = request.signatureValues ?? {};
  const signed = (fieldId: string) => {
    const v = values[fieldId];
    return !!v && !!(v.imageDataUrl || v.text) && !!v.signedAt;
  };
  if (!signed(clientSig[0].id)) return { ok: false, reason: 'חסרה חתימת הלקוח/ה בטופס.' };
  if (!signed(spouseSig[0].id)) return { ok: false, reason: 'חסרה חתימת בן/בת הזוג בטופס.' };
  if (!accountant.every(f => signed(f.id))) return { ok: false, reason: 'חסרה חתימת מייצג/חותמת בטופס.' };

  const signers = request.signers ?? [];
  for (const role of ['client', 'spouse'] as const) {
    const s = signers.find(x => x.id === role);
    if (!s || s.signStatus !== 'signed') return { ok: false, reason: 'לא כל החותמים מסומנים כחתומים.' };
  }

  // ‼ בטופס 2279 התיבה האמצעית היא «בן זוג רשום» והשמאלית «בן/בת הזוג».
  // חתימת מי שרשום/ה במ"ה חייבת להיות מימין לחתימת השני/ה — לפי ההכרעה,
  // לא לפי מגדר או סדר.
  const ownerField = owner === 'client' ? clientSig[0] : spouseSig[0];
  const otherField = owner === 'client' ? spouseSig[0] : clientSig[0];
  if (!(ownerField.xPct > otherField.xPct)) {
    return { ok: false, reason: 'חתימת בן/בת הזוג הרשום/ה אינה בתיבת «בן זוג רשום» בטופס.' };
  }
  return { ok: true };
}
