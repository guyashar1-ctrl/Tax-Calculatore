// ─── הדף האישי: שאלון הדוח השנתי — מחדש (20.10.2026; docs/proposals/2026-10-20-annual-questionnaire-v2.html) ─────────
// ‼ ההמחשה שגיא אישר: «מה כבר ידוע לנו» → ריבועים עם ציור ודוגמה → שאלה אחת בכל מסך → «שליחה למשרד» → המסמכים,
//   רק בסוף, בשמות ברורים, ומה שאנחנו מוציאים בשורה אחת.
// ‼ 21.10.2026 · סבב 2 (docs/proposals/2026-10-21-annual-questionnaire-fixes.html, גיא אישר):
//   · «זה עדיין נכון?» — «נכון» מקפל את השורה ל-✓; «השתנה» נפתח בתוך השורה (בחירה קטנה או עריכה), לא במסך נוסף.
//   · לכל אדם שני מסכי ריבועים: «מאיפה נכנס לך כסף» ו«מה יכול להוריד לך מס» — בלי «של מי».
//   · «?» בריבוע פותח שורת הסבר; כלום לא סומן ⇒ הכפתור אומר «לא היה כלום — הבא»; «משהו אחר?» — הערה למשרד.
//   · «לימודים וצבא» — מסך אחד בסוף לכל בני הבית (flowDraft.ts › walkScreens).
//   · בלי הודעות שגיאה למטה: «הבא» מוביל למה שחסר, והוא רועד קלות עם «חסר כאן».
// ‼ שום דבר לא נשלח ושום דבר לא ננעל עד «שליחה למשרד» (flowDraft.ts). הטיוטה נשמרת במכשיר ובשרת (saved_draft של שאלה פתוחה).
// ‼ ההמשך שתשובה פותחת — מאותם צילומים שהשרת פותח; בשליחה השרת פותח אותם באמת, ואז נשלחות תשובותיהם (בסבבים, לפי הסדר).
// ‼ בתצוגה מקדימה (מהמשרד) — הכול עובד מקומית, בלי שליחה ובלי העלאה.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { DOCS } from './documents';
import { ANNUAL_GRIDS, UNAVAILABLE_LABEL, type AskAnswer } from './asks';
import type { InfoAsk } from './types';
import { checklistParent, screenAsks, sortAsks, type Screen } from './screens';
import { CHECKLIST_LABEL, CHECKLIST_TITLE } from './catalog';
import { askIdentity, draftToAnswer, expandWithDrafts, inlineOf, isVirtual, readyToSend, shownDraft, walkScreens, type Draft } from './flowDraft';
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

type Step = { kind: 'known' } | Screen;
type Store = { v2: Record<string, Draft>; at: number; ours?: string[] };

const isFile = (a: InfoAsk) => a.prompt.input.kind === 'file';
const isGridAsk = (a: InfoAsk) => ANNUAL_GRIDS.includes(a.itemKey);
const unsureOf = (a?: 'm' | 'f' | 'p') => (a === 'm' ? 'לא בטוח' : a === 'f' ? 'לא בטוחה' : 'לא בטוחים');
const NO_NAME = '';

/** שם קצר לשורה במסך «זה עדיין נכון?» — הנושא, לא השאלה. */
const ROW_LABEL: Record<string, string> = {
  'household.maritalAtYearEnd': 'המשפחה', 'household.children': 'ילדים', 'household.address': 'כתובת', 'household.settlement': 'יישוב',
  'salary.employers': 'עבודה', 'business.active': 'עסק', 'rent.properties': 'נכסים מושכרים', 'capital.accounts': 'חשבונות השקעה',
  'filing.refundAccount': 'חשבון להחזר מס',
};
/** «השתנה» — ובכתובת «עברנו». */
const CHANGE_LABEL: Record<string, string> = { 'household.address': 'עברנו' };
/** הסדר בשורות: משפחה · ילדים · כתובת · עבודה · … · חשבון להחזר (בסוף). */
const rowRank = (a: InfoAsk) => { const k = Object.keys(ROW_LABEL).indexOf(a.itemKey); return k < 0 ? 50 : a.itemKey === 'filing.refundAccount' ? 99 : k; };
const rowLabel = (a: InfoAsk) => a.prompt.known?.[0]?.[0] ?? ROW_LABEL[a.itemKey] ?? a.prompt.title.replace(/ — זה מה שידוע לנו$/, '');

function readLocal(key: string): Store | null {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as Store : null; } catch { return null; }
}
function writeLocal(key: string, v: Store | null) {
  try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* מצב פרטי — הטיוטה בשרת */ }
}

/** שורה ב«זה עדיין נכון?»: מה שמוצג מהתיק (אישור — השורות; רשומה ממולאת — הסיכום). */
function rowValue(a: InfoAsk): string[] {
  const input = a.prompt.input;
  if (a.prompt.known?.[0]) return [a.prompt.known[0][1]];
  if (input.kind === 'confirm') return input.lines;
  if (input.kind === 'record') {
    const schema = schemaFor(input.schema, undefined, input.context);
    return (input.initial ?? []).map(r => schema.summary(r)).filter(Boolean);
  }
  return [];
}

export default function AnnualFlow({ stepId, token, title, initialAsks, fetchAsks, onClose }: Props) {
  const preview = !token;
  const localKey = `ty-draft:${stepId}`;
  const [asks, setAsks] = useState<InfoAsk[]>(initialAsks);
  // השאלה שבה נשמרת הטיוטה בשרת — מסך הריבועים הראשון שעוד פתוח, אחרת השאלה הפתוחה הראשונה
  const anchor = useMemo(() => {
    const open = sortAsks(asks).filter(a => a.state === 'published' && !isFile(a) && !isVirtual(a));
    return open.find(isGridAsk) ?? open[0];
  }, [asks]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const server = (initialAsks.find(a => (a.savedDraft as Store | undefined)?.v2)?.savedDraft as Store | undefined) ?? null;
    const local = preview ? null : readLocal(localKey);
    const best = [server, local].filter((x): x is Store => !!x).sort((a, b) => b.at - a.at)[0];
    return best?.v2 ?? {};
  });
  // ‼ סבב 2: «השתנה» נערך בתוך השורה — אין יותר מסך נפרד לאישור שהשתנה
  const opened = useMemo(() => new Set<string>(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [shake, setShake] = useState(0);
  const [help, setHelp] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [docOpen, setDocOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ours, setOurs] = useState<string[]>(() => (preview ? [] : readLocal(`${localKey}:ours`)?.ours ?? []));
  const hasOpen = (list: InfoAsk[]) => list.some(a => a.state === 'published' && !isFile(a));
  const [phase, setPhase] = useState<'ask' | 'docs'>(() => (hasOpen(initialAsks) ? 'ask' : 'docs'));
  const flowRef = useRef<HTMLDivElement>(null);

  const expanded = useMemo(() => expandWithDrafts(asks, drafts), [asks, drafts]);
  const grid = expanded.find(isGridAsk);
  const steps: Step[] = useMemo(() => {
    const walk = walkScreens(expanded, opened);
    // ‼ כשיש אישורים מהכרטיס — הם המסך הראשון («זה עדיין נכון?»); בלי אישורים — «מה כבר ידוע לנו» לתצוגה בלבד
    const hasConfirm = walk.some(s => s.kind === 'confirmAll' || (s.kind === 'ask' && s.ask.prompt.input.kind === 'confirm'));
    const known = !hasConfirm && grid && grid.state === 'published' && (grid.prompt.known?.length ?? 0) > 0 ? [{ kind: 'known' as const }] : [];
    return [...known, ...walk];
  }, [expanded, opened, grid]);
  const [i, setI] = useState(() => {
    // חזרה מאותו קישור: למסך הראשון שעוד אין לו תשובה בטיוטה
    const k = steps.findIndex(s => s.kind !== 'known' && screenAsks(s).some(a => a.state === 'published' && !drafts[askIdentity(a)]));
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

  // ‼ «הבא» כשחסר משהו: גוללים אל הדבר הראשון שחסר, והוא רועד קלות (בלי הודעת שגיאה למטה)
  useEffect(() => {
    if (!shake) return;
    const el = flowRef.current?.querySelector<HTMLElement>('.is-bad, .has-err');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('ty-shake'); void el.offsetWidth; el.classList.add('ty-shake');
  }, [shake]);
  const fail = () => { setTried(true); setShake(n => n + 1); };

  const idx = Math.max(0, Math.min(steps.length - 1, i));
  const step = steps[idx];
  const last = idx === steps.length - 1;
  const progress = Math.round((idx / Math.max(1, steps.length)) * 100);
  const go = (n: number) => { setTried(false); setErr(null); setHelp(null); setI(Math.max(0, n)); window.scrollTo?.({ top: 0 }); };

  const top = (
    <>
      <div className="ty-flow-top"><span /><span className={`ty-saved${saved ? ' is-on' : ''}`} aria-live="polite">{saved ? 'נשמר ✓' : ''}</span></div>
      <div className="ty-progress" role="progressbar" aria-valuenow={phase === 'docs' ? 100 : progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${phase === 'docs' ? 100 : progress}%` }} /></div>
      {preview && <div className="ty-note">תצוגה בלבד — כך זה ייראה ללקוח. אין כאן שליחה.</div>}
    </>
  );

  // ── המסך שעוד חסרה בו תשובה (לפני השליחה) ──
  // ‼ אותו בדיקה במסך ובשליחה — בשליחה מהמסך האחרון התשובות הטריות עוד לא בסטייט (מעבירים אותן)
  const answeredIn = (dr: Record<string, Draft>, a: InfoAsk) => a.state !== 'published' || !!(dr[askIdentity(a)] && draftToAnswer(a, dr[askIdentity(a)]));
  const rowOkIn = (dr: Record<string, Draft>, a: InfoAsk): boolean => {
    if (a.state !== 'published') return true;
    const d = dr[askIdentity(a)];
    if (!d?.choice) return false;
    if (d.choice === 'yes') return true;
    const inl = inlineOf(expanded, a);
    return !!draftToAnswer(a, d) && inl.every(x => !!dr[askIdentity(x)] && !!draftToAnswer(x, dr[askIdentity(x)]));
  };
  const screenOkIn = (dr: Record<string, Draft>, s: Step) => s.kind === 'known' || s.kind === 'checklist'
    || (s.kind === 'confirmAll' ? s.asks.every(a => rowOkIn(dr, a)) : screenAsks(s).every(a => isGridAsk(a) || answeredIn(dr, a)));
  const rowOk = (a: InfoAsk) => rowOkIn(drafts, a);

  const send = async (fresh?: Record<string, Draft>) => {
    if (preview) return;
    const drafts0 = fresh ?? drafts;
    const miss = steps.findIndex(s => !screenOkIn(drafts0, s));
    if (miss >= 0) { go(miss); window.setTimeout(fail, 30); return; }
    setBusy(true); setErr(null);
    // ‼ מסך ריבועים שלא נגעו בו — מה שמוצג (סימון מראש) הוא התשובה, וריק = «לא היה כלום»
    const dd = { ...drafts0 };
    // ‼ מסך סימון שלא נגעו בו — «לא» על כל שאלה בו
    for (const a of expanded.filter(a => a.state === 'published' && !dd[askIdentity(a)] && checklistParent(a))) dd[askIdentity(a)] = { choice: 'no' };
    for (const g of expanded.filter(a => isGridAsk(a) && a.state === 'published' && !dd[askIdentity(a)])) {
      const s = shownDraft(g, undefined);
      dd[askIdentity(g)] = s.selected?.length ? s : { none: true, selected: [] };
    }
    // מה שאנחנו מוציאים — מהריבועים שסומנו (לפני שהטיוטה נמחקת)
    const oursNow = [...new Set(expanded.filter(isGridAsk).flatMap(g => {
      const gd = dd[askIdentity(g)];
      return g.prompt.input.kind === 'multi' && gd?.selected ? g.prompt.input.options.filter(o => gd.selected!.includes(o.key)).flatMap(o => o.ours ?? []) : [];
    }))];
    let cur = asks;
    try {
      const dir = { v: null as Awaited<ReturnType<typeof loadBankDirectory>> | null, loaded: false };
      for (let pass = 0; pass < 6; pass++) {
        const ready = readyToSend(sortAsks(expandWithDrafts(cur, dd)), dd);
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

  const sendLabel = (
    <><svg className="ty-send-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-3-6z" /></svg>{busy ? 'שולח…' : 'שליחה למשרד'}</>
  );
  const nav = (onNext: () => void, label?: string, quiet = false) => (
    <>
      {err && <div className="ty-err" role="alert">{err}</div>}
      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={idx === 0 || busy} onClick={() => go(idx - 1)}>הקודם</button>
        <button type="button" className={`btn btn-primary${quiet ? ' is-quiet' : ''}`} disabled={busy || (last && preview)} onClick={onNext} data-annual-send={last ? '' : undefined}>
          {last ? sendLabel : label ?? 'הבא'}
        </button>
      </div>
    </>
  );
  const advance = () => (last ? void send() : go(idx + 1));

  // ── אחרי השליחה: המסמכים, רק בסוף ──
  if (phase === 'docs') {
    const files = sortAsks(asks).filter(a => isFile(a) && (a.state === 'published' || (a.state === 'unavailable' && a.unavailable?.code !== 'needHelp')));
    const done = sortAsks(asks).filter(a => isFile(a) && a.state === 'answered');
    const help2 = asks.filter(a => isFile(a) && a.state === 'unavailable' && a.unavailable?.code === 'needHelp');
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
    const total = left + done.length;
    // ‼ סבב 2: המסמכים לפי אדם (שם על כל קבוצה), ומה שמשותף — בסוף
    const rank = (n: string) => { const r = [...files, ...done].find(a => (a.prompt.subjectName ?? NO_NAME) === n)?.subjectRole; return n === NO_NAME ? 3 : r === 'client' ? 0 : r === 'spouse' ? 1 : 2; };
    const people = [...new Set([...files, ...done].map(a => a.prompt.subjectName ?? NO_NAME))].sort((x, y) => rank(x) - rank(y));
    const byPerson = people.length > 1;
    const row = (a: InfoAsk) => (
      <li key={a.id} className={`ty-owed-item${a.state === 'unavailable' ? ' is-later' : ''}`} data-owed={a.id}>
        <div className="ty-owed-row">
          <span className="ty-owed-title"><b>{a.prompt.title}</b>
            <small>{[byPerson ? '' : a.prompt.subjectName, a.state === 'unavailable' ? UNAVAILABLE_LABEL[a.unavailable?.code ?? 'legacy'] : ''].filter(Boolean).join(' · ')}</small></span>
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
    );
    const doneRow = (a: InfoAsk) => (
      <li key={a.id} className="ty-owed-item is-done" data-done={a.id}>
        <div className="ty-owed-row"><span className="ty-owed-title"><b>{a.prompt.title}</b>{!byPerson && a.prompt.subjectName && <small>{a.prompt.subjectName}</small>}</span><span className="ty-done-tag">✓</span></div>
      </li>
    );
    return (
      <div className="ty-flow" aria-live="polite" data-finish data-annual-docs ref={flowRef}>
        {top}
        <p className="ty-q">{left ? 'קיבלנו. עכשיו המסמכים' : done.length ? 'הכול הועלה. תודה!' : 'קיבלנו. תודה!'}</p>
        {total > 0 && <p className="ty-q-sub" data-doc-count>{done.length} מתוך {total}{left ? ' · אפשר גם אחר כך, מאותו קישור' : ''}</p>}
        {people.map(p => {
          const mine = (l: InfoAsk[]) => l.filter(a => (a.prompt.subjectName ?? NO_NAME) === p);
          return (
            <section key={p || 'home'} className="ty-docs-person">
              {byPerson && <span className={`ty-person${p === NO_NAME ? ' is-home' : ''}`}><i aria-hidden="true">{p ? p[0] : '✱'}</i>{p || 'המשפחה'}</span>}
              <ul className="ty-owed-list">{mine(files).map(row)}{mine(done).map(doneRow)}</ul>
            </section>
          );
        })}
        {help2.length > 0 && <p className="ty-q-sub" role="note">ביקשת עזרה ב{help2.length === 1 ? `: ${help2[0].prompt.title}` : `-${help2.length} מסמכים`}. המשרד יחזור אליך.</p>}
        {ours.length > 0 && <p className="ty-ours" data-ours>{ours.length === 1 && ours[0].includes('ביטוח לאומי') ? 'ביטוח לאומי — אנחנו מוציאים.' : `אנחנו מוציאים בעצמנו: ${ours.join(' · ')}`}</p>}
        <div className="ty-actions">
          {hasOpen(asks) && <button type="button" className="btn btn-ghost" onClick={() => { setPhase('ask'); go(0); }}>לחזור לשאלות</button>}
          {onClose && <button type="button" className="btn btn-primary" onClick={onClose}>{left ? 'אמשיך אחר כך' : 'סיימתי'}</button>}
        </div>
      </div>
    );
  }

  // ── מסך «מה כבר ידוע לנו» (בלי אישורים מהכרטיס — לתצוגה בלבד) ──
  if (step.kind === 'known' && grid) {
    const gd = drafts[askIdentity(grid)] ?? {};
    return (
      <div className="ty-flow" data-screen="known" ref={flowRef}>
        {top}
        <p className="ty-q">{title}</p>
        <p className="ty-q-sub">5 דקות. הכול נשמר.</p>
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

  // ── «זה עדיין נכון?» — כל שורה: «נכון» מקפל ל-✓, «השתנה» נפתח בתוכה ──
  const scr = step as Screen;
  if (scr.kind === 'confirmAll') {
    const list = scr.asks;
    const next = () => (list.every(rowOk) ? advance() : fail());
    return (
      <div className="ty-flow" data-screen="confirmAll" ref={flowRef}>
        {top}
        <p className="ty-q" id="q-confirm-all">זה עדיין נכון?</p>
        {idx === 0 && <p className="ty-q-sub">5 דקות. הכול נשמר.</p>}
        <ul className="ty-krows" aria-labelledby="q-confirm-all">
          {[...list].sort((x, y) => rowRank(x) - rowRank(y)).map(a => <KnownRow key={a.id} ask={a} drafts={drafts} putDrafts={putDrafts} inline={inlineOf(expanded, a)} bad={tried && !rowOk(a)} preview={preview} />)}
        </ul>
        {nav(next)}
      </div>
    );
  }

  // ── 22.10.2026 · סבב 2.1: מסך סימון — שאלות כן/לא מאותו נושא (חו״ל, מכירה, נכס מושכר, עסק); מה שלא סומן — «לא» ──
  if (scr.kind === 'checklist') {
    const list = scr.asks;
    const lead = list[0];
    const yes = (a: InfoAsk) => drafts[askIdentity(a)]?.choice === 'yes';
    const any = list.some(yes);
    const nextC = () => {
      const patch: Record<string, Draft> = {};
      for (const a of list) if (a.state === 'published' && !yes(a)) patch[askIdentity(a)] = { choice: 'no' };
      const nd = { ...drafts, ...patch };
      putDrafts(patch);
      const ns = [...(steps[0]?.kind === 'known' ? [{ kind: 'known' as const }] : []), ...walkScreens(expandWithDrafts(asks, nd), opened)];
      const at = ns.findIndex(s => s.kind !== 'known' && screenAsks(s).some(x => askIdentity(x) === askIdentity(lead)));
      const to = (at >= 0 ? at : idx) + 1;
      if (to >= ns.length) { void send(nd); return; }
      go(to);
    };
    const title = (CHECKLIST_TITLE[scr.parent] ?? '').split('{entity}').join('העסק').split('{year}').join(String(lead.taxYear));
    return (
      <div className="ty-flow" data-screen="checklist" data-person={lead.subjectRole} ref={flowRef}>
        {top}
        {lead.prompt.subjectName && <span className={`ty-person${lead.subjectRole === 'spouse' ? ' is-p2' : ''}`}><i aria-hidden="true">{lead.prompt.subjectName[0]}</i>{lead.prompt.subjectName}</span>}
        <p className="ty-q" id={`q-${lead.id}`}>{title}</p>
        <div className="ty-checks" role="group" aria-labelledby={`q-${lead.id}`}>
          {list.map(a => (
            <button key={a.id} type="button" className="ty-check" aria-pressed={yes(a)} data-check={a.itemKey} disabled={a.state !== 'published'}
              onClick={() => putDrafts({ [askIdentity(a)]: { choice: yes(a) ? 'no' : 'yes' } })}>
              <span className="ty-check-box" aria-hidden="true">{yes(a) ? '✓' : ''}</span>{a.prompt.checkLabel ?? CHECKLIST_LABEL[a.itemKey]?.replace(/ או [^,]*{spouse}$/, '')}
            </button>
          ))}
        </div>
        {nav(nextC, any ? 'הבא' : 'אף אחד מאלה — הבא', !any)}
      </div>
    );
  }

  // ── שאלה (או כמה אנשים באותה שאלה) ──
  const list = screenAsks(scr);
  const first = list[0];
  const sent = list.every(a => a.state !== 'published');
  const isGrid = isGridAsk(first);
  const gridDraft = isGrid ? shownDraft(first, drafts[askIdentity(first)]) : undefined;
  const gridEmpty = isGrid && first.state === 'published' && !gridDraft?.none && !(gridDraft?.selected?.length);
  const next = () => {
    const patch: Record<string, Draft> = {};
    // ‼ מסך ריבועים בלי סימון = «לא היה כלום» (הכפתור אמר את זה); «משהו אחר?» נשמר כהערה למשרד
    if (isGrid && first.state === 'published' && gridEmpty) patch[askIdentity(first)] = { ...gridDraft, none: true, selected: [] };
    const valid = list.every(a => a.state !== 'published' || patch[askIdentity(a)] || !!draftToAnswer(a, shownDraft(a, drafts[askIdentity(a)])));
    if (!sent && !valid) { fail(); return; }
    // מה שמוצג (גם סימון מראש) הוא התשובה — נשמר בטיוטה, וההמשך שלו נכנס מיד אחרי המסך הזה
    for (const a of list) if (a.state === 'published' && !patch[askIdentity(a)]) patch[askIdentity(a)] = shownDraft(a, drafts[askIdentity(a)]);
    const nd = { ...drafts, ...patch };
    putDrafts(patch);
    const ns = [...(steps[0]?.kind === 'known' ? [{ kind: 'known' as const }] : []), ...walkScreens(expandWithDrafts(asks, nd), opened)];
    const at = ns.findIndex(s => s.kind !== 'known' && screenAsks(s).some(a => askIdentity(a) === askIdentity(first)));
    const to = (at >= 0 ? at : idx) + 1;
    if (to >= ns.length) { void send(nd); return; }
    go(to);
  };
  const person = first.prompt.subjectName;
  return (
    <div className="ty-flow" data-screen={isGrid ? 'grid' : scr.kind === 'group' ? 'group' : first.prompt.input.kind} data-person={isGrid ? first.subjectRole : undefined} ref={flowRef}>
      {top}
      {first.prompt.correction && <div className="ty-correction" role="note"><b>המשרד ביקש לתקן:</b> {first.prompt.correction}</div>}
      {isGrid && person && <span className={`ty-person${first.subjectRole === 'spouse' ? ' is-p2' : ''}`}><i aria-hidden="true">{person[0]}</i>{person}</span>}
      <p className="ty-q" id={`q-${first.id}`}>{first.prompt.title}</p>
      {!isGrid && scr.kind === 'ask' && (first.prompt.subjectName || first.prompt.periodText) && (
        <p className="ty-q-meta">
          {first.prompt.subjectName && <span className="ty-tag">{first.prompt.subjectName}</span>}
          {first.prompt.periodText && <span className="ty-tag is-period">{first.prompt.periodText}</span>}
        </p>
      )}
      {first.prompt.hint && !isGrid && scr.kind === 'ask' && <p className="ty-hint" id={`h-${first.id}`}>{first.prompt.hint}</p>}
      {scr.kind === 'ask' && !!first.prompt.onCard?.length && (
        <>
          <p className="ty-known-h">כבר אצלנו</p>
          <dl className="ty-known" data-on-card>{first.prompt.onCard.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </>
      )}
      {sent && <span className="ty-done-mark">✓ נשלח קודם</span>}
      {list.map(a => {
        const d = shownDraft(a, drafts[askIdentity(a)]);
        const setD = (p: Draft) => putDrafts({ [askIdentity(a)]: { ...shownDraft(a, drafts[askIdentity(a)]), ...p } });
        const bad = tried && a.state === 'published' && !draftToAnswer(a, d);
        return (
          <div key={a.id} className={scr.kind === 'group' ? `ty-group-card${bad ? ' is-bad' : ''}` : bad ? 'ty-ask-wrap is-bad' : undefined}>
            {scr.kind === 'group' && <p className="ty-group-who"><span className={`ty-person${a.subjectRole === 'spouse' ? ' is-p2' : ''}`}><i aria-hidden="true">{(a.prompt.subjectName ?? 'א')[0]}</i>{a.prompt.subjectName ?? 'שלך'}</span>{a.prompt.input.kind === 'record' && (a.prompt.input.initial?.length ?? 0) > 0 && <small className="ty-from-card">מהתיק</small>}</p>}
            {a.state === 'published' && (isGrid
              ? <GridTiles ask={a} d={d} setD={setD} help={help} setHelp={setHelp} other={!!otherOpen[a.id] || !!d.note} openOther={() => setOtherOpen(o => ({ ...o, [a.id]: true }))} />
              : <AskInput ask={a} d={d} setD={setD} tried={tried} preview={preview} />)}
            {a.state !== 'published' && scr.kind === 'group' && <span className="ty-done-mark">✓ נשלח קודם</span>}
            {bad && <span className="ty-need">{a.prompt.input.kind === 'multi' ? 'בחרו לפחות אחד' : 'חסר כאן'}</span>}
          </div>
        );
      })}
      {first.prompt.why && !isGrid && <details className="ty-why-q"><summary>למה שואלים?</summary><p>{first.prompt.why}</p></details>}
      {nav(next, gridEmpty ? 'לא היה כלום — הבא' : 'הבא', gridEmpty)}
    </div>
  );
}

// ── שורה ב«זה עדיין נכון?» ──────────────────────────────────────────────────────────────────────────────────
function KnownRow({ ask, drafts, putDrafts, inline, bad, preview }: {
  ask: InfoAsk; drafts: Record<string, Draft>; putDrafts: (p: Record<string, Draft>) => void; inline: InfoAsk[]; bad: boolean; preview: boolean;
}) {
  const id = askIdentity(ask);
  const d = drafts[id] ?? {};
  const value = rowValue(ask);
  const label = rowLabel(ask);
  const who = ask.prompt.subjectName;
  if (ask.state !== 'published') {
    return <li className="ty-krow is-done" data-confirm={ask.itemKey}><span className="ty-krow-tick" aria-hidden="true">✓</span><span className="ty-krow-t"><b>{label}</b>נשלח קודם</span></li>;
  }
  // ‼ «נכון» — השורה מתקפלת ל-✓ (טאפ פותח שוב)
  if (d.choice === 'yes') {
    return (
      <li data-confirm={ask.itemKey}>
        <button type="button" className="ty-krow is-done" onClick={() => putDrafts({ [id]: { ...d, choice: undefined } })} aria-label={`${label}: נכון — לפתוח שוב`}>
          <span className="ty-krow-tick" aria-hidden="true">✓</span>
          <span className="ty-krow-t"><b>{label}{who ? ` · ${who}` : ''}</b>{value.join(' · ')}</span>
        </button>
      </li>
    );
  }
  const input = ask.prompt.input;
  const set = (p: Draft) => putDrafts({ [id]: { ...d, ...p } });
  const edit = input.kind === 'confirm' ? input.edit : input.kind === 'record' ? { schema: input.schema, initial: input.initial, context: input.context } : undefined;
  const rec: RecordAnswer = d.record ?? { items: ((edit?.initial ?? []) as RecordAnswer['items']) };
  // ‼ בחירה בתוך השורה (המשפחה / הילדים): הבחירה שלה, וגם טקסט השינוי של השורה עצמה — שמות מה שנבחר
  const pickInline = (x: InfoAsk, key: string) => {
    if (x.prompt.input.kind !== 'multi') return;
    const xd = drafts[askIdentity(x)] ?? {};
    const sel = (xd.selected ?? []).includes(key) ? (xd.selected ?? []).filter(k => k !== key) : [...(xd.selected ?? []), key];
    const labels = x.prompt.input.options.filter(o => sel.includes(o.key)).map(o => o.label).join(' · ');
    const patch: Record<string, Draft> = { [askIdentity(x)]: { ...xd, none: false, selected: sel }, [id]: { ...d, choice: 'changed', text: labels } };
    // נולד ילד ⇒ שורה חדשה ברשימת הילדים (שם ותאריך לידה)
    if (edit && key === 'household.newChild') {
      const base = (edit.initial ?? []) as RecordAnswer['items'];
      patch[id] = { ...patch[id], record: sel.includes(key) ? { items: [...base, {}] } : { items: base } };
    }
    putDrafts(patch);
  };
  const newChild = inline.some(x => (drafts[askIdentity(x)]?.selected ?? []).includes('household.newChild'));
  // ‼ נולד ילד — רק השם ותאריך הלידה של הילד החדש (הרשימה שבתיק נשלחת כמו שהיא); שאר השורות — עריכה מלאה
  const kidOnly = ask.itemKey === 'household.children' && newChild;
  const showEditor = d.choice === 'changed' && !!edit && !inline.length;
  const kid = (rec.items[rec.items.length - 1] ?? {}) as Record<string, string>;
  const setKid = (patch: Record<string, string>) => set({ record: { items: [...rec.items.slice(0, -1), { ...kid, ...patch }] } });
  return (
    <li className={`ty-krow-card${bad ? ' is-bad' : ''}`} data-confirm={ask.itemKey}>
      <div className="ty-krow-l">{label}{who && <span className="ty-who">{who}</span>}</div>
      <div className="ty-krow-v">{value.length ? value.map((l, k) => <span key={k}>{l}</span>) : <span>אין אצלנו פרטים</span>}</div>
      <div className="ty-seg" role="group" aria-label={`${label}: נכון או השתנה`}>
        <button type="button" aria-pressed={false} onClick={() => set({ choice: 'yes', text: undefined, record: undefined })}>נכון</button>
        <button type="button" aria-pressed={d.choice === 'changed'} onClick={() => set({ choice: 'changed' })}>{CHANGE_LABEL[ask.itemKey] ?? 'השתנה'}</button>
      </div>
      {d.choice === 'changed' && (
        <div className="ty-krow-sub">
          {inline.map(x => x.prompt.input.kind === 'multi' && (
            <div key={x.id} className="ty-chips" role="group" aria-label={x.prompt.title}>
              {x.prompt.input.options.map(o => {
                const on = (drafts[askIdentity(x)]?.selected ?? []).includes(o.key);
                return <button key={o.key} type="button" className="ty-chip" aria-pressed={on} onClick={() => pickInline(x, o.key)}>{o.label}</button>;
              })}
            </div>
          ))}
          {kidOnly && d.choice === 'changed' && (
            <div className="ty-kid">
              <label className={`ty-field${bad && !kid.firstName ? ' has-err' : ''}`}>שם<input value={kid.firstName ?? ''} onChange={e => setKid({ firstName: e.target.value })} /></label>
              <label className={`ty-field${bad && !kid.birthDate ? ' has-err' : ''}`}>תאריך לידה<input type="date" dir="ltr" max={new Date().toISOString().slice(0, 10)} value={kid.birthDate ?? ''} onChange={e => setKid({ birthDate: e.target.value })} /></label>
            </div>
          )}
          {showEditor && edit && <RecordEditor schemaId={edit.schema} context={edit.context} value={rec} onChange={v => set({ record: v })} showErrors={bad} disabled={preview} />}
          {!edit && !inline.length && <label className="ty-field">מה השתנה?<textarea value={d.text ?? ''} onChange={e => set({ text: e.target.value })} /></label>}
        </div>
      )}
      {bad && <span className="ty-need">חסר כאן</span>}
    </li>
  );
}

// ── מסך הריבועים של אדם אחד ──────────────────────────────────────────────────────────────────────────────────
function GridTiles({ ask, d, setD, help, setHelp, other, openOther }: {
  ask: InfoAsk; d: Draft; setD: (p: Draft) => void; help: string | null; setHelp: (k: string | null) => void; other: boolean; openOther: () => void;
}) {
  const input = ask.prompt.input;
  if (input.kind !== 'multi') return null;
  const toggle = (key: string, on: boolean) => setD({ none: false, selected: on ? (d.selected ?? []).filter(k => k !== key) : [...(d.selected ?? []), key] });
  return (
    <div className="ty-grid-wrap" role="group" aria-labelledby={`q-${ask.id}`}>
      <div className="ty-grid">
        {input.options.map(o => {
          const on = !d.none && (d.selected ?? []).includes(o.key);
          const hk = `${ask.id}:${o.key}`;
          return (
            <div key={o.key} className={`ty-tile2${on ? ' is-on' : ''}`}>
              <button type="button" className="ty-tile2-main" aria-pressed={on} data-tile={o.key} onClick={() => toggle(o.key, on)}>
                <span className="ty-tile2-ic"><TileIcon k={o.key} /><span className="ty-tile2-ok" aria-hidden="true">✓</span></span>
                <b>{o.label}</b>
                {o.example && <small className="ty-tile-ex">{o.example}</small>}
                {o.note && <small className="ty-tile-note">{o.note}</small>}
              </button>
              {o.hint && <button type="button" className="ty-tile2-q" aria-label={`מה זה — ${o.label}?`} aria-expanded={help === hk} onClick={() => setHelp(help === hk ? null : hk)}><span>?</span></button>}
              {help === hk && o.hint && <p className="ty-tile2-help">{o.hint}</p>}
            </div>
          );
        })}
      </div>
      {ask.prompt.otherNote && (other
        ? <input className="ty-other" aria-label="משהו אחר" placeholder="זכייה, תמלוגים, השכרת ציוד…" value={d.note ?? ''} autoFocus={!d.note} onChange={e => setD({ note: e.target.value })} />
        : <button type="button" className="ty-link ty-other-link" onClick={openOther}>משהו אחר?</button>)}
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
    const tile = (o: (typeof input.options)[number]) => {
      const on = !d.none && (d.selected ?? []).includes(o.key);
      return (
        <button key={o.key} type="button" className="ty-tile" aria-pressed={on} data-tile={o.key} onClick={() => toggle(o.key, on)}>
          <span className="ty-tile-check" aria-hidden="true">{on ? '✓' : ''}</span>
          <span className="ty-tile-text"><b>{o.label}</b>{o.example && <small className="ty-tile-ex">{o.example}</small>}{o.note && <small className="ty-tile-note">{o.note}</small>}</span>
        </button>
      );
    };
    return (
      <div className="ty-grid-wrap" role="group" aria-labelledby={`q-${ask.id}`}>
        <div className="ty-grid">{input.options.map(tile)}</div>
        <button type="button" className="ty-tile is-wide" aria-pressed={!!d.none} data-tile="none" onClick={() => setD({ none: !d.none, selected: [] })}>אף אחד מאלה</button>
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
