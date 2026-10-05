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
import { applyMapping } from './mapping';
import SampleSimulatedNote from '../../components/linkedScreens/SampleNote';
import { samplePublicSmartFormSignActions } from '../../components/linkedScreens/sampleSignFormActions';
import type { SimulatedResult } from '../../components/linkedScreens/sampleActions';
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

/** כל מה שהדף עושה מול העולם. בעמוד האמיתי — השרת; בתצוגה לדוגמה — פעולה שאינה נוגעת בכלום. */
export interface PublicSmartFormSignActions {
  submit(dataUrl: string, contentSha256: string, consent: boolean):
    Promise<{ status: 'result'; ok: boolean; reason?: string; allSigned?: boolean } | SimulatedResult>;
}

export function livePublicSmartFormSignActions(token: string): PublicSmartFormSignActions {
  return {
    async submit(dataUrl, contentSha256, consent) {
      const r = await submitPublicSignature(token, dataUrl, contentSha256, consent);
      return { status: 'result', ok: r.ok, reason: r.reason, allSigned: r.allSigned };
    },
  };
}

/**
 * (210) מציירים במיפוי של הגרסה שנחתמת (מהשרת). גרסה מתחת לבסיס הקוד — אין איך לצייר אותה;
 * גרסה שאינה הפעילה — השרת ממילא חוסם את החתימה.
 */
export function resolveSignTemplate(info: PublicSigning | null) {
  const template = info?.ok && info.mappingVersion != null
    ? applyMapping(BTL6101_TEMPLATE, { version: info.mappingVersion, fields: info.mapping ?? {} }) : null;
  const templateOk = !!info?.ok && !!template && info.templateKey === BTL6101_TEMPLATE.key && info.templateSha256 === BTL6101_TEMPLATE.sha256
    && (info.mappingVersion ?? 0) >= BTL6101_TEMPLATE.mappingVersion
    && (info.activeMappingVersion == null || info.mappingVersion === info.activeMappingVersion);
  return { template, templateOk };
}

export default function PublicSmartFormSignPage({ token }: { token: string }) {
  const [info, setInfo] = useState<PublicSigning | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const actions = useMemo(() => livePublicSmartFormSignActions(token), [token]);

  useEffect(() => { void getPublicSigning(token).then(setInfo); }, [token]);

  const { template, templateOk } = useMemo(() => resolveSignTemplate(info), [info]);

  useEffect(() => {
    if (!info?.ok || info.alreadySigned || !templateOk || !info.data || !template) return;
    void renderBtl6101({ ...info.data, declarationDate: info.clientSignedAt ? israelDate(info.clientSignedAt) : '' }, info.purposes ?? [], {
      signatures: info.otherSignatures ?? {}, title: 'דין וחשבון רב שנתי (6101)', template,
    }).then(r => setBytes(r.bytes)).catch(e => setRenderError(e instanceof Error ? e.message : String(e)));
  }, [info, templateOk, template]);

  if (!info) return <div className="sf-public"><p className="sf-note">טוען…</p></div>;
  return <PublicSmartFormSignView info={info} bytes={bytes} renderError={renderError} actions={actions} />;
}

export type PublicSmartFormSignViewProps = {
  info: PublicSigning;
  /** הטופס המצויר (אותו מנוע ייצוא) — חסר עד שהציור מסתיים. */
  bytes: Uint8Array | null;
  /** הציור נכשל — מוצג במקום שבו מוצגות שגיאות החתימה. */
  renderError?: string | null;
} & (
  | { mode?: 'live'; actions: PublicSmartFormSignActions }
  /** בתצוגה לדוגמה אפשר להשמיט את `actions` — ברירת המחדל לא נוגעת בכלום. */
  | { mode: 'sample'; actions?: PublicSmartFormSignActions }
);

/**
 * דף החתימה עצמו, בלי טעינה: הנתונים נכנסים ב-`info` ו-`bytes`, וכל מה שיוצא החוצה
 * עובר ב-`actions`. כך אותו דף בדיוק משמש את הקישור האמיתי ואת «צפייה» במשרד.
 */
export function PublicSmartFormSignView(props: PublicSmartFormSignViewProps) {
  const { info, bytes, renderError } = props;
  const sample = props.mode === 'sample';
  const actions: PublicSmartFormSignActions = props.actions ?? samplePublicSmartFormSignActions;
  const [png, setPng] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { allSigned: boolean }>(null);
  const [simulated, setSimulated] = useState(false);

  useEffect(() => { if (renderError) setError(renderError); }, [renderError]);

  const { template, templateOk } = useMemo(() => resolveSignTemplate(info), [info]);

  const mySpot = useMemo<Hotspot[]>(() => {
    const f = (template ?? BTL6101_TEMPLATE).fields.find(x => x.kind === 'signature' && x.signer === info?.role);
    return f ? [{ page: f.page, box: f.box, key: 'sig', tone: 'warn', title: 'כאן תופיע החתימה' }] : [];
  }, [info?.role, template]);

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
    setBusy(true); setError(null); setSimulated(false);
    try {
      const t = await trimSignature(png);
      const r = await actions.submit(t.dataUrl, info.contentSha256 ?? '', consent);
      if (r.status === 'simulated') { setSimulated(true); return; }
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
      {sample && simulated && <SampleSimulatedNote />}
      <div className="sf-actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={busy || !consent || !png} onClick={() => void submit()}>
          {busy ? 'שולח…' : 'חתימה ואישור'}
        </button>
      </div>
      <p className="sf-note" style={{ marginTop: '1rem' }}>הקישור אישי ומיועד לחתימה אחת בלבד.</p>
    </div>
  );
}
