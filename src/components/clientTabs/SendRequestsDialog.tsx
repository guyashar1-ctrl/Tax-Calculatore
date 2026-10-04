// ─── «שלח בקשות» — סקירה אחת לפי נמען, מייל לכל נמען ─────────────────────────
// המודל המאושר (docs/prototypes/requests-v3-responsibility-v1.html): הרו"ח
// לוחץ פעם אחת, רואה מי יקבל מה ומאיזו כתובת, יכול להוציא נמען מהשליחה
// הזאת, לפתוח תצוגה מקדימה של המייל האמיתי, ואז שולח — והמערכת מפיקה מייל
// נפרד לכל נמען דרך **מנגנוני השליחה הקיימים**:
//   • בעל הכרטיס  → send-process-open-email (מייל הדף האישי, כמו «שלח שוב את הקישור»)
//   • אדם במשק הבית → send-onboarding-email · stage ni_approve (הוראות אישור ב"ל)
// אין כאן מסלול משלוח חדש, אין כתיבה למסד מהדפדפן: מה "נשלח" נקבע בשרת
// (record_email_sent), והנמען נפתר שם מהכרטיס ולא מהכתובת שכאן על המסך.
//
// ‼ מה מוכן לשליחה מגיע מ-client_ready_to_send (192→214) — אותו מקור של גלולת
// «טרם נשלח» ושל המונה על הכפתור. ‼ בקבוצת בעל הכרטיס אין הוצאה של פריט
// בודד: השרת בוחר מה חדש (גרסה שטרם נמסרה) ומסמן אותו כנמסר רק אחרי שהמייל
// יצא; הוצאה מהשליחה היא ברמת הנמען.
// ‼ 214: בעל הכרטיס נשלח דרך sendClientNotice — מפתח אחד לחלון (לחיצה כפולה =
// מייל אחד) וטביעת הפריטים שעל המסך (נוסף/ירד משהו בינתיים ⇒ items_changed,
// והרשימה נטענת מחדש). מסלול ב"ל לאדם לא השתנה.

import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import EmailInput from '../ui/EmailInput';
import { supabase } from '../../lib/supabase';
import { isValidEmail } from '../../utils/email';
import { EMAIL_PREVIEW_SANDBOX, withExternalLinks } from '../../utils/emailPreviewHtml';
import { formatDate } from '../../utils/dateFormat';
import { STEP_TYPE_LABELS, type OnboardingStepType } from '../../types/onboarding';
import { sendClientNotice } from '../../features/flows/api';
import {
  noticeErrorText, noticePreviewErrorText, sendOutcome, sendSummary, errorTextFromBody, isUnknownEmailFailure,
  IN_FLIGHT_TEXT, SENT_UNLOGGED_TEXT, NI_NO_ANSWER_TEXT, PREVIEW_FAILED_TEXT, type SendStatus,
} from '../../features/flows/noticeText';
import { isUnknownSendReply, unknownSendText } from '../../types/emailActivity';
import type { Client } from '../../types';
import type { ReadyToSend } from '../../hooks/useReadyToSend';

interface Props {
  clientId: string;
  clientName: string;
  ready: ReadyToSend;
  /** פותח את המגש כשקבוצה מסוימת במוקד — למשל מכפתור «שלח לדין את ההוראות». */
  focusKey?: string;
  /** כתובת שהוזנה כאן נכתבת לכרטיס — הקנוני, כמו ב-NiInstructionsDialog. */
  onUpdateClientFields?: (patch: Partial<Client>) => Promise<void>;
  onClose: () => void;
  /** אחרי שליחה מוצלחת אחת לפחות — הקורא מרענן בקשות/ביצוע/מוכנות. */
  onSent: () => void;
  /** טוען מחדש את «מה מוכן» — כשהשרת אמר שמשהו השתנה מאז שהחלון נפתח. */
  onReload?: () => unknown;
}

type GroupKind = 'page' | 'ni';
interface Group {
  key: string;
  kind: GroupKind;
  who: string;
  first: string;
  email: string;
  role?: 'client' | 'spouse';
  clientId?: string;
  stepId?: string;
  requestId?: string;
  what: string;
  subjectHint: string;
  items: { title: string; sub?: string }[];
  on: boolean;
  preview?: { subject: string; to: string; from?: string; html: string } | null;
  previewOpen: boolean;
  previewLoading: boolean;
  previewError?: string | null;
  editAddr: boolean;
  draftAddr: string;
  /**
   * already — השרת זיהה שהמייל הזה כבר יצא (אותו מפתח / כבר נשלח לאדם הזה): לא נשלח שוב.
   * unlogged — יצא, אבל לא נרשם ביומן. inflight — חלון אחר שולח אותו ממש עכשיו.
   * unknown — לא ידוע אם יצא. ‼ שלושתם אינם «נשלח · נרשם ביומן» ואינם «לא נשלח».
   */
  status?: SendStatus;
  error?: string;
  /** ההסבר למצב שאינו כשל (לא ידוע / מחלון אחר / לא נרשם / כבר נמסר) — לא באדום. */
  note?: string;
  /** טביעת הפריטים שעל המסך — חוזרת לשרת בשליחה (214). */
  fingerprint?: string;
  /**
   * למה אי אפשר לשלוח לנמען הזה עכשיו. ‼ מייל «חדש» קודם שלא ידוע אם יצא — השרת מסרב
   * לכל «חדש» נוסף (214, unknown_pending), ולכן הנמען לא מסומן ולא ניתן לסמן אותו.
   */
  blocked?: string;
}

const ERROR_TEXT: Record<string, string> = {
  'no client email': 'אין כתובת מייל בכרטיס.',
  no_recipient_email: 'אין כתובת מייל לנמען.',
  'not found': 'הבקשה לא נמצאה.',
  unauthorized: 'ההתחברות פגה - יש להיכנס מחדש.',
  forbidden: 'אין הרשאה לפעולה הזו מהחשבון הזה.',
  server_not_updated: 'השרת עוד לא עודכן לגרסה הזו.',
  missing_reference_number: 'חסר מספר אסמכתא של הביטוח הלאומי.',
  resend_failed: 'שרת המייל דחה את השליחה.',
  resend_unreachable: 'שרת המייל לא זמין כרגע.',
  step_mismatch: 'הבקשה והאדם אינם תואמים - רענן את המסך.',
  nothing_to_send: 'אין על מה להודיע ללקוח.',
};

/**
 * גוף התשובה — גם כשהשרת ענה בקוד שאינו 2xx (supabase-js מסתיר אותו ב-error.context).
 * null — אין גוף: החיבור נפל, או שער שענה בלי JSON.
 */
async function readBody(data: any, error: any): Promise<any> {
  if (data) return data;
  const ctx = error && (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try { return await ctx.clone().json(); } catch { /* גוף שאינו JSON */ }
  }
  return null;
}

const httpStatus = (error: any): number | null => {
  const ctx = error && (error as { context?: Response }).context;
  return ctx && typeof ctx.status === 'number' ? ctx.status : null;
};

/**
 * למה התצוגה המקדימה לא נבנתה. ‼ בעל הכרטיס (הודעה) — אותם משפטים כמו בשליחה;
 * בשום קבוצה לא הודעת מסד נתונים או קוד באנגלית.
 */
async function previewErrText(g: Group, data: any, error: any): Promise<string> {
  const b = await readBody(data, error);
  return g.kind === 'page' ? noticePreviewErrorText(b) : errorTextFromBody(b, ERROR_TEXT, PREVIEW_FAILED_TEXT);
}

function requestBody(g: Group, preview: boolean): { fn: string; body: Record<string, unknown> } {
  if (g.kind === 'page') return { fn: 'send-process-open-email', body: { clientId: g.clientId, kind: 'new', ...(preview ? { preview: true } : {}) } };
  return {
    fn: 'send-onboarding-email',
    body: { requestId: g.requestId, stage: 'ni_approve', niRole: g.role, stepId: g.stepId, ...(preview ? { preview: true } : {}) },
  };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

const ownerItems = (ready: ReadyToSend) => ready.owner.items.map(i => ({
  title: i.title || STEP_TYPE_LABELS[i.stepType as OnboardingStepType] || i.stepType,
  sub: i.changedAt
    ? `בדף מ-${formatDate(i.publishedAt, 'list')} · עודכן · העדכון טרם נשלח`
    : `בדף מ-${formatDate(i.publishedAt, 'list')} · טרם נשלח`,
}));

/**
 * מייל «חדש» קודם שלא ידוע אם יצא ⇒ השרת לא ישלח עוד «חדש» (214, unknown_pending).
 * המשפט — אותו משפט כמו כשהשרת מסרב, ומפנה לשורה שבה מכריעים.
 */
function ownerBlocked(ready: ReadyToSend): string | undefined {
  return (ready.owner.unknown ?? []).some(u => u.kind === 'new')
    ? noticeErrorText({ error: 'unknown_pending' }) : undefined;
}

export function buildGroups(ready: ReadyToSend, clientId: string, clientName: string): Group[] {
  const groups: Group[] = [];
  if (ready.owner.items.length > 0) {
    const blocked = ownerBlocked(ready);
    groups.push({
      key: 'owner', kind: 'page', who: clientName, first: firstName(clientName),
      email: ready.owner.email ?? '', clientId,
      // ‼ «מייל אחד» נאמר פעם אחת — בשורה שליד «שלח». כאן: מה יש בו.
      what: 'קישור לדף האישי — מה שחדש, ומתחתיו מה שעוד ממתין',
      // ‼ הנושא נקבע בשרת (מייל ראשון / מאוחר / נוסח שהמשרד שמר) — מוצג רק מהתצוגה המקדימה.
      subjectHint: '',
      items: ownerItems(ready),
      fingerprint: ready.owner.fingerprint,
      on: !blocked, blocked,
      previewOpen: false, previewLoading: false, editAddr: false, draftAddr: ready.owner.email ?? '',
    });
  }
  for (const p of ready.persons) {
    groups.push({
      key: `ni:${p.role}`, kind: 'ni', who: p.name, first: firstName(p.name), email: p.email ?? '',
      role: p.role, stepId: p.stepId, requestId: p.requestId,
      what: p.role === 'spouse' ? 'מייל ייעודי — אין לו/לה דף אישי' : 'מייל ייעודי — הוראות האישור בביטוח לאומי',
      subjectHint: 'במייל: אסמכתא, מועד, קישור וטלפון לאישור בביטוח הלאומי',
      items: [{
        title: 'הוראות לאישור ייפוי הכוח בביטוח לאומי',
        sub: `אסמכתא ${p.referenceNumber}${p.deadline ? ` · עד ${formatDate(p.deadline, 'form')}` : ''}`,
      }],
      on: true, previewOpen: false, previewLoading: false, editAddr: false, draftAddr: p.email ?? '',
    });
  }
  return groups;
}

export default function SendRequestsDialog({ clientId, clientName, ready, focusKey, onUpdateClientFields, onClose, onSent, onReload }: Props) {
  const [groups, setGroups] = useState<Group[]>(() => buildGroups(ready, clientId, clientName));
  const [phase, setPhase] = useState<'review' | 'sending' | 'done'>('review');
  // ‼ מפתח אחד לכל פתיחה של החלון — לא לכל לחיצה. שליחה חוזרת מאותו חלון
  // (אחרי כשל, או לחיצה כפולה) היא אותו מייל בשרת ואצל ספק הדואר.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // ‼ «מה מוכן» נטען מחדש (אחרי items_changed, או רענון ברקע) — הרשימה של בעל
  // הכרטיס והטביעה שלה מתעדכנות, כדי שמה שעל המסך הוא מה שיישלח. בחירות
  // (מי מסומן, כתובת שנערכה) נשמרות. אחרי השליחה — לא נוגעים.
  useEffect(() => {
    if (phase !== 'review') return;
    const blocked = ownerBlocked(ready);
    setGroups(gs => gs.map(g => {
      if (g.key !== 'owner') return g;
      let next = g.fingerprint === ready.owner.fingerprint ? g : {
        ...g, items: ownerItems(ready), fingerprint: ready.owner.fingerprint, preview: null, previewOpen: false,
      };
      // הוכרע על המייל הקודם בינתיים (או שנוסף «לא ידוע») — הנמען נפתח / נסגר לשליחה.
      if (next.blocked !== blocked) next = { ...next, blocked, on: !blocked };
      return next;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!focusKey) return;
    const el = document.getElementById(`srd-${focusKey}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusKey]);

  // ‼ נמען אחד — המייל עצמו (והנושא שלו) גלוי מיד: «רואים את המייל לפני שהוא יוצא».
  // כמה נמענים — כל תצוגה נפתחת בלחיצה, כדי שהחלון לא יהיה קיר של מיילים.
  // ‼ ref ולא state: StrictMode מריץ את האפקט פעמיים, ובקשת תצוגה שנייה מיותרת.
  const autoPreviewed = useRef(false);
  useEffect(() => {
    if (autoPreviewed.current) return;
    autoPreviewed.current = true;
    const only = groups.length === 1 ? groups[0] : null;
    if (only && only.on && only.email && !only.blocked) void togglePreview(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (key: string, p: Partial<Group>) =>
    setGroups(gs => gs.map(g => (g.key === key ? { ...g, ...p } : g)));

  async function togglePreview(g: Group) {
    if (g.previewOpen) { patch(g.key, { previewOpen: false }); return; }
    if (g.preview) { patch(g.key, { previewOpen: true }); return; }
    patch(g.key, { previewOpen: true, previewLoading: true, previewError: null });
    const { fn, body } = requestBody(g, true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error || !data?.ok) { patch(g.key, { previewLoading: false, previewError: await previewErrText(g, data, error) }); return; }
      patch(g.key, {
        previewLoading: false, preview: { subject: data.subject, to: data.to, from: data.from, html: data.html },
        // התצוגה היא מה שנראה — הטביעה שלה היא זו שחוזרת לשרת בשליחה.
        ...(g.kind === 'page' && typeof data.fingerprint === 'string' ? { fingerprint: data.fingerprint } : {}),
      });
    } catch (e) {
      console.warn('[send-requests] preview', e);
      patch(g.key, { previewLoading: false, previewError: PREVIEW_FAILED_TEXT });
    }
  }

  async function saveAddr(g: Group) {
    const v = g.draftAddr.trim();
    if (!isValidEmail(v)) { patch(g.key, { error: 'נדרשת כתובת מייל תקינה.' }); return; }
    if (!onUpdateClientFields) return;
    try {
      // ‼ נכתב לכרטיס — השרת קורא משם. הכתובת שעל המסך היא רק מראה.
      await onUpdateClientFields(g.role === 'spouse' ? { spouseEmail: v } : { email: v });
      patch(g.key, { email: v, editAddr: false, error: undefined, preview: null, previewOpen: false });
    } catch (e) {
      patch(g.key, { error: e instanceof Error ? e.message : 'שמירת הכתובת נכשלה.' });
    }
  }

  const active = groups.filter(g => g.on);
  const sendable = active.filter(g => !!g.email);
  const missing = active.filter(g => !g.email).length;
  const canSend = phase === 'review' && sendable.length > 0 && missing === 0;

  async function send() {
    setPhase('sending');
    let ok = 0;
    let changed = false;
    let touchedServer = false;
    for (const g of groups) {
      if (!g.on || !g.email) continue;
      patch(g.key, { status: 'sending', error: undefined, note: undefined });
      if (g.kind === 'page') {
        touchedServer = true;
        // ‼ נפל באמצע (חריגה ולא תשובה) — כמו «אין תשובה מהשרת»: לא ידוע אם יצא.
        const r = await sendClientNotice({ clientId, kind: 'new', idempotencyKey, expectedFingerprint: g.fingerprint })
          .catch((e: unknown) => { console.warn('[send-requests] notice', e); return null; });
        const o = sendOutcome(r);
        if (o === 'already') { patch(g.key, { status: 'already' }); ok++; continue; }
        if (o === 'sent') { patch(g.key, { status: 'ok' }); ok++; continue; }
        if (o === 'unlogged') { patch(g.key, { status: 'unlogged', note: SENT_UNLOGGED_TEXT }); ok++; continue; }
        // ‼ הכול כבר נמסר (מחלון אחר, או במייל שיצא לבד) — תוצאה תקינה, לא «לא נשלח דבר» באדום.
        if (o === 'nothing') { patch(g.key, { status: 'nothing', note: noticeErrorText(r ?? {}) }); continue; }
        // ‼ מייל אחר ללקוח יוצא ממש עכשיו — המתנה, לא כשל. אפשר לשלוח שוב בעוד רגע.
        if (o === 'busy') { patch(g.key, { status: 'busy', note: noticeErrorText(r ?? {}) }); continue; }
        // ‼ לא ידוע אם יצא (גם: אין תשובה מהשרת) / המייל הזה יוצא עכשיו מחלון אחר —
        // לא «לא נשלח», ולא כשל.
        if (o === 'unknown' || o === 'noanswer') { patch(g.key, { status: 'unknown', note: noticeErrorText(r ?? {}) }); continue; }
        if (o === 'inflight') { patch(g.key, { status: 'inflight', note: noticeErrorText(r ?? {}) }); continue; }
        // ‼ מכאן — השרת אמר שהמייל לא יצא (כולל «מייל אחר ללקוח יוצא ממש עכשיו»).
        if (r?.error === 'items_changed') changed = true;
        patch(g.key, { status: 'err', error: noticeErrorText(r ?? {}) });
        continue;
      }
      const { fn, body } = requestBody(g, false);
      try {
        const { data, error } = await supabase.functions.invoke(fn, { body });
        if (error || !data?.ok) {
          const b = await readBody(data, error);
          // ‼ אותו מייל יוצא ממש עכשיו מחלון אחר (תיק המס / המגש) — אולי כבר נמסר. לא כשל.
          if (b?.error === 'in_flight') { touchedServer = true; patch(g.key, { status: 'inflight', note: IN_FLIGHT_TEXT }); continue; }
          // ‼ השרת אמר במפורש «לא ידוע אם יצא» (תשובת ספק הדואר לא הכריעה). ההוראות
          // לב"ל נשלחות במפתח קבוע לאדם — ולכן שליחה חוזרת בתוך יממה לא תצא פעמיים.
          if (isUnknownSendReply(b)) {
            touchedServer = true;
            patch(g.key, { status: 'unknown', note: unknownSendText({
              what: 'המייל עם ההוראות', retrySafe: b?.retrySafe === true, again: 'שליחה חוזרת שלו',
            }) });
            continue;
          }
          // ‼ אין תשובה מהשרת (או 5xx בלי קוד מוכר) — אולי ההוראות יצאו. לא «לא נשלח».
          if (isUnknownEmailFailure(b, httpStatus(error), ERROR_TEXT)) {
            touchedServer = true;
            patch(g.key, { status: 'unknown', note: NI_NO_ANSWER_TEXT });
            continue;
          }
          patch(g.key, { status: 'err', error: errorTextFromBody(b, ERROR_TEXT, 'השליחה נכשלה — ההוראות לא נשלחו.') });
          continue;
        }
        // ‼ ההוראות לב"ל כבר יצאו לאדם הזה (בחלון אחר, בלשונית אחרת) — השרת לא שולח שוב, ואנחנו לא כותבים «נשלח».
        patch(g.key, data.alreadySent ? { status: 'already' }
          : data.logged === false ? { status: 'unlogged', note: 'המייל יצא, אבל לא נרשם ביומן — ההוראות לא סומנו כנשלחו.' }
          : { status: 'ok' });
        ok++;
      } catch (e) {
        // ‼ נפל באמצע — אין תשובה מהשרת, ולכן גם לא «לא נשלח».
        console.warn('[send-requests] ni', e);
        touchedServer = true;
        patch(g.key, { status: 'unknown', note: NI_NO_ANSWER_TEXT });
      }
    }
    // ‼ גם כשהשליחה לבעל הכרטיס לא הצליחה, השרת אולי שינה מצב (לא ידוע אם יצא,
    // תור שבוטל) — המגש מתחת חייב להראות את זה.
    if (ok > 0 || touchedServer) onSent();
    if (changed) {
      // ‼ נוסף/ירד משהו מאז שהחלון נפתח: חוזרים לסקירה עם הרשימה המעודכנת —
      // לא «לא נשלח דבר» ויציאה.
      void onReload?.();
      // מה שיצא, כבר נשלח/נמסר, בתנועה או לא ידוע — לא נשלח שוב מכאן. (נכשל, או מחכה למייל אחר — כן.)
      setGroups(gs => gs.map(g => (g.status && !['err', 'busy', 'sending'].includes(g.status) ? { ...g, on: false } : g)));
      setPhase('review');
      return;
    }
    setPhase('done');
  }

  const okGroups = groups.filter(g => g.status === 'ok');
  const unloggedGroups = groups.filter(g => g.status === 'unlogged');
  const alreadyGroups = groups.filter(g => g.status === 'already');
  const nothingGroups = groups.filter(g => g.status === 'nothing');
  const inflightGroups = groups.filter(g => g.status === 'inflight');
  const busyGroups = groups.filter(g => g.status === 'busy');
  const unknownGroups = groups.filter(g => g.status === 'unknown');
  const errGroups = groups.filter(g => g.status === 'err');
  const summary = sendSummary(groups.map(g => g.status));
  const blockedOnly = groups.length > 0 && groups.every(g => !!g.blocked);

  const footer = phase === 'done' ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
      <button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
      {/* ‼ «מייל אחד» — רק כאן, ליד «שלח». */}
      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', flex: 1 }}>
        {missing > 0
          ? `⚠ ${missing === 1 ? 'לנמען אחד אין כתובת' : `${missing} נמענים בלי כתובת`} — הוסף או בטל אותו`
          : blockedOnly ? 'אין מה לשלוח עד שמכריעים על המייל הקודם'
          : sendable.length === 0 ? 'לא נבחר דבר לשליחה'
          : sendable.length === 1 ? `מייל אחד יישלח ל${sendable[0].who}`
          : `${sendable.length} מיילים יישלחו · אחד לכל נמען`}
      </span>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={phase === 'sending'}>ביטול</button>
      <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => void send()}>
        {phase === 'sending' ? 'שולח…' : sendable.length <= 1 ? 'שלח' : `שלח ${sendable.length} מיילים`}
      </button>
    </div>
  );

  // ‼ כמה מיילים יוצאים ולמי — נאמר פעם אחת, בשורה שליד «שלח» (לא גם בראש החלון).
  return (
    <Modal title="שליחת מייל" onClose={onClose} width={720} footer={footer}>

      {phase === 'done' ? (
        <div className="srd-done">
          <div className={`srd-done-mark${summary.tone === 'failed' ? ' is-failed' : ''}`} aria-hidden="true"
            style={summary.tone === 'warn' ? { color: 'var(--warn)' } : summary.tone === 'wait' ? { color: 'var(--ink-3)' } : undefined}>
            {summary.tone === 'ok' ? '✓' : summary.tone === 'wait' ? '…' : '⚠'}
          </div>
          <h4>{summary.title}</h4>
          {okGroups.length > 0 && (
            <p>{okGroups.map(g => `${g.who} — ${g.items.length === 1 ? 'פריט אחד' : `${g.items.length} פריטים`}`).join(' · ')}</p>
          )}
          {unloggedGroups.length > 0 && (
            <p style={{ color: 'var(--warn)' }}>{unloggedGroups.map(g => `${g.who} — ${g.note}`).join(' · ')}</p>
          )}
          {alreadyGroups.length > 0 && (
            <p>{alreadyGroups.map(g => `${g.who} — כבר קיבל/ה את המייל הזה קודם; לא נשלח שוב`).join(' · ')}</p>
          )}
          {/* ‼ נמען אחד — הכותרת כבר אומרת את זה; שורה לכל נמען רק כשיש כמה. */}
          {nothingGroups.length > 0 && groups.length > 1 && (
            <p>{nothingGroups.map(g => `${g.who} — ${g.note}`).join(' · ')}</p>
          )}
          {inflightGroups.length > 0 && (
            <p>{inflightGroups.map(g => `${g.who} — ${g.note}`).join(' · ')}</p>
          )}
          {busyGroups.length > 0 && groups.length > 1 && (
            <p>{busyGroups.map(g => `${g.who} — ${g.note}`).join(' · ')}</p>
          )}
          {unknownGroups.length > 0 && (
            <p style={{ color: 'var(--warn)' }}>{unknownGroups.map(g => `${g.who}: ${g.note}`).join(' · ')}</p>
          )}
          {errGroups.length > 0 && (
            <p style={{ color: 'var(--err)' }}>
              {errGroups.map(g => `${g.who}: ${g.error ?? 'השליחה נכשלה'}`).join(' · ')}
            </p>
          )}
          {okGroups.length > 0 && (
            <p style={{ marginTop: 10 }}>מה שנשלח מסומן ברשימה «ממתין ל…». המייל נרשם ביומן המיילים.</p>
          )}
        </div>
      ) : groups.map(g => {
        const missingAddr = !g.email;
        return (
          // ‼ נמען שחסום (מייל קודם «לא ידוע») לא מעומעם — ההסבר שלו צריך להיקרא.
          <div key={g.key} id={`srd-${g.key}`} className={`srd-rcp ${g.on || g.blocked ? '' : 'is-off'}`}>
            <div className="srd-rcp-head">
              <input type="checkbox" checked={g.on} disabled={phase === 'sending' || !!g.blocked}
                aria-label={`לשלוח ל${g.who}`}
                onChange={e => patch(g.key, { on: e.target.checked })} />
              <span className="srd-who">{g.who}</span>
              {g.editAddr ? (
                <span className="srd-addr-edit">
                  <EmailInput value={g.draftAddr} placeholder="name@example.com" autoFocus
                    onChange={e => patch(g.key, { draftAddr: e.target.value, error: undefined })} />
                  <button type="button" className="btn btn-sm" onClick={() => void saveAddr(g)}>שמור בכרטיס</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => patch(g.key, { editAddr: false, draftAddr: g.email, error: undefined })}>ביטול</button>
                </span>
              ) : (
                <>
                  {missingAddr
                    ? <span className="srd-addr is-missing">אין כתובת מייל בכרטיס</span>
                    : <span className="srd-addr" dir="ltr">{g.email}</span>}
                  {onUpdateClientFields && phase !== 'sending' && (
                    /* ‼ «שינוי» ולא «שנה» — ליד כתובת, «שנה» נקרא כמו שנה בלוח. */
                    <button type="button" className="ui-linkbtn srd-addr-btn" onClick={() => patch(g.key, { editAddr: true })}>
                      {missingAddr ? 'הוסף' : 'שינוי'}
                    </button>
                  )}
                </>
              )}
              <span className="srd-what">{g.what}</span>
            </div>
            {/* ‼ לא כשל — מחכה להכרעה. כתום, לא אדום. */}
            {g.blocked && <div className="srd-err" style={{ color: 'var(--chip-amber-tx)', background: 'var(--chip-amber-bg)' }}>{g.blocked}</div>}
            {g.error && <div className="srd-err">⚠ {g.error}</div>}
            <div className="srd-rcp-body">
              {g.items.map((it, i) => (
                <div key={i} className="srd-item">
                  <span className="srd-item-title">{it.title}</span>
                  {it.sub && <small>{it.sub}</small>}
                </div>
              ))}
              <div className="srd-line">
                {/* ‼ הנושא מהשרת, כשהתצוגה סגורה (פתוחה — הוא בראש התצוגה). בלי «מייל אחד» נוסף. */}
                <span>{g.preview && !g.previewOpen ? `נושא: «${g.preview.subject}»` : g.preview || g.kind === 'page' ? '' : g.subjectHint}</span>
                <button type="button" className="ui-linkbtn" disabled={missingAddr || phase === 'sending' || !!g.blocked}
                  onClick={() => void togglePreview(g)}>
                  {g.previewOpen ? 'הסתר תצוגה מקדימה' : 'תצוגה מקדימה'}
                </button>
              </div>
              {g.previewOpen && (
                <div className="srd-preview">
                  {g.previewLoading && <div className="srd-preview-note">טוען את המייל…</div>}
                  {g.previewError && <div className="srd-preview-note" style={{ color: 'var(--err)' }}>⚠ {g.previewError}</div>}
                  {g.preview && (
                    <>
                      <div className="srd-preview-hdr">
                        <span>אל: <b dir="ltr">{g.preview.to}</b></span>
                        {g.preview.from && <span>מאת: <b>{g.preview.from}</b></span>}
                        <span>נושא: <b>{g.preview.subject}</b></span>
                      </div>
                      <iframe title={`תצוגה מקדימה — ${g.who}`} srcDoc={withExternalLinks(g.preview.html)}
                        sandbox={EMAIL_PREVIEW_SANDBOX} className="srd-preview-frame" />
                    </>
                  )}
                </div>
              )}
            </div>
            {g.status && (
              <div className={`srd-status is-${g.status === 'already' || g.status === 'unlogged' || g.status === 'nothing' ? 'ok'
                  : g.status === 'inflight' || g.status === 'busy' || g.status === 'unknown' ? 'sending' : g.status}`}
                style={g.status === 'unknown' || g.status === 'unlogged' ? { color: 'var(--warn)' } : undefined}>
                {g.status === 'sending' ? 'שולח…' : g.status === 'ok' ? '✓ נשלח · נרשם ביומן'
                  : g.status === 'already' ? '✓ כבר נשלח קודם — לא נשלח שוב'
                  : g.status === 'unlogged' || g.status === 'nothing' ? `✓ ${g.note ?? ''}`
                  : g.status === 'inflight' || g.status === 'busy' ? `… ${g.note ?? ''}`
                  : g.status === 'unknown' ? `⚠ ${g.note ?? ''}`
                  : `⚠ ${g.error ?? 'השליחה נכשלה'}`}
              </div>
            )}
          </div>
        );
      })}
    </Modal>
  );
}
