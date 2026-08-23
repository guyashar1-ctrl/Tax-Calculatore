// ─── מציץ בחומרים שהגיעו מהרו"ח הקודם ───────────────────────────────────────
// ‼ הצצה, לא מנהל קבצים. הכל נשאר במסך הקליטה — הרו"ח לא צריך לנטוש את
// התהליך רק כדי לראות מה הגיע. הניהול המלא (העברה, שכפול, תוויות) חי
// בתיק המסמכים, ולשם מוביל הקישור השקט בתחתית.
//
// ‼ במצב סגור זו שורה אחת. כל מה שמעבר נפתח רק כשמבקשים.
//
// ‼ "הוסרו" כאן = הוסרו מהרשימה של הרו"ח הקודם בדף שלו, לא נמחקו מהתיק.
// הקובץ יושב ב"חומרים מרו״ח קודם" כמו כל קובץ אחר (מיגרציה 120). ההפרדה
// קיימת רק כאן, כדי שלא ייראה שמשהו נעלם.

import { useEffect, useState } from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { PREV_ACCOUNTANT_FOLDER, PrevAccountantUpload } from '../../utils/prevAccountantInbox';

interface RemovedUpload extends PrevAccountantUpload {
  removedAt?: string;
}

interface Props {
  clientId: string;
  received: PrevAccountantUpload[];
  removed: RemovedUpload[];
  /**
   * ‼ הפתיחה נשלטת מבחוץ. הכפתור "הצג מסמכים" הוא הפעולה הראשית של קטע
   * החומרים ויושב בשורת הפעולות שלו; אילו הוא היה כאן, הפאנל היה נלכד
   * בתוך פריט flex צר במקום להיפרש מתחת לשורה.
   */
  open: boolean;
  /** מעבר לתיק המסמכים עם התיקייה פתוחה. חסר ⇒ הקישור לא מוצג. */
  onOpenFolder?: (folderId: string) => void;
}

function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export default function PrevAccountantDocsDrawer(
  { clientId, received, removed, open, onOpenFolder }: Props,
) {
  const db = useDocumentStore();
  const [removedOpen, setRemovedOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !onOpenFolder) return;
    let cancelled = false;
    void db.getFoldersByClient(clientId).then(list => {
      if (cancelled) return;
      const f = list.find(x => x.name === PREV_ACCOUNTANT_FOLDER && !x.parentId);
      setFolderId(f?.id ?? null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  if (!open || (received.length === 0 && removed.length === 0)) return null;

  /**
   * ‼ אותה התנהגות של תיק המסמכים: הלשונית נפתחת לפני ההורדה, אחרת חוסם
   * הפופ-אפים מבטל אותה (window.open אחרי await אינו תגובה ישירה ללחיצה).
   */
  async function openFile(id: string) {
    setError('');
    setBusyId(id);
    const w = window.open('', '_blank');
    try {
      const full = await db.getDoc(id);
      if (!full || full.fileData.byteLength === 0) {
        w?.close();
        setError('הקובץ אינו זמין לצפייה.');
        return;
      }
      const blob = new Blob([full.fileData], { type: full.fileType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      w?.close();
      setError(e instanceof Error ? e.message : 'פתיחת הקובץ נכשלה.');
    } finally {
      setBusyId(null);
    }
  }

  const row = (f: PrevAccountantUpload, dim?: boolean) => (
    <li key={f.documentId} style={{
      display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap',
      padding: '.3rem 0', fontSize: 'var(--fs-13)',
      color: dim ? 'var(--muted)' : 'inherit',
    }}>
      <span style={{ flex: '1 1 10rem', minWidth: 0, overflowWrap: 'anywhere' }}>{f.fileName}</span>
      {f.at && <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-12)' }}>{shortDate(f.at)}</span>}
      <button type="button" className="btn btn-sm btn-ghost" disabled={busyId === f.documentId}
        onClick={() => void openFile(f.documentId)}>
        {busyId === f.documentId ? 'פותח…' : 'פתח'}
      </button>
    </li>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
      {received.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {received.map(f => row(f))}
        </ul>
      )}

      {removed.length > 0 && (
        <div>
          <button type="button" className="pa-mat-quiet"
            aria-expanded={removedOpen} onClick={() => setRemovedOpen(v => !v)}>
            מסמכים שהוסרו ({removed.length}) {removedOpen ? '⌄' : '›'}
          </button>
          {removedOpen && (
            <>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                הוסרו מרשימת הרו״ח הקודם. הקבצים עצמם נשארו בתיק.
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {removed.map(f => row(f, true))}
              </ul>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--err)' }}>{error}</div>
      )}

      {folderId && onOpenFolder && (
        <button type="button" className="pa-mat-quiet" style={{ textAlign: 'start' }}
          onClick={() => onOpenFolder(folderId)}>
          לכל החומרים מרו״ח קודם →
        </button>
      )}
    </div>
  );
}
