// ─── תיק מס — קריאה תחילה ────────────────────────────────────────────────
// מקור: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-tax, Source of Truth מאושר). שורות סיכום, פרטים רק אחרי פתיחה,
// עריכה רק מתוך הפירוט. הערך המקובל תמיד על Client — השכבה הזו רק מציגה
// אותו ומאפשרת הצעה/אישור/דחייה/עריכה ידנית דרך useTaxFacts.
//
// ‼ לא כל שורת ה-מוקאפ קיימת כאן: שורות שאין להן נתון אמיתי על הלקוח לא
// מוצגות בכלל (§8 ב-CLAUDE.md — "אל תמציא"). "ניתוח מקצועי" למסלול שכירות
// הושמט במכוון: חישוב אמין דורש הוצאות/פחת/מדרגת מס שוליים שאינם עובדות
// מקובלות על הלקוח — המלצה מחושבת מתוך ברירות מחדל הייתה מטעה.

import { useMemo, useState } from 'react';
import type { Client, RentalTaxTrack, TaxAuthority, TaxFileInfo } from '../../types';
import {
  TAX_AUTHORITY_LABELS, TAX_FILE_REP_STATUS_LABELS,
  FAMILY_STATUS_LABELS,
} from '../../types';
import { VAT_FREQ_LABELS, SHAAM_STATUS_LABELS } from '../../types/clientWorkspace';
import type { TaxFactChange } from '../../types/taxFacts';
import { TAX_FACT_SOURCE_LABELS } from '../../types/taxFacts';
import { useTaxFacts } from '../../hooks/useTaxFacts';
import { shortDate } from '../../utils/clientDerived';
import { clientDisplayName, spouseDisplayName, registeredFileInfo } from '../../features/annualReport/profile';
import { getTaxYearData } from '../../data/taxData';
import { calcCreditPoints } from '../../utils/taxCalculations';

interface Props {
  client: Client;
  /** סנכרון עותק הלקוח המקומי ב-ClientWorkspace אחרי כתיבה טרנזקציונית שקרתה
   *  בשרת (accept/manual-edit) ולא דרך onSave הרגיל. */
  onClientPersisted: (c: Client) => void;
  /** פותח את אותו חלון "שלח שאלון" שכבר קיים בכותרת התיק — לא נבנה מנגנון שני. */
  onSendQuestionnaire: () => void;
  /**
   * עריכת פרטי הלקוח המלאים. ‼ זו הייתה לשונית עמיתה בשם "התיק", והיא ירדה:
   * שתי רשומות מקצועיות זו לצד זו הכריחו את הרו"ח לבחור ביניהן. היכולת
   * נשמרה — היא נפתחת מכאן, מתוך הרשומה עצמה, כפעולה משנית.
   */
  onOpenDetails?: () => void;
}

const RENTAL_TRACK_LABELS: Record<RentalTaxTrack, string> = {
  exempt: 'פטור', flat10: 'מסלול 10%', regular: 'מסלול רגיל',
};

const AUTHORITY_ORDER: TaxAuthority[] = ['income_tax', 'vat', 'deductions', 'national_insurance'];

/** אילו שדות מנוהלים שייכים לכל רשות — לצורך פרובננס "מקור: יישור קו" בפירוט המורחב (M2). */
const AUTHORITY_FIELD_KEYS: Record<TaxAuthority, (keyof Client)[]> = {
  income_tax: ['incomeTaxFileType', 'taxOfficeName', 'incomeTaxUnit', 'incomeTaxEconomicIndustry',
    'pitAdvancePercent', 'pitAdvanceFrequency', 'incomeTaxBalance', 'capitalDeclarationRequired',
    'capitalDeclarationDeadline', 'incomeTaxDebitAuthorization', 'incomeTaxReportingStatus'],
  vat: ['vatFileType', 'vatOpeningDate', 'vatPrimaryIndustry', 'vatFrequency', 'vatLastReportPeriod',
    'vatBalance', 'vatDebitAuthorization'],
  deductions: ['withholdingRate', 'hasExemptFromWithholding', 'withholdingDetail', 'bookStatus'],
  national_insurance: ['niBalance', 'niOccupations', 'niDebitAuthorization', 'niAdvanceMonthly', 'niIncomeBasisMonthly'],
};

function money(n?: number): string | undefined {
  return typeof n === 'number' && !Number.isNaN(n) ? `₪${Math.round(n).toLocaleString('he-IL')}` : undefined;
}
function monthYear(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { month: '2-digit', year: 'numeric' });
}

/** משפט פתיחה אחד — רק מתוך עובדות אמיתיות; סעיף חסר פשוט לא נכנס למשפט. */
function buildSentence(client: Client): string {
  const vatPart = client.vatStatus === 'authorizedDealer' ? 'עוסק מורשה'
    : client.vatStatus === 'exemptDealer' ? 'עוסק פטור' : null;
  const lead = vatPart
    ? `${vatPart}${client.businessDescription ? ` (${client.businessDescription})` : ''}`
    : client.incomeTaxType === 'employee' ? 'שכיר'
    : client.incomeTaxType === 'selfEmployed' ? 'עצמאי'
    : client.incomeTaxType === 'both' ? 'שכיר ועצמאי'
    : client.incomeTaxType === 'rentalOnly' ? 'הכנסות משכירות'
    : 'הכנסות פסיביות';

  const familyPart = FAMILY_STATUS_LABELS[client.familyStatus]
    + ((client.children ?? []).length > 0 ? ` + ${client.children.length}` : '');

  const sources: string[] = [];
  if ((client.businesses ?? []).length > 0 || client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both') sources.push('עסק');
  if ((client.employers ?? []).length > 0 || client.incomeTaxType === 'employee' || client.incomeTaxType === 'both') sources.push('משכורת');
  if (client.hasRentalIncome) sources.push('שכירות');
  if (client.hasCapitalIncome || (client.investmentAccounts ?? []).length > 0) sources.push('שוק ההון');

  let out = `${lead}, ${familyPart}.`;
  if (sources.length > 0) out += ` הכנסות: ${sources.join(', ')}.`;
  if (client.pitAdvancePercent) out += ` מקדמות מס הכנסה ${client.pitAdvancePercent}%.`;
  return out;
}

/** שורה מתקפלת אחת — סיכום קבוע, פרטים רק אחרי פתיחה. */
function TRow({
  id, name, summary, warn, open, onToggle, children,
}: {
  id: string; name: string; summary: string; warn?: string;
  open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div className={`txf-row ${open ? 'is-open' : ''}`}>
      <button type="button" className="txf-row-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="txf-row-name">{name}</span>
        <span className="txf-row-sum">{summary} {warn && <span className="txf-warn-inline">⚠ {warn}</span>}</span>
        <span className="txf-row-chev">◂</span>
      </button>
      {open && <div className="txf-row-body">{children}</div>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="k">{k}</div><div className="v">{v}</div></div>;
}

/** תא בטבלת הרשויות: מספרי התיקים ששייכים לו, או "—" כשאין תיק כזה.
 *  תיק שקיים אבל מספרו טרם הוזן אומר זאת במפורש — "—" היה משקר. */
function fileCellText(cellFiles: TaxFileInfo[], tag?: string): React.ReactNode {
  if (cellFiles.length === 0) return <span className="txf-mtx-none">—</span>;
  return (
    <>
      {tag && <span className="txf-mtx-tag">{tag}</span>}
      {cellFiles.map((f, i) => (
        <span key={f.id}>
          {i > 0 && <span className="txf-mtx-sep"> · </span>}
          {f.fileNumber
            ? <span className="txf-mtx-num">{f.fileNumber}</span>
            : <span className="txf-mtx-missing">חסר מספר</span>}
        </span>
      ))}
    </>
  );
}

function SrcLine({ label, onEdit }: { label: string; onEdit?: () => void }) {
  return (
    <div className="txf-srcline">
      <span>{label}</span>
      {onEdit && <button type="button" onClick={onEdit}>ערוך</button>}
    </div>
  );
}

export default function TaxFileTab({ client, onClientPersisted, onSendQuestionnaire, onOpenDetails }: Props) {
  const { pending, acceptFact, rejectFact, recordManualEdit } = useTaxFacts(client.id || undefined);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openChanges, setOpenChanges] = useState<Set<string>>(new Set());
  const [busyChangeId, setBusyChangeId] = useState<string | null>(null);
  const [changeErrors, setChangeErrors] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<'donations' | 'rental' | null>(null);
  const [donationsDraft, setDonationsDraft] = useState('');
  const [rentalDraft, setRentalDraft] = useState<RentalTaxTrack>(client.rentalTaxTrack ?? 'regular');
  const [savingEdit, setSavingEdit] = useState(false);

  function toggleRow(id: string) {
    setOpenRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleChange(id: string) {
    setOpenChanges(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const meta = client.fieldMeta ?? {};

  async function handleAccept(change: TaxFactChange) {
    setBusyChangeId(change.id);
    setChangeErrors(e => ({ ...e, [change.id]: '' }));
    const res = await acceptFact(change);
    setBusyChangeId(null);
    if (!res.ok) {
      // הערך המקובל השתנה אחרי שההצעה נוצרה — לא נדרס בשקט, מסבירים ומרעננים
      // את הרשימה כדי שהרו"ח יראה מצב עדכני לפני שיחליט שוב.
      const msg = res.error === 'stale_conflict'
        ? 'הערך בתיק השתנה אחרי שההצעה הזו נוצרה — נדרשת בדיקה מחדש. רענן ונסה שוב.'
        : (res.error || 'שגיאה בעדכון');
      setChangeErrors(e => ({ ...e, [change.id]: msg }));
      return;
    }
    if (res.client) onClientPersisted(res.client);
  }
  async function handleReject(change: TaxFactChange) {
    setBusyChangeId(change.id);
    setChangeErrors(e => ({ ...e, [change.id]: '' }));
    const res = await rejectFact(change.id);
    setBusyChangeId(null);
    if (!res.ok) setChangeErrors(e => ({ ...e, [change.id]: res.error || 'שגיאה בדחייה' }));
  }

  async function saveDonations() {
    const val = Math.max(0, Number(donationsDraft.replace(/[^\d.-]/g, '')) || 0);
    setSavingEdit(true);
    const res = await recordManualEdit(
      client.id, 'donationsAnnual', 'תרומות שנתיות',
      money(client.donationsAnnual) ?? '—', money(val) ?? '—',
      { donationsAnnual: val },
    );
    setSavingEdit(false);
    if (res.ok) { if (res.client) onClientPersisted(res.client); setEditingField(null); }
  }
  async function saveRentalTrack() {
    setSavingEdit(true);
    const res = await recordManualEdit(
      client.id, 'rentalTaxTrack', 'מסלול מיסוי שכירות',
      client.rentalTaxTrack ? RENTAL_TRACK_LABELS[client.rentalTaxTrack] : '—', RENTAL_TRACK_LABELS[rentalDraft],
      { rentalTaxTrack: rentalDraft },
    );
    setSavingEdit(false);
    if (res.ok) { if (res.client) onClientPersisted(res.client); setEditingField(null); }
  }

  const sentence = useMemo(() => buildSentence(client), [client]);

  const year = new Date().getFullYear();
  const taxData = getTaxYearData(year) ?? getTaxYearData(year - 1);
  const creditLines = useMemo(
    () => taxData ? calcCreditPoints(client, year, taxData.creditPointValue) : [],
    [client, year, taxData],
  );
  const totalPoints = creditLines.reduce((s, l) => s + l.points, 0);
  const totalValue = creditLines.reduce((s, l) => s + l.valueNIS, 0);

  const questionnaireSyncs = Object.values(meta)
    .filter(m => m.source === 'questionnaire' && m.syncedAt)
    .map(m => m.syncedAt as string)
    .sort();
  const lastQSync = questionnaireSyncs[questionnaireSyncs.length - 1];

  const files = client.taxFiles ?? [];
  const married = client.familyStatus === 'married';

  // ── עמודות טבלת הרשויות: בן זוג מקבל עמודה רק כשהוא באמת קיים בכרטיס ──
  const clientName = clientDisplayName(client);
  const spouseName = spouseDisplayName(client);
  const hasSpouseColumn = married && !!client.spouseName?.trim();
  const regFile = registeredFileInfo(client);
  const cols = [
    // הסימון מוצג רק בזוג: אצל אדם בודד התיק הוא שלו מעצם הדבר
    { key: 'client' as const, name: clientName, registered: hasSpouseColumn && regFile?.owner === 'client' },
    ...(hasSpouseColumn
      ? [{ key: 'spouse' as const, name: spouseName, registered: regFile?.owner === 'spouse' }]
      : []),
  ];
  const niEmployerFiles = files.filter(f => f.authority === 'national_insurance' && f.owner === 'joint');

  function ownerShort(f: TaxFileInfo): string {
    if (f.authority === 'national_insurance' && f.owner === 'joint') return 'תיק הניכויים';
    if (f.owner === 'joint') return 'משותף';
    return f.owner === 'spouse' ? spouseName : clientName;
  }

  /** הפירוט שנפתח מתחת לשורת הרשות. מספרי התיקים לא חוזרים לכאן — הם כבר
   *  בטבלה; מה שנשאר הוא מצב התיק (ייצוג, יתרות, דיווחים, הרשאות). */
  function authorityKVs(authority: TaxAuthority, authFiles: TaxFileInfo[]): { k: string; v: React.ReactNode }[] {
    const out: { k: string; v: React.ReactNode }[] = [];
    const add = (k: string, v: React.ReactNode) => out.push({ k, v });

    for (const f of authFiles) {
      add(authFiles.length > 1 ? `סטטוס ייצוג · ${ownerShort(f)}` : 'סטטוס ייצוג',
        TAX_FILE_REP_STATUS_LABELS[f.repStatus]);
    }

    if (authority === 'income_tax') {
      if (client.pitAdvancePercent) add('מקדמות', `${client.pitAdvancePercent}%`);
      if (client.bookStatus && client.bookStatus !== 'unknown') {
        add('ניהול ספרים', <span style={client.bookStatus === 'rejected' ? { color: 'var(--warn)' } : undefined}>{client.bookStatus === 'kosher' ? 'תקין' : 'נפסל'}</span>);
      }
      if (client.hasExemptFromWithholding) add('פטור מניכוי במקור', 'כן');
      if (client.withholdingDetail) add('פירוט ניכוי במקור', client.withholdingDetail);
      if (client.taxOfficeName) add('פקיד שומה', client.taxOfficeName);
      if (client.incomeTaxUnit) add('חוליה', client.incomeTaxUnit);
      if (client.incomeTaxEconomicIndustry) add('ענף כלכלי', client.incomeTaxEconomicIndustry);
      if (client.incomeTaxBalance != null) add('יתרה במס הכנסה', money(client.incomeTaxBalance));
      if (client.capitalDeclarationRequired) {
        add('הצהרת הון', <span style={{ color: 'var(--warn)' }}>דרישה פתוחה{client.capitalDeclarationDeadline ? ` · עד ${shortDate(client.capitalDeclarationDeadline)}` : ''}</span>);
      }
      if (client.incomeTaxDebitAuthorization != null) {
        add('הרשאה לחיוב חשבון', client.incomeTaxDebitAuthorization ? 'קיימת' : <span style={{ color: 'var(--warn)' }}>אין הרשאה</span>);
      }
      if (client.incomeTaxReportingStatus) {
        add('מצב דיווחים', <span style={client.incomeTaxReportingStatus === 'אין דיווחים חסרים' ? undefined : { color: 'var(--warn)' }}>{client.incomeTaxReportingStatus}</span>);
      }
    }

    if (authority === 'vat') {
      if (client.vatFrequency) add('תדירות דיווח', VAT_FREQ_LABELS[client.vatFrequency]);
      if (client.vatFileType) add('סוג תיק', client.vatFileType);
      if (client.vatOpeningDate) add('תאריך פתיחת תיק', shortDate(client.vatOpeningDate));
      if (client.vatPrimaryIndustry) add('ענף עיקרי', client.vatPrimaryIndustry);
      if (client.vatLastReportPeriod) add('דוח אחרון שהוגש', client.vatLastReportPeriod);
      if (client.vatBalance != null) add('יתרה במע״מ', money(client.vatBalance));
      if (client.vatDebitAuthorization != null) {
        add('הרשאה לחיוב חשבון', client.vatDebitAuthorization ? 'קיימת' : <span style={{ color: 'var(--warn)' }}>אין הרשאה</span>);
      }
    }

    if (authority === 'deductions') {
      if (client.withholdingRate != null) add('שיעור ניכוי', `${client.withholdingRate}%`);
      if (client.withholdingValidUntil) add('תוקף האישור', shortDate(client.withholdingValidUntil));
    }

    if (authority === 'national_insurance') {
      if (client.niAdvanceMonthly) add('מקדמה חודשית', money(client.niAdvanceMonthly));
      if (client.niIncomeBasisMonthly != null) add('בסיס הכנסה למקדמות', money(client.niIncomeBasisMonthly));
      if (client.niBalance != null) add('יתרה בביטוח לאומי', money(client.niBalance));
      if ((client.niOccupations?.length ?? 0) > 0) add('עיסוקים', client.niOccupations!.length);
      if (client.niDebitAuthorization != null) {
        add('הרשאה לחיוב חשבון', client.niDebitAuthorization ? 'קיימת' : <span style={{ color: 'var(--warn)' }}>אין הרשאה</span>);
      }
    }

    // ‼ שע״ם היא הרשאה אחת לכל הרשויות — היא שייכת למס הכנסה ולא חוזרת
    // בכל שורה. קודם היא הופיעה ארבע פעמים, כאילו יש ארבע הרשאות.
    if (authority === 'income_tax' && client.shaamStatus) add('הרשאת שע״ם', SHAAM_STATUS_LABELS[client.shaamStatus]);

    return out;
  }
  const businesses = client.businesses ?? [];
  const employers = client.employers ?? [];
  const properties = client.properties ?? [];
  const rentedProperties = properties.filter(p => p.isRented);
  const otherProperties = properties.filter(p => !p.isRented);
  const investmentAccounts = client.investmentAccounts ?? [];
  const bankAccounts = client.bankAccounts ?? [];
  const foreignAccounts = client.foreignAccounts ?? [];
  const pensionFunds = client.pensionFunds ?? [];

  const showBusinessRow = businesses.length > 0 || client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both';
  const showSalaryRow = employers.length > 0 || client.incomeTaxType === 'employee' || client.incomeTaxType === 'both';
  const showRentalRow = !!client.hasRentalIncome || rentedProperties.length > 0 || !!client.rentalIncomeAnnual;
  // ‼ קודם התנאי היה רק investmentAccounts.length > 0 — לקוח שסומן כבעל
  // הכנסה משוק ההון, עם סכומים, אבל בלי שורת חשבון, לא קיבל שורה בכלל
  // והמידע פשוט נעלם. אותו דפוס תוקן גם במשפחה ובנכסים.
  const showCapitalRow = investmentAccounts.length > 0 || !!client.hasCapitalIncome
    || !!client.capitalGainsAnnual || !!client.dividendInterestAnnual || !!client.hasInvestments;

  const showFamilyRow = married || (client.children ?? []).length > 0 || client.familyStatus !== 'single';
  const showAssetsRow = otherProperties.length > 0 || bankAccounts.length > 0 || foreignAccounts.length > 0
    || !!client.hasResidentialProperty || !!client.hasForeignAssets;
  const showSavingsRow = client.hasPension || pensionFunds.length > 0 || client.hasKrenHashtalmut
    || client.hasLifeInsurance || client.hasDisabilityInsurance || !!client.donationsAnnual;

  return (
    <div className="txf-root">
      <div className="txf-head">
        <div>
          <h2>תיק מס</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>הרשומה המקצועית של הלקוח. עריכה — מתוך הפירוט בלבד.</div>
        </div>
        {/* ‼ "עדכון סטטוס מס" ולא "שאלון": השאלון הוא אחד המקורות לרענון
            התיק, לא הרשומה עצמה, והוא אינו שייך רק לעונת הדוח השנתי. הרשומה
            הזו חיה כל השנה, והעדכון מזרים אליה הצעות דרך אותו מסלול התאמה
            מאושר (M1) — לא כותב עליה ישירות.
            ‼ הכפתור הזה הוא נקודת כניסה שנייה ליכולת אחת, לא מסלול שני:
            הוא פותח את אותו חלון "הוסף בקשה" עם סוג הבקשה intake_questionnaire
            מסומן מראש, ולכן נוצרת אותה בקשה מאוחדת בדיוק כמו מהתהליך. קודם
            הוא פתח שליחת מייל ישירה (?intake=TOKEN) שעקפה את מודל הבקשות
            והדף האישי — ערוץ תקשורת שני ללקוח, וזה בדיוק מה שאסור. */}
        <div className="txf-qstat">
          <span>{lastQSync ? `סטטוס מס · עודכן לאחרונה ${monthYear(lastQSync)}` : 'סטטוס מס · טרם עודכן'}</span>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onSendQuestionnaire}>עדכון סטטוס מס</button>
        </div>
      </div>

      <div className="txf-sentence">{sentence}</div>

      {pending.map(change => {
        const open = openChanges.has(change.id);
        const busy = busyChangeId === change.id;
        return (
          <div key={change.id} className={`txf-qchange ${open ? 'open' : ''}`}>
            <button type="button" className="txf-qchange-head" onClick={() => toggleChange(change.id)}>
              <b>עדכון מ{TAX_FACT_SOURCE_LABELS[change.source]} ממתין לאישורך</b>
              <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{change.label}</span>
              <span style={{ marginInlineStart: 'auto', color: 'var(--ink-4)', fontSize: 11 }}>{open ? 'סגור ‹' : 'פתח ›'}</span>
            </button>
            {open && (
              <div className="txf-qchange-body">
                <div className="txf-oldnew">
                  <div><div className="k">בתיק היום</div>{change.oldValue?.display ?? '—'}</div>
                  <div><div className="k">מ{TAX_FACT_SOURCE_LABELS[change.source]} ({shortDate(change.createdAt)})</div>{change.newValue.display}</div>
                </div>
                <div className="txf-editor-actions">
                  <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => handleAccept(change)}>
                    {busy ? 'רגע…' : 'אשר ועדכן בתיק'}
                  </button>
                  <button type="button" className="ui-btn" disabled={busy} onClick={() => handleReject(change)}>השאר את הערך הנוכחי</button>
                </div>
                {changeErrors[change.id] && <div className="txf-qchange-error">{changeErrors[change.id]}</div>}
                <div className="txf-note">ההחלטה נרשמת ביומן: מקור, ערך קודם, ערך חדש ומועד.</div>
              </div>
            )}
          </div>
        );
      })}

      {/* א · מצב מול הרשויות */}
      <div className="txf-secthead">מצב מול הרשויות</div>
      <div className="txf-sect">
        {files.length === 0 ? (
          <div className="txf-empty">
            עדיין לא הוגדרו תיקים ברשויות.
            {onOpenDetails && (
              <> <button type="button" className="ui-linkbtn" onClick={onOpenDetails}>הגדרת תיקי הרשויות ←</button></>
            )}
          </div>
        ) : (
          <>
            {/* ‼ שכבת הסיכום היא מטריצה ולא ארבע שורות טקסט: השאלה שהרו"ח
                שואל כאן היא "איזה תיק יש לכל אחד מבני הזוג בכל רשות", וזו
                שאלה דו-ממדית. קודם מספרי התיקים היו קבורים בתוך הפירוט
                הנפתח, ולכן התשובה דרשה ארבע פתיחות והרכבה בראש.
                רשות בלי תיק נשארת בטבלה עם "—" — היעדר תיק הוא עובדה
                מקצועית, לא שורה שצריך להשמיט. */}
            <div className={`txf-mtx ${cols.length > 1 ? 'is-pair' : 'is-solo'}`}>
              <div className="txf-mtx-head">
                <div className="txf-mtx-auth">רשות</div>
                {cols.map(c => (
                  <div key={c.key} className="txf-mtx-cell">
                    <div className="txf-mtx-name">{c.name}</div>
                    {c.registered && <div className="txf-mtx-reg">בן/בת הזוג הרשום/ה</div>}
                  </div>
                ))}
                <span className="txf-mtx-chev" aria-hidden="true" />
              </div>

              {AUTHORITY_ORDER.map(authority => {
                const authFiles = files.filter(f => f.authority === authority);
                // ב"ל: owner='joint' הוא תיק הניכויים (מעסיק) — שורה משלו, לא תא בטבלה
                const rowFiles = authority === 'national_insurance'
                  ? authFiles.filter(f => f.owner !== 'joint') : authFiles;
                const jointFiles = authority === 'national_insurance'
                  ? [] : rowFiles.filter(f => f.owner === 'joint');
                const rowId = `auth-${authority}`;
                const kvs = authorityKVs(authority, authFiles);
                const expandable = kvs.length > 0;
                const open = expandable && openRows.has(rowId);
                const warn = authority === 'income_tax' && client.bookStatus === 'rejected';
                const cells = jointFiles.length > 0
                  ? <div className="txf-mtx-cell txf-mtx-joint">{fileCellText(jointFiles, 'משותף')}</div>
                  : cols.map(c => (
                    <div key={c.key} className="txf-mtx-cell">
                      {/* שם העמודה חוזר בתוך התא — מוצג רק במסך צר, ששם
                          שורת הכותרת יורדת ובלעדיו התא מאבד את הצד שלו. */}
                      <span className="txf-mtx-collab">{c.name}</span>
                      {fileCellText(rowFiles.filter(f => f.owner === c.key))}
                    </div>
                  ));
                return (
                  <div key={authority} className={`txf-mtx-group ${open ? 'is-open' : ''}`}>
                    {/* שורה בלי פירוט נשארת div: כפתור שלא עושה דבר משקר לעכבר ולמקלדת */}
                    {expandable ? (
                      <button type="button" className="txf-mtx-row" onClick={() => toggleRow(rowId)} aria-expanded={open}>
                        <div className="txf-mtx-auth">
                          {TAX_AUTHORITY_LABELS[authority]}
                          {warn && <span className="txf-warn-inline">⚠ ניהול ספרים נפסל</span>}
                        </div>
                        {cells}
                        <span className="txf-mtx-chev">◂</span>
                      </button>
                    ) : (
                      <div className="txf-mtx-row is-static">
                        <div className="txf-mtx-auth">{TAX_AUTHORITY_LABELS[authority]}</div>
                        {cells}
                        <span className="txf-mtx-chev" aria-hidden="true" />
                      </div>
                    )}
                    {open && (
                      <div className="txf-mtx-body">
                        <div className="txf-kv">
                          {kvs.map((kv, i) => <KV key={i} k={kv.k} v={kv.v} />)}
                        </div>
                        <SrcLine label="מקור: תיקי הרשויות בכרטיס הלקוח · עריכה מלאה בפרטי הלקוח" />
                        {(() => {
                          // ‼ פרובננס עדין — רק בפירוט המורחב, לא במשפט הפתיחה (הכרעת M2).
                          const authKeys = AUTHORITY_FIELD_KEYS[authority];
                          const latest = authKeys
                            .map(k => meta[k])
                            .filter((m): m is NonNullable<typeof m> => !!m && m.source === 'institution_alignment')
                            .sort((a, b) => (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''))[0];
                          if (!latest) return null;
                          return <SrcLine label={`מקור: יישור קו מול הרשויות${latest.syncedAt ? ` · עודכן ${shortDate(latest.syncedAt)}` : ''}`} />;
                        })()}
                      </div>
                    )}
                    {/* תיק הניכויים בב"ל — שורה משלו מיד מתחת לב"ל האישי,
                        כי הוא של המעסיק ולא של אף אחד מבני הזוג. */}
                    {authority === 'national_insurance' && niEmployerFiles.length > 0 && (
                      <div className="txf-mtx-row is-static is-sub">
                        <div className="txf-mtx-auth">תיק הניכויים (מעסיק)</div>
                        <div className="txf-mtx-cell txf-mtx-joint">{fileCellText(niEmployerFiles)}</div>
                        <span className="txf-mtx-chev" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {onOpenDetails && (
              <div className="txf-mtx-foot">
                <button type="button" className="ui-linkbtn" onClick={onOpenDetails}>עריכת תיקי הרשויות ←</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ב · הפעילות הכלכלית */}
      {(showBusinessRow || showSalaryRow || showRentalRow || showCapitalRow) && (
        <>
          <div className="txf-secthead">הפעילות הכלכלית</div>
          <div className="txf-sect">
            {showBusinessRow && (
              <TRow
                id="biz" name="עצמאי"
                summary={businesses.length > 0 ? businesses.map(b => b.name).join(' · ') : (client.businessDescription || 'עסק עצמאי')}
                open={openRows.has('biz')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {businesses.length > 0 ? businesses.map(b => (
                    <KV key={b.id} k={b.name} v={`${b.description || '—'}${b.revenueAnnual ? ` · מחזור ${money(b.revenueAnnual)}` : ''}`} />
                  )) : (
                    <>
                      <KV k="תיאור העיסוק" v={client.businessDescription || '—'} />
                      <KV k="סיווג מע״מ" v={client.vatStatus === 'authorizedDealer' ? 'עוסק מורשה' : client.vatStatus === 'exemptDealer' ? 'עוסק פטור' : '—'} />
                    </>
                  )}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" />
              </TRow>
            )}

            {showSalaryRow && (
              <TRow
                id="sal" name="שכיר"
                summary={employers.length > 0 ? employers.map(e => e.name).join(' · ') : 'שכיר'}
                open={openRows.has('sal')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {employers.length > 0 ? employers.flatMap(e => [
                    <KV key={`${e.id}-n`} k="מעסיק" v={e.name} />,
                    e.grossSalaryAnnual ? <KV key={`${e.id}-s`} k="שכר ברוטו שנתי" v={money(e.grossSalaryAnnual)} /> : null,
                    e.startDate ? <KV key={`${e.id}-d`} k="תחילת עבודה" v={shortDate(e.startDate)} /> : null,
                  ]) : <KV k="סיווג" v="שכיר — אין פירוט מעביד בתיק" />}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח · עריכה מלאה בפרטי הלקוח" />
              </TRow>
            )}

            {showRentalRow && (
              <TRow
                id="rent" name="שכירות"
                summary={[
                  rentedProperties[0]?.address,
                  client.rentalIncomeAnnual ? `${money(client.rentalIncomeAnnual)} לשנה` : null,
                  client.rentalTaxTrack ? RENTAL_TRACK_LABELS[client.rentalTaxTrack] : null,
                ].filter(Boolean).join(' · ') || 'הכנסה משכירות'}
                open={openRows.has('rent')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {rentedProperties.map(p => (
                    <KV key={p.id} k="נכס" v={`${p.address}${p.city ? `, ${p.city}` : ''}${p.monthlyRent ? ` · ${money(p.monthlyRent)}/חודש` : ''}`} />
                  ))}
                  {client.rentalIncomeAnnual != null && <KV k="הכנסה שנתית" v={money(client.rentalIncomeAnnual)} />}
                  <KV k="מסלול מיסוי נבחר" v={client.rentalTaxTrack ? RENTAL_TRACK_LABELS[client.rentalTaxTrack] : 'לא נבחר'} />
                </div>
                {editingField === 'rental' ? (
                  <div className="txf-editor">
                    <h4>עריכת מסלול מיסוי שכירות</h4>
                    <select value={rentalDraft} onChange={e => setRentalDraft(e.target.value as RentalTaxTrack)}>
                      {(Object.keys(RENTAL_TRACK_LABELS) as RentalTaxTrack[]).map(t => <option key={t} value={t}>{RENTAL_TRACK_LABELS[t]}</option>)}
                    </select>
                    <div className="txf-note">עריכה ידנית הופכת לערך המקובל. המקור הקודם נשמר בהיסטוריה.</div>
                    <div className="txf-editor-actions">
                      <button type="button" className="ui-btn ui-btn-primary" disabled={savingEdit} onClick={saveRentalTrack}>{savingEdit ? 'שומר…' : 'שמור'}</button>
                      <button type="button" className="ui-btn" onClick={() => setEditingField(null)}>ביטול</button>
                    </div>
                  </div>
                ) : (
                  <SrcLine label={meta.rentalTaxTrack ? `מקור: ${TAX_FACT_SOURCE_LABELS[meta.rentalTaxTrack.source as keyof typeof TAX_FACT_SOURCE_LABELS] ?? 'כרטיס הלקוח'}${meta.rentalTaxTrack.syncedAt ? ` · עודכן ${shortDate(meta.rentalTaxTrack.syncedAt)}` : ''}` : 'מקור: כרטיס הלקוח'} onEdit={() => { setRentalDraft(client.rentalTaxTrack ?? 'regular'); setEditingField('rental'); }} />
                )}
              </TRow>
            )}

            {showCapitalRow && (
              <TRow
                id="cap" name="שוק ההון"
                summary={`${investmentAccounts.length} תיק${investmentAccounts.length > 1 ? 'ים' : ''} · ${investmentAccounts.map(a => a.institutionName).join(', ')}`}
                open={openRows.has('cap')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {investmentAccounts.map(a => <KV key={a.id} k={a.institutionName} v={a.accountNumber ? `חשבון ${a.accountNumber}` : 'ללא מספר חשבון רשום'} />)}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" />
              </TRow>
            )}
          </div>
        </>
      )}

      {/* ג · מידע מקצועי */}
      <div className="txf-secthead">מידע מקצועי</div>
      <div className="txf-sect">
        {showFamilyRow && (
          <TRow
            id="family" name="משפחה ובן/בת זוג"
            summary={`${FAMILY_STATUS_LABELS[client.familyStatus]}${(client.children ?? []).length ? ` · ${client.children.length} ילדים` : ''}`}
            open={openRows.has('family')} onToggle={toggleRow}
          >
            <div className="txf-kv">
              <KV k="מצב משפחתי" v={FAMILY_STATUS_LABELS[client.familyStatus]} />
              {married && <KV k="בן/בת הזוג" v={spouseName} />}
              {/* ‼ ת.ז., טלפון ומייל של בן/בת הזוג הם פרטי קשר וזיהוי מלאים
                  ולא נספח לשם: הם נדרשים לייפוי כוח, לקישור חתימה אישי
                  ולפנייה ישירה. קודם הת"ז הייתה משורשרת לשם והטלפון לא הופיע
                  כאן כלל — הרו"ח שחיפש אותו לא ידע שהוא בכלל קיים בכרטיס. */}
              {married && <KV k={`ת.ז. ${spouseName}`} v={client.spouseIdNumber || <span style={{ color: 'var(--ink-4)' }}>טרם התקבלה</span>} />}
              {married && <KV k={`טלפון ${spouseName}`} v={client.spousePhone?.trim()
                ? <span className="ltr-isolate">{client.spousePhone}</span>
                : <span style={{ color: 'var(--ink-4)' }}>טרם התקבל</span>} />}
              {married && <KV k={`אימייל ${spouseName}`} v={client.spouseEmail?.trim()
                ? <span className="ltr-isolate">{client.spouseEmail}</span>
                : <span style={{ color: 'var(--ink-4)' }}>טרם התקבל</span>} />}
              {married && <KV k={`תעסוקת ${spouseName}`} v={client.spouseWorking ? 'שכיר/ה' : 'ללא הכנסה'} />}
              {married && client.spouseWorking && client.spouseIncome ? <KV k="הכנסת בן/בת הזוג (שנתית)" v={money(client.spouseIncome)} /> : null}
              {(client.children ?? []).length > 0 && (
                <KV k="ילדים" v={`${client.children.length} · שנתונים ${client.children.map(c => c.birthYear).sort().join(', ')}`} />
              )}
            </div>
            <SrcLine label="מקור: כרטיס הלקוח" onEdit={onOpenDetails} />
          </TRow>
        )}

        <TRow
          id="credits" name="זיכויים והטבות"
          summary={`${totalPoints.toFixed(2).replace(/\.?0+$/, '')} נקודות${client.qualifyingSettlementId ? ' · ישוב מזכה' : ''}`}
          open={openRows.has('credits')} onToggle={toggleRow}
        >
          <div className="txf-kv">
            {creditLines.map((l, i) => <KV key={i} k={l.description} v={`${l.points} נק׳${l.valueNIS ? ` · ${money(l.valueNIS)}` : ''}`} />)}
            <KV k="יישוב מזכה" v={client.qualifyingSettlementId || 'לא'} />
            <KV k="סה״כ" v={<b>{totalPoints.toFixed(2).replace(/\.?0+$/, '')} נק׳{totalValue ? ` · ${money(totalValue)}` : ''}</b>} />
          </div>
          <SrcLine label={`מחושב חי מהכרטיס · ${year}`} />
        </TRow>

        {showAssetsRow && (
          <TRow
            id="assets" name="נכסים והשקעות"
            summary={[
              otherProperties[0]?.address,
              bankAccounts.length ? `${bankAccounts.length} חשבונות בנק` : null,
              foreignAccounts.length ? 'נכסים בחו״ל' : null,
            ].filter(Boolean).join(' · ') || 'נכסים'}
            open={openRows.has('assets')} onToggle={toggleRow}
          >
            <div className="txf-kv">
              {otherProperties.map(p => <KV key={p.id} k="נכס דיור" v={`${p.address}${p.city ? `, ${p.city}` : ''}`} />)}
              {bankAccounts.map(b => <KV key={b.id} k={b.bankName} v={b.isPrimary ? 'חשבון ראשי — להחזרי מס' : (b.branchName || '—')} />)}
              {foreignAccounts.length > 0 && <KV k="נכסים בחו״ל" v={foreignAccounts.map(a => a.country || a.institutionName).filter(Boolean).join(', ') || `${foreignAccounts.length}`} />}
            </div>
            <SrcLine label="מקור: כרטיס הלקוח" />
          </TRow>
        )}

        {showSavingsRow && (
          <TRow
            id="savings" name="הפקדות וביטוחים"
            summary={[
              pensionFunds.length ? pensionFunds.map(p => p.institutionName).join(', ') : (client.hasPension ? client.pensionFundName : null),
              client.hasKrenHashtalmut ? 'קרן השתלמות' : null,
              client.donationsAnnual ? 'תרומות' : null,
            ].filter(Boolean).join(' · ') || 'הפקדות'}
            open={openRows.has('savings')} onToggle={toggleRow}
          >
            <div className="txf-kv">
              {pensionFunds.length > 0
                ? pensionFunds.map(p => <KV key={p.id} k="פנסיה / השתלמות" v={p.institutionName} />)
                : (client.hasPension && <KV k="פנסיה" v={client.pensionFundName || 'קיימת'} />)}
              {client.hasKrenHashtalmut && <KV k="קרן השתלמות" v={client.krenHashtalmutMonthly ? `${money(client.krenHashtalmutMonthly)} לחודש` : 'קיימת'} />}
              {client.hasLifeInsurance && <KV k="ביטוח חיים" v={client.lifeInsuranceAnnual ? `${money(client.lifeInsuranceAnnual)} לשנה` : 'קיים'} />}
              {client.hasDisabilityInsurance && <KV k="אובדן כושר עבודה" v="קיים" />}
              <KV k="תרומות (מוכרות סעיף 46)" v={money(client.donationsAnnual) ?? '—'} />
            </div>
            {editingField === 'donations' ? (
              <div className="txf-editor">
                <h4>עריכת תרומות שנתיות</h4>
                <input inputMode="numeric" value={donationsDraft} onChange={e => setDonationsDraft(e.target.value)} placeholder="0" style={{ width: 140 }} />
                <div className="txf-note">עריכה ידנית הופכת לערך המקובל. הערך הקודם נשמר בהיסטוריה, ומקור חדש שיחלוק עליו יופיע כשינוי ממתין — לא ידרוס.</div>
                <div className="txf-editor-actions">
                  <button type="button" className="ui-btn ui-btn-primary" disabled={savingEdit} onClick={saveDonations}>{savingEdit ? 'שומר…' : 'שמור'}</button>
                  <button type="button" className="ui-btn" onClick={() => setEditingField(null)}>ביטול</button>
                </div>
              </div>
            ) : (
              <SrcLine label={meta.donationsAnnual ? `מקור: ${TAX_FACT_SOURCE_LABELS[meta.donationsAnnual.source as keyof typeof TAX_FACT_SOURCE_LABELS] ?? 'כרטיס הלקוח'}${meta.donationsAnnual.syncedAt ? ` · עודכן ${shortDate(meta.donationsAnnual.syncedAt)}` : ''}` : 'מקור: כרטיס הלקוח'} onEdit={() => { setDonationsDraft(String(client.donationsAnnual ?? '')); setEditingField('donations'); }} />
            )}
          </TRow>
        )}

        <TRow
          id="ids" name="אישורים ומזהים"
          summary={[
            `ת.ז. ${client.idNumber}`,
            client.hasExemptFromWithholding ? 'פטור מניכוי במקור' : null,
          ].filter(Boolean).join(' · ')}
          open={openRows.has('ids')} onToggle={toggleRow}
        >
          <div className="txf-kv">
            <KV k="ת.ז." v={client.idNumber} />
            <KV k={clientDisplayName(client)} v={client.idNumber} />
            {married && client.spouseIdNumber && <KV k={spouseDisplayName(client)} v={client.spouseIdNumber} />}
            {client.hasExemptFromWithholding && <KV k="ניכוי מס במקור" v={`פטור${client.withholdingValidUntil ? ` · עד ${shortDate(client.withholdingValidUntil)}` : ''}`} />}
            {client.bookStatus && client.bookStatus !== 'unknown' && (
              <KV k="ניהול ספרים" v={<span style={client.bookStatus === 'rejected' ? { color: 'var(--warn)' } : undefined}>{client.bookStatus === 'kosher' ? 'תקין' : 'אין אישור תקף'}</span>} />
            )}
          </div>
          <SrcLine label="מקור: כרטיס הלקוח" />
        </TRow>
      </div>

      {/* ‼ הכניסה לעריכה המלאה — פעולה משנית בתחתית הרשומה, לא לשונית עמיתה.
          כך נשארת רשומה מקצועית אחת, והעריכה היא משהו שנכנסים אליו מתוכה. */}
      {onOpenDetails && (
        <div className="txf-details-entry">
          <button type="button" className="ui-linkbtn" onClick={onOpenDetails}>
            עריכת פרטי הלקוח המלאים ←
          </button>
          <span>שדות הכרטיס, תיקי הרשויות ופרטי הזיהוי. נתונים מנוהלים ממשיכים לעבור דרך התאמה.</span>
        </div>
      )}
    </div>
  );
}
