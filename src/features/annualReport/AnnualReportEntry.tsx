import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { AnnualReportSession } from './types';
import { AVAILABLE_YEARS } from '../../data/taxData';

interface Props {
  clients: Client[];
  existingSessions: AnnualReportSession[];
  onStart: (clientId: string, taxYear: number) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  loading?: boolean;
}

export default function AnnualReportEntry({ clients, existingSessions, onStart, onDeleteSession, loading }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.trim();
      return name.includes(q) || (c.idNumber || '').includes(q);
    });
  }, [clients, searchQuery]);

  const sessionByClientYear = useMemo(() => {
    const m = new Map<string, AnnualReportSession>();
    for (const s of existingSessions) {
      m.set(`${s.clientId}|${s.taxYear}`, s);
    }
    return m;
  }, [existingSessions]);

  const existingForSelection = selectedClientId
    ? sessionByClientYear.get(`${selectedClientId}|${selectedYear}`) ?? null
    : null;

  const yearOptions = useMemo(() => {
    const set = new Set<number>([2025, 2024, 2023, 2022, ...AVAILABLE_YEARS]);
    return Array.from(set).sort((a, b) => b - a);
  }, []);

  function handleStart() {
    if (!selectedClientId) return;
    void onStart(selectedClientId, selectedYear);
  }

  const inProgressSessions = existingSessions.filter((s) => s.status !== 'archived');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">📋 דוח שנתי 1301 — התחלת תהליך</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--gray-700)', lineHeight: 1.6 }}>
              המערכת תוביל אותך בשאלון מובנה שמתאים את עצמו לפרופיל הלקוח —
              ובסופו תוכל לראות בשקיפות מלאה: אילו מסמכים נדרשים, אילו נספחים יש לצרף,
              ואילו ערכים יוזנו לטופס 1301 — שדה אחרי שדה, עם הסבר מאיפה כל ערך הגיע.
            </p>
          </div>

          {inProgressSessions.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <strong>תהליכים פתוחים:</strong>{' '}
              {inProgressSessions.length} {inProgressSessions.length === 1 ? 'תהליך' : 'תהליכים'} בעבודה.
              <ul style={{ margin: '.5rem 0 0', padding: 0, listStyle: 'none' }}>
                {inProgressSessions.map((s) => {
                  const c = clients.find((x) => x.id === s.clientId);
                  const name = c ? `${c.firstName} ${c.lastName}`.trim() : '(לקוח לא נמצא)';
                  const statusLabel = ({
                    in_progress: 'באמצע השאלון',
                    review: 'מוכן לבדיקה',
                    mapping_done: '✓ מוכן להגשה',
                    archived: 'בארכיון',
                  } as Record<string, string>)[s.status] ?? s.status;
                  return (
                    <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem 0', borderTop: '1px solid #fde68a' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{name}</strong> · שנת מס {s.taxYear} · {statusLabel}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setSelectedClientId(s.clientId); setSelectedYear(s.taxYear); }}
                      >
                        המשך תהליך
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={deletingId === s.id}
                        onClick={async () => {
                          const confirmMsg = `למחוק את התהליך של ${name} לשנת ${s.taxYear}? לא ניתן לשחזר.`;
                          if (!window.confirm(confirmMsg)) return;
                          setDeletingId(s.id);
                          try {
                            await onDeleteSession(s.id);
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        {deletingId === s.id ? 'מוחק…' : 'מחק'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 350px', minWidth: 280 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '.4rem' }}>בחר לקוח</label>
              <input
                type="text"
                className="input"
                placeholder="חיפוש לפי שם או ת.ז..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', marginBottom: '.5rem' }}
              />
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 6 }}>
                {filteredClients.length === 0 ? (
                  <div style={{ padding: '1rem', color: 'var(--gray-500)' }}>אין לקוחות תואמים</div>
                ) : (
                  filteredClients.map((c) => {
                    const key = `${c.id}|${selectedYear}`;
                    const exists = sessionByClientYear.has(key);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClientId(c.id)}
                        className={`nav-tab ${selectedClientId === c.id ? 'active' : ''}`}
                        style={{
                          width: '100%',
                          textAlign: 'right',
                          padding: '.6rem .9rem',
                          borderBottom: '1px solid var(--gray-100)',
                          borderRadius: 0,
                          background: selectedClientId === c.id ? 'var(--blue-light)' : 'white',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{c.firstName} {c.lastName}</span>
                        {c.idNumber && <span style={{ color: 'var(--gray-500)', marginRight: 8, fontSize: '.85rem' }}>· {c.idNumber}</span>}
                        {exists && <span style={{ marginRight: 8, fontSize: '.75rem', background: 'var(--blue-light)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 999 }}>קיים תהליך</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ flex: '0 0 200px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '.4rem' }}>שנת מס</label>
              <select
                className="input"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ width: '100%' }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {existingForSelection && (
                <div style={{ marginTop: '.75rem', fontSize: '.85rem', color: 'var(--blue)' }}>
                  ✓ קיים תהליך — לחיצה תמשיך מהמקום בו עצרת.
                </div>
              )}
            </div>

            <div style={{ flex: '0 0 auto' }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleStart}
                disabled={!selectedClientId || loading}
              >
                {existingForSelection ? 'המשך תהליך' : 'התחל תהליך חדש'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
