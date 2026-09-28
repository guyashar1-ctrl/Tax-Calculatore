// ─── סביבת העבודה של הגשת 6101 ─────────────────────────────────────────────
// מטרה ותקופה → נתונים (מקור ומצב לכל שדה) → בדיקה ונעילה → חתימות → הגשה
// ומעקב. התצוגה משמאל היא ה-PDF שייחתם — לא הדמיה.
//
// ‼ מה שמוזן כאן נשמר על ההגשה בלבד. הכרטיס משתנה רק בלחיצה מפורשת על
// «שמור בכרטיס» (smart_form_apply_profile_updates, עם ערך צפוי ויומן).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../../types';
import { clientFromDb } from '../../../lib/dbMappers';
import SmartFormPreview, { type Hotspot } from '../SmartFormPreview';
import { BTL6101_TEMPLATE } from './template';
import { isActive6101 } from './layout6101';
import {
  BTL6101_PURPOSE_HINTS, BTL6101_PURPOSE_LABELS, DATE_KEYS, MONEY_KEYS, sectionApplies,
  type Btl6101Data, type Btl6101Purpose, type OccupationRow6101,
} from './model';
import { FIELD_STATUS_LABELS, KEY_LABELS, resolve6101, type FieldState, type ProfessionalConfirmations } from './resolve';
import { israelDate, renderBtl6101 } from './document';
import {
  applyProfileUpdates, FILING_STATE_LABELS, filingErrorText, loadFiling, saveDraft,
  type Filing, type FilingEvent, type FilingFlags, type FilingValues, type Revision,
} from '../api';
import Btl6101Lifecycle from './Btl6101Lifecycle';
import type { LayoutIssue } from '../types';
import { BtlNow, formatDay, formatIl, type WorkspaceCtx } from './ui';
import '../smartForms.css';

type Step = 'purpose' | 'data' | 'review' | 'sign' | 'submit';
const STEPS: { key: Step; label: string }[] = [
  { key: 'purpose', label: 'מטרה' },
  { key: 'data', label: 'נתונים' },
  { key: 'review', label: 'בדיקה ונעילה' },
  { key: 'sign', label: 'חתימות' },
  { key: 'submit', label: 'הגשה ומעקב' },
];
const PURPOSE_ORDER: Btl6101Purpose[] = ['start', 'change', 'end', 'spouse_in_business', 'stop_employees', 'multi_year_report', 'update_details'];

interface Props {
  filingId: string;
  client: Client;
  onClose: () => void;
  onClientPersisted?: (c: Client) => void;
  onChanged?: () => void;
}

const todayIso = () => israelDate(new Date().toISOString());

/** מפתח הנתונים של שדה במלאי ⇒ מפתח השדה במסך. */
function fieldKeyOf(dataKey: string): string {
  if (dataKey.startsWith('occupations[')) return 'occupations';
  if (dataKey.startsWith('#signature')) return 'signature';
  if (dataKey === '#appendixNote') return 'occupations';
  if (dataKey.startsWith('email@')) return 'email';
  return dataKey.split('=')[0];
}

export default function Btl6101Workspace({ filingId, client: clientProp, onClose, onClientPersisted, onChanged }: Props) {
  const [client, setClient] = useState<Client>(clientProp);
  const [bundle, setBundle] = useState<{ filing: Filing; revisions: Revision[]; events: FilingEvent[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [purposes, setPurposes] = useState<Btl6101Purpose[]>([]);
  const [flags, setFlags] = useState<FilingFlags>({});
  const [entered, setEntered] = useState<Partial<Btl6101Data>>({});
  const [confirmed, setConfirmed] = useState<Record<string, 'client' | 'office'>>({});
  const [professional, setProfessional] = useState<ProfessionalConfirmations>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ bytes: Uint8Array | null; busy: boolean; issues: LayoutIssue[]; drawn: Set<string>; error?: string }>({ bytes: null, busy: true, issues: [], drawn: new Set() });

  useEffect(() => setClient(clientProp), [clientProp]);

  const reload = useCallback(async () => {
    try {
      const b = await loadFiling(filingId);
      setBundle(b);
      setLoadError(null);
      const r = b.revisions.find(x => x.revision === b.filing.currentRevision)!;
      setPurposes(r.purposes.length ? r.purposes : b.filing.purposes);
      setFlags(b.filing.flags ?? {});
      setEntered(r.values.entered ?? {});
      setConfirmed(r.values.confirmed ?? {});
      setProfessional(r.values.professional ?? {});
      setDirty(false);
      setStep(s => s ?? initialStep(b.filing, r));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [filingId]);

  useEffect(() => { void reload(); }, [reload]);

  const filing = bundle?.filing;
  const rev = bundle?.revisions.find(r => r.revision === filing?.currentRevision);
  const editable = !!filing && !!rev && rev.state === 'draft' && ['draft', 'waiting_client_info', 'review'].includes(filing.state);
  const asOf = useMemo(todayIso, []);

  const resolved = useMemo(() => resolve6101({ client, purposes, entered, confirmed, asOf, flags, professional }), [client, purposes, entered, confirmed, asOf, flags, professional]);

  // ── שמירה אוטומטית (רק טיוטה) ──
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty || !editable || !filing || !rev) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      const values: FilingValues = { entered, confirmed, professional };
      const res = await saveDraft(filing.id, rev.revision, purposes, flags, values);
      if (!res.ok) {
        setSaveState('error'); setSaveError(filingErrorText(res.error));
        if (res.error === 'stale_revision' || res.error === 'not_editable' || res.error === 'revision_locked') void reload();
        return;
      }
      setSaveState('saved'); setSaveError(null); setDirty(false);
      onChanged?.();
    }, 800);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [dirty, editable, entered, confirmed, professional, purposes, flags, filing, rev, reload, onChanged]);

  // ── התצוגה: ה-PDF האמיתי ──
  const previewData = useMemo<Btl6101Data | null>(() => {
    if (!rev) return null;
    if (rev.state === 'draft' || !rev.snapshot) return resolved.data;
    const clientSigned = rev.signers.find(s => s.role === 'client')?.signedAt;
    return { ...rev.snapshot.data, declarationDate: clientSigned ? israelDate(clientSigned) : '' };
  }, [rev, resolved.data]);
  const previewPurposes = rev && rev.state !== 'draft' ? rev.purposes : purposes;
  useEffect(() => {
    if (!previewData || !rev) return;
    let cancelled = false;
    setPreview(p => ({ ...p, busy: true }));
    const t = window.setTimeout(async () => {
      try {
        const sig = Object.fromEntries(Object.entries(rev.signatures).map(([k, v]) => [k, v?.png]));
        const { bytes, layout } = await renderBtl6101(previewData, previewPurposes, {
          signatures: sig,
          draftMark: rev.state === 'draft' ? `טיוטה · גרסה ${rev.revision} · לא לחתימה ולא להגשה` : undefined,
        });
        if (!cancelled) setPreview({ bytes, busy: false, issues: layout.issues, drawn: new Set(layout.ops.map(o => ('fieldId' in o ? o.fieldId : ''))) });
      } catch (e) {
        if (!cancelled) setPreview(p => ({ ...p, busy: false, error: e instanceof Error ? e.message : String(e) }));
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [previewData, previewPurposes, rev]);

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!previewData) return [];
    return BTL6101_TEMPLATE.fields
      .filter(f => isActive6101(f, previewData, previewPurposes))
      .filter(f => {
        // ‼ רק מה שצויר בפועל, או שדה חובה שחסר — שטח חלופי שלא בשימוש (מייל ארוך,
        // הפניה לנספח) אינו «שדה ריק» בטופס.
        const st = resolved.fields[fieldKeyOf(f.dataKey)];
        return preview.drawn.has(f.id) || f.kind === 'signature' || f.kind === 'checkbox'
          || (st?.required && (st.status === 'missing' || st.status === 'conflict') && !f.dataKey.startsWith('#') && f.id !== 'p1.contact.emailWhole');
      })
      .map(f => {
        const key = fieldKeyOf(f.dataKey);
        const st = resolved.fields[key];
        const tone: Hotspot['tone'] = !st ? 'muted'
          : st.status === 'missing' || st.status === 'conflict' ? (st.required ? 'bad' : 'muted')
          : st.status === 'derived' || st.status === 'stale' || st.needsClientConfirmation ? 'warn'
          : st.status === 'verified' || st.status === 'entered' ? 'ok' : 'muted';
        return { page: f.page, box: f.box, key, tone: rev?.state === 'draft' ? tone : 'muted', title: KEY_LABELS[key] ?? f.label };
      });
  }, [previewData, previewPurposes, resolved.fields, rev?.state, preview.drawn]);

  const focusField = (key: string) => {
    setActiveKey(key);
    setStep('data');
    window.setTimeout(() => document.getElementById(`sf-f-${key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };

  if (loadError) {
    return (
      <div className="sf-overlay"><div className="sf-head"><h2>דין וחשבון רב שנתי (6101)</h2><span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>סגירה</button></div>
        <div style={{ padding: '1.5rem' }} className="sf-error">לא ניתן לטעון את ההגשה: {loadError}</div></div>
    );
  }
  if (!bundle || !filing || !rev || !step) {
    return <div className="sf-overlay"><div style={{ padding: '2rem' }} className="sf-note">טוען…</div></div>;
  }

  const blockers = [...resolved.issues.filter(i => i.severity === 'blocker'), ...preview.issues.map(i => ({ key: i.fieldId, severity: 'blocker' as const, code: i.code, message: i.message }))];
  const ctx: WorkspaceCtx = { filing, rev, revisions: bundle.revisions, events: bundle.events, client, reload, onChanged };
  const stateTone = ['submitted', 'awaiting_signatures', 'waiting_client_info', 'awaiting_client_submission'].includes(filing.state) ? 'is-wait'
    : filing.state === 'closed' ? 'is-done' : 'is-mine';

  const setVal = (key: keyof Btl6101Data, value: unknown) => {
    if (!editable) return;
    setEntered(e => ({ ...e, [key]: value }));
    setDirty(true);
  };
  const resetVal = (key: keyof Btl6101Data) => {
    if (!editable) return;
    setEntered(e => { const n = { ...e }; delete n[key]; return n; });
    setDirty(true);
  };

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const doneUpTo = filing.state === 'draft' || filing.state === 'waiting_client_info' ? (purposes.length ? 1 : 0)
    : filing.state === 'review' ? 2 : filing.state === 'awaiting_signatures' ? 3 : 4;

  return (
    <div className="sf-overlay" role="dialog" aria-label="דין וחשבון רב שנתי (6101)">
      <div className="sf-head">
        <div>
          <h2>דין וחשבון רב שנתי (6101) · ביטוח לאומי</h2>
          <div className="sf-sub">{client.firstName} {client.lastName} · גרסה {rev.revision} · טופס {BTL6101_TEMPLATE.version}</div>
        </div>
        <span className={`sf-state ${stateTone}`}>{FILING_STATE_LABELS[filing.state]}</span>
        <span style={{ flex: 1 }} />
        {editable && (
          <span className="sf-saved" aria-live="polite">
            {saveState === 'saving' ? 'שומר…' : saveState === 'saved' && !dirty ? 'נשמר' : saveState === 'error' ? <span className="sf-error">{saveError}</span> : dirty ? 'יישמר עוד רגע' : ''}
          </span>
        )}
        <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>סגירה</button>
      </div>

      <nav className="sf-steps" aria-label="שלבים">
        {STEPS.map((s, i) => (
          <button key={s.key} type="button" className={`sf-step${s.key === step ? ' is-current' : ''}${i < doneUpTo && s.key !== step ? ' is-done' : ''}`}
            onClick={() => setStep(s.key)} aria-current={s.key === step ? 'step' : undefined}>
            <span className="n">{i < doneUpTo && s.key !== step ? '✓' : i + 1}</span>{s.label}
          </button>
        ))}
      </nav>

      <div className="sf-body">
        <div className="sf-panel">
          {!editable && (step === 'purpose' || step === 'data') && (
            <div className="sf-banner is-info" style={{ marginBottom: '.7rem' }}>
              {rev.state === 'draft' ? 'ההגשה כבר הוגשה — הנתונים לקריאה בלבד.' : 'הגרסה נעולה לחתימה. כדי לשנות משהו: «חתימות» ← «ערוך — גרסה חדשה» (החתימות יתבטלו).'}
            </div>
          )}
          {step === 'purpose' && (
            <PurposeStep purposes={purposes} flags={flags} editable={editable} resolved={resolved}
              onPurposes={p => { setPurposes(p); setDirty(true); }}
              onNext={() => setStep('data')} />
          )}
          {step === 'data' && (
            <DataStep data={resolved.data} fields={resolved.fields} hints={resolved.hints} purposes={purposes} flags={flags}
              issues={resolved.issues} editable={editable} activeKey={activeKey} entered={entered} client={client}
              onFlags={f => { setFlags(f); setDirty(true); }}
              onValue={setVal} onReset={resetVal} onFocus={setActiveKey}
              onConfirmSection={(keys, on) => { setConfirmed(c => { const n = { ...c }; keys.forEach(k => { if (on) n[k] = 'office'; else delete n[k]; }); return n; }); setDirty(true); }}
              confirmed={confirmed}
              filingId={filing.id}
              onClientPersisted={c => { setClient(c); onClientPersisted?.(c); }}
              onNext={() => setStep('review')} />
          )}
          {(step === 'review' || step === 'sign' || step === 'submit') && (
            <Btl6101Lifecycle step={step} ctx={ctx} resolved={resolved} blockers={blockers} purposes={purposes}
              dirty={dirty} editable={editable} onStep={setStep} onFocusField={focusField}
              professional={professional} onProfessional={p => { setProfessional(p); setDirty(true); }} />
          )}
        </div>
        <div className="sf-previewcol">
          {preview.error && <div className="sf-error" style={{ padding: '1rem' }}>{preview.error}</div>}
          <SmartFormPreview bytes={preview.bytes} busy={preview.busy} hotspots={hotspots}
            onHotspot={editable ? focusField : undefined} activeKey={activeKey} />
        </div>
      </div>
      {stepIndex < 0 && null}
    </div>
  );
}

function initialStep(f: Filing, r?: Revision): Step {
  if (f.state === 'awaiting_signatures') return 'sign';
  // כל החתימות נקלטו (למשל בקישור מרחוק) והמסמך החתום עוד לא נשמר — «חתימות» שומר אותו.
  if (f.state === 'signed' && r && !r.signedDocumentId) return 'sign';
  if (['signed', 'awaiting_client_submission', 'submitted', 'info_requested', 'result_received', 'closed', 'cancelled'].includes(f.state)) return 'submit';
  if (f.state === 'review') return 'review';
  return f.purposes.length ? 'data' : 'purpose';
}

// ═════════════════════════════════════════════════════════════════════════
// שלב 1 — מטרה
// ═════════════════════════════════════════════════════════════════════════
function PurposeStep({ purposes, editable, resolved, onPurposes, onNext }: {
  purposes: Btl6101Purpose[]; flags: FilingFlags; editable: boolean; resolved: ReturnType<typeof resolve6101>;
  onPurposes: (p: Btl6101Purpose[]) => void; onNext: () => void;
}) {
  const toggle = (p: Btl6101Purpose) => {
    if (!editable) return;
    let next = purposes.includes(p) ? purposes.filter(x => x !== p) : [...purposes, p];
    // «התחלה» ו«שינוי» הם שני מצבים מוצהרים שונים לאותה תקופה — לא יחד.
    if (p === 'start' && next.includes('start')) next = next.filter(x => x !== 'change');
    if (p === 'change' && next.includes('change')) next = next.filter(x => x !== 'start');
    onPurposes(PURPOSE_ORDER.filter(x => next.includes(x)));
  };
  const b = resolved.btl;
  return (
    <>
      <div className="sf-section">
        <h3>מה מדווחים לביטוח לאומי?</h3>
        <div className="sf-note" style={{ marginBottom: '.55rem' }}>
          אפשר לבחור יותר מאחד. רק הסעיפים של מה שנבחר יוצגו וימולאו בטופס.
        </div>
        <div className="sf-purposes">
          {PURPOSE_ORDER.map(p => (
            <label key={p} className={`sf-purpose${purposes.includes(p) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={purposes.includes(p)} disabled={!editable} onChange={() => toggle(p)} />
              <b>{BTL6101_PURPOSE_LABELS[p]}</b>
              <span>{BTL6101_PURPOSE_HINTS[p]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="sf-section">
        <h3>מה ביטוח לאומי מחזיק כרגע <span className="sf-hint">{b.syncedAt ? `נקרא מב"ל ${formatIl(b.syncedAt)}` : 'לא נקרא מב"ל'}</span></h3>
        <BtlNow btl={b} />
        <div className="sf-note" style={{ marginTop: '.5rem' }}>
          זה המצב הרשום — לא מה שמבקשים. ההגשה לא משנה אותו; רק תשובה של ביטוח לאומי.
        </div>
      </div>
      <div className="sf-actions">
        <button type="button" className="btn btn-primary" disabled={!purposes.length} onClick={onNext}>המשך לנתונים</button>
      </div>
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// שלב 2 — נתונים
// ═════════════════════════════════════════════════════════════════════════
interface DataStepProps {
  data: Btl6101Data; fields: Record<string, FieldState>; hints: Record<string, string[]>;
  purposes: Btl6101Purpose[]; flags: FilingFlags; issues: ReturnType<typeof resolve6101>['issues'];
  editable: boolean; activeKey: string | null; entered: Partial<Btl6101Data>; client: Client;
  confirmed: Record<string, 'client' | 'office'>; filingId: string;
  onFlags: (f: FilingFlags) => void;
  onValue: (k: keyof Btl6101Data, v: unknown) => void;
  onReset: (k: keyof Btl6101Data) => void;
  onFocus: (k: string) => void;
  onConfirmSection: (keys: string[], on: boolean) => void;
  onClientPersisted: (c: Client) => void;
  onNext: () => void;
}

type SectionDef = { key: string; title: string; hint?: string; rows: (keyof Btl6101Data)[][] };
const SECTIONS: SectionDef[] = [
  { key: 'identity', title: 'פרטי המבוטח', rows: [['lastName', 'firstName'], ['idNumber']] },
  { key: 'marital', title: 'מצב משפחתי', rows: [['maritalStatus'], ['maritalSinceMonth', 'maritalSinceYear']] },
  { key: 'spouse', title: 'פרטי בן/בת הזוג', rows: [['spouseLastName', 'spouseFirstName'], ['spouseIdNumber']] },
  { key: 'address', title: 'כתובת מגורים', rows: [['street', 'houseNumber'], ['entrance', 'apartment'], ['city', 'zip']] },
  { key: 'contact', title: 'טלפון ומייל', rows: [['mobile', 'landline'], ['email']] },
  { key: 'altContact', title: 'איש קשר (הנייד או המייל אינם של המבוטח)', rows: [['altContactLastName', 'altContactFirstName'], ['altContactIdNumber']] },
  { key: 'digital', title: 'הודעות בערוצים דיגיטליים', rows: [['refuseDigital']] },
  { key: 'mailing', title: 'מען למכתבים', rows: [['mailRecipient'], ['mailStreet', 'mailHouse'], ['mailEntrance', 'mailApartment'], ['mailCity', 'mailZip']] },
  { key: 'bank', title: 'חשבון בנק', rows: [['bankName', 'bankBranchName'], ['bankBranchNumber', 'bankAccount']] },
  { key: 'start', title: 'התחלת עבודה כעצמאי', rows: [['startDate', 'hoursBand'], ['monthlyIncome', 'profession']] },
  { key: 'change', title: 'שינוי בהיקף השעות או ההכנסה (בשנה הנוכחית)', rows: [['changeFromDate', 'hoursBefore', 'incomeBefore'], ['changeToDate', 'hoursAfter', 'incomeAfter']] },
  { key: 'spouseBusiness', title: 'בן/בת זוג עובד/ת בעסק', rows: [['spouseFromDate', 'spouseSharePct', 'spouseWeeklyHours']] },
  { key: 'end', title: 'הפסקת עבודה כעצמאי', rows: [['endDate'], ['currentOccupation', 'currentOccupationFrom']] },
  { key: 'employees', title: 'הפסקת העסקת עובדים', rows: [['withholdingFile', 'stopEmployeesDate']] },
  { key: 'business', title: 'כתובת העסק', rows: [['bizStreet', 'bizHouse'], ['bizApartment', 'bizCityZip'], ['bizPhone']] },
];
const DECLARED_BY_SECTION: Record<string, string[]> = {
  start: ['startDate', 'hoursBand', 'monthlyIncome'],
  change: ['changeFromDate', 'hoursBefore', 'incomeBefore', 'changeToDate', 'hoursAfter', 'incomeAfter'],
  spouseBusiness: ['spouseFromDate', 'spouseSharePct', 'spouseWeeklyHours'],
  end: ['endDate', 'currentOccupation', 'currentOccupationFrom'],
  occupations: ['occupations'],
};

function DataStep(p: DataStepProps) {
  const visible = (s: string) => {
    if (!sectionApplies(s, p.purposes)) return false;
    if (s === 'spouse') return p.data.maritalStatus === 'married' || p.data.maritalStatus === 'common_law';
    if (s === 'altContact') return !!p.flags.contactNotOwn;
    if (s === 'mailing') return !!p.flags.separateMailing;
    return true;
  };
  const blockers = p.issues.filter(i => i.severity === 'blocker');
  return (
    <>
      {blockers.length > 0 && (
        <div className="sf-banner is-warn" style={{ marginBottom: '.6rem' }}>
          {blockers.length === 1 ? 'פריט אחד חסר או סותר' : `${blockers.length} פריטים חסרים או סותרים`} — מסומנים באדום בטופס ובשדות.
        </div>
      )}
      {SECTIONS.filter(s => visible(s.key)).map(s => (
        <div key={s.key} className="sf-section">
          <h3>{s.title}</h3>
          {s.key === 'contact' && (
            <label className="checkbox-row" style={{ fontSize: 'var(--fs-13)', marginBottom: '.45rem' }}>
              <input type="checkbox" style={{ width: 'auto' }} disabled={!p.editable} checked={!!p.flags.contactNotOwn}
                onChange={e => p.onFlags({ ...p.flags, contactNotOwn: e.target.checked })} />
              הנייד או המייל אינם של המבוטח (ימולא איש קשר)
            </label>
          )}
          <div className="sf-fields">
            {s.rows.map((row, i) => (
              <div key={i} className={row.length === 3 ? 'sf-row3' : row.length === 2 ? 'sf-row2' : undefined}>
                {row.map(k => <FieldRow key={k} k={k} {...p} />)}
              </div>
            ))}
          </div>
          {s.key === 'digital' && (
            <div className="sf-note" style={{ marginTop: '.35rem' }}>
              ברירת המחדל בטופס: בלי סימון ⇒ ב"ל שולח הודעות בערוצים הדיגיטליים. מסמנים רק אם הלקוח ביקש.
            </div>
          )}
          {s.key === 'bank' && (
            <div className="sf-note" style={{ marginTop: '.35rem' }}>לשינוי קבוע של החשבון — בתיק המס. כאן משנים רק את מה שנכתב בהגשה.</div>
          )}
          {s.key === 'address' && <ProfileSave k="zip" {...p} />}
          {s.key === 'contact' && <ProfileSave k="landline" {...p} />}
          {s.key === 'mailing' && <ProfileSave k="mailing" {...p} />}
          {s.key === 'business' && <ProfileSave k="business" {...p} />}
          {DECLARED_BY_SECTION[s.key] && <ConfirmToggle keys={DECLARED_BY_SECTION[s.key]} {...p} />}
          {(p.hints[s.key === 'start' ? 'monthlyIncome' : ''] ?? []).length > 0 && s.key === 'start' && (
            <ul className="sf-note" style={{ margin: '.35rem 0 0', paddingInlineStart: '1.1rem' }}>
              {[...(p.hints.monthlyIncome ?? []), ...(p.hints.startDate ?? [])].map(h => <li key={h}>{h}</li>)}
            </ul>
          )}
        </div>
      ))}
      <div className="sf-section">
        <label className="checkbox-row" style={{ fontSize: 'var(--fs-13)' }}>
          <input type="checkbox" style={{ width: 'auto' }} disabled={!p.editable} checked={!!p.flags.separateMailing}
            onChange={e => p.onFlags({ ...p.flags, separateMailing: e.target.checked })} />
          יש מען למכתבים שונה מכתובת המגורים
        </label>
      </div>
      {visible('occupations') && <OccupationsEditor {...p} />}
      <div className="sf-actions">
        <button type="button" className="btn btn-primary" onClick={p.onNext}>לבדיקה ונעילה</button>
      </div>
    </>
  );
}

function statusBadge(st: FieldState | undefined, required: boolean) {
  if (!st || st.status === 'not_applicable') return null;
  if (st.status === 'missing' && !required) return null;
  const cls = `sf-badge sf-b-${st.status}`;
  return <span className={cls}>{FIELD_STATUS_LABELS[st.status]}</span>;
}

function FieldRow({ k, data, fields, editable, activeKey, entered, onValue, onReset, onFocus }: DataStepProps & { k: keyof Btl6101Data }) {
  const st = fields[k];
  const v = data[k];
  const label = KEY_LABELS[k] ?? k;
  const isEntered = entered[k] !== undefined;
  const common = { id: `sf-in-${k}`, disabled: !editable, onFocus: () => onFocus(k) };
  let input: React.ReactNode;
  if (k === 'maritalStatus') {
    input = (
      <select {...common} value={String(v)} onChange={e => onValue(k, e.target.value)}>
        <option value="">— לבחור —</option>
        <option value="single">רווק/ה</option><option value="married">נשוי/אה</option>
        <option value="common_law">ידוע/ה בציבור</option><option value="divorced">גרוש/ה</option><option value="widowed">אלמן/ה</option>
      </select>
    );
  } else if (k === 'hoursBand') {
    input = (
      <select {...common} value={String(v)} onChange={e => onValue(k, e.target.value)}>
        <option value="">— לבחור —</option>
        <option value="1_11">1–11 שעות בשבוע</option><option value="12_19">12–19 שעות בשבוע</option><option value="20_plus">20 שעות ומעלה</option>
      </select>
    );
  } else if (k === 'refuseDigital') {
    input = (
      <label className="checkbox-row" style={{ fontSize: 'var(--fs-13)' }}>
        <input type="checkbox" style={{ width: 'auto' }} {...common} checked={v === true} onChange={e => onValue(k, e.target.checked)} />
        המבוטח מסרב לקבל הודעות הכוללות מידע אישי בערוצים הדיגיטליים
      </label>
    );
  } else {
    const isDate = DATE_KEYS.has(k);
    const ltr = MONEY_KEYS.has(k) || /idNumber|IdNumber|mobile|landline|zip|Zip|bankAccount|bankBranchNumber|withholdingFile|bizPhone|email|Hours|hours|SharePct|maritalSince/.test(k);
    input = (
      <input {...common} type={isDate ? 'date' : k === 'email' ? 'email' : 'text'} value={String(v ?? '')}
        inputMode={ltr && k !== 'email' ? 'numeric' : undefined} data-ltr={ltr || isDate ? '' : undefined}
        onChange={e => onValue(k, e.target.value)} />
    );
  }
  const alt = st?.alternatives?.[0];
  return (
    <div className={`sf-field${activeKey === k ? ' is-active' : ''}`} id={`sf-f-${k}`}>
      <label htmlFor={`sf-in-${k}`}>
        {label}{st?.required ? <span className="sf-req" aria-label="חובה">*</span> : null}
        {statusBadge(st, !!st?.required)}
        {st?.needsClientConfirmation && st.status !== 'missing' && st.status !== 'derived' && <span className="sf-badge sf-b-confirm">לאישור הלקוח</span>}
      </label>
      {input}
      {(st?.sourceLabel || st?.note || alt || isEntered) && (
        <div className="sf-src">
          {st?.sourceLabel && st.status !== 'entered' ? <>מקור: {st.sourceLabel}{st.sourceAt ? ` · ${formatIl(st.sourceAt)}` : ''}</> : null}
          {st?.note ? <>{st?.sourceLabel && st.status !== 'entered' ? ' · ' : ''}{st.note}</> : null}
          {alt && editable ? <> · <button type="button" onClick={() => onReset(k)}>חזרה ל«{DATE_KEYS.has(k) ? formatDay(alt.value) : alt.value}» ({alt.sourceLabel})</button></> : null}
          {isEntered && !alt && editable ? <> <button type="button" onClick={() => onReset(k)}>ביטול השינוי</button></> : null}
        </div>
      )}
    </div>
  );
}

function ConfirmToggle({ keys, confirmed, editable, onConfirmSection }: DataStepProps & { keys: string[] }) {
  const on = keys.every(k => confirmed[k]);
  return (
    <label className="checkbox-row" style={{ fontSize: 'var(--fs-12)', marginTop: '.45rem', color: 'var(--ink-3)' }}>
      <input type="checkbox" style={{ width: 'auto' }} disabled={!editable} checked={on} onChange={e => onConfirmSection(keys, e.target.checked)} />
      הנתונים בסעיף עברו על ידי הלקוח (הצהרתו תיחתם בטופס)
    </label>
  );
}

/** «שמור בכרטיס» — רק בלחיצה, רק כשהערך בהגשה שונה מהכרטיס, עם הערך הצפוי. */
function ProfileSave({ k, data, client, filingId, onClientPersisted, editable }: DataStepProps & { k: 'zip' | 'landline' | 'mailing' | 'business' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const business = (client.businesses ?? []).find(b => !b.isClosed) ?? (client.businesses ?? [])[0];
  let upd: { key: 'zipCode' | 'landlinePhone' | 'mailingAddress' | 'businessAddress'; value: unknown; expected: unknown; businessId?: string; label: string } | null = null;
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()));
  if (k === 'zip' && data.zip && data.zip !== (client.zipCode ?? '')) upd = { key: 'zipCode', value: data.zip.replace(/\s/g, ''), expected: client.zipCode ?? null, label: `המיקוד ${data.zip}` };
  if (k === 'landline' && data.landline && data.landline !== (client.landlinePhone ?? '') && data.landline !== client.phone) upd = { key: 'landlinePhone', value: data.landline, expected: client.landlinePhone ?? null, label: `הטלפון הקווי ${data.landline}` };
  if (k === 'mailing') {
    const m = clean({ recipient: data.mailRecipient, street: data.mailStreet, houseNumber: data.mailHouse, entrance: data.mailEntrance, apartment: data.mailApartment, city: data.mailCity, zip: data.mailZip });
    if (Object.keys(m).length && JSON.stringify(m) !== JSON.stringify(clean((client.mailingAddress ?? {}) as Record<string, string>))) {
      upd = { key: 'mailingAddress', value: m, expected: client.mailingAddress ?? null, label: 'המען למכתבים' };
    }
  }
  if (k === 'business' && business) {
    const cityZip = data.bizCityZip.trim();
    const zipM = /(\d{5,7})\s*$/.exec(cityZip);
    const a = clean({ street: data.bizStreet, houseNumber: data.bizHouse, apartment: data.bizApartment, city: zipM ? cityZip.slice(0, zipM.index).trim() : cityZip, zip: zipM?.[1] ?? '', phone: data.bizPhone });
    if (Object.keys(a).length && JSON.stringify(a) !== JSON.stringify(clean((business.address ?? {}) as Record<string, string>))) {
      upd = { key: 'businessAddress', value: a, expected: business.address ?? null, businessId: business.id, label: `כתובת העסק «${business.name}»` };
    }
  }
  if (!upd || !editable) return msg ? <div className="sf-okline" style={{ marginTop: '.35rem' }}>{msg}</div> : null;
  return (
    <div className="sf-src" style={{ marginTop: '.4rem' }}>
      {upd.label} אינו/ה בכרטיס הלקוח. {' '}
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await applyProfileUpdates(filingId, [{ key: upd!.key, value: upd!.value, expected: upd!.expected, businessId: upd!.businessId }]);
        setBusy(false);
        if (!r.ok) { setMsg(filingErrorText(r.error)); return; }
        onClientPersisted(clientFromDb(r.client as Record<string, unknown>));
        setMsg('נשמר בכרטיס הלקוח');
      }}>{busy ? 'שומר…' : 'לשמור בכרטיס'}</button>
      {msg && <span className="sf-error"> · {msg}</span>}
    </div>
  );
}

const OCC_SUGGESTIONS = ['עצמאי', 'עצמאי שאינו עונה להגדרה', 'שכיר', 'לא עובד', 'סטודנט', 'תלמיד על יסודי', 'עובד במשק בית', 'חייל סדיר', 'חייל קבע', 'שירות לאומי', 'תלמיד ישיבה', 'חבר קיבוץ', 'אסיר', 'פנסיה', 'חל"ת', 'הכשרה מקצועית', 'בעל הכנסה שלא מעבודה', 'שוהה בחו"ל'];

function OccupationsEditor({ data, fields, entered, editable, onValue, onReset, hints }: DataStepProps) {
  const rows = data.occupations;
  const st = fields.occupations;
  const set = (next: OccupationRow6101[]) => onValue('occupations', next);
  const upd = (i: number, k: keyof OccupationRow6101, v: string) => set(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="sf-section" id="sf-f-occupations">
      <h3>עיסוקים והכנסות בשנתיים האחרונות {statusBadge(st, true)}</h3>
      <div className="sf-src" style={{ marginBottom: '.4rem' }}>
        {st?.sourceLabel ? <>מקור: {st.sourceLabel}{st.sourceAt ? ` · ${formatIl(st.sourceAt)}` : ''}. </> : null}
        בטופס יש שלוש שורות; תקופות נוספות עוברות לנספח מפורש שמצורף לטופס.
        {entered.occupations && editable ? <> <button type="button" onClick={() => onReset('occupations')}>חזרה לעיסוקים מב"ל</button></> : null}
      </div>
      <datalist id="sf-occ-list">{OCC_SUGGESTIONS.map(o => <option key={o} value={o} />)}</datalist>
      <table className="sf-occ">
        <thead><tr><th>מתאריך</th><th>עד תאריך</th><th>עיסוק</th><th>הכנסה שלא מעבודה ₪</th><th>הסכום הוא</th><th>מקור ההכנסה</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i === 3 ? 'sf-occ-over' : undefined}>
              <td><input type="date" data-ltr="" value={r.from} disabled={!editable} onChange={e => upd(i, 'from', e.target.value)} aria-label={`מתאריך ${i + 1}`} /></td>
              <td><input type="date" data-ltr="" value={r.to} disabled={!editable} onChange={e => upd(i, 'to', e.target.value)} aria-label={`עד תאריך ${i + 1}`} /></td>
              <td><input list="sf-occ-list" value={r.occupation} disabled={!editable} onChange={e => upd(i, 'occupation', e.target.value)} aria-label={`עיסוק ${i + 1}`} /></td>
              <td><input inputMode="numeric" data-ltr="" value={r.nonWorkIncome} disabled={!editable} onChange={e => upd(i, 'nonWorkIncome', e.target.value)} aria-label={`הכנסה ${i + 1}`} /></td>
              <td>
                <select value={r.nonWorkIncomeBasis ?? ''} disabled={!editable} aria-label={`פרשנות הסכום ${i + 1}`}
                  onChange={e => upd(i, 'nonWorkIncomeBasis', e.target.value)}>
                  <option value="">—</option><option value="monthly">לחודש</option><option value="period_total">לכל התקופה</option>
                </select>
              </td>
              <td><input value={r.nonWorkSource} disabled={!editable} onChange={e => upd(i, 'nonWorkSource', e.target.value)} aria-label={`מקור ${i + 1}`} /></td>
              <td>{editable && <button type="button" className="btn btn-sm btn-ghost" aria-label="הסרת שורה" onClick={() => set(rows.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 3 && <div className="sf-note" style={{ marginTop: '.3rem' }}>מהשורה הרביעית — בנספח (עמוד 4), עם הפניה מתחת לטבלה בטופס.</div>}
      <div className="sf-note" style={{ marginTop: '.3rem' }}>
        לטופס אין יחידה ל«הכנסה ב-₪»: מזינים סכום ובוחרים אם הוא לחודש או לכל התקופה — הפרשנות נכתבת בתא. אין המרה מהכנסה שנתית.
      </div>
      {editable && (
        <div className="sf-actions">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => set([...rows, { from: '', to: '', occupation: '', nonWorkIncome: '', nonWorkIncomeBasis: '', nonWorkSource: '' }])}>+ תקופה</button>
        </div>
      )}
      {(hints.occupations ?? []).length > 0 && (
        <ul className="sf-note" style={{ margin: '.4rem 0 0', paddingInlineStart: '1.1rem' }}>{hints.occupations.map(h => <li key={h}>{h}</li>)}</ul>
      )}
    </div>
  );
}
