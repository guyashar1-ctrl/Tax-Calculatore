// ─── הדוח השנתי (שלב 4) — מבנה הנתונים ──────────────────────────────────────────
// ‼ שלושה מצבים שאסור לערבב: טיוטה פנימית · מוכן להגשה (אושר בסקירת המשרד, בלי חוסמים) · הוגש בפועל (נרשם ביד,
//   עם תאריך ואסמכתה — אין כאן שידור לרשות).
// ‼ כל סכום בטיוטת 1301 מצביע למקור: עובדה מאושרת (ואיך אומתה), חישוב (וכללים), או השלמה מקצועית מתועדת.
// ‼ מקור הכנסה, נספח או כלל שאינם נתמכים — «חסר», והדוח אינו «מוכן להגשה» עד השלמה מתועדת.

import type { Blocker, EstimateOutputs, MicroSetup, NiOverride, Person, Adjustment } from '../taxEstimate/types';
import type { Trust } from './facts';
import type { FormCoverage } from './formFields';

/** סוג הפער — קובע מה יכול לסגור אותו. ‼ השלמה מקצועית סוגרת רק data/calc, ורק בשדות שהמערכת מפיקה. */
export type GapKind = 'data' | 'calc' | 'decision' | 'control' | 'annex' | 'mapping' | 'form';
export interface ReturnGap extends Blocker { kind: GapKind }

/** מצב התוכן. «מוכן להגשה» הוא אישור משרד על גרסה במצב completeWorksheet — לא מצב של התוכן. */
export type ContentStatus = 'internalDraft' | 'partialWorksheet' | 'completeWorksheet';

/** נספח 1320 לעסק: שורות רווח והפסד לפי הספרים, פרטי ניהול הספרים והתאמות. */
export interface Books1320 {
  basis?: 'accrual' | 'cash';
  /** שורות הנספח (1, 2א…17, 20, 21) — סכומים שהמשרד אישר. השורות המחושבות (2ד, 18, 19, 22) נגזרות. */
  lines: Record<string, number>;
  /** שורות רו״ה שנקלטו, והשורה בנספח שהוקצתה לכל אחת (הצעה אוטומטית שהמשרד מאשר). */
  imported?: { label: string; total: number; line?: string }[];
  importedRevenue?: number;
  /** סעיף א׳ — ניהול ספרים (כן/לא + טקסט). */
  answers: Record<string, boolean | string>;
  /** שורה 7 — החלק המותר לפי תקנות הרכב, ופרטי הרכב (סעיף ג׳). */
  carAllowed?: number;
  carDetails?: string;
  /** שורה 11 — פרטי המשכיר (סעיף ד׳). */
  landlord?: string;
  /** שורה 20 — פירוט ההוצאות שאינן מותרות (סעיף ה׳). */
  addBackNote?: string;
  monthsActive?: number;
}

/** השלמה מקצועית: המשרד מזין ערך לשדה/נספח שהמערכת לא מחשבת — עם השפעת המס, ביסוס, אסמכתה ואישור. */
export interface ReturnCompletion {
  id: string;
  /** הפער שההשלמה סוגרת (קוד מהרשימה «מה חסר»). */
  gap: string;
  person: Person;
  /** ערכים לשדות 1301 (קוד → סכום). */
  fields: { code: string; amount: number }[];
  /** המס על הרכיב, כפי שחושב מחוץ למערכת (נוסף לחבות). 0 = אין השפעת מס. */
  taxAmount?: number;
  justification: string;
  evidenceDocumentId?: string;
  approvedAt?: string;
}

export interface ReturnDraft {
  taxYear: number;
  preparedOn: string;
  /** האנשים שבדוח — הלקוח, ובן/בת הזוג כשיש חישוב משותף/דיווח. */
  persons: Person[];
  completions: ReturnCompletion[];
  adjustments: Adjustment[];
  /** עסק זעיר לפי עסק בכרטיס (מסלול, רישום, מסלול דיווח, היסטוריה). */
  micro: Record<string, MicroSetup & { track?: 'books' | 'micro' }>;
  niOverrides?: NiOverride[];
  /** הכרעות משרד לכללים פתוחים (למשל שיעור 25% להון) — נשמרות בגרסה. */
  decisions: { key: string; text: string; at?: string }[];
  /** נספח 1321, סעיף 3 (שכירות למגורים 10%): «דירה יחידה», שכר דירה ששולם למגורי המשכיר (עד 90,000), ופרטי כל דירה. */
  rent1321?: { singleApartment?: boolean; ownHousingRent?: number; props?: Record<string, { block?: string; parcel?: string; area?: string; floor?: string }> };
  /** נספח 1320 לכל עסק (לפי מזהה העסק בכרטיס). */
  books?: Record<string, Books1320>;
  /** 30.10.2026 · נספח 1342 (פחת) לכל עסק — שורה 17 ב-1320 נגזרת ממנו (depreciation1342.ts). */
  depreciation?: Record<string, import('./depreciation1342').DepTable>;
  /** עמית מוטב שבוחר חישוב «יחיד» (מסלול א׳) — סימון 233/234. */
  pensionTrack?: Partial<Record<Person, 'auto' | 'A'>>;
  /** ערכים ידניים מעל החישוב («#») — רק עם נימוק; הסכום המחושב נשמר לצידם. */
  overrides?: ManualOverride[];
  note?: string;
}

/**
 * שורת מקור (17.10.2026, שלב 1 של תוכנית הליווי): סכום + המסמך שממנו נלקח + השאלה בשאלון + האדם + השנה.
 * השדה בטופס הוא סיכום מחושב של שורותיו — לא מספר שמקלידים לתוכו. «ממה זה מורכב?» = הרשימה הזו.
 */
export interface SourceLine {
  factId: string;
  /** השאלה בקטלוג (tax_year_facts.item_key) והרכיב בתוכה (gross / withheld / health…). */
  itemKey: string;
  component: string;
  /** מפתח השורה במסמך (למשל ‎106.gross‎) — כשהוזן ממרשם תבניות המסמך. */
  lineKey?: string;
  amount: number;
  person: 'client' | 'spouse' | 'couple';
  entityRef?: string;
  year: number;
  /** המסמך: מזהה הראיה, סוגו ושמו; בלי מסמך — «הוזן / הוצהר» (trust manual). */
  evidenceId?: string;
  docKind?: string;
  docLabel: string;
  fileName?: string;
  askId?: string;
  trust: Trust;
  enteredBy?: string;
  enteredAt: string;
}

export interface FieldSource {
  /** manual — ערך ידני מעל חישוב (מסומן «#» ומנומק; הסכום המחושב נשמר ב-computed). */
  kind: 'fact' | 'calculation' | 'completion' | 'card' | 'manual';
  factIds?: string[];
  evidenceIds?: string[];
  trust?: Trust;
  ruleIds?: string[];
  completionId?: string;
  text: string;
  /** שורות המקור שמרכיבות את הסכום. ‼ כש-sumIsField=true: Σ השורות = השדה (בקרה «Σ שורות ≠ שדה»); אחרת השדה נגזר מהן (למשל אחרי ניכוי). */
  lines?: SourceLine[];
  sumIsField?: boolean;
  /** ערך ידני: הסכום שהמערכת חישבה לפני הדריסה. */
  computed?: number;
}

/** ערך ידני מעל החישוב — כלל אישור התוכנה של רשות המסים: מסומן «#» ומנומק (תוכנית הליווי §1.5). */
export interface ManualOverride {
  code: string;
  person: Person | 'joint';
  amount: number;
  justification: string;
  at?: string;
}

/** שורה בטיוטת 1301: קוד, חלק, סכום או סימון — ומאיפה. */
export interface ReturnField {
  code: string;
  part: string;
  section?: string;
  label: string;
  person: Person | 'joint';
  kind: 'amount' | 'checkbox' | 'code' | 'text';
  amount?: number;
  checked?: boolean;
  /** ערך טקסט / תאריך / ספירה (פרטים אישיים, קודים, ילדים). */
  text?: string;
  source: FieldSource;
  /** הקוד מופיע בטופס יותר מפעם אחת לאותו טור (N7) — התווית נבחרה לפי סוג, ומסומנת לבדיקה. */
  ambiguous?: boolean;
}

export interface AnnexStatus {
  formId: string;
  title: string;
  /** למי ולמה. */
  reason: string;
  person?: Person;
  entityRef?: string;
  status: 'filled' | 'partial' | 'manual' | 'missing';
  rows: { label: string; amount?: number; text?: string; source?: FieldSource }[];
  note?: string;
}

export interface ReturnControl {
  id: string;
  text: string;
  /** null = לא נבדק (אין נתון). */
  ok: boolean | null;
  detail: string;
}

export interface ReturnOutputs {
  taxYear: number;
  formVersionId: string;
  /** internalDraft — חסרים נתונים; partialWorksheet — הנתונים הושלמו אבל יש שדה או נספח רלוונטי שהמערכת לא מפיקה;
   *  completeWorksheet — כל השדות והנספחים הרלוונטיים מופקים (להקלדה במערכת המקוונת / לקובץ). */
  status: ContentStatus;
  /** בדיקת הכיסוי — לכל שדה ונספח בטופס, ללקוח הזה. */
  formCoverage: FormCoverage;
  /** מה המערכת אינה מפיקה ללקוח הזה (נספח, שדה, כלל) — לא נסגר בהשלמה מקצועית. */
  unsupported: ReturnGap[];
  /** שורות 1320 המחושבות לכל עסק (להפקה ולבקרה). */
  annex1320?: { entityRef: string; label: string; lines: Record<string, number>; complete: boolean; problems: string[] }[];
  /** נספח 1321 (מסלול 10%): הכנסה, ניכוי שכר דירה למגורים, נטו (→ 284/344/222), ופרטי הדירות. */
  annex1321?: { gross: number; ownHousingRent: number; net: number; singleApartment?: boolean; props: { id: string; address: string; block?: string; parcel?: string; area?: string; floor?: string }[]; complete: boolean; problems: string[] };
  /** לכל אדם: ניכוי במקור (משכר / אחר / ריבית), מקדמות ומספר טופסי 106 — לכותרת קובץ 1301. */
  byPerson?: Partial<Record<Person, { salaryWithheld: number; otherWithheld: number; interestWithheld: number; advances: number; forms106: number }>>;
  persons: EstimateOutputs['persons'];
  /** incomplete — חסרה הכנסה או ניכוי של מקור שבתיק: החבות והיתרה אינן מספר להציג (מוצג «חסר», לא 0 / «מאוזן»). */
  household: { liability: number; withheld: number; advancesPaid: number; manualTax: number; balance: number; incomplete: boolean; explain: string[] };
  fields: ReturnField[];
  annexes: AnnexStatus[];
  controls: ReturnControl[];
  gaps: ReturnGap[];
  blockers: ReturnGap[];
  /** השלמות מקצועיות שאושרו ונכנסו לגרסה — עם הביסוס והשפעת המס, כדי שהגיליון יראה אותן גם כשאין להן קוד. */
  completions: ReturnCompletion[];
  /** מה בא מהערכת המס ומה הדוח השלים. */
  coverage: { estimateVersion?: number; estimateCutoff?: number; text: string };
  micro: EstimateOutputs['micro'];
  limits: string[];
  usedRules: EstimateOutputs['usedRules'];
  rulesetVersion: string;
  nextAction: string;
}

export interface ReturnVersion {
  id: string;
  requestId: string;
  clientId: string;
  taxYear: number;
  version: number;
  revision: number;
  status: 'draft' | 'approved' | 'superseded';
  draft: ReturnDraft;
  outputs?: ReturnOutputs;
  inputFacts: { id: string; value: unknown }[];
  approvedAt?: string;
  /** הוגש בפועל — נרשם ביד (אין שידור מכאן). */
  filedAt?: string;
  filedRef?: string;
  createdAt: string;
}
