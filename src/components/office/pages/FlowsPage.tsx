// ─── «מסלולים» — מתי כל דבר נפתח, באיזה סדר, ומה קורה לבד ─────────────────
// רשימה: מסלול הקליטה (אחד, נעוץ ראשון), מסלולים ידניים ושנתיים, ו«סטים ישנים»
// (תבניות של כמה בקשות יחד) שאפשר להפוך למסלול. בחירה פותחת את הבונה.
//
// ‼ איפה מגדירים ואיפה פועלים: כאן מגדירים. מפעילים מכרטיס הלקוח (או «הפעלה
// ללקוחות…» כאן, לכמה בבת אחת), ורואים מה קרה בכרטיס הלקוח ← בקשות / פעילות,
// ובמשרד ← אוטומציות.
// ‼ ניווט בתוך העמוד אינו משנה את הכתובת: הקונסולה מרכיבה את העמוד מחדש לכל
// focus, וטיוטה של מסלול הייתה נמחקת.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import type { Client } from '../../../types';
import type { OfficePageId } from '../officeModel';
import { supabase } from '../../../lib/supabase';
import { loadRequestTemplates, type RequestTemplate } from '../../../lib/requestTemplates';
import { documentLibrary } from '../../../lib/clientGuide';
import { REPRESENTATION_PROCESS } from '../../../lib/representationJourney';
import {
  archiveOfficeFlow, convertJourneyTemplate, createOfficeFlow, loadOfficeFlows,
} from '../../../features/flows/api';
import { blankDefinition } from '../../../features/flows/preview';
import { TRIGGER_LABELS, type FlowTrigger } from '../../../features/flows/types';
import FlowBuilder, { type OfficeFlowRow } from '../../flows/FlowBuilder';
import StartForClientsDialog from '../../flows/StartForClientsDialog';
import { FlSeg, FlSheet } from '../../flows/builder/ui';
import { buildLibraryLookup, titleFor } from '../../flows/builder/model';
import { serverErrorText } from '../../../features/flows/api';
import { RepDefaultsEditor, repDefaultsSummary, repSettingsOf } from '../RepresentationSettingsSection';
import ProcessSteps from '../ProcessSteps';
import { SumRow } from './ProfilePage';
import '../../flows/flows.css';

export interface FlowsPageProps {
  draft: FirmProfile;
  saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  /** השמירה המיידית של המשרד — לברירת הייצוג (כמו בעמוד הבקשות הישן). */
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  clients: Client[];
  focus?: string;
  go: (page: OfficePageId | null, focus?: string) => void;
  /** הקונסולה מוסיפה «מסלולים» לשינויים שלא נשמרו, ושואלת לפני יציאה. */
  onDirtyChange?: (dirty: boolean) => void;
  onOpenClient?: (clientId: string, tab?: 'journey') => void;
}

interface LegacySet { id: string; name: string; description?: string | null; count: number }

/**
 * focus: «flow:<id>[:<stage>[:<item>]]», «representation», «onboarding».
 * ‼ עם פריט — נפתח הפריט עצמו (ובבקשת מערכת בקליטה גם «מה הלקוח מקבל, לפי מצב»):
 * הקישור מהספרייה נוחת על המקום שבו מוגדר מה לקוח חדש מקבל, לא שתי לחיצות לפניו.
 */
function parseFocus(focus?: string): { flowId?: string; stage?: string; item?: string; onboarding?: boolean; rep?: boolean } {
  if (!focus) return {};
  if (focus === 'representation') return { onboarding: true, rep: true };
  if (focus === 'onboarding') return { onboarding: true };
  if (focus.startsWith('flow:')) {
    const [, flowId, stage, ...rest] = focus.split(':');
    const item = rest.join(':');
    return { flowId, stage: stage || undefined, ...(item ? { item } : {}) };
  }
  return {};
}

const withRepDefaults = (p: FirmProfile, defaults: unknown): FirmProfile => {
  const s = (p.settings ?? {}) as Record<string, unknown>;
  const rep = (s.representation ?? {}) as Record<string, unknown>;
  return { ...p, settings: { ...s, representation: { ...rep, defaults } } };
};


export function FlowsPage({ draft, saved, saveNow, clients, focus, go, onDirtyChange, onOpenClient }: FlowsPageProps) {
  const initial = useMemo(() => parseFocus(focus), [focus]);
  const [flows, setFlows] = useState<OfficeFlowRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [legacy, setLegacy] = useState<LegacySet[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stageFocus, setStageFocus] = useState<string | undefined>(initial.stage);
  const [itemFocus, setItemFocus] = useState<string | undefined>(initial.item);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [startFor, setStartFor] = useState<string | null>(null);
  const [archiveFor, setArchiveFor] = useState<string | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flowDirty, setFlowDirty] = useState(false);
  const appliedFocus = useRef(false);

  const load = useCallback(async () => {
    const [r, tpl, leg] = await Promise.all([
      loadOfficeFlows(),
      loadRequestTemplates(),
      // תבניות של כמה בקשות יחד (journey_templates kind='journey') — לקריאה בלבד; הופכים אותן למסלול בשרת.
      supabase.from('journey_templates').select('id,name,description,entries').eq('kind', 'journey').order('name'),
    ]);
    setTemplates(tpl);
    if (!r.ok) { setLoadErr(serverErrorText(r.error)); setFlows([]); }
    else { setLoadErr(null); setFlows(r.flows as OfficeFlowRow[]); }
    const rows = (leg.data ?? []) as { id: string; name: string; description?: string | null; entries?: unknown[] }[];
    setLegacy(rows.map(x => ({ id: x.id, name: x.name, description: x.description, count: Array.isArray(x.entries) ? x.entries.length : 0 })));
  }, []);
  useEffect(() => { void load(); }, [load]);

  // הכניסה מקישור («עריכה במסלול», «ייצוג») פותחת את המסלול — פעם אחת, אחרי הטעינה.
  useEffect(() => {
    if (!flows || appliedFocus.current) return;
    appliedFocus.current = true;
    if (initial.flowId && flows.some(f => f.id === initial.flowId)) setOpenId(initial.flowId);
    else if (initial.onboarding) {
      const onb = flows.find(f => f.trigger === 'quote_approved');
      if (onb) setOpenId(onb.id);
    }
  }, [flows, initial]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ── ברירת הייצוג (מסלול הקליטה) — נשמרת מיד, ברשומת המשרד ───────────────
  const [repOpen, setRepOpen] = useState(!!initial.rep);
  const [repHow, setRepHow] = useState(false);
  const [repDraft, setRepDraft] = useState<FirmProfile>(draft);
  const [repSaving, setRepSaving] = useState(false);
  const [repErr, setRepErr] = useState<string | null>(null);
  const repDirty = JSON.stringify(repSettingsOf(repDraft).defaults ?? null) !== JSON.stringify(repSettingsOf(saved).defaults ?? null);

  const dirtyRef = useRef(onDirtyChange);
  dirtyRef.current = onDirtyChange;
  useEffect(() => { dirtyRef.current?.(flowDirty || repDirty); }, [flowDirty, repDirty]);
  useEffect(() => () => dirtyRef.current?.(false), []);
  const onBuilderDirty = useCallback((d: boolean) => setFlowDirty(d), []);

  async function saveRep() {
    setRepSaving(true);
    setRepErr(null);
    const defaults = repSettingsOf(repDraft).defaults;
    const err = await saveNow(p => withRepDefaults(p, defaults));
    setRepSaving(false);
    if (err) setRepErr(err);
  }

  const docs = useMemo(() => documentLibrary(draft), [draft]);
  const title = useMemo(() => titleFor(buildLibraryLookup(templates, docs)), [templates, docs]);
  const open = flows?.find(f => f.id === openId) ?? null;
  const onboardingFlow = flows?.find(f => f.trigger === 'quote_approved') ?? null;
  const others = (flows ?? []).filter(f => f.trigger !== 'quote_approved');
  const startFlow = flows?.find(f => f.id === startFor) ?? null;
  const archiveFlow = flows?.find(f => f.id === archiveFor) ?? null;
  const convertedIds = new Set((flows ?? []).map(f => f.seedKey ?? '').filter(k => k.startsWith('journey_template:')).map(k => k.slice('journey_template:'.length)));

  function backToList() {
    if (flowDirty) { setLeaveAsk(true); return; }
    setOpenId(null);
    setStageFocus(undefined);
    setItemFocus(undefined);
  }

  async function convert(id: string) {
    setBusy(id);
    const r = await convertJourneyTemplate(id);
    setBusy(null);
    if (r.ok === false || r.error || !r.flowId) { setNotice(serverErrorText(r.error)); return; }
    await load();
    setOpenId(r.flowId);
    setNotice(r.existed ? 'הסט כבר הועבר בעבר — זה המסלול שנוצר ממנו.' : 'נוצר מסלול ידני מהסט. בדקו את השלבים ושמרו אם צריך.');
  }

  async function archive(id: string) {
    setBusy(id);
    const r = await archiveOfficeFlow(id);
    setBusy(null);
    setArchiveFor(null);
    if (r.ok === false || r.error) { setNotice(serverErrorText(r.error)); return; }
    setOpenId(null);
    setFlowDirty(false);
    await load();
    const n = r.activeRuns ?? 0;
    setNotice(n > 0 ? `המסלול הועבר לארכיון. ${n === 1 ? 'לקוח אחד שבאמצע ממשיך' : `${n} לקוחות שבאמצע ממשיכים`} עד הסוף.` : 'המסלול הועבר לארכיון.');
  }

  if (flows === null) return <div className="of-empty">טוען מסלולים…</div>;

  if (open) {
    const onboarding = open.trigger === 'quote_approved';
    return (
      <div className="fl-page">
        {notice && <div className="fl-notice" role="status">{notice}</div>}
        <FlowBuilder key={`${open.id}-${open.currentVersion}-${reloadKey}`} flow={open} templates={templates} profile={draft}
          focusStage={stageFocus} focusItem={itemFocus}
          onSaved={async v => { setFlowDirty(false); await load(); setNotice(`נשמר כגרסה ${v}. לקוחות חדשים יקבלו אותה; מי שבאמצע — ממשיך בגרסה שלו.`); }}
          onReload={async () => { setFlowDirty(false); await load(); setReloadKey(k => k + 1); setNotice('נטען מחדש — זו הגרסה השמורה עכשיו.'); }}
          onBack={backToList}
          onDirtyChange={onBuilderDirty}
          onStartForClients={onboarding ? undefined : () => setStartFor(open.id)}
          onArchive={onboarding ? undefined : () => setArchiveFor(open.id)}
          onOpenLibrary={f => go('library', f ?? 'requests')}
          onOpenPage={(p, f) => go(p, f)}
          extra={onboarding ? (
            <div className="of-after-list">
              <SumRow id="representation" title="ייצוג מההצעה — מה מסומן מראש" open={repOpen} onToggle={() => setRepOpen(v => !v)}
                autoScroll={!!initial.rep}
                summary={<span>{repDefaultsSummary(repDraft)}</span>}>
                <p className="fl-hint" style={{ marginTop: 0 }}>
                  בקשת הייצוג נפתחת כשההצעה כוללת ייצוג, לפי ההיקף שבהצעה. כאן — מה מסומן מראש כשההצעה לא קבעה.
                </p>
                <RepDefaultsEditor profile={repDraft} onChangeProfile={setRepDraft} />
                <div className="fl-row-btns" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-sm btn-primary" disabled={!repDirty || repSaving} onClick={() => void saveRep()}>
                    {repSaving ? 'שומר…' : 'שמירת ברירת הייצוג'}
                  </button>
                  {repDirty && (
                    <button type="button" className="btn btn-sm btn-ghost" disabled={repSaving} onClick={() => setRepDraft(saved)}>ביטול</button>
                  )}
                </div>
                {repErr && <div className="of-error-box" role="alert">השמירה נכשלה: {repErr}</div>}
                <div style={{ marginTop: 14 }}>
                  <button type="button" className="fl-link" aria-expanded={repHow} onClick={() => setRepHow(v => !v)}>
                    {repHow ? 'הסתרת השלבים' : 'איך הייצוג עובד, שלב אחרי שלב'}
                  </button>
                  {repHow && <ProcessSteps def={REPRESENTATION_PROCESS} />}
                </div>
              </SumRow>
            </div>
          ) : undefined}
        />

        {startFlow && (
          <StartForClientsDialog flow={startFlow} clients={clients} onClose={() => setStartFor(null)} onOpenClient={onOpenClient}
            itemTitle={k => { const it = startFlow.definition.stages.flatMap(s => s.items).find(i => i.key === k); return it ? title(it) : k; }} />
        )}
        {archiveFlow && (
          <ArchiveSheet flow={archiveFlow} busy={busy === archiveFlow.id} onCancel={() => setArchiveFor(null)} onConfirm={() => void archive(archiveFlow.id)} />
        )}
        {leaveAsk && (
          <FlSheet title="יציאה בלי לשמור?" onClose={() => setLeaveAsk(false)}
            foot={<>
              <button type="button" className="btn btn-secondary" onClick={() => setLeaveAsk(false)}>חזרה לעריכה</button>
              <span className="fl-spacer" />
              <button type="button" className="btn btn-danger" onClick={() => { setLeaveAsk(false); setFlowDirty(false); setOpenId(null); setStageFocus(undefined); setItemFocus(undefined); }}>
                יציאה — השינויים יימחקו
              </button>
            </>}>
            <p className="fl-sub">יש במסלול שינויים שלא נשמרו. ביציאה הם יימחקו, והמסלול יישאר בגרסה השמורה.</p>
          </FlSheet>
        )}
      </div>
    );
  }

  const activeRuns = (f: OfficeFlowRow) => f.activeRuns ?? Object.values(f.runsByVersion ?? {}).reduce((a, n) => a + n, 0);
  const stagesWord = (f: OfficeFlowRow) => {
    const k = f.definition.stages.length;
    return k === 1 ? 'שלב אחד' : `${k} שלבים`;
  };
  // ‼ בשורה שלצידה «הפעלה ללקוחות…» — לא «מפעילים מכרטיס הלקוח» בלבד, שסותר את הכפתור.
  const triggerWord = (t: FlowTrigger) => (t === 'manual' ? 'מפעילים כאן או מכרטיס הלקוח' : TRIGGER_LABELS[t].label);
  const runsWord = (n: number) => n === 0 ? 'אין לקוחות באמצע' : n === 1 ? 'לקוח אחד באמצע' : `${n} לקוחות באמצע`;
  const legacyLeft = legacy.filter(s => !convertedIds.has(s.id));

  return (
    <div className="fl-page">
      {notice && <div className="fl-notice" role="status">{notice}</div>}
      {loadErr && <div className="of-error-box" role="alert">טעינת המסלולים נכשלה: {loadErr}</div>}

      <ul className="fl-list">
        {onboardingFlow ? (
          <li className="fl-row is-pinned">
            <button type="button" className="fl-row-btn" onClick={() => setOpenId(onboardingFlow.id)}>
              <span className="fl-row-main">
                <span className="fl-row-title">{onboardingFlow.name}</span>
                <span className="fl-row-meta">
                  {TRIGGER_LABELS.quote_approved.label} · {stagesWord(onboardingFlow)} · {runsWord(activeRuns(onboardingFlow))}
                </span>
              </span>
              <RowEnd />
            </button>
          </li>
        ) : (
          <li className="fl-row"><span className="fl-row-main"><span className="fl-row-meta">מסלול הקליטה עוד לא נוצר במשרד הזה — הוא נוצר עם אישור ההצעה הראשון.</span></span></li>
        )}
        {others.map(f => (
          <li key={f.id} className="fl-row">
            <button type="button" className="fl-row-btn" onClick={() => setOpenId(f.id)}>
              <span className="fl-row-main">
                <span className="fl-row-title">{f.name}</span>
                <span className="fl-row-meta">
                  {triggerWord(f.trigger)} · {stagesWord(f)} · {runsWord(activeRuns(f))}
                </span>
              </span>
              <RowEnd />
            </button>
            <button type="button" className="btn btn-sm btn-secondary fl-row-act" onClick={() => setStartFor(f.id)}>הפעלה ללקוחות…</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary fl-new" onClick={() => setNewOpen(true)}>＋ מסלול חדש</button>
      {/* ‼ «מה כאן» כבר בכותרת העמוד; כאן רק איפה מפעילים ואיפה הבקשות עצמן.
          ‼ «ב» צמודה לקישור (fl-nb) — בטלפון היא נשארה לבד בסוף שורה. */}
      <p className="fl-hint fl-where">
        {others.length === 0
          ? 'מסלול ידני — למשל «פתיחת תיק במע״מ» — מפעילים מכרטיס הלקוח; מסלול שנתי — לשנת מס. '
          : 'מפעילים כאן («הפעלה ללקוחות…») או מכרטיס הלקוח, ושם רואים מה קרה. '}
        את הבקשות עצמן עורכים <span className="fl-nb">ב<button type="button" className="fl-link" onClick={() => go('library')}>ספרייה</button>.</span>
      </p>

      {/* ‼ מידע משני — מקופל. משרד עם עשרות סטים לא צריך לגלול עליהם בכל כניסה. */}
      {legacyLeft.length > 0 && (
        <details className="fl-legacy">
          <summary className="fl-legacy-sum">
            <span className="fl-h2">סטים ישנים ({legacyLeft.length})</span>
            <span className="fl-hint"> · מלפני המסלולים — אפשר להפוך כל סט למסלול ידני</span>
          </summary>
          <p className="fl-hint">כמה בקשות שנשמרו יחד. הופכים סט למסלול ידני — והבקשות שבו נכנסות לספרייה.</p>
          <ul className="fl-list">
            {legacyLeft.map(s => (
              <li key={s.id} className="fl-row">
                <span className="fl-row-main">
                  <span className="fl-row-title">{s.name}</span>
                  <span className="fl-row-meta">{s.count === 1 ? 'בקשה אחת' : `${s.count} בקשות יחד`}{s.description ? ` · ${s.description}` : ''}</span>
                </span>
                <button type="button" className="btn btn-sm btn-secondary fl-row-act" disabled={busy === s.id} onClick={() => void convert(s.id)}>
                  {busy === s.id ? 'מעביר…' : 'הפוך למסלול'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {newOpen && (
        <NewFlowSheet onClose={() => setNewOpen(false)} onCreated={async id => {
          setNewOpen(false);
          await load();
          setOpenId(id);
          setNotice('המסלול נוצר עם שלב ראשון ריק. מוסיפים פריטים ושומרים.');
        }} />
      )}
      {startFlow && (
        <StartForClientsDialog flow={startFlow} clients={clients} onClose={() => setStartFor(null)} onOpenClient={onOpenClient}
          itemTitle={k => { const it = startFlow.definition.stages.flatMap(s => s.items).find(i => i.key === k); return it ? title(it) : k; }} />
      )}
    </div>
  );
}

export default FlowsPage;

/**
 * סוף השורה: «עריכה ←» במחשב, וחץ ‹ בטלפון — כמו שורות «המשרד». ‼ בלי סימן בכלל
 * השורות בטלפון נקראו כטקסט, והכפתור היחיד שנראה היה «הפעלה ללקוחות…».
 */
function RowEnd() {
  return (
    <span className="fl-row-end">
      <span className="fl-row-end-word">עריכה ←</span>
      <span className="fl-row-chev" aria-hidden="true">‹</span>
    </span>
  );
}

function NewFlowSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (flowId: string) => void }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<Exclude<FlowTrigger, 'quote_approved'>>('manual');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setErr(null);
    const r = await createOfficeFlow(name.trim(), trigger, blankDefinition());
    setBusy(false);
    if (r.ok === false || r.error || !r.flowId) { setErr(serverErrorText(r.error)); return; }
    onCreated(r.flowId);
  }
  return (
    <FlSheet title="מסלול חדש" onClose={onClose}
      foot={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => void create()}>
          {busy ? 'יוצר…' : 'יצירה ופתיחה'}
        </button>
      </>}>
      <label className="fl-field">
        <span>שם</span>
        <input value={name} onChange={e => setName(e.target.value)} data-autofocus placeholder="למשל: דוח שנתי" maxLength={80}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) void create(); }} />
      </label>
      <div className="fl-cap">מתי מתחיל</div>
      <FlSeg label="מתי מתחיל" value={trigger} onChange={setTrigger}
        options={[{ value: 'manual', label: 'ידני' }, { value: 'annual', label: 'שנתי' }]} />
      <p className="fl-hint">{TRIGGER_LABELS[trigger].label} — {TRIGGER_LABELS[trigger].hint}</p>
      {err && <div className="of-error-box" role="alert">{err}</div>}
    </FlSheet>
  );
}

function ArchiveSheet({ flow, busy, onCancel, onConfirm }: {
  flow: OfficeFlowRow; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const n = flow.activeRuns ?? 0;
  return (
    <FlSheet title={`העברת «${flow.name}» לארכיון`} onClose={onCancel}
      foot={<>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>ביטול</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'מעביר…' : 'העברה לארכיון'}</button>
      </>}>
      <p className="fl-sub">
        המסלול לא יוצע יותר להפעלה. {n > 0 ? `${n === 1 ? 'לקוח אחד שבאמצע ממשיך' : `${n} לקוחות שבאמצע ממשיכים`} עד הסוף, ` : ''}
        ומה שכבר נפתח אצל לקוחות נשאר כמו שהוא.
      </p>
    </FlSheet>
  );
}
