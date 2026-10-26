// ─── «הפקת דוחות משע״ם והעלאה» — מקטע ב«מס › עבודות לקוחות › כל העבודות» (16.10.2026) ───────────────
// הכרעת מיקום (גיא + הסשן המנהל, 16.10): כאן, ולא בדף הסיום של הקליטה ולא בדף הלקוח הציבורי.
// ‼ ארבעה חלקים, רשימה אחת: (1) מה להפיק + מדריך מסומן, (2) העלאת PDF אחד או כמה → נכתב לתיקים מיד, עם סיכום,
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
import { buildBatch, coverageText, fileVerdict, uncheckedWealthGroups, type Batch, type Coverage, type ParsedFile } from './parse/batch';
import { WEALTH_GROUP_LABEL, type WealthGroup } from './parse/parseShaam';
import { confirmGroupEmpty, requestCopy, resolveObligation, saveImport, undoSource, uploadSource, type ImportResult } from './api';
import { COPY_TEXT, MATCH_TEXT, sourceShort, REVIEW_TEXT, copyState, dmy, importSummaryParts, mergeUndo, needsRequest, obligationDueText, obligationTitle, sourceText, stateLine, undoSummaryText, type Obligation, type PlanRow, type UndoSummary } from './model';
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

export default function ShaamFilingPanel({ clients, onOpenRequests, onChanged, hideOpenRows }: ShaamFilingPanelProps) {
  const { obligations, sources, err, load } = useObligations();
  // ‼ קריאות 154 מיישור הקו הן מקור בלי קובץ — לא «קובץ שנקלט».
  const uploaded = sources.filter(s => !isGmf154Source(s));
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const [guide, setGuide] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ name: string; done: number; total: number; file: number; files: number } | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const raw = useRef(new Map<string, File>());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [mode, setMode] = useState<'routine' | 'intake'>('routine');
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
  // קבוצה שנבדקה בהעלאה קודמת ב-14 הימים האחרונים — נחשבת נבדקה (עם התאריך); אחרת «לא נבדקה». ‼ העלאה שבוטלה — לא.
  const recentCut = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const recent = new Map<WealthGroup, string>();
  for (const s of sources) if (s.kind === 'wealth' && s.group && !(s.undoneAt && !s.canUndo) && (s.producedOn ?? s.uploadedAt.slice(0, 10)) >= recentCut && !recent.has(s.group)) recent.set(s.group, s.producedOn ?? s.uploadedAt.slice(0, 10));
  const unchecked = uncheckedWealthGroups(coverage, mode).filter(g => !recent.has(g));
  const recentChecked = uncheckedWealthGroups(coverage, mode).filter(g => recent.has(g));
  const showUnchecked = coverage.some(c => c.list.startsWith('wealth:')) || mode === 'intake';
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

  return (
    <section className="shf-panel" aria-labelledby="shf-h" data-shaam-filing-panel>
      <header className="shf-head">
        <div>
          <h3 id="shf-h">הפקת דוחות משע״ם והעלאה</h3>
          <p className="shf-lead">מפיקים בשע״ם את רשימת מעקב הדוחות השנתיים ואת דרישות הצהרות ההון, מעלים את ה-PDF — והמערכת מסמנת בתיק של כל לקוח מה נדרש ועד מתי.</p>
        </div>
        <div className="shf-head-actions">
          <button type="button" className="btn btn-sm btn-secondary" aria-expanded={guide} onClick={() => setGuide(!guide)} data-sf-guide-toggle>{guide ? 'סגירת המדריך' : 'מה להפיק ואיך'}</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={phase === 'reading' || phase === 'saving'} onClick={() => inputRef.current?.click()} data-sf-upload>העלאת PDF</button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} data-sf-file-input />
        </div>
      </header>

      {guide && (
        <div className="shf-what">
          <ul className="shf-what-list">
            <li><b>דוחות שנתיים:</b> <ArrowChain steps={['IDOM', 'אפשרות 4', 'סוג רשימה 1']} /> — לשנת המס הרצויה, כל המיוצגים. כל העמודים (PF8).</li>
            <li><b>הצהרות הון — מעקב שוטף:</b> <ArrowChain steps={['AHZM', 'אזור 2 «רשימת דרישות»']} />, שתי הפקות: «לא הגישו ולא חייבים בקנס» ו«לא הגישו וחייבים בקנס».</li>
            <li><b>הצהרות הון — קליטה / יישור קו:</b> בנוסף «הגישו וחייבים בקנס» ו«הגישו ולא חייבים בקנס».</li>
          </ul>
          <ShaamGuide />
        </div>
      )}

      {(phase === 'idle' || phase === 'saved') && (
        <div className={`shf-drop${drag ? ' is-drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }} data-sf-drop>
          <span>גוררים לכאן PDF אחד או כמה — או <button type="button" className="shf-link" onClick={() => inputRef.current?.click()}>בוחרים קבצים</button></span>
          <small className="shf-muted">מה שזוהה נכתב לתיקים מיד, ואפשר לבטל. הקובץ נשמר בתיקייה פרטית של המשרד — לא בתיק לקוח.</small>
        </div>
      )}

      {(phase === 'reading' || phase === 'saving') && (
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
          <ul className="shf-files">
            {verdicts.map(v => (
              <li key={v.key} className={`shf-file is-${v.tone}`} data-sf-file={v.tone}>
                <div className="shf-file-main">
                  <b dir="auto">{v.fileName}</b>
                  <span>{v.label}</span>
                  {v.messages.map((m, k) => <small key={k}>{m}</small>)}
                </div>
              </li>
            ))}
          </ul>

          {coverage.length > 0 && (
            <div className="shf-coverage" data-sf-coverage>
              <h4>כיסוי</h4>
              <ul>{coverage.map(c => <li key={c.listKey}><b>{c.label}</b> — {coverageText(c)}{c.producedOn ? ` · הופקה ${dmy(c.producedOn)}` : ''}</li>)}</ul>
              {showUnchecked && (
                <div className="shf-unchecked">
                  <div className="shf-seg shf-seg-sm" role="radiogroup" aria-label="סוג הבדיקה">
                    <button type="button" role="radio" aria-checked={mode === 'routine'} className={`shf-seg-btn${mode === 'routine' ? ' is-on' : ''}`} onClick={() => setMode('routine')}>מעקב שוטף</button>
                    <button type="button" role="radio" aria-checked={mode === 'intake'} className={`shf-seg-btn${mode === 'intake' ? ' is-on' : ''}`} onClick={() => setMode('intake')}>קליטה / יישור קו</button>
                  </div>
                  {unchecked.length ? (
                    <ul>{unchecked.map(g => <UncheckedGroup key={g} group={g} onConfirmed={() => void load()} />)}</ul>
                  ) : <span className="shf-muted">כל קבוצות הצהרות ההון הנדרשות נבדקו.</span>}
                  {recentChecked.map(g => <span key={g} className="shf-muted" data-sf-recent={g}>«{WEALTH_GROUP_LABEL[g]}» — נבדקה בהעלאה קודמת (הופקה {dmy(recent.get(g))})</span>)}
                </div>
              )}
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
function UndoUpload({ sourceIds, onDone }: { sourceIds: string[]; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'asking' | 'busy'>('idle');
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
          <button type="button" className="shf-link" onClick={() => setState('idle')}>לא</button>
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

function UncheckedGroup({ group, onConfirmed }: { group: WealthGroup; onConfirmed: () => void }) {
  const [state, setState] = useState<'idle' | 'asking' | 'busy' | 'done'>('idle');
  return (
    <li className="shf-unchecked-row" data-sf-unchecked={group}>
      <span>«{WEALTH_GROUP_LABEL[group]}» — <b>לא נבדקה</b> (אין קובץ; היעדר קובץ אינו «ריקה»)</span>
      {state === 'idle' && <button type="button" className="shf-link" onClick={() => setState('asking')}>בדקתי בשע״ם — ריקה</button>}
      {state === 'asking' && (
        <span className="shf-inline">
          <span>שע״ם הציג «אין תיקים שבקשת» לקבוצה הזו?</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={async () => { setState('busy'); const r = await confirmGroupEmpty(group, 'אושר במסך הקליטה'); setState(r.ok ? 'done' : 'idle'); if (r.ok) onConfirmed(); }}>כן, נרשום</button>
          <button type="button" className="shf-link" onClick={() => setState('idle')}>לא</button>
        </span>
      )}
      {state === 'busy' && <span className="shf-muted">רושם…</span>}
      {state === 'done' && <span className="shf-chip green">נרשם: נבדקה וריקה (אישור ידני)</span>}
    </li>
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

