// ─── הדף האישי: שאלון הדוח השנתי — מחדש (20.10.2026; docs/proposals/2026-10-20-annual-questionnaire-v2.html) ─────────
// ‼ ההמחשה שגיא אישר: «מה כבר ידוע לנו» → ריבועים עם ציור ודוגמה → שאלה אחת בכל מסך → «רגע לפני ששולחים» (אפשר לשנות
//   הכול) → «שליחה למשרד» → המסמכים, רק בסוף, בשמות ברורים, ומה שאנחנו מוציאים בשורה אחת.
// ‼ שום דבר לא נשלח ושום דבר לא ננעל עד «שליחה למשרד» (flowDraft.ts). הטיוטה נשמרת במכשיר ובשרת (saved_draft של שאלה פתוחה).
// ‼ ההמשך שתשובה פותחת — מאותם צילומים שהשרת פותח; בשליחה השרת פותח אותם באמת, ואז נשלחות תשובותיהם (בסבבים, לפי הסדר).
// ‼ בתצוגה מקדימה (מהמשרד) — הכול עובד מקומית, בלי שליחה ובלי העלאה.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { DOCS } from './documents';
import { ANNUAL_GRID_KEY, UNAVAILABLE_LABEL, type AskAnswer } from './asks';
import type { InfoAsk } from './types';
import { screenAsks, sortAsks, type Screen } from './screens';
import { answerText, askIdentity, draftToAnswer, expandWithDrafts, isVirtual, readyToSend, shownDraft, walkScreens, type Draft } from './flowDraft';
import { cleanRecord, schemaFor, type RecordAnswer } from './records';
import RecordEditor, { loadBankDirectory } from './RecordEditor';
import { EntityEditor } from './TaxInfoFlow';
import { TileIcon } from './tileIcons';
import DocPartsPicker from '../identity/DocPartsPicker';
import { livePortalActions } from '../../components/portal/portalActions';

interface Props {
  stepId: string;
  token?: string;
  title: string;
  initialAsks: InfoAsk[];
  fetchAsks: () => Promise<{ title: string; asks: InfoAsk[] }>;
  onClose?: () => void;
}

type Step = { kind: 'known' } | Screen | { kind: 'review' };
type Store = { v2: Record<string, Draft>; at: number; ours?: string[] };

const isFile = (a: InfoAsk) => a.prompt.input.kind === 'file';
const unsureOf = (a?: 'm' | 'f' | 'p') => (a === 'm' ? 'לא בטוח' : a === 'f' ? 'לא בטוחה' : 'לא בטוחים');

function readLocal(key: string): Store | null {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as Store : null; } catch { return null; }
}
function writeLocal(key: string, v: Store | null) {
  try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* מצב פרטי — הטיוטה בשרת */ }
}

export default function AnnualFlow({ stepId, token, title, initialAsks, fetchAsks, onClose }: Props) {
  const preview = !token;
  const localKey = `ty-draft:${stepId}`;
  const [asks, setAsks] = useState<InfoAsk[]>(initialAsks);
  // השאלה שבה נשמרת הטיוטה בשרת — מסך הרשת אם עוד פתוח, אחרת השאלה הפתוחה הראשונה
  const anchor = useMemo(() => {
    const open = sortAsks(asks).filter(a => a.state === 'published' && !isFile(a));
    return open.find(a => a.itemKey === ANNUAL_GRID_KEY) ?? open[0];
  }, [asks]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const server = (initialAsks.find(a => (a.savedDraft as Store | undefined)?.v2)?.savedDraft as Store | undefined) ?? null;
    const local = preview ? null : readLocal(localKey);
    const best = [server, local].filter((x): x is Store => !!x).sort((a, b) => b.at - a.at)[0];
    return best?.v2 ?? {};
  });
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState<Record<string, 'ok' | 'changed'>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [docOpen, setDocOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ours, setOurs] = useState<string[]>(() => (preview ? [] : readLocal(`${localKey}:ours`)?.ours ?? []));
  const hasOpen = (list: InfoAsk[]) => list.some(a => a.state === 'published' && !isFile(a));
  const [phase, setPhase] = useState<'ask' | 'docs'>(() => (hasOpen(initialAsks) ? 'ask' : 'docs'));

  const expanded = useMemo(() => expandWithDrafts(asks, drafts), [asks, drafts]);
  const grid = expanded.find(a => a.itemKey === ANNUAL_GRID_KEY);
  const steps: Step[] = useMemo(() => {
    const walk = walkScreens(expanded, opened);
    // ‼ כשיש אישורים מהכרטיס — הם המסך הראשון («מה שכבר ידוע לנו — נכון?»); בלי אישורים — «מה כבר ידוע לנו» לתצוגה בלבד
    const hasConfirm = walk.some(s => s.kind === 'confirmAll' || (s.kind === 'ask' && s.ask.prompt.input.kind === 'confirm'));
    const known = !hasConfirm && grid && grid.state === 'published' && (grid.prompt.known?.length ?? 0) > 0 ? [{ kind: 'known' as const }] : [];
    return [...known, ...walk, { kind: 'review' }];
  }, [expanded, opened, grid]);
  const [i, setI] = useState(() => {
    // חזרה מאותו קישור: למסך הראשון שעוד אין לו תשובה בטיוטה
    const k = steps.findIndex(s => s.kind !== 'known' && s.kind !== 'review' && screenAsks(s).some(a => a.state === 'published' && !drafts[askIdentity(a)]));
    return k < 0 ? Math.max(0, steps.length - 1) : (k === 1 && steps[0].kind === 'known' ? 0 : k);
  });

  // ── שמירת הטיוטה: במכשיר מיד, בשרת אחרי רגע (לא בכל הקשה) ──
  const timer = useRef<number | undefined>(undefined);
  const persist = (next: Record<string, Draft>) => {
    if (preview) return;
    const store: Store = { v2: next, at: Date.now() };
    writeLocal(localKey, store);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (anchor && !isVirtual(anchor)) void api.portalSaveDraft(token!, anchor.id, store).then(r => { if (r.ok) { setSaved(true); window.setTimeout(() => setSaved(false), 1200); } });
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const putDrafts = (patch: Record<string, Draft>) => setDrafts(d => { const n = { ...d, ...patch }; persist(n); return n; });

  const idx = Math.max(0, Math.min(steps.length - 1, i));
  const step = steps[idx];
  const progress = Math.round((idx / Math.max(1, steps.length - 1)) * 100);
  const go = (n: number) => { setTried(false); setErr(null); setI(Math.max(0, n)); };

  const top = (
    <>
      <div className="ty-flow-top"><span>{title}</span><span className={`ty-saved${saved ? ' is-on' : ''}`} aria-live="polite">{saved ? 'נשמר ✓' : ''}</span></div>
      <div className="ty-progress" role="progressbar" aria-valuenow={phase === 'docs' ? 100 : progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${phase === 'docs' ? 100 : progress}%` }} /></div>
      {preview && <div className="ty-note">תצוגה בלבד — כך זה ייראה ללקוח. אין כאן שליחה.</div>}
    </>
  );

  // ── אחרי השליחה: המסמכים, רק בסוף ──
  if (phase === 'docs') {
    const files = sortAsks(asks).filter(a => isFile(a) && (a.state === 'published' || (a.state === 'unavailable' && a.unavailable?.code !== 'needHelp')));
    const done = sortAsks(asks).filter(a => isFile(a) && a.state === 'answered');
    const help = asks.filter(a => isFile(a) && a.state === 'unavailable' && a.unavailable?.code === 'needHelp');
    const later = async (a: InfoAsk) => {
      if (preview) return;
      setBusy(true);
      const r = await api.portalSubmit(token!, a.id, { kind: 'unavailable', code: 'later', reason: UNAVAILABLE_LABEL.later });
      setBusy(false);
      if (r.ok) setAsks(l => l.map(x => (x.id === a.id ? { ...x, state: 'unavailable', unavailable: { reason: UNAVAILABLE_LABEL.later, code: 'later', followUpOn: '', recordedAt: new Date().toISOString() } } : x)));
    };
    const upload = async (a: InfoAsk, file: File, manifest?: unknown): Promise<string | null> => {
      if (preview) return 'בתצוגה מקדימה אין העלאה';
      const r = await livePortalActions(token!).uploadDocument({ stepId, itemKey: a.id, file });
      if (!r.ok) return r.error === 'too_large' ? 'הקובץ גדול מדי (עד 10MB).' : r.error === 'type_not_allowed' ? 'סוג קובץ לא נתמך — PDF או תמונה.' : 'ההעלאה נכשלה — נסו שוב.';
      if (manifest) void api.portalNoteEvidenceParts(token!, a.id, manifest).catch(() => undefined);
      setAsks(l => l.map(x => (x.id === a.id ? { ...x, state: 'answered', unavailable: undefined } : x)));
      return null;
    };
    const left = files.length;
    return (
      <div className="ty-flow" aria-live="polite" data-finish data-annual-docs>
        {top}
        <p className="ty-q">{left ? 'נשלח ✓ — מה להעלות' : done.length ? 'הכול הועלה. תודה!' : 'נשלח ✓ תודה!'}</p>
        {left > 0 && <p className="ty-q-sub">{left === 1 ? 'מסמך אחד' : `${left} מסמכים`}. אפשר עכשיו או אחר כך, מאותו קישור.</p>}
        <ul className="ty-owed-list">
          {files.map(a => (
            <li key={a.id} className={`ty-owed-item${a.state === 'unavailable' ? ' is-later' : ''}`} data-owed={a.id}>
              <div className="ty-owed-row">
                <span className="ty-owed-title"><b>{a.prompt.title}</b>
                  <small>{[a.prompt.subjectName, a.state === 'unavailable' ? UNAVAILABLE_LABEL[a.unavailable?.code ?? 'legacy'] : ''].filter(Boolean).join(' · ')}</small></span>
                {docOpen !== a.id && (
                  <span className="ty-owed-acts">
                    <button type="button" className="btn btn-sm btn-primary" disabled={preview} onClick={() => setDocOpen(a.id)}>העלאה</button>
                    {a.state === 'published' && <button type="button" className="ty-link" disabled={preview || busy} onClick={() => void later(a)}>אחר כך</button>}
                  </span>
                )}
              </div>
              {docOpen === a.id && a.prompt.input.kind === 'file' && (
                <DocPartsPicker docKind={a.prompt.input.docKind} fileName={DOCS[a.prompt.input.docKind]?.label ?? 'מסמך'} storeKey={`${stepId}:${a.id}`} disabled={preview}
                  onConfirm={async (pdf, manifest) => { const e = await upload(a, pdf, manifest); if (!e) setDocOpen(null); return e; }} />
              )}
            </li>
          ))}
          {done.map(a => (
            <li key={a.id} className="ty-owed-item is-done" data-done={a.id}>
              <div className="ty-owed-row"><span className="ty-owed-title"><b>{a.prompt.title}</b>{a.prompt.subjectName && <small>{a.prompt.subjectName}</small>}</span><span className="ty-done-tag">✓ הועלה</span></div>
            </li>
          ))}
        </ul>
        {help.length > 0 && <p className="ty-q-sub" role="note">ביקשת עזרה ב{help.length === 1 ? `: ${help[0].prompt.title}` : `-${help.length} מסמכים`}. המשרד יחזור אליך.</p>}
        {ours.length > 0 && <p className="ty-ours" data-ours>אנחנו מוציאים בעצמנו: {ours.join(' · ')}</p>}
        <div className="ty-actions">
          {hasOpen(asks) && <button type="button" className="btn btn-ghost" onClick={() => { setPhase('ask'); go(0); }}>לחזור לשאלות</button>}
          {onClose && <button type="button" className="btn btn-primary" onClick={onClose}>{left ? 'אמשיך אחר כך' : 'סיום'}</button>}
        </div>
      </div>
    );
  }

  // ── מסך «מה כבר ידוע לנו» ──
  if (step.kind === 'known' && grid) {
    const gd = drafts[askIdentity(grid)] ?? {};
    return (
      <div className="ty-flow" data-screen="known">
        {top}
        <p className="ty-q">{title}</p>
        <p className="ty-q-sub">בערך 5 דקות. אפשר לעצור ולחזור — הכול נשמר.</p>
        <p className="ty-known-h">מה כבר ידוע לנו</p>
        <dl className="ty-known">{grid.prompt.known!.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {!noteOpen && !gd.note && <button type="button" className="ty-link" onClick={() => setNoteOpen(true)}>משהו לא נכון?</button>}
        {(noteOpen || gd.note) && (
          <label className="ty-field">מה לא נכון? (המשרד יתקן)
            <textarea value={gd.note ?? ''} onChange={e => putDrafts({ [askIdentity(grid)]: { ...shownDraft(grid, drafts[askIdentity(grid)]), note: e.target.value } })} />
          </label>
        )}
        <div className="ty-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={() => go(idx + 1)}>{gd.note ? 'הבא' : 'נכון, אפשר להתחיל'}</button>
        </div>
      </div>
    );
  }

  // ── «רגע לפני ששולחים» ──
  if (step.kind === 'review') {
    const rows = steps.map((s, k) => ({ s, k })).filter(x => x.s.kind !== 'known' && x.s.kind !== 'review');
    const missing = rows.filter(({ s }) => screenAsks(s as Screen).some(a => a.state === 'published' && !(drafts[askIdentity(a)] && draftToAnswer(a, drafts[askIdentity(a)]))));
    const send = async () => {
      if (preview || missing.length) return;
      setBusy(true); setErr(null);
      // מה שאנחנו מוציאים — מהאריחים שסומנו (לפני שהטיוטה נמחקת)
      const gd = grid ? drafts[askIdentity(grid)] : undefined;
      const oursNow = grid && grid.prompt.input.kind === 'multi' && gd?.selected ? grid.prompt.input.options.filter(o => gd.selected!.includes(o.key)).flatMap(o => o.ours ?? []) : [];
      let cur = asks;
      try {
        const dir = { v: null as Awaited<ReturnType<typeof loadBankDirectory>> | null, loaded: false };
        for (let pass = 0; pass < 6; pass++) {
          const ready = readyToSend(sortAsks(expandWithDrafts(cur, drafts)), drafts);
          if (!ready.length) break;
          for (const { ask, answer } of ready) {
            const payload = await cleanAnswer(ask, answer, dir);
            const r = await api.portalSubmit(token!, ask.id, payload);
            if (!r.ok) throw new Error(r.error ?? 'failed');
            cur = cur.map(x => (x.id === ask.id ? { ...x, state: 'answered' as const, savedDraft: undefined } : x));
          }
          cur = (await fetchAsks()).asks;
        }
      } catch {
        setBusy(false); setAsks(cur); setErr('השליחה לא הושלמה — נסו שוב. מה שנשלח נשמר.');
        return;
      }
      writeLocal(localKey, null);
      writeLocal(`${localKey}:ours`, { v2: {}, at: Date.now(), ours: oursNow });
      setOurs(oursNow);
      setAsks(cur); setBusy(false); setPhase('docs');
    };
    return (
      <div className="ty-flow" data-screen="review">
        {top}
        <p className="ty-q">רגע לפני ששולחים</p>
        <p className="ty-q-sub">אפשר לשנות כל דבר. שום דבר עוד לא נשלח.</p>
        <ul className="ty-review">
          {rows.map(({ s, k }) => {
            const list = screenAsks(s as Screen);
            const head = s.kind === 'confirmAll' ? 'מה שכבר ידוע לנו' : list[0].itemKey === ANNUAL_GRID_KEY ? list[0].prompt.title : list[0].prompt.title;
            const lines = list.map(a => {
              const d = drafts[askIdentity(a)];
              const t = a.state === 'published' ? answerText(a, d) : 'נשלח קודם';
              return `${list.length > 1 && a.prompt.subjectName ? `${a.prompt.subjectName}: ` : list.length > 1 && s.kind === 'group' ? 'שלך: ' : ''}${t || '— חסר'}`;
            });
            const isMissing = missing.some(m => m.k === k);
            return (
              <li key={k} className={`ty-review-row${isMissing ? ' is-missing' : ''}`} data-review-row>
                <div><b>{head}</b>{lines.map((l, n) => <span key={n}>{l}</span>)}</div>
                <button type="button" className="ty-link" onClick={() => go(k)}>שינוי</button>
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && <div className="ty-err" role="alert">{missing.length === 1 ? 'שאלה אחת עוד בלי תשובה' : `${missing.length} שאלות עוד בלי תשובה`} — «שינוי» ליד השורה.</div>}
        {err && <div className="ty-err" role="alert">{err}</div>}
        <div className="ty-nav">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => go(idx - 1)}>הקודם</button>
          <button type="button" className="btn btn-primary" disabled={busy || preview || missing.length > 0} onClick={() => void send()} data-annual-send>{busy ? 'שולח…' : 'שליחה למשרד'}</button>
        </div>
      </div>
    );
  }

  // ── «מה שכבר ידוע לנו — נכון?» (אישורים מהכרטיס) — בטיוטה ──
  const scr = step as Screen;
  if (scr.kind === 'confirmAll') {
    const list = scr.asks;
    const nextAll = () => {
      const patch: Record<string, Draft> = {};
      const changed = list.filter(a => (marks[a.id] ?? (drafts[askIdentity(a)]?.choice === 'changed' ? 'changed' : 'ok')) === 'changed');
      for (const a of list) if (!changed.includes(a)) patch[askIdentity(a)] = { choice: 'yes' };
      for (const a of changed) patch[askIdentity(a)] = { ...drafts[askIdentity(a)], choice: 'changed' };
      putDrafts(patch);
      const nextOpened = new Set([...opened, ...changed.map(a => a.id)]);
      setOpened(nextOpened);
      go(idx + 1);
    };
    return (
      <div className="ty-flow" data-screen="confirmAll">
        {top}
        <p className="ty-q" id="q-confirm-all">מה שכבר ידוע לנו — נכון?</p>
        {idx === 0 && <p className="ty-q-sub">בערך 5 דקות. אפשר לעצור ולחזור — הכול נשמר.</p>}
        <ul className="ty-confirm-list" aria-labelledby="q-confirm-all">
          {list.map(a => {
            const lines = a.prompt.input.kind === 'confirm' ? a.prompt.input.lines : [];
            const m = marks[a.id] ?? (drafts[askIdentity(a)]?.choice === 'changed' ? 'changed' : 'ok');
            return (
              <li key={a.id} className={`ty-confirm-row${m === 'changed' ? ' is-changed' : ''}`} data-confirm={a.itemKey}>
                <div className="ty-confirm-main">
                  <b>{a.prompt.title.replace(/ — זה מה שידוע לנו$/, '')}</b>
                  {a.prompt.subjectName && <small>של {a.prompt.subjectName}</small>}
                  <ul className="ty-lines is-compact">{lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
                </div>
                <div className="ty-seg" role="group" aria-label={`${a.prompt.title}: נכון או יש שינוי`}>
                  <button type="button" aria-pressed={m === 'ok'} onClick={() => setMarks(x => ({ ...x, [a.id]: 'ok' }))}>נכון</button>
                  <button type="button" aria-pressed={m === 'changed'} onClick={() => setMarks(x => ({ ...x, [a.id]: 'changed' }))}>יש שינוי</button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="ty-nav">
          <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => go(idx - 1)}>הקודם</button>
          <button type="button" className="btn btn-primary" onClick={nextAll}>{list.some(a => marks[a.id] === 'changed') ? 'הבא — לתקן מה שהשתנה' : 'כן, הכול נכון'}</button>
        </div>
      </div>
    );
  }

  // ── שאלה (או כמה אנשים באותה שאלה) ──
  const list = screenAsks(scr);
  const first = list[0];
  const sent = list.every(a => a.state !== 'published');
  const valid = list.every(a => a.state !== 'published' || !!draftToAnswer(a, shownDraft(a, drafts[askIdentity(a)])));
  const next = () => {
    if (!sent && !valid) { setTried(true); return; }
    // מה שמוצג (גם סימון מראש) הוא התשובה — נשמר בטיוטה, וההמשך שלו נכנס מיד אחרי המסך הזה
    const patch: Record<string, Draft> = {};
    for (const a of list) if (a.state === 'published') patch[askIdentity(a)] = shownDraft(a, drafts[askIdentity(a)]);
    const nd = { ...drafts, ...patch };
    putDrafts(patch);
    const ns = [...(steps[0]?.kind === 'known' ? [{ kind: 'known' as const }] : []), ...walkScreens(expandWithDrafts(asks, nd), opened)];
    const at = ns.findIndex(s => s.kind !== 'known' && screenAsks(s).some(a => askIdentity(a) === askIdentity(first)));
    go((at >= 0 ? at : idx) + 1);
  };
  const isGrid = first.itemKey === ANNUAL_GRID_KEY;
  return (
    <div className="ty-flow" data-screen={scr.kind === 'group' ? 'group' : first.prompt.input.kind}>
      {top}
      {first.prompt.correction && <div className="ty-correction" role="note"><b>המשרד ביקש לתקן:</b> {first.prompt.correction}</div>}
      <p className="ty-q" id={`q-${first.id}`}>{first.prompt.title}</p>
      {scr.kind === 'ask' && (first.prompt.subjectName || (first.prompt.periodText && !isGrid)) && (
        <p className="ty-q-meta">
          {first.prompt.subjectName && <span className="ty-tag">{first.prompt.subjectName}</span>}
          {first.prompt.periodText && !isGrid && <span className="ty-tag is-period">{first.prompt.periodText}</span>}
        </p>
      )}
      {first.prompt.hint && <p className="ty-hint" id={`h-${first.id}`}>{first.prompt.hint}</p>}
      {sent && <span className="ty-done-mark">✓ נשלח קודם</span>}
      {list.map(a => (
        <div key={a.id} className={scr.kind === 'group' ? 'ty-group-card' : undefined}>
          {scr.kind === 'group' && <p className="ty-group-who">{a.prompt.subjectName ?? 'שלך'}</p>}
          {a.state === 'published' && (
            <AskInput ask={a} d={shownDraft(a, drafts[askIdentity(a)])} setD={p => putDrafts({ [askIdentity(a)]: { ...shownDraft(a, drafts[askIdentity(a)]), ...p } })} tried={tried} preview={preview} />
          )}
          {a.state !== 'published' && scr.kind === 'group' && <span className="ty-done-mark">✓ נשלח קודם</span>}
        </div>
      ))}
      {first.prompt.why && <details className="ty-why-q"><summary>למה שואלים?</summary><p>{first.prompt.why}</p></details>}
      {tried && !valid && <div className="ty-err" role="alert">{first.prompt.input.kind === 'multi' ? (isGrid ? 'סמנו מה היה, או «לא היה אף אחד מאלה»' : 'סמנו לפחות אחד') : first.prompt.input.kind === 'record' || first.prompt.input.kind === 'entity' ? 'חסרים פרטים — מסומנים באדום' : 'נא לבחור תשובה'}</div>}
      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => go(idx - 1)}>הקודם</button>
        <button type="button" className="btn btn-primary" onClick={next}>הבא</button>
      </div>
    </div>
  );
}

/** ניקוי לפני שליחה — אותו ניקוי כמו קודם (אפסים מובילים בבנק/סניף, שם הבנק מהרשימה). */
async function cleanAnswer(ask: InfoAsk, a: AskAnswer, dir: { v: Awaited<ReturnType<typeof loadBankDirectory>> | null; loaded: boolean }): Promise<AskAnswer> {
  if (a.kind !== 'record' || a.none) return a;
  const input = ask.prompt.input;
  const schemaId = input.kind === 'record' ? input.schema : input.kind === 'confirm' ? input.edit?.schema : undefined;
  const ctx = input.kind === 'record' ? input.context : input.kind === 'confirm' ? input.edit?.context : undefined;
  if (!schemaId) return a;
  const schema = schemaFor(schemaId, undefined, ctx);
  if (schema.id === 'bank' && !dir.loaded) { dir.v = await loadBankDirectory(); dir.loaded = true; }
  const items = ((a.value as { items?: RecordAnswer['items'] } | null)?.items ?? (a.value ? [a.value as RecordAnswer['items'][number]] : [])).map(r => cleanRecord(schema, r, dir.v));
  return { ...a, value: schema.id === 'period' ? items[0] : { items } };
}

// ── הקלט של שאלה אחת (בלי מסמך — המסמכים בסוף) ──────────────────────────────────────────────────────────────
function AskInput({ ask, d, setD, tried, preview }: { ask: InfoAsk; d: Draft; setD: (p: Draft) => void; tried: boolean; preview: boolean }) {
  const input = ask.prompt.input;
  const unsure = unsureOf(ask.prompt.addressee);
  if (input.kind === 'multi') {
    const toggle = (key: string, on: boolean) => setD({ none: false, selected: on ? (d.selected ?? []).filter(k => k !== key) : [...(d.selected ?? []), key] });
    const grouped = input.options.some(o => o.group);
    const tile = (o: (typeof input.options)[number]) => {
      const on = !d.none && (d.selected ?? []).includes(o.key);
      return (
        <button key={o.key} type="button" className={`ty-tile${grouped ? ' is-rich' : ''}`} aria-pressed={on} data-tile={o.key} onClick={() => toggle(o.key, on)}>
          <span className="ty-tile-check" aria-hidden="true">{on ? '✓' : ''}</span>
          {grouped && <TileIcon k={o.key} />}
          <span className="ty-tile-text"><b>{o.label}</b>{o.example && <small className="ty-tile-ex">{o.example}</small>}{o.note && <small className="ty-tile-note">{o.note}</small>}</span>
        </button>
      );
    };
    const noneLabel = ask.itemKey === ANNUAL_GRID_KEY ? (ask.prompt.addressee === 'p' ? 'לא היה לנו אף אחד מאלה' : 'לא היה אף אחד מאלה') : 'אף אחד מאלה';
    return (
      <div className="ty-grid-wrap" role="group" aria-labelledby={`q-${ask.id}`}>
        {grouped ? (
          <>
            {(['in', 'less'] as const).map(g => {
              const opts = input.options.filter(o => (o.group ?? 'in') === g);
              return opts.length ? (
                <section key={g} className="ty-grid-sec">
                  <p className="ty-grid-h">{g === 'in' ? 'כסף שנכנס' : 'מה שיכול להקטין את המס'}</p>
                  <div className="ty-grid">{opts.map(tile)}</div>
                </section>
              ) : null;
            })}
          </>
        ) : <div className="ty-grid">{input.options.map(tile)}</div>}
        <button type="button" className="ty-tile is-wide" aria-pressed={!!d.none} data-tile="none" onClick={() => setD({ none: !d.none, selected: [] })}>{noneLabel}</button>
      </div>
    );
  }
  if (input.kind === 'record' || (input.kind === 'confirm' && d.choice === 'changed' && input.edit)) {
    const schemaId = input.kind === 'record' ? input.schema : input.edit!.schema;
    const ctx = input.kind === 'record' ? input.context : input.edit!.context;
    const value: RecordAnswer = d.record ?? { items: ((input.kind === 'record' ? input.initial : input.edit!.initial) as RecordAnswer['items']) ?? [] };
    return (
      <>
        {input.kind === 'confirm' && <ConfirmChoice input={input} d={d} setD={setD} ask={ask} />}
        <RecordEditor schemaId={schemaId} context={ctx} value={value} onChange={v => setD({ record: v })} showErrors={tried} disabled={preview} />
      </>
    );
  }
  if (input.kind === 'confirm') {
    return (
      <>
        <ConfirmChoice input={input} d={d} setD={setD} ask={ask} />
        {d.choice === 'changed' && <label className="ty-field">מה השתנה?<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
      </>
    );
  }
  if (input.kind === 'entity') {
    const items = d.items ?? (input.initial?.length ? input.initial : [{}]);
    return <EntityEditor spec={input.spec} names={input.context} items={items} onChange={its => setD({ items: its })} showErrors={tried} disabled={preview} />;
  }
  if (input.kind === 'yesno') {
    return (
      <>
        <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
          {[['yes', 'כן'], ['no', 'לא'], ['notSure', unsure]].map(([v, l]) => (
            <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
          ))}
        </div>
        {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
      </>
    );
  }
  if (input.kind === 'who') {
    return (
      <>
        <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
          {[['none', 'לא'], ['client', input.clientName], ['spouse', input.spouseName], ['both', 'שנינו'], ['notSure', unsure]].map(([v, l]) => (
            <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
          ))}
        </div>
        {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
      </>
    );
  }
  if (input.kind === 'amount') {
    return (
      <>
        <label className="ty-field">סכום בשקלים (אם לא היה — 0)<input type="number" dir="ltr" inputMode="decimal" min={0} value={d.amount ?? ''} onChange={e => setD({ amount: e.target.value, choice: undefined })} /></label>
        <button type="button" className="ty-choice" aria-pressed={d.choice === 'notSure'} onClick={() => setD({ choice: 'notSure', amount: '' })}>{unsure} — המשרד יבדוק</button>
      </>
    );
  }
  if (input.kind === 'text') return <label className="ty-field">התשובה<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>;
  if (input.kind === 'choice') {
    return <div className="ty-choices">{input.options.map(o => <button key={o.value} type="button" className="ty-choice" aria-pressed={d.choice === o.value} onClick={() => setD({ choice: o.value })}>{o.label}</button>)}</div>;
  }
  return null;
}

function ConfirmChoice({ input, d, setD, ask }: { input: Extract<InfoAsk['prompt']['input'], { kind: 'confirm' }>; d: Draft; setD: (p: Draft) => void; ask: InfoAsk }) {
  return (
    <>
      <ul className="ty-lines">{input.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
      <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
        <button type="button" className="ty-choice" aria-pressed={d.choice === 'yes'} onClick={() => setD({ choice: 'yes' })}>כן, הכול נכון</button>
        <button type="button" className="ty-choice" aria-pressed={d.choice === 'changed'} onClick={() => setD({ choice: 'changed' })}>משהו השתנה</button>
      </div>
    </>
  );
}
