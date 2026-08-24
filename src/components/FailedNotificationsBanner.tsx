// ─── באנר: התראות פנימיות שנכשלו ────────────────────────────────────────────
// אותה שפה ויזואלית של באנרי הכשל בצינור ההצעות (alert alert-warning).
// "הבנתי" מסתיר את מה שנראה — התראה חדשה שתיכשל תחזיר את הבאנר.

import { useState } from 'react';
import { emailKindLabel } from '../types/emailActivity';
import type { FailedNotification } from '../hooks/useFailedNotifications';

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

  return (
    <div className="alert alert-warning" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div style={{ fontWeight: 600 }}>התראות פנימיות נכשלו ולא נשלחו אליך במייל ({pending.length}):</div>
      {pending.map(f => (
        <div key={f.id} style={{ fontSize: 12.5 }}>
          • {emailKindLabel(`notify_${f.kind}`)}
          {f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString('he-IL')}` : ''}
          {f.error ? ` - ${f.error}` : ''}
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>הבנתי</button>
      </div>
    </div>
  );
}
