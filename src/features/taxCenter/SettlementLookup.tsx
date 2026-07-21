import { useMemo, useState } from 'react';
import { getEligibleSettlements, EILAT_BENEFIT, EASTERN_CONFRONTATION_LINE } from '../../data/eligibleSettlements';
import { calcSettlementCredit } from '../../utils/creditPoints';

const fmt = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

interface Props {
  year: number;
}

export default function SettlementLookup({ year }: Props) {
  const [query, setQuery] = useState('');
  const [income, setIncome] = useState(0);
  const [rateFilter, setRateFilter] = useState<number | 'all'>('all');

  const list = useMemo(() => getEligibleSettlements(year), [year]);
  const rates = useMemo(() => Array.from(new Set(list.map(s => s.ratePercent))).sort((a, b) => b - a), [list]);

  const filtered = useMemo(() => {
    let r = list;
    if (query.trim()) r = r.filter(s => s.name.includes(query.trim()));
    if (rateFilter !== 'all') r = r.filter(s => s.ratePercent === rateFilter);
    return r;
  }, [list, query, rateFilter]);

  // התאמות ברשימת קו העימות המזרחי (הוראת שעה 2026-2027) — קבוצה נפרדת
  const eclActive = (EASTERN_CONFRONTATION_LINE.validYears as readonly number[]).includes(year);
  const eclMatches = useMemo(() => {
    if (!eclActive || !query.trim()) return [] as string[];
    const q = query.replace(/["'׳״]/g, '').trim();
    return EASTERN_CONFRONTATION_LINE.settlements.filter(s => s.replace(/["'׳״]/g, '').includes(q));
  }, [eclActive, query]);
  const eclCredit = Math.min(income || 0, EASTERN_CONFRONTATION_LINE.ceilingAnnual) * EASTERN_CONFRONTATION_LINE.ratePercent / 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <strong>המנגנון (סעיף 11 לפקודה):</strong> תושב יישוב מוטב זכאי לזיכוי ממס בשיעור <strong>7%–20% מההכנסה החייבת מיגיעה אישית</strong>, עד תקרת הכנסה שנתית שנקבעת לכל יישוב.
        זה <u>אינו</u> "נקודות זיכוי" — הזיכוי מחושב מההכנסה ומופחת מהמס (ואינו מוחזר).
        נדרשים 12 חודשי מגורים רצופים, מרכז חיים ביישוב ואישור תושבות שנתי (טופס 1312א).
        ברשימת {year}: <strong>{list.length} יישובים</strong> (ההודעה הרשמית בקובץ התקנות, ינואר {year}).
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">🔍 איתור יישוב וחישוב הזיכוי</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label>חיפוש יישוב</label>
              <input type="text" value={query} placeholder="שם היישוב..." onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>סינון לפי שיעור</label>
              <select value={rateFilter} onChange={e => setRateFilter(e.target.value === 'all' ? 'all' : +e.target.value)}>
                <option value="all">הכל</option>
                {rates.map(r => <option key={r} value={r}>{r}% ({list.filter(s => s.ratePercent === r).length})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label>הכנסה שנתית מיגיעה אישית (לחישוב הזיכוי)</label>
              <input type="number" min={0} value={income || ''} placeholder="0" onChange={e => setIncome(+e.target.value)} />
            </div>
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--gray-100)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'right' }}>יישוב</th>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>שיעור זיכוי</th>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>תקרה שנתית</th>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>זיכוי מרבי</th>
                  {income > 0 && <th style={{ padding: '.5rem .8rem', textAlign: 'center', color: 'var(--green-dark)' }}>זיכוי בפועל</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map(s => (
                  <tr key={s.name} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.45rem .8rem', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '.45rem .8rem', textAlign: 'center', fontWeight: 700, color: 'var(--blue-dark)' }}>{s.ratePercent}%</td>
                    <td style={{ padding: '.45rem .8rem', textAlign: 'center' }}>{fmt(s.ceilingAnnual)}</td>
                    <td style={{ padding: '.45rem .8rem', textAlign: 'center', color: 'var(--gray-500)' }}>{fmt(s.ceilingAnnual * s.ratePercent / 100)}</td>
                    {income > 0 && (
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center', fontWeight: 700, color: 'var(--green-dark)' }}>
                        {fmt(calcSettlementCredit(s.ratePercent, s.ceilingAnnual, income, s.name).credit)}
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && eclMatches.length === 0 && (
                  <tr><td colSpan={income > 0 ? 5 : 4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                    לא נמצא — היישוב אינו ברשימה הרשמית לשנת {year} (ואינו זכאי להטבה)
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {eclMatches.length > 0 && (
            <div style={{ marginTop: '.75rem', border: '1.5px solid #86efac', background: '#f0fdf4', borderRadius: 10, padding: '.8rem 1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.3rem' }}>
                🆕 נמצא ברשימת "קו עימות מזרחי" (הוראת שעה 2026–2027)
              </div>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
                {eclMatches.map(s => (
                  <span key={s} style={{ background: 'white', border: '1px solid #bbf7d0', borderRadius: 999, padding: '.15rem .6rem', fontSize: '.82rem', fontWeight: 600 }}>{s}</span>
                ))}
              </div>
              <div style={{ fontSize: '.83rem' }}>
                זיכוי <b>{EASTERN_CONFRONTATION_LINE.ratePercent}%</b> עד תקרת {fmt(EASTERN_CONFRONTATION_LINE.ceilingAnnual)} לשנה
                (זיכוי מרבי {fmt(EASTERN_CONFRONTATION_LINE.ceilingAnnual * EASTERN_CONFRONTATION_LINE.ratePercent / 100)})
                {income > 0 && <> · זיכוי בפועל: <b style={{ color: 'var(--green-dark)' }}>{fmt(eclCredit)}</b></>}
                — רטרואקטיבית מ-1.1.2026.
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--gray-600)', marginTop: '.35rem' }}>
                {EASTERN_CONFRONTATION_LINE.conditions.map((c, i) => <div key={i}>• {c}</div>)}
              </div>
            </div>
          )}
          {filtered.length > 200 && (
            <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.4rem' }}>מוצגים 200 ראשונים — צמצמו בחיפוש</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ fontSize: '.85rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <div style={{ fontWeight: 700 }}>מקרים מיוחדים שחשוב להכיר</div>
          <div>
            🌴 <strong>אילת אינה ברשימת סעיף 11</strong> — ההטבה שלה נקבעת בחוק אזור סחר חופשי באילת:
            {' '}{EILAT_BENEFIT.ratePercent}% מההכנסה מיגיעה אישית שהופקה באזור אילת, עד {fmt(EILAT_BENEFIT.ceilingAnnual)} לשנה (בתוקף עד 2027).
          </div>
          <div>
            🏚 <strong>מפוני המלחמה:</strong> תושבי יישובים שפונו (בארי, כפר עזה, ניר עוז ועוד) שומרים על ההטבה גם ללא מגורים בפועל, לפי הנחיות רשות המסים — עם תאריכי תפוגה פרטניים (ניר עוז: עד 31.8.2027). נדרשת הצהרה למעסיק.
          </div>
          <div>
            🆕 <strong>"קו עימות מזרחי" (ס"ח 3531, יוני 2026):</strong> {EASTERN_CONFRONTATION_LINE.settlements.length} יישובי יו"ש בהוראת שעה — 7% עד {fmt(EASTERN_CONFRONTATION_LINE.ceilingAnnual)}, רטרואקטיבית מ-1.1.2026 ועד סוף 2027.
            הרשימה המלאה כלולה בחיפוש למעלה (לפי הוראת ביצוע רשות המסים 2026-000832 מ-9.7.2026; אומת 07/2026). שימו לב: תושבות כל השנה + בחירה בין הטבות.
          </div>
          <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>
            מקורות: הודעת מס הכנסה (רשימת יישובים מוטבים) לשנת {year}, קובץ התקנות · כל-זכות — זיכוי ממס לתושבי פריפריה · הנחיית רשות המסים למעסיקים 6.1.2026
          </div>
        </div>
      </div>
    </div>
  );
}
