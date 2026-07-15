// ─── לשונית "התיק" — כל העובדות על הלקוח, מסודרות ונערכות במקום ─────────────
// שבעה קטעים מהקובע לפחות. כל קטע: תצוגת תמצית + עריכה (מודל ממוקד או עורך inline).
// מודולריות: קטע חדש בעתיד = רשומה חדשה ב-SECTIONS, לא לשונית חדשה.
// רשת ביטחון: "הטופס המלא" בתחתית פותח את הטפסים הישנים — אף שדה לא הופך לבלתי-נגיש.

import { useState } from 'react';
import type { Client } from '../../types';
import { BUSINESS_KIND_LABELS } from '../../types';
import type { Employee } from '../../types/clientWorkspace';
import type { AnnualReportSession, CardEditSection } from '../../features/annualReport/types';
import {
  clientDisplayName, spouseDisplayName, registeredFileInfo,
} from '../../features/annualReport/profile';
import CardSectionEditor from '../../features/annualReport/CardSectionEditor';
import TaxFilesSection from './TaxFilesSection';
import PersonalContactsTab from './PersonalContactsTab';
import TaxNITab from './TaxNITab';

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
  patch: (partial: Partial<Client>) => void;
  patchAndSave: (partial: Partial<Client>) => Promise<void>;
  employees: Employee[];
  sessions: AnnualReportSession[];
  isNew?: boolean;
}

// ─── שורת עובדה בתצוגת קטע ───────────────────────────────────────────────────
interface FactRow {
  label: string;
  value: string;
  missing?: boolean;
}

function yesNo(v: boolean | undefined): string { return v ? 'כן' : 'לא'; }

const IT_LABELS: Record<string, string> = {
  employee: 'שכיר', selfEmployed: 'עצמאי', both: 'שכיר + עצמאי', rentalOnly: 'שכירות', other: 'אחר',
};
const VAT_LABELS: Record<string, string> = {
  authorizedDealer: 'עוסק מורשה', exemptDealer: 'עוסק פטור', none: 'אין מע"מ',
};
const FAMILY_LABELS: Record<string, string> = {
  single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'הורה יחיד',
};

// ─── מרשם הקטעים — קטע חדש בעתיד = רשומה כאן ────────────────────────────────
interface SectionDef {
  key: string;
  icon: string;
  title: string;
  rows: (client: Client, latest: AnnualReportSession | null) => FactRow[];
  /** מודל עריכה ממוקד (CardSectionEditor). כשריק — העריכה בטופס המלא. */
  editTargets?: { label: string; target: CardEditSection }[];
  /** קטע שמוצג רק כשיש בו תוכן. */
  onlyWhenRelevant?: (client: Client) => boolean;
}

const SECTIONS: SectionDef[] = [
  {
    key: 'identity',
    icon: '👥',
    title: 'זהות ומשפחה',
    rows: (c, latest) => [
      { label: 'שם מלא', value: clientDisplayName(c), missing: !c.firstName },
      { label: 'ת.ז.', value: c.idNumber || '—', missing: !c.idNumber },
      { label: 'תאריך לידה', value: c.birthDate || '—', missing: !c.birthDate },
      { label: 'כתובת', value: [c.address, c.city].filter(Boolean).join(', ') || '—', missing: !c.city },
      { label: 'מצב משפחתי', value: FAMILY_LABELS[c.familyStatus] ?? c.familyStatus },
      ...(c.familyStatus === 'married' ? [
        { label: 'בן/בת הזוג', value: `${spouseDisplayName(c)}${c.spouseIdNumber ? ` · ${c.spouseIdNumber}` : ''}`, missing: !c.spouseName },
        {
          label: `תעסוקת ${spouseDisplayName(c)}`,
          value: latest?.model?.spouse?.has106 ? 'שכיר/ה (106)'
            : latest?.model?.spouse?.hasBusinessIncome ? 'עצמאי/ת'
            : latest?.model?.identity?.spouseHasIncome === false ? 'ללא הכנסה'
            : c.spouseWorking ? 'עובד/ת' : 'טרם נענה',
          missing: latest?.model?.identity?.spouseHasIncome === undefined && !c.spouseWorking,
        },
      ] : []),
      {
        label: 'ילדים',
        value: (c.children ?? []).length > 0
          ? (c.children ?? []).map((ch) => ch.firstName || 'ילד/ה').join(', ')
          : 'אין',
      },
      ...(c.qualifyingSettlementId ? [{ label: 'יישוב מזכה', value: c.qualifyingSettlementId }] : []),
    ],
    editTargets: [
      { label: '✏ פרטים ובן/בת זוג', target: 'identity' },
      { label: '✏ ילדים', target: 'children' },
    ],
  },
  {
    key: 'income',
    icon: '💼',
    title: 'תעסוקה והכנסות',
    rows: (c, latest) => {
      const sources = latest?.model?.income?.sources ?? [];
      const employers = (c.employers ?? []).filter((e) => !e.endDate);
      const businesses = c.businesses ?? [];
      return [
        { label: 'סיווג מ"ה', value: IT_LABELS[c.incomeTaxType] ?? c.incomeTaxType },
        { label: 'מע"מ', value: VAT_LABELS[c.vatStatus] ?? c.vatStatus },
        {
          label: 'מעסיקים',
          value: employers.length > 0 ? employers.map((e) => e.name).join(', ')
            : (sources.includes('salary') || c.incomeTaxType === 'employee' || c.incomeTaxType === 'both')
              ? 'שכיר/ה — שם המעסיק טרם הוזן' : 'אין',
          missing: employers.length === 0 && (sources.includes('salary') || c.incomeTaxType === 'employee' || c.incomeTaxType === 'both'),
        },
        {
          label: 'עסקים',
          value: businesses.length > 0
            ? businesses.map((b) => `${b.name}${b.kind ? ` (${BUSINESS_KIND_LABELS[b.kind] ?? ''})` : ''}`).join(', ')
            : sources.includes('business') ? 'יש עסק — פרטים טרם הוזנו' : 'אין',
          missing: businesses.length === 0 && sources.includes('business'),
        },
        {
          label: 'נדל"ן',
          value: (c.properties ?? []).length > 0
            ? (c.properties ?? []).map((p) => `${p.address}${p.isRented ? ' (מושכר)' : ''}`).join(', ')
            : c.hasResidentialProperty || sources.includes('rental') ? 'יש — פרטי נכס טרם הוזנו' : 'אין',
        },
        { label: 'שוק ההון', value: yesNo(c.hasCapitalIncome || (c.investmentAccounts ?? []).length > 0 || sources.includes('capital')) },
        { label: 'הכנסות/נכסים בחו"ל', value: yesNo(c.hasForeignAssets || sources.includes('foreign')) },
      ];
    },
    editTargets: [
      { label: '✏ מעסיקים', target: 'employers' },
    ],
  },
  {
    key: 'accounts',
    icon: '🏦',
    title: 'חשבונות וקופות',
    rows: (c, latest) => {
      const banks = c.bankAccounts ?? [];
      const invest = c.investmentAccounts ?? [];
      const pensions = c.pensionFunds ?? [];
      return [
        {
          label: 'חשבונות בנק',
          value: banks.length > 0 ? banks.map((b) => b.bankName).join(', ')
            : latest?.model?.accounts?.bankNames?.trim() || 'לא הוזנו',
          missing: banks.length === 0 && !latest?.model?.accounts?.bankNames?.trim(),
        },
        {
          label: 'חשבונות השקעה',
          value: invest.length > 0 ? invest.map((a) => a.institutionName).join(', ')
            : latest?.model?.accounts?.investmentInstitutions?.trim() || 'אין',
        },
        { label: 'קופות פנסיה', value: pensions.length > 0 ? pensions.map((p) => p.institutionName).join(', ') : 'לא הוזנו', missing: pensions.length === 0 && c.hasPension },
        { label: 'קרן השתלמות', value: yesNo(c.hasKrenHashtalmut) },
      ];
    },
    editTargets: [
      { label: '✏ בנקים', target: 'bankAccounts' },
      { label: '✏ השקעות', target: 'investmentAccounts' },
      { label: '✏ פנסיה', target: 'pensionFunds' },
    ],
  },
  {
    key: 'benefits',
    icon: '🎖️',
    title: 'הטבות וזיכויים אישיים',
    rows: (c) => [
      { label: 'נכות מוכרת', value: c.disabilityPercentage > 0 ? `${c.disabilityPercentage}%` : 'אין' },
      { label: 'תואר אקדמי', value: c.hasAcademicDegree ? `${c.academicDegreeType || 'תואר'} (${c.academicDegreeYear || '?'})` : 'אין' },
      { label: 'חייל/ת משוחרר/ת', value: c.completedIdf ? `כן (שחרור ${c.idfReleaseYear || '?'})` : c.completedNationalService ? `שירות לאומי (${c.nationalServiceYear || '?'})` : 'לא' },
      {
        label: 'תושבות',
        value: c.isNewImmigrant ? `עולה חדש/ה (${c.aliyahYear || '?'})`
          : c.isReturningResident ? `תושב/ת חוזר/ת (${c.returningYear || '?'})` : 'תושב/ת ישראל',
      },
    ],
    editTargets: [{ label: '✏ עריכה', target: 'identity' }],
  },
  {
    key: 'special',
    icon: '⭐',
    title: 'מצבים מיוחדים',
    onlyWhenRelevant: (c) => !!(c.isFamilyCompanyMember || c.isForeignControllingShareholder || c.isKibbutzMember || c.section14Elected || c.isSubstantialShareholder),
    rows: (c) => [
      ...(c.isFamilyCompanyMember ? [{ label: 'חברה משפחתית', value: c.familyCompanyName || 'כן' }] : []),
      ...(c.isForeignControllingShareholder ? [{ label: 'בעל שליטה בחברה זרה', value: 'כן' }] : []),
      ...(c.isKibbutzMember ? [{ label: 'חבר/ת קיבוץ', value: c.kibbutzName || 'כן' }] : []),
      ...(c.section14Elected ? [{ label: 'סעיף 14', value: `מוחל (${c.section14StartYear || '?'})` }] : []),
      ...(c.isSubstantialShareholder ? [{ label: 'בעל/ת מניות מהותי/ת', value: 'כן' }] : []),
    ],
    editTargets: [{ label: '✏ עריכה', target: 'identity' }],
  },
  {
    key: 'contacts',
    icon: '📞',
    title: 'אנשי קשר ותקשורת',
    rows: (c) => [
      { label: 'טלפון', value: c.phone || '—', missing: !c.phone },
      { label: 'מייל', value: c.email || '—', missing: !c.email },
      ...((c.additionalContacts ?? []).length > 0
        ? [{ label: 'אנשי קשר נוספים', value: (c.additionalContacts ?? []).map((x) => x.name).filter(Boolean).join(', ') }]
        : []),
    ],
  },
];

// ─── קטע בודד — תמצית + הרחבה ───────────────────────────────────────────────
function DossierSection({
  def, client, latest, defaultOpen, onEdit, extraActions,
}: {
  def: SectionDef;
  client: Client;
  latest: AnnualReportSession | null;
  defaultOpen?: boolean;
  onEdit: (target: CardEditSection) => void;
  extraActions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const rows = def.rows(client, latest);
  const missingCount = rows.filter((r) => r.missing).length;
  // תקציר לשורת הכותרת — עד 3 ערכים שאינם ריקים
  const summary = rows.filter((r) => !r.missing && r.value !== '—' && r.value !== 'אין' && r.value !== 'לא')
    .slice(0, 3).map((r) => r.value);

  return (
    <div className="cw-section" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
          padding: '.8rem 1rem', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: '1.05rem' }}>{def.icon}</span>
        <b style={{ fontSize: '.95rem' }}>{def.title}</b>
        {!open && summary.length > 0 && (
          <span style={{
            fontSize: '.78rem', color: 'var(--gray-500)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          }}>
            {summary.join(' · ')}
          </span>
        )}
        {missingCount > 0 && (
          <span style={{
            fontSize: '.72rem', fontWeight: 700, color: '#b45309', background: '#FBF2E2',
            borderRadius: 99, padding: '.1rem .5rem', whiteSpace: 'nowrap',
          }}>
            ⚠ {missingCount} חסרים
          </span>
        )}
        <span style={{ marginRight: 'auto', color: 'var(--gray-400)', flex: 'none' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 1rem .9rem' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '.4rem .9rem', marginBottom: '.7rem',
          }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: 'flex', gap: '.45rem', fontSize: '.85rem', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--gray-500)', flex: 'none' }}>{r.label}:</span>
                <span style={{ fontWeight: 600, color: r.missing ? '#b45309' : undefined }}>
                  {r.missing ? `⚠ ${r.value}` : r.value}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {(def.editTargets ?? []).map((e) => (
              <button key={e.target + e.label} type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(e.target)}>
                {e.label}
              </button>
            ))}
            {extraActions}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── הלשונית עצמה ────────────────────────────────────────────────────────────
export default function ClientDossierTab({ client, update, patch, patchAndSave, employees, sessions, isNew }: Props) {
  const [editorTarget, setEditorTarget] = useState<CardEditSection | null>(null);
  const [showFullForm, setShowFullForm] = useState(false);
  const latest = sessions[0] ?? null;
  const regFile = registeredFileInfo(client);

  return (
    <div className="cw-tab" style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
      {/* ── העוגן: תיקים ברשויות — תמיד פתוח, תמיד ראשון ── */}
      <div className="cw-section" style={{ borderColor: '#e5d9b2', background: '#fffdf6' }}>
        <TaxFilesSection client={client} update={update} />
        {regFile && (client.familyStatus === 'married') && (
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: regFile.owner === 'spouse' ? '#b45309' : 'var(--gray-600)', marginTop: '.4rem' }}>
            {regFile.owner === 'spouse' ? '⚠' : '🗄️'} בן/בת הזוג הרשום/ה: {regFile.name}
            {regFile.idNumber ? ` · ת.ז. ${regFile.idNumber}` : ''} — כל ההתנהלות מול מ"ה בת.ז. הזו
          </div>
        )}
      </div>

      {/* ── הקטעים — לקוח חדש: הכל פתוח למילוי ── */}
      {SECTIONS.filter((s) => !s.onlyWhenRelevant || s.onlyWhenRelevant(client) || isNew).map((s) => (
        <DossierSection
          key={s.key}
          def={s}
          client={client}
          latest={latest}
          defaultOpen={isNew || s.key === 'identity'}
          onEdit={(t) => setEditorTarget(t)}
        />
      ))}

      {/* ── רשת ביטחון: כל השדות של הטפסים המקוריים ── */}
      <div style={{ marginTop: '.4rem' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFullForm((v) => !v)}>
          {showFullForm ? '▴ סגור את הטופס המלא' : '🔧 הטופס המלא — כל השדות (מתקדם)'}
        </button>
        {showFullForm && (
          <div style={{ marginTop: '.6rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <TaxNITab client={client} update={update} />
            <PersonalContactsTab client={client} update={update} patch={patch} employees={employees} />
          </div>
        )}
      </div>

      {editorTarget && (
        <CardSectionEditor
          client={client}
          editTarget={editorTarget}
          onPatchClient={patchAndSave}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  );
}
