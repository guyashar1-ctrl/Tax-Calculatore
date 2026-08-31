// ─── כרטיס בדיקה אחד — יסוד חוזר להרתך הפיתוח של "בדיקות" ───────────────────
// כל primitive (dev.test_automation, shaam.detect, shaam.check_auth, ...)
// הוא כרטיס אחד מהצורה הזאת. לא ידע ספציפי לשע״ם כאן — זה בתוך renderSuccess
// שכל קורא מספק לעצמו.

import type { ReactNode } from 'react';
import type { Client } from '../../../types';
import { useAutomationJob } from '../../../hooks/useAutomationJobs';
import { AUTOMATION_JOB_STATUS_LABELS } from '../../../types/automation';
import type { AutomationJobStatus } from '../../../types/automation';
import { SkeletonRow } from '../../ui/States';

const ALERT_CLASS: Record<AutomationJobStatus, string> = {
  queued: 'alert alert-info',
  running: 'alert alert-info',
  needs_human: 'alert alert-warning',
  succeeded: 'alert alert-success',
  failed: 'alert alert-error',
  cancelled: 'alert alert-info',
};

/** שעה:דקה מקומית — התוצאה חוזרת תוך שניות, תאריך מלא לא מוסיף מידע. */
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export interface ExtraRunAction {
  label: string;
  input: Record<string, unknown>;
  title?: string;
}

interface Props {
  client: Client;
  actionType: string;
  title: string;
  description: string;
  /** "מצב פיתוח" — לכל primitive עד שהוא מורכב לפעולת מוצר אמיתית. */
  devBadge?: boolean;
  runLabel?: string;
  runInput?: Record<string, unknown>;
  /** כפתורים נוספים על אותו action_type (למשל "בדיקת נתיב כישלון"). */
  extraActions?: ExtraRunAction[];
  /** תצוגה ספציפית לתוצאה — ברירת מחדל: JSON גולמי, קריא אבל לא יפה. */
  renderSuccess?: (result: Record<string, unknown> | undefined) => ReactNode;
}

export default function AutomationCheckCard({
  client, actionType, title, description, devBadge, runLabel = 'הרץ', runInput = {}, extraActions, renderSuccess,
}: Props) {
  const { job, loading, error, busy, run, cancel } = useAutomationJob(client.id, actionType);
  const open = job && ['queued', 'running', 'needs_human'].includes(job.status);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {devBadge && (
          <span className="checks-dev-badge" title="primitive פיתוח — עדיין לא מורכב לפעולת מוצר">
            מצב פיתוח
          </span>
        )}
      </div>
      <div className="card-body checks-action-body">
        <p className="checks-action-hint">{description}</p>

        {loading && <SkeletonRow widths={[60, 30]} />}

        {!loading && error && <div className="alert alert-error">{error}</div>}

        {!loading && !error && job && (
          <div className={ALERT_CLASS[job.status]}>
            <strong>{AUTOMATION_JOB_STATUS_LABELS[job.status]}</strong>
            {job.status === 'running' && ' · העובד המקומי מריץ כעת'}
            {job.status === 'queued' && ' · ממתין שעובד מקומי יתפוס'}
            {job.status === 'succeeded' && (
              <div className="checks-result">
                {renderSuccess ? renderSuccess(job.result) : <code>{JSON.stringify(job.result ?? {})}</code>}
                {job.finishedAt && <span className="checks-result-time"> · {clockTime(job.finishedAt)}</span>}
              </div>
            )}
            {job.status === 'failed' && (
              <div className="checks-result">
                {job.errorDetail || 'המשימה נכשלה'}
                {job.errorCode && <code className="checks-error-code">{job.errorCode}</code>}
              </div>
            )}
            {job.status === 'needs_human' && (
              <div className="checks-result">{job.needsHuman || 'דרוש אישור ידני'}</div>
            )}
          </div>
        )}

        {!loading && !error && !job && <div className="alert alert-info">עוד לא הורצה על הלקוח הזה.</div>}

        <div className="checks-action-buttons">
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !!open} onClick={() => void run(runInput)}>
            {open ? 'רץ...' : runLabel}
          </button>
          {extraActions?.map((a) => (
            <button
              key={a.label}
              type="button"
              className="ui-btn ui-btn-ghost"
              disabled={busy || !!open}
              onClick={() => void run(a.input)}
              title={a.title}
            >
              {a.label}
            </button>
          ))}
          {job && job.status === 'queued' && (
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => void cancel()}>
              בטל
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
