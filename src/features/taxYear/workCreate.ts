// ─── פתיחת עבודה: יצירה או קישור + טיוטת שאלות ומסמכים (13.10.2026) ─────────────────────────
// ‼ גיא: פתיחת עבודה יוצרת (או מקשרת) את הבקשה ואת טיוטת «השלמת מידע» — על בסיס מה שכבר ידוע לתקופה הנכונה.
//   ‼ יצירה אינה פרסום: הטיוטה לא מופיעה בדף האישי ולא יוצא מייל. פרסום — «פרסם בדף האישי»; מייל — «שלח מייל…».
// ‼ אידמפוטנטי: השרת לא יוצר עבודה שנייה לאותה זהות, ושאלה פתוחה לאותו פריט לא נוספת פעמיים (add_tax_info_asks).
//   לכן הרצה חוזרת אחרי כשל חלקי — בטוחה: מה שנוצר מקושר, מה שחסר נוצר.

import type { Client } from '../../types';
import { supabase } from '../../lib/supabase';
import { stepFromDb } from '../../lib/dbMappers';
import { todayIso } from '../../utils/dateFormat';
import * as api from './api';
import { buildYearPicture, type PictureInput } from './picture';
import { withOneRound } from './oneRound';
import { buildAskPlan, type AskPlanEntry } from './asks';
import { DURABLE_KINDS, scopeYearData } from './yearData';
import { previousByArea, type WealthPayload } from './WealthDeclarationPanel';
import { metaOf, type NewWorkRow } from './workMeta';
import type { LastYearHints } from './priorReturn';
import { findPriorReturnDocs } from './priorReturnApi';
import type { Purpose } from './types';

export interface CreateResult {
  ok: boolean;
  stepId?: string;
  created?: boolean;
  /** פרטים שכבר היו רשומים על עבודה קיימת ולא נדרסו. */
  kept?: string[];
  /** כמה שאלות נוספו לטיוטה (0 — כבר היו, או שאין מה לשאול). */
  drafted?: number;
  error?: string;
  /** השלב שנכשל — כדי שהרצה חוזרת תדע מה לנסות. */
  failedAt?: 'work' | 'draft';
}

type WorkPayload = { taxYear: number; asOfDate?: string; kind?: 'first' | 'followup'; cutoffMonth?: number } & WealthPayload;
const purposeOf = (stepType: string): Purpose =>
  stepType === 'wealth_declaration' ? 'wealth' : stepType === 'tax_file_intake' ? 'intake' : stepType === 'tax_estimate' ? 'estimate' : 'annual';
export const toAskInput = (e: AskPlanEntry): api.AskInput => ({ itemKey: e.itemKey, subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt });

/**
 * השאלות שהעבודה הזו צריכה עכשיו — מאותו מנוע כמו דף העבודה (picture.ts → asks.ts), על הנתונים של הבקשה הזו.
 * ‼ stepId ריק = עבודה שעוד לא נוצרה (קליטה חדשה): התמונה נבנית מהכרטיס בלבד, בלי עובדות ושאלות קודמות.
 */
export async function planAsksFor(client: Client, purpose: Purpose, p: WorkPayload, stepId: string | null, lastYear?: LastYearHints): Promise<AskPlanEntry[]> {
  const year = Number(p.taxYear);
  const [d, prior] = await Promise.all([api.loadYearData(client.id, year), api.loadPriorEvidence(client.id, DURABLE_KINDS)]);
  const scoped = scopeYearData(d, purpose, stepId ?? '', p.asOfDate);
  const pin: PictureInput = {
    client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, today: todayIso(), asOfDate: p.asOfDate, declKind: p.kind,
    facts: scoped.facts, evidence: scoped.evidence, asks: scoped.asks, priorEvidence: prior,
    openedRare: [...new Set([...scoped.asks.map(a => a.itemKey), ...scoped.facts.map(f => f.itemKey)])],
  };
  const picture = buildYearPicture(pin);
  const ctx = { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: previousByArea(p), lastYear };
  // ‼ 20.10.2026 · דוח שנתי: מה שתשובה חיובית פותחת — מוכן מראש בתוך השאלה (oneRound.ts), כדי שהשאלון ייגמר בסבב אחד
  return withOneRound(buildAskPlan([...picture.toConfirm, ...picture.toAsk], ctx), pin, ctx);
}

/** הטיוטה לבד — גם לעבודה קיימת (למשל אחרי כשל בהכנת השאלות). */
export async function draftAsksFor(client: Client, stepId: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const { data, error } = await supabase.from('onboarding_steps').select('*').eq('id', stepId);
  if (error || !data?.length) return { ok: false, added: 0, error: error?.message ?? 'not_found' };
  const step = stepFromDb((data as Record<string, unknown>[])[0]);
  const plan = await planAsksFor(client, purposeOf(step.stepType), step.payload as unknown as WorkPayload, step.id);
  if (!plan.length) return { ok: true, added: 0 };
  const r = await api.addAsks(step.id, plan.map(toAskInput));
  return r.ok ? { ok: true, added: r.added } : { ok: false, added: 0, error: r.error };
}

const CLOSED_STATUSES = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];

/**
 * 254 (17.10.2026) · «היכרות שנשלחת לבד»: פתיחת הקליטה = הבקשה + כל השאלות שנגזרות מהתיק, מפורסמות בדף של הלקוח —
 * קריאה אחת לשרת. אין «הוסף שאלות» ואין «פרסם». אידמפוטנטי: קליטה פתוחה קיימת ⇒ נוספות רק שאלות שחסרות.
 * ‼ בלי מייל (כלל «דף אחד ללקוח»). ‼ שאלון קליטה ישן שעדיין פתוח אצל הלקוח — אישורי הפרטים הקבועים נשארים לו
 *   (אותו כלל כמו ב-AskPanel), כדי שלא יישאל פעמיים; השאר נשאל.
 */
export async function openTaxFileIntake(client: Client): Promise<CreateResult & { published?: number }> {
  const { data, error } = await supabase.from('onboarding_steps').select('*').eq('client_id', client.id).eq('step_type', 'tax_file_intake');
  if (error) return { ok: false, error: error.message, failedAt: 'work' };
  const existing = ((data ?? []) as Record<string, unknown>[]).map(r => stepFromDb(r)).find(s => !CLOSED_STATUSES.includes(s.status)) ?? null;
  const today = todayIso();
  const payload: WorkPayload = existing
    ? (existing.payload as unknown as WorkPayload)
    : { taxYear: Number(today.slice(0, 4)), asOfDate: today };
  let plan: AskPlanEntry[];
  try { plan = await planAsksFor(client, 'intake', payload, existing?.id ?? null); }
  catch (e) { return { ok: false, error: String((e as Error).message), failedAt: 'draft' }; }
  const legacyOpen = existing ? await api.openIntakeStep((existing.payload as unknown as { legacyStepId?: string }).legacyStepId).catch(() => null) : null;
  const chosen = legacyOpen ? plan.filter(e => e.statuses[0]?.state !== 'fromCard') : plan;
  const r = await api.ensureTaxFileIntake(client.id, chosen.map(toAskInput));
  if (!r.ok) return { ok: false, error: r.error, failedAt: existing ? 'draft' : 'work' };
  return { ok: true, stepId: r.stepId, created: r.created, drafted: r.asked ?? 0, published: r.published ?? 0 };
}

/**
 * 19.10.2026 · «דוח שנתי {שנה}» בלחיצה אחת (הדמיה מאושרת: docs/proposals/2026-10-19-simple-annual-questionnaire.html):
 * הבקשה נפתחת (או נמצאת), השאלון נבנה מהתיק — אישורים, מסך הרשת «מה היה לכם», מסמכים לישויות שבתיק — ומתפרסם בדף של
 * הלקוח. ‼ בלי מייל (כלל «דף אחד ללקוח»): הפריט מופיע ב«הדף של X», והמייל — מ«שלח מייל…» כרגיל.
 * ‼ אידמפוטנטי: בקשה קיימת ⇒ נוספות רק שאלות שחסרות (add_tax_info_asks לא מוסיף פריט פתוח פעמיים).
 */
export async function openAnnualReturn(client: Client, taxYear: number, opts: { holdForPriorReturn?: boolean } = {}): Promise<CreateResult & { published?: number; held?: boolean }> {
  const w = await api.ensureYearRequest(client.id, 'annual', taxYear);
  if (!w.ok) return { ok: false, error: w.error, failedAt: 'work' };
  // ‼ 19.10.2026 · יש בתיק הדוח של שנה שעברה ⇒ קודם מבט של המשרד («לפני השליחה» בדף הבקשה), ורק אז השאלון יוצא
  if (opts.holdForPriorReturn && w.created) return { ok: true, stepId: w.stepId, created: true, drafted: 0, published: 0, held: true };
  return publishAnnualAsks(client, taxYear, w.stepId, undefined, w.created);
}

/**
 * ‼ 20.10.2026 · דוח שנתי שנפתח בגרסה הקודמת של השאלון ⇒ נסגר (remove_tax_work — ביטול שנשמר בהיסטוריה וניתן להחזרה,
 *   או מחיקה כשעוד לא יצא כלום), ונפתח מחדש. התשובות הן עובדות של השנה ולא של הבקשה — לא נשאלות שוב.
 */
export async function reopenAnnualInNewVersion(client: Client, oldStepId: string, taxYear: number): Promise<CreateResult> {
  const chk = await api.workRemovalCheck(oldStepId);
  if (!chk.ok) return { ok: false, error: chk.error, failedAt: 'work' };
  if (chk.mode !== 'none') {
    const rm = await api.removeTaxWork(oldStepId, chk.mode, 'נפתח מחדש בגרסה החדשה של השאלון');
    if (!rm.ok) return { ok: false, error: rm.error, failedAt: 'work' };
  }
  const prior = await findPriorReturnDocs(client.id, taxYear).catch(() => []);
  return openAnnualReturn(client, taxYear, { holdForPriorReturn: prior.length > 0 });
}

/** השאלון של הדוח השנתי: נבנה מהתיק (ומהדוח הקודם, אם המשרד אישר) ומתפרסם בדף — בלי מייל. */
export async function publishAnnualAsks(client: Client, taxYear: number, stepId: string, lastYear?: LastYearHints, created = false): Promise<CreateResult & { published?: number }> {
  let plan: AskPlanEntry[];
  try { plan = await planAsksFor(client, 'annual', { taxYear }, stepId, lastYear); }
  catch (e) { return { ok: false, stepId, created, error: String((e as Error).message), failedAt: 'draft' }; }
  if (!plan.length) return { ok: true, stepId, created, drafted: 0, published: 0 };
  const a = await api.addAsks(stepId, plan.map(toAskInput));
  if (!a.ok) return { ok: false, stepId, created, error: a.error, failedAt: 'draft' };
  const p = await api.publishInfo(a.infoStepId);
  if (!p.ok) return { ok: false, stepId, created, drafted: a.added, error: p.error, failedAt: 'draft' };
  return { ok: true, stepId, created, drafted: a.added, published: p.published };
}

export async function createWork(row: NewWorkRow, client: Client): Promise<CreateResult> {
  const w = await api.upsertTaxWork(client.id, row.kind, { taxYear: row.taxYear, asOfDate: row.asOfDate }, metaOf(row));
  if (!w.ok) return { ok: false, error: w.error, failedAt: 'work' };
  const d = await draftAsksFor(client, w.stepId).catch(e => ({ ok: false, added: 0, error: String((e as Error).message) }));
  if (!d.ok) return { ok: false, stepId: w.stepId, created: w.created, kept: w.kept, error: d.error, failedAt: 'draft' };
  return { ok: true, stepId: w.stepId, created: w.created, kept: w.kept, drafted: d.added };
}
