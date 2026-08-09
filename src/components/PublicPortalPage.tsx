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

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';

interface Props {
  token: string;
}

type Bucket = 'action' | 'office' | 'done' | 'future';

interface PortalItem {
  bucket: Bucket;
  key: string;
  label: string;
  sub?: string;
  /** 'portal' = הפעולה נעשית כאן בעמוד, בלי לנווט לטוקן אחר. */
  actionKind?: 'onboard' | 'sign' | 'intake' | 'external' | 'quote' | 'portal';
  actionValue?: string;
  /** מה בדיוק הפעולה בתוך העמוד. */
  kind?: 'documents' | 'prev_accountant' | 'custom';
  /** רשימת המסמכים שביקשנו — מה התקבל ומה עוד חסר. */
  checklist?: { key: string; label: string; done: boolean }[];
  /** דרישות של בקשה חופשית: אישור, תשובת טקסט, או קובץ. */
  requirements?: { key: string; kind: 'confirm' | 'text' | 'file'; label: string; done: boolean; value?: string }[];
  /** יש כאן פריט שאפשר להעלות אליו קובץ. */
  canUpload?: boolean;
  /** טקסט הכפתור שהרו"ח בחר לבקשה החופשית. */
  cta?: string;
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

/** תחנות המסע כפי שהלקוח מבין אותן. השרת מחזיר את התחנה הנוכחית. */
type JourneyStage = 'quote' | 'identity' | 'setup' | 'active';

const JOURNEY: { id: JourneyStage; label: string }[] = [
  { id: 'quote',    label: 'הצעה' },
  { id: 'identity', label: 'אימות וייצוג' },
  { id: 'setup',    label: 'התחברות' },
  { id: 'active',   label: 'עובדים ביחד' },
];

interface PortalData {
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
        {!done && (
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
      setErr(res?.error === 'missing_value' ? 'צריך למלא תשובה.' : 'לא הצלחנו לשמור. אפשר לנסות שוב.');
      return;
    }
    flushAccountantNotifications(token);
    onDone();
  }

  const field = {
    flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13.5, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {(item.requirements ?? []).map(r => {
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
        if (r.kind === 'text') {
          return (
            <div key={r.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: brand.ink }}>{r.label}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input style={field} value={text[r.key] ?? ''} disabled={busyKey === r.key}
                  onChange={e => setText(t => ({ ...t, [r.key]: e.target.value }))} />
                <button type="button" disabled={busyKey === r.key || !(text[r.key] ?? '').trim()}
                  onClick={() => void submit(r.key, text[r.key])}
                  style={btn(accent, brand.radius, busyKey === r.key)}>
                  {busyKey === r.key ? 'שומר…' : 'שליחה'}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span aria-hidden="true" style={{ color: brand.muted }}>○</span>
            <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: brand.ink }}>{r.label}</span>
            <button type="button" disabled={busyKey === r.key} onClick={() => void submit(r.key)}
              style={btn(accent, brand.radius, busyKey === r.key)}>
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

/**
 * פעולה אחת שממתינה ללקוח. השורות מכוונות לקריאה כרשימה שאפשר לתקוף בכל סדר,
 * ולא כתור: אין עמודת נקודות מובילה, וכל שורה נושאת את הכפתור שלה.
 *
 * ‼ טופס הרו"ח הקודם נפתח בלחיצה ולא כברירת מחדל — שלושה שדות פתוחים באמצע
 * הרשימה מושכים את כל תשומת הלב לפעולה אחת ומסתירים את השאר.
 */
function ActionItem({ token, item, brand, accent, last, onDone }: {
  token: string; item: PortalItem; last: boolean;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const href = actionHref(item);
  const inPage = item.actionKind === 'portal';
  const quietBtn: React.CSSProperties = {
    flexShrink: 0, textDecoration: 'none', cursor: 'pointer', background: 'none',
    fontSize: 13, fontWeight: 600, padding: '6px 15px', color: accent,
    border: `1px solid ${accent}`, borderRadius: brand.radius,
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${brand.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: brand.ink }}>{item.label}</div>
          {item.sub && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.sub}</div>}
        </div>
        {href && <a href={href} style={quietBtn}>להמשך ←</a>}
        {inPage && item.kind === 'prev_accountant' && !open && (
          <button type="button" onClick={() => setOpen(true)} style={quietBtn}>למילוי</button>
        )}
      </div>

      {/* ‼ מסמכים: הלקוח מעלה כאן, במקום. הקובץ נכנס ישר לתיק שלו אצל הרו"ח
          ומסמן את הפריט. מה שמגיע בוואטסאפ או במייל עדיין מסומן ידנית על ידי
          הרו"ח — שני הערוצים חיים זה לצד זה. */}
      {inPage && item.kind === 'documents' && !!item.checklist?.length && item.actionValue && (
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
          {item.checklist.map(ci => (
            <UploadItem key={ci.key ?? ci.label} token={token} tokenKind="portal"
              stepId={item.actionValue!} itemKey={ci.key} label={ci.label} done={ci.done}
              brand={brand} accent={accent} onDone={onDone} />
          ))}
        </ul>
      )}

      {inPage && item.kind === 'custom' && item.actionValue && (
        <CustomRequestBlock token={token} item={item} brand={brand} accent={accent} onDone={onDone} />
      )}

      {inPage && item.kind === 'prev_accountant' && item.actionValue && open && (
        <PrevAccountantForm token={token} stepId={item.actionValue}
          brand={brand} accent={accent} onDone={onDone} />
      )}
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

  const brand = deriveQuotationBrand({
    id: '', firmName: data?.firmName, branding: data?.branding ?? {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;

  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
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
          <img src={brand.logoUrl} alt={data?.firmName}
            style={{ maxHeight: 40 * brand.logoScale, maxWidth: 180 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: ink,
            }}>{brand.monogram}</div>
            <div style={{ fontSize: 14, color: ink }}>{data?.firmName}</div>
          </>
        )}
      </div>
    );
  }

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

  const actions = data.items.filter(i => i.bucket === 'action');
  const office  = data.items.filter(i => i.bucket === 'office');
  const done    = data.items.filter(i => i.bucket === 'done');
  const future  = data.items.filter(i => i.bucket === 'future');
  // מה שכבר נסגר קודם, ואחריו מה שרץ עכשיו — כך המקטע נקרא כרצף אחד.
  const track   = [...done, ...office];
  const allDone = actions.length === 0 && office.length === 0 && data.total > 0;
  const firstName = data.clientFirstName;
  const stage: JourneyStage = data.journeyStage ?? 'identity';
  const stageIdx = Math.max(0, JOURNEY.findIndex(s => s.id === stage));

  return (
    <div style={page}>
      <div style={card}>
        <Header />

        <div style={{ fontSize: 20, fontWeight: 600, color: brand.ink, marginBottom: 3 }}>
          {allDone
            ? <>הכול הושלם{firstName ? `, ${firstName}` : ''} 🎉</>
            : stage === 'quote'
              ? <>שלום{firstName ? ` ${firstName}` : ''}, זה הדף האישי שלך</>
              : <>שלום{firstName ? ` ${firstName}` : ''}, הנה מצב ההצטרפות שלך</>}
        </div>
        {/* המפה הגדולה: איפה אני במסע. מחליפה את פס ההתקדמות הדק — שני
            מדדי התקדמות זה על זה רק מבלבלים. */}
        <div style={{ display: 'flex', margin: '16px 0 2px' }}>
          {JOURNEY.map((st, i) => {
            const passed = i < stageIdx;
            const current = i === stageIdx;
            const on = passed || current;
            return (
              <div key={st.id} style={{ flex: 1, minWidth: 0, textAlign: 'center', position: 'relative' }}>
                {i > 0 && (
                  <span aria-hidden="true" style={{
                    // ‼ בעברית התחנה הקודמת נמצאת מימין, אבל left/right ב-CSS
                    // אינם מתהפכים. הקו חייב לצאת מהנקודה ימינה: left:50%.
                    position: 'absolute', top: 6, left: '50%', width: '100%', height: 2,
                    background: on ? accent : brand.border,
                  }} />
                )}
                <span aria-hidden="true" style={{
                  position: 'relative', display: 'block', width: 14, height: 14, margin: '0 auto',
                  borderRadius: 999, boxSizing: 'border-box',
                  background: on ? accent : brand.cardBg,
                  border: on ? `2px solid ${accent}` : `2px solid ${brand.border}`,
                }} />
                <div style={{
                  marginTop: 6, fontSize: 11, lineHeight: 1.35,
                  fontWeight: current ? 700 : 400,
                  color: current ? ink : brand.muted,
                }}>{st.label}</div>
              </div>
            );
          })}
        </div>
        {actions.length > 0 && (
          <>
            <div style={{ ...sectionTitle, color: accent, marginBottom: 0 }}>
              ממתין לך — {actions.length === 1 ? 'פעולה אחת' : `${actions.length} פעולות`}
            </div>
            <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 2 }}>
              אפשר בכל סדר, ואפשר לעצור ולחזור לדף מתי שנוח
            </div>
            {actions.map((item, i) => (
              <ActionItem key={item.key} token={token} item={item} brand={brand} accent={accent}
                last={i === actions.length - 1} onDone={reload} />
            ))}
          </>
        )}

        {/* ‼ "הושלם" ו"בטיפול המשרד" הם מקטע אחד: אבני הדרך הגדולות — ההצעה
            והייצוג — נבלעו כשורות בתחתית שני מקטעים נפרדים. כאן הן נקראות
            כרצף אחד שמתקדם, וכל שורה נושאת את המצב שלה. */}
        {track.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>במקביל</div>
            <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 4 }}>
              מתקדם אצלנו בזמן שאתה עושה את שלך
            </div>
            {track.map(item => {
              const isDone = item.bucket === 'done';
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0' }}>
                  <span aria-hidden="true" style={{
                    flexShrink: 0, width: 14, marginTop: 1, textAlign: 'center',
                    fontSize: isDone ? 13 : 11, color: isDone ? '#1e7a55' : brand.muted,
                  }}>{isDone ? '✓' : '○'}</span>
                  <div>
                    <span style={{ fontSize: 13.5, color: isDone ? brand.muted : brand.ink }}>{item.label}</span>
                    {item.sub && (
                      <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.sub}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {future.map(item => (
          <div key={item.key} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', color: brand.muted,
          }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 14, textAlign: 'center', fontSize: 11 }}>·</span>
            <span style={{ fontSize: 12.5 }}>{item.label} — {item.sub}</span>
          </div>
        ))}

        <div style={{
          marginTop: 22, paddingTop: 12, borderTop: `1px solid ${brand.border}`,
          fontSize: 12, color: brand.muted, textAlign: 'center', lineHeight: 1.6,
        }}>
          שאלות? פשוט השיבו למייל שקיבלתם מ{data.firmName}.
        </div>
      </div>
    </div>
  );
}
