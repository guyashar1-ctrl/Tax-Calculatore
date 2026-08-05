// ─── עמוד חתימה ציבורי ─────────────────────────────────────────────────────
// הלקוח (או בן/בת הזוג) מגיע לכאן מקישור אישי (?sign=<token>), רואה את ה-PDF
// האמיתי עם אזורי החתימה שלו מסומנים, וחותם דרך חדר החתימה. ללא התחברות.

import { useEffect, useState } from 'react';
import { SignatureField, SignatureValue, Signer } from '../types';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import SigningRoom from './signatureRequest/SigningRoom';
import ClientPageState from './ui/ClientPageState';
import NiApprovalNotice from './ui/NiApprovalNotice';

interface Session {
  /** ממתין לחותם הזה אישור ייפוי כוח בב"ל — null כשאין, או כשכבר אישר. */
  ni: { referenceNumber: string; deadline: string | null } | null;
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
      // ההתראה לרו"ח כבר בתור; כאן רק מבקשים לרוקן אותו מיד. לא חוסם.
      flushAccountantNotifications(token);
      setPhase('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  if (phase === 'loading') return <ClientPageState quiet body="טוען את המסמך…" />;
  if (phase === 'submitting') return <ClientPageState quiet body="שולח את החתימה…" />;
  if (phase === 'invalid') return (
    <ClientPageState
      mark="🔗"
      title="הקישור אינו תקף"
      body="ייתכן שהקישור שגוי או שהתהליך הסתיים. פנו למשרד לקבלת קישור חדש."
    />
  );
  // ‼ שני מסכי הסיום מתפצלים לפי אישור הב"ל. כשהוא עוד ממתין אסור שייאמר כאן
  //   "אין צורך בפעולה נוספת" או "נמשיך מכאן" — זה בדיוק הרגע שבו הלקוח סוגר
  //   את החלון ומשאיר את הייצוג בב"ל ללא תוקף בלי לדעת.
  const hi = session?.signerName ? `, ${session.signerName}` : '';
  if (phase === 'already') return session?.ni ? (
    <ClientPageState
      wide
      mark="✓"
      title="החתימה כבר התקבלה"
      body={<>
        <div>תודה{hi}! נשאר צעד אחד — אישור בביטוח הלאומי.</div>
        <NiApprovalNotice referenceNumber={session.ni.referenceNumber} deadline={session.ni.deadline} />
      </>}
    />
  ) : (
    <ClientPageState
      mark="✅"
      title="החתימה כבר התקבלה"
      body={`תודה${hi}! אין צורך בפעולה נוספת.`}
    />
  );
  if (phase === 'done') return session?.ni ? (
    <ClientPageState
      wide
      mark="✓"
      title="החתימה התקבלה — נשאר צעד אחד"
      body={<>
        <div>תודה{hi}! {session.firmName || 'המשרד'} ימשיך מכאן מול מס הכנסה. הפעולה האחרונה שנשארה היא שלכם:</div>
        <NiApprovalNotice referenceNumber={session.ni.referenceNumber} deadline={session.ni.deadline} />
      </>}
    />
  ) : (
    <ClientPageState
      mark="🎉"
      title="החתימה נשלחה בהצלחה"
      body={`תודה${hi}! ${session?.firmName || 'המשרד'} ימשיך את הטיפול ויעדכן אתכם.`}
    />
  );
  if (phase === 'error') return (
    <ClientPageState
      mark="⚠"
      title="משהו השתבש"
      body={errMsg}
      action={<button className="btn btn-primary" onClick={() => window.location.reload()}>נסו שוב</button>}
    />
  );

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
