// ─── בדיקות — מרכז עבודה זמני ליסוד האוטומציה (flags.checksTab) ─────────────
// docs/PIVO-AUTOMATION-FOUNDATION.html §A: זו לשונית סקאפולד מאחורי דגל,
// כדי שאפשר יהיה לבנות ולראות את הצנרת לפני שמחליטים איפה התוצאות שלה
// יושבות בקביעות (המועמד המוביל: AlignmentStatusView — לא הוחלט כאן).
//
// ‼ אבן דרך 1: הפעולה היחידה שרצה בפועל היא dev.test_automation — בדיקת
// צנרת בלבד. שום דבר כאן לא נוגע בשע״ם. תווית "מצב פיתוח" חייבת להישאר
// גלויה כל עוד זה נכון, כדי שאף אחד לא יבלבל תוצאה כאן עם בדיקה אמיתית.

import type { Client } from '../../types';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { DEV_STUB_ACTION_TYPE, AUTOMATION_JOB_STATUS_LABELS } from '../../types/automation';
import type { AutomationJobStatus } from '../../types/automation';
import { SkeletonRow } from '../ui/States';

interface Props {
  client: Client;
}

/** שעה:דקה מקומית — התוצאה חוזרת תוך שניות, תאריך מלא לא מוסיף מידע. */
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

const ALERT_CLASS: Record<AutomationJobStatus, string> = {
  queued: 'alert alert-info',
  running: 'alert alert-info',
  needs_human: 'alert alert-warning',
  succeeded: 'alert alert-success',
  failed: 'alert alert-error',
  cancelled: 'alert alert-info',
};

export default function ChecksTab({ client }: Props) {
  const { job, loading, error, busy, run, cancel } = useAutomationJob(client.id, DEV_STUB_ACTION_TYPE);
  const open = job && ['queued', 'running', 'needs_human'].includes(job.status);

  return (
    <div className="cw-tabpanel checks-tab">
      <div className="checks-tab-intro">
        <h2 className="card-title">בדיקות</h2>
        <p>
          מרכז עבודה זמני ליסוד האוטומציה — כאן ייבנו בהמשך בדיקות אוטומטיות מול
          שע״ם, ביטוח לאומי ורשויות נוספות. הלשונית הזו זמנית ומוצגת רק אצלך.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">הוצאת אישור ניכוי מס במקור</span>
          <span className="checks-dev-badge" title="בשלב הזה זו בדיקת צנרת בלבד — לא בדיקה אמיתית מול שע״ם">
            מצב פיתוח
          </span>
        </div>
        <div className="card-body checks-action-body">
          <p className="checks-action-hint">
            זו הפעולה הראשונה שהאוטומציה תבצע בפועל. כרגע ההרצה מדמה רק את
            הצנרת — יצירת המשימה, תפיסתה על-ידי העובד המקומי, וחזרת התוצאה
            לכאן. אין כאן חיבור לשע״ם.
          </p>

          {loading && <SkeletonRow widths={[60, 30]} />}

          {!loading && error && <div className="alert alert-error">{error}</div>}

          {!loading && !error && job && (
            <div className={ALERT_CLASS[job.status]}>
              <strong>{AUTOMATION_JOB_STATUS_LABELS[job.status]}</strong>
              {job.status === 'running' && ' · העובד המקומי מריץ כעת'}
              {job.status === 'queued' && ' · ממתין שעובד מקומי יתפוס'}
              {job.status === 'succeeded' && job.result && (
                <div className="checks-result">
                  {typeof job.result.message === 'string' ? job.result.message : 'הצנרת הושלמה בהצלחה'}
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

          {!loading && !error && !job && (
            <div className="alert alert-info">עוד לא הורצה על הלקוח הזה.</div>
          )}

          <div className="checks-action-buttons">
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={busy || !!open}
              onClick={() => void run({})}
            >
              {open ? 'רץ...' : 'הרץ בדיקת צנרת'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              disabled={busy || !!open}
              onClick={() => void run({ forceFail: true })}
              title="יוצר משימה שנועדה להיכשל בכוונה — לבדיקת נתיב השגיאה"
            >
              בדיקת נתיב כישלון
            </button>
            {job && job.status === 'queued' && (
              <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => void cancel()}>
                בטל
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
