// ─── באנר: התראות פנימיות שלא יצאו (או שלא ידוע אם יצאו) ────────────────────
// אותה שפה ויזואלית של באנרי הכשל בצינור ההצעות (alert alert-warning).
// "הבנתי" מסתיר את מה שנראה — התראה חדשה שתיכשל תחזיר את הבאנר.
// ‼ שורה אחת מעל כל עמוד: הפירוט נפתח לפי צורך, והסיבה בעברית — תשובת הספק
// הגולמית (JSON באנגלית) לא אומרת לרו"ח כלום ותפסה חצי מסך.
// ‼ «לא ידוע אם יצאה» (ספק הדואר לא החזיר תשובה ברורה גם בניסיון האחרון) אינה
// «לא נשלחה»: ייתכן שהמייל בתיבה. היא נספרת בנפרד, עם הצעד הבטוח.

import { useState } from 'react';
import {
  emailKindLabel, unknownEmailCause, isUnknownNotificationError, failedNotificationsHeadline,
} from '../types/emailActivity';
import type { FailedNotification } from '../hooks/useFailedNotifications';
import { failureReasonText } from '../lib/providerErrorText';
import { NOTIFICATION_BY_KIND } from '../../supabase/functions/_shared/accountantNotifications.ts';

const DISMISSED_KEY = 'pivo_dismissed_failed_notifications';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** שם ההתראה — מהקטלוג (אותו שם כמו במסך ההגדרות), ואז מיומן המיילים. */
function notificationName(kind: string): string {
  return NOTIFICATION_BY_KIND[kind]?.label ?? emailKindLabel(`notify_${kind}`);
}

interface Props {
  failures: FailedNotification[];
}

export default function FailedNotificationsBanner({ failures }: Props) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const pending = failures.filter(f => !dismissed.includes(f.id));
  if (pending.length === 0) return null;

  function dismiss() {
    const ids = failures.map(f => f.id);
    setDismissed(ids);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch { /* העדפת תצוגה בלבד */ }
  }

  const unknown = pending.filter(f => isUnknownNotificationError(f.error));
  const failed = pending.filter(f => !isUnknownNotificationError(f.error));
  const reasonOf = (f: FailedNotification) => isUnknownNotificationError(f.error)
    ? unknownEmailCause(f.error)
    : failureReasonText(f.error);
  const reasons = [...new Set(pending.map(reasonOf))];

  return (
    <div className="alert alert-warning" role="status"
      style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{failedNotificationsHeadline(failed.length, unknown.length)}</span>
        {reasons.length === 1 && <span style={{ fontSize: 12.5 }}>· {reasons[0]}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>הבנתי</button>
      </div>
      {unknown.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          {unknown.length === 1
            ? 'ייתכן שהיא בתיבת הדואר של המשרד — כדאי לבדוק שם. המערכת לא תשלח אותה שוב לבד.'
            : 'ייתכן שהן בתיבת הדואר של המשרד — כדאי לבדוק שם. המערכת לא תשלח אותן שוב לבד.'}
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>אילו התראות</summary>
        {pending.map(f => (
          <div key={f.id} style={{ fontSize: 12.5 }}>
            • {notificationName(f.kind)}
            {f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString('he-IL')}` : ''}
            {isUnknownNotificationError(f.error) ? ' · לא ידוע אם יצאה' : ''}
            {reasons.length > 1 ? ` · ${reasonOf(f)}` : ''}
          </div>
        ))}
      </details>
    </div>
  );
}
