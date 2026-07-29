// ─── עמוד חתימה ציבורי ─────────────────────────────────────────────────────
// הלקוח (או בן/בת הזוג) מגיע לכאן מקישור אישי (?sign=<token>), רואה את ה-PDF
// האמיתי עם אזורי החתימה שלו מסומנים, וחותם דרך חדר החתימה. ללא התחברות.

import { useEffect, useState } from 'react';
import { SignatureField, SignatureValue, Signer } from '../types';
import { supabase } from '../lib/supabase';
import SigningRoom from './signatureRequest/SigningRoom';

interface Session {
  signerId: string;
  signerName: string;
  alreadySigned: boolean;
  requestStatus: string;
  firmName: string;
  fields: SignatureField[];
  signersPublic: { id: string; name: string; signStatus: string }[];
  values: Record<string, SignatureValue>;
  pdfUrl: string;
  pdfFileName: string;
}

type Phase = 'loading' | 'invalid' | 'already' | 'sign' | 'submitting' | 'done' | 'error';

export default function PublicSignPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('signing-session', { body: { action: 'get', token } });
        if (error || !data?.ok) { setPhase('invalid'); return; }
        setSession(data as Session);
        if (data.alreadySigned || data.requestStatus !== 'pending_signature') { setPhase('already'); return; }
        const res = await fetch(data.pdfUrl);
        if (!res.ok) throw new Error('טעינת המסמך נכשלה');
        setPdfBytes(await res.arrayBuffer());
        setPhase('sign');
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();
  }, [token]);

  async function handleComplete(values: Record<string, SignatureValue>) {
    if (!session) return;
    setPhase('submitting');
    try {
      // שולחים רק את הערכים של השדות שלי
      const myFieldIds = new Set(session.fields.filter(f => f.signerId === session.signerId).map(f => f.id));
      const mine: Record<string, SignatureValue> = {};
      for (const [k, v] of Object.entries(values)) if (myFieldIds.has(k)) mine[k] = v;
      const { data, error } = await supabase.functions.invoke('signing-session', { body: { action: 'submit', token, values: mine } });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'שליחה נכשלה');
      setPhase('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  const wrap = (inner: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '2rem 2.25rem', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 18px rgba(0,0,0,.08)' }}>
        {inner}
      </div>
    </div>
  );

  if (phase === 'loading') return wrap(<div style={{ color: 'var(--gray-500)' }}>טוען את המסמך…</div>);
  if (phase === 'invalid') return wrap(<><div style={{ fontSize: '2rem' }}>🔗</div><h2 style={{ margin: '.5rem 0' }}>הקישור אינו תקף</h2><p style={{ color: 'var(--gray-600)', fontSize: '.9rem' }}>ייתכן שהקישור שגוי או שהתהליך הסתיים. פנו למשרד לקבלת קישור חדש.</p></>);
  if (phase === 'already') return wrap(<><div style={{ fontSize: '2rem' }}>✅</div><h2 style={{ margin: '.5rem 0' }}>החתימה כבר התקבלה</h2><p style={{ color: 'var(--gray-600)', fontSize: '.9rem' }}>תודה{session?.signerName ? `, ${session.signerName}` : ''}! אין צורך בפעולה נוספת.</p></>);
  if (phase === 'done') return wrap(<><div style={{ fontSize: '2rem' }}>🎉</div><h2 style={{ margin: '.5rem 0' }}>החתימה נשלחה בהצלחה</h2><p style={{ color: 'var(--gray-600)', fontSize: '.9rem' }}>תודה{session?.signerName ? `, ${session.signerName}` : ''}! {session?.firmName || 'המשרד'} ימשיך את הטיפול ויעדכן אתכם.</p></>);
  if (phase === 'error') return wrap(<><div style={{ fontSize: '2rem' }}>⚠</div><h2 style={{ margin: '.5rem 0' }}>משהו השתבש</h2><p style={{ color: 'var(--gray-600)', fontSize: '.9rem' }}>{errMsg}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>נסו שוב</button></>);
  if (phase === 'submitting') return wrap(<div style={{ color: 'var(--gray-500)' }}>שולח את החתימה…</div>);

  // phase === 'sign'
  if (!session || !pdfBytes) return null;
  const signers: Signer[] = session.signersPublic.map((s, i) => ({ id: s.id, source: 'manual', name: s.name, email: '', order: i + 1 }));
  if (!signers.some(s => s.id === 'accountant')) {
    signers.push({ id: 'accountant', source: 'manual', name: session.firmName || 'רו"ח', email: '', order: signers.length + 1 });
  }
  return (
    <SigningRoom
      pdfBytes={pdfBytes.slice(0)}
      pdfFileName={session.pdfFileName}
      fields={session.fields}
      signers={signers}
      activeSignerId={session.signerId}
      // הלקוח רואה רק איפה הוא (ובן/בת זוגו) חותמים. מקום החתימה של הרו"ח
      // אינו עניינו, ורק מעלה שאלות על טופס שנראה חסר.
      hiddenSignerIds={['accountant']}
      initialValues={session.values}
      title={`✍ חתימה על ייפוי כוח — ${session.signerName}`}
      onComplete={handleComplete}
      onCancel={() => window.location.reload()}
    />
  );
}
