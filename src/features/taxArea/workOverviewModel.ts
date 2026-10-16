// ─── «עבודות לקוחות» — סקירה בלבד (16.10.2026) ─────────────────────────────────────────────────
// ‼ הכרעת גיא (16.10): «מס › עבודות לקוחות» היא סקירה רוחבית של כל העבודות אצל כל הלקוחות — בלי פעולות.
//   העבודה עצמה (פרסום, בדיקה, אישור לתיק, הסרה) — ב«בקשות» של הלקוח. כל שורה מובילה לשם.
// ‼ טהור — אותן שורות כמו המספרים במסילה (useTaxWork / buildWorkRows), לא רשימה שנייה.

import type { WorkKind, WorkRow } from '../taxYear/taxWork';
import { daysTo, deadlineView, dueState, type DeadlineView, type DueState } from '../taxYear/workMeta';
import { isOpenStep } from '../taxYear/taxWork';

export type OverviewState = 'open' | 'mine' | 'client' | 'done' | 'cancelled';
export const OVERVIEW_STATES: { id: OverviewState; label: string }[] = [
  { id: 'open', label: 'פתוחות' }, { id: 'mine', label: 'ממתינות למשרד' }, { id: 'client', label: 'אצל הלקוח' },
  { id: 'done', label: 'הושלמו (30 יום)' }, { id: 'cancelled', label: 'בוטלו' },
];
export type OverviewDue = 'any' | 'overdue' | 'soon' | 'none';
export const OVERVIEW_DUES: { id: OverviewDue; label: string }[] = [
  { id: 'any', label: 'כל המועדים' }, { id: 'overdue', label: 'באיחור' }, { id: 'soon', label: 'מתקרב (3 שבועות)' }, { id: 'none', label: 'בלי מועד' },
];
export const KIND_NAME: Record<WorkKind, string> = { annual: 'דוח שנתי', wealth: 'הצהרת הון', intake: 'קליטה והשלמת תיק', estimate: 'הערכת מס' };

export interface OverviewRow {
  row: WorkRow;
  clientId: string;
  stepId: string;
  kind: WorkKind;
  /** «2025» · «ליום 31.12.2025» · «פרטים קבועים». */
  period: string;
  dv: DeadlineView;
  due: DueState;
  /** המועד שמוצג (ארכה ← רשמי ← שנמסר ← יעד פנימי), ובאיזה סוג. */
  dueDate?: string;
  dueKind?: string;
  /** ימים עד המועד; שלילי = איחור. */
  days?: number;
  active: boolean;
}

const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

export function toOverview(rows: WorkRow[], today: string): OverviewRow[] {
  return rows.map(r => {
    const p = (r.parent.payload ?? {}) as { taxYear?: number; asOfDate?: string };
    const period = r.kind === 'wealth' ? (p.asOfDate ? `ליום ${dmy(p.asOfDate)}` : '')
      : r.kind === 'intake' ? (p.asOfDate ? `נכון ל-${dmy(p.asOfDate)}` : 'פרטים קבועים') : p.taxYear ? String(p.taxYear) : '';
    const dv = deadlineView(r.parent);
    const active = r.bucket !== 'done' && r.bucket !== 'cancelled';
    const due = dueState(dv, today, isOpenStep(r.parent));
    const dueDate = r.bucket === 'cancelled' ? undefined : dv.effectiveDue ?? dv.internalTarget ?? undefined;
    const dueKind = dueDate ? (dv.extensionUntil ? 'ארכה' : dv.officialDue ? 'מועד הגשה' : dv.reportedDue ? 'מועד שנמסר · לא מאומת' : 'יעד פנימי') : undefined;
    return { row: r, clientId: r.parent.clientId, stepId: r.parent.id, kind: r.kind, period, dv, due, dueDate, dueKind, days: dueDate ? daysTo(dueDate, today) : undefined, active };
  });
}

const monthAgo = (today: string) => new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 864e5).toISOString();

export function filterOverview(all: OverviewRow[], o: { kind: WorkKind | 'all'; state: OverviewState; due: OverviewDue; q?: string; nameOf?: (clientId: string) => string; today: string }): OverviewRow[] {
  const since = monthAgo(o.today);
  const words = (o.q ?? '').trim().split(/\s+/).filter(Boolean);
  const shown = all.filter(x => (o.kind === 'all' || x.kind === o.kind)
    && (o.state === 'open' ? x.active : o.state === 'done' ? x.row.bucket === 'done' && String(x.row.parent.updatedAt ?? x.row.parent.createdAt ?? '') >= since : x.row.bucket === o.state)
    && (o.due === 'any' || (o.due === 'none' ? x.due === 'none' : x.due === o.due))
    && (!words.length || words.every(w => (o.nameOf?.(x.clientId) ?? '').includes(w) || x.row.title.includes(w))));
  // ‼ באיחור ← מתקרב ← ממתין למשרד ← אצל הלקוח; בתוך כל קבוצה — המועד הקרוב קודם
  const rank = (x: OverviewRow) => (x.due === 'overdue' ? 0 : x.due === 'soon' ? 1 : x.row.bucket === 'mine' ? 2 : 3);
  return [...shown].sort((a, b) => rank(a) - rank(b) || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')) || b.row.toReview - a.row.toReview);
}

export function overviewCounts(all: OverviewRow[], kind: WorkKind | 'all', today: string) {
  const mine = all.filter(x => kind === 'all' || x.kind === kind);
  const act = mine.filter(x => x.active);
  return {
    open: act.length, mine: mine.filter(x => x.row.bucket === 'mine').length, client: mine.filter(x => x.row.bucket === 'client').length,
    done: filterOverview(all, { kind, state: 'done', due: 'any', today }).length, cancelled: mine.filter(x => x.row.bucket === 'cancelled').length,
    overdue: act.filter(x => x.due === 'overdue').length, soon: act.filter(x => x.due === 'soon').length,
  };
}
