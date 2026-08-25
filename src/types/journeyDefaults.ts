// ─── ברירת המחדל של מסע הבקשות ──────────────────────────────────────────────
// המבנה כאן חייב להישאר תואם ל-`office_journey_defaults.entries` (מיגרציה 135)
// ולפונקציות הקריאה שלה. השרת הוא זה שמעריך אותו בזמן יצירת המסע; כאן רק
// עורכים אותו.
//
// ‼ אוצר המילים של העובדות סגור. שבע, בדיוק אלה שהמחולל יודע לשאול על לקוח.
// אין ניסוח חופשי ואין IF/THEN — תנאי שהשרת לא יידע להעריך לא ניתן להגדרה.

export type ClientKind =
  | 'exempt_dealer' | 'licensed_dealer' | 'company' | 'tax_refund' | 'representation_only';

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  exempt_dealer: 'עוסק פטור',
  licensed_dealer: 'עוסק מורשה',
  company: 'חברה',
  tax_refund: 'החזר מס',
  representation_only: 'ייצוג בלבד',
};

export const CLIENT_KIND_ORDER: ClientKind[] = [
  'exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only',
];

export type FactKey =
  | 'monthly' | 'paperless' | 'licensed' | 'rep' | 'has_prev' | 'new_business' | 'no_prev_email';

/** התווית והמשפט שמסביר מתי העובדה נכונה. הניסוח מגיע מהמחולל עצמו. */
export const FACTS: { key: FactKey; label: string; when: string }[] = [
  { key: 'monthly',      label: 'שירות חודשי בהצעה',             when: 'כשההצעה כוללת שירות חודשי' },
  { key: 'paperless',    label: 'פייפרלס או הנהלת חשבונות בהצעה', when: 'כשההצעה כוללת הנהלת חשבונות או פייפרלס' },
  { key: 'licensed',     label: 'עוסק מורשה או חברה',            when: 'כשהלקוח עוסק מורשה או חברה' },
  { key: 'rep',          label: 'ההצעה כוללת ייצוג',              when: 'כשההצעה כוללת ייצוג' },
  { key: 'has_prev',     label: 'יש רו״ח קודם',                   when: 'כשיש רו״ח קודם' },
  { key: 'new_business', label: 'עסק חדש',                       when: 'כשעל הכרטיס נרשם במפורש שאין רו״ח קודם' },
  { key: 'no_prev_email', label: 'אין מייל של הרו״ח הקודם',       when: 'כשאין מייל של הרו״ח הקודם על כרטיס הלקוח' },
];

/**
 * ‼ תווית הענף אינה תמיד שם העובדה. באב-הטיפוס המאושר הצ'יפ נקרא «מגיע
 * מרו״ח אחר» בזמן שהעובדה ברשימה הסגורה נקראת «יש רו״ח קודם» — אותו דבר,
 * ניסוח שמתאים להקשר. השמות כאן גוברים על שם העובדה בצ'יפים בלבד.
 */
const VARIANT_LABELS: Record<string, string> = {
  has_prev: 'מגיע מרו״ח אחר',
  no_email: 'אין מייל בכרטיס',
};

export const variantLabel = (variantKey: string, fact: FactKey | null | undefined) =>
  VARIANT_LABELS[variantKey]
  ?? (fact ? FACTS.find(f => f.key === fact)?.label ?? variantKey : 'ברירת מחדל');

export const factLabel = (k: FactKey | null | undefined) =>
  FACTS.find(f => f.key === k)?.label ?? 'ברירת מחדל';
export const factWhen = (k: FactKey | null | undefined) =>
  FACTS.find(f => f.key === k)?.when ?? '';

export interface DefaultItem { key?: string; label: string }

export interface DefaultCopy {
  clientTitle?: string;
  clientSub?: string;
  clientCta?: string;
}

/**
 * ענף אחד. `fact: null` הוא הנופל־אחורה, והוא חייב להיות האחרון — פונקציית
 * הבחירה בשרת (`journey_default_variant`) מסתמכת על כך ולא מנחשת.
 */
export interface DefaultVariant {
  key: string;
  fact: FactKey | null;
  items?: DefaultItem[];
  copy?: DefaultCopy;
}

export interface DefaultEntry {
  key: string;
  stepType: string;
  enabled: boolean;
  sortIndex: number;
  source: 'system' | 'office';
  /** null ⇒ המערכת מחליטה. */
  requiredForClose: boolean | null;
  dueInDays: number | null;
  /** לתצוגה בלבד — האכיפה בשרת. */
  dependsOn: string | null;
  variants: DefaultVariant[];
}

// ─── מטא-דאטה לתצוגה ────────────────────────────────────────────────────────
// ‼ תיאור בלבד. שום דבר כאן אינו מחולל בקשות — הוא מסביר מה השרת עושה.
// התנאים והבעלות מועתקים מהמחולל החי (ראה docs/INVENTORY-JOURNEY-GENERATION.md).

export interface RequestMeta {
  name: string;
  /** מתי המערכת יוצרת אותה. */
  cond: string;
  /** מי מבצע. */
  owner: string;
  /** אין לה תצוגה בדף האישי. */
  extern?: boolean;
  /** הכותרת והשורה שמתחתיה נגזרות מהרשימה ואינן נוסח כתוב. */
  derivedCopy?: boolean;
  /** רמז לקטלוג ההוספה. */
  hint?: string;
  /** למה התלות קיימת — משפט אחד, לקריאה בלבד. */
  depWhy?: string;
  note?: string;
}

export const REQUEST_META: Record<string, RequestMeta> = {
  client_documents: {
    name: 'מסמכים מהלקוח', cond: 'תמיד', owner: 'הלקוח מעלה', derivedCopy: true,
    hint: 'רשימת מסמכים שהלקוח מעלה בדף האישי',
  },
  prev_accountant_details: {
    name: 'פרטי הרו״ח הקודם', cond: 'כשיש רו״ח קודם', owner: 'הלקוח ממלא',
    hint: 'שם, מייל וטלפון של הרו״ח הקודם',
    note: 'בלי מייל אין למי לשלוח את מכתב ההעברה, ולכן המכתב תלוי בבקשה הזאת.',
  },
  release_letter: {
    name: 'מכתב העברת טיפול', cond: 'כשיש רו״ח קודם', owner: 'נשלח לרו״ח הקודם', extern: true,
    hint: 'מכתב לרו״ח הקודם', depWhy: 'בלי המייל של הרו״ח הקודם אין למי לשלוח את המכתב.',
    note: 'הנוסח נערך ב«פייפרלס ותקשורת». ארבעה סעיפים נגזרים מההצעה ואינם ניתנים לעריכה.',
  },
  materials_received: {
    name: 'קבלת חומרים מהרו״ח הקודם', cond: 'כשיש רו״ח קודם', owner: 'הרו״ח הקודם מעלה', extern: true,
    hint: 'רשימת החומרים שמבקשים מהרו״ח הקודם',
    depWhy: 'החומרים מגיעים בעקבות המכתב, ולכן אין מה לפתוח לפניו.',
  },
  paperless_invite: {
    name: 'הרשמה לפייפרלס',
    cond: 'כשההצעה כוללת שירות חודשי או הנהלת חשבונות', owner: 'הלקוח נרשם',
    hint: 'הלקוח נרשם לפייפרלס בעצמו',
  },
  paperless_connection: {
    name: 'חיבור לפייפרלס', cond: 'עם ההרשמה לפייפרלס', owner: 'בטיפול המשרד',
    hint: 'המשרד משלים את ההקמה בחשבון',
    depWhy: 'אי אפשר להיכנס לחשבון ולהשלים את ההקמה לפני שהלקוח נרשם.',
    note: 'הפעולה נעשית בתוך חשבון הפייפרלס, שם מזינים את פרטי האשראי, ולכן היא של המשרד.',
  },
  paperless_tax_authority: {
    name: 'חיבור פייפרלס לרשות המסים', cond: 'עוסק מורשה וחברה בלבד', owner: 'הלקוח מחבר',
    hint: 'לעוסק מורשה ולחברה - חיבור לרשות המסים לצורך מספר הקצאה',
    depWhy: 'בלי שם עסק ומשיכת עוסקים בחשבון אין מה לחבר לרשות המסים.',
    note: 'ההזדהות היא בתעודת הזהות ובקוד הקבוע של הלקוח, ולכן היא שלו ולא שלנו.',
  },
  retainer_authorization: {
    name: 'הרשאה לתשלום חודשי', cond: 'כשיש סכום חודשי בהצעה', owner: 'הלקוח מזין',
    hint: 'הרשאה קבועה בסכום שסוכם',
    depWhy: 'ההרשאה נפתחת בפייפרלס, ולכן היא ממתינה לחיבור.',
    note: 'הסכום מגיע מההצעה שאושרה ואינו ניתן לעריכה כאן.',
  },
  intake_questionnaire: {
    name: 'עדכון סטטוס מס', cond: 'תמיד', owner: 'הלקוח ממלא',
    hint: 'רענון תיק המס - שאלון ומסמכים לפי מה שחסר',
    note: 'נולדת כטיוטה: הלקוח רואה אותה רק אחרי שפותחים אותה במפורש.',
  },
};

/** הבקשות שאפשר להוסיף לברירת המחדל מהקטלוג. */
export const CATALOG_STEP_TYPES = [
  'client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
  'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
  'retainer_authorization', 'intake_questionnaire',
];

export const metaFor = (stepType: string): RequestMeta =>
  REQUEST_META[stepType] ?? { name: stepType, cond: 'תמיד', owner: 'הלקוח' };

/** בקשה תלויה אינה נגררת: הסדר שלה אמיתי ונאכף בשרת. */
export const isDependent = (e: DefaultEntry) => !!e.dependsOn;

/** מיון להצגה — לפי המקום השמור. */
export const bySortIndex = (a: DefaultEntry, b: DefaultEntry) => a.sortIndex - b.sortIndex;
