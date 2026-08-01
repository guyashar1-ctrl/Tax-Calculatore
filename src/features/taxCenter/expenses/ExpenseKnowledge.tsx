import { useMemo, useState } from 'react';
import { EXPENSE_TOPICS } from '../../../data/expenseKnowledge';
import {
  IncomeTaxVerdict,
  VatVerdict,
  RiskLevel,
  INCOME_TAX_VERDICT_META,
  VAT_VERDICT_META,
  RISK_META,
  searchExpenseTopics,
} from './types';
import ExpenseDetail from './ExpenseDetail';

export default function ExpenseKnowledge() {
  const [query, setQuery] = useState('');
  const [itFilter, setItFilter] = useState<IncomeTaxVerdict | 'all'>('all');
  const [vatFilter, setVatFilter] = useState<VatVerdict | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = searchExpenseTopics(EXPENSE_TOPICS, query);
    if (itFilter !== 'all') list = list.filter(t => t.incomeTax.verdict === itFilter);
    if (vatFilter !== 'all') list = list.filter(t => t.vat.verdict === vatFilter);
    if (riskFilter !== 'all') list = list.filter(t => t.riskLevel === riskFilter);
    // ללא חיפוש — סדר אלפביתי; עם חיפוש — לפי רלוונטיות
    return query.trim() ? list : [...list].sort((a, b) => a.title.localeCompare(b.title, 'he'));
  }, [query, itFilter, vatFilter, riskFilter]);

  const selected = selectedId ? EXPENSE_TOPICS.find(t => t.id === selectedId) : null;

  if (selected) {
    return <ExpenseDetail topic={selected} onBack={() => setSelectedId(null)} />;
  }

  function handleSearchEnter() {
    if (query.trim() && filtered.length > 0) setSelectedId(filtered[0].id);
  }

  const badge = (meta: { label: string; color: string; bg: string }, shortLabel: string) => (
    <span style={{
      display: 'inline-block', padding: '.15rem .55rem', borderRadius: 999,
      background: meta.bg, color: meta.color, fontWeight: 600, fontSize: '12px',
      whiteSpace: 'nowrap',
    }}>
      {meta.label}{shortLabel && shortLabel !== meta.label ? ` · ${shortLabel}` : ''}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* חיפוש */}
      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label style={{ fontWeight: 600 }}>מה הלקוח שאל?</label>
              <input
                type="text"
                value={query}
                autoFocus
                placeholder='נסו: "חליפה", "מסעדה", "עובד מהבית", "קפה", "אייפון", "כביש 6"...'
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearchEnter(); }}
                style={{ fontSize: '15px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>מס הכנסה</label>
              <select value={itFilter} onChange={e => setItFilter(e.target.value as IncomeTaxVerdict | 'all')}>
                <option value="all">הכל</option>
                {(Object.keys(INCOME_TAX_VERDICT_META) as IncomeTaxVerdict[]).map(k => (
                  <option key={k} value={k}>{INCOME_TAX_VERDICT_META[k].label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>מע"מ</label>
              <select value={vatFilter} onChange={e => setVatFilter(e.target.value as VatVerdict | 'all')}>
                <option value="all">הכל</option>
                {(Object.keys(VAT_VERDICT_META) as VatVerdict[]).map(k => (
                  <option key={k} value={k}>{VAT_VERDICT_META[k].label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>סיכון</label>
              <select value={riskFilter} onChange={e => setRiskFilter(e.target.value as RiskLevel | 'all')}>
                <option value="all">הכל</option>
                {(Object.keys(RISK_META) as RiskLevel[]).map(k => (
                  <option key={k} value={k}>{RISK_META[k].icon} {RISK_META[k].label}</option>
                ))}
              </select>
            </div>
          </div>
          {query.trim() && filtered.length > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '.4rem' }}>
              Enter יפתח את ההתאמה הראשונה: <strong>{filtered[0].icon} {filtered[0].title}</strong>
            </div>
          )}
        </div>
      </div>

      {/* טבלת עיון מהיר */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">עיון מהיר — האם ההוצאה מוכרת?</span>
          <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{filtered.length} נושאים</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                  <th style={{ padding: '.55rem .9rem', textAlign: 'right' }}>הוצאה</th>
                  <th style={{ padding: '.55rem .9rem', textAlign: 'right' }}>מס הכנסה</th>
                  <th style={{ padding: '.55rem .9rem', textAlign: 'right' }}>מע"מ</th>
                  <th style={{ padding: '.55rem .9rem', textAlign: 'center' }}>סיכון</th>
                  <th style={{ padding: '.55rem .9rem', textAlign: 'right' }}>מקור מרכזי</th>
                  <th style={{ padding: '.55rem .9rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    style={{ borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--blue-light)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '.55rem .9rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {t.icon} {t.title}
                    </td>
                    <td style={{ padding: '.55rem .9rem' }}>
                      {badge(INCOME_TAX_VERDICT_META[t.incomeTax.verdict], t.incomeTax.shortLabel)}
                    </td>
                    <td style={{ padding: '.55rem .9rem' }}>
                      {badge(VAT_VERDICT_META[t.vat.verdict], t.vat.shortLabel)}
                    </td>
                    <td style={{ padding: '.55rem .9rem', textAlign: 'center' }} title={t.riskNote ?? ''}>
                      {RISK_META[t.riskLevel].icon}
                    </td>
                    <td style={{ padding: '.55rem .9rem', fontSize: '13px', color: 'var(--gray-500)' }}>
                      {t.mainSource}
                    </td>
                    <td style={{ padding: '.55rem .9rem', color: 'var(--blue)', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
                      פתח ←
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                      לא נמצא נושא מתאים — נסו מילה אחרת ("רכב", "ביגוד", "השתלמות"...)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 0, fontSize: '13px' }}>
        התוכן אומת מול פקודת מס הכנסה, חוק מע"מ, התקנות, חוזרי רשות המסים ופסיקה מעשית (יולי 2026).
        הוא כלי עזר מקצועי — לא תחליף לשיקול דעת במקרה קונקרטי. פריטים המסומנים "לאמת" דורשים בדיקה נוספת.
      </div>
    </div>
  );
}
