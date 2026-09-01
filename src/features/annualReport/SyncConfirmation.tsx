// ─── מסך Sync Confirmation — סוגר את לולאת השאלון ↔ תיק המס ────────────────
//
// מופיע אחרי סיום השאלון. מציג את כל הדיפים בין מודל הסשן (התשובות
// שניתנו השנה) לבין הפרופיל הקיים בכרטיס.
//
// ‼ המסך הזה כבר לא כותב לכרטיס. הוא רק **מציע** שינויים לתיק המס
// (propose_tax_facts) — הכתיבה בפועל קורית רק אחרי שהרו"ח מאשר אותם שם,
// בנפרד, בזמן שנוח לו. השאלון הוא מקור מידע, לא הסמכות על הפרופיל
// (הכרעת מוצר, ראה docs/prototypes/README.md).
import { useState, useMemo } from 'react';
import type { Client } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { AnnualReportSession } from './types';
// ‼ לוגיקת ההתאמה חיה ב-reconcile.ts ומשותפת עם קליטת השאלון בתיק המס.
// אין כאן עותק שני — שינוי כלל שם משנה את שני המסכים.
import { computeDiffs, toProposedFact } from './reconcile';
import type { Diff } from './reconcile';

interface Props {
  session: AnnualReportSession;
  client: Client;
  /** מציע לתיק המס — לא כותב לכרטיס. מחזיר ok גם כשלא הוצע כלום. */
  onProposeChanges: (items: ProposedFact[]) => Promise<{ ok: boolean; error?: string }>;
  onContinue: () => void;
}



export default function SyncConfirmation({ session, client, onProposeChanges, onContinue }: Props) {
  const diffs = useMemo(() => computeDiffs(session, client), [session, client]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(diffs.map((d) => d.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (selected.size === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // ‼ תמונת המצב שמאפשרת לשרת לזהות דריסה נבנית ב-toProposedFact, ביחד
      // עם קליטת השאלון בתיק המס — מקור אחד לשני המסלולים.
      const items: ProposedFact[] = diffs
        .filter((d: Diff) => selected.has(d.key))
        .map((d: Diff) => toProposedFact(d, client));
      const res = await onProposeChanges(items);
      if (!res.ok) {
        setError(res.error ?? 'ההצעה לתיק המס נכשלה');
        setSaving(false);
        return;
      }
      onContinue();
    } catch (e) {
      console.error('[sync] failed', e);
      setError('ההצעה לתיק המס נכשלה');
      setSaving(false);
    }
  }

  if (diffs.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: '2rem auto', padding: '0 1rem' }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '34px' }}>✅</div>
            <h2 style={{ margin: '.5rem 0' }}>התיק מעודכן</h2>
            <p style={{ color: 'var(--gray-600)' }}>
              כל התשובות בשאלון תואמות את תיק המס. אין מה להציע.
            </p>
            <button className="btn btn-primary btn-lg" onClick={onContinue}>המשך לפלט →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>עדכונים לתיק המס</h2>
        <p style={{ margin: '.4rem 0 0', color: 'var(--gray-600)', fontSize: '14px' }}>
          זוהו {diffs.length} שינויים בין התשובות בשאלון לבין תיק המס. סמן אילו להציע.
          העדכון עצמו לא קורה כאן - הוא ממתין לאישורך בתיק המס, כדי שלא ידרוס בשקט ערך שנקבע ידנית.
        </p>
        {error && (
          <p style={{ margin: '.6rem 0 0', color: 'var(--red)', fontSize: '13px' }}>⚠ {error}</p>
        )}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                <th style={{ padding: '.6rem', textAlign: 'right', width: 40 }}></th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>שדה</th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>בכרטיס היום</th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>תשובה בשאלון</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.key} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '.6rem' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.key)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(d.key); else next.delete(d.key);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td style={{ padding: '.6rem', fontWeight: 500 }}>{d.label}</td>
                  <td style={{ padding: '.6rem', color: 'var(--gray-500)', textDecoration: 'line-through' }}>{d.fromCard}</td>
                  <td style={{ padding: '.6rem', color: 'var(--ok)', fontWeight: 500 }}>← {d.fromQuestionnaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <button className="btn btn-ghost" onClick={onContinue} disabled={saving}>
          ⊘ דלג (אל תציע כלום לתיק המס)
        </button>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSelected(new Set(diffs.map((d) => d.key)))}
            disabled={saving}
          >
            סמן הכל
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSelected(new Set())}
            disabled={saving}
          >
            נקה הכל
          </button>
          <button className="btn btn-primary btn-lg" onClick={handleApply} disabled={saving}>
            {saving ? 'מציע...' : `הצע ${selected.size} שינויים לתיק המס והמשך`}
          </button>
        </div>
      </div>
    </div>
  );
}

