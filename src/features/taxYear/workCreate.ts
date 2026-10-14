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
import { buildYearPicture } from './picture';
import { buildAskPlan } from './asks';
import { DURABLE_KINDS, scopeYearData } from './yearData';
import { previousByArea, type WealthPayload } from './WealthDeclarationPanel';
import { metaOf, type NewWorkRow } from './workMeta';
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

/** הטיוטה לבד — גם לעבודה קיימת (למשל אחרי כשל בהכנת השאלות). */
export async function draftAsksFor(client: Client, stepId: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const { data, error } = await supabase.from('onboarding_steps').select('*').eq('id', stepId);
  if (error || !data?.length) return { ok: false, added: 0, error: error?.message ?? 'not_found' };
  const step = stepFromDb((data as Record<string, unknown>[])[0]);
  const p = step.payload as unknown as { taxYear: number; asOfDate?: string; kind?: 'first' | 'followup'; cutoffMonth?: number } & WealthPayload;
  const purpose: Purpose = step.stepType === 'wealth_declaration' ? 'wealth' : step.stepType === 'tax_file_intake' ? 'intake' : step.stepType === 'tax_estimate' ? 'estimate' : 'annual';
  const year = Number(p.taxYear);
  const [d, prior] = await Promise.all([api.loadYearData(client.id, year), api.loadPriorEvidence(client.id, DURABLE_KINDS)]);
  const scoped = scopeYearData(d, purpose, step.id, p.asOfDate);
  const picture = buildYearPicture({
    client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, today: todayIso(), asOfDate: p.asOfDate, declKind: p.kind,
    facts: scoped.facts, evidence: scoped.evidence, asks: scoped.asks, priorEvidence: prior,
    openedRare: [...new Set([...scoped.asks.map(a => a.itemKey), ...scoped.facts.map(f => f.itemKey)])],
  });
  const plan = buildAskPlan([...picture.toConfirm, ...picture.toAsk], {
    client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: previousByArea(p),
  });
  if (!plan.length) return { ok: true, added: 0 };
  const r = await api.addAsks(step.id, plan.map(e => ({ itemKey: e.itemKey, subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt })));
  return r.ok ? { ok: true, added: r.added } : { ok: false, added: 0, error: r.error };
}

export async function createWork(row: NewWorkRow, client: Client): Promise<CreateResult> {
  const w = await api.upsertTaxWork(client.id, row.kind, { taxYear: row.taxYear, asOfDate: row.asOfDate }, metaOf(row));
  if (!w.ok) return { ok: false, error: w.error, failedAt: 'work' };
  const d = await draftAsksFor(client, w.stepId).catch(e => ({ ok: false, added: 0, error: String((e as Error).message) }));
  if (!d.ok) return { ok: false, stepId: w.stepId, created: w.created, kept: w.kept, error: d.error, failedAt: 'draft' };
  return { ok: true, stepId: w.stepId, created: w.created, kept: w.kept, drafted: d.added };
}
