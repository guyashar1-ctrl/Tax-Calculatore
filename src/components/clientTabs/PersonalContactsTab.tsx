// ─── לשונית פרטים אישיים וקשרים ───────────────────────────────────────────
// הסעיפים:
//   1. 👤 פרטי נישום + ישוב מזכה (משפיע על נקודות זיכוי)
//   2. 👨‍👩‍👧 מצב משפחתי + בן/בת זוג
//   3. 👶 ילדים — עורך מלא (שם פרטי, תאריך לידה, נכות)
//   4. ⭐ זכאויות לזיכוי מס (עלייה, נכות, השכלה, צבא/לאומי)
//   5. 🏠 נכסים והשקעות (מגורים, שכירות, שוק ההון)
//   6. 👥 עובד מטפל
//   7. 🏷 תגיות
//   8. 📞 אנשי קשר — הנישום עצמו + אנשי קשר נוספים, עם סימון ראשי 🔑

import React, { useState } from 'react';
import {
  Client, Child, FamilyStatus, Gender, RentalTaxTrack,
  ResidentialProperty, PropertyType, PROPERTY_TYPE_LABELS,
  ForeignAccount, ForeignAccountType, FOREIGN_ACCOUNT_TYPE_LABELS,
  InvestmentAccount, InvestmentAccountKind, INVESTMENT_ACCOUNT_KIND_LABELS,
  EmployerInfo,
  BankAccountInfo, BankAccountKind, BANK_ACCOUNT_KIND_LABELS,
  PensionFundInfo, PensionFundKind, PENSION_FUND_KIND_LABELS,
  DependentRelativeInfo, DependentRelation, DEPENDENT_RELATION_LABELS,
  BusinessInfo, BusinessKind, BUSINESS_KIND_LABELS,
} from '../../types';
import { ClientContact, Employee } from '../../types/clientWorkspace';
import { SETTLEMENTS_SORTED, findSettlementByName } from '../../data/settlements';
import LinkedDocsWidget from '../LinkedDocsWidget';

// צבעים ייחודיים לכל סעיף — בהמשך לפלטה של לשונית מיסוי
const COLOR_IDENTITY   = '#2563eb';  // כחול — זהות רשמית
const COLOR_FAMILY     = '#7c3aed';  // סגול — משפחה
const COLOR_CHILDREN   = '#ec4899';  // ורוד — ילדים
const COLOR_CREDITS    = '#d97706';  // כתום — כוכב/זכאויות
const COLOR_ASSETS     = '#059669';  // ירוק — נכסים/כסף
const COLOR_EMPLOYEE   = '#0891b2';  // טורקיז — צוות
const COLOR_TAGS       = '#65a30d';  // ירוק לימון — תגיות
const COLOR_CONTACTS   = '#6366f1';  // אינדיגו — אנשי קשר
const COLOR_EMPLOYERS  = '#0284c7';  // כחול ים — מעבידים
const COLOR_BANK       = '#0d9488';  // ירוק-טורקיז — בנקים
const COLOR_PENSION    = '#9333ea';  // סגול — פנסיה
const COLOR_DEPENDENTS = '#be185d';  // ורוד עמוק — קרובים תלויים
const COLOR_BUSINESS   = '#ca8a04';  // צהוב חרדל — עסקים
const COLOR_SPECIAL    = '#7c2d12';  // חום — דיווחי חובה

function ColoredSection({ color, icon, label, count, action, children }: {
  color: string;
  icon: string;
  label: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cw-section cw-colored-section" style={{ borderTopColor: color }}>
      <div className="cw-section-head" style={{ color }}>
        <span>{icon} {label}</span>
        {(count !== undefined || action) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {count !== undefined && <span className="cw-section-count">{count}</span>}
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
  patch: (partial: Partial<Client>) => void;
  employees: Employee[];
}

const FAMILY_LABELS: Record<FamilyStatus, string> = {
  single: 'רווק/ה',
  married: 'נשוי/אה',
  divorced: 'גרוש/ה',
  widowed: 'אלמן/ה',
  singleParent: 'הורה יחיד',
};

const RENTAL_TRACK_LABELS: Record<RentalTaxTrack, string> = {
  exempt: 'פטור (עד תקרה)',
  flat10: 'מס מחזור 10%',
  regular: 'מסלול רגיל (חייב במס שולי)',
};

function ageFromBirthDate(birthDate?: string): string {
  if (!birthDate) return '';
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return `(גיל ${age})`;
}

export default function PersonalContactsTab({ client, update, patch, employees }: Props) {
  const [tagDraft, setTagDraft] = useState('');
  const [contactDraft, setContactDraft] = useState<Partial<ClientContact>>({ role: '', name: '', phone: '', email: '' });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  // ── נכסי דיור ──────────────────────────────────────────────────────
  function getProperties(): ResidentialProperty[] {
    if (client.properties && client.properties.length > 0) return client.properties;
    // המרה מ-legacy: אם יש כתובת בודדת, נציג אותה כנכס יחיד
    if (client.hasResidentialProperty && client.propertyAddress) {
      return [{
        id: 'legacy-1',
        type: 'apartment',
        address: client.propertyAddress,
      }];
    }
    return [];
  }

  function setPropertyCount(n: number) {
    const current = getProperties();
    let next: ResidentialProperty[];
    if (n <= 0) {
      next = [];
    } else if (n > current.length) {
      const toAdd = n - current.length;
      next = [
        ...current,
        ...Array.from({ length: toAdd }, () => ({
          id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'apartment' as PropertyType,
          address: '',
        })),
      ];
    } else {
      next = current.slice(0, n);
    }
    patch({
      properties: next,
      numberOfProperties: next.length,
      hasResidentialProperty: next.length > 0,
      propertyAddress: next[0]?.address ?? '',
    });
  }

  function addProperty() {
    setPropertyCount(getProperties().length + 1);
  }

  function updateProperty(id: string, field: keyof ResidentialProperty, value: unknown) {
    const next = getProperties().map(p =>
      p.id === id ? { ...p, [field]: value } as ResidentialProperty : p
    );
    patch({
      properties: next,
      // עדכן את הכתובת הראשית לתאימות אחורה
      propertyAddress: next[0]?.address ?? client.propertyAddress,
    });
  }

  function removeProperty(id: string) {
    const next = getProperties().filter(p => p.id !== id);
    patch({
      properties: next,
      numberOfProperties: next.length,
      hasResidentialProperty: next.length > 0,
      propertyAddress: next[0]?.address ?? '',
    });
  }

  // ── חשבונות זרים ──────────────────────────────────────────────────
  function getForeignAccounts(): ForeignAccount[] {
    return client.foreignAccounts ?? [];
  }

  function addForeignAccount() {
    const a: ForeignAccount = {
      id: `fa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'bank',
      country: '',
      institutionName: '',
    };
    patch({
      foreignAccounts: [...getForeignAccounts(), a],
      hasForeignAssets: true,
    });
  }

  function updateForeignAccount(id: string, field: keyof ForeignAccount, value: unknown) {
    patch({
      foreignAccounts: getForeignAccounts().map(a =>
        a.id === id ? { ...a, [field]: value } as ForeignAccount : a
      ),
    });
  }

  // ── חשבונות השקעה בארץ ─────────────────────────────────────────────
  const getInvestmentAccounts = (): InvestmentAccount[] => client.investmentAccounts ?? [];
  function addInvestmentAccount() {
    const a: InvestmentAccount = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      institutionName: '',
      kind: 'broker_account',
    };
    patch({ investmentAccounts: [...getInvestmentAccounts(), a], hasInvestments: true });
  }
  function updateInvestmentAccount(id: string, field: keyof InvestmentAccount, value: unknown) {
    patch({
      investmentAccounts: getInvestmentAccounts().map(a =>
        a.id === id ? { ...a, [field]: value } as InvestmentAccount : a
      ),
    });
  }
  function removeInvestmentAccount(id: string) {
    const next = getInvestmentAccounts().filter(a => a.id !== id);
    patch({ investmentAccounts: next, hasInvestments: next.length > 0 });
  }

  // ── מעבידים ───────────────────────────────────────────────────────
  const getEmployers = (): EmployerInfo[] => client.employers ?? [];
  function addEmployer() {
    const e: EmployerInfo = {
      id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
    };
    patch({ employers: [...getEmployers(), e] });
  }
  function updateEmployer(id: string, field: keyof EmployerInfo, value: unknown) {
    patch({
      employers: getEmployers().map(e => (e.id === id ? { ...e, [field]: value } as EmployerInfo : e)),
    });
  }
  function removeEmployer(id: string) {
    patch({ employers: getEmployers().filter(e => e.id !== id) });
  }

  // ── חשבונות בנק ────────────────────────────────────────────────────
  const getBankAccounts = (): BankAccountInfo[] => client.bankAccounts ?? [];
  function addBankAccount() {
    const isFirst = getBankAccounts().length === 0;
    const b: BankAccountInfo = {
      id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bankName: '',
      kind: 'checking',
      isPrimary: isFirst,            // הראשון נחשב אוטומטית לעיקרי
    };
    patch({ bankAccounts: [...getBankAccounts(), b] });
  }
  function updateBankAccount(id: string, field: keyof BankAccountInfo, value: unknown) {
    // אם מסמנים isPrimary=true על אחד — להוריד את הסימון מהאחרים
    let next = getBankAccounts().map(a =>
      a.id === id ? { ...a, [field]: value } as BankAccountInfo : a
    );
    if (field === 'isPrimary' && value === true) {
      next = next.map(a => a.id === id ? a : { ...a, isPrimary: false });
    }
    patch({ bankAccounts: next });
  }
  function removeBankAccount(id: string) {
    let next = getBankAccounts().filter(a => a.id !== id);
    // אם הסירו את העיקרי — הופכים את הראשון שנשאר לעיקרי
    if (next.length > 0 && !next.some(a => a.isPrimary)) {
      next = next.map((a, i) => (i === 0 ? { ...a, isPrimary: true } : a));
    }
    patch({ bankAccounts: next });
  }

  // ── קופות פנסיה / השתלמות / קופ"ג ────────────────────────────────
  const getPensionFunds = (): PensionFundInfo[] => client.pensionFunds ?? [];
  function addPensionFund() {
    const f: PensionFundInfo = {
      id: `pen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      institutionName: '',
      kind: 'new_pension',
    };
    patch({ pensionFunds: [...getPensionFunds(), f], hasPension: true });
  }
  function updatePensionFund(id: string, field: keyof PensionFundInfo, value: unknown) {
    patch({
      pensionFunds: getPensionFunds().map(f =>
        f.id === id ? { ...f, [field]: value } as PensionFundInfo : f
      ),
    });
  }
  function removePensionFund(id: string) {
    const next = getPensionFunds().filter(f => f.id !== id);
    patch({ pensionFunds: next, hasPension: next.length > 0 });
  }

  // ── אזרחויות נוספות ─────────────────────────────────────────────────
  const getCitizenships = (): string[] => client.additionalCitizenships ?? [];
  const [citizenshipDraft, setCitizenshipDraft] = useState('');
  function addCitizenship() {
    const v = citizenshipDraft.trim();
    if (!v) return;
    if (getCitizenships().includes(v)) { setCitizenshipDraft(''); return; }
    patch({ additionalCitizenships: [...getCitizenships(), v] });
    setCitizenshipDraft('');
  }
  function removeCitizenship(value: string) {
    patch({ additionalCitizenships: getCitizenships().filter(c => c !== value) });
  }

  // ── קרובים תלויים במוסד (סעיף 44ב) ───────────────────────────────
  const getDependents = (): DependentRelativeInfo[] => client.dependentRelatives ?? [];
  function addDependent() {
    const d: DependentRelativeInfo = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      relation: 'parent',
      isAtInstitution: true,
    };
    patch({ dependentRelatives: [...getDependents(), d] });
  }
  function updateDependent(id: string, field: keyof DependentRelativeInfo, value: unknown) {
    patch({
      dependentRelatives: getDependents().map(d =>
        d.id === id ? { ...d, [field]: value } as DependentRelativeInfo : d
      ),
    });
  }
  function removeDependent(id: string) {
    patch({ dependentRelatives: getDependents().filter(d => d.id !== id) });
  }

  // ── עסקים (לעצמאי עם 2+ עסקים) ──────────────────────────────────
  const getBusinesses = (): BusinessInfo[] => client.businesses ?? [];
  function addBusiness() {
    const b: BusinessInfo = {
      id: `biz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      kind: 'osek_morshe',
    };
    patch({ businesses: [...getBusinesses(), b] });
  }
  function updateBusiness(id: string, field: keyof BusinessInfo, value: unknown) {
    patch({
      businesses: getBusinesses().map(b =>
        b.id === id ? { ...b, [field]: value } as BusinessInfo : b
      ),
    });
  }
  function removeBusiness(id: string) {
    patch({ businesses: getBusinesses().filter(b => b.id !== id) });
  }

  function removeForeignAccount(id: string) {
    const next = getForeignAccounts().filter(a => a.id !== id);
    patch({
      foreignAccounts: next,
      hasForeignAssets: next.length > 0,
    });
  }

  // ── ילדים ──────────────────────────────────────────────────────────
  function addChild() {
    const c: Child = {
      id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: '',
      birthDate: '',
      birthYear: 0,
      hasDisability: false,
    };
    patch({ children: [...client.children, c] });
  }

  function updateChild(id: string, field: keyof Child, value: unknown) {
    patch({
      children: client.children.map(c => {
        if (c.id !== id) return c;
        const next = { ...c, [field]: value } as Child;
        // עדכון birthYear אוטומטית
        if (field === 'birthDate' && typeof value === 'string') {
          const y = value ? parseInt(value.slice(0, 4), 10) : 0;
          next.birthYear = isNaN(y) ? 0 : y;
        }
        return next;
      }),
    });
  }

  function removeChild(id: string) {
    patch({ children: client.children.filter(c => c.id !== id) });
  }

  // ── ישוב מזכה ──────────────────────────────────────────────────────
  function syncSettlementFromCity() {
    const found = findSettlementByName(client.city);
    patch({
      qualifyingSettlementId: found?.id ?? '',
      qualifyingSettlementCreditPoints: found?.creditPoints ?? 0,
      qualifyingSettlementOverride: false,
    });
  }

  // ── תגיות ──────────────────────────────────────────────────────────
  function addTag() {
    const t = tagDraft.trim();
    if (!t) return;
    const tags = client.tags ?? [];
    if (tags.includes(t)) { setTagDraft(''); return; }
    patch({ tags: [...tags, t] });
    setTagDraft('');
  }

  function removeTag(t: string) {
    patch({ tags: (client.tags ?? []).filter(x => x !== t) });
  }

  // ── אנשי קשר ────────────────────────────────────────────────
  // איש קשר ראשי — אם אף תוסף לא מסומן ראשי, הנישום עצמו הוא הראשי כברירת מחדל.
  const additionalList = client.additionalContacts ?? [];
  const isClientPrimary = !additionalList.some(c => c.isPrimary);

  function saveContact() {
    if (!contactDraft.role || !contactDraft.name) return;
    const list = client.additionalContacts ?? [];
    if (editingContactId) {
      patch({ additionalContacts: list.map(c => c.id === editingContactId ? { ...c, ...contactDraft, id: editingContactId, isPrimary: c.isPrimary } as ClientContact : c) });
    } else {
      const c: ClientContact = {
        id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: contactDraft.role!,
        name: contactDraft.name!,
        phone: contactDraft.phone,
        email: contactDraft.email,
        notes: contactDraft.notes,
      };
      patch({ additionalContacts: [...list, c] });
    }
    setContactDraft({ role: '', name: '', phone: '', email: '' });
    setEditingContactId(null);
  }

  function editContact(c: ClientContact) {
    setContactDraft(c);
    setEditingContactId(c.id);
  }

  function deleteContact(id: string) {
    patch({ additionalContacts: (client.additionalContacts ?? []).filter(c => c.id !== id) });
    if (editingContactId === id) {
      setEditingContactId(null);
      setContactDraft({ role: '', name: '', phone: '', email: '' });
    }
  }

  // לחיצה על המפתח של איש קשר נוסף — הופך אותו לראשי, ומבטל ראשי מאחרים.
  function setAdditionalAsPrimary(id: string) {
    patch({
      additionalContacts: (client.additionalContacts ?? []).map(c => ({
        ...c,
        isPrimary: c.id === id,
      })),
    });
  }

  // לחיצה על המפתח של הנישום — מבטל את הראשי מכולם, כך שהנישום הוא ראשי כברירת מחדל.
  function setClientAsPrimary() {
    patch({
      additionalContacts: (client.additionalContacts ?? []).map(c => ({
        ...c,
        isPrimary: false,
      })),
    });
  }

  const isMarried = client.familyStatus === 'married';
  const settlementName = client.qualifyingSettlementId
    ? SETTLEMENTS_SORTED.find(s => s.id === client.qualifyingSettlementId)?.name
    : null;

  return (
    <div className="cw-tab">

      {/* ════════════════════════════════════════════════════════════
          1. 👤 פרטי נישום
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_IDENTITY} icon="👤" label="פרטי נישום">
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label className="required">שם פרטי</label>
            <input type="text" value={client.firstName} onChange={e => update('firstName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="required">שם משפחה</label>
            <input type="text" value={client.lastName} onChange={e => update('lastName', e.target.value)} />
          </div>
          <div className="form-group">
            <label>ת.ז.</label>
            <input type="text" value={client.idNumber} onChange={e => update('idNumber', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label>תאריך לידה</label>
            <input type="date" value={client.birthDate} onChange={e => update('birthDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label>מין</label>
            <select value={client.gender} onChange={e => update('gender', e.target.value as Gender)}>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>
          <div className="form-group">
            <label>טלפון</label>
            <input type="tel" value={client.phone} onChange={e => update('phone', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label>אימייל</label>
            <input type="email" value={client.email} onChange={e => update('email', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group span-2">
            <label>כתובת</label>
            <input type="text" value={client.address} onChange={e => update('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label>עיר</label>
            <input type="text" value={client.city} onChange={e => update('city', e.target.value)} />
          </div>
        </div>

        {/* ── ישוב מזכה ── */}
        <div className="cw-subsection" style={{ marginTop: '.75rem' }}>
          <div className="cw-subsection-title">🏘 ישוב מזכה (משפיע על נקודות זיכוי)</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label>ישוב מזכה</label>
              <select
                value={client.qualifyingSettlementId}
                onChange={e => {
                  const s = SETTLEMENTS_SORTED.find(x => x.id === e.target.value);
                  patch({
                    qualifyingSettlementId: e.target.value,
                    qualifyingSettlementCreditPoints: s?.creditPoints ?? 0,
                    qualifyingSettlementOverride: e.target.value !== '',
                  });
                }}
              >
                <option value="">— לא ישוב מזכה —</option>
                {SETTLEMENTS_SORTED.map(s => <option key={s.id} value={s.id}>{s.name} ({s.creditPoints} נ.ז.)</option>)}
              </select>
              {settlementName && <div className="cw-field-meta">זוהה: {settlementName}</div>}
            </div>

            {client.qualifyingSettlementId && (
              <div className="form-group">
                <label>נקודות זיכוי (override)</label>
                <input
                  type="number" min={0} max={2} step={0.25}
                  value={client.qualifyingSettlementCreditPoints}
                  onChange={e => update('qualifyingSettlementCreditPoints', Number(e.target.value))}
                  dir="ltr"
                />
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={!client.qualifyingSettlementOverride}
                  onChange={() => syncSettlementFromCity()}
                />
                סנכרן אוטומטית מהעיר ({client.city || '—'})
              </label>
            </div>
          </div>
        </div>

        {/* ── אזרחויות נוספות (FATCA / CRS / אמנות מס) ── */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">🌐 אזרחויות נוספות</div>
          <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .5rem' }}>
            אם יש אזרחות זרה — חשוב לדיווח FATCA/CRS ולשימוש באמנות מס. ישראלית נרשמת אוטומטית, אין צורך להוסיף.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="לדוגמה: ארה״ב, בריטניה, קנדה..."
              value={citizenshipDraft}
              onChange={e => setCitizenshipDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCitizenship(); } }}
              style={{ flex: '1 1 220px', minWidth: 200 }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addCitizenship}>+ הוסף</button>
          </div>
          {getCitizenships().length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.6rem' }}>
              {getCitizenships().map(c => (
                <span key={c} style={{
                  background: '#dbeafe', color: '#1e40af',
                  padding: '.25rem .6rem', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', gap: '.4rem',
                  fontSize: '.85rem',
                }}>
                  {c}
                  <button
                    type="button"
                    onClick={() => removeCitizenship(c)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1e40af', padding: 0, fontSize: '1rem', lineHeight: 1 }}
                    title="הסר"
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          2. 👨‍👩‍👧 מצב משפחתי + בן/בת זוג
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_FAMILY} icon="👨‍👩‍👧" label="מצב משפחתי">
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label>מצב משפחתי</label>
            <select value={client.familyStatus} onChange={e => update('familyStatus', e.target.value as FamilyStatus)}>
              {Object.entries(FAMILY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {isMarried && (
            <>
              <div className="form-group">
                <label>שם בן/בת זוג</label>
                <input type="text" value={client.spouseName} onChange={e => update('spouseName', e.target.value)} />
              </div>
              <div className="form-group">
                <label>ת.ז. בן/בת זוג</label>
                <input type="text" value={client.spouseIdNumber} onChange={e => update('spouseIdNumber', e.target.value)} dir="ltr" />
              </div>
              <div className="form-group">
                <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                  <input type="checkbox" checked={client.spouseWorking} onChange={e => update('spouseWorking', e.target.checked)} />
                  בן/בת זוג עובד/ת
                </label>
              </div>
              {client.spouseWorking && (
                <div className="form-group">
                  <label>הכנסה שנתית (₪)</label>
                  <input type="number" value={client.spouseIncome} onChange={e => update('spouseIncome', Number(e.target.value))} dir="ltr" />
                </div>
              )}
            </>
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          3. 👶 ילדים — עורך מלא
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_CHILDREN}
        icon="👶"
        label="ילדים"
        count={client.children.length}
        action={<button className="btn btn-primary btn-sm" onClick={addChild}>+ הוסף ילד</button>}
      >
        {client.children.length === 0 ? (
          <div className="cw-empty">אין ילדים רשומים</div>
        ) : (
          <div className="cw-children-list">
            {client.children.map((child, idx) => (
              <div key={child.id} className="cw-child-row">
                <span className="cw-child-num">{idx + 1}</span>
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label>שם פרטי</label>
                  <input type="text" value={child.firstName ?? ''} onChange={e => updateChild(child.id, 'firstName', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '0 0 170px' }}>
                  <label>תאריך לידה</label>
                  <input type="date" value={child.birthDate} onChange={e => updateChild(child.id, 'birthDate', e.target.value)} />
                </div>
                <div className="cw-child-age">{ageFromBirthDate(child.birthDate)}</div>
                <div className="form-group" style={{ flex: '0 0 auto' }}>
                  <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                    <input type="checkbox" checked={child.hasDisability} onChange={e => updateChild(child.id, 'hasDisability', e.target.checked)} />
                    מוגבלות
                  </label>
                </div>
                {child.hasDisability && (
                  <div className="form-group" style={{ flex: '0 0 100px' }}>
                    <label>% נכות</label>
                    <input type="number" min={0} max={100} value={child.disabilityPercentage ?? 0} onChange={e => updateChild(child.id, 'disabilityPercentage', Number(e.target.value))} dir="ltr" />
                  </div>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => removeChild(child.id)} style={{ color: 'var(--red)', alignSelf: 'flex-end', marginBottom: 4 }}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          4. 📋 פרטים הקשורים למס הכנסה
             כולל: עלייה/נכות/השכלה/צבא + הכנסות חו"ל + הגרלות + הון + תרומות
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_CREDITS} icon="📋" label="פרטים הקשורים למס הכנסה">
        {/* עלייה / תושב חוזר */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">✈ עלייה / תושבות</div>
          <div className="form-grid form-grid-4">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.isNewImmigrant} onChange={e => update('isNewImmigrant', e.target.checked)} />
                עולה חדש
              </label>
            </div>
            {client.isNewImmigrant && (
              <div className="form-group">
                <label>שנת עלייה</label>
                <input type="number" min={1948} max={2030} value={client.aliyahYear || ''} onChange={e => update('aliyahYear', Number(e.target.value))} dir="ltr" />
              </div>
            )}
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.isReturningResident} onChange={e => update('isReturningResident', e.target.checked)} />
                תושב חוזר
              </label>
            </div>
            {client.isReturningResident && (
              <div className="form-group">
                <label>שנת חזרה</label>
                <input type="number" min={1990} max={2030} value={client.returningYear || ''} onChange={e => update('returningYear', Number(e.target.value))} dir="ltr" />
              </div>
            )}
          </div>
          {client.isNewImmigrant && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:aliyah"
              linkLabel="תעודת עלייה"
              defaultCategory="other"
              compact
            />
          )}
          {client.isReturningResident && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:returning_resident"
              linkLabel="אישור תושב חוזר"
              defaultCategory="other"
              compact
            />
          )}
        </div>

        {/* נכות */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">♿ נכות</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label>אחוז נכות</label>
              <input type="number" min={0} max={100} value={client.disabilityPercentage || ''} onChange={e => update('disabilityPercentage', Number(e.target.value))} dir="ltr" placeholder="0" />
            </div>
            {client.disabilityPercentage > 0 && (
              <div className="form-group span-2">
                <label>גוף מאשר / סוג נכות</label>
                <input type="text" value={client.disabilityType} onChange={e => update('disabilityType', e.target.value)} placeholder="לדוגמה: ביטוח לאומי / משרד הביטחון" />
              </div>
            )}
          </div>
          {client.disabilityPercentage > 0 && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:disability"
              linkLabel="אישור נכות"
              defaultCategory="ni_document"
              compact
            />
          )}
        </div>

        {/* השכלה */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">🎓 השכלה</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.hasAcademicDegree} onChange={e => update('hasAcademicDegree', e.target.checked)} />
                תואר אקדמי
              </label>
            </div>
            {client.hasAcademicDegree && (
              <>
                <div className="form-group">
                  <label>שנת סיום</label>
                  <input type="number" min={1970} max={2030} value={client.academicDegreeYear || ''} onChange={e => update('academicDegreeYear', Number(e.target.value))} dir="ltr" />
                </div>
                <div className="form-group">
                  <label>סוג</label>
                  <select value={client.academicDegreeType} onChange={e => update('academicDegreeType', e.target.value as Client['academicDegreeType'])}>
                    <option value="">בחר...</option>
                    <option value="bachelor">תואר ראשון</option>
                    <option value="master">תואר שני</option>
                    <option value="phd">דוקטורט</option>
                  </select>
                </div>
              </>
            )}
          </div>
          {client.hasAcademicDegree && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:academic_degree"
              linkLabel="אישור סיום לימודים / תעודת תואר"
              defaultCategory="other"
              compact
            />
          )}
        </div>

        {/* שירות צבאי / לאומי */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">🎖 שירות צבאי / לאומי</div>
          <div className="form-grid form-grid-4">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.completedIdf} onChange={e => update('completedIdf', e.target.checked)} />
                שירת בצה"ל
              </label>
            </div>
            {client.completedIdf && (
              <div className="form-group">
                <label>שנת שחרור</label>
                <input type="number" min={1970} max={2030} value={client.idfReleaseYear || ''} onChange={e => update('idfReleaseYear', Number(e.target.value))} dir="ltr" />
              </div>
            )}
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.completedNationalService} onChange={e => update('completedNationalService', e.target.checked)} />
                שירות לאומי
              </label>
            </div>
            {client.completedNationalService && (
              <div className="form-group">
                <label>שנת סיום</label>
                <input type="number" min={1990} max={2030} value={client.nationalServiceYear || ''} onChange={e => update('nationalServiceYear', Number(e.target.value))} dir="ltr" />
              </div>
            )}
          </div>
          {client.completedIdf && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:idf_service"
              linkLabel="תעודת שחרור צה״ל"
              defaultCategory="other"
              compact
            />
          )}
          {client.completedNationalService && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:national_service"
              linkLabel="אישור סיום שירות לאומי"
              defaultCategory="other"
              compact
            />
          )}
        </div>

        {/* ── 🌍 חשבונות והשקעות בחו"ל (חובת דיווח CRS/FATCA) ── */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">
            <span>🌍 חשבונות והשקעות בחו״ל</span>
            <span style={{ fontSize: '.7rem', color: 'var(--gray-500)', fontWeight: 400 }}>· חובת דיווח לפי CRS/FATCA</span>
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasForeignAssets ?? false}
                  onChange={e => {
                    if (e.target.checked && getForeignAccounts().length === 0) addForeignAccount();
                    else if (!e.target.checked) patch({ hasForeignAssets: false });
                    else patch({ hasForeignAssets: true });
                  }}
                />
                יש נכסים / חשבונות בחו״ל
              </label>
            </div>
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.isReturningResidentVeteran ?? false}
                  onChange={e => update('isReturningResidentVeteran', e.target.checked)}
                />
                תושב חוזר ותיק (פטור 10 שנים)
              </label>
            </div>
          </div>

          {client.hasForeignAssets && (
            <div className="cw-foreign-list">
              {getForeignAccounts().map((a, idx) => (
                <div key={a.id} className="cw-foreign-card">
                  <div className="cw-foreign-head">
                    <span className="cw-foreign-num">{idx + 1}</span>
                    <span className="cw-foreign-title">
                      {a.institutionName || `חשבון ${idx + 1}`}
                      {a.country && <span className="cw-foreign-country">📍 {a.country}</span>}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeForeignAccount(a.id)}
                      style={{ color: 'var(--red)', marginRight: 'auto' }}
                    >🗑</button>
                  </div>
                  <div className="form-grid form-grid-3">
                    <div className="form-group">
                      <label>סוג</label>
                      <select value={a.type ?? 'bank'} onChange={e => updateForeignAccount(a.id, 'type', e.target.value as ForeignAccountType)}>
                        {(Object.entries(FOREIGN_ACCOUNT_TYPE_LABELS) as [ForeignAccountType, string][]).map(([k, v]) =>
                          <option key={k} value={k}>{v}</option>
                        )}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>מדינה</label>
                      <input type="text" value={a.country ?? ''} onChange={e => updateForeignAccount(a.id, 'country', e.target.value)} placeholder="לדוגמה: ארה״ב, גרמניה..." />
                    </div>
                    <div className="form-group">
                      <label>שם המוסד</label>
                      <input type="text" value={a.institutionName ?? ''} onChange={e => updateForeignAccount(a.id, 'institutionName', e.target.value)} placeholder="Bank of America / IBKR..." />
                    </div>
                    <div className="form-group">
                      <label>מספר חשבון / IBAN (אופציונלי)</label>
                      <input type="text" value={a.accountNumber ?? ''} onChange={e => updateForeignAccount(a.id, 'accountNumber', e.target.value)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label>שווי משוער (₪)</label>
                      <input type="number" min={0} step={1000} value={a.estimatedValue ?? ''} onChange={e => updateForeignAccount(a.id, 'estimatedValue', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label>הכנסה שנתית מהחשבון (₪)</label>
                      <input type="number" min={0} step={100} value={a.annualIncome ?? ''} onChange={e => updateForeignAccount(a.id, 'annualIncome', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label>מס ששולם בחו״ל (₪) — לזיכוי</label>
                      <input type="number" min={0} step={100} value={a.foreignTaxPaid ?? ''} onChange={e => updateForeignAccount(a.id, 'foreignTaxPaid', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group span-full">
                      <label>הערות</label>
                      <input type="text" value={a.notes ?? ''} onChange={e => updateForeignAccount(a.id, 'notes', e.target.value || undefined)} />
                    </div>
                  </div>
                  <LinkedDocsWidget
                    clientId={client.id}
                    linkKey={`personal:foreign:${a.id}`}
                    linkLabel={`מסמכים — ${a.institutionName || 'חשבון זר'}`}
                    defaultCategory="other"
                    compact
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-sm cw-add-property-btn" onClick={addForeignAccount}>
                + הוסף חשבון בחו״ל
              </button>
            </div>
          )}
        </div>

        {/* ── 🎰 הגרלות, הימורים ופרסים (מס מיוחד 35%) ── */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">
            <span>🎰 הגרלות, הימורים ופרסים</span>
            <span style={{ fontSize: '.7rem', color: 'var(--gray-500)', fontWeight: 400 }}>· מס 35% מעל סף 32,310 ש״ח</span>
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasGamblingIncome ?? false}
                  onChange={e => update('hasGamblingIncome', e.target.checked)}
                />
                היו זכיות בשנת המס
              </label>
            </div>
            {client.hasGamblingIncome && (
              <>
                <div className="form-group">
                  <label>סך זכיות שנתי (₪)</label>
                  <input type="number" min={0} step={100} value={client.gamblingIncomeAnnual ?? 0} onChange={e => update('gamblingIncomeAnnual', Number(e.target.value))} dir="ltr" />
                </div>
                <div className="form-group">
                  <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                    <input
                      type="checkbox"
                      checked={client.gamblingTaxWithheldAtSource ?? false}
                      onChange={e => update('gamblingTaxWithheldAtSource', e.target.checked)}
                    />
                    נוכה במקור (אין צורך לדווח)
                  </label>
                </div>
              </>
            )}
          </div>
          {client.hasGamblingIncome && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:gambling"
              linkLabel="אישור זכייה / נוכה במקור"
              defaultCategory="other"
              compact
            />
          )}
        </div>

        {/* ── 📈 הכנסות הון מקומיות (מס 25%/30%) ── */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">
            <span>📈 הכנסות הון מקומיות</span>
            <span style={{ fontSize: '.7rem', color: 'var(--gray-500)', fontWeight: 400 }}>· מס 25% (30% לבעל מניות מהותי)</span>
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasCapitalIncome ?? false}
                  onChange={e => update('hasCapitalIncome', e.target.checked)}
                />
                יש הכנסות הון
              </label>
            </div>
            {client.hasCapitalIncome && (
              <>
                <div className="form-group">
                  <label>רווחי הון שנתיים (₪)</label>
                  <input type="number" min={0} step={1000} value={client.capitalGainsAnnual ?? 0} onChange={e => update('capitalGainsAnnual', Number(e.target.value))} dir="ltr" placeholder="ני״ע, קריפטו..." />
                </div>
                <div className="form-group">
                  <label>דיבידנד + ריבית (₪)</label>
                  <input type="number" min={0} step={100} value={client.dividendInterestAnnual ?? 0} onChange={e => update('dividendInterestAnnual', Number(e.target.value))} dir="ltr" />
                </div>
                <div className="form-group span-full">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={client.isSubstantialShareholder ?? false}
                      onChange={e => update('isSubstantialShareholder', e.target.checked)}
                    />
                    בעל מניות מהותי (10%+) — מס 30% במקום 25%
                  </label>
                </div>
              </>
            )}
          </div>
          {client.hasCapitalIncome && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:capital_income"
              linkLabel="אישור רווחי הון / 867"
              defaultCategory="other"
              compact
            />
          )}
        </div>

        {/* ── 💝 תרומות וזיכויים נוספים ── */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">
            <span>💝 תרומות וזיכויים נוספים</span>
          </div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label>תרומות שנתיות מוכרות (₪)</label>
              <input
                type="number" min={0} step={100}
                value={client.donationsAnnual ?? 0}
                onChange={e => update('donationsAnnual', Number(e.target.value))}
                dir="ltr" placeholder="סעיף 46"
              />
              <div className="cw-field-meta">זיכוי 35% מסכום התרומה</div>
            </div>
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasLifeInsurance ?? false}
                  onChange={e => update('hasLifeInsurance', e.target.checked)}
                />
                ביטוח חיים / אכ״ע
              </label>
            </div>
            {client.hasLifeInsurance && (
              <div className="form-group">
                <label>פרמיה שנתית (₪)</label>
                <input type="number" min={0} step={100} value={client.lifeInsuranceAnnual ?? 0} onChange={e => update('lifeInsuranceAnnual', Number(e.target.value))} dir="ltr" />
              </div>
            )}
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasMedicalInsurance ?? false}
                  onChange={e => update('hasMedicalInsurance', e.target.checked)}
                />
                ביטוח בריאות / סיעוד
              </label>
            </div>
            {client.hasMedicalInsurance && (
              <div className="form-group">
                <label>פרמיה שנתית (₪)</label>
                <input type="number" min={0} step={100} value={client.medicalInsuranceAnnual ?? 0} onChange={e => update('medicalInsuranceAnnual', Number(e.target.value))} dir="ltr" />
              </div>
            )}
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasDisabilityInsurance ?? false}
                  onChange={e => update('hasDisabilityInsurance', e.target.checked)}
                />
                ביטוח אובדן כושר עבודה
              </label>
              <div className="cw-field-meta">שדה 112 ב-1301 — ניכוי עד 3.5% מההכנסה</div>
            </div>
            {client.hasDisabilityInsurance && (
              <div className="form-group">
                <label>פרמיה שנתית (₪)</label>
                <input type="number" min={0} step={100} value={client.disabilityInsuranceAnnual ?? 0} onChange={e => update('disabilityInsuranceAnnual', Number(e.target.value))} dir="ltr" />
              </div>
            )}
          </div>
          {(client.donationsAnnual ?? 0) > 0 && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:donations"
              linkLabel="קבלות תרומות (סעיף 46)"
              defaultCategory="other"
              compact
            />
          )}
          {client.hasLifeInsurance && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:life_insurance"
              linkLabel="פוליסת ביטוח חיים / אכ״ע"
              defaultCategory="other"
              compact
            />
          )}
          {client.hasMedicalInsurance && (
            <LinkedDocsWidget
              clientId={client.id}
              linkKey="personal:medical_insurance"
              linkLabel="פוליסת ביטוח בריאות / סיעוד"
              defaultCategory="other"
              compact
            />
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5. 🏠 נכסים והשקעות
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_ASSETS} icon="🏠" label="נכסים והשקעות">
        {/* דירת מגורים — עורך נכסים */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">
            <span>🏡 נכסי דיור</span>
            {(() => {
              const props = getProperties();
              return props.length > 0 && <span className="cw-prop-count">{props.length} נכסים</span>;
            })()}
          </div>

          <div className="form-grid form-grid-3" style={{ marginBottom: getProperties().length > 0 ? '.75rem' : 0 }}>
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input
                  type="checkbox"
                  checked={client.hasResidentialProperty}
                  onChange={e => {
                    if (e.target.checked && getProperties().length === 0) {
                      setPropertyCount(1);
                    } else if (!e.target.checked) {
                      setPropertyCount(0);
                    }
                  }}
                />
                בעל/ת נכסי דיור
              </label>
            </div>
            {client.hasResidentialProperty && (
              <div className="form-group">
                <label>מספר נכסים</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={getProperties().length}
                  onChange={e => setPropertyCount(Math.max(1, Number(e.target.value)))}
                  dir="ltr"
                />
              </div>
            )}
          </div>

          {/* רשימת נכסים — כרטיס לכל אחד */}
          {client.hasResidentialProperty && (
            <div className="cw-properties-list">
              {getProperties().map((p, idx) => (
                <div key={p.id} className="cw-property-card">
                  <div className="cw-property-head">
                    <span className="cw-property-num">{idx + 1}</span>
                    <span className="cw-property-title">
                      {p.address || `נכס ${idx + 1}`}
                      {p.type && <span className="cw-property-type-badge">{PROPERTY_TYPE_LABELS[p.type]}</span>}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeProperty(p.id)}
                      style={{ color: 'var(--red)', marginRight: 'auto' }}
                      title="הסר נכס"
                    >🗑</button>
                  </div>

                  <div className="form-grid form-grid-3">
                    <div className="form-group">
                      <label>סוג נכס</label>
                      <select value={p.type ?? 'apartment'} onChange={e => updateProperty(p.id, 'type', e.target.value as PropertyType)}>
                        {(Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][]).map(([k, v]) =>
                          <option key={k} value={k}>{v}</option>
                        )}
                      </select>
                    </div>
                    <div className="form-group span-2">
                      <label>כתובת</label>
                      <input type="text" value={p.address} onChange={e => updateProperty(p.id, 'address', e.target.value)} placeholder="רחוב, מספר, עיר" />
                    </div>
                    <div className="form-group">
                      <label>שטח (מ״ר)</label>
                      <input type="number" min={0} value={p.sizeSqm ?? ''} onChange={e => updateProperty(p.id, 'sizeSqm', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label>חדרים</label>
                      <input type="number" min={0} step={0.5} value={p.rooms ?? ''} onChange={e => updateProperty(p.id, 'rooms', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label>שנת רכישה</label>
                      <input type="number" min={1900} max={2030} value={p.purchaseYear ?? ''} onChange={e => updateProperty(p.id, 'purchaseYear', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group span-2">
                      <label>מחיר רכישה (₪)</label>
                      <input type="number" min={0} step={10000} value={p.purchasePrice ?? ''} onChange={e => updateProperty(p.id, 'purchasePrice', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                        <input type="checkbox" checked={p.isRented ?? false} onChange={e => updateProperty(p.id, 'isRented', e.target.checked)} />
                        הנכס מושכר
                      </label>
                    </div>
                    {p.isRented && (
                      <>
                        <div className="form-group">
                          <label>שכ״ד חודשי (₪)</label>
                          <input type="number" min={0} step={100} value={p.monthlyRent ?? ''} onChange={e => updateProperty(p.id, 'monthlyRent', Number(e.target.value) || undefined)} dir="ltr" />
                        </div>
                        <div className="form-group">
                          <label>מסלול מס</label>
                          <select value={p.rentalTaxTrack ?? 'exempt'} onChange={e => updateProperty(p.id, 'rentalTaxTrack', e.target.value as RentalTaxTrack)}>
                            {(Object.entries(RENTAL_TRACK_LABELS) as [RentalTaxTrack, string][]).map(([k, v]) =>
                              <option key={k} value={k}>{v}</option>
                            )}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="form-group span-full">
                      <label>הערות</label>
                      <input type="text" value={p.notes ?? ''} onChange={e => updateProperty(p.id, 'notes', e.target.value || undefined)} placeholder="לדוגמה: הנכס בבעלות משותפת, בשיפוץ, מושכר לחבר..." />
                    </div>
                  </div>
                  <LinkedDocsWidget
                    clientId={client.id}
                    linkKey={`personal:property:${p.id}`}
                    linkLabel={`מסמכי נכס — ${p.address || `נכס ${idx + 1}`}`}
                    defaultCategory="other"
                    compact
                  />
                </div>
              ))}

              <button className="btn btn-secondary btn-sm cw-add-property-btn" onClick={addProperty}>
                + הוסף נכס נוסף
              </button>
            </div>
          )}
        </div>

        {/* הכנסה משכירות */}
        <div className="cw-subsection">
          <div className="cw-subsection-title">🏘 הכנסה משכירות</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.hasRentalIncome ?? false} onChange={e => update('hasRentalIncome', e.target.checked)} />
                יש הכנסה משכירות
              </label>
            </div>
            {client.hasRentalIncome && (
              <>
                <div className="form-group">
                  <label>הכנסה שנתית ברוטו (₪)</label>
                  <input type="number" min={0} step={1000} value={client.rentalIncomeAnnual ?? 0} onChange={e => update('rentalIncomeAnnual', Number(e.target.value))} dir="ltr" />
                </div>
                <div className="form-group">
                  <label>מסלול מס</label>
                  <select value={client.rentalTaxTrack ?? 'exempt'} onChange={e => update('rentalTaxTrack', e.target.value as RentalTaxTrack)}>
                    {(Object.entries(RENTAL_TRACK_LABELS) as [RentalTaxTrack, string][]).map(([k, v]) =>
                      <option key={k} value={k}>{v}</option>
                    )}
                  </select>
                </div>
                <div className="form-group span-full">
                  <label>הערות</label>
                  <input type="text" value={client.rentalNotes ?? ''} onChange={e => update('rentalNotes', e.target.value || undefined)} placeholder="לדוגמה: 2 דירות בת״א, אחת בירושלים..." />
                </div>
              </>
            )}
          </div>
        </div>

        {/* שוק ההון — רשימת חשבונות */}
        <div className="cw-subsection">
          <div className="cw-subsection-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>📈 חשבונות השקעה בארץ ({getInvestmentAccounts().length})</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addInvestmentAccount}>+ הוסף חשבון</button>
          </div>
          <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
            כל חשבון = אישור 867 נפרד שיופיע בצ'ק-ליסט של הדוח השנתי.
          </p>
          {getInvestmentAccounts().length === 0 ? (
            <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין חשבונות השקעה. לחץ "+ הוסף חשבון" כדי להוסיף.</p>
          ) : (
            <div className="cw-properties-list">
              {getInvestmentAccounts().map((a, idx) => (
                <div key={a.id} className="cw-property-card">
                  <div className="cw-property-head">
                    <span className="cw-property-num">{idx + 1}</span>
                    <span className="cw-property-title">
                      {a.institutionName || `חשבון ${idx + 1}`}
                      {a.kind && <span className="cw-property-type-badge">{INVESTMENT_ACCOUNT_KIND_LABELS[a.kind]}</span>}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeInvestmentAccount(a.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                  </div>
                  <div className="form-grid form-grid-3">
                    <div className="form-group span-2">
                      <label>בית השקעות / בנק</label>
                      <input type="text" value={a.institutionName} onChange={e => updateInvestmentAccount(a.id, 'institutionName', e.target.value)} placeholder="לדוגמה: מיטב דש, IBI, אקסלנס, פסגות..." />
                    </div>
                    <div className="form-group">
                      <label>סוג חשבון</label>
                      <select value={a.kind ?? 'broker_account'} onChange={e => updateInvestmentAccount(a.id, 'kind', e.target.value as InvestmentAccountKind)}>
                        {(Object.entries(INVESTMENT_ACCOUNT_KIND_LABELS) as [InvestmentAccountKind, string][]).map(([k, v]) =>
                          <option key={k} value={k}>{v}</option>
                        )}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>מספר חשבון (4 ספרות אחרונות)</label>
                      <input type="text" value={a.accountNumber ?? ''} onChange={e => updateInvestmentAccount(a.id, 'accountNumber', e.target.value || undefined)} placeholder="אופציונלי" />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                        <input type="checkbox" checked={a.isClosed ?? false} onChange={e => updateInvestmentAccount(a.id, 'isClosed', e.target.checked)} />
                        החשבון נסגר
                      </label>
                    </div>
                    {a.isClosed && (
                      <div className="form-group">
                        <label>שנת סגירה</label>
                        <input type="number" min={1990} max={2030} value={a.closedYear ?? ''} onChange={e => updateInvestmentAccount(a.id, 'closedYear', Number(e.target.value) || undefined)} dir="ltr" />
                      </div>
                    )}
                    <div className="form-group span-full">
                      <label>הערות</label>
                      <input type="text" value={a.notes ?? ''} onChange={e => updateInvestmentAccount(a.id, 'notes', e.target.value || undefined)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5b. 💼 מעבידים — כל מעביד = 106 נפרד בצ'ק-ליסט
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_EMPLOYERS}
        icon="💼"
        label="מעבידים"
        count={getEmployers().length}
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={addEmployer}>+ הוסף מעביד</button>}
      >
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          רשימת המעבידים של הנישום. כל מעביד = טופס 106 נפרד שיופיע בצ'ק-ליסט הדוח השנתי.
        </p>
        {getEmployers().length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין מעבידים. לחץ "+ הוסף מעביד" כדי להוסיף.</p>
        ) : (
          <div className="cw-properties-list">
            {getEmployers().map((e, idx) => (
              <div key={e.id} className="cw-property-card">
                <div className="cw-property-head">
                  <span className="cw-property-num">{idx + 1}</span>
                  <span className="cw-property-title">
                    {e.name || `מעביד ${idx + 1}`}
                    {!e.endDate && e.name && <span className="cw-property-type-badge" style={{ background: '#dcfce7', color: '#166534' }}>פעיל</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeEmployer(e.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group span-2">
                    <label>שם המעביד</label>
                    <input type="text" value={e.name} onChange={ev => updateEmployer(e.id, 'name', ev.target.value)} placeholder="לדוגמה: גוגל ישראל, חברת המתנדבים..." />
                  </div>
                  <div className="form-group">
                    <label>ע.מ / מספר חברה</label>
                    <input type="text" value={e.taxId ?? ''} onChange={ev => updateEmployer(e.id, 'taxId', ev.target.value || undefined)} placeholder="9 ספרות" dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label>תאריך תחילה</label>
                    <input type="date" value={e.startDate ?? ''} onChange={ev => updateEmployer(e.id, 'startDate', ev.target.value || undefined)} />
                  </div>
                  <div className="form-group">
                    <label>תאריך סיום (ריק = עדיין מועסק)</label>
                    <input type="date" value={e.endDate ?? ''} onChange={ev => updateEmployer(e.id, 'endDate', ev.target.value || undefined)} />
                  </div>
                  <div className="form-group">
                    <label>תפקיד</label>
                    <input type="text" value={e.role ?? ''} onChange={ev => updateEmployer(e.id, 'role', ev.target.value || undefined)} />
                  </div>
                  <div className="form-group span-full">
                    <label>הערות</label>
                    <input type="text" value={e.notes ?? ''} onChange={ev => updateEmployer(e.id, 'notes', ev.target.value || undefined)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5c. 🏦 חשבונות בנק — חשבון ראשי לקבלת החזרי מס + 867 לריבית
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_BANK}
        icon="🏦"
        label="חשבונות בנק"
        count={getBankAccounts().length}
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={addBankAccount}>+ הוסף חשבון</button>}
      >
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          סמן חשבון אחד כ"ראשי" — לשם זה יועברו החזרי מס. כל חשבון עם ריבית מחייב 867 מהבנק.
        </p>
        {getBankAccounts().length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין חשבונות בנק. לחץ "+ הוסף חשבון" כדי להוסיף.</p>
        ) : (
          <div className="cw-properties-list">
            {getBankAccounts().map((b, idx) => (
              <div key={b.id} className="cw-property-card">
                <div className="cw-property-head">
                  <span className="cw-property-num">{idx + 1}</span>
                  <span className="cw-property-title">
                    {b.bankName || `חשבון ${idx + 1}`}
                    {b.isPrimary && <span className="cw-property-type-badge" style={{ background: '#fef3c7', color: '#92400e' }}>🔑 ראשי</span>}
                    {b.kind && <span className="cw-property-type-badge">{BANK_ACCOUNT_KIND_LABELS[b.kind]}</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeBankAccount(b.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group span-2">
                    <label>שם הבנק</label>
                    <input type="text" value={b.bankName} onChange={e => updateBankAccount(b.id, 'bankName', e.target.value)} placeholder="לדוגמה: בנק הפועלים, מזרחי טפחות, דיסקונט..." />
                  </div>
                  <div className="form-group">
                    <label>סוג חשבון</label>
                    <select value={b.kind ?? 'checking'} onChange={e => updateBankAccount(b.id, 'kind', e.target.value as BankAccountKind)}>
                      {(Object.entries(BANK_ACCOUNT_KIND_LABELS) as [BankAccountKind, string][]).map(([k, v]) =>
                        <option key={k} value={k}>{v}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>מספר סניף</label>
                    <input type="text" value={b.branchNumber ?? ''} onChange={e => updateBankAccount(b.id, 'branchNumber', e.target.value || undefined)} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label>שם סניף</label>
                    <input type="text" value={b.branchName ?? ''} onChange={e => updateBankAccount(b.id, 'branchName', e.target.value || undefined)} />
                  </div>
                  <div className="form-group">
                    <label>מספר חשבון</label>
                    <input type="text" value={b.accountNumber ?? ''} onChange={e => updateBankAccount(b.id, 'accountNumber', e.target.value || undefined)} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                      <input type="checkbox" checked={b.isPrimary ?? false} onChange={e => updateBankAccount(b.id, 'isPrimary', e.target.checked)} />
                      🔑 חשבון ראשי (לקבלת החזרי מס)
                    </label>
                  </div>
                  <div className="form-group span-full">
                    <label>הערות</label>
                    <input type="text" value={b.notes ?? ''} onChange={e => updateBankAccount(b.id, 'notes', e.target.value || undefined)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5d. 🛡 קופות פנסיה / השתלמות / קופ"ג
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_PENSION}
        icon="🛡"
        label="קופות פנסיה וחיסכון"
        count={getPensionFunds().length}
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={addPensionFund}>+ הוסף קופה</button>}
      >
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          רשימת קופות פנסיה, השתלמות וקופ"ג. כל קופה = אישור הפקדות נפרד שיופיע בצ'ק-ליסט הדוח.
        </p>
        {getPensionFunds().length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין קופות. לחץ "+ הוסף קופה" כדי להוסיף.</p>
        ) : (
          <div className="cw-properties-list">
            {getPensionFunds().map((f, idx) => (
              <div key={f.id} className="cw-property-card">
                <div className="cw-property-head">
                  <span className="cw-property-num">{idx + 1}</span>
                  <span className="cw-property-title">
                    {f.institutionName || `קופה ${idx + 1}`}
                    <span className="cw-property-type-badge">{PENSION_FUND_KIND_LABELS[f.kind]}</span>
                    {f.hasSelfDeposits && <span className="cw-property-type-badge" style={{ background: '#dcfce7', color: '#166534' }}>הפקדה עצמאית</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removePensionFund(f.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group span-2">
                    <label>גוף ניהול</label>
                    <input type="text" value={f.institutionName} onChange={e => updatePensionFund(f.id, 'institutionName', e.target.value)} placeholder="לדוגמה: מנורה, הראל, כלל, מגדל, אלטשולר שחם..." />
                  </div>
                  <div className="form-group">
                    <label>סוג</label>
                    <select value={f.kind} onChange={e => updatePensionFund(f.id, 'kind', e.target.value as PensionFundKind)}>
                      {(Object.entries(PENSION_FUND_KIND_LABELS) as [PensionFundKind, string][]).map(([k, v]) =>
                        <option key={k} value={k}>{v}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group span-2">
                    <label>שם מוצר (אופציונלי)</label>
                    <input type="text" value={f.productName ?? ''} onChange={e => updatePensionFund(f.id, 'productName', e.target.value || undefined)} placeholder="שם מוצר ספציפי אם רלוונטי" />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                      <input type="checkbox" checked={f.isEmployerLinked ?? false} onChange={e => updatePensionFund(f.id, 'isEmployerLinked', e.target.checked)} />
                      הפקדה דרך מעביד
                    </label>
                  </div>
                  <div className="form-group span-2">
                    <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                      <input type="checkbox" checked={f.hasSelfDeposits ?? false} onChange={e => updatePensionFund(f.id, 'hasSelfDeposits', e.target.checked)} />
                      יש גם הפקדה עצמאית (נוסף על מעביד)
                    </label>
                  </div>
                  <div className="form-group span-full">
                    <label>הערות</label>
                    <input type="text" value={f.notes ?? ''} onChange={e => updatePensionFund(f.id, 'notes', e.target.value || undefined)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5e. 👨‍🦳 קרובים תלויים במוסד (סעיף 44ב — זיכוי 35%)
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_DEPENDENTS}
        icon="👨‍🦳"
        label="קרובים תלויים במוסד"
        count={getDependents().length}
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={addDependent}>+ הוסף קרוב</button>}
      >
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          החזקה של הורה / בן זוג / אח נטול יכולת במוסד מיוחד — מקנה זיכוי של 35% מסכום ההוצאה (סעיף 44ב לפקודה).
        </p>
        {getDependents().length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין קרובים תלויים. לחץ "+ הוסף קרוב" אם רלוונטי.</p>
        ) : (
          <div className="cw-properties-list">
            {getDependents().map((d, idx) => (
              <div key={d.id} className="cw-property-card">
                <div className="cw-property-head">
                  <span className="cw-property-num">{idx + 1}</span>
                  <span className="cw-property-title">
                    {d.name || `קרוב ${idx + 1}`}
                    <span className="cw-property-type-badge">{DEPENDENT_RELATION_LABELS[d.relation]}</span>
                    {d.isAtInstitution && <span className="cw-property-type-badge" style={{ background: '#fce7f3', color: '#9d174d' }}>מוחזק במוסד</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeDependent(d.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group">
                    <label>קרבה</label>
                    <select value={d.relation} onChange={e => updateDependent(d.id, 'relation', e.target.value as DependentRelation)}>
                      {(Object.entries(DEPENDENT_RELATION_LABELS) as [DependentRelation, string][]).map(([k, v]) =>
                        <option key={k} value={k}>{v}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>שם</label>
                    <input type="text" value={d.name ?? ''} onChange={e => updateDependent(d.id, 'name', e.target.value || undefined)} />
                  </div>
                  <div className="form-group">
                    <label>ת.ז (אופציונלי)</label>
                    <input type="text" value={d.idNumber ?? ''} onChange={e => updateDependent(d.id, 'idNumber', e.target.value || undefined)} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                      <input type="checkbox" checked={d.isAtInstitution} onChange={e => updateDependent(d.id, 'isAtInstitution', e.target.checked)} />
                      מוחזק במוסד מיוחד
                    </label>
                  </div>
                  {d.isAtInstitution && (
                    <>
                      <div className="form-group">
                        <label>שם המוסד</label>
                        <input type="text" value={d.institutionName ?? ''} onChange={e => updateDependent(d.id, 'institutionName', e.target.value || undefined)} placeholder="לדוגמה: דיור עזריאלי..." />
                      </div>
                      <div className="form-group">
                        <label>הוצאה חודשית (₪)</label>
                        <input type="number" min={0} step={100} value={d.monthlyContribution ?? ''} onChange={e => updateDependent(d.id, 'monthlyContribution', Number(e.target.value) || undefined)} dir="ltr" />
                      </div>
                    </>
                  )}
                  <div className="form-group span-full">
                    <label>הערות</label>
                    <input type="text" value={d.notes ?? ''} onChange={e => updateDependent(d.id, 'notes', e.target.value || undefined)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5f. 🏢 עסקים (לעצמאי עם 2+ עסקים — כל אחד = נספח א' 1320)
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection
        color={COLOR_BUSINESS}
        icon="🏢"
        label="עסקים"
        count={getBusinesses().length}
        action={<button type="button" className="btn btn-secondary btn-sm" onClick={addBusiness}>+ הוסף עסק</button>}
      >
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          רשימה לעצמאי עם <strong>2 עסקים או יותר</strong> (חנות + שותפות + פרילנס וכו'). כל עסק = נספח א' (1320) נפרד בדוח 1301.
          לעצמאי עם עסק יחיד — די בשדות businessDescription/vatStatus ברמת הלקוח.
        </p>
        {getBusinesses().length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: 0, fontSize: '.9rem' }}>אין עסקים נוספים. לחץ "+ הוסף עסק" אם רלוונטי.</p>
        ) : (
          <div className="cw-properties-list">
            {getBusinesses().map((b, idx) => (
              <div key={b.id} className="cw-property-card">
                <div className="cw-property-head">
                  <span className="cw-property-num">{idx + 1}</span>
                  <span className="cw-property-title">
                    {b.name || `עסק ${idx + 1}`}
                    <span className="cw-property-type-badge">{BUSINESS_KIND_LABELS[b.kind]}</span>
                    {b.isClosed && <span className="cw-property-type-badge" style={{ background: '#fee2e2', color: '#991b1b' }}>נסגר</span>}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeBusiness(b.id)} style={{ color: 'var(--red)', marginRight: 'auto' }} title="הסר">🗑</button>
                </div>
                <div className="form-grid form-grid-3">
                  <div className="form-group span-2">
                    <label>שם העסק</label>
                    <input type="text" value={b.name} onChange={e => updateBusiness(b.id, 'name', e.target.value)} placeholder="לדוגמה: יועץ עסקי גיא ישר" />
                  </div>
                  <div className="form-group">
                    <label>ע.מ / מספר חברה</label>
                    <input type="text" value={b.taxId ?? ''} onChange={e => updateBusiness(b.id, 'taxId', e.target.value || undefined)} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label>סוג</label>
                    <select value={b.kind} onChange={e => updateBusiness(b.id, 'kind', e.target.value as BusinessKind)}>
                      {(Object.entries(BUSINESS_KIND_LABELS) as [BusinessKind, string][]).map(([k, v]) =>
                        <option key={k} value={k}>{v}</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>תדירות מע"מ</label>
                    <select value={b.vatFrequency ?? ''} onChange={e => updateBusiness(b.id, 'vatFrequency', (e.target.value || undefined) as 'monthly' | 'bi_monthly' | undefined)}>
                      <option value="">—</option>
                      <option value="monthly">חודשי</option>
                      <option value="bi_monthly">דו-חודשי</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>שנת תחילה</label>
                    <input type="number" min={1990} max={2030} value={b.startYear ?? ''} onChange={e => updateBusiness(b.id, 'startYear', Number(e.target.value) || undefined)} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                      <input type="checkbox" checked={b.isClosed ?? false} onChange={e => updateBusiness(b.id, 'isClosed', e.target.checked)} />
                      העסק נסגר
                    </label>
                  </div>
                  {b.isClosed && (
                    <div className="form-group">
                      <label>שנת סגירה</label>
                      <input type="number" min={1990} max={2030} value={b.closedYear ?? ''} onChange={e => updateBusiness(b.id, 'closedYear', Number(e.target.value) || undefined)} dir="ltr" />
                    </div>
                  )}
                  <div className="form-group span-full">
                    <label>תיאור פעילות</label>
                    <input type="text" value={b.description ?? ''} onChange={e => updateBusiness(b.id, 'description', e.target.value || undefined)} placeholder="ייעוץ, שירותים, מסחר..." />
                  </div>
                  <div className="form-group span-full">
                    <label>הערות</label>
                    <input type="text" value={b.notes ?? ''} onChange={e => updateBusiness(b.id, 'notes', e.target.value || undefined)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5g. 📋 דיווחי חובה ומצבים מיוחדים
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_SPECIAL} icon="📋" label="דיווחי חובה ומצבים מיוחדים">
        <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
          דגלי "כן/לא" למקרים מיוחדים. סמן רק אם רלוונטי — כל אחד מהם מחייב התייחסות נפרדת בדוח 1301.
        </p>
        <div className="form-grid form-grid-2">
          {/* חברה משפחתית */}
          <div className="form-group">
            <label className="checkbox-row">
              <input type="checkbox" checked={client.isFamilyCompanyMember ?? false} onChange={e => update('isFamilyCompanyMember', e.target.checked)} />
              בעלים בחברה משפחתית
            </label>
            <div className="cw-field-meta">חישוב מס שונה — ההכנסה מיוחסת לבעל המניות</div>
          </div>
          {client.isFamilyCompanyMember && (
            <div className="form-group">
              <label>שם החברה המשפחתית</label>
              <input type="text" value={client.familyCompanyName ?? ''} onChange={e => update('familyCompanyName', e.target.value || undefined)} />
            </div>
          )}

          {/* בעל שליטה בחברה זרה */}
          <div className="form-group">
            <label className="checkbox-row">
              <input type="checkbox" checked={client.isForeignControllingShareholder ?? false} onChange={e => update('isForeignControllingShareholder', e.target.checked)} />
              בעל שליטה בחבר בני אדם תושב חוץ
            </label>
            <div className="cw-field-meta">חובת דיווח לפי 1301 + לעיתים מתקיים CFC</div>
          </div>
          {client.isForeignControllingShareholder && (
            <div className="form-group">
              <label>פרטי החברה הזרה</label>
              <input type="text" value={client.foreignCompanyDetails ?? ''} onChange={e => update('foreignCompanyDetails', e.target.value || undefined)} placeholder="שם, מדינה, % החזקה" />
            </div>
          )}

          {/* צדדים קשורים בחו"ל */}
          <div className="form-group span-full">
            <label className="checkbox-row">
              <input type="checkbox" checked={client.hasRelatedPartyTransactionsAbroad ?? false} onChange={e => update('hasRelatedPartyTransactionsAbroad', e.target.checked)} />
              עסקאות עם צדדים קשורים בחו"ל (סעיף 85א)
            </label>
            <div className="cw-field-meta">דורש נספח 1385 + הצהרת מחירי העברה לכל עסקה</div>
          </div>

          {/* חבר קיבוץ */}
          <div className="form-group">
            <label className="checkbox-row">
              <input type="checkbox" checked={client.isKibbutzMember ?? false} onChange={e => update('isKibbutzMember', e.target.checked)} />
              חבר קיבוץ / מושב שיתופי
            </label>
            <div className="cw-field-meta">הקיבוץ הוא בר השומה — חישוב מס שונה לחלוטין</div>
          </div>
          {client.isKibbutzMember && (
            <div className="form-group">
              <label>שם הקיבוץ / מושב</label>
              <input type="text" value={client.kibbutzName ?? ''} onChange={e => update('kibbutzName', e.target.value || undefined)} />
            </div>
          )}

          {/* סעיף 14 */}
          <div className="form-group">
            <label className="checkbox-row">
              <input type="checkbox" checked={client.section14Elected ?? false} onChange={e => update('section14Elected', e.target.checked)} />
              בחר/ה פטור לפי סעיף 14
            </label>
            <div className="cw-field-meta">פטור 10 שנים על הכנסות חו"ל לעולה חדש / תושב חוזר ותיק</div>
          </div>
          {client.section14Elected && (
            <div className="form-group">
              <label>שנת התחלת הפטור</label>
              <input type="number" min={2000} max={2030} value={client.section14StartYear ?? ''} onChange={e => update('section14StartYear', Number(e.target.value) || undefined)} dir="ltr" />
            </div>
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          6. 👥 עובד מטפל
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_EMPLOYEE} icon="👥" label="עובד מטפל">
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>מי מטפל בלקוח</label>
            <select value={client.assignedAccountantId ?? ''} onChange={e => update('assignedAccountantId', e.target.value || undefined)}>
              <option value="">לא הוקצה</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
            </select>
          </div>
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          7. 🏷 תגיות
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_TAGS} icon="🏷" label="תגיות">
        <div className="cw-tags">
          {(client.tags ?? []).map(t => (
            <span key={t} className="cw-tag interactive">
              #{t}
              <button onClick={() => removeTag(t)} title="הסרה">×</button>
            </span>
          ))}
          <input
            type="text"
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="הוסף תגית..."
            className="cw-tag-input"
          />
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          8. 📞 אנשי קשר — הנישום + אנשי קשר נוספים, עם סימון ראשי 🔑
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_CONTACTS} icon="📞" label="אנשי קשר">
        <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginBottom: '.6rem' }}>
          לחיצה על 🔑 מסמנת את איש הקשר הראשי — זה מי שמופיע בטבלת הלקוחות וזה אליו פונים בפועל.
        </div>

        {/* כרטיס הנישום עצמו — נמשך מהפרטים האישיים, לא ניתן לעריכה כאן */}
        <div className="cw-contacts">
          <div
            className={`cw-contact-card cw-contact-self${isClientPrimary ? ' cw-contact-primary' : ''}`}
            title="פרטים נשלפים מ'פרטי נישום' למעלה — שינוי שם/טלפון/אימייל ייעשה שם"
          >
            <div className="cw-contact-head">
              <button
                className="cw-contact-key"
                onClick={setClientAsPrimary}
                title={isClientPrimary ? 'איש הקשר הראשי' : 'הפוך לאיש הקשר הראשי'}
                aria-pressed={isClientPrimary}
              >
                {isClientPrimary ? '🔑' : '🔓'}
              </button>
              <strong>{`${client.firstName} ${client.lastName}`.trim() || '(ללא שם)'}</strong>
              <span className="badge badge-blue cl-mini-badge">הנישום</span>
            </div>
            <div className="cw-contact-meta">
              {client.phone ? <span dir="ltr">📞 {client.phone}</span> : <span style={{ color: 'var(--gray-400)' }}>📞 — אין טלפון</span>}
              {client.email ? <span dir="ltr">✉ {client.email}</span> : <span style={{ color: 'var(--gray-400)' }}>✉ — אין אימייל</span>}
            </div>
            <div className="cw-contact-notes" style={{ fontStyle: 'normal', color: 'var(--gray-500)' }}>
              לעריכה: גלילה ל"פרטי נישום" למעלה.
            </div>
          </div>

          {/* אנשי קשר נוספים */}
          {additionalList.map(c => (
            <div key={c.id} className={`cw-contact-card${c.isPrimary ? ' cw-contact-primary' : ''}`}>
              <div className="cw-contact-head">
                <button
                  className="cw-contact-key"
                  onClick={() => setAdditionalAsPrimary(c.id)}
                  title={c.isPrimary ? 'איש הקשר הראשי' : 'הפוך לאיש הקשר הראשי'}
                  aria-pressed={c.isPrimary || false}
                >
                  {c.isPrimary ? '🔑' : '🔓'}
                </button>
                <strong>{c.name}</strong>
                <span className="badge badge-gray cl-mini-badge">{c.role}</span>
              </div>
              <div className="cw-contact-meta">
                {c.phone && <span dir="ltr">📞 {c.phone}</span>}
                {c.email && <span dir="ltr">✉ {c.email}</span>}
              </div>
              {c.notes && <div className="cw-contact-notes">{c.notes}</div>}
              <div className="cw-contact-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => editContact(c)}>עריכה</button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteContact(c.id)} style={{ color: 'var(--red)' }}>מחק</button>
              </div>
            </div>
          ))}
        </div>

        <div className="cw-contact-form">
          <h4 style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginBottom: '.5rem' }}>
            {editingContactId ? 'עריכת איש קשר' : '+ הוסף איש קשר נוסף (בן/בת זוג, רו״ח, עו״ד...)'}
          </h4>
          <div className="form-grid form-grid-4">
            <div className="form-group">
              <label>תפקיד</label>
              <input type="text" value={contactDraft.role || ''} onChange={e => setContactDraft({ ...contactDraft, role: e.target.value })} placeholder="עו״ד / רו״ח אחר / מנה״ח" />
            </div>
            <div className="form-group">
              <label>שם</label>
              <input type="text" value={contactDraft.name || ''} onChange={e => setContactDraft({ ...contactDraft, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>טלפון</label>
              <input type="tel" value={contactDraft.phone || ''} onChange={e => setContactDraft({ ...contactDraft, phone: e.target.value })} dir="ltr" />
            </div>
            <div className="form-group">
              <label>אימייל</label>
              <input type="email" value={contactDraft.email || ''} onChange={e => setContactDraft({ ...contactDraft, email: e.target.value })} dir="ltr" />
            </div>
            <div className="form-group span-full">
              <label>הערות</label>
              <input type="text" value={contactDraft.notes || ''} onChange={e => setContactDraft({ ...contactDraft, notes: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', justifyContent: 'flex-end' }}>
            {editingContactId && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingContactId(null); setContactDraft({ role: '', name: '', phone: '', email: '' }); }}>בטל עריכה</button>
            )}
            <button className="btn btn-primary btn-sm" onClick={saveContact} disabled={!contactDraft.role || !contactDraft.name}>
              {editingContactId ? 'עדכן' : 'הוסף'}
            </button>
          </div>
        </div>
      </ColoredSection>
    </div>
  );
}
