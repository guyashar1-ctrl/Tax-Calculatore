// ─── «הפקת דוחות משע״ם והעלאה» — מקטע ב«מס › עבודות לקוחות › כל העבודות» (16.10.2026) ───────────────
// הכרעת מיקום (גיא + הסשן המנהל, 16.10): כאן, ולא בדף הסיום של הקליטה ולא בדף הלקוח הציבורי.
// ‼ ארבעה חלקים, רשימה אחת: (1) מה להפיק + מדריך מסומן, (2) העלאת PDF אחד או כמה → תצוגת קליטה → «שמירה לתיקים»,
//   (3) חובות פתוחות בלי בקשה — «חייב · טרם נפתח» עם «פתח בקשה» / «פתח בקשות לכולם» (או ShaamOpenRows ברשימת
//   העבודות עצמה, hideOpenRows), (4) לבדיקה והיסטוריה — מקופלים.
// ‼ «שמירה לתיקים» היא אישור התוצר: רק שורות מזוהות נכתבות לתיק; לא ודאיות נשמרות «לבדיקה» בלי כתיבה לתיק.
// ‼ הקובץ המקורי (רשימת לקוחות רבים) עולה לדלי הפרטי של המשרד — לא לתיק לקוח ולא לדף האישי.

import { useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import { ArrowChain } from '../../components/ui/ArrowPath';
import { readShaamFile } from './parse/readPdf';
import { buildBatch, coverageText, fileVerdict, uncheckedWealthGroups, type Batch, type Coverage, type ParsedFile } from './parse/batch';
import { WEALTH_GROUP_LABEL, type WealthGroup } from './parse/parseShaam';
import { confirmGroupEmpty, previewImport, requestCopy, resolveObligation, saveImport, uploadSource, type PreviewResult } from './api';
import { COPY_TEXT, MATCH_TEXT, sourceShort, REVIEW_TEXT, copyState, dmy, needsRequest, obligationDueText, obligationTitle, planCounts, sourceText, stateLine, type Obligation, type PlanRow } from './model';
import { useObligations } from './useObligations';
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

type Phase = 'idle' | 'reading' | 'review' | 'saving' | 'saved';

export default function ShaamFilingPanel({ clients, onOpenRequests, onChanged, hideOpenRows }: ShaamFilingPanelProps) {
  const { obligations, sources, err, load } = useObligations();
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const [guide, setGuide] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ name: string; done: number; total: number; file: number; files: number } | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const raw = useRef(new Map<string, File>());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mode, setMode] = useState<'routine' | 'intake'>('routine');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ counts: Record<string, number>; review: number; matched: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [opening, setOpening] = useState<Obligation[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPhase('idle'); setFiles([]); raw.current.clear(); setBatch(null); setCoverage([]); setPreview(null); setError(null); setSaved(null); };

  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    setError(null); setSaved(null); setPhase('reading');
    // ‼ אחרי שמירה (או בפעם הראשונה) — אצווה חדשה; בתוך סקירה — מוסיפים לאותה אצווה
    const next = phase === 'review' ? [...files] : [];
    if (phase !== 'review') raw.current.clear();
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
    if (b.batch.rows.length) {
      try {
        const p = await previewImport(b.batch);
        if (!p.ok) throw new Error(p.error ?? 'preview_failed');
        setPreview(p);
      } catch (e) { setError(`הבדיקה מול התיקים נכשלה: ${(e as Error).message}. נסו שוב.`); setPreview(null); }
    } else setPreview({ ok: true, plan: [], names: {} });
    setPhase('review');
  };

  const removeFile = (key: string) => {
    const next = files.filter(f => f.key !== key);
    raw.current.delete(key);
    setFiles(next);
    if (!next.length) { reset(); return; }
    const b = buildBatch(next);
    setBatch(b.batch); setCoverage(b.coverage);
    void previewImport(b.batch).then(setPreview).catch(e => setError((e as Error).message));
  };

  const save = async () => {
    if (!batch) return;
    setPhase('saving'); setError(null);
    try {
      // 1 · הקבצים המקוריים לדלי הפרטי של המשרד
      const withPaths: Batch = { ...batch, sources: batch.sources.map(s => ({ ...s })) };
      for (const f of files) {
        if (!f.sha256 || f.error) continue;
        const file = raw.current.get(f.key);
        if (!file) continue;
        // אותו קובץ כבר שמור אצל המשרד — לא מעלים שוב (הנתיב נקבע לפי התוכן)
        const known = sources.find(s => s.sha256 === f.sha256 && s.hasFile);
        const u = known ? { path: undefined } : await uploadSource(file, f.sha256);
        if ('error' in u && u.error) throw new Error(`שמירת הקובץ «${f.fileName}» נכשלה (${u.error}) — לא נקלט דבר`);
        if (u.path) for (const s of withPaths.sources) if (s.key === f.key || s.key.startsWith(`${f.key}#`)) s.storagePath = u.path;
      }
      // 2 · השורות לתיקים
      const r = await saveImport(withPaths);
      if (!r.ok) throw new Error(r.error ?? 'save_failed');
      const c = planCounts(r.plan);
      setSaved({ counts: r.counts, review: c.review, matched: c.matched });
      setPhase('saved');
      await load();
      onChanged?.();
    } catch (e) { setError((e as Error).message); setPhase('review'); }
  };

  const verdicts = files.map(fileVerdict);
  const plan = preview?.plan ?? [];
  const counts = planCounts(plan);
  // קבוצה שנבדקה בהעלאה קודמת ב-14 הימים האחרונים — נחשבת נבדקה (עם התאריך); אחרת «לא נבדקה»
  const recentCut = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const recent = new Map<WealthGroup, string>();
  for (const s of sources) if (s.kind === 'wealth' && s.group && (s.producedOn ?? s.uploadedAt.slice(0, 10)) >= recentCut && !recent.has(s.group)) recent.set(s.group, s.producedOn ?? s.uploadedAt.slice(0, 10));
  const unchecked = uncheckedWealthGroups(coverage, mode).filter(g => !recent.has(g));
  const recentChecked = uncheckedWealthGroups(coverage, mode).filter(g => recent.has(g));
  const showUnchecked = coverage.some(c => c.list.startsWith('wealth:')) || mode === 'intake';
  const saveable = plan.some(p => ['new', 'updated', 'unchanged'].includes(p.change)) || !!batch?.sources.some(s => s.status === 'empty_confirmed');
  const canSave = !!batch && !!preview && phase === 'review' && saveable;
  const rowView = (p: PlanRow) => {
    const r = batch?.rows[p.i - 1];
    const who = p.clientId ? (preview?.names[p.clientId] ?? nameOfClient(byId.get(p.clientId))) : r?.name ?? '';
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
          <span>גוררים לכאן PDF אחד או כמה (גם קובץ עם כמה עמודים) — או <button type="button" className="shf-link" onClick={() => inputRef.current?.click()}>בוחרים קבצים</button></span>
          <small className="shf-muted">הקובץ נקרא במחשב שלך. נשמר רק ב«שמירה לתיקים», בתיקייה פרטית של המשרד — לא בתיק לקוח.</small>
        </div>
      )}

      {phase === 'reading' && progress && (
        <div className="shf-progress" role="status" data-sf-progress>
          קורא {progress.files > 1 ? `קובץ ${progress.file} מתוך ${progress.files} · ` : ''}«{progress.name}»{progress.total ? ` · עמוד ${progress.done} מתוך ${progress.total}` : '…'}
          <span className="shf-bar"><i style={{ inlineSize: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} /></span>
        </div>
      )}

      {error && <div className="shf-err" role="alert" data-sf-error>{error}</div>}

      {phase === 'saved' && saved && (
        <div className="shf-ok" role="status" data-sf-saved>
          נשמר לתיקים: {saved.matched} שורות מזוהות{saved.counts.new ? ` · ${saved.counts.new} חדשות` : ''}{saved.counts.updated ? ` · ${saved.counts.updated} עודכנו` : ''}{saved.counts.unchanged ? ` · ${saved.counts.unchanged} ללא שינוי` : ''}{saved.review ? ` · ${saved.review} לבדיקה (לא נכתבו לתיק)` : ''}{saved.counts.older ? ` · ${saved.counts.older} מקובץ ישן — לא דרסו` : ''}.
          <button type="button" className="shf-link" onClick={reset}>סגירה</button>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div className="shf-review" data-sf-review>
          <ul className="shf-files">
            {verdicts.map(v => (
              <li key={v.key} className={`shf-file is-${v.tone}`} data-sf-file={v.tone}>
                <div className="shf-file-main">
                  <b dir="auto">{v.fileName}</b>
                  <span>{v.label}</span>
                  {v.messages.map((m, k) => <small key={k}>{m}</small>)}
                </div>
                <button type="button" className="shf-link" disabled={phase === 'saving'} onClick={() => removeFile(v.key)} aria-label={`הסרת ${v.fileName}`}>הסרה</button>
              </li>
            ))}
          </ul>
          <div className="shf-add-more"><button type="button" className="shf-link" disabled={phase === 'saving'} onClick={() => inputRef.current?.click()}>＋ עוד קובץ</button></div>

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
            <>
              <div className="shf-counts" data-sf-counts>
                <span className="shf-chip blue">זוהו {counts.matched}</span>
                <span className="shf-chip">חדשים {counts.new}</span>
                <span className="shf-chip">עודכנו {counts.updated}</span>
                <span className="shf-chip">ללא שינוי {counts.unchanged}</span>
                {counts.review > 0 && <span className="shf-chip amber">לבדיקה {counts.review}</span>}
                {counts.older > 0 && <span className="shf-chip">מקובץ ישן {counts.older}</span>}
                {counts.invalid > 0 && <span className="shf-chip red">לא נקראו {counts.invalid}</span>}
              </div>
              <ul className="shf-plan" aria-label="מה יישמר">
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
            </>
          )}
          {!plan.length && batch && !batch.rows.length && (
            <p className="shf-muted">{batch.sources.some(s => s.status === 'empty_confirmed') ? 'אין שורות לקליטה — רק אישור שהקבוצה נבדקה וריקה.' : 'אין בקבצים שורות שאפשר לקלוט.'}</p>
          )}
          <div className="shf-actions">
            <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void save()} data-sf-save>{phase === 'saving' ? 'שומר…' : 'שמירה לתיקים'}</button>
            <button type="button" className="btn btn-secondary" disabled={phase === 'saving'} onClick={reset}>ביטול</button>
            <small className="shf-muted">רק שורות שזוהו נכתבות לתיק. «לבדיקה» נשמרות ברשימת הטיפול למטה, בלי כתיבה לתיק. לא נפתחות בקשות ולא יוצא מייל.</small>
          </div>
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

      {sources.length > 0 && (
        <details className="shf-details" data-sf-sources>
          <summary><b>קבצים שנקלטו</b> <span className="shf-chip">{sources.length}</span></summary>
          <ul className="shf-rows">{sources.map(s => (
            <li key={s.id} className="shf-row"><span className="shf-row-main"><b dir="auto">{s.fileName}</b>
              <small>{s.kind === 'annual' ? `דוחות שנתיים${s.taxYear ? ` ${s.taxYear}` : ''}` : `הצהרות הון · ${s.group ? WEALTH_GROUP_LABEL[s.group] : ''}`}{s.producedOn ? ` · הופקה ${dmy(s.producedOn)}` : ''} · נקלט {dmy(s.uploadedAt)}{s.status === 'empty_confirmed' ? ' · נבדקה וריקה' : ''}{s.method === 'manual' ? ' · אישור ידני' : ''}{s.note ? ` · ${s.note}` : ''}</small></span></li>
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

