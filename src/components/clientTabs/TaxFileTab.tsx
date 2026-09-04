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
import type { Client, RentalTaxTrack, TaxAuthority, NiOccupation, NiTracking } from '../../types';
import { FAMILY_STATUS_LABELS, TAX_AUTHORITY_LABELS } from '../../types';
import type { TaxFactChange, ProposedFact } from '../../types/taxFacts';
import { TAX_FACT_SOURCE_LABELS } from '../../types/taxFacts';
import { proposeTaxFacts, listPendingTaxFactChanges } from '../../lib/taxFacts';
import { useTaxFacts } from '../../hooks/useTaxFacts';
import { shortDate } from '../../utils/clientDerived';
import { spouseDisplayName, registeredFileInfo, REGISTERED_UNVERIFIED_LABEL } from '../../features/annualReport/profile';
import { getTaxYearData, CURRENT_TAX_YEAR } from '../../data/taxData';
import { getEligibleSettlements } from '../../data/eligibleSettlements';
import { calcCreditPoints } from '../../utils/taxCalculations';
import { buildAuthorityRows } from '../../utils/authorityRows';
import {
  EDIT_FIELD_BY_KEY, EDIT_SECTIONS, editFieldValue, coerceEditField, editFieldDisplay,
} from '../../features/taxFile/editModel';
import type { EditField, FamilyKey } from '../../features/taxFile/editModel';
import { LIST_SPECS, cleanList } from '../../features/taxFile/listModel';
import type { ListKey, ListItem } from '../../features/taxFile/listModel';
import ListEditor from '../../features/taxFile/ListEditor';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import type { AutomationJob } from '../../types/automation';
import { useShaamReadiness } from '../../hooks/shaamReadiness';
import { AUTHORITY_AUTOMATION, buildAuthorityCheck } from '../../features/taxFile/authorityAutomation';
import type { AuthorityAutomationSpec, AuthorityCheckResult } from '../../features/taxFile/authorityAutomation';
import { AuthorityCheckButton, AuthorityCheckSummary, FieldStatusMark, FieldAuthorityLine } from './AuthorityCheckPanel';
import { resolveIncomeTaxHousehold } from '../../utils/personRepresentation';
import { domainKnowledge, taxReadiness } from '../../utils/taxKnowledge';
import { computeAuthorityFlags, actionableFlagCount } from '../../utils/authorityFlags';
import type { AuthorityFlag } from '../../utils/authorityFlags';
import { findUnsyncedSession, syncIntakeSession } from '../../lib/intakeSync';
import type { IntakeSyncResult } from '../../lib/intakeSync';
import SpouseRelationshipCard from './SpouseRelationshipCard';
import { OccupationsEditor, newOccupationRow } from './InstitutionAlignment';
import type { OccupationDraft } from './InstitutionAlignment';

interface Props {
  client: Client;
  /**
   * הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150). ‼ תיק מס
   * הכנסה וייצוג ברמת-אדם (מע"מ/ניכויים/ב"ל) נקראים דרכו כשהם לא ישירות
   * על הכרטיס הזה — לא מועתקים, רק מוצגים. חסר ⇒ אין קישור, בלי שינוי
   * מהתנהגות שהייתה לפני 150.
   */
  spouseClient?: Client;
  /** פותח כרטיס לקוח נפרד לבן/בת הזוג, מזורע ומקושר דו-כיווני (150, 158). */
  onCreateSpouseClient?: () => Promise<void> | void;
  /** פותח את כרטיס בן/בת הזוג הקיים — כשהוא כבר מקושר. */
  onOpenSpouseClient?: (clientId: string) => void;
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
  /** פותח בקשה ללקוח מתוך דגל — כשהממצא דורש חומר שרק הלקוח יכול לתת. */
  onCreateRequest?: (flag: AuthorityFlag) => void;
  creatingRequestKey?: string | null;
  /** קפיצה למרכז הייצוג של הלקוח — פעולת "המשך במרכז הייצוג" בשורת ייצוג ב"ל. */
  onOpenRepresentation?: () => void;
  /**
   * "בקש ייצוג" בבלוק בן/בת הזוג בכרטיס ב"ל, כשללקוח **כבר יש** בקשת
   * ייצוג — תיקון ממוקד על הכרטיס בלבד. ראה
   * docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md.
   */
  onAddNiTarget?: (role: 'client' | 'spouse') => Promise<void> | void;
  /** מסלולי הביצוע של ב"ל בבקשת הייצוג המקושרת — לצורך שורת "ייצוג" פר-אדם. */
  niExecution?: { client?: NiTracking; spouse?: NiTracking };
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
  id, name, summary, warn, exception, unknown, stale, open, onToggle, action, children,
}: {
  id: string; name: string; summary: string; warn?: string;
  exception?: { text: string; tone: 'high' | 'warn' | 'ok' } | null;
  unknown?: boolean; stale?: boolean;
  open: boolean; onToggle: (id: string) => void;
  /**
   * פקד הפעולה של הכרטיס (למשל «בדוק מול שע״ם») — **ליד** כפתור הפתיחה,
   * לא בתוכו: כפתור בתוך כפתור אינו HTML תקין, ולחיצה עליו הייתה גם פותחת
   * וגם מריצה.
   */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`txf-row ${open ? 'is-open' : ''}`}>
      <div className="txf-row-headwrap">
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
        {action && <span className="txf-row-act">{action}</span>}
      </div>
      {open && <div className="txf-row-body">{children}</div>}
    </div>
  );
}

/**
 * כותרת קטע עם זהות משפחת-המס — נקודה, שם, ולמה הקבוצה קיימת.
 * מקור: docs/prototypes/tax-file-edit-v1.html (.sect-h).
 *
 * ‼ ה"למה" אינו קישוט: בלעדיו «השקעות, נכסים והון» היא רשימת שדות, ואיתו
 * היא אומרת לרו"ח מה סוג המס שהוא מסתכל עליו. הנקודה היא סימן ניווט בלבד —
 * היא לעולם לא אומרת טוב/רע, וזה מה שמפריד אותה מצבעי הסטטוס.
 */
function SectHead({ family, title, why, children }: {
  family: FamilyKey; title: string; why: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`txf-secthead txf-secthead-fam is-${family}`}>
      <span className="txf-sect-cat" aria-hidden="true" />
      <span className="txf-sect-nm">{title}</span>
      <span className="txf-sect-why">{why}</span>
      <span className="txf-sect-sp" />
      {children}
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

/**
 * פקד עריכה אחד לפי סוג השדה — המנגנון היחיד בתיק המס. ‼ נבנה פעם אחת
 * ומשמש את כל הכרטיסים ואת תמונת המס: כרטיס-רשות, שכירות, שוק ההון,
 * משפחה, זיכויים, נכסים, ביטוחים ו"טרם ביררנו" — כולם אותו רכיב, לא
 * עותקים נפרדים שעלולים להתפצל בהתנהגות.
 *
 * ‼ יישוב מזכה הוא המקרה החריג היחיד: הרשימה דינמית (תלויה בשנה), לא
 * הרשימה הסטטית של editModel — ולכן מקבל טיפול נפרד לפי מפתח השדה.
 */
function EditControl({ def, value, onChange }: {
  def: EditField; value: string; onChange: (v: string) => void;
}) {
  if (def.key === 'qualifyingSettlementId') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">- לא יישוב מוטב -</option>
        {getEligibleSettlements(CURRENT_TAX_YEAR).map(s => (
          <option key={s.name} value={s.name}>{s.name} ({s.ratePercent}%)</option>
        ))}
      </select>
    );
  }
  if (def.kind === 'bool') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">טרם ביררנו</option>
        <option value="true">כן</option>
        <option value="false">לא</option>
      </select>
    );
  }
  if (def.options) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">טרם ביררנו</option>
        {def.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  return (
    <input type={def.kind === 'date' ? 'date' : 'text'}
      inputMode={def.kind === 'number' || def.kind === 'money' ? 'numeric' : undefined}
      value={value} placeholder="—"
      onChange={e => onChange(e.target.value)} />
  );
}

/** תא שדה-ערך שלם — תווית + פקד + הערה. אותה צורה בכל שורת עריכה. */
function EditableKV({ def, value, onChange }: {
  def: EditField; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="k">{def.label}</div>
      <div className="v txf-inline-edit">
        <EditControl def={def} value={value} onChange={onChange} />
        {def.note && <div className="txf-note">{def.note}</div>}
      </div>
    </div>
  );
}

/**
 * שדות העריכה של מקטע ב-editModel, לפי מזהה. ‼ רק `governed: true` —
 * שדה בלי מסלול כתיבה מנוהל לא מקבל כאן פקד עריכה, כי אין לו איפה להישמר
 * עם פרובננס. שדה כזה נשאר לקריאה, וזו החלטת מוצר מודעת ולא פספוס.
 */
function fieldsOf(...sectionIds: string[]): EditField[] {
  return sectionIds.flatMap(id => EDIT_SECTIONS.find(s => s.id === id)?.fields ?? [])
    .filter(f => f.governed);
}

export default function TaxFileTab({
  client, spouseClient, onCreateSpouseClient, onOpenSpouseClient,
  onClientPersisted, onSendQuestionnaire, onOpenDetails,
  onRunAlignment, alignBusy, alignedAt, steps, onCreateTask, onCreateRequest, creatingRequestKey,
  onOpenRepresentation, onAddNiTarget, niExecution,
}: Props) {
  const { pending, refresh, acceptFact, rejectFact, recordManualEdit } = useTaxFacts(client.id || undefined);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openChanges, setOpenChanges] = useState<Set<string>>(new Set());
  const [busyChangeId, setBusyChangeId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [changeErrors, setChangeErrors] = useState<Record<string, string>>({});

  // ‼ הוק משימה אחד **לכל רשות אוטומטית**, לא אחד לשע״ם. קודם היה כאן
  // `shaamSync` יחיד, ולכן כל רשות אחרת קיבלה `job = null` לנצח — כלומר
  // המנגנון לא היה באמת משותף, ולא היה אפשר לחבר מע״מ או ב״ל בלי לערוך
  // את המסך. הקריאות קבועות בסדרן (AUTOMATED_AUTHORITIES) — רשות בלי
  // action_type מקבלת הוק שאינו שולח שאילתה ואינו מריץ.
  // ‼ ההוקים לפני כל return מותנה — ראה hooks-after-institution-focus-return.
  const jobIncomeTax = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.income_tax?.actionType ?? '');
  const jobVat = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.vat?.actionType ?? '');
  const jobBtl = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.national_insurance?.actionType ?? '');
  const authorityJobs: Partial<Record<TaxAuthority, ReturnType<typeof useAutomationJob>>> = {
    income_tax: jobIncomeTax, vat: jobVat, national_insurance: jobBtl,
  };
  // ‼ המשימה **החיה** לכל רשות, לקריאה מתוך פונקציה אסינכרונית. אישור
  // מקובץ נמשך כמה סבבי רשת, ובזמן הזה עשויה להסתיים ריצה חדשה; בלי הפניה
  // הזאת הפונקציה הייתה משווה לערך שנתפס ברינדור והשער היה חסר משמעות.
  const authorityJobsRef = useRef<Partial<Record<TaxAuthority, AutomationJob | null>>>({});
  authorityJobsRef.current = {
    income_tax: jobIncomeTax.job, vat: jobVat.job, national_insurance: jobBtl.job,
  };
  // ‼ הכרטיס מציג את הסיבה של **היכולת** (קריאת 134 / מע״מ / ב״ל), לא של
  // המוכנות הגלובלית. הנורית בכותרת ממשיכה לייצג את כל השכבות.
  // ‼ אותו הוק משרת גם את ב״ל, אבל דרך שכבה נפרדת משלה (`btl`) — סשן ב״ל
  // אינו מאוחד עם סשן שע״ם, ראה shaamReadiness.tsx.
  const shaamReadiness = useShaamReadiness();
  // ‼ אישור מקובץ — פעם אחת לכרטיס, לא לשדה. ראה approveAuthorityChanges.
  const [approvingAuthority, setApprovingAuthority] = useState<TaxAuthority | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveNotice, setApproveNotice] = useState<string | null>(null);

  // ─── עריכה במקום — מנגנון אחד לכל תיק המס ──────────────────────────────────
  // ‼ המודל המאושר: צפייה, עריכה ואוטומציה באותו מסך. «ערוך» פותח שדות
  // בתוך השורה עצמה ולא מנווט לשום עורך אחר. השדות, הסוגים והוולידציה
  // מגיעים מ-editModel — אותן הגדרות שהעורך הישן השתמש בהן, לא עותק שני.
  //
  // ‼ המפתח הוא `string` (מזהה השורה, למשל 'auth-vat' או 'cap') ולא
  // `TaxAuthority` — כך אותו מנגנון בדיוק משרת גם את כרטיסי הרשויות וגם
  // את שאר תמונת המס (שכירות, שוק ההון, משפחה...), בלי עורך שני.
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  // ‼ עיסוקים בביטוח לאומי הם רשימה, לא שדה שטוח — טיוטה נפרדת מ-sectionDrafts
  // (שמחזיק רק מחרוזות). רלוונטית רק כשעורכים את כרטיס ב״ל, אך תמיד קיימת
  // כדי שלא לשמור state מותנה.
  const [sectionOccDrafts, setSectionOccDrafts] = useState<OccupationDraft[]>([]);
  // ‼ אותו רעיון בדיוק, לשבע הרשימות המובנות (ילדים, מעסיקים, נכסים, חשבונות
  // בנק, קופות, תיקי השקעות וחשבונות בחו״ל): טיוטה מקומית שנשמרת רק ב«שמור».
  // `sectionListKeys` זוכר אילו רשימות שייכות לשורה שבעריכה — כדי שהשמירה
  // לא תיגע ברשימה שלא נפתחה לעריכה בכלל.
  const [sectionListKeys, setSectionListKeys] = useState<ListKey[]>([]);
  const [sectionListDrafts, setSectionListDrafts] = useState<Record<string, ListItem[]>>({});

  /**
   * מפתח taxFiles בתוך sectionDrafts — קידומת כדי שלא יתנגש עם editKey
   * אמיתי. ‼ `owner` (154): לב"ל יש שני תיקים אפשריים על אותו כרטיס —
   * חסר ⇒ 'client', בדיוק כמו כל שאר הרשויות שאף פעם לא היו צריכות להבחין.
   */
  function taxFileNumberKey(authority: TaxAuthority, owner: 'client' | 'spouse' = 'client') {
    return `__taxFileNumber:${authority}:${owner}`;
  }
  /**
   * תיק הרשות הזו על שם ה-owner המבוקש. ‼ לב"ל — התאמה מדויקת בלבד, בלי
   * נפילה-לאחור: זה בדיוק ההבדל בין "מספר תיק אחד לרשות" ל"מספר תיק לכל
   * אדם" (154). לשאר הרשויות — כמו קודם: אם אין תיק ל-owner המבוקש,
   * התיק הראשון של הרשות (ראה TaxFilesSection).
   */
  function currentTaxFile(authority: TaxAuthority, owner: 'client' | 'spouse' = 'client') {
    const files = client.taxFiles ?? [];
    if (authority === 'national_insurance') {
      return files.find(t => t.authority === authority && t.owner === owner);
    }
    return files.find(t => t.authority === authority && t.owner === 'client')
      ?? files.find(t => t.authority === authority);
  }
  /**
   * ‼ עדכון במקום כשיש רשומה, יצירה רק כשאין — לעולם לא כפילות לאותו
   * (רשות, owner). שיוך ל"משותף" (תיק הניכויים בב"ל) נשאר במסך התיקים
   * הייעודי (TaxFilesSection) — לא נגיש מכאן.
   * ‼ לעולם לא נגזר מ-idNumber — הערך מגיע רק ממה שהוקלד כאן.
   */
  function buildTaxFilesPatch(authority: TaxAuthority, newNumber: string, owner: 'client' | 'spouse' = 'client') {
    const files = client.taxFiles ?? [];
    const existing = currentTaxFile(authority, owner);
    if (existing) {
      return files.map(t => t.id === existing.id ? { ...t, fileNumber: newNumber || undefined } : t);
    }
    return [...files, {
      id: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authority, owner, repStatus: 'none' as const,
      fileNumber: newNumber || undefined,
    }];
  }

  function startSectionEdit(
    id: string, fields: EditField[],
    opts?: { taxFileAuthority?: TaxAuthority; taxFileOwner?: 'client' | 'spouse'; lists?: ListKey[]; niOwner?: 'client' | 'spouse' },
  ) {
    const drafts: Record<string, string> = {};
    for (const f of fields) drafts[f.key] = editFieldValue(client, f);
    if (opts?.taxFileAuthority) {
      const owner = opts.taxFileOwner ?? 'client';
      drafts[taxFileNumberKey(opts.taxFileAuthority, owner)] = currentTaxFile(opts.taxFileAuthority, owner)?.fileNumber ?? '';
    }
    setSectionDrafts(drafts);
    setSectionListKeys(opts?.lists ?? []);
    // ‼ העתק עמוק — כדי שעריכת שדה בפריט לא תשנה את הכרטיס עצמו לפני «שמור».
    setSectionListDrafts(Object.fromEntries(
      (opts?.lists ?? []).map(k => [k, ((client[k] as ListItem[] | undefined) ?? []).map(o => ({ ...o }))]),
    ));
    // ‼ תמיד לפחות שורה ריקה אחת, כמו במסך יישור הקו — כדי שיהיה איפה
    // להתחיל להוסיף עיסוק ראשון בלי כפתור "הוסף" נוסף בלחיצה הראשונה.
    // ‼ `niOwner` (154): לבן/בת הזוג יש רשימת עיסוקים משלו/ה
    // (`spouseNiOccupations`) — לא אותה רשימה של הלקוח.
    const occSource = opts?.niOwner === 'spouse' ? (client.spouseNiOccupations ?? []) : (client.niOccupations ?? []);
    setSectionOccDrafts(occSource.length > 0 ? occSource.map(o => ({ ...o })) : [newOccupationRow(0)]);
    setSectionError(null);
    setEditingSection(id);
  }

  function cancelSectionEdit() {
    setEditingSection(null);
    setSectionDrafts({});
    setSectionOccDrafts([]);
    setSectionListKeys([]);
    setSectionListDrafts({});
    setSectionError(null);
  }

  /**
   * ‼ נשמר דרך אותו מסלול עובדות שהעורך הישן השתמש בו
   * (record_manual_fact_change): הערך נכתב **ונרשם** עם פרובננס manual
   * והיסטוריה. שמירה רגילה הייתה מוחקת פרובננס של עובדות מיישור קו/שאלון.
   * ‼ רק שדות שהשתנו נשלחים — כדי לא לרשום «עריכה ידנית» על ערך שלא נגעו בו.
   */
  async function saveSectionEdit() {
    if (!client.id) return;
    setSectionSaving(true);
    setSectionError(null);
    for (const [key, raw] of Object.entries(sectionDrafts)) {
      if (key.startsWith('__taxFileNumber:')) {
        const [authority, owner] = key.slice('__taxFileNumber:'.length).split(':') as [TaxAuthority, 'client' | 'spouse'];
        const before = currentTaxFile(authority, owner)?.fileNumber ?? '';
        if (raw === before) continue;
        const label = `מספר תיק — ${TAX_AUTHORITY_LABELS[authority]}${owner === 'spouse' ? ' (בן/בת הזוג)' : ''}`;
        const res = await recordManualEdit(
          client.id, 'taxFiles', label,
          before || '—', raw || '—', { taxFiles: buildTaxFilesPatch(authority, raw, owner) },
        );
        if (!res.ok) {
          setSectionError(`מספר תיק: ${res.error ?? 'השמירה נכשלה'}`);
          setSectionSaving(false);
          return;
        }
        if (res.client) onClientPersisted(res.client);
        continue;
      }
      const def = EDIT_FIELD_BY_KEY[key];
      if (!def) continue;
      const before = editFieldValue(client, def);
      if (raw === before) continue;
      const res = await recordManualEdit(
        client.id, def.key, def.label,
        editFieldDisplay(def, before), editFieldDisplay(def, raw),
        { [def.key]: coerceEditField(def, raw) } as Partial<Client>,
      );
      if (!res.ok) {
        setSectionError(`${def.label}: ${res.error ?? 'השמירה נכשלה'}`);
        setSectionSaving(false);
        return;
      }
      if (res.client) onClientPersisted(res.client);
    }
    // ‼ הרשימות המובנות — אותו מסלול עובדות בדיוק, פריט אחד בהיסטוריה לכל
    // רשימה שהשתנתה. נשמרת הרשימה **המנוקה**: פריט שנפתח ולא מולא לא נשמר,
    // והנרמול (שנת לידה מהתאריך, חשבון ראשי יחיד) רץ לפני הכתיבה.
    for (const key of sectionListKeys) {
      const spec = LIST_SPECS[key];
      const next = cleanList(spec, sectionListDrafts[key] ?? []);
      const before = ((client[key] as ListItem[] | undefined) ?? []);
      if (JSON.stringify(next) === JSON.stringify(before)) continue;
      const res = await recordManualEdit(
        client.id, key, spec.label,
        before.length ? `${before.length} ${spec.itemLabel}` : '—',
        next.length ? `${next.length} ${spec.itemLabel}` : '—',
        { [key]: next, ...(spec.raised?.(next) ?? {}) } as Partial<Client>,
      );
      if (!res.ok) {
        setSectionError(`${spec.label}: ${res.error ?? 'השמירה נכשלה'}`);
        setSectionSaving(false);
        return;
      }
      if (res.client) onClientPersisted(res.client);
    }

    // עיסוקים בביטוח לאומי — רק כשבלוק אדם בכרטיס ב״ל הוא זה שבעריכה, ורק
    // אם השתנה. ‼ (154) לכל אדם הרשימה שלו/ה — לא אותה רשימה של הלקוח.
    const niOccMatch = /^auth-national_insurance:(client|spouse)$/.exec(editingSection ?? '');
    if (niOccMatch) {
      const occOwner = niOccMatch[1] as 'client' | 'spouse';
      const occKey = occOwner === 'spouse' ? 'spouseNiOccupations' : 'niOccupations';
      const occLabel = occOwner === 'spouse' ? 'עיסוקים בביטוח לאומי — בן/בת הזוג' : 'עיסוקים בביטוח לאומי';
      const selected = sectionOccDrafts.filter((o): o is NiOccupation => o.type !== '');
      const before = (client[occKey] as NiOccupation[] | undefined) ?? [];
      if (JSON.stringify(selected) !== JSON.stringify(before)) {
        const res = await recordManualEdit(
          client.id, occKey, occLabel,
          before.length ? `${before.length} עיסוקים` : '-',
          selected.length ? `${selected.length} עיסוקים` : '-',
          { [occKey]: selected } as Partial<Client>,
        );
        if (!res.ok) {
          setSectionError(`עיסוקים: ${res.error ?? 'השמירה נכשלה'}`);
          setSectionSaving(false);
          return;
        }
        if (res.client) onClientPersisted(res.client);
      }
    }
    setSectionSaving(false);
    cancelSectionEdit();
  }

  /**
   * עורכי הרשימות של השורה שבעריכה.
   * ‼ פונקציה שמחזירה JSX ולא רכיב מקונן: רכיב שמוגדר בתוך הרינדור מקבל
   * זהות חדשה בכל הקלדה, ריאקט היה מפרק ובונה מחדש את השדות, והפוקוס היה
   * קופץ אחרי כל תו. כאן האלמנטים נכנסים ישירות לעץ ההורה.
   */
  function renderLists() {
    return sectionListKeys.map(k => (
      <ListEditor key={k} spec={LIST_SPECS[k]}
        items={sectionListDrafts[k] ?? []}
        onChange={next => setSectionListDrafts(d => ({ ...d, [k]: next }))} />
    ));
  }

  /** כפתורי שמור/ביטול — אותו בלוק בכל שורה שנמצאת בעריכה. */
  function EditActions() {
    return (
      <div className="txf-editor-actions">
        <button type="button" className="ui-btn ui-btn-primary" disabled={sectionSaving}
          onClick={() => { void saveSectionEdit(); }}>
          {sectionSaving ? 'שומר…' : 'שמור'}
        </button>
        <button type="button" className="ui-btn" disabled={sectionSaving} onClick={cancelSectionEdit}>ביטול</button>
        {sectionError && <span className="txf-editor-err">{sectionError}</span>}
      </div>
    );
  }

  /**
   * «אשר N שינויים» — האישור המקובץ של כרטיס הרשות.
   *
   * ‼ עובר דרך מסלול העובדות המנוהלות ולא עוקף אותו: כל שדה ששונה מוצע
   * (propose_tax_facts, מקור 'automation', עם הערך הישן כתמונת מצב) ואז
   * מאושר (accept_tax_fact_change) — כך נשמרים פרובננס, היסטוריה, ובדיקת
   * stale_conflict בשרת. הרו"ח כבר ראה כל השוואה בכרטיס לפני הלחיצה; זו
   * הלחיצה המפורשת. שום דבר לא נכתב מעצם הקריאה מהרשות.
   * ‼ בלי כפילויות: הצעה ממתינה קיימת לאותו שדה ואותו ערך מאושרת במקומה,
   * ולא נוצרת שוב. שדה שנכשל (למשל הערך בתיק השתנה בינתיים) לא עוצר את
   * השאר — ההצעה שלו נשארת ממתינה ברשימת השינויים, והכישלון מדווח פעם אחת.
   * ‼ הפאץ' עובר דרך coerceEditField: שע״ם מחזירה טקסט, והשדה בתיק עשוי
   * להיות מספרי (שיעור מקדמות, יתרה). מחרוזת בעמודה מספרית היא באג שקט.
   */
  async function approveAuthorityChanges(spec: AuthorityAutomationSpec, check: AuthorityCheckResult) {
    if (!client.id) return;
    const changed = check.fields.filter(f => f.status === 'changed' && f.fieldKey && f.authorityValue != null);
    if (changed.length === 0) return;
    setApprovingAuthority(spec.authority);
    setApproveError(null);
    setApproveNotice(null);

    const existing = await listPendingTaxFactChanges(client.id);
    const reuse = new Map<string, TaxFactChange>();
    const toPropose: ProposedFact[] = [];
    for (const f of changed) {
      const def = EDIT_FIELD_BY_KEY[f.fieldKey];
      // ‼ patchValue גובר: «אין תדירות» הוא ניקוי השדה (null), ולא מחרוזת ריקה.
      const newPatch = f.patchValue !== undefined ? f.patchValue
        : def ? coerceEditField(def, f.authorityValue!) : f.authorityValue!;
      const oldRaw = (client as unknown as Record<string, unknown>)[f.fieldKey] ?? null;
      const dup = existing.find(c => c.fieldKey === f.fieldKey && c.source === 'automation'
        && JSON.stringify(c.newValue.patch?.[f.fieldKey]) === JSON.stringify(newPatch));
      if (dup) { reuse.set(f.fieldKey, dup); continue; }
      toPropose.push({
        fieldKey: f.fieldKey, label: f.label,
        oldValue: { display: String(oldRaw ?? '') || '—', patch: { [f.fieldKey]: oldRaw } },
        newValue: {
          display: f.authorityDisplay ?? f.authorityRaw ?? f.authorityValue!,
          patch: { [f.fieldKey]: newPatch },
        },
        // ‼ הראיה הגולמית מהרשות נשמרת בהצעה עצמה — אחרת «0%» היה נכנס
        // לתיק בלי שום זכר לכך שהמקור היה «בוטלה (שעור דו)».
        // ‼ שם הרשות מגיע מהרשומה ולא קבוע «שע״ם» — אחרת הצעה של ב״ל
        // הייתה נרשמת ביומן בשם הרשות הלא נכונה.
        note: f.provenance ? `${spec.sourceLabel}: ${f.provenance}` : undefined,
      });
    }
    if (toPropose.length > 0) {
      const res = await proposeTaxFacts(client.id, 'automation', spec.sourceRef ?? null, toPropose);
      // ‼ כישלון כאן חייב להיראות. אישור ששותק נראה בדיוק כמו אישור שעבד.
      if (!res.ok) {
        setApproveError(res.error ?? 'ההצעה נכשלה');
        setApprovingAuthority(null);
        return;
      }
    }
    const after = toPropose.length > 0 ? await listPendingTaxFactChanges(client.id) : existing;

    // ‼ שער התיישנות: בין הלחיצה לבין הכתיבה עברו סבבי רשת. אם בינתיים
    // הסתיימה **ריצה חדשה** של אותה רשות, הסט שעל המסך כבר אינו הסט שאושר,
    // ולכן לא כותבים כלום. ההצעות נשארות ממתינות — הן לא אבדו.
    const liveRunId = authorityJobsRef.current[spec.authority]?.id;
    if (check.runId && liveRunId && liveRunId !== check.runId) {
      setApprovingAuthority(null);
      setApproveError('בינתיים הסתיימה קריאה חדשה מהרשות — ההשוואה התעדכנה, ולא אושר דבר. בדקו שוב.');
      refresh();
      return;
    }

    const failures: string[] = [];
    let approved = 0;
    for (const f of changed) {
      const change = reuse.get(f.fieldKey)
        ?? [...after].reverse().find(c => c.fieldKey === f.fieldKey && c.source === 'automation');
      if (!change) { failures.push(f.label); continue; }
      const r = await acceptFact(change);
      if (!r.ok) {
        failures.push(r.error === 'stale_conflict' ? `${f.label} (הערך בתיק השתנה בינתיים)` : f.label);
        continue;
      }
      if (r.client) onClientPersisted(r.client);
      approved++;
    }
    setApprovingAuthority(null);
    if (failures.length > 0) {
      setApproveError(`לא אושרו: ${failures.join(' · ')}. ההצעות נשארו ממתינות ברשימת השינויים.`);
    }
    setApproveNotice(approved > 0
      ? `${approved === 1 ? 'שינוי אחד אושר' : `${approved} שינויים אושרו`} ונרשמו ביומן.`
      : null);
    refresh();
  }
  // ‼ תרומות נשארה מחוץ למנגנון הכללי בכוונה — היא הייתה שם ראשונה ועובדת,
  // ואין סיבה למחזר אותה רק בשביל האחידות. שכירות עברה למנגנון הכללי, כי
  // שם היא מקבלת גם את שאר השדות (הכנסה, הוצאות) ולא רק את המסלול.
  const [editingField, setEditingField] = useState<'donations' | null>(null);
  const [donationsDraft, setDonationsDraft] = useState('');
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

  const sentence = useMemo(() => buildSentence(client), [client]);

  // ── V6: שורות הרשויות, מצבי הידיעה, והמוכנות ──
  // ‼ שורת רשות בלי אף עובדה אינה מידע — היא רק תופסת מקום ומרמזת שנבדק
  // משהו. לקוח שטרם יושר קו מולו מקבל את ההזמנה לבצע אותו, ולא שלוש שורות
  // ריקות שכתוב בהן «טרם נאספו נתונים».
  const authorityRows = useMemo(
    () => buildAuthorityRows(client, spouseClient, niExecution).filter(r => r.facts.length > 0),
    [client, spouseClient, niExecution],
  );
  /** תיק מס הכנסה של הזוג — אחד, לא אחד לכל כרטיס. ראה docs/PLAN-PERSON-AND-COUPLE-MODEL.md. */
  const household = useMemo(
    () => resolveIncomeTaxHousehold(client, spouseClient),
    [client, spouseClient],
  );
  const domains = useMemo(() => domainKnowledge(client), [client]);
  const readiness = useMemo(() => taxReadiness(client, steps), [client, steps]);
  const flags = useMemo(
    () => computeAuthorityFlags(client, (steps ?? []) as never, spouseClient, niExecution),
    [client, steps, spouseClient, niExecution],
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
  /**
   * ‼ «טרם ביררנו» חייבת להיות ניתנת למענה כאן, לא רק לתיאור. לכל דומיין
   * יש עוגן — שדה מנוהל בודד (בדרך כלל בוליאני) שמסמן שהבירור נעשה. עריכה
   * דרך אותו מנגנון בדיוק כמו כל שדה אחר, ומיד אחרי שמירה הדומיין כבר לא
   * "לא ידוע" — השורה הזו נעלמת מעצמה בסבב הבא כי domains נגזר מהכרטיס.
   */
  const UnknownRows = ({ section }: { section: 'income' | 'family' | 'assets' | 'deposits' }) => (
    <>
      {domains.filter(d => d.section === section && d.state === 'unknown').map(d => {
        const anchorDef = EDIT_FIELD_BY_KEY[d.anchor];
        const sid = 'dom-' + d.key;
        const editingThis = editingSection === sid;
        return (
        <TRow
          key={d.key} id={sid} name={d.label}
          summary="טרם ביררנו" unknown
          open={openRows.has(sid)} onToggle={toggleRow}
        >
          {editingThis && anchorDef ? (
            <div className="txf-kv">
              <EditableKV def={anchorDef} value={sectionDrafts[anchorDef.key] ?? ''}
                onChange={v => setSectionDrafts(dd => ({ ...dd, [anchorDef.key]: v }))} />
            </div>
          ) : (
            <div className="txf-kv">
              <KV k="מה חסר" v={d.missing} />
              <KV k="מצב" v="לא נשאל ולא נרשם - לא ידוע אם יש או אין" />
            </div>
          )}
          {editingThis && <EditActions />}
          <SrcLine label="נשאל בשאלון סטטוס מס, או נרשם ידנית כאן"
            onEdit={editingThis || !anchorDef ? undefined : () => startSectionEdit(sid, [anchorDef])} />
        </TRow>
        );
      })}
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
  // ‼ שתי השורות האלה קבועות, ולא מותנות ברשימה שלהן. לכל שאר השורות יש דגל
  // שמחזיק אותן פתוחות גם כשהרשימה ריקה («יש נכס», «יש פנסיה»…) — לחשבונות
  // הבנק ולתא המשפחתי אין. כשהן היו מותנות, ללקוח בלי חשבון רשום פשוט לא
  // הייתה שורה, ולכן גם לא הייתה דרך להוסיף אליה חשבון ראשון בלי לצאת לעורך
  // הישן. סיכום ריק («טרם נרשם») עדיף על שורה שלא קיימת.
  const showBankRow = true;
  const showPensionRow = pensionFunds.length > 0 || !!client.hasPension || !!client.hasKrenHashtalmut;
  const showInsuranceRow = !!client.hasLifeInsurance || !!client.hasDisabilityInsurance;
  const showDonationsRow = !!client.donationsAnnual || !!meta.donationsAnnual;

  const showFamilyRow = true;

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

      {/* ‼ מתג «קריאה / עריכה מלאה» ירד: אין יותר חוויית עריכה נפרדת לתיק
          המס. הצפייה, העריכה והאוטומציה קורות באותו מסך, בתוך הכרטיס. */}

      <div className="txf-sentence">{sentence}</div>

      {/* ‼ נוכחות אחת קבועה למי בן/בת הזוג — לא רק בתוך "התיק" (158). ראה
          SpouseRelationshipCard: מציגה בלבד, בלי מנגנון שני. */}
      <SpouseRelationshipCard
        client={client} spouseClient={spouseClient}
        onCreateSpouseClient={onCreateSpouseClient} onOpenSpouseClient={onOpenSpouseClient}
      />

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
                    /* ‼ דגל ייצוג ב"ל של בן/בת הזוג — לא task/request כלליים.
                        'add' מוסיף target + טיוטת taxFiles על הכרטיס (בלי
                        בקשה שנייה); 'continue' מנווט למרכז הייצוג הקיים. */
                    : f.niAction
                      ? <button type="button" className="ui-btn ui-btn-sm"
                          onClick={() => {
                            if (f.niAction!.kind === 'add') void onAddNiTarget?.('spouse');
                            else onOpenRepresentation?.();
                          }}>
                          {f.niAction.label}
                        </button>
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
      {/* ‼ אין «עריכה» ברמת המקטע: העריכה היא בתוך כרטיס הרשות עצמו,
          כי שם יושבים השדות. כפתור כאן היה מוביל שוב למסך אחר. */}
      <SectHead family="auth" title="מול הרשויות"
        why="עובדות תפעוליות — מתעדכנות ביישור קו">
        <span className="txf-align-meta">
          <span>{alignedAt ? 'יישור קו אחרון: ' + shortDate(alignedAt) : 'טרם בוצע יישור קו'}</span>
          {onRunAlignment && (
            <button type="button" className="ui-btn ui-btn-sm" disabled={alignBusy}
              onClick={onRunAlignment}>
              {alignBusy ? 'מעדכן…' : alignedAt ? 'בצע יישור קו מחדש' : 'בצע יישור קו מול הרשויות'}
            </button>
          )}
        </span>
      </SectHead>

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
          {authorityRows.map(row => {
            const sectionId = 'auth-' + row.authority;
            const editingThis = editingSection === sectionId;
            // ‼ (154) לב"ל יש עד שני מצבי עריכה בו-זמנית — אחד לכל אדם, לא
            // עוד "עריכת הכרטיס" יחידה. `cardEditing` מכסה את שניהם, כדי
            // שסיכום הבדיקה יתחבא בזמן שעורכים כל אדם, בדיוק כמו קודם.
            // ‼ שני בלוקי-אדם רק כשיש בפועל שני אנשים על השורה (154) —
            // לקוח/ה יחיד/ה ממשיך במסלול הישן (רשת אחת, בלי כותרת-שם).
            const twoPersons = !!row.persons && row.persons.length > 1;
            const cardEditing = editingThis
              || (twoPersons && row.persons!.some(p => editingSection === `${sectionId}:${p.role}`));

            // ── אוטומציה ברמת הכרטיס — ראה authorityAutomation.ts ──
            // ‼ הכול נגזר מהרשומה של הרשות: המשימה, המוכנות, הקלט והפירוש.
            // אין כאן שום התניה על שע״ם — מע״מ וב״ל נכנסות בדיוק באותו נתיב.
            // הסט כולו נגזר מהמשימה האחרונה + הכרטיס, ולכן אחרי אישור
            // המצבים מתיישבים מעצמם.
            const spec = AUTHORITY_AUTOMATION[row.authority];
            const sync = authorityJobs[row.authority];
            const job = spec?.actionType ? (sync?.job ?? null) : null;
            const cardFields = row.facts.map(f => ({ label: f.k, fieldKey: f.syncKey ?? f.btlSyncKey ?? f.editKey }));
            const check = spec ? buildAuthorityCheck(spec, job, client, cardFields) : null;
            const cap = spec?.capability ? shaamReadiness.capability(spec.capability) : null;
            const inputRes = spec?.buildInput?.(client, spouseClient);
            const blocked = !spec ? null
              : !spec.available ? (spec.unavailableReason ?? 'האוטומציה עוד לא נבנתה לרשות הזו.')
              : inputRes && 'blocked' in inputRes ? inputRes.blocked
              : cap && !cap.ready ? cap.blockedReason
              : null;
            const running = !!spec?.available
              && (!!sync?.busy || job?.status === 'queued' || job?.status === 'running');
            const runCheck = () => {
              if (!spec?.available || !sync || !inputRes || !('input' in inputRes)) return;
              setApproveError(null);
              setApproveNotice(null);
              // ‼ פותחים את הכרטיס — התוצאות יושבות בו, ובדיקה שלא רואים היא לחיצה שלא עשתה כלום.
              setOpenRows(s => new Set(s).add(sectionId));
              void sync.run(inputRes.input);
            };

            return (
            <TRow
              key={row.authority}
              id={sectionId}
              name={row.name}
              summary={row.summary}
              exception={row.exception}
              open={openRows.has(sectionId)}
              onToggle={toggleRow}
              action={spec && (
                <AuthorityCheckButton label={spec.actionLabel} ready={!blocked} blockedReason={blocked}
                  running={running} onRun={runCheck} />
              )}
            >
              {/* ‼ (154) כרטיס ב"ל: שני בלוקי-אדם במקום רשת אחת — התשובה
                  ל"של מי הנתונים האלה" היא כותרת הבלוק, לא הקשר משתמע.
                  כל שאר הרשויות (מס הכנסה/מע״מ/ניכויים) ממשיכות בדיוק כמו
                  קודם דרך הענף השני למטה — `row.persons` קיים רק על ב"ל. */}
              {/* ‼ בלוקי-אדם רק כשיש שניים בפועל: לקוח/ה יחיד/ה (לא נשוי/אה,
                  או נשוי/אה בלי בן/בת זוג-כאדם-שני על השורה) ממשיך להיראות
                  בדיוק כמו לפני 154 — בלי כותרת-שם מיותרת מעל רשת אחת. */}
              {twoPersons ? (
                row.persons!.map((person, pi) => {
                  const personEditId = `${sectionId}:${person.role}`;
                  const editingPerson = editingSection === personEditId;
                  return (
                    <div className="txf-person" key={person.role}>
                      <div className="txf-person-head">
                        <span className="txf-person-name">{person.name}</span>
                        <span className="txf-person-idctx">ת.ז. {person.idNumber || '—'}</span>
                        {/* ‼ בן/בת זוג מקושר/ת: הנתונים חיים בכרטיס שלו/ה —
                            כאן לקריאה בלבד, בלי כפתור «ערוך». מקור אמת אחד. */}
                        {!person.editable && (
                          <span className="txf-person-linked">
                            הנתונים בכרטיס של {person.name}
                            {spouseClient && onOpenSpouseClient && (
                              <button type="button" className="ui-linkbtn"
                                onClick={() => onOpenSpouseClient(spouseClient.id)}>
                                פתיחת הכרטיס
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="txf-kv">
                        {person.facts.map((f, i) => {
                          // ‼ ת.ז. כבר בכותרת הבלוק (name + idctx) — לא כפילות
                          // כאן. נשארת בעובדות עצמן (index יציב לבדיקת
                          // האוטומציה למטה) ורק לא מצוירת בבלוק-אדם.
                          if (f.k === 'ת.ז.') return null;
                          const def = f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined;
                          const editingScalar = editingPerson && !!def;
                          const editingTaxFileNumber = editingPerson && !!f.taxFileNumberAuthority;
                          // ‼ בדיקת האוטומציה נגזרת מ-row.facts, שזהה בדיוק
                          // ל-persons[0].facts (הלקוח) — לכן סמן מצב מוצג רק
                          // באדם הראשון. לבן/בת הזוג עוד אין תוצאת בדיקה.
                          const fieldCheck = pi === 0 && check?.checkedAt ? check.fields[i] : undefined;
                          return (
                          <div key={i}>
                            <div className="k">{fieldCheck && <FieldStatusMark status={fieldCheck.status} />}{f.k}</div>
                            {editingScalar && def ? (
                              <div className="v txf-inline-edit">
                                <EditControl def={def} value={sectionDrafts[def.key] ?? ''}
                                  onChange={v => setSectionDrafts(d => ({ ...d, [def.key]: v }))} />
                                {def.note && <div className="txf-note">{def.note}</div>}
                              </div>
                            ) : editingTaxFileNumber ? (
                              <div className="v txf-inline-edit">
                                <input type="text" placeholder="—"
                                  value={sectionDrafts[taxFileNumberKey(f.taxFileNumberAuthority!, f.taxFileNumberOwner ?? 'client')] ?? ''}
                                  onChange={e => setSectionDrafts(d => ({
                                    ...d, [taxFileNumberKey(f.taxFileNumberAuthority!, f.taxFileNumberOwner ?? 'client')]: e.target.value,
                                  }))} />
                              </div>
                            ) : (
                              <div className={'v ' + (f.tone ?? '')}>{f.v}</div>
                            )}
                            {/* ‼ שורת "ייצוג" בלבד — "בקש ייצוג" מוסיף target
                                וטיוטת taxFiles על הכרטיס (לא בקשה שנייה);
                                "המשך במרכז הייצוג" מנווט לבקשה הקיימת. */}
                            {f.niRepAction && !editingScalar && !editingTaxFileNumber && (
                              <button type="button" className="ui-linkbtn"
                                onClick={() => {
                                  if (f.niRepAction!.kind === 'add') void onAddNiTarget?.(person.role);
                                  else onOpenRepresentation?.();
                                }}>
                                {f.niRepAction.label}
                              </button>
                            )}
                            {fieldCheck && !editingPerson && spec && (
                              <FieldAuthorityLine field={fieldCheck} sourceLabel={spec.sourceLabel} />
                            )}
                          </div>
                          );
                        })}
                      </div>

                      {/* ‼ עיסוקים — לכל אדם הרשימה שלו/ה, לא רשימה משותפת. */}
                      {editingPerson && (
                        <div className="txf-editor">
                          <h4>עיסוקים בביטוח לאומי{person.role === 'spouse' ? ` — ${person.name}` : ''}</h4>
                          <OccupationsEditor occupations={sectionOccDrafts} onChange={setSectionOccDrafts} />
                        </div>
                      )}
                      {editingPerson && <EditActions />}
                      {person.editable && (
                        <SrcLine
                          label={alignedAt ? 'יישור קו מול הרשויות · ' + shortDate(alignedAt) : 'תיקי הרשויות בכרטיס הלקוח'}
                          onEdit={
                            editingPerson || !person.facts.some(f => f.editKey || f.taxFileNumberAuthority)
                              ? undefined
                              : () => {
                                  const editFields = person.facts
                                    .map(f => f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined)
                                    .filter((d): d is EditField => !!d);
                                  const tf = person.facts.find(f => f.taxFileNumberAuthority);
                                  startSectionEdit(personEditId, editFields, {
                                    ...(tf ? { taxFileAuthority: tf.taxFileNumberAuthority, taxFileOwner: tf.taxFileNumberOwner ?? 'client' } : {}),
                                    niOwner: person.role,
                                  });
                                }
                          }
                        />
                      )}
                    </div>
                  );
                })
              ) : (
              <div className="txf-kv">
                {row.facts.map((f, i) => {
                  const def = f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined;
                  const editingScalar = editingThis && !!def;
                  const editingTaxFileNumber = editingThis && !!f.taxFileNumberAuthority;
                  const fieldCheck = check?.checkedAt ? check.fields[i] : undefined;
                  return (
                  <div key={i}>
                    {/* ‼ סמן המצב לפני התווית, קטן וללא מילים. מופיע רק אחרי
                        בדיקה — לפני כן אין מה לסמן, וקיר של אפורים הוא רעש. */}
                    <div className="k">{fieldCheck && <FieldStatusMark status={fieldCheck.status} />}{f.k}</div>
                    {/* ‼ באותו מקום בדיוק שבו יושב הערך — לא בטופס נפרד ולא
                        במסך אחר. שדה בלי הגדרת עריכה נשאר לקריאה עם «—». */}
                    {editingScalar && def ? (
                      <div className="v txf-inline-edit">
                        <EditControl def={def} value={sectionDrafts[def.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [def.key]: v }))} />
                        {def.note && <div className="txf-note">{def.note}</div>}
                      </div>
                    ) : editingTaxFileNumber ? (
                      <div className="v txf-inline-edit">
                        <input type="text" placeholder="—"
                          value={sectionDrafts[taxFileNumberKey(f.taxFileNumberAuthority!)] ?? ''}
                          onChange={e => setSectionDrafts(d => ({
                            ...d, [taxFileNumberKey(f.taxFileNumberAuthority!)]: e.target.value,
                          }))} />
                      </div>
                    ) : (
                      <div className={'v ' + (f.tone ?? '')}>{f.v}</div>
                    )}
                    {/* ‼ שורת הרשות רק כשיש מה לומר (שונה / מצב עסקי / כשל).
                        שדה תואם לא מקבל שורה, ואין כאן שום כפתור — האישור
                        מקובץ בסיכום הכרטיס. */}
                    {fieldCheck && !editingThis && spec && (
                      <FieldAuthorityLine field={fieldCheck} sourceLabel={spec.sourceLabel} />
                    )}
                  </div>
                  );
                })}
              </div>
              )}

              {/* ‼ סיכום הבדיקה פעם אחת לכרטיס: מה נבדק, כמה שינויים, כפתור
                  אישור אחד. גם שגיאת ריצה וגם סיבת חסימה מופיעות כאן פעם
                  אחת — לא ליד כל שדה (אותו משפט שש פעמים הכפיל את גובה
                  התאים ולא הוסיף מידע).
                  ‼ מוצג גם לרשות שהאוטומציה שלה עוד לא נבנתה: שם הוא נושא
                  את הסיבה. השורה חיה **בתוך** הכרטיס הפתוח, ולכן מצב
                  הקריאה של המסך אינו משתנה — כרטיס סגור נראה בדיוק כמו קודם.
                  ‼ `cardEditing` ולא `editingThis`: בב"ל אין יותר עריכה
                  ברמת-כרטיס אחת, ואם לא היינו מסתכלים על שני בלוקי האדם
                  הסיכום היה נשאר מוצג גם באמצע עריכת מישהו/י. */}
              {spec && !cardEditing && (
                <AuthorityCheckSummary
                  result={check}
                  sourceLabel={spec.sourceLabel}
                  runError={sync?.error ?? null}
                  approving={approvingAuthority === row.authority}
                  approveError={approvingAuthority === null ? approveError : null}
                  approveNotice={approvingAuthority === null ? approveNotice : null}
                  onApprove={() => { if (check) void approveAuthorityChanges(spec, check); }}
                >
                  {blocked && !running && <div className="txf-check-note">{blocked}</div>}
                </AuthorityCheckSummary>
              )}

              {/* ‼ פעולות העריכה + «ערוך» ברמת-כרטיס — רק כשאין בלוקי-אדם
                  (כל רשות מלבד ב"ל). ב"ל מציג את שתי הפעולות האלה בתוך כל
                  בלוק-אדם בנפרד, למעלה. */}
              {!twoPersons && editingThis && <EditActions />}
              {!twoPersons && (
                <SrcLine
                  label={alignedAt ? 'יישור קו מול הרשויות · ' + shortDate(alignedAt) : 'תיקי הרשויות בכרטיס הלקוח'}
                  onEdit={
                    editingThis || !row.facts.some(f => f.editKey || f.taxFileNumberAuthority)
                      ? undefined
                      : () => {
                          const editFields = row.facts
                            .map(f => f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined)
                            .filter((d): d is EditField => !!d);
                          const tfAuthority = row.facts.find(f => f.taxFileNumberAuthority)?.taxFileNumberAuthority;
                          startSectionEdit(sectionId, editFields, tfAuthority ? { taxFileAuthority: tfAuthority } : undefined);
                        }
                  }
                />
              )}
            </TRow>
            );
          })}
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
          <SectHead family="income" title="הכנסות" why="מה שנכנס — ומשפיע על ההכנסה החייבת" />
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
                {editingSection === 'sal' ? renderLists() : (
                  <div className="txf-kv">
                    {employers.length > 0 ? employers.flatMap(e => [
                      <KV key={`${e.id}-n`} k="מעסיק" v={e.name} />,
                      e.grossSalaryAnnual ? <KV key={`${e.id}-s`} k="שכר ברוטו שנתי" v={money(e.grossSalaryAnnual)} /> : null,
                      e.startDate ? <KV key={`${e.id}-d`} k="תחילת עבודה" v={shortDate(e.startDate)} /> : null,
                    ]) : <KV k="סיווג" v="שכיר - אין פירוט מעביד בתיק" />}
                  </div>
                )}
                {editingSection === 'sal' && <EditActions />}
                {/* ‼ סכומי 106 (ברוטו, מס שנוכה, הפקדות) אינם נערכים כאן אלא
                    בעורך פרטי 106 הייעודי — כאן נערך *מי* המעסיק, לא כמה. */}
                <SrcLine label="מקור: כרטיס הלקוח"
                  onEdit={editingSection === 'sal' ? undefined
                    : () => startSectionEdit('sal', [], { lists: ['employers'] })} />
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
                  {editingSection === 'rent'
                    ? fieldsOf('rental').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        {client.rentalIncomeAnnual != null && <KV k="הכנסה שנתית" v={money(client.rentalIncomeAnnual)} />}
                        <KV k="מסלול מיסוי נבחר" v={client.rentalTaxTrack ? RENTAL_TRACK_LABELS[client.rentalTaxTrack] : 'לא נבחר'} />
                        {client.rentalExpenses ? <KV k="הוצאות על הנכס" v={money(client.rentalExpenses)} /> : null}
                      </>
                    )}
                </div>
                {editingSection === 'rent' && <EditActions />}
                <SrcLine
                  label={meta.rentalTaxTrack ? `מקור: ${TAX_FACT_SOURCE_LABELS[meta.rentalTaxTrack.source as keyof typeof TAX_FACT_SOURCE_LABELS] ?? 'כרטיס הלקוח'}${meta.rentalTaxTrack.syncedAt ? ` · עודכן ${shortDate(meta.rentalTaxTrack.syncedAt)}` : ''}` : 'מקור: כרטיס הלקוח'}
                  onEdit={editingSection === 'rent' ? undefined : () => startSectionEdit('rent', fieldsOf('rental'))}
                />
              </TRow>
            )}

            {showCapitalRow && (
              <TRow
                id="cap" name="שוק ההון" stale={isStale('capital')}
                summary={capitalSummary}
                open={openRows.has('cap')} onToggle={toggleRow}
              >
                {editingSection === 'cap' ? renderLists() : (
                  <div className="txf-kv">
                    {investmentAccounts.map(a => <KV key={a.id} k={a.institutionName} v={a.accountNumber ? `חשבון ${a.accountNumber}` : 'ללא מספר חשבון רשום'} />)}
                    {investmentAccounts.length === 0 && (
                      <KV k="תיקי השקעות" v="ידוע שיש הכנסה משוק ההון, אך לא נרשם תיק" />
                    )}
                  </div>
                )}
                <div className="txf-kv">
                  {editingSection === 'cap'
                    ? fieldsOf('capital').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        {client.capitalGainsAnnual ? <KV k="רווחי הון שנתיים" v={`${client.capitalGainsAnnual.toLocaleString('he-IL')} ₪`} /> : null}
                        {client.dividendInterestAnnual ? <KV k="דיבידנד וריבית" v={`${client.dividendInterestAnnual.toLocaleString('he-IL')} ₪`} /> : null}
                        {client.otherIncome ? <KV k="הכנסה אחרת" v={money(client.otherIncome)} /> : null}
                        {client.gamblingIncomeAnnual ? <KV k="זכיות והגרלות" v={money(client.gamblingIncomeAnnual)} /> : null}
                        {client.hasCrypto ? <KV k="מטבעות דיגיטליים" v="כן - נדרש דיווח רווחי הון" /> : null}
                      </>
                    )}
                </div>
                {editingSection === 'cap' && <EditActions />}
                <SrcLine label="מקור: כרטיס הלקוח"
                  onEdit={editingSection === 'cap' ? undefined
                    : () => startSectionEdit('cap', fieldsOf('capital'), { lists: ['investmentAccounts'] })} />
              </TRow>
            )}
            <UnknownRows section="income" />
          </div>
        </>
      )}

      {/* ג · משפחה וזכאות */}
      <SectHead family="family" title="משפחה וזכאות" why="עובדות שמשנות זכאות ונקודות זיכוי" />
      <div className="txf-sect">
        {showFamilyRow && (
          <TRow
            id="family" name="משפחה ובן/בת זוג"
            summary={`${FAMILY_STATUS_LABELS[client.familyStatus]}${(client.children ?? []).length ? ` · ${client.children.length} ילדים` : ''}`}
            open={openRows.has('family')} onToggle={toggleRow}
          >
            <div className="txf-kv">
              {editingSection === 'family'
                ? fieldsOf('famStatus').map(f => (
                    <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                      onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                  ))
                : <KV k="מצב משפחתי" v={FAMILY_STATUS_LABELS[client.familyStatus]} />}
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
                  כאן כלל — הרו"ח שחיפש אותו לא ידע שהוא בכלל קיים בכרטיס.
                  ‼ פרטי הזיהוי של בן/בת הזוג נשארים לקריאה בלבד כאן — עריכת
                  זהות היא הכרעת מוצר/נתונים שנדחתה במפורש מהמיילסטון הזה. */}
              {married && <KV k={`ת.ז. ${spouseName}`} v={client.spouseIdNumber || <span style={{ color: 'var(--ink-4)' }}>טרם התקבלה</span>} />}
              {married && <KV k={`טלפון ${spouseName}`} v={client.spousePhone?.trim()
                ? <span className="ltr-isolate">{client.spousePhone}</span>
                : <span style={{ color: 'var(--ink-4)' }}>טרם התקבל</span>} />}
              {married && <KV k={`אימייל ${spouseName}`} v={client.spouseEmail?.trim()
                ? <span className="ltr-isolate">{client.spouseEmail}</span>
                : <span style={{ color: 'var(--ink-4)' }}>טרם התקבל</span>} />}
              {editingSection !== 'family' && married && <KV k={`תעסוקת ${spouseName}`} v={client.spouseWorking ? 'שכיר/ה' : 'ללא הכנסה'} />}
              {married && client.spouseWorking && client.spouseIncome ? <KV k="הכנסת בן/בת הזוג (שנתית)" v={money(client.spouseIncome)} /> : null}
              {editingSection !== 'family' && (client.children ?? []).length > 0 && (
                <KV k="ילדים" v={`${client.children.length} · שנתונים ${client.children.map(c => c.birthYear).sort().join(', ')}`} />
              )}
            </div>
            {editingSection === 'family' && renderLists()}
            {editingSection === 'family' && <EditActions />}
            <SrcLine label="מקור: כרטיס הלקוח"
              onEdit={editingSection === 'family' ? undefined
                : () => startSectionEdit('family', fieldsOf('famStatus'), { lists: ['children'] })} />
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
          {/* ‼ קלטי הזיכוי — שירות, מילואים, לימודים, עלייה/תושבות/יישוב מזכה
              ונכות — מתגלים רק בעריכה: הם הקלט שמייצר את שורות הזיכוי
              שלמעלה, וזה בדיוק המקום הטבעי לתקן אותם, לא רשימה נפרדת שאין
              לה כניסה. */}
          {editingSection === 'credits' && (
            <div className="txf-kv">
              {fieldsOf('service', 'residency', 'disability').map(f => (
                <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                  onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
              ))}
            </div>
          )}
          {editingSection === 'credits' && <EditActions />}
          <SrcLine label={`מחושב חי מהכרטיס · ${year}`}
            onEdit={editingSection === 'credits' ? undefined
              : () => startSectionEdit('credits', fieldsOf('service', 'residency', 'disability'))} />
        </TRow>

        <UnknownRows section="family" />

      </div>

      {/* ד · השקעות, נכסים והון — ‼ קטע קבוע, לא מותנה: «מבנים ומצבים
          מיוחדים» תמיד בפנים (כמו «זיכויים» במשפחה), ולכן גם הכותרת שלו
          צריכה להיות תמיד שם — אחרת לחלק מהלקוחות לא הייתה דרך להגיע אליו. */}
      <>
          <SectHead family="assets" title="השקעות, נכסים והון" why="נדל״ן, שוק ההון וקריפטו — מיסוי רווחי הון" />
          <div className="txf-sect">
            {showPropertyRow && (
              <TRow
                id="prop" name="נדל״ן" stale={isStale('realestate')} summary={propertySummary}
                open={openRows.has('prop')} onToggle={toggleRow}
              >
                {editingSection === 'prop' ? (
                  <>
                    {renderLists()}
                    {/* ‼ הדגלים («יש נכס מגורים», «מספר נכסים») נשארים לעריכה
                        גם כשיש רשימה: הם עובדה בפני עצמה, ורשימה חלקית לא
                        אמורה לסתור אותם בשקט. */}
                    <div className="txf-kv">
                      {fieldsOf('realestate').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="txf-kv">
                    {properties.map(p => (
                      <KV key={p.id} k={p.isRented ? 'מושכר' : 'מגורים'}
                        v={`${p.address}${p.city ? `, ${p.city}` : ''}${p.isRented && p.monthlyRent ? ` · ${money(p.monthlyRent)} לחודש` : ''}`} />
                    ))}
                    {properties.length === 0 && <KV k="נכס מגורים" v="ידוע שקיים, אך לא נרשמה כתובת" />}
                  </div>
                )}
                {editingSection === 'prop' && <EditActions />}
                <SrcLine label="מקור: כרטיס הלקוח"
                  onEdit={editingSection === 'prop' ? undefined
                    : () => startSectionEdit('prop', fieldsOf('realestate'), { lists: ['properties'] })} />
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
                  {editingSection === 'crypto'
                    ? fieldsOf('cryptoSec').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        <KV k="מיסוי" v="במסגרת רווחי הון" />
                        {/* ‼ החזקה בלבד אינה אירוע מס — רק מכירה. הרו"ח צריך
                            לראות את ההבחנה הזאת כאן ולא להסיק אותה מעצם קיום
                            השורה. */}
                        <KV k="חובת דיווח" v="קיימת בשנה שבה בוצעו מכירות" />
                      </>
                    )}
                </div>
                {editingSection === 'crypto' && <EditActions />}
                <SrcLine label={metaSrc('hasCrypto')}
                  onEdit={editingSection === 'crypto' ? undefined : () => startSectionEdit('crypto', fieldsOf('cryptoSec'))} />
              </TRow>
            )}

            {showForeignRow && (
              <TRow
                id="abroad" name="חו״ל" stale={isStale('foreign')} summary={foreignSummary}
                open={openRows.has('abroad')} onToggle={toggleRow}
              >
                {editingSection === 'abroad' ? renderLists() : foreignAccounts.length > 0 && (
                  <div className="txf-kv">
                    {foreignAccounts.map(a => (
                      <KV key={a.id} k={a.institutionName || 'חשבון בחו״ל'} v={a.country || '-'} />
                    ))}
                  </div>
                )}
                <div className="txf-kv">
                  {editingSection === 'abroad'
                    ? fieldsOf('foreignAssets').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        {client.foreignIncomeAnnual ? <KV k="הכנסה שנתית מחו״ל" v={money(client.foreignIncomeAnnual)} /> : null}
                        {client.foreignTaxPaid ? <KV k="מס ששולם בחו״ל" v={money(client.foreignTaxPaid)} /> : null}
                        <KV k="חובת דיווח" v="נכסי חוץ נכללים בדוח השנתי" />
                      </>
                    )}
                </div>
                {editingSection === 'abroad' && <EditActions />}
                <SrcLine label={metaSrc('hasForeignAssets')}
                  onEdit={editingSection === 'abroad' ? undefined
                    : () => startSectionEdit('abroad', fieldsOf('foreignAssets'), { lists: ['foreignAccounts'] })} />
              </TRow>
            )}

            {showBankRow && (
              <TRow
                id="bank" name="חשבונות בנק" summary={bankSummary}
                open={openRows.has('bank')} onToggle={toggleRow}
              >
                {editingSection === 'bank' ? renderLists() : (
                  <div className="txf-kv">
                    {bankAccounts.map(b => (
                      <KV key={b.id} k={b.bankName} v={b.isPrimary ? 'ראשי - להחזרי מס' : (b.branchName || 'חשבון נוסף')} />
                    ))}
                    {bankAccounts.length === 0 && <KV k="חשבון להחזרי מס" v="טרם נרשם" />}
                  </div>
                )}
                {editingSection === 'bank' && <EditActions />}
                {/* ‼ קודם «ערוך» כאן הוביל לעורך הלקוח הישן — הכניסה היחידה
                    בתיק המס שעדיין ניווטה החוצה. עכשיו נערך במקום. */}
                <SrcLine label="מקור: כרטיס הלקוח"
                  onEdit={editingSection === 'bank' ? undefined
                    : () => startSectionEdit('bank', [], { lists: ['bankAccounts'] })} />
              </TRow>
            )}

            {/* ‼ מבנים ומצבים מיוחדים — חמישה דגלים נדירים שלא היה להם בכלל
                מקום בתמונת המס. תמיד מוצג, כמו «זיכויים», כי אין דומיין
                שמניב לו שורת "טרם ביררנו" משלו — בלי שורה קבועה אין דרך
                להגיע לעריכה שלו בכלל. */}
            <TRow
              id="special" name="מבנים ומצבים מיוחדים"
              summary={[
                client.isSubstantialShareholder && 'בעל/ת מניות מהותי/ת',
                client.isFamilyCompanyMember && 'חברה משפחתית',
                client.isKibbutzMember && 'קיבוץ',
                client.isForeignControllingShareholder && 'שליטה בחבר-בני-אדם זר',
                client.hasGamblingIncome && 'הכנסות מהגרלות',
              ].filter(Boolean).join(' · ') || 'אין'}
              open={openRows.has('special')} onToggle={toggleRow}
            >
              <div className="txf-kv">
                {editingSection === 'special'
                  ? fieldsOf('shareholder', 'special').map(f => (
                      <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                        onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                    ))
                  : (
                    <>
                      <KV k="בעלות ושליטה" v={client.isSubstantialShareholder ? 'בעל/ת מניות מהותי/ת (10%+)' : 'לא'} />
                      <KV k="חברה משפחתית" v={client.isFamilyCompanyMember ? 'כן' : 'לא'} />
                      <KV k="קיבוץ / מושב שיתופי" v={client.isKibbutzMember ? 'כן' : 'לא'} />
                      <KV k="שליטה בחבר-בני-אדם זר" v={client.isForeignControllingShareholder ? 'כן' : 'לא'} />
                      <KV k="הכנסות מהגרלות והימורים" v={client.hasGamblingIncome ? 'כן' : 'לא'} />
                    </>
                  )}
              </div>
              {editingSection === 'special' && <EditActions />}
              <SrcLine label="מקור: כרטיס הלקוח"
                onEdit={editingSection === 'special' ? undefined : () => startSectionEdit('special', fieldsOf('shareholder', 'special'))} />
            </TRow>
            <UnknownRows section="assets" />
          </div>
        </>

      {/* ה · הפקדות, ביטוחים וזיכויים */}
      {(showPensionRow || showInsuranceRow || showDonationsRow || unknownIn('deposits')) && (
        <>
          <SectHead family="deductions" title="הפקדות, ביטוחים וזיכויים" why="מה שמקטין את המס — ניכויים וזיכויים" />
          <div className="txf-sect">
            {showPensionRow && (
              <TRow
                id="pen" name="פנסיה והשתלמות" stale={isStale('pension')} summary={pensionSummary}
                open={openRows.has('pen')} onToggle={toggleRow}
              >
                {editingSection === 'pen' ? renderLists() : pensionFunds.length > 0 && (
                  <div className="txf-kv">
                    {pensionFunds.map(p => <KV key={p.id} k="פנסיה / השתלמות" v={p.institutionName} />)}
                  </div>
                )}
                <div className="txf-kv">
                  {editingSection === 'pen'
                    ? fieldsOf('pension').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        {pensionFunds.length === 0 && client.hasPension && <KV k="פנסיה" v={client.pensionFundName || 'קיימת'} />}
                        {client.hasKrenHashtalmut && <KV k="קרן השתלמות" v={client.krenHashtalmutMonthly ? `${money(client.krenHashtalmutMonthly)} לחודש` : 'קיימת'} />}
                        {client.selfEmployedPensionAmount ? <KV k="הפקדה כעצמאי" v={money(client.selfEmployedPensionAmount)} /> : null}
                      </>
                    )}
                </div>
                {editingSection === 'pen' && <EditActions />}
                <SrcLine label={metaSrc('hasPension')}
                  onEdit={editingSection === 'pen' ? undefined
                    : () => startSectionEdit('pen', fieldsOf('pension'), { lists: ['pensionFunds'] })} />
              </TRow>
            )}

            {showInsuranceRow && (
              <TRow
                id="ins" name="ביטוחים" stale={isStale('insurance')} summary={insuranceSummary}
                open={openRows.has('ins')} onToggle={toggleRow}
              >
                <div className="txf-kv">
                  {editingSection === 'ins'
                    ? fieldsOf('insurance').map(f => (
                        <EditableKV key={f.key} def={f} value={sectionDrafts[f.key] ?? ''}
                          onChange={v => setSectionDrafts(d => ({ ...d, [f.key]: v }))} />
                      ))
                    : (
                      <>
                        {client.hasLifeInsurance && <KV k="ביטוח חיים" v={client.lifeInsuranceAnnual ? `${money(client.lifeInsuranceAnnual)} לשנה` : 'קיים'} />}
                        {client.hasDisabilityInsurance && <KV k="אובדן כושר עבודה" v={client.disabilityInsuranceAnnual ? `${money(client.disabilityInsuranceAnnual)} לשנה` : 'קיים'} />}
                        {client.hasMedicalInsurance && <KV k="ביטוח בריאות" v={client.medicalInsuranceAnnual ? `${money(client.medicalInsuranceAnnual)} לשנה` : 'קיים'} />}
                      </>
                    )}
                </div>
                {editingSection === 'ins' && <EditActions />}
                <SrcLine label={metaSrc('hasLifeInsurance')}
                  onEdit={editingSection === 'ins' ? undefined : () => startSectionEdit('ins', fieldsOf('insurance'))} />
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
      {/* ‼ שתי כניסות, ובסדר הנכון. קודם הייתה כאן כניסה בולטת אחת שהובילה
          לעורך בן 20 הקבוצות — כלומר מי שרצה לערוך את תיק המס נחת בעורך של
          מסד הנתונים. העריכה המלאה היא הראשית; הישן נשאר נגיש, ומנוסח כמה
          שהוא באמת: פרטי לקוח ותפעול משרד, לא תיק מס. */}
      <div className="txf-details-entry">
        {onOpenDetails && (
          <button type="button" className="ui-linkbtn" onClick={onOpenDetails}>
            פרטי לקוח ותפעול ←
          </button>
        )}
        <span>אנשי קשר, תגיות, עובד מטפל ושדות תפעול נוספים — מחוץ לתיק המס.</span>
      </div>
    </div>
  );
}
