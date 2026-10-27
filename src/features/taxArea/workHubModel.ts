// 27.10.2026: the approved work hub reads the existing requests AND SHAAM obligations.
// It does not create requests, infer a wealth date, or equate office completion with filing.
import type { Client } from '../../types';
import type { WorkKind, WorkRow } from '../taxYear/taxWork';
import { daysTo } from '../taxYear/workMeta';
import { COPY_TEXT, copyState, obligationYear, sourceText, stepIsOpen, type Obligation } from '../shaamFiling/model';
import { dueGroupOf, DUE_GROUPS, KIND_NAME, toOverview } from './workOverviewModel';

export type HubBucket = 'mine' | 'client' | 'other';
export interface HubRow {
  id: string; clientId: string; name: string; fileNumber: string; kind: WorkKind;
  title: string; period: string; year: number | null; asOfDate?: string;
  stepId?: string; work?: WorkRow; obligation?: Obligation;
  status: string; bucket: HubBucket; state: 'open' | 'filed' | 'done' | 'cancelled';
  dueDate?: string; dueKind?: string; days?: number; copyMissing: boolean;
}
export const HUB_KINDS = [
  { id: 'all', label: 'הכול' }, { id: 'annual', label: 'דוחות שנתיים' },
  { id: 'wealth', label: 'הצהרות הון' }, { id: 'estimate', label: 'הערכות מס' },
  { id: 'intake', label: 'קליטה והשלמת תיק' },
] as const;
export type HubKind = typeof HUB_KINDS[number]['id'];
export type HubResponsibility = 'all' | 'mine' | 'client';
export const topicForWork = (kind: WorkKind) => kind === 'annual' ? 'annualReturn' : kind === 'wealth' ? 'wealth' : kind === 'estimate' ? 'advances' : undefined;

export function hubRows(work: WorkRow[], obligations: Obligation[], clients: Client[], today: string): HubRow[] {
  const people = new Map(clients.map(c => [c.id, c]));
  const requests = toOverview(work, today);
  const used = new Set<string>();
  const result: HubRow[] = [];
  const person = (id: string, number = '') => {
    const c = people.get(id);
    return { name: `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'לקוח', fileNumber: number || c?.idNumber || '' };
  };
  for (const o of obligations) {
    if (!o.clientId || !people.has(o.clientId) || ['needs_review', 'dismissed', 'context'].includes(o.state)) continue;
    // Only an explicit server link joins the two sources. A matching year/name is not proof.
    const request = o.stepId ? requests.find(r => r.stepId === o.stepId && r.clientId === o.clientId && r.kind === o.kind) : undefined;
    if (request) used.add(request.stepId);
    const payload = request?.row.parent.payload as { asOfDate?: string } | undefined;
    // The current server decision wins. A retained historical filing date is not current filing status.
    const filed = o.state === 'history' || o.state === 'filed_per_shaam';
    const live = !!o.stepId && stepIsOpen(o.stepStatus);
    const bucket = request?.row.bucket;
    const asOfDate = o.kind === 'wealth' ? payload?.asOfDate : undefined;
    // A verified extension/official date in the work stays ahead of the reported SHAAM date.
    const dueDate = request?.dv.effectiveDue ?? o.legalDue ?? request?.dv.internalTarget ?? undefined;
    const dueKind = request?.dv.effectiveDue ? request.dueKind : o.legalDue ? 'מועד שנמסר בשע״ם · לא מאומת' : request?.dueKind;
    const copy = copyState(o);
    const period = o.kind === 'wealth' ? asOfDate ? `ליום ${asOfDate.split('-').reverse().join('.')}` : `${o.yearShown} · יום ההצהרה טרם אומת` : o.yearShown;
    result.push({ id: `filing:${o.id}`, clientId: o.clientId, ...person(o.clientId, o.fileNumber), kind: o.kind,
      title: KIND_NAME[o.kind], period, year: o.kind === 'wealth' ? asOfDate ? Number(asOfDate.slice(0, 4)) : null : obligationYear(o), asOfDate,
      stepId: o.stepId, work: request?.row, obligation: o,
      state: filed ? 'filed' : 'open', bucket: !live ? 'mine' : bucket === 'mine' || bucket === 'client' ? bucket : 'other',
      status: filed ? copy && ['missing', 'requested'].includes(copy) ? COPY_TEXT[copy] : 'הוגש לפי שע״ם'
        : bucket === 'done' ? 'הושלם במשרד · הגשה טרם אומתה' : bucket === 'cancelled' ? 'נדרש להגיש · הבקשה בוטלה'
          : live ? request?.row.next ?? 'בקשה פתוחה' : o.stepId ? 'נדרש להגיש · הבקשה נסגרה' : 'טרם נפתחה בקשה',
      dueDate: filed ? undefined : dueDate, dueKind, days: !filed && dueDate ? daysTo(dueDate, today) : undefined,
      copyMissing: filed && (copy === 'missing' || copy === 'requested') });
  }
  for (const r of requests) {
    if (used.has(r.stepId) || !people.has(r.clientId)) continue;
    const payload = r.row.parent.payload as { taxYear?: number; asOfDate?: string };
    result.push({ id: `work:${r.stepId}`, clientId: r.clientId, ...person(r.clientId), kind: r.kind,
      title: KIND_NAME[r.kind], period: r.period, year: r.kind === 'wealth' ? payload.asOfDate ? Number(payload.asOfDate.slice(0, 4)) : null : payload.taxYear ?? null,
      asOfDate: payload.asOfDate, stepId: r.stepId, work: r.row,
      state: r.row.bucket === 'done' ? 'done' : r.row.bucket === 'cancelled' ? 'cancelled' : 'open',
      bucket: r.row.bucket === 'mine' || r.row.bucket === 'client' ? r.row.bucket : 'other', status: r.row.next,
      dueDate: r.dueDate, dueKind: r.dueKind, days: r.days, copyMissing: false });
  }
  return result;
}
export function matchesHub(r: HubRow, kind: HubKind, q: string): boolean {
  return (kind === 'all' || r.kind === kind) && q.trim().split(/\s+/).every(w => `${r.name} ${r.fileNumber} ${r.title} ${r.period}`.includes(w));
}
export function visibleHub(rows: HubRow[], kind: HubKind, q: string, who: HubResponsibility) {
  return rows.filter(r => matchesHub(r, kind, q) && (r.state !== 'open' || who === 'all' || r.bucket === who || dueGroupOf(r) === 'overdue'));
}
export function groupedHub(rows: HubRow[]) {
  const open = rows.filter(r => r.state === 'open').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.name.localeCompare(b.name, 'he'));
  return DUE_GROUPS.map(g => ({ ...g, rows: open.filter(r => dueGroupOf(r) === g.id) })).filter(g => g.rows.length);
}
export const hubSource = (r: HubRow) => r.obligation ? sourceText(r.obligation) : r.work?.parent.payload?.work ? 'מועד מתוך העבודה בתיק' : '';

export interface HubView { q: string; who: HubResponsibility; lastId: string; action: 'open' | 'knowledge' | 'client'; closed: 'filed' | 'done' | 'cancelled' | null }
const VIEW_KEY = 'pivo.work-hub.view';
export function readHubView(): HubView {
  try { const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}'); return { q: typeof v.q === 'string' ? v.q : '', who: ['mine', 'client'].includes(v.who) ? v.who : 'all', lastId: typeof v.lastId === 'string' ? v.lastId : '', action: ['knowledge', 'client'].includes(v.action) ? v.action : 'open', closed: ['filed', 'done', 'cancelled'].includes(v.closed) ? v.closed : null }; } catch { return { q: '', who: 'all', lastId: '', action: 'open', closed: null }; }
}
export function saveHubView(v: HubView) { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* browsing still works */ } }
