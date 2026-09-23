// ─── אוטומציה ברמת כרטיס הרשות — מודל אחד לכל הרשויות ─────────────────────────
// ‼ החלטת מוצר: האוטומציה היא פעולה של **הכרטיס**, לא של השדה. לחיצה אחת
// בכותרת הכרטיס מריצה קריאה אחת מהרשות, קוראת את כל השדות הנתמכים, משווה
// אותם לתיק, ומחזירה סט השוואה מובנה. השדות מקבלים סמן מצב קטן; השינויים
// מאושרים בפעולה מקובצת אחת. ראה docs/prototypes/tax-file-v5-1301.html.
//
// ‼ אין כאן רכיב React ואין כאן תלות ברשות מסוימת: הטיפוסים והסיכום
// משותפים למס הכנסה, מע״מ וביטוח לאומי. מה שמשתנה בין רשויות הוא רק
// ה**מתאם** (adapter) שיודע להפוך תוצאת עובד גולמית לסט השוואה — ולמס
// הכנסה זו שאילתה 134. מע״מ וב״ל יקבלו מתאם משלהם, לא UX משלהם.
//
// ‼ מציע ולא כותב: שום דבר כאן לא נוגע ב-clients. הסט הזה הוא מה שהרו"ח
// **רואה**; הכתיבה קורית רק דרך מסלול העובדות המנוהלות, אחרי לחיצה מפורשת.

import type { Client, NiInsuranceBasis, NiOccupation, PersonRole, TaxAuthority } from '../../types';
import { NI_FACT_KEYS } from '../../types';
import type { AutomationJob } from '../../types/automation';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE, BTL_SYNC_FILE_ACTION_TYPE } from '../../types/automation';
import { SHAAM_READ_134, SHAAM_READ_VAT, BTL_READ_FILE } from '../../hooks/shaamReadiness';
import { EDIT_FIELD_BY_KEY, editFieldValue } from './editModel';
import { incomeTaxFileType } from '../../data/incomeTaxFileTypes';
import { niPersons, niEditable } from '../../utils/niPersons';
import {
  niOccupationsFromBtl, niOccupationsKey, niOccupationsInline, niDate,
} from '../nationalInsurance/niOccupations';
import type { BtlOccupationChain } from '../nationalInsurance/niOccupations';
import { niBasisView, niBasisPeriodText, niMonthsText } from '../nationalInsurance/niBasisDisplay';
import { BTL_REPRESENTATION_KEY } from '../nationalInsurance/btlFieldKeys';

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
  buildInput?: (client: Client, spouseClient?: Client) => { input: Record<string, unknown> } | { blocked: string };
  /** הופך תוצאת משימה גולמית לסט השוואה. */
  interpret?: (job: AutomationJob | null, client: Client, supportedKeys: readonly string[]) => AuthorityFieldResult[];
  /** הסברים עסקיים ברמת קבוצה, מתוך תוצאת המשימה. */
  groupNotes?: (fields: Record<string, string>) => AuthorityGroupNote[];
  /** לרשות ברמת-אדם: מי מהאנשים לא נקרא, ולמה (ריצה שהצליחה חלקית). */
  personErrors?: (job: AutomationJob) => Partial<Record<PersonRole, string>>;
}

// ─── מס הכנסה — שאילתה 134 ─────────────────────────────────────────────────────

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
}

/**
 * מפתח השדה בכרטיס ⇄ המקור בשאילתה 134. ‼ רק שדות עם מיפוי מוכח חי —
 * שבעה. שדה שאינו כאן מוצג בכרטיס עם סמן «טרם נתמך», לא נעלם.
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
  // ‼ «יתרה» ב-134 היא יתרת חשבון המקדמות לשנה — מופתה לשדה הזה לפי
  // החלטת מוצר. כשאין חבות מקדמה כלל שע״ם לא מציגה קופסת יתרה (נצפה חי
  // אצל no_advance), ולכן: סמן ניטרלי בלי ערך ובלי הצעה — **לא** 0
  // מומצא, ולא אדום. ההסבר מגיע מהקבוצה.
  incomeTaxBalance: {
    source: 'balance', normalize: mapBalance, group: 'advances',
    businessValue: (f) => (advanceBusinessState(f) ? 'info' : null),
  },
};

/** הערך הגולמי בתיק — לא הטקסט המוצג. «סוג תיק» מוצג «52 · חד-צדית…» ושע״ם מחזירה «52». */
function currentRaw(client: Client, fieldKey: string): string {
  const def = EDIT_FIELD_BY_KEY[fieldKey];
  return def ? editFieldValue(client, def) : String((client as unknown as Record<string, unknown>)[fieldKey] ?? '');
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
    const spec = SHAAM_134_FIELD_SOURCES[fieldKey];
    const label = EDIT_FIELD_BY_KEY[fieldKey]?.label ?? fieldKey;
    const currentValue = currentRaw(client, fieldKey);
    if (!spec || !fields) return { fieldKey, label, status: 'unsupported', currentValue };

    const raw = (fields[spec.source] ?? '').trim();
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
          provenance: advanceBusinessState(fields)?.raw, group: spec.group,
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
      fieldKey, label, currentValue, authorityRaw: raw, authorityDisplay: raw,
      authorityValue: normalized, hint, group: spec.group,
    };
    // ‼ ההשוואה היא בין הערכים המנורמלים, ולכן «0» של שע״ם מול «0» בתיק
    // הוא **תואם**, ואפס אינו מקרה מיוחד. שדה ריק בתיק («—») מול ערך
    // שנקרא הוא שינוי אמיתי — בדיוק כמו בכל שדה אחר.
    return { ...base, status: normalized === currentValue.trim() ? 'match' : 'changed' };
  });
}

/** מספר תיק במס הכנסה — ת.ז. של בן/בת הזוג הרשום/ה, כפי שמתועד ב-TaxFileInfo. */
function incomeTaxFileNumber(client: Client): string {
  return ((client.taxFiles ?? []).find(t => t.authority === 'income_tax')?.fileNumber ?? '').replace(/\D/g, '');
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
  basisCategory: string | null; periodBasis: number; advanceMonthly: number;
}

interface BtlDirectIncome {
  year: number; monthlyAmount: number; infoSource: string | null; incomeSource: string | null;
  receivedDate: string | null; fromMonth: number | null; toMonth: number | null;
}

interface BtlPersonResult {
  role: PersonRole;
  label?: string | null;
  ok: boolean;
  error?: string;
  errorCode?: string;
  representation?: { found: boolean; type?: string | null; receivedDate?: string | null };
  sections?: {
    advance?: BtlSection<BtlAdvanceValue>;
    occupations?: BtlSection<BtlOccupationChain[]>;
    directIncome?: BtlSection<BtlDirectIncome | null>;
    debitAuthorization?: BtlSection<boolean>;
    balance?: BtlSection<number>;
  };
}

export const BTL_FIELD_KEYS: readonly string[] = (['client', 'spouse'] as const).flatMap(r => [
  NI_FACT_KEYS[r].occupations, NI_FACT_KEYS[r].incomeBasisMonthly, NI_FACT_KEYS[r].advanceMonthly,
  NI_FACT_KEYS[r].balance, NI_FACT_KEYS[r].debitAuthorization, NI_FACT_KEYS[r].insuranceBasis,
  BTL_REPRESENTATION_KEY[r],
]);

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
    && a.periodBasis === b.periodBasis && (a.advanceMonthly ?? null) === (b.advanceMonthly ?? null);
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
      for (const k of [keys.occupations, keys.incomeBasisMonthly, keys.advanceMonthly, keys.balance, keys.debitAuthorization, keys.insuranceBasis]) {
        push({ fieldKey: k, label: k, status: 'failed', currentValue: String(c[k] ?? ''), ...person });
      }
      // ‼ «לא נמצא ברשימת המיוצגים» היא תשובה, לא תקלה — מוצגת ליד «ייצוג».
      push(p.errorCode === 'not_found'
        ? { fieldKey: repKey, label: 'ייצוג', status: 'info', currentValue: '', authorityDisplay: 'לא נמצא ברשימת המיוצגים', ...person }
        : { fieldKey: repKey, label: 'ייצוג', status: 'failed', currentValue: '', ...person });
      continue;
    }
    const s = p.sections ?? {};
    const failed = (key: string, section: keyof typeof SECTION_FAILED): AuthorityFieldResult =>
      ({ fieldKey: key, label: key, status: 'failed', currentValue: String(c[key] ?? ''), error: SECTION_FAILED[section], ...person });

    // ── ייצוג: ראיה בלבד ──
    push({
      fieldKey: repKey, label: 'ייצוג', status: 'info', currentValue: '',
      authorityDisplay: `מופיע ברשימת המיוצגים${p.representation?.receivedDate ? ` · נקלט ${niDate(p.representation.receivedDate)}` : ''}`,
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
          provenance: 'עיסוקים והכנסות → רשימת עיסוקים → עיסוקים בתקופה',
          ...person,
        });
      }
    }

    // ── הכנסה מוצהרת (ישירה) — רשימת הכנסות ──
    const direct = s.directIncome?.ok ? s.directIncome.value ?? null : undefined;
    {
      const k = keys.incomeBasisMonthly;
      const current = c[k] as number | undefined;
      if (!s.directIncome?.ok) push(failed(k, 'directIncome'));
      else if (direct == null) {
        push({ fieldKey: k, label: k, status: 'info', currentValue: String(current ?? ''), authorityDisplay: 'אין הכנסה תקפה ברשימת ההכנסות', ...person });
      } else {
        const prov = [`רשימת הכנסות · ${direct.year}`, direct.infoSource, direct.incomeSource,
          direct.receivedDate ? `התקבל ${niDate(direct.receivedDate)}` : null].filter(Boolean).join(' · ');
        push({
          fieldKey: k, label: k, status: current != null && Number(current) === direct.monthlyAmount ? 'match' : 'changed',
          currentValue: String(current ?? ''),
          authorityDisplay: `${ils(direct.monthlyAmount)} לחודש`, authorityValue: String(direct.monthlyAmount),
          patchValue: direct.monthlyAmount, hint: prov, provenance: prov, ...person,
        });
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

        const basis: NiInsuranceBasis = {
          year: a.year, fromMonth: a.fromMonth, toMonth: a.toMonth, months: a.months,
          periodBasis: a.periodBasis, advanceMonthly: a.advanceMonthly,
          ...(a.basisCategory ? { category: a.basisCategory } : {}),
          // ‼ שנת המקור — רק מההכנסה הישירה, ורק כשהיא לפני שנת הביטוח.
          ...(direct && direct.year < a.year ? { sourceIncomeYear: direct.year } : {}),
        };
        const curBasis = c[kBasis] as NiInsuranceBasis | undefined;
        const occupations = s.occupations?.ok ? s.occupations.value ?? [] : [];
        const view = niBasisView(basis, { directMonthlyIncome: direct?.monthlyAmount ?? null, statusesCount: occupations.length || undefined });
        push({
          fieldKey: kBasis, label: kBasis, status: sameBasis(curBasis, basis) ? 'match' : 'changed',
          currentValue: curBasis ? `${curBasis.periodBasis}|${niBasisPeriodText(curBasis)}` : '',
          currentDisplay: curBasis ? `${ils(curBasis.periodBasis)} · ${niBasisPeriodText(curBasis)}` : '—',
          authorityDisplay: view.periodText,
          authorityValue: `${basis.periodBasis}|${niBasisPeriodText(basis)}`,
          patchValue: basis,
          hint: [view.monthlyText, view.reconstructionText].filter(Boolean).join(' · ') || undefined,
          provenance: `ריכוז מידע · בסיס ${a.basisCategory ?? ''} ${a.periodBasis} · ${niMonthsText(a.fromMonth, a.toMonth, a.year)}`.replace(/\s+/g, ' '),
          ...person,
        });
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
          provenance: d.source === 'header' ? 'כותרת המבוטח' : 'הוראות כספיות → הרשאות לחיוב',
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
          provenance: b.source === 'header' ? 'כותרת המבוטח' : 'מצב חשבון → לפי ימי ערך ריאלי',
          ...person,
        });
      }
    }
  }
  return out;
}

/**
 * ‼ הרשומה לכל רשות — מקום אחד. רשות שאינה כאן אינה מקבלת פקד בכותרת
 * (אין מה להריץ ואין מה להבטיח). ב״ל רשומה עם available:false בכוונה:
 * הפקד קיים, מושבת, ואומר בפירוש «עוד לא נבנה».
 */
export const AUTHORITY_AUTOMATION: Partial<Record<TaxAuthority, AuthorityAutomationSpec>> = {
  income_tax: {
    authority: 'income_tax',
    // ‼ «עדכן נתונים» ולא «בדוק»: זו קריאת נתוני התיק (134), לא בדיקת ייצוג.
    // בדיקת קבלת הייצוג היא פעולה אחרת, על כרטיס הייצוג/האדם (NiNextActionButton).
    actionLabel: 'עדכן נתונים משע״ם',
    sourceLabel: 'שע״ם',
    available: true,
    actionType: SHAAM_SYNC_INCOME_TAX_ACTION_TYPE,
    capability: SHAAM_READ_134,
    sourceRef: 'shaam-134',
    supportedFieldKeys: new Set(Object.keys(SHAAM_134_FIELD_SOURCES)),
    buildInput: (client) => {
      const fileNumber = incomeTaxFileNumber(client);
      return fileNumber
        ? { input: { fileNumber } }
        : { blocked: 'אין מספר תיק במס הכנסה בכרטיס — אין מה למשוך.' };
    },
    interpret: interpretShaam134,
    groupNotes: (fields) => {
      const state = advanceBusinessState(fields);
      return state ? [{ group: 'advances', label: 'מקדמות', text: state.note }] : [];
    },
  },
  // ─── מע״מ ──────────────────────────────────────────────────────────────────
  // ‼ מצב אמיתי (3.9.2026): המשטח המאומת של מע״מ (`/emhanmainmenu`) נגיש
  // לצופה — הוא מנווט אליו ומדווח מוכנות — אבל **תפריט ראשי בלבד**. אין
  // handler קריאה (`worker/src/handlers/` מכיל שע״ם-134 ו-btl.connect/disconnect
  // בלבד), אין מסך תיק עוסק שנצפה, ואין ולו עוגן שדה אחד מוכח. אפס משימות
  // קריאה למע״מ רצו אי פעם.
  //
  // ‼ ולכן `available:false` ו-`supportedFieldKeys` ריק — לא כפתור שמבטיח
  // קריאה שאין. ברגע שייבנה ה-handler, החיבור כאן הוא הצהרה: actionType,
  // supportedFieldKeys, ו-interpret. שום שינוי במסך.
  vat: {
    authority: 'vat',
    actionLabel: 'עדכן נתונים משע״ם',
    sourceLabel: 'שע״ם',
    available: false,
    capability: SHAAM_READ_VAT,
    sourceRef: 'shaam-vat',
    supportedFieldKeys: new Set<string>(),
    unavailableReason:
      'קריאה אוטומטית ממע״מ עדיין לא נבנתה: מערכת הגבייה נגישה לצופה בתפריט הראשי, '
      + 'אבל אין עדיין מסך תיק עוסק שנצפה ואין עוגני שדה מוכחים.',
  },

  // ─── ביטוח לאומי ───────────────────────────────────────────────────────────
  // ‼ btl.sync_file (worker/src/handlers/btlSyncFile.mjs) קורא את תיק המבוטח
  // בפורטל המייצגים — לכל אדם בנפרד — והמתאם כאן הופך את התוצאה לסט
  // השוואה. ‼ ה-capability מצביעה על שכבת `btl` בלבד: מוכנות ב״ל אינה
  // נגזרת ממוכנות שע״ם, ולהפך.
  national_insurance: {
    authority: 'national_insurance',
    actionLabel: 'עדכן נתונים מביטוח לאומי',
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
    buildInput: (client, spouseClient) => {
      const subjects: AutomationSubject[] = niPersons(client, spouseClient)
        .filter(p => !!p.idNumber && niEditable(p))
        .map(p => ({ role: p.role, idNumber: p.idNumber, label: p.name }));
      return subjects.length > 0
        ? { input: { subjects } }
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
