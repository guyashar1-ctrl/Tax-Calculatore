// ─── «הפקת דוחות משע״ם והעלאה» — מקטע ב«מס › עבודות לקוחות › כל העבודות» (16.10.2026) ───────────────
// הכרעת מיקום (גיא + הסשן המנהל, 16.10): כאן, ולא בדף הסיום של הקליטה ולא בדף הלקוח הציבורי.
// ‼ 31.10.2026 (גיא): שתי תיבות — «דוחות שנתיים» (IDOM) ו«הצהרות הון» = קובץ אחד עם ארבע הקבוצות (Copy, Copy Append,
//   Print Clipboard); קבוצה שלא בקובץ נרשמת «נבדקה וריקה» (buildBatch). הקובץ קובע את התיבה; כל הקבצים — אצווה אחת.
//   תיבה «עדכנית» = העלאה שלא בוטלה מ-14 הימים האחרונים.
// ‼ ארבעה חלקים, רשימה אחת: (1) תיבות + «איך מפיקים» לכל תיבה, (2) העלאת PDF אחד או כמה → נכתב לתיקים מיד, עם סיכום,
//   (3) חובות פתוחות בלי בקשה — «חייב · טרם נפתח» עם «פתח בקשה» (או ShaamOpenRows ברשימת העבודות עצמה, hideOpenRows),
//   (4) לבדיקה, היסטוריה וקבצים שנקלטו — מקופלים.
// ‼ 305 (החלטות גיא 25.10.2026): אין שלב אישור. מזוהים נכתבים לתיקים מיד; לא ודאי — «לבדיקה», בלי כתיבה לתיק;
//   חובת דוח שנתי פתוחה חדשה פותחת בקשה פנימית לבד (בשרת, אותה פונקציה כמו «פתח בקשה»: לא בדף, בלי מייל).
//   כל העלאה ניתנת לביטול («ביטול ההעלאה») — מה שאדם כבר עבד עליו נשאר, והסיכום אומר את זה.
//   «פתח בקשה» נשאר רק למה שעוד צריך: הצהרת הון (יום ההצהרה נבחר במפורש), שורה אחרי בדיקה, או פתיחה שנכשלה.
// ‼ הקובץ המקורי (רשימת לקוחות רבים) עולה לדלי הפרטי של המשרד — לא לתיק לקוח ולא לדף האישי.

import { useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import { ArrowChain } from '../../components/ui/ArrowPath';
import { readShaamFile } from './parse/readPdf';
import { buildBatch, coverageText, fileVerdict, type Batch, type Coverage, type ParsedFile } from './parse/batch';
import { WEALTH_GROUP_LABEL, type WealthGroup } from './parse/parseShaam';
import { confirmGroupEmpty, requestCopy, resolveObligation, saveImport, undoSource, uploadSource, type ImportResult } from './api';
import { COPY_TEXT, MATCH_TEXT, sourceShort, REVIEW_TEXT, copyState, dmy, importSummaryParts, mergeUndo, needsRequest, obligationDueText, obligationTitle, sourceText, stateLine, undoSummaryText, type Obligation, type PlanRow, type SourceSummary, type UndoSummary } from './model';
import { useObligations } from './useObligations';
import { isGmf154Source } from './fromGmf154';
import ShaamGuide from './ShaamGuide';
import OpenRequestsDialog from './OpenRequestsDialog';
import './shaamFiling.css';

export interface ShaamFilingPanelProps {
  clients: Client[];
  /** פתיחת «בקשות» של הלקוח, ממוקד לבקשה (אותו קישור כמו שורות «כל העבודות»). */
  onOpenRequests?: (clientId: string, stepId: string) => void;
  /** אחרי שנפתחו בקשות — רענון רשימת העבודות. */
  onChanged?: () => void;
  /** כששורות «חייב · טרם נפתח» מוצגות בתוך רשימת העבודות עצמה (ShaamOpenRows) — לא להציג אותן כאן שוב. */
  hideOpenRows?: boolean;
}

const CHANGE_TEXT: Record<PlanRow['change'], string> = { new: 'חדש', updated: 'עודכן', unchanged: 'ללא שינוי', older: 'ישן מהקיים — לא עודכן', duplicate: 'כפול באצווה', invalid: 'לא נקרא' };
const nameOfClient = (c?: Client) => (c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח' : '');

type Phase = 'idle' | 'reading' | 'saving' | 'saved';

/** תיבה = קובץ אחד משע״ם: הדוחות השנתיים (IDOM), או הצהרות הון — ארבע הקבוצות בקובץ אחד (AHZM, Copy + Copy Append). */
type BoxKey = 'annual' | 'wealth';
const BOXES: BoxKey[] = ['annual', 'wealth'];
const WEALTH_GROUPS: WealthGroup[] = ['unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine'];
const GROUP_SHORT: Record<WealthGroup, string> = {
  unfiled_no_fine: 'לא הגישו · בלי קנס',
  unfiled_fine: 'לא הגישו · עם קנס',
  filed_fine: 'הגישו · עם קנס',
  filed_no_fine: 'הגישו · בלי קנס',
};
const boxTitle = (k: BoxKey) => (k === 'annual' ? 'דוחות שנתיים' : 'הצהרות הון');
const howPath = (k: BoxKey, year: number) => (k === 'annual'
  ? ['IDOM', 'אפשרות 4', 'סוג רשימה 1', `שנת מס ${year}`, 'כל המיוצגים = 1', 'Enter', 'PF8 עד העמוד האחרון']
  : ['AHZM', 'אזור 2: 1 ליד הקבוצה הראשונה', 'Enter', 'Copy', 'הקבוצה הבאה', 'Copy Append', 'כך עד הקבוצה הרביעית', 'Print Clipboard', 'שמירה כ-PDF']);
const sourceDay = (s: SourceSummary) => s.producedOn ?? s.uploadedAt.slice(0, 10);
/** העלאה = קובץ אחד: כל המקורות שנוצרו ממנו חולקים את ה-sha שלו (גם קבוצות ריקות); אישור ידני — לפי הדקה. */
const uploadOf = (s: SourceSummary) => (s.sha256 ? s.sha256.split('#')[0] : `manual@${s.uploadedAt.slice(0, 16)}`);
const isUndone = (s: SourceSummary) => !!s.undoneAt && !s.canUndo;
const rowsOf = (s: SourceSummary) => (s.pages ?? []).reduce((n, p) => n + (p.rows ?? 0), 0);
interface Upload { kind: BoxKey; day: string; at: string; sources: SourceSummary[] }

export default function ShaamFilingPanel({ clients, onOpenRequests, onChanged, hideOpenRows }: ShaamFilingPanelProps) {
  const { obligations, sources, err, load } = useObligations();
  // ‼ קריאות 154 מיישור הקו הן מקור בלי קובץ — לא «קובץ שנקלט».
  const uploaded = sources.filter(s => !isGmf154Source(s));
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  /** פאנל אחד מתחת לתיבות: «איך מפיקים», «הכול ריק בשע״ם» או «ביטול» — של תיבה אחת. */
  const [panel, setPanel] = useState<{ box: BoxKey; kind: 'how' | 'empty' | 'undo'; sourceIds?: string[] } | null>(null);
  const [shots, setShots] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ name: string; done: number; total: number; file: number; files: number } | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const raw = useRef(new Map<string, File>());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [opening, setOpening] = useState<Obligation[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPhase('idle'); setFiles([]); raw.current.clear(); setBatch(null); setCoverage([]); setResult(null); setError(null); };

  // ‼ אין «שמירה לתיקים»: הקריאה נגמרת ⇒ הקובץ לדלי הפרטי ⇒ shaam_filing_import. השרת מחליט מה נכתב ומה «לבדיקה».
  const save = async (b: Batch, parsed: ParsedFile[]) => {
    setPhase('saving'); setError(null);
    try {
      const withPaths: Batch = { ...b, sources: b.sources.map(s => ({ ...s })) };
      for (const f of parsed) {
        if (!f.sha256 || f.error) continue;
        const file = raw.current.get(f.key);
        if (!file) continue;
        // אותו קובץ כבר שמור אצל המשרד — לא מעלים שוב (הנתיב נקבע לפי התוכן)
        const known = sources.find(s => s.sha256 === f.sha256 && s.hasFile);
        const u = known ? { path: undefined } : await uploadSource(file, f.sha256);
        if ('error' in u && u.error) throw new Error(`שמירת הקובץ «${f.fileName}» נכשלה (${u.error}) — לא נקלט דבר`);
        if (u.path) for (const s of withPaths.sources) if (s.key === f.key || s.key.startsWith(`${f.key}#`)) s.storagePath = u.path;
      }
      const r = await saveImport(withPaths);
      if (!r.ok) throw new Error(r.error ?? 'save_failed');
      setResult(r);
      setPhase('saved');
      await load();
      onChanged?.();
    } catch (e) { setError(`הקליטה נכשלה: ${(e as Error).message}`); setPhase('saved'); }
  };

  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    setError(null); setResult(null); setPhase('reading');
    raw.current.clear();
    const next: ParsedFile[] = [];
    for (const [k, f] of arr.entries()) {
      setProgress({ name: f.name, done: 0, total: 0, file: k + 1, files: arr.length });
      const pf = await readShaamFile(f, (done, total) => setProgress({ name: f.name, done, total, file: k + 1, files: arr.length }));
      if (next.some(x => x.key === pf.key)) continue;           // אותו קובץ פעמיים — פעם אחת
      raw.current.set(pf.key, f);
      next.push(pf);
    }
    setProgress(null);
    setFiles(next);
    const b = buildBatch(next);
    setBatch(b.batch); setCoverage(b.coverage);
    if (b.batch.rows.length || b.batch.sources.some(s => s.status === 'empty_confirmed')) await save(b.batch, next);
    else setPhase('saved');
  };

  const verdicts = files.map(fileVerdict);
  const plan = result?.plan ?? [];
  // תיבה עדכנית = העלאה (קובץ) שלא בוטלה, מ-14 הימים האחרונים. ‼ קבוצת הון שלא בקובץ נרשמה בהעלאה «נבדקה וריקה» (31.10).
  const recentCut = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const uploads = new Map<string, Upload>();
  for (const s of uploaded) {
    const id = `${s.kind}:${uploadOf(s)}`;
    let u = uploads.get(id);
    if (!u) uploads.set(id, u = { kind: s.kind, day: sourceDay(s), at: s.uploadedAt, sources: [] });
    u.sources.push(s);
    if (sourceDay(s) > u.day) u.day = sourceDay(s);
    if (s.uploadedAt > u.at) u.at = s.uploadedAt;
  }
  // ‼ ביטול של קבוצה אחת מהקובץ = הקובץ כולו בוטל (גם הקבוצות הריקות שנרשמו ממנו)
  const latest = (k: BoxKey) => [...uploads.values()].filter(u => u.kind === k && !u.sources.some(isUndone))
    .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at))[0] as Upload | undefined;
  const fresh = (k: BoxKey) => { const u = latest(k); return u && u.day >= recentCut ? u : undefined; };
  const annualYear = Math.max(0, ...(fresh('annual')?.sources.map(s => s.taxYear ?? 0) ?? [])) || new Date().getFullYear() - 1;
  const doneCount = BOXES.filter(k => fresh(k)).length;
  const busy = phase === 'reading' || phase === 'saving';
  const pick = () => inputRef.current?.click();
  // רק עמודים חסרים / כפולים / סותרים — המצב של כל רשימה כבר בתיבה שלה
  const coverageIssues = coverage.filter(c => c.missing.length || c.duplicates.length || c.conflicts.length);
  const batchSources = Object.values(result?.sources ?? {});
  const rowView = (p: PlanRow) => {
    const r = batch?.rows[p.i - 1];
    const who = (p.clientId ? nameOfClient(byId.get(p.clientId)) : '') || r?.name || '';
    const src = r ? batch?.sources.find(s => s.key === r.sourceKey) : undefined;
    return { r, who, kind: src?.kind ?? 'annual', group: src?.group };
  };

  const open = (obligations ?? []).filter(needsRequest);
  const review = (obligations ?? []).filter(o => o.state === 'needs_review');
  const history = (obligations ?? []).filter(o => o.state === 'history' || o.state === 'filed_per_shaam');

  const box = (k: BoxKey) => {
    const u = fresh(k), last = latest(k);
    const isNew = !!u && u.sources.some(s => batchSources.includes(s.id));
    const kind = k === 'annual' ? String(annualYear) : 'ארבע הקבוצות בקובץ אחד';
    const state = u ? `עודכן ${dmy(u.day)}` : last ? `עודכן לאחרונה ${dmy(last.day)}` : 'עוד לא הועלה';
    // הון: מה נמצא בכל קבוצה בקובץ האחרון — קבוצה עם שורות ומספרן, והשאר «ריקות»
    const groups = k === 'wealth' && u ? WEALTH_GROUPS.map(g => ({ g, s: u.sources.find(s => s.group === g) })).filter(x => x.s) : [];
    const withRows = groups.filter(x => x.s!.status !== 'empty_confirmed' && rowsOf(x.s!) > 0);
    const empties = groups.length - withRows.length;
    const undoIds = u?.sources.filter(s => s.canUndo).map(s => s.id) ?? [];
    const on = (kind2: 'how' | 'empty' | 'undo') => setPanel(panel?.box === k && panel.kind === kind2 ? null : { box: k, kind: kind2, sourceIds: undoIds });
    return (
      <li key={k} className={`shf-box${u ? ' is-done' : ''}${isNew ? ' is-new' : ''}`} data-sf-box={k} data-sf-box-state={u ? 'done' : 'missing'}>
        <button type="button" className="shf-box-main" disabled={busy} onClick={pick} aria-label={`העלאת PDF · ${boxTitle(k)} · ${kind} · ${state}`}>
          <span className="shf-box-ic" aria-hidden="true">{u ? '✓' : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>}</span>
          <span className="shf-box-t"><b>{boxTitle(k)}</b><span>{kind}</span></span>
          <span className="shf-box-st">{state}</span>
          {groups.length > 0 && (
            <span className="shf-box-groups" data-sf-box-groups>
              {withRows.map(x => <span key={x.g}>{GROUP_SHORT[x.g]} · {rowsOf(x.s!)}</span>)}
              {empties > 0 && <span>{empties === 1 ? 'קבוצה אחת ריקה' : `${empties} קבוצות ריקות`}</span>}
            </span>
          )}
        </button>
        <span className="shf-box-acts">
          {!u && <button type="button" className="shf-link" aria-expanded={panel?.box === k && panel.kind === 'how'} onClick={() => on('how')} data-sf-how-open={k}>איך מפיקים</button>}
          {!u && k === 'wealth' && <button type="button" className="shf-link" onClick={() => on('empty')} data-sf-empty-open={k}>הכול ריק בשע״ם</button>}
          {undoIds.length > 0 && <button type="button" className="shf-link" onClick={() => on('undo')} data-sf-box-undo={k}>ביטול</button>}
        </span>
      </li>
    );
  };
  const panelBox = panel?.box;

  return (
    <section className={`shf-panel${drag ? ' is-drag' : ''}`} aria-labelledby="shf-h" data-shaam-filing-panel
      onDragOver={e => { if (busy) return; e.preventDefault(); setDrag(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!busy) void addFiles(e.dataTransfer.files); }} data-sf-drop>
      <header className="shf-head">
        <div>
          <h3 id="shf-h">הפקת דוחות משע״ם והעלאה</h3>
          <p className="shf-lead" data-sf-count>{doneCount === BOXES.length ? 'הכול עדכני' : <><b>{doneCount} מתוך {BOXES.length}</b> קבצים · גוררים לכאן, והתיקים מתעדכנים לבד</>}</p>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} data-sf-file-input />
      </header>

      <ul className="shf-boxes" aria-label="קבצים משע״ם">{BOXES.map(box)}</ul>

      {panel && panelBox && (
        <div className="shf-how" data-sf-panel={panel.kind}>
          <div className="shf-how-top">
            <b>{boxTitle(panelBox)}{panelBox === 'annual' ? ` · ${annualYear}` : ''}</b>
            <button type="button" className="shf-link" onClick={() => setPanel(null)}>סגירה</button>
          </div>
          {panel.kind === 'how' && <>
            <ArrowChain steps={howPath(panelBox, annualYear)} />
            {panelBox === 'wealth' && <small className="shf-muted">קבוצה שמציגה «אין תיקים שבקשת» — מדלגים. היא תיחשב ריקה.</small>}
            <button type="button" className="shf-link shf-how-shots" aria-expanded={shots} onClick={() => setShots(!shots)} data-sf-guide-toggle>{shots ? 'הסתרת הצילומים' : 'מדריך עם צילומים'}</button>
            {shots && <ShaamGuide key={panelBox} initial={panelBox} />}
          </>}
          {panel.kind === 'empty' && <EmptyAll onDone={() => { setPanel(null); void load(); }} onCancel={() => setPanel(null)} />}
          {/* המקורות נשמרים בפתיחה — אחרי הביטול התיבה כבר לא עדכנית, והסיכום צריך להישאר */}
          {panel.kind === 'undo' && panel.sourceIds?.length ? <UndoUpload key={panel.sourceIds.join()} sourceIds={panel.sourceIds} asking onCancel={() => setPanel(null)} onDone={() => { void load(); onChanged?.(); }} /> : null}
        </div>
      )}

      {busy && (
        <div className="shf-progress" role="status" data-sf-progress>
          {phase === 'saving' ? 'כותב לתיקים…' : progress ? <>קורא {progress.files > 1 ? `קובץ ${progress.file} מתוך ${progress.files} · ` : ''}«{progress.name}»{progress.total ? ` · עמוד ${progress.done} מתוך ${progress.total}` : '…'}</> : 'קורא…'}
          {phase === 'reading' && progress && <span className="shf-bar"><i style={{ inlineSize: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} /></span>}
        </div>
      )}

      {error && (
        <div className="shf-err" role="alert" data-sf-error>{error}{' '}
          {batch && <button type="button" className="shf-link" onClick={() => void save(batch, files)}>נסה שוב</button>}
        </div>
      )}

      {phase === 'saved' && (
        <div className="shf-review" data-sf-result>
          {result?.summary && (
            <div className="shf-ok" role="status" data-sf-saved>
              <span className="shf-summary">{importSummaryParts(result.summary).map((t, k) => <span key={k} className="shf-summary-part">{t}</span>)}</span>
              <span className="shf-inline">
                {batchSources.length > 0 && <UndoUpload sourceIds={batchSources} onDone={() => { void load(); onChanged?.(); }} />}
                <button type="button" className="shf-link" onClick={reset}>סגירה</button>
              </span>
            </div>
          )}
          {!result && !error && (
            <p className="shf-muted">{files.length ? 'אין בקבצים שורות שאפשר לקלוט.' : 'לא נקרא אף קובץ.'} <button type="button" className="shf-link" onClick={reset}>סגירה</button></p>
          )}
          {/* קובץ שנקרא בלי בעיה כבר מופיע בתיבה שלו — כאן רק מה שצריך תשומת לב */}
          {verdicts.some(v => v.tone !== 'ok') && (
            <ul className="shf-files">
              {verdicts.filter(v => v.tone !== 'ok').map(v => (
                <li key={v.key} className={`shf-file is-${v.tone}`} data-sf-file={v.tone}>
                  <div className="shf-file-main">
                    <b dir="auto">{v.fileName}</b>
                    <span>{v.label}</span>
                    {v.messages.map((m, k) => <small key={k}>{m}</small>)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {coverageIssues.length > 0 && (
            <div className="shf-coverage" data-sf-coverage>
              <h4>עמודים</h4>
              <ul>{coverageIssues.map(c => <li key={c.listKey}><b>{c.label}</b> — {coverageText(c)}{c.producedOn ? ` · הופקה ${dmy(c.producedOn)}` : ''}</li>)}</ul>
            </div>
          )}

          {plan.length > 0 && (
            <details className="shf-details" data-sf-plan-details>
              <summary><b>פירוט השורות</b> <span className="shf-chip">{plan.length}</span></summary>
              <ul className="shf-plan" aria-label="מה נקלט">
                {plan.map(p => {
                  const v = rowView(p);
                  if (!v.r) return null;
                  const st = p.state === 'needs_review' ? 'לבדיקה' : p.shaamStatus === 'open' ? 'חייב' : p.shaamStatus === 'filed' ? 'הוגש' : 'לידיעה';
                  return (
                    <li key={p.i} className={`shf-plan-row${p.state === 'needs_review' || p.change === 'invalid' ? ' is-review' : ''}`} data-sf-plan={p.change} data-sf-plan-state={p.state ?? ''}>
                      <span className="shf-plan-who"><b>{v.who || '—'}</b><small dir="ltr">{v.r.fileNumber}</small></span>
                      <span className="shf-plan-what">{obligationTitle({ kind: v.kind, yearShown: v.r.yearShown })} · {obligationDueText({ state: p.state ?? 'open', shaamStatus: p.shaamStatus ?? 'context', legalDue: v.r.legalDue, filedOn: v.r.filedOn, noAssessment: v.r.noAssessment })}</span>
                      <span className="shf-plan-st">
                        <span className={`shf-chip${st === 'לבדיקה' ? ' amber' : st === 'חייב' ? ' blue' : ''}`}>{st}</span>
                        <small>{CHANGE_TEXT[p.change]}{p.reason ? ` · ${REVIEW_TEXT[p.reason] ?? p.reason}` : p.tier ? ` · ${MATCH_TEXT[p.tier] ?? ''}` : ''}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}

      {err && <div className="shf-err" role="alert">לא ניתן לטעון את החובות: {err} <button type="button" className="shf-link" onClick={() => void load()}>נסה שוב</button></div>}

      {!hideOpenRows && obligations && (
        <ShaamOpenRows obligations={open} clients={clients} onOpen={setOpening} onOpenRequests={onOpenRequests} />
      )}

      {review.length > 0 && (
        <details className="shf-details" open data-sf-review-list>
          <summary><b>לבדיקה</b> <span className="shf-chip amber">{review.length}</span><span className="shf-muted">לא נכתבו לתיק עד שמכריעים</span></summary>
          <ul className="shf-rows">{review.map(o => <ReviewRow key={o.id} o={o} clients={clients} onDone={() => void load()} />)}</ul>
        </details>
      )}

      {history.length > 0 && (
        <details className="shf-details" data-sf-history>
          <summary><b>הוגשו לפי שע״ם</b> <span className="shf-chip">{history.length}</span><span className="shf-muted">היסטוריה ועותקים</span></summary>
          <ul className="shf-rows">{history.map(o => <HistoryRow key={o.id} o={o} onOpenRequests={onOpenRequests} onDone={() => void load()} />)}</ul>
        </details>
      )}

      {uploaded.length > 0 && (
        <details className="shf-details" data-sf-sources>
          <summary><b>קבצים שנקלטו</b> <span className="shf-chip">{uploaded.length}</span></summary>
          <ul className="shf-rows">{uploaded.map(s => (
            <li key={s.id} className={`shf-row${s.undoneAt && !s.canUndo ? ' is-undone' : ''}`} data-sf-source={s.id}>
              <span className="shf-row-main"><b dir="auto">{s.fileName}</b>
                <small>{s.kind === 'annual' ? `דוחות שנתיים${s.taxYear ? ` ${s.taxYear}` : ''}` : `הצהרות הון · ${s.group ? WEALTH_GROUP_LABEL[s.group] : ''}`}{s.producedOn ? ` · הופקה ${dmy(s.producedOn)}` : ''} · נקלט {dmy(s.uploadedAt)}{s.status === 'empty_confirmed' ? ' · נבדקה וריקה' : ''}{s.method === 'manual' ? ' · אישור ידני' : ''}{s.note ? ` · ${s.note}` : ''}</small>
                {s.undoneAt && !s.canUndo && <small className="shf-muted" data-sf-undone>{s.undo ? undoSummaryText(s.undo) : 'בוטלה'} · {dmy(s.undoneAt)}</small>}
              </span>
              {s.canUndo && <span className="shf-row-act"><UndoUpload sourceIds={[s.id]} onDone={() => { void load(); onChanged?.(); }} /></span>}
            </li>
          ))}</ul>
        </details>
      )}

      {opening && (
        <OpenRequestsDialog obligations={opening} clients={clients} onClose={() => { setOpening(null); void load(); }}
          onDone={() => { void load(); onChanged?.(); }} />
      )}
    </section>
  );
}

/**
 * «ביטול ההעלאה» — לכל מקור (או לכל הקבצים של העלאה אחת). ‼ שאלה אחת לפני: מה יימחק ומה נשאר.
 * השרת מחליט (undo_shaam_filing_source); כאן רק הסיכום שהוא מחזיר.
 */
function UndoUpload({ sourceIds, onDone, asking, onCancel }: { sourceIds: string[]; onDone: () => void; /** נפתח ישר בשאלה («ביטול» בתיבה) */ asking?: boolean; onCancel?: () => void }) {
  const [state, setState] = useState<'idle' | 'asking' | 'busy'>(asking ? 'asking' : 'idle');
  const [done, setDone] = useState<UndoSummary | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setState('busy'); setMsg(null);
    const out: UndoSummary[] = [];
    try {
      for (const id of sourceIds) {
        const r = await undoSource(id);
        if (!r.ok) { setMsg(r.error === 'not_recorded' ? 'העלאה מלפני 26.10 — לא נרשם מה נכתב ממנה, ולכן אי אפשר לבטל אותה' : `הביטול נכשל (${r.error})`); continue; }
        const u = (r.already ? r.summary : r) as UndoSummary | undefined;
        if (u) out.push(u);
      }
    } catch (e) { setMsg(`הביטול נכשל (${(e as Error).message})`); }
    setState('idle');
    if (out.length) { setDone(mergeUndo(out)); onDone(); }
  };
  if (done) return <span className="shf-chip" role="status" data-sf-undo-result>{undoSummaryText(done)}</span>;
  return (
    <span className="shf-inline" data-sf-undo>
      {state === 'idle' && <button type="button" className="shf-link" onClick={() => setState('asking')} data-sf-undo-ask>ביטול ההעלאה</button>}
      {state === 'asking' && (
        <>
          <span>מה שנכתב מהקובץ יימחק או יחזור לקודם, ובקשות שנפתחו ממנו ועוד לא נגעו בהן — יבוטלו.</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void run()} data-sf-undo-confirm>כן, לבטל</button>
          <button type="button" className="shf-link" onClick={() => (onCancel ? onCancel() : setState('idle'))}>לא</button>
        </>
      )}
      {state === 'busy' && <span className="shf-muted">מבטל…</span>}
      {msg && <small className="shf-warn">{msg}</small>}
    </span>
  );
}

/** שורות «חייב · טרם נפתח» — לשילוב ברשימת העבודות, או בתוך המקטע. */
export function ShaamOpenRows({ obligations, clients, onOpen, onOpenRequests }: { obligations: Obligation[]; clients: Client[]; onOpen: (o: Obligation[]) => void; onOpenRequests?: (clientId: string, stepId: string) => void }) {
  const byId = new Map(clients.map(c => [c.id, c]));
  if (!obligations.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="shf-open" data-sf-open-rows>
      <div className="shf-open-top">
        <h4>חייבים לפי שע״ם — טרם נפתחה בקשה <span className="shf-chip blue">{obligations.length}</span></h4>
        {obligations.length > 1 && <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpen(obligations)} data-sf-open-all>פתח בקשות לכולם ({obligations.length})</button>}
      </div>
      <ul className="shf-rows">
        {obligations.map(o => {
          const late = o.legalDue && o.legalDue < today;
          return (
            <li key={o.id} className={`shf-row shf-work-row${late ? ' is-overdue' : ''}`} data-sf-open-row-item={o.kind}>
              <span className="shf-row-main">
                <b>{nameOfClient(byId.get(o.clientId ?? '')) || o.clientName || 'לקוח'}{o.role === 'spouse' ? ' · בן/בת הזוג' : ''}</b>
                <small>{obligationTitle(o)}</small>
              </span>
              <span className="shf-row-state" title={sourceText(o)}><span className="shf-chip blue">{stateLine(o)}</span><small>{sourceShort(o)}{o.fine ? ' · חייב בקנס (סימון בשע״ם)' : ''}</small></span>
              <span className={`shf-row-due${late ? ' is-late' : ''}`}><b>{o.legalDue ? dmy(o.legalDue) : 'מועד לא ידוע'}</b><small>{o.legalDue ? 'מועד לפי שע״ם' : ''}</small></span>
              <span className="shf-row-act">
                {o.stepId && onOpenRequests && o.clientId ? <button type="button" className="shf-link" onClick={() => onOpenRequests(o.clientId!, o.stepId!)}>לבקשה ←</button> : null}
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onOpen([o])} data-sf-open-one={o.id}>פתח בקשה</button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** «הכול ריק בשע״ם» — אין מה להעתיק: שע״ם הציג «אין תיקים שבקשת» בכל ארבע הקבוצות. רק אחרי שאלה מפורשת. */
function EmptyAll({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    const failed: string[] = [];
    for (const g of WEALTH_GROUPS) {
      const r = await confirmGroupEmpty(g, 'אושר בחלון «עדכון משע״ם» — כל ארבע הקבוצות ריקות').catch(e => ({ ok: false, error: (e as Error).message }));
      if (!r.ok) failed.push(WEALTH_GROUP_LABEL[g]);
    }
    setBusy(false);
    if (!failed.length) onDone(); else setMsg(`לא נרשם: ${failed.join(', ')}`);
  };
  return (
    <span className="shf-inline" data-sf-empty>
      <span>שע״ם הציג «אין תיקים שבקשת» בכל ארבע הקבוצות?</span>
      <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void run()} data-sf-empty-confirm>{busy ? 'רושם…' : 'כן, נרשום'}</button>
      <button type="button" className="shf-link" disabled={busy} onClick={onCancel}>לא</button>
      {msg && <small className="shf-warn">{msg}</small>}
    </span>
  );
}

function ReviewRow({ o, clients, onDone }: { o: Obligation; clients: Client[]; onDone: () => void }) {
  const [pick, setPick] = useState('');
  const [role, setRole] = useState<'client' | 'spouse'>(o.matchKind === 'spouse_id' ? 'spouse' : 'client');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cands = (o.candidates ?? []).map(id => clients.find(c => c.id === id)).filter(Boolean) as Client[];
  const found = q.trim().length >= 2 ? clients.filter(c => nameOfClient(c).includes(q.trim()) || (c.idNumber ?? '').includes(q.trim())).slice(0, 8) : [];
  const options = [...cands, ...found.filter(c => !cands.includes(c))];
  const act = async (clientId: string | null) => {
    setBusy(true); setMsg(null);
    const r = await resolveObligation(o.id, clientId, role).catch(e => ({ ok: false, error: (e as Error).message }));
    setBusy(false);
    if (r.ok) onDone(); else setMsg(r.error === 'parse_problem' ? 'השורה לא נקראה במלואה — העלו קובץ תקין' : `נכשל (${r.error})`);
  };
  return (
    <li className="shf-row shf-review-row" data-sf-review-row={o.reason ?? ''}>
      <span className="shf-row-main">
        <b>{o.name ?? '—'} <small dir="ltr">{o.fileNumber}</small></b>
        <small>{obligationTitle(o)} · {obligationDueText(o)}</small>
        <small className="shf-warn">{REVIEW_TEXT[o.reason ?? ''] ?? 'לבדיקה'}</small>
      </span>
      {o.reason !== 'parse' && (
        <span className="shf-resolve">
          <input type="search" value={q} placeholder="חיפוש כרטיס (שם או ת.ז.)" onChange={e => setQ(e.target.value)} aria-label="חיפוש כרטיס" />
          <select value={pick} onChange={e => setPick(e.target.value)} aria-label="לאיזה כרטיס">
            <option value="">{options.length ? 'בחירת כרטיס…' : 'אין התאמות — חפשו'}</option>
            {options.map(c => <option key={c.id} value={c.id}>{nameOfClient(c)}{c.idNumber ? ` · ${c.idNumber}` : ''}</option>)}
          </select>
          <select value={role} onChange={e => setRole(e.target.value as 'client' | 'spouse')} aria-label="של מי">
            <option value="client">של הלקוח</option><option value="spouse">של בן/בת הזוג</option>
          </select>
          <button type="button" className="btn btn-sm btn-secondary" disabled={!pick || busy} onClick={() => void act(pick)}>שייך לתיק</button>
          <button type="button" className="shf-link" disabled={busy} onClick={() => void act(null)}>לא שלנו</button>
        </span>
      )}
      {msg && <small className="shf-warn">{msg}</small>}
    </li>
  );
}

export function HistoryRow({ o, onOpenRequests, onDone, showClient = true }: { o: Obligation; onOpenRequests?: (clientId: string, stepId: string) => void; onDone: () => void; showClient?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cs = copyState(o);
  const ask = async () => {
    setBusy(true); setMsg(null);
    const r = await requestCopy(o.id).catch(e => ({ ok: false, error: (e as Error).message, stepId: undefined }));
    setBusy(false);
    if (r.ok) { onDone(); setMsg('נפתחה בקשת עותק (טיוטה — לא נשלחה ללקוח)'); } else setMsg(`נכשל (${r.error})`);
  };
  return (
    <li className="shf-row" data-sf-history-row={cs ?? ''}>
      <span className="shf-row-main">
        {showClient && <b>{o.clientName ?? o.name ?? '—'}{o.role === 'spouse' ? ' · בן/בת הזוג' : ''}</b>}
        <small>{obligationTitle(o)} · {obligationDueText(o)}{o.fine ? ' · חייב בקנס (סימון בשע״ם)' : ''}</small>
        <small className="shf-muted">{sourceText(o)}</small>
      </span>
      <span className="shf-row-act">
        {cs && <span className={`shf-chip${cs === 'in_office' || cs === 'received' ? ' green' : cs === 'requested' ? ' blue' : ''}`}>{COPY_TEXT[cs]}</span>}
        {cs === 'missing' && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void ask()} data-sf-copy={o.id}>בקש עותק</button>}
        {cs === 'requested' && o.copyStepId && o.clientId && onOpenRequests && <button type="button" className="shf-link" onClick={() => onOpenRequests(o.clientId!, o.copyStepId!)}>לבקשת העותק ←</button>}
        {o.state === 'filed_per_shaam' && o.stepId && o.clientId && onOpenRequests && <button type="button" className="shf-link" onClick={() => onOpenRequests(o.clientId!, o.stepId!)}>לבקשה ←</button>}
      </span>
      {msg && <small className="shf-muted">{msg}</small>}
    </li>
  );
}

