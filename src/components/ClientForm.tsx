import { useState, useEffect, useMemo } from 'react';
import { Client, Child, SpouseData, EMPTY_SPOUSE, IncomeTaxType, NIType, VATStatus, FamilyStatus, Gender, Task } from '../types';
import { SETTLEMENTS_SORTED, findSettlementByName } from '../data/settlements';
import { calcCreditPoints, calcSpouseCreditPoints } from '../utils/taxCalculations';
import { getTaxYearData } from '../data/taxData';
import TaskCard from './TaskCard';

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
    spouse: null,
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
  tasks?: Task[];
  onSave: (client: Client) => void;
  onCancel: () => void;
  onOpenCalculator: (client: Client) => void;
  onOpenDocuments: (client: Client) => void;
  onAddTaskForClient?: (clientId: string) => void;
  onSelectTask?: (id: string) => void;
  onToggleTaskDone?: (id: string) => void;
}

function getTabs(isMarried: boolean, isExisting: boolean) {
  const tabs = [
    { id: 'personal',  label: '\u{1F464} אישי' },
    { id: 'taxType',   label: '\u{1F3E2} סיווג מס' },
    { id: 'family',    label: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} משפחה' },
    ...(isMarried ? [{ id: 'spouse', label: '\u{1F491} בן/בת זוג' }] : []),
    { id: 'children',  label: '\u{1F476} ילדים' },
    { id: 'credits',   label: '\u2B50 זיכויים' },
    { id: 'assets',    label: '\u{1F3E0} נכסים' },
    { id: 'notes',     label: '\u{1F4DD} הערות' },
    ...(isExisting ? [{ id: 'tasks', label: '\u2705 משימות' }] : []),
  ];
  return tabs;
}

/** הצעת ניתוב אוטומטי לסיווג ביטוח לאומי לפי מס הכנסה */
function suggestNIType(it: IncomeTaxType): NIType {
  if (it === 'employee') return 'employee';
  if (it === 'selfEmployed') return 'selfEmployed';
  if (it === 'both') return 'employeeAndSE';
  if (it === 'rentalOnly') return 'passive';
  return 'passive';
}

export default function ClientForm({
  client,
  tasks = [],
  onSave,
  onCancel,
  onOpenCalculator,
  onOpenDocuments,
  onAddTaskForClient,
  onSelectTask,
  onToggleTaskDone,
}: Props) {
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
    const synced = {
      ...data,
      // סנכרון שדות ישנים מנתוני בן/בת הזוג
      spouseName: data.spouse ? `${data.spouse.firstName} ${data.spouse.lastName}`.trim() : '',
      spouseIdNumber: data.spouse?.idNumber ?? '',
      spouseWorking: data.spouse ? (data.spouse.grossSalary > 0 || data.spouse.selfEmployedGrossIncome > 0) : false,
      spouseIncome: data.spouse ? (data.spouse.grossSalary + data.spouse.selfEmployedGrossIncome) : 0,
    };
    onSave({ ...synced, id: synced.id || crypto.randomUUID(), createdAt: synced.createdAt || now, updatedAt: now });
  }

  // ── Children ─────────────────────────────────────────────────────────────
  function addChild() {
    const defaultDate = `${currentYear - 5}-01-01`;
    upd('children', [...data.children, { id: crypto.randomUUID(), birthDate: defaultDate, birthYear: currentYear - 5, hasDisability: false }]);
  }
  function updChild(id: string, f: keyof Child, v: unknown) {
    upd('children', data.children.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [f]: v };
      // סנכרון birthYear מ-birthDate
      if (f === 'birthDate' && typeof v === 'string' && v) {
        updated.birthYear = new Date(v).getFullYear();
      }
      return updated;
    }));
  }
  function removeChild(id: string) {
    upd('children', data.children.filter(c => c.id !== id));
  }

  const isSE = data.incomeTaxType === 'selfEmployed' || data.incomeTaxType === 'both';
  const isEmp = data.incomeTaxType === 'employee' || data.incomeTaxType === 'both';
  const currentYear = new Date().getFullYear();
  const isMarried = data.familyStatus === 'married';
  const TABS = getTabs(isMarried, !isNew);
  const clientTasks = useMemo(
    () => tasks
      .filter(t => t.clientId === data.id)
      .sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      }),
    [tasks, data.id],
  );
  const openTasksCount = clientTasks.filter(t => t.status === 'open').length;

  const settlementInfo = SETTLEMENTS_SORTED.find(s => s.id === data.qualifyingSettlementId);

  // ── Spouse helpers ──
  const sp = data.spouse ?? EMPTY_SPOUSE;
  function updSp<K extends keyof SpouseData>(key: K, val: SpouseData[K]) {
    setData(d => ({ ...d, spouse: { ...(d.spouse ?? EMPTY_SPOUSE), [key]: val } }));
  }
  const spIsSE = sp.incomeTaxType === 'selfEmployed' || sp.incomeTaxType === 'both';
  const spIsEmp = sp.incomeTaxType === 'employee' || sp.incomeTaxType === 'both';

  // Auto-init spouse when switching to married
  useEffect(() => {
    if (isMarried && !data.spouse) {
      setData(d => ({ ...d, spouse: { ...EMPTY_SPOUSE } }));
    }
  }, [isMarried, data.spouse]);

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
          <div className="card-header"><span className="card-title">{'\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'} מצב משפחתי</span></div>
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
            </div>
            {isMarried && (
              <div className="alert alert-info" style={{ marginTop: '1rem', cursor: 'pointer' }} onClick={() => setTab('spouse')}>
                {'\u{1F491}'} <strong>נשוי/אה</strong> — יש להזין את פרטי בן/בת הזוג בטאב <strong>"בן/בת זוג"</strong> לחישוב תא משפחתי.
                <span style={{ color: 'var(--blue)', textDecoration: 'underline', marginRight: '.5rem' }}>
                  {'\u2190'} עבור לטאב בן/בת זוג
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: בן/בת זוג ──────────────────────────────────────────────── */}
      {tab === 'spouse' && isMarried && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* פרטים אישיים */}
          <div className="card">
            <div className="card-header"><span className="card-title">{'\u{1F464}'} פרטים אישיים — בן/בת זוג</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-4">
                <div className="form-group">
                  <label>שם פרטי</label>
                  <input value={sp.firstName} onChange={e => updSp('firstName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>שם משפחה</label>
                  <input value={sp.lastName} onChange={e => updSp('lastName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>ת.ז.</label>
                  <input value={sp.idNumber} onChange={e => updSp('idNumber', e.target.value)} maxLength={9} />
                </div>
                <div className="form-group">
                  <label>תאריך לידה</label>
                  <input type="date" value={sp.birthDate} onChange={e => updSp('birthDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>מין</label>
                  <select value={sp.gender} onChange={e => updSp('gender', e.target.value as Gender)}>
                    <option value="male">זכר</option>
                    <option value="female">נקבה</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>טלפון</label>
                  <input type="tel" value={sp.phone} onChange={e => updSp('phone', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* סיווג מס */}
          <div className="card">
            <div className="card-header"><span className="card-title">{'\u{1F3E2}'} סיווג מס — בן/בת זוג</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label>סיווג מס הכנסה</label>
                  <select value={sp.incomeTaxType} onChange={e => {
                    const v = e.target.value as IncomeTaxType;
                    updSp('incomeTaxType', v);
                    const niMap: Record<string, NIType> = { employee: 'employee', selfEmployed: 'selfEmployed', both: 'employeeAndSE', rentalOnly: 'passive', other: 'passive' };
                    updSp('niType', niMap[v] || 'passive');
                  }}>
                    <option value="employee">שכיר/ה</option>
                    <option value="selfEmployed">עצמאי/ת</option>
                    <option value="both">שכיר/ה + עצמאי/ת</option>
                    <option value="other">לא עובד/ת</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>סיווג ביטוח לאומי</label>
                  <select value={sp.niType} onChange={e => updSp('niType', e.target.value as NIType)}>
                    <option value="employee">עובד/ת שכיר/ה</option>
                    <option value="selfEmployed">עצמאי/ת</option>
                    <option value="employeeAndSE">שכיר/ה + עצמאי/ת</option>
                    <option value="passive">לא עובד/ת / פסיבי</option>
                    <option value="pensioner">פנסיונר/ית</option>
                  </select>
                </div>
                {(sp.incomeTaxType === 'selfEmployed' || sp.incomeTaxType === 'both') && (
                  <>
                    <div className="form-group">
                      <label>סטטוס מע"מ</label>
                      <select value={sp.vatStatus} onChange={e => updSp('vatStatus', e.target.value as VATStatus)}>
                        <option value="none">לא רלוונטי</option>
                        <option value="authorizedDealer">עוסק מורשה</option>
                        <option value="exemptDealer">עוסק פטור</option>
                      </select>
                    </div>
                    <div className="form-group span-full">
                      <label>תיאור עסק</label>
                      <input value={sp.businessDescription} onChange={e => updSp('businessDescription', e.target.value)} placeholder="תחום עיסוק..." />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* הכנסות */}
          <div className="card">
            <div className="card-header"><span className="card-title">{'\u{1F4B0}'} הכנסות — בן/בת זוג</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                {spIsEmp && (
                  <div className="form-group">
                    <label>שכר שנתי ברוטו ₪</label>
                    <input type="number" min={0} value={sp.grossSalary || ''} onChange={e => updSp('grossSalary', +e.target.value)} />
                  </div>
                )}
                {spIsSE && (
                  <>
                    <div className="form-group">
                      <label>הכנסה עצמאית שנתית ברוטו ₪</label>
                      <input type="number" min={0} value={sp.selfEmployedGrossIncome || ''} onChange={e => updSp('selfEmployedGrossIncome', +e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>הוצאות מוכרות ₪</label>
                      <input type="number" min={0} value={sp.recognizedExpenses || ''} onChange={e => updSp('recognizedExpenses', +e.target.value)} />
                    </div>
                  </>
                )}
                {sp.incomeTaxType === 'other' && (
                  <div className="alert alert-info span-full">
                    {'\u2139\uFE0F'} בן/בת הזוג לא עובד/ת — לא נדרשת הזנת הכנסות. נקודות הזיכוי יחושבו אוטומטית.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* פנסיה */}
          <div className="card">
            <div className="card-header"><span className="card-title">{'\u{1F3E6}'} פנסיה וחיסכון — בן/בת זוג</span></div>
            <div className="card-body">
              <div className="form-grid form-grid-3">
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={sp.hasPension} onChange={e => updSp('hasPension', e.target.checked)} />
                    יש פנסיה
                  </label>
                </div>
                {sp.hasPension && (
                  <>
                    <div className="form-group">
                      <label>שם קרן פנסיה</label>
                      <input value={sp.pensionFundName} onChange={e => updSp('pensionFundName', e.target.value)} />
                    </div>
                    {spIsEmp && (
                      <>
                        <div className="form-group">
                          <label>ניכוי עובד %</label>
                          <input type="number" min={0} max={7} step={0.5} value={sp.employeePensionPct || ''} onChange={e => updSp('employeePensionPct', +e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>הפרשת מעסיק %</label>
                          <input type="number" min={0} max={7.5} step={0.5} value={sp.employerPensionPct || ''} onChange={e => updSp('employerPensionPct', +e.target.value)} />
                        </div>
                      </>
                    )}
                    {spIsSE && (
                      <div className="form-group">
                        <label>הפקדה שנתית לפנסיה עצמאי ₪</label>
                        <input type="number" min={0} value={sp.selfEmployedPensionAmount || ''} onChange={e => updSp('selfEmployedPensionAmount', +e.target.value)} />
                      </div>
                    )}
                  </>
                )}
                <div className="form-group">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={sp.hasKrenHashtalmut} onChange={e => updSp('hasKrenHashtalmut', e.target.checked)} />
                    קרן השתלמות
                  </label>
                </div>
                {sp.hasKrenHashtalmut && spIsSE && (
                  <div className="form-group">
                    <label>הפקדה שנתית לקרן השתלמות עצמאי ₪</label>
                    <input type="number" min={0} value={sp.krenHashtalmutSE || ''} onChange={e => updSp('krenHashtalmutSE', +e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── TAB: ילדים ────────────────────────────────────────────────────── */}
      {tab === 'children' && (
        <ChildrenTab
          children={data.children}
          currentYear={currentYear}
          onAdd={addChild}
          onUpdate={updChild}
          onRemove={removeChild}
        />
      )}

      {/* ── TAB: נקודות זיכוי ─────────────────────────────────────────────── */}
      {tab === 'credits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* שני טורים כשנשוי */}
          <div style={{ display: 'grid', gridTemplateColumns: isMarried ? '1fr 1fr' : '1fr', gap: '1rem', alignItems: 'start' }}>
            {/* ──── טור ראשי ──── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--blue)', padding: '.25rem 0' }}>
                {'\u{1F464}'} {data.firstName || 'נישום ראשי'}
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">{'\u{1F3D8}\uFE0F'} ישוב מזכה</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label>ישוב מזכה</label>
                      <select value={data.qualifyingSettlementId} onChange={e => {
                        const s = SETTLEMENTS_SORTED.find(x => x.id === e.target.value);
                        setData(d => ({ ...d, qualifyingSettlementId: e.target.value, qualifyingSettlementCreditPoints: s?.creditPoints ?? 0.5, qualifyingSettlementOverride: true }));
                      }}>
                        <option value="">— לא —</option>
                        {SETTLEMENTS_SORTED.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    {data.qualifyingSettlementId && (
                      <div className="form-group">
                        <label>נקודות</label>
                        <input type="number" min={0} max={2} step={0.25} value={data.qualifyingSettlementCreditPoints} onChange={e => upd('qualifyingSettlementCreditPoints', +e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">{'\u2708\uFE0F'} עלייה / תושבות</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={data.isNewImmigrant} onChange={e => upd('isNewImmigrant', e.target.checked)} /> עולה חדש</label></div>
                    {data.isNewImmigrant && <div className="form-group"><label>שנת עלייה</label><input type="number" min={1948} max={2030} value={data.aliyahYear || ''} onChange={e => upd('aliyahYear', +e.target.value)} /></div>}
                    <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={data.isReturningResident} onChange={e => upd('isReturningResident', e.target.checked)} /> תושב חוזר</label></div>
                    {data.isReturningResident && <div className="form-group"><label>שנת חזרה</label><input type="number" min={1990} max={2030} value={data.returningYear || ''} onChange={e => upd('returningYear', +e.target.value)} /></div>}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">{'\u267F'} נכות</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group"><label>% נכות</label><input type="number" min={0} max={100} value={data.disabilityPercentage || ''} onChange={e => upd('disabilityPercentage', +e.target.value)} placeholder="0" /></div>
                    {data.disabilityPercentage > 0 && <div className="form-group"><label>גוף מאשר</label><input value={data.disabilityType} onChange={e => upd('disabilityType', e.target.value)} /></div>}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">{'\u{1F393}'} השכלה</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={data.hasAcademicDegree} onChange={e => upd('hasAcademicDegree', e.target.checked)} /> תואר אקדמי</label></div>
                    {data.hasAcademicDegree && <>
                      <div className="form-group"><label>שנת סיום</label><input type="number" min={1970} max={2030} value={data.academicDegreeYear || ''} onChange={e => upd('academicDegreeYear', +e.target.value)} /></div>
                      <div className="form-group"><label>סוג</label><select value={data.academicDegreeType} onChange={e => upd('academicDegreeType', e.target.value as Client['academicDegreeType'])}><option value="">בחר...</option><option value="bachelor">ראשון</option><option value="master">שני</option><option value="phd">דוקטורט</option></select></div>
                    </>}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span className="card-title">{'\u{1F396}\uFE0F'} שירות צבאי / לאומי</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={data.completedIDF} onChange={e => upd('completedIDF', e.target.checked)} /> {`צה"ל`}</label></div>
                    {data.completedIDF && <div className="form-group"><label>שנת שחרור</label><input type="number" min={1970} max={2030} value={data.idfReleaseYear || ''} onChange={e => upd('idfReleaseYear', +e.target.value)} /></div>}
                    <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={data.completedNationalService} onChange={e => upd('completedNationalService', e.target.checked)} /> שירות לאומי</label></div>
                    {data.completedNationalService && <div className="form-group"><label>שנת סיום</label><input type="number" min={1990} max={2030} value={data.nationalServiceYear || ''} onChange={e => upd('nationalServiceYear', +e.target.value)} /></div>}
                  </div>
                </div>
              </div>
            </div>

            {/* ──── טור בן/בת זוג (רק כשנשוי) ──── */}
            {isMarried && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--purple)', padding: '.25rem 0' }}>
                  {'\u{1F491}'} {sp.firstName || 'בן/בת זוג'}
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">{'\u{1F3D8}\uFE0F'} ישוב מזכה</span></div>
                  <div className="card-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.qualifyingSettlementOverride} onChange={e => updSp('qualifyingSettlementOverride', e.target.checked)} /> שונה מהנישום</label></div>
                      {sp.qualifyingSettlementOverride ? (
                        <div className="form-group"><label>ישוב</label><select value={sp.qualifyingSettlementId} onChange={e => { const s = SETTLEMENTS_SORTED.find(x => x.id === e.target.value); updSp('qualifyingSettlementId', e.target.value); if (s) updSp('qualifyingSettlementCreditPoints', s.creditPoints); }}><option value="">— לא —</option>{SETTLEMENTS_SORTED.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                      ) : data.qualifyingSettlementId ? (
                        <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', paddingTop: '1.5rem' }}>זהה: {settlementInfo?.name}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">{'\u2708\uFE0F'} עלייה / תושבות</span></div>
                  <div className="card-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.isNewImmigrant} onChange={e => updSp('isNewImmigrant', e.target.checked)} /> עולה חדש/ה</label></div>
                      {sp.isNewImmigrant && <div className="form-group"><label>שנת עלייה</label><input type="number" min={1948} max={2030} value={sp.aliyahYear || ''} onChange={e => updSp('aliyahYear', +e.target.value)} /></div>}
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.isReturningResident} onChange={e => updSp('isReturningResident', e.target.checked)} /> תושב/ת חוזר/ת</label></div>
                      {sp.isReturningResident && <div className="form-group"><label>שנת חזרה</label><input type="number" min={1990} max={2030} value={sp.returningYear || ''} onChange={e => updSp('returningYear', +e.target.value)} /></div>}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">{'\u267F'} נכות</span></div>
                  <div className="card-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group"><label>% נכות</label><input type="number" min={0} max={100} value={sp.disabilityPercentage || ''} onChange={e => updSp('disabilityPercentage', +e.target.value)} placeholder="0" /></div>
                      {sp.disabilityPercentage > 0 && <div className="form-group"><label>גוף מאשר</label><input value={sp.disabilityType} onChange={e => updSp('disabilityType', e.target.value)} /></div>}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">{'\u{1F393}'} השכלה</span></div>
                  <div className="card-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.hasAcademicDegree} onChange={e => updSp('hasAcademicDegree', e.target.checked)} /> תואר אקדמי</label></div>
                      {sp.hasAcademicDegree && <>
                        <div className="form-group"><label>שנת סיום</label><input type="number" min={1970} max={2030} value={sp.academicDegreeYear || ''} onChange={e => updSp('academicDegreeYear', +e.target.value)} /></div>
                        <div className="form-group"><label>סוג</label><select value={sp.academicDegreeType} onChange={e => updSp('academicDegreeType', e.target.value as SpouseData['academicDegreeType'])}><option value="">בחר...</option><option value="bachelor">ראשון</option><option value="master">שני</option><option value="phd">דוקטורט</option></select></div>
                      </>}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><span className="card-title">{'\u{1F396}\uFE0F'} שירות צבאי / לאומי</span></div>
                  <div className="card-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.completedIDF} onChange={e => updSp('completedIDF', e.target.checked)} /> {`צה"ל`}</label></div>
                      {sp.completedIDF && <div className="form-group"><label>שנת שחרור</label><input type="number" min={1970} max={2030} value={sp.idfReleaseYear || ''} onChange={e => updSp('idfReleaseYear', +e.target.value)} /></div>}
                      <div className="form-group"><label className="checkbox-row"><input type="checkbox" checked={sp.completedNationalService} onChange={e => updSp('completedNationalService', e.target.checked)} /> שירות לאומי</label></div>
                      {sp.completedNationalService && <div className="form-group"><label>שנת סיום</label><input type="number" min={1990} max={2030} value={sp.nationalServiceYear || ''} onChange={e => updSp('nationalServiceYear', +e.target.value)} /></div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* סיכום נקודות זיכוי — תא משפחתי */}
          <CreditSummary client={data} isMarried={isMarried} sp={sp} currentYear={currentYear} />
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

      {/* ── TAB: משימות ───────────────────────────────────────────────────── */}
      {tab === 'tasks' && !isNew && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              ✅ משימות
              {openTasksCount > 0 && (
                <span className="badge badge-blue" style={{ marginInlineStart: '.5rem' }}>
                  {openTasksCount} פתוחות
                </span>
              )}
            </span>
            {onAddTaskForClient && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onAddTaskForClient(data.id)}
              >
                + משימה חדשה
              </button>
            )}
          </div>
          <div className="card-body">
            {clientTasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">אין עדיין משימות ללקוח</div>
                <div className="empty-state-subtitle">לחץ "+ משימה חדשה" כדי להתחיל</div>
              </div>
            ) : (
              <div className="task-list">
                {clientTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    client={data}
                    showClient={false}
                    showBallWith
                    onClick={() => onSelectTask?.(t.id)}
                    onToggleDone={() => onToggleTaskDone?.(t.id)}
                  />
                ))}
              </div>
            )}
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

// ─── רכיב ילדים עם תצוגת נקודות זיכוי ─────────────────────────────────────

function getChildCreditInfo(birthYear: number, taxYear: number): { label: string; pts: number; color: string } | null {
  const age = taxYear - birthYear;
  if (age < 0 || age > 18) return null;
  if (age === 0) return { label: 'שנת לידה', pts: 1.5, color: '#ec4899' };
  if (age <= 5) return { label: `גיל ${age} (1–5)`, pts: 2.5, color: '#8b5cf6' };
  if (age <= 12) return { label: `גיל ${age} (6–12)`, pts: 2.0, color: '#2563eb' };
  if (age <= 17) return { label: `גיל ${age} (13–17)`, pts: 1.0, color: '#059669' };
  if (age === 18) return { label: 'גיל 18', pts: 0.5, color: '#6b7280' };
  return null;
}

function formatAge(birthDate: string): string {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} חודשים`;
  if (months === 0) return `${years} שנים`;
  return `${years} שנים ו-${months} חודשים`;
}

function ChildrenTab({ children, currentYear, onAdd, onUpdate, onRemove }: {
  children: Child[];
  currentYear: number;
  onAdd: () => void;
  onUpdate: (id: string, f: keyof Child, v: unknown) => void;
  onRemove: (id: string) => void;
}) {
  const taxYear = currentYear;
  const taxData = getTaxYearData(taxYear);
  const cpValue = taxData?.creditPointValue ?? 2904;

  // חישוב נקודות זיכוי לילדים בלבד
  const childCredits = useMemo(() => {
    return children.map(child => {
      const info = getChildCreditInfo(child.birthYear, taxYear);
      let disabilityPts = 0;
      if (child.hasDisability && child.disabilityPercentage) {
        const dp = child.disabilityPercentage;
        disabilityPts = dp >= 90 ? 2 : dp >= 60 ? 1 : dp >= 30 ? 0.5 : 0;
      }
      return { child, info, disabilityPts };
    });
  }, [children, taxYear]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* רשימת ילדים */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{'\u{1F476}'} ילדים ({children.length})</span>
          <button className="btn btn-primary btn-sm" onClick={onAdd}>+ הוסף ילד</button>
        </div>
        <div className="card-body">
          {children.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <div className="empty-state-icon">{'\u{1F476}'}</div>
              <div className="empty-state-title">אין ילדים</div>
              <div className="empty-state-desc">הוסף ילדים כדי לחשב נקודות זיכוי</div>
            </div>
          ) : (
            <div className="children-list">
              {childCredits.map(({ child, info, disabilityPts }, idx) => (
                <div key={child.id} className="child-row" style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600, color: 'var(--gray-600)', minWidth: '1.5rem', marginTop: '.5rem' }}>{idx + 1}.</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: '0 0 160px' }}>
                        <label>תאריך לידה</label>
                        <input
                          type="date"
                          value={child.birthDate || ''}
                          onChange={e => onUpdate(child.id, 'birthDate', e.target.value)}
                        />
                      </div>
                      <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', paddingBottom: '.4rem' }}>
                        {child.birthDate && formatAge(child.birthDate)}
                      </div>
                      <div className="form-group">
                        <label className="checkbox-row" style={{ marginTop: 0 }}>
                          <input type="checkbox" checked={child.hasDisability} onChange={e => onUpdate(child.id, 'hasDisability', e.target.checked)} />
                          מוגבלות
                        </label>
                      </div>
                      {child.hasDisability && (
                        <div className="form-group" style={{ flex: '0 0 100px' }}>
                          <label>% נכות</label>
                          <input type="number" min={0} max={100} value={child.disabilityPercentage || ''} onChange={e => onUpdate(child.id, 'disabilityPercentage', +e.target.value)} />
                        </div>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => onRemove(child.id)} style={{ marginBottom: '.2rem' }}>{'\uD83D\uDDD1\uFE0F'}</button>
                    </div>
                    {/* תצוגת נקודות זיכוי */}
                    {info && (
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                          padding: '.15rem .6rem', borderRadius: 999, fontSize: '.75rem', fontWeight: 600,
                          background: info.color + '15', color: info.color, border: `1px solid ${info.color}30`,
                        }}>
                          {'\u2B50'} {info.pts} נ.ז. {'\u00B7'} {info.label}
                        </span>
                        <span style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>
                          = {'\u20AA'}{(info.pts * cpValue).toLocaleString('he-IL')} לכל הורה (סעיף 40)
                        </span>
                        {disabilityPts > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                            padding: '.15rem .6rem', borderRadius: 999, fontSize: '.75rem', fontWeight: 600,
                            background: '#f59e0b15', color: '#d97706', border: '1px solid #d9770630',
                          }}>
                            + {disabilityPts} נ.ז. נכות (סעיף 45ב)
                          </span>
                        )}
                      </div>
                    )}
                    {!info && child.birthYear > 0 && (
                      <div style={{ fontSize: '.75rem', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                        גיל {taxYear - child.birthYear} — ללא נקודות זיכוי בשנת מס {taxYear}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── סיכום נקודות זיכוי (מוצג בטאב זיכויים) ───────────────────────────────

function CreditSummary({ client, isMarried, sp, currentYear }: {
  client: Client;
  isMarried: boolean;
  sp: SpouseData;
  currentYear: number;
}) {
  const taxYear = currentYear;
  const taxData = getTaxYearData(taxYear);
  const cpValue = taxData?.creditPointValue ?? 2904;

  const primaryCredits = useMemo(() => {
    if (!taxData) return [];
    return calcCreditPoints(client, taxYear, cpValue);
  }, [client, taxYear, cpValue, taxData]);

  const spouseCredits = useMemo(() => {
    if (!isMarried || !taxData) return [];
    return calcSpouseCreditPoints(sp, client.children, taxYear, cpValue);
  }, [sp, client.children, isMarried, taxYear, cpValue, taxData]);

  const primaryTotal = primaryCredits.reduce((s, l) => s + l.points, 0);
  const spouseTotal = spouseCredits.reduce((s, l) => s + l.points, 0);

  const childPts = client.children.reduce((s, child) => {
    const age = taxYear - child.birthYear;
    if (age < 0 || age > 18) return s;
    if (age === 0) return s + 1.5;
    if (age <= 5) return s + 2.5;
    if (age <= 12) return s + 2.0;
    if (age <= 17) return s + 1.0;
    if (age === 18) return s + 0.5;
    return s;
  }, 0);

  return (
    <div className="card" style={{ border: '2px solid var(--purple)', borderRadius: 'var(--radius-lg)' }}>
      <div className="card-header" style={{ background: 'var(--purple-light)' }}>
        <span className="card-title" style={{ color: 'var(--purple)' }}>
          {'\u2B50'} סיכום נקודות זיכוי — שנת מס {taxYear}
        </span>
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: isMarried ? '1fr 1fr' : '1fr', gap: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.875rem', marginBottom: '.5rem', color: 'var(--gray-800)' }}>
              {'\u{1F464}'} {client.firstName || 'נישום ראשי'} ({client.gender === 'female' ? 'נקבה' : 'זכר'})
            </div>
            <div className="table-wrap">
              <table style={{ fontSize: '.8125rem' }}>
                <tbody>
                  {primaryCredits.map((l, i) => (
                    <tr key={i}>
                      <td style={{ padding: '.3rem .5rem' }}>{l.description}</td>
                      <td className="number" style={{ padding: '.3rem .5rem', fontWeight: 600 }}>{l.points.toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td style={{ padding: '.3rem .5rem' }}>{`סה"כ`}</td>
                    <td className="number" style={{ padding: '.3rem .5rem' }}>
                      {primaryTotal.toFixed(1)} = {'\u20AA'}{(primaryTotal * cpValue).toLocaleString('he-IL')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {isMarried && (
            <div>
              <div style={{ fontWeight: 700, fontSize: '.875rem', marginBottom: '.5rem', color: 'var(--gray-800)' }}>
                {'\u{1F491}'} {sp.firstName || 'בן/בת זוג'} ({sp.gender === 'female' ? 'נקבה' : 'זכר'})
              </div>
              <div className="table-wrap">
                <table style={{ fontSize: '.8125rem' }}>
                  <tbody>
                    {spouseCredits.map((l, i) => (
                      <tr key={i}>
                        <td style={{ padding: '.3rem .5rem' }}>{l.description}</td>
                        <td className="number" style={{ padding: '.3rem .5rem', fontWeight: 600 }}>{l.points.toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td style={{ padding: '.3rem .5rem' }}>{`סה"כ`}</td>
                      <td className="number" style={{ padding: '.3rem .5rem' }}>
                        {spouseTotal.toFixed(1)} = {'\u20AA'}{(spouseTotal * cpValue).toLocaleString('he-IL')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {childPts > 0 && (
          <div className="alert alert-info" style={{ marginTop: '1rem' }}>
            {'\u2139\uFE0F'} <strong>נקודות זיכוי לילדים (סעיף 40):</strong> מאז רפורמת 2012, <strong>שני ההורים</strong> מקבלים נקודות זיכוי עבור כל ילד.
            {' '}סה"כ ילדים: <strong>{childPts.toFixed(1)} נ.ז.</strong> לכל הורה
            = <strong>{'\u20AA'}{(childPts * cpValue).toLocaleString('he-IL')}</strong> חיסכון במס לכל אחד.
            {isMarried && (
              <> חיסכון כולל לתא המשפחתי: <strong>{'\u20AA'}{(childPts * cpValue * 2).toLocaleString('he-IL')}</strong></>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
