// ─── דף החתימה הציבורי של טופס חכם (?sign-form=<token>) ────────────────────
// החותם רואה את הטופס המלא בדיוק כפי שיוגש (אותו מנוע ייצוא), מאשר במפורש
// וחותם. ‼ הטביעה שהוצגה נשלחת עם החתימה, והשרת דוחה אם התוכן השתנה בינתיים.

import { useEffect, useMemo, useState } from 'react';
import SignaturePad from '../../components/SignaturePad';
import SmartFormPreview, { type Hotspot } from './SmartFormPreview';
import { getPublicSigning, submitPublicSignature, type PublicSigning } from './api';
import { BTL6101_TEMPLATE } from './btl6101/template';
import { israelDate, renderBtl6101 } from './btl6101/document';
import { EmptySignatureError, trimSignature } from './signatureImage';
import './smartForms.css';

const REASONS: Record<string, string> = {
  not_found: 'הקישור אינו תקף. ייתכן שכבר נחתם, או שנשלח קישור חדש יותר.',
  link_expired: 'תוקף הקישור פג. אפשר לבקש מהמשרד קישור חדש.',
  not_signable: 'הטופס כבר אינו ממתין לחתימה — ייתכן שהמשרד עדכן אותו. אפשר לבקש קישור חדש.',
  content_changed: 'הטופס השתנה מאז שנפתח. יש לרענן את הדף ולעבור עליו שוב.',
  consent_required: 'יש לאשר את ההצהרה לפני החתימה.',
  bad_signature_image: 'החתימה ריקה — יש לחתום בתיבה.',
  network: 'אין חיבור כרגע. נסו שוב בעוד רגע.',
};

export default function PublicSmartFormSignPage({ token }: { token: string }) {
  const [info, setInfo] = useState<PublicSigning | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [png, setPng] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { allSigned: boolean }>(null);

  useEffect(() => { void getPublicSigning(token).then(setInfo); }, [token]);

  const templateOk = !!info?.ok && info.templateKey === BTL6101_TEMPLATE.key && info.templateSha256 === BTL6101_TEMPLATE.sha256
    && info.mappingVersion === BTL6101_TEMPLATE.mappingVersion;

  useEffect(() => {
    if (!info?.ok || info.alreadySigned || !templateOk || !info.data) return;
    void renderBtl6101({ ...info.data, declarationDate: info.clientSignedAt ? israelDate(info.clientSignedAt) : '' }, info.purposes ?? [], {
      signatures: info.otherSignatures ?? {}, title: 'דין וחשבון רב שנתי (6101)',
    }).then(r => setBytes(r.bytes)).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [info, templateOk]);

  const mySpot = useMemo<Hotspot[]>(() => {
    const f = BTL6101_TEMPLATE.fields.find(x => x.kind === 'signature' && x.signer === info?.role);
    return f ? [{ page: f.page, box: f.box, key: 'sig', tone: 'warn', title: 'כאן תופיע החתימה' }] : [];
  }, [info?.role]);

  if (!info) return <div className="sf-public"><p className="sf-note">טוען…</p></div>;
  if (!info.ok) return <div className="sf-public"><h1>חתימה על טופס</h1><p>{REASONS[info.reason ?? ''] ?? 'הקישור אינו תקף.'}</p></div>;
  if (info.alreadySigned) return <div className="sf-public"><h1>החתימה כבר התקבלה</h1><p>תודה. אין צורך לעשות דבר נוסף.</p></div>;
  if (!templateOk) return <div className="sf-public"><h1>חתימה על טופס</h1><p>הטופס אינו זמין כרגע. נא לפנות למשרד.</p></div>;
  if (done) {
    return (
      <div className="sf-public">
        <h1>החתימה התקבלה — תודה</h1>
        <p>{done.allSigned ? `${info.firmName || 'המשרד'} ימשיך מכאן בהגשת הטופס לביטוח לאומי.` : 'החתימה נקלטה. הטופס ממתין לחתימה נוספת לפני ההגשה.'}</p>
        <p className="sf-note">חתימה אינה אישור של ביטוח לאומי. התשובה תגיע מביטוח לאומי לאחר ההגשה.</p>
      </div>
    );
  }

  const isSpouse = info.role === 'spouse';
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const t = await trimSignature(png);
      const r = await submitPublicSignature(token, t.dataUrl, info.contentSha256 ?? '', consent);
      if (!r.ok) { setError(REASONS[r.reason ?? ''] ?? 'החתימה לא נקלטה. נסו שוב.'); return; }
      setDone({ allSigned: !!r.allSigned });
    } catch (e) {
      setError(e instanceof EmptySignatureError ? REASONS.bad_signature_image : 'החתימה לא נקלטה. נסו שוב.');
    } finally { setBusy(false); }
  };

  return (
    <div className="sf-public">
      <div className="sf-note">{info.firmName}</div>
      <h1>{isSpouse ? 'חתימת בן/בת הזוג על טופס 6101' : 'חתימה על טופס 6101 לביטוח לאומי'}</h1>
      <p style={{ margin: '.2rem 0', lineHeight: 1.6 }}>
        שלום {info.signerName}. זה הטופס <b>«דין וחשבון רב שנתי» (6101)</b> כפי שיוגש לביטוח לאומי.
        {isSpouse ? ' החתימה שלך נדרשת על הפרטים בסעיף 4 בעמוד 2 — עבודתך בעסק.' : ' יש לעבור על כל העמודים לפני החתימה.'}
      </p>
      <div className="sf-public-pages">
        <SmartFormPreview bytes={bytes} hotspots={mySpot} busy={!bytes} />
      </div>
      <label className="sf-declare">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>{isSpouse
          ? 'קראתי את סעיף 4 בטופס. הפרטים על עבודתי בעסק נכונים, ואני חותם/ת בעצמי.'
          : 'קראתי את הטופס ואת ההצהרה בעמוד 3. הפרטים נכונים ומלאים, ואני חותם/ת בעצמי.'}</span>
      </label>
      <div style={{ margin: '.7rem 0 .4rem', fontWeight: 600 }}>החתימה</div>
      <div className="sf-pad"><SignaturePad value={png} onChange={setPng} height={170} /></div>
      {error && <div className="sf-error" style={{ marginTop: '.5rem' }}>{error}</div>}
      <div className="sf-actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={busy || !consent || !png} onClick={() => void submit()}>
          {busy ? 'שולח…' : 'חתימה ואישור'}
        </button>
      </div>
      <p className="sf-note" style={{ marginTop: '1rem' }}>הקישור אישי ומיועד לחתימה אחת בלבד.</p>
    </div>
  );
}
