// ─── באנר הגירה חד-פעמי: העלאת קבצים מקומיים לענן ─────────────────────
// מופיע רק אם זוהו קבצים שנשמרו ב-IndexedDB הישן (לפני המעבר ל-Supabase Storage).
// המשתמש יכול ללחוץ "העלה לענן" — הקבצים מועלים ל-Supabase ונמחקים מקומית.
// אחרי שהעלאה הסתיימה והכל ירוק, הבאנר נעלם לתמיד.

import { useEffect, useState } from 'react';
import { useDocumentDB } from '../hooks/useIndexedDB';
import {
  listAllLegacyDocs,
  deleteLegacyDoc,
  deleteLegacyDatabase,
} from '../utils/legacyIndexedDB';

interface Props {
  // מזהי הלקוחות הקיימים (כדי לא להעלות קבצים יתומים — אם הלקוח לא קיים בענן, נדלג)
  knownClientIds: Set<string>;
}

type Status = 'checking' | 'idle' | 'no-legacy' | 'migrating' | 'done' | 'error';

interface MigrationProgress {
  total: number;
  uploaded: number;
  skipped: number;
  failed: number;
  failedNames: string[];
}

export default function LegacyMigrationBanner({ knownClientIds }: Props) {
  const db = useDocumentDB();
  const [status, setStatus] = useState<Status>('checking');
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState<MigrationProgress>({ total: 0, uploaded: 0, skipped: 0, failed: 0, failedNames: [] });
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    listAllLegacyDocs().then(docs => {
      if (cancelled) return;
      if (docs.length === 0) setStatus('no-legacy');
      else { setStatus('idle'); setCount(docs.length); }
    });
    return () => { cancelled = true; };
  }, []);

  async function startMigration() {
    setStatus('migrating');
    setErrorMsg('');

    const docs = await listAllLegacyDocs();
    const total = docs.length;
    let uploaded = 0, skipped = 0, failed = 0;
    const failedNames: string[] = [];
    setProgress({ total, uploaded, skipped, failed, failedNames });

    for (const doc of docs) {
      // דלג על קבצים יתומים (לקוח לא קיים) ועל "fake" סמפלים
      if (doc.id.startsWith('fake-') || (doc.fileData?.byteLength ?? 0) === 0) {
        skipped++;
        await deleteLegacyDoc(doc.id);
        setProgress({ total, uploaded, skipped, failed, failedNames: [...failedNames] });
        continue;
      }
      if (!knownClientIds.has(doc.clientId)) {
        // לקוח לא קיים בענן (probably deleted) — מדלגים אבל לא מוחקים מהמקומי
        skipped++;
        setProgress({ total, uploaded, skipped, failed, failedNames: [...failedNames] });
        continue;
      }
      try {
        await db.saveDoc(doc);
        await deleteLegacyDoc(doc.id);
        uploaded++;
      } catch (err: any) {
        console.error('migration failed for', doc.fileName, err);
        failed++;
        failedNames.push(doc.fileName);
      }
      setProgress({ total, uploaded, skipped, failed, failedNames: [...failedNames] });
    }

    if (failed === 0) {
      // הכל עלה — אפשר למחוק את ה-DB המקומי
      await deleteLegacyDatabase();
      setStatus('done');
    } else {
      setErrorMsg(`${failed} קבצים נכשלו: ${failedNames.slice(0, 5).join(', ')}${failedNames.length > 5 ? '...' : ''}`);
      setStatus('error');
    }
  }

  if (status === 'checking' || status === 'no-legacy') return null;
  if (status === 'done') return null; // אין יותר מה להציג

  return (
    <div className={`legacy-migration-banner ${status}`}>
      {status === 'idle' && (
        <>
          <div className="lmb-icon">☁️</div>
          <div className="lmb-text">
            <strong>זוהו {count} קבצים שנשמרו רק במחשב הזה.</strong>
            <div className="lmb-sub">
              עברנו לאחסון בענן. כדי שהקבצים יהיו זמינים גם במכשירים אחרים — צריך להעלות אותם פעם אחת.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={startMigration}>
            ☁️ העלה {count} קבצים לענן
          </button>
        </>
      )}

      {status === 'migrating' && (
        <>
          <div className="lmb-icon">⏳</div>
          <div className="lmb-text">
            <strong>מעלה לענן…</strong>
            <div className="lmb-sub">
              {progress.uploaded + progress.skipped + progress.failed} מתוך {progress.total} ·
              {' '}העלו: {progress.uploaded} · דילגנו: {progress.skipped}
              {progress.failed > 0 && ` · נכשלו: ${progress.failed}`}
            </div>
            <div className="lmb-progressbar">
              <div className="lmb-progressbar-fill" style={{
                width: `${Math.round(((progress.uploaded + progress.skipped + progress.failed) / Math.max(progress.total, 1)) * 100)}%`
              }} />
            </div>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="lmb-icon">⚠</div>
          <div className="lmb-text">
            <strong>חלק מההעלאה נכשלה.</strong>
            <div className="lmb-sub">{errorMsg}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={startMigration}>
            נסה שוב
          </button>
        </>
      )}
    </div>
  );
}
