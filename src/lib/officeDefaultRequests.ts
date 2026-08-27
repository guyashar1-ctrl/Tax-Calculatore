// ─── בקשות חופשיות בברירת המחדל של המשרד ────────────────────────────────────
// ארבע הבקשות שהמשרד מוסיף בעצמו, בניגוד לתשע שהמערכת יוצרת מתנאים.
//
// ‼ כולן `custom_request` במסד. אין סוג שלב חדש ואין מערכת בקשות שנייה —
// בדיוק כמו רצף הפייפרלס ומסלול הרו״ח הקודם, אלה **תבניות** מעל הבקשה
// החופשית. לכן העריכה, הפרסום, ההעלאה, ההשלמה ושער סגירת הקליטה ממשיכים
// לעבוד בלי שאף אחד מהם יודע שקיימת בקשה כזאת.
//
// ‼ מי בונה את ה-payload: הקוד הזה, בזמן שהמשרד מגדיר — והתוצאה נשמרת
// בצילום. השרת (מיגרציה 137) מעביר אותה כמות שהיא ל-create_onboarding_request.
// הבנייה נשארת במקום אחד; ל-SQL אין לוגיקת ניסוח משלו שתסחף.

import { BANK_DEBIT_TITLE, buildBankDebitPayload } from './bankDebitRequest';
import { buildDocumentRequestPayload, documentLibrary } from './clientGuide';
import type { ClientDocument } from './clientGuide';
import type { FirmProfile } from '../types/firmProfile';
import { DEBIT_INSTITUTION_ORDER, INSTITUTION_NAMES } from '../types/onboarding';
import type { InstitutionKey } from '../types/onboarding';
import type { DefaultCopy, DefaultEntry, DefaultItem } from '../types/journeyDefaults';

export type OfficeRequestKind = 'fee_ack' | 'car_expenses' | 'authority_debit' | 'send_document';

export interface OfficeKindSpec {
  key: OfficeRequestKind;
  name: string;
  hint: string;
  owner: string;
  /** תצורה שהעורך הכללי (נוסח + פריטים) אינו מכסה. */
  config?: 'authorities' | 'document';
  copy: DefaultCopy;
  items: DefaultItem[];
  note?: string;
}

/** ‼ הניסוחים והפריטים מועתקים מאב-הטיפוס המאושר, ולא הומצאו כאן. */
export const OFFICE_REQUEST_KINDS: OfficeKindSpec[] = [
  {
    key: 'fee_ack',
    name: 'אישור תנאי שכר טרחה',
    hint: 'אישור קצר שהלקוח קורא וחותם עליו בדף האישי',
    owner: 'הלקוח מאשר',
    copy: {
      clientTitle: 'אישור תנאי ההתקשרות',
      clientSub: 'קריאה קצרה ואישור - שתי דקות',
      clientCta: 'למילוי',
    },
    items: [{ key: 'r1', label: 'קראתי ואני מאשר את תנאי שכר הטרחה' }],
  },
  {
    key: 'car_expenses',
    name: 'פרטי רכב להכרה בהוצאות',
    hint: 'אישור קריאה, מספר רישוי וצילום רישיון הרכב',
    owner: 'הלקוח ממלא',
    copy: {
      clientTitle: 'פרטי הרכב לצורך הכרה בהוצאות',
      clientSub: 'אישור קריאה, מספר רישוי וצילום רישיון',
      clientCta: 'למילוי',
    },
    items: [
      { key: 'ack', label: 'קראתי והבנתי את כללי ההכרה בהוצאות רכב' },
      { key: 'plate', label: 'מספר רישוי הרכב' },
      { key: 'license', label: 'צילום רישיון הרכב' },
    ],
  },
  {
    key: 'authority_debit',
    // ‼ שם אחד לשני המשטחים: אותה מחרוזת שמופיעה ב«+ בקשה» בכרטיס הלקוח,
    // ומאותו בונה. שני שמות לאותה בקשה היו נקראים כשתי בקשות שונות.
    name: BANK_DEBIT_TITLE,
    hint: 'הלקוח פותח הרשאה בבנק ומעלה אסמכתה - לרשויות שתבחר',
    owner: 'הלקוח פותח',
    config: 'authorities',
    copy: {},
    items: [],
    note: 'קוד המוסד של כל רשות מוצג ללקוח בדף האישי, והבקשה נסגרת כשכל האסמכתאות הועלו.',
  },
  {
    key: 'send_document',
    name: 'שליחת מסמך ללקוח',
    hint: 'מסמך מספריית המשרד - נסגרת כשהלקוח פותח אותו',
    owner: 'הלקוח קורא',
    config: 'document',
    copy: {},
    items: [],
    note: 'הקובץ עצמו מנוהל במסך «מסמכים ללקוחות».',
  },
];

export const officeKindSpec = (key: string): OfficeKindSpec | undefined =>
  OFFICE_REQUEST_KINDS.find(k => k.key === key);

export const isOfficeEntry = (e: DefaultEntry) => e.source === 'office';

/** סדר התצוגה של הרשויות בבקשת ההרשאה — מס הכנסה, מע״מ, ביטוח לאומי. */
export const DEBIT_AUTHORITIES: { key: InstitutionKey; label: string }[] =
  DEBIT_INSTITUTION_ORDER.map(k => ({ key: k, label: INSTITUTION_NAMES[k] }));

/**
 * ה-payload שיישמר בצילום ויימסר לשרת כמות שהוא.
 *
 * ‼ שלושה מסלולים, ושניים מהם אינם בונים כאן כלום אלא קוראים לבונה הקיים:
 * ההרשאות לרשויות ל-buildBankDebitPayload, ושליחת מסמך ל-
 * buildDocumentRequestPayload. הבקשות הפשוטות נבנות מהנוסח והפריטים שהמשרד
 * ערך, באותה צורה שבה בקשה חופשית נבנית בכרטיס הלקוח.
 */
export function officeEntryPayload(
  entry: DefaultEntry,
  profile?: FirmProfile | null,
): Record<string, unknown> | null {
  const spec = officeKindSpec(entry.key);
  if (!spec) return null;

  if (spec.config === 'authorities') {
    const picked = (entry.authorities ?? []).filter(k => DEBIT_INSTITUTION_ORDER.includes(k));
    if (picked.length === 0) return null;           // בלי רשות אחת לפחות אין מה לבקש
    // שמירה על סדר התצוגה המוסכם, לא על סדר הלחיצה
    const ordered = DEBIT_INSTITUTION_ORDER.filter(k => picked.includes(k));
    return buildBankDebitPayload(ordered) as unknown as Record<string, unknown>;
  }

  if (spec.config === 'document') {
    const doc: ClientDocument | undefined = profile
      ? documentLibrary(profile).find(d => d.id === entry.documentId)
      : undefined;
    if (!doc) return null;                           // לא נבחר מסמך ⇒ אין בקשה
    return buildDocumentRequestPayload(doc);
  }

  const v = entry.variants[0];
  const copy = { ...spec.copy, ...(v?.copy ?? {}) };
  const items = v?.items ?? spec.items;
  return {
    title: spec.name,
    clientTitle: copy.clientTitle ?? spec.name,
    clientSub: copy.clientSub ?? '',
    clientCta: copy.clientCta ?? 'למילוי',
    requirements: items.map((it, i) => ({
      key: it.key || `i${i + 1}`,
      // ‼ סוג הדרישה: פריט שנקרא "צילום"/"אסמכתה" הוא קובץ, השאר אישור.
      // אותה הבחנה שהקומפוזר בכרטיס הלקוח עושה, ובלעדיה הלקוח מקבל תיבת
      // סימון במקום העלאה.
      kind: /צילום|אסמכתה|קובץ|העתק/.test(it.label) ? 'file' : 'confirm',
      label: it.label,
      done: false,
      required: true,
    })),
  };
}

/** תיאור קצר של התצורה, לשורה האפורה שמתחת לשם הבקשה. */
export function officeEntrySummary(
  entry: DefaultEntry,
  profile?: FirmProfile | null,
): string | null {
  const spec = officeKindSpec(entry.key);
  if (!spec) return null;
  if (spec.config === 'authorities') {
    const picked = entry.authorities ?? [];
    if (!picked.length) return 'לא נבחרה אף רשות';
    return DEBIT_INSTITUTION_ORDER.filter(k => picked.includes(k))
      .map(k => INSTITUTION_NAMES[k]).join(' · ');
  }
  if (spec.config === 'document') {
    const doc = profile ? documentLibrary(profile).find(d => d.id === entry.documentId) : undefined;
    return doc ? doc.label : 'לא נבחר מסמך';
  }
  return null;
}

/** האם התצורה שלמה מספיק כדי שהשרת ייצור את הבקשה. */
export const officeEntryReady = (entry: DefaultEntry, profile?: FirmProfile | null) =>
  officeEntryPayload(entry, profile) !== null;
