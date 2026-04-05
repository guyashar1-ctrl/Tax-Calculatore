import { useState, useEffect } from 'react';
import { Client, Child, IncomeTaxType, NIType, VATStatus, FamilyStatus, Gender } from '../types';
import { SETTLEMENTS_SORTED, findSettlementByName } from '../data/settlements';

function newClient(): Client {
  return {
    id: '', idNumber: '', firstName: '', lastName: '',
    birthDate: '', gender: 'male', phone: '', email: '',
    city: '', address: '',
    incomeTaxType: 'employee', niType: 'employee',
    vatStatus: 'none', businessDescription: '',
    hasExemptFromWithholding: false,
    hasTaxCoordination: false, taxCoordinationDetails: '',
    familyStatus: 'single',
    spouseName: '', spouseIdNumber: '', spouseWorking: false, spouseIncome: 0,
    children: [],
    isNewImmigrant: false, aliyahYear: 0,
    isReturningResident: false, returningYear: 0,
    disabilityPercentage: 0, disabilityType: '',
    hasAcademicDegree: false, academicDegreeYear: 0, academicDegreeType: '',
    completedIDF: false, idfReleaseYear: 0,
    completedNationalService: false, nationalServiceYear: 0,
    qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
    hasResidentialProperty: false, propertyAddress: '', numberOfProperties: 0,
    hasPension: false, pensionFundName: '',
    employeePensionPct: 0, employerPensionPct: 0,
    hasKupotGemel: false, hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
    notes: '',
    createdAt: '', updatedAt: '',
  };
}

interface Props {
  client: Client | null;
  onSave: (client: Client) => void;
  onCancel: () => void;
  onOpenCalculator: (client: Client) => void;
  onOpenDocuments: (client: Client) => void;
}

const TABS = [
  { id: 'personal',  label: '👤 אישי' },
  { id: 'taxType',   label: '🏢 סיווג מס' },
  { id: 'family',    label: '👨‍👩‍👧 משפחה' },
  { id: 'children',  label: '👶 ילדים' },
  { id: 'credits',   label: '⭐ זיכויים' },
  { id: 'assets',    label: '🏠 נכסים' },
  { id: 'notes',     label: '📝 הערות' },
];

/** הצעת ניתוב אוטומטי לסיווג ביטוח לאומי לפי מס הכנסה */
function suggestNIType(it: IncomeTaxType): NIType {
  if (it === 'employee') return 'employee';
  if (it === 'selfEmployed') return 'selfEmployed';
  if (it === 'both') return 'employeeAndSE';
  if (it === 'rentalOnly') return 'passive';
  return 'passive';
}

export default function ClientForm({ client, onSave, onCancel, onOpenCalculator, onOpenDocuments }: Props) {
  const [data, setData] = useState<Client>(client ?? newClient());
  const [tab, setTab] = useState('personal');

  const upd = <K extends keyof Client>(key: K, val: Client[K]) =>
    setData(d => ({ ...d, [key]: val }));

  // כשמשנים incomeTaxType — מציעים niType מתאים (ניתן לשינוי)
  function handleIncomeTaxTypeChange(val: IncomeTaxType) {
    upd('incomeTaxType', val);
    // עדכון niType רק אם לא שונה ידנית
    if (!data.id) upd('niType', suggestNIType(val));
  }

  // זיהוי ישוב מזכה אוטומטי לפי עיר
  useEffect(() => {
    if (data.qualifyingSettlementOverride) return;
    const found = findSettlementByName(data.city);
    if (found) {
      setData(d => ({
        ...d,
        qualifyingSettlementId: found.id,
        qualifyingSettlementCreditPoints: found.creditPoints,
      }));
    } else if (!data.qualifyingSettlementOverride) {
      setData(d => ({
        ...d,
        qualifyingSettlementId: '',
        qualifyingSettlementCreditPoints: 0,
      }));
    }
  }, [data.city, data.qualifyingSettlementOverride]);

  const isNew = !client;
  const fullName = `${data.firstName} ${data.lastName}`.trim() || 'לקוח חדש';

  function handleSave() {
    const now = new Date().toISOString();
    onSave({ ...data, id: data.id || crypto.randomUUID(), createdAt: data.createdAt || now, updatedAt: now });
  }

  // ── Children ─────────────────────────────────────────────────────────────
  function addChild() {
    upd('children', [...data.children, { id: crypto.randomUUID(), birthYear: new Date().getFullYear() - 5, hasDisability: false }]);
  }
  function updChild(id: string, f: keyof Child, v: unknown) {
    upd('children', data.children.map(c => c.id === id ? { ...c, [f]: v } : c));
  }
  function removeChild(id: string) {
    upd('children', data.children.filter(c => c.id !== id));
  }

  const isSE = data.incomeTaxType === 'selfEmployed' || data.incomeTaxType === 'both';
  const isEmp = data.incomeTaxType === 'employee' || data.incomeTaxType === 'both';
  const currentYear = new Date().getFullYear();

  const settlementInfo = SETTLEMENTS_SORTED.find(s => s.id === data.qualifyingSettlementId);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gray-900)' }}>
            {isNew ? '➕ לקוח חדש' : `✏️ ${fullName}`}
          </h1>
          {!isNew && data.idNumber && (
            <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>ת.ז. {data.idNumber} · {data.city}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {!isNew && (
            <>
              <button className="btn btn-secondary" onClick={() => onOpenDocuments(data)}>📁 מסמכים</button>
              <button className="btn btn-green btn-lg" onClick={() => onOpenCalculator(data)}>🧮 מחשבון מס</button>
            </>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
          <button className="btn btn-primary" onClick={handleSave}>💾 שמור</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: פרטים אישיים ─────────────────────────────────────────────── */}
      {tab === 'personal' && (
        <div className="card">
          <div className="card-header"><span className="card-title">👤 פרטים אישיים</span></div>
          <div className="card-body">
            <div className="form-grid form-grid-4">
              <div className="form-group">
                <label className="required">שם פרטי</label>
                <input value={data.firstName} onChange={e => upd('firstName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="required">שם משפחה</label>
                <input value={data.lastName} onChange={e => upd('lastName', e.target.value)} />
              </div>
              <div className="form-group">
                <label>תעודת זהות</label>
                <input value={data.idNumber} onChange={e => upd('idNumber', e.target.value)} maxLength={9} />
              </div>
              <div className="form-group">
                <label>תאריך לידה</label>
                <input type="date" value={data.birthDate} onChange={e => upd('birthDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label>מין</label>
                <select value={data.gender} onChange={e => upd('gender', e.target.value as Gender)}>
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
              </div>
              <div className="form-group">
                <label>טלפון</label>
                <input type="tel" value={data.phone} onChange={e => upd('phone', e.target.value)} />
              </div>
              <div className="form-group">
                <label>דוא"ל</label>
                <input type="email" value={data.email} onChange={e => upd('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>עיר מגורים</label>
                <input
                  value={data.city}
                  onChange={e => upd('city', e.target.value)}
                  placeholder="שם העיר / היישוב"
                  list="settlements-list"
                />
                <datalist id="settlements-list">
                  {SETTLEMENTS_SORTED.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div className="form-group span-full">
                <label>כתובת מלאה</label>
                <input value={data.address} onChange={e => upd('address', e.target.value)} placeholder="רחוב, מספר" />
              </div>
            </div>

            {/* זיהוי ישוב מזכה אוטומטי */}
            {settlementInfo && (
              <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                <div>
                  <strong>🏘️ זוהה ישוב מזכה אוטומטית:</strong> {settlementInfo.name} —
                  {' '}{settlementInfo.creditPoints} נקודות זיכוי לשנה (מעגל {settlementInfo.tier}׳).
                  {' '}פרטים ניתן לשנות בלשונית "זיכויים".
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: סיווג מס ─────────────────────────────────────────────────── */}
      {tab === 'taxType' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* מס הכנסה */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 סיווג מס הכנסה</span>
              <span className="badge badge-blue">מס הכנסה</span>
            </div>
            <div className="card-body">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="required">סוג נישום — מס הכנסה</label>
                  <select value={data.incomeTaxType} onChange={e => handleIncomeTaxTypeChange(e.target.value as IncomeTaxType)}>
                    <option value="employee">שכיר</option>
                    <option value="selfEmployed">עצמאי</option>
                    <option value="both">שכיר + עצמאי</option>
                    <option value="rentalOnly">הכנסות שכירות בלבד</option>
                    <option value="other">הכנסות אחרות (פסיביות)</option>
                  </select>
                </div>
                {isSE && (
                  <div className="form-group">
                    <label>מעמד מע"מ</label>
                    <select value={data.vatStatus} onChange={e => upd('vatStatus', e.target.value as VATStatus)}>
                      <option value="none">לא רלוונטי</option>
                      <option value="authorizedDealer">עוסק מורשה</option>
                      <option value="exemptDealer">עוסק פטור</option>
                    </select>
                  </div>
                )}
                {isSE && (
                  <div className="form-group span-2">
                    <label>תיאור עסק / תחום עיסוק</label>
                    <input value={data.businessDescription} onChange={e => upd('businessDescription', e.target.value)} placeholder="לדוגמה: עורך דין, ייעוץ עסקי, קבלן..." />
                  </div>
                )}
                {isEmp && (
                  <>
                    <div className="form-group">
                      <label className="checkbox-row">
                        <input type="checkbox" checked={data.hasTaxCoordination} onChange={e => upd('hasTaxCoordination', e.target.checked)} />
                        תיאום מס (מספר מעסיקים / מקורות)
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="checkbox-row">
                        <input type="checkbox" checked={data.hasExemptFromWithholding} onChange={e => upd('hasExemptFromWithholding', e.target.checked)} />
                        פטור מניכוי מס במקור
                      </label>
                    </div>
                    {data.hasTaxCoordination && (
                      <div className="form-group span-2">
                        <label>פרטי תיאום מס</label>
                        <input value={data.taxCoordinationDetails} onChange={e => upd('taxCoordinationDetails', e.target.value)} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ביטוח לאומי */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🏥 סיווג ביטוח לאומי</span>
              <span className="badge badge-orange">ביטוח לאומי</span>
            </div>
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                ℹ️ סיווג ביטוח לאומי נקבע לפי הגדרת "עצמאי" ב<strong>סעיף 1 לחוק הביטוח הלאומי</strong> — ניתן להיות שכיר לצורכי מס הכנסה ועוסק שאינו עונה להגדרה לצורכי ביטוח לאומי.
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="required">סיווג לצורכי ביטוח לאומי</label>
                  <select value={data.niType} onChange={e => upd('niType', e.target.value as NIType)}>
                    <option value="employee">עובד שכיר</option>
                    <option value="selfEmployed">עצמאי (עונה להגדרה)</option>
                    <option value="nonQualifying">עוסק שאינו עונה להגדרה</option>
                    <option value="employeeAndSE">שכיר + עצמאי</option>
                    <option value="passive">לא עובד ולא עצמאי (הכנסות פסיביות)</option>
                    <option value="pensioner">פנסיונר</option>
                  </select>
                </div>
              </div>
              <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                <div>
                  <strong>⚠️ הבדל בין הסיווגים:</strong><br />
                  <strong>עצמאי (עונה להגדרה)</strong> — עובד 20+ שעות/שבוע בעסקו, או מרוויח 50%+ משכר ממוצע ממנו.<br />
                  <strong>שאינו עונה להגדרה</strong> — יש הכנסה מעסק אך אינו עומד בתנאים לעיל → משלם ב"ל מינימלי בלבד.
                </div>
              </div>
            </div>
          </div>

          {/* פנסיה לשכיר */}
          {isEmp && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏦 פנסיה (שכיר)</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-3">
                  <div className="form-group">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={data.hasPension} onChange={e => upd('hasPension', e.target.checked)} />
                      קרן פנסיה / ביטוח מנהלים
                    </label>
                  </div>
                  {data.hasPension && (
                    <>
                      <div className="form-group">
                        <label>% הפרשת עובד</label>
                        <input type="number" min={0} max={7} step={0.1} value={data.employeePensionPct || ''} onChange={e => upd('employeePensionPct', +e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>% הפרשת מעסיק</label>
                        <input type="number" min={0} max={8.33} step={0.1} value={data.employerPensionPct || ''} onChange={e => upd('employerPensionPct', +e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>שם קרן / חברת ביטוח</label>
                        <input value={data.pensionFundName} onChange={e => upd('pensionFundName', e.target.value)} />
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={data.hasKrenHashtalmut} onChange={e => upd('hasKrenHashtalmut', e.target.checked)} />
                      קרן השתלמות
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={data.hasKupotGemel} onChange={e => upd('hasKupotGemel', e.target.checked)} />
                      קופת גמל / חיסכון
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isSE && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏦 חיסכון פנסיוני (עצמאי)</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-3">
                  <div className="form-group">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={data.hasKrenHashtalmut} onChange={e => upd('hasKrenHashtalmut', e.target.checked)} />
                      קרן השתלמות
                    </label>
                  </div>
                  {data.hasKrenHashtalmut && (
                    <div className="form-group">
                      <label>הפקדה חודשית לקרן השתלמות ₪</label>
                      <input type="number" min={0} value={data.krenHashtalmutMonthly || ''} onChange={e => upd('krenHashtalmutMonthly', +e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: משפחה ────────────────────────────────────────────────────── */}
      {tab === 'family' && (
        <div className="card">
          <div className="card-header"><span className="card-title">👨‍👩‍👧 מצב משפחתי</span></div>
          <div className="card-body">
            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label>מצב משפחתי</label>
                <select value={data.familyStatus} onChange={e => upd('familyStatus', e.target.value as FamilyStatus)}>
                  <option value="single">רווק/ה</option>
                  <option value="married">נשוי/אה</option>
                  <option value="divorced">גרוש/ה</option>
                  <option value="widowed">אלמן/ה</option>
                  <option value="singleParent">הורה יחיד</option>
                </select>
              </div>
              {data.familyStatus === 'married' && (
                <>
                  <div className="form-group">
                    <label>שם בן/בת זוג</label>
                    <input value={data.spouseName} onChange={e => upd('spouseName', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>ת.ז. בן/בת זוג</label>
                    <input value={data.spouseIdNumber} onChange={e => upd('spouseIdNumber', e.target.value)} maxLength={9} />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={data.spouseWorking} onChange={e => upd('spouseWorking', e.target.checked)} />
                      בן/בת הזוג עובד/ת
                    </label>
                  </div>
                  {data.spouseWorking && (
                    <div className="form-group">
                      <label>הכנסה שנתית בן/בת זוג ₪</label>
                      <input type="number" min={0} value={data.spouseIncome || ''} onChange={e => upd('spouseIncome', +e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ילדים ────────────────────────────────────────────────────── */}
      {tab === 'children' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">👶 ילדים ({data.children.length})</span>
            <button className="btn btn-primary btn-sm" onClick={addChild}>＋ הוסף ילד</button>
          </div>
          <div className="card-body">
            {data.children.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state-icon">👶</div>
                <div className="empty-state-title">אין ילדים</div>
              </div>
            ) : (
              <div className="children-list">
                {data.children.map((child, idx) => (
                  <div key={child.id} className="child-row">
                    <span style={{ fontWeight: 600, color: 'var(--gray-600)', minWidth: '1.5rem' }}>{idx + 1}.</span>
                    <div className="form-group" style={{ flex: '0 0 130px' }}>
                      <label>שנת לידה</label>
                      <input type="number" min={1990} max={currentYear} value={child.birthYear} onChange={e => updChild(child.id, 'birthYear', +e.target.value)} />
                    </div>
                    <span style={{ color: 'var(--gray-500)', fontSize: '.85rem', marginTop: '1.2rem', whiteSpace: 'nowrap' }}>
                      גיל: {currentYear - child.birthYear}
                    </span>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>&nbsp;</label>
                      <label className="checkbox-row" style={{ marginTop: '.35rem' }}>
                        <input type="checkbox" checked={child.hasDisability} onChange={e => updChild(child.id, 'hasDisability', e.target.checked)} />
                        מוגבלות
                      </label>
                    </div>
                    {child.hasDisability && (
                      <div className="form-group" style={{ flex: '0 0 120px' }}>
                        <label>% נכות</label>
                        <input type="number" min={0} max={100} value={child.disabilityPercentage || ''} onChange={e => updChild(child.id, 'disabilityPercentage', +e.target.value)} />
                      </div>
                    )}
                    <button className="btn btn-danger btn-sm" style={{ marginTop: '1.2rem' }} onClick={() => removeChild(child.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: נקודות זיכוי ─────────────────────────────────────────────── */}
      {tab === 'credits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* ישוב מזכה */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🏘️ ישוב מזכה</span>
              {data.qualifyingSettlementId && <span className="badge badge-purple">מזוהה</span>}
            </div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label>ישוב מזכה</label>
                  <select
                    value={data.qualifyingSettlementId}
                    onChange={e => {
                      const s = SETTLEMENTS_SORTED.find(x => x.id === e.target.value);
                      setData(d => ({
                        ...d,
                        qualifyingSettlementId: e.target.value,
                        qualifyingSettlementCreditPoints: s?.creditPoints ?? 0.5,
                        qualifyingSettlementOverride: true,
                      }));
                    }}
                  >
                    <option value="">— לא ישוב מזכה —</option>
                    {SETTLEMENTS_SORTED.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {data.qualifyingSettlementId && (
                  <div className="form-group">
                    <label>נקודות זיכוי לישוב (ניתן לשינוי)</label>
                    <input
                      type="number" min={0} max={2} step={0.25}
                      value={data.qualifyingSettlementCreditPoints}
                      onChange={e => upd('qualifyingSettlementCreditPoints', +e.target.value)}
                    />
                  </div>
                )}
                {data.qualifyingSettlementId && (
                  <div className="form-group">
                    <label className="checkbox-row" style={{ marginTop: '1.5rem' }}>
                      <input type="checkbox"
                        checked={data.qualifyingSettlementOverride}
                        onChange={e => upd('qualifyingSettlementOverride', e.target.checked)}
                      />
                      הגדרה ידנית (לא עדכון אוטומטי לפי עיר)
                    </label>
                  </div>
                )}
              </div>
              {data.qualifyingSettlementId && (
                <div className="alert alert-warning" style={{ marginTop: '.75rem' }}>
                  <div>
                    ⚠️ <strong>דרישה:</strong> יש להעלות <strong>אישור מגורים בישוב מזכה</strong> לכל שנת מס רלוונטית.
                    ניתן להעלות מסמך בלשונית "מסמכים" (קטגוריה: אישור מגורים).
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* עלייה */}
          <div className="card">
            <div className="card-header"><span className="card-title">✈️ עלייה ותושבות</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={data.isNewImmigrant} onChange={e => upd('isNewImmigrant', e.target.checked)} />
                    עולה חדש
                  </label>
                </div>
                {data.isNewImmigrant && (
                  <div className="form-group">
                    <label>שנת עלייה</label>
                    <input type="number" min={1948} max={2030} value={data.aliyahYear || ''} onChange={e => upd('aliyahYear', +e.target.value)} />
                  </div>
                )}
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={data.isReturningResident} onChange={e => upd('isReturningResident', e.target.checked)} />
                    תושב חוזר ותיק
                  </label>
                </div>
                {data.isReturningResident && (
                  <div className="form-group">
                    <label>שנת חזרה</label>
                    <input type="number" min={1990} max={2030} value={data.returningYear || ''} onChange={e => upd('returningYear', +e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* נכות */}
          <div className="card">
            <div className="card-header"><span className="card-title">♿ נכות</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label>% נכות מוכרת</label>
                  <input type="number" min={0} max={100} value={data.disabilityPercentage || ''} onChange={e => upd('disabilityPercentage', +e.target.value)} placeholder="0" />
                </div>
                {data.disabilityPercentage > 0 && (
                  <div className="form-group span-2">
                    <label>גוף מאשר / סוג</label>
                    <input value={data.disabilityType} onChange={e => upd('disabilityType', e.target.value)} placeholder="ביטוח לאומי, משרד הביטחון..." />
                  </div>
                )}
              </div>
              {data.disabilityPercentage > 0 && (
                <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
                  10–29%: 0.5 נק׳ | 30–59%: 1.5 נק׳ | 60–89%: 2.5 נק׳ | 90%+: 4 נק׳
                </div>
              )}
            </div>
          </div>

          {/* השכלה */}
          <div className="card">
            <div className="card-header"><span className="card-title">🎓 השכלה</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={data.hasAcademicDegree} onChange={e => upd('hasAcademicDegree', e.target.checked)} />
                    בעל/ת תואר אקדמי
                  </label>
                </div>
                {data.hasAcademicDegree && (
                  <>
                    <div className="form-group">
                      <label>שנת סיום תואר אחרון</label>
                      <input type="number" min={1970} max={2030} value={data.academicDegreeYear || ''} onChange={e => upd('academicDegreeYear', +e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>סוג תואר</label>
                      <select value={data.academicDegreeType} onChange={e => upd('academicDegreeType', e.target.value as Client['academicDegreeType'])}>
                        <option value="">בחר...</option>
                        <option value="bachelor">תואר ראשון</option>
                        <option value="master">תואר שני</option>
                        <option value="phd">דוקטורט</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
                ℹ️ נקודת זיכוי אחת ניתנת בשנת סיום התואר בלבד (סעיף 40ב).
              </div>
            </div>
          </div>

          {/* שירות */}
          <div className="card">
            <div className="card-header"><span className="card-title">🎖️ שירות צבאי / לאומי</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={data.completedIDF} onChange={e => upd('completedIDF', e.target.checked)} />
                    שוחרר/ה מצה"ל
                  </label>
                </div>
                {data.completedIDF && (
                  <div className="form-group">
                    <label>שנת שחרור</label>
                    <input type="number" min={1970} max={2030} value={data.idfReleaseYear || ''} onChange={e => upd('idfReleaseYear', +e.target.value)} />
                  </div>
                )}
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={data.completedNationalService} onChange={e => upd('completedNationalService', e.target.checked)} />
                    שירות לאומי/אזרחי
                  </label>
                </div>
                {data.completedNationalService && (
                  <div className="form-group">
                    <label>שנת סיום</label>
                    <input type="number" min={1990} max={2030} value={data.nationalServiceYear || ''} onChange={e => upd('nationalServiceYear', +e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: נכסים ────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div className="card">
          <div className="card-header"><span className="card-title">🏠 נכסי מקרקעין</span></div>
          <div className="card-body">
            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label className="checkbox-row">
                  <input type="checkbox" checked={data.hasResidentialProperty} onChange={e => upd('hasResidentialProperty', e.target.checked)} />
                  בעלות על דירת מגורים
                </label>
              </div>
              {data.hasResidentialProperty && (
                <>
                  <div className="form-group">
                    <label>מספר דירות</label>
                    <input type="number" min={1} max={20} value={data.numberOfProperties || ''} onChange={e => upd('numberOfProperties', +e.target.value)} />
                  </div>
                  <div className="form-group span-2">
                    <label>כתובת הנכס העיקרי</label>
                    <input value={data.propertyAddress} onChange={e => upd('propertyAddress', e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: הערות ────────────────────────────────────────────────────── */}
      {tab === 'notes' && (
        <div className="card">
          <div className="card-header"><span className="card-title">📝 הערות</span></div>
          <div className="card-body">
            <div className="form-group">
              <textarea rows={8} value={data.notes} onChange={e => upd('notes', e.target.value)} placeholder="הערות, תזכורות, מצבים מיוחדים..." />
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ position: 'sticky', bottom: 0, background: 'white', padding: '.75rem 1.25rem', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
        {!isNew && <button className="btn btn-secondary" onClick={() => onOpenDocuments(data)}>📁 מסמכים</button>}
        {!isNew && <button className="btn btn-green" onClick={() => onOpenCalculator(data)}>🧮 מחשבון מס</button>}
        <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
        <button className="btn btn-primary" onClick={handleSave}>💾 שמור</button>
      </div>
    </div>
  );
}
