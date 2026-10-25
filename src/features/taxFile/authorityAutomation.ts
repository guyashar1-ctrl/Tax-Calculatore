// ─── אוטומציה ברמת כרטיס הרשות — מודל אחד לכל הרשויות ─────────────────────────
// ‼ החלטת מוצר: האוטומציה היא פעולה של **הכרטיס**, לא של השדה. לחיצה אחת
// בכותרת הכרטיס מריצה קריאה אחת מהרשות, קוראת את כל השדות הנתמכים, משווה
// אותם לתיק, ומחזירה סט השוואה מובנה. השדות מקבלים סמן מצב קטן; השינויים
// מאושרים בפעולה מקובצת אחת. ראה docs/prototypes/tax-file-v5-1301.html.
//
// ‼ אין כאן רכיב React ואין כאן תלות ברשות מסוימת: הטיפוסים והסיכום
// משותפים למס הכנסה, מע״מ וביטוח לאומי. מה שמשתנה בין רשויות הוא רק
// ה**מתאם** (adapter) שיודע להפוך תוצאת עובד גולמית לסט השוואה — ולמס
// הכנסה אלה שאילתות 154 (ו-134 כשיש מקדמות פעילות). מע״מ וב״ל יקבלו מתאם
// משלהם, לא UX משלהם.
//
// ‼ מציע ולא כותב: שום דבר כאן לא נוגע ב-clients. הסט הזה הוא מה שהרו"ח
// **רואה**; הכתיבה קורית רק דרך מסלול העובדות המנוהלות, אחרי לחיצה מפורשת.

import type { Client, NiIncomeEntry, NiIncomeList, NiInsuranceBasis, NiOccupation, PersonRole, TaxAuthority } from '../../types';
import { NI_FACT_KEYS } from '../../types';
import type { AutomationJob } from '../../types/automation';
import {
  SHAAM_SYNC_INCOME_TAX_ACTION_TYPE, BTL_SYNC_FILE_ACTION_TYPE, SHAAM_SYNC_VAT_ACTION_TYPE, SHAAM_SYNC_VAT_ACTION_NAME,
} from '../../types/automation';
import { FLOW_ACTION_NAMES } from '../flows/types';
import { SHAAM_READ_134, SHAAM_READ_VAT, BTL_READ_FILE } from '../../hooks/shaamReadiness';
import { EDIT_FIELD_BY_KEY, editFieldValue, cardDealerKind } from './editModel';
import { incomeTaxFileType } from '../../data/incomeTaxFileTypes';
import { niPersons, niEditable } from '../../utils/niPersons';
import { incomeTaxFileInput } from './incomeTaxFileInput';
import { authorityRepStatus } from '../../utils/personRepresentation';
import { REPORTING_NO_ADVANCES, reportingStatusOk } from '../../utils/reportingStatus';
import { BANKS } from '../../data/institutions';
import {
  niOccupationsFromBtl, niOccupationsKey, niOccupationsInline, niDate,
} from '../nationalInsurance/niOccupations';
import type { BtlOccupationChain } from '../nationalInsurance/niOccupations';
import { niBasisCard, niBasisPeriodText, niMonthsText } from '../nationalInsurance/niBasisDisplay';
import {
  niIncomeKind, niIncomeListEmpty, niIncomeListKey, niIncomeReadOf, niIncomeSourceText, niIncomeUnit,
} from '../nationalInsurance/niIncome';
import type { NiIncomeSection } from '../nationalInsurance/niIncome';
import { BTL_REPRESENTATION_KEY, BTL_ID_KEY } from '../nationalInsurance/btlFieldKeys';

/**
 * מי בדיוק, ברמת אדם — הנושא שהמשימה שואלת עליו (154). ‼ קיים כדי שרשות
 * ברמת-אדם (ב"ל) לא תוכל להריץ קריאה אחת "על הכרטיס" בלי לומר במפורש על
 * מי: `subjects` על ה-input הוא הרשימה, ו-`person` על כל
 * `AuthorityFieldResult` שחוזר ממנה חייב להתאים לאחד מהם.
 */
export interface AutomationSubject {
  role: PersonRole;
  /** ת.ז. — הזיהוי שנשלח בפועל לרשות. אדם בלי ת.ז. ידועה אינו subject. */
  idNumber: string;
  /** לתצוגה בלוגים/שגיאות בלבד — לעולם לא זהות. */
  label: string;
}

/**
 * מצב שדה אחרי בדיקה מול הרשות. ‼ ארבעה צבעים + מצב עסקי אחד:
 *   match       ירוק  — נבדק, והתיק תואם לרשות.
 *   changed     כתום  — נבדק, והרשות שונה מהתיק. יש הצעה.
 *   unsupported אפור  — לא נתמך באוטומציה / לא נבדק בריצה הזו.
 *   failed      אדום  — ניסינו לקרוא ולא הצלחנו, או שהתוצאה דו-משמעית.
 *   info        —     — הרשות החזירה **מצב עסקי** ולא ערך (למשל «לא נדרש
 *                      במקדמה», «בוטלה»). זו תוצאה מוצלחת, לא תקלה — ולכן
 *                      לא אדום; ולא ירוק, כי אין ערך שתואם. סמן ניטרלי.
 */
export type AuthorityFieldStatus = 'match' | 'changed' | 'unsupported' | 'failed' | 'info';

/** ‼ אחרי זה, כשל של משימה הוא היסטוריה ולא מצב. ראה buildAuthorityCheck. */
export const JOB_ERROR_MAX_AGE_MS = 10 * 60_000;

export interface AuthorityFieldResult {
  /** מפתח השדה בכרטיס הלקוח (למשל taxOfficeName). ריק לשדה שאינו עובדה מנוהלת. */
  fieldKey: string;
  label: string;
  status: AuthorityFieldStatus;
  /** הערך הגולמי בתיק היום — מה שמשווים מולו. */
  currentValue: string;
  /**
   * איך מציגים את הערך הנוכחי ביומן השינויים, כשהוא אינו סקלר (רשימת
   * עיסוקים, בסיס לתקופה). חסר ⇒ String(ערך).
   */
  currentDisplay?: string;
  /** מה הרשות החזירה, מילה במילה. */
  authorityRaw?: string;
  /** הערך שיישמר בתיק אם השינוי יאושר (מנורמל). קיים רק ב-changed. */
  authorityValue?: string;
  /** איך מציגים את ערך הרשות לרו"ח («0%», «אין»). ברירת מחדל: הגולמי. */
  authorityDisplay?: string;
  /**
   * הערך המדויק שייכתב בפאץ'. `undefined` ⇒ נגזר מ-authorityValue דרך
   * coerceEditField. ‼ קיים כי «אין תדירות» הוא **ניקוי** השדה (null),
   * ומחרוזת ריקה בעמודה מוגבלת-ערכים אינה אותו דבר.
   */
  patchValue?: unknown;
  /** תוספת פירוש לתצוגה (למשל תיאור קוד סוג התיק). */
  hint?: string;
  /** להציג את authorityDisplay גם כשהשדה תואם (ירוק) — למשל «מייצג ראשי». ברירת מחדל: ירוק בלי שורה. */
  showOnMatch?: boolean;
  /**
   * קבוצת שדות שחולקת הסבר עסקי אחד (למשל 'advances'). ההסבר מוצג פעם
   * אחת לקבוצה ולא מתחת לכל שדה — ראה groupNotes.
   */
  group?: string;
  /**
   * הראיה הגולמית מהרשות כשהערך נגזר ממצב עסקי ולא נקרא ישירות (למשל
   * «בוטלה (שעור דו) · ביטול שעור»). ‼ נשמרת בהצעה כ-note — כדי שהמקור
   * לא ייעלם אחרי שהערך נורמל ל-0%.
   */
  provenance?: string;
  /** מה השתבש — ב-failed בלבד. משפט אחד. */
  error?: string;
  /** למה השדה לא נבדק בריצה הזו — ב-unsupported, כשהסיבה ידועה (למשל פורטל המייצגים לא מחובר). */
  skippedReason?: string;
  /**
   * למי השדה שייך (154) — חובה לכל תוצאה שמגיעה מרשות ברמת-אדם (ב"ל).
   * ‼ חסר ⇒ הרשות ברמת תא משפחתי/כרטיס (מס הכנסה) ואין עמימות מלכתחילה.
   * כל מתאם עתידי לב"ל **חייב** למלא את זה מ-`AutomationSubject.role`
   * שממנו התוצאה הגיעה — לא לנחש מי נבדק. ראה `AutomationSubject`.
   */
  person?: PersonRole;
  /** שם להצגה בלבד (לוגים/שגיאות) — לא זהות. */
  personLabel?: string;
}

/** הסבר עסקי אחד לקבוצת שדות — מוצג פעם אחת, בטקסט משני קומפקטי. */
export interface AuthorityGroupNote {
  group: string;
  /** שם הקבוצה לרו"ח («מקדמות»). */
  label: string;
  text: string;
}

export interface AuthorityCheckSummary {
  checked: number;
  changed: number;
  unsupported: number;
  failed: number;
  /** שדות נתמכים שלא חזרו בריצה הזו (למשל האדם שלא נבחר בעדכון לאדם אחד). */
  notChecked?: number;
}

export interface AuthorityCheckResult {
  authority: TaxAuthority;
  /**
   * מזהה הריצה שהסט הזה נגזר ממנה. ‼ נדרש לאישור המקובץ: הוא נלכד בלחיצה,
   * ואם בינתיים הסתיימה ריצה חדשה — לא מאשרים תוצאות של ריצה שכבר אינה
   * זו שעל המסך.
   */
  runId?: string;
  /** מתי הקריאה הסתיימה. */
  checkedAt?: string;
  fields: AuthorityFieldResult[];
  summary: AuthorityCheckSummary;
  /** הסברים עסקיים ברמת קבוצה — פעם אחת כל אחד. */
  groupNotes: AuthorityGroupNote[];
  /**
   * כשל ברמת הריצה (לא ברמת שדה): המשימה נכשלה או ממתינה לאדם. מופיע
   * **פעם אחת** בכרטיס, לא ליד כל שדה.
   */
  runError?: string | null;
  /**
   * כשל ברמת אדם (154) — משימה אחת שכיסתה כמה נושאים, וחלקם נכשלו וחלקם
   * לא. ‼ שונה מ-`runError`: שם הריצה כולה נכשלה; כאן ריצה אחת הצליחה
   * חלקית. חסר/ריק ⇒ אין כשל פר-אדם לדיווח.
   */
  runErrorByPerson?: Partial<Record<PersonRole, string>>;
}

/**
 * מה נדרש כדי לחבר רשות למודל הזה. ‼ `available:false` הוא הצהרה מפורשת
 * "עוד לא נבנה" — הכרטיס מציג פקד מושבת עם הסיבה, במקום כפתור שמבטיח
 * מה שאין (ראה ההיסטוריה ב-BtlFieldSync שהוסר).
 */
/** מה שהכרטיס יודע מעבר ללקוח עצמו — למשל תחילת חלון העיסוקים (מההצעה). */
export interface AuthorityInputContext {
  /** 'YYYY-MM-DD' — עיסוקים בב"ל שנמשכים אל תוך התאריך הזה ואילך. */
  occupationsFrom?: string;
}

export interface AuthorityAutomationSpec {
  authority: TaxAuthority;
  /** הטקסט על הפקד בכותרת הכרטיס. */
  actionLabel: string;
  /** שם הרשות כפי שמופיע בתוצאות («שע״ם:» / «ב״ל:»). */
  sourceLabel: string;
  available: boolean;
  /** כש-available=false — למה. משפט אחד. */
  unavailableReason?: string;
  /** action_type של משימת העובד. */
  actionType?: string;
  /** מפתח היכולת ב-SHAAM_CAPABILITIES (מוכנות **לפעולה**, לא גלובלית). */
  capability?: string;
  /** מזהה המקור להצעות (source_ref ב-tax_fact_changes). */
  sourceRef?: string;
  /** השדות (מפתחות בכרטיס הלקוח) שיש להם מקור מוכח ברשות הזו. */
  supportedFieldKeys?: ReadonlySet<string>;
  /**
   * הקלט למשימה, נגזר מהכרטיס. blocked ⇒ אין מה להריץ (למשל אין מספר תיק).
   * ‼ `spouseClient` (154) — לרשות ברמת-אדם שצריכה לדעת על שני האנשים
   * כדי לבנות `subjects`. מס הכנסה/מע״מ מתעלמים ממנו, ולא צריכים לשנות
   * את החתימה שלהם כדי זה — פרמטר אופציונלי בסוף.
   */
  buildInput?: (client: Client, spouseClient?: Client, ctx?: AuthorityInputContext) => { input: Record<string, unknown> } | { blocked: string };
  /** הופך תוצאת משימה גולמית לסט השוואה. */
  interpret?: (job: AutomationJob | null, client: Client, supportedKeys: readonly string[]) => AuthorityFieldResult[];
  /** הסברים עסקיים ברמת קבוצה, מתוך תוצאת המשימה. */
  groupNotes?: (fields: Record<string, string>) => AuthorityGroupNote[];
  /** לרשות ברמת-אדם: מי מהאנשים לא נקרא, ולמה (ריצה שהצליחה חלקית). */
  personErrors?: (job: AutomationJob) => Partial<Record<PersonRole, string>>;
}

// ─── מס הכנסה — שאילתות 154 + 134 ──────────────────────────────────────────────
// ‼ מ-21.10.2026 העובד קורא קודם את 154 («מידע אודות שנות מס»): ראש התיק, סך
// יתרת החוב/הזכות, מצב המקדמות, חבות והגשה לכל שנה ודרישות הצהרת הון. 134
// נקראת רק כשיש מקדמות פעילות — לשיעור ולתדירות. ריצה ישנה (134 בלבד) עדיין
// מתפרשת כאן: אותם מפתחות ב-result.fields.

/**
 * תדירות מקדמות: הטקסט של שע״ם ⇄ הערך של PIVO.
 *
 * ‼ שע״ם כותבת «דו-חדשי» (בלי יו״ד), ו-PIVO שומרת 'bi_monthly'. ממפים
 * **רק** צורות חד-משמעיות; כל טקסט אחר מוחזר כלא-ממופה, מוצג כמו שהוא,
 * ובלי אפשרות אימוץ. עדיף לא להציע מאשר להציע ניחוש.
 * ‼ «חדשי» (חודשי) הוסר בכוונה: המיפוי המקורי הומצא כניחוש ומעולם לא
 * נצפה חי. עד שייצפה, טקסט כזה נכשל-בבטחה.
 */
function mapAdvanceFrequency(raw: string): string | null {
  const t = raw.replace(/\s+/g, '').replace(/["'׳״]/g, '');
  if (/^דו-?ח[ו]?דשי$/.test(t)) return 'bi_monthly';
  return null;
}

/** «15%» ⇒ «15». שומר את המספר כפי שהוא, בלי לעגל ובלי להמציא. */
function mapAdvanceRate(raw: string): string | null {
  const m = raw.replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?)%$/);
  return m ? m[1] : null;
}

/**
 * «יתרת חשבון המקדמות לשנה» ⇒ מספר. פסיקים הם מפרידי אלפים; הסימן נשמר
 * כפי שנקרא (חיובי=חוב, שלילי=זכות — אותה מוסכמה כמו balanceText). כל
 * צורה אחרת (למשל סוגריים) לא ממופה: לא נצפתה חי, ועדיף לא לנחש.
 */
function mapBalance(raw: string): string | null {
  const t = raw.replace(/\s+/g, '');
  const m = t.match(/^(-?)(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const n = sign * Number(m[2].replace(/,/g, '') + (m[3] ?? ''));
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * ‼ «לא נדרש במקדמה» וגם «בוטלה» אינם כישלון קריאה — שתי עובדות עסקיות
 * ששע״ם מדווחת במפורש (advanceStatus/advanceReason), ושתיהן **שונות**:
 *   · no_advance — אין כרגע חבות מקדמה כלל (למשל בגלל בסיס אפס).
 *   · cancelled  — היה שיעור מוקצה לתיק, והוא בוטל.
 * ‼ החלטת מוצר (2.9.2026): בשני המצבים המשמעות ב-PIVO היא «אין כרגע חבות
 * מקדמה», ולכן הייצוג בכרטיס הוא **שיעור 0% ותדירות «אין»** — לא הודעה
 * שחוזרת מתחת לשני השדות. הראיה הגולמית (הטקסט של שע״ם והסיבה) נשמרת
 * בתוצאת המשימה **וגם** בהצעה עצמה (note), כדי שהמקור לא ייעלם אחרי
 * הנרמול. ההסבר מוצג פעם אחת לקבוצת «מקדמות».
 */
function advanceBusinessState(
  fields: Record<string, string>,
): { note: string; raw: string } | null {
  const reason = (fields.advanceReason ?? '').trim();
  const rawStatus = (fields.advanceStatusRaw ?? '').trim();
  const withReason = (head: string) => (reason ? `${head} — ${reason}` : head);
  if (fields.advanceStatus === 'no_advance') {
    return { note: withReason('לא נדרש במקדמה'), raw: withReason(rawStatus || 'לא נדרש במקדמה') };
  }
  if (fields.advanceStatus === 'cancelled') {
    return { note: withReason('המקדמות בוטלו'), raw: withReason(rawStatus || 'בוטלה') };
  }
  return null;
}

/**
 * «דרישה עד 31/12/2026 · שנת 2025» ⇒ 'true' · «אין דרישה» / «הענות 22/07/2020 · שנת 2019» ⇒ 'false'.
 * ‼ «הענות» = ההצהרה **הוגשה** בתאריך הזה (נצפה ב-154, 25.10.2026) — אין דרישה פתוחה, והתאריך
 * אינו מועד. כל טקסט אחר לא ממופה — מוצג כלשונו, בלי הצעה.
 */
function mapWealthDemand(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^דרישה עד \d{2}\/\d{2}\/\d{4}/.test(t)) return 'true';
  if (t === 'אין דרישה' || wealthFiled(t)) return 'false';
  return null;
}

/** «הענות 22/07/2020 · שנת 2019» ⇒ { on: '22.07.2020', year: '2019' }. אחרת null. */
export function wealthFiled(raw: string): { on: string; year?: string } | null {
  const m = raw.replace(/\s+/g, ' ').trim().match(/^הענות (\d{2})\/(\d{2})\/(\d{4})(?: · שנת (\d{4}))?/);
  return m ? { on: `${m[1]}.${m[2]}.${m[3]}`, year: m[4] } : null;
}

/** מה רואים מתחת לשדה כשההצהרה האחרונה הוגשה: «הוגשה 22.07.2020 · לשנת 2019». */
function wealthFiledText(raw: string): string | null {
  const f = wealthFiled(raw);
  return f ? `הוגשה ${f.on}${f.year ? ` · לשנת ${f.year}` : ''}` : null;
}

/**
 * «קיימת · 12-170-48047» (רשימת מיוצגים) / «יש הרשאה - מאומתת» (181 «קיום הרשאה», נצפה
 * 25.10.2026) ⇒ 'true' · «אין הרשאה» (שניהם) ⇒ 'false'. כל טקסט אחר — לא ממופה.
 */
function mapDebitAuthorization(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/^קיימת/.test(t) || /^יש הרשאה/.test(t)) return 'true';
  if (t === 'אין הרשאה') return 'false';
  return null;
}

/** «קיימת · 12-170-48047» ⇒ «בנק הפועלים · סניף 170 · חשבון 48047» (שם הבנק מטבלת הבנקים לפי קוד). */
export function debitAccountText(raw: string): string | null {
  const m = raw.match(/(\d+)-(\d+)-(\d+)/);
  if (!m) return null;
  const bank = BANKS.find(b => b.id === `bank-${m[1].padStart(2, '0')}`)?.label ?? `בנק ${m[1]}`;
  return `${bank} · סניף ${m[2]} · חשבון ${m[3]}`;
}

/**
 * מה שדה מציג ומציע כשהרשות החזירה מצב עסקי במקום ערך.
 * `'info'` ⇒ אין ערך ואין הצעה, רק סמן ניטרלי (ההסבר בקבוצה).
 */
type BusinessValue = { value: string; display: string; patch?: unknown } | 'info' | null;

interface Shaam134FieldSource {
  /** המפתח שהעובד מחזיר ב-result.fields. */
  source: string;
  /** המרה לערך שנשמר ב-PIVO. null ⇒ לא ניתן למפות חד-משמעית. */
  normalize?: (raw: string) => string | null;
  /** הייצוג ב-PIVO כש-source ריק בגלל מצב עסקי. null ⇒ זה כישלון. */
  businessValue?: (fields: Record<string, string>) => BusinessValue;
  /** קבוצת ההסבר המשותף. */
  group?: string;
  /** תוספת פירוש לערך שהוחזר. */
  hint?: (value: string) => string | undefined;
  /** איך מציגים את ערך הרשות לרו"ח. ברירת מחדל: הגולמי. */
  display?: (value: string, raw: string) => string;
  /** להציג את ערך הרשות גם כשתואם (ירוק). */
  showOnMatch?: (value: string, raw: string) => boolean;
  /** המקור תקף רק כש… — אחרת הוא נחשב ריק (ואז businessValue מכריע). */
  applies?: (fields: Record<string, string>) => boolean;
}

/**
 * מפתח השדה בכרטיס ⇄ המקור בתוצאת העובד (154, ומקדמות פעילות מ-134). ‼ רק
 * שדות עם מיפוי מוכח חי. שדה שאינו כאן מוצג בכרטיס עם סמן «טרם נתמך», לא נעלם.
 */
export const SHAAM_134_FIELD_SOURCES: Record<string, Shaam134FieldSource> = {
  incomeTaxFileType: {
    source: 'fileType',
    hint: (v) => { const m = incomeTaxFileType(v); return m ? `${m.description} — ${m.explanation}` : undefined; },
  },
  taxOfficeName: { source: 'taxOffice' },
  incomeTaxUnit: { source: 'unit' },
  incomeTaxEconomicIndustry: { source: 'economicIndustry' },
  // ‼ מצב עסקי ⇒ 0% ו«אין». «אין תדירות» הוא **ניקוי** השדה: הטיפוס
  // (VATFrequency) מכיר רק חודשי/דו-חודשי, ואין בו ערך «אין» להמציא.
  pitAdvancePercent: {
    source: 'advanceRate', normalize: mapAdvanceRate, group: 'advances',
    businessValue: (f) => (advanceBusinessState(f) ? { value: '0', display: '0%' } : null),
  },
  pitAdvanceFrequency: {
    source: 'advanceFrequency', normalize: mapAdvanceFrequency, group: 'advances',
    businessValue: (f) => (advanceBusinessState(f) ? { value: '', display: 'אין', patch: null } : null),
  },
  // ‼ «יתרה» = סך יתרת החוב פחות סך יתרת הזכות של התיק (154). בריצה ישנה
  // (134 בלבד) זו הייתה יתרת חשבון המקדמות לשנה, ושם כשאין חבות מקדמה אין
  // קופסת יתרה כלל ⇒ סמן ניטרלי בלי הצעה — **לא** 0 מומצא, ולא אדום.
  incomeTaxBalance: {
    source: 'balance', normalize: mapBalance,
    businessValue: (f) => (advanceBusinessState(f) ? 'info' : null),
  },
  // ‼ «מצב דיווחים» — ראה interpretReportingStatus (התראה בלבד).
  incomeTaxReportingStatus: { source: 'reportingStatus' },
  // ‼ «רשימת מיוצגים» (23.10.2026) — רק כשמערכת הייצוג הייתה מחוברת בזמן הקריאה; אחרת «לא נבדק».
  // הבנק מוצג מתחת לשדה מהקריאה עצמה («שע״ם: בנק הפועלים · סניף 170 · חשבון 48047»).
  incomeTaxDebitAuthorization: {
    source: 'debitAuthorization', normalize: mapDebitAuthorization,
    display: (v, raw) => (v === 'true' ? debitAccountText(raw) ?? raw : raw),
    showOnMatch: (v) => v === 'true',
  },
  // ‼ הצהרת הון מ-154 בלבד. «אין דרישה» הוא תוצאה: אין דרישה פתוחה לפי שע״ם.
  // ריצה ישנה בלי המפתח ⇒ «לא נבדק» (ריק בלי מצב עסקי), לא כישלון.
  // «הענות» ⇒ אין דרישה פתוחה, ומתחת לשדה מתי הוגשה ההצהרה האחרונה — גם כשתואם.
  capitalDeclarationRequired: {
    source: 'wealthDemand', normalize: mapWealthDemand,
    display: (_v, raw) => { const filed = wealthFiledText(raw); return filed ? `אין דרישה פתוחה · ${filed}` : raw; },
    showOnMatch: (_v, raw) => !!wealthFiled(raw),
  },
  // ‼ «אין דרישה» ⇒ אין מועד: ירוק כשהשדה ריק, והצעה לנקות כשנרשם מועד (22.10.2026, גיא).
  // ‼ «הענות» — העובד מחזיר את תאריך ההגשה ב-wealthDemandDue; זה **לא** מועד, ולכן כמו «אין דרישה».
  // דרישה בטקסט לא מוכר בלי מועד — סמן ניטרלי.
  capitalDeclarationDeadline: {
    source: 'wealthDemandDue',
    applies: (f) => !wealthFiled(f.wealthDemand ?? ''),
    display: (v) => v.split('-').reverse().join('.'),
    businessValue: (f) => (f.wealthDemand === 'אין דרישה' || wealthFiled(f.wealthDemand ?? '')
      ? { value: '', display: 'אין דרישה פתוחה', patch: null } : f.wealthDemand ? 'info' : null),
  },
};

/**
 * מקורות שלא תמיד נקראים — ריצה בלעדיהם היא «לא נבדק», לא כשל: הון מ-154 (ריצה ישנה),
 * הרשאה לחיוב מ«רשימת מיוצגים» (רק כשמערכת הייצוג מחוברת).
 */
/**
 * למה «רשימת מיוצגים» לא נקראה — מתחת ל«הרשאה לחיוב», כדי ש«—» לא ייקרא «אין הרשאה».
 * ‼ הקריאה לא נכנסת לפורטל המייצגים בעצמה (גיא, 23.10.2026) — ולכן הצעד הוא לחבר ולקרוא שוב.
 */
export function representedListSkipText(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason === 'representation_not_connected' || reason === 'representation_login_required') {
    return 'לא נבדק — פורטל המייצגים לא היה מחובר';
  }
  return 'לא נבדק — רשימת המיוצגים לא נקראה';
}

const OPTIONAL_SOURCES: Record<string, (f: Record<string, string>) => boolean> = {
  wealthDemand: (f) => f.wealthDemand !== undefined,
  wealthDemandDue: (f) => f.wealthDemand !== undefined,
  debitAuthorization: (f) => f.debitAuthorization !== undefined,
};

/**
 * שדות בכרטיס שאינם עובדה מנוהלת, ושהקריאה מאשרת או מציגה — בלי הצעת שינוי לעולם (22.10.2026, גיא).
 *   · מספר תיק — העובד פתח את התיק לפי המספר הזה ווידא שהמסך הוא של אותו תיק ⇒ ירוק.
 *   · ייצוג — «מייצג ראשי» ב-154 הוא המשתמש המחובר ⇒ ירוק; מייצג אחר ⇒ שורת מידע עם השם.
 *   · ניכוי מס במקור — הטקסט של שע״ם («קיים אישור» / «אין אישור» / «ממתין לאישור יזום»). ירוק רק
 *     כשהוא תואם לכרטיס; «קיים אישור» לא אומר פטור או לפי שיעורים — ולכן לא מוצע שינוי.
 */
export const SHAAM_READ_ONLY_KEYS = ['incomeTaxFileNumber', 'incomeTaxRepresentation', 'withholdingStatus', 'bookStatus'] as const;
const digits9 = (v: unknown) => String(v ?? '').replace(/\D/g, '').padStart(9, '0');

function interpretShaamReadOnly(fieldKey: string, job: AutomationJob, client: Client): AuthorityFieldResult | null {
  const result = (job.result ?? {}) as { fields?: Record<string, string>; filing?: { header?: { withholdingApproval?: string | null } } };
  const fields = result.fields ?? {};
  if (fieldKey === 'incomeTaxFileNumber') {
    const card = incomeTaxFileInput(client);
    const asked = String((job.input as { fileNumber?: unknown })?.fileNumber ?? '');
    if (!('fileNumber' in card) || !asked) return null;
    return digits9(card.fileNumber) === digits9(asked)
      ? { fieldKey, label: 'מספר תיק', status: 'match', currentValue: card.fileNumber }
      : null;
  }
  if (fieldKey === 'incomeTaxRepresentation') {
    const rep = (fields.mainRepresentative ?? '').trim();
    const active = authorityRepStatus(client, 'income_tax') === 'active';
    // ‼ «רשימת מיוצגים» אומרת «ראשי» / «נוסף» במפורש — גוברת על ההסקה מ-154.
    const listed = (fields.repType ?? '').trim();
    if (listed === 'ראשי' || listed === 'נוסף') {
      const display = listed === 'ראשי' ? 'מייצג ראשי' : `מייצג נוסף${rep && fields.representedByMe === 'no' ? ` · ראשי: ${rep}` : ''}`;
      return { fieldKey, label: 'ייצוג', status: active ? 'match' : 'info', currentValue: '', authorityDisplay: display, showOnMatch: true };
    }
    if (!rep || !fields.representedByMe) return null;
    // ‼ 22.10.2026 (גיא): «ראשי» או «נוסף» כתוב בשורה. ב-154 יש רק «מייצג ראשי»; GMF פותחת רק תיק
    // שמייצגים — ולכן כשהראשי הוא מישהו אחר, אנחנו המייצג הנוסף.
    if (fields.representedByMe === 'yes') {
      return { fieldKey, label: 'ייצוג', status: active ? 'match' : 'info', currentValue: '', authorityDisplay: 'מייצג ראשי', showOnMatch: true };
    }
    return { fieldKey, label: 'ייצוג', status: 'info', currentValue: '', authorityDisplay: `מייצג נוסף · ראשי: ${rep}` };
  }
  // ‼ 26.10.2026 · אישור שנשמר בכרטיס **אחרי** הקריאה (הנפקה בלחיצה) — הוא המצב, לא הקריאה הישנה.
  // בלי זה נשארה מתחת לשורה «שע״ם: ממתין לאישור יזום» אחרי שהאישור כבר הונפק ונשמר.
  const newerCert = (key: 'withholdingStatus' | 'bookStatus') => {
    const cert = (client.fieldMeta?.[key] as { cert?: { status?: string; checkedAt?: string } } | undefined)?.cert;
    const jobAt = job.finishedAt ?? job.updatedAt;
    return cert?.status === 'valid' && !!cert.checkedAt && !!jobAt && new Date(cert.checkedAt) > new Date(jobAt);
  };
  if ((fieldKey === 'withholdingStatus' || fieldKey === 'bookStatus') && newerCert(fieldKey)) {
    return { fieldKey, label: fieldKey === 'bookStatus' ? 'ניהול ספרים' : 'ניכוי מס במקור', status: 'match',
      currentValue: String((client as unknown as Record<string, unknown>)[fieldKey] ?? '') };
  }
  if (fieldKey === 'withholdingStatus') {
    // ‼ 297 · כשנקרא 413 — זה המקור: השרת כבר כתב את האישור לכרטיס (record_authority_certificate).
    const w = (job.result as { certificates?: { withholding?: { ok?: boolean; status?: string; statusText?: string; ratesText?: string; validUntil?: string } } } | undefined)
      ?.certificates?.withholding;
    if (w?.ok) {
      const display = w.status === 'valid'
        ? [w.ratesText, w.validUntil ? `עד ${w.validUntil.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · ')
        : (w.statusText || 'אין אישור בתוקף');
      return { fieldKey, label: 'ניכוי מס במקור', status: 'match', currentValue: client.withholdingStatus ?? '', authorityDisplay: display };
    }
    const raw = (result.filing?.header?.withholdingApproval ?? '').trim();
    if (!raw) return null;
    const card = client.withholdingStatus;
    const same = (raw === 'קיים אישור' && (card === 'exempt' || card === 'rates')) || (raw === 'אין אישור' && card === 'none');
    return { fieldKey, label: 'ניכוי מס במקור', status: same ? 'match' : 'info', currentValue: card ?? '', authorityDisplay: raw };
  }
  // ‼ 297 · ניהול ספרים — רק מ-413 (אין לו מקור אחר בשע״ם). השרת כבר כתב את האישור לכרטיס
  // (record_authority_certificate), ולכן זו אישרור: תקין · עד … ⇒ ירוק; אין אישור ⇒ סמן מידע.
  if (fieldKey === 'bookStatus') {
    const b = (job.result as { certificates?: { bookkeeping?: { ok?: boolean; status?: string; statusText?: string; message?: string; validUntil?: string } } } | undefined)
      ?.certificates?.bookkeeping;
    if (!b?.ok) return null;
    if (b.status === 'valid') {
      return { fieldKey, label: 'ניהול ספרים', status: 'match', currentValue: client.bookStatus ?? '',
        authorityDisplay: ['תקין', b.validUntil ? `עד ${b.validUntil.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · ') };
    }
    return { fieldKey, label: 'ניהול ספרים', status: 'info', currentValue: client.bookStatus ?? '',
      authorityDisplay: b.message || b.statusText || 'אין אישור בתוקף' };
  }
  return null;
}

/** הערך הגולמי בתיק — לא הטקסט המוצג. «סוג תיק» מוצג «52 · חד-צדית…» ושע״ם מחזירה «52». */
function currentRaw(client: Client, fieldKey: string): string {
  const def = EDIT_FIELD_BY_KEY[fieldKey];
  return def ? editFieldValue(client, def) : String((client as unknown as Record<string, unknown>)[fieldKey] ?? '');
}

/**
 * «מצב דיווחים» כהתראה (24.10.2026, גיא: «אני מדווח מפייפרלס»). הצעה רק כששע״ם רואה דיווח
 * חסר, או כשחוסר שנרשם בתיק כבר הושלם (ניקוי). «הכול תקין» / «אין מקדמות» ⇒ תואם, בלי לכתוב.
 * מקדמות פעילות בלי נתון מ-134 ⇒ סמן ניטרלי.
 */
function interpretReportingStatus(
  fields: Record<string, string>, label: string, currentValue: string,
): AuthorityFieldResult {
  const fieldKey = 'incomeTaxReportingStatus';
  const read = advanceBusinessState(fields) ? REPORTING_NO_ADVANCES : (fields.reportingStatus ?? '').trim();
  if (!read) return { fieldKey, label, status: 'info', currentValue };
  const cur = currentValue.trim();
  const curMissing = !!cur && !reportingStatusOk(cur);
  if (reportingStatusOk(read)) {
    return curMissing
      ? { fieldKey, label, status: 'changed', currentValue, authorityValue: '', authorityDisplay: read, patchValue: null }
      : { fieldKey, label, status: 'match', currentValue };
  }
  return read === cur
    ? { fieldKey, label, status: 'match', currentValue }
    : { fieldKey, label, status: 'changed', currentValue, authorityValue: read, authorityDisplay: read };
}

function interpretShaam134(
  job: AutomationJob | null, client: Client, supportedKeys: readonly string[],
): AuthorityFieldResult[] {
  const fields = job?.status === 'succeeded'
    ? (job.result as { fields?: Record<string, string> } | undefined)?.fields
    : undefined;
  const unavailable = job?.status === 'succeeded'
    ? ((job.result as { unavailable?: { key: string; reason: string }[] } | undefined)?.unavailable ?? [])
    : [];

  return supportedKeys.map((fieldKey) => {
    if ((SHAAM_READ_ONLY_KEYS as readonly string[]).includes(fieldKey)) {
      return (job?.status === 'succeeded' && interpretShaamReadOnly(fieldKey, job, client))
        || { fieldKey, label: fieldKey, status: 'unsupported', currentValue: '' };
    }
    const spec = SHAAM_134_FIELD_SOURCES[fieldKey];
    const label = EDIT_FIELD_BY_KEY[fieldKey]?.label ?? fieldKey;
    const currentValue = currentRaw(client, fieldKey);
    if (!spec || !fields) return { fieldKey, label, status: 'unsupported', currentValue };
    if (fieldKey === 'incomeTaxReportingStatus') return interpretReportingStatus(fields, label, currentValue);

    const raw = spec.applies && !spec.applies(fields) ? '' : (fields[spec.source] ?? '').trim();
    if (raw === '' && OPTIONAL_SOURCES[spec.source] && !OPTIONAL_SOURCES[spec.source](fields)) {
      // ‼ מ-25.10.2026 «קיום הרשאה» ב-181 היא המקור כשהרשימה לא מחוברת — כשגם היא לא
      // נקראה, זו הסיבה שמוצגת (ולא «פורטל המייצגים לא היה מחובר»).
      const skippedReason = spec.source !== 'debitAuthorization' ? undefined
        : unavailable.some(u => u.key === 'debitAuthorization181') ? 'לא נבדק — מסך «קיום הרשאה» (181) לא נקרא'
        : representedListSkipText(unavailable.find(u => u.key === 'representedList')?.reason);
      return { fieldKey, label, status: 'unsupported', currentValue, ...(skippedReason ? { skippedReason } : {}) };
    }
    if (raw === '') {
      const business = spec.businessValue?.(fields) ?? null;
      if (business === 'info') {
        return { fieldKey, label, status: 'info', currentValue, group: spec.group };
      }
      if (business) {
        // ‼ מצב עסקי הוא תוצאה מוצלחת: הוא נכנס להשוואה הרגילה. תואם ⇒
        // ירוק (ולא «מידע»), שונה ⇒ כתום עם הצעה — כמו כל שדה אחר.
        const same = business.value === currentValue.trim();
        return {
          fieldKey, label, status: same ? 'match' : 'changed', currentValue,
          authorityValue: business.value, authorityDisplay: business.display,
          patchValue: 'patch' in business ? business.patch : undefined,
          provenance: spec.group === 'advances' ? advanceBusinessState(fields)?.raw : undefined, group: spec.group,
        };
      }
      const why = unavailable.find(u => u.key === spec.source)?.reason;
      return {
        fieldKey, label, status: 'failed', currentValue, group: spec.group,
        error: why === 'ambiguous' ? 'המסך החזיר יותר מערך אחד — לא ניתן להכריע.' : 'שע״ם לא החזירה ערך לשדה הזה.',
      };
    }
    const normalized = spec.normalize ? spec.normalize(raw) : raw;
    if (normalized === null) {
      return {
        fieldKey, label, status: 'failed', currentValue, authorityRaw: raw, group: spec.group,
        error: 'הערך לא ניתן למיפוי אוטומטי — יש להזין ידנית.',
      };
    }
    const hint = spec.hint?.(normalized);
    const base = {
      fieldKey, label, currentValue, authorityRaw: raw, authorityDisplay: spec.display?.(normalized, raw) ?? raw,
      authorityValue: normalized, hint, group: spec.group,
      ...(spec.showOnMatch?.(normalized, raw) ? { showOnMatch: true } : {}),
    };
    // ‼ ההשוואה היא בין הערכים המנורמלים, ולכן «0» של שע״ם מול «0» בתיק
    // הוא **תואם**, ואפס אינו מקרה מיוחד. שדה ריק בתיק («—») מול ערך
    // שנקרא הוא שינוי אמיתי — בדיוק כמו בכל שדה אחר.
    return { ...base, status: normalized === currentValue.trim() ? 'match' : 'changed' };
  });
}

// ─── ביטוח לאומי — תיק המבוטח (btl.sync_file) ─────────────────────────────────
// ‼ התוצאה היא **לכל אדם**, וכל מקטע בה עצמאי: { ok, value } או { ok:false }.
// מקטע שנכשל ⇒ השדה «לא נקרא» (אדום), ולעולם לא הצעה לרוקן אותו. מקטע
// שהצליח עם value:null ⇒ «המקור אומר שאין» — מוצג, אבל לא מוחק ערך קיים.

interface BtlSection<T> {
  ok: boolean;
  value?: T;
  reason?: string;
  warnings?: string[];
  source?: string;
  openSince?: string | null;
}

interface BtlAdvanceValue {
  year: number; fromMonth: number; toMonth: number; months: number;
  basisCategory: string | null; /** null ⇒ ב"ל רושם שאין בסיס לתקופה. */ periodBasis: number | null; advanceMonthly: number;
  /** כל הבסיסים בשורה, כשיש יותר מאחד («בסיסים עובד 30,570 , עצמאי 2»). */
  bases?: { category: string; amount: number }[];
}

/**
 * מקטע «רשימת הכנסות» כפי שהעובד מחזיר. ‼ מ-219: `records` — כל השורות
 * כלשונן. לפני 219: רק `value` — שורה אחת שנבחרה לפי שנה בלבד, עם
 * `monthlyAmount` שהיה בפועל «סכום הכנסה» בלי יחידה.
 */
type BtlIncomeSection = NiIncomeSection;

interface BtlPersonResult {
  role: PersonRole;
  label?: string | null;
  ok: boolean;
  error?: string;
  errorCode?: string;
  /** מתוצאות «חיפוש מיוצגים». status/pendingAction/debitAuthorization — טקסט כלשונו, רק כשיש. */
  representation?: {
    found: boolean; type?: string | null; receivedDate?: string | null;
    status?: string; pendingAction?: string; debitAuthorization?: string; benefitsAuthorization?: string;
  };
  sections?: {
    advance?: BtlSection<BtlAdvanceValue>;
    occupations?: BtlSection<BtlOccupationChain[]>;
    directIncome?: BtlIncomeSection;
    debitAuthorization?: BtlSection<boolean>;
    balance?: BtlSection<number>;
  };
}

export const BTL_FIELD_KEYS: readonly string[] = (['client', 'spouse'] as const).flatMap(r => [
  NI_FACT_KEYS[r].occupations, NI_FACT_KEYS[r].incomeBasisMonthly, NI_FACT_KEYS[r].advanceMonthly,
  NI_FACT_KEYS[r].balance, NI_FACT_KEYS[r].debitAuthorization, NI_FACT_KEYS[r].insuranceBasis,
  NI_FACT_KEYS[r].incomeList, BTL_REPRESENTATION_KEY[r], BTL_ID_KEY[r],
]);

/** «הצהרה · יוני 2025: 16,500 ₪ לחודש · שומה עצמי · ינואר–דצמבר 2025: 47,800 ₪ לשנה». */
export function niIncomeListText(l: NiIncomeList): string {
  const one = (e: NiIncomeEntry) => {
    const unit = niIncomeUnit(e);
    return `${niIncomeSourceText(e)}: ${ils(e.amount)}${unit === 'monthly' ? ' לחודש' : unit === 'annual' ? ' לשנה' : ''}`;
  };
  const parts = [l.declaration ? one(l.declaration) : null, l.assessment ? one(l.assessment) : null]
    .filter((x): x is string => !!x);
  if (l.ambiguous?.length) parts.push('שורות סותרות — לא נבחרו');
  return parts.join(' · ') || 'אין הצהרה או שומה תקפה של עצמאי';
}

function btlPersons(job: AutomationJob | null): BtlPersonResult[] {
  if (job?.status !== 'succeeded') return [];
  const persons = (job.result as { persons?: BtlPersonResult[] } | undefined)?.persons;
  return Array.isArray(persons) ? persons.filter(p => p && (p.role === 'client' || p.role === 'spouse')) : [];
}

function btlPersonErrors(job: AutomationJob): Partial<Record<PersonRole, string>> {
  const out: Partial<Record<PersonRole, string>> = {};
  for (const p of btlPersons(job)) if (!p.ok) out[p.role] = p.error ?? 'לא הצלחתי לקרוא את התיק בביטוח לאומי.';
  return out;
}

const ils = (n: number) => `${Math.abs(Math.round(n)).toLocaleString('he-IL')} ₪`;

const SECTION_FAILED: Record<string, string> = {
  advance: 'שורת דמי הביטוח לא נקראה מריכוז המידע.',
  occupations: 'רשימת העיסוקים לא נקראה במלואה — לא עודכן דבר.',
  directIncome: 'רשימת ההכנסות לא נקראה.',
  debitAuthorization: 'מסך הרשאות החיוב לא נקרא.',
  balance: 'מצב החשבון לא נקרא.',
};

function sameBasis(a: NiInsuranceBasis | undefined, b: NiInsuranceBasis): boolean {
  return !!a && a.year === b.year && a.fromMonth === b.fromMonth && a.toMonth === b.toMonth
    && a.periodBasis === b.periodBasis && (a.advanceMonthly ?? null) === (b.advanceMonthly ?? null)
    && JSON.stringify(a.otherBases ?? []) === JSON.stringify(b.otherBases ?? []);
}

function interpretBtlFile(
  job: AutomationJob | null, client: Client, supportedKeys: readonly string[],
): AuthorityFieldResult[] {
  const wanted = new Set(supportedKeys);
  const out: AuthorityFieldResult[] = [];
  const c = client as unknown as Record<string, unknown>;

  for (const p of btlPersons(job)) {
    const keys = NI_FACT_KEYS[p.role];
    const person = { person: p.role, personLabel: p.label ?? undefined };
    const repKey = BTL_REPRESENTATION_KEY[p.role];
    const push = (r: AuthorityFieldResult) => { if (wanted.has(r.fieldKey)) out.push(r); };

    if (!p.ok) {
      // ‼ כשל של אדם שלם: סמן אדום לכל שדה, אבל **ההסבר פעם אחת** — בבלוק
      // של האדם (runErrorByPerson), לא אותו משפט מתחת לשישה שדות.
      for (const k of [keys.occupations, keys.incomeBasisMonthly, keys.incomeList, keys.advanceMonthly, keys.balance, keys.debitAuthorization, keys.insuranceBasis]) {
        push({ fieldKey: k, label: k, status: 'failed', currentValue: String(c[k] ?? ''), ...person });
      }
      // ‼ «לא נמצא ברשימת המיוצגים» היא תשובה, לא תקלה — מוצגת ליד «ייצוג».
      push(p.errorCode === 'not_found'
        ? { fieldKey: repKey, label: 'ייצוג', status: 'info', currentValue: '', authorityDisplay: 'לא נמצא ברשימת המיוצגים', ...person }
        : { fieldKey: repKey, label: 'ייצוג', status: 'failed', currentValue: '', ...person });
      continue;
    }
    // ‼ נפתח ונקרא ⇒ הפורטל אישר שהתיק הוא של ת.ז. הזו (נבדק בכותרת לפני כל קריאה).
    push({ fieldKey: BTL_ID_KEY[p.role], label: 'ת.ז.', status: 'match', currentValue: '', ...person });
    const s = p.sections ?? {};
    const failed = (key: string, section: keyof typeof SECTION_FAILED): AuthorityFieldResult =>
      ({ fieldKey: key, label: key, status: 'failed', currentValue: String(c[key] ?? ''), error: SECTION_FAILED[section], ...person });

    // ── ייצוג ──
    // ‼ (273) נפתח מרשימת המיוצגים בלי «ממתין» ⇒ זו ההוכחה שהייצוג תקף, והשרת
    // מסמן אותו פעיל בעצמו — ירוק, בלי שורה. «ממתין…» ⇒ ראיה בלבד, כלשונה.
    const repPending = !!(p.representation?.status || p.representation?.pendingAction);
    push({
      fieldKey: repKey, label: 'ייצוג', status: repPending ? 'info' : 'match', currentValue: '',
      authorityDisplay: [
        'מופיע ברשימת המיוצגים',
        p.representation?.receivedDate ? `נקלט ${niDate(p.representation.receivedDate)}` : null,
        // ‼ כלשון הפורטל («ממתין לאישור», «ממתין תוקף») — לא מתורגם למצב ב-PIVO.
        p.representation?.status ? `סטטוס: ${p.representation.status}` : null,
        p.representation?.pendingAction ? p.representation.pendingAction : null,
      ].filter(Boolean).join(' · '),
      ...person,
    });

    // ── עיסוקים — רשומות עם תקופות, לא ספירה ──
    {
      const k = keys.occupations;
      const current = (c[k] as NiOccupation[] | undefined) ?? [];
      if (!s.occupations?.ok || !Array.isArray(s.occupations.value)) push(failed(k, 'occupations'));
      else {
        const next = niOccupationsFromBtl(s.occupations.value, current);
        const same = niOccupationsKey(current) === niOccupationsKey(next);
        const earlier = (s.occupations.warnings ?? []).some(w => w.startsWith('start_differs'));
        push({
          fieldKey: k, label: 'עיסוקים', status: same ? 'match' : 'changed',
          currentValue: niOccupationsKey(current),
          currentDisplay: current.length ? niOccupationsInline(current) : '—',
          authorityDisplay: next.length ? niOccupationsInline(next) : 'אין עיסוק בתוקף',
          authorityValue: niOccupationsKey(next),
          patchValue: next,
          hint: earlier ? 'בסיכום של ביטוח לאומי הרצף מתחיל מוקדם יותר — ייתכן שחסרה רשומה קודמת.' : undefined,
          provenance: next.some(o => o.btlDetail)
            ? 'עיסוקים והכנסות ← רשימת עיסוקים ← עיסוקים בתקופה ← פירוט עיסוק'
            : 'עיסוקים והכנסות ← רשימת עיסוקים ← עיסוקים בתקופה',
          ...person,
        });
      }
    }

    // ── רשימת ההכנסות — הצהרה ושומה, כלשונן (219) ──
    // ‼ «סכום הכנסה» אינו נושא יחידה: הצהרה = לחודש, שומה לינואר–דצמבר =
    // לשנה. רק הצהרה נכתבת ל«הכנסה מוצהרת»; השומה נשמרת כעובדה נפרדת.
    // ‼ רק קריאה **שלמה** רשאית לומר «אין», לסתור את השמור או להציע לנקות.
    // חלקית (עובד ישן) או חתוכה ⇒ מה שנמצא מוצג, מה שלא נמצא — לא ידוע.
    const income = niIncomeReadOf(s.directIncome);
    const truncated = income.ok && !income.partial && !income.complete;
    const TRUNCATED = 'רשימת ההכנסות לא נקראה במלואה — לא הוסקה ממנה מסקנה';
    const PARTIAL = 'לא ידוע — הקריאה הקודמת החזירה שורה אחת בלבד';
    {
      const k = keys.incomeList;
      const current = c[k] as NiIncomeList | undefined;
      const info = (authorityDisplay: string) =>
        push({ fieldKey: k, label: k, status: 'info', currentValue: niIncomeListKey(current), authorityDisplay, ...person });
      if (!income.ok) push(failed(k, 'directIncome'));
      else if (truncated) info(TRUNCATED);
      else if (niIncomeListEmpty(income.list)) {
        if (income.complete && current && !niIncomeListEmpty(current)) {
          // ‼ קריאה שלמה שלא מצאה דבר תקף — סותרת את מה שנשמר. מוצע לעדכן
          // (דרך האישור, עם הישן ביומן); עד אז האמון נשלל ב-niIncomeTrust.
          const empty: NiIncomeList = { declaration: null, assessment: null };
          push({
            fieldKey: k, label: k, status: 'changed',
            currentValue: niIncomeListKey(current), currentDisplay: niIncomeListText(current),
            authorityDisplay: niIncomeListText(empty), authorityValue: niIncomeListKey(empty), patchValue: empty,
            hint: 'מה שנשמר קודם לא נמצא כתקף בקריאה הזו.',
            provenance: 'עיסוקים והכנסות ← רשימת הכנסות · אין שורה תקפה של עצמאי',
            ...person,
          });
        } else if (income.partial) info(PARTIAL);
        // ‼ קריאה שלמה שאומרת «אין», והכרטיס ריק — זה נבדק ותואם: ירוק.
        else push({ fieldKey: k, label: k, status: 'match', currentValue: niIncomeListKey(current), authorityDisplay: 'אין הצהרה או שומה תקפה של עצמאי ברשימת ההכנסות', ...person });
      } else {
        const next = income.list;
        push({
          fieldKey: k, label: k, status: niIncomeListKey(current) === niIncomeListKey(next) ? 'match' : 'changed',
          currentValue: niIncomeListKey(current),
          currentDisplay: current && !niIncomeListEmpty(current) ? niIncomeListText(current) : '—',
          authorityDisplay: niIncomeListText(next),
          authorityValue: niIncomeListKey(next),
          patchValue: next,
          hint: income.partial ? 'מקריאה ישנה שהחזירה שורה אחת בלבד — קריאה חוזרת תשלים את הרשימה.' : undefined,
          provenance: 'עיסוקים והכנסות ← רשימת הכנסות',
          ...person,
        });
      }
    }

    // ── הכנסה מוצהרת — **רק** מהצהרה ──
    {
      const k = keys.incomeBasisMonthly;
      const current = c[k] as number | undefined;
      const info = (authorityDisplay: string) =>
        push({ fieldKey: k, label: k, status: 'info', currentValue: String(current ?? ''), authorityDisplay, ...person });
      const d = income.ok && !truncated ? income.list.declaration : null;
      if (!income.ok) push(failed(k, 'directIncome'));
      else if (truncated) info(TRUNCATED);
      else if (d) {
        const prov = `רשימת הכנסות · ${niIncomeSourceText(d)}${d.incomeSource ? ` · ${d.incomeSource}` : ''}${d.receivedDate ? ` · התקבל ${niDate(d.receivedDate)}` : ''}`;
        push({
          fieldKey: k, label: k, status: current != null && Number(current) === d.amount ? 'match' : 'changed',
          currentValue: String(current ?? ''),
          authorityDisplay: `${ils(d.amount)} לחודש · ${niIncomeSourceText(d)}`, authorityValue: String(d.amount),
          patchValue: d.amount, hint: prov, provenance: prov, ...person,
        });
      } else if (!income.complete) info(PARTIAL);
      else if (income.list.ambiguous?.includes('declaration')) info('שתי הצהרות סותרות לאותה תקופה — לא נבחרה אף אחת');
      else {
        // ‼ קריאה שלמה, ואין הצהרה תקפה. ערך שנכתב בעבר מקריאה אוטומטית —
        // שומה שנקראה «לחודש», או הצהרה שכבר אינה תקפה — מוצע לנקות, דרך
        // האישור הרגיל וביומן. ערך שהוזן ביד — לא נוגעים.
        const meta = client.fieldMeta?.[k];
        if (current != null && meta?.source === 'automation') {
          const misread = income.raw.find(r => niIncomeKind(r) !== 'declaration' && r.amount === Number(current));
          const stored = (c[keys.incomeList] as NiIncomeList | undefined)?.declaration;
          const why = misread
            ? `«${niIncomeSourceText(misread)}» — ${niIncomeUnit(misread) === 'annual' ? 'הכנסה שנתית' : 'סכום שאינו הצהרה חודשית'} שנקראה בעבר כהכנסה חודשית. השומה נשמרת בנפרד.`
            : stored && stored.amount === Number(current)
              ? `ההצהרה (${niIncomeSourceText(stored)}) כבר לא מופיעה כתקפה ברשימת ההכנסות.`
              : 'נקרא בעבר מקריאה אוטומטית, ואין היום הצהרה תקפה שתומכת בו.';
          push({
            fieldKey: k, label: k, status: 'changed',
            currentValue: String(current), currentDisplay: `${ils(Number(current))} לחודש`,
            authorityDisplay: 'אין הצהרה חודשית — השדה יתרוקן', authorityValue: '', patchValue: null,
            hint: `${ils(Number(current))} שבכרטיס: ${why}`,
            provenance: `רשימת הכנסות · אין הצהרה תקפה${misread ? ` · ${niIncomeSourceText(misread)}` : ''}`,
            ...person,
          });
        } else if (current == null) {
          push({ fieldKey: k, label: k, status: 'match', currentValue: '', authorityDisplay: 'אין הצהרה חודשית ברשימת ההכנסות', ...person });
        } else info('אין הצהרה חודשית ברשימת ההכנסות');
      }
    }

    // ── מקדמה חודשית ובסיס לתקופה — ריכוז מידע ──
    {
      const kAdv = keys.advanceMonthly;
      const kBasis = keys.insuranceBasis;
      const a = s.advance?.ok ? s.advance.value : undefined;
      if (!a) { push(failed(kAdv, 'advance')); push(failed(kBasis, 'advance')); }
      else {
        const curAdv = c[kAdv] as number | undefined;
        push({
          fieldKey: kAdv, label: kAdv, status: curAdv != null && Number(curAdv) === a.advanceMonthly ? 'match' : 'changed',
          currentValue: String(curAdv ?? ''), authorityDisplay: ils(a.advanceMonthly), authorityValue: String(a.advanceMonthly),
          patchValue: a.advanceMonthly, provenance: `ריכוז מידע · דמי ביטוח ${niMonthsText(a.fromMonth, a.toMonth, a.year)}`, ...person,
        });

        // ‼ «2026 / 12-10 ד"ב : 0» — ב"ל רושם שאין בסיס לתקופה (שכיר בלי
        // מקדמות). תשובה, לא כשל: ריק בכרטיס ⇒ תואם; בסיס ישן ⇒ מוצע לנקות.
        if (a.periodBasis == null) {
          const curBasis = c[kBasis] as NiInsuranceBasis | undefined;
          const prov = `ריכוז מידע · אין בסיס · ${niMonthsText(a.fromMonth, a.toMonth, a.year)}`;
          push(curBasis
            ? { fieldKey: kBasis, label: kBasis, status: 'changed', currentValue: `${curBasis.periodBasis}|${niBasisPeriodText(curBasis)}`,
                currentDisplay: `${ils(curBasis.periodBasis)} · ${niBasisPeriodText(curBasis)}`,
                authorityDisplay: `אין בסיס ל${niMonthsText(a.fromMonth, a.toMonth, a.year)}`, authorityValue: '', patchValue: null,
                provenance: prov, ...person }
            : { fieldKey: kBasis, label: kBasis, status: 'match', currentValue: '', authorityDisplay: 'אין בסיס', provenance: prov, ...person });
        } else {
        const basis: NiInsuranceBasis = {
          year: a.year, fromMonth: a.fromMonth, toMonth: a.toMonth, months: a.months,
          periodBasis: a.periodBasis, advanceMonthly: a.advanceMonthly,
          ...(a.basisCategory ? { category: a.basisCategory } : {}),
          // ‼ 21.10.2026 · שאר הבסיסים באותה שורה (שכיר + עצמאי) — לתצוגה.
          ...(a.bases && a.bases.length > 1 ? { otherBases: a.bases.filter(x => x.category !== a.basisCategory) } : {}),
          // ‼ (219) בלי sourceIncomeYear: ב"ל אינו מציג על איזו הכנסה נשען
          // הבסיס, ו«השנה של ההכנסה שנבחרה» אינה קשר מבוסס.
        };
        const curBasis = c[kBasis] as NiInsuranceBasis | undefined;
        const view = niBasisCard(basis, income.ok && !truncated ? income.list.declaration : null);
        push({
          fieldKey: kBasis, label: kBasis, status: sameBasis(curBasis, basis) ? 'match' : 'changed',
          currentValue: curBasis ? `${curBasis.periodBasis}|${niBasisPeriodText(curBasis)}` : '',
          currentDisplay: curBasis ? `${ils(curBasis.periodBasis)} · ${niBasisPeriodText(curBasis)}` : '—',
          authorityDisplay: view.v,
          authorityValue: `${basis.periodBasis}|${niBasisPeriodText(basis)}`,
          patchValue: basis,
          hint: view.sub.join(' · ') || undefined,
          provenance: `ריכוז מידע · בסיס ${a.basisCategory ?? ''} ${a.periodBasis} · ${niMonthsText(a.fromMonth, a.toMonth, a.year)}`.replace(/\s+/g, ' '),
          ...person,
        });
        }
      }
    }

    // ── הרשאה לחיוב ──
    {
      const k = keys.debitAuthorization;
      const cur = c[k] as boolean | undefined;
      const d = s.debitAuthorization;
      if (!d?.ok || typeof d.value !== 'boolean') push(failed(k, 'debitAuthorization'));
      else {
        push({
          fieldKey: k, label: k, status: cur === d.value ? 'match' : 'changed',
          currentValue: cur == null ? '' : String(cur),
          authorityDisplay: d.value ? 'קיימת' : 'אין הרשאה', authorityValue: String(d.value), patchValue: d.value,
          hint: d.value && d.openSince ? `פתוחה מ-${niDate(d.openSince)}` : undefined,
          provenance: d.source === 'header' ? 'כותרת המבוטח' : 'הוראות כספיות ← הרשאות לחיוב',
          ...person,
        });
      }
    }

    // ── יתרה ── ‼ אותה מוסכמה כמו בכרטיס: חיובי=חוב, שלילי=זכות.
    {
      const k = keys.balance;
      const cur = c[k] as number | undefined;
      const b = s.balance;
      if (!b?.ok || typeof b.value !== 'number') push(failed(k, 'balance'));
      else {
        const n = b.value;
        push({
          fieldKey: k, label: k, status: cur != null && Number(cur) === n ? 'match' : 'changed',
          currentValue: String(cur ?? ''),
          authorityDisplay: n === 0 ? 'אין יתרה' : n > 0 ? `חוב ${ils(n)}` : `יתרת זכות ${ils(n)}`,
          authorityValue: String(n), patchValue: n,
          provenance: b.source === 'header' ? 'כותרת המבוטח' : 'מצב חשבון ← לפי ימי ערך ריאלי',
          ...person,
        });
      }
    }
  }
  return out;
}

// ─── מע״מ — «פרטי עוסק» במערכת הגבייה ─────────────────────────────────────

/** ערך מנורמל לשדה מע״מ. null ⇒ הטקסט לא ממופה — מוצג כלשונו, בלי הצעה. */
type VatValue = { value: string; display: string; patch?: unknown } | null;

/**
 * מפתח השדה בכרטיס ⇄ מה שהעובד החזיר. ‼ כל צורה כאן נצפתה חי (25.10.2026,
 * חמישה עוסקים); טקסט אחר לא ממופה, ועדיף לא להציע מאשר לנחש.
 */
export const VAT_FIELD_SOURCES: Record<string, { sources: string[]; map: (f: Record<string, string>) => VatValue }> = {
  // «52 - עוסק מורשה,נמנה על» / «48 - עוסק מורשה». הערך הנשמר הוא התווית
  // שבאפשרויות של השדה (editModel), ולכן ממפים לפי המילים ולא לפי הקוד.
  vatFileType: {
    sources: ['fileType'],
    map: (f) => {
      const t = f.fileType.replace(/\s+/g, ' ');
      const value = /עוסק מורשה/.test(t) ? 'עוסק מורשה' : /עוסק פטור/.test(t) ? 'עוסק פטור' : null;
      return value ? { value, display: t } : null;
    },
  },
  // «12/05/2026» ⇒ 2026-05-12.
  vatOpeningDate: {
    sources: ['openingDate'],
    map: (f) => {
      const m = f.openingDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? { value: `${m[3]}-${m[2]}-${m[1]}`, display: f.openingDate.trim() } : null;
    },
  },
  // «6921 - ראיית חשבון» — נשמר כמו ששע״ם מציגה (שדה טקסט חופשי).
  vatPrimaryIndustry: {
    sources: ['primaryIndustry'],
    map: (f) => ({ value: f.primaryIndustry.trim(), display: f.primaryIndustry.trim() }),
  },
  // «דו חודשי» / «לא חייב» נצפו. ‼ «לא חייב» הוא ניקוי השדה (null): לטיפוס
  // יש רק חודשי/דו-חודשי, ואין בו ערך «אין» להמציא.
  vatFrequency: {
    sources: ['reportingFrequency'],
    map: (f) => {
      const t = f.reportingFrequency.replace(/[\s-]+/g, ' ').trim();
      if (t === 'דו חודשי') return { value: 'bi_monthly', display: 'דו-חודשי' };
      if (t === 'חודשי') return { value: 'monthly', display: 'חודשי' };
      if (t === 'לא חייב') return { value: '', display: 'לא חייב בדיווח תקופתי', patch: null };
      return null;
    },
  },
  // «08/2026» — התקופה האחרונה שהוגש עליה דוח, כמו ששע״ם מציגה.
  vatLastReportPeriod: {
    sources: ['lastReport'],
    map: (f) => (/^\d{2}\/\d{4}$/.test(f.lastReport.trim())
      ? { value: f.lastReport.trim(), display: f.lastReport.trim() } : null),
  },
  // ‼ «סך יתרות חוב» פחות «סך יתרות זכות» — בלי לנחש את הסימן של «סך יתרה»
  // (בכל מה שנצפה כולם היו 0). חיובי=חוב, כמו balanceText. «סך יתרה» משמש
  // רק לאימות: ערך מוחלט שונה ⇒ לא מציעים.
  vatBalance: {
    sources: ['balanceDebit', 'balanceCredit'],
    map: (f) => {
      const debit = mapBalance(f.balanceDebit);
      const credit = mapBalance(f.balanceCredit);
      if (debit === null || credit === null) return null;
      const n = Math.abs(Number(debit)) - Math.abs(Number(credit));
      const total = f.balanceTotal ? mapBalance(f.balanceTotal) : null;
      if (total !== null && Math.abs(Number(total)) !== Math.abs(n)) return null;
      const display = n === 0 ? '0' : `${Math.abs(n).toLocaleString('he-IL')} ₪ ${n > 0 ? 'חוב' : 'זכות'}`;
      return { value: String(n), display };
    },
  },
  // «קיימת הרשאה פעילה-מאומתת» / «לא קיימת הרשאה פעילה» (לשונית «מידע נוסף»).
  vatDebitAuthorization: {
    sources: ['debitAuthorization'],
    map: (f) => {
      const t = f.debitAuthorization.replace(/\s+/g, ' ').trim();
      if (/^לא קיימת הרשאה/.test(t)) return { value: 'false', display: 'אין הרשאה' };
      if (/^קיימת הרשאה פעילה/.test(t)) return { value: 'true', display: t };
      return null;
    },
  },
};

/**
 * מספר העוסק: מה שרשום בתיק המע״מ של הכרטיס. ‼ בלעדיו — ת.ז., ורק לעוסק
 * יחיד (מורשה/פטור): אצלו מספר העוסק הוא מספר הזהות. לחברה אין ניחוש.
 */
/**
 * 297 · למי מנפיקים/קוראים אישור שנתי ב-413: מספר העוסק (לעוסק יחיד — הת.ז. שלו/ה).
 * ‼ בלי עסק בכרטיס אין אישורים: שכיר לא צריך אישור ניכוי במקור או ניהול ספרים.
 */
export function certificateEntityInput(client: Client): { certEntity: string } | { blocked: string } {
  const r = vatOsekInput(client);
  return 'osekNumber' in r
    ? { certEntity: r.osekNumber }
    : { blocked: 'אין עסק בכרטיס (מספר עוסק) — אין למי להנפיק אישור ניכוי במקור או ניהול ספרים.' };
}

export function vatOsekInput(client: Client): { osekNumber: string } | { blocked: string } {
  const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');
  const files = (client.taxFiles ?? []).filter(t => t.authority === 'vat');
  const explicit = digits((files.find(t => t.owner === 'client') ?? files[0])?.fileNumber);
  if (explicit) return { osekNumber: explicit };
  const kind = cardDealerKind(client);
  if ((kind === 'licensed' || kind === 'exempt') && digits(client.idNumber)) return { osekNumber: digits(client.idNumber) };
  return { blocked: 'אין מספר עוסק בכרטיס — ממלאים אותו בשורת «מספר עוסק» ואז קוראים משע״ם.' };
}

/**
 * שדות לקריאה בלבד, כמו במס הכנסה (SHAAM_READ_ONLY_KEYS):
 *   · מספר עוסק — העובד פותח רק את המספר שנשלח ומוודא אותו בכותרת ⇒ תואם לכרטיס = ירוק.
 *   · ייצוג — «מייצג ראשי» הוא המשתמש המחובר ⇒ ירוק; מייצג אחר ⇒ שורת מידע «מייצג נוסף».
 */
export const VAT_READ_ONLY_KEYS = ['vatFileNumber', 'vatRepresentation'] as const;

function interpretVatReadOnly(fieldKey: string, job: AutomationJob, client: Client): AuthorityFieldResult | null {
  const fields = ((job.result ?? {}) as { fields?: Record<string, string> }).fields ?? {};
  if (fieldKey === 'vatFileNumber') {
    const card = vatOsekInput(client);
    const asked = String((job.input as { osekNumber?: unknown })?.osekNumber ?? '');
    if (!('osekNumber' in card) || !asked) return null;
    return digits9(card.osekNumber) === digits9(asked)
      ? { fieldKey, label: 'מספר עוסק', status: 'match', currentValue: card.osekNumber }
      : null;
  }
  if (fieldKey === 'vatRepresentation') {
    const rep = (fields.mainRepresentative ?? '').trim();
    if (!rep || !fields.representedByMe) return null;
    const active = authorityRepStatus(client, 'vat') === 'active';
    // ‼ מערכת מע״מ פותחת רק תיק שמייצגים — ולכן כשהראשי הוא מישהו אחר, אנחנו המייצג הנוסף.
    return fields.representedByMe === 'yes'
      ? { fieldKey, label: 'ייצוג', status: active ? 'match' : 'info', currentValue: '', authorityDisplay: 'מייצג ראשי', showOnMatch: true }
      : { fieldKey, label: 'ייצוג', status: 'info', currentValue: '', authorityDisplay: `מייצג נוסף · ראשי: ${rep}` };
  }
  return null;
}

function interpretShaamVat(
  job: AutomationJob | null, client: Client, supportedKeys: readonly string[],
): AuthorityFieldResult[] {
  const fields = job?.status === 'succeeded'
    ? (job.result as { fields?: Record<string, string> } | undefined)?.fields
    : undefined;
  return supportedKeys.map((fieldKey) => {
    if ((VAT_READ_ONLY_KEYS as readonly string[]).includes(fieldKey)) {
      return (job?.status === 'succeeded' && interpretVatReadOnly(fieldKey, job, client))
        || { fieldKey, label: fieldKey, status: 'unsupported', currentValue: '' };
    }
    const spec = VAT_FIELD_SOURCES[fieldKey];
    const label = EDIT_FIELD_BY_KEY[fieldKey]?.label ?? fieldKey;
    const currentValue = currentRaw(client, fieldKey);
    if (!spec || !fields) return { fieldKey, label, status: 'unsupported', currentValue };
    if (spec.sources.some(s => !(fields[s] ?? '').trim())) {
      return { fieldKey, label, status: 'failed', currentValue, error: 'שע״ם לא החזירה ערך לשדה הזה.' };
    }
    const authorityRaw = spec.sources.map(s => fields[s].trim()).join(' · ');
    const mapped = spec.map(fields);
    if (!mapped) {
      return { fieldKey, label, status: 'failed', currentValue, authorityRaw, error: 'הערך לא ניתן למיפוי אוטומטי — יש להזין ידנית.' };
    }
    const same = mapped.value === currentValue.trim()
      // ‼ «0» מול 0 בתיק, או 1,200 מול 1200 — אותו מספר.
      || (fieldKey === 'vatBalance' && currentValue.trim() !== '' && Number(currentValue) === Number(mapped.value));
    return {
      fieldKey, label, status: same ? 'match' : 'changed', currentValue, authorityRaw,
      authorityValue: mapped.value, authorityDisplay: mapped.display,
      patchValue: 'patch' in mapped ? mapped.patch : undefined,
    };
  });
}

/**
 * ‼ הרשומה לכל רשות — מקום אחד. רשות שאינה כאן אינה מקבלת פקד בכותרת
 * (אין מה להריץ ואין מה להבטיח). ב״ל רשומה עם available:false בכוונה:
 * הפקד קיים, מושבת, ואומר בפירוש «עוד לא נבנה».
 */
export const AUTHORITY_AUTOMATION: Partial<Record<TaxAuthority, AuthorityAutomationSpec>> = {
  income_tax: {
    authority: 'income_tax',
    // ‼ «קריאת תיק» ולא «בדוק»: זו קריאת נתוני התיק (154/134), לא בדיקת ייצוג.
    // בדיקת קבלת הייצוג היא פעולה אחרת, על כרטיס הייצוג/האדם (NiNextActionButton).
    // ‼ אותו שם כמו במסלולים, ברצועה בכרטיס ובעמוד האוטומציות (FLOW_ACTION_NAMES).
    actionLabel: FLOW_ACTION_NAMES[SHAAM_SYNC_INCOME_TAX_ACTION_TYPE],
    sourceLabel: 'שע״ם',
    available: true,
    actionType: SHAAM_SYNC_INCOME_TAX_ACTION_TYPE,
    capability: SHAAM_READ_134,
    // ‼ מערכת גביית מס הכנסה (154/134) — לא שאילתה אחת. הצעות ישנות נשארו עם 'shaam-134'.
    sourceRef: 'shaam-gmf',
    supportedFieldKeys: new Set([...Object.keys(SHAAM_134_FIELD_SOURCES), ...SHAAM_READ_ONLY_KEYS]),
    buildInput: (client) => {
      const res = incomeTaxFileInput(client);
      // ‼ 297 · 413 (אישורי ניכוי וניהול ספרים) לפי ת.ז. של בעל העסק — העוסק במע״מ, לא מספר
      // התיק במס הכנסה (בתיק משותף שרשום על בן/בת הזוג הם שונים). בלי עסק — לא קוראים 413.
      // ‼ 26.10.2026 (גיא: «למה זה לא פשוט מנפיק אישור?»): מהכפתור הזה — מה שחסר מונפק באותה ריצה
      // (issueMissing), בשיעור הנמוך ביותר שמותר. קריאה ממסלול נבנית בשרת ולא מקבלת את הדגל.
      const cert = certificateEntityInput(client);
      return 'fileNumber' in res
        ? { input: { fileNumber: res.fileNumber, ...('certEntity' in cert ? { certEntity: cert.certEntity, issueMissing: true } : {}) } }
        : res;
    },
    interpret: interpretShaam134,
    groupNotes: (fields) => {
      const state = advanceBusinessState(fields);
      return state ? [{ group: 'advances', label: 'מקדמות', text: state.note }] : [];
    },
  },
  // ─── מע״מ ──────────────────────────────────────────────────────────────────
  // ‼ shaam.sync_vat_file (worker/src/handlers/shaamSyncVatFile.mjs) קורא את
  // «פרטי עוסק» במערכת הגבייה של מע״מ — שלוש לשוניות, נצפו חי 25.10.2026.
  vat: {
    authority: 'vat',
    actionLabel: SHAAM_SYNC_VAT_ACTION_NAME,
    sourceLabel: 'שע״ם',
    available: true,
    actionType: SHAAM_SYNC_VAT_ACTION_TYPE,
    capability: SHAAM_READ_VAT,
    sourceRef: 'shaam-vat',
    supportedFieldKeys: new Set([...Object.keys(VAT_FIELD_SOURCES), ...VAT_READ_ONLY_KEYS]),
    buildInput: (client) => {
      const res = vatOsekInput(client);
      return 'osekNumber' in res ? { input: { osekNumber: res.osekNumber } } : res;
    },
    interpret: interpretShaamVat,
  },

  // ─── ביטוח לאומי ───────────────────────────────────────────────────────────
  // ‼ btl.sync_file (worker/src/handlers/btlSyncFile.mjs) קורא את תיק המבוטח
  // בפורטל המייצגים — לכל אדם בנפרד — והמתאם כאן הופך את התוצאה לסט
  // השוואה. ‼ ה-capability מצביעה על שכבת `btl` בלבד: מוכנות ב״ל אינה
  // נגזרת ממוכנות שע״ם, ולהפך.
  national_insurance: {
    authority: 'national_insurance',
    actionLabel: FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE],
    sourceLabel: 'ב״ל',
    available: true,
    actionType: BTL_SYNC_FILE_ACTION_TYPE,
    capability: BTL_READ_FILE,
    sourceRef: 'btl-file',
    supportedFieldKeys: new Set(BTL_FIELD_KEYS),
    /**
     * ‼ הנושאים הם אנשי הכרטיס (`niPersons`) שיש להם ת.ז. **ושהנתונים שלהם
     * יושבים בכרטיס הזה**. בן/בת זוג עם כרטיס משלו/ה מתעדכן/ת משם — כך אף
     * אישור כאן לא כותב לכרטיס אחר.
     */
    buildInput: (client, spouseClient, ctx) => {
      const subjects: AutomationSubject[] = niPersons(client, spouseClient)
        .filter(p => !!p.idNumber && niEditable(p))
        .map(p => ({ role: p.role, idNumber: p.idNumber, label: p.name }));
      return subjects.length > 0
        ? { input: { subjects, ...(ctx?.occupationsFrom ? { occupationsFrom: ctx.occupationsFrom } : {}) } }
        : { blocked: 'אין ת.ז. ידועה לאף אחד מהאנשים בכרטיס — אין את מי לבדוק מול ביטוח לאומי.' };
    },
    interpret: interpretBtlFile,
    personErrors: btlPersonErrors,
  },
};

/**
 * מרכיב את סט ההשוואה של כרטיס אחד: כל שדה בכרטיס, עם המצב שלו.
 * ‼ `supportedKeys` הם השדות עם מקור מוכח (syncKey ב-authorityRows); כל
 * שדה אחר בכרטיס מקבל «טרם נתמך» — נשאר גלוי, לא נעלם.
 */
export function buildAuthorityCheck(
  spec: AuthorityAutomationSpec,
  job: AutomationJob | null,
  client: Client,
  cardFields: { label: string; fieldKey?: string }[],
): AuthorityCheckResult | null {
  if (!spec.available || !spec.interpret) return null;
  if (!job) return null;
  // ‼ התיישנות דטרמיניסטית לכשל: משימה שנכשלה אתמול היא היסטוריה, לא מצב.
  // בלעדיה שגיאה אדומה הייתה נשארת בכרטיס לנצח, כי המשימה נשלפת לפי
  // (לקוח, פעולה) בלי הגבלת גיל. תוצאה שהצליחה נשארת — היא עדיין ההשוואה
  // האחרונה שידועה, ומוצגת עם השעה שלה.
  if (job.status === 'failed' || job.status === 'needs_human' || job.status === 'cancelled') {
    const stamp = new Date(job.finishedAt ?? job.updatedAt ?? job.createdAt).getTime();
    if (Date.now() - stamp > JOB_ERROR_MAX_AGE_MS) return null;
  }
  if (job.status === 'cancelled') return null;

  const supported = spec.supportedFieldKeys ?? new Set<string>();
  const supportedKeys = cardFields.map(f => f.fieldKey).filter((k): k is string => !!k && supported.has(k));
  const succeeded = job.status === 'succeeded';
  const interpreted = succeeded ? spec.interpret(job, client, supportedKeys) : [];
  const byKey = new Map(interpreted.map(r => [r.fieldKey, r]));

  const fields: AuthorityFieldResult[] = cardFields.map(f => {
    const hit = f.fieldKey ? byKey.get(f.fieldKey) : undefined;
    if (hit) return { ...hit, label: f.label };
    return { fieldKey: f.fieldKey ?? '', label: f.label, status: 'unsupported', currentValue: '' };
  });

  // ‼ «טרם נתמך» רק לשדה שאין לו מקור ברשות. שדה נתמך שלא חזר בריצה
  // הזו (למשל האדם השני בעדכון לאדם אחד) — «לא נבדק», לא «לא נתמך».
  const notReturned = fields.filter(f => f.status === 'unsupported');
  const summary: AuthorityCheckSummary = {
    checked: fields.filter(f => f.status === 'match' || f.status === 'changed' || f.status === 'info').length,
    changed: fields.filter(f => f.status === 'changed').length,
    unsupported: notReturned.filter(f => !supported.has(f.fieldKey)).length,
    failed: fields.filter(f => f.status === 'failed').length,
    notChecked: notReturned.filter(f => supported.has(f.fieldKey)).length,
  };

  let runError: string | null = null;
  if (job.status === 'failed') runError = job.errorDetail ?? 'הקריאה נכשלה.';
  else if (job.status === 'needs_human') runError = job.needsHuman ?? 'דרושה פעולה בחלון הרשות.';

  // ‼ ההסבר העסקי מוצג פעם אחת לקבוצה, ורק אם הקבוצה בכלל נוכחת בכרטיס.
  const resultFields = succeeded
    ? ((job.result as { fields?: Record<string, string> } | undefined)?.fields ?? {})
    : {};
  const groups = new Set(fields.map(f => f.group).filter(Boolean));
  const groupNotes = (spec.groupNotes?.(resultFields) ?? []).filter(n => groups.has(n.group));

  const runErrorByPerson = succeeded && spec.personErrors ? spec.personErrors(job) : undefined;

  return {
    authority: spec.authority,
    runId: job.id,
    checkedAt: succeeded ? (job.finishedAt ?? job.updatedAt) : undefined,
    fields, summary, groupNotes, runError,
    ...(runErrorByPerson && Object.keys(runErrorByPerson).length ? { runErrorByPerson } : {}),
  };
}

/**
 * הרשויות שיש להן רשומת אוטומציה — בסדר קבוע. ‼ המסך קורא הוק משימה אחד
 * לכל אחת מהן, ולכן הרשימה חייבת להיות סטטית: אורך משתנה היה שובר את סדר
 * ההוקים של ריאקט.
 */
export const AUTOMATED_AUTHORITIES: readonly TaxAuthority[] =
  ['income_tax', 'vat', 'national_insurance'] as const;
