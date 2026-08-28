// ─── מרכז ביצוע הייצוג ─────────────────────────────────────────────────────
// שני מסלולים נפרדים לגמרי, ולכן שתי עמודות ולא רשימה אחת:
//   • מס הכנסה — הפרטים מוזנים בשע"ם, ייפוי הכוח נחתם דיגיטלית אצלנו והתהליך
//     מתקדם דרך סטטוס הבקשה. השלבים כאן משקפים את הסטטוס, לא קובעים אותו.
//   • ביטוח לאומי — הזנה ידנית באתר ב"ל שמנפיקה מספר אסמכתא עם מועד תפוגה,
//     ומי שמאשר בסוף הוא הלקוח. כל השלבים כאן נשמרים ב-execution.
// המטרה: להיכנס לבקשה ולדעת בשנייה מה נשאר לעשות ואצל מי הכדור.

import { useEffect, useState } from 'react';
import {
  RepresentationRequest,
  RepresentationExecution,
  NiTracking,
  NI_APPROVAL_PHONE,
  Client,
} from '../types';
import {
  registeredFileInfo, registeredSpouseSentence, hasRegisteredSpouseChoice,
  clientDisplayName, spouseDisplayName,
} from '../features/annualReport/profile';
import { getRequestSigners, effectiveSignStatus } from '../utils/repSigners';
import { shaamSubmissions, requestScope, peopleFromClient } from '../utils/repScope';
import { signatureDocumentsOf, allDocumentsStamped } from '../utils/repDocuments';
import { useEmailMessages } from '../hooks/useEmailMessages';
import {
  useRepApprovalStep, isRepApprovalClosed, isRepApprovalDeclared,
} from '../hooks/useRepApprovalStep';
import type { RepApprovalStep } from '../hooks/useRepApprovalStep';
import EmailStatusRow from './EmailActivity/EmailStatusRow';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import type { RepSigner } from '../types';
import InfoLines from './ui/InfoLines';

interface Props {
  request: RepresentationRequest;
  /** האם התבקש ייצוג בביטוח לאומי — נגזר ממרשם הייצוג של הלקוח. */
  niIncluded: boolean;
  /** הייצוג בב"ל נלקח גם לבן/בת הזוג — שני מסלולים, שתי אסמכתאות. */
  niCoversSpouse?: boolean;
  onSaveExecution: (execution: RepresentationExecution) => Promise<void> | void;
  /** פותח את עורך הפקת הטופס — העלאת PDF של ייפוי הכוח וסימון אזורי החתימה. */
  onProduce: () => void;
  /** פותח את חדר החתימה של הרו"ח — חתימה + חותמת על הטופס שהלקוח חתם. */
  onStamp: () => void;
  /** סימון שהטופס החתום הוגש בשע"ם. */
  onMarkSentToShaam: () => void;
  /** סימון שהייצוג אושר בשע"ם. */
  onMarkActive: () => void;
  /** שולח מייל חתימה לחותם. null = הצלחה. */
  onSendToSigner: (s: RepSigner) => Promise<string | null>;
  /** בעל החשבון — לטעינת יומן המיילים של הבקשה. */
  userId: string | undefined;
  /**
   * דריסת הנתיב המזורז — למסך הבדיקה בלבד (__TestExecutionCenter), שרץ בלי
   * מסד ולכן ה-hook מחזיר בו null תמיד. `undefined` = התנהגות רגילה.
   * ‼ לא להשתמש בזה בקוד אמיתי: המקור היחיד הוא onboarding_steps.
   */
  repApprovalOverride?: RepApprovalStep | null;
  /** הלקוח המקושר — לשמות בני הזוג ולמצב "מי הרשום במ"ה". */
  linkedClient?: Client;
  /**
   * ‼ ההכרעה מי בן/בת הזוג הרשום/ה יושבת **בתוך** שלב "הפרטים הוזנו בשע״ם"
   * (הכרעת גיא 2026-08-27): זה הרגע שבו הרו"ח פותח את הבקשה בשע״ם ורואה מה
   * רשום שם באמת. אין שלב נוסף, אין מסך אימות שני — הבחירה **היא** הסימון.
   */
  onConfirmRegisteredSpouse?: (clientId: string, owner: 'client' | 'spouse') => Promise<void> | void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmt(dateish?: string): string {
  if (!dateish) return '';
  const d = new Date(dateish);
  return isNaN(d.getTime()) ? dateish : d.toLocaleDateString('he-IL');
}

/** ימים עד המועד האחרון. שלילי = עבר. */
function daysUntil(deadline?: string): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/**
 * נתיב מזורז — שלב ביניים שאינו חלק מהשרשרת.
 *
 * ‼ בלי מספר, ובכוונה: מספר היה הופך אותו לשלב שביעי שחייבים לעבור בו,
 * בעוד שהייצוג נכנס לתוקף גם בלעדיו. מוזח פנימה ונשען על קו, כדי שייקרא
 * כענף של השלב שמעליו ולא כשורה שווה לו.
 * ‼ גם אינו נספר במונה המסלול — "6 מתוך 8" היה מציג תהליך שלא הושלם
 * כשהוא למעשה הושלם.
 */
function SideStep({ title, done, tone, hint, children }: {
  title: string; done: boolean; tone?: 'wait' | 'attention';
  hint?: string; children?: React.ReactNode;
}) {
  const dot = done ? 'var(--success)'
    : tone === 'attention' ? 'var(--orange)' : 'var(--ink-4)';
  return (
    <div style={{
      display: 'flex', gap: '.65rem', padding: '.45rem 0 .45rem .9rem',
      marginInlineStart: '.55rem', borderInlineStart: '2px solid var(--hairline-2)',
    }}>
      <div style={{
        flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700,
        background: done ? 'var(--success)' : 'transparent',
        border: done ? 'none' : `1.5px solid ${dot}`,
        color: 'var(--on-accent)',
      }}>
        {done ? '✓' : ''}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--fs-13)', fontWeight: done ? 400 : 500,
          color: done ? 'var(--ink-3)' : 'var(--ink-2)',
        }}>
          {title}
          <span style={{
            marginInlineStart: '.4rem', fontSize: 'var(--fs-11)',
            fontWeight: 400, color: 'var(--ink-4)',
          }}>
            אופציונלי
          </span>
        </div>
        {hint && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
        {children && <div style={{ marginTop: '.4rem' }}>{children}</div>}
      </div>
    </div>
  );
}

function Step({ n, title, done, hint, children }: {
  n: number; title: string; done: boolean; hint?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '.65rem', padding: '.55rem 0' }}>
      <div style={{
        flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--fs-12)', fontWeight: 600,
        background: done ? 'var(--success)' : 'var(--surface-2)',
        color: done ? 'var(--on-accent)' : 'var(--ink-4)',
      }}>
        {done ? '✓' : n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-14)', fontWeight: done ? 500 : 600, color: done ? 'var(--ink-3)' : 'var(--ink-1)' }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
        {children && <div style={{ marginTop: '.5rem' }}>{children}</div>}
      </div>
    </div>
  );
}

function Track({ title, subtitle, done, total, tone, children }: {
  title: string; subtitle: string; done: number; total: number; tone: string; children: React.ReactNode;
}) {
  const complete = done >= total;
  return (
    /* עמודת רשות. "הושלם" הוא מידע ולכן הוא נושא צבע — אבל בקו העליון
       ובמונה, לא במסגרת ירוקה סביב הכול ובראש ירוק מלא. */
    <div style={{
      flex: '1 1 320px', minWidth: 0,
      borderTop: `1px solid ${complete ? 'var(--success)' : 'var(--hairline-1)'}`,
    }}>
      <div style={{ padding: '.65rem 0 .5rem', borderBottom: '1px solid var(--hairline-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: 'var(--fs-17)' }}>{tone}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)', color: 'var(--ink-1)' }}>{title}</div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>{subtitle}</div>
          </div>
          <span style={{
            fontSize: 'var(--fs-13)', fontWeight: 500,
            color: complete ? 'var(--success-text)' : 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {done}/{total}
          </span>
        </div>
      </div>
      <div style={{ padding: '.6rem 0 .8rem' }}>{children}</div>
    </div>
  );
}

export default function RepresentationExecutionCenter({ request, niIncluded, niCoversSpouse, onSaveExecution, onProduce, onStamp, onMarkSentToShaam, onMarkActive, onSendToSigner, userId, repApprovalOverride, linkedClient, onConfirmRegisteredSpouse }: Props) {
  const exec = request.execution || {};
  const it = exec.incomeTax || {};
  const ni = exec.nationalInsurance || {};
  const niSpouse = exec.nationalInsuranceSpouse || {};

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const status = request.status;
  const signers = getRequestSigners(request);
  const pendingSigners = signers.filter(s => effectiveSignStatus(request, s) === 'pending');
  const signed = ['awaiting_stamp', 'awaiting_authorities', 'active'].includes(status);
  const sentToShaam = ['awaiting_authorities', 'active'].includes(status);
  // ‼ "הופק" ו"הוחתם" הם **כל** הטפסים: בקשה עם מע"מ לשני בני הזוג מולידה
  // שני טפסים, ומסך שמראה "מוכן" אחרי אחד מהם היה שולח חצי בקשה.
  const poaDocs = signatureDocumentsOf(request);
  const formReady = (poaDocs.length > 0 && poaDocs.every(d => !!d.pdfDocId)) || signed;
  // ה-PDF הסופי (חתימות + חותמת המשרד) נוצר ונשמר
  const stamped = allDocumentsStamped(request) || sentToShaam;
  // בלי אסמכתא המייל ייצא בלי חלק הב"ל, והמבוטח יזדקק למייל שני. כשגם בן/בת
  // הזוג מיוצג — חסרה אסמכתא אחת מספיקה כדי לעצור, אחרת אחד מהם יקבל מייל חסר.
  const niRefMissing = niIncluded && (!ni.referenceNumber || (!!niCoversSpouse && !niSpouse.referenceNumber));

  // ── הזנות שע״ם: אחת לכל אדם ────────────────────────────────────────────────
  // ‼ בשע״ם נכנסים עם ת.ז. אחת ומזינים את כל המוסדות של אותו אדם בבת אחת
  // (הכרעת גיא 2026-08-28). שורה נפרדת לכל רשות תיארה עבודה שלא קיימת.
  // כשגם לבן/בת הזוג יש תיקים — הזנה שנייה, על ת.ז. שלו/ה.
  const scopePeople = peopleFromClient(linkedClient);
  const entryAt = (key: string) => exec.shaamEntries?.[key]?.enteredAt;

  // הטופס הבא שממתין לחתימה+חותמת שלי, וכמה נשארו. ‼ נגזר מהמסמכים ולא
  // מהסטטוס: הסטטוס מתקדם רק כשכולם נצרבו.
  const nextToStamp = poaDocs.find(d => !d.signedPdfStoredId) ?? null;
  const stampsLeft = poaDocs.filter(d => !d.signedPdfStoredId).length;

  /** סימון הזנה של אדם. `owner` מסופק כשההזנה הזאת נושאת גם את ההכרעה במ"ה. */
  async function markEntry(key: string, owner?: 'client' | 'spouse') {
    if (owner && linkedClient && onConfirmRegisteredSpouse) {
      setBusy(`entry-${key}`);
      try {
        await onConfirmRegisteredSpouse(linkedClient.id, owner);
      } catch (e) {
        setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
        setBusy(null);
        return;
      }
    }
    if (entryAt(key)) { setBusy(null); return; }   // נתון ישן — רק ההכרעה נשמרת
    await patch({
      ...exec,
      shaamEntries: { ...(exec.shaamEntries ?? {}), [key]: { enteredAt: new Date().toISOString() } },
    }, `entry-${key}`);
  }

  // המיילים של הבקשה — מוצגים בתוך השלב שהם שייכים אליו
  const { messages, reload: reloadEmails } = useEmailMessages(userId);
  const signatureEmails = messages.filter(m => m.requestId === request.id && m.kind === 'sign');
  const activeEmails = messages.filter(m => m.requestId === request.id && m.kind === 'active');

  // מייל "הייצוג אושר" — נשלח רק מכאן, ורק אחרי שראו אותו
  const [previewActive, setPreviewActive] = useState(false);
  // תצוגה מקדימה של מייל החתימה. השליחה עצמה נשארת בכפתור המשותף, שגם מסמן
  // שההוראות לב"ל יצאו — ולכן כאן צפייה בלבד.
  const [previewSignerId, setPreviewSignerId] = useState<string | null>(null);

  /** שולח לכל החותמים שטרם חתמו, ומתעד שההוראות לב"ל יצאו עם אותו מייל. */
  async function handleSendAll() {
    setBusy('send');
    setNote(null);
    // חותם בלי מייל אינו תקלה (110): בן/בת זוג בלי כתובת חותם יחד עם הנישום
    // באותו מכשיר, או מקבל קישור אחרי שהנישום יזין את המייל בשלב החתימה.
    const emailable = pendingSigners.filter(s => s.email.trim());
    const skipped = pendingSigners.filter(s => !s.email.trim());
    const failures: string[] = [];
    for (const s of emailable) {
      const err = await onSendToSigner(s);
      if (err) failures.push(`${s.name || s.email}: ${err}`);
    }
    if (failures.length > 0) {
      setNote({ kind: 'err', text: failures.join(' · ') });
      setBusy(null);
      return;
    }
    if (emailable.length === 0) {
      setNote({ kind: 'err', text: 'אין למי לשלוח - לאף חותם ממתין אין כתובת מייל.' });
      setBusy(null);
      return;
    }
    const now = new Date().toISOString();
    // כל מבוטח מקבל את האסמכתא שלו במייל האישי שלו, ולכן מסמנים "ההוראות יצאו"
    // בנפרד לכל מסלול — אחרת מסלול אחד ייראה שהושלם בזכות המייל של השני.
    const stampSent = (t: NiTracking): NiTracking =>
      t.referenceNumber && !t.instructionsSentAt
        ? { ...t, instructionsSentAt: now, instructionsSentWith: 'signature' as const }
        : t;
    await onSaveExecution({
      ...exec,
      signatureEmailSentAt: now,
      ...(niIncluded ? { nationalInsurance: stampSent(ni) } : {}),
      ...(niIncluded && niCoversSpouse ? { nationalInsuranceSpouse: stampSent(niSpouse) } : {}),
    });
    setNote({
      kind: 'ok',
      text: `נשלח ל-${emailable.map(s => s.email).join(', ')}` + (skipped.length > 0
        ? ` · ל${skipped.map(s => s.name || 'בן/בת הזוג').join(', ')} אין מייל - הלקוח יבחר בשלב החתימה אם לחתום יחד או להזין מייל`
        : ''),
    });
    setBusy(null);
    void reloadEmails();
  }

  /** תזכורת = אותו מייל שוב, לאותו חותם. בלי גרסה חלקית שתבלבל את הלקוח. */
  async function handleRemind(m: { toEmail: string }) {
    const signer = signers.find(s => s.email === m.toEmail) || signers[0];
    if (!signer) return 'לא נמצא חותם לשליחה';
    const err = await onSendToSigner(signer);
    if (!err) void reloadEmails();
    return err;
  }

  async function patch(next: RepresentationExecution, label: string) {
    setBusy(label);
    setNote(null);
    try {
      await onSaveExecution(next);
    } catch (e) {
      setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
    } finally {
      setBusy(null);
    }
  }

  // ── מי בן/בת הזוג הרשום/ה במס הכנסה ───────────────────────────────────────
  // ‼ ההכרעה נעשית כאן ורק כאן. עד הרגע הזה מה שיש בכרטיס הוא הכוונה שנרשמה
  // בפתיחת הייצוג, מסומנת «טרם אומת מול מ"ה»; פתיחת הבקשה בשע״ם היא הרגע
  // שבו רואים מי רשום באמת, ולכן הבחירה כאן היא גם הסימון של השלב.
  //
  // ‼ הצורך להכריע נגזר מהמצב העסקי — נשוי + ייצוג במ"ה + טרם הוכרע — ולא
  // מדגל שנכתב רק בפתיחת ייצוג חדשה. אחרת לקוח ותיק, שהבעלים שלו נולד
  // מברירת מחדל, היה מדלג על השאלה בדיוק כמו מי שכבר ענה עליה.
  const itRequested = request.authorities.includes('incomeTax');
  const regVerified = !!linkedClient?.registeredSpouseVerified;
  const regChoice = !!linkedClient && !!onConfirmRegisteredSpouse
    && itRequested && hasRegisteredSpouseChoice(linkedClient);

  // הכוונה שנרשמה בפתיחת הייצוג, אם נרשמה. null = אין רמז, ואז אף כפתור
  // אינו מודגש — הדגשה בלי כיסוי הייתה נראית כהמלצה שמישהו נתן.
  const regIntent: 'client' | 'spouse' | null =
    linkedClient && (linkedClient.taxFiles ?? []).some(f => f.authority === 'income_tax')
      ? (registeredFileInfo(linkedClient)?.owner === 'spouse' ? 'spouse' : 'client')
      : null;

  // ‼ תיק מס הכנסה נכנס בהזנה של בן/בת הזוג הרשום/ה — מספרו הוא ת.ז. שלו/ה,
  // ושם הוא מופיע בשע״ם. כל עוד לא הוכרע, הוא נספר אצל הנישום, וזו בדיוק
  // השאלה שנשאלת בשלב הזה.
  const submissions = shaamSubmissions(
    requestScope(request, linkedClient), scopePeople,
    regVerified ? (registeredFileInfo(linkedClient!)?.owner === 'spouse' ? 'spouse' : 'client') : undefined,
  );
  // ההזנה הראשונה היא שלב 1; השאר נספרים אחריה.
  const firstEntry = submissions[0] ?? null;
  const extraEntries = submissions.slice(1);

  // ‼ שאלת "מי הרשום" יושבת בהזנה שנושאת את תיק מ"ה — שם היא נענית בפועל.
  const regRowKey = submissions.find(x => x.carriesIncomeTax)?.key ?? firstEntry?.key ?? null;

  // ‼ המשפט נבנה אך ורק ממה שאומת. לפני האימות אין ניסוח בכלל — המערכת לא
  // מצהירה מי הרשום על סמך ברירת מחדל.
  const regSentence = linkedClient && regVerified
    ? registeredSpouseSentence(linkedClient, registeredFileInfo(linkedClient)?.owner === 'spouse' ? 'spouse' : 'client')
    : '';

  /** סימון "הוזן בשע״ם". `owner` מסופק כשיש שני בני זוג — ואז הוא גם ההכרעה. */
  async function markEnteredInShaam(owner?: 'client' | 'spouse') {
    if (owner && linkedClient && onConfirmRegisteredSpouse) {
      setBusy('it');
      try {
        await onConfirmRegisteredSpouse(linkedClient.id, owner);
      } catch (e) {
        setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
        setBusy(null);
        return;
      }
    }
    // שלב שכבר סומן (נתון ישן שנשאר לא-מאומת) — רק ההכרעה נשמרת, בלי לדרוס תאריך
    if (it.enteredAt) { setBusy(null); return; }
    await patch({ ...exec, incomeTax: { ...it, enteredAt: new Date().toISOString() } }, 'it');
  }

  /** שמות שני בני הזוג לכפתורי ההכרעה — השם עצמו הוא הכפתור. */
  const regNames: { owner: 'client' | 'spouse'; label: string }[] = linkedClient
    ? [
        { owner: 'client', label: clientDisplayName(linkedClient) },
        { owner: 'spouse', label: spouseDisplayName(linkedClient) },
      ]
    : [];

  // ‼ הנתיב המזורז נטען כאן ואינו מגיע כ-prop — ראה useRepApprovalStep.
  // מרוענן כשהסטטוס משתנה, כי המעבר ל-awaiting_authorities הוא שיוצר אותו.
  const { step: loadedRepApproval, reload: reloadRepApproval } = useRepApprovalStep(request.linkedClientId);
  const repApproval = repApprovalOverride !== undefined ? repApprovalOverride : loadedRepApproval;
  const declared = isRepApprovalDeclared(repApproval);
  useEffect(() => { void reloadRepApproval(); }, [status, reloadRepApproval]);

  // ── ספירת שלבים שהושלמו, להצגה בכותרת כל מסלול ──
  // ‼ הנתיב המזורז אינו כאן: הוא אופציונלי, וספירתו הייתה מציגה מסלול שהושלם
  // כאילו נשאר בו צעד.
  const itSteps = [!!it.enteredAt, ...extraEntries.map(s => !!entryAt(s.key)), formReady, !!exec.signatureEmailSentAt, signed, stamped, sentToShaam, status === 'active'];

  // שמות המבוטחים לכותרות המסלולים — כשיש שניים, "ביטוח לאומי" לבדו לא מספיק
  const nameOf = (role: 'client' | 'spouse') =>
    signers.find(s => s.role === role)?.name?.trim();
  const clientNiTitle = niCoversSpouse ? `ב״ל - ${nameOf('client') || 'הנישום'}` : 'ביטוח לאומי';
  // מי מבין השניים תקוע בלי אסמכתא — כדי שהחסימה תגיד לאן ללכת, ולא רק שנחסם
  const missingRefFor = !niCoversSpouse ? '' : [
    !ni.referenceNumber && (nameOf('client') || 'הנישום'),
    !niSpouse.referenceNumber && (nameOf('spouse') || 'בן/בת הזוג'),
  ].filter(Boolean).join(' ו-');

  return (
    <div id="rep-execution" className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <div className="card-title">ביצוע הייצוג מול הרשויות</div>
      </div>
      <div className="card-body">
        <p style={{ marginTop: 0, fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
          העתיקו את הפרטים מהבלוק שמעל, הזינו אותם באתר של כל רשות, וסמנו כאן מה בוצע.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* ─────────── מס הכנסה ─────────── */}
          <Track
            title="מס הכנסה"
            subtitle="שע״ם · ייפוי כוח בחתימה דיגיטלית"
            done={itSteps.filter(Boolean).length}
            total={itSteps.length}
            tone="🏛"
          >
            {/* ‼ הזנה אחת לכל אדם, לא אחת לכל רשות: בשע״ם נכנסים עם ת.ז. אחת
                ומזינים את כל המוסדות של אותו אדם בבת אחת. השלב מפרט מה נכנס
                בהזנה הזאת, כדי שיהיה ברור מה כוסה בה.
                ‼ שאלת "מי הרשום במ״ה" יושבת בהזנה שנושאת את תיק מס הכנסה —
                שם היא נענית בפועל — והסימון של אותה הזנה **הוא** ההכרעה. */}
            {submissions.map((sub, i) => {
              const first = i === 0;
              const at = first ? it.enteredAt : entryAt(sub.key);
              const asksHere = regChoice && !regVerified && sub.key === regRowKey;
              const busyKey = first ? 'it' : `entry-${sub.key}`;
              const mark = (owner?: 'client' | 'spouse') => first
                ? markEnteredInShaam(owner)
                : markEntry(sub.key, owner);
              const what = sub.authoritiesLabel;
              return (
                <Step
                  key={sub.key}
                  n={i + 1}
                  title={sub.title
                    ? `הפרטים הוזנו בשע״ם · ${sub.title}`
                    : 'הפרטים הוזנו בשע״ם'}
                  done={!!at}
                  hint={at
                    ? (asksHere ? undefined
                        : sub.carriesIncomeTax && regVerified && regSentence
                          ? `${what} · ${regSentence} · סומן ב-${fmt(at)}`
                          : `${what} · סומן ב-${fmt(at)}`)
                    : asksHere
                      ? `${what}. מי מבין השניים רשום שם במס הכנסה?`
                      : `${what} · הזנה אחת בשע״ם, על ת.ז. של ${sub.personName}`}
                >
                  {asksHere ? (
                    <>
                      {at && (
                        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: '.4rem' }}>
                          סומן ב-{fmt(at)}, אבל טרם נרשם מי הרשום במ״ה. מי מבין השניים?
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                        {regNames.map(r => (
                          <button
                            key={r.owner}
                            className={`btn btn-sm ${r.owner === regIntent ? 'btn-green' : 'btn-secondary'}`}
                            disabled={busy === busyKey}
                            title={regIntent === null
                              ? 'טרם נקבע מי הרשום - הבחירה כאן היא שתקבע'
                              : r.owner === regIntent
                                ? 'זו הכוונה שנרשמה בפתיחת הייצוג'
                                : 'שונה מהכוונה שנרשמה - יעדכן את התיק'}
                            onClick={() => void mark(r.owner)}
                          >
                            {busy === busyKey ? 'שומר…' : r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : !at && (
                    <button className="btn btn-secondary btn-sm" disabled={busy === busyKey}
                      onClick={() => void mark()}>
                      {busy === busyKey ? 'שומר…' : 'סמן כהוזן'}
                    </button>
                  )}
                </Step>
              );
            })}

            <Step n={2 + extraEntries.length} title="טופס ייפוי הכוח הועלה ואזורי החתימה סומנו" done={formReady}
              hint={formReady
                ? (poaDocs.length > 1
                    ? `${poaDocs.length} טפסים - מוכנים לשליחה`
                    : `${poaDocs[0]?.pdfFileName || 'הטופס'} - מוכן לשליחה`)
                : extraEntries.length
                  ? 'טופס לכל אדם - כל אחד עם התיקים שלו'
                  : 'העלו את קובץ ייפוי הכוח וסמנו איפה כל אחד חותם'}>
              <button className="btn btn-secondary btn-sm" onClick={onProduce}>
                {formReady ? '↺ החלף טופס או ערוך אזורים' : 'העלה טופס וסמן אזורי חתימה'}
              </button>
            </Step>

            {/* ‼ אין כאן כפתור. השליחה שייכת לשתי הרשויות גם יחד ולכן היא יושבת
                בפס המשותף שמתחת לשתי המשבצות — כפתור אחד, במקום אחד. */}
            <Step n={3 + extraEntries.length} title="נשלח לחתימת הלקוח" done={!!exec.signatureEmailSentAt}
              hint={exec.signatureEmailSentAt ? undefined
                : formReady ? 'השליחה בפס המשותף שמתחת - מייל אחד לשתי הרשויות'
                  : 'אפשרי אחרי הפקת הטופס'} />

            <Step n={4 + extraEntries.length} title="כל החותמים חתמו" done={signed}>
              {signers.length > 0 && !signed && (
                <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.7 }}>
                  {signers.map(s => (
                    <div key={s.id}>
                      {effectiveSignStatus(request, s) === 'signed' ? '✓' : '⏳'} {s.name || s.email}
                    </div>
                  ))}
                </div>
              )}
            </Step>

            {/* החתימה והחותמת שלי — הטופס אינו שלם בלעדיהן, ואסור להגיש לשע״ם לפני.
                ‼ כשיש כמה טפסים, כל אחד נחתם ונצרב בנפרד: השלב אומר על מה חותמים
                עכשיו וכמה נשארו, אחרת נראה כאילו לחיצה אחת לא עשתה כלום. */}
            <Step n={5 + extraEntries.length} title="חתמתי והוספתי חותמת" done={stamped}
              hint={stamped
                ? (poaDocs.length > 1 ? `${poaDocs.length} טפסים חתומים - מוכנים להגשה` : 'הטופס החתום מוכן להגשה')
                : signed
                  ? (nextToStamp && poaDocs.length > 1
                      ? `נשארו ${stampsLeft} מתוך ${poaDocs.length} - הבא: ${nextToStamp.title}`
                      : 'הלקוח חתם - נשארה החתימה והחותמת שלכם')
                  : 'אפשרי אחרי שכל החותמים חתמו'}>
              {signed && !stamped && (
                <button className="btn btn-green btn-sm" onClick={onStamp}>
                  {poaDocs.length > 1 && nextToStamp
                    ? `חתום + הוסף חותמת · ${nextToStamp.title}`
                    : 'חתום + הוסף חותמת'}
                </button>
              )}
              {/* מה כבר נצרב — כדי שאחרי כל טופס יהיה חיווי שהוא נשמר */}
              {poaDocs.length > 1 && poaDocs.some(d => d.signedPdfStoredId) && !stamped && (
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem' }}>
                  {poaDocs.filter(d => d.signedPdfStoredId).map(d => `✓ ${d.title}`).join(' · ')}
                </div>
              )}
            </Step>

            <Step n={6 + extraEntries.length} title="נשלח לשע״ם" done={sentToShaam}
              hint={stamped && !sentToShaam ? 'הגישו את הטופס החתום בשע״ם, ואז סמנו' : undefined}>
              {stamped && !sentToShaam && (
                <button className="btn btn-green btn-sm" onClick={onMarkSentToShaam}>נשלח לשע"ם</button>
              )}
            </Step>

            {/* ── נתיב מזורז: הלקוח מאשר אותנו באזור האישי ──────────────────
                ‼ נפתח עם ההגשה לשע"ם ולא לפני — קודם לכן אין לו שם מה לאשר.
                ‼ שני שלבי אימות: הצהרת הלקוח מזיזה את הכדור אלינו ואינה
                סוגרת (אין לנו גישה לאזור האישי שלו), והסגירה קורית בכפתור
                של שלב 7 — אותו כפתור, לא כפתור שני. */}
            {repApproval && (
              <SideStep
                title="זירוז אישור הייצוג באזור האישי"
                done={isRepApprovalClosed(repApproval)}
                tone={declared ? 'attention' : 'wait'}
                hint={
                  isRepApprovalClosed(repApproval)
                    ? undefined
                    : declared
                      ? 'הלקוח דיווח שאישר - ממתין לאימות בשע״ם'
                      : 'ממתין ללקוח - הבקשה מופיעה בדף האישי שלו'
                }>
                {declared && (
                  /* ‼ גודל מוקטן במפורש: ברירת המחדל של ui-lines גדולה מהשורה
                     שהיא שייכת לה, וטקסט העזר היה מושך יותר תשומת לב מהכותרת. */
                  <InfoLines style={{ fontSize: 'var(--fs-12)' }} items={[
                    'בדקו בשע״ם אם הייצוג נקלט',
                    'נקלט ⇒ סמנו "מיוצג פעיל" בשלב הבא, וזה סוגר גם את השורה הזו',
                  ]} />
                )}
              </SideStep>
            )}

            <Step n={7 + extraEntries.length} title="הייצוג פעיל" done={status === 'active'}
              hint={status === 'awaiting_authorities' ? 'כשהייצוג יאושר בשע״ם - סמנו כאן' : undefined}>
              {status === 'awaiting_authorities' && (
                <button className="btn btn-green btn-sm" onClick={onMarkActive}>סמן כמיוצג פעיל</button>
              )}

              {/* ‼ הסימון לבדו לא שולח דבר. עד היום יצא כאן מייל אוטומטית והרו"ח
                  לא ידע שיצא — עכשיו זו פעולה נפרדת, אחרי שרואים את המייל. */}
              {status === 'active' && (
                activeEmails.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    {activeEmails.map(m => (
                      <EmailStatusRow key={m.id} message={m} note="עדכון ללקוח: הייצוג אושר" onChanged={reloadEmails} />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                    <InfoLines style={{ marginBottom: '.4rem' }} items={[
                      'ℹ הלקוח לא עודכן במייל',
                      'המערכת לא שולחת מעצמה - אפשר לשלוח עדכון אחרי שרואים בדיוק מה ייצא',
                    ]} />
                    <button className="btn btn-secondary btn-sm" onClick={() => setPreviewActive(true)}>
                      עדכון ללקוח - תצוגה מקדימה
                    </button>
                  </div>
                )
              )}
            </Step>
          </Track>

          {/* ─────────── ביטוח לאומי ─────────── */}
          {/* מסלול לכל מבוטח: בב"ל לכל אחד תיק ואסמכתא נפרדים, ואיחוד שלהם
              לעמודה אחת היה מסתיר איזה מהשניים עדיין לא אושר. */}
          {niIncluded ? (
            <>
              <NiTrack
                title={clientNiTitle}
                ni={ni}
                busy={busy}
                busyPrefix="ni"
                hasSignatureEmails={signatureEmails.length > 0}
                onPatch={(p, label) => patch({ ...exec, nationalInsurance: { ...ni, ...p } }, label)}
              />
              {niCoversSpouse && (
                <NiTrack
                  title={`ב״ל - ${nameOf('spouse') || 'בן/בת הזוג'}`}
                  ni={niSpouse}
                  busy={busy}
                  busyPrefix="nis"
                  hasSignatureEmails={signatureEmails.length > 0}
                  onPatch={(p, label) => patch({ ...exec, nationalInsuranceSpouse: { ...niSpouse, ...p } }, label)}
                />
              )}
            </>
          ) : (
            <div style={{ flex: '1 1 320px', minWidth: 0, border: '1px dashed var(--hairline-1)', borderRadius: 'var(--radius)', padding: '1rem', color: 'var(--ink-3)', fontSize: 'var(--fs-13)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              לא התבקש ייצוג בביטוח לאומי עבור לקוח זה.
            </div>
          )}
        </div>

        {/* ─────────── השליחה ללקוח — משותפת לשתי הרשויות ─────────── */}
        {/* מייל אחד נושא את שתי הפעולות, ולכן הוא לא שייך לאף אחת מהעמודות.
            פס רוחב מלא ביניהן, ממורכז, כדי שיהיה ברור שהוא של שתיהן. */}
        <div style={{
          marginTop: '1rem',
          /* קו עליון אחד נושא את המצב: נשלח · מוכן לשליחה · עוד לא מוכן.
             הקו המקווקו הוא הרמז שהמייל עדיין לא ניתן לשליחה. */
          borderTop: `1px ${exec.signatureEmailSentAt ? 'solid var(--success)' : formReady ? 'solid var(--accent)' : 'dashed var(--hairline-1)'}`,
          padding: '.9rem 0',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-17)' }}>{exec.signatureEmailSentAt ? '✓' : '✉'}</span>
            <span style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>
              {exec.signatureEmailSentAt ? 'המייל נשלח ללקוח' : 'שליחה ללקוח'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>
            {niIncluded
              ? 'מייל אחד לשתי הרשויות - קישור אישי לחתימה על ייפוי הכוח, ומתחתיו האסמכתא והוראות האישור בביטוח הלאומי.'
              : 'מייל עם קישור אישי לחתימה על ייפוי הכוח, לכל חותם.'}
          </div>

          {!formReady && (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: '.5rem' }}>
              יתאפשר אחרי שהטופס יופק ואזורי החתימה יסומנו (שלב 2 במס הכנסה).
            </div>
          )}

          {formReady && !exec.signatureEmailSentAt && (
            <div style={{ marginTop: '.7rem' }}>
              <button className="btn btn-green" disabled={busy === 'send' || niRefMissing || pendingSigners.length === 0}
                onClick={handleSendAll}>
                {busy === 'send' ? 'שולח…' : `שלח ללקוח${pendingSigners.length > 1 ? ` (${pendingSigners.length} חותמים)` : ''}`}
              </button>
              {pendingSigners.length > 0 && !niRefMissing && (
                <>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem' }} dir="ltr">
                    {pendingSigners.map(s => s.email).join(' · ')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewSignerId(pendingSigners[0].id)}
                    style={{
                      background: 'none', border: 'none', padding: 0, marginTop: '.3rem', font: 'inherit',
                      fontSize: 'var(--fs-13)', color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer',
                    }}
                  >
                    לראות מה ייצא ללקוח
                  </button>
                </>
              )}
              {niRefMissing && (
                <div style={{ margin: '.55rem auto 0', maxWidth: 460, padding: '.45rem .6rem', background: 'transparent', borderRadius: 'var(--radius)', fontSize: 'var(--fs-13)', color: 'var(--ink-1)', lineHeight: 1.6 }}>
                  חסום עד להזנת מספר האסמכתא{missingRefFor ? ` של ${missingRefFor}` : ''} במשבצת הביטוח הלאומי -
                  אחרת {niCoversSpouse ? 'מי שחסרה לו אסמכתא יקבל מייל בלי חלק הב״ל' : 'הלקוח יקבל מייל בלי חלק הב״ל'}.
                </div>
              )}
            </div>
          )}

          {/* המייל שיצא — מוצג פעם אחת בלבד, כאן */}
          {signatureEmails.length > 0 && (
            <div style={{ marginTop: '.7rem', display: 'flex', flexDirection: 'column', gap: '.4rem', textAlign: 'start' }}>
              {signatureEmails.map(m => (
                <EmailStatusRow key={m.id} message={m} onRemind={() => handleRemind(m)} onChanged={reloadEmails} />
              ))}
            </div>
          )}
        </div>

        {note && (
          <div style={{
            marginTop: '.9rem', padding: '.55rem .8rem', borderRadius: 'var(--radius)', fontSize: 'var(--fs-13)',
            background: note.kind === 'ok' ? 'var(--green-light, #eaf6f1)' : 'var(--red-light)',
            color: note.kind === 'ok' ? 'var(--success-text)' : 'var(--danger)',
          }}>
            {note.kind === 'ok' ? '✓ ' : '⚠ '}{note.text}
          </div>
        )}
      </div>

      {previewActive && (
        <EmailPreviewDialog
          heading="עדכון ללקוח - הייצוג אושר"
          body={{ requestId: request.id, stage: 'active' }}
          onSent={reloadEmails}
          onClose={() => setPreviewActive(false)}
        />
      )}

      {previewSignerId && (
        <EmailPreviewDialog
          readOnly
          heading="תצוגה מקדימה - מייל החתימה"
          body={{ requestId: request.id, stage: 'sign', signerId: previewSignerId }}
          onSent={reloadEmails}
          onClose={() => setPreviewSignerId(null)}
        />
      )}
    </div>
  );
}

/**
 * מסלול הביטוח הלאומי של מבוטח אחד. בב"ל לכל אדם תיק נפרד, ולכן זוג שמיוצג
 * בב"ל מקבל שני מסלולים כאלה — לכל אחד אסמכתא, מועד תפוגה ואישור משלו.
 */
function NiTrack({ title, ni, busy, busyPrefix, hasSignatureEmails, onPatch }: {
  title: string;
  ni: NiTracking;
  busy: string | null;
  /** מבדיל בין מצבי ה"שומר…" של שני המסלולים, שלא יידלקו יחד */
  busyPrefix: string;
  hasSignatureEmails: boolean;
  onPatch: (p: Partial<NiTracking>, label: string) => void;
}) {
  const [refNumber, setRefNumber] = useState(ni.referenceNumber || '');
  const [deadline, setDeadline] = useState(ni.deadline || '');

  const steps = [!!ni.enteredAt, !!ni.referenceNumber, !!ni.instructionsSentAt, !!ni.confirmedAt];
  const sentWithSignature = ni.instructionsSentWith === 'signature';
  const k = (suffix: string) => `${busyPrefix}-${suffix}`;

  const dLeft = daysUntil(ni.deadline);
  const deadlineTone = dLeft === null ? null
    : dLeft < 0 ? { bg: 'var(--red-light)', fg: 'var(--danger)', text: `המועד עבר לפני ${Math.abs(dLeft)} ימים - יש להזין מחדש בב"ל` }
    : dLeft <= 14 ? { bg: 'var(--orange-light)', fg: 'var(--ink-1)', text: `⏳ נותרו ${dLeft} ימים לאישור` }
    : { bg: 'var(--surface-2)', fg: 'var(--ink-3)', text: `נותרו ${dLeft} ימים לאישור` };

  return (
    <Track
      title={title}
      subtitle="הזנה ידנית · המבוטח מאשר את האסמכתא"
      done={steps.filter(Boolean).length}
      total={steps.length}
      tone="🛡"
    >
      <Step n={1} title="ייפוי הכוח הוזן באתר ב״ל" done={!!ni.enteredAt}
        hint={ni.enteredAt ? `סומן ב-${fmt(ni.enteredAt)}` : 'מסך "הוספת ייפוי כח מבוטח" - ארבעת השדות מהבלוק שמעל'}>
        {!ni.enteredAt && (
          <button className="btn btn-secondary btn-sm" disabled={busy === k('entered')}
            onClick={() => onPatch({ enteredAt: new Date().toISOString() }, k('entered'))}>
            {busy === k('entered') ? 'שומר…' : 'סמן כהוזן'}
          </button>
        )}
      </Step>

      <Step n={2} title="מספר אסמכתא ומועד אחרון לאישור" done={!!ni.referenceNumber}
        hint="ב״ל מציג אותם במסך שאחרי ההזנה">
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מספר אסמכתא</div>
            <input value={refNumber} dir="ltr" inputMode="numeric" placeholder="73882698"
              onChange={e => setRefNumber(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', textAlign: 'left' }} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מועד אחרון</div>
            <input type="date" value={deadline} min={todayISO()}
              onChange={e => setDeadline(e.target.value)} style={{ width: '100%' }} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy === k('ref') || !refNumber.trim()}
            onClick={() => onPatch({ referenceNumber: refNumber.trim(), deadline: deadline || undefined }, k('ref'))}>
            {busy === k('ref') ? 'שומר…' : 'שמירה'}
          </button>
        </div>
        {deadlineTone && (
          <div style={{ marginTop: '.45rem', padding: '.35rem .6rem', borderRadius: 'var(--radius)', background: deadlineTone.bg, color: deadlineTone.fg, fontSize: 'var(--fs-13)' }}>
            {deadlineTone.text} {ni.deadline && `(${fmt(ni.deadline)})`}
          </div>
        )}
      </Step>

      <Step n={3} title="ההוראות הגיעו למבוטח" done={sentWithSignature || !!ni.instructionsSentAt}
        hint={
          sentWithSignature ? 'נכללו במייל בקשת החתימה - מייל אחד לשתי הפעולות'
          : ni.instructionsSentAt ? `נשלחו בנפרד ב-${fmt(ni.instructionsSentAt)}`
          : `יישלחו יחד עם בקשת החתימה: אסמכתא, מועד אחרון, ואישור באתר ב״ל או בטלפון ${NI_APPROVAL_PHONE}`
        }>
        {/* ‼ אין כאן כפתור שליחה. ההוראות תמיד יוצאות עם מייל החתימה —
            שליחה נפרדת גורמת למבוטח לקבל שני מיילים על אותו תהליך. */}
        {!hasSignatureEmails && (
          <div style={{
            fontSize: 'var(--fs-13)', lineHeight: 1.6, padding: '.45rem .6rem', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', color: 'var(--ink-3)',
          }}>
            {ni.referenceNumber
              ? 'ℹ האסמכתא נשמרה. היא תיכלל במייל שנשלח מהפס המשותף שמתחת.'
              : `ℹ ההוראות נשלחות יחד עם בקשת החתימה: אסמכתא, מועד אחרון, ואישור באתר ב״ל או בטלפון ${NI_APPROVAL_PHONE}.`}
          </div>
        )}
      </Step>

      <Step n={4} title="אושר - הייצוג בב״ל פעיל" done={!!ni.confirmedAt}
        hint={ni.confirmedAt ? `אושר ב-${fmt(ni.confirmedAt)}` : 'בדקו באתר ב״ל שהאישור נקלט'}>
        {!ni.confirmedAt && (
          <button className="btn btn-secondary btn-sm" disabled={busy === k('conf')}
            onClick={() => onPatch({ confirmedAt: new Date().toISOString() }, k('conf'))}>
            {busy === k('conf') ? 'שומר…' : 'סמן כאושר'}
          </button>
        )}
      </Step>
    </Track>
  );
}
