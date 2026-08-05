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

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FirmBranding } from '../types/firmProfile';
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
  materialsStepId?: string;
  materials: { key: string; label: string; done: boolean }[];
  materialsDone: number;
  materialsTotal: number;
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.csv,.doc,.docx';

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
    reload();
  }

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

        {/* ── החתימה ── */}
        <section style={card}>
          <div style={title}>אישור השחרור</div>
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
        </section>

        {/* ── החומרים ── */}
        {data.materialsStepId && data.materials.length > 0 && (
          <section style={card}>
            <div style={title}>
              החומרים שהתבקשו — {data.materialsDone} מתוך {data.materialsTotal} התקבלו
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
              {data.materials.map(m => (
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
