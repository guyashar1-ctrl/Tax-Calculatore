// ─── דף הרו"ח הקודם (?release=TOKEN) ────────────────────────────────────────
// מכתב השחרור נשלח אליו במייל, והקישור מוביל לכאן. כאן הוא רואה את המכתב
// המלא, חותם עליו, ומעלה את החומרים שהתבקשו — פריט-פריט.
//
// ‼ הכרעת גיא (2026-08-05): הלקוח אינו חותם על המכתב — הוא מכותב בלבד.
// מי שחותם הוא הרו"ח הקודם.
//
// ‼ הוא לא יעלה הכול בבת אחת, וייתכן שחלק יגיע במייל. לכן הדף נשאר חי גם
// אחרי החתימה, מקבל העלאות חלקיות לאורך שבועות, והרו"ח החדש ממשיך לסמן
// ידנית מה שהגיע בדרך אחרת. שני הערוצים מזינים את אותה רשימה.
//
// ‼ מיתוג המשרד, לא PIVO — כמו כל מה שגורם חיצוני רואה.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import { FirmBranding } from '../types/firmProfile';
import { isOptionalMaterialKey } from '../types/onboarding';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import SignaturePad from './SignaturePad';

interface Props {
  token: string;
}

interface ReleaseData {
  firmName: string;
  branding: FirmBranding;
  clientName: string;
  businessName?: string;
  prevAccountantName?: string;
  subject?: string;
  body?: string;
  objectionDueDate?: string;
  signed: boolean;
  signedAt?: string;
  signerName?: string;
  /** הערה עניינית שכבר נמסרה (הסתייגות, התנגדות, כל דבר שצריך לדעת). */
  responseNote?: string;
  respondedAt?: string;
  responderName?: string;
  materialsStepId?: string;
  materials: { key: string; label: string; done: boolean; optional?: boolean; uploads?: number }[];
  materialsDone: number;
  materialsTotal: number;
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.csv,.doc,.docx';

/** ‼ אותה תקרה שהשרת אוכף (portal-upload-document). כאן רק כדי לחסוך נסיעה. */
const MAX_BYTES = 10 * 1024 * 1024;

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: 'הקובץ גדול מדי — עד 10MB.',
  type_not_allowed: 'סוג הקובץ הזה לא נתמך. אפשר PDF, תמונה, אקסל או וורד.',
  rate_limited: 'הועלו הרבה קבצים בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.',
};

export default function PublicReleasePage({ token }: Props) {
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [data, setData] = useState<ReleaseData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  const [signature, setSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signErr, setSignErr] = useState<string | null>(null);
  // ── הערה עניינית ──────────────────────────────────────────────────────────
  // ‼ ניסוח ניטרלי בכוונה: הדף אינו קובע מה מותר או אסור לרו"ח הקודם, ואינו
  // מציג כלל מקצועי כאילו הוא חוק. הוא רק פותח ערוץ מסודר לומר משהו — ושומר
  // את מה שנאמר כראיה אצל הרו"ח החדש.
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteName, setNoteName] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc('get_release_portal', { p_token: token });
      if (cancelled) return;
      const row = res as (ReleaseData & { ok?: boolean }) | null;
      if (error || !row?.ok) { setPhase('invalid'); return; }
      setData(row);
      if (!signerName && row.prevAccountantName) setSignerName(row.prevAccountantName);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadKey]);

  if (phase === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>טוען…</div>;
  }
  if (phase === 'invalid' || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          ייתכן שהוא פג או הוחלף. אפשר להשיב למייל שקיבלת ונשלח קישור חדש.
        </p>
      </div>
    );
  }

  const brand = deriveQuotationBrand({ firmName: data.firmName, branding: data.branding } as never);
  const accent = brand.accent;

  async function sign() {
    setSignErr(null);
    if (!signature) { setSignErr('צריך לחתום במסגרת שלמעלה.'); return; }
    setSigning(true);
    const { data: res, error } = await supabase.rpc('release_portal_sign', {
      p_token: token, p_signature: signature, p_signer_name: signerName.trim() || null,
    });
    setSigning(false);
    const r = res as { ok?: boolean } | null;
    if (error || !r?.ok) { setSignErr('לא הצלחנו לשמור את החתימה. אפשר לנסות שוב.'); return; }
    flushAccountantNotifications(token);
    reload();
  }

  async function sendNote() {
    setNoteErr(null);
    if (!noteText.trim()) { setNoteErr('צריך לכתוב את ההערה.'); return; }
    setNoteBusy(true);
    const { data: res, error } = await supabase.rpc('release_portal_respond', {
      p_token: token, p_note: noteText.trim(), p_name: noteName.trim() || null,
    });
    setNoteBusy(false);
    const r = res as { ok?: boolean } | null;
    if (error || !r?.ok) { setNoteErr('לא הצלחנו לשלוח את ההערה. אפשר לנסות שוב.'); return; }
    flushAccountantNotifications(token);
    setNoteText('');
    setNoteOpen(false);
    reload();
  }

  // ‼ הפריט הפתוח יורד מרשימת "מה התבקש": הוא אינו נספר בהתקדמות, אינו נסגר,
  // ומקבל אזור העלאה משלו. ערבוב שלו ברשימה הפך אותו לדרישה.
  const requested = data.materials.filter(m => !(m.optional || isOptionalMaterialKey(m.key)));
  const extra = data.materials.find(m => m.optional || isOptionalMaterialKey(m.key));

  const card: React.CSSProperties = {
    background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '20px 22px', marginBottom: 16,
  };
  const title: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '.04em',
    color: brand.muted, marginBottom: 10,
  };

  return (
    <div style={{
      background: brand.pageBg, minHeight: '100vh', padding: '24px 16px',
      fontFamily: `'${brand.font}', sans-serif`, color: brand.ink, direction: 'rtl',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{data.firmName}</div>
          <div style={{ fontSize: 13, color: brand.muted, marginTop: 2 }}>
            {data.subject || `שחרור תיק — ${data.clientName}`}
          </div>
        </header>

        {/* ── המכתב ── */}
        <section style={card}>
          <div style={title}>המכתב</div>
          <div style={{ fontSize: 14, lineHeight: 1.85, whiteSpace: 'pre-line' }}>
            {data.body || `הלקוח ${data.clientName} עובר לטיפולנו. נודה לשחרור התיק ולהעברת החומרים.`}
          </div>
          {data.objectionDueDate && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: brand.muted }}>
              בהתאם לכלל 16 — אם קיימת התנגדות, אפשר להשיב למייל עד {formatDate(data.objectionDueDate)}.
            </div>
          )}
        </section>

        {/* ── התשובה ── */}
        <section style={card}>
          <div style={title}>התשובה שלך</div>
          {data.signed ? (
            <div style={{ fontSize: 14, color: brand.ink }}>
              <span style={{ color: accent, fontWeight: 700 }}>✓ נחתם</span>
              {data.signerName && <span> · {data.signerName}</span>}
              {data.signedAt && <span style={{ color: brand.muted }}> · {formatDate(data.signedAt)}</span>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: brand.muted, lineHeight: 1.7 }}>
                חתימה כאן מאשרת את שחרור התיק. אחרי החתימה אפשר להעלות את החומרים —
                לא חייבים הכול בבת אחת, הדף נשאר פתוח.
              </p>
              <input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="שם החותם"
                style={{
                  padding: '8px 10px', fontSize: 14, color: brand.ink, maxWidth: 320,
                  border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
                }}
              />
              <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff' }}>
                <SignaturePad value={signature} onChange={setSignature} height={150} />
              </div>
              {signErr && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{signErr}</span>}
              <button type="button" onClick={() => void sign()} disabled={signing} style={{
                justifySelf: 'start', border: 'none', cursor: signing ? 'default' : 'pointer',
                fontSize: 13.5, fontWeight: 600, padding: '9px 22px',
                color: '#fff', background: accent, borderRadius: brand.radius, opacity: signing ? .6 : 1,
              }}>{signing ? 'שומר…' : 'אישור וחתימה'}</button>
            </div>
          )}

          {/* ── הערה / הסתייגות ──────────────────────────────────────────────
              זמינה תמיד, גם אחרי חתימה: דבר שצריך לומר לא תמיד מתגלה בהתחלה. */}
          {data.responseNote && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: brand.radius,
              background: '#fbf3e3', fontSize: 13.5, lineHeight: 1.7, color: brand.ink,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>
                ההערה שלך נשלחה
                {data.responderName && ` · ${data.responderName}`}
                {data.respondedAt && ` · ${formatDate(data.respondedAt)}`}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{data.responseNote}</div>
            </div>
          )}

          {noteOpen ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: brand.muted, lineHeight: 1.7 }}>
                מה שחשוב שנדע — הסתייגות, התנגדות, חוב פתוח, דוח שטרם הוגש, או כל דבר אחר.
                ההערה מגיעה ישירות אלינו ונשמרת בתיק.
              </p>
              <input
                value={noteName} onChange={e => setNoteName(e.target.value)} placeholder="השם שלך"
                style={{
                  padding: '8px 10px', fontSize: 14, color: brand.ink, maxWidth: 320,
                  border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
                }} />
              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
                placeholder="מה שחשוב שנדע"
                style={{
                  padding: '8px 10px', fontSize: 14, color: brand.ink, lineHeight: 1.7,
                  border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
                  fontFamily: 'inherit', resize: 'vertical',
                }} />
              {noteErr && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{noteErr}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => void sendNote()} disabled={noteBusy} style={{
                  border: 'none', cursor: noteBusy ? 'default' : 'pointer',
                  fontSize: 13.5, fontWeight: 600, padding: '9px 22px',
                  color: '#fff', background: accent, borderRadius: brand.radius, opacity: noteBusy ? .6 : 1,
                }}>{noteBusy ? 'שולח…' : 'שליחת ההערה'}</button>
                <button type="button" onClick={() => { setNoteOpen(false); setNoteErr(null); }} disabled={noteBusy}
                  style={{
                    border: `1px solid ${brand.border}`, background: '#fff', cursor: 'pointer',
                    fontSize: 13.5, padding: '9px 18px', color: brand.ink, borderRadius: brand.radius,
                  }}>ביטול</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setNoteOpen(true); setNoteName(n => n || data.prevAccountantName || ''); }}
              style={{
                marginTop: 12, border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: accent, textDecoration: 'underline',
              }}>
              {data.responseNote ? 'להוספת הערה נוספת' : 'יש לי הערה או הסתייגות'}
            </button>
          )}
        </section>

        {/* ── החומרים ── */}
        {data.materialsStepId && requested.length > 0 && (
          <section style={card}>
            <div style={title}>
              החומרים שהתבקשו — {requested.filter(m => m.done).length} מתוך {requested.length} התקבלו
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
              {requested.map(m => (
                <ReleaseUploadItem
                  key={m.key}
                  token={token}
                  stepId={data.materialsStepId!}
                  itemKey={m.key}
                  label={m.label}
                  done={m.done}
                  brand={brand}
                  accent={accent}
                  onDone={reload}
                />
              ))}
            </ul>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: brand.muted, lineHeight: 1.7 }}>
              אפשר להעלות בכמה פעמים. מה שנוח לשלוח במייל — אפשר גם ככה, ונסמן כאן.
            </p>
          </section>
        )}

        {/* ── חומר נוסף — לפי שיקול דעתו, ולכן לא נספר ולא נסגר ── */}
        {data.materialsStepId && extra && (
          <section style={card}>
            <div style={title}>{extra.label || 'חומר נוסף לפי שיקול דעתך'}</div>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, color: brand.muted, lineHeight: 1.75 }}>
              אם יש עוד חומר של הלקוח שלדעתך נכון שיעבור אלינו — אפשר להעלות אותו כאן.
              קובץ אחד, כמה קבצים או תיקייה שלמה. זה לא חובה, ואין צורך לסדר או למיין.
            </p>
            <ExtraMaterialUpload
              token={token}
              stepId={data.materialsStepId}
              itemKey={extra.key}
              uploaded={extra.uploads ?? 0}
              brand={brand}
              accent={accent}
              onDone={reload}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function ReleaseUploadItem({ token, stepId, itemKey, label, done, brand, accent, onDone }: {
  token: string; stepId: string; itemKey: string; label: string; done: boolean;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputId = `rel-${itemKey}`;

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    const form = new FormData();
    form.append('token', token);
    form.append('tokenKind', 'release');
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
    <li style={{ display: 'grid', gap: 4, padding: '4px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ color: done ? accent : brand.muted }}>{done ? '✓' : '○'}</span>
        <span style={{
          flex: 1, minWidth: 130, fontSize: 13.5,
          color: done ? brand.muted : brand.ink,
          textDecoration: done ? 'line-through' : 'none',
        }}>{label}</span>
        {!done && (
          <>
            <input id={inputId} type="file" accept={ACCEPT} disabled={busy} style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <label htmlFor={inputId} style={{
              flexShrink: 0, cursor: busy ? 'default' : 'pointer',
              fontSize: 12.5, fontWeight: 600, padding: '5px 14px',
              color: busy ? brand.muted : accent,
              border: `1px solid ${busy ? brand.border : accent}`,
              borderRadius: brand.radius, opacity: busy ? .6 : 1,
            }}>{busy ? 'מעלה…' : 'העלאה'}</label>
          </>
        )}
      </div>
      {err && <span style={{ fontSize: 12, color: '#a63a3a', paddingInlineStart: 18 }}>{err}</span>}
    </li>
  );
}

/**
 * העלאת חומר נוסף — קובץ, כמה קבצים או תיקייה.
 *
 * ‼ תור סדרתי ולא הצפה במקביל: לשרת יש תקרת קבצים לשעה, והעלאה מקבילה של
 * תיקייה הייתה נחסמת באמצע בלי שאיש יידע אילו קבצים עברו. כאן כל קובץ מקבל
 * שורה משלו עם התוצאה שלו — מה שנכשל נשאר על המסך ואפשר לנסות אותו שוב.
 * ‼ שום ולידציה לא נחלשה: מה שנשלח עובר בדיוק את אותה פונקציה ואת אותן
 * בדיקות (סוג, גודל, טוקן) כמו העלאה בודדת.
 */
function ExtraMaterialUpload({ token, stepId, itemKey, uploaded, brand, accent, onDone }: {
  token: string; stepId: string; itemKey: string; uploaded: number;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  type Row = { name: string; status: 'pending' | 'uploading' | 'ok' | 'err'; error?: string };
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const [folderSupported, setFolderSupported] = useState(false);

  // בחירת תיקייה קיימת רק בחלק מהדפדפנים — ולכן היא תוספת, ולא הדרך היחידה.
  useEffect(() => {
    const el = folderRef.current;
    if (!el) return;
    if ('webkitdirectory' in el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
      setFolderSupported(true);
    }
  }, []);

  async function uploadOne(file: File): Promise<string | null> {
    if (file.size > MAX_BYTES) return UPLOAD_ERRORS.too_large;
    const form = new FormData();
    form.append('token', token);
    form.append('tokenKind', 'release');
    form.append('stepId', stepId);
    form.append('itemKey', itemKey);
    form.append('file', file);
    const { data, error } = await supabase.functions.invoke('portal-upload-document', { body: form });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return UPLOAD_ERRORS[res?.error ?? ''] ?? 'ההעלאה נכשלה.';
    return null;
  }

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter(f => f.size > 0);
    if (files.length === 0) return;
    setRows(files.map(f => ({ name: f.name, status: 'pending' as const })));
    setBusy(true);
    let succeeded = 0;
    for (let i = 0; i < files.length; i++) {
      setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, status: 'uploading' } : r)));
      const err = await uploadOne(files[i]);
      setRows(prev => prev.map((r, idx) => (
        idx === i ? { ...r, status: err ? 'err' : 'ok', error: err ?? undefined } : r)));
      if (!err) succeeded++;
    }
    setBusy(false);
    if (succeeded > 0) { flushAccountantNotifications(token); onDone(); }
  }

  const failed = rows.filter(r => r.status === 'err').length;
  const okCount = rows.filter(r => r.status === 'ok').length;
  const doneAll = rows.length > 0 && !busy;

  const pick: React.CSSProperties = {
    cursor: busy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
    padding: '8px 18px', color: busy ? brand.muted : accent,
    border: `1px solid ${busy ? brand.border : accent}`,
    borderRadius: brand.radius, opacity: busy ? .6 : 1, display: 'inline-block',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input id={`extra-files-${itemKey}`} type="file" accept={ACCEPT} multiple disabled={busy}
          style={{ display: 'none' }}
          onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }} />
        <label htmlFor={`extra-files-${itemKey}`} style={pick}>
          {busy ? 'מעלה…' : 'בחירת קבצים'}
        </label>

        <input ref={folderRef} id={`extra-folder-${itemKey}`} type="file" multiple disabled={busy}
          style={{ display: 'none' }}
          onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }} />
        {folderSupported && (
          <label htmlFor={`extra-folder-${itemKey}`} style={pick}>בחירת תיקייה</label>
        )}

        {uploaded > 0 && rows.length === 0 && (
          <span style={{ fontSize: 12.5, color: brand.muted }}>
            כבר התקבלו {uploaded} קבצים. אפשר להוסיף עוד.
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 6 }}>
            {busy
              ? `מעלה ${Math.min(okCount + failed + 1, rows.length)} מתוך ${rows.length}…`
              : `הועלו ${okCount} מתוך ${rows.length}${failed ? ` · ${failed} נכשלו` : ''}`}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 3 }}>
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`} style={{
                display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5,
                color: r.status === 'err' ? '#a63a3a' : brand.ink,
              }}>
                <span aria-hidden="true" style={{ color: r.status === 'ok' ? accent : brand.muted }}>
                  {r.status === 'ok' ? '✓' : r.status === 'err' ? '!' : r.status === 'uploading' ? '…' : '○'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.name}</span>
                {r.error && <span style={{ flex: '0 0 auto' }}>{r.error}</span>}
              </li>
            ))}
          </ul>
          {doneAll && failed > 0 && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: brand.muted, lineHeight: 1.7 }}>
              מה שנכשל לא נשמר — אפשר לבחור את הקבצים האלה שוב, או לשלוח אותם במייל.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
