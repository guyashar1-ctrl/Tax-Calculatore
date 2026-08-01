import { useMemo, useState } from 'react';
import { TaxYearData, Gender } from '../../types';
import {
  calcCreditPointsV2,
  calcSettlementCredit,
  CreditProfile,
  CreditChild,
  DegreeInfo,
  DegreeKind,
} from '../../utils/creditPoints';
import { searchSettlements, EligibleSettlement } from '../../data/eligibleSettlements';

const fmt = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

// ─── כרטיסי מצב ───────────────────────────────────────────────────────────────

type CardKey =
  | 'children' | 'family' | 'service' | 'reserve' | 'degree'
  | 'immigrant' | 'disability' | 'settlement' | 'spouse';

const SITUATION_CARDS: { key: CardKey; icon: string; label: string; hint: string }[] = [
  { key: 'children',   icon: '👶', label: 'ילדים',                hint: 'נקודות לפי גיל כל ילד' },
  { key: 'family',     icon: '👨‍👩‍👧', label: 'גרוש/ה · הורה עצמאי · מזונות', hint: 'מצבים משפחתיים מיוחדים' },
  { key: 'service',    icon: '🎖️', label: 'שירות צבאי/לאומי',     hint: '36 חודשים מהשחרור' },
  { key: 'reserve',    icon: '🪖', label: 'מילואים — לוחם/ת',      hint: 'חדש מ-2026 (סעיף 39ב)' },
  { key: 'degree',     icon: '🎓', label: 'תואר / לימודי מקצוע',   hint: 'לפי שנת הסיום' },
  { key: 'immigrant',  icon: '🆕', label: 'עולה חדש',              hint: 'לפי חודשי ותק' },
  { key: 'disability', icon: '♿', label: 'נכות / עיוורון',        hint: 'פטור 9(5) — לא נקודות' },
  { key: 'settlement', icon: '🏡', label: 'יישוב מוטב',            hint: 'זיכוי 7%–20% עד תקרה' },
  { key: 'spouse',     icon: '💑', label: 'בן/בת זוג ללא הכנסה',   hint: 'סעיף 37 — בתנאים' },
];

const DEGREE_KINDS: { value: DegreeKind; label: string }[] = [
  { value: 'bachelor',   label: 'תואר ראשון' },
  { value: 'master',     label: 'תואר שני' },
  { value: 'medicine',   label: 'רפואה / רפואת שיניים' },
  { value: 'phdDirect',  label: 'דוקטורט (מסלול ישיר)' },
  { value: 'vocational', label: 'לימודי מקצוע / תעודת הוראה' },
];

interface Props {
  taxData: TaxYearData;
  year: number;
}

let childSeq = 0;

export default function CreditPointsWizard({ taxData, year }: Props) {
  const [gender, setGender] = useState<Gender>('male');
  const [active, setActive] = useState<Set<CardKey>>(new Set());
  const [annualIncome, setAnnualIncome] = useState(0);

  // ילדים
  const [children, setChildren] = useState<(CreditChild & { key: number })[]>([]);
  const [parentRole, setParentRole] = useState<'auto' | 'allowanceParent' | 'otherParent'>('auto');
  const [deferredBirth, setDeferredBirth] = useState(false);
  // משפחה
  const [isSoleParent, setIsSoleParent] = useState(false);
  const [paysChildSupport, setPaysChildSupport] = useState(false);
  const [paysAlimonyToEx, setPaysAlimonyToEx] = useState(false);
  // שירות
  const [serviceKind, setServiceKind] = useState<'military' | 'national'>('military');
  const [serviceMonths, setServiceMonths] = useState(32);
  const [releaseYear, setReleaseYear] = useState(year - 1);
  const [releaseMonth, setReleaseMonth] = useState(1);
  // מילואים
  const [reserveDays, setReserveDays] = useState(0);
  // תארים
  const [degrees, setDegrees] = useState<(DegreeInfo & { key: number })[]>([]);
  // עלייה
  const [aliyahYear, setAliyahYear] = useState(year - 1);
  const [aliyahMonth, setAliyahMonth] = useState(1);
  // נכות
  const [disabilityQualifies, setDisabilityQualifies] = useState(false);
  const [disabilityPreferential, setDisabilityPreferential] = useState(false);
  const [disabilityFullYear, setDisabilityFullYear] = useState(true);
  // יישוב
  const [settlementQuery, setSettlementQuery] = useState('');
  const [settlement, setSettlement] = useState<EligibleSettlement | null>(null);
  // בן/בת זוג
  const [spouseEligible, setSpouseEligible] = useState(false);

  const toggleCard = (key: CardKey) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (key === 'children' && children.length === 0) {
      setChildren([{ key: ++childSeq, birthYear: year - 4 }]);
    }
    if (key === 'degree' && degrees.length === 0) {
      setDegrees([{ key: ++childSeq, kind: 'bachelor', endYear: year - 1, studyYears: 3 }]);
    }
  };

  const profile: CreditProfile = useMemo(() => ({
    year,
    gender,
    children: active.has('children') ? children : [],
    parentRole: parentRole === 'auto'
      ? (gender === 'female' ? 'allowanceParent' : 'otherParent')
      : parentRole,
    deferredBirthYearPoint: active.has('children') && deferredBirth,
    isSoleParent: active.has('family') && isSoleParent,
    participatesInChildSupport: active.has('family') && paysChildSupport,
    paysAlimonyToEx: active.has('family') && paysAlimonyToEx,
    service: active.has('service')
      ? { kind: serviceKind, months: serviceMonths, releaseYear, releaseMonth }
      : undefined,
    reserveCombatDaysPrevYear: active.has('reserve') ? reserveDays : undefined,
    degrees: active.has('degree') ? degrees : [],
    isNewImmigrant: active.has('immigrant'),
    aliyahYear: active.has('immigrant') ? aliyahYear : undefined,
    aliyahMonth: active.has('immigrant') ? aliyahMonth : undefined,
    qualifiesForDisabilityExemption: active.has('disability') && disabilityQualifies,
    isPreferentialDisabled: active.has('disability') && disabilityPreferential,
    disabilityFullYear: active.has('disability') ? disabilityFullYear : true,
    spouseNoIncomeEligible: active.has('spouse') && spouseEligible,
  }), [
    year, gender, active, children, parentRole, deferredBirth,
    isSoleParent, paysChildSupport, paysAlimonyToEx,
    serviceKind, serviceMonths, releaseYear, releaseMonth, reserveDays,
    degrees, aliyahYear, aliyahMonth,
    disabilityQualifies, disabilityPreferential, disabilityFullYear, spouseEligible,
  ]);

  const result = useMemo(
    () => calcCreditPointsV2(profile, taxData.creditPointValue),
    [profile, taxData.creditPointValue],
  );

  const settlementResult = useMemo(() => {
    if (!active.has('settlement') || !settlement) return null;
    return calcSettlementCredit(
      settlement.ratePercent, settlement.ceilingAnnual,
      annualIncome, settlement.name,
    );
  }, [active, settlement, annualIncome]);

  // מס משוער לניתוח ניצול (אם הוזנה הכנסה)
  const taxAnalysis = useMemo(() => {
    if (annualIncome <= 0) return null;
    let remaining = annualIncome, tax = 0, prev = 0;
    for (const b of taxData.incomeTaxBrackets) {
      if (remaining <= 0) break;
      const top = b.upTo === Infinity ? annualIncome : b.upTo;
      const t = Math.min(remaining, top - prev);
      tax += t * b.rate / 100;
      remaining -= t;
      prev = top;
    }
    const credits = result.totalValueNIS + (settlementResult?.credit ?? 0);
    const final = Math.max(0, tax - credits);
    return { taxBefore: tax, credits, final, unused: Math.max(0, credits - tax) };
  }, [annualIncome, taxData, result, settlementResult]);

  const secStyle: React.CSSProperties = { borderTop: '1px solid var(--gray-100)', paddingTop: '1rem', marginTop: '1rem' };
  const secTitle: React.CSSProperties = { fontWeight: 600, fontSize: '15px', marginBottom: '.6rem' };

  return (
    <div className="tc-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem', alignItems: 'start' }}>
      {/* ── שאלות ── */}
      <div className="card">
        <div className="card-body">
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '17px', marginBottom: '.25rem' }}>
              מה מתאר את הנישום? סמנו את כל מה שרלוונטי
            </div>
            <div style={{ fontSize: '14px', color: 'var(--gray-500)' }}>
              המערכת שואלת רק את השאלות הנדרשות וקובעת את הנקודות אוטומטית — כמו במערכת תיאום מס
            </div>
          </div>

          {/* מין + הכנסה */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>מין</label>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                {(['male', 'female'] as Gender[]).map(g => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={gender === g ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ padding: '.4rem 1rem' }}>
                    {g === 'male' ? 'גבר' : 'אישה (+0.5)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label>הכנסה שנתית מיגיעה אישית (לא חובה — לניתוח ניצול)</label>
              <input type="number" min={0} value={annualIncome || ''} placeholder="0"
                onChange={e => setAnnualIncome(+e.target.value)} />
            </div>
          </div>

          {/* כרטיסי מצב */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '.6rem' }}>
            {SITUATION_CARDS.map(c => {
              const on = active.has(c.key);
              return (
                <button key={c.key} type="button" onClick={() => toggleCard(c.key)}
                  style={{
                    textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit',
                    padding: '.7rem .8rem', borderRadius: 10,
                    border: on ? '2px solid var(--blue)' : '1px solid var(--gray-200)',
                    background: on ? 'var(--blue-light)' : 'var(--card)',
                    boxShadow: on ? 'none' : '0 1px 2px rgba(0,0,0,.04)',
                  }}>
                  <div style={{ fontSize: '20px' }}>{c.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: on ? 'var(--blue-dark)' : 'var(--gray-800)' }}>{c.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{c.hint}</div>
                </button>
              );
            })}
          </div>

          {/* ── שאלות דינמיות ── */}

          {active.has('children') && (
            <div style={secStyle}>
              <div style={secTitle}>ילדים</div>
              <div className="form-group" style={{ maxWidth: 320 }}>
                <label>מי ההורה שמקבל את קצבת הילדים / הילדים בחזקתו?</label>
                <select value={parentRole} onChange={e => setParentRole(e.target.value as typeof parentRole)}>
                  <option value="auto">{gender === 'female' ? 'הנישומה (ברירת מחדל לאם)' : 'ההורה השני (ברירת מחדל לאב)'}</option>
                  <option value="allowanceParent">הנישום/ה — מסלול מקבל הקצבה</option>
                  <option value="otherParent">ההורה השני מקבל — מסלול ההורה השני</option>
                </select>
              </div>
              {children.map((c, i) => (
                <div key={c.key} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>שנת לידה — ילד/ה {i + 1}</label>
                    <input type="number" min={year - 19} max={year} value={c.birthYear}
                      onChange={e => setChildren(arr => arr.map(x => x.key === c.key ? { ...x, birthYear: +e.target.value } : x))}
                      style={{ width: 110 }} />
                  </div>
                  <label className="checkbox-row" style={{ paddingBottom: '.5rem' }}>
                    <input type="checkbox" checked={!!c.hasDisability}
                      onChange={e => setChildren(arr => arr.map(x => x.key === c.key ? { ...x, hasDisability: e.target.checked } : x))} />
                    נטול/ת יכולת (+2 נק')
                  </label>
                  <button type="button" className="btn btn-secondary" style={{ padding: '.3rem .6rem' }}
                    onClick={() => setChildren(arr => arr.filter(x => x.key !== c.key))}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary"
                onClick={() => setChildren(arr => [...arr, { key: ++childSeq, birthYear: year }])}>
                + הוספת ילד/ה
              </button>
              {children.some(c => year - c.birthYear === 1) && (
                <label className="checkbox-row" style={{ marginTop: '.5rem' }}>
                  <input type="checkbox" checked={deferredBirth} onChange={e => setDeferredBirth(e.target.checked)} />
                  האם דחתה נקודה משנת הלידה לשנה זו (טופס 116ד)
                </label>
              )}
            </div>
          )}

          {active.has('family') && (
            <div style={secStyle}>
              <div style={secTitle}>👨‍👩‍👧 מצב משפחתי</div>
              <label className="checkbox-row">
                <input type="checkbox" checked={isSoleParent} onChange={e => setIsSoleParent(e.target.checked)} />
                "הורה אחד" — ההורה השני נפטר או אינו רשום (+1 נק' ושני מסלולי ילדים)
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={paysChildSupport} onChange={e => setPaysChildSupport(e.target.checked)} />
                גרוש/פרוד המשתתף בכלכלת הילדים, כולל מזונות (+1 נק')
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={paysAlimonyToEx} onChange={e => setPaysAlimonyToEx(e.target.checked)} />
                נשוי/אה בשנית ומשלם/ת מזונות לבן/בת זוג לשעבר (+1 נק')
              </label>
            </div>
          )}

          {active.has('service') && (
            <div style={secStyle}>
              <div style={secTitle}>שירות צבאי / לאומי</div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>סוג שירות</label>
                  <select value={serviceKind} onChange={e => setServiceKind(e.target.value as 'military' | 'national')}>
                    <option value="military">צבאי</option>
                    <option value="national">לאומי-אזרחי</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>חודשי שירות</label>
                  <input type="number" min={0} max={60} value={serviceMonths} onChange={e => setServiceMonths(+e.target.value)} style={{ width: 90 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>שנת שחרור</label>
                  <input type="number" min={year - 4} max={year} value={releaseYear} onChange={e => setReleaseYear(+e.target.value)} style={{ width: 100 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>חודש שחרור</label>
                  <select value={releaseMonth} onChange={e => setReleaseMonth(+e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.4rem' }}>
                שירות מלא (23+ חודשים לגבר, 22+ לאישה, 24 בשירות לאומי) = 2 נקודות לשנה · שירות חלקי (12+) = נקודה · למשך 36 חודשים מהחודש שאחרי השחרור
              </div>
            </div>
          )}

          {active.has('reserve') && (
            <div style={secStyle}>
              <div style={secTitle}>מילואים — לוחם/ת (סעיף 39ב)</div>
              <div className="form-group" style={{ maxWidth: 260 }}>
                <label>ימי מילואים כלוחם/ת בשנת {year - 1}</label>
                <input type="number" min={0} max={365} value={reserveDays || ''} placeholder="0" onChange={e => setReserveDays(+e.target.value)} />
              </div>
              {year < 2026 ? (
                <div className="alert alert-warning" style={{ marginBottom: 0 }}>הזיכוי חל רק משנת המס 2026 ואילך</div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                  30–39 ימים = 0.5 נק' · 40–49 = 0.75 · מ-50: נקודה + רבע לכל 5 ימים · עד 4 נקודות
                </div>
              )}
            </div>
          )}

          {active.has('degree') && (
            <div style={secStyle}>
              <div style={secTitle}>תארים ולימודי מקצוע</div>
              {degrees.map((d, i) => (
                <div key={d.key} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>סוג {i + 1}</label>
                    <select value={d.kind} onChange={e => setDegrees(arr => arr.map(x => x.key === d.key ? { ...x, kind: e.target.value as DegreeKind } : x))}>
                      {DEGREE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>שנת סיום</label>
                    <input type="number" min={2010} max={year} value={d.endYear} style={{ width: 100 }}
                      onChange={e => setDegrees(arr => arr.map(x => x.key === d.key ? { ...x, endYear: +e.target.value } : x))} />
                  </div>
                  {(d.kind === 'bachelor' || d.kind === 'vocational') && d.endYear >= 2023 && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>שנות לימוד</label>
                      <input type="number" min={1} max={6} value={d.studyYears ?? 3} style={{ width: 80 }}
                        onChange={e => setDegrees(arr => arr.map(x => x.key === d.key ? { ...x, studyYears: +e.target.value } : x))} />
                    </div>
                  )}
                  <button type="button" className="btn btn-secondary" style={{ padding: '.3rem .6rem' }}
                    onClick={() => setDegrees(arr => arr.filter(x => x.key !== d.key))}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary"
                onClick={() => setDegrees(arr => [...arr, { key: ++childSeq, kind: 'bachelor', endYear: year - 1, studyYears: 3 }])}>
                + הוספת תואר/תעודה
              </button>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.4rem' }}>
                מסיימי 2023 ואילך: נקודה לכל שנת לימוד (עד 3) · מסיימי 2014–2022: שנה אחת בלבד
              </div>
            </div>
          )}

          {active.has('immigrant') && (
            <div style={secStyle}>
              <div style={secTitle}>עולה חדש</div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>שנת עלייה</label>
                  <input type="number" min={year - 6} max={year} value={aliyahYear} onChange={e => setAliyahYear(+e.target.value)} style={{ width: 100 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>חודש עלייה</label>
                  <select value={aliyahMonth} onChange={e => setAliyahMonth(+e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.4rem' }}>
                עלייה מ-2022: מסלול 54 חודשים (עד 8.5 נק') · לפני 2022: מסלול 42 חודשים (עד 7.5 נק')
              </div>
            </div>
          )}

          {active.has('disability') && (
            <div style={secStyle}>
              <div style={secTitle}>נכות / עיוורון — פטור סעיף 9(5)</div>
              <div className="alert alert-info" style={{ fontSize: '13px' }}>
                בניגוד לתפיסה נפוצה — <strong>אין נקודות זיכוי לפי אחוזי נכות</strong>. ההטבה היא פטור ממס על ההכנסה, לעיוור או נכה 100% (או 90%+ משוקלל) שנקבעה ל-185 ימים ומעלה.
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={disabilityQualifies} onChange={e => setDisabilityQualifies(e.target.checked)} />
                עומד/ת בתנאי הפטור (עיוור/ת או נכות 100% / 90%+ משוקלל, 185+ ימים)
              </label>
              {disabilityQualifies && (
                <>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={disabilityFullYear} onChange={e => setDisabilityFullYear(e.target.checked)} />
                    הנכות נקבעה ל-365 ימים ומעלה (אחרת — תקרה מוקטנת)
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={disabilityPreferential} onChange={e => setDisabilityPreferential(e.target.checked)} />
                    זכאי/ת תגמול לפי חוק הנכים (צה"ל) או נפגעי פעולות איבה (תקרה מוגדלת)
                  </label>
                </>
              )}
            </div>
          )}

          {active.has('settlement') && (
            <div style={secStyle}>
              <div style={secTitle}>יישוב מוטב (סעיף 11)</div>
              <div className="form-group" style={{ maxWidth: 320, position: 'relative' }}>
                <label>שם היישוב</label>
                <input type="text" value={settlement ? settlement.name : settlementQuery}
                  placeholder="התחילו להקליד..."
                  onChange={e => { setSettlement(null); setSettlementQuery(e.target.value); }} />
                {!settlement && settlementQuery && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20,
                    background: 'var(--card)', border: '1px solid var(--gray-200)', borderRadius: 8,
                    boxShadow: '0 8px 20px rgba(0,0,0,.1)', maxHeight: 220, overflowY: 'auto',
                  }}>
                    {searchSettlements(settlementQuery, year).map(s => (
                      <div key={s.name} onClick={() => { setSettlement(s); setSettlementQuery(''); }}
                        style={{ padding: '.45rem .75rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--gray-100)' }}>
                        <span>{s.name}</span>
                        <span style={{ color: 'var(--green-dark)', fontWeight: 600, fontSize: '13px' }}>
                          {s.ratePercent}% עד {fmt(s.ceilingAnnual)}
                        </span>
                      </div>
                    ))}
                    {searchSettlements(settlementQuery, year).length === 0 && (
                      <div style={{ padding: '.45rem .75rem', color: 'var(--gray-500)', fontSize: '14px' }}>
                        לא נמצא ברשימת {year} — ייתכן שהיישוב אינו זכאי
                      </div>
                    )}
                  </div>
                )}
              </div>
              {settlement && (
                <div className="alert alert-info" style={{ fontSize: '13px', marginBottom: 0 }}>
                  {settlement.name}: זיכוי <strong>{settlement.ratePercent}%</strong> מההכנסה מיגיעה אישית, עד תקרה <strong>{fmt(settlement.ceilingAnnual)}</strong> לשנה.
                  {annualIncome <= 0 && ' הזינו הכנסה שנתית למעלה כדי לראות את שווי הזיכוי.'}
                </div>
              )}
            </div>
          )}

          {active.has('spouse') && (
            <div style={secStyle}>
              <div style={secTitle}>בן/בת זוג ללא הכנסה (סעיף 37)</div>
              <div className="alert alert-warning" style={{ fontSize: '13px' }}>
                הנקודה ניתנת רק לנשואים, ורק כאשר אחד מבני הזוג הגיע לגיל פרישה או שהוא עיוור/נכה. אין נקודה על "בן זוג לא עובד" סתם.
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={spouseEligible} onChange={e => setSpouseEligible(e.target.checked)} />
                מתקיימים התנאים (+1 נק')
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── סיכום חי ── */}
      <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        <div className="card" style={{ border: '2px solid var(--blue-border)' }}>
          <div className="card-header" style={{ background: 'var(--blue-light)' }}>
            <span className="card-title" style={{ color: 'var(--blue-dark)' }}>סיכום — {year}</span>
          </div>
          <div className="card-body">
            <div style={{ textAlign: 'center', marginBottom: '.75rem' }}>
              <div style={{ fontSize: '34px', fontWeight: 600, color: 'var(--blue-dark)' }}>
                {result.totalPoints.toFixed(2)} <span style={{ fontSize: '15px', fontWeight: 600 }}>נקודות</span>
              </div>
              <div style={{ fontSize: '15px', color: 'var(--green-dark)', fontWeight: 600 }}>
                {fmt(result.totalValueNIS)} לשנה · {fmt(result.totalValueNIS / 12)} לחודש
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              {result.lines.map((l, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--gray-100)', paddingBottom: '.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ fontWeight: 600 }}>{l.description}</span>
                    <span style={{ color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.points}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)' }}>
                    <span>{l.explanation ?? ''}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{l.legalBasis}</span>
                  </div>
                </div>
              ))}
            </div>

            {settlementResult && (
              <div style={{ marginTop: '.6rem', padding: '.5rem .7rem', background: 'var(--green-light, var(--chip-green-bg))', borderRadius: 8, fontSize: '13px' }}>
                <strong>+ זיכוי יישוב מוטב: {fmt(settlementResult.credit)}</strong>
                <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '.2rem' }}>{settlementResult.explanation}</div>
              </div>
            )}

            {result.disabilityExemption && (
              <div style={{ marginTop: '.6rem', padding: '.5rem .7rem', background: 'var(--chip-yellow-bg)', borderRadius: 8, fontSize: '13px' }}>
                <strong>פטור נכה/עיוור (9(5)):</strong> {result.disabilityExemption.explanation}
              </div>
            )}

            {taxAnalysis && (
              <div style={{ marginTop: '.75rem', borderTop: '2px solid var(--gray-100)', paddingTop: '.6rem', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>מס לפני זיכויים:</span><strong>{fmt(taxAnalysis.taxBefore)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green-dark)' }}>
                  <span>סך זיכויים:</span><strong>−{fmt(Math.min(taxAnalysis.credits, taxAnalysis.taxBefore))}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '15px' }}>
                  <span>מס לתשלום:</span><span>{fmt(taxAnalysis.final)}</span>
                </div>
                {taxAnalysis.unused > 0 && (
                  <div style={{ marginTop: '.4rem', fontSize: '12px', color: 'var(--warn)' }}>
                    {fmt(taxAnalysis.unused)} מהזיכויים לא מנוצלים — נקודות זיכוי אינן מוחזרות ואינן נצברות
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {result.notes.length > 0 && (
          <div className="card">
            <div className="card-body" style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
              <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>הערות מקצועיות</div>
              <ul style={{ paddingRight: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {result.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
