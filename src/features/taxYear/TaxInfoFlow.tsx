// ─── הדף האישי: «השלמת מידע» — שאלה אחת למסך (229) ─────────────────────────
// ‼ בלי מונחי מס ובלי קודי טופס. «למה שואלים?» מקופל. פירוט נפתח רק אחרי «כן».
// ‼ כל תשובה נשלחת מיד לשרת (portal_submit_tax_info) — יציאה באמצע לא מאבדת
// כלום; «שמירה ויציאה» שומר טיוטה בשרת לשאלה הנוכחית (לא בדפדפן).
// ‼ «אין לי עדיין» למסמך — נרשם עם סיבה; המשרד רואה מתי אפשר לבקש. אין הודעה אוטומטית.
// ‼ בתצוגה מקדימה (מהמשרד) אין שליחה ואין העלאה.

import { useEffect, useRef, useState } from 'react';
import { DOCS } from './documents';
import * as api from './api';
import type { AskAnswer } from './asks';
import type { InfoAsk } from './types';
import { livePortalActions } from '../../components/portal/portalActions';
import './taxYear.css';

interface Props {
  /** חי: טוקן ובקשה. תצוגה מקדימה מהמשרד: השאלות עצמן (גם טיוטה). */
  stepId: string;
  token?: string;
  previewClientId?: string;
  /** תצוגה מקדימה מהמשרד — השאלות שכבר נטענו (כולל טיוטה, שהלקוח יראה אחרי פרסום). */
  previewAsks?: InfoAsk[];
  /** «סגירה» במסך התודה — רק אז הדף מתרענן (אחרת התודה נעלמת לפני שנקראה). */
  onClose?: () => void;
}

type Draft = { choice?: string; text?: string; amount?: string; note?: string; reason?: string };

const ORDER = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' ? 0 : a.prompt.input.kind === 'file' ? 2 : 1);

export default function TaxInfoFlow({ stepId, token, previewClientId, previewAsks, onClose }: Props) {
  const preview = !token;
  const [title, setTitle] = useState('השלמת מידע');
  const [asks, setAsks] = useState<InfoAsk[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const v = token ? await api.portalLoad(token, stepId)
        : previewAsks ? { stepId, taxYear: 0, title: 'השלמת מידע', asks: previewAsks }
        : await api.portalPreview(previewClientId!, stepId);
      setTitle(v.title || 'השלמת מידע');
      const sorted = [...v.asks].sort((a, b) => ORDER(a) - ORDER(b));
      setAsks(sorted);
      setDraft(Object.fromEntries(sorted.filter(a => a.savedDraft).map(a => [a.id, a.savedDraft as Draft])));
      // ‼ חזרה אחרי «שמירה ויציאה»: לשאלה הראשונה שעוד לא נענתה בכלל; מסמך שסומן «אין לי עדיין» — רק אחריהן
      //   (עד 12.10.2026 החזרה הייתה למסמך הראשון שסומן כך, והלקוח נראה כאילו התחיל מההתחלה).
      const firstNew = sorted.findIndex(a => a.state === 'published');
      const firstOpen = firstNew >= 0 ? firstNew : sorted.findIndex(a => a.state !== 'answered');
      setI(firstOpen < 0 ? 0 : firstOpen);
      setFinished(sorted.length > 0 && firstOpen < 0);
    } catch (e) { setErr(String((e as Error).message)); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stepId, token, previewClientId]);

  if (err) return <div className="ty-err" role="alert">לא ניתן לטעון את השאלות. נסו שוב מאוחר יותר.</div>;
  if (!asks) return <div className="ty-note">טוען…</div>;
  if (asks.length === 0) return <div className="ty-note">אין כרגע שאלות פתוחות.</div>;

  const ask = asks[i];
  const d = draft[ask.id] ?? {};
  const setD = (patch: Draft) => setDraft(x => ({ ...x, [ask.id]: { ...x[ask.id], ...patch } }));
  const answered = ask.state === 'answered';
  const answeredCount = asks.filter(a => a.state === 'answered').length;
  const kind = ask.prompt.input.kind;

  const answerOf = (): AskAnswer | null => {
    if (kind === 'confirm') return d.choice === 'yes' ? { kind: 'unchanged' } : d.choice === 'changed' && d.text?.trim() ? { kind: 'changed', note: d.text } : null;
    if (kind === 'who') return d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : d.choice && ['none', 'client', 'spouse', 'both'].includes(d.choice) ? { kind: 'who', value: d.choice as 'none' | 'client' | 'spouse' | 'both' } : null;
    if (kind === 'yesno') return d.choice === 'yes' ? { kind: 'yes', note: d.text?.trim() || undefined } : d.choice === 'no' ? { kind: 'no' } : d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : null;
    if (kind === 'amount') return d.choice === 'notSure' ? { kind: 'notSure' } : d.amount !== undefined && d.amount !== '' && Number(d.amount) >= 0 ? { kind: 'amount', amount: Number(d.amount) } : null;
    if (kind === 'text') return d.text?.trim() ? { kind: 'text', text: d.text } : null;
    if (kind === 'choice') return d.choice ? { kind: 'choice', value: d.choice } : null;
    if (kind === 'file') return d.choice === 'unavailable' ? { kind: 'unavailable', reason: d.reason?.trim() || 'עוד לא התקבל' } : null;
    return null;
  };

  const go = (n: number) => { setSaved(null); setI(Math.max(0, Math.min(asks.length - 1, n))); };
  const next = async () => {
    const a = answerOf();
    // ‼ 12.10.2026: מסמך שכבר סומן «אין לי עדיין» — «הבא» ממשיך בלי לשלוח שוב (שליחה חוזרת דחתה את מועד המעקב בכל ביקור)
    if (!a && ask.state === 'unavailable' && !preview) { advance(); return; }
    if (!a || preview || answered) { if (preview || answered) advance(); return; }
    setBusy(true); setErr(null);
    const r = await api.portalSubmit(token!, ask.id, a);
    setBusy(false);
    if (!r.ok) { setErr(r.error === 'bad_amount' ? 'הסכום לא תקין' : r.error === 'empty' ? 'נא לכתוב תשובה' : 'השליחה נכשלה — נסו שוב'); return; }
    setAsks(list => list!.map(x => (x.id === ask.id ? { ...x, state: a.kind === 'unavailable' ? 'unavailable' : 'answered', savedDraft: undefined } : x)));
    advance(a.kind === 'unavailable' ? undefined : ask.id);
  };
  const advance = (justAnswered?: string) => {
    const list = asks.map(x => (x.id === justAnswered ? { ...x, state: 'answered' as const } : x));
    // ‼ 12.10.2026: קדימה רק לשאלות שעוד לא נענו. מסמך שסומן «אין לי עדיין» אינו «שאלה פתוחה» — אפשר לחזור
    //   אליו («הקודם», «לחזור לשאלות שנשארו») ולהעלות כשהגיע, אבל לא מחייבים לעבור עליו שוב בכל ביקור.
    const rest = list.findIndex((x, k) => k > i && x.state === 'published');
    if (rest >= 0) { go(rest); return; }
    const any = list.findIndex((x, k) => k !== i && x.state === 'published');
    if (any >= 0) { go(any); return; }
    setFinished(true);
  };
  const upload = async (file: File) => {
    if (preview) return;
    setBusy(true); setErr(null);
    const r = await livePortalActions(token!).uploadDocument({ stepId, itemKey: ask.id, file });
    setBusy(false);
    if (!r.ok) { setErr(r.error === 'too_large' ? 'הקובץ גדול מדי (עד 10MB)' : r.error === 'type_not_allowed' ? 'סוג קובץ לא נתמך — PDF או תמונה' : 'ההעלאה נכשלה — נסו שוב'); return; }
    setAsks(list => list!.map(x => (x.id === ask.id ? { ...x, state: 'answered' } : x)));
    advance(ask.id);
  };
  const saveExit = async () => {
    if (preview) return;
    setBusy(true);
    const r = await api.portalSaveDraft(token!, ask.id, d);
    setBusy(false);
    setSaved(r.ok ? 'נשמר. אפשר לחזור מאותו קישור ולהמשיך מכאן.' : 'השמירה נכשלה');
  };

  if (finished) {
    const waitingDocs = asks.filter(a => a.state === 'unavailable').length;
    return (
      <div className="ty-flow" aria-live="polite">
        <p className="ty-q">תודה! התשובות נשלחו למשרד.</p>
        <p className="ty-q-sub">המשרד יבדוק ויחזור אליך אם צריך משהו נוסף.{waitingDocs ? ` ${waitingDocs} מסמכים סומנו «אין לי עדיין» — נבקש אותם כשיהיו זמינים.` : ''}</p>
        <div className="ty-actions">
          {onClose && <button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>}
          {asks.some(a => a.state !== 'answered') && <button type="button" className="btn btn-ghost" onClick={() => { setFinished(false); go(asks.findIndex(a => a.state !== 'answered')); }}>לחזור לשאלות שנשארו</button>}
        </div>
      </div>
    );
  }

  const progress = Math.round((answeredCount / asks.length) * 100);
  const docInfo = kind === 'file' && ask.prompt.input.kind === 'file' ? DOCS[ask.prompt.input.docKind] : undefined;
  const canNext = !!answerOf() || answered || preview || ask.state === 'unavailable';

  return (
    <div className="ty-flow">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', fontSize: 'var(--fs-13)', color: 'var(--tx2)' }}>
        <span>{title}</span><span>{i + 1} מתוך {asks.length}</span>
      </div>
      <div className="ty-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות"><i style={{ width: `${progress}%` }} /></div>
      {preview && <div className="ty-note">תצוגה בלבד — כך זה ייראה ללקוח. אין כאן שליחה.</div>}

      {ask.prompt.correction && (
        <div className="ty-correction" role="note"><b>המשרד ביקש לתקן:</b> {ask.prompt.correction}</div>
      )}
      <p className="ty-q" id={`q-${ask.id}`}>{ask.prompt.title}</p>
      {ask.prompt.subjectName && <p className="ty-q-sub">השאלה על {ask.prompt.subjectName}</p>}
      {answered && <span className="ty-done-mark">✓ נשלח למשרד</span>}
      {ask.state === 'unavailable' && ask.unavailable && <p className="ty-q-sub">סימנת «אין לי עדיין» ({ask.unavailable.reason}). אפשר להעלות עכשיו אם הגיע.</p>}

      {!answered && kind === 'confirm' && ask.prompt.input.kind === 'confirm' && (
        <>
          <ul className="ty-lines">{ask.prompt.input.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
            <button type="button" className="ty-choice" aria-pressed={d.choice === 'yes'} onClick={() => setD({ choice: 'yes' })}>כן, הכול נכון</button>
            <button type="button" className="ty-choice" aria-pressed={d.choice === 'changed'} onClick={() => setD({ choice: 'changed' })}>משהו השתנה</button>
          </div>
          {d.choice === 'changed' && <label className="ty-field">מה השתנה?<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'yesno' && (
        <>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
            {[['yes', 'כן'], ['no', 'לא'], ['notSure', 'לא בטוח/ה']].map(([v, l]) => (
              <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
            ))}
          </div>
          {d.choice === 'yes' && <label className="ty-field">פרטים (לא חובה)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} placeholder="למשל: אצל מי, כמה בערך" /></label>}
          {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'who' && ask.prompt.input.kind === 'who' && (
        <>
          <div className="ty-choices" role="group" aria-labelledby={`q-${ask.id}`}>
            {[['none', 'לא'], ['client', `כן — ${ask.prompt.input.clientName}`], ['spouse', `כן — ${ask.prompt.input.spouseName}`], ['both', 'כן — שנינו'], ['notSure', 'לא בטוח/ה']].map(([v, l]) => (
              <button key={v} type="button" className="ty-choice" aria-pressed={d.choice === v} onClick={() => setD({ choice: v })}>{l}</button>
            ))}
          </div>
          {d.choice === 'notSure' && <label className="ty-field">מה לא ברור? (לא חובה — המשרד יבדוק)<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
        </>
      )}
      {!answered && kind === 'amount' && (
        <>
          <label className="ty-field">סכום בשקלים (אם לא היה — 0)<input type="number" inputMode="decimal" min={0} value={d.amount ?? ''} onChange={e => setD({ amount: e.target.value, choice: undefined })} /></label>
          <button type="button" className="ty-choice" aria-pressed={d.choice === 'notSure'} onClick={() => setD({ choice: 'notSure', amount: '' })}>לא יודע/ת — המשרד יבדוק</button>
        </>
      )}
      {!answered && kind === 'text' && <label className="ty-field">התשובה שלך<textarea value={d.text ?? ''} onChange={e => setD({ text: e.target.value })} /></label>}
      {!answered && kind === 'choice' && ask.prompt.input.kind === 'choice' && (
        <div className="ty-choices">{ask.prompt.input.options.map(o => <button key={o.value} type="button" className="ty-choice" aria-pressed={d.choice === o.value} onClick={() => setD({ choice: o.value })}>{o.label}</button>)}</div>
      )}
      {!answered && kind === 'file' && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <div className="ty-choices">
            <button type="button" className="ty-choice" disabled={busy || preview} onClick={() => fileRef.current?.click()}>⬆ העלאת {docInfo?.label ?? 'קובץ'} (PDF או תמונה)</button>
            <button type="button" className="ty-choice" aria-pressed={d.choice === 'unavailable'} onClick={() => setD({ choice: 'unavailable' })}>אין לי עדיין</button>
          </div>
          {d.choice === 'unavailable' && <label className="ty-field">למה? (לא חובה)<input value={d.reason ?? ''} onChange={e => setD({ reason: e.target.value })} placeholder="למשל: המעסיק עוד לא שלח" /></label>}
        </>
      )}

      {ask.prompt.why && (
        <details className="ty-why-q"><summary>למה שואלים?</summary><p>{ask.prompt.why}</p></details>
      )}
      {err && <div className="ty-err" role="alert">{err}</div>}
      {saved && <div className="ty-ok" role="status">{saved}</div>}

      <div className="ty-nav">
        <button type="button" className="btn btn-ghost" disabled={i === 0 || busy} onClick={() => go(i - 1)}>הקודם</button>
        {!preview && !answered && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void saveExit()}>שמירה ויציאה</button>}
        <button type="button" className="btn btn-primary" disabled={busy || !canNext} onClick={() => void next()}>
          {busy ? 'שולח…' : asks.filter(x => x.state === 'published').length <= 1 && ask.state === 'published' && !preview ? 'שליחה למשרד' : 'הבא'}
        </button>
      </div>
    </div>
  );
}
