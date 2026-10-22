// ─── «הפעל הכול» — מה ירוץ, למי, ומה חסום (269/270) ─────────────────────────────
// ‼ גיא (21.10.2026): «לחיצה אחת, והוא ירוץ גם בשע״ם וגם בביטוח לאומי לשניהם».
// נגזר כאן, טהור, מאותן נגזרות של הכפתורים הבודדים במרכז הייצוג — אותן הגשות
// (repSubmissions), אותה הכרעה «מה הצעד» (shaamRepresentationAction /
// niRepresentationAction), ואותו קלט לעובד (repAutomationInputs). «הפעל הכול» לעולם
// לא מריץ משהו שהכפתור הבודד לא היה מריץ באותו רגע.
// ‼ רק הזנות (פתיחת בקשה בשע״ם, הזנת ייפוי כוח בב״ל) — לא שידור טופס חתום ולא בדיקות.

import type { Client, PersonRole, RepresentationRequest } from '../../types';
import type { AutomationJob } from '../../types/automation';
import { SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE } from '../../types/automation';
import { niPersons, niRepresentationOf, niRepresentationAction } from '../../utils/niPersons';
import { peopleFromClient, targetsOf } from '../../utils/repScope';
import { allDocumentsStamped } from '../../utils/repDocuments';
import { shaamRepresentationAction } from '../taxFile/shaamRepresentationAction';
import { shaamSystemsOf, SHAAM_SYSTEM_SCREEN_LABELS } from './shaamRepresentation';
import { repSubmissions, shaamEnteredAt } from './repPreparation';
import { shaamCreateInput, niCreateInput } from './repAutomationInputs';

export type RunAllAuthority = 'shaam' | 'btl';

export interface RunAllItem {
  key: string;
  authority: RunAllAuthority;
  actionType: string;
  /** «ליאת ברנשטיין · מס הכנסה, מע"מ» */
  label: string;
  /** הקלט לעובד, או למה אי אפשר להריץ עכשיו (חסר נתון בכרטיס). */
  input?: Record<string, unknown>;
  blocked?: string;
  /** מזהה האדם/ההגשה במשימה — אותו מפתח שהכפתור הבודד מסנן לפיו. */
  who: string;
}

export function runAllPlan(
  request: RepresentationRequest,
  client: Client,
  spouseClient?: Client,
): RunAllItem[] {
  const items: RunAllItem[] = [];
  const exec = request.execution ?? {};
  const people = peopleFromClient(client);
  const sentToShaam = ['awaiting_authorities', 'active'].includes(request.status);
  const stamped = allDocumentsStamped(request) || sentToShaam;

  repSubmissions(request, client).forEach((sub, i) => {
    if (shaamSystemsOf(sub).length === 0) return;
    if (shaamEnteredAt(exec, sub.key, i === 0)) return;
    const tracking = exec.shaam?.[sub.key];
    const action = shaamRepresentationAction(request.status, tracking, stamped);
    if (action?.kind !== 'create' || action.disabled) return;
    const built = shaamCreateInput(request, client, sub, people.married, tracking);
    items.push({
      key: `shaam:${sub.key}`,
      authority: 'shaam',
      actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
      label: `${sub.personName} · ${shaamSystemsOf(sub).map(s => SHAAM_SYSTEM_SCREEN_LABELS[s]).join(', ')}`,
      who: sub.key,
      ...(built.ok ? { input: built.input } : { blocked: built.error }),
    });
  });

  // ‼ אותו כלל «עבור מי» של מרכז הייצוג: בן/בת זוג רק אצל נשוי, או מסלול שכבר התחיל (237).
  const niTargets = targetsOf(client.authorityRepresentations, 'nationalInsurance');
  const niExec = { client: exec.nationalInsurance ?? {}, spouse: exec.nationalInsuranceSpouse ?? {} };
  const spouseStarted = !!(niExec.spouse.enteredAt || niExec.spouse.referenceNumber || niExec.spouse.confirmedAt);
  const roles: PersonRole[] = (['client', 'spouse'] as PersonRole[]).filter(r =>
    niTargets.includes(r) && (r === 'client' || client.familyStatus === 'married' || spouseStarted));
  for (const role of roles) {
    const person = niPersons(client, spouseClient).find(p => p.role === role);
    if (!person) continue;
    const line = niRepresentationOf(person, client, spouseClient, niExec);
    if (niRepresentationAction(person, client, line, niExec[role])?.kind !== 'enter_btl') continue;
    const built = niCreateInput(client, role, spouseClient);
    items.push({
      key: `btl:${role}`,
      authority: 'btl',
      actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE,
      label: person.name,
      who: role,
      ...(built.ok ? { input: built.input } : { blocked: built.error }),
    });
  }
  return items;
}

// ─── הרשימה החיה: שורה לכל רשות×אדם, עם המצב שלה עכשיו ─────────────────────────
// ‼ גיא (21.10.2026): «רשימה אחת קצרה, עם מצב חי לכל אדם». המצב נגזר מהמשימות בשרת
// (automation_jobs) ומה«המשך» הממתין (270) — לא ממה שהמסך זוכר מהלחיצה. לכן לחיצה שנייה
// לא שולחת שוב מי שכבר בדרך או שכבר הוזן (272 שומר גם בשרת).

export type RunAllRowState = 'idle' | 'blocked' | 'queued' | 'running' | 'stopped' | 'failed' | 'done';

export interface RunAllRow {
  key: string;
  authority: RunAllAuthority;
  actionType: string;
  who: string;
  /** «שע״ם · ליאת» */
  label: string;
  /** לרמז (title): «מס הכנסה, מע"מ» */
  hint?: string;
  state: RunAllRowState;
  /** «בקשה 2026590050» · «אסמכתא 75791137» · הסיבה לעצירה/לחסימה */
  detail?: string;
  input?: Record<string, unknown>;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;
const OPEN = new Set(['queued', 'running', 'needs_human']);

export function runAllRows(
  request: RepresentationRequest,
  client: Client,
  jobs: AutomationJob[],
  waiting: { actionType: string; input: Record<string, unknown> }[],
  spouseClient?: Client,
): RunAllRow[] {
  const exec = request.execution ?? {};
  const plan = new Map(runAllPlan(request, client, spouseClient).map(i => [i.key, i]));
  const whoOf = (input: Record<string, unknown> | undefined) => String(input?.submissionKey ?? input?.role ?? '');
  const latest = (actionType: string, who: string) => jobs
    .filter(j => j.actionType === actionType && whoOf(j.input) === who)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  const isWaiting = (actionType: string, who: string) => waiting.some(f => f.actionType === actionType && whoOf(f.input) === who);

  const live = (actionType: string, who: string): Pick<RunAllRow, 'state' | 'detail'> | null => {
    const j = latest(actionType, who);
    if (j && OPEN.has(j.status)) {
      if (j.status === 'needs_human') return { state: 'stopped', detail: j.needsHuman || 'ממתין להחלטה שלך' };
      return { state: j.status === 'running' ? 'running' : 'queued' };
    }
    if (isWaiting(actionType, who)) return { state: 'queued' };
    return null;
  };

  const rows: RunAllRow[] = [];
  repSubmissions(request, client).forEach((sub, i) => {
    if (shaamSystemsOf(sub).length === 0) return;
    const key = `shaam:${sub.key}`;
    const base = {
      key, authority: 'shaam' as const, actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, who: sub.key,
      label: `שע״ם · ${firstName(sub.personName)}`,
      hint: shaamSystemsOf(sub).map(s => SHAAM_SYSTEM_SCREEN_LABELS[s]).join(', '),
    };
    const now = live(base.actionType, sub.key);
    if (now) { rows.push({ ...base, ...now }); return; }
    const j = latest(base.actionType, sub.key);
    const reqNo = exec.shaam?.[sub.key]?.requestNumber
      ?? (j?.status === 'succeeded' ? String(j.progress?.requestNumber ?? j.result?.requestNumber ?? '') : '');
    if (shaamEnteredAt(exec, sub.key, i === 0) || j?.status === 'succeeded') {
      rows.push({ ...base, state: 'done', detail: reqNo ? `בקשה ${reqNo}` : 'הוזן' });
      return;
    }
    const p = plan.get(key);
    if (!p) return;
    rows.push(p.input
      ? { ...base, input: p.input, state: j?.status === 'failed' ? 'failed' : 'idle', detail: j?.status === 'failed' ? (j.errorDetail || undefined) : undefined }
      : { ...base, state: 'blocked', detail: p.blocked });
  });

  const niTargets = targetsOf(client.authorityRepresentations, 'nationalInsurance');
  const niExec = { client: exec.nationalInsurance ?? {}, spouse: exec.nationalInsuranceSpouse ?? {} };
  const spouseStarted = !!(niExec.spouse.enteredAt || niExec.spouse.referenceNumber || niExec.spouse.confirmedAt);
  for (const role of ['client', 'spouse'] as PersonRole[]) {
    if (!niTargets.includes(role) || (role === 'spouse' && client.familyStatus !== 'married' && !spouseStarted)) continue;
    const person = niPersons(client, spouseClient).find(p => p.role === role);
    if (!person) continue;
    const base = {
      key: `btl:${role}`, authority: 'btl' as const, actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE, who: role,
      label: `ב״ל · ${firstName(person.name)}`,
    };
    const now = live(base.actionType, role);
    if (now) { rows.push({ ...base, ...now }); continue; }
    const j = latest(base.actionType, role);
    const ref = niExec[role].referenceNumber
      ?? (j?.status === 'succeeded' ? String(j.result?.referenceNumber ?? '') : '');
    if (niExec[role].referenceNumber || niExec[role].enteredAt || niExec[role].confirmedAt || j?.status === 'succeeded') {
      rows.push({ ...base, state: 'done', detail: ref ? `אסמכתא ${ref}` : 'הוזן' });
      continue;
    }
    const p = plan.get(base.key);
    if (!p) continue;
    rows.push(p.input
      ? { ...base, input: p.input, state: j?.status === 'failed' ? 'failed' : 'idle', detail: j?.status === 'failed' ? (j.errorDetail || undefined) : undefined }
      : { ...base, state: 'blocked', detail: p.blocked });
  }
  return rows;
}

/** מה ירוץ בלחיצה: רק שורות שלא בדרך ולא הוזנו. */
export const runnableRows = (rows: RunAllRow[]) => rows.filter(r => (r.state === 'idle' || r.state === 'failed') && r.input);
