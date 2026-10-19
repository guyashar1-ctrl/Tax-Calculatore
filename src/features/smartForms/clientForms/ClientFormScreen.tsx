// ─── הדף האישי: מילוי וחתימה על טופס רשמי (247) ─────────────────────────────
// מסך משלו, כמו «השלמת מידע» (TaxInfoScreen): פתיחה ⇒ קבוצת שאלות אחת למסך (רק מה שחסר,
// ומה שהלקוח מצהיר) ⇒ הטופס המלא כפי שיוגש ⇒ הצהרה וחתימה.
// ‼ כל מסך נשמר מיד בשרת (portal_smart_form_save) — יציאה באמצע לא מאבדת כלום. תשובה לפרט
//   שיש לו בית בכרטיס נשמרת בכרטיס, בשרת. «לצפייה בטופס» נועל את מה שמוצג (טביעה בשרת),
//   והחתימה נדחית אם משהו השתנה מאז. ‼ פרטי זהות שכבר אצל המשרד אינם נערכים מכאן.
// ‼ 16.10.2026 · הטופס חי: לצד כל מסך שאלות (במחשב) או מתחתיו (בטלפון) רואים את הטופס מתמלא תוך כדי
//   הקלדה, עם סימון כל תיבת חובה ואזור החתימה. בסקירה — אותם סימונים, והחתימה נכנסת לתיבה המסומנת.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SignaturePad from '../../../components/SignaturePad';
import LiveFormPreview, { MissingSummary } from './LiveFormPreview';
import { EmptySignatureError, trimSignature } from '../signatureImage';
import type { CfData, CfScreen, ClientFormDef } from './types';
import { blockers, clientFormOf, editableFields, flowScreens, formMarkers, screenHint, screenMissing, screenOfQuestion, screenRelevant, screenTitle, screenValues, templateFor, type FormMarker } from './registry';
import { fieldError } from './format';
import CfFields, { bankNameOf } from './CfFields';
import { clientFormErrorText, portalGet, portalPrepare, portalSave, portalSign, type ClientFormView } from './api';
import { renderSignedClientForm, storeSignedFromPortal } from './signedFile';
import '../../taxYear/taxYear.css';
import '../smartForms.css';
import './clientForms.css';
import { CLIENT_FORM_HASH, openClientFormFromHash } from './hash';


type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'intro' }
  | { kind: 'screen'; index: number; list: CfScreen[]; edit?: boolean }
  | { kind: 'pick' }
  | { kind: 'review' }
  | { kind: 'done' };

interface Props { stepId: string; token: string; label: string; onClose: () => void }

export default function ClientFormScreen({ stepId, token, label, onClose }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (openClientFormFromHash() !== stepId) history.pushState({ clientForm: stepId }, '', `#${CLIENT_FORM_HASH}${encodeURIComponent(stepId)}`);
    const onPop = () => { if (openClientFormFromHash() !== stepId) onClose(); };
    window.addEventListener('popstate', onPop);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    head.current?.focus();
    return () => { window.removeEventListener('popstate', onPop); document.body.style.overflow = prev; };
  }, [stepId, onClose]);
  const close = () => {
    if (openClientFormFromHash() === stepId) history.back();
    else onClose();
  };

  const [view, setView] = useState<ClientFormView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const def = view ? clientFormOf(view.templateKey) : null;

  const load = useCallback(async () => {
    const v = await portalGet(token, stepId);
    if (!v.ok) { setPhase({ kind: 'error', message: clientFormErrorText(v.error) }); return; }
    const d = clientFormOf(v.templateKey);
    if (!d) { setPhase({ kind: 'error', message: 'הטופס אינו זמין כרגע. אפשר לפנות למשרד.' }); return; }
    setView(v);
    if (v.revisionState === 'signed') { setPhase({ kind: 'done' }); return; }
    if (v.revisionState === 'locked') { setPhase({ kind: 'review' }); return; }
    setPhase({ kind: 'intro' });
  }, [token, stepId]);
  useEffect(() => { void load(); }, [load]);

  const title = view?.title || label;
  return (
    <div className="tis" role="dialog" aria-modal="true" aria-labelledby="cf-h" data-client-form={stepId}>
      <header className="tis-head">
        <button type="button" className="tis-back" onClick={close}>→ חזרה לבקשות</button>
        <div className="tis-titles">
          <h1 id="cf-h" ref={head} tabIndex={-1}>{title}</h1>
          <span className="tis-sub">התשובות נשמרות בכל שלב — אפשר לצאת ולחזור מאותו קישור</span>
        </div>
      </header>
      <main className="tis-body">
        <div className="ty-flow">
          {phase.kind === 'loading' && <p className="ty-note">טוען…</p>}
          {phase.kind === 'error' && <div className="ty-err" role="alert">{phase.message}</div>}
          {def && view && phase.kind === 'intro' && <Intro def={def} view={view} onStart={list => setPhase(list.length ? { kind: 'screen', index: 0, list } : { kind: 'review' })} />}
          {def && view && phase.kind === 'screen' && (
            <ScreenStep key={`${phase.list[phase.index].id}-${phase.index}`} def={def} view={view} token={token} stepId={stepId}
              list={phase.list} index={phase.index} edit={!!phase.edit}
              onSaved={v => setView(v)}
              onBack={() => setPhase(phase.index > 0 ? { ...phase, index: phase.index - 1 } : phase.edit ? { kind: 'review' } : { kind: 'intro' })}
              onNext={(v) => {
                const d = v.data;
                let n = phase.index + 1;
                while (n < phase.list.length && !screenRelevant(phase.list[n], d)) n++;
                setPhase(n < phase.list.length && !phase.edit ? { ...phase, index: n } : { kind: 'review' });
              }}
              onExit={close} />
          )}
          {def && view && phase.kind === 'pick' && (
            <EditPicker def={def} view={view} onPick={s => setPhase({ kind: 'screen', index: 0, list: [s], edit: true })} onBack={() => setPhase({ kind: 'review' })} />
          )}
          {def && view && phase.kind === 'review' && (
            <Review def={def} view={view} token={token} stepId={stepId}
              onView={setView}
              onFix={list => setPhase({ kind: 'screen', index: 0, list, edit: true })}
              onEdit={() => setPhase({ kind: 'pick' })}
              onSigned={() => void load()} />
          )}
          {def && view && phase.kind === 'done' && <Done def={def} view={view} onClose={close} />}
        </div>
      </main>
    </div>
  );
}

// ── פתיחה ────────────────────────────────────────────────────────────────────
const KNOWN_LABELS: [string, string][] = [
  ['idNumber', 'מספר זהות'], ['homeStreet', 'כתובת'], ['mobile', 'טלפון'], ['spouseIdNumber', 'פרטי בן/בת הזוג'],
  ['businessName', 'שם העסק'], ['activity', 'תיאור העסק'], ['bankAccount', 'חשבון בנק'], ['taxOffice', 'פקיד השומה'],
];

function Intro({ def, view, onStart }: { def: ClientFormDef; view: ClientFormView; onStart: (list: CfScreen[]) => void }) {
  const d = view.data;
  const list = flowScreens(def, d, new Set());
  const known = KNOWN_LABELS.filter(([k]) => view.card[k] && def.screens.some(s => s.fields.some(f => f.key === k)));
  return (
    <div className="cf-intro">
      <p>{def.intro}</p>
      {known.length > 0 && (
        <div className="cf-known">
          <span className="cf-known-h">כבר אצלנו, וימולא בטופס אוטומטית:</span>
          <ul>{known.map(([k, l]) => <li key={k}>{l}</li>)}</ul>
        </div>
      )}
      <p className="ty-hint">{list.length === 0 ? 'כל הפרטים כבר אצלנו — נשאר לעבור על הטופס ולחתום.'
        : list.length === 1 ? 'נשאר מסך אחד קצר, ואז תראו את הטופס המלא ותחתמו.'
        : `נשארו ${list.length} מסכים קצרים, ואז תראו את הטופס המלא ותחתמו.`}</p>
      <div className="ty-nav">
        <span />
        <button type="button" className="btn btn-primary" onClick={() => onStart(list)}>{list.length ? 'התחלה' : 'לצפייה בטופס'}</button>
      </div>
    </div>
  );
}

// ── מסך שאלות ────────────────────────────────────────────────────────────────
function ScreenStep({ def, view, token, stepId, list, index, edit, onSaved, onBack, onNext, onExit }: {
  def: ClientFormDef; view: ClientFormView; token: string; stepId: string; list: CfScreen[]; index: number; edit: boolean;
  onSaved: (v: ClientFormView) => void; onBack: () => void; onNext: (v: ClientFormView) => void; onExit: () => void;
}) {
  const s = list[index];
  const d = view.data;
  // ‼ ערכים התחלתיים: מה שכבר ידוע, ואם אין — הצעה (טלפון העסק = הנייד, «אחר: דירת מגורים»…)
  const [form, setForm] = useState<CfData>(() => {
    const init: CfData = {};
    for (const f of s.fields) {
      const v = d[f.key] ?? '';
      // ‼ אותו מפתח יכול להופיע פעמיים (למשל «על שם מי» / «ממי שוכרים») — לא לדרוס הצעה שכבר נקבעה
      init[f.key] = init[f.key] || v || (f.suggest ? f.suggest(d) ?? '' : '');
    }
    return init;
  });
  const merged = { ...d, ...form };
  const fields = editableFields(s, merged, view.card);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const invalid = fields.some(f => fieldError(f, form[f.key], merged));
  const t = screenTitle(s, merged);
  const hint = screenHint(s, merged);

  const save = async () => {
    if (invalid) { setTried(true); return; }
    setBusy(true); setErr(null);
    const values = screenValues(s, form, d);
    // שדות זהות שכבר בכרטיס אינם נשלחים (לא נערכים מכאן)
    for (const f of s.fields) if (s.identity && view.card[f.key]) delete values[f.key];
    if (values.bankCode) values.bankName = (await bankNameOf(values.bankCode)) ?? values.bankName;
    const v = await portalSave(token, stepId, values);
    setBusy(false);
    if (!v.ok) { setErr(clientFormErrorText(v.error, v.field)); return; }
    onSaved(v);
    onNext(v);
  };

  const progress = Math.round(((index) / Math.max(1, list.length)) * 100);
  // ‼ הטופס החי: מה שמוקלד עכשיו, אחרי אותן השלמות שהשמירה תעשה (למשל «מהבית» מעתיק את כתובת המגורים)
  const liveData = useMemo(() => ({ ...d, ...screenValues(s, form, d) }), [d, s, form]);
  const template = useMemo(() => templateFor(def, { version: view.mappingVersion, fields: view.mapping ?? {} }), [def, view.mappingVersion, view.mapping]);
  const focusKeys = useMemo(() => fields.map(f => f.key), [fields]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const preview = (title: string, show: boolean) => (show ? (
    <LiveFormPreview def={def} data={liveData} template={template} focusKeys={focusKeys} title={title} signTag="כאן תחתמו בסוף" maxFit={1} />
  ) : null);
  return (
    <>
      {!edit && (
        <>
          <div className="ty-flow-top"><span>{def.clientTitle}</span><span>{index + 1} מתוך {list.length}</span></div>
          <div className="ty-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${progress}%` }} /></div>
        </>
      )}
      <div className="cf-live-wrap">
        <div className="ty-flow" style={{ minWidth: 0 }}>
          <p className="ty-q">{t}</p>
          {hint && <p className="ty-hint">{hint}</p>}
          <CfFields fields={fields} values={form} data={d} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))} showErrors={tried} disabled={busy} />
          {s.why && <details className="ty-why-q"><summary>למה שואלים?</summary><p>{s.why}</p></details>}
          <details className="cf-live-mobile" open={mobileOpen} onToggle={e => setMobileOpen((e.target as HTMLDetailsElement).open)} data-cf-live-mobile>
            <summary>הטופס מתמלא תוך כדי — להצצה</summary>
            <div className="cf-review-pages">{preview('הטופס עם מה שמילאתם עד כה', mobileOpen)}</div>
          </details>
        </div>
        <aside className="cf-live-side" aria-label="הטופס כפי שהוא עכשיו" data-cf-live-side>{preview('הטופס מתמלא תוך כדי', true)}</aside>
      </div>
      {tried && invalid && <div className="ty-err" role="alert">חסרים פרטים או שיש פרט לא תקין — מסומן באדום</div>}
      {err && <div className="ty-err" role="alert">{err}</div>}
      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>{edit ? 'ביטול' : 'הקודם'}</button>
        {!edit && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onExit}>יציאה (נשמר)</button>}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'שומר…' : edit ? 'שמירה וחזרה לטופס' : index === list.length - 1 ? 'לצפייה בטופס' : 'הבא'}
        </button>
      </div>
    </>
  );
}

// ── «משהו לא נכון?» — בחירת מסך לעריכה ───────────────────────────────────────
function EditPicker({ def, view, onPick, onBack }: { def: ClientFormDef; view: ClientFormView; onPick: (s: CfScreen) => void; onBack: () => void }) {
  const d = view.data;
  const screens = def.screens.filter(s => !s.officeOnly && screenRelevant(s, d) && editableFields(s, d, view.card).length > 0);
  return (
    <>
      <p className="ty-q">מה לתקן?</p>
      <p className="ty-hint">פרט שתתקנו כאן מתעדכן גם בתיק שלכם במשרד. מספר זהות ושם — מתקנים דרך המשרד.</p>
      <div className="ty-choices">
        {screens.map(s => <button key={s.id} type="button" className="ty-choice" onClick={() => onPick(s)}>{screenTitle(s, d)}</button>)}
      </div>
      <div className="ty-nav"><button type="button" className="btn btn-ghost" onClick={onBack}>חזרה לטופס</button><span /></div>
    </>
  );
}

// ── הטופס המלא, הצהרה וחתימה ──────────────────────────────────────────────────
function Review({ def, view, token, stepId, onView, onFix, onEdit, onSigned }: {
  def: ClientFormDef; view: ClientFormView; token: string; stepId: string;
  onView: (v: ClientFormView) => void; onFix: (list: CfScreen[]) => void; onEdit: () => void; onSigned: () => void;
}) {
  const [prepared, setPrepared] = useState<ClientFormView | null>(view.revisionState === 'locked' ? view : null);
  const [err, setErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [png, setPng] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useMemo(() => blockers(def, view.data), [def, view.data]);

  // ‼ «לצפייה בטופס» = הכנה בשרת (נעילה + טביעה). חסר חובה ⇒ חוזרים למסך שבו הוא.
  useEffect(() => {
    if (prepared) return;
    if (pending.length) return;
    let alive = true;
    void portalPrepare(token, stepId).then(v => {
      if (!alive) return;
      if (!v.ok) { setErr(clientFormErrorText(v.error)); return; }
      setPrepared(v); onView(v);
    });
    return () => { alive = false; };
  }, [prepared, pending.length, token, stepId, onView]);

  const template = useMemo(() => templateFor(def, { version: (prepared ?? view).mappingVersion, fields: (prepared ?? view).mapping ?? {} }), [def, prepared, view]);
  const liveData = prepared?.data ?? view.data;
  const markers = useMemo(() => formMarkers(def, liveData), [def, liveData]);
  // לחיצה על תיבה «חסר» על הטופס ⇒ המסך שבו השאלה
  const fixMarker = (m: FormMarker) => { const sc = screenOfQuestion(def, m.questionKeys, view.data); if (sc) onFix([sc]); };

  if (pending.length) {
    const screens = [...new Set(pending.map(p => p.screen))];
    return (
      <>
        <p className="ty-q">חסרים עוד כמה פרטים</p>
        <ul className="ty-lines">{pending.slice(0, 8).map((p, i) => <li key={i}>{p.field.label}{p.message !== 'חסר' ? ` — ${p.message}` : ''}</li>)}</ul>
        <MissingSummary markers={markers} onPick={fixMarker} />
        <div className="cf-review-pages"><LiveFormPreview def={def} data={view.data} template={template} onMarker={fixMarker} title="הטופס — מה שחסר מסומן" signTag="כאן תחתמו בסוף" /></div>
        <div className="ty-nav"><span /><button type="button" className="btn btn-primary" onClick={() => onFix(screens)}>להשלמה</button></div>
      </>
    );
  }

  const sign = async () => {
    if (!prepared?.contentSha256) return;
    setBusy(true); setErr(null);
    try {
      const t = await trimSignature(png);
      const r = await portalSign(token, stepId, t.dataUrl, prepared.contentSha256, consent);
      if (!r.ok) { setErr(clientFormErrorText(r.error)); return; }
      // ‼ 17.10.2026 · הקובץ החתום נשמר במסמכי הלקוח עכשיו, מאותו טופס שהלקוח ראה וחתם עליו.
      //   כשל כאן אינו מעניין את הלקוח — החתימה כבר נקלטה, והמשרד בונה את הקובץ כגיבוי.
      if ((r as { allSigned?: boolean }).allSigned) {
        try {
          const bytes = await renderSignedClientForm(def, prepared.data, {
            template, signature: t.dataUrl,
            clientName: `${prepared.card.firstName ?? ''} ${prepared.card.lastName ?? ''}`.trim(),
          });
          const s = await storeSignedFromPortal(token, stepId, bytes);
          if (!s.ok) console.warn('[ClientFormScreen] signed file not stored', s.error);
        } catch (e) { console.warn('[ClientFormScreen] signed file not built', e); }
      }
      onSigned();
    } catch (e) {
      setErr(e instanceof EmptySignatureError ? clientFormErrorText('bad_signature_image') : 'החתימה לא נקלטה. נסו שוב.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <p className="ty-q">זה הטופס כפי שיוגש ל{def.authorityLabel}</p>
      <p className="ty-hint">עברו על הפרטים. אם משהו לא נכון — אפשר לתקן לפני החתימה. החתימה שתחתמו למטה תיכנס לתיבה המסומנת «כאן תיכנס החתימה שלך».</p>
      <MissingSummary markers={markers} />
      <div className="cf-review-pages">
        <LiveFormPreview def={def} data={liveData} template={template} ready={!!prepared} signTag="כאן תיכנס החתימה שלך" onRenderError={setErr} />
      </div>
      <div className="cf-edit-list"><button type="button" className="btn btn-ghost" onClick={onEdit} disabled={busy}>משהו לא נכון? תיקון</button></div>
      {def.signNote && <div className="cf-note" role="note">{def.signNote}</div>}
      <label className="cf-declare">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>{def.declaration}</span>
      </label>
      <div style={{ fontWeight: 600 }}>החתימה</div>
      <div className="cf-pad"><SignaturePad value={png} onChange={setPng} height={170} /></div>
      {err && <div className="ty-err" role="alert">{err}</div>}
      <div className="ty-nav">
        <span />
        <button type="button" className="btn btn-primary" disabled={busy || !consent || !png || !prepared} onClick={() => void sign()}>
          {busy ? 'שולח…' : 'חתימה ושליחה למשרד'}
        </button>
      </div>
    </>
  );
}

function Done({ def, view, onClose }: { def: ClientFormDef; view: ClientFormView; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const template = useMemo(() => templateFor(def, { version: view.mappingVersion, fields: view.mapping ?? {} }), [def, view.mappingVersion, view.mapping]);
  return (
    <div className="cf-done">
      <p className="cf-done-h" role="status">✓ הטופס נחתם ונשלח למשרד</p>
      <p className="ty-hint">{view.firmName || 'המשרד'} יגיש אותו ל{def.authorityLabel}. אין צורך לעשות דבר נוסף.{def.signNote ? ' המשרד ייצור קשר לגבי אישור עורך/ת הדין.' : ''}</p>
      {!show && <button type="button" className="btn btn-ghost" onClick={() => setShow(true)}>לצפייה בטופס החתום</button>}
      {show && <div className="cf-review-pages"><LiveFormPreview def={def} data={view.data} template={template} signature={view.signature ?? null} signed title="הטופס החתום" /></div>}
      <div className="ty-nav"><span /><button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button></div>
    </div>
  );
}

// ── שימוש חוזר: האם יש מה למלא (לשורה בדף) ───────────────────────────────────
export function missingScreens(def: ClientFormDef, d: CfData): CfScreen[] {
  return def.screens.filter(s => screenRelevant(s, d) && screenMissing(s, d).length > 0);
}
