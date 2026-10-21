// ─── המגש: מה עוד לא הגיע ללקוח, ומה קורה עם המיילים אליו ─────────────────────
// ‼ מחליף את התיבה «עוד לא הגיע ל…» ושומר את שני הצעדים שלה, כל אחד בפועל שלו:
//   1. «פרסם בדף» — הבקשה מופיעה בדף האישי. לא נשלח מייל.
//   2. «שלח מייל» — מייל מרוכז אחד, רק מה שחדש (השרת בוחר, לא הדפדפן).
// ונוספו המצבים של 214, כל אחד בשורה משלו ורק כשיש בו משהו:
//   בתור לשליחה לבד (מאסף תוספות) · לא ידוע אם יצא · בתנועה · תזכורת.
// וסבב 4: «חסר סוג העוסק» — בקשות שמחכות לסוג העוסק, וכפתור למקום שבו קובעים אותו.
// ‼ מסלול בעצירה — בשורת המסלול בלבד (DESIGN-FLOWS-R3 §5), לא כשורה כאן. כאן הוא נאמר
// רק כשהוא עוצר מייל שהיה יוצא לבד — בשורה של המייל, עם קישור לחידוש.
// ‼ 240 (13.10) · המגש הוא «הדף של X» — המקום האחד לפעולות של הדף: צפייה, העתקת הקישור
// הקבוע, ושליחת מייל. מופיע תמיד, וכשיש בדף מה שלא נשלח — «שלח מייל…» מודגש בעדינות ושורת
// «N בקשות חדשות מאז השליחה האחרונה» מתחת. ‼ העתקת קישור וצפייה אינן הודעה ללקוח: לא מסמנות
// «נמסר», לא מאפסות את המונה ולא מפעילות תזכורות (mint_portal_token רק מחזיר את הקישור הקבוע).
// ‼ 21.10.2026 · ההדמיה המאושרת docs/proposals/2026-10-21-office-request-and-tax-file.html: «הדף של X» בשורה אחת —
// נקודה · השם · מצב שקט («יש בו חדש» / «נשלח DD.MM») · «שלח מייל…» · ⋯ (צפייה בדף · פתח כמו X ↗ · העתקת קישור).
// המשפט «בקשה חדשה מאז השליחה האחרונה…» ירד — «יש בו חדש» אומר אותו. שורת המייל נשארת רק כשיש בה משהו
// שהמילה לא אומרת: תור לשליחה לבד, עצירה, אין כתובת, «לא ידוע» שחוסם, או ההוראות לביטוח לאומי.
// ‼ «לא ידוע אם יצא» אינו «נכשל»: הבקשות לא סומנו כנמסרו, ושליחה חוזרת היא
// אותו מייל בדיוק (אותו מפתח אצל ספק הדואר) — לא מייל שני. שחרור (המייל הבא
// יכלול אותן שוב) — רק מאחורי אישור שמסביר את הכפילות (unknownRowModel / unknownConfirm).
// ‼ מייל «חדש» שלא ידוע אם יצא חוסם כל מייל «חדש» נוסף (214) — אז השורה שלו קודמת,
// ובשורת «בדף, בלי מייל» אין «שלח מייל…» שהיה נגמר בסירוב.

import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { resolveNotice, retryKindHold, retryKindHoldErrorText, retryUnknownNotice, serverErrorText, type KindHold } from '../../features/flows/api';
import {
  isDefiniteFailure, noticeSuccessText, trayRetryText, unknownConfirm, unknownRowModel, RELEASED_NEW_ADDRESS_TEXT, RELEASED_TEXT,
  type UnknownAction, type UnknownConfirm, type UnknownRowModel,
} from '../../features/flows/noticeText';
import {
  kindHoldRetryText, kindHoldRow, newSinceTitle, trayQueueLine, unknownBlocksNewText,
  pausedQueueText, NI_ONLY_WHY, QUEUE_CANCELLED_TEXT, SEND_MAIL_LABEL, SEND_NOW_LABEL,
} from './trayQueue';
import type { ReadyToSend } from '../../hooks/useReadyToSend';
import type { ReadyUnknownNotice } from '../../hooks/readyToSendLoader';
import { STEP_TYPE_LABELS, type OnboardingStep, type OnboardingStepType } from '../../types/onboarding';
import { formatDate } from '../../utils/dateFormat';
import { pageChangesText } from '../../utils/requestRemoval';
import './clientFlows.css';

interface Props {
  clientId: string;
  firstName: string;
  ready: ReadyToSend;
  /** טיוטות ושינויים שעוד לא בדף. ‼ בלי שלבים שנעולים ב«הכול באישורך» — הם בפס המסלול. */
  unpublished: OnboardingStep[];
  unpublishedAllNew: boolean;
  /** לפני אישור ההצעה השרת מחזיק הכול (135) — אין כפתור פרסום שמוביל לשגיאה. */
  awaitingQuoteApproval: boolean;
  titleOf: (s: OnboardingStep) => string;
  discarding: boolean;
  onPublish: () => void;
  onPreviewPage: () => void;
  onDiscard: () => void;
  /** פותח את «שליחת מייל» במוקד: 'owner' או 'ni:client' / 'ni:spouse'. */
  onSend: (focus: string) => void;
  /** תזכורת על מה שכבר נמסר ועדיין פתוח. */
  onRemind: () => void;
  /** אחרי פעולה כאן — המגש נטען מחדש. */
  onChanged: () => void;
  /** ריצות מסלול בעצירה — על הבקשות שלהן לא יוצא מייל «לבד» (214). ‼ אין להן שורה כאן. */
  paused?: { runId: string; name: string; stepIds: string[] }[];
  /** «לפרטי המסלול ולחידוש» — פותח את שורת המסלול מתחת לבקשות. */
  onOpenFlow?: (runId: string) => void;
  /**
   * ההחזקה של הקליטה הפתוחה (engagement.kindHold, 217): בקשות שמחכות לסוג העוסק.
   * ‼ רק של הקליטה הנוכחית — לא של התקשרות שהסתיימה.
   */
  kindHold?: KindHold | null;
  /** «לקביעת סוג העוסק» — פותח את תיק המס ב«פרטי הנישום», על השדה «סוג העוסק». */
  onOpenKindField?: () => void;
  /** 240 · «צפייה בדף» — הדף כפי שהלקוח רואה אותו (לא נשלח כלום). */
  onViewPage: () => void;
  /** 240 · «העתקת קישור» — הקישור הקבוע לדף. ‼ לא שליחה. */
  onCopyLink: () => void;
  linkBusy?: boolean;
  linkCopied?: boolean;
  /** 240 · «שלח מייל…» כשאין חדש — מייל עם הקישור ומצב הדף (בלי לסמן דבר כחדש). */
  onSendUpdate: () => void;
  /** 21.10.2026 · «פתח כמו X ↗» — הדף האמיתי בחלון חדש (mint_portal_token). ‼ לא שליחה. */
  onOpenAsClient?: () => void;
}

/** כמה ימים אחרי מייל או תזכורת מציעים תזכורת ידנית במגש. */
const REMIND_AFTER_DAYS = 3;

/**
 * תשובות של «שלח שוב (אותו מייל)» שאחריהן המייל המקורי עדיין «לא ידוע» (214: reclaim לא נוגע
 * בהודעה) — או שהשרת הכריע בעצמו (never_sent). אף אחת מהן אינה «נכשל».
 */
const STAYS_UNKNOWN = new Set(['unknown_outcome', 'retry_expired', 'recipient_changed', 'in_flight', 'never_sent']);

export default function NoticeTray({
  clientId, firstName, ready, unpublished, unpublishedAllNew, awaitingQuoteApproval, titleOf,
  discarding, onPublish, onPreviewPage, onDiscard, onSend, onRemind, onChanged, paused = [], onOpenFlow,
  kindHold, onOpenKindField, onViewPage, onCopyLink, linkBusy, linkCopied, onSendUpdate, onOpenAsClient,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // warn — ענבר: לא ידוע מה קרה (אין תשובה, המייל עדיין «לא ידוע»), לא «נכשל».
  const [msg, setMsg] = useState<{ text: string; err: boolean; warn?: boolean } | null>(null);
  // ‼ החלון נבנה לפי הזמן ברגע הלחיצה (לא לפי הציור): חלון שנסגר בינתיים — האישור של אחרי החלון.
  const [ask, setAsk] = useState<{ m: UnknownRowModel; action: UnknownAction; c: UnknownConfirm } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());
  // הודעת אישור נשארת כמה שניות ונעלמת — היא לא מצב, רק משוב על הלחיצה.
  useEffect(() => {
    if (!msg || msg.err) return;
    const t = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(t);
  }, [msg]);

  const own = ready.owner;
  const nNew = own.items.length;
  const persons = ready.persons;
  const queued = own.queued ?? null;
  const unknown = own.unknown ?? [];
  const inFlight = !!own.inFlight;
  const remindN = own.reminder?.items?.length ?? 0;
  const nDrafts = unpublished.length;
  // ‼ 15.10: הסרה שממתינה לפרסום נאמרת כהסרה — לא כ«עוד לא בדף» (הלקוח עדיין רואה אותה).
  const changes = pageChangesText(unpublished.map(s => ({ title: titleOf(s), removal: !!s.pendingCancel })), unpublishedAllNew, firstName);

  const hasSend = nNew > 0 || persons.length > 0;
  // ‼ מייל «לבד» כולל רק פריטים של שלב «לבד» מריצה שאינה בעצירה — השורה מבטיחה
  // שליחה לבד רק להם, ולא מציגה שעה שכבר עברה (trayQueue.ts).
  const pausedSteps = new Set(paused.flatMap(p => p.stepIds));
  // ‼ השרת מדלג על התור גם בלי כתובת בכרטיס, וגם כשמייל קודם מאותו סוג «לא ידוע» —
  // אז השורה אומרת למה, ולא «יישלח לבד».
  const q = trayQueueLine({
    items: own.items, queued, pausedStepIds: pausedSteps, now: Date.now(),
    hasEmail: !!own.email?.trim(),
    unknownPending: unknown.some(u => u.kind === (queued?.kind || 'new')),
  });
  const queuedLive = !!queued && q.live;
  // ‼ המסלול בעצירה עוצר מייל שהיה יוצא לבד — הקישור לחידוש בשורה של המייל.
  const heldBy = q.paused
    ? paused.find(p => own.items.some(i => i.delivery === 'auto' && p.stepIds.includes(i.stepId)))
    : undefined;
  // ‼ מייל קודם מאותו סוג «לא ידוע» ⇒ השרת לא ישלח עוד אחד (unknown_pending) — קודם מכריעים.
  const newBlocked = nNew > 0 && unknown.some(u => u.kind === 'new');
  const reminderBlocked = unknown.some(u => u.kind === 'reminder');
  // ‼ תזכורת מוצעת רק כשעבר זמן מהמייל או מהתזכורת האחרונים — שורת «תזכורת…» שנייה
  // אחרי השליחה היא רעש, והמגש לא נעלם אף פעם.
  const lastContact = Math.max(Date.parse(own.lastSentAt ?? '') || 0, Date.parse(own.reminder?.lastReminderAt ?? '') || 0);
  const showRemind = !inFlight && nNew === 0 && remindN > 0 && !reminderBlocked
    && Date.now() - lastContact >= REMIND_AFTER_DAYS * 86_400_000;

  const kind = kindHoldRow(kindHold, firstName);

  // ‼ 21.10.2026 · שורת המייל רק כשיש בה מה ש«יש בו חדש» שבראש לא אומר: הוראות ב"ל, «לא ידוע» שחוסם,
  //   עצירה, תור לשליחה לבד או סיבה שלא ייצא לבד (אין כתובת…). מייל «חדש» רגיל — רק הכפתור שבראש.
  const showNews = !inFlight && hasSend && (persons.length > 0 || newBlocked || !!q.paused || !!q.why || (!!queued && q.live));
  // ‼ 240 · הדף תמיד כאן (הפעולות שלו), גם כשאין שום דבר שממתין.
  const numbered = nDrafts > 0 && showNews;
  const personNames = persons.map(p => p.name.split(/\s+/)[0]).join(' ו');
  // ‼ שם קצר בתוך משפט — כמו titleOf; השם המלא בשורת הבקשה מתחת.
  const itemTitle = (i: { title?: string; stepType: string }) => {
    const t = i.title || STEP_TYPE_LABELS[i.stepType as OnboardingStepType] || i.stepType;
    return t.length > 34 ? `${t.slice(0, 33)}…` : t;
  };

  async function cancelQueued(noticeId: string) {
    setBusy(`q:${noticeId}`); setMsg(null);
    const r = await resolveNotice(noticeId, 'cancel_queued');
    setBusy(null);
    // ‼ not_queued = כבר יצא או בוטל בינתיים — מרעננים ומראים את האמת.
    setMsg(r.ok === false
      ? { text: r.error === 'not_queued' ? 'המייל כבר לא בתור — רעננו.' : serverErrorText(r.error, 'לא הצלחתי לבטל — אפשר לנסות שוב') + '.', err: true, warn: r.error === 'request_failed' }
      : { text: QUEUE_CANCELLED_TEXT, err: false });
    onChanged();
  }

  /**
   * ‼ שחרור — הבקשות ייכללו במייל הבא. מגיעים לכאן רק מחלון האישור (unknownConfirm).
   * השרת רושם למה: «הכתובת השתנתה» או «המשרד שחרר» — לא «לא נשלח».
   */
  async function release(noticeId: string, newAddress: boolean) {
    setBusy(`n:${noticeId}`); setMsg(null);
    const r = await resolveNotice(noticeId, 'not_sent');
    setBusy(null);
    // ‼ «לכתובת החדשה» — לפי מה שהשרת רשם (reason), ולא רק לפי המצב שצויר.
    setMsg(r.ok === false
      ? { text: r.error === 'not_unknown' ? 'המצב של המייל כבר הוכרע — רעננו.' : serverErrorText(r.error, 'לא הצלחתי לשחרר — אפשר לנסות שוב') + '.', err: true, warn: r.error === 'request_failed' }
      : { text: r.reason === 'recipient_changed' || newAddress ? RELEASED_NEW_ADDRESS_TEXT : RELEASED_TEXT, err: false });
    onChanged();
  }

  async function retry(noticeId: string) {
    setBusy(`r:${noticeId}`); setMsg(null);
    const r = await retryUnknownNotice(clientId, noticeId);
    setBusy(null);
    // ‼ «נרשם ביומן» רק כשהשרת אמר. logged:false נשאר על המסך (⚠) — לא נעלם אחרי כמה שניות.
    if (r.alreadySent) setMsg({ text: 'המייל כבר יצא — עכשיו זה רשום.', err: false });
    else if (r.ok) setMsg({ text: noticeSuccessText(r), err: r.logged === false, warn: r.logged === false });
    // ‼ על המייל המקורי עדיין לא ידוע — גם כשהניסיון הזה לא יצא (trayRetryText). ענבר, חוץ
    // מסירוב מוחלט של ספק הדואר. ‼ retry_expired / recipient_changed «מוחלטים» לגבי הלחיצה
    // (isDefiniteFailure), אבל השורה נשארת «לא ידוע» (214) — ולכן ענבר, לא אדום.
    else setMsg({ text: trayRetryText(r), err: true, warn: STAYS_UNKNOWN.has(r.error ?? '') || !isDefiniteFailure(r.error) });
    onChanged();
  }

  /** לחיצה על כפתור בשורה — המצב מחושב מחדש עכשיו, והחלון לפיו. */
  function askUnknown(u: ReadyUnknownNotice, which: 'primary' | 'secondary') {
    const m = unknownRowModel(u, Date.now(), own.email, firstName);
    // ‼ «לשחרר בלי לשלוח…» שנלחץ אחרי שהחלון נסגר — עדיין שחרור, עם האישור של אחרי החלון.
    const action: UnknownAction = which === 'primary' ? m.primary.action : 'release';
    setAsk({ m, action, c: unknownConfirm(m, action, firstName) });
  }

  function onAskConfirm() {
    if (!ask) return;
    const { m, action } = ask;
    setAsk(null);
    if (action === 'retry') void retry(m.noticeId);
    else void release(m.noticeId, m.state === 'recipient');
  }

  async function reopenHeld() {
    setBusy('kind'); setMsg(null);
    const r = await retryKindHold(clientId);
    setBusy(null);
    // ‼ הקודים של retry_kind_hold (217) — טקסט לכל אחד; קוד לא מוכר — «לא הצלחנו — נסה שוב».
    setMsg({ ...kindHoldRetryText(r, code => retryKindHoldErrorText(code) + '.'), warn: r.error === 'request_failed' });
    onChanged();
  }

  // ── לא ידוע אם יצא — שורה לכל מייל ──────────────────────────────────────────
  const unknownRows = unknown.map(u => {
    // ‼ הסיבה מהשרת (cause) — וגם בה אף פעם לא «לא נשלח». שרת ישן: «אין אישור שהמייל יצא».
    const m = unknownRowModel(u, Date.now(), own.email, firstName);
    const open = detailsOpen.has(u.noticeId);
    const busyHere = busy === `r:${u.noticeId}` ? 'שולח…' : busy === `n:${u.noticeId}` ? 'רגע…' : null;
    return (
      <div key={u.noticeId} className="rl-out-row is-unknown">
        <div className="rl-out-text">
          {/* ‼ ענבר, לא אדום: ייתכן שהמייל הגיע — זה לא «נכשל». */}
          <strong style={{ color: 'var(--warn)' }}>{m.title}</strong>
          <span className="rl-out-why">{m.why}</span>
          {m.window && <span>{m.window}</span>}
          {open && m.details.map(d => <span key={d} style={{ display: 'block' }}>{d}</span>)}
        </div>
        <div className="rl-out-acts">
          <button type="button" className="btn btn-sm rl-btn-line" disabled={busy !== null}
            onClick={() => askUnknown(u, 'primary')}>
            {busyHere ?? m.primary.label}
          </button>
        </div>
        <div className="rl-out-more">
          {m.secondary && (
            <button type="button" className="rl-link-s" disabled={busy !== null} onClick={() => askUnknown(u, 'secondary')}>
              {m.secondary.label}
            </button>
          )}
          {m.details.length > 0 && (
            <button type="button" className="rl-link-s" aria-expanded={open}
              onClick={() => setDetailsOpen(s => { const n = new Set(s); if (n.has(u.noticeId)) n.delete(u.noticeId); else n.add(u.noticeId); return n; })}>
              {open ? 'פחות' : 'פרטים'}
            </button>
          )}
        </div>
      </div>
    );
  });

  // מה «שלח מייל…» פותח — בעל הכרטיס, או ההוראות לב"ל. ‼ כשמייל «חדש» חסום — רק ההוראות, ובלעדיהן אין כפתור.
  const sendFocus = nNew > 0 && !newBlocked ? 'owner' : persons.length > 0 ? `ni:${persons[0].role}` : null;
  const sendWhy = newBlocked ? unknownBlocksNewText(persons.length > 0)
    : heldBy ? pausedQueueText(heldBy.name)
    : q.why ? q.why
    : nNew > 0 && persons.length > 0 ? `וגם ההוראות לביטוח לאומי ל${personNames} — מייל נפרד.`
    : nNew > 0 ? ''
    : NI_ONLY_WHY;

  // ‼ 240 · «שלח מייל…» בראש הדף: יש חדש ⇒ מייל «מה חדש» (נבחר בשרת); אין ⇒ מייל עם הקישור
  // והמצב. מייל «חדש» שלא ידוע אם יצא חוסם — קודם מכריעים עליו (השורה שלו למטה).
  const ownerNews = nNew > 0 && !newBlocked;
  const pageSend = () => (ownerNews ? onSend('owner') : onSendUpdate());
  // מצב שקט אחד בראש: יש בדף מה שלא נשלח עליו מייל, או מתי יצא המייל האחרון
  const pageStatus = nNew > 0 ? 'יש בו חדש' : own.lastSentAt ? `נשלח ${formatDate(own.lastSentAt, 'list').slice(0, 5)}` : null;

  // ‼ בכל שורה: מה המצב (העובדה קודם — בטלפון הסוף נחתך) · למה ומה יקרה · כפתור אחד ·
  // קישורים משניים. בטלפון הכפתור לצד הכותרת והקישורים מתחתיה, כדי שהמגש לא ידחוף
  // את הבקשות מתחת לקפל.
  return (
    <section className="rl-out" aria-label={`הדף של ${firstName}`} data-testid="rl-page">
      <div className="rl-page-head">
        <div className="rl-page-title">
          <span className={`rl-page-dot${nNew > 0 ? ' is-news' : ''}`} aria-hidden="true" />
          <span>הדף של {firstName}</span>
          {pageStatus && <span className="rl-page-status" data-testid="rl-page-status">· {pageStatus}</span>}
        </div>
        <div className="rl-page-acts">
          <button type="button" className={`btn btn-sm ${ownerNews ? 'btn-primary' : 'rl-btn-line'}`}
            disabled={inFlight || newBlocked} onClick={pageSend} data-testid="rl-page-send">
            {ownerNews && queuedLive ? SEND_NOW_LABEL : SEND_MAIL_LABEL}
          </button>
          <PageMenu firstName={firstName} onViewPage={onViewPage} onCopyLink={onCopyLink} onOpenAsClient={onOpenAsClient} linkBusy={linkBusy} />
        </div>
      </div>
      {linkCopied && <div className="rl-page-flash" role="status">הקישור הועתק</div>}

      {/* ── 1 · פרסום בדף ─────────────────────────────────────────────────── */}
      {nDrafts > 0 && (
        <div className="rl-out-row">
          {numbered && <span className="rl-out-n" aria-hidden="true">1</span>}
          <div className="rl-out-text">
            <strong>{changes.head}</strong>
            <span className="rl-out-why">
              {awaitingQuoteApproval ? 'יופיעו בדף מעצמם כשההצעה תאושר' : changes.why}
            </span>
          </div>
          {!awaitingQuoteApproval && (
            <div className="rl-out-acts">
              <button type="button" className="btn btn-sm btn-primary" onClick={onPublish}>פרסם בדף</button>
            </div>
          )}
          <div className="rl-out-more">
            <button type="button" className="rl-link-s" onClick={onPreviewPage}>איך זה ייראה</button>
            <button type="button" className="rl-link-s" disabled={discarding} onClick={onDiscard}>
              {discarding ? 'מבטל…' : 'ביטול השינויים'}
            </button>
          </div>
        </div>
      )}

      {/* ── לא ידוע אם יצא — כשהוא חוסם מייל «חדש», קודם מכריעים עליו ─────── */}
      {newBlocked && unknownRows}

      {/* ── 2 · מייל על מה שחדש ──────────────────────────────────────────── */}
      {inFlight ? (
        <div className="rl-out-row" role="status">
          <div className="rl-out-text">
            <strong>נשלח עכשיו מייל ל{firstName}…</strong>
            <span className="rl-out-why">רגע, ונרענן.</span>
          </div>
        </div>
      ) : showNews && (
        // ‼ 240 · הדגשה עדינה כשיש בדף משהו שהלקוח עוד לא קיבל עליו מייל — לא כפתור צועק.
        <div className={`rl-out-row${nNew > 0 && !newBlocked ? ' is-news' : ''}`} data-testid="tray-news">
          {numbered && <span className="rl-out-n" aria-hidden="true">2</span>}
          <div className="rl-out-text">
            <strong>
              {/* ‼ אותה מילה כמו בשורת הבקשה («בדף, בלי מייל»), והעובדה קודם — בטלפון הסוף נחתך. */}
              {nNew > 0
                ? newSinceTitle(own.items, own.lastSentAt, firstName, itemTitle)
                : `עוד לא נשלחו ל${personNames}: ההוראות לביטוח לאומי`}
            </strong>
            {sendWhy && <span className="rl-out-why">{sendWhy}</span>}
          </div>
          {sendFocus && sendFocus !== 'owner' && (
            <div className="rl-out-acts">
              <button type="button" className="btn btn-sm rl-btn-line" onClick={() => onSend(sendFocus)}>
                שלח הוראות…
              </button>
            </div>
          )}
          {((queued && queuedLive) || (heldBy && onOpenFlow)) && (
            <div className="rl-out-more">
              {queued && queuedLive && (
                <button type="button" className="rl-link-s" disabled={busy !== null}
                  onClick={() => void cancelQueued(queued.noticeId)}>
                  {busy === `q:${queued.noticeId}` ? 'רגע…' : 'אל תשלח לבד'}
                </button>
              )}
              {heldBy && onOpenFlow && (
                <button type="button" className="rl-link-s" onClick={() => onOpenFlow(heldBy.runId)}>לפרטי המסלול ולחידוש</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── לא ידוע אם יצא ───────────────────────────────────────────────────── */}
      {!newBlocked && unknownRows}

      {/* ── סוג העוסק לא ידוע — מה מחכה לו, ואיפה קובעים ────────────────────── */}
      {kind && (
        // ‼ is-wide: בטלפון הטקסט ברוחב מלא והכפתור מתחתיו — הכותרת וההסבר לא נחתכים לצד הכפתור.
        <div className="rl-out-row is-wide">
          <div className="rl-out-text">
            <strong>{kind.title}</strong>
            <span className="rl-out-why">{kind.why}</span>
          </div>
          {kind.failed ? (
            <div className="rl-out-acts">
              <button type="button" className="btn btn-sm rl-btn-line" disabled={busy !== null} onClick={() => void reopenHeld()}>
                {busy === 'kind' ? 'פותח…' : kind.button}
              </button>
            </div>
          ) : onOpenKindField && (
            <div className="rl-out-acts">
              <button type="button" className="btn btn-sm rl-btn-line" onClick={onOpenKindField}>{kind.button}</button>
            </div>
          )}
        </div>
      )}

      {/* ── תזכורת: נמסר ועדיין ממתין ─────────────────────────────────────── */}
      {showRemind && (
        <div className="rl-out-row">
          <div className="rl-out-text">
            <strong>
              {remindN === 1 ? `דבר אחד עדיין ממתין ל${firstName}` : `${remindN} דברים עדיין ממתינים ל${firstName}`}
            </strong>
            <span className="rl-out-why">
              {own.lastSentAt ? `נמסרו במייל · אחרון ${formatDate(own.lastSentAt, 'list')}` : 'נמסרו במייל'}
              {own.reminder?.lastReminderAt ? ` · תזכורת אחרונה ${formatDate(own.reminder.lastReminderAt, 'list')}` : ''}
            </span>
          </div>
          <div className="rl-out-acts">
            <button type="button" className="btn btn-sm rl-btn-line" onClick={onRemind}>תזכורת…</button>
          </div>
        </div>
      )}

      {msg && (
        <div role="status" style={{ fontSize: 'var(--fs-12)', color: msg.err ? (msg.warn ? 'var(--warn)' : 'var(--err)') : 'var(--ok)', padding: '2px 0 6px' }}>
          {msg.err ? '⚠ ' : '✓ '}{msg.text}
        </div>
      )}

      {ask && (
        <ConfirmDialog
          tone={ask.c.tone}
          title={ask.c.title}
          message={ask.c.message}
          confirmLabel={ask.c.confirmLabel}
          onConfirm={onAskConfirm}
          onCancel={() => setAsk(null)}
        />
      )}
    </section>
  );
}

/**
 * ⋯ של «הדף של X»: צפייה · פתח כמו X ↗ · העתקת קישור. ‼ אף אחת מהן אינה הודעה ללקוח.
 * אותו דפוס כמו ⋯ בשורת הבקשה (RowActionsMenu): לחיצה בחוץ או Escape סוגרים, הפוקוס נכנס לפריט הראשון.
 */
function PageMenu({ firstName, onViewPage, onCopyLink, onOpenAsClient, linkBusy }: {
  firstName: string; onViewPage: () => void; onCopyLink: () => void; onOpenAsClient?: () => void; linkBusy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    window.setTimeout(() => wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="ob-menu-wrap rl-more-wrap" ref={wrapRef}>
      <button ref={btnRef} type="button" className={`rl-rowmore${open ? ' is-open' : ''}`} aria-haspopup="menu" aria-expanded={open}
        aria-label={`עוד על הדף של ${firstName}`} data-testid="rl-page-more" onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <div className="ob-menu rl-more-menu rl-page-menu" role="menu" hidden={!open} aria-label={`הדף של ${firstName}`}>
        <button type="button" role="menuitem" className="rl-mi" onClick={pick(onViewPage)} data-testid="rl-view-page">
          <span className="rl-mi-l">צפייה בדף</span>
        </button>
        {onOpenAsClient && (
          <button type="button" role="menuitem" className="rl-mi" onClick={pick(onOpenAsClient)} data-annual-as-client>
            <span className="rl-mi-l">פתח כמו {firstName} ↗</span>
            <span className="rl-mi-h">הדף האמיתי — מה שממלאים שם נשמר</span>
          </button>
        )}
        <button type="button" role="menuitem" className="rl-mi" disabled={linkBusy} onClick={pick(onCopyLink)} data-testid="rl-copy-link">
          <span className="rl-mi-l">{linkBusy ? 'מכין…' : 'העתקת קישור'}</span>
        </button>
      </div>
    </div>
  );
}
