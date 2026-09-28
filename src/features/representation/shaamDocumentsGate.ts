// ─── מה שע״ם דורשת לשידור, ממי, ואיפה זה עומד — טהור (204) ─────────────────
// ‼ שני מושגים שאסור לערבב:
//   · מסמך שהמשרד ביקש (identityRequirements / missingIdentity) — בקשה פתוחה
//     ללקוח, לא חוסמת שליחה, חתימה או ייצוג.
//   · מסמך ששע״ם דורשת — execution.shaam[key].requiredDocuments + documentsGate,
//     נקרא ממסך «טעינת מסמכים» בזמן השידור. חוסם **רק** את השידור.
// הקובץ הזה עוסק רק בשני. הוא אינו קורא את missingIdentity.

import type {
  ShaamRequestTracking, ShaamRequiredDocument, ShaamDocumentsGate, ShaamDocumentsGateState,
} from './shaamRepresentation';
import { shaamRequiredDocumentText, shaamUploadDeadline } from './shaamRepresentation';

export type ShaamDocsTone = 'wait' | 'attention' | 'done' | 'info';

export interface ShaamDocumentsView {
  /** כותרת קצרה. */
  title: string;
  /** מה קורה עכשיו / מה הצעד הבא — משפט אחד. */
  next: string;
  tone: ShaamDocsTone;
  /** השורות ששע״ם דורשת מלבד הטופס, עם בעלים וטיפול. */
  items: { label: string; personName: string | null; handling: string; kind: string | null }[];
  /** מי חסר ומה — לכלי הצירוף (רק כשהמשרד יכול לפתור בצירוף). */
  attach: { person: 'client' | 'spouse'; personName: string; kind: 'idOrLicense' | 'passport' }[];
  /** עצירת אימות ראשון: מה בדיוק היה עולה, לאיזו שורה. */
  plan: { label: string; personName: string | null; fileName: string | null; pageCount: number | null; status: string }[];
  state: ShaamDocumentsGateState | null;
  /**
   * 28.09.2026 · ההדרכה של שע״ם: בקשה שלא צורפו לה טפסים 30 יום — מבוטלת. כל
   * עוד השידור ממתין, השעון רץ. ISO date, רק כשהבקשה עוד לא שודרה.
   */
  uploadDeadline?: string;
}

const KIND_TEXT: Record<string, string> = {
  idOrLicense: 'צילום תעודת זהות או רישיון נהיגה',
  passport: 'צילום דרכון',
  inheritance: 'צו ירושה + מכתב מעו"ד',
  guardianship: 'צו שיפוטי למינוי אפוטרופוס',
};

const STATE_TEXT: Record<ShaamDocumentsGateState, { title: string; next: string; tone: ShaamDocsTone }> = {
  awaiting_required_documents: {
    title: 'השידור ממתין למסמך שרשות המסים דורשת',
    next: 'נפתחה ללקוח בקשת מסמך («נדרש על ידי רשות המסים להשלמת הייצוג»). כשהמסמך הנכון יגיע — השידור ימשיך מעצמו, פעם אחת.',
    tone: 'wait',
  },
  needs_document_assignment: {
    title: 'לא ניתן לשייך את דרישת המסמך לאדם',
    next: 'הת.ז. שבבקשה בשע״ם אינה תואמת לאדם אחד בכרטיס. תקנו את מספרי הזהות בכרטיס ושדרו שוב.',
    tone: 'attention',
  },
  document_not_pdf_convertible: {
    title: 'המסמך שיש לנו בפורמט שאי אפשר לשלוח',
    next: 'רשות המסים מקבלת PDF. צרפו צילום JPEG, PNG או PDF של אותו אדם — השידור ימשיך מעצמו.',
    tone: 'attention',
  },
  unsupported_required_document: {
    title: 'רשות המסים דורשת מסמך שהאוטומציה לא מעלה',
    next: 'השלימו את ההגשה ידנית בשע״ם, ואז «שודר ידנית - סמנו כנשלח».',
    tone: 'attention',
  },
  first_live_verification: {
    title: 'עצירת אימות ראשון — לא תקלה',
    next: 'המסמך נמצא והתוכנית מוכנה, אבל העלאה אוטומטית של מסמך נוסף עוד לא אומתה מול שע״ם. השלימו ידנית בשע״ם לפי התוכנית, ואז «שודר ידנית - סמנו כנשלח».',
    tone: 'attention',
  },
  required_document_unavailable: {
    title: 'המסמך הנדרש לא נקרא מתיק הלקוח',
    next: 'בדקו שהמסמך נפתח בתיק המסמכים, ושדרו שוב.',
    tone: 'attention',
  },
  resume_queued: {
    title: 'המסמך התקבל — השידור ממשיך',
    next: 'נוצרה משימת שידור חדשה אחת. היא קוראת שוב את מסך המסמכים בשע״ם ומעלה את הכול יחד.',
    tone: 'info',
  },
  submitted: {
    title: 'המסמכים הוגשו לשע״ם',
    next: '',
    tone: 'done',
  },
};

const PLAN_STATUS_TEXT: Record<string, string> = {
  ready: 'מוכן להעלאה',
  missing: 'חסר',
  needs_document_assignment: 'לא ניתן לשייך',
  not_pdf_convertible: 'פורמט שאי אפשר להמיר',
  not_confirmed: 'יש בתיק - ממתין לאישור הלקוח',
};

export function planStatusText(s: string): string {
  return PLAN_STATUS_TEXT[s] ?? s;
}

/**
 * התצוגה של דרישות שע״ם להגשה אחת, או null כשאין מה להציג.
 * ‼ «חסר» נקבע רק ממה ששע״ם דרשה (requiredDocuments) ומה שהשרת קבע
 * (handling/documentsGate) — לא ממה שהמשרד ביקש.
 */
export function shaamDocumentsView(t: ShaamRequestTracking | undefined): ShaamDocumentsView | null {
  // ‼ שורת הטופס עצמו אינה נכנסת לרשימה (הטריגר בשרת מדלג עליה).
  const docs: ShaamRequiredDocument[] = t?.requiredDocuments ?? [];
  const gate: ShaamDocumentsGate | undefined = t?.documentsGate;
  if (docs.length === 0 && !gate) return null;
  if (gate?.state === 'submitted' && docs.length === 0) return null;

  const state = gate?.state ?? null;
  // ‼ handling נכתב כשהמסך נקרא; ההמשך נוצר רק כשלכל שורה מזהה יש מסמך של
  // אותו אדם — אז «נוספה בקשה» כבר אינו נכון.
  const arrived = state === 'resume_queued';
  const items = docs.map((d) => ({
    label: d.kind && KIND_TEXT[d.kind] ? KIND_TEXT[d.kind] : d.label,
    personName: d.personName ?? null,
    handling: arrived && d.person && (d.kind === 'idOrLicense' || d.kind === 'passport')
      ? 'התקבל - יועלה בשידור'
      : shaamRequiredDocumentText(d),
    kind: (d.kind as string) ?? null,
  }));

  const base = state ? STATE_TEXT[state] : {
    title: 'רשות המסים דורשת מסמכים נוספים מלבד ייפוי הכוח',
    next: '',
    tone: 'info' as ShaamDocsTone,
  };

  // ‼ צירוף במשרד עוזר רק כשהבעיה היא «אין לנו את המסמך» / «בפורמט שגוי»,
  // והבעלים ידוע. כשאי אפשר לשייך — צירוף רק היה מנחש.
  const canAttach = state === 'awaiting_required_documents' || state === 'document_not_pdf_convertible'
    || (!state && docs.some((d) => d.handling === 'ambiguous_materials' || d.handling === 'requested' || d.handling === 'already_requested'));
  const attach = canAttach
    ? docs.filter((d) => (d.kind === 'idOrLicense' || d.kind === 'passport') && d.person && d.handling !== 'exists')
      .map((d) => ({ person: d.person as 'client' | 'spouse', personName: d.personName || (d.person === 'spouse' ? 'בן/בת הזוג' : 'הנישום'), kind: d.kind as 'idOrLicense' | 'passport' }))
    : [];

  const plan = state === 'first_live_verification'
    ? (gate?.plan?.slots ?? []).map((p) => ({
        label: KIND_TEXT[p.kind] ?? p.label, personName: p.personName ?? null,
        fileName: p.fileName ?? null, pageCount: p.pageCount ?? null, status: p.status,
      }))
    : [];

  const blocking = state === 'awaiting_required_documents' || state === 'document_not_pdf_convertible'
    || state === 'needs_document_assignment' || state === 'first_live_verification' || state === 'unsupported_required_document';
  const uploadDeadline = blocking ? shaamUploadDeadline(t) : undefined;
  return { title: base.title, next: base.next, tone: base.tone, items, attach, plan, state, ...(uploadDeadline ? { uploadDeadline } : {}) };
}
