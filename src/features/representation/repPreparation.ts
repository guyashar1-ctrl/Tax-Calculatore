// ─── איפה כל הגשה עומדת לפני השליחה — לפי אדם ורשות (04.10.2026) ─────────────
// ‼ אצל זוג יש עד שתי הגשות בשע״ם (אחת לכל אדם) ושני מסלולי ב״ל. השורה ב«בקשות»
// אמרה משפט אחד מהסטטוס, ומרכז הייצוג גזר את ההגשות מהכרטיס — וכשההגשה השנייה
// עוד לא נפתחה, השורה אמרה «מוכן לשליחה» והמרכז «נשאר צעד». כאן — העובדות פעם
// אחת, מאותם קלטים בדיוק כמו המרכז (shaamSubmissions על requestScope, הכרטיס,
// והרשום במס הכנסה), והשורה, הפירוט והמרכז קוראים מהן.
// ‼ טהור. אין כאן החלטה על נוסח של כותרת — רק עובדות ושורת מצב קצרה לכל חלק.

import type { Client, RepresentationRequest, RepTarget } from '../../types';
import { peopleFromClient, requestScope, shaamSubmissions, targetName, targetsOf, type ShaamSubmission } from '../../utils/repScope';
import { registeredOwnerOf } from '../annualReport/profile';
import { shaamRequestExists } from './shaamRepresentation';
import { signatureReadiness, type SignatureProblem } from './signatureReadiness';
import { signatureDocumentsOf } from '../../utils/repDocuments';

export type ShaamFormFact = 'none' | 'arrived' | 'ready' | 'incomplete' | 'layout_mismatch' | 'signed';

export interface ShaamPrepFact {
  key: string;
  target: RepTarget;
  personName: string;
  authoritiesLabel: string;
  /** הבקשה נפתחה בשע״ם (או סומנה «הוזן ידנית»). */
  entered: boolean;
  requestNumber?: string;
  form: ShaamFormFact;
  /** מה חסר בטופס של ההגשה הזו. */
  problems: string[];
}

export interface NiPrepFact { role: RepTarget; name: string; hasRef: boolean }

export interface RepPrepFacts {
  shaam: ShaamPrepFact[];
  ni: NiPrepFact[];
  /** בעיות שלא שייכות להגשה אחת (חותם בלי מקום חתימה וכו'). */
  generalProblems: string[];
  /**
   * בעיות המוכנות אחרי סינון: «אין מקום חתימה ל-X» כשהטופס של X עוד לא הגיע אינו תקלה —
   * הוא ממתין (אצל זוג, טופס אישי של בן/בת הזוג). כולל not_prepared.
   */
  problems: SignatureProblem[];
  /** יש טופס כלשהו (מסמך, או טופס שהגיע משע״ם). */
  anyForm: boolean;
  signed: boolean;
}

type Exec = NonNullable<RepresentationRequest['execution']>;

/** אותה הכרעה כמו במרכז (enteredAtOf): סימון ידני, או ראיה מהבקשה בשע״ם. */
export function shaamEnteredAt(exec: Exec, key: string, first: boolean): string | undefined {
  const manual = first ? exec.incomeTax?.enteredAt : exec.shaamEntries?.[key]?.enteredAt;
  if (manual) return manual;
  const t = exec.shaam?.[key];
  if (!shaamRequestExists(t) || t?.replacement) return undefined;
  return t?.createdAt || t?.foundBeforeCreateAt || t?.observedAt || t?.syncedAt || t?.submittedAt || undefined;
}

export function repSubmissions(req: Pick<RepresentationRequest, 'scope'>, client: Client | null | undefined): ShaamSubmission[] {
  return shaamSubmissions(requestScope(req as RepresentationRequest, client ?? undefined), peopleFromClient(client),
    (client ? registeredOwnerOf(client) : null) ?? undefined);
}

/**
 * המסמכים של הגשה. ‼ טופס שהועלה ידנית לפני המעבר לטופס לכל אדם נשמר במפתח הישן 'incomeTax'
 * (signatureDocumentsOf) — הוא הטופס של ההגשה הראשונה.
 */
function docKeysOf(key: string, first: boolean): string[] {
  return first ? [key, 'incomeTax'] : [key];
}

function formFact(req: RepresentationRequest, keys: string[], problems: SignatureProblem[], signed: boolean): ShaamFormFact {
  if (signed) return 'signed';
  const mine = problems.filter(p => !!p.docKey && keys.includes(p.docKey));
  if (mine.some(p => p.code === 'layout_mismatch')) return 'layout_mismatch';
  if (mine.some(p => p.code === 'not_prepared')) return 'arrived';
  if (mine.length > 0) return 'incomplete';
  if (signatureDocumentsOf(req).some(d => keys.includes(d.key) && !!d.pdfDocId)) return 'ready';
  return 'none';
}

export function repPreparationFacts(req: RepresentationRequest, client: Client | null | undefined): RepPrepFacts {
  const exec: Exec = req.execution ?? {};
  const readiness = signatureReadiness(req);
  const signed = readiness.state === 'signed';
  const subs = repSubmissions(req, client);
  const shaam = subs.map((s, i): ShaamPrepFact => ({
    key: s.key, target: s.target, personName: s.personName, authoritiesLabel: s.authoritiesLabel,
    entered: !!shaamEnteredAt(exec, s.key, i === 0),
    requestNumber: exec.shaam?.[s.key]?.requestNumber || undefined,
    form: formFact(req, docKeysOf(s.key, i === 0), readiness.problems, signed),
    problems: readiness.problems.filter(p => !!p.docKey && docKeysOf(s.key, i === 0).includes(p.docKey) && p.code !== 'not_prepared').map(p => p.text),
  }));
  // ‼ אותם יעדים כמו במרכז: מרשם הכרטיס, ובלעדיו ההיקף שנשמר על הבקשה.
  const niAreas = client?.authorityRepresentations ?? req.scope ?? undefined;
  const niRec = niAreas?.nationalInsurance;
  const people = peopleFromClient(client);
  const ni = !niRec || niRec.status === 'none' ? [] : targetsOf(niAreas, 'nationalInsurance')
    .filter(r => r === 'client' || people.married)
    .map(role => ({
      role, name: targetName(people, role),
      hasRef: !!(role === 'spouse' ? exec.nationalInsuranceSpouse : exec.nationalInsurance)?.referenceNumber,
    }));
  const known = new Set([...subs.map(s => s.key), ...(subs.length ? ['incomeTax'] : [])]);
  const waitingFormOf = new Set(shaam.filter(f => f.form === 'none' || f.form === 'arrived').map(f => f.target as string));
  const problems = readiness.problems.filter(p => !(p.code === 'signer_without_field' && p.signerId && waitingFormOf.has(p.signerId)));
  const generalProblems = problems.filter(p => !p.docKey || !known.has(p.docKey))
    .filter(p => p.code !== 'not_prepared').map(p => p.text);
  return { shaam, ni, generalProblems, problems, anyForm: readiness.state !== 'no_form', signed };
}

/** שורת מצב קצרה לחלק אחד — אותה בשורה ב«בקשות» ובשורת הרשות במרכז. */
export function shaamPrepLine(f: ShaamPrepFact, sentAt?: string | null): string {
  if (!f.entered) return 'טרם נפתחה בקשה בשע״ם';
  const num = f.requestNumber ? `בקשה ${f.requestNumber} · ` : '';
  switch (f.form) {
    case 'signed': return `${num}נחתם`;
    case 'ready': return `${num}${sentAt ? 'נשלח לחתימה' : 'הטופס מוכן לחתימה'}`;
    case 'incomplete': return `${num}הטופס דורש השלמה`;
    case 'layout_mismatch': return `${num}הטופס שונה מהתבנית — לסמן מקומות חתימה`;
    case 'arrived': return `${num}הטופס הגיע · מקומות החתימה בהכנה`;
    default: return `${num}ממתין לטופס משע״ם`;
  }
}

/** מה עוד פתוח לפני השליחה — רשימה, לפי אדם ורשות. ריקה ⇒ אפשר לשלוח. */
export function prepOpenItems(facts: RepPrepFacts): { kind: 'entry' | 'form' | 'ni_ref'; text: string }[] {
  const many = facts.shaam.length > 1;
  const out: { kind: 'entry' | 'form' | 'ni_ref'; text: string }[] = [];
  for (const s of facts.shaam) {
    const who = many ? ` (${s.personName} · ${s.authoritiesLabel})` : '';
    if (!s.entered) out.push({ kind: 'entry', text: `לפתוח בקשה בשע״ם${who}` });
    else if (s.form !== 'ready' && s.form !== 'signed') out.push({ kind: 'form', text: `להכין את הטופס לחתימה${who}` });
  }
  for (const n of facts.ni) if (!n.hasRef) out.push({ kind: 'ni_ref', text: `אסמכתת ביטוח לאומי${facts.ni.length > 1 ? ` (${n.name})` : ''}` });
  return out;
}
