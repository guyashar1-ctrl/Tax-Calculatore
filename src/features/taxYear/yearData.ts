// ─── נתוני השנה לפי סוג הבקשה (הועבר מ-TaxYearProcess, 13.10.2026) ─────────────────────
// ‼ מקור אחד לדף התהליך ולפתיחת עבודה (טיוטת שאלות): כל בקשה רואה רק את העובדות, המסמכים והשאלות שלה.
import type * as api from './api';
import type { Purpose } from './types';
import { DOCS } from './documents';
import { WEALTH_ITEMS } from './wealthCatalog';

export const WEALTH_DOCS = new Set(WEALTH_ITEMS.map(i => i.docKind).filter(Boolean) as string[]);
export const isWealthKey = (k: string) => k.startsWith('wealth.');
export const isIntakeKey = (k: string) => k.startsWith('intake.');
export const DURABLE_KINDS = Object.entries(DOCS).filter(([, v]) => v.durable).map(([k]) => k);

export function scopeYearData(d: api.YearData, purpose: Purpose, stepId: string, asOf?: string): api.YearData {
  // ‼ קליטה: רק עובדות הקליטה ליום הקליטה, השאלות של הבקשה הזו, והמסמכים שהועלו אליהן
  const intakeAskIds = new Set(d.asks.filter(a => isIntakeKey(a.itemKey)).map(a => a.id));
  if (purpose === 'intake') {
    const mine = d.asks.filter(a => isIntakeKey(a.itemKey) && a.parentStepId === stepId);
    const ids = new Set(mine.map(a => a.id));
    return {
      facts: d.facts.filter(f => isIntakeKey(f.itemKey) && f.periodTo === asOf),
      evidence: d.evidence.filter(e => !!e.askId && ids.has(e.askId)),
      asks: mine,
    };
  }
  d = { facts: d.facts.filter(f => !isIntakeKey(f.itemKey)), evidence: d.evidence.filter(e => !e.askId || !intakeAskIds.has(e.askId)), asks: d.asks.filter(a => !isIntakeKey(a.itemKey)) };
  if (purpose === 'wealth') return {
    facts: d.facts.filter(f => isWealthKey(f.itemKey) && f.periodTo === asOf),
    evidence: d.evidence.filter(e => WEALTH_DOCS.has(e.docKind) && (!e.periodTo || e.periodTo === asOf)),
    asks: d.asks.filter(a => isWealthKey(a.itemKey) && a.parentStepId === stepId),
  };
  return {
    facts: d.facts.filter(f => !isWealthKey(f.itemKey)),
    evidence: d.evidence.filter(e => !WEALTH_DOCS.has(e.docKind)),
    asks: d.asks.filter(a => !isWealthKey(a.itemKey)),
  };
}
