// ─── ניהול תבנית של טופס חכם — הטופס עם המיפוי, השאלון, והקובץ ──────────────────
// «טופס»: ה-PDF עצמו בעורך ה-PDF הקיים (PdfPageEditor), וכל שדה הוא מלבן צבוע לפי המקור.
//   לחיצה על שדה ⇒ מה נכנס אליו, מאיפה, ומה קורה כשחסר או סותר. «עריכת מיפוי» פותחת טיוטה:
//   גוררים/משנים גודל (ההצמדה לטופס המודפס מיישרת לריבוע/לקו/למשבצות), הטיוטה נשמרת לבד,
//   ופרסום מותר רק אחרי בדיקת יישור שעברה על אותה טיוטה בדיוק (210).
// «שאלון»: מה נשאל בהגשה, לפי מקטעים — כל שאלה מקושרת לשדה שלה בטופס.
// «קובץ»: גרסת הטופס, היסטוריית המיפוי, ובדיקת קובץ חדש.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PdfPageEditor from '../../../components/clientTabs/PdfPageEditor';
import type { Annotation } from '../../../utils/pdfAnnotations';
import type { PlanPage } from '../../../utils/pdfPages';
import { loadPdf } from '../../../utils/pdfRender';
import type { FieldDef, PdfRect, SmartFormTemplate } from '../types';
import {
  applyMapping, diffFromBase, discardMappingDraft, fetchMappingState, invalidateActiveMapping,
  mappingErrorText, publishMapping, saveMappingDraft, startMappingDraft, type MappingState,
} from '../mapping';
import { auditMapping, renderLums, type MappingAudit } from '../mappingAudit';
import { detectLine, findSquareNear, snapCellsNear, type Lum } from '../printedGeometry';
import { SECTION_TITLES, SOURCE_COLORS, SOURCE_LABELS, categoryOf, dataKeyOf, guideFor, type SourceCategory } from '../btl6101/fieldGuide';
import { loadBtl6101Template, renderBtl6101 } from '../btl6101/document';
import { CLIENT_DECLARED_KEYS, KEY_LABELS, SECTION_OF, resolve6101 } from '../btl6101/resolve';
import { FX_FULL } from '../btl6101/fixtures';
import { BTL6101_PURPOSE_LABELS, BTL6101_PURPOSE_HINTS, SECTION_PURPOSES, type Btl6101Data, type Btl6101Purpose } from '../btl6101/model';
import { sha256Hex } from '../hash';
import '../smartForms.css';
import './templateManager.css';

type Tab = 'form' | 'questions' | 'file';
const CATS: SourceCategory[] = ['card', 'btl', 'answer', 'calc', 'signature'];
const ALL_PURPOSES: Btl6101Purpose[] = ['multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'];
const SECTION_ORDER = ['identity', 'marital', 'spouse', 'address', 'contact', 'altContact', 'digital', 'mailing', 'bank', 'occupations', 'start', 'change', 'spouseBusiness', 'end', 'employees', 'business', 'declaration'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** דוגמת מילוי: לקוחה סינתטית, כמה שיותר סעיפים יחד (התחלה/שינוי/הפסקה סותרים זה את זה). */
const SAMPLE = {
  purposes: ['multi_year_report', 'start', 'spouse_in_business', 'stop_employees'] as Btl6101Purpose[],
  entered: { startDate: '2026-10-01', hoursBand: '20_plus', monthlyIncome: '9500', spouseFromDate: '2026-10-01', spouseSharePct: '25', spouseWeeklyHours: '12',
    stopEmployeesDate: '2026-08-31', declarationDate: '2026-09-28', maritalSinceMonth: '08', altContactLastName: 'אלמוג', altContactFirstName: 'עידו', altContactIdNumber: '3456787',
    mailRecipient: 'נועה אלמוג', mailStreet: 'ת.ד. 4521', mailCity: 'תל אביב - יפו', mailZip: '6104502' } as Partial<Btl6101Data>,
  flags: { contactNotOwn: true, separateMailing: true },
};

// ─── המרה: שדה (נק', ראשית למטה) ⇄ סימון של העורך (אחוזים, ראשית למעלה) ─────
function toAnnRect(t: SmartFormTemplate, b: PdfRect) {
  const W = t.pageSize.width, H = t.pageSize.height;
  return { xPct: b.x / W, yPct: (H - b.y - b.h) / H, widthPct: b.w / W, heightPct: b.h / H };
}
function fromAnnRect(t: SmartFormTemplate, a: { xPct: number; yPct: number; widthPct: number; heightPct: number }): PdfRect {
  const W = t.pageSize.width, H = t.pageSize.height;
  return { x: r2(a.xPct * W), y: r2(H - (a.yPct + a.heightPct) * H), w: r2(a.widthPct * W), h: r2(a.heightPct * H) };
}
/** מזיז שדה למלבן חדש — התאים, קו הכתיבה וקו הבסיס זזים איתו. */
function moveField(f: FieldDef, box: PdfRect): FieldDef {
  const dy = box.y - f.box.y, sx = f.box.w ? box.w / f.box.w : 1;
  return {
    ...f, box,
    ...(f.cells ? { cells: f.cells.map(c => r2(box.x + (c - f.box.x) * sx)) } : {}),
    ...(f.line != null ? { line: r2(f.line + dy) } : {}),
    ...(f.baseline != null ? { baseline: r2(f.baseline + dy) } : {}),
  };
}
const withField = (t: SmartFormTemplate, f: FieldDef): SmartFormTemplate => ({ ...t, fields: t.fields.map(x => x.id === f.id ? f : x) });

function useNarrow() {
  const q = '(max-width: 900px)';
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return n;
}

export default function SmartTemplateManager({ base, onClose }: { base: SmartFormTemplate; onClose: () => void }) {
  const narrow = useNarrow();
  const [state, setState] = useState<MappingState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [blank, setBlank] = useState<Uint8Array | null>(null);
  const [tab, setTab] = useState<Tab>('form');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<SourceCategory>>(new Set());
  const [sampleOn, setSampleOn] = useState(false);
  const [sampleBytes, setSampleBytes] = useState<Uint8Array | null>(null);
  const [zoom, setZoom] = useState(1);

  // עריכה
  const [edit, setEdit] = useState<{ version: number; updatedAt: string; baseVersion: number } | null>(null);
  const editRef = useRef(edit); editRef.current = edit;
  const [work, setWork] = useState<SmartFormTemplate | null>(null);
  const workRef = useRef(work); workRef.current = work;
  const undo = useRef<SmartFormTemplate[]>([]);
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<number | undefined>(undefined);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const lums = useRef<Map<number, Lum> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [audit, setAudit] = useState<MappingAudit | null>(null);
  const [auditing, setAuditing] = useState<{ done: number; total: number; label: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { setState(await fetchMappingState(base.key)); setLoadErr(null); }
    catch (e) { setLoadErr(e instanceof Error ? e.message : String(e)); }
  }, [base.key]);
  useEffect(() => { void reload(); void loadBtl6101Template().then(setBlank).catch(e => setLoadErr(String(e))); }, [reload]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(t); }, [toast]);

  const active = useMemo(() => state ? applyMapping(base, { version: state.active.version, fields: state.active.fields ?? {} }) : null, [state, base]);
  const shown = edit && work ? work : active;

  // דוגמת מילוי — מתעדכנת עם המיפוי שמוצג
  useEffect(() => {
    if (!sampleOn || !shown) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = resolve6101({ client: FX_FULL, purposes: SAMPLE.purposes, entered: SAMPLE.entered, asOf: '2026-09-28', flags: SAMPLE.flags });
      try {
        const { bytes } = await renderBtl6101(r.data, SAMPLE.purposes, { template: shown, draftMark: 'דוגמה · לקוחה בדויה' });
        if (!cancelled) setSampleBytes(bytes);
      } catch { if (!cancelled) setSampleBytes(null); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [sampleOn, shown]);

  const problems = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of audit?.problems ?? []) { const id = p.fieldId.split('#')[0]; m.set(id, [...(m.get(id) ?? []), p.message]); }
    return m;
  }, [audit]);

  const counts = useMemo(() => {
    const c: Record<SourceCategory, number> = { card: 0, btl: 0, answer: 0, calc: 0, signature: 0 };
    for (const f of shown?.fields ?? []) c[categoryOf(f)]++;
    return c;
  }, [shown]);

  const annotations = useMemo<Annotation[]>(() => {
    if (!shown) return [];
    return shown.fields.filter(f => f.page === page && !hidden.has(categoryOf(f))).map(f => {
      const cat = categoryOf(f);
      const bad = problems.has(f.id);
      const color = bad ? '#dc2626' : SOURCE_COLORS[cat];
      const sel = selected === f.id;
      return {
        id: f.id, pageId: `tpl-p${page}`, kind: 'rectangle', ...toAnnRect(shown, f.box),
        color, fillColor: color, fillOpacity: sel ? 0.3 : sampleOn ? 0.05 : 0.13,
        thicknessPct: (sel ? 1.8 : 0.7) / shown.pageSize.width,
        hint: `${f.label} · ${SOURCE_LABELS[cat]}`,
      } as Annotation;
    });
  }, [shown, page, hidden, problems, selected, sampleOn]);

  const planPage = useMemo<PlanPage>(() => ({ id: `tpl-p${page}`, sourceId: 'tpl', sourceIndex: page - 1, rotation: 0 }), [page]);
  const selectedField = shown?.fields.find(f => f.id === selected) ?? null;

  // בטלפון הפירוט נפתח כגיליון שמכסה את חצי המסך התחתון — השדה שנבחר נגלל לחלק העליון,
  // אחרת הוא נבחר «מתחת» לגיליון (גם כשמגיעים אליו מהשאלון, אחרי החלפת עמוד).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!narrow || !selected || tab !== 'form') return;
    // ‼ אחרי החלפת עמוד הטופס עוד מצטייר והשדה זז — מחכים לציור, ומתקנים שוב אם זז
    let tries = 0, raf = 0, timer = 0;
    const place = (smooth: boolean) => {
      const root = rootRef.current;
      const el = root?.querySelector<HTMLElement>('.pdfe-ann.is-selected');
      const canvas = root?.querySelector<HTMLCanvasElement>('.pdfe-stage canvas');
      if (!root || !el || !canvas || el.getBoundingClientRect().height === 0 || canvas.getBoundingClientRect().height === 0) return false;
      const r = el.getBoundingClientRect(), box = root.getBoundingClientRect();
      const top = r.top - box.top;
      if (top >= root.clientHeight * 0.08 && r.bottom - box.top <= root.clientHeight * 0.45) return true;
      root.scrollTo({ top: root.scrollTop + top - root.clientHeight * 0.18, behavior: smooth ? 'smooth' : 'auto' });
      return true;
    };
    const go = () => {
      if (!place(true)) { if (tries++ < 60) raf = requestAnimationFrame(go); return; }
      timer = window.setTimeout(() => place(false), 700);
    };
    raf = requestAnimationFrame(go);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [narrow, selected, tab, page]);

  // ─── עריכה ────────────────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const e = editRef.current, w = workRef.current;
    if (!e || !w) return true;
    setSaving('saving');
    const r = await saveMappingDraft(base.key, e.version, diffFromBase(base, w), e.updatedAt);
    if (!r.ok) { setSaving('error'); setEditErr(mappingErrorText(r.error)); return false; }
    setEdit({ ...e, updatedAt: r.updatedAt as string });
    setSaving('saved'); setEditErr(null);
    return true;
  }, [base]);

  const scheduleSave = useCallback(() => {
    setSaving('pending'); setAudit(null);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 700);
  }, [flushSave]);

  async function beginEdit() {
    setBusy(true); setEditErr(null);
    const r = await startMappingDraft(base.key);
    setBusy(false);
    if (!r.ok) { setEditErr(mappingErrorText(r.error)); return; }
    setWork(applyMapping(base, { version: r.version as number, fields: (r.fields ?? {}) as never }));
    setEdit({ version: r.version as number, updatedAt: r.updatedAt as string, baseVersion: r.baseVersion as number });
    undo.current = []; setAudit(null); setSaving('saved');
    if (!lums.current && blank) lums.current = await renderLums(blank, Array.from({ length: base.pageCount }, (_, i) => i + 1));
  }

  async function endEdit() {
    if (saving === 'pending' || saving === 'saving') await flushSave();
    setEdit(null); setWork(null); setAudit(null); undo.current = [];
    await reload();
  }

  async function discardDraft() {
    if (!edit) return;
    if (!window.confirm(`למחוק את טיוטת המיפוי ${edit.version}? המיפוי הפעיל לא משתנה.`)) return;
    window.clearTimeout(saveTimer.current);
    const r = await discardMappingDraft(base.key, edit.version);
    if (!r.ok) { setEditErr(mappingErrorText(r.error)); return; }
    setEdit(null); setWork(null); setAudit(null); await reload();
  }

  const update = (f: FieldDef, opts: { pushUndo?: boolean } = {}) => {
    if (!workRef.current) return;
    if (opts.pushUndo) undo.current = [...undo.current.slice(-49), workRef.current];
    const next = withField(workRef.current, f);
    workRef.current = next;
    setWork(next);
  };

  /** הצמדה לטופס המודפס: ריבוע ⇐ ריבוע מודפס, קו ⇐ קו מודפס, תאים ⇐ משבצות. */
  function snap(f: FieldDef): { f: FieldDef; note: string | null } {
    const l = lums.current?.get(f.page);
    if (!l) return { f, note: null };
    if (f.kind === 'checkbox') {
      const sq = findSquareNear(l, f.box);
      return sq ? { f: { ...f, box: sq }, note: 'הוצמד לריבוע המודפס' } : { f, note: 'אין ריבוע מודפס קרוב — לא הוצמד' };
    }
    let out = f;
    const notes: string[] = [];
    if (f.cells) {
      const c = snapCellsNear(l, f.box, f.cells);
      if (c) {
        // ‼ השדה זז עם המשבצות — אותו מרווח מהקצוות כמו לפני ההצמדה
        const dx = c[0] - f.cells[0];
        out = { ...out, cells: c, box: { ...out.box, x: Math.round((out.box.x + dx) * 100) / 100 } };
        notes.push('התאים הוצמדו למשבצות');
      }
    }
    const hadLine = base.fields.find(b => b.id === f.id)?.line != null;
    if (out.line != null || hadLine) {
      const ln = detectLine(l, out.box, out.line ?? out.box.y, 10);
      if (ln != null) { out = { ...out, line: ln }; notes.push('הקו הוצמד לקו המודפס'); }
    }
    return { f: out, note: notes.join(' · ') || null };
  }

  const onLive = (id: string, patch: Partial<Annotation>) => {
    const w = workRef.current; if (!w) return;
    const f = w.fields.find(x => x.id === id); if (!f) return;
    const a = { ...toAnnRect(w, f.box), ...patch } as { xPct: number; yPct: number; widthPct: number; heightPct: number };
    update(moveField(f, fromAnnRect(w, a)));
  };
  const onGestureStart = () => { if (workRef.current) undo.current = [...undo.current.slice(-49), workRef.current]; };
  const onGestureEnd = () => {
    const w = workRef.current; const id = selected;
    if (w && id && snapOn) {
      const f = w.fields.find(x => x.id === id);
      if (f) { const s = snap(f); update(s.f); if (s.note) setToast(s.note); }
    }
    scheduleSave();
  };

  const nudge = useCallback((dx: number, dy: number) => {
    const w = workRef.current; if (!w || !selected) return;
    const f = w.fields.find(x => x.id === selected); if (!f) return;
    update(moveField(f, { ...f.box, x: r2(f.box.x + dx), y: r2(f.box.y + dy) }), { pushUndo: true });
    scheduleSave();
  }, [selected, scheduleSave]);

  useEffect(() => {
    if (!edit || tab !== 'form') return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const step = e.shiftKey ? 1 : 0.25;
      if (e.key === 'ArrowLeft') { nudge(-step, 0); e.preventDefault(); }
      if (e.key === 'ArrowRight') { nudge(step, 0); e.preventDefault(); }
      if (e.key === 'ArrowUp') { nudge(0, step); e.preventDefault(); }
      if (e.key === 'ArrowDown') { nudge(0, -step); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  function doUndo() {
    const prev = undo.current.pop();
    if (!prev) return;
    workRef.current = prev; setWork(prev); scheduleSave();
  }

  async function runAudit() {
    if (!edit || !work) return;
    const ok = saving === 'saved' || saving === 'idle' ? true : await flushSave();
    if (!ok || !editRef.current) return;
    setAuditing({ done: 0, total: 1, label: 'מתחיל…' }); setAudit(null);
    try {
      const a = await auditMapping(workRef.current!, base, { version: editRef.current.version, updatedAt: editRef.current.updatedAt },
        (done, total, label) => setAuditing({ done, total, label }));
      setAudit(a);
      if (!a.passed) {
        const first = a.problems[0];
        const f = workRef.current!.fields.find(x => x.id === first?.fieldId.split('#')[0]);
        if (f) { setSelected(f.id); setPage(f.page); }
      }
    } catch (e) {
      setEditErr(`הבדיקה נכשלה: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAuditing(null); }
  }

  async function doPublish() {
    if (!edit || !audit?.passed) return;
    setBusy(true);
    const r = await publishMapping(base.key, edit.version, audit, note);
    setBusy(false);
    if (!r.ok) { setEditErr(mappingErrorText(r.error)); setPublishOpen(false); if (r.error === 'audit_stale') setAudit(null); return; }
    invalidateActiveMapping(base.key);
    setPublishOpen(false); setNote('');
    setToast(`מיפוי ${edit.version} פורסם`);
    setEdit(null); setWork(null); setAudit(null);
    await reload();
  }

  const auditValid = !!audit && !!edit && audit.draftUpdatedAt === edit.updatedAt && saving !== 'pending' && saving !== 'saving';
  const close = async () => { if (edit && (saving === 'pending' || saving === 'saving')) await flushSave(); onClose(); };

  // ─── רינדור ────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="sf-overlay tm" role="dialog" aria-label={`תבנית — ${base.title}`}>
      <div className="sf-head">
        <div>
          <h2>{base.title}</h2>
          <div className="sf-sub">ביטוח לאומי · טופס {base.version}</div>
        </div>
        {state && (
          edit
            ? <span className="sf-state is-wait">טיוטת מיפוי {edit.version}</span>
            : <span className="sf-state is-done">מיפוי {state.active.version} · פעיל</span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void close()}>סגירה</button>
      </div>

      <nav className="sf-steps tm-tabs" role="tablist" aria-label="חלקי התבנית">
        {([['form', 'טופס ומיפוי'], ['questions', 'שאלון'], ['file', 'קובץ וגרסאות']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sf-step${tab === k ? ' is-current' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {loadErr && <div className="sf-error" style={{ padding: '1rem 1.1rem' }}>{loadErr}</div>}
      {!state || !shown || !blank ? (
        !loadErr && <div className="sf-note" style={{ padding: '2rem' }}>טוען את התבנית…</div>
      ) : tab === 'form' ? (
        <div className="tm-form">
          <div className="tm-toolbar">
            <div className="tm-pages" role="group" aria-label="עמוד">
              {Array.from({ length: base.pageCount }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" className={`tm-pill${page === n ? ' is-on' : ''}`} onClick={() => setPage(n)} aria-pressed={page === n}>עמ' {n}</button>
              ))}
            </div>
            <div className="tm-legend" role="group" aria-label="מקור הנתון">
              {CATS.map(c => (
                <button key={c} type="button" className={`tm-chip${hidden.has(c) ? ' is-off' : ''}`} aria-pressed={!hidden.has(c)}
                  onClick={() => setHidden(h => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })}>
                  <i style={{ background: SOURCE_COLORS[c] }} />{SOURCE_LABELS[c]} <b>{counts[c]}</b>
                </button>
              ))}
            </div>
            <span className="tm-grow" />
            <label className="tm-switch"><input type="checkbox" checked={sampleOn} onChange={e => setSampleOn(e.target.checked)} /> עם נתוני דוגמה</label>
            <div className="tm-zoom" role="group" aria-label="זום">
              <button type="button" className="tm-pill" onClick={() => setZoom(z => Math.max(1, r2(z - 0.5)))} aria-label="הקטנה">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="tm-pill" onClick={() => setZoom(z => Math.min(3, r2(z + 0.5)))} aria-label="הגדלה">+</button>
            </div>
            {!edit && !narrow && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void beginEdit()}>{state.draft ? `המשך עריכה (טיוטה ${state.draft.version})` : 'עריכת מיפוי'}</button>}
          </div>

          {edit && (
            <div className="tm-editbar">
              <span className={`tm-save is-${saving}`}>
                {saving === 'saving' ? 'שומר…' : saving === 'pending' ? 'יישמר עוד רגע' : saving === 'error' ? 'השמירה נכשלה' : 'נשמר'}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={doUndo} disabled={!undo.current.length}>ביטול פעולה</button>
              <label className="tm-switch" title="בסיום גרירה: ריבוע ⇐ ריבוע מודפס, קו ⇐ קו מודפס, תאים ⇐ משבצות">
                <input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} /> הצמדה לטופס המודפס
              </label>
              <span className="tm-grow" />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!auditing || saving === 'error'} onClick={() => void runAudit()}>
                {auditing ? `בודק… ${auditing.done}/${auditing.total}` : 'בדיקת יישור'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!auditValid || !audit?.passed} onClick={() => setPublishOpen(true)}
                title={!audit ? 'קודם בדיקת יישור' : !audit.passed ? 'יש בעיות לתיקון' : undefined}>פרסום</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void endEdit()}>סיום עריכה</button>
              <button type="button" className="btn btn-ghost btn-sm tm-danger" onClick={() => void discardDraft()}>מחיקת הטיוטה</button>
            </div>
          )}
          {edit && auditing && (
            <div className="tm-progress"><div style={{ width: `${Math.round((auditing.done / auditing.total) * 100)}%` }} /><span>{auditing.label}</span></div>
          )}
          {edit && audit && (
            <div className={`tm-audit ${audit.passed ? 'is-ok' : 'is-bad'}`} role="status">
              {audit.passed
                ? <>✓ היישור תקין — {audit.summary.targets} מדידות ב-{audit.summary.scenarios} תרחישים, וכל השדות על הטופס המודפס. אפשר לפרסם.</>
                : <>
                    <b>{audit.problems.length} בעיות לתיקון לפני פרסום</b>
                    <ul>
                      {audit.problems.slice(0, 8).map((p, i) => {
                        const f = work?.fields.find(x => x.id === p.fieldId.split('#')[0]);
                        return (
                          <li key={i}><button type="button" onClick={() => { if (f) { setSelected(f.id); setPage(f.page); } }}>
                            {f ? `${f.label}: ` : ''}{p.message}
                          </button></li>
                        );
                      })}
                      {audit.problems.length > 8 && <li className="tm-quiet">ועוד {audit.problems.length - 8}</li>}
                    </ul>
                  </>}
            </div>
          )}
          {editErr && <div className="sf-error tm-pad">{editErr}</div>}
          {narrow && !edit && <div className="tm-quiet tm-pad">עריכת המיפוי זמינה במחשב; כאן אפשר לעיין בטופס ובשדות.</div>}

          <div className={`tm-body${narrow && selectedField ? ' has-sheet' : ''}`}>
            <div className="tm-stage">
              <PdfPageEditor
                page={planPage}
                bytes={sampleOn && sampleBytes ? sampleBytes : blank}
                sourceRotation={0}
                annotations={annotations}
                tool="select"
                color="#2563eb"
                zoom={zoom}
                pendingImage={null}
                onAdd={() => undefined}
                onLiveUpdate={onLive}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
                onRemove={() => undefined}
                selectedId={selected}
                onSelect={setSelected}
                editRequest={null}
                onTextDone={() => undefined}
                readOnly={!edit}
                allowDelete={false}
                minSizePct={0.006}
                fitHeight={narrow ? '78vh' : '100vh - 210px'}
              />
            </div>
            <aside className={`tm-inspector${narrow && selectedField ? ' is-sheet' : ''}`} aria-live="polite">
              {selectedField
                ? <Inspector f={selectedField} base={base} editing={!!edit} problems={problems.get(selectedField.id) ?? []}
                    onChange={(f) => { update(f, { pushUndo: true }); scheduleSave(); }}
                    onSnap={() => { const s = snap(selectedField); update(s.f, { pushUndo: true }); if (s.note) setToast(s.note); scheduleSave(); }}
                    onReset={() => { const a = active?.fields.find(x => x.id === selectedField.id); if (a) { update(a, { pushUndo: true }); scheduleSave(); } }}
                    onClose={() => setSelected(null)} />
                : <Overview counts={counts} total={shown.fields.length} editing={!!edit} />}
            </aside>
          </div>
        </div>
      ) : tab === 'questions' ? (
        <Questions template={shown} onShow={(f) => { setTab('form'); setPage(f.page); setSelected(f.id); }} />
      ) : (
        <FileTab base={base} state={state} />
      )}

      {publishOpen && edit && (
        <div className="tm-modal" role="dialog" aria-label="פרסום מיפוי">
          <div className="tm-modal-card">
            <h3>פרסום מיפוי {edit.version}</h3>
            <p>מכאן כל טופס חדש יצויר במיקום החדש. טפסים שננעלו לחתימה ועוד לא נחתמו יצטרכו «הכן מחדש לחתימה» — הערכים נשמרים.</p>
            <label className="tm-field">מה שונה (לא חובה)
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: מצב משפחתי — הזזה קלה ימינה" />
            </label>
            <div className="sf-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void doPublish()}>{busy ? 'מפרסם…' : 'פרסום'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setPublishOpen(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="tm-toast" role="status">{toast}</div>}
    </div>
  );
}

// ─── הלוח הצדדי ─────────────────────────────────────────────────────────────

function Overview({ counts, total, editing }: { counts: Record<SourceCategory, number>; total: number; editing: boolean }) {
  return (
    <div className="tm-overview">
      <h3>{total} שדות בטופס</h3>
      <p className="tm-quiet">{editing ? 'בוחרים שדה וגוררים אותו, או משנים מידות בצד. חיצי המקלדת מזיזים ברבע נקודה (עם Shift — נקודה).' : 'לחיצה על שדה בטופס מראה מה נכנס אליו, מאיפה, ומה קורה כשחסר.'}</p>
      <ul className="tm-catlist">
        {CATS.map(c => <li key={c}><i style={{ background: SOURCE_COLORS[c] }} /><span>{SOURCE_LABELS[c]}</span><b>{counts[c]}</b></li>)}
      </ul>
    </div>
  );
}

function Inspector({ f, base, editing, problems, onChange, onSnap, onReset, onClose }: {
  f: FieldDef; base: SmartFormTemplate; editing: boolean; problems: string[];
  onChange: (f: FieldDef) => void; onSnap: () => void; onReset: () => void; onClose: () => void;
}) {
  const g = useMemo(() => guideFor(f), [f]);
  const num = (k: keyof PdfRect) => (
    <label className="tm-num">{({ x: 'מימין לשמאל', y: 'מלמטה', w: 'רוחב', h: 'גובה' } as const)[k]}
      <input type="number" step={0.25} value={f.box[k]} dir="ltr"
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(moveField(f, { ...f.box, [k]: v })); }} />
    </label>
  );
  const changed = (() => { const b = base.fields.find(x => x.id === f.id); return b && JSON.stringify(b.box) !== JSON.stringify(f.box); })();
  return (
    <div className="tm-insp">
      <div className="tm-insp-head">
        <span className="tm-cat" style={{ background: SOURCE_COLORS[g.category] }}>{SOURCE_LABELS[g.category]}</span>
        <button type="button" className="tm-x" aria-label="סגירה" onClick={onClose}>✕</button>
      </div>
      <h3>{f.label}</h3>
      <div className="tm-quiet">עמוד {f.page}{g.section ? ` · ${SECTION_TITLES[g.section] ?? g.section}` : ''}</div>
      {problems.length > 0 && <ul className="tm-probs">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      <dl className="tm-facts">
        <dt>מה נכנס</dt><dd>{g.dataLabel}{g.example && <span className="tm-example" dir="auto">{g.example}</span>}</dd>
        <dt>מאיפה</dt><dd>{g.from}</dd>
        <dt>כשחסר</dt><dd>{g.ifMissing}</dd>
        <dt>כשסותר</dt><dd>{g.ifConflict}</dd>
        <dt>מתי</dt><dd>{g.when}</dd>
        {g.declared && <><dt>הצהרה</dt><dd>הלקוח מצהיר על הנתון — מאשרים מולו לפני חתימה</dd></>}
        {g.format && <><dt>איך נכתב</dt><dd>{g.format}</dd></>}
      </dl>
      {editing && (
        <div className="tm-geom">
          <div className="tm-geom-head">מיקום (נקודות)</div>
          <div className="tm-geom-grid">{num('x')}{num('y')}{num('w')}{num('h')}</div>
          {f.line != null && (
            <label className="tm-num">קו הכתיבה
              <input type="number" step={0.25} value={f.line} dir="ltr" onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange({ ...f, line: v }); }} />
            </label>
          )}
          {f.cells && <div className="tm-quiet">{f.cells.length - 1} תאי ספרות — זזים ונמתחים עם השדה</div>}
          <div className="sf-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onSnap}>הצמדה לטופס המודפס</button>
            {changed && <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>חזרה למיפוי הפעיל</button>}
          </div>
        </div>
      )}
      <details className="tm-tech">
        <summary>פרטים טכניים</summary>
        <div dir="ltr">{f.id} · {f.kind} · x {f.box.x} · y {f.box.y} · {f.box.w}×{f.box.h}{f.line != null ? ` · line ${f.line}` : ''}{f.cells ? ` · ${f.cells.length - 1} cells` : ''}</div>
        <div>{f.source}</div>
      </details>
    </div>
  );
}

// ─── שאלון ──────────────────────────────────────────────────────────────────

function Questions({ template, onShow }: { template: SmartFormTemplate; onShow: (f: FieldDef) => void }) {
  const byKey = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    for (const f of template.fields) { const k = dataKeyOf(f); m.set(k, [...(m.get(k) ?? []), f]); }
    return m;
  }, [template]);
  const keysOf = (s: string) => Object.keys(KEY_LABELS).filter(k => SECTION_OF[k] === s);
  const when = (s: string) => {
    const p = SECTION_PURPOSES[s];
    if (s === 'spouse') return 'כשנשוי/אה או ידוע/ה בציבור';
    if (s === 'altContact') return 'כשהנייד או המייל אינם של המבוטח';
    if (s === 'mailing') return 'כשיש מען שונה';
    return !p || p === 'always' ? 'בכל הגשה' : p.map(x => BTL6101_PURPOSE_LABELS[x]).join(' · ');
  };
  return (
    <div className="tm-q">
      <section className="tm-q-sec">
        <h3>מה מדווחים <span className="tm-quiet">— הבחירה הראשונה בהגשה; היא קובעת אילו סעיפים נשאלים</span></h3>
        <ul className="tm-q-list">
          {ALL_PURPOSES.map(p => <li key={p}><span className="tm-q-label">{BTL6101_PURPOSE_LABELS[p]}</span><span className="tm-quiet">{BTL6101_PURPOSE_HINTS[p]}</span></li>)}
        </ul>
      </section>
      {SECTION_ORDER.map(s => {
        const keys = s === 'declaration' ? ['declarationDate'] : keysOf(s);
        if (!keys.length) return null;
        return (
          <section key={s} className="tm-q-sec">
            <h3>{SECTION_TITLES[s] ?? s} <span className="tm-quiet">— {when(s)}</span></h3>
            <ul className="tm-q-list">
              {keys.map(k => {
                const fs = byKey.get(k) ?? [];
                const f = fs[0];
                const cat = f ? categoryOf(f) : 'answer';
                const req = f?.required === 'always' ? 'חובה' : f?.required === 'when_applicable' ? 'חובה כשרלוונטי' : f?.required === 'signer' ? 'חתימה' : 'רשות';
                return (
                  <li key={k}>
                    <span className="tm-q-label">{KEY_LABELS[k] ?? k}</span>
                    <span className="tm-cat sm" style={{ background: SOURCE_COLORS[cat] }}>{SOURCE_LABELS[cat]}</span>
                    <span className="tm-quiet">{req}{CLIENT_DECLARED_KEYS.has(k) ? ' · הצהרת הלקוח' : ''}</span>
                    <span className="tm-grow" />
                    {f && <button type="button" className="tm-link" onClick={() => onShow(f)}>בטופס · עמ' {f.page} ←</button>}
                  </li>
                );
              })}
              {s === 'declaration' && template.fields.filter(f => f.kind === 'signature').map(f => (
                <li key={f.id}>
                  <span className="tm-q-label">{f.label}</span>
                  <span className="tm-cat sm" style={{ background: SOURCE_COLORS.signature }}>{SOURCE_LABELS.signature}</span>
                  <span className="tm-grow" />
                  <button type="button" className="tm-link" onClick={() => onShow(f)}>בטופס · עמ' {f.page} ←</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── קובץ וגרסאות ──────────────────────────────────────────────────────────

interface Check { name: string; same: boolean; version?: string; pages?: number; size?: string }
async function inspect(file: File, base: SmartFormTemplate): Promise<Check> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (await sha256Hex(bytes) === base.sha256) return { name: file.name, same: true };
  const pdf = await loadPdf(bytes);
  let version: string | undefined;
  try {
    const p = await pdf.doc.getPage(1);
    version = /(\d{2}\.\d{4})/.exec((await p.getTextContent()).items.map(i => ('str' in i ? i.str : '')).join(' '))?.[1];
  } catch { /* בלי שכבת טקסט */ }
  const p1 = pdf.pages[0];
  void pdf.doc.destroy();
  return { name: file.name, same: false, version, pages: pdf.numPages, size: p1 ? `${Math.round(p1.width)}×${Math.round(p1.height)}` : undefined };
}

function FileTab({ base, state }: { base: SmartFormTemplate; state: MappingState }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('he-IL') : '';
  return (
    <div className="tm-file">
      <section className="tm-q-sec">
        <h3>הקובץ</h3>
        <dl className="tm-facts">
          <dt>גרסת הטופס</dt><dd>{base.version} · {base.pageCount} עמודים · {base.fields.length} שדות</dd>
          <dt>הטופס הריק</dt><dd><a href={base.fileUrl} target="_blank" rel="noopener noreferrer">פתיחה</a></dd>
          <dt>טביעה</dt><dd dir="ltr" className="tm-mono">{base.sha256}</dd>
        </dl>
        <label className="tm-link" style={{ cursor: 'pointer' }}>
          <input type="file" accept="application/pdf" hidden disabled={busy}
            onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { setCheck(await inspect(f, base)); } finally { setBusy(false); } }} />
          {busy ? 'בודק…' : 'יצאה גרסה חדשה של הטופס? בדיקת קובץ'}
        </label>
        {check && (
          <div className={`sf-banner ${check.same ? 'is-info' : 'is-warn'}`} style={{ marginTop: 8 }}>
            {check.same ? `«${check.name}» זהה לגרסה הממופה.`
              : `«${check.name}» שונה מהגרסה הממופה${check.version ? ` (נראה כגרסה ${check.version})` : ''}${check.pages ? `, ${check.pages} עמודים` : ''}. המיפוי הקיים לא חל עליו — טפסים שכבר נוצרו לא משתנים.`}
          </div>
        )}
      </section>
      <section className="tm-q-sec">
        <h3>גרסאות המיפוי</h3>
        <ul className="tm-q-list">
          {state.draft && <li><span className="tm-q-label">מיפוי {state.draft.version}</span><span className="tm-cat sm" style={{ background: '#d97706' }}>טיוטה</span><span className="tm-quiet">נשמר {fmt(state.draft.updatedAt)}</span></li>}
          {state.history.map(h => (
            <li key={h.version}>
              <span className="tm-q-label">מיפוי {h.version}</span>
              <span className={`tm-cat sm${h.status === 'published' ? '' : ' is-muted'}`} style={{ background: h.status === 'published' ? '#16a34a' : '#94a3b8' }}>{h.status === 'published' ? 'פעיל' : 'הוחלף'}</span>
              <span className="tm-quiet">פורסם {fmt(h.publishedAt)}{h.note ? ` · ${h.note}` : ''}</span>
            </li>
          ))}
          <li>
            <span className="tm-q-label">מיפוי {state.codeBase}</span>
            <span className={`tm-cat sm${state.active.version === state.codeBase ? '' : ' is-muted'}`} style={{ background: state.active.version === state.codeBase ? '#16a34a' : '#94a3b8' }}>{state.active.version === state.codeBase ? 'פעיל' : 'בסיס'}</span>
            <span className="tm-quiet">הבסיס שנמדד מול הטופס המודפס</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
