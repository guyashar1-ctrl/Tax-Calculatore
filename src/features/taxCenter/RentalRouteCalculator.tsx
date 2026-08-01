import { useMemo, useRef, useState } from 'react';
import { TaxYearData } from '../../types';
import { compareRentalRoutes, optimizeApartmentRoutes, RentalInput } from '../../utils/rentalTax';

const fmt = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

interface Props {
  taxData: TaxYearData;
  year: number;
}

const MARGINAL_RATES = [10, 14, 20, 31, 35, 47, 50];

export default function RentalRouteCalculator({ taxData, year }: Props) {
  // שכ"ד לכל דירה בנפרד — דירה אחת כברירת מחדל
  const [apartments, setApartments] = useState<number[]>([7000]);
  const [isAge60Plus, setIsAge60Plus] = useState(false);
  const [marginalRate, setMarginalRate] = useState(31);
  const [annualExpenses, setAnnualExpenses] = useState(0);
  const [annualDepreciation, setAnnualDepreciation] = useState(0);
  const [eligible122f, setEligible122f] = useState(false);
  /** שכ"ד חודשי שהמשכיר משלם בעד מגוריו (122(ו)) — נקלט חודשי, מחושב שנתי */
  const [rentPaidMonthly, setRentPaidMonthly] = useState(0);

  const monthlyRent = apartments.reduce((s, r) => s + (r || 0), 0);
  const propertyCount = apartments.length;

  const input: RentalInput = useMemo(() => ({
    year,
    monthlyRent,
    apartmentRents: apartments,
    exemptCeilingMonthly: taxData.rentalExemptMonthly,
    marginalRatePct: marginalRate,
    isAge60Plus,
    annualExpenses,
    annualDepreciation,
    eligibleForRentPaidDeduction: eligible122f,
    annualRentPaidForOwnHome: rentPaidMonthly * 12,
    propertyCount,
  }), [year, monthlyRent, apartments, taxData.rentalExemptMonthly, marginalRate, isAge60Plus, annualExpenses, annualDepreciation, eligible122f, rentPaidMonthly, propertyCount]);

  const result = useMemo(() => compareRentalRoutes(input), [input]);
  const mixed = useMemo(
    () => optimizeApartmentRoutes(apartments, taxData.rentalExemptMonthly, marginalRate),
    [apartments, taxData.rentalExemptMonthly, marginalRate],
  );
  const m = result.mechanism;
  const annualRent = monthlyRent * 12;

  // ── ויזואליזציית הפטור המתקפל ──
  // הציר בכיוון עברי: 0 בצד ימין. עם דירה אחת — הסמן ניתן לגרירה.
  const scaleMax = Math.max(m.zeroPoint * 1.35, monthlyRent * 1.1);
  const pct = (v: number) => Math.min(100, (v / scaleMax) * 100);
  const dragEnabled = propertyCount === 1;

  const barRef = useRef<HTMLDivElement>(null);
  // בזמן גרירה מקפיאים את קנה המידה כדי שהציר לא "יברח" מתחת לעכבר
  const dragScale = useRef<number | null>(null);

  function rentFromPointer(clientX: number): number {
    const rect = barRef.current!.getBoundingClientRect();
    const scale = dragScale.current ?? scaleMax;
    const raw = ((rect.right - clientX) / rect.width) * scale; // 0 בצד ימין
    const stepped = Math.round(raw / 50) * 50;
    return Math.min(Math.max(0, stepped), Math.round(scale));
  }
  function handleBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragEnabled) return;
    dragScale.current = scaleMax;
    setApartments([rentFromPointer(e.clientX)]);
    try {
      barRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // אם תפיסת המצביע נכשלת — עדיין מקבלים לחיצה בודדת
    }
  }
  function handleBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragEnabled || dragScale.current == null) return;
    setApartments([rentFromPointer(e.clientX)]);
  }
  function handleBarPointerUp() {
    dragScale.current = null;
  }

  function updateApartment(idx: number, value: number) {
    setApartments(arr => arr.map((r, i) => (i === idx ? value : r)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── קלט ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">נתוני ההשכרה</span></div>
        <div className="card-body">
          {/* דירות */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '.75rem' }}>
            {apartments.map((rent, i) => (
              <div key={i} className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>
                  {propertyCount === 1 ? 'שכ"ד חודשי ₪' : `דירה ${i + 1} — שכ"ד חודשי ₪`}
                </label>
                <input
                  type="number" min={0} value={rent || ''} placeholder="0"
                  onChange={e => updateApartment(i, +e.target.value)}
                  style={{ fontSize: '17px', width: 140 }}
                />
              </div>
            ))}
            {propertyCount > 1 && (
              <button type="button" className="btn btn-secondary" style={{ padding: '.45rem .6rem' }}
                onClick={() => setApartments(arr => arr.slice(0, -1))}>
                הסרת דירה
              </button>
            )}
            <button type="button" className="btn btn-secondary"
              onClick={() => setApartments(arr => [...arr, 0])}>
              + הוספת דירה
            </button>
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', paddingBottom: '.5rem' }}>
              סה"כ: <strong>{fmt(monthlyRent)}/חודש</strong> · {fmt(annualRent)} לשנה
              {propertyCount > 1 && ` · ${propertyCount} דירות`}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שיעור מס שולי של המשכיר</label>
              <select value={marginalRate} onChange={e => setMarginalRate(+e.target.value)}>
                {MARGINAL_RATES.filter(r => isAge60Plus || r >= 31).map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                {isAge60Plus ? 'בני 60+ — מדרגות מלאות מ-10%' : 'מתחת לגיל 60 — מינימום 31% על הכנסה פסיבית'}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={isAge60Plus}
                  onChange={e => { setIsAge60Plus(e.target.checked); if (!e.target.checked && marginalRate < 31) setMarginalRate(31); }} />
                המשכיר/ה בני 60+
              </label>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>הוצאות שנתיות (ריבית, תיקונים...) ₪</label>
              <input type="number" min={0} value={annualExpenses || ''} placeholder="0" onChange={e => setAnnualExpenses(+e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>פחת שנתי (2% משווי הדירה) ₪</label>
              <input type="number" min={0} value={annualDepreciation || ''} placeholder="0" onChange={e => setAnnualDepreciation(+e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: '.75rem', padding: '.6rem .8rem', background: 'var(--gray-50)', borderRadius: 8 }}>
            <label className="checkbox-row" style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>
              <input type="checkbox" checked={eligible122f} onChange={e => setEligible122f(e.target.checked)} />
              סעיף 122(ו): למשכיר דירה יחידה שגר בעצמו בשכירות או משלם על בית אבות
            </label>
            {eligible122f && propertyCount > 1 && (
              <div style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '.3rem' }}>
                הניכוי לפי 122(ו) מיועד לבעל <strong>דירה יחידה</strong> — עם {propertyCount} דירות מושכרות הוא לא חל, ולכן <strong>לא הופעל בחישוב</strong>.
              </div>
            )}
            {eligible122f && propertyCount <= 1 && (
              <div className="form-group" style={{ marginBottom: 0, marginTop: '.5rem', maxWidth: 320 }}>
                <label>שכ"ד חודשי שהמשכיר משלם בעד מגוריו ₪</label>
                <input type="number" min={0} value={rentPaidMonthly || ''} placeholder="0" onChange={e => setRentPaidMonthly(+e.target.value)} />
                <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                  {rentPaidMonthly > 0 && <>= {fmt(Math.min(rentPaidMonthly * 12, 90_000))} לשנה בניכוי · </>}
                  התקרה: 7,500 ₪/חודש (90,000 ₪/שנה) · לא כשמשלמים לקרוב
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ויזואליזציה: הפטור המתקפל ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">מנגנון הפטור המתקפל — {year}</span>
          <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            תקרה: {fmt(m.ceiling)}/חודש · נקודת איפוס: {fmt(m.zeroPoint)}/חודש
          </span>
        </div>
        <div className="card-body">
          {/* פס אזורים — 0 בצד ימין (כיוון עברי); עם דירה אחת גרירה משנה את שכ"ד */}
          <div
            ref={barRef}
            onPointerDown={handleBarPointerDown}
            onPointerMove={handleBarPointerMove}
            onPointerUp={handleBarPointerUp}
            onPointerCancel={handleBarPointerUp}
            style={{
              position: 'relative', height: 70, marginBottom: '.5rem',
              cursor: dragEnabled ? 'pointer' : 'default',
              touchAction: 'none', userSelect: 'none',
            }}
          >
            <div style={{ position: 'absolute', top: 30, left: 0, right: 0, height: 18, borderRadius: 9, overflow: 'hidden' }}>
              {/* מיקום מוחלט מהימין — בלי תלות בכיוון flex */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${pct(m.ceiling)}%`, background: 'var(--chip-green-bd)' }} title="פטור מלא" />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: `${pct(m.ceiling)}%`, width: `${pct(m.zeroPoint) - pct(m.ceiling)}%`, background: 'var(--chip-yellow-bd)' }} title="פטור חלקי" />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: `${pct(m.zeroPoint)}%`, left: 0, background: 'var(--chip-red-bd)' }} title="אין פטור" />
            </div>
            {/* קווי סף */}
            {[m.ceiling, m.zeroPoint].map(v => (
              <div key={v} style={{ position: 'absolute', top: 26, height: 26, right: `${pct(v)}%`, width: 1, background: 'rgba(0,0,0,.25)' }} />
            ))}
            {/* סמן שכ"ד נוכחי */}
            <div style={{ position: 'absolute', top: 4, right: `${pct(monthlyRent)}%`, transform: 'translateX(50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--blue-dark)' }}>{fmt(monthlyRent)}</div>
              <div style={{ width: 2, height: 34, background: 'var(--blue-dark)', margin: '0 auto' }} />
              {dragEnabled && (
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', margin: '-2px auto 0',
                  background: 'var(--card)', border: '3px solid var(--blue-dark)',
                  boxShadow: '0 1px 4px rgba(0,0,0,.25)',
                }} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)' }}>
            <span>0</span>
            <span>פטור מלא עד {fmt(m.ceiling)}</span>
            <span>פטור חלקי</span>
            <span>אין פטור מ-{fmt(m.zeroPoint)}</span>
          </div>
          {dragEnabled ? (
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '.25rem' }}>
              אפשר לגרור את הסמן על הציר — שכ"ד החודשי יתעדכן בהתאם
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '.25rem' }}>
              הסמן מציג את סך השכירות מכל {propertyCount} הדירות — זה הסכום שנבחן מול התקרה
            </div>
          )}

          {m.zone === 'partial' && (
            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem' }}>
              {[
                { label: 'חריגה מהתקרה', value: fmt(m.excess), color: 'var(--warn)' },
                { label: 'הפטור בפועל (2×תקרה − שכ"ד)', value: fmt(m.adjustedExemption), color: 'var(--chip-green-tx)' },
                { label: 'חייב במס לחודש (2×החריגה)', value: fmt(m.taxableMonthly), color: 'var(--err)' },
                { label: 'חייב במס לשנה', value: fmt(m.taxableMonthly * 12), color: 'var(--err)' },
              ].map(c => (
                <div key={c.label} className="rr-stat">
                  <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
            כל שקל חריגה מהתקרה מקטין את הפטור בשקל — כלומר מוסיף <strong>2 ₪</strong> להכנסה החייבת. זו הנקודה שהכי קשה להסביר ללקוחות, והגרף למעלה עושה את זה.
          </div>
        </div>
      </div>

      {/* ── ריבוי דירות: שיוך מסלולים חכם ── */}
      {mixed && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">שיוך מסלולים חכם — {propertyCount} דירות</span>
            <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
              הבחירה במסלול היא לכל דירה בנפרד — והשיוך הנכון חוסך מס
            </span>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'right' }}>דירה</th>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>שכ"ד חודשי</th>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>מסלול מומלץ</th>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>פטור מנוצל</th>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>חייב במס</th>
                    <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>מס שנתי</th>
                  </tr>
                </thead>
                <tbody>
                  {mixed.apartments.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '.45rem .8rem', fontSize: 'var(--fs-14)', fontWeight: 600 }}>דירה {i + 1}</td>
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center' }}>{fmt(a.monthlyRent)}</td>
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center' }}>
                        <span className={a.route === 'exempt' ? 'badge badge-green' : 'badge badge-blue'}>
                          {a.route === 'exempt' ? 'פטור' : '10%'}
                        </span>
                      </td>
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center', color: 'var(--chip-green-tx)' }}>
                        {a.exemptionUsedMonthly > 0 ? fmt(a.exemptionUsedMonthly) + '/חודש' : '—'}
                      </td>
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center' }}>
                        {a.taxableMonthly > 0 ? fmt(a.taxableMonthly) + '/חודש' : '—'}
                      </td>
                      <td style={{ padding: '.45rem .8rem', textAlign: 'center', fontSize: 'var(--fs-14)', fontWeight: 600 }}>{fmt(a.taxAnnual)}</td>
                    </tr>
                  ))}
                  <tr className="rr-total-row">
                    <td colSpan={5} style={{ padding: '.55rem .8rem' }}>
                      סה"כ בשיוך המומלץ (פטור זמין: {fmt(mixed.adjustedExemptionMonthly)}/חודש)
                    </td>
                    <td style={{ padding: '.55rem .8rem', textAlign: 'center', color: 'var(--info)', fontSize: '15px' }}>
                      {fmt(mixed.totalTaxAnnual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '.75rem', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', padding: '.6rem .8rem', background: 'var(--gray-50)', borderRadius: 8, fontSize: '13px' }}>
                חלופה פשוטה ({mixed.bestUniformLabel}): <strong>{fmt(mixed.bestUniformTaxAnnual)}</strong> לשנה
              </div>
              <div style={{
                flex: '1 1 220px', padding: '.6rem .8rem', borderRadius: 8, fontSize: '13px',
                background: mixed.savingVsUniform > 0 ? 'var(--chip-green-bg)' : 'var(--gray-50)',
                border: mixed.savingVsUniform > 0 ? '1px solid var(--chip-green-bd)' : '1px solid var(--gray-200)',
              }}>
                {mixed.savingVsUniform > 0
                  ? <>חיסכון מהשיוך החכם: <strong style={{ color: 'var(--chip-green-tx)' }}>{fmt(mixed.savingVsUniform)}</strong> לשנה</>
                  : 'במקרה הזה אין יתרון לפיצול — השיוך האחיד הוא גם האופטימלי'}
              </div>
            </div>

            <ul style={{ paddingRight: '1.1rem', marginTop: '.6rem', fontSize: '12px', color: 'var(--gray-600)', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {mixed.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── השוואת מסלולים (על סך ההכנסה) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.9rem' }}>
        {result.routes.map(r => {
          const isBest = r.key === result.recommendedKey;
          const deduction122 = r.key === 'flat10' && eligible122f && propertyCount <= 1
            ? Math.min(rentPaidMonthly * 12, 90_000, annualRent)
            : 0;
          return (
            /* המסלול המנצח מסומן במילה ובמשקל, לא במסגרת ירוקה ותג צף:
               ההשוואה היא בין מספרים, וההבדל ביניהם הוא שאמור לבלוט */
            <div key={r.key} className={`rr-route ${isBest ? 'is-best' : ''}`}>
              <div className="rr-route-head">
                <span className="rr-route-title">{r.title}</span>
                {isBest && <span className="rr-route-best">המס הנמוך ביותר</span>}
              </div>
              <div className="rr-route-body">
                <div className="rr-amount">{fmt(r.taxAnnual)}</div>
                <div className="rr-amount-sub">
                  מס שנתי · {r.effectiveRatePct.toFixed(1)}% מהשכירות · חייב: {fmt(r.taxableAnnual)}
                </div>
                {deduction122 > 0 && (
                  <div className="rr-deduction">הופעל ניכוי 122(ו): −{fmt(deduction122)} מהבסיס</div>
                )}
                <details className="rr-how">
                  <summary>איך חושב?</summary>
                  <ul>{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </details>
                <div className="rr-pc">
                  {r.pros.map((p, i) => <div key={i} className="rr-pro">+ {p}</div>)}
                  {r.cons.map((c, i) => <div key={i} className="rr-con">− {c}</div>)}
                </div>
                {r.warnings.map((w, i) => <div key={i} className="rr-warn">{w}</div>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── המלצה ואזהרות ── */}
      {(() => {
        const exemptTax = result.routes.find(r => r.key === 'exempt')?.taxAnnual ?? 0;
        const flatTax = result.routes.find(r => r.key === 'flat10')?.taxAnnual ?? 0;
        if (eligible122f && propertyCount <= 1 && exemptTax === 0 && flatTax === 0) {
          return (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>
              <strong>שורה תחתונה:</strong> גם הפטור וגם מסלול 10% (עם ניכוי 122(ו)) יוצאים כאן אפס מס.
              במצב כזה מסלול הפטור פשוט יותר — אין תשלום עד 30.1 ואין דיווח מקוצר. הניכוי לפי 122(ו)
              הופך קריטי רק כשהשכירות מעל התקרה.
            </div>
          );
        }
        return (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            <strong>שורה תחתונה:</strong> {mixed && mixed.savingVsUniform > 0
              ? `עם ${propertyCount} דירות — השיוך החכם למעלה חוסך ${fmt(mixed.savingVsUniform)} לשנה לעומת מסלול אחיד. `
              : result.recommendationNote}
          </div>
        );
      })()}
      {result.generalWarnings.map((w, i) => (
        <div key={i} className="alert alert-warning" style={{ marginBottom: 0, fontSize: '14px' }}>{w}</div>
      ))}
    </div>
  );
}
