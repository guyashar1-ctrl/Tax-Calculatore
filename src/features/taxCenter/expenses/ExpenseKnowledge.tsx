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

  /* הפסק הוא טקסט. הטון קובע את הצבע — לא מילוי. התוספת ("shortLabel")
     היא ניסוח מלא של אותה תשובה, ולכן היא יורדת לשורה שנייה ואפורה. */
  const verdict = (meta: { label: string; tone: string }, shortLabel: string) => (
    <span className="ek-verdict">
      <span className={`ek-verdict-word tone-${meta.tone}`}>{meta.label}</span>
      {shortLabel && shortLabel !== meta.label && <span className="ek-verdict-note">{shortLabel}</span>}
    </span>
  );

  return (
    <div className="ek-page">
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
            <div className="ek-hint">
              Enter יפתח את ההתאמה הראשונה: <strong>{filtered[0].icon} {filtered[0].title}</strong>
            </div>
          )}
        </div>
      </div>

      {/* טבלת עיון מהיר */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">עיון מהיר — האם ההוצאה מוכרת?</span>
          <span className="ek-count">{filtered.length} נושאים</span>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="ek-table">
              <thead>
                <tr>
                  <th>הוצאה</th>
                  <th>מס הכנסה</th>
                  <th>מע"מ</th>
                  <th>סיכון</th>
                  <th>מקור מרכזי</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className="ek-row">
                    <td className="ek-name">{t.icon} {t.title}</td>
                    <td>{verdict(INCOME_TAX_VERDICT_META[t.incomeTax.verdict], t.incomeTax.shortLabel)}</td>
                    <td>{verdict(VAT_VERDICT_META[t.vat.verdict], t.vat.shortLabel)}</td>
                    <td className={`ek-risk tone-${RISK_META[t.riskLevel].tone}`} title={t.riskNote ?? ''}>
                      {RISK_META[t.riskLevel].short}
                    </td>
                    <td className="ek-source">{t.mainSource}</td>
                    {/* הפעולה שקטה עד מעבר עכבר — כמו בכל שורה במערכת */}
                    <td className="ek-open">פתח ←</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="ek-none">
                      לא נמצא נושא מתאים — נסו מילה אחרת ("רכב", "ביגוד", "השתלמות"...)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="alert alert-info">
        התוכן אומת מול פקודת מס הכנסה, חוק מע"מ, התקנות, חוזרי רשות המסים ופסיקה מעשית (יולי 2026).
        הוא כלי עזר מקצועי — לא תחליף לשיקול דעת במקרה קונקרטי. פריטים המסומנים "לאמת" דורשים בדיקה נוספת.
      </div>
    </div>
  );
}
