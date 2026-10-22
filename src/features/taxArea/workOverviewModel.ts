// ─── «עבודות» — סקירה בלבד (16.10.2026 · עיצוב מחדש 21.10.2026) ─────────────────────────────────
// ‼ הכרעת גיא (16.10): סקירה רוחבית של כל העבודות אצל כל הלקוחות — בלי פעולות. העבודה עצמה ב«בקשות»
//   של הלקוח; לחיצה על שורה פותחת אותן.
// ‼ 21.10 (הדמיה מאושרת 2026-10-21-tax-area-reimagined): לשוניות «אצלי / אצל הלקוח / הכול», קיבוץ לפי מועד,
//   ו«עונת הדוחות» מחובות ההגשה שנקלטו משע״ם. איחור מוצג בכל לשונית — לא מסתתר מאחורי בחירה.
// ‼ טהור — אותן שורות כמו המספרים במסילה (useTaxWork / buildWorkRows), לא רשימה שנייה.

import type { WorkKind, WorkRow } from '../taxYear/taxWork';
import { daysTo, deadlineView, dueState, type DeadlineView, type DueState } from '../taxYear/workMeta';
import { isOpenStep } from '../taxYear/taxWork';
import { stepIsOpen, type Obligation, type SourceSummary } from '../shaamFiling/model';

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

// ── לשוניות ─────────────────────────────────────────────────────────────────────────────────────
export type WorkTab = 'mine' | 'client' | 'all';
export const WORK_TABS: { id: WorkTab; label: string }[] = [
  { id: 'mine', label: 'אצלי' }, { id: 'client', label: 'אצל הלקוח' }, { id: 'all', label: 'הכול' },
];

export interface OverviewQuery { kind: WorkKind | 'all'; q?: string; nameOf?: (clientId: string) => string }

/** סוג + חיפוש בשם הלקוח (כל המילים) או בכותרת העבודה. */
function matches(x: OverviewRow, o: OverviewQuery): boolean {
  if (o.kind !== 'all' && x.kind !== o.kind) return false;
  const words = (o.q ?? '').trim().split(/\s+/).filter(Boolean);
  return words.every(w => (o.nameOf?.(x.clientId) ?? '').includes(w) || x.row.title.includes(w));
}

/** המספרים שעל הלשוניות — לפי מי שהכדור אצלו, אחרי סוג וחיפוש. */
export function tabCounts(all: OverviewRow[], o: OverviewQuery): Record<WorkTab, number> {
  const act = all.filter(x => x.active && matches(x, o));
  return { mine: act.filter(x => x.row.bucket === 'mine').length, client: act.filter(x => x.row.bucket === 'client').length, all: act.length };
}

// ── קבוצות לפי מועד ─────────────────────────────────────────────────────────────────────────────
export type DueGroup = 'overdue' | 'week' | 'month' | 'later' | 'none';
export const DUE_GROUPS: { id: DueGroup; label: string }[] = [
  { id: 'overdue', label: 'באיחור' }, { id: 'week', label: 'השבוע' }, { id: 'month', label: 'החודש' }, { id: 'later', label: 'בהמשך' }, { id: 'none', label: 'בלי מועד' },
];

/** השבוע = עד 7 ימים · החודש = עד 31 ימים. */
export function dueGroupOf(x: Pick<OverviewRow, 'days'>): DueGroup {
  if (x.days === undefined) return 'none';
  if (x.days < 0) return 'overdue';
  if (x.days <= 7) return 'week';
  if (x.days <= 31) return 'month';
  return 'later';
}

/** השורות שבלשונית: לפי הכדור — ועבודה באיחור תמיד, בכל לשונית. */
export function tabRows(all: OverviewRow[], o: OverviewQuery & { tab: WorkTab }): OverviewRow[] {
  return all.filter(x => x.active && matches(x, o) && (o.tab === 'all' || x.row.bucket === o.tab || dueGroupOf(x) === 'overdue'));
}

/** קבוצות בסדר קבוע; בתוך קבוצה — המועד הקרוב קודם, ואז מה שממתין לבדיקה. קבוצה ריקה לא מוחזרת. */
export function groupByDue(rows: OverviewRow[]): { id: DueGroup; label: string; rows: OverviewRow[] }[] {
  const sorted = [...rows].sort((a, b) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')) || b.row.toReview - a.row.toReview);
  return DUE_GROUPS.map(g => ({ ...g, rows: sorted.filter(x => dueGroupOf(x) === g.id) })).filter(g => g.rows.length > 0);
}

/** שהושלמו ב-30 הימים האחרונים, ושבוטלו — מחוץ לתצוגה הראשית. */
export function closedRows(all: OverviewRow[], o: OverviewQuery & { today: string }): { done: OverviewRow[]; cancelled: OverviewRow[] } {
  const since = new Date(Date.parse(`${o.today}T00:00:00Z`) - 30 * 864e5).toISOString();
  const at = (x: OverviewRow) => String(x.row.parent.updatedAt ?? x.row.parent.createdAt ?? '');
  const mine = all.filter(x => matches(x, o));
  return {
    done: mine.filter(x => x.row.bucket === 'done' && at(x) >= since).sort((a, b) => at(b).localeCompare(at(a))),
    cancelled: mine.filter(x => x.row.bucket === 'cancelled').sort((a, b) => at(b).localeCompare(at(a))),
  };
}

// ── מילים קצרות ─────────────────────────────────────────────────────────────────────────────────
/** «24.10» — ושנה רק כשאינה השנה הנוכחית. */
export function dueShort(iso: string, today: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}${y !== today.slice(0, 4) ? `.${y}` : ''}`;
}

/** «היום» · «מחר» · «עוד 5 ימים» · «באיחור 6 ימים». */
export function dueRelative(days: number): string {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === 2) return 'עוד יומיים';
  if (days > 0) return `עוד ${days} ימים`;
  if (days === -1) return 'באיחור יום';
  if (days === -2) return 'באיחור יומיים';
  return `באיחור ${-days} ימים`;
}

/** «היום» · «אתמול» · «לפני 3 ימים» · «לפני שבועיים» · «ב-12.09.2026». */
export function agoText(iso: string, today: string): string {
  const days = daysTo(iso.slice(0, 10), today) * -1;
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days === 2) return 'לפני יומיים';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return 'לפני שבוע';
  if (days < 21) return 'לפני שבועיים';
  if (days < 31) return `לפני ${Math.floor(days / 7)} שבועות`;
  return `ב-${dmy(iso)}`;
}

/** הקליטה האחרונה משע״ם — כולל קריאת 154 מיישור הקו. */
export function lastShaamUpdate(sources: Pick<SourceSummary, 'uploadedAt'>[]): string | undefined {
  return sources.reduce<string | undefined>((max, s) => (s.uploadedAt && (!max || s.uploadedAt > max) ? s.uploadedAt : max), undefined);
}

// ── «עונת הדוחות» — מחובות ההגשה שנקלטו משע״ם (250) ───────────────────────────────────────────────
// ‼ רק מה שהנתונים אומרים: הוגש (לפי שע״ם) · בקשה פתוחה אצלי · בקשה פתוחה אצל הלקוח · בלי בקשה פתוחה.
//   אין «מוכן לחתימה» — אין לו מקור. בקשה פתוחה שאינה ברשימת העבודות (לקוח שלא נטען) — «אחר», לא ניחוש.
export type SeasonPart = 'filed' | 'mine' | 'client' | 'noRequest' | 'other';
export const SEASON_LABEL: Record<SeasonPart, string> = {
  filed: 'הוגשו', mine: 'אצלי', client: 'אצל הלקוח', noRequest: 'בלי בקשה פתוחה', other: 'אחר',
};
export const SEASON_ORDER: SeasonPart[] = ['filed', 'mine', 'client', 'noRequest', 'other'];

export interface Season { year: number; total: number; counts: Record<SeasonPart, number> }

const counted = (o: Obligation) => o.kind === 'annual' && o.required !== false && !['needs_review', 'dismissed', 'context'].includes(o.state);
const isFiled = (o: Obligation) => o.shaamStatus === 'filed' || o.state === 'filed_per_shaam' || o.state === 'history' || !!o.filedOn;

export function seasonPartOf(o: Obligation, bucketOfStep: (stepId: string) => WorkRow['bucket'] | undefined): SeasonPart {
  if (isFiled(o)) return 'filed';
  if (!o.stepId || !stepIsOpen(o.stepStatus)) return 'noRequest';
  const b = bucketOfStep(o.stepId);
  return b === 'mine' ? 'mine' : b === 'client' ? 'client' : 'other';
}

/** השנה האחרונה שיש בה חובות דוח שנתי; בלי חובות כאלה — null (הכרטיס לא מוצג). */
export function seasonOf(obligations: Obligation[], bucketOfStep: (stepId: string) => WorkRow['bucket'] | undefined): Season | null {
  const annual = obligations.filter(counted);
  const years = annual.map(o => Number(o.yearShown)).filter(Number.isFinite);
  if (!years.length) return null;
  const year = Math.max(...years);
  const counts: Record<SeasonPart, number> = { filed: 0, mine: 0, client: 0, noRequest: 0, other: 0 };
  const ofYear = annual.filter(o => Number(o.yearShown) === year);
  for (const o of ofYear) counts[seasonPartOf(o, bucketOfStep)]++;
  return { year, total: ofYear.length, counts };
}
