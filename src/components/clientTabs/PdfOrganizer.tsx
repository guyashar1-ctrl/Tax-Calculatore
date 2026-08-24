// ─── משטח עמודי PDF ────────────────────────────────────────────────────
// משטח אחד לכל מה שעושים על PDF, מחולק לשלושה מצבים ולא לשלושה מסכים:
//   סידור — סדר, סיבוב, הסרה, חיתוך, הוספת קובץ, חילוץ ופיצול
//   עריכה — טקסט, הדגשה, ציור, צורות, ✓/✗ ותמונה
//   חתימה — חתימה וחותמת, על אותו מנגנון של שכבת התמונה
//
// ‼ הכול נשען על מודל אחד (PlanPage + Annotation) ולא על מנוע לכל פעולה.
// לכן "בטל" אחד מכסה גם סידור וגם עריכה, ולכן פעולה חדשה נכנסת בלי לבנות
// צינור נוסף. פרויקט הייחוס החזיק שתי מחסניות נפרדות — כאן זה מיותר, כי
// המצב כולו הוא אובייקט אחד.
//
// ‼ המקורות נקראים בלבד. שום מצב כאן אינו כותב לקובץ שממנו הגיע העמוד;
// הפלט תמיד מסמך חדש.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPdf, renderThumbnail, type PdfDocument } from '../../utils/pdfRender';
import {
  buildInitialPlan, movePage, rotatePage, removePage, removePages,
  setPageCrop, insertPages, extractPlan, splitPlanEvery, parsePageRanges,
  type PlanPage, type PlanSource,
} from '../../utils/pdfPages';
import { capsOf, type Annotation } from '../../utils/pdfAnnotations';
import PdfPageEditor, { mkAnnotation, type EditTool } from './PdfPageEditor';
import PdfStyleBar from './PdfStyleBar';
import SignaturePad from '../SignaturePad';
import Icon from '../ui/Icon';

export interface OrganizerSource extends PlanSource {
  bytes: Uint8Array;
  /** סיבוב מובנה של עמודי המקור, לצורך תצוגה נכונה בעריכה. */
  rotations?: number[];
}

export type WorkspaceMode = 'organize' | 'edit' | 'sign';

export interface OrganizerOutput {
  plan: PlanPage[];
  annotations: Annotation[];
  name: string;
  /** כשמפצלים — כמה מסמכים במקום אחד. */
  groups?: { plan: PlanPage[]; suffix: string }[];
}

interface Props {
  sources: OrganizerSource[];
  initialName: string;
  busy: boolean;
  error: string;
  /** מוסיף קובץ PDF נוסף למשטח; מחזיר מקור מוכן או null אם בוטל/נכשל. */
  onPickSource: () => Promise<OrganizerSource | null>;
  onCancel: () => void;
  onCreate: (out: OrganizerOutput) => void;
}

const SOURCE_TINTS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#06b6d4'];
const INK_COLORS = ['#111827', '#e02424', '#1552d8', '#0a8a3c', '#f59e0b', '#facc15'];
/** ‼ למרקר צבע משלו: הדגשה בצבע הדיו הכהה מכסה את הטקסט במקום להבליט אותו. */
const HIGHLIGHT_DEFAULT = '#facc15';

interface Snapshot { plan: PlanPage[]; annotations: Annotation[] }

export default function PdfOrganizer({
  sources: initialSources, initialName, busy, error, onPickSource, onCancel, onCreate,
}: Props) {
  const [sources, setSources] = useState<OrganizerSource[]>(initialSources);
  const [state, setState] = useState<Snapshot>(() => ({
    plan: buildInitialPlan(initialSources), annotations: [],
  }));
  const [mode, setMode] = useState<WorkspaceMode>('organize');
  const [name, setName] = useState(initialName);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  const [zoom, setZoom] = useState(1);
  /** סימון שהועתק — Ctrl+C/X/V, כמו בפרויקט הייחוס. */
  const clipboardRef = useRef<Annotation | null>(null);
  /** Enter על טקסט נבחר פותח אותו לעריכה — הבקשה עוברת לעורך כ-prop. */
  const [editRequest, setEditRequest] = useState<{ id: string; n: number } | null>(null);

  // ─── היסטוריה אחת לכל המצבים ──────────────────────────────────────────
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [histTick, setHistTick] = useState(0);

  const { plan, annotations } = state;
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  /**
   * ‼ המצב נכתב דרך הפונקציה הזו בלבד, ו-stateRef מתעדכן *מיד* ולא
   * ממתין ל-effect: כל חשבונאות ההיסטוריה קוראת ממנו, ומחווה מהירה
   * (גרירה, מחוון) מייצרת כמה כתיבות באותו tick.
   */
  const applyState = useCallback((next: Snapshot) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * ‼ רישום ההיסטוריה קורה *מחוץ* לפונקציית העדכון של React ולא בתוכה.
   * React קורא לפונקציית עדכון פעמיים במצב פיתוח, וכשהדחיפה והשליפה של
   * המחסניות ישבו בתוכה — "בצע שוב" שלף את הרשומה בקריאה הראשונה, לא
   * מצא דבר בשנייה, והחזיר את המצב המקורי. התוצאה: כפתור שנדלק, נכבה,
   * ולא עשה כלום.
   */
  const commit = useCallback((next: (cur: Snapshot) => Snapshot) => {
    const cur = stateRef.current;
    const resolved = next(cur);
    if (resolved === cur) return;
    past.current = [...past.current.slice(-49), cur];
    future.current = [];
    applyState(resolved);
    setHistTick(t => t + 1);
  }, [applyState]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current, stateRef.current];
    applyState(prev);
    setHistTick(t => t + 1);
  }, [applyState]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current = [...past.current, stateRef.current];
    applyState(nxt);
    setHistTick(t => t + 1);
  }, [applyState]);

  // ─── בחירה, כלים ומצבי משנה ───────────────────────────────────────────
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditTool>('select');
  const [ink, setInk] = useState(INK_COLORS[0]);
  const [hlColor, setHlColor] = useState(HIGHLIGHT_DEFAULT);
  /** הצבע הפעיל תלוי בכלי: המרקר זוכר את שלו, כל השאר חולקים את הדיו. */
  const activeColor = tool === 'highlight' ? hlColor : ink;
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [selectedAnn, setSelectedAnn] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [rangeText, setRangeText] = useState('');
  const [everyN, setEveryN] = useState('1');
  const [addingSource, setAddingSource] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ─── מקלדת: Esc, בטל, בצע שוב ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT';
      if (e.key === 'Escape' && !busy && !typing) {
        e.stopPropagation();
        // ‼ סולם יציאה: קודם ביטול בחירה, רק אחר כך סגירת המשטח.
        // קודם Esc סגר את הכול ומחק את העבודה בשקט — הרגל אצבעות טבעי
        // שעלה בכל הסימונים שנעשו.
        if (selectedAnnRef.current) { setSelectedAnn(null); return; }
        requestClose();
        return;
      }

      // Enter על טקסט נבחר פותח אותו לעריכה — בלי לחפש את הלחיצה הכפולה
      if (!typing && e.key === 'Enter' && modeRef.current !== 'organize' && selectedAnnRef.current) {
        const ann = stateRef.current.annotations.find(a => a.id === selectedAnnRef.current);
        if (ann?.kind === 'text') {
          e.preventDefault();
          setEditRequest({ id: ann.id, n: Date.now() });
          return;
        }
      }

      const sel = selectedAnnRef.current;
      const inEditor = modeRef.current !== 'organize';

      if (!typing && inEditor && sel) {
        // מחיקה וחצים על הסימון הנבחר — כמו בפרויקט הייחוס
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          commit(cur => ({ ...cur, annotations: cur.annotations.filter(a => a.id !== sel) }));
          setSelectedAnn(null);
          return;
        }
        const arrow: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
        };
        if (arrow[e.key]) {
          e.preventDefault();
          const [dx, dy] = arrow[e.key];
          const step = e.shiftKey ? 0.02 : 0.004;
          commit(cur => ({
            ...cur,
            annotations: cur.annotations.map(a => (a.id === sel ? {
              ...a,
              xPct: Math.min(Math.max(0, 1 - a.widthPct), Math.max(0, a.xPct + dx * step)),
              yPct: Math.min(Math.max(0, 1 - a.heightPct), Math.max(0, a.yPct + dy * step)),
            } : a)),
          }));
          return;
        }
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey && !typing) { e.preventDefault(); undo(); }
      else if (((k === 'z' && e.shiftKey) || k === 'y') && !typing) { e.preventDefault(); redo(); }
      else if (!typing && inEditor && (k === 'c' || k === 'x') && sel) {
        const ann = stateRef.current.annotations.find(a => a.id === sel);
        if (!ann) return;
        e.preventDefault();
        clipboardRef.current = { ...ann, points: ann.points?.map(p => ({ ...p })) };
        if (k === 'x') {
          commit(cur => ({ ...cur, annotations: cur.annotations.filter(a => a.id !== sel) }));
          setSelectedAnn(null);
        }
      } else if (!typing && inEditor && k === 'v' && clipboardRef.current) {
        e.preventDefault();
        const src = clipboardRef.current;
        const target = editPageRef.current;
        if (!target) return;
        // ‼ הדבקה בהיסט קטן, כמו בייחוס — אחרת העותק מסתיר את המקור בדיוק
        const copy: Annotation = {
          ...src,
          id: `an-${Math.random().toString(36).slice(2, 10)}`,
          pageId: target,
          xPct: Math.min(1 - src.widthPct, src.xPct + 0.02),
          yPct: Math.min(1 - src.heightPct, src.yPct + 0.02),
          points: src.points?.map(p => ({ ...p })),
        };
        commit(cur => ({ ...cur, annotations: [...cur.annotations, copy] }));
        setSelectedAnn(copy.id);
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel, undo, redo, commit]);

  // refs למקלדת — הערכים העדכניים בלי לרשום מחדש את המאזין
  const selectedAnnRef = useRef<string | null>(null);
  const modeRef = useRef<WorkspaceMode>('organize');
  const editPageRef = useRef<string | null>(null);

  const sourceById = useMemo(() => {
    const m = new Map<string, { source: OrganizerSource; tint: string }>();
    sources.forEach((s, i) => m.set(s.docId, { source: s, tint: SOURCE_TINTS[i % SOURCE_TINTS.length] }));
    return m;
  }, [sources]);
  const multiSource = sources.length > 1;

  useEffect(() => { selectedAnnRef.current = selectedAnn; }, [selectedAnn]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const editPage = useMemo(
    () => plan.find(p => p.id === editPageId) ?? plan[0] ?? null,
    [plan, editPageId],
  );

  const selectedAnnObj = useMemo(
    () => (selectedAnn ? annotations.find(a => a.id === selectedAnn) ?? null : null),
    [annotations, selectedAnn],
  );

  useEffect(() => { editPageRef.current = editPage?.id ?? null; }, [editPage]);

  // ─── פעולות סידור ─────────────────────────────────────────────────────
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const targetIndex = plan.findIndex(p => p.id === targetId);
    const moving = dragId;
    commit(cur => ({ ...cur, plan: movePage(cur.plan, moving, targetIndex) }));
    setDragId(null); setOverId(null);
  }
  function nudge(id: string, delta: -1 | 1) {
    const at = plan.findIndex(p => p.id === id);
    if (at < 0) return;
    commit(cur => ({ ...cur, plan: movePage(cur.plan, id, at + delta) }));
  }
  function dropPage(id: string) {
    commit(cur => ({
      plan: removePage(cur.plan, id),
      annotations: cur.annotations.filter(a => a.pageId !== id),
    }));
    setPicked(s => { const n = new Set(s); n.delete(id); return n; });
  }
  function togglePick(id: string) {
    setPicked(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function addSource() {
    if (addingSource) return;
    setAddingSource(true);
    try {
      const src = await onPickSource();
      if (!src) return;
      setSources(cur => (cur.some(s => s.docId === src.docId) ? cur : [...cur, src]));
      const stamp = Math.random().toString(36).slice(2, 7);
      commit(cur => ({ ...cur, plan: insertPages(cur.plan, src, cur.plan.length, stamp) }));
    } finally {
      setAddingSource(false);
    }
  }

  // ─── סימונים ──────────────────────────────────────────────────────────
  const addAnnotation = useCallback((a: Annotation) => {
    commit(cur => ({ ...cur, annotations: [...cur.annotations, a] }));
  }, [commit]);

  // ‼ גרירה מייצרת עשרות עדכונים בשנייה, והם *לא* נכנסים להיסטוריה אחד-אחד:
  // ההיסטוריה נרשמה כבר בהוספה, ו"בטל" אחרי גרירה אמור להחזיר את הסימון
  // למצבו הקודם — לא לזוז פיקסל אחורה בכל לחיצה.
  const updateAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    const cur = stateRef.current;
    applyState({
      ...cur,
      annotations: cur.annotations.map(a => (a.id === id ? { ...a, ...patch } : a)),
    });
  }, [applyState]);

  /** סגירת המשטח — אם יש עבודה שלא נשמרה, שואלים קודם. */
  const requestClose = useCallback(() => {
    if (busy) return;
    const dirty = past.current.length > 0 || future.current.length > 0
      || stateRef.current.annotations.length > 0;
    if (dirty && !window.confirm('לסגור את העורך? הסימונים והשינויים שלא נשמרו יימחקו.')) return;
    onCancel();
  }, [busy, onCancel]);

  /**
   * ‼ גרירה מייצרת עשרות עדכונים בשנייה. ההיסטוריה מקבלת רשומה אחת:
   * תצלום-מצב נלקח בתחילת המחווה, ונרשם רק אם בסופה משהו באמת השתנה.
   * "בטל" אחרי גרירה מחזיר את הסימון למקומו — לא פיקסל אחורה בכל לחיצה.
   */
  const gestureSnap = useRef<Snapshot | null>(null);
  const beginGesture = useCallback(() => { gestureSnap.current = stateRef.current; }, []);
  const endGesture = useCallback(() => {
    const snap = gestureSnap.current;
    gestureSnap.current = null;
    if (snap && snap.annotations !== stateRef.current.annotations) {
      past.current = [...past.current.slice(-49), snap];
      future.current = [];
      setHistTick(t => t + 1);
    }
  }, []);

  /** שינוי תכונה מהסרגל הצף — פעולה אחת, נכנסת להיסטוריה. */
  const commitPatch = useCallback((id: string, patch: Partial<Annotation>) => {
    commit(cur => ({
      ...cur,
      annotations: cur.annotations.map(a => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, [commit]);

  const removeAnnotation = useCallback((id: string) => {
    commit(cur => ({ ...cur, annotations: cur.annotations.filter(a => a.id !== id) }));
  }, [commit]);

  function pickImage(forSign: boolean) {
    (forSign ? stampInputRef : imageInputRef).current?.click();
  }
  async function onImageChosen(e: React.ChangeEvent<HTMLInputElement>, forSign: boolean) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) return;
    setPendingImage(dataUrl);
    setTool('image');
    if (forSign) setMode('sign');
    else if (mode === 'organize') setMode('edit');
  }

  function placeSignature(dataUrl: string) {
    if (!editPage || !dataUrl) return;
    addAnnotation({
      ...mkAnnotation('image', editPage.id, 0.55, 0.72, 0.32, 0.12, ink),
      imageData: dataUrl,
    });
    setTool('select');
  }

  // ─── יצירה ────────────────────────────────────────────────────────────
  const cleanName = name.trim();
  const canCreate = plan.length > 0 && cleanName.length > 0 && !busy;

  function createSingle() {
    if (!canCreate) return;
    onCreate({ plan, annotations, name: cleanName });
  }
  function createFromSelection() {
    const subset = extractPlan(plan, picked);
    if (subset.length === 0 || busy) return;
    onCreate({
      plan: subset,
      annotations: annotations.filter(a => subset.some(p => p.id === a.pageId)),
      name: `${cleanName} - נבחרים`,
    });
  }
  function createFromRanges() {
    const nums = parsePageRanges(rangeText, plan.length);
    if (nums.length === 0 || busy) return;
    const subset = nums.map(n => plan[n - 1]).filter(Boolean);
    onCreate({
      plan: subset,
      annotations: annotations.filter(a => subset.some(p => p.id === a.pageId)),
      name: `${cleanName} - עמודים ${rangeText.trim()}`,
    });
  }
  function createSplit() {
    if (busy) return;
    const size = Math.max(1, parseInt(everyN, 10) || 1);
    const groups = splitPlanEvery(plan, size);
    if (groups.length <= 1) { createSingle(); return; }
    onCreate({
      plan, annotations, name: cleanName,
      groups: groups.map((g, i) => ({ plan: g, suffix: `חלק ${i + 1}` })),
    });
  }

  const pageCount = plan.length;
  const annCount = annotations.length;
  const cropPage = cropFor ? plan.find(p => p.id === cropFor) : null;

  return (
    <div className="pdfw-scrim" role="dialog" aria-modal="true" aria-label="משטח עמודי PDF">
      <div className="pdfw">
        <header className="pdfw-head">
          <div className="pdfw-headmain">
            <h2 className="pdfw-title">{multiSource ? 'מיזוג וארגון PDF' : 'עריכת PDF'}</h2>
            <div className="pdfw-sub">
              {pageCount === 1 ? 'עמוד אחד' : `${pageCount} עמודים`}
              {multiSource && ` · ${sources.length} קבצים`}
              {annCount > 0 && ` · ${annCount} סימונים`}
            </div>
          </div>

          {/* ‼ שלושה מצבים ולא סרגל אחד עמוס: בכל רגע רואים רק את הכלים
              של מה שעושים עכשיו. */}
          <nav className="pdfw-modes" role="tablist" aria-label="מצב עבודה">
            {([['organize', 'סידור'], ['edit', 'עריכה'], ['sign', 'חתימה']] as const).map(([m, label]) => (
              <button
                key={m} type="button" role="tab" aria-selected={mode === m}
                className={`pdfw-mode${mode === m ? ' is-on' : ''}`}
                onClick={() => {
                  setMode(m);
                  setTool('select');
                  if (!editPageId) setEditPageId(plan[0]?.id ?? null);
                }}
              >{label}</button>
            ))}
          </nav>

          <div className="pdfw-headside">
            <button type="button" className="pdfw-hist" onClick={undo}
              disabled={past.current.length === 0 || busy} title="בטל (Ctrl+Z)" aria-label="בטל">↶</button>
            <button type="button" className="pdfw-hist" onClick={redo}
              disabled={future.current.length === 0 || busy} title="בצע שוב (Ctrl+Shift+Z)" aria-label="בצע שוב">↷</button>
            <button type="button" className="ui-icon-btn" onClick={requestClose} disabled={busy} aria-label="סגירה">
              <Icon name="close" />
            </button>
          </div>
        </header>

        {/* ── סרגל המצב: רק מה ששייך למה שעושים עכשיו ─────────────────── */}
        {mode === 'organize' && (
          <div className="pdfw-bar">
            <button type="button" className="btn btn-sm" onClick={addSource} disabled={busy || addingSource}>
              {addingSource ? 'מוסיף…' : 'הוסף קובץ'}
            </button>
            <span className="pdfw-bar-sep" />
            <span className="pdfw-bar-hint">
              {picked.size > 0 ? `${picked.size} עמודים סומנו` : 'סמן עמודים כדי לחלץ או להסיר'}
            </span>
            {picked.size > 0 && (
              <>
                <button type="button" className="btn btn-sm" onClick={createFromSelection} disabled={busy}>
                  צור PDF מהנבחרים
                </button>
                <button type="button" className="btn btn-sm" disabled={busy}
                  onClick={() => {
                    const ids = new Set(picked);
                    commit(cur => ({
                      plan: removePages(cur.plan, ids),
                      annotations: cur.annotations.filter(a => !ids.has(a.pageId)),
                    }));
                    setPicked(new Set());
                  }}>הסר נבחרים</button>
                <button type="button" className="pdfw-quiet" onClick={() => setPicked(new Set())}>נקה סימון</button>
              </>
            )}
            <span className="pdfw-bar-grow" />
            <button type="button" className="pdfw-quiet" onClick={() => setSplitOpen(v => !v)}>
              פיצול וטווחים
            </button>
          </div>
        )}

        {splitOpen && mode === 'organize' && (
          <div className="pdfw-split">
            <label className="pdfw-field">
              <span>עמודים לקובץ חדש</span>
              <div className="pdfw-inline">
                <input className="inp" value={rangeText} placeholder="למשל 1-3, 7"
                  onChange={e => setRangeText(e.target.value)} />
                <button type="button" className="btn btn-sm" disabled={busy || !rangeText.trim()}
                  onClick={createFromRanges}>צור</button>
              </div>
            </label>
            <label className="pdfw-field">
              <span>פיצול לקבצים של</span>
              <div className="pdfw-inline">
                <input className="inp" type="number" min={1} value={everyN} style={{ width: 80 }}
                  onChange={e => setEveryN(e.target.value)} />
                <span className="pdfw-unit">עמודים</span>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={createSplit}>פצל</button>
              </div>
            </label>
          </div>
        )}

        {(mode === 'edit' || mode === 'sign') && (
          <div className="pdfw-bar">
            {mode === 'edit' ? (
              <>
                <ToolBtn t="select" cur={tool} set={setTool} label="בחירה והזזה" glyph="⬚" />
                <span className="pdfw-bar-sep" />
                <ToolBtn t="text" cur={tool} set={setTool} label="טקסט" glyph="A" />
                <ToolBtn t="highlight" cur={tool} set={setTool} label="הדגשה" glyph="▬" />
                {/* ‼ הסתרה היא כלי בפני עצמו ולא מלבן שצריך להלבין ביד:
                    גרירה אחת = ריבוע לבן אטום בלי מסגרת. */}
                <ToolBtn t="whiteout" cur={tool} set={setTool} label="הסתרה" glyph="▧" />
                <ToolBtn t="draw" cur={tool} set={setTool} label="ציור" glyph="✎" />
                <ToolBtn t="rectangle" cur={tool} set={setTool} label="מלבן" glyph="▭" />
                <ToolBtn t="circle" cur={tool} set={setTool} label="עיגול" glyph="◯" />
                <ToolBtn t="line" cur={tool} set={setTool} label="קו" glyph="╱" />
                <ToolBtn t="check" cur={tool} set={setTool} label="סימון נכון" glyph="✓" />
                <ToolBtn t="cross" cur={tool} set={setTool} label="סימון שגוי" glyph="✗" />
                <button type="button" className="pdfw-tool" title="תמונה" aria-label="תמונה"
                  onClick={() => pickImage(false)}>🖼</button>
                <span className="pdfw-bar-sep" />
                <span className="pdfw-colors">
                  {INK_COLORS.map(c => (
                    <button key={c} type="button" aria-label={`צבע ${c}`}
                      className={`pdfw-swatch${activeColor === c ? ' is-on' : ''}`}
                      style={{ background: c }}
                      onClick={() => {
                        if (tool === 'highlight') setHlColor(c); else setInk(c);
                        // ‼ על אובייקט שכולו מילוי (הדגשה/הסתרה) הצבע הראשי
                        // הוא המילוי; אחרת הוא צבע הקו או האותיות.
                        if (!selectedAnnObj) return;
                        const caps = capsOf(selectedAnnObj.kind);
                        commitPatch(selectedAnnObj.id,
                          caps.stroke || caps.text ? { color: c } : { fillColor: c });
                      }} />
                  ))}
                </span>
              </>
            ) : (
              <>
                <span className="pdfw-bar-hint">חתום למטה, או העלה חותמת - ואז גרור למקום על הדף.</span>
                <button type="button" className="btn btn-sm" onClick={() => pickImage(true)}>העלה חותמת</button>
              </>
            )}
            <span className="pdfw-bar-grow" />
            {pendingImage && <span className="pdfw-bar-hint">לחץ על הדף כדי להניח</span>}
            <span className="pdfw-zoom">
              <button type="button" aria-label="הקטן תצוגה" disabled={zoom <= 0.5}
                onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
              <button type="button" className="pdfw-zoom-val" title="חזרה להתאמה למסך"
                onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" aria-label="הגדל תצוגה" disabled={zoom >= 2}
                onClick={() => setZoom(z => Math.min(2, +(z + 0.25).toFixed(2)))}>+</button>
            </span>
          </div>
        )}

        {/* ── עיצוב הסימון הנבחר ───────────────────────────────────────
            ‼ השורה קיימת תמיד, גם כשאין בחירה. אם היא נפתחת רק בבחירה,
            הדף קופץ 47 פיקסלים בדיוק ברגע שמסיימים לצייר — ואז הידיות
            אינן מתחת לסמן, והמשך הגרירה נופל על מקום אחר. */}
        {(mode === 'edit' || mode === 'sign') && (
          selectedAnnObj ? (
            <PdfStyleBar
              ann={selectedAnnObj}
              onPatch={p => commitPatch(selectedAnnObj.id, p)}
              onLive={p => updateAnnotation(selectedAnnObj.id, p)}
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
              onEditText={() => setEditRequest({ id: selectedAnnObj.id, n: Date.now() })}
              onDelete={() => { removeAnnotation(selectedAnnObj.id); setSelectedAnn(null); }}
            />
          ) : (
            <div className="pdfe-style is-empty" dir="rtl">
              <span className="pdfe-style-hint">
                {tool === 'select'
                  ? 'לחץ על סימון כדי להזיז, לשנות גודל ולעצב אותו'
                  : 'גרור על הדף כדי ליצור - הסימון ייבחר מיד ואפשר יהיה לעצב אותו כאן'}
              </span>
            </div>
          )
        )}

        {/* ── גוף המשטח ───────────────────────────────────────────────── */}
        {mode === 'organize' ? (
          <div className="pdfw-pages">
            {plan.map((page, index) => {
              const meta = sourceById.get(page.sourceId);
              return (
                <PageCard
                  key={page.id}
                  page={page} index={index} total={plan.length}
                  tint={multiSource ? meta?.tint : undefined}
                  sourceLabel={multiSource ? meta?.source.label : undefined}
                  bytes={meta?.source.bytes}
                  narrow={narrow}
                  picked={picked.has(page.id)}
                  hasAnnotations={annotations.some(a => a.pageId === page.id)}
                  dragging={dragId === page.id}
                  dropTarget={overId === page.id && dragId !== null && dragId !== page.id}
                  disabled={busy}
                  onTogglePick={() => togglePick(page.id)}
                  onDragStart={() => setDragId(page.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={() => setOverId(page.id)}
                  onDrop={() => handleDrop(page.id)}
                  onRotate={() => commit(cur => ({ ...cur, plan: rotatePage(cur.plan, page.id, 1) }))}
                  onRemove={() => dropPage(page.id)}
                  onCrop={() => setCropFor(page.id)}
                  onEdit={() => { setEditPageId(page.id); setMode('edit'); }}
                  onNudge={d => nudge(page.id, d)}
                />
              );
            })}
            {plan.length === 0 && (
              <div className="pdfw-empty">הסרת את כל העמודים. החזר אחד לפחות כדי ליצור מסמך.</div>
            )}
          </div>
        ) : (
          <div className="pdfw-editwrap">
            <aside className="pdfw-strip" aria-label="עמודים">
              {plan.map((p, i) => (
                <button
                  key={p.id} type="button"
                  className={`pdfw-striprow${editPage?.id === p.id ? ' is-on' : ''}`}
                  onClick={() => { setEditPageId(p.id); setSelectedAnn(null); }}
                >
                  <span>{i + 1}</span>
                  {annotations.some(a => a.pageId === p.id) && <i className="pdfw-dot" />}
                </button>
              ))}
            </aside>
            <div className="pdfw-editmain">
              {editPage && sourceById.get(editPage.sourceId) && (
                <PdfPageEditor
                  key={editPage.id}
                  page={editPage}
                  bytes={sourceById.get(editPage.sourceId)!.source.bytes}
                  sourceRotation={sourceById.get(editPage.sourceId)!.source.rotations?.[editPage.sourceIndex] ?? 0}
                  annotations={annotations}
                  tool={mode === 'sign' ? (pendingImage ? 'image' : 'select') : tool}
                  color={activeColor}
                  pendingImage={pendingImage}
                  zoom={zoom}
                  selectedId={selectedAnn}
                  onSelect={setSelectedAnn}
                  onAdd={a => {
                    addAnnotation(a);
                    // ‼ צורה שנוצרה נבחרת מיד והכלי חוזר לבחירה — הידיות
                    // מופיעות באותה שנייה ואפשר לתפוס ולשנות. קודם הכלי נשאר
                    // חמוש: ניסיון לגעת בצורה יצר עוד אחת, והידיות לא הופיעו
                    // כלל. עיפרון ו-✓/✗ נשארים חמושים — אותם מניחים ברצף.
                    if (['rectangle', 'circle', 'line', 'highlight', 'whiteout', 'image'].includes(a.kind)) {
                      if (a.kind === 'image') setPendingImage(null);
                      setTool('select');
                      setSelectedAnn(a.id);
                    }
                  }}
                  onLiveUpdate={updateAnnotation}
                  onGestureStart={beginGesture}
                  onGestureEnd={endGesture}
                  editRequest={editRequest}
                  onTextDone={(id, kept) => {
                    setEditRequest(null);
                    if (kept) { setTool('select'); setSelectedAnn(id); }
                  }}
                  onRemove={removeAnnotation}
                />
              )}
              {mode === 'sign' && (
                <div className="pdfw-signpad">
                  <span className="pdfw-field-label">חתימה</span>
                  <SignaturePad value="" height={110} onChange={placeSignature} />
                  <span className="pdfw-bar-hint">החתימה תונח על הדף - אפשר לגרור ולשנות גודל.</span>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="pdfw-foot">
          <label className="pdfw-name">
            <span>שם הקובץ</span>
            <input className="inp" value={name} disabled={busy}
              onChange={e => setName(e.target.value)} placeholder="לדוגמה: דוח שנתי 2025" />
          </label>
          {error && <div className="pdfw-error">{error}</div>}
          <div className="pdfw-cta">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>ביטול</button>
            <button type="button" className="btn btn-primary" disabled={!canCreate} onClick={createSingle}>
              {busy ? 'יוצר…' : multiSource ? 'צור PDF מאוחד' : 'שמור PDF חדש'}
            </button>
          </div>
        </footer>
      </div>

      {cropPage && sourceById.get(cropPage.sourceId) && (
        <CropDialog
          page={cropPage}
          source={sourceById.get(cropPage.sourceId)!.source}
          onCancel={() => setCropFor(null)}
          onApply={crop => {
            const id = cropPage.id;
            commit(cur => ({ ...cur, plan: setPageCrop(cur.plan, id, crop) }));
            setCropFor(null);
          }}
        />
      )}

      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
        onChange={e => onImageChosen(e, false)} />
      <input ref={stampInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
        onChange={e => onImageChosen(e, true)} />
      <span hidden data-hist={histTick} />
    </div>
  );
}

function ToolBtn({ t, cur, set, label, glyph }: {
  t: EditTool; cur: EditTool; set: (t: EditTool) => void; label: string; glyph: string;
}) {
  return (
    <button
      type="button" title={label} aria-label={label} aria-pressed={cur === t}
      className={`pdfw-tool${cur === t ? ' is-on' : ''}`}
      onClick={() => set(t)}
    >{glyph}</button>
  );
}

// ─── חיתוך: בוחרים אזור ורואים מה יישאר ────────────────────────────────

function CropDialog({ page, source, onCancel, onApply }: {
  page: PlanPage;
  source: OrganizerSource;
  onCancel: () => void;
  onApply: (crop: { xPct: number; yPct: number; widthPct: number; heightPct: number } | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState(page.crop ?? { xPct: 0.08, yPct: 0.08, widthPct: 0.84, heightPct: 0.84 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadPdf(source.bytes);
      if (cancelled) { loaded.doc.destroy(); return; }
      if (canvasRef.current) await renderThumbnail(loaded.doc, page.sourceIndex, canvasRef.current, 700);
      loaded.doc.destroy();
    })();
    return () => { cancelled = true; };
  }, [source.bytes, page.sourceIndex]);

  function rel(e: { clientX: number; clientY: number }) {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box pdfw-cropbox" onClick={e => e.stopPropagation()}>
        <h3>חיתוך העמוד</h3>
        <div className="csub">גרור כדי לבחור מה יישאר. התוכן עצמו אינו נמחק - אפשר לבטל בכל שלב.</div>
        <div
          ref={boxRef} dir="ltr" className="pdfw-cropstage"
          onPointerDown={e => { drag.current = rel(e); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={e => {
            if (!drag.current) return;
            const p = rel(e);
            setRect({
              xPct: Math.min(drag.current.x, p.x), yPct: Math.min(drag.current.y, p.y),
              widthPct: Math.abs(p.x - drag.current.x), heightPct: Math.abs(p.y - drag.current.y),
            });
          }}
          onPointerUp={() => { drag.current = null; }}
        >
          <canvas ref={canvasRef} className="pdfw-cropcanvas" />
          <div className="pdfw-cropsel" style={{
            left: `${rect.xPct * 100}%`, top: `${rect.yPct * 100}%`,
            width: `${rect.widthPct * 100}%`, height: `${rect.heightPct * 100}%`,
          }} />
        </div>
        <div className="foot">
          <button type="button" className="btn btn-primary"
            disabled={rect.widthPct < 0.05 || rect.heightPct < 0.05}
            onClick={() => onApply(rect)}>החל חיתוך</button>
          <button type="button" className="btn" onClick={() => onApply(null)}>בטל חיתוך</button>
          <button type="button" className="btn" onClick={onCancel}>סגור</button>
        </div>
      </div>
    </div>
  );
}

// ─── כרטיס עמוד ────────────────────────────────────────────────────────

interface CardProps {
  page: PlanPage; index: number; total: number;
  tint?: string; sourceLabel?: string; bytes?: Uint8Array;
  narrow: boolean; picked: boolean; hasAnnotations: boolean;
  dragging: boolean; dropTarget: boolean; disabled: boolean;
  onTogglePick: () => void;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void;
  onRotate: () => void; onRemove: () => void; onCrop: () => void; onEdit: () => void;
  onNudge: (d: -1 | 1) => void;
}

function PageCard(p: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { root: null, rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || rendered || !p.bytes) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getSharedDoc(p.page.sourceId, p.bytes!);
        if (cancelled || !canvasRef.current) return;
        await withRenderSlot(async () => {
          if (cancelled || !canvasRef.current) return;
          await renderThumbnail(doc, p.page.sourceIndex, canvasRef.current, THUMB_MAX_EDGE);
        });
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) setRendered(true);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, rendered, p.bytes, p.page.sourceId, p.page.sourceIndex]);

  const quarter = p.page.rotation % 180 !== 0;

  return (
    <div
      ref={ref}
      className={[
        'pdfw-card',
        p.dragging ? 'is-dragging' : '',
        p.dropTarget ? 'is-drop' : '',
        p.picked ? 'is-picked' : '',
      ].filter(Boolean).join(' ')}
      draggable={!p.disabled}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.page.id); p.onDragStart(); }}
      onDragEnd={p.onDragEnd}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; p.onDragOver(); }}
      onDrop={e => { e.preventDefault(); p.onDrop(); }}
      tabIndex={0}
      role="group"
      aria-label={`עמוד ${p.index + 1} מתוך ${p.total}`}
      onKeyDown={e => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); p.onNudge(-1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); p.onNudge(1); }
      }}
    >
      <div className="pdfw-thumb">
        <div className={`pdfw-thumb-inner${quarter ? ' is-quarter' : ''}`}>
          <canvas ref={canvasRef} className="pdfw-canvas" style={{ transform: `rotate(${p.page.rotation}deg)` }} />
        </div>
        {!rendered && <span className="pdfw-loading" aria-hidden="true" />}
        {p.page.crop && <span className="pdfw-badge" title="העמוד חתוך">חתוך</span>}
        {p.hasAnnotations && <span className="pdfw-badge is-ink" title="יש סימונים על העמוד">ערוך</span>}

        <span className="pdfw-pick" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={p.picked} onChange={p.onTogglePick}
            aria-label={`סמן עמוד ${p.index + 1}`} />
        </span>

        <div className="pdfw-tools-float">
          <button type="button" title="סובב" aria-label={`סובב עמוד ${p.index + 1}`}
            disabled={p.disabled} onClick={p.onRotate}>↻</button>
          <button type="button" title="ערוך תוכן" aria-label={`ערוך עמוד ${p.index + 1}`}
            disabled={p.disabled} onClick={p.onEdit}>✎</button>
          <button type="button" title="חיתוך" aria-label={`חתוך עמוד ${p.index + 1}`}
            disabled={p.disabled} onClick={p.onCrop}>⌗</button>
          <button type="button" title="הסר" aria-label={`הסר עמוד ${p.index + 1}`}
            className="pdfw-tool-remove" disabled={p.disabled} onClick={p.onRemove}>✕</button>
        </div>

        {p.narrow && (
          <div className="pdfw-move">
            <button type="button" aria-label="הזז אחורה" disabled={p.disabled || p.index === 0}
              onClick={() => p.onNudge(-1)}>›</button>
            <button type="button" aria-label="הזז קדימה" disabled={p.disabled || p.index === p.total - 1}
              onClick={() => p.onNudge(1)}>‹</button>
          </div>
        )}
      </div>

      <div className="pdfw-meta">
        <span className="pdfw-num">{p.index + 1}</span>
        {p.tint && (
          <span className="pdfw-source" title={p.sourceLabel}>
            <i style={{ background: p.tint }} />
            {p.sourceLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── עזרים ─────────────────────────────────────────────────────────────

const THUMB_MAX_EDGE = 320;

/**
 * ‼ תקרה למספר הרינדורים שרצים יחד. בלי זה, מסמך בן מאות עמודים פותח
 * מאות בקשות ציור בבת אחת: הזיכרון מתמלא בקנבסים והעמודים שהמשתמש באמת
 * רואה נדחקים לסוף התור.
 */
const MAX_CONCURRENT_RENDERS = 3;
let activeRenders = 0;
const renderWaiting: (() => void)[] = [];

async function withRenderSlot(job: () => Promise<void>): Promise<void> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>(resolve => renderWaiting.push(resolve));
  }
  activeRenders++;
  try {
    await job();
  } finally {
    activeRenders--;
    renderWaiting.shift()?.();
  }
}

const docCache = new Map<string, Promise<PdfDocument>>();

function getSharedDoc(sourceId: string, bytes: Uint8Array): Promise<PdfDocument> {
  const hit = docCache.get(sourceId);
  if (hit) return hit;
  const promise = loadPdf(bytes).then(r => r.doc);
  docCache.set(sourceId, promise);
  return promise;
}

export function releaseOrganizerCache() {
  for (const p of docCache.values()) {
    p.then(doc => { try { doc.destroy(); } catch { /* כבר נסגר */ } }).catch(() => { /* לא נטען */ });
  }
  docCache.clear();
}

function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
