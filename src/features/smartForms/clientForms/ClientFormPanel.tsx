// ─── המשרד: בקשת טופס שהלקוח ממלא וחותם (4440/821) ─────────────────────────
// נפתח מהשורה ב«בקשות». ‼ השורה היא היטל של ההגשה — המצב נכתב בשרת בלבד.
// מה רואים: איפה זה עומד, הטופס כפי שהוא עכשיו (חי, או הנעול/החתום), מה בא מהתיק ומה
// הלקוח השלים, ומה עוד חסר — עם «מילוי עכשיו» שכותב לאותו מקום (כרטיס/הגשה) כמו הדף.
// אחרי החתימה: הקובץ החתום נשמר במסמכי הלקוח (פעם אחת, דטרמיניסטי), ואז הגשה ותשובה.
// ‼ 16.10.2026 · הטופס חי: מה שמקלידים ב«מילוי עכשיו» מופיע מיד על התמונה (LiveFormPreview), כל תיבת חובה
//   מסומנת (חסר/✓), אזור חתימת הלקוח מסומן, ולחיצה על «חסר» פותחת את השאלה הנכונה.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LiveFormPreview, { MissingSummary } from './LiveFormPreview';
import { sha256Hex } from '../hash';
import { advanceFiling, attachSignedPdf, filingErrorText } from '../api';
import { useDocumentStore, type StoredDoc } from '../../../hooks/useDocumentStore';
import type { Client } from '../../../types';
import type { CfData, CfField, ClientFormDef } from './types';
import { blockers, clientFormOf, fieldVisible, formMarkers, screenRelevant, screenTitle, screenValues, templateFor, type FormMarker } from './registry';
import { fieldError, ilDate, phoneDisplay, todayIso } from './format';
import CfFields, { bankNameOf } from './CfFields';
import { clientFormErrorText, officeFill, officeView, type ClientFormView } from './api';
import { needsOfficeRep, useOfficeRep, type OfficeRep } from './officeRep';
import { renderSignedClientForm } from './signedFile';
import { useKnowledgeLink } from '../../taxKnowledge/knowledgeLink';
import '../../taxYear/taxYear.css';
import '../smartForms.css';
import './clientForms.css';

interface Props {
  filingId: string;
  client: Client;
  /** הבקשה עדיין טיוטה (לא פורסמה בדף של הלקוח). */
  unpublished?: boolean;
  onChanged?: () => void;
  onClose: () => void;
}

const STATE_TEXT: Record<string, string> = {
  draft: 'ממתין ללקוח - מילוי וחתימה', waiting_client_info: 'ממתין ללקוח - מילוי וחתימה', review: 'ממתין ללקוח - מילוי וחתימה',
  awaiting_signatures: 'ממתין לחתימת הלקוח', signed: 'נחתם', submitted: 'הוגש', info_requested: 'התבקש מידע נוסף',
  result_received: 'התקבלה תשובה', closed: 'הושלם', cancelled: 'בוטל',
};

const CHANNELS: Record<string, { v: string; label: string }[]> = {
  ita: [{ v: 'representatives_portal', label: 'מערכת המייצגים' }, { v: 'branch', label: 'במשרד פקיד השומה' }, { v: 'mail', label: 'בדואר' }, { v: 'fax', label: 'בפקס' }],
  vat: [{ v: 'representatives_portal', label: 'מערכת המייצגים' }, { v: 'online_form', label: 'טופס מקוון' }, { v: 'branch', label: 'במשרד מע״מ' }, { v: 'mail', label: 'בדואר' }],
};

export default function ClientFormPanel({ filingId, client, unpublished, onChanged, onClose }: Props) {
  const [view, setView] = useState<ClientFormView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const def = view ? clientFormOf(view.templateKey) : null;

  const reload = useCallback(async () => {
    const v = await officeView(filingId);
    if (!v.ok) { setErr(clientFormErrorText(v.error)); return; }
    setView(v); setErr(null);
  }, [filingId]);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changed = async () => { await reload(); onChanged?.(); };

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cfp-h" style={{ maxWidth: 1180, width: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3 id="cfp-h" style={{ margin: 0, fontSize: 'var(--fs-16)' }}>
            {def?.template.title ?? 'טופס'} · {client.firstName} {client.lastName}
          </h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body" style={{ overflow: 'auto' }}>
          {err && <div className="ty-err" role="alert">{err}</div>}
          {!view && !err && <p className="ty-note">טוען…</p>}
          {def && view && <PanelBody def={def} view={view} client={client} unpublished={unpublished} filingId={filingId} onChanged={changed} />}
        </div>
      </div>
    </div>
  );
}

function PanelBody({ def, view, client, unpublished, filingId, onChanged }: {
  def: ClientFormDef; view: ClientFormView; client: Client; unpublished?: boolean; filingId: string; onChanged: () => Promise<void>;
}) {
  const d = view.data;
  const signed = view.revisionState === 'signed';
  const [renderErr, setRenderErr] = useState<string | null>(null);
  // ‼ מה שמוקלד עכשיו ב«מילוי עכשיו» — עוד לא נשמר, אבל כבר על הטופס
  const [draft, setDraft] = useState<CfData>({});
  const [fillOpen, setFillOpen] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const template = useMemo(() => templateFor(def, { version: view.mappingVersion, fields: view.mapping ?? {} }), [def, view.mappingVersion, view.mapping]);
  // ‼ הצהרת המייצג (821): נכנסת רק לטופס החתום — שם ותאריך (בלי חותמת, גיא 17.10.2026)
  const rep = useOfficeRep(def);
  const signedData = useMemo(() => (signed && needsOfficeRep(def) && rep.name ? { ...d, repName: rep.name, repDate: d.signDate } : d), [signed, def, rep.name, d]);

  const live = useMemo(() => (signed ? signedData : { ...signedData, ...draft }), [signed, signedData, draft]);
  const markers = useMemo(() => formMarkers(def, live, { signed }), [def, live, signed]);
  const missing = blockers(def, d);
  const rows = useMemo(() => summaryRows(def, view), [def, view]);
  const open = ['draft', 'waiting_client_info', 'review', 'awaiting_signatures'].includes(view.state);
  const openQuestion = (m: FormMarker) => {
    if (!open || !m.questionKeys.length) return;
    setFocusKey(m.questionKeys[0]); setFillOpen(true);
  };
  const statusNote = def.statusNote?.(live);
  // «ללמוד» — עוסק פטור או מורשה (תקנה 13, התקרה, הענף) — כשהפאנל בתוך כרטיס הלקוח
  const learn = useKnowledgeLink();

  return (
    <div className="cfp">
      <div className="cfp-status">
        <span className="cfp-chip">{STATE_TEXT[view.state] ?? view.state}</span>
        {open && unpublished && <span className="ty-note">טיוטה — הלקוח יראה את הבקשה כשתפורסם בדף שלו («הדף של {client.firstName || 'הלקוח'}» ב«בקשות»).</span>}
        {open && !unpublished && <span className="ty-note">הלקוח ממלא וחותם בדף האישי שלו. הפרטים שהוא משלים נשמרים גם בכרטיס.</span>}
        {view.signedAt && <span className="ty-note">נחתם ב-{ilDate(view.signedAt.slice(0, 10))}</span>}
        {statusNote && <span className="cfp-chip" data-cf-status-note>{statusNote}</span>}
        {statusNote && learn && def.key === 'vat-821' && <button type="button" className="ta-link" onClick={() => learn.open('dealerType', view.stepId ?? undefined)} data-cf-learn>ללמוד: פטור או מורשה</button>}
      </div>
      {def.signNote && <div className="cf-note" role="note">{def.key === 'ita-4440' ? 'רשות המסים מבקשת שהתצהיר ייחתם בפני עורך/ת דין — אישור עו״ד אינו חלק מהטופס הדיגיטלי.' : def.signNote}</div>}

      <div className="cfp-cols">
        <div className="cfp-sec">
          {open && (missing.length > 0 || focusKey || def.screens.some(s => s.officeOnly && s.fields.some(f => !(d[f.key] ?? '').trim()))) && (
            <OfficeFill def={def} view={view} filingId={filingId} onChanged={async () => { setDraft({}); setFocusKey(null); await onChanged(); }}
              open={fillOpen} onOpenChange={o => { setFillOpen(o); if (!o) { setDraft({}); setFocusKey(null); } }} focusKey={focusKey} onDraft={setDraft} />
          )}
          {open && missing.length === 0 && view.revisionState !== 'locked' && <div className="ty-ok">כל הפרטים לטופס קיימים. הלקוח צריך רק לעבור על הטופס ולחתום.</div>}
          {open && (
            <div className="cf-sign-note" data-cf-sign-note>
              <span aria-hidden="true">✍</span>
              <span>הלקוח חותם בדף האישי שלו, והחתימה נכנסת לתיבה «חתימה וחותמת» המסומנת על הטופס. המשרד אינו חותם במקומו.</span>
            </div>
          )}
          {signed && <SignedFile def={def} view={view} client={client} template={template} filingId={filingId} rep={rep} onChanged={onChanged} />}
          {!open && <Lifecycle def={def} view={view} filingId={filingId} onChanged={onChanged} />}

          <h3>מה בטופס</h3>
          {rows.map(g => (
            <div key={g.title} className="cfp-group">
              <div className="cfp-group-h">{g.title}</div>
              <ul className="cfp-rows">
                {g.rows.map(r => (
                  <li key={r.key} className={r.value ? '' : 'is-missing'}>
                    <span>{r.label}<span className="cfp-src">{r.value ? r.src : ''}</span></span>
                    <span>{r.value || 'חסר'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {open && <CancelRequest filingId={filingId} onChanged={onChanged} />}
        </div>
        <div className="cfp-sec">
          <h3>{signed ? 'הטופס החתום' : view.revisionState === 'locked' ? 'הטופס כפי שהוצג ללקוח לחתימה' : 'הטופס כפי שהוא עכשיו'}</h3>
          {!signed && <MissingSummary markers={markers} onPick={open ? openQuestion : undefined} />}
          {!signed && (
            <p className="cf-live-legend" aria-label="מקרא"><span><i className="is-missing" />חסר</span><span><i className="is-ok" />מלא</span><span><i className="is-sign" />כאן הלקוח חותם</span></p>
          )}
          {renderErr && <div className="ty-err">{renderErr}</div>}
          <div className="cf-review-pages">
            <LiveFormPreview def={def} data={live} template={template} signed={signed}
              signature={signed ? view.signatures?.client ?? null : null}
              draftMark={signed ? undefined : 'טיוטה — עוד לא נחתם'} ready={!(signed && needsOfficeRep(def) && !rep.ready)}
              focusKeys={focusKey ? [focusKey] : undefined} onMarker={open ? openQuestion : undefined}
              signTag={signed ? undefined : 'כאן הלקוח חותם (בדף האישי)'} onRenderError={setRenderErr} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** כל שדה בשאלון שרלוונטי, לפי המסך שלו — הערך, ומאיפה הוא (מהתיק / בטופס הזה). */
function summaryRows(def: ClientFormDef, view: ClientFormView) {
  const d = view.data;
  const seen = new Set<string>();
  const out: { title: string; rows: { key: string; label: string; value: string; src: string }[] }[] = [];
  for (const s of def.screens) {
    if (!screenRelevant(s, d)) continue;
    const rows: { key: string; label: string; value: string; src: string }[] = [];
    for (const f of s.fields) {
      if (!fieldVisible(f, d) || seen.has(f.key)) continue;
      seen.add(f.key);
      const raw = d[f.key] ?? '';
      if (!raw && !f.required) continue;
      rows.push({ key: f.key, label: f.label.replace(/ \(.*\)$/, ''), value: display(f, raw), src: f.store === 'card' ? 'מהתיק' : 'בטופס' });
    }
    if (rows.length) out.push({ title: screenTitle(s, d), rows });
  }
  return out;
}

function display(f: CfField, v: string): string {
  if (!v) return '';
  if (f.input === 'check') return v === '1' ? 'כן' : '';
  if (f.input === 'date') return ilDate(v);
  if (f.input === 'month') { const m = v.match(/^(\d{4})-(\d{2})$/); return m ? `${m[2]}/${m[1]}` : v; }
  if (f.input === 'phone') return phoneDisplay(v);
  if (f.input === 'money') return /^\d+$/.test(v) ? `${Number(v).toLocaleString('en-US')} ₪` : v;
  if (f.options) return f.options.find(o => o.value === v)?.label ?? v;
  return v;
}

// ── «מילוי עכשיו» במשרד — אותו מקום כמו בדף ──────────────────────────────────
function OfficeFill({ def, view, filingId, onChanged, open, onOpenChange, focusKey, onDraft }: {
  def: ClientFormDef; view: ClientFormView; filingId: string; onChanged: () => Promise<void>;
  open: boolean; onOpenChange: (open: boolean) => void; focusKey: string | null; onDraft: (draft: CfData) => void;
}) {
  const d = view.data;
  const missing = blockers(def, d);
  // ‼ גם פרטי משרד ריקים (פקיד השומה) — לא חוסמים, אבל זה המקום היחיד שבו ממלאים אותם
  const office = def.screens.filter(s => s.officeOnly && s.fields.some(f => !(d[f.key] ?? '').trim()));
  const screens = [...new Set([...missing.map(m => m.screen), ...office])];
  // ‼ רק מה שחסר (או לא תקין) — פרט שכבר ידוע אינו נפתח לעריכה כאן; עורכים אותו בכרטיס
  // ‼ לחיצה על תיבה בטופס (focusKey) פותחת גם שדה שכבר מלא — לתיקון מהיר במקום דרך הכרטיס
  const focusScreen = focusKey ? def.screens.find(s => !s.officeOnly && screenRelevant(s, d) && s.fields.some(f => f.key === focusKey)) : undefined;
  if (focusScreen && !screens.includes(focusScreen)) screens.push(focusScreen);
  // ‼ המועמדים: מה שחסר/לא תקין (או השדה שנלחץ); הנראוּת נקבעת לפי מה שמוקלד עכשיו — «אחר» פותח את «מה בדיוק?» גם כאן
  const candidates = screens.flatMap(s => s.fields.filter(f => !(d[f.key] ?? '').trim() || !!fieldError(f, d[f.key], d) || f.key === focusKey));
  const setOpen = onOpenChange;
  const [form, setFormState] = useState<CfData>({});
  const setForm = setFormState;
  // ‼ הטיוטה לטופס החי עוברת את אותן השלמות שהשמירה תעשה (למשל «מהבית» מעתיק את כתובת המגורים לעסק).
  //   באפקט ולא בתוך setState — עדכון של ההורה מתוך updater מזהיר ב-React (וב-StrictMode רץ פעמיים).
  const fieldKeys = candidates.map(f => f.key).join(',');
  useEffect(() => {
    if (!open) return;
    const vals = { ...Object.fromEntries(candidates.map(f => [f.key, d[f.key] ?? ''])), ...form };
    const out: CfData = {};
    for (const sc of screens) Object.assign(out, screenValues(sc, vals, d));
    onDraft(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, open, fieldKeys]);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !focusKey) return;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-cf-key="${focusKey}"] input, [data-cf-key="${focusKey}"] select, [data-cf-key="${focusKey}"] textarea, [data-cf-key="${focusKey}"] button`);
    el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open, focusKey]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const merged = { ...d, ...form };
  const values = { ...Object.fromEntries(candidates.map(f => [f.key, d[f.key] ?? ''])), ...form };
  const fields = candidates.filter(f => fieldVisible(f, merged));

  const save = async () => {
    // ‼ המשרד משלים מה שיש לו — שדה ריק אינו חוסם שמירה חלקית; רק ערך לא תקין **שהוקלד כאן** (ערך ישן בכרטיס ממילא לא נשלח)
    const vis = fields.filter(f => fieldVisible(f, merged) && f.key in form && (values[f.key] ?? '').trim());
    if (vis.some(f => fieldError(f, values[f.key], merged))) { setTried(true); return; }
    setBusy(true); setErr(null);
    const out: CfData = {};
    for (const s of screens) Object.assign(out, screenValues(s, values, d));
    for (const k of Object.keys(out)) if (out[k] === (d[k] ?? '')) delete out[k];
    if (out.bankCode) out.bankName = (await bankNameOf(out.bankCode)) ?? out.bankName;
    const r = await officeFill(filingId, out);
    setBusy(false);
    if (!r.ok) { setErr(clientFormErrorText(r.error, r.field as string | undefined)); return; }
    setOpen(false); setFormState({}); setTried(false);
    await onChanged();
  };

  return (
    <div className="cfp-sec">
      <h3>{missing.length ? `חסר לטופס (${missing.length})` : 'פרטי משרד'}</h3>
      <p className="ty-note" style={{ margin: 0 }}>הלקוח ישאל על זה בדף. אם הפרטים אצלכם — אפשר למלא עכשיו; מה שיש לו מקום בכרטיס נשמר גם בכרטיס.</p>
      {!open && <div className="cfp-actions"><button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>מילוי עכשיו במשרד</button></div>}
      {open && (
        <div className="cfp-form" ref={wrap}>
          <p className="ty-note" style={{ margin: 0 }}>מה שמקלידים מופיע מיד על הטופס משמאל; «שמירה» שומרת בכרטיס ובבקשה.</p>
          <CfFields fields={fields.map(f => ({ ...f, required: false }))} values={values} data={d} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))} showErrors={tried} disabled={busy} />
          {tried && fields.some(f => fieldVisible(f, merged) && f.key in form && (values[f.key] ?? '').trim() && fieldError(f, values[f.key], merged)) && (
            <div className="ty-err" role="alert">יש פרט לא תקין — מסומן באדום בטופס המילוי. אפשר לתקן אותו או למחוק אותו ולשמור את השאר.</div>
          )}
          {err && <div className="ty-err" role="alert">{err}</div>}
          <div className="cfp-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'שומר…' : 'שמירה'}</button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setFormState({}); setOpen(false); }}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── הקובץ החתום: נשמר פעם אחת במסמכי הלקוח ─────────────────────────────────────
// ‼ 17.10.2026 · הדף האישי שומר אותו ברגע החתימה (signedFile.ts + portal-signed-form). כאן רק גיבוי:
//   אם אחרי דקתיים מהחתימה עוד אין קובץ — המשרד בונה אותו. לפני כן ממתינים, כדי ששני הצדדים
//   לא יכתבו לאותו נתיב בבת אחת.
const PORTAL_GRACE_MS = 120_000;
function SignedFile({ def, view, client, template, filingId, rep, onChanged }: {
  def: ClientFormDef; view: ClientFormView; client: Client; template: ReturnType<typeof templateFor>; filingId: string; rep: OfficeRep; onChanged: () => Promise<void>;
}) {
  const withRep = needsOfficeRep(def);
  const store = useDocumentStore();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const sinceSigned = view.signedAt ? Date.now() - Date.parse(view.signedAt) : Infinity;
  const [graceOver, setGraceOver] = useState(!(sinceSigned < PORTAL_GRACE_MS));
  useEffect(() => {
    if (graceOver || view.signedDocumentId) return;
    const t = window.setTimeout(() => { void onChanged().finally(() => setGraceOver(true)); }, Math.max(0, PORTAL_GRACE_MS - sinceSigned) + 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graceOver, view.signedDocumentId]);
  // ‼ פעם אחת: ב-StrictMode האפקט רץ פעמיים, ושתי העלאות לאותו נתיב נכשלות (409).
  const storing = useRef(false);
  const run = async () => {
    if (storing.current || !view.signatures?.client) return;
    storing.current = true;
    setState('busy'); setErr(null);
    try {
      if (view.mappingVersion !== view.activeMappingVersion) throw new Error('מיקום השדות בטופס עודכן אחרי החתימה — לא מפיקים קובץ שנראה אחרת ממה שנחתם.');
      const signDate = String(view.data.signDate || '') || todayIso();
      const bytes = await renderSignedClientForm(def, view.data, {
        template, signature: view.signatures.client, repName: withRep ? rep.name : '',
        clientName: `${client.firstName} ${client.lastName}`, signedAt: view.signedAt,
      });
      const sha = await sha256Hex(bytes);
      const docId = `scf-${filingId}-r${view.revision ?? 1}`;
      const doc: StoredDoc = {
        id: docId, clientId: client.id,
        fileName: `${def.template.formNumber}-${client.lastName || 'client'}-${signDate}.pdf`,
        fileType: 'application/pdf', fileSize: bytes.byteLength, category: def.key === 'vat-821' ? 'business_document' : 'other',
        year: Number(signDate.slice(0, 4)), uploadedAt: new Date().toISOString(),
        description: `${def.template.title} — חתום בדף האישי`,
        notes: `SHA-256 ${sha}`, fileData: bytes.slice().buffer as ArrayBuffer, _remote: true,
      };
      await store.saveDoc(doc);
      const r = await attachSignedPdf(filingId, view.revision ?? 1, docId, sha);
      if (!r.ok) throw new Error(filingErrorText(r.error));
      window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: client.id } }));
      setState('idle');
      await onChanged();
    } catch (e) {
      storing.current = false;
      setState('error'); setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const canRun = graceOver && (!withRep || rep.ready);
  useEffect(() => {
    if (!view.signedDocumentId && state === 'idle' && canRun) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.signedDocumentId, canRun]);

  if (view.signedDocumentId) return <div className="ty-ok">הקובץ החתום נשמר במסמכים של {client.firstName || 'הלקוח'}.</div>;
  return (
    <div className="cfp-sec">
      {!graceOver && state === 'idle' && <p className="ty-note">הלקוח חתם עכשיו — הקובץ החתום נשמר במסמכי הלקוח…</p>}
      {state === 'busy' && <p className="ty-note">שומר את הקובץ החתום במסמכי הלקוח…</p>}
      {state === 'error' && (
        <>
          <div className="ty-err" role="alert">שמירת הקובץ החתום נכשלה: {err}</div>
          <div className="cfp-actions"><button type="button" className="btn btn-sm" onClick={() => void run()}>לנסות שוב</button></div>
        </>
      )}
    </div>
  );
}

// ── אחרי החתימה: הגשה, תשובה, סגירה (smart_form_advance המשותף) ───────────────
function Lifecycle({ def, view, filingId, onChanged }: { def: ClientFormDef; view: ClientFormView; filingId: string; onChanged: () => Promise<void> }) {
  const auth = def.template.authority === 'vat' ? 'vat' : 'ita';
  const [channel, setChannel] = useState(CHANNELS[auth][0].v);
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setErr(filingErrorText(r.error)); return false; }
    await onChanged();
    return true;
  };

  if (view.state === 'signed') {
    return (
      <div className="cfp-form">
        <h3>הגשה ל{def.authorityLabel}</h3>
        <div className="cf-grid">
          <label className="ty-field is-full"><span className="cf-label">איך הוגש</span>
            <select value={channel} onChange={e => setChannel(e.target.value)}>{CHANNELS[auth].map(c => <option key={c.v} value={c.v}>{c.label}</option>)}</select>
          </label>
          <label className="ty-field"><span className="cf-label">תאריך ההגשה</span><input type="date" dir="ltr" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} /></label>
          <label className="ty-field"><span className="cf-label">אסמכתא (לא חובה)</span><input value={reference} onChange={e => setReference(e.target.value)} /></label>
        </div>
        {err && <div className="ty-err" role="alert">{err}</div>}
        <div className="cfp-actions">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !view.signedDocumentId || !date}
            title={view.signedDocumentId ? undefined : 'קודם נשמר הקובץ החתום'}
            onClick={() => void run(() => advanceFiling(filingId, 'record_submission', { channel, submittedAt: date, reference }) as Promise<{ ok: boolean; error?: string }>)}>
            סימון כהוגש
          </button>
        </div>
      </div>
    );
  }
  if (view.state === 'submitted' || view.state === 'info_requested') {
    return (
      <div className="cfp-form">
        <h3>התקבלה תשובה מ{def.authorityLabel}?</h3>
        <div className="cf-grid">
          <label className="ty-field is-full"><span className="cf-label">מה התקבל</span>
            <input value={summary} onChange={e => setSummary(e.target.value)} placeholder={auth === 'vat' ? 'לדוגמה: נפתח תיק עוסק מורשה' : 'לדוגמה: פקיד השומה אישר את התצהיר'} /></label>
          <label className="ty-field is-full"><span className="cf-label">אסמכתא או מספר תיק</span><input value={reference} onChange={e => setReference(e.target.value)} /></label>
        </div>
        {err && <div className="ty-err" role="alert">{err}</div>}
        <div className="cfp-actions">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !summary.trim() || !reference.trim()}
            onClick={() => void (async () => {
              const ok = await run(() => advanceFiling(filingId, 'record_result', { status: 'approved', summary, reference, receivedAt: todayIso() }) as Promise<{ ok: boolean; error?: string }>);
              if (ok) await run(() => advanceFiling(filingId, 'close', {}) as Promise<{ ok: boolean; error?: string }>);
            })()}>
            רישום התשובה וסגירה
          </button>
        </div>
      </div>
    );
  }
  if (view.state === 'result_received') {
    return (
      <div className="cfp-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run(() => advanceFiling(filingId, 'close', {}) as Promise<{ ok: boolean; error?: string }>)}>סגירת הבקשה</button>
        {err && <div className="ty-err" role="alert">{err}</div>}
      </div>
    );
  }
  return null;
}

function CancelRequest({ filingId, onChanged }: { filingId: string; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="cfp-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>ביטול הבקשה…</button></div>;
  return (
    <div className="cfp-form">
      <label className="ty-field"><span className="cf-label">למה מבטלים? (נרשם ביומן)</span><input value={reason} onChange={e => setReason(e.target.value)} /></label>
      {err && <div className="ty-err" role="alert">{err}</div>}
      <div className="cfp-actions">
        <button type="button" className="btn btn-sm btn-danger" disabled={busy || !reason.trim()} onClick={() => void (async () => {
          setBusy(true);
          const r = await advanceFiling(filingId, 'cancel', { reason }) as { ok: boolean; error?: string };
          setBusy(false);
          if (!r.ok) { setErr(filingErrorText(r.error)); return; }
          await onChanged();
        })()}>ביטול הבקשה</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>חזרה</button>
      </div>
    </div>
  );
}
