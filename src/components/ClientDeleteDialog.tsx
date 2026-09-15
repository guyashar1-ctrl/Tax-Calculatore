// ─── מה לעשות עם לקוח שלא רוצים לראות יותר ──────────────────────────────────
// ‼ מחיקת לקוח גוררת מחיקה במסד (CASCADE) של המשימות, המסמכים, הדוחות השנתיים
// וההתקשרות על כל שלבי הקליטה. משפט כללי כמו "המשימות שלו יימחקו" לא עוצר אף
// אחד — מספר קונקרטי כן. לכן הדיאלוג סופר בפועל לפני שהוא שואל, ומציע קודם כל
// את הארכיון: הסתרה בלי לאבד שום דבר.
//
// ‼ (169) המספרים מגיעים מ-delete_client_preview — אותה לוגיקה בדיוק שמחיקה
// (delete_client) פועלת לפיה, ולא ספירה עצמאית טבלה-טבלה במסך. כך מה שנאמר
// למשתמש הוא מה שיקרה: הצעות פתוחות יבוטלו, בקשות ייצוג יימחקו, הצעה מאושרת
// תישאר (מנותקת), והתקשרות חיה דורשת אישור מפורש נוסף.

import { useEffect, useState } from 'react';
import type { Client, Task } from '../types';
import { supabase } from '../lib/supabase';
import Modal from './ui/Modal';

interface Props {
  client: Client;
  /** ‼ נספרות מהמסך ולא מהמסד — כדי שהמספר יתאים למה שרואים בטבלה */
  tasks: Task[];
  /** לא מסופק ⇒ הכרטיס כבר בארכיון, ואין מה להציע */
  onArchive?: () => void | Promise<void>;
  /** force — המשתמש אישר במפורש מחיקה למרות התקשרות חיה */
  onDelete: (opts: { force: boolean }) => void;
  onCancel: () => void;
}

interface Preview {
  documents: number;
  onboarding_steps: number;
  annual_reports: number;
  requests: number;
  emails: number;
  quotations_open: number;
  quotations_approved: number;
  quotations_other: number;
  live_engagements: number;
  leads: number;
  spouse_client_id: string | null;
  spouse_name: string | null;
}

const EMPTY: Preview = {
  documents: 0, onboarding_steps: 0, annual_reports: 0, requests: 0, emails: 0,
  quotations_open: 0, quotations_approved: 0, quotations_other: 0,
  live_engagements: 0, leads: 0, spouse_client_id: null, spouse_name: null,
};

export default function ClientDeleteDialog({ client, tasks, onArchive, onDelete, onCancel }: Props) {
  const [counts, setCounts] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [forceAck, setForceAck] = useState(false);

  const fullName = `${client.firstName} ${client.lastName}`.trim() || client.idNumber || 'הלקוח';
  const clientTasks = tasks.filter(t => t.clientId === client.id);
  const openTasks = clientTasks.filter(t => t.status !== 'done').length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('delete_client_preview', { p_client_id: client.id });
        if (cancelled) return;
        const res = data as (Preview & { ok: boolean }) | null;
        if (error || !res?.ok) throw new Error(error?.message ?? 'preview failed');
        setCounts(res);
      } catch {
        if (!cancelled) { setFailed(true); setCounts(EMPTY); }
      }
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const c = counts;
  const hasLiveEngagement = !!c && c.live_engagements > 0;
  const destroyed = c ? [
    clientTasks.length > 0 && `${clientTasks.length} משימות${openTasks > 0 ? ` (מתוכן ${openTasks} פתוחות)` : ''}`,
    c.documents > 0 && `${c.documents} מסמכים (כולל הקבצים עצמם)`,
    c.onboarding_steps > 0 && `תהליך קליטה - ${c.onboarding_steps} שלבים`,
    c.annual_reports > 0 && `${c.annual_reports} דוחות שנתיים`,
    c.requests > 0 && `${c.requests} בקשות ייצוג`,
    c.live_engagements > 0 && `${c.live_engagements} התקשרות פעילה`,
  ].filter(Boolean) as string[] : [];

  const cancelledLines = c ? [
    c.quotations_open > 0 && `${c.quotations_open} הצעות מחיר שטרם אושרו (טיוטה / נשלחה) - יסומנו כבוטלו`,
  ].filter(Boolean) as string[] : [];

  const detached = c ? [
    c.quotations_approved > 0 && `${c.quotations_approved} הצעות מחיר מאושרות (יישארו כהיסטוריה, בלי לקוח)`,
    c.quotations_other > 0 && `${c.quotations_other} הצעות מחיר שבוטלו / פג תוקפן`,
    c.emails > 0 && `${c.emails} מיילים`,
    c.leads > 0 && `${c.leads} לידים`,
    !!c.spouse_client_id && `הקישור לכרטיס בן/בת הזוג${c.spouse_name ? ` "${c.spouse_name}"` : ''} יוסר (הכרטיס שלו/ה נשאר)`,
  ].filter(Boolean) as string[] : [];

  async function handleArchive() {
    if (!onArchive) return;
    setBusy(true);
    setArchiveError(null);
    try {
      await onArchive();
    } catch {
      // כישלון שקט כאן היה נראה כאילו הארכיון הצליח, והכרטיס היה נשאר ברשימה
      setArchiveError('ההעברה לארכיון נכשלה. הכרטיס נשאר כמו שהיה.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`מה לעשות עם ״${fullName}״?`}
      onClose={onCancel}
      width={480}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel} data-autofocus>
            ביטול
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-danger"
            disabled={busy || !counts || failed || (hasLiveEngagement && !forceAck)}
            onClick={() => onDelete({ force: hasLiveEngagement })}
          >
            מחק הכל לצמיתות
          </button>
          {onArchive && (
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={busy}
              onClick={() => { void handleArchive(); }}
            >
              {busy ? 'רגע…' : 'העבר לארכיון'}
            </button>
          )}
        </>
      }
    >
      {!counts && !failed && (
        <p className="ui-confirm-text">בודק מה קשור לכרטיס…</p>
      )}

      {failed && (
        <p className="ui-confirm-text" style={{ color: 'var(--err)' }}>
          לא הצלחתי לבדוק מה קשור לכרטיס. מחיקה כאן עלולה למחוק דברים שלא ידעת עליהם -
          עדיף להעביר לארכיון ולבדוק אחר כך.
        </p>
      )}

      {counts && !failed && (
        <>
          {onArchive && (
            <p className="ui-confirm-text" style={{ marginBottom: '.9rem' }}>
              <strong>ארכיון</strong> מסתיר את הכרטיס מרשימת הלקוחות ולא מוחק שום דבר.
              זו הדרך הרגילה להיפרד מלקוח.
            </p>
          )}

          <div style={{
            border: '1px solid var(--hairline-2)', borderRadius: 8,
            padding: '.7rem .85rem', fontSize: 'var(--fs-13)',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--err)', marginBottom: '.35rem' }}>
              מחיקה לצמיתות תמחק גם:
            </div>
            {destroyed.length === 0 ? (
              <div style={{ color: 'var(--ink-2)' }}>את כרטיס הלקוח בלבד - אין לו נתונים קשורים.</div>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: '1.1rem', color: 'var(--ink-2)' }}>
                {destroyed.map(line => <li key={line}>{line}</li>)}
              </ul>
            )}

            {cancelledLines.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: '.7rem', marginBottom: '.35rem' }}>
                  יבוטלו:
                </div>
                <ul style={{ margin: 0, paddingInlineStart: '1.1rem', color: 'var(--ink-2)' }}>
                  {cancelledLines.map(line => <li key={line}>{line}</li>)}
                </ul>
              </>
            )}

            {detached.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: '.7rem', marginBottom: '.35rem' }}>
                  יישארו במערכת, רק ינותקו ממנו:
                </div>
                <ul style={{ margin: 0, paddingInlineStart: '1.1rem', color: 'var(--ink-3)' }}>
                  {detached.map(line => <li key={line}>{line}</li>)}
                </ul>
              </>
            )}
          </div>

          {hasLiveEngagement && (
            <label style={{
              display: 'flex', gap: '.5rem', alignItems: 'flex-start',
              marginTop: '.8rem', fontSize: 'var(--fs-13)', color: 'var(--err)',
            }}>
              <input
                type="checkbox"
                checked={forceAck}
                onChange={e => setForceAck(e.target.checked)}
                style={{ marginTop: '.15rem' }}
              />
              <span>
                ללקוח יש התקשרות פעילה על הצעה מאושרת. אני מבין/ה שההתקשרות תימחק
                וההצעה המאושרת תישאר בלי לקוח, ורוצה למחוק בכל זאת.
              </span>
            </label>
          )}

          <p className="ui-confirm-text" style={{ marginTop: '.8rem', color: 'var(--ink-3)' }}>
            מחיקה אינה הפיכה.
          </p>

          {archiveError && (
            <p className="ui-confirm-text" style={{ color: 'var(--err)' }}>{archiveError}</p>
          )}
        </>
      )}
    </Modal>
  );
}
