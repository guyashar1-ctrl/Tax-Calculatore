// ─── טפסי מס — גרסאות, שדות, נספחים ומקור התשובה ───────────────────────────
// המטרה בהמשך: הכנת 1301 ונספחיו מתוך תיק הלקוח. לכן כל שדה ותיבת סימון
// מתועדים כמשמעות — לא כמספר או כמיקום: מה הם אומרים, מתי הם רלוונטיים, מאיפה
// באה התשובה, לאיזו שנה/תקופה היא צריכה להתאים ואיך בודקים את המילוי.
//
// ‼ גרסת טופס היא מסמך בפני עצמו: שנת המס שהוא משמש לדיווח עליה, מועד הפרסום,
// מועד התחולה והגרסה — נפרדים (טופס שפורסם ב-2027 משמש לדיווח על 2026).
// ‼ שדה מזוהה במפתח סמנטי יציב (key). מספר השדה (קוד) הוא תכונה של הגרסה ויכול
// להשתנות בין שנים בלי שהמשמעות משתנה — ולהפך.

import type { Basis } from '../taxRules/types';

export type FormAuthority = 'ita' | 'btl';

/** כמה מהטופס נקרא בפועל — לא «נבדק» כשנקרא רק חלק. */
export type ReadStatus = 'read' | 'partlyRead' | 'notRead';

export interface FormVersion {
  /** «1301@2025» — טופס + שנת המס שהוא משמש לה. */
  id: string;
  formId: string;
  title: string;
  authority: FormAuthority;
  /** שנת המס שהדיווח בטופס הזה מתייחס אליה. */
  refersToTaxYear: number;
  /** מסמכי המקור: הטופס, ההוראות, המדריך (מזהים ב-taxRules/sources). */
  sourceIds: string[];
  publishedAt?: string;
  effectiveFrom?: string;
  documentVersion?: string;
  /** הגרסה הקודמת של אותו טופס — נשמרת, לא נמחקת. */
  supersedes?: string;
  readStatus: ReadStatus;
  /** מה נקרא בפועל ומה לא — משפט, לדוח ולמסך. */
  readScope: string;
  checkedAt: string;
}

export type FieldKind = 'amount' | 'checkbox' | 'text' | 'date' | 'count' | 'choice';

/**
 * מאיפה באה התשובה לשדה.
 * fileFact — נתון שכבר קיים בתיק (כרטיס/עובדות); document — אסמכתה (106, אישור קופה);
 * client — תשובת הלקוח; calculation — חישוב מכללים; office — הכרעת המשרד.
 */
export type AnswerSource = 'fileFact' | 'document' | 'client' | 'calculation' | 'office';

/** לאיזו תקופה הנתון בתיק מתייחס. 'current' = מצב עדכני, לא של שנה מסוימת. */
export type FactScope = 'current' | 'taxYear' | 'asOfDate';

export type Tri = 'yes' | 'no' | 'unknown';

export interface FieldContext {
  /** כרטיס הלקוח (או בן/בת הזוג) — מה שידוע. */
  facts: Record<string, unknown>;
  fieldMeta?: Record<string, { source?: string; syncedAt?: string; validUntil?: string } | undefined>;
  taxYear: number;
}

export interface FormField {
  /** מפתח סמנטי יציב בין גרסאות: «sf.selfEmployedDeposit». */
  key: string;
  /** הגרסה שההגדרה הזו שייכת לה. */
  formVersionId: string;
  part: string;
  section: string;
  /** קודים בגרסה הזו: לבן הזוג הרשום ולבן/בת הזוג. */
  codes: { registered?: string; spouse?: string };
  label: string;
  kind: FieldKind;
  /** מה השדה אומר — בעברית פשוטה, כפי שמופיע בהוראות. */
  meaning: string;
  /** מתי רלוונטי — טקסט, ותנאי שמוערך מול התיק (כן/לא/לא ידוע). */
  relevantWhen: string;
  relevance?: (ctx: FieldContext) => Tri;
  sources: AnswerSource[];
  /** נתון בתיק שממנו אפשר להתחיל, ולאיזו תקופה הוא מתייחס. */
  fact?: { key: string; scope: FactScope; label: string };
  /** אסמכתאות שמבססות את הערך. */
  evidence?: string[];
  /** חישוב — הכללים במרשם והתיאור. */
  calculation?: { ruleIds: string[]; description: string };
  /** מה המשמעות של שדה ריק / אפס / לא מסומן, לפי ההוראות (אם נאמר). */
  emptyMeaning?: string;
  /** איך בודקים שהמילוי נכון בגרסה הזו. */
  fillCheck: string;
  basis: Basis;
  sourceId: string;
  locator?: string;
  checkedAt: string;
}

/** נספח/טופס נלווה — ומתי הוא נדרש לפי נסיבות הלקוח. */
export interface AnnexRule {
  formId: string;
  title: string;
  /** לאיזו גרסה של הטופס הראשי הכלל שייך. */
  forVersionId: string;
  requiredWhen: string;
  relevance?: (ctx: FieldContext) => Tri;
  basis: Basis;
  sourceId: string;
  locator?: string;
  checkedAt: string;
}

// ── תשובות ──────────────────────────────────────────────────────────────────

/**
 * ‼ חמישה מצבים שונים — ולא «ריק»:
 * value — ערך; zero — אפס שנבדק; no — «לא» לתיבת סימון / שאלה;
 * notApplicable — הסעיף לא חל על הלקוח (עם סיבה); missing — אין תשובה.
 */
export type AnswerState =
  | { kind: 'value'; value: number | string | boolean }
  | { kind: 'zero' }
  | { kind: 'no' }
  | { kind: 'notApplicable'; reason: string }
  | { kind: 'missing' };

export interface FieldAnswer {
  fieldKey: string;
  /** שנת המס שהתשובה מתייחסת אליה. */
  taxYear: number;
  /** הגרסה שהתשובה ניתנה מולה — כדי לזהות שהטופס השתנה מאז. */
  formVersionId: string;
  state: AnswerState;
  source: AnswerSource;
  /** מי ענה / מאיפה (טקסט), ומתי. */
  sourceLabel: string;
  answeredAt: string;
  /** תשובה שהוחלפה נשמרת כאן — לא נמחקת. */
  history?: Omit<FieldAnswer, 'history'>[];
}

// ── השוואת גרסאות ───────────────────────────────────────────────────────────

export type FieldChangeKind =
  | 'added' | 'removed'
  | 'codeChanged'        // מספר השדה זז, המשמעות זהה
  | 'sectionChanged'     // מספר הסעיף בטופס זז, המשמעות והקוד זהים
  | 'kindChanged'        // סכום ↔ תיבת סימון וכד׳
  | 'meaningChanged'
  | 'conditionChanged'   // מתי רלוונטי / תנאי מילוי
  | 'calculationChanged'
  | 'evidenceChanged';

export interface FieldChange {
  kind: FieldChangeKind;
  fieldKey: string;
  label: string;
  before?: string;
  after?: string;
}

export interface AnnexChange { kind: 'added' | 'removed' | 'conditionChanged'; formId: string; title: string; before?: string; after?: string }

// ── מוכנות שדה מול התיק ──────────────────────────────────────────────────────

export type ReadinessStatus =
  | 'ready'                 // יש תשובה לשנה ולגרסה — אפשר למלא
  | 'verify'                // יש מידע, אבל לא לשנה/לגרסה/למקור הנדרש — לאמת
  | 'missing'               // רלוונטי ואין מידע — לבקש
  | 'notApplicable'         // לא חל — עם סיבה
  | 'unknownApplicability'; // לא ידוע אם חל — שאלה אחת לפני הכול

export interface FieldReadiness {
  fieldKey: string;
  status: ReadinessStatus;
  /** למה — משפט למשרד. */
  reason: string;
  /** אם צריך לפנות: למי ומה בדיוק. */
  ask?: { who: 'client' | 'office' | 'document'; what: string };
  /** תשובה קיימת שנמצאה (לא מומצאת). */
  answer?: FieldAnswer;
}

/** בקשה ממוקדת שנוצרה משינוי בטופס — לא מוחקת תשובה קודמת. */
export interface FormFollowUp {
  fieldKey: string;
  label: string;
  kind: 'ask' | 'verifyExisting' | 'mappingOnly' | 'archiveAnswer';
  who?: 'client' | 'office' | 'document';
  why: string;
  /** התשובה הקודמת שנשמרת לצד הבקשה. */
  keptAnswer?: FieldAnswer;
}
