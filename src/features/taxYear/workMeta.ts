// ─── עבודת מס: מקור, אסמכתה, מועדים ובדיקה אחרונה — מקור אחד לכל המסכים (13.10.2026) ──────────
// ‼ העבודה היא הבקשה עצמה (onboarding_steps: annual_return / wealth_declaration) — לא טבלה שנייה. כאן רק הפרטים
//   שעליה (payload.work, ובהצהרת הון — payload.demand / internalTarget של 230) והתצוגה שלהם.
// ‼ «מועד רשמי» רק עם בסיס: מסמך בתיק הלקוח, רשומה שנקראה מהרשות, או פרסום רשמי של רשות המסים בשמו. בלי בסיס
//   — «מועד שנמסר, לא מאומת». ארכה — רשומה נפרדת לצד המועד, לא במקומו. יעד פנימי — של המשרד, נפרד לגמרי.
// ‼ הצהרת הון: הדרישה והמועדים — במודל של 230 (wealthDemand.ts), בלי עותק שני. כאן רק מאחדים את התצוגה.
// ‼ טהור — בלי React ובלי רשת.

import type { OnboardingStep } from '../../types/onboarding';
import { demandView, type WealthDemand } from './wealthDemand';

export type WorkSource = 'letter' | 'portal' | 'publication' | 'client' | 'alignment' | 'office' | 'other';
export const WORK_SOURCE_LABEL: Record<WorkSource, string> = {
  letter: 'מכתב מהרשות', portal: 'מסך המייצגים / האזור האישי', publication: 'פרסום של רשות המסים', client: 'הלקוח מסר',
  alignment: 'יישור קו מול הרשויות', office: 'הכנה של המשרד (בלי דרישה)', other: 'אחר',
};

export interface WorkEvidence { kind: 'document' | 'authority_record' | 'publication'; documentId?: string; recordId?: string; label?: string; url?: string }

/** מועד הגשה של דוח שנתי — אותה תבנית כמו דרישה להצהרת הון (230). */
export interface AnnualDeadline {
  status: 'reported' | 'verified';
  source?: WorkSource;
  due?: string;
  extension?: { until: string; status: 'reported' | 'documented'; note?: string; at?: string };
  evidence?: WorkEvidence;
  note?: string;
  reportedAt?: string;
  verifiedAt?: string;
}

export interface WorkMeta {
  /** למי העבודה מופנית: הלקוח, בן/בת הזוג או שניהם (הצהרת הון כוללת את שניהם — זה למי פנתה הדרישה). */
  addressee?: 'client' | 'spouse' | 'both';
  source?: WorkSource;
  sourceNote?: string;
  /** דוח שנתי בלבד — בהצהרת הון המועדים בדרישה (230). */
  deadline?: AnnualDeadline;
  /** דוח שנתי — יעד פנימי של המשרד. בהצהרת הון — payload.internalTarget (230). */
  internalTarget?: string;
  lastAuthorityCheck?: { at: string; note?: string; by?: string };
  createdVia?: 'tax_work' | 'tax_file' | 'bulk';
}

const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export interface DeadlineView {
  /** «רשמי» — רק עם בסיס. */
  officialDue?: string;
  /** נמסר, לא מאומת. */
  reportedDue?: string;
  extensionUntil?: string;
  extensionDocumented?: boolean;
  internalTarget?: string;
  /** המועד שמולו מודדים איחור: ארכה > רשמי > שנמסר. */
  effectiveDue?: string;
  basisLabel?: string;
  lastCheck?: string;
  /** שורה אחת לרשימות. */
  short: string;
  /** אין שום מועד ידוע. */
  none: boolean;
}

export function deadlineView(step: Pick<OnboardingStep, 'stepType' | 'payload'>): DeadlineView {
  const p = (step.payload ?? {}) as unknown as { work?: WorkMeta; demand?: WealthDemand | null; internalTarget?: string };
  const w = p.work ?? {};
  const lastCheck = w.lastAuthorityCheck?.at;
  if (step.stepType === 'wealth_declaration') {
    const d = demandView(p.demand);
    const internalTarget = p.internalTarget;
    const effectiveDue = d.extensionUntil ?? d.officialDue ?? d.reportedDue;
    const parts = [d.short, internalTarget ? `יעד פנימי ${he(internalTarget)}` : ''].filter(Boolean);
    return { officialDue: d.officialDue, reportedDue: d.reportedDue, extensionUntil: d.extensionUntil, extensionDocumented: d.extensionDocumented,
      internalTarget, effectiveDue, lastCheck, basisLabel: p.demand?.evidence?.label, short: parts.join(' · '), none: !effectiveDue && !internalTarget };
  }
  const dl = w.deadline;
  const official = dl?.status === 'verified' ? dl.due : undefined;
  const reported = dl && dl.status !== 'verified' ? dl.due : undefined;
  const ext = dl?.extension;
  const effectiveDue = ext?.until ?? official ?? reported;
  const parts = [
    official ? `מועד הגשה ${he(official)}` : reported ? `מועד שנמסר ${he(reported)} (לא מאומת)` : '',
    ext ? `ארכה עד ${he(ext.until)}${ext.status === 'documented' ? '' : ' (לא מתועדת)'}` : '',
    w.internalTarget ? `יעד פנימי ${he(w.internalTarget)}` : '',
  ].filter(Boolean);
  return { officialDue: official, reportedDue: reported, extensionUntil: ext?.until, extensionDocumented: ext?.status === 'documented',
    internalTarget: w.internalTarget, effectiveDue, lastCheck, basisLabel: dl?.evidence?.label,
    short: parts.length ? parts.join(' · ') : 'אין מועד רשום', none: !effectiveDue && !w.internalTarget };
}

export type DueState = 'overdue' | 'soon' | 'later' | 'none';
/** איחור / מתקרב (עד 21 יום) — לפי המועד הקובע; ובלי מועד — לפי היעד הפנימי. */
export function dueState(v: DeadlineView, today: string, open: boolean, soonDays = 21): DueState {
  const d = v.effectiveDue ?? v.internalTarget;
  if (!d || !open) return 'none';
  if (d < today) return 'overdue';
  const soon = new Date(`${today}T00:00:00Z`); soon.setUTCDate(soon.getUTCDate() + soonDays);
  return d <= soon.toISOString().slice(0, 10) ? 'soon' : 'later';
}

/** ימים עד המועד (שלילי = איחור). */
export const daysTo = (iso: string, today: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);

// ── הוספה מרוכזת: ערכים משותפים, תיקון לכל לקוח, מניעת כפילות ────────────────────────────

export type NewWorkKind = 'annual' | 'wealth';
export interface NewWorkRow {
  clientId: string;
  kind: NewWorkKind;
  /** דוח שנתי — שנת המס. */
  taxYear?: number;
  /** הצהרת הון — היום שאליו ההצהרה. */
  asOfDate?: string;
  declKind?: 'first' | 'followup';
  addressee?: WorkMeta['addressee'];
  source?: WorkSource;
  sourceNote?: string;
  /** מועד רשמי / שנמסר — לפי הבסיס. */
  due?: string;
  /** תאריך המכתב (הצהרת הון — לרצפה החוקית, ולאימות). */
  letterDate?: string;
  /** בסיס «רשמי» לדוח שנתי: פרסום של רשות המסים בשמו (חל על כולם). מסמך ללקוח — רק בעבודה עצמה. */
  publication?: string;
  extensionUntil?: string;
  internalTarget?: string;
  lastAuthorityCheck?: string;
}

/** מה חסר או לא תקין בשורה — לפני האישור. */
export function rowProblems(r: NewWorkRow, today: string): string[] {
  const out: string[] = [];
  if (r.kind === 'annual') {
    if (!r.taxYear || r.taxYear < 2000 || r.taxYear > Number(today.slice(0, 4))) out.push('שנת מס לא תקינה');
    else if (r.taxYear === Number(today.slice(0, 4))) out.push('דוח שנתי נפתח רק לשנה שהסתיימה');
  } else if (!r.asOfDate) out.push('חסר יום ההצהרה');
  if (r.due && r.letterDate && r.due < r.letterDate) out.push('המועד מוקדם מתאריך המכתב');
  if (r.extensionUntil && r.due && r.extensionUntil < r.due) out.push('הארכה מוקדמת מהמועד');
  if (r.lastAuthorityCheck && r.lastAuthorityCheck > today) out.push('תאריך בדיקה עתידי');
  return out;
}

/** זהות העבודה — אותה זהות שהשרת נועל (לקוח + סוג + שנה/יום + פתוח). */
export const workKey = (r: Pick<NewWorkRow, 'clientId' | 'kind' | 'taxYear' | 'asOfDate'>) =>
  `${r.clientId}|${r.kind}|${r.kind === 'annual' ? r.taxYear : r.asOfDate}`;

/** עבודה פתוחה קיימת לאותה זהות — כדי להראות «כבר קיימת — לא נוצרת שוב» לפני האישור. */
export function existingFor(r: NewWorkRow, steps: Pick<OnboardingStep, 'id' | 'clientId' | 'stepType' | 'status' | 'payload'>[]): string | null {
  const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];
  const s = steps.find(x => x.clientId === r.clientId && !CLOSED.includes(x.status) && (
    r.kind === 'annual'
      ? x.stepType === 'annual_return' && Number((x.payload as unknown as { taxYear?: number }).taxYear) === r.taxYear
      : x.stepType === 'wealth_declaration' && (x.payload as unknown as { asOfDate?: string }).asOfDate === r.asOfDate));
  return s?.id ?? null;
}

/** השורה → הפרטים שהשרת שומר (upsert_tax_work). ‼ «רשמי» רק עם בסיס; אחרת — «נמסר». */
export function metaOf(r: NewWorkRow): Record<string, unknown> {
  const m: Record<string, unknown> = { createdVia: 'tax_work' };
  if (r.addressee) m.addressee = r.addressee;
  if (r.source) m.source = r.source;
  if (r.sourceNote?.trim()) m.sourceNote = r.sourceNote.trim();
  if (r.internalTarget) m.internalTarget = r.internalTarget;
  if (r.lastAuthorityCheck) m.lastAuthorityCheck = { at: r.lastAuthorityCheck };
  if (r.kind === 'annual' && (r.due || r.extensionUntil)) {
    const verified = !!r.publication?.trim() && !!r.due;
    m.deadline = {
      status: verified ? 'verified' : 'reported', source: r.source ?? (verified ? 'publication' : 'other'), due: r.due,
      ...(verified ? { evidence: { kind: 'publication', label: r.publication!.trim() } } : {}),
      ...(r.extensionUntil ? { extension: { until: r.extensionUntil, status: 'reported' } } : {}),
    };
  }
  if (r.kind === 'wealth') {
    if (r.declKind) m.declKind = r.declKind;
    // ‼ דרישה — רק כשיש מקור שאינו «הכנה של המשרד». נשמרת «טרם אומתה»; האימות — עם אסמכתה בתוך העבודה.
    if (r.source && r.source !== 'office' && r.source !== 'publication') {
      m.demand = { source: r.source === 'letter' ? 'letter' : r.source === 'portal' ? 'portal' : r.source === 'client' ? 'client' : r.source === 'alignment' ? 'alignment' : 'other',
        letterDate: r.letterDate, dueInLetter: r.due, note: r.sourceNote?.trim() || undefined };
      if (r.extensionUntil) m.demandExtension = { until: r.extensionUntil, kind: 'personal' };
    }
  }
  return m;
}

// ── המיזוג — אותם כללים כמו upsert_tax_work / update_tax_work בשרת (241) ───────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** בהצהרת הון — דרישה, ארכה ויעד פנימי חיים במודל של 230 (update_wealth_declaration), לא ב-work. */
export const WEALTH_MODEL_KEYS = ['declKind', 'demand', 'demandExtension', 'internalTarget'];
const WORK_KEYS = ['addressee', 'source', 'sourceNote', 'deadline', 'internalTarget', 'lastAuthorityCheck', 'createdVia'] as const;

/**
 * פרטים חדשים על עבודה קיימת. ‼ `mode: 'create'` (הוספה, גם מרוכזת): פרט שכבר רשום ושונה — לא נדרס, חוזר ב-kept.
 * `mode: 'update'` (עריכה בתוך העבודה): מחליף, ונרשם ביומן. «רשמי» רק עם בסיס.
 */
export function applyWorkMeta(current: WorkMeta | undefined, meta: Record<string, unknown>, kind: NewWorkKind, mode: 'create' | 'update'):
  { work: WorkMeta; applied: string[]; kept: string[] } | { error: string } {
  const work: WorkMeta = { ...(current ?? {}) };
  const applied: string[] = [], kept: string[] = [];
  for (const k of Object.keys(meta)) {
    if (WEALTH_MODEL_KEYS.includes(k) && kind === 'wealth') continue; // שייכים למודל הדרישה (230) — לא נשמרים כאן
    if (!(WORK_KEYS as readonly string[]).includes(k)) return { error: 'bad_field' };
  }
  const v = meta as Partial<WorkMeta> & Record<string, unknown>;
  if (v.addressee !== undefined && !['client', 'spouse', 'both'].includes(String(v.addressee))) return { error: 'bad_addressee' };
  if (v.source !== undefined && !(String(v.source) in WORK_SOURCE_LABEL)) return { error: 'bad_source' };
  if (v.internalTarget !== undefined && v.internalTarget !== null && !ISO.test(String(v.internalTarget))) return { error: 'bad_date' };
  if (kind === 'wealth' && v.deadline !== undefined) return { error: 'use_wealth_demand' };
  if (v.lastAuthorityCheck !== undefined && !ISO.test(String(v.lastAuthorityCheck?.at ?? '').slice(0, 10))) return { error: 'bad_date' };
  if (v.deadline !== undefined) {
    const d = v.deadline as AnnualDeadline;
    if (!['reported', 'verified'].includes(d.status)) return { error: 'bad_status' };
    if (d.due !== undefined && !ISO.test(String(d.due))) return { error: 'bad_date' };
    if (d.extension && (!ISO.test(String(d.extension.until)) || (d.due && d.extension.until < d.due))) return { error: 'bad_extension' };
    // ‼ «רשמי» רק עם בסיס: פרסום בשמו (חל על כולם), מסמך בתיק או רשומה מהרשות (נבדקים בשרת מול הלקוח)
    if (d.status === 'verified' && !(d.evidence && ((d.evidence.kind === 'publication' && !!d.evidence.label?.trim()) || d.evidence.documentId || d.evidence.recordId))) return { error: 'evidence_required' };
    if (d.status === 'verified' && !d.due) return { error: 'due_required' };
  }
  for (const k of WORK_KEYS) {
    if (!(k in meta)) continue;
    if (kind === 'wealth' && WEALTH_MODEL_KEYS.includes(k)) continue;
    const nv = (meta as Record<string, unknown>)[k];
    const ov = (work as Record<string, unknown>)[k];
    if (k === 'createdVia' && ov !== undefined) continue; // איך נוצרה — רק בפעם הראשונה
    if (mode === 'create' && ov !== undefined && JSON.stringify(ov) !== JSON.stringify(nv)) { kept.push(k); continue; }
    if (nv === null) delete (work as Record<string, unknown>)[k]; else (work as Record<string, unknown>)[k] = nv;
    applied.push(k);
  }
  return { work, applied, kept };
}
