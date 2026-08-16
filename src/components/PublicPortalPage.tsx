// ─── הדף האישי של הלקוח (?portal=TOKEN) ─────────────────────────────────────
// קישור אחד קבוע לכל תקופת הקליטה: מה הושלם, מה ממתין ללקוח (עם כפתור לכל
// פעולה), מה בטיפול המשרד, ומה יופיע בהמשך. כל תזכורת שולחת שוב את אותו
// קישור — והדף תמיד מציג את המצב העדכני.
//
// ‼ הדף הוא מפה, לא מפתח-על: הפעולות עצמן ממשיכות דרך הקישורים הממודרים
// הקיימים (?onboard= / ?sign= / ?intake= / כתובות פייפרלס). השרת
// (get_client_portal) הוא שמחליט מה מוצג — העמוד רק מצייר.
//
// ‼ מיתוג המשרד, לא PIVO — כמו כל מה שהלקוח רואה.

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';

interface Props {
  token: string;
}

type Bucket = 'action' | 'office' | 'done' | 'future';

/** תצוגה מקדימה לרו"ח: אותו עמוד בדיוק, בלי פעולות חיות. */
const PreviewCtx = createContext(false);

/** תג טיוטה — מופיע רק בתצוגה המקדימה, על בקשות שטרם פורסמו. */
function DraftChip() {
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.6,
      padding: '0 7px', borderRadius: 999, whiteSpace: 'nowrap',
      color: '#b45309', background: '#fff7ed', border: '1px solid #fbbf77',
    }}>טיוטה</span>
  );
}

/** תג "יוסר" — מופיע רק בתצוגה המקדימה (מיגרציה 101), על בקשות שסומנו
 *  להסרה בעדכון הבא. הפריט עצמו עדיין מוצג — כדי שהעורך יראה מה נעלם. */
function RemovingChip() {
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.6,
      padding: '0 7px', borderRadius: 999, whiteSpace: 'nowrap',
      color: '#a63a3a', background: '#fdeaea', border: '1px solid #e8b4b4',
      textDecoration: 'line-through',
    }}>יוסר</span>
  );
}

export interface PortalItem {
  bucket: Bucket;
  key: string;
  label: string;
  sub?: string;
  /** 'portal' = הפעולה נעשית כאן בעמוד, בלי לנווט לטוקן אחר. */
  actionKind?: 'onboard' | 'sign' | 'intake' | 'external' | 'quote' | 'portal';
  actionValue?: string;
  /** מה בדיוק הפעולה בתוך העמוד. */
  kind?: 'documents' | 'prev_accountant' | 'custom' | 'paperless_signup';
  /** קישור יוצא שנלווה לפעולה בעמוד (הרשמה לפייפרלס). אינו מחליף את ההשלמה. */
  linkUrl?: string;
  /** רשימת המסמכים שביקשנו — מה התקבל ומה עוד חסר. */
  checklist?: { key: string; label: string; done: boolean }[];
  /** דרישות של בקשה חופשית — שדות בתוך בקשה אחת, כל אחד עם סוג ו-חובה/רשות. */
  requirements?: {
    key: string;
    kind: 'confirm' | 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'file' | 'files';
    label: string;
    done: boolean;
    required?: boolean;
    options?: string[];
    maxFiles?: number;
    fileCount?: number;
    value?: string;
  }[];
  /** יש כאן פריט שאפשר להעלות אליו קובץ. */
  canUpload?: boolean;
  /** טקסט הכפתור שהרו"ח בחר לבקשה החופשית. */
  cta?: string;
  /** מסומן רק בתצוגה המקדימה של הרו"ח — בקשה שטרם פורסמה ללקוח. */
  draft?: boolean;
  /** מסומן רק בתצוגה המקדימה — בקשה שסומנה להסרה בעדכון הבא (מיגרציה 101). */
  removing?: boolean;
}

/** מה שהדף מרשה להעלות. אותה רשימה נאכפת שוב בשרת — כאן זה רק כדי לחסוך
 *  ללקוח העלאה שתידחה, ולא כהגנה. */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.csv,.doc,.docx';

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: 'הקובץ גדול מדי — עד 10MB.',
  type_not_allowed: 'סוג הקובץ הזה לא נתמך. אפשר PDF, תמונה, אקסל או וורד.',
  rate_limited: 'הועלו הרבה קבצים בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.',
  not_published: 'הבקשה הזאת עדיין לא נפתחה.',
};

/** שלב המסע כפי שהשרת שולח — כבר לא מוצג כפס התקדמות (הכרעת מוצר: הדף מציג
 *  רק "מה צריך ממך", לא מיפוי פנימי של איפה הלקוח נמצא בתהליך המשרד). השדה
 *  נשאר בטיפוס כי get_client_portal עדיין מחזיר אותו. */
type JourneyStage = 'quote' | 'identity' | 'setup' | 'active';

export interface PortalData {
  clientFirstName: string;
  firmName: string;
  branding: FirmBranding;
  done: number;
  total: number;
  journeyStage?: JourneyStage;
  items: PortalItem[];
}

type Phase = 'loading' | 'invalid' | 'ready';

/** קישור הפעולה — טוקנים הופכים לכתובת באותו origin, חיצוני נשאר כמו שהוא. */
function actionHref(item: PortalItem): string | null {
  if (!item.actionKind || !item.actionValue) return null;
  switch (item.actionKind) {
    case 'onboard':  return `${window.location.origin}/?onboard=${item.actionValue}`;
    case 'sign':     return `${window.location.origin}/?sign=${item.actionValue}`;
    case 'intake':   return `${window.location.origin}/?intake=${item.actionValue}`;
    case 'quote':    return `${window.location.origin}/?quote=${item.actionValue}`;
    case 'external': return item.actionValue;
    // 'portal' מטופל בעמוד עצמו ואין לו כתובת.
    default: return null;
  }
}

/**
 * העלאת קובץ כנגד פריט אחד. משרתת גם את הלקוח (?portal=) וגם את הרו"ח הקודם
 * (?release=) — אותה פונקציית שרת, רק tokenKind אחר.
 *
 * ‼ הקובץ נכנס ישירות לתיק של הלקוח אצל הרו"ח ומסמן את הפריט. אין שלב ביניים
 * של "ממתין לאישור" — מה שהגיע, הגיע, וההחלטה אם הוא תקין נשארת אצל הרו"ח.
 */
function UploadItem({ token, tokenKind, stepId, itemKey, label, done, brand, accent, onDone }: {
  token: string; tokenKind: 'portal' | 'release';
  stepId: string; itemKey: string; label: string; done: boolean;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const previewMode = useContext(PreviewCtx);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputId = `up-${stepId}-${itemKey}`;

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    const form = new FormData();
    form.append('token', token);
    form.append('tokenKind', tokenKind);
    form.append('stepId', stepId);
    form.append('itemKey', itemKey);
    form.append('file', file);
    const { data, error } = await supabase.functions.invoke('portal-upload-document', { body: form });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      setErr(UPLOAD_ERRORS[res?.error ?? ''] ?? 'ההעלאה נכשלה. אפשר לנסות שוב.');
      return;
    }
    flushAccountantNotifications(token);
    onDone();
  }

  return (
    <li style={{ display: 'grid', gap: 4, padding: '3px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ color: done ? accent : brand.muted }}>{done ? '✓' : '○'}</span>
        <span style={{
          flex: 1, minWidth: 120, fontSize: 13,
          color: done ? brand.muted : brand.ink,
          textDecoration: done ? 'line-through' : 'none',
        }}>{label}</span>
        {!done && !previewMode && (
          <>
            <input id={inputId} type="file" accept={ACCEPT} disabled={busy}
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <label htmlFor={inputId} style={{
              flexShrink: 0, cursor: busy ? 'default' : 'pointer',
              fontSize: 12.5, fontWeight: 600, padding: '2px 0',
              color: busy ? brand.muted : accent, opacity: busy ? .6 : 1,
            }}>{busy ? 'מעלה…' : 'העלאה'}</label>
          </>
        )}
      </div>
      {err && (
        <span style={{ fontSize: 12, color: '#a63a3a', paddingInlineStart: 18 }}>
          {err}
        </span>
      )}
    </li>
  );
}

/** בקשה חופשית — כל דרישה והפעולה שלה. */
function CustomRequestBlock({ token, item, brand, accent, onDone }: {
  token: string; item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const previewMode = useContext(PreviewCtx);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const stepId = item.actionValue!;

  async function submit(key: string, value?: string) {
    setErr(null);
    setBusyKey(key);
    const { data, error } = await supabase.rpc('portal_submit_step', {
      p_token: token, p_step_id: stepId, p_data: value !== undefined ? { key, value } : { key },
    });
    setBusyKey(null);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      const messages: Record<string, string> = {
        missing_value: 'צריך למלא תשובה.',
        bad_email: 'כתובת האימייל לא נראית תקינה.',
        bad_phone: 'מספר הטלפון לא נראה תקין.',
        bad_number: 'צריך להזין מספר.',
        bad_date: 'התאריך לא נראה תקין.',
        bad_choice: 'צריך לבחור אחת מהאפשרויות.',
      };
      setErr(messages[res?.error ?? ''] ?? 'לא הצלחנו לשמור. אפשר לנסות שוב.');
      return;
    }
    flushAccountantNotifications(token);
    onDone();
  }

  const field = {
    flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13.5, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  /** תווית + סימון רשות. שדות רשות לא חוסמים את השלמת הבקשה. */
  const labelOf = (r: NonNullable<PortalItem['requirements']>[number]) => (
    <>
      {r.label}
      {r.required === false && <span style={{ color: brand.muted }}> (רשות)</span>}
    </>
  );

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {(item.requirements ?? []).map(r => {
        // 'files' נשאר פתוח להעלאות נוספות גם אחרי הקובץ הראשון — עד התקרה.
        if (r.kind === 'files') {
          const count = r.fileCount ?? 0;
          const canAddMore = !r.maxFiles || count < r.maxFiles;
          return (
            <div key={r.key} style={{ display: 'grid', gap: 2 }}>
              {count > 0 && (
                <span style={{ fontSize: 12.5, color: brand.muted }}>
                  <span aria-hidden="true" style={{ color: accent }}>✓ </span>
                  {r.label} · {count === 1 ? 'הועלה קובץ אחד' : `הועלו ${count} קבצים`}
                  {r.maxFiles ? ` מתוך ${r.maxFiles}` : ''}
                </span>
              )}
              {canAddMore && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  <UploadItem token={token} tokenKind="portal" stepId={stepId} itemKey={r.key}
                    label={count > 0 ? 'קובץ נוסף' : r.label} done={false}
                    brand={brand} accent={accent} onDone={onDone} />
                </ul>
              )}
            </div>
          );
        }
        if (r.done) {
          return (
            <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: brand.muted }}>
              <span aria-hidden="true" style={{ color: accent }}>✓</span>
              <span style={{ textDecoration: 'line-through' }}>{r.label}</span>
              {r.value && <span style={{ color: brand.ink }}>· {r.value}</span>}
            </div>
          );
        }
        if (r.kind === 'file') {
          return (
            <ul key={r.key} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              <UploadItem token={token} tokenKind="portal" stepId={stepId} itemKey={r.key}
                label={r.label} done={false} brand={brand} accent={accent} onDone={onDone} />
            </ul>
          );
        }
        if (r.kind === 'select') {
          return (
            <div key={r.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select style={field} value={text[r.key] ?? ''} disabled={busyKey === r.key || previewMode}
                  onChange={e => setText(t => ({ ...t, [r.key]: e.target.value }))}>
                  <option value="" disabled>בחרו…</option>
                  {(r.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <button type="button"
                  disabled={previewMode || busyKey === r.key || !(text[r.key] ?? '').trim()}
                  onClick={() => void submit(r.key, text[r.key])}
                  style={btn(accent, brand.radius, busyKey === r.key || previewMode)}>
                  {busyKey === r.key ? 'שומר…' : 'שליחה'}
                </button>
              </div>
            </div>
          );
        }
        if (['text', 'email', 'phone', 'number', 'date'].includes(r.kind)) {
          const inputType = r.kind === 'text' ? 'text'
            : r.kind === 'email' ? 'email'
            : r.kind === 'phone' ? 'tel'
            : r.kind === 'number' ? 'number' : 'date';
          const ltr = ['email', 'phone', 'number', 'date'].includes(r.kind);
          return (
            <div key={r.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  style={{ ...field, ...(ltr ? { direction: 'ltr' as const, textAlign: 'right' as const } : {}) }}
                  type={inputType}
                  inputMode={r.kind === 'number' ? 'decimal' : r.kind === 'phone' ? 'tel' : undefined}
                  value={text[r.key] ?? ''} disabled={busyKey === r.key || previewMode}
                  onChange={e => setText(t => ({ ...t, [r.key]: e.target.value }))} />
                <button type="button"
                  disabled={previewMode || busyKey === r.key || !(text[r.key] ?? '').trim()}
                  onClick={() => void submit(r.key, text[r.key])}
                  style={btn(accent, brand.radius, busyKey === r.key || previewMode)}>
                  {busyKey === r.key ? 'שומר…' : 'שליחה'}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span aria-hidden="true" style={{ color: brand.muted }}>○</span>
            <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
            <button type="button" disabled={busyKey === r.key || previewMode}
              onClick={() => void submit(r.key)}
              style={btn(accent, brand.radius, busyKey === r.key || previewMode)}>
              {busyKey === r.key ? 'שומר…' : (item.cta || 'מאשר/ת')}
            </button>
          </div>
        );
      })}
      {err && <span style={{ fontSize: 12, color: '#a63a3a' }}>{err}</span>}
    </div>
  );
}

function btn(accent: string, radius: number, busy: boolean): React.CSSProperties {
  return {
    flexShrink: 0, border: 'none', cursor: busy ? 'default' : 'pointer',
    fontSize: 12.5, fontWeight: 600, padding: '7px 16px',
    color: '#fff', background: accent, borderRadius: radius, opacity: busy ? .6 : 1,
  };
}

/** שורת התקדמות קצרה מתחת לכותרת — נגזרת מהפריטים, לא שדה שמור. */
function progressLine(item: PortalItem): string | undefined {
  if (item.checklist?.length) {
    const done = item.checklist.filter(c => c.done).length;
    return `${done} מתוך ${item.checklist.length} התקבלו`;
  }
  if (item.requirements?.length) {
    const done = item.requirements.filter(r => r.done).length;
    return `${done} מתוך ${item.requirements.length} הושלמו`;
  }
  return item.sub;
}

/**
 * כרטיס פעולה אחת שממתינה ללקוח — כותרת, שורת התקדמות, כפתור אחד.
 * ‼ יחידת התצוגה הראשית היא הקבוצה, לא הפריט הבודד: הצ'קליסט/הדרישות/טופס
 * הרו"ח הקודם נפתחים רק בלחיצה. גרסה קודמת פרשה את כל השורות תמיד — שבע
 * שורות מסמכים גלויות מיד הן בדיוק העומס שהמודל המאוחד בא לצמצם.
 */
function ActionItem({ token, item, brand, accent, last, onDone }: {
  token: string; item: PortalItem; last: boolean;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const previewMode = useContext(PreviewCtx);
  const [open, setOpen] = useState(false);
  const href = actionHref(item);
  const inPage = item.actionKind === 'portal';
  const expandable = inPage && (item.kind === 'documents' || item.kind === 'custom' || item.kind === 'prev_accountant');
  const signup = inPage && item.kind === 'paperless_signup';
  const prog = progressLine(item);

  const primaryBtn: React.CSSProperties = {
    display: 'inline-block', flexShrink: 0, textDecoration: 'none', cursor: 'pointer', border: 'none',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', color: '#fff', background: accent, borderRadius: brand.radius,
  };
  const inertBtn: React.CSSProperties = { ...primaryBtn, opacity: .55, cursor: 'default', pointerEvents: 'none' };

  const primaryLabel = item.cta || (
    item.kind === 'documents' ? (open ? 'סגירה' : 'המשך העלאה')
    : item.kind === 'custom' ? (open ? 'סגירה' : 'המשך')
    : item.kind === 'prev_accountant' ? (open ? 'סגירה' : 'למילוי')
    : 'להמשך'
  );

  return (
    <div style={{
      padding: '15px 16px', marginBottom: last ? 0 : 10,
      background: brand.cardBg, border: `1px solid ${brand.border}`, borderRadius: brand.radius + 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 650, color: brand.ink }}>{item.label}</span>
        {previewMode && item.draft && <DraftChip />}
        {previewMode && item.removing && <RemovingChip />}
      </div>
      {prog && <div style={{ fontSize: 12.5, color: brand.muted, marginTop: 3 }}>{prog}</div>}

      {/* ‼ הרשמה לפייפרלס אינה "נפתחת" — היא קישור החוצה ואישור, ולכן היא
          מוצגת ישירות ולא מאחורי כפתור פתיחה. */}
      {signup ? (
        <div style={{ marginTop: 11 }}>
          <PaperlessSignupBlock token={token} item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      ) : (
        <div style={{ marginTop: 11 }}>
          {href && (previewMode
            ? <span style={inertBtn}>להמשך ←</span>
            : <a href={href} style={primaryBtn}>להמשך ←</a>)}
          {expandable && (previewMode
            ? <span style={inertBtn}>{primaryLabel}</span>
            : <button type="button" onClick={() => setOpen(o => !o)} style={primaryBtn}>{primaryLabel}</button>)}
        </div>
      )}

      {/* ‼ מסמכים: הלקוח מעלה כאן, במקום. הקובץ נכנס ישר לתיק שלו אצל הרו"ח
          ומסמן את הפריט. מה שמגיע בוואטסאפ או במייל עדיין מסומן ידנית על ידי
          הרו"ח — שני הערוצים חיים זה לצד זה. */}
      {open && inPage && item.kind === 'documents' && !!item.checklist?.length && item.actionValue && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 2, borderTop: `1px dashed ${brand.border}`, paddingTop: 8 }}>
          {item.checklist.map(ci => (
            <UploadItem key={ci.key ?? ci.label} token={token} tokenKind="portal"
              stepId={item.actionValue!} itemKey={ci.key} label={ci.label} done={ci.done}
              brand={brand} accent={accent} onDone={onDone} />
          ))}
        </ul>
      )}

      {open && inPage && item.kind === 'custom' && item.actionValue && (
        <div style={{ borderTop: `1px dashed ${brand.border}`, paddingTop: 8, marginTop: 12 }}>
          <CustomRequestBlock token={token} item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      )}

      {open && inPage && item.kind === 'prev_accountant' && item.actionValue && (
        <div style={{ borderTop: `1px dashed ${brand.border}`, paddingTop: 8, marginTop: 12 }}>
          <PrevAccountantForm token={token} stepId={item.actionValue}
            brand={brand} accent={accent} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

/**
 * הרשמה לפייפרלס — הצעד היחיד ברצף שהוא של הלקוח.
 *
 * ‼ שני פקדים ולא אחד: הקישור פותח את ההרשמה בפייפרלס עצמה, והכפתור השני
 * הוא ההצהרה שהיא בוצעה. בלי ההצהרה הרו"ח היה צריך לנחש מתי להיכנס לחשבון —
 * וזה בדיוק מה שהמסך הזה בא לסגור.
 * ‼ אין כאן אימות מול פייפרלס, ולכן הניסוח הוא "נרשמתי" ולא "נרשם": מה
 * שנשמר הוא הצהרת הלקוח, והרו"ח יכול לפתוח את השלב מחדש אם התברר אחרת.
 */
function PaperlessSignupBlock({ token, item, brand, accent, onDone }: {
  token: string; item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const previewMode = useContext(PreviewCtx);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (previewMode || !item.actionValue) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('portal_submit_step', {
      p_token: token, p_step_id: item.actionValue, p_data: {},
    });
    const res = data as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (rpcError || !res?.ok) {
      setError('לא הצלחנו לשמור את האישור. אפשר לנסות שוב.');
      return;
    }
    onDone();
  }

  const linkBtn: React.CSSProperties = {
    display: 'inline-block', textDecoration: 'none', cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: '#fff', background: accent, border: 'none',
  };
  const confirmBtn: React.CSSProperties = {
    display: 'inline-block', cursor: previewMode || busy ? 'default' : 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: brand.ink, background: 'transparent', border: `1px solid ${brand.border}`,
    opacity: previewMode || busy ? .55 : 1,
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {item.linkUrl && (previewMode
        ? <span style={{ ...linkBtn, opacity: .55, pointerEvents: 'none' }}>לפתיחת החשבון ←</span>
        : <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>לפתיחת החשבון ←</a>)}
      <button type="button" style={confirmBtn} disabled={previewMode || busy} onClick={() => void confirm()}>
        {busy ? 'רגע…' : (item.cta || 'נרשמתי')}
      </button>
      {error && <div style={{ width: '100%', fontSize: 12.5, color: '#a63a3a' }}>{error}</div>}
    </div>
  );
}

/** טופס פרטי הרו"ח הקודם — הדבר היחיד שהלקוח כותב ישירות מהדף האישי. */
function PrevAccountantForm({ token, stepId, brand, accent, onDone }: {
  token: string; stepId: string;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim() && !email.trim()) { setErr('צריך לפחות שם או אימייל.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('portal_submit_step', {
      p_token: token, p_step_id: stepId, p_data: { name, email, phone },
    });
    setBusy(false);
    const res = data as { ok?: boolean } | null;
    if (error || !res?.ok) { setErr('לא הצלחנו לשמור. אפשר לנסות שוב.'); return; }
    flushAccountantNotifications(token);
    onDone();
  }

  const field = {
    width: '100%', padding: '8px 10px', fontSize: 14, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 420 }}>
      <input style={field} value={name} onChange={e => setName(e.target.value)}
        placeholder="שם רואה החשבון או המשרד" disabled={busy} />
      <input style={{ ...field, direction: 'ltr', textAlign: 'right' }} value={email} type="email"
        onChange={e => setEmail(e.target.value)} placeholder="אימייל" disabled={busy} />
      <input style={{ ...field, direction: 'ltr', textAlign: 'right' }} value={phone} type="tel"
        onChange={e => setPhone(e.target.value)} placeholder="טלפון (אופציונלי)" disabled={busy} />
      {err && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{err}</span>}
      <button type="button" onClick={() => void submit()} disabled={busy} style={{
        justifySelf: 'start', border: 'none', cursor: 'pointer',
        fontSize: 13.5, fontWeight: 600, padding: '9px 20px',
        color: '#fff', background: accent, borderRadius: brand.radius,
      }}>{busy ? 'שומר…' : 'שליחה'}</button>
    </div>
  );
}

/**
 * גוף הדף — מפריד בין "מאיפה הנתונים" ל"איך זה נראה", כדי שהתצוגה המקדימה
 * של הרו"ח תרנדר את אותו עמוד בדיוק (get_client_portal_preview) ולא חיקוי.
 * preview=true: הפעולות כבויות, טיוטות מסומנות. embed=true: בלי גובה עמוד מלא.
 */
export function PortalView({ data, token = '', preview = false, embed = false, onReload = () => {} }: {
  data: PortalData;
  token?: string;
  preview?: boolean;
  embed?: boolean;
  onReload?: () => void;
}) {
  const reload = onReload;
  const brand = deriveQuotationBrand({
    id: '', firmName: data.firmName, branding: data.branding ?? {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;

  const page: React.CSSProperties = {
    minHeight: embed ? undefined : '100vh', background: brand.pageBg,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: embed ? '18px 12px' : '40px 16px',
    fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '30px 30px 22px', borderTop: `4px solid ${accent}`,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 700, color: brand.muted, margin: '20px 0 4px', letterSpacing: '.02em',
  };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={data.firmName}
            style={{ maxHeight: 40 * brand.logoScale, maxWidth: 180 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: ink,
            }}>{brand.monogram}</div>
            <div style={{ fontSize: 14, color: ink }}>{data.firmName}</div>
          </>
        )}
      </div>
    );
  }

  // ‼ עבודת המשרד ("office") כן מוצגת, מ-2026-08-16 — בלי שום פקד. הלקוח
  // צריך לדעת שלושה דברים: מה עליו לעשות, מה אנחנו עושים עכשיו, ומה יקרה
  // אחר כך. קודם הושמט האמצעי מביניהם, והתוצאה הייתה שקט שנקרא כתקיעות:
  // "נרשמתי לפייפרלס — ומה עכשיו?" בלי תשובה על המסך.
  // ‼ הגבול שנשמר: office הוא מידע ולא מטלה, ולכן הוא שקט, אפור, ומתחת
  // ל"מה צריך ממך" — לעולם לא מתחרה בו.
  //
  // ‼ "future" — שלב שפורסם ועדיין נעול — כן מוצג, מ-2026-08-15. קודם הוא נזרק
  // כאן, והתוצאה הייתה שהלקוח לא ידע שיש המשך: "הרשאה לחיוב חודשי" פשוט הופיעה
  // יום אחד כאילו צצה משום מקום. עכשיו הוא רואה את השם האמיתי, שהוא נעול, ומה
  // יפתח אותו — מפת דרכים במקום הפתעות.
  // ‼ הגבול שנשאר: טיוטה אינה מגיעה לכאן בכלל (השרת מסנן לפי published_at),
  // ולכן "נעול" לעולם אינו חושף בקשה שהרו"ח עוד לא פרסם.
  const actions = data.items.filter(i => i.bucket === 'action');
  const office  = data.items.filter(i => i.bucket === 'office');
  const future  = data.items.filter(i => i.bucket === 'future');
  const done    = data.items.filter(i => i.bucket === 'done');
  const firstName = data.clientFirstName;

  return (
    <PreviewCtx.Provider value={preview}>
    <div style={page}>
      <div style={card}>
        <Header />

        <div style={{ fontSize: 19, fontWeight: 650, color: brand.ink, marginBottom: 3 }}>
          שלום{firstName ? ` ${firstName}` : ''},
        </div>

        {actions.length > 0 ? (
          <>
            <div style={{ ...sectionTitle, color: accent, marginTop: 16, marginBottom: 8 }}>מה צריך ממך</div>
            {actions.map((item, i) => (
              <ActionItem key={item.key} token={token} item={item} brand={brand} accent={accent}
                last={i === actions.length - 1} onDone={reload} />
            ))}
          </>
        ) : done.length > 0 && future.length === 0 && office.length === 0 ? (
          /* ‼ "הכול הושלם" רק כשבאמת אין המשך. עם שלב עתידי נעול או עם משהו
             שבטיפולנו זה היה שקר קטן שמייצר פנייה: הלקוח קורא שסיים, ואז
             נפתח לו עוד שלב. */
          <div style={{ fontSize: 15, color: brand.ink, margin: '18px 0 4px' }}>
            הכול הושלם{firstName ? `, ${firstName}` : ''} 🎉
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: brand.muted, margin: '18px 0 4px' }}>
            אין כרגע משהו שממתין לך.
          </div>
        )}

        {/* ── בטיפול המשרד ────────────────────────────────────────────────
            מה שאנחנו עושים עכשיו. שקט ובלי פקדים — זו תשובה לשאלה "ומה
            עכשיו?", לא עוד רשימת מטלות. */}
        {office.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: actions.length > 0 ? 20 : 16 }}>
              בטיפול המשרד
            </div>
            {office.map(item => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 0', borderTop: `1px solid ${brand.border}`,
              }}>
                <span aria-hidden="true" style={{ fontSize: 12, lineHeight: '20px', opacity: .55 }}>●</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: brand.ink }}>
                    {item.label}
                    {preview && item.draft && <DraftChip />}
                    {preview && item.removing && <RemovingChip />}
                  </div>
                  {item.sub && (
                    <div style={{ fontSize: 12, color: brand.muted, marginTop: 2, lineHeight: 1.55 }}>
                      {item.sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── בהמשך: שלבים שפורסמו ועדיין נעולים ──────────────────────────
            שקט בכוונה — אפור, בלי כפתור, בלי מסגרת מודגשת. זו מפת דרכים,
            לא רשימת מטלות: אסור שתתחרה ב"מה צריך ממך" שמעליה. */}
        {future.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: (actions.length > 0 || office.length > 0) ? 20 : 16 }}>
              בהמשך — ייפתח אוטומטית
            </div>
            {future.map(item => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 0', borderTop: `1px solid ${brand.border}`,
              }}>
                <span aria-hidden="true" style={{ fontSize: 12, lineHeight: '20px', opacity: .5 }}>🔒</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: brand.muted }}>
                    {item.label}
                    {preview && item.draft && <DraftChip />}
                    {preview && item.removing && <RemovingChip />}
                  </div>
                  {item.sub && (
                    <div style={{ fontSize: 12, color: brand.muted, opacity: .85, marginTop: 2 }}>
                      {item.sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: brand.muted, opacity: .8, marginTop: 8 }}>
              אין מה לעשות עם אלה עכשיו — הם ייפתחו כאן מעצמם.
            </div>
          </>
        )}

        {/* ‼ תזכורת שקטה שכבר קרה משהו — לא רשימה. "מה קורה עכשיו" הוא
            השאלה של העמוד הזה; "מה קרה" שייך לרו"ח בלבד. */}
        {done.length > 0 && (
          <div style={{ fontSize: 12, color: brand.muted, marginTop: (actions.length > 0 || future.length > 0) ? 16 : 4 }}>
            ✓ {done.length === 1 ? 'דבר אחד שכבר הושלם' : `${done.length} דברים שכבר הושלמו`}
          </div>
        )}

        <div style={{
          marginTop: 22, paddingTop: 12, borderTop: `1px solid ${brand.border}`,
          fontSize: 12, color: brand.muted, textAlign: 'center', lineHeight: 1.6,
        }}>
          שאלות? פשוט השיבו למייל שקיבלתם מ{data.firmName}.
        </div>
      </div>
    </div>
    </PreviewCtx.Provider>
  );
}

export default function PublicPortalPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PortalData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc('get_client_portal', { p_token: token });
      if (cancelled) return;
      const row = res as (PortalData & { ok?: boolean }) | null;
      if (error || !row?.ok) { setPhase('invalid'); return; }
      setData(row);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  // מצבי הביניים משתמשים במיתוג ברירת המחדל — המיתוג האמיתי מגיע עם הנתונים.
  const brand = deriveQuotationBrand({
    id: '', firmName: undefined, branding: {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '30px 30px 22px', borderTop: `4px solid ${brand.accent}`,
  };

  if (phase === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: brand.muted }}>טוען…</div></div>;
  }

  if (phase === 'invalid' || !data) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>הקישור אינו תקין</div>
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>
            ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. פנו למשרד לקבלת קישור חדש.
          </div>
        </div>
      </div>
    );
  }

  return <PortalView data={data} token={token} onReload={reload} />;
}
