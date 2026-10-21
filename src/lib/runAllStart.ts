// ─── «הפעל הכול» — הפעלת שרשרת של משימות מאותו סוג, טהורה עם תלויות מוזרקות ─────
// ‼ הראשונה בסוג נפתחת בדיוק כמו בכפתור הבודד (startAutomationJob — כולל הסירוב
// לנסות שוב בלי אישור אחרי שפעולה כבר נגעה ברשות, 196). כל השאר — «המשך» (270)
// אחרי הקודמת. ‼ משימה פתוחה של **אדם אחר** מאותו סוג לא מבוטלת לעולם: מצטרפים
// אחריה. לחיצה אחת ⇒ לכל היותר משימה חדשה אחת לכל פריט.

import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';
import type { StartJobDeps, StartJobResult } from './automationJobStart';
import type { AfterResult } from './automationFollowups';

export interface RunAllStep {
  key: string;
  actionType: string;
  input: Record<string, unknown>;
  who: string;
}

export type RunAllOutcome =
  | { key: string; kind: 'started' }
  | { key: string; kind: 'waiting' }
  | { key: string; kind: 'already' }
  | { key: string; kind: 'needs_confirm' }
  | { key: string; kind: 'error'; error: string };

export interface RunAllDeps {
  start: (args: { clientId: string; actionType: string; input: Record<string, unknown> }) => Promise<StartJobResult>;
  fetchLatest: StartJobDeps['fetchLatest'];
  after: (clientId: string, actionType: string, input: Record<string, unknown>, afterJobId: string) => Promise<AfterResult>;
}

export const jobWho = (job: AutomationJob | null | undefined): string =>
  String(job?.input?.submissionKey ?? job?.input?.role ?? '');

/** שרשרת אחת — כל הצעדים מאותו סוג פעולה, לפי הסדר. */
export async function runChain(clientId: string, steps: RunAllStep[], deps: RunAllDeps): Promise<RunAllOutcome[]> {
  const out: RunAllOutcome[] = [];
  let prev: string | null = null;
  for (const s of steps) {
    try {
      if (!prev) {
        const latest = await deps.fetchLatest(clientId, s.actionType);
        if (latest.error) { out.push({ key: s.key, kind: 'error', error: latest.error }); continue; }
        const open = latest.job && OPEN_AUTOMATION_STATUSES.has(latest.job.status) ? latest.job : null;
        if (open && jobWho(open) !== s.who) {
          // אדם אחר תופס את הסוג הזה עכשיו — מצטרפים אחריו, לא מבטלים אותו.
          prev = open.id;
        } else {
          const r = await deps.start({ clientId, actionType: s.actionType, input: s.input });
          if (r.job) prev = r.job.id;
          if (r.code === 'created') out.push({ key: s.key, kind: 'started' });
          else if (r.code === 'already_running') out.push({ key: s.key, kind: 'already' });
          else if (r.code === 'requires_acknowledgement') out.push({ key: s.key, kind: 'needs_confirm' });
          else out.push({ key: s.key, kind: 'error', error: r.error ?? r.code });
          continue;
        }
      }
      const a = await deps.after(clientId, s.actionType, s.input, prev!);
      if (!a.ok) { out.push({ key: s.key, kind: 'error', error: a.error }); continue; }
      if ('job' in a) { prev = a.job.id; out.push({ key: s.key, kind: 'started' }); }
      else out.push({ key: s.key, kind: 'waiting' });
    } catch (e) {
      out.push({ key: s.key, kind: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** מקבץ לפי סוג פעולה, שומר על הסדר בתוך כל סוג. */
export function chainsOf(steps: RunAllStep[]): RunAllStep[][] {
  const by = new Map<string, RunAllStep[]>();
  for (const s of steps) by.set(s.actionType, [...(by.get(s.actionType) ?? []), s]);
  return [...by.values()];
}
