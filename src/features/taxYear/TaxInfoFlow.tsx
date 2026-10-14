// ─── הדף האישי: «השלמת מידע» — שאלה אחת למסך (229; 13.10.2026) ─────────────────
// ‼ בלי מונחי מס ובלי קודי טופס. מתחת לשאלה — הסבר קצר וגלוי ועל איזו תקופה שואלים; «למה שואלים?» מקופל.
// ‼ כל תשובה נשלחת מיד לשרת (portal_submit_tax_info) — יציאה באמצע לא מאבדת כלום; «שמירה ויציאה» שומר
//   טיוטה בשרת לשאלה הנוכחית (לא בדפדפן). חלקי מסמך שעוד לא נשלחו — במכשיר (partsStore).
// ‼ 13.10.2026 · נתונים מובנים (ילדים, חשבון בנק, מעסיק…) — בשדות נפרדים (RecordEditor), לא בתיבה אחת.
// ‼ 13.10.2026 · מסמך שאין עכשיו — «אעלה בהמשך» / «עוד לא קיבלתי» / «צריך עזרה» / «לא רלוונטי לי». ארבע
//   משמעויות שונות. «אין לי עדיין» שנשמר לפני כן — מוצג כפי שהוא, בלי לייחס לו משמעות חדשה.
// ‼ 13.10.2026 · סיום: «התשובות נשלחו למשרד» ובנפרד «נשארו N מסמכים» — עם העלאה ישירה לכל אחד, בלי לעבור
//   שוב על השאלון. הבקשה אינה «הושלמה» כשחסרים מסמכים.
// ‼ בתצוגה מקדימה (מהמשרד) אין שליחה ואין העלאה.

import { useEffect, useState } from 'react';
import { DOCS } from './documents';
import * as api from './api';
import { UNAVAILABLE_LABEL, type AskAnswer } from './asks';
import type { InfoAsk, UnavailableCode } from './types';
import { livePortalActions } from '../../components/portal/portalActions';
import RecordEditor from './RecordEditor';
import { answerValid, cleanRecord, schemaFor, type RecordAnswer } from './records';
import { loadBankDirectory } from './RecordEditor';
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

type Draft = { choice?: string; text?: string; amount?: string; note?: string; reason?: string; record?: RecordAnswer; code?: UnavailableCode | 'notRelevant' };

const ORDER = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' ? 0 : a.prompt.input.kind === 'file' ? 2 : 1);
/** מסמך שעדיין אצל הלקוח: «אין לי עדיין» (גם ישן, בלי קוד), «אעלה בהמשך», «עוד לא קיבלתי». «צריך עזרה» — אצל המשרד. */
const clientOwes = (a: InfoAsk) => a.state === 'unavailable' && a.unavailable?.code !== 'needHelp';
const UNAV_CHOICES: { code: UnavailableCode | 'notRelevant'; label: string; ask?: string }[] = [
  { code: 'later', label: 'אעלה בהמשך' },
  { code: 'notYet', label: 'עוד לא קיבלתי את המסמך', ask: 'ממי מחכים? (לא חובה)' },
  { code: 'needHelp', label: 'אין לי — צריך עזרה', ask: 'מה הבעיה? (לא חובה — המשרד יחזור אליך)' },
  { code: 'notRelevant', label: 'לא רלוונטי לי', ask: 'למה? (לא חובה — המשרד יבדוק)' },
];

export default function TaxInfoFlow({ stepId, token, previewClientId, previewAsks, onClose, onTitle }: Props) {
  const preview = !token;
  const [title, setTitle] = useState('השלמת מידע');
  const [asks, setAsks] = useState<InfoAsk[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [tried, setTried] = useState(false);
  /** במסך הסיום: המסמך שפתוח עכשיו להעלאה. */
  const [docOpen, setDocOpen] = useState<string | null>(null);

  const load = async () => {
    try {
      const v = token ? await api.portalLoad(token, stepId)
        : previewAsks ? { stepId, taxYear: 0, title: 'השלמת מידע', asks: previewAsks }
        : await api.portalPreview(previewClientId!, stepId);
      setTitle(v.title || 'השלמת מידע');
      onTitle?.(v.title || 'השלמת מידע');
      const sorted = [...v.asks].sort((a, b) => ORDER(a) - ORDER(b));
      setAsks(sorted);
      setDraft(Object.fromEntries(sorted.filter(a => a.savedDraft).map(a => [a.id, a.savedDraft as Draft])));
      // ‼ חזרה אחרי «שמירה ויציאה»: לשאלה הראשונה שעוד לא נענתה. כשנשארו רק מסמכים — ישר לרשימת המסמכים
      //   (לא עוברים שוב על השאלון).
      const firstNew = sorted.findIndex(a => a.state === 'published');
      setI(firstNew < 0 ? 0 : firstNew);
      setFinished(sorted.length > 0 && firstNew < 0);
    } catch (e) { setErr(String((e as Error).message)); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stepId, token, previewClientId]);

  if (err && !asks) return <div className="ty-err" role="alert">לא ניתן לטעון את השאלות. נסו שוב מאוחר יותר.</div>;
  if (!asks) return <div className="ty-note">טוען…</div>;
  if (asks.length === 0) return <div className="ty-note">אין כרגע שאלות פתוחות.</div>;

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
          {open.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setFinished(false); setI(asks.indexOf(open[0])); }}>לחזור לשאלות שנשארו</button>}
          {onClose && <button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button>}
        </div>
      </div>
    );
  }

  const ask = asks[i];
  const d = draft[ask.id] ?? {};
  const setD = (patch: Draft) => setDraft(x => ({ ...x, [ask.id]: { ...x[ask.id], ...patch } }));
  const answered = ask.state === 'answered';
  const answeredCount = asks.filter(a => a.state === 'answered' || a.state === 'unavailable').length;
  const input = ask.prompt.input;
  const kind = input.kind;
  const recordSchemaId = input.kind === 'record' ? input.schema : input.kind === 'confirm' && d.choice === 'changed' ? input.edit?.schema : undefined;
  const recordCtx = input.kind === 'record' ? input.context : input.kind === 'confirm' ? input.edit?.context : undefined;
  const recSchema = recordSchemaId ? schemaFor(recordSchemaId, undefined, recordCtx) : undefined;
  const recValue: RecordAnswer = d.record ?? { items: (input.kind === 'record' ? input.initial : input.kind === 'confirm' ? input.edit?.initial : undefined) as RecordAnswer['items'] ?? [] };

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

  const go = (n: number) => { setSaved(null); setTried(false); setI(Math.max(0, Math.min(asks.length - 1, n))); };
  const advance = (list: InfoAsk[]) => {
    // ‼ קדימה רק לשאלות שעוד לא נענו. מסמך שסומן «אעלה בהמשך» אינו «שאלה פתוחה» — הוא ברשימת המסמכים בסיום.
    const rest = list.findIndex((x, k) => k > i && x.state === 'published');
    if (rest >= 0) { go(rest); return; }
    const any = list.findIndex((x, k) => k !== i && x.state === 'published');
    if (any >= 0) { go(any); return; }
    setFinished(true);
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
    setBusy(false);
    if (!r.ok) { setErr(r.error === 'bad_amount' ? 'הסכום לא תקין' : r.error === 'empty' ? 'נא לכתוב תשובה' : r.error === 'bad_record' ? 'חלק מהפרטים לא תקינים' : 'השליחה נכשלה — נסו שוב'); return; }
    const state: InfoAsk['state'] = payload.kind === 'unavailable' ? 'unavailable' : 'answered';
    const list = asks.map(x => (x.id === ask.id ? { ...x, state, savedDraft: undefined, unavailable: payload.kind === 'unavailable' ? { reason: payload.reason, code: payload.code, followUpOn: '', recordedAt: new Date().toISOString() } : x.unavailable } : x));
    setAsks(list);
    advance(list);
  };
  const saveExit = async () => {
    if (preview) return;
    setBusy(true);
    const r = await api.portalSaveDraft(token!, ask.id, d);
    setBusy(false);
    setSaved(r.ok ? 'נשמר. אפשר לחזור מאותו קישור ולהמשיך מכאן.' : 'השמירה נכשלה');
  };

  const progress = Math.round((answeredCount / asks.length) * 100);
  const docInfo = input.kind === 'file' ? DOCS[input.docKind] : undefined;
  const canNext = !!answerOf() || answered || preview || ask.state === 'unavailable';
  const lastOpen = asks.filter(x => x.state === 'published').length <= 1 && ask.state === 'published';

  return (
    <div className="ty-flow">
      <div className="ty-flow-top">
        <span>{title}</span><span>{i + 1} מתוך {asks.length}</span>
      </div>
      <div className="ty-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${progress}%` }} /></div>
      {preview && <div className="ty-note">תצוגה בלבד — כך זה ייראה ללקוח. אין כאן שליחה.</div>}

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
      {tried && !answerOf() && !answered && <div className="ty-err" role="alert">{kind === 'record' || (kind === 'confirm' && d.choice === 'changed') ? 'חסרים פרטים — מסומנים באדום' : 'נא לבחור תשובה'}</div>}
      {err && <div className="ty-err" role="alert">{err}</div>}
      {saved && <div className="ty-ok" role="status">{saved}</div>}

      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={i === 0 || busy} onClick={() => go(i - 1)}>הקודם</button>
        {!preview && !answered && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void saveExit()}>שמירה ויציאה</button>}
        {!(kind === 'file' && !d.code && !answered && ask.state !== 'unavailable') && (
          <button type="button" className="btn btn-primary" disabled={busy || (!canNext && !(kind === 'record' || kind === 'confirm'))} onClick={() => void next()}>
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
