// ─── תצוגה מקדימה של מייל ללקוח, ושליחה ממנה ───────────────────────────────
// כלל: שום מייל לא יוצא ללקוח בלי שהרו"ח ראה אותו קודם ולחץ שלח. התצוגה
// נבנית בשרת מאותו קוד שבונה את המייל האמיתי, ולכן מה שרואים כאן הוא המייל —
// לא שחזור שלו.

import { useEffect, useState } from 'react';
import { EMAIL_PREVIEW_SANDBOX, withExternalLinks } from '../../utils/emailPreviewHtml';
import { supabase } from '../../lib/supabase';
import InfoLines from '../ui/InfoLines';
import type { NoticeKind } from '../../features/flows/api';
import {
  noticeErrorText, noticePreviewErrorText, sendOutcome, errorTextFromBody, isUnknownEmailFailure,
  ALREADY_SENT_TEXT, IN_FLIGHT_TEXT, SENT_UNLOGGED_TEXT, NO_ANSWER_TEXT, NO_ANSWER_RETRY_TEXT,
  EMAIL_NO_ANSWER_TEXT, PREVIEW_FAILED_TEXT, type NoticeSendResult,
} from '../../features/flows/noticeText';
import {
  isUnknownSendReply, sendErrorView, templateFromLabels, templateToLabels, unknownSendText, TEMPLATE_FIELD_LABELS,
} from '../../types/emailActivity';

/**
 * ‼ שדות שהשרת ממלא ({{requestList}}…) מוצגים בעריכה בשם בעברית — [רשימת הבקשות] — וחוזרים
 * לקוד לפני «עדכון התצוגה» ולפני השליחה. בחלון הזה {{clientName}} הוא תמיד מי שמקבל את
 * המייל (הלקוח, או הגורם החיצוני) — ולכן «שם הנמען».
 */
const FIELD_LABELS: Record<string, string> = { ...TEMPLATE_FIELD_LABELS, '{{clientName}}': 'שם הנמען' };
const toDraft = (t: string) => templateToLabels(t, FIELD_LABELS);
const fromDraft = (t: string) => templateFromLabels(t, FIELD_LABELS);

/** רשימות שהשרת בונה לכל לקוח. נמחקו מהנוסח ⇒ המייל יוצא בלעדיהן (אין להן בלוק חלופי). */
const LIST_FIELDS = ['{{requestList}}', '{{documentList}}'] as const;

interface Props {
  /** גוף הבקשה לפונקציה (requestId/stage/signerId/clientId/stepId…). */
  body?: Record<string, unknown>;
  /** פונקציית השרת שבונה ושולחת. ברירת מחדל — מייל הייצוג. */
  fn?: string;
  /**
   * עריכה לפני שליחה — נושא וגוף. התצוגה נבנית מחדש בשרת אחרי כל עריכה,
   * ולכן מה שרואים אחרי "עדכון התצוגה" הוא בדיוק מה שיישלח.
   */
  editable?: boolean;
  /**
   * מייל שנבנה כבר בדפדפן (תזכורת הצעת מחיר) — מוצג כמו שהוא, בלי קריאת
   * תצוגה מקדימה לשרת. הולך יד ביד עם sendVia.
   */
  preloaded?: Loaded;
  /** שליחה חלופית, כשהמייל לא יוצא דרך send-onboarding-email. null = הצליח. */
  sendVia?: () => Promise<string | null>;
  /** כותרת החלון — מה המייל הזה. */
  heading: string;
  onClose: () => void;
  /**
   * נקרא אחרי שליחה מוצלחת. ‼ גם כשהשרת אמר «כבר נשלח קודם» או «לא ידוע אם
   * יצא» — אבל רק בסגירת החלון, כדי שהמשפט ייקרא לפני שהמארח סוגר ומרענן.
   */
  onSent: () => void;
  /**
   * צפייה בלבד — כשהשליחה עצמה שייכת לכפתור אחר שגם מעדכן את מצב התהליך
   * (למשל מייל החתימה, שנשלח לכל החותמים ומסמן שההוראות לב"ל יצאו).
   */
  readOnly?: boolean;
  /**
   * נוסח ששמור על הבקשה עצמה (נושא/גוף של בקשה לגורם חיצוני). נטען לתוך
   * התצוגה המקדימה הראשונה, ומשם ממשיך כרגיל — אפשר לערוך לפני השליחה.
   * ‼ שדה ריק אינו נשלח כדריסה: השרת מפרש '' כ"נושא ריק" ולא כ"אין ערך",
   * ובקשה ששמור לה רק נושא הייתה יוצאת בלי גוף בכלל.
   */
  initialOverrides?: { subject?: string; body?: string };
  /**
   * הודעה ללקוח דרך השרת (214, send-process-open-email): סוג ההודעה. כשמוגדר —
   * מפתח אחד לחלון (לחיצה כפולה וניסיון חוזר מאותו חלון הם אותו מייל), טביעת
   * הפריטים מהתצוגה נשלחת בחזרה (שינוי בינתיים ⇒ items_changed והתצוגה נטענת
   * מחדש), והשגיאות מתורגמות במשפט.
   */
  noticeKind?: NoticeKind;
}

interface Loaded { subject: string; to: string; from?: string; html: string; bodyText?: string; }

/**
 * מה קרה אחרי «שלח ללקוח» — רק מה שהשרת אמר. ‼ «המייל נשלח אל…» רק על שליחה
 * שקרתה עכשיו; «כבר נשלח קודם» אינו «נשלח», ו«לא ידוע אם יצא» אינו «לא נשלח».
 */
type Outcome =
  | { kind: 'sent'; logged: boolean }
  | { kind: 'already' }
  /** retry — אין תשובה מהשרת על הודעה: לחיצה נוספת כאן היא אותו מייל (אותו מפתח), ולכן הכפתור נשאר. */
  | { kind: 'unknown'; text: string; retry?: boolean }
  | { kind: 'inflight' }
  /**
   * לא נשלח, ולא כשל: הכול כבר נמסר (nothing_to_announce), או שמייל אחר ללקוח יוצא ממש
   * עכשיו (retry — הכפתור נשאר, ובעוד רגע אפשר לשלוח).
   */
  | { kind: 'note'; text: string; retry?: boolean };

const ERROR_TEXT: Record<string, string> = {
  'no client email': 'אין כתובת מייל ללקוח בבקשה הזו.',
  no_recipient_email: 'אין כתובת מייל לנמען.',
  'not found': 'הבקשה לא נמצאה.',
  unauthorized: 'ההתחברות פגה - יש להיכנס מחדש.',
  forbidden: 'אין הרשאה לפעולה הזו מהחשבון הזה.',
  server_not_updated: 'השרת עוד לא עודכן לגרסה הזו.',
  'signer not found': 'לא נמצא חותם עם כתובת מייל.',
  missing_reference_number: 'חסר מספר אסמכתא של הביטוח הלאומי.',
  resend_failed: 'שרת המייל דחה את השליחה.',
  resend_unreachable: 'שירות המייל לא היה זמין.',
  quotation_not_approved: 'ההצעה עוד לא אושרה.',
  bad_kind: 'סוג המייל אינו מוכר.',
};

/**
 * גוף התשובה — גם כשהשרת ענה בקוד שאינו 2xx: supabase-js מחזיר אז רק
 * "non-2xx status code" ומסתיר את הגוף, והסיבה האמיתית (אין מייל, חסרה אסמכתא)
 * יושבת שם. null — אין גוף (החיבור נפל, או שער שענה בלי JSON).
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

/** גוף התשובה של הודעה ללקוח. ‼ null (אין תשובה) — sendOutcome אומר «לא ידוע», לא «לא נשלח». */
async function noticeBody(data: any, error: any): Promise<NoticeSendResult | null> {
  if (data && !error) return data as NoticeSendResult;
  const b = await readBody(data, error);
  return b ? ({ ok: false, ...b } as NoticeSendResult) : null;
}

export default function EmailPreviewDialog({ body, fn, editable, preloaded, sendVia, heading, onClose, onSent, readOnly, initialOverrides, noticeKind }: Props) {
  // ‼ מפתח אחד לכל פתיחה של החלון — לא לכל לחיצה. כך «שלח» פעמיים הוא מייל אחד.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [fingerprint, setFingerprint] = useState<string | undefined>(undefined);
  const noticeExtras = noticeKind ? { kind: noticeKind } : {};
  const [loaded, setLoaded] = useState<Loaded | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // ‼ «אין תשובה» על הודעה — לא נגמר: אותו מפתח, ולכן לחיצה נוספת לא תשלח פעמיים.
  // מייל אחר בתנועה — גם לא נגמר: בעוד רגע שולחים מכאן.
  const finished = outcome !== null && !((outcome.kind === 'unknown' || outcome.kind === 'note') && outcome.retry);
  const [refreshing, setRefreshing] = useState(false);
  // הטיוטה נטענת מהתצוגה המקדימה הראשונה — הנוסח שהשרת באמת מייצר. ‼ בטיוטה השדות בעברית
  // ([רשימת הבקשות]); לשרת הם חוזרים כקוד (fromDraft).
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [dirty, setDirty] = useState(false);
  /** הנוסח שהשרת החזיר בפעם הראשונה (בקוד) — כדי לדעת אם נמחקה ממנו רשימה. */
  const [baseBody, setBaseBody] = useState('');

  const fnName = fn ?? 'send-onboarding-email';
  const overrides = editable ? { subject: fromDraft(draftSubject), body: fromDraft(draftBody) } : undefined;
  // ‼ רשימה שנמחקה מהנוסח — המייל ייצא בלעדיה. ב«הקישור לדף» השרת מוסיף אותה בבלוק משלו.
  const droppedLists = editable && noticeKind && noticeKind !== 'update'
    ? LIST_FIELDS.filter(t => baseBody.includes(t) && !(overrides?.body ?? '').includes(t))
    : [];

  /**
   * למה התצוגה המקדימה לא נבנתה. ‼ הודעה ללקוח — דרך noticePreviewErrorText (אותם
   * משפטים כמו בשליחה); בשום מקרה לא הודעת מסד נתונים או קוד באנגלית.
   */
  async function previewErrText(data: any, error: any): Promise<string> {
    const b = await readBody(data, error);
    return noticeKind ? noticePreviewErrorText(b) : errorTextFromBody(b, ERROR_TEXT, PREVIEW_FAILED_TEXT);
  }

  async function loadPreview(withOverrides?: { subject: string; body: string }) {
    if (!body) return;
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { ...body, ...noticeExtras, preview: true, ...(withOverrides ? { overrides: withOverrides } : {}) },
      });
      if (error || !data?.ok) { setError(await previewErrText(data, error)); return; }
      setError(null);
      if (noticeKind) setFingerprint(typeof data.fingerprint === 'string' ? data.fingerprint : undefined);
      setLoaded({ subject: data.subject, to: data.to, from: data.from, html: data.html, bodyText: data.bodyText });
      if (!withOverrides) {
        setDraftSubject(toDraft(data.subjectText ?? data.subject ?? ''));
        setDraftBody(toDraft(data.bodyText ?? ''));
        setBaseBody(String(data.bodyText ?? ''));
      }
      setDirty(false);
    } catch (e) {
      console.warn('[email-preview]', e);
      setError(PREVIEW_FAILED_TEXT);
    }
  }

  useEffect(() => {
    if (preloaded || !body) return;
    let alive = true;
    (async () => {
      try {
        /* רק שדות שיש בהם תוכן. השרת ממזג overrides ?? saved ?? base, ולכן
           מפתח חסר נופל לנוסח הנגזר — בדיוק ההתנהגות של בקשה בלי נוסח שמור. */
        const seeded: { subject?: string; body?: string } = {};
        if (initialOverrides?.subject?.trim()) seeded.subject = initialOverrides.subject;
        if (initialOverrides?.body?.trim()) seeded.body = initialOverrides.body;
        const hasSeed = Object.keys(seeded).length > 0;
        const { data, error } = await supabase.functions.invoke(fnName, {
          body: { ...body, ...noticeExtras, preview: true, ...(hasSeed ? { overrides: seeded } : {}) },
        });
        if (!alive) return;
        if (error || !data?.ok) {
          const text = await previewErrText(data, error);
          if (alive) setError(text);
        } else {
          if (noticeKind) setFingerprint(typeof data.fingerprint === 'string' ? data.fingerprint : undefined);
          setLoaded({ subject: data.subject, to: data.to, from: data.from, html: data.html, bodyText: data.bodyText });
          setDraftSubject(toDraft(data.subjectText ?? data.subject ?? ''));
          setDraftBody(toDraft(data.bodyText ?? ''));
          setBaseBody(String(data.bodyText ?? ''));
        }
      } catch (e) {
        console.warn('[email-preview]', e);
        if (alive) setError(PREVIEW_FAILED_TEXT);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPreview() {
    setRefreshing(true);
    await loadPreview({ subject: fromDraft(draftSubject), body: fromDraft(draftBody) });
    setRefreshing(false);
  }

  async function send() {
    setSending(true);
    setError(null);
    setOutcome(null);
    try {
      if (sendVia) {
        const failure = await sendVia();
        // ‼ המארח מעביר רק משפט — המשפט של השרת ל-unknown_outcome הוא «לא ידוע», לא כשל.
        if (failure && isUnknownSendReply(failure)) {
          setOutcome({ kind: 'unknown', text: unknownSendText() });
          return;
        }
        // ‼ משפט באנגלית / קוד (למשל «Failed to send a request to the Edge Function») — השרת לא
        // אמר שהמייל לא יצא: כתום «לא ידוע», לא תיבה אדומה עם טקסט באנגלית (sendErrorView).
        if (failure) {
          const view = sendErrorView(failure);
          if (view.tone === 'unknown') setOutcome({ kind: 'unknown', text: view.text });
          else setError(view.text);
          return;
        }
        setOutcome({ kind: 'sent', logged: true });
        onSent();
        return;
      }
      if (!body) { setError('אין מה לשלוח.'); return; }
      if (noticeKind) {
        const { data, error } = await supabase.functions.invoke(fnName, {
          body: {
            ...body, kind: noticeKind, idempotencyKey,
            ...(fingerprint !== undefined ? { expectedFingerprint: fingerprint } : {}),
            ...(overrides ? { overrides } : {}),
          },
        });
        const r = await noticeBody(data, error);
        const o = sendOutcome(r);
        if (o === 'sent' || o === 'unlogged') { setOutcome({ kind: 'sent', logged: o === 'sent' }); onSent(); return; }
        if (o === 'already') { setOutcome({ kind: 'already' }); return; }
        // ‼ הכול כבר נמסר / מייל אחר בתנועה — לא «לא נשלח» באדום (noticeErrorText אומר מה ומה הלאה).
        if (o === 'nothing') { setOutcome({ kind: 'note', text: noticeErrorText(r!) }); return; }
        if (o === 'busy') { setOutcome({ kind: 'note', text: noticeErrorText(r!), retry: true }); return; }
        // ‼ אין תשובה מהשרת — אולי יצא. הכפתור נשאר: אותו מפתח, ולכן לחיצה נוספת לא תשלח פעמיים.
        // (המארח מתרענן בסגירה — יש מארחים שסוגרים את החלון ב-onSent.)
        if (o === 'noanswer' || !r) { setOutcome({ kind: 'unknown', text: `${NO_ANSWER_TEXT} ${NO_ANSWER_RETRY_TEXT}`, retry: true }); return; }
        // ‼ לא ידוע אם יצא: לחיצה נוספת כאן (אותו מפתח) לא תשלח — ההכרעה בשורה שבמגש.
        if (o === 'unknown') { setOutcome({ kind: 'unknown', text: noticeErrorText(r) }); return; }
        if (o === 'inflight') { setOutcome({ kind: 'inflight' }); return; }
        // ‼ מכאן — השרת אמר שהמייל לא יצא; הכפתור נשאר.
        // משהו השתנה מאז התצוגה — טוענים אותה מחדש (עם הנוסח שנערך), והלחיצה הבאה שולחת את מה שרואים.
        if (r.error === 'items_changed') await loadPreview(editable ? { subject: fromDraft(draftSubject), body: fromDraft(draftBody) } : undefined);
        setError(noticeErrorText(r));
        return;
      }
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { ...body, ...(overrides ? { overrides } : {}) },
      });
      if (error || !data?.ok) {
        const b = await readBody(data, error);
        // ‼ in_flight — חלון אחר שולח את אותו מייל ממש עכשיו; זה לא כשל.
        if (b?.error === 'in_flight') { setOutcome({ kind: 'inflight' }); return; }
        // ‼ השרת אמר במפורש «לא ידוע אם יצא» (unknown_outcome; או resend_unreachable
        // משרת ישן). retrySafe — השרת שלח במפתח קבוע, ולכן «שלח ללקוח» נשאר: לחיצה
        // נוספת לא תשלח פעמיים. בלי מפתח — בלי כפתור, והצעד הבטוח הוא לברר עם הנמען.
        if (isUnknownSendReply(b)) {
          const retrySafe = b?.retrySafe === true;
          setOutcome({ kind: 'unknown', text: unknownSendText({ retrySafe, button: 'שלח ללקוח' }), retry: retrySafe });
          return;
        }
        // ‼ אין תשובה / 5xx בלי קוד מוכר — אולי יצא. אין כאן מפתח שמונע כפילות, ולכן בלי כפתור.
        if (isUnknownEmailFailure(b, httpStatus(error), ERROR_TEXT)) { setOutcome({ kind: 'unknown', text: EMAIL_NO_ANSWER_TEXT }); return; }
        setError(errorTextFromBody(b, ERROR_TEXT, 'השליחה נכשלה — המייל לא נשלח.'));
        return;
      }
      // ‼ השרת לא שלח (כבר נשלח קודם, באותה כתובת או בכתובת שהייתה אז) — לא «נשלח אל».
      if (data.alreadySent) { setOutcome({ kind: 'already' }); return; }
      setOutcome({ kind: 'sent', logged: data.logged !== false });
      onSent();
    } catch (e) {
      // ‼ נפל באמצע — אין תשובה מהשרת, ולכן גם לא «לא נשלח».
      console.warn('[email-send]', e);
      setOutcome(noticeKind
        ? { kind: 'unknown', text: `${NO_ANSWER_TEXT} ${NO_ANSWER_RETRY_TEXT}`, retry: true }
        : { kind: 'unknown', text: EMAIL_NO_ANSWER_TEXT });
    } finally {
      setSending(false);
    }
  }

  // ‼ «כבר נשלח קודם» / «לא ידוע אם יצא» — המצב בשרת שונה ממה שהמארח מציג.
  // מרעננים אותו בסגירה, ולא מיד, כי יש מארחים שסוגרים את החלון ב-onSent.
  const close = () => {
    if (outcome?.kind === 'already' || outcome?.kind === 'unknown' || outcome?.kind === 'note') onSent();
    onClose();
  };
  const outcomeBox: React.CSSProperties = { padding: '.6rem .9rem', fontSize: '.85rem' };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{heading}</h3>
            <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: 2 }}>
              {loaded
                ? <>אל <span dir="ltr">{loaded.to}</span> · נושא: {loaded.subject}</>
                : 'בונה את המייל…'}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>✕</button>
        </div>

        {/* ‼ האמצע נגלל — הכותרת וכפתור השליחה נשארים גלויים, גם בטלפון כשהנוסח פתוח לעריכה. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {editable && loaded && !finished && (
            <div style={{ padding: '.7rem .9rem', borderBottom: '1px solid var(--hairline-2)', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <label style={{ fontSize: '.78rem', color: 'var(--gray-600)' }}>
                נושא המייל
                <input
                  value={draftSubject}
                  onChange={e => { setDraftSubject(e.target.value); setDirty(true); }}
                  style={{ marginTop: 3, width: '100%' }}
                />
              </label>
              <label style={{ fontSize: '.78rem', color: 'var(--gray-600)' }}>
                גוף המייל
                <textarea
                  rows={7}
                  value={draftBody}
                  onChange={e => { setDraftBody(e.target.value); setDirty(true); }}
                  style={{ marginTop: 3, width: '100%', resize: 'vertical' }}
                />
              </label>
              {droppedLists.length > 0 && (
                <div style={{ fontSize: '.75rem', color: 'var(--warn, #b26a00)' }}>
                  בלי {droppedLists.map(t => `[${FIELD_LABELS[t]}]`).join(' ו')} בנוסח, המייל ייצא בלי הרשימה.
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <button type="button" className="btn btn-sm btn-secondary" disabled={refreshing || !dirty}
                  onClick={() => void refreshPreview()}>
                  {refreshing ? 'מרענן…' : 'עדכון התצוגה'}
                </button>
                <span style={{ fontSize: '.75rem', color: dirty ? 'var(--warn, #b26a00)' : 'var(--gray-500)' }}>
                  {dirty ? 'התצוגה למטה עדיין מציגה את הנוסח הקודם.' : 'התצוגה למטה היא המייל שיישלח.'}
                </span>
              </div>
            </div>
          )}

          <div style={{ flex: '1 0 auto', overflow: 'hidden', background: 'var(--gray-100, #eee)', minHeight: 220 }}>
            {loaded ? (
              <iframe
                title="תצוגה מקדימה של המייל"
                srcDoc={withExternalLinks(loaded.html)}
                sandbox={EMAIL_PREVIEW_SANDBOX}
                style={{ width: '100%', height: '62vh', border: 'none', background: '#fff' }}
              />
            ) : (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray-500)', fontSize: '.9rem' }}>
                {error ? '' : 'טוען את המייל…'}
              </div>
            )}
          </div>
        </div>

        {/* ‼ מה קרה בשליחה — מחוץ לאזור הנגלל: תמיד גלוי מעל הכפתורים. */}
        {error && (
          <div style={{ padding: '.6rem .9rem', background: 'var(--red-light)', color: 'var(--red)', fontSize: '.85rem' }}>
            {error}
          </div>
        )}
        {outcome?.kind === 'sent' && outcome.logged && (
          <InfoLines
            style={{ ...outcomeBox, background: 'var(--green-light, #eaf6f1)', color: 'var(--ok, #17845b)' }}
            items={[
              loaded ? <>המייל נשלח אל <span dir="ltr">{loaded.to}</span></> : 'המייל נשלח',
              'הוא מופיע ברשימת המיילים של הלקוח',
            ]} />
        )}
        {outcome?.kind === 'sent' && !outcome.logged && (
          <InfoLines
            style={{ ...outcomeBox, background: 'var(--warn-bg, #fff4e0)', color: 'var(--warn, #b26a00)' }}
            items={[noticeKind ? SENT_UNLOGGED_TEXT : 'המייל יצא, אבל לא נרשם ביומן.']} />
        )}
        {outcome?.kind === 'already' && (
          <InfoLines style={{ ...outcomeBox, background: 'var(--surface-2)', color: 'var(--ink-2)' }} items={[ALREADY_SENT_TEXT]} />
        )}
        {outcome?.kind === 'unknown' && (
          <InfoLines style={{ ...outcomeBox, background: 'var(--warn-bg, #fff4e0)', color: 'var(--warn, #b26a00)' }} items={[outcome.text]} />
        )}
        {outcome?.kind === 'inflight' && (
          <InfoLines style={{ ...outcomeBox, background: 'var(--surface-2)', color: 'var(--ink-2)' }} items={[IN_FLIGHT_TEXT]} />
        )}
        {outcome?.kind === 'note' && (
          <InfoLines style={{ ...outcomeBox, background: 'var(--surface-2)', color: 'var(--ink-2)' }} items={[outcome.text]} />
        )}

        <div className="modal-footer">
          {loaded && !finished && (
            <button type="button" className="btn btn-secondary" onClick={() => {
              const w = window.open('', '_blank');
              if (w) { w.document.write(loaded.html); w.document.close(); }
            }}>פתיחה בכרטיסייה חדשה</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={close}>{outcome || readOnly ? 'סגירה' : 'ביטול'}</button>
          {!finished && !readOnly && (
            <button type="button" className="btn btn-primary" disabled={!loaded || sending} onClick={send}>
              {sending ? 'שולח…' : 'שלח ללקוח'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
