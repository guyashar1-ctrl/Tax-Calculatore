// ─── יישור קו מול הרשויות — יכולת אחת, שלושה הקשרי מחזור-חיים ──────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (openFocus/renderFocus/finishInst). המודל המאושר: לאן להיכנס → מה להעתיק →
// חריגה אם קיימת → הבא. שלושה יציאות: עובדה מקצועית (M1), הבהרה לשיחת הפתיחה,
// או טיוטת בקשת לקוח — ראה finishInstitution() למטה.
//
// ‼ שלושה מסכי מיקוד, לא טופס ארוך אחד. כל מוסד הוא עמוד סגור בפני עצמו.

import { useEffect, useRef, useState } from 'react';
import type { Client } from '../../types';
import { NI_OCCUPATION_TYPE_LABELS } from '../../types';
import type { NiOccupation, NiOccupationType } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { INSTITUTION_NAMES } from '../../types/onboarding';
import type { InstitutionKey } from '../../types/onboarding';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { proposeTaxFacts, acceptTaxFactChange } from '../../lib/taxFacts';
import { clientFromDb } from '../../lib/dbMappers';
import { supabase } from '../../lib/supabase';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import type { DocCategory, StoredDoc } from '../../hooks/useDocumentStore';
import { CURRENT_TAX_YEAR } from '../../data/taxData';
import ShaamFieldSync from './ShaamFieldSync';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE } from '../../types/automation';

// ─── תצורת השדות — אחת לכל מוסד ─────────────────────────────────────────────

type FieldType = 'text' | 'number' | 'date' | 'select';

/**
 * ‼ "איפה מוצאים את הערך" יושב על השדה או על הקבוצה שהוא מסביר — לא כמקרא
 * מרוכז בראש המסך. מקרא בראש מחייב לקרוא, לזכור, ואז לחפש את השדה המתאים.
 * המסלולים עצמם לא שונו — רק הועברו למקום שבו הם נדרשים.
 */
type WherePath = string;

/**
 * הסבר תהליכי קצר שנפתח בלחיצה — לא "איפה מוצאים" (מסלול), אלא "איך בודקים"
 * (סדר פעולות בשאילתה). מוסתר כברירת מחדל כדי שלא יעמיס על המסך.
 */
interface HowToGuide {
  label: string;
  intro?: string;
  steps: string[];
}

/**
 * צירוף אישור לפריט קיים — לא זרימה נפרדת. הקובץ נשמר במסמכי הלקוח
 * הרגילים (bucket 'client-documents' + public.documents), וה-linkedTo
 * הוא מה שקושר אותו לפריט הזה וגם מה שמאפשר למצוא אותו שוב בכניסה הבאה.
 */
interface AttachSpec {
  /** מפתח יציב לפריט. משמש גם ל-linkedTo וגם למפתח ב-collected. */
  docKey: string;
  /** תיאור המסמך כפי שיישמר בתיק המסמכים. */
  linkLabel: string;
  category: DocCategory;
}

interface AlignmentField {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  options?: string[];
  /** קיים ⇒ נכתב לתיק המס (allowlist מנוהל, M1). חסר ⇒ נשמר לתיעוד בלבד. */
  governedKey?: string;
  toPatchValue?: (raw: string) => unknown;
  note?: string;
  where?: WherePath[];
  attach?: AttachSpec;
}

interface AlignmentSection {
  kicker: string;
  fields: AlignmentField[];
  where?: WherePath[];
}

type ExceptionOutcome =
  | { kind: 'clarification'; text: string }
  | { kind: 'request'; title: string; sub?: string }
  | { kind: 'none' };

interface AlignmentException {
  key: string;
  label: string;
  options: string[];
  badValues: string[];
  governedKey?: string;
  governedPatch?: (badSelected: boolean) => unknown;
  outcome: (badValue: string) => ExceptionOutcome;
  /** שדה נוסף שמופיע רק כשהתשובה חריגה — למשל מועד להגשת הצהרת הון. */
  extraFieldWhenBad?: AlignmentField;
  where?: WherePath[];
  guide?: HowToGuide;
}

interface InstitutionConfig {
  sections: AlignmentSection[];
  exceptions: AlignmentException[];
  /** ביטוח לאומי בלבד — רשימת העיסוקים היא בלוק נפרד, ולכן ההסבר שלה נשמר כאן. */
  occupationsWhere?: WherePath[];
  /** הבהרות נגזרות משדה "מה להעתיק" עצמו, לא מ-exceptions (למשל ניהול ספרים לא תקף). */
  derivedClarifications?: (collected: Record<string, unknown>) => string[];
}

const YES_NO_UNCLEAR = ['לא', 'כן', 'לא ברור'];
const AUTH_OPTS = ['קיימת', 'אין הרשאה'];

/**
 * מוסכמת הסימן ליתרות. ‼ אותה מוסכמת בדיוק נקראת בכיוון ההפוך במחולל הדגלים
 * (utils/authorityFlags.ts) — יתרה חיובית היא חוב. בלי ההסבר הזה בשדה עצמו,
 * רו"ח שיקליד חוב כמספר שלילי יקבל "יתרת זכות" בתמונת המצב.
 */
const BALANCE_NOTE = 'כפי שמופיע בפורטל: מספר חיובי = חוב, שלילי = יתרת זכות, 0 = אין יתרה.';

const INSTITUTIONS: Record<InstitutionKey, InstitutionConfig> = {
  btl: {
    occupationsWhere: ['פרטים כלליים → ריכוז מידע → עיסוק', 'עיסוקים והכנסות → רשימת עיסוקים'],
    sections: [
      {
        kicker: 'מצב חשבון',
        fields: [
          { key: 'niBalance', label: 'יתרה בביטוח לאומי', type: 'number', governedKey: 'niBalance',
            where: ['מצב חשבון → לפי ימי ערך ריאלי'],
            note: BALANCE_NOTE,
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
      {
        kicker: 'מקדמות',
        where: ['דמי ביטוח → דמי ביטוח שנתיים → פירוט חודשים'],
        fields: [
          { key: 'incomeBasisMonthly', label: 'בסיס הכנסה למקדמות (לחודש)', type: 'number',
            governedKey: 'niIncomeBasisMonthly', toPatchValue: v => v === '' ? null : Number(v) },
          { key: 'niAdvanceMonthly', label: 'מקדמה חודשית', type: 'number', governedKey: 'niAdvanceMonthly',
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
    ],
    exceptions: [
      {
        key: 'niDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'niDebitAuthorization', governedPatch: bad => !bad,
        where: ['הוראות כספיות → הרשאות לחיוב'],
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב בביטוח לאומי - קוד מוטב 28900',
          sub: 'להקים הרשאה לחיוב חשבון בביטוח לאומי, קוד מוטב 28900.' }),
      },
    ],
  },
  vat: {
    sections: [
      {
        kicker: 'פרטי רישום',
        where: ['פרטי עוסק → פרטי רישום'],
        fields: [
          { key: 'vatFileType', label: 'סוג תיק', type: 'select',
            options: ['עוסק מורשה', 'עוסק פטור', 'חברה', 'מלכ״ר', 'אחר'], governedKey: 'vatFileType' },
          { key: 'vatOpeningDate', label: 'תאריך פתיחת תיק', type: 'date', governedKey: 'vatOpeningDate',
            toPatchValue: v => v || null },
          { key: 'vatPrimaryIndustry', label: 'ענף עיקרי', placeholder: 'קוד/תיאור ענף',
            governedKey: 'vatPrimaryIndustry',
            note: 'טקסט חופשי בשלב זה - אין עדיין תשתית קודי ענף לחיפוש.' },
        ],
      },
      {
        kicker: 'דיווח ויתרה',
        where: ['פרטי עוסק → מאפייני דיווח'],
        fields: [
          { key: 'vatFrequency', label: 'תדירות דיווח', type: 'select',
            options: ['חודשי', 'דו-חודשי'], governedKey: 'vatFrequency',
            toPatchValue: v => v === 'חודשי' ? 'monthly' : 'bi_monthly' },
          { key: 'vatLastReportPeriod', label: 'דוח אחרון שהוגש', placeholder: '06/2026', governedKey: 'vatLastReportPeriod' },
          { key: 'vatBalance', label: 'יתרה במע״מ', type: 'number', governedKey: 'vatBalance',
            note: BALANCE_NOTE,
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
    ],
    exceptions: [
      {
        key: 'reportMissing', label: 'נראה שחסר דיווח?', options: YES_NO_UNCLEAR, badValues: ['כן', 'לא ברור'],
        outcome: bad => ({ kind: 'clarification',
          text: bad === 'כן' ? 'נראה שחסר דיווח מע״מ - לברר בשיחת הפתיחה.' : 'לא ברור אם קיים דיווח מע״מ חסר - לבדוק.' }),
      },
      {
        key: 'vatDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'vatDebitAuthorization', governedPatch: bad => !bad,
        where: ['פורטל המייצגים → רשימת מיוצגים → מע״מ → הרשאה לחיוב חשבון'],
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב במע״מ',
          sub: 'להקים הרשאה לחיוב חשבון במע״מ דרך פורטל המייצגים.' }),
      },
    ],
  },
  income: {
    sections: [
      {
        kicker: 'תיק ומקדמות',
        where: ['גביית מס הכנסה → 134 מקדמות → מידע לתיק'],
        fields: [
          { key: 'incomeTaxFileType', label: 'סוג תיק', governedKey: 'incomeTaxFileType' },
          { key: 'taxOfficeName', label: 'פקיד שומה', placeholder: 'תל אביב 3', governedKey: 'taxOfficeName' },
          { key: 'incomeTaxUnit', label: 'חוליה', governedKey: 'incomeTaxUnit' },
          { key: 'incomeTaxEconomicIndustry', label: 'ענף כלכלי', governedKey: 'incomeTaxEconomicIndustry' },
          { key: 'pitAdvancePercent', label: 'שיעור מקדמות', placeholder: '6%', governedKey: 'pitAdvancePercent' },
          { key: 'pitAdvanceFrequency', label: 'תדירות מקדמות', type: 'select',
            options: ['חודשי', 'דו-חודשי'], governedKey: 'pitAdvanceFrequency',
            toPatchValue: v => v === 'חודשי' ? 'monthly' : 'bi_monthly' },
          { key: 'incomeTaxBalance', label: 'יתרה במס הכנסה', type: 'number', governedKey: 'incomeTaxBalance',
            note: BALANCE_NOTE,
            toPatchValue: v => v === '' ? null : Number(v) },
          { key: 'reportingStatus', label: 'מצב דיווחים', placeholder: 'למשל: אין דיווחים חסרים / חסר דיווח',
            governedKey: 'incomeTaxReportingStatus' },
        ],
      },
      {
        kicker: 'ניכוי במקור וניהול ספרים',
        where: ['אישורי ניכוי במקור וניהול ספרים'],
        fields: [
          // ‼ נכתב כעובדה מנוהלת ולא רק כ-payload: 'שיעורים' ו'אין אישור תקף'
          // שניהם hasExemptFromWithholding=false, ולכן בלי השדה הזה הדגל
          // "אין אישור ניכוי במקור בתוקף" אינו ניתן לגזירה. ראה supabase/146.
          { key: 'withholdingStatus', label: 'מצב ניכוי במקור', type: 'select',
            options: ['פטור מניכוי', 'שיעור/ים לפי פעילות', 'אין אישור תקף'],
            governedKey: 'withholdingStatus',
            toPatchValue: v => v === 'פטור מניכוי' ? 'exempt' : v === 'אין אישור תקף' ? 'none' : 'rates',
            attach: { docKey: 'withholdingCertificate', linkLabel: 'אישור ניכוי מס במקור',
              category: 'business_document' } },
          { key: 'withholdingDetail', label: 'פירוט (כפי שמופיע באישור)', governedKey: 'withholdingDetail',
            placeholder: 'למשל: 0% שירותים, 30% קבלנות' },
          { key: 'bookStatus', label: 'ניהול ספרים', type: 'select',
            options: ['תקין', 'נפסל', 'לא ידוע'], governedKey: 'bookStatus',
            toPatchValue: v => v === 'תקין' ? 'kosher' : v === 'נפסל' ? 'rejected' : 'unknown',
            attach: { docKey: 'bookkeepingCertificate', linkLabel: 'אישור ניהול ספרים',
              category: 'business_document' } },
        ],
      },
    ],
    exceptions: [
      {
        key: 'capitalDeclarationRequired', label: 'דרישת הצהרת הון', options: ['אין דרישה פתוחה', 'דרישה פתוחה'],
        badValues: ['דרישה פתוחה'], governedKey: 'capitalDeclarationRequired', governedPatch: bad => bad,
        where: ['אזור אישי → דרישות להצהרת הון'],
        guide: {
          label: 'איך בודקים בשע״ם?',
          intro: 'בשאילתת AHZM - דרישות להצהרת הון:',
          steps: [
            'הזן את תיק הלקוח.',
            'בדוק האם קיימת דרישה להצהרת הון ובאיזו שנה.',
            'לפי פרטי ההיענות ניתן לראות אם הדרישה טופלה ולזהות את הצהרת ההון האחרונה שמופיעה במערכת.',
          ],
        },
        outcome: () => ({ kind: 'clarification', text: 'קיימת דרישה פתוחה להצהרת הון - לברר מועד הגשה עם הלקוח.' }),
        extraFieldWhenBad: { key: 'capitalDeclarationDeadline', label: 'מועד להגשה', type: 'date',
          governedKey: 'capitalDeclarationDeadline', toPatchValue: v => v || null },
      },
      {
        key: 'incomeTaxDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'incomeTaxDebitAuthorization', governedPatch: bad => !bad,
        where: ['פורטל המייצגים → מס הכנסה → הרשאה לחיוב חשבון'],
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב במס הכנסה',
          sub: 'להקים הרשאה לחיוב חשבון במס הכנסה דרך פורטל המייצגים.' }),
      },
    ],
    derivedClarifications: collected => {
      const out: string[] = [];
      if (collected.withholdingStatus === 'אין אישור תקף') out.push('אין אישור ניכוי במקור תקף - לברר עם הלקוח.');
      if (collected.bookStatus && collected.bookStatus !== 'תקין') out.push('אין אישור ניהול ספרים תקף.');
      return out;
    },
  },
};

// ─── עוזרי DB ────────────────────────────────────────────────────────────────

/**
 * מציע עובדה מקצועית ומאשר אותה מיד — נשארת pending (ולא נדרסת) אם הערך
 * המקובל בפועל השתנה מאז שהמסך נטען. ‼ oldValue.patch הוא מה שמאפשר ל-M1
 * לזהות את הקונפליקט הזה (accept_tax_fact_change בודק אותו מול הערך הנוכחי
 * בשרת) — בלעדיו אין בדיקת עדכניות בכלל, וזו בדיוק "הדריסה בשקט" שנאסרה.
 */
async function proposeAndAccept(
  client: Client, sourceRef: string, fieldKey: string, label: string, display: string, patch: unknown,
): Promise<{ client: Client | null; pending: boolean }> {
  const oldRaw = (client as unknown as Record<string, unknown>)[fieldKey];
  const propose = await proposeTaxFacts(client.id, 'institution_alignment', sourceRef, [
    {
      fieldKey, label,
      oldValue: { display: String(oldRaw ?? '-'), patch: { [fieldKey]: oldRaw ?? null } },
      newValue: { display, patch: { [fieldKey]: patch } },
    },
  ]);
  if (!propose.ok || !propose.change?.id) return { client: null, pending: false };
  const accept = await acceptTaxFactChange(propose.change.id);
  if (!accept.ok) return { client: null, pending: accept.error === 'stale_conflict' };
  return { client: accept.client ? clientFromDb(accept.client) : null, pending: false };
}

/**
 * ‼ flagKey הוא מפתח יציב שמאפשר לתמונת המצב לזהות שכבר נוצרה בקשה לדגל הזה
 * ולהציג "נוצרה בקשה ללקוח" במקום כפתור. זיהוי לפי הכותרת היה נשבר בכל שינוי
 * ניסוח — ראה system-task-identity-is-its-title.
 */
async function createDebitAuthRequest(
  clientId: string, stageId: string | null, title: string, sub: string, flagKey: string,
): Promise<void> {
  await supabase.rpc('create_onboarding_request', {
    p_client_id: clientId,
    p_step_type: 'custom_request',
    p_payload: {
      title, clientTitle: title, clientSub: sub, clientCta: 'לאישור', flagKey,
      requirements: [{ key: 'debit_auth_confirm', kind: 'confirm', label: 'הקמתי את הרשאת החיוב', done: false }],
    },
    p_due_date: null,
    p_depends_on: null,
    p_published: false,
    p_required_for_close: false,
    p_owner: 'client',
    p_stage_id: stageId,
  });
}

// ─── תצוגת "מה נשמר" ─────────────────────────────────────────────────────────

function displayValue(_f: AlignmentField, raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s || '-';
}

// ─── "איפה מוצאים?" — ההסבר צמוד לשדה שהוא מסביר ─────────────────────────────

/** מסלול קצר (עד שתי תחנות, אחד בלבד) נקרא במבט — אין טעם להסתיר אותו מאחורי לחיצה. */
function isShortHint(where: WherePath[]): boolean {
  return where.length === 1 && where[0].split('→').length <= 2;
}

function WhereHint({ where }: { where?: WherePath[] }) {
  const [open, setOpen] = useState(false);
  if (!where || where.length === 0) return null;
  if (isShortHint(where)) return <div className="ial-where">{where[0]}</div>;
  return (
    <>
      <button type="button" className="ial-where-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        איפה מוצאים?
      </button>
      {open && (
        <div className="ial-where">
          {where.map(p => <div key={p}>{p}</div>)}
        </div>
      )}
    </>
  );
}

/** "איך בודקים?" — סדר פעולות בשאילתה, סגור כברירת מחדל. */
function GuideHint({ guide }: { guide?: HowToGuide }) {
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  return (
    <>
      <button type="button" className="ial-where-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {guide.label}
      </button>
      {open && (
        <div className="ial-where">
          {guide.intro && <div>{guide.intro}</div>}
          <ol className="ial-guide">
            {guide.steps.map(s => <li key={s}>{s}</li>)}
          </ol>
        </div>
      )}
    </>
  );
}

// ─── צירוף אישור לפריט — קומפקטי, בתוך השדה ─────────────────────────────────

const ATTACH_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx';

/** הקישור שנשמר על המסמך. יציב לאורך זמן — לפיו מוצאים אותו שוב. */
function attachLinkKey(spec: AttachSpec): string {
  return `institution_alignment:${spec.docKey}`;
}

/**
 * ‼ המסמך נשמר בתיק המסמכים הרגיל של הלקוח (אותו saveDoc של DocumentManager),
 * ולא בעותק צדדי — כדי שהוא יופיע גם ב"מסמכים" וגם כאן. מקור האמת הוא הטבלה:
 * המסך טוען לפי linkedTo, ולכן צירוף שנעשה ולא נשמר בשלב עדיין נמצא בחזרה.
 */
function ItemAttachment({ clientId, spec, onDocChange }: {
  clientId: string;
  spec: AttachSpec;
  onDocChange: (docId: string | null) => void;
}) {
  const db = useDocumentStore();
  const linkKey = attachLinkKey(spec);
  const [doc, setDoc] = useState<StoredDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!clientId) return;
      try {
        const all = await db.getDocsByClient(clientId);
        const mine = all.filter(d => d.linkedTo === linkKey);
        const found = mine.length ? mine[mine.length - 1] : null;
        if (!alive) return;
        setDoc(found);
        onDocChange(found?.id ?? null);
      } catch {
        if (alive) setDoc(null);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, linkKey]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !clientId) return;
    setBusy(true);
    setErr(null);
    try {
      const buf = await file.arrayBuffer();
      // החלפה משתמשת באותו מזהה ⇒ אותו נתיב באחסון, בלי להשאיר קובץ יתום.
      const next: StoredDoc = {
        id: doc?.id ?? crypto.randomUUID(),
        clientId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        category: spec.category,
        year: doc?.year ?? CURRENT_TAX_YEAR,
        uploadedAt: new Date().toISOString(),
        description: spec.linkLabel,
        notes: doc?.notes ?? '',
        fileData: buf,
        linkedTo: linkKey,
        linkedLabel: spec.linkLabel,
        folderId: doc?.folderId ?? null,
        labelId: doc?.labelId ?? null,
      };
      await db.saveDoc(next);
      setDoc({ ...next, fileData: new ArrayBuffer(0), _remote: true });
      onDocChange(next.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'ההעלאה נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    if (!doc) return;
    // ‼ הכרטיסייה נפתחת לפני ה-await — אחרת חוסם החלונות הקופצים בולע אותה.
    const tab = window.open('', '_blank');
    const full = await db.getDoc(doc.id);
    if (!full || full.fileData.byteLength === 0) { tab?.close(); setErr('לא ניתן לפתוח את הקובץ.'); return; }
    const url = URL.createObjectURL(new Blob([full.fileData], { type: full.fileType || 'application/octet-stream' }));
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleRemove() {
    if (!doc) return;
    if (!confirm(`להסיר את "${doc.fileName}"? המסמך יימחק גם מתיק המסמכים של הלקוח.`)) return;
    setBusy(true);
    try {
      await db.deleteDoc(doc.id);
      setDoc(null);
      onDocChange(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'המחיקה נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  if (!clientId) return null;

  return (
    <div className="ial-attach">
      <input ref={inputRef} type="file" accept={ATTACH_ACCEPT} style={{ display: 'none' }}
        onChange={e => void handlePick(e)} />
      {doc ? (
        <>
          <button type="button" className="ial-attach-file" onClick={() => void handleOpen()} title="פתיחה לצפייה">
            📎 {doc.fileName}
          </button>
          <button type="button" className="ial-attach-btn" disabled={busy}
            onClick={() => inputRef.current?.click()}>החלפה</button>
          <button type="button" className="ial-attach-btn is-danger" disabled={busy}
            onClick={() => void handleRemove()}>הסרה</button>
        </>
      ) : (
        <button type="button" className="ial-attach-btn" disabled={busy}
          onClick={() => inputRef.current?.click()}>
          {busy ? 'מעלה…' : `+ צירוף ${spec.linkLabel} (לא חובה)`}
        </button>
      )}
      {busy && doc && <span className="ial-attach-state">שומר…</span>}
      {err && <span className="ial-attach-err">{err}</span>}
    </div>
  );
}

/** כותרת קבוצה + ההסבר של אותה קבוצה, על אותה שורה. */
function SectionHead({ kicker, where }: { kicker: string; where?: WherePath[] }) {
  return (
    <div className="ial-head">
      <div className="ial-kicker">{kicker}</div>
      <WhereHint where={where} />
    </div>
  );
}

// ─── מסך מיקוד — מוסד אחד ────────────────────────────────────────────────────

interface FocusProps {
  client: Client;
  step: OnboardingStep;
  allSteps: OnboardingStep[];
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  onClientPersisted: (c: Client) => void;
  openingCallStep?: OnboardingStep;
  /** "חזרה לבקשות" — יעד אחד, שם אחד, בלי תלות בשלב החיים (נגזר ב-OnboardingTab). */
  returnLabel: string;
  onClose: () => void;
  onAdvanceInstitution: (nextKey: InstitutionKey | null) => void;
}

export function InstitutionFocus({ client, step, allSteps, advance, onClientPersisted, openingCallStep, returnLabel, onClose, onAdvanceInstitution }: FocusProps) {
  const key = (step.payload.institution ?? 'btl') as InstitutionKey;
  const cfg = INSTITUTIONS[key];
  const [collected, setCollected] = useState<Record<string, unknown>>(step.payload.collected ?? {});
  const [exceptions, setExceptions] = useState<Record<string, unknown>>(step.payload.exceptions ?? {});
  // שורה אחת פתוחה תמיד — בלי בחירה מוקדמת, ובלי שורות ריקות מראש.
  const [occupations, setOccupations] = useState<OccupationDraft[]>(() => {
    const saved = (step.payload.collected?.occupations as NiOccupation[] | undefined) ?? [];
    return saved.length > 0 ? saved : [newOccupationRow(0)];
  });
  /** רק שורה שנבחר בה עיסוק נשמרת — שורה ריקה היא הזמנה למלא, לא עובדה. */
  const selectedOccupations = occupations.filter((o): o is NiOccupation => o.type !== '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ‼ קריאה אחת משע״ם משרתת את כל שדות מס הכנסה. הכפתורים הם שדה-שדה
  // (זה המודל בשלב הלמידה), אבל המשימה משותפת — אחרת ארבע לחיצות היו
  // פותחות ארבעה סבבים מול אותה מערכת חד-סשן.
  const shaamSync = useAutomationJob(client.id, SHAAM_SYNC_INCOME_TAX_ACTION_TYPE);
  const incomeTaxFileNumber = ((client.taxFiles ?? [])
    .find(t => t.authority === 'income_tax')?.fileNumber ?? '').replace(/\D/g, '');

  const remaining = (['btl', 'vat', 'income'] as InstitutionKey[]).filter(k => {
    const s = allSteps.find(x => x.payload.institution === k);
    return k !== key && s && s.status !== 'completed' && s.status !== 'verified';
  });
  const nextLabel = remaining.length === 0 ? 'שמור וסיים את יישור הקו' : `שמור והמשך ל${INSTITUTION_NAMES[remaining[0]]}`;

  function setField(k: string, v: unknown) {
    setCollected(prev => ({ ...prev, [k]: v }));
  }
  function setExc(k: string, v: unknown) {
    setExceptions(prev => ({ ...prev, [k]: v }));
  }
  /** מקור האמת לצירוף הוא תיק המסמכים; כאן רק נרשם מי המסמך של הפריט. */
  function setAttachDoc(docKey: string, docId: string | null) {
    const k = `${docKey}DocId`;
    setCollected(prev => ((prev[k] ?? null) === docId ? prev : { ...prev, [k]: docId }));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const fullCollected = key === 'btl' ? { ...collected, occupations: selectedOccupations } : collected;

      // 1) עובדות מקצועיות — כל שדה עם governedKey מוצע ומאושר מיד דרך M1.
      //    נשאר pending (לא נדרס) אם הערך המקובל השתנה מאז שהמסך נטען.
      let latestClient = client;
      let pendingCount = 0;
      for (const section of cfg.sections) {
        for (const f of section.fields) {
          if (!f.governedKey) continue;
          const raw = fullCollected[f.key];
          if (raw === undefined || raw === '' || raw === null) continue;
          const patchVal = f.toPatchValue ? f.toPatchValue(String(raw)) : raw;
          const res = await proposeAndAccept(
            latestClient, step.id, f.governedKey, f.label, displayValue(f, raw), patchVal);
          if (res.client) latestClient = res.client;
          if (res.pending) pendingCount++;
        }
      }
      if (key === 'btl') {
        const res = await proposeAndAccept(
          latestClient, step.id, 'niOccupations', 'עיסוקים בביטוח לאומי',
          selectedOccupations.length ? `${selectedOccupations.length} עיסוקים` : '-', selectedOccupations);
        if (res.client) latestClient = res.client;
        if (res.pending) pendingCount++;
      }
      // ‼ פטור מניכוי במקור נגזר מ"מצב ניכוי במקור" — לא שדה עצמאי במסך.
      if (key === 'income' && fullCollected.withholdingStatus) {
        const exempt = fullCollected.withholdingStatus === 'פטור מניכוי';
        const res = await proposeAndAccept(
          latestClient, step.id, 'hasExemptFromWithholding', 'פטור מניכוי במקור', exempt ? 'כן' : 'לא', exempt);
        if (res.client) latestClient = res.client;
        if (res.pending) pendingCount++;
      }

      // 2) חריגות — שלושה יעדי פלט: עובדה מקצועית, הבהרה, או טיוטת בקשה.
      const clarifications: string[] = [];
      for (const exc of cfg.exceptions) {
        const val = String(exceptions[exc.key] ?? exc.options[0]);
        const bad = exc.badValues.includes(val);
        if (exc.governedKey && exc.governedPatch) {
          const patchVal = exc.governedPatch(bad);
          const res = await proposeAndAccept(
            latestClient, step.id, exc.governedKey, exc.label, val, patchVal);
          if (res.client) latestClient = res.client;
          if (res.pending) pendingCount++;
        }
        if (exc.extraFieldWhenBad && bad) {
          const f = exc.extraFieldWhenBad;
          const raw = fullCollected[f.key];
          if (raw !== undefined && raw !== '' && f.governedKey) {
            const patchVal = f.toPatchValue ? f.toPatchValue(String(raw)) : raw;
            const res = await proposeAndAccept(latestClient, step.id, f.governedKey, f.label, String(raw), patchVal);
            if (res.client) latestClient = res.client;
            if (res.pending) pendingCount++;
          }
        }
        if (!bad) continue;
        const outcome = exc.outcome(val);
        if (outcome.kind === 'clarification') clarifications.push(outcome.text);
        else if (outcome.kind === 'request') {
          await createDebitAuthRequest(
            client.id, step.stageId ?? null, outcome.title, outcome.sub ?? outcome.title,
            exc.governedKey ?? exc.key);
        }
      }
      (cfg.derivedClarifications?.(fullCollected) ?? []).forEach(t => clarifications.push(t));

      // 3) הבהרות → שיחת הפתיחה (קליטה חדשה) או הערה מקומית על השלב (לקוח קיים/פעיל).
      const nowIso = new Date().toISOString();
      if (clarifications.length > 0) {
        if (openingCallStep) {
          const existing = (openingCallStep.payload.clarifications ?? []) as Array<{ text: string; institution: InstitutionKey; at: string }>;
          const merged = [...existing, ...clarifications.map(text => ({ text, institution: key, at: nowIso }))];
          await advance(openingCallStep.id, 'note', {
            note: `יישור קו · ${INSTITUTION_NAMES[key]}: ${clarifications.length} נקודות לבירור`,
            clarifications: merged,
          });
        } else {
          await advance(step.id, 'note', { note: clarifications.join(' · ') });
        }
      }

      onClientPersisted(latestClient);

      // 4) סימון השלב עצמו כהושלם, עם תמונת המצב המלאה.
      const res = await advance(step.id, 'complete', {
        collected: fullCollected, exceptions, checkedAt: nowIso,
      });
      if (!res.ok) { setError(res.message || 'השמירה נכשלה.'); setSaving(false); return; }

      setSaving(false);
      if (pendingCount > 0) {
        // ‼ לא נדרס — הערך המקובל השתנה מאז שהמסך נטען. ההצעה נשארת ל-M1
        // (תיק המס, "עדכונים ממתינים"), לא נעלמת ולא כותבת בשקט.
        setError(`${pendingCount} ערכים הועברו לבדיקה בתיק המס (ערך מקובל השתנה בינתיים ולא נדרס).`);
      }
      onAdvanceInstitution(remaining.length > 0 ? remaining[0] : null);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'השמירה נכשלה.');
    }
  }

  return (
    <div className="ial-focus">
      <button type="button" className="ial-back" onClick={onClose}>→ {returnLabel}</button>
      <div className="ial-trail">
        {(['btl', 'vat', 'income'] as InstitutionKey[]).map(k => {
          const s = allSteps.find(x => x.payload.institution === k);
          const isDone = s && (s.status === 'completed' || s.status === 'verified');
          return (
            <span key={k} className={isDone ? 'is-done' : k === key ? 'is-on' : ''}>
              {isDone ? '✓ ' : ''}{INSTITUTION_NAMES[k]}
            </span>
          );
        })}
      </div>
      <div className="ial-card">
        <div className="ial-step">
          <div className="ial-focus-title">{INSTITUTION_NAMES[key]}</div>
        </div>

        {cfg.sections.map(section => (
          <div className="ial-step" key={section.kicker}>
            <SectionHead kicker={section.kicker} where={section.where} />
            <div className="ial-fgrid">
              {section.fields.map(f => (
                <div key={f.key}>
                  <label>{f.label}</label>
                  {f.type === 'select' ? (
                    <select className="inp" value={String(collected[f.key] ?? '')}
                      onChange={e => setField(f.key, e.target.value)}>
                      <option value="">-</option>
                      {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="inp" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      placeholder={f.placeholder} value={String(collected[f.key] ?? '')}
                      onChange={e => setField(f.key, e.target.value)} />
                  )}
                  {key === 'income' && (
                    <ShaamFieldSync
                      fieldKey={f.key}
                      currentValue={String(collected[f.key] ?? '')}
                      onAdopt={v => setField(f.key, v)}
                      job={shaamSync.job}
                      busy={shaamSync.busy}
                      fileNumber={incomeTaxFileNumber}
                      onRun={() => { void shaamSync.run({ fileNumber: incomeTaxFileNumber }); }}
                    />
                  )}
                  {f.note && <div className="ial-where">{f.note}</div>}
                  <WhereHint where={f.where} />
                  {f.attach && (
                    <ItemAttachment clientId={client.id} spec={f.attach}
                      onDocChange={id => setAttachDoc(f.attach!.docKey, id)} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {key === 'btl' && (
          <div className="ial-step">
            <SectionHead kicker="רשימת עיסוקים" where={cfg.occupationsWhere} />
            <OccupationsEditor occupations={occupations} onChange={setOccupations} />
          </div>
        )}

        <div className="ial-step ial-exc">
          <div className="ial-kicker">יש משהו חריג?</div>
          <div className="ial-fgrid">
            {cfg.exceptions.map(exc => {
              const val = String(exceptions[exc.key] ?? exc.options[0]);
              const bad = exc.badValues.includes(val);
              return (
                <div key={exc.key}>
                  <label>{exc.label}</label>
                  <select className="inp" value={val} onChange={e => setExc(exc.key, e.target.value)}>
                    {exc.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <WhereHint where={exc.where} />
                  <GuideHint guide={exc.guide} />
                  {bad && exc.extraFieldWhenBad && (
                    <div style={{ marginTop: 6 }}>
                      <label>{exc.extraFieldWhenBad.label}</label>
                      <input className="inp" type={exc.extraFieldWhenBad.type === 'date' ? 'date' : 'text'}
                        value={String(collected[exc.extraFieldWhenBad.key] ?? '')}
                        onChange={e => setField(exc.extraFieldWhenBad!.key, e.target.value)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {cfg.exceptions.some(exc => exc.badValues.includes(String(exceptions[exc.key] ?? exc.options[0]))) && (
            <div className="ial-exc-note">
              {cfg.exceptions
                .filter(exc => exc.badValues.includes(String(exceptions[exc.key] ?? exc.options[0])))
                .map(exc => {
                  const outcome = exc.outcome(String(exceptions[exc.key]));
                  return (
                    <div key={exc.key}>
                      {outcome.kind === 'request' ? `תיווצר בקשת לקוח (כטיוטה): ${outcome.title}`
                        : outcome.kind === 'clarification' ? `יירשם לבירור: ${outcome.text}` : null}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="ial-step ial-saved">
          <div className="ial-kicker">מה נשמר לתיק המס</div>
          {cfg.sections.flatMap(s => s.fields).filter(f => f.governedKey).map(f => (
            <div key={f.key} className="ial-srow">
              <span>{f.label}</span><b>{displayValue(f, collected[f.key])}</b>
            </div>
          ))}
          {key === 'btl' && <div className="ial-srow"><span>עיסוקים</span><b>{selectedOccupations.length || '-'}</b></div>}
        </div>

        {error && (
          <div className="ial-step" style={{ color: 'var(--err)', fontSize: 'var(--fs-13)' }}>{error}</div>
        )}

        <div className="ial-factbar">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>חזרה</button>
          <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={saving}>
            {saving ? 'שומר…' : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── עורך רשימת עיסוקים — חשיפה הדרגתית לפי סוג ─────────────────────────────

const OCC_TYPES = Object.keys(NI_OCCUPATION_TYPE_LABELS) as NiOccupationType[];

/** שורה שעדיין לא נבחר בה עיסוק. נשמר רק מה שנבחר — ראה selectedOccupations. */
type OccupationDraft = Omit<NiOccupation, 'type'> & { type: NiOccupationType | '' };

function newOccupationRow(index: number): OccupationDraft {
  return { id: `occ_${Date.now()}_${index}`, type: '' };
}

function OccupationsEditor({ occupations, onChange }: { occupations: OccupationDraft[]; onChange: (o: OccupationDraft[]) => void }) {
  function update(id: string, patch: Partial<OccupationDraft>) {
    onChange(occupations.map(o => o.id === id ? { ...o, ...patch } : o));
  }
  function remove(id: string) {
    onChange(occupations.filter(o => o.id !== id));
  }
  function add() {
    onChange([...occupations, newOccupationRow(occupations.length)]);
  }
  return (
    <div>
      {occupations.map((o, i) => (
        <div key={o.id} className="ial-occ">
          <div className="ial-occ-head">
            <select className="inp" value={o.type} aria-label="עיסוק"
              onChange={e => update(o.id, { type: e.target.value as NiOccupationType | '' })}>
              <option value="">בחירת עיסוק</option>
              {OCC_TYPES.map(t => <option key={t} value={t}>{NI_OCCUPATION_TYPE_LABELS[t]}</option>)}
            </select>
            {i > 0 && (
              <button type="button" className="ial-occ-remove" onClick={() => remove(o.id)}>הסר</button>
            )}
          </div>
          {o.type === 'employee' && (
            <div className="ial-fgrid">
              <div><label>שם מעביד</label><input className="inp" value={o.employerName ?? ''}
                onChange={e => update(o.id, { employerName: e.target.value })} /></div>
              <div><label>תיק ניכויים</label><input className="inp" value={o.withholdingFile ?? ''}
                onChange={e => update(o.id, { withholdingFile: e.target.value })} /></div>
              <div><label>מתאריך</label><input className="inp" type="date" value={o.fromDate ?? ''}
                onChange={e => update(o.id, { fromDate: e.target.value })} /></div>
              <div><label>עד תאריך</label><input className="inp" type="date" value={o.toDate ?? ''}
                onChange={e => update(o.id, { toDate: e.target.value })} /></div>
            </div>
          )}
          {(o.type === 'self_employed' || o.type === 'self_employed_non_qualifying') && (
            <div className="ial-fgrid">
              <div><label>מתאריך</label><input className="inp" type="date" value={o.fromDate ?? ''}
                onChange={e => update(o.id, { fromDate: e.target.value })} /></div>
              <div><label>עד תאריך</label><input className="inp" type="date" value={o.toDate ?? ''}
                onChange={e => update(o.id, { toDate: e.target.value })} /></div>
              <div><label>שעות שבועיות</label><input className="inp" type="number" value={o.weeklyHours ?? ''}
                onChange={e => update(o.id, { weeklyHours: Number(e.target.value) || undefined })} /></div>
              <div><label>הכנסה לצורך הגדרה</label><input className="inp" type="number" value={o.definitionIncome ?? ''}
                onChange={e => update(o.id, { definitionIncome: Number(e.target.value) || undefined })} /></div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="ial-add-occ" onClick={add}>+ הוסף עיסוק</button>
    </div>
  );
}

// ─── כרטיס הקבוצה — שלושת המוסדות, כפי שמופיע ברשימת הבקשות ────────────────

interface GroupProps {
  steps: OnboardingStep[];
  /** בחירת מוסד למיקוד — הבעלים על מצב המיקוד הוא OnboardingTab (השתלטות מלאה על המסך). */
  onOpen: (key: InstitutionKey) => void;
}

/**
 * כרטיס הקבוצה — שלושת המוסדות.
 *
 * ‼ שורות ולא אריחים. מקור UX מחייב:
 * docs/prototypes/client-case-simplified-exploration-v3-final2.html (‏cc2878e),
 * מקטע `.insts` — נקודת מצב · שם · סטטוס · «כניסה», וכותרת «הושלם X מתוך 3».
 * הייצור הציג שלושה אריחים בגודל זהה, שבהם הסטטוס והפעולה נבלעו: אריח לא
 * אומר "כמה נשאר" ולא מבדיל בין מה שהושלם למה שמחכה. שורה כן.
 * פתיחה קופצת להשתלטות מלאה על המסך אצל ההורה — כמו קודם.
 */
export default function InstitutionAlignmentGroup({ steps, onOpen }: GroupProps) {
  const instSteps = (['btl', 'vat', 'income'] as InstitutionKey[])
    .map(k => steps.find(s => s.payload.institution === k))
    .filter((s): s is OnboardingStep => !!s);

  const doneCount = instSteps.filter(s => s.status === 'completed' || s.status === 'verified').length;

  return (
    <div className="ial-insts">
      {instSteps.length > 1 && (
        <div className="ial-insts-head">הושלם {doneCount} מתוך {instSteps.length}</div>
      )}
      {instSteps.map(s => {
        const k = s.payload.institution as InstitutionKey;
        const done = s.status === 'completed' || s.status === 'verified';
        const checkedAt = s.payload.checkedAt
          ? new Date(String(s.payload.checkedAt)).toLocaleDateString('he-IL') : null;
        return (
          <div className="ial-inst" key={k}>
            <span className={`ial-inst-dot ${done ? 'is-done' : ''}`} aria-hidden="true" />
            <span className="ial-inst-nm">{INSTITUTION_NAMES[k]}</span>
            <span className={`ial-inst-stt ${done ? 'is-done' : ''}`}>
              {done ? `הושלם${checkedAt ? ' · ' + checkedAt : ''}` : 'טרם בוצע'}
            </span>
            <button type="button" className="ial-inst-btn" onClick={() => onOpen(k)}>
              {done ? 'פתח' : 'כניסה'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export { INSTITUTIONS };
