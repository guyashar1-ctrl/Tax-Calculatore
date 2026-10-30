// ─── הדף האישי: «השלמת מידע» — מסך אחד בכל פעם (229; 13.10.2026; 16.10.2026) ─────────────────
// ‼ בלי מונחי מס ובלי קודי טופס. מתחת לשאלה — הסבר קצר וגלוי ועל איזו תקופה שואלים; «למה שואלים?» מקופל.
// ‼ כל תשובה נשלחת מיד לשרת (portal_submit_tax_info) — יציאה באמצע לא מאבדת כלום; «שמירה ויציאה» שומר
//   טיוטה בשרת לשאלה הנוכחית (לא בדפדפן). חלקי מסמך שעוד לא נשלחו — במכשיר (partsStore).
// ‼ 13.10.2026 · נתונים מובנים (ילדים, חשבון בנק, מעסיק…) — בשדות נפרדים (RecordEditor), לא בתיבה אחת.
// ‼ 13.10.2026 · מסמך שאין עכשיו — «אעלה בהמשך» / «עוד לא קיבלתי» / «צריך עזרה» / «לא רלוונטי לי». ארבע
//   משמעויות שונות. «אין לי עדיין» שנשמר לפני כן — מוצג כפי שהוא, בלי לייחס לו משמעות חדשה.
// ‼ 13.10.2026 · סיום: «התשובות נשלחו למשרד» ובנפרד «נשארו N מסמכים» — עם העלאה ישירה לכל אחד, בלי לעבור
//   שוב על השאלון. הבקשה אינה «הושלמה» כשחסרים מסמכים.
// ‼ 16.10.2026 («בקשה אחת לתיק המס» שלב 2) · שלושה מסכים חדשים: «מה שכבר ידוע לנו — נכון?» (כל אישורי הכרטיס
//   במסך אחד; «יש שינוי» פותח את העריכה של השורה), מסך הרשת «סמנו מה יש לכם» (שאלות הפתיחה; מה שמסומן פותח
//   מיד את «של מי / איפה»), ו«של מי / איפה» — רשימות סגורות עם חיפוש (src/data/institutions.ts). screens.ts.
// ‼ בתצוגה מקדימה (מהמשרד) אין שליחה ואין העלאה.

import { useEffect, useMemo, useState } from 'react';
import { DOCS } from './documents';
import * as api from './api';
import { ANNUAL_GRIDS, UNAVAILABLE_LABEL, type AskAnswer } from './asks';
import AnnualFlow from './AnnualFlow';
import type { EntityField, EntitySpec, InfoAsk, UnavailableCode } from './types';
import { livePortalActions } from '../../components/portal/portalActions';
import RecordEditor from './RecordEditor';
import { answerValid, cleanRecord, schemaFor, type RecordAnswer } from './records';
import { loadBankDirectory } from './RecordEditor';
import { WHO_OPTIONS, cleanEntity, entityValid, validateEntity, type EntityItem } from './entities';
import { INSTITUTION_LISTS, searchInstitutions, type InstitutionListId } from '../../data/institutions';
import { firstOpenScreen, isWealthQuestionnaire, orderScreens, screenAsks, WEALTH_PARTS, wealthPartOf, type Screen } from './screens';
import DocPartsPicker from '../identity/DocPartsPicker';
import './taxYear.css';

interface Props {
  /** חי: טוקן ובקשה. תצוגה מקדימה מהמשרד: השאלות עצמן (גם טיוטה). */
  stepId: string;
  token?: string;
  previewClientId?: string;
  /** תצוגה מקדימה מהמשרד — השאלות שכבר נטענו (כולל טיוטה, שהלקוח יראה אחרי פרסום). */
  previewAsks?: InfoAsk[];
  /** «חזרה לבקשות» / «סגירה» — רק אז הדף מתרענן (אחרת התודה נעלמת לפני שנקראה). */
  onClose?: () => void;
  /** המסך הייעודי מציג כותרת משלו (שם התהליך, האדם, התקופה) — כאן רק ההתקדמות. */
  onTitle?: (title: string) => void;
}

type Draft = { choice?: string; text?: string; amount?: string; note?: string; reason?: string; record?: RecordAnswer; code?: UnavailableCode | 'notRelevant';
  /** מסך הרשת: המפתחות שסומנו; `none` — «אין לנו אף אחד מאלה». */
  selected?: string[]; none?: boolean;
  /** של מי / איפה. */
  items?: EntityItem[] };

/** מסמך שעדיין אצל הלקוח: «אין לי עדיין» (גם ישן, בלי קוד), «אעלה בהמשך», «עוד לא קיבלתי». «צריך עזרה» — אצל המשרד. */
const clientOwes = (a: InfoAsk) => a.state === 'unavailable' && a.unavailable?.code !== 'needHelp';
const UNAV_CHOICES: { code: UnavailableCode | 'notRelevant'; label: string; ask?: string }[] = [
  { code: 'later', label: 'אעלה בהמשך' },
  { code: 'notYet', label: 'עוד לא קיבלתי את המסמך', ask: 'ממי מחכים? (לא חובה)' },
  { code: 'needHelp', label: 'אין לי — צריך עזרה', ask: 'מה הבעיה? (לא חובה — המשרד יחזור אליך)' },
  { code: 'notRelevant', label: 'לא רלוונטי לי', ask: 'למה? (לא חובה — המשרד יבדוק)' },
];
const screenDone = (s: Screen) => screenAsks(s).every(a => a.state !== 'published');

export default function TaxInfoFlow({ stepId, token, previewClientId, previewAsks, onClose, onTitle }: Props) {
  const preview = !token;
  const [title, setTitle] = useState('השלמת מידע');
  const [asks, setAsks] = useState<InfoAsk[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  /** אישורי כרטיס שסומן בהם «יש שינוי» — יוצאים ממסך האישור למסך משלהם. */
  const [opened, setOpened] = useState<Set<string>>(new Set());
  /** מסך האישור: מה סומן לכל שורה (ברירת מחדל: נכון). */
  const [marks, setMarks] = useState<Record<string, 'ok' | 'changed'>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [tried, setTried] = useState(false);
  /** במסך הסיום: המסמך שפתוח עכשיו להעלאה. */
  const [docOpen, setDocOpen] = useState<string | null>(null);

  const fetchAsks = async (): Promise<{ title: string; asks: InfoAsk[] }> => {
    const v = token ? await api.portalLoad(token, stepId)
      : previewAsks ? { stepId, taxYear: 0, title: 'השלמת מידע', asks: previewAsks }
      : await api.portalPreview(previewClientId!, stepId);
    return { title: v.title || 'השלמת מידע', asks: v.asks };
  };
  const load = async () => {
    try {
      const v = await fetchAsks();
      setTitle(v.title);
      onTitle?.(v.title);
      setAsks(v.asks);
      setDraft(Object.fromEntries(v.asks.filter(a => a.savedDraft).map(a => [a.id, a.savedDraft as Draft])));
      // ‼ חזרה אחרי «שמירה ויציאה»: למסך הראשון שעוד לא נענה. כשנשארו רק מסמכים — ישר לרשימת המסמכים
      const sc = orderScreens(v.asks, new Set());
      const firstNew = firstOpenScreen(sc);
      setI(firstNew < 0 ? 0 : firstNew);
      setFinished(sc.length > 0 && firstNew < 0);
    } catch (e) { setErr(String((e as Error).message)); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stepId, token, previewClientId]);

  const screens = useMemo(() => (asks ? orderScreens(asks, opened) : []), [asks, opened]);

  if (err && !asks) return <div className="ty-err" role="alert">לא ניתן לטעון את השאלות. נסו שוב מאוחר יותר.</div>;
  if (!asks) return <div className="ty-note">טוען…</div>;
  if (asks.length === 0) return <div className="ty-note">אין כרגע שאלות פתוחות.</div>;
  // ‼ 20.10.2026 · הדוח השנתי — השאלון החדש (טיוטה עד «שליחה», מסמכים בסוף; AnnualFlow.tsx). שאר השאלונים — כאן, כמו קודם.
  if (asks.some(a => ANNUAL_GRIDS.includes(a.itemKey))) return <AnnualFlow stepId={stepId} token={token} title={title} initialAsks={asks} fetchAsks={fetchAsks} onClose={onClose} />;

  const upload = async (ask: InfoAsk, file: File, manifest?: unknown): Promise<string | null> => {
    if (preview) return 'בתצוגה מקדימה אין העלאה';
    const r = await livePortalActions(token!).uploadDocument({ stepId, itemKey: ask.id, file });
    if (!r.ok) return r.error === 'too_large' ? 'הקובץ גדול מדי (עד 10MB).' : r.error === 'type_not_allowed' ? 'סוג קובץ לא נתמך — PDF או תמונה.' : 'ההעלאה נכשלה — נסו שוב.';
    // עקיבות לקבצי המקור (מה צורף ובאיזה סדר) — ליד הראיה. כשל כאן אינו כשל ההעלאה.
    if (manifest) void api.portalNoteEvidenceParts(token!, ask.id, manifest).catch(() => undefined);
    setAsks(list => list!.map(x => (x.id === ask.id ? { ...x, state: 'answered', unavailable: undefined } : x)));
    return null;
  };

  // ── סיום: «נשלח» בנפרד מ«נשארו מסמכים» ──
  if (finished) {
    const owed = asks.filter(clientOwes);
    const help = asks.filter(a => a.state === 'unavailable' && a.unavailable?.code === 'needHelp');
    const open = asks.filter(a => a.state === 'published');
    const answeredAny = asks.some(a => a.state === 'answered');
    return (
      <div className="ty-flow" aria-live="polite" data-finish>
        {answeredAny && <p className="ty-q">התשובות נשלחו למשרד.</p>}
        {owed.length > 0 ? (
          <section className="ty-owed" aria-labelledby="ty-owed-h">
            <p className="ty-owed-h" id="ty-owed-h">{owed.length === 1 ? 'נשאר מסמך אחד להשלמה' : `נשארו ${owed.length} מסמכים להשלמה`}</p>
            <p className="ty-q-sub">אפשר להעלות כל אחד כשהוא אצלך — ישר מכאן, בלי לענות שוב על השאלות.</p>
            <ul className="ty-owed-list">
              {owed.map(a => (
                <li key={a.id} className="ty-owed-item" data-owed={a.id}>
                  <div className="ty-owed-row">
                    <span className="ty-owed-title"><b>{a.prompt.title}</b>{a.prompt.subjectName ? <small>של {a.prompt.subjectName}</small> : null}
                      <small className="ty-owed-why">{UNAVAILABLE_LABEL[a.unavailable?.code ?? 'legacy']}{a.unavailable?.reason && a.unavailable.reason !== UNAVAILABLE_LABEL[a.unavailable.code ?? 'legacy'] ? ` — ${a.unavailable.reason}` : ''}</small></span>
                    {docOpen !== a.id && <button type="button" className="btn btn-sm btn-primary" disabled={preview} onClick={() => setDocOpen(a.id)}>העלאה</button>}
                  </div>
                  {docOpen === a.id && a.prompt.input.kind === 'file' && (
                    <DocPartsPicker docKind={a.prompt.input.docKind} fileName={DOCS[a.prompt.input.docKind]?.label ?? 'מסמך'} storeKey={`${stepId}:${a.id}`} disabled={preview}
                      onConfirm={async (pdf, manifest) => { const e = await upload(a, pdf, manifest); if (!e) setDocOpen(null); return e; }} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : (answeredAny && <p className="ty-q-sub">המשרד יבדוק ויחזור אליך אם צריך משהו נוסף.</p>)}
        {help.length > 0 && (
          <p className="ty-q-sub" role="note">ביקשת עזרה ב{help.length === 1 ? `: ${help[0].prompt.title}` : `-${help.length} מסמכים`}. המשרד יחזור אליך.</p>
        )}
        <div className="ty-actions">
          {open.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setFinished(false); setI(Math.max(0, firstOpenScreen(screens))); }}>לחזור לשאלות שנשארו</button>}
          {onClose && <button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button>}
        </div>
      </div>
    );
  }

  const idx = Math.max(0, Math.min(screens.length - 1, i));
  const screen = screens[idx];
  const doneCount = screens.filter(screenDone).length;
  const progress = Math.round((doneCount / screens.length) * 100);
  // ‼ 27.10.2026 · הצהרת הון בפרקים — צבע לכל פרק (taxYear.css › data-part), כמו בדוח השנתי
  const wealthMode = isWealthQuestionnaire(asks);
  const PART_CSS = { family: 'family', have: 'client', living: 'spouse', flows: 'flows' } as const;
  const part = wealthMode && screen ? PART_CSS[wealthPartOf(screen)] : undefined;
  const parts = wealthMode ? WEALTH_PARTS.filter(p => screens.some(s => wealthPartOf(s) === p.id)).map(p => {
    const inP = screens.filter(s => wealthPartOf(s) === p.id), cur = !!screen && wealthPartOf(screen) === p.id;
    const done = inP.filter(screenDone).length;
    return { ...p, cur, done: done === inP.length, w: done === inP.length ? 100 : Math.max(cur ? 12 : 0, Math.round((done / inP.length) * 100)) };
  }) : [];
  // ‼ בלי לחתוך לפי אורך הרשימה הנוכחית: אחרי מסך האישור ומסך הרשת רשימת המסכים מתארכת, ו-idx נחתך בעת הרינדור
  const go = (n: number) => { setSaved(null); setTried(false); setI(Math.max(0, n)); };
  /** קדימה — רק למסכים שעוד לא נענו. מסמך «אעלה בהמשך» אינו «שאלה פתוחה» — הוא ברשימת המסמכים בסיום. */
  const advanceIn = (list: Screen[], from: number) => {
    const rest = list.findIndex((s, k) => k > from && !screenDone(s));
    if (rest >= 0) { go(rest); return; }
    const any = list.findIndex((s, k) => k !== from && !screenDone(s));
    if (any >= 0) { go(any); return; }
    setFinished(true);
  };
  // ‼ 19.10.2026 · אחרי מסך הרשת הרשימה משתנה (האישורים נענו ויוצאים ממסך האישור המקובץ, ושאלות ההמשך נוספות) — idx הישן
  //   כבר לא מצביע על אותו מסך. ממשיכים מהמקום של השאלה שנענתה ברשימה החדשה, כך ששאלות ההמשך באות מיד אחריה.
  const advance = (list: InfoAsk[], openedNow = opened, fromAskId?: string) => {
    const sc = orderScreens(list, openedNow);
    const at = fromAskId ? sc.findIndex(x => screenAsks(x).some(a => a.id === fromAskId)) : -1;
    advanceIn(sc, at >= 0 ? at : idx);
  };
  const top = (
    <>
      <div className="ty-flow-top">
        <span>{title}</span><span>{idx + 1} מתוך {screens.length}</span>
      </div>
      {parts.length > 1 ? (
        <div className="ty-parts" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות">
          {parts.map(p => <span key={p.id} className={`ty-part${p.cur ? " is-cur" : ""}${p.done ? " is-done" : ""}`} data-part={PART_CSS[p.id]}><span className="ty-part-bar"><i style={{ width: `${p.w}%` }} /></span><span className="ty-part-l">{p.label}</span></span>)}
        </div>
      ) : <div className="ty-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${progress}%` }} /></div>}
      {preview && <div className="ty-note">תצוגה בלבד — כך זה ייראה ללקוח. אין כאן שליחה.</div>}
    </>
  );

  // ── 16.10.2026 · «מה שכבר ידוע לנו — נכון?» — כל אישורי הכרטיס במסך אחד ──
  if (screen.kind === 'confirmAll') {
    const list = screen.asks;
    const submitAll = async () => {
      const changed = list.filter(a => marks[a.id] === 'changed');
      const ok = list.filter(a => marks[a.id] !== 'changed');
      const nextOpened = new Set([...opened, ...changed.map(a => a.id)]);
      setDraft(d => ({ ...d, ...Object.fromEntries(changed.map(a => [a.id, { ...d[a.id], choice: 'changed' }])) }));
      if (preview) { setOpened(nextOpened); const scp = orderScreens(asks, nextOpened); const tp = scp.findIndex(s => s.kind === 'ask' && changed.some(a => a.id === s.ask.id)); if (tp >= 0) go(tp); else advanceIn(scp, idx); return; }
      setBusy(true); setErr(null);
      // ‼ בזה אחר זה (לא במקביל): כל תשובה היא שורה בשרת; מה שנשלח נשאר שלוח גם אם הבאה נכשלת
      const sent: string[] = [];
      let failed = false;
      for (const a of ok) { const r = await api.portalSubmit(token!, a.id, { kind: 'unchanged' }); if (r.ok) sent.push(a.id); else { failed = true; break; } }
      setBusy(false);
      let nextAsks = asks.map(x => (sent.includes(x.id) ? { ...x, state: 'answered' as const, savedDraft: undefined } : x));
      // ‼ 20.10.2026 · «סבב אחד»: אישור «זה עדיין נכון» פתח בשרת את ההמשך (למשל האישור השנתי מחברת הביטוח) — טוענים אותו
      if (ok.some(a => sent.includes(a.id) && (a.prompt.onYes?.length ?? 0) > 0)) {
        try { const v = await fetchAsks(); const known = new Map(nextAsks.map(x => [x.id, x])); nextAsks = v.asks.map(x => known.get(x.id) ?? x); } catch { /* הרענון הבא ישלים */ }
      }
      if (failed) { setAsks(nextAsks); setErr('השליחה נכשלה — נסו שוב'); return; }
      setAsks(nextAsks); setOpened(nextOpened);
      // ‼ «יש שינוי» ⇒ קודם השורות שסומנו (העריכה שלהן), ורק אחר כך ממשיכים
      const sc = orderScreens(nextAsks, nextOpened);
      const target = sc.findIndex(s => s.kind === 'ask' && changed.some(a => a.id === s.ask.id));
      if (target >= 0) go(target); else advanceIn(sc, idx);
    };
    return (
      <div className="ty-flow" data-screen="confirmAll" data-part={part}>
        {top}
        <p className="ty-q" id="q-confirm-all">מה שכבר ידוע לנו — נכון?</p>
        <p className="ty-hint">זה מה שרשום אצלנו. אם הכול נכון — ממשיכים. אם משהו השתנה — סמנו «יש שינוי» ונתקן יחד בשורה הבאה.</p>
        <ul className="ty-confirm-list" aria-labelledby="q-confirm-all">
          {list.map(a => {
            const lines = a.prompt.input.kind === 'confirm' ? a.prompt.input.lines : [];
            const m = marks[a.id] ?? 'ok';
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
        {err && <div className="ty-err" role="alert">{err}</div>}
        <div className="ty-nav">
          <button type="button" className="btn btn-ghost" disabled={idx === 0 || busy} onClick={() => go(idx - 1)}>הקודם</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitAll()}>
            {busy ? 'שולח…' : list.some(a => marks[a.id] === 'changed') ? 'הבא — לתקן מה שהשתנה' : 'כן, הכול נכון'}
          </button>
        </div>
      </div>
    );
  }

  // הקבוצה (כמה אנשים באותה שאלה) קיימת רק בדוח השנתי — כאן תמיד שאלה אחת
  const ask = screen.kind === 'ask' ? screen.ask : screen.asks[0];
  // ‼ 19.10.2026 · אריחים שסומנו מראש (הדוח הקודם / אירוע מהכרטיס) — הבחירה ההתחלתית, עד שהלקוח נוגע
  const d = draft[ask.id] ?? (ask.prompt.input.kind === 'multi' && ask.prompt.input.options.some(o => o.preset)
    ? { selected: ask.prompt.input.options.filter(o => o.preset).map(o => o.key) } : {});
  const setD = (patch: Draft) => setDraft(x => ({ ...x, [ask.id]: { ...x[ask.id], ...patch } }));
  const answered = ask.state === 'answered';
  const input = ask.prompt.input;
  const kind = input.kind;
  const recordSchemaId = input.kind === 'record' ? input.schema : input.kind === 'confirm' && d.choice === 'changed' ? input.edit?.schema : undefined;
  const recordCtx = input.kind === 'record' ? input.context : input.kind === 'confirm' ? input.edit?.context : undefined;
  const recSchema = recordSchemaId ? schemaFor(recordSchemaId, undefined, recordCtx) : undefined;
  const recValue: RecordAnswer = d.record ?? { items: (input.kind === 'record' ? input.initial : input.kind === 'confirm' ? input.edit?.initial : undefined) as RecordAnswer['items'] ?? [] };
  const entSpec: EntitySpec | undefined = input.kind === 'entity' ? input.spec : undefined;
  const entCtx = input.kind === 'entity' ? input.context : undefined;
  const entItems: EntityItem[] = d.items ?? (input.kind === 'entity' && input.initial?.length ? input.initial : [{}]);

  const answerOf = (): AskAnswer | null => {
    if (kind === 'confirm') {
      if (d.choice === 'yes') return { kind: 'unchanged' };
      if (d.choice === 'changed' && recSchema) return answerValid(recSchema, recValue) ? { kind: 'record', value: { items: recValue.items }, none: recValue.none, assertion: 'changed', was: input.kind === 'confirm' ? input.lines : [] } : null;
      return d.choice === 'changed' && d.text?.trim() ? { kind: 'changed', note: d.text } : null;
    }
    if (kind === 'record' && recSchema) {
      if (!answerValid(recSchema, recValue)) return null;
      // שאלת תחולה — הרשומה עצמה; רשימה — { items }
      return recValue.none ? { kind: 'record', value: null, none: true } : { kind: 'record', value: recSchema.id === 'period' ? recValue.items[0] : { items: recValue.items } };
    }
    if (kind === 'multi') return d.none || (d.selected?.length ?? 0) > 0 ? { kind: 'multi', selected: d.none ? [] : d.selected ?? [] } : null;
    if (kind === 'entity' && entSpec) return entityValid(entSpec, entItems, entCtx) ? { kind: 'entity', items: entItems.map(it => cleanEntity(entSpec, it, entCtx)) } : null;
    if (kind === 'who') return d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : d.choice && ['none', 'client', 'spouse', 'both'].includes(d.choice) ? { kind: 'who', value: d.choice as 'none' | 'client' | 'spouse' | 'both' } : null;
    if (kind === 'yesno') return d.choice === 'yes' ? { kind: 'yes', note: d.text?.trim() || undefined } : d.choice === 'no' ? { kind: 'no' } : d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : null;
    if (kind === 'amount') return d.choice === 'notSure' ? { kind: 'notSure' } : d.amount !== undefined && d.amount !== '' && Number(d.amount) >= 0 ? { kind: 'amount', amount: Number(d.amount) } : null;
    if (kind === 'text') return d.text?.trim() ? { kind: 'text', text: d.text } : null;
    if (kind === 'choice') return d.choice ? { kind: 'choice', value: d.choice } : null;
    if (kind === 'file') {
      // ‼ «לא רלוונטי» — טענה שהמשרד בודק (הערה למשרד), לא «מסמך שחסר»
      if (d.code === 'notRelevant') return { kind: 'notSure', note: `המסמך לא רלוונטי לדברי הלקוח${d.reason?.trim() ? `: ${d.reason.trim()}` : ''}` };
      if (d.code) return { kind: 'unavailable', code: d.code, reason: d.reason?.trim() || UNAVAILABLE_LABEL[d.code] };
    }
    return null;
  };

  const next = async (override?: AskAnswer) => {
    const a = override ?? answerOf();
    if (!a && (ask.state === 'unavailable' || answered || preview)) { advance(asks); return; }
    if (!a) { setTried(true); return; }
    if (preview) { advance(asks); return; }
    setBusy(true); setErr(null);
    // רשומה מובנית: ניקוי לפני שליחה (אפסים מובילים בבנק/סניף, שם הבנק והסניף מהרשימה)
    let payload = a;
    if (a.kind === 'record' && recSchema && !a.none) {
      const dir = recSchema.id === 'bank' ? await loadBankDirectory() : null;
      const items = recValue.items.map(r => cleanRecord(recSchema, r, dir));
      payload = { ...a, value: recSchema.id === 'period' ? items[0] : { items } };
    }
    const r = await api.portalSubmit(token!, ask.id, payload);
    if (!r.ok) { setBusy(false); setErr(r.error === 'bad_amount' ? 'הסכום לא תקין' : r.error === 'empty' ? 'נא לכתוב תשובה' : r.error === 'bad_record' || r.error === 'bad_entity' ? 'חלק מהפרטים לא תקינים' : r.error === 'not_in_list' ? 'יש לבחור מהרשימה' : 'השליחה נכשלה — נסו שוב'); return; }
    const state: InfoAsk['state'] = payload.kind === 'unavailable' ? 'unavailable' : 'answered';
    let list = asks.map(x => (x.id === ask.id ? { ...x, state, savedDraft: undefined, unavailable: payload.kind === 'unavailable' ? { reason: payload.reason, code: payload.code, followUpOn: '', recordedAt: new Date().toISOString() } : x.unavailable } : x));
    // ‼ מסך הרשת: מה שסומן פתח שאלות המשך בשרת («של מי / איפה») — טוענים אותן, בלי לחזור על מה שכבר נענה
    // ‼ 20.10.2026 · וגם תשובה חיובית שפתחה המשך (prompt.onYes — «סבב אחד», 264)
    if (payload.kind === 'multi' || (ask.prompt.onYes?.length ?? 0) > 0) {
      try { const v = await fetchAsks(); const known = new Map(list.map(x => [x.id, x])); list = v.asks.map(x => known.get(x.id) ?? x); } catch { /* נשארים עם הרשימה המקומית; הרענון הבא ישלים */ }
    }
    setBusy(false);
    setAsks(list);
    advance(list, opened, ask.id);
  };
  const saveExit = async () => {
    if (preview) return;
    setBusy(true);
    const r = await api.portalSaveDraft(token!, ask.id, d);
    setBusy(false);
    setSaved(r.ok ? 'נשמר. אפשר לחזור מאותו קישור ולהמשיך מכאן.' : 'השמירה נכשלה');
  };

  const docInfo = input.kind === 'file' ? DOCS[input.docKind] : undefined;
  const canNext = !!answerOf() || answered || preview || ask.state === 'unavailable';
  const lastOpen = screens.filter(s => !screenDone(s)).length <= 1 && ask.state === 'published';
  const names = entCtx;

  return (
    <div className="ty-flow" data-screen={kind} data-part={part}>
      {top}

      {ask.prompt.correction && (
        <div className="ty-correction" role="note"><b>המשרד ביקש לתקן:</b> {ask.prompt.correction}</div>
      )}
      <p className="ty-q" id={`q-${ask.id}`}>{ask.prompt.title}</p>
      {(ask.prompt.subjectName || ask.prompt.periodText) && (
        <p className="ty-q-meta">
          {ask.prompt.subjectName && <span className="ty-tag">השאלה על {ask.prompt.subjectName}</span>}
          {ask.prompt.periodText && <span className="ty-tag is-period">{ask.prompt.periodText}</span>}
        </p>
      )}
      {ask.prompt.hint && <p className="ty-hint" id={`h-${ask.id}`}>{ask.prompt.hint}</p>}
      {answered && <span className="ty-done-mark">✓ נשלח למשרד</span>}
      {ask.state === 'unavailable' && ask.unavailable && (
        <p className="ty-q-sub">סימנת «{UNAVAILABLE_LABEL[ask.unavailable.code ?? 'legacy']}»{ask.unavailable.reason && ask.unavailable.reason !== UNAVAILABLE_LABEL[ask.unavailable.code ?? 'legacy'] ? ` (${ask.unavailable.reason})` : ''}. אפשר להעלות עכשיו אם הגיע.</p>
      )}

      {!answered && kind === 'confirm' && input.kind === 'confirm' && (
        <>
          <ul className="ty-lines">{input.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
            <button type="button" className="ty-choice" aria-pressed={d.choice === 'yes'} onClick={() => setD({ choice: 'yes' })}>כן, הכול נכון</button>
            <button type="button" className="ty-choice" aria-pressed={d.choice === 'changed'} onClick={() => setD({ choice: 'changed' })}>משהו השתנה</button>
          </div>
          {d.choice === 'changed' && recSchema && (
            <>
              <p className="ty-q-sub">אפשר לתקן, להוסיף או להסיר — כל פרט בשדה שלו.</p>
              <RecordEditor schemaId={recSchema.id} context={recordCtx} value={recValue} onChange={v => setD({ record: v })} showErrors={tried} disabled={preview} />
            </>
          )}
          {d.choice === 'changed' && !recSchema && <label className="ty-field">מה השתנה?<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'record' && recSchema && (
        <RecordEditor schemaId={recSchema.id} context={recordCtx} value={recValue} onChange={v => setD({ record: v })} showErrors={tried} disabled={preview} />
      )}
      {!answered && kind === 'multi' && input.kind === 'multi' && (
        <div className="ty-grid" role="group" aria-labelledby={`q-${ask.id}`}>
          {input.options.map(o => {
            const on = !d.none && (d.selected ?? []).includes(o.key);
            return (
              <button key={o.key} type="button" className="ty-tile" aria-pressed={on} data-tile={o.key} title={o.hint}
                onClick={() => setD({ none: false, selected: on ? (d.selected ?? []).filter(k => k !== o.key) : [...(d.selected ?? []), o.key] })}>
                <span className="ty-tile-check" aria-hidden="true">{on ? '✓' : ''}</span>
                <span className="ty-tile-text">{o.label}{o.note && <small className="ty-tile-note">{o.note}</small>}</span>
              </button>
            );
          })}
          <button type="button" className="ty-tile is-wide" aria-pressed={!!d.none} data-tile="none" onClick={() => setD({ none: !d.none, selected: [] })}>אין לנו אף אחד מאלה</button>
        </div>
      )}
      {!answered && kind === 'entity' && entSpec && (
        <EntityEditor spec={entSpec} names={names} items={entItems} onChange={items => setD({ items })} showErrors={tried} disabled={preview} />
      )}
      {!answered && kind === 'yesno' && (
        <>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`} aria-describedby={ask.prompt.hint ? `h-${ask.id}` : undefined}>
            {[['yes', 'כן'], ['no', 'לא'], ['notSure', 'לא בטוח/ה']].map(([v, l]) => (
              <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
            ))}
          </div>
          {d.choice === 'yes' && <label className="ty-field">פרטים (לא חובה)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} placeholder="למשל: אצל מי, כמה בערך" /></label>}
          {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'who' && input.kind === 'who' && (
        <>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`} aria-describedby={ask.prompt.hint ? `h-${ask.id}` : undefined}>
            {[['none', 'לא'], ['client', `כן — ${input.clientName}`], ['spouse', `כן — ${input.spouseName}`], ['both', 'כן — שנינו'], ['notSure', 'לא בטוח/ה']].map(([v, l]) => (
              <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
            ))}
          </div>
          {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'amount' && (
        <>
          <label className="ty-field">סכום בשקלים (אם לא היה — 0)<input type="number" dir="ltr" inputMode="decimal" min={0} value={d.amount ?? ''} onChange={e => setD({ amount: e.target.value, choice: undefined })} /></label>
          <button type="button" className="ty-choice" aria-pressed={d.choice === 'notSure'} onClick={() => setD({ choice: 'notSure', amount: '' })}>לא יודע/ת — המשרד יבדוק</button>
        </>
      )}
      {!answered && kind === 'text' && <label className="ty-field">התשובה שלך<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
      {!answered && kind === 'choice' && input.kind === 'choice' && (
        <div className="ty-choices">{input.options.map(o => <button key={o.value} type="button" className="ty-choice" aria-pressed={d.choice === o.value} onClick={() => setD({ choice: o.value })}>{o.label}</button>)}</div>
      )}
      {!answered && kind === 'file' && input.kind === 'file' && (
        <>
          {!d.code && (
            <DocPartsPicker docKind={input.docKind} fileName={docInfo?.label ?? 'מסמך'} storeKey={preview ? undefined : `${stepId}:${ask.id}`} disabled={busy || preview}
              onConfirm={async (pdf, manifest) => { const e = await upload(ask, pdf, manifest); if (!e) advance(asks.map(x => (x.id === ask.id ? { ...x, state: 'answered' as const } : x))); return e; }} />
          )}
          <div className="ty-alt" role="group" aria-label="אין את המסמך עכשיו">
            <span className="ty-alt-h">{d.code ? 'בחרת:' : 'אין את המסמך עכשיו?'}</span>
            <div className="ty-alt-list">
              {UNAV_CHOICES.map(c => (
                <button key={c.code} type="button" className="ty-choice is-sm" aria-pressed={d.code === c.code} onClick={() => setD({ code: d.code === c.code ? undefined : c.code })}>{c.label}</button>
              ))}
            </div>
            {d.code && UNAV_CHOICES.find(c => c.code === d.code)?.ask && (
              <label className="ty-field">{UNAV_CHOICES.find(c => c.code === d.code)!.ask}<input value={d.reason ?? ''} onChange={e => setD({ reason: e.target.value })} /></label>
            )}
          </div>
        </>
      )}

      {ask.prompt.why && (
        <details className="ty-why-q"><summary>למה שואלים?</summary><p>{ask.prompt.why}</p></details>
      )}
      {tried && !answerOf() && !answered && <div className="ty-err" role="alert">{kind === 'record' || kind === 'entity' || (kind === 'confirm' && d.choice === 'changed') ? 'חסרים פרטים — מסומנים באדום' : kind === 'multi' ? 'סמנו מה יש לכם, או «אין לנו אף אחד מאלה»' : 'נא לבחור תשובה'}</div>}
      {err && <div className="ty-err" role="alert">{err}</div>}
      {saved && <div className="ty-ok" role="status">{saved}</div>}

      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={idx === 0 || busy} onClick={() => go(idx - 1)}>הקודם</button>
        {!preview && !answered && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void saveExit()}>שמירה ויציאה</button>}
        {!(kind === 'file' && !d.code && !answered && ask.state !== 'unavailable') && (
          <button type="button" className="btn btn-primary" disabled={busy || (!canNext && !(kind === 'record' || kind === 'confirm' || kind === 'entity' || kind === 'multi'))} onClick={() => void next()}>
            {busy ? 'שולח…' : lastOpen && !preview ? 'שליחה למשרד' : 'הבא'}
          </button>
        )}
        {kind === 'file' && !d.code && !answered && ask.state !== 'unavailable' && (
          <button type="button" className="btn btn-ghost" disabled={busy || preview} onClick={() => { setD({ code: 'later' }); void next({ kind: 'unavailable', code: 'later', reason: UNAVAILABLE_LABEL.later }); }}>אעלה בהמשך</button>
        )}
      </div>
    </div>
  );
}

// ── 16.10.2026 · «של מי / איפה» — שדות סגורים; רשימה עם חיפוש ───────────────────────────────────

export function EntityEditor({ spec, names, items, onChange, showErrors, disabled }: { spec: EntitySpec; names?: Record<string, string>; items: EntityItem[]; onChange: (items: EntityItem[]) => void; showErrors: boolean; disabled: boolean }) {
  const set = (k: number, patch: EntityItem) => onChange(items.map((it, n) => (n === k ? { ...it, ...patch } : it)));
  return (
    <div className="ty-ent" data-entity={spec.noun}>
      {items.map((it, k) => {
        const errs = showErrors ? validateEntity(spec, it, names) : {};
        return (
          <fieldset key={k} className="ty-ent-card">
            {(spec.multiple || items.length > 1) && (
              <legend className="ty-ent-legend">{spec.noun} {k + 1}{items.length > 1 && !disabled && <button type="button" className="rec-link" onClick={() => onChange(items.filter((_, n) => n !== k))}>הסרה</button>}</legend>
            )}
            {spec.fields.map(f => <EntityFieldView key={f.key} field={f} value={it[f.key] ?? ''} names={names} error={errs[f.key]} disabled={disabled} onChange={v => set(k, { [f.key]: v })} />)}
          </fieldset>
        );
      })}
      {spec.multiple && !disabled && <button type="button" className="btn btn-ghost ty-ent-add" onClick={() => onChange([...items, {}])}>{spec.addLabel ?? `＋ עוד ${spec.noun}`}</button>}
    </div>
  );
}

function EntityFieldView({ field: f, value, names, error, disabled, onChange }: { field: EntityField; value: string; names?: Record<string, string>; error?: string; disabled: boolean; onChange: (v: string) => void }) {
  const foot = (
    <>
      {f.hint && !error && <span className="rec-hint">{f.hint}</span>}
      {error && <span className="rec-err" role="alert">{error}</span>}
    </>
  );
  if (f.type === 'name') {
    return (
      <label className="ty-ent-field">
        <span className="rec-label">{f.label}</span>
        <input value={value} maxLength={120} disabled={disabled} autoComplete="organization" onChange={e => onChange(e.target.value)} />
        {foot}
      </label>
    );
  }
  if (f.type === 'list' && f.list) return <ListPicker field={f} list={f.list} value={value} disabled={disabled} onPick={onChange} foot={foot} />;
  const options = f.type === 'who' ? WHO_OPTIONS(names) : f.options ?? [];
  return (
    <div className="ty-ent-field" role="group" aria-label={f.label}>
      <span className="rec-label">{f.label}</span>
      <div className="ty-chips">
        {options.map(o => <button key={o.value} type="button" className="ty-chip-btn" aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
      {foot}
    </div>
  );
}

const SHOW = 6;
function ListPicker({ field: f, list, value, disabled, onPick, foot }: { field: EntityField; list: InstitutionListId; value: string; disabled: boolean; onPick: (v: string) => void; foot: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const all = INSTITUTION_LISTS[list].items;
  const picked = all.find(e => e.id === value);
  const found = searchInstitutions(list, q);
  const shown = q || more ? found : found.slice(0, SHOW);
  return (
    <div className="ty-ent-field" data-list={list}>
      <label className="rec-label" htmlFor={`lp-${list}-${f.key}`}>{f.label}</label>
      {picked && !q ? (
        <div className="rec-picked"><span>✓ {picked.label}</span>{!disabled && <button type="button" className="rec-link" onClick={() => { onPick(''); setQ(''); }}>שינוי</button>}</div>
      ) : (
        <>
          <input id={`lp-${list}-${f.key}`} className="ty-list-search" value={q} placeholder="חיפוש ברשימה" autoComplete="off" disabled={disabled} onChange={e => setQ(e.target.value)} />
          <ul className="ty-list" role="listbox" aria-label={f.label}>
            {shown.map(e => <li key={e.id}><button type="button" role="option" aria-selected={e.id === value} disabled={disabled} onClick={() => { onPick(e.id); setQ(''); setMore(false); }}>{e.label}</button></li>)}
            {!q && !more && found.length > SHOW && <li><button type="button" className="ty-list-more" onClick={() => setMore(true)}>עוד… ({found.length - SHOW})</button></li>}
            {q && !found.some(e => e.id !== 'other') && <li className="ty-note">לא נמצא — אפשר לבחור «אחר» והמשרד יברר</li>}
          </ul>
        </>
      )}
      {foot}
    </div>
  );
}
