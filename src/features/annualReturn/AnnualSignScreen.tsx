// ─── הדף האישי: הדוח השנתי לחתימה (297; docs/proposals/2026-10-25-annual-return-signing.html) ─────────────────────
// ‼ הלקוח רואה בדיוק את מה שהמשרד שלח (הצילום מהשרת, אותם רכיבים כמו במשרד — ReturnView), מסמן הצהרה וחותם באצבע.
//   בדוח משותף — כל אחד בנפרד, באותו מכשיר או מכשיר אחר. «נחתם» רק אחרי שהשרת אישר את כל החתימות.
import { useEffect, useState } from 'react';
import SignaturePad from '../../components/SignaturePad';
import { EmptySignatureError, trimSignature } from '../smartForms/signatureImage';
import { isWealthSnap, portalGetSigning, portalSign, signErrorText, type PortalSigning, type Role } from './signing';
import { WealthFormView, WealthSummary, wealthHeadline } from '../wealthDeclaration/WealthView';
import { balanceText, neededAnnexes } from './workspace';
import { slugOfForm } from './formPages';
import { FormView, Summary } from './ReturnView';
import type { FormSlug } from '../taxKnowledge/formMap/model';

export default function AnnualSignScreen({ stepId, token, onClose }: { stepId: string; token: string; onClose: () => void }) {
  const [v, setV] = useState<PortalSigning | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'sum' | '1219' | FormSlug>('sum');
  const [decl, setDecl] = useState(false);
  const [png, setPng] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  const load = async () => {
    const r = await portalGetSigning(token, stepId);
    if (!r.ok) { setErr(signErrorText(r.error)); return; }
    setV(r); setErr(null);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stepId, token]);
  if (err && !v) return <p role="alert" className="as-msg">{err}</p>;
  if (!v) return <p className="as-msg">טוען…</p>;

  const snap = v.snapshot;
  // ‼ 300 · אותו מסך לחתימה על הצהרת הון — הסיכום ו-1219 במקום 1301
  const wealth = isWealthSnap(snap) ? snap : null;
  const out = isWealthSnap(snap) ? null : snap.out;
  const signedAll = v.state === 'signed';
  const next = v.signers.find(g => !g.signed);
  const bal = wealth ? `הון נטו: ${wealthHeadline(wealth).net}` : out ? balanceText(out) : null;
  const annexes = out ? neededAnnexes(out) : [];
  const what = wealth ? 'ההצהרה' : 'הדוח';
  const sign = async (role: Role) => {
    setBusy(true); setErr(null);
    try {
      const t = await trimSignature(png);
      const r = await portalSign(token, stepId, role, t.dataUrl, v.contentSha256);
      if (!r.ok) { setErr(signErrorText(r.error)); if (r.error === 'content_changed' || r.error === 'already_signed') await load(); return; }
      // ‼ קודם המצב המעודכן מהשרת, ורק אז «תודה» — אחרת «עכשיו …» מצביע על מי שכבר חתם
      const who = v.signers.find(g => g.role === role)!;
      await load();
      setThanks(who.name); setDecl(false); setPng('');
    } catch (e) {
      setErr(e instanceof EmptySignatureError ? 'חותמים בתוך המסגרת' : 'החתימה לא נשמרה — נסו שוב');
    } finally { setBusy(false); }
  };

  return (
    <div className="as" data-annual-sign>
      {thanks && (
        <div className="as-thanks" role="status">
          <span className="as-ok" aria-hidden="true">✓</span>
          <div><b>{signedAll ? 'נחתם. תודה!' : `תודה, ${thanks}`}</b>
            <p>{signedAll ? `המשרד יגיש את ${what}.` : next ? `עכשיו ${next.name} — כאן, או מהדף בכל מכשיר.` : ''}</p></div>
        </div>
      )}
      {!thanks && signedAll && <div className="as-thanks"><span className="as-ok" aria-hidden="true">✓</span><div><b>{wealth ? 'ההצהרה נחתמה' : 'הדוח נחתם'}</b><p>המשרד יגיש {wealth ? 'אותה' : 'אותו'}.</p></div></div>}

      <div className="aw-card">
        {bal && <div className="as-bal"><small>{wealth ? `ליום ${wealth.asOf.split('-').reverse().join('.')}` : 'הערכה'}</small><b>{bal}</b></div>}
        <div className="aw-tabs" role="tablist" aria-label={what}>
          <button type="button" role="tab" aria-selected={tab === 'sum'} onClick={() => setTab('sum')}>{wealth ? 'סיכום' : 'עמוד ריכוז'}</button>
          {wealth ? <button type="button" role="tab" aria-selected={tab === '1219'} onClick={() => setTab('1219')} data-as-tab="1219">1219</button>
            : <button type="button" role="tab" aria-selected={tab === '1301'} onClick={() => setTab('1301')} data-as-tab="1301">1301</button>}
          {annexes.map(a => { const s = slugOfForm(a.formId); return s ? <button key={a.formId} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}>{a.formId}</button> : null; })}
        </div>
        {wealth ? (tab === 'sum' ? <WealthSummary d={wealth} /> : <WealthFormView d={wealth} />)
          : out && (tab === 'sum' ? <Summary out={out} lit={new Set()} firstName={snap.names.client} spouseName={snap.names.spouse ?? ''} married={!!snap.names.spouse} />
          : <FormView slug={tab} out={out} lit={new Set()} />)}
      </div>

      {!signedAll && next && (
        <section className="as-sign" aria-label={`החתימה של ${next.name}`}>
          <span className={`as-who${next.role === 'spouse' ? ' is-p2' : ''}`}><i aria-hidden="true">{next.name[0]}</i>החתימה של {next.name}</span>
          <label className="as-decl">
            <input type="checkbox" checked={decl} onChange={e => setDecl(e.target.checked)} data-as-decl />
            <span>{next.gender === 'f' ? 'אני מצהירה' : 'אני מצהיר'} שהפרטים ב{wealth ? 'הצהרה' : 'דוח'} נכונים ומלאים.</span>
          </label>
          <div className="as-pad"><SignaturePad value={png} onChange={setPng} height={150} /></div>
          {err && <p role="alert" className="as-err">{err}</p>}
          <div className="as-foot">
            <button type="button" className="as-later" onClick={onClose}>אחר כך</button>
            <button type="button" className="as-btn" disabled={!decl || !png || busy} onClick={() => void sign(next.role)} data-as-sign>{busy ? 'שומר…' : 'חתימה'}</button>
          </div>
        </section>
      )}
      {(signedAll || !next) && <div className="as-foot"><button type="button" className="as-later" onClick={onClose}>סגירה</button></div>}
    </div>
  );
}
