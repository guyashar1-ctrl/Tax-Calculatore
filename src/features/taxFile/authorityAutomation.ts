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

import type { Client, TaxAuthority } from '../../types';
import type { AutomationJob } from '../../types/automation';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE } from '../../types/automation';
import { SHAAM_READ_134 } from '../../hooks/shaamReadiness';
import { EDIT_FIELD_BY_KEY, editFieldValue } from './editModel';
import { incomeTaxFileType } from '../../data/incomeTaxFileTypes';

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
  /** מה הרשות החזירה, מילה במילה. */
  authorityRaw?: string;
  /** הערך שיישמר בתיק אם השינוי יאושר (מנורמל). קיים רק ב-changed. */
  authorityValue?: string;
  /** תוספת פירוש לתצוגה (למשל תיאור קוד סוג התיק). */
  hint?: string;
  /** טקסט המצב העסקי — ב-info בלבד. */
  businessStatus?: string;
  /** מה השתבש — ב-failed בלבד. משפט אחד. */
  error?: string;
}

export interface AuthorityCheckSummary {
  checked: number;
  changed: number;
  unsupported: number;
  failed: number;
}

export interface AuthorityCheckResult {
  authority: TaxAuthority;
  /** מתי הקריאה הסתיימה. */
  checkedAt?: string;
  fields: AuthorityFieldResult[];
  summary: AuthorityCheckSummary;
  /**
   * כשל ברמת הריצה (לא ברמת שדה): המשימה נכשלה או ממתינה לאדם. מופיע
   * **פעם אחת** בכרטיס, לא ליד כל שדה.
   */
  runError?: string | null;
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
  /** הקלט למשימה, נגזר מהכרטיס. blocked ⇒ אין מה להריץ (למשל אין מספר תיק). */
  buildInput?: (client: Client) => { input: Record<string, unknown> } | { blocked: string };
  /** הופך תוצאת משימה גולמית לסט השוואה. */
  interpret?: (job: AutomationJob | null, client: Client, supportedKeys: readonly string[]) => AuthorityFieldResult[];
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
 *   · cancelled  — היה שיעור מוקצה לתיק, והוא בוטל. לא 0%, ולא "לא רלוונטי".
 * בשני המצבים אין אחוז מספרי במסך, ולכן לא מציעים ערך — רק אומרים מה המצב.
 */
function advanceBusinessStatus(fields: Record<string, string>): string | null {
  const reason = (fields.advanceReason ?? '').trim();
  if (fields.advanceStatus === 'no_advance') {
    return reason ? `לא נדרש במקדמה (סיבה: ${reason})` : 'לא נדרש במקדמה';
  }
  if (fields.advanceStatus === 'cancelled') {
    return reason ? `המקדמה הקודמת בוטלה — ${reason}` : 'המקדמה הקודמת בוטלה';
  }
  return null;
}

interface Shaam134FieldSource {
  /** המפתח שהעובד מחזיר ב-result.fields. */
  source: string;
  /** המרה לערך שנשמר ב-PIVO. null ⇒ לא ניתן למפות חד-משמעית. */
  normalize?: (raw: string) => string | null;
  /** מצב עסקי כש-source ריק, לפי שדות אחרים בתוצאה. null ⇒ זה כישלון. */
  businessStatus?: (fields: Record<string, string>) => string | null;
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
  pitAdvancePercent: { source: 'advanceRate', normalize: mapAdvanceRate, businessStatus: advanceBusinessStatus },
  pitAdvanceFrequency: { source: 'advanceFrequency', normalize: mapAdvanceFrequency, businessStatus: advanceBusinessStatus },
  // ‼ «יתרה» ב-134 היא יתרת חשבון המקדמות לשנה — מופתה לשדה הזה לפי
  // החלטת מוצר. נעדרת אצל no_advance (נצפה חי), ולכן חולקת את המצב העסקי.
  incomeTaxBalance: { source: 'balance', normalize: mapBalance, businessStatus: advanceBusinessStatus },
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
      const business = spec.businessStatus?.(fields) ?? null;
      if (business) return { fieldKey, label, status: 'info', currentValue, businessStatus: business };
      const why = unavailable.find(u => u.key === spec.source)?.reason;
      return {
        fieldKey, label, status: 'failed', currentValue,
        error: why === 'ambiguous' ? 'המסך החזיר יותר מערך אחד — לא ניתן להכריע.' : 'שע״ם לא החזירה ערך לשדה הזה.',
      };
    }
    const normalized = spec.normalize ? spec.normalize(raw) : raw;
    if (normalized === null) {
      return {
        fieldKey, label, status: 'failed', currentValue, authorityRaw: raw,
        error: 'הערך לא ניתן למיפוי אוטומטי — יש להזין ידנית.',
      };
    }
    const hint = spec.hint?.(normalized);
    if (normalized === currentValue.trim()) {
      return { fieldKey, label, status: 'match', currentValue, authorityRaw: raw, authorityValue: normalized, hint };
    }
    return { fieldKey, label, status: 'changed', currentValue, authorityRaw: raw, authorityValue: normalized, hint };
  });
}

/** מספר תיק במס הכנסה — ת.ז. של בן/בת הזוג הרשום/ה, כפי שמתועד ב-TaxFileInfo. */
function incomeTaxFileNumber(client: Client): string {
  return ((client.taxFiles ?? []).find(t => t.authority === 'income_tax')?.fileNumber ?? '').replace(/\D/g, '');
}

/**
 * ‼ הרשומה לכל רשות — מקום אחד. רשות שאינה כאן אינה מקבלת פקד בכותרת
 * (אין מה להריץ ואין מה להבטיח). ב״ל רשומה עם available:false בכוונה:
 * הפקד קיים, מושבת, ואומר בפירוש «עוד לא נבנה».
 */
export const AUTHORITY_AUTOMATION: Partial<Record<TaxAuthority, AuthorityAutomationSpec>> = {
  income_tax: {
    authority: 'income_tax',
    actionLabel: 'בדוק מול שע״ם',
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
  },
  national_insurance: {
    authority: 'national_insurance',
    actionLabel: 'בדוק מול ביטוח לאומי',
    sourceLabel: 'ב״ל',
    available: false,
    unavailableReason: 'הקריאה האוטומטית מביטוח לאומי עדיין לא נבנתה.',
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

  const summary: AuthorityCheckSummary = {
    checked: fields.filter(f => f.status === 'match' || f.status === 'changed' || f.status === 'info').length,
    changed: fields.filter(f => f.status === 'changed').length,
    unsupported: fields.filter(f => f.status === 'unsupported').length,
    failed: fields.filter(f => f.status === 'failed').length,
  };

  let runError: string | null = null;
  if (job.status === 'failed') runError = job.errorDetail ?? 'הקריאה נכשלה.';
  else if (job.status === 'needs_human') runError = job.needsHuman ?? 'דרושה פעולה בחלון הרשות.';

  return {
    authority: spec.authority,
    checkedAt: succeeded ? (job.finishedAt ?? job.updatedAt) : undefined,
    fields, summary, runError,
  };
}
