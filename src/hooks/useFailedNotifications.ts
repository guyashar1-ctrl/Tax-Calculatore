import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * התראות פנימיות שנכשלו סופית. פונקציית השרת מנסה לשלוח כל התראה שלוש פעמים
 * ואז מפסיקה — ועד היום השורות האלה פשוט שקעו בטבלה. הרו"ח היה בטוח שהוא מקבל
 * מייל על כל תזוזה אצל הלקוח, ולא ידע שהתראה מסוימת מעולם לא יצאה.
 * שדה error מתאפס בשליחה מוצלחת, ולכן error שאינו ריק = כשל שנשאר.
 */
export interface FailedNotification {
  id: string;
  kind: string;
  error: string;
  createdAt: string;
}

export function useFailedNotifications(userId: string | undefined) {
  const [failures, setFailures] = useState<FailedNotification[]>([]);

  useEffect(() => {
    if (!userId) { setFailures([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('accountant_notifications')
        .select('id,kind,error,created_at')
        .not('error', 'is', null)
        .gte('attempts', 3)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled || error) return;
      setFailures((data ?? []).map(r => ({
        id: String(r.id),
        kind: String(r.kind ?? ''),
        error: String(r.error ?? ''),
        createdAt: String(r.created_at ?? ''),
      })));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return failures;
}
