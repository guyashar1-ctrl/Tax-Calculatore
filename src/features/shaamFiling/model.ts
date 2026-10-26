// ─── חובות הגשה מרשימות שע״ם — מודל, ניסוח ומעבר לבקשה (16.10.2026) ────────────────────────────────
// ‼ חובה שנקלטה היא מצב נגזר על התיק (250), לא בקשה. היא מציעה בקשה: «פתח בקשה» יוצר את עבודת הדוח/ההון
//   במנגנון הקיים (createWork → upsert_tax_work) כטיוטה מוחזקת — בלי פרסום לדף ובלי מייל — ואז מקשר.
// ‼ ניסוח: «נדרש להגיש עד…» רק כשיש מועד בשורה; בלי מועד — «מועד לא ידוע». «הוגש לפי שע״ם» — לא «הושלם».
//   «חייב בקנס» הוא סימון בשע״ם בלבד: לא סכום, לא «שולם», לא חוב.
// ‼ שנת הצהרת הון — «כפי שמופיעה בשע״ם». יום ההצהרה לבקשה נקבע במפורש בידי המשרד, לא מומר מהשנה.
// ‼ טהור.

import type { NewWorkRow } from '../taxYear/workMeta';
import { WEALTH_GROUP_LABEL, type WealthGroup } from './parse/parseShaam';
import { GMF154_SOURCE_NAME } from './fromGmf154';

export type ObligationState = 'open' | 'filed_per_shaam' | 'history' | 'context' | 'needs_review' | 'dismissed';
export type ReviewReason = 'unmatched' | 'ambiguous' | 'name_mismatch' | 'parse' | 'contradiction' | 'not_ours';

export interface Obligation {
  id: string;
  kind: 'annual' | 'wealth';
  fileNumber: string;
  yearShown: string;
  name?: string;
  office?: string;
  fileType?: string;
  section?: string;
  required?: boolean;
  legalDue?: string;
  legalDueRaw?: string;
  filedOn?: string;
  noAssessment?: boolean;
  group?: WealthGroup;
  fine?: boolean;
  shaamStatus: 'open' | 'filed' | 'context';
  state: ObligationState;
  reason?: ReviewReason;
  clientId?: string;
  clientName?: string;
  role?: 'client' | 'spouse';
  matchKind?: 'tax_file' | 'id' | 'spouse_id' | 'manual';
  candidates?: string[];
  stepId?: string;
  stepStatus?: string;
  copyStepId?: string;
  copyStepStatus?: string;
  copyInOffice?: boolean;
  evidence?: { sourceId?: string; page?: number; line?: number };
  producedOn?: string;
  sourceName?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  historyCount?: number;
}

export interface SourceSummary {
  id: string;
  method: 'pdf' | 'manual';
  fileName: string;
  kind: 'annual' | 'wealth';
  group?: WealthGroup;
  taxYear?: number;
  producedRaw?: string;
  producedOn?: string;
  status: 'ok' | 'empty_confirmed' | 'partial';
  note?: string;
  uploadedAt: string;
  hasFile?: boolean;
  sha256?: string;
}

/** שורה בתוכנית הקליטה שהשרת מחזיר (_shaam_plan). */
export interface PlanRow {
  i: number;
  key?: string;
  change: 'new' | 'updated' | 'unchanged' | 'older' | 'duplicate' | 'invalid';
  state?: ObligationState;
  shaamStatus?: 'open' | 'filed' | 'context';
  match?: 'matched' | 'unmatched' | 'ambiguous' | 'name_mismatch';
  tier?: string;
  clientId?: string;
  role?: 'client' | 'spouse';
  candidates?: string[];
  existingId?: string;
  reason?: string;
  stepId?: string;
}

export const KIND_LABEL = { annual: 'דוח שנתי', wealth: 'הצהרת הון' } as const;

const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];
export const stepIsOpen = (status?: string) => !!status && !CLOSED.includes(status);

export const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

/** «דוח שנתי — שנת מס 2025» · «הצהרת הון — שנה כפי שמופיעה בשע״ם: 2025». */
export function obligationTitle(o: Pick<Obligation, 'kind' | 'yearShown'>): string {
  return o.kind === 'annual' ? `דוח שנתי — שנת מס ${o.yearShown}` : `הצהרת הון — שנה כפי שמופיעה בשע״ם: ${o.yearShown}`;
}

/** המשפט על המועד/ההגשה. */
export function obligationDueText(o: Pick<Obligation, 'state' | 'shaamStatus' | 'legalDue' | 'filedOn' | 'noAssessment'>): string {
  if (o.shaamStatus === 'filed') return o.filedOn ? `הוגש לפי שע״ם ב-${dmy(o.filedOn)}` : 'הוגש לפי שע״ם (תאריך ההגשה לא מופיע ברשימה)';
  if (o.shaamStatus === 'context') return o.noAssessment ? 'ש״מ לא קיימת — נתון לא זמין (אינו הוכחת פטור)' : 'לא מסומן «חייב בהגשה» ברשימה';
  return o.legalDue ? `נדרש להגיש עד ${dmy(o.legalDue)}` : 'נדרש להגיש · מועד לא ידוע';
}

export const STATE_LABEL: Record<ObligationState, string> = {
  open: 'חייב', filed_per_shaam: 'הוגש לפי שע״ם', history: 'הוגשה · היסטוריה', context: 'לידיעה', needs_review: 'לבדיקה', dismissed: 'לא שלנו',
};

/** התווית שבשורה: «חייב · טרם נפתח» / «חייב · נפתחה בקשה» / … */
export function stateLine(o: Pick<Obligation, 'state' | 'stepId' | 'stepStatus'>): string {
  if (o.state === 'open') return o.stepId && stepIsOpen(o.stepStatus) ? 'חייב · נפתחה בקשה' : o.stepId ? 'חייב · הבקשה נסגרה' : 'חייב · טרם נפתח';
  return STATE_LABEL[o.state];
}

export const REVIEW_TEXT: Record<string, string> = {
  unmatched: 'לא נמצא כרטיס עם מספר התיק הזה',
  ambiguous: 'מספר התיק מופיע ביותר מכרטיס אחד',
  name_mismatch: 'מספר התיק תואם לכרטיס, אבל השם ברשימה שונה',
  parse: 'השורה לא נקראה במלואה (מועד או מספר לא תקין)',
  contradiction: 'נרשם כמוגש, ועכשיו מופיע שוב כפתוח',
  not_ours: 'סומן «לא שלנו»',
};

export const MATCH_TEXT: Record<string, string> = {
  tax_file: 'לפי מספר תיק מ״ה בכרטיס', id: 'לפי ת.ז. בכרטיס', spouse_id: 'לפי ת.ז. בן/בת הזוג בכרטיס', manual: 'שויך ידנית',
};

export function listName(o: Pick<Obligation, 'kind' | 'group' | 'sourceName'>): string {
  if (o.sourceName === GMF154_SOURCE_NAME) return 'מידע אודות שנות מס (154)';
  return o.kind === 'annual' ? 'מעקב הגשת דוחות (IDOM)' : `דרישות הצהרת הון (AHZM) · ${o.group ? WEALTH_GROUP_LABEL[o.group] : ''}`;
}

/** «מקור: שע״ם · מעקב הגשת דוחות · הופקה 15.10.2026 · עמוד 1 שורה 3». ‼ רק השורה של הלקוח — לא הקובץ. */
export function sourceText(o: Pick<Obligation, 'kind' | 'group' | 'producedOn' | 'evidence' | 'lastSeenAt' | 'sourceName'>): string {
  const ev = o.evidence ?? {};
  // ‼ 154 נקראה ליישור קו — אין «עמוד/שורה» של קובץ להפנות אליהם.
  const query = o.sourceName === GMF154_SOURCE_NAME;
  return ['מקור: שע״ם', listName(o), o.producedOn ? `${query ? 'נקרא' : 'הופקה'} ${dmy(o.producedOn)}` : '',
    !query && ev.page ? `עמוד ${ev.page}` : '', !query && ev.line ? `שורה ${ev.line}` : '',
    !query && o.lastSeenAt ? `נקלט ${dmy(o.lastSeenAt)}` : ''].filter(Boolean).join(' · ');
}

/** קצר — לשורה ברשימת העבודות; המלא (sourceText) בכותרת השורה ובתיק הלקוח. */
export const sourceShort = (o: Pick<Obligation, 'producedOn' | 'sourceName'>) =>
  `מקור: שע״ם${o.producedOn ? ` · ${o.sourceName === GMF154_SOURCE_NAME ? 'נקרא' : 'הופקה'} ${dmy(o.producedOn)}` : ''}`;

/** מצב העותק בהיסטוריה: שלושה מצבים נפרדים (הבריף): הוגשה לפי שע״ם · עותק קיים במשרד · בקשת עותק ממתינה. */
export function copyState(o: Pick<Obligation, 'state' | 'copyInOffice' | 'copyStepId' | 'copyStepStatus'>): 'in_office' | 'requested' | 'received' | 'missing' | null {
  if (o.state !== 'history' && o.state !== 'filed_per_shaam') return null;
  if (o.copyInOffice) return 'in_office';
  if (o.copyStepId && o.copyStepStatus && ['completed', 'verified'].includes(o.copyStepStatus)) return 'received';
  if (o.copyStepId && stepIsOpen(o.copyStepStatus)) return 'requested';
  return 'missing';
}
export const COPY_TEXT = { in_office: 'עותק קיים במשרד', requested: 'בקשת עותק ממתינה', received: 'העותק התקבל', missing: 'אין עותק בתיק' } as const;

/** חובה פתוחה בלי בקשה פתוחה — מה שמופיע ב«כל העבודות» כ«חייב · טרם נפתח». */
export const needsRequest = (o: Obligation) => o.state === 'open' && !!o.clientId && !(o.stepId && stepIsOpen(o.stepStatus));

/**
 * החובה → שורת עבודה של המנגנון הקיים (AddTaxWorkDialog / createWork).
 * ‼ הצהרת הון: asOfDate חובה ונבחר במפורש בידי המשרד — לא מומר מהשנה. המועד נשמר «נמסר, לא מאומת» (מקור: מסך המייצגים);
 *   «רשמי» דורש אסמכתה בתוך העבודה.
 */
export function toWorkRow(o: Obligation, asOfDate?: string): NewWorkRow | null {
  if (!o.clientId) return null;
  const note = `רשימת שע״ם · ${listName(o)}${o.producedOn ? ` · הופקה ${dmy(o.producedOn)}` : ''}${o.fine ? ' · מסומן «חייב בקנס»' : ''}`;
  const base: NewWorkRow = { clientId: o.clientId, kind: o.kind, source: 'portal', sourceNote: note, due: o.legalDue, lastAuthorityCheck: o.producedOn };
  if (o.kind === 'annual') {
    const y = Number(o.yearShown);
    return Number.isFinite(y) ? { ...base, taxYear: y } : null;
  }
  if (!asOfDate) return null;
  const joint = /ו\/או/.test(o.name ?? '');
  return { ...base, asOfDate, addressee: joint ? 'both' : o.role === 'spouse' ? 'spouse' : 'client' };
}

export interface ImportCounts { matched: number; new: number; updated: number; unchanged: number; older: number; review: number; invalid: number; duplicate: number; context: number; open: number; filed: number }

export function planCounts(plan: PlanRow[]): ImportCounts {
  const c: ImportCounts = { matched: 0, new: 0, updated: 0, unchanged: 0, older: 0, review: 0, invalid: 0, duplicate: 0, context: 0, open: 0, filed: 0 };
  for (const p of plan) {
    if (p.change === 'invalid') { c.invalid++; continue; }
    if (p.change === 'duplicate') { c.duplicate++; continue; }
    if (p.change === 'older') { c.older++; continue; }
    if (p.state === 'needs_review') c.review++;
    else if (p.clientId) c.matched++;
    if (p.change === 'new') c.new++; else if (p.change === 'updated') c.updated++; else if (p.change === 'unchanged') c.unchanged++;
    if (p.state !== 'needs_review') {
      if (p.shaamStatus === 'open') c.open++; else if (p.shaamStatus === 'filed') c.filed++; else c.context++;
    }
  }
  return c;
}

/** שנת המס של השורה: «2025», או תאריך ההצהרה («31.12.2024») — השנה שבו. */
export function obligationYear(o: Pick<Obligation, 'yearShown'>): number | null {
  const m = String(o.yearShown ?? '').match(/(20\d\d)(?!.*20\d\d)/);
  return m ? Number(m[1]) : null;
}
