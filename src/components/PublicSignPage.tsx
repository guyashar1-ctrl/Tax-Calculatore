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
import { isValidEmail } from '../utils/email';
import EmailInput from './ui/EmailInput';
import InfoLines from './ui/InfoLines';

interface Session {
  /** ממתין לחותם הזה אישור ייפוי כוח בב"ל — null כשאין, או כשכבר אישר. */
  ni: { referenceNumber: string; deadline: string | null } | null;
  signerId: string;
  signerRole?: 'client' | 'spouse';
  signerName: string;
  alreadySigned: boolean;
  requestStatus: string;
  firmName: string;
  fields: SignatureField[];
  signersPublic: { id: string; name: string; signStatus: string }[];
  values: Record<string, SignatureValue>;
  pdfUrl: string;
  pdfFileName: string;
  /**
   * כל טופסי ה-2279 של הבקשה. מע"מ וניכויים מוגשים בנפרד לכל אדם, ולכן
   * למשק בית אחד עשויים להיות כמה טפסים — והחותם חותם על כולם ברצף,
   * בקישור אחד. חסר ⇒ שרת ישן; נופלים למסמך היחיד מהשדות שלצידו.
   */
  documents?: { key: string; title: string; fields: SignatureField[]; pdfUrl: string; pdfFileName: string }[];
  /** חתימת בן/בת הזוג עוד ממתינה — מוחזר רק לנישום, לבחירת "יחד או בנפרד". */
  spousePending?: boolean;
  spouseName?: string;
}

type Phase = 'loading' | 'invalid' | 'already' | 'sign' | 'submitting' | 'done' | 'error';

/**
 * בחירת המשך אחרי חתימת הנישום, כשחתימת בן/בת הזוג עוד ממתינה: לחתום יחד
 * עכשיו (אותו מכשיר, בלי מייל) או לשלוח קישור אישי במייל — ורק אז מבקשים
 * מהנישום את כתובת המייל של בן/בת הזוג.
 */
function SpouseNextStep({ token, spouseName }: { token: string; spouseName: string }) {
  const [mode, setMode] = useState<'choice' | 'email' | 'sent'>('choice');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'handoff' | 'send' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = spouseName.trim() || 'בן/בת הזוג';

  async function handleTogether() {
    setBusy('handoff');
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('signing-session', { body: { action: 'handoff', token } });
      if (error || !data?.ok || !data?.spouseToken) throw new Error(error?.message || data?.error || 'failed');
      window.location.href = `${window.location.origin}/?sign=${data.spouseToken}`;
    } catch {
      setErr('לא הצלחנו לפתוח את החתימה כרגע. נסו שוב, או פנו למשרד.');
      setBusy(null);
    }
  }

  async function handleSend() {
    if (!isValidEmail(email)) {
      setErr('כתובת המייל אינה תקינה - בדקו שוב.');
      return;
    }
    setBusy('send');
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('signing-session', {
        body: { action: 'invite_spouse', token, email: email.trim() },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'failed');
      setMode('sent');
    } catch {
      setErr('שליחת המייל נכשלה. אפשר לנסות שוב - או שהמשרד ישלח את הקישור.');
    } finally {
      setBusy(null);
    }
  }

  const box: React.CSSProperties = {
    marginTop: 18, padding: '14px 16px', textAlign: 'right',
    background: '#F7F6F3', borderRadius: 12,
  };
  const btn: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: 600,
    cursor: 'pointer', font: 'inherit',
  };

  if (mode === 'sent') {
    return (
      <div style={box}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111' }}>✓ הקישור נשלח אל <span dir="ltr">{email.trim()}</span></div>
        <InfoLines style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginTop: 4 }} items={[
          `${name} יקבל/תקבל מייל עם קישור חתימה אישי`,
          'אתם סיימתם - אפשר לסגור את החלון',
        ]} />
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111', marginBottom: 3 }}>
        נשארה החתימה של {name}
      </div>
      <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 12 }}>
        הפרטים כבר מולאו - נשארה רק חתימה. איך נוח לכם?
      </div>

      {mode === 'choice' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={handleTogether} disabled={busy !== null}
            style={{ ...btn, background: '#1A1A1A', color: '#fff', border: 'none', opacity: busy === 'handoff' ? 0.7 : 1 }}>
            {busy === 'handoff' ? 'פותח…' : `${name} כאן? ממשיכים לחתימה עכשיו`}
          </button>
          <button type="button" onClick={() => { setErr(null); setMode('email'); }} disabled={busy !== null}
            style={{ ...btn, background: '#fff', color: '#1A1A1A', border: '1px solid #D9D8D3' }}>
            ✉ שליחת קישור חתימה במייל
          </button>
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 12.5, color: '#6B6B68' }}>
            המייל של {name}
            <EmailInput
              autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="spouse@example.com"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '11px 13px', fontSize: 14, borderRadius: 10, border: '1px solid #D9D8D3', background: '#fff', color: '#1A1A1A' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => { setErr(null); setMode('choice'); }} disabled={busy !== null}
              style={{ ...btn, width: 'auto', padding: '12px 16px', background: 'transparent', color: '#6B6B68', border: '1px solid #D9D8D3' }}>
              חזרה
            </button>
            <button type="button" onClick={handleSend} disabled={busy !== null}
              style={{ ...btn, flex: 1, background: '#1A1A1A', color: '#fff', border: 'none', opacity: busy === 'send' ? 0.7 : 1 }}>
              {busy === 'send' ? 'שולח…' : 'שליחת הקישור'}
            </button>
          </div>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 10, padding: '9px 11px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{err}</div>
      )}
    </div>
  );
}

export default function PublicSignPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  /** על איזה טופס חותמים עכשיו, ומה נאסף עד כה מכולם. */
  const [docIndex, setDocIndex] = useState(0);
  const [collected, setCollected] = useState<Record<string, SignatureValue>>({});
  const [errMsg, setErrMsg] = useState('');
  // מצב בן/בת הזוג מתעדכן גם מתשובת submit — לא רק מהטעינה הראשונה
  const [spouse, setSpouse] = useState<{ pending: boolean; name: string }>({ pending: false, name: '' });

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('signing-session', { body: { action: 'get', token } });
        if (error || !data?.ok) { setPhase('invalid'); return; }
        setSession(data as Session);
        setSpouse({ pending: !!data.spousePending, name: data.spouseName || '' });
        if (data.alreadySigned || data.requestStatus !== 'pending_signature') { setPhase('already'); return; }
        const first = (data.documents?.[0]?.pdfUrl) || data.pdfUrl;
        const res = await fetch(first);
        if (!res.ok) throw new Error('טעינת המסמך נכשלה');
        setPdfBytes(await res.arrayBuffer());
        setPhase('sign');
      } catch (e) {
        // ‼ הלקוח לא רואה את הטקסט הטכני: הוא לרוב באנגלית, לא אומר לו כלום,
        //   ולפעמים חושף פרטי שרת. הפירוט נשאר ב-console לצורך אבחון.
        console.error('[PublicSignPage] טעינת המסמך נכשלה', e);
        setErrMsg('לא הצלחנו לטעון את המסמך. נסו לרענן את הדף, ואם זה חוזר - פנו למשרד.');
        setPhase('error');
      }
    })();
  }, [token]);

  /** רשימת המסמכים, עם נפילה-לאחור לשרת שעוד לא מכיר ריבוי טפסים. */
  function docsOf(sess: Session) {
    return sess.documents?.length
      ? sess.documents
      : [{ key: 'incomeTax', title: 'ייפוי כוח', fields: sess.fields, pdfUrl: sess.pdfUrl, pdfFileName: sess.pdfFileName }];
  }

  /**
   * סיום טופס. ‼ השליחה נעשית **פעם אחת בסוף**, אחרי כל הטפסים: השרת מסמן
   * את החותם כגמור רק כששדותיו מלאים בכולם, ושליחה באמצע הייתה נדחית
   * כ"לא שלם" ומשאירה את החותם בלי דרך להתקדם.
   */
  async function handleComplete(values: Record<string, SignatureValue>) {
    if (!session) return;
    const list = docsOf(session);
    const merged = { ...collected, ...values };
    if (docIndex < list.length - 1) {
      setCollected(merged);
      setPhase('loading');
      try {
        const res = await fetch(list[docIndex + 1].pdfUrl);
        if (!res.ok) throw new Error('טעינת המסמך נכשלה');
        setPdfBytes(await res.arrayBuffer());
        setDocIndex(docIndex + 1);
        setPhase('sign');
      } catch (e) {
        console.error('[PublicSignPage] טעינת המסמך הבא נכשלה', e);
        setErrMsg('לא הצלחנו לטעון את המסמך הבא. נסו לרענן את הדף, ואם זה חוזר - פנו למשרד.');
        setPhase('error');
      }
      return;
    }
    setPhase('submitting');
    try {
      // שולחים רק את הערכים של השדות שלי, מכל הטפסים
      const myFieldIds = new Set(list.flatMap(d => d.fields).filter(f => f.signerId === session.signerId).map(f => f.id));
      const mine: Record<string, SignatureValue> = {};
      for (const [k, v] of Object.entries(merged)) if (myFieldIds.has(k)) mine[k] = v;
      const { data, error } = await supabase.functions.invoke('signing-session', { body: { action: 'submit', token, values: mine } });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'שליחה נכשלה');
      setSpouse({ pending: !!data.spousePending, name: data.spouseName || '' });
      // ההתראה לרו"ח כבר בתור; כאן רק מבקשים לרוקן אותו מיד. לא חוסם.
      flushAccountantNotifications(token);
      setPhase('done');
    } catch (e) {
      console.error('[PublicSignPage] שליחת החתימה נכשלה', e);
      setErrMsg('החתימה לא נשלחה. נסו שוב, ואם זה חוזר - פנו למשרד.');
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
  //   מאותה סיבה, כשחתימת בן/בת הזוג ממתינה — הנישום מקבל כאן את הבחירה
  //   "יחד או בנפרד" ולא הודעת "סיימנו": בלעדיה ייפוי הכוח נשאר חצי-חתום.
  const hi = session?.signerName ? `, ${session.signerName}` : '';
  const spouseBlock = spouse.pending ? <SpouseNextStep token={token} spouseName={spouse.name} /> : null;
  if (phase === 'already') return (session?.ni || spouseBlock) ? (
    <ClientPageState
      wide
      mark="✓"
      title="החתימה כבר התקבלה"
      body={<>
        <div>תודה{hi}!{session?.ni ? ' נשאר צעד אחד - אישור בביטוח הלאומי.' : ''}</div>
        {session?.ni && <NiApprovalNotice referenceNumber={session.ni.referenceNumber} deadline={session.ni.deadline} />}
        {spouseBlock}
      </>}
    />
  ) : (
    <ClientPageState
      mark="✅"
      title="החתימה כבר התקבלה"
      body={`תודה${hi}! אין צורך בפעולה נוספת.`}
    />
  );
  if (phase === 'done') return (session?.ni || spouseBlock) ? (
    <ClientPageState
      wide
      mark="✓"
      title={session?.ni ? 'החתימה התקבלה - נשאר צעד אחד' : 'החתימה התקבלה'}
      body={<>
        <div>תודה{hi}! {session?.firmName || 'המשרד'} יגיש עכשיו את בקשת הייצוג לרשויות.{session?.ni ? ' הפעולה האחרונה שנשארה היא שלכם:' : ''}</div>
        {session?.ni && <NiApprovalNotice referenceNumber={session.ni.referenceNumber} deadline={session.ni.deadline} />}
        {spouseBlock}
      </>}
    />
  ) : (
    <ClientPageState
      mark="🎉"
      title="החתימה נשלחה בהצלחה"
      body={`תודה${hi}! ${session?.firmName || 'המשרד'} יגיש עכשיו את בקשת הייצוג לרשויות ויעדכן אתכם.`}
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
  const list = docsOf(session);
  const current = list[docIndex];
  const many = list.length > 1;
  return (
    <SigningRoom
      key={current.key}
      pdfBytes={pdfBytes.slice(0)}
      pdfFileName={current.pdfFileName}
      fields={current.fields}
      signers={signers}
      activeSignerId={session.signerId}
      // הלקוח רואה רק איפה הוא (ובן/בת זוגו) חותמים. מקום החתימה של הרו"ח
      // אינו עניינו, ורק מעלה שאלות על טופס שנראה חסר.
      hiddenSignerIds={['accountant']}
      initialValues={{ ...session.values, ...collected }}
      /* ‼ כשיש כמה טפסים הכותרת אומרת על מה חותמים ואיפה זה עומד — אחרת
         נראה כאילו אותו מסך חוזר על עצמו בלי סיבה. */
      title={many
        ? `✍ טופס ${docIndex + 1} מתוך ${list.length} · ${current.title}`
        : `✍ חתימה על ייפוי כוח - ${session.signerName}`}
      completeLabel={many && docIndex < list.length - 1 ? 'המשך לטופס הבא' : undefined}
      onComplete={handleComplete}
      onCancel={() => window.location.reload()}
    />
  );
}
