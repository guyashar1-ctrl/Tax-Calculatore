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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Client, RentalTaxTrack } from '../../types';
import { FAMILY_STATUS_LABELS } from '../../types';
import type { TaxFactChange } from '../../types/taxFacts';
import { TAX_FACT_SOURCE_LABELS } from '../../types/taxFacts';
import { useTaxFacts } from '../../hooks/useTaxFacts';
import { shortDate } from '../../utils/clientDerived';
import { spouseDisplayName, registeredFileInfo, REGISTERED_UNVERIFIED_LABEL } from '../../features/annualReport/profile';
import { getTaxYearData } from '../../data/taxData';
import { calcCreditPoints } from '../../utils/taxCalculations';
import { buildAuthorityRows } from '../../utils/authorityRows';
import { resolveIncomeTaxHousehold } from '../../utils/personRepresentation';
import { domainKnowledge, taxReadiness } from '../../utils/taxKnowledge';
import { computeAuthorityFlags, actionableFlagCount } from '../../utils/authorityFlags';
import type { FamilyKey } from '../../features/taxFile/editModel';
import type { AuthorityFlag } from '../../utils/authorityFlags';
import { findUnsyncedSession, syncIntakeSession } from '../../lib/intakeSync';
import type { IntakeSyncResult } from '../../lib/intakeSync';

interface Props {
  client: Client;
  /**
   * הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150). ‼ תיק מס
   * הכנסה וייצוג ברמת-אדם (מע"מ/ניכויים/ב"ל) נקראים דרכו כשהם לא ישירות
   * על הכרטיס הזה — לא מועתקים, רק מוצגים. חסר ⇒ אין קישור, בלי שינוי
   * מהתנהגות שהייתה לפני 150.
   */
  spouseClient?: Client;
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
  /**
   * מפעיל את יישור הקו מכאן. ‼ תיק המס הוא נקודת הכניסה היחידה בהקשר הזה,
   * ואין יעד קבוע נפרד לתוצאה: בסיום חוזרים לאותו תיק, והשורות למעלה
   * משקפות את מה שהשתנה.
   */
  onRunAlignment?: () => void;
  alignBusy?: boolean;
  /** מתי בוצע יישור הקו האחרון (payload.checkedAt של שלבי המוסדות). */
  alignedAt?: string;
  /** שלבי הבקשות — לזיהוי דגלים שכבר טופלו ולמצב נתוני ההנהלה. */
  steps?: { stepType: string; status: string; payload?: Record<string, unknown> }[];
  /** פותח משימה עם כותרת מוכנה, מתוך דגל. */
  onCreateTask?: (title: string) => void;
  /**
   * פותח את מצב העריכה על משפחת-המס שממנה נלחץ. ‼ זה קריטריון הקבלה של
   * הרציפות: מי שקורא «משפחה וזכאות» ולוחץ «עריכה» חייב לנחות על אותה
   * משפחה פתוחה — לא בראש עורך ענק.
   */
  onEditFamily?: (family: FamilyKey) => void;
  /** פותח בקשה ללקוח מתוך דגל — כשהממצא דורש חומר שרק הלקוח יכול לתת. */
  onCreateRequest?: (flag: AuthorityFlag) => void;
  creatingRequestKey?: string | null;
}

const RENTAL_TRACK_LABELS: Record<RentalTaxTrack, string> = {
  exempt: 'פטור', flat10: 'מסלול 10%', regular: 'מסלול רגיל',
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

/**
 * שורה מתקפלת אחת — סיכום קבוע, פרטים רק אחרי פתיחה.
 * ‼ `exception` הוא חריגה שנקראת **מתוך השורה הסגורה** (המודל המאושר):
 * סריקה של ארבע שורות אמורה לספר מה לא בסדר בלי לפתוח כלום.
 * ‼ `unknown` מסמן «טרם ביררנו» — במשקל נמוך ובלי צבע אזהרה, כי חוסר ידיעה
 * אינו תקלה. קיר של לא-ידועים צבוע באדום היה נקרא כשריפה.
 */
function TRow({
  id, name, summary, warn, exception, unknown, stale, open, onToggle, children,
}: {
  id: string; name: string; summary: string; warn?: string;
  exception?: { text: string; tone: 'high' | 'warn' | 'ok' } | null;
  unknown?: boolean; stale?: boolean;
  open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div className={`txf-row ${open ? 'is-open' : ''}`}>
      <button type="button" className="txf-row-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="txf-row-name">{name}</span>
        <span className="txf-row-sum">
          <span className={unknown ? 'txf-unknown' : ''}>{summary}</span>
          {unknown && <span className="txf-qmark" aria-hidden="true">?</span>}
          {stale && <span className="txf-stale">⏱</span>}
          {warn && <span className="txf-warn-inline">⚠ {warn}</span>}
          {exception && (
            <span className={`txf-exc is-${exception.tone}`}>
              {exception.tone === 'ok' ? '✓' : '⚠'} {exception.text}
            </span>
          )}
        </span>
        <span className="txf-row-chev">◂</span>
      </button>
      {open && <div className="txf-row-body">{children}</div>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="k">{k}</div><div className="v">{v}</div></div>;
}


function SrcLine({ label, onEdit }: { label: string; onEdit?: () => void }) {
  return (
    <div className="txf-srcline">
      <span>{label}</span>
      {onEdit && <button type="button" onClick={onEdit}>ערוך</button>}
    </div>
  );
}

export default function TaxFileTab({
  client, spouseClient, onClientPersisted, onSendQuestionnaire, onOpenDetails, onEditFamily,
  onRunAlignment, alignBusy, alignedAt, steps, onCreateTask, onCreateRequest, creatingRequestKey,
}: Props) {
  const { pending, acceptFact, rejectFact, recordManualEdit } = useTaxFacts(client.id || undefined);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openChanges, setOpenChanges] = useState<Set<string>>(new Set());
  const [busyChangeId, setBusyChangeId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [changeErrors, setChangeErrors] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<'donations' | 'rental' | null>(null);
  const [donationsDraft, setDonationsDraft] = useState('');
  const [rentalDraft, setRentalDraft] = useState<RentalTaxTrack>(client.rentalTaxTrack ?? 'regular');
  const [savingEdit, setSavingEdit] = useState(false);
  /**
   * קליטת שאלון שהלקוח מילא בעצמו. ‼ רצה בדפדפן של הרו"ח ולא בשרת, כי
   * לוגיקת ההתאמה (reconcile.ts) משותפת עם מסך הדוח השנתי — שכפולה ל-SQL
   * הייתה יוצרת שני עותקים שיסטו זה מזה. ל-propose_tax_facts נדרש auth.uid(),
   * שקיים לרו"ח ולא ללקוח.
   * ‼ facts_synced_at על הסשן מבטיח שזה קורה פעם אחת בלבד.
   */
  const [intakeResult, setIntakeResult] = useState<IntakeSyncResult | null>(null);
  const syncTried = useRef<string | null>(null);

  useEffect(() => {
    if (!client.id || syncTried.current === client.id) return;
    syncTried.current = client.id;
    let alive = true;
    void (async () => {
      const session = await findUnsyncedSession(client.id);
      if (!session || !alive) return;
      const res = await syncIntakeSession(session, client);
      if (!alive) return;
      if (res.client) onClientPersisted(res.client);
      if (res.applied.length > 0 || res.conflicts > 0) setIntakeResult(res);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

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
        ? 'הערך בתיק השתנה אחרי שההצעה הזו נוצרה - נדרשת בדיקה מחדש. רענן ונסה שוב.'
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

  /**
   * "אשר הכול" — סדרתי, ו‼ שורה שנכשלת אינה עוצרת את השאר: קונפליקט בשדה
   * אחד לא אמור לחסום עשרים שדות תקינים. הכישלון נשאר גלוי על אותה שורה.
   */
  async function acceptGroup(changes: TaxFactChange[]) {
    setBulkBusy(true);
    for (const change of changes) {
      const res = await acceptFact(change);
      if (!res.ok) {
        const msg = res.error === 'stale_conflict'
          ? 'הערך בתיק השתנה אחרי שההצעה נוצרה - נדרשת בדיקה מחדש.'
          : (res.error || 'שגיאה בעדכון');
        setChangeErrors(e => ({ ...e, [change.id]: msg }));
      } else if (res.client) {
        onClientPersisted(res.client);
      }
    }
    setBulkBusy(false);
  }

  async function rejectGroup(changes: TaxFactChange[]) {
    setBulkBusy(true);
    for (const change of changes) {
      const res = await rejectFact(change.id);
      if (!res.ok) setChangeErrors(e => ({ ...e, [change.id]: res.error || 'שגיאה בדחייה' }));
    }
    setBulkBusy(false);
  }

  async function saveDonations() {
    const val = Math.max(0, Number(donationsDraft.replace(/[^\d.-]/g, '')) || 0);
    setSavingEdit(true);
    const res = await recordManualEdit(
      client.id, 'donationsAnnual', 'תרומות שנתיות',
      money(client.donationsAnnual) ?? '-', money(val) ?? '-',
      { donationsAnnual: val },
    );
    setSavingEdit(false);
    if (res.ok) { if (res.client) onClientPersisted(res.client); setEditingField(null); }
  }
  async function saveRentalTrack() {
    setSavingEdit(true);
    const res = await recordManualEdit(
      client.id, 'rentalTaxTrack', 'מסלול מיסוי שכירות',
      client.rentalTaxTrack ? RENTAL_TRACK_LABELS[client.rentalTaxTrack] : '-', RENTAL_TRACK_LABELS[rentalDraft],
      { rentalTaxTrack: rentalDraft },
    );
    setSavingEdit(false);
    if (res.ok) { if (res.client) onClientPersisted(res.client); setEditingField(null); }
  }

  const sentence = useMemo(() => buildSentence(client), [client]);

  // ── V6: שורות הרשויות, מצבי הידיעה, והמוכנות ──
  // ‼ שורת רשות בלי אף עובדה אינה מידע — היא רק תופסת מקום ומרמזת שנבדק
  // משהו. לקוח שטרם יושר קו מולו מקבל את ההזמנה לבצע אותו, ולא שלוש שורות
  // ריקות שכתוב בהן «טרם נאספו נתונים».
  const authorityRows = useMemo(
    () => buildAuthorityRows(client, spouseClient).filter(r => r.facts.length > 0),
    [client, spouseClient],
  );
  /** תיק מס הכנסה של הזוג — אחד, לא אחד לכל כרטיס. ראה docs/PLAN-PERSON-AND-COUPLE-MODEL.md. */
  const household = useMemo(
    () => resolveIncomeTaxHousehold(client, spouseClient),
    [client, spouseClient],
  );
  const domains = useMemo(() => domainKnowledge(client), [client]);
  const readiness = useMemo(() => taxReadiness(client, steps), [client, steps]);
  const flags = useMemo(
    () => computeAuthorityFlags(client, (steps ?? []) as never),
    [client, steps],
  );
  const openFlags = flags.filter(f => !f.requestExists && f.severity !== 'info');

  /** קיבוץ ההצעות הממתינות לפי מקור ויום — הכרטיס הוא הריצה, לא השדה. */
  const pendingGroups = useMemo(() => {
    const map = new Map<string, { key: string; source: TaxFactChange['source']; at: string; changes: TaxFactChange[] }>();
    for (const change of pending) {
      const day = (change.createdAt ?? '').slice(0, 10);
      const key = `${change.source}|${day}`;
      const g = map.get(key);
      if (g) g.changes.push(change);
      else map.set(key, { key, source: change.source, at: change.createdAt, changes: [change] });
    }
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [pending]);

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

  const married = client.familyStatus === 'married';
  const spouseName = spouseDisplayName(client);
  const businesses = client.businesses ?? [];
  const employers = client.employers ?? [];
  const properties = client.properties ?? [];
  const rentedProperties = properties.filter(p => p.isRented);
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

  // ‼ התקציר הוא מה שהרו"ח קורא בלי לפתוח — ולכן הוא נושא מספרים, לא ספירות.
  // קודם שורות שלמות הציגו "נכסים" או "0 תיק ·" ולא אמרו דבר.
  const join = (...parts: (string | number | false | null | undefined)[]) =>
    parts.filter(Boolean).join(' · ');

  const bizSummary = join(
    businesses.length > 0 ? businesses.map(b => b.name).join(', ') : client.businessDescription,
    businesses.find(b => b.revenueAnnual) && `מחזור ${money(businesses.find(b => b.revenueAnnual)!.revenueAnnual)}`,
  ) || 'עסק עצמאי';

  const salarySummary = join(
    employers.length > 0 ? employers.map(e => e.name).join(', ') : null,
    employers.find(e => e.grossSalaryAnnual) && `${money(employers.find(e => e.grossSalaryAnnual)!.grossSalaryAnnual)} לשנה`,
  ) || 'שכיר - אין פירוט מעביד בתיק';

  const capitalSummary = join(
    investmentAccounts.length > 0
      ? `${investmentAccounts.length} תיק${investmentAccounts.length > 1 ? 'ים' : ''}${investmentAccounts.map(a => a.institutionName).filter(Boolean).length ? ` (${investmentAccounts.map(a => a.institutionName).filter(Boolean).join(', ')})` : ''}`
      : 'לא נרשם תיק השקעות',
    client.capitalGainsAnnual && `רווח הון ${money(client.capitalGainsAnnual)}`,
    client.dividendInterestAnnual && `דיבידנד ${money(client.dividendInterestAnnual)}`,
  );

  const cryptoSummary = join(
    (investmentAccounts.filter(a => a.kind === 'crypto').map(a => a.institutionName).filter(Boolean).join(', ')) || 'מוחזקים מטבעות דיגיטליים',
    'מדווח במסגרת רווחי ההון',
  );

  const propertyCount = properties.length || (client.hasResidentialProperty ? 1 : 0);
  const propertySummary = join(
    propertyCount > 0 && `${propertyCount} ${propertyCount === 1 ? 'נכס' : 'נכסים'}`,
    rentedProperties.length > 0 && (rentedProperties.length === 1 ? 'אחד מושכר' : `${rentedProperties.length} מושכרים`),
  ) || 'נכסי מקרקעין';

  const foreignSummary = join(
    foreignAccounts.length > 0
      ? foreignAccounts.map(a => a.country || a.institutionName).filter(Boolean).join(', ')
      : 'נכסים או הכנסות בחו״ל',
    client.foreignIncomeAnnual && `הכנסה ${money(client.foreignIncomeAnnual)}`,
    client.foreignTaxPaid && `מס ששולם בחו״ל ${money(client.foreignTaxPaid)}`,
  );

  const bankSummary = bankAccounts.length > 0
    ? join(
      `${bankAccounts.length} ${bankAccounts.length === 1 ? 'חשבון' : 'חשבונות'}`,
      bankAccounts.find(b => b.isPrimary) && `${bankAccounts.find(b => b.isPrimary)!.bankName} (ראשי להחזרים)`,
    )
    : 'לא נרשם חשבון בנק';

  const pensionSummary = join(
    pensionFunds.length > 0
      ? `${pensionFunds.length} ${pensionFunds.length === 1 ? 'קופה' : 'קופות'} (${pensionFunds.map(p => p.institutionName).filter(Boolean).join(', ')})`
      : (client.hasPension ? (client.pensionFundName || 'קיימת פנסיה') : null),
    client.hasKrenHashtalmut && `קרן השתלמות${client.krenHashtalmutMonthly ? ` ${money(client.krenHashtalmutMonthly)} לחודש` : ''}`,
  ) || 'הפקדות';

  const insuranceSummary = join(
    client.hasLifeInsurance && (client.lifeInsuranceAnnual ? `ביטוח חיים ${money(client.lifeInsuranceAnnual)} לשנה` : 'ביטוח חיים'),
    client.hasDisabilityInsurance && (client.disabilityInsuranceAnnual ? `אכ״ע ${money(client.disabilityInsuranceAnnual)} לשנה` : 'אובדן כושר עבודה'),
  ) || 'ביטוחים';

  const donationsSummary = client.donationsAnnual
    ? `${money(client.donationsAnnual)} · מוכרות לפי סעיף 46`
    : 'לא נרשמו תרומות';

  /** מאיפה הערך הגיע ומתי — הרו"ח צריך לדעת אם מדובר בתשובה של הלקוח או בהנחה. */
  const metaSrc = (key: string) => {
    const m = meta[key as keyof typeof meta];
    if (!m) return 'מקור: כרטיס הלקוח';
    const src = TAX_FACT_SOURCE_LABELS[m.source as keyof typeof TAX_FACT_SOURCE_LABELS] ?? 'כרטיס הלקוח';
    return `מקור: ${src}${m.syncedAt ? ` · עודכן ${shortDate(m.syncedAt)}` : ''}`;
  };

  // ‼ שורה אחת לכל ילד הופכת את התקציר לבלתי קריא אצל משפחה עם שלושה ילדים.
  // מקבצים לפי עילה, כמו במוקאפ המאושר: «תושבות (2.25) + ילדים (4.00)».
  const creditsSummary = (() => {
    const pts = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');
    const buckets = new Map<string, number>();
    for (const l of creditLines) {
      const head = l.description.split(' - ')[0];
      const label = /ילד/.test(head) ? 'ילדים' : /מילואים/.test(head) ? 'מילואים' : head;
      buckets.set(label, (buckets.get(label) ?? 0) + l.points);
    }
    const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([label, n]) => `${label} (${pts(n)})`);
    return top.length ? `${pts(totalPoints)} נק׳ — ${top.join(' + ')}` : `${pts(totalPoints)} נק׳`;
  })();

  /**
   * שורת «טרם ביררנו» יושבת בקבוצה שאליה הנתון שייך, ולא בערימה נפרדת בסוף.
   * ‼ ערימה נפרדת אמרה בדיוק את מה ששורת המוכנות כבר אמרה — פעמיים, והפעם
   * השנייה כקיר של שורות ריקות. כאן הרו"ח רואה את החסר במקום שבו הוא מחפש
   * אותו: «נדל״ן — טרם ביררנו» עומד לצד «חשבונות בנק» באותה קבוצה.
   */
  const UnknownRows = ({ section }: { section: 'income' | 'family' | 'assets' | 'deposits' }) => (
    <>
      {domains.filter(d => d.section === section && d.state === 'unknown').map(d => (
        <TRow
          key={d.key} id={'dom-' + d.key} name={d.label}
          summary="טרם ביררנו" unknown
          open={openRows.has('dom-' + d.key)} onToggle={toggleRow}
        >
          <div className="txf-kv">
            <KV k="מה חסר" v={d.missing} />
            <KV k="מצב" v="לא נשאל ולא נרשם - לא ידוע אם יש או אין" />
          </div>
          <SrcLine label="נשאל בשאלון סטטוס מס, או נרשם ידנית מתוך הפירוט" onEdit={onOpenDetails} />
        </TRow>
      ))}
    </>
  );
  const unknownIn = (section: 'income' | 'family' | 'assets' | 'deposits') =>
    domains.some(d => d.section === section && d.state === 'unknown');

  /**
   * ‼ «ייתכן שהשתנה» הוא סימון על השורה הקיימת, לא שורה משלו: לדומיין מיושן
   * *יש* ערך, ולכן כבר יש לו שורה. כשהוא קיבל שורה נפרדת, «שכירות» הופיעה
   * פעמיים באותו מסך — פעם עם הנתון ופעם בלעדיו.
   */
  const isStale = (key: string) => domains.some(d => d.key === key && d.state === 'stale');

  const showCryptoRow = !!client.hasCrypto || investmentAccounts.some(a => a.kind === 'crypto');
  const showPropertyRow = properties.length > 0 || !!client.hasResidentialProperty;
  const showForeignRow = foreignAccounts.length > 0 || !!client.hasForeignAssets
    || !!client.hasForeignIncome || !!client.foreignIncomeAnnual;
  const showBankRow = bankAccounts.length > 0;
  const showPensionRow = pensionFunds.length > 0 || !!client.hasPension || !!client.hasKrenHashtalmut;
  const showInsuranceRow = !!client.hasLifeInsurance || !!client.hasDisabilityInsurance;
  const showDonationsRow = !!client.donationsAnnual || !!meta.donationsAnnual;

  const showFamilyRow = married || (client.children ?? []).length > 0 || client.familyStatus !== 'single';

  return (
    <div className="txf-root">
      <div className="txf-head">
        <div>
          <h2>תיק מס</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>הרשומה המקצועית של הלקוח. עריכה - מתוך הפירוט בלבד.</div>
        </div>
        {/* ‼ שליחת השאלון ישבה גם כאן וגם בכותרת «תמונת המס», ושתי הכניסות
            נראו כשתי יכולות. היא נשארה במקום אחד — ליד המידע שהיא מרעננת. */}
      </div>

      <div className="txf-sentence">{sentence}</div>
      {/* ═══ דורש טיפול ═══════════════════════════════════════════════════
          ‼ רק חריגות אמיתיות, לא כל שדה חסר. פריט שכבר נוצרה לו בקשה נשאר
          גלוי אבל אפור ובלי כפתור — «אל תשאל אותי שוב על מה שכבר בטיפול». */}
      {alignedAt && (
        openFlags.length > 0 || flags.some(f => f.requestExists) ? (
          <>
            <div className="txf-secthead">
              דורש טיפול{openFlags.length > 0 ? ' · ' + actionableFlagCount(flags.filter(f => !f.requestExists)) : ''}
            </div>
            <div className="txf-sect">
              {flags.filter(f => f.severity !== 'info' || f.requestExists).map(f => (
                <div key={f.key} className={'txf-att' + (f.requestExists ? ' is-done' : f.severity === 'high' ? ' is-high' : ' is-med')}>
                  <span className="txf-att-dot" aria-hidden="true" />
                  <div className="txf-att-txt">
                    <b>{f.title}</b>
                    <span>{f.why}</span>
                  </div>
                  {/* ‼ שתי פעולות שונות, ולא אחת: ממצא שהטיפול בו הוא אצלנו
                      נפתח כמשימה, וממצא שדורש חומר מהלקוח נפתח כבקשה בדף
                      האישי. במוקאפ המאושר זו בדיוק ההבחנה בין «פתח משימה»
                      ל«בקש מסמכים מהלקוח». */}
                  {f.requestExists
                    ? <span className="txf-att-stamp">בטיפול</span>
                    : f.requestTitle && onCreateRequest
                      ? <button type="button" className="ui-btn ui-btn-sm"
                          disabled={creatingRequestKey === f.key}
                          onClick={() => onCreateRequest(f)}>
                          {creatingRequestKey === f.key ? 'יוצר…' : 'בקש מסמכים מהלקוח'}
                        </button>
                      : f.taskTitle && onCreateTask
                        ? <button type="button" className="ui-btn ui-btn-sm"
                            onClick={() => onCreateTask(f.taskTitle!)}>פתח משימה</button>
                        : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="txf-allgood">
            <span>✓</span><span>אין נקודות פתוחות מול הרשויות.</span>
            <span className="txf-allgood-when">נבדק {shortDate(alignedAt)}</span>
          </div>
        )
      )}


      {/* ‼ כרטיס אחד לכל מקור+יום, לא כרטיס לכל שדה. יישור קו יחיד מייצר
          עשרות עובדות, ועשרים כרטיסים צהובים זהים הפכו את הרשומה לערימה
          שאי אפשר לקרוא ממנה מה בעצם השתנה. הטבלה אומרת את זה במבט אחד. */}
      {/* ═══ מה חדש ═══ תשובות שהלקוח מסר ונקלטו ישירות. ‼ אלה אינן החלטות:
          ערך שלא היה בתיק אינו מחלוקת, ולכן הוא נכנס ומדווח — ולא מחכה לאישור.
          מה שכן סותר הפך להצעה ממתינה ומופיע בכרטיס שמתחת. */}
      {intakeResult && intakeResult.applied.length > 0 && (
        <div className="txf-qchange">
          <button type="button" className="txf-qchange-head"
            onClick={() => toggleChange('intake')}>
            <b>{intakeResult.applied.length} עדכונים מהשאלון של הלקוח נקלטו בתיק</b>
            <span style={{ marginInlineStart: 'auto', color: 'var(--ink-4)', fontSize: 11 }}>
              {openChanges.has('intake') ? 'סגור ‹' : 'הצג ›'}
            </span>
          </button>
          {openChanges.has('intake') && (
            <div className="txf-qchange-body">
              <div className="txf-qtable">
                {intakeResult.applied.map((a, i) => (
                  <div className="txf-qtable-row" key={i}>
                    <span className="txf-qt-label">{a.label}</span>
                    <span className="txf-qt-new">{a.value}</span>
                    <span /><span />
                  </div>
                ))}
              </div>
              <div className="txf-note">
                אלה תשובות שלא סתרו את התיק, ולכן נכנסו ישירות. הרשימה כאן כדי שתוכל לוודא.
              </div>
            </div>
          )}
        </div>
      )}

      {pendingGroups.map(group => {
        const open = openChanges.has(group.key);
        return (
          <div key={group.key} className={`txf-qchange ${open ? 'open' : ''}`}>
            <button type="button" className="txf-qchange-head" onClick={() => toggleChange(group.key)}>
              <b>עדכון מ{TAX_FACT_SOURCE_LABELS[group.source]} ממתין לאישורך</b>
              <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                {shortDate(group.at)} · {group.changes.length} שדות
              </span>
              <span style={{ marginInlineStart: 'auto', color: 'var(--ink-4)', fontSize: 11 }}>{open ? 'סגור ‹' : 'פתח ›'}</span>
            </button>
            {open && (
              <div className="txf-qchange-body">
                <div className="txf-qtable">
                  <div className="txf-qtable-head">
                    <span>שדה</span><span>בתיק היום</span><span>הערך המוצע</span><span />
                  </div>
                  {group.changes.map(change => {
                    const busy = busyChangeId === change.id;
                    return (
                      <div className="txf-qtable-row" key={change.id}>
                        <span className="txf-qt-label">{change.label}</span>
                        <span className="txf-qt-old">{change.oldValue?.display ?? '-'}</span>
                        <span className="txf-qt-new">{change.newValue.display}</span>
                        <span className="txf-qt-act">
                          <button type="button" className="ui-linkbtn" disabled={busy}
                            onClick={() => handleAccept(change)}>{busy ? 'רגע…' : 'אשר'}</button>
                          <button type="button" className="ui-linkbtn is-quiet" disabled={busy}
                            onClick={() => handleReject(change)}>דחה</button>
                        </span>
                        {changeErrors[change.id] && (
                          <span className="txf-qt-err">{changeErrors[change.id]}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="txf-editor-actions">
                  <button type="button" className="ui-btn ui-btn-primary" disabled={bulkBusy}
                    onClick={() => void acceptGroup(group.changes)}>
                    {bulkBusy ? 'מאשר…' : `אשר הכול (${group.changes.length})`}
                  </button>
                  <button type="button" className="ui-btn" disabled={bulkBusy}
                    onClick={() => void rejectGroup(group.changes)}>השאר את הערכים הנוכחיים</button>
                </div>
                <div className="txf-note">ההחלטה נרשמת ביומן: מקור, ערך קודם, ערך חדש ומועד.</div>
              </div>
            )}
          </div>
        );
      })}

      {/* ═══ מול הרשויות ══════════════════════════════════════════════════
          מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
          (#v-tax) — שורה לכל רשות, סיכום שנושא את המצב, חריגה בתוך השורה.
          ‼ מטריצת מספרי התיקים ירדה: אצל עצמאי כל המספרים הם הת.ז., ולכן
          המקום הבולט ביותר בתיק הציג את אותו מספר שלוש פעמים ולא אמר כלום.
          המספרים חיים עכשיו בפירוט הפתוח, פעם אחת.
          ‼ יישור הקו מופעל מכאן — הוא מרענן את המצב הזה, ואין לו יעד קבוע
          נפרד: בסיומו חוזרים לאותו תיק. */}
      <div className="txf-secthead txf-secthead-row">
        <span>מול הרשויות</span>
        <span className="txf-align-meta">
          {onEditFamily && (
            <button type="button" className="txf-sect-edit"
              onClick={() => onEditFamily('auth')}>עריכה</button>
          )}
          <span>{alignedAt ? 'יישור קו אחרון: ' + shortDate(alignedAt) : 'טרם בוצע יישור קו'}</span>
          {onRunAlignment && (
            <button type="button" className="ui-btn ui-btn-sm" disabled={alignBusy}
              onClick={onRunAlignment}>
              {alignBusy ? 'מעדכן…' : alignedAt ? 'בצע יישור קו מחדש' : 'בצע יישור קו מול הרשויות'}
            </button>
          )}
        </span>
      </div>

      {authorityRows.length === 0 ? (
        <div className="txf-sect">
          <div className="txf-blank">
            <b>עוד לא בדקנו את {client.firstName} מול הרשויות</b>
            <p>
              יישור קו אחד עובר על ביטוח לאומי, מע״מ ומס הכנסה ואוסף יתרות, מקדמות,
              ניהול ספרים ואישורים. משם התיק מתעדכן לבד, וכל מה שדורש טיפול יופיע למעלה.
            </p>
            {onRunAlignment && (
              <button type="button" className="ui-btn ui-btn-primary" disabled={alignBusy}
                onClick={onRunAlignment}>
                {alignBusy ? 'מעדכן…' : 'בצע יישור קו מול הרשויות'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="txf-sect">
          {authorityRows.map(row => (
            <TRow
              key={row.authority}
              id={'auth-' + row.authority}
              name={row.name}
              summary={row.summary}
              exception={row.exception}
              open={openRows.has('auth-' + row.authority)}
              onToggle={toggleRow}
            >
              <div className="txf-kv">
                {row.facts.map((f, i) => (
                  <div key={i}>
                    <div className="k">{f.k}</div>
                    <div className={'v ' + (f.tone ?? '')}>{f.v}</div>
                  </div>
                ))}
              </div>
              <SrcLine
                label={alignedAt ? 'יישור קו מול הרשויות · ' + shortDate(alignedAt) : 'תיקי הרשויות בכרטיס הלקוח'}
                onEdit={onOpenDetails}
              />
            </TRow>
          ))}
        </div>
      )}

      {/* ═══ תמונת המס ═════════════════════════════════════════════════════
          ‼ שתי שורות מוכנות ולעולם לא ציון אחד: "מה אני צריך לשאול" ו"על מה
          אני ממתין מבחוץ" הן שתי פעולות שונות, ומיזוגן היה מוחק את ההבדל.
          ‼ שורת נתוני העסק מוצגת רק כשיש עסק — לשכיר היא רעש. */}
      <div className="txf-bigdiv">
        <h3>תמונת המס</h3>
        <span>מה שידוע, מה חסר — ומה זה אומר על המס</span>
        <span className="txf-qside">
          <span>{lastQSync ? 'שאלון סטטוס מס · עודכן ' + monthYear(lastQSync) : 'שאלון סטטוס מס · טרם נשלח'}</span>
          <button type="button" className="ui-btn ui-btn-sm" onClick={onSendQuestionnaire}>
            {lastQSync ? 'שלח שוב' : 'שלח שאלון עדכון'}
          </button>
        </span>
      </div>

      {/* ‼ שורה אחת ולא לוח מחוונים: המשפט אומר מה חסר *להערכת מס*, ולא
          מדווח על שלמות לשמה. הפירוט עצמו יושב בשורות של הקבוצות מתחת. */}
      {readiness.personal.ok
        ? <div className="txf-ready is-ok">✓ יש מספיק מידע להערכת מס.</div>
        : (
          <div className="txf-ready">
            <span>להערכת מס אמינה —{' '}
              {readiness.personal.unknown.length > 0 && (
                <>טרם ביררנו: <b>{readiness.personal.unknown.join(' · ')}</b></>
              )}
              {readiness.personal.unknown.length > 0 && readiness.personal.stale.length > 0 && ' · '}
              {readiness.personal.stale.length > 0 && (
                <>ייתכן שהשתנה: <b>{readiness.personal.stale.join(' · ')}</b></>
              )}
            </span>
          </div>
        )}
      {readiness.business && readiness.business !== 'not_applicable' && (
        <div className={'txf-ready' + (readiness.business === 'received' ? ' is-ok' : '')}>
          <span>{readiness.business === 'received'
            ? '✓ נתוני הנהלת החשבונות התקבלו.'
            : <>נתוני העסק — <b>ממתינים להנהלת החשבונות</b>. הכנסות והוצאות מגיעות משם, לא מהתיק.</>}</span>
        </div>
      )}

      {/* ב · הפעילות הכלכלית */}
      {(showBusinessRow || showSalaryRow || showRentalRow || showCapitalRow || unknownIn('income')) && (
        <>
          <div className="txf-secthead">הכנסות{onEditFamily && (<button type="button" className="txf-sect-edit" onClick={() => onEditFamily('income')}>עריכה</button>)}</div>
          <div className="txf-sect">
            {showBusinessRow && (
              <TRow
                id="biz" name="עסק"
                summary={bizSummary}
                open={openRows.has('biz')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {businesses.length > 0 ? businesses.map(b => (
                    <KV key={b.id} k={b.name} v={`${b.description || '-'}${b.revenueAnnual ? ` · מחזור ${money(b.revenueAnnual)}` : ''}`} />
                  )) : (
                    <>
                      <KV k="תיאור העיסוק" v={client.businessDescription || '-'} />
                      <KV k="סיווג מע״מ" v={client.vatStatus === 'authorizedDealer' ? 'עוסק מורשה' : client.vatStatus === 'exemptDealer' ? 'עוסק פטור' : '-'} />
                    </>
                  )}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" />
              </TRow>
            )}

            {showSalaryRow && (
              <TRow
                id="sal" name="שכר"
                summary={salarySummary}
                open={openRows.has('sal')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {employers.length > 0 ? employers.flatMap(e => [
                    <KV key={`${e.id}-n`} k="מעסיק" v={e.name} />,
                    e.grossSalaryAnnual ? <KV key={`${e.id}-s`} k="שכר ברוטו שנתי" v={money(e.grossSalaryAnnual)} /> : null,
                    e.startDate ? <KV key={`${e.id}-d`} k="תחילת עבודה" v={shortDate(e.startDate)} /> : null,
                  ]) : <KV k="סיווג" v="שכיר - אין פירוט מעביד בתיק" />}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח · עריכה מלאה בפרטי הלקוח" />
              </TRow>
            )}

            {showRentalRow && (
              <TRow
                id="rent" name="שכירות" stale={isStale('rental')}
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
                id="cap" name="שוק ההון" stale={isStale('capital')}
                summary={capitalSummary}
                open={openRows.has('cap')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {investmentAccounts.map(a => <KV key={a.id} k={a.institutionName} v={a.accountNumber ? `חשבון ${a.accountNumber}` : 'ללא מספר חשבון רשום'} />)}
                  {investmentAccounts.length === 0 && (
                    <KV k="תיקי השקעות" v="ידוע שיש הכנסה משוק ההון, אך לא נרשם תיק" />
                  )}
                  {client.capitalGainsAnnual ? <KV k="רווחי הון שנתיים" v={`${client.capitalGainsAnnual.toLocaleString('he-IL')} ₪`} /> : null}
                  {client.dividendInterestAnnual ? <KV k="דיבידנד וריבית" v={`${client.dividendInterestAnnual.toLocaleString('he-IL')} ₪`} /> : null}
                  {client.hasCrypto ? <KV k="מטבעות דיגיטליים" v="כן - נדרש דיווח רווחי הון" /> : null}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" />
              </TRow>
            )}
            <UnknownRows section="income" />
          </div>
        </>
      )}

      {/* ג · משפחה וזכאות */}
      <div className="txf-secthead">משפחה וזכאות{onEditFamily && (<button type="button" className="txf-sect-edit" onClick={() => onEditFamily('family')}>עריכה</button>)}</div>
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
              {/* ‼ תיק מס הכנסה אחד לזוג (150) — לא "שדה על הכרטיס הזה" אלא
                  קריאה דרך household, כדי שהוא יופיע זהה משני הכרטיסים. */}
              {married && household.represented && (() => {
                const reg = household.holderClient ? registeredFileInfo(household.holderClient) : null;
                if (!reg) return null;
                return (
                  <KV
                    k="בן/בת הזוג הרשום/ה במס הכנסה"
                    v={household.holder === 'spouse'
                      ? <>תיק משותף · בכרטיס של {spouseName} · {reg.name}{reg.unverified ? ` · ${REGISTERED_UNVERIFIED_LABEL}` : ''}</>
                      : <>{reg.name}{reg.unverified ? ` · ${REGISTERED_UNVERIFIED_LABEL}` : ''}</>}
                  />
                );
              })()}
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
          id="credits" name="זיכויים" stale={isStale('reserve')}
          summary={creditsSummary}
          open={openRows.has('credits')} onToggle={toggleRow}
        >
          <div className="txf-kv">
            {creditLines.map((l, i) => <KV key={i} k={l.description} v={`${l.points} נק׳${l.valueNIS ? ` · ${money(l.valueNIS)}` : ''}`} />)}
            <KV k="יישוב מזכה" v={client.qualifyingSettlementId || 'לא'} />
            <KV k="סה״כ" v={<b>{totalPoints.toFixed(2).replace(/\.?0+$/, '')} נק׳{totalValue ? ` · ${money(totalValue)}` : ''}</b>} />
          </div>
          <SrcLine label={`מחושב חי מהכרטיס · ${year}`} />
        </TRow>

        <UnknownRows section="family" />

      </div>

      {/* ד · השקעות, נכסים והון */}
      {(showPropertyRow || showCryptoRow || showForeignRow || showBankRow || unknownIn('assets')) && (
        <>
          <div className="txf-secthead">השקעות, נכסים והון{onEditFamily && (<button type="button" className="txf-sect-edit" onClick={() => onEditFamily('assets')}>עריכה</button>)}</div>
          <div className="txf-sect">
            {showPropertyRow && (
              <TRow
                id="prop" name="נדל״ן" stale={isStale('realestate')} summary={propertySummary}
                open={openRows.has('prop')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {properties.map(p => (
                    <KV key={p.id} k={p.isRented ? 'מושכר' : 'מגורים'}
                      v={`${p.address}${p.city ? `, ${p.city}` : ''}${p.isRented && p.monthlyRent ? ` · ${money(p.monthlyRent)} לחודש` : ''}`} />
                  ))}
                  {properties.length === 0 && <KV k="נכס מגורים" v="ידוע שקיים, אך לא נרשמה כתובת" />}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" onEdit={onOpenDetails} />
              </TRow>
            )}

            {showCryptoRow && (
              <TRow
                id="crypto" name="קריפטו" stale={isStale('crypto')} summary={cryptoSummary}
                open={openRows.has('crypto')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {investmentAccounts.filter(a => a.kind === 'crypto').map(a => (
                    <KV key={a.id} k="ארנק / זירה" v={a.institutionName} />
                  ))}
                  <KV k="מיסוי" v="במסגרת רווחי הון" />
                  {/* ‼ החזקה בלבד אינה אירוע מס — רק מכירה. הרו"ח צריך לראות
                      את ההבחנה הזאת כאן ולא להסיק אותה מעצם קיום השורה. */}
                  <KV k="חובת דיווח" v="קיימת בשנה שבה בוצעו מכירות" />
                </div>
                <SrcLine label={metaSrc('hasCrypto')} />
              </TRow>
            )}

            {showForeignRow && (
              <TRow
                id="abroad" name="חו״ל" stale={isStale('foreign')} summary={foreignSummary}
                open={openRows.has('abroad')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {foreignAccounts.map(a => (
                    <KV key={a.id} k={a.institutionName || 'חשבון בחו״ל'} v={a.country || '-'} />
                  ))}
                  {client.foreignIncomeAnnual ? <KV k="הכנסה שנתית מחו״ל" v={money(client.foreignIncomeAnnual)} /> : null}
                  {client.foreignTaxPaid ? <KV k="מס ששולם בחו״ל" v={money(client.foreignTaxPaid)} /> : null}
                  <KV k="חובת דיווח" v="נכסי חוץ נכללים בדוח השנתי" />
                </div>
                <SrcLine label={metaSrc('hasForeignAssets')} />
              </TRow>
            )}

            {showBankRow && (
              <TRow
                id="bank" name="חשבונות בנק" summary={bankSummary}
                open={openRows.has('bank')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {bankAccounts.map(b => (
                    <KV key={b.id} k={b.bankName} v={b.isPrimary ? 'ראשי - להחזרי מס' : (b.branchName || 'חשבון נוסף')} />
                  ))}
                </div>
                <SrcLine label="מקור: כרטיס הלקוח" onEdit={onOpenDetails} />
              </TRow>
            )}
            <UnknownRows section="assets" />
          </div>
        </>
      )}

      {/* ה · הפקדות, ביטוחים וזיכויים */}
      {(showPensionRow || showInsuranceRow || showDonationsRow || unknownIn('deposits')) && (
        <>
          <div className="txf-secthead">הפקדות, ביטוחים וזיכויים{onEditFamily && (<button type="button" className="txf-sect-edit" onClick={() => onEditFamily('deductions')}>עריכה</button>)}</div>
          <div className="txf-sect">
            {showPensionRow && (
              <TRow
                id="pen" name="פנסיה והשתלמות" stale={isStale('pension')} summary={pensionSummary}
                open={openRows.has('pen')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {pensionFunds.length > 0
                    ? pensionFunds.map(p => <KV key={p.id} k="פנסיה / השתלמות" v={p.institutionName} />)
                    : (client.hasPension && <KV k="פנסיה" v={client.pensionFundName || 'קיימת'} />)}
                  {client.hasKrenHashtalmut && <KV k="קרן השתלמות" v={client.krenHashtalmutMonthly ? `${money(client.krenHashtalmutMonthly)} לחודש` : 'קיימת'} />}
                  {client.selfEmployedPensionAmount ? <KV k="הפקדה כעצמאי" v={money(client.selfEmployedPensionAmount)} /> : null}
                </div>
                <SrcLine label={metaSrc('hasPension')} />
              </TRow>
            )}

            {showInsuranceRow && (
              <TRow
                id="ins" name="ביטוחים" stale={isStale('insurance')} summary={insuranceSummary}
                open={openRows.has('ins')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {client.hasLifeInsurance && <KV k="ביטוח חיים" v={client.lifeInsuranceAnnual ? `${money(client.lifeInsuranceAnnual)} לשנה` : 'קיים'} />}
                  {client.hasDisabilityInsurance && <KV k="אובדן כושר עבודה" v="קיים" />}
                </div>
                <SrcLine label={metaSrc('hasLifeInsurance')} />
              </TRow>
            )}

            {showDonationsRow && (
              <TRow
                id="don" name="תרומות" stale={isStale('donations')} summary={donationsSummary}
                open={openRows.has('don')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  <KV k="תרומות (מוכרות סעיף 46)" v={money(client.donationsAnnual) ?? '-'} />
                </div>
                {editingField === 'donations' ? (
                  <div className="txf-editor">
                    <h4>עריכת תרומות שנתיות</h4>
                    <input inputMode="numeric" value={donationsDraft} onChange={e => setDonationsDraft(e.target.value)} placeholder="0" style={{ width: 140 }} />
                    <div className="txf-note">עריכה ידנית הופכת לערך המקובל. הערך הקודם נשמר בהיסטוריה, ומקור חדש שיחלוק עליו יופיע כשינוי ממתין - לא ידרוס.</div>
                    <div className="txf-editor-actions">
                      <button type="button" className="ui-btn ui-btn-primary" disabled={savingEdit} onClick={saveDonations}>{savingEdit ? 'שומר…' : 'שמור'}</button>
                      <button type="button" className="ui-btn" onClick={() => setEditingField(null)}>ביטול</button>
                    </div>
                  </div>
                ) : (
                  <SrcLine label={metaSrc('donationsAnnual')} onEdit={() => { setDonationsDraft(String(client.donationsAnnual ?? '')); setEditingField('donations'); }} />
                )}
              </TRow>
            )}
            <UnknownRows section="deposits" />
          </div>
        </>
      )}

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
