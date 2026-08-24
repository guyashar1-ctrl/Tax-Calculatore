// ─── מה לעשות עם לקוח שלא רוצים לראות יותר ──────────────────────────────────
// ‼ מחיקת לקוח גוררת מחיקה במסד (CASCADE) של המשימות, המסמכים, הדוחות השנתיים
// וההתקשרות על כל שלבי הקליטה. משפט כללי כמו "המשימות שלו יימחקו" לא עוצר אף
// אחד — מספר קונקרטי כן. לכן הדיאלוג סופר בפועל לפני שהוא שואל, ומציע קודם כל
// את הארכיון: הסתרה בלי לאבד שום דבר.

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
  onDelete: () => void;
  onCancel: () => void;
}

interface Counts {
  documents: number;
  onboardingSteps: number;
  annualReports: number;
  quotations: number;
  requests: number;
  emails: number;
}

const EMPTY: Counts = {
  documents: 0, onboardingSteps: 0, annualReports: 0,
  quotations: 0, requests: 0, emails: 0,
};

async function countRows(table: string, column: string, clientId: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, clientId);
  return count ?? 0;
}

export default function ClientDeleteDialog({ client, tasks, onArchive, onDelete, onCancel }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const fullName = `${client.firstName} ${client.lastName}`.trim() || client.idNumber || 'הלקוח';
  const clientTasks = tasks.filter(t => t.clientId === client.id);
  const openTasks = clientTasks.filter(t => t.status !== 'done').length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [documents, onboardingSteps, annualReports, quotations, requests, emails] =
          await Promise.all([
            countRows('documents', 'client_id', client.id),
            countRows('onboarding_steps', 'client_id', client.id),
            countRows('annual_report_sessions', 'client_id', client.id),
            countRows('quotations', 'client_id', client.id),
            countRows('representation_requests', 'linked_client_id', client.id),
            countRows('email_messages', 'client_id', client.id),
          ]);
        if (cancelled) return;
        setCounts({ documents, onboardingSteps, annualReports, quotations, requests, emails });
      } catch {
        if (!cancelled) { setFailed(true); setCounts(EMPTY); }
      }
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const c = counts;
  const destroyed = c ? [
    clientTasks.length > 0 && `${clientTasks.length} משימות${openTasks > 0 ? ` (מתוכן ${openTasks} פתוחות)` : ''}`,
    c.documents > 0 && `${c.documents} מסמכים`,
    c.onboardingSteps > 0 && `תהליך קליטה - ${c.onboardingSteps} שלבים`,
    c.annualReports > 0 && `${c.annualReports} דוחות שנתיים`,
  ].filter(Boolean) as string[] : [];

  const detached = c ? [
    c.quotations > 0 && `${c.quotations} הצעות מחיר`,
    c.requests > 0 && `${c.requests} בקשות ייצוג`,
    c.emails > 0 && `${c.emails} מיילים`,
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
            disabled={busy || !counts}
            onClick={onDelete}
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
