// ─── בקשת הצפי: «עד סוף השנה — זה נראה נכון?» (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-tax-estimate.html) ──
// ‼ הלקוח רואה עמודה לכל חודש — עד החתך מפייפרלס, ואחריו לפי הקצב (מפוספס). «נכון» — הקצב; «יהיה אחרת» — הערכה
//   לכל חודש שנשאר בכפתורי ± (בלי הקלדה). ההוצאות — כמו בספרים שלו; ההתאמות למס נעשות במשרד, לא כאן.
// ‼ עסק חדש (בלי חודשים בפועל): שני סכומים לשנה. הערך נשמר כרשומה אחת ('record') — השרת שומר אותה כעובדה,
//   וההערכה במשרד מתעדכנת לבד (forecastFlow.ts › deriveDraft).
import type { RecordAnswer, RecordValue } from './records';
import './forecastMonths.css';

const MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const MONTHS_FULL = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const r1000 = (n: number) => Math.round(n / 1000) * 1000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** מה המשרד שלח בשאלה (prompt.input.context.data). */
export interface ForecastContext {
  /** החודש האחרון בפועל (1–12); 0 = עסק חדש בלי חודשים. */
  cutoff: number;
  /** בפועל לכל חודש, מינואר עד החתך (חודש בלי נתון — 0). */
  inc: number[];
  /** null — עסק זעיר (בלי הוצאות). */
  exp: number[] | null;
  /** החודש הראשון עם נתונים — הקצב נמדד ממנו. */
  first?: number;
  /** הצעה לשנה לעסק חדש (מהשאלון / מהכרטיס), אם יש. */
  newInc?: number;
  newExp?: number;
}

export function parseForecastContext(ctx?: Record<string, string>): ForecastContext | null {
  try { const v = JSON.parse(ctx?.data ?? '') as ForecastContext; return Array.isArray(v.inc) ? v : null; } catch { return null; }
}

function Side({ kind, label, past, first, cutoff, a, months, onChange, disabled, step }: {
  kind: 'inc' | 'exp'; label: string; past: number[]; first: number; cutoff: number; a?: string; months?: number[];
  onChange: (a: 'ok' | 'chg', months: number[]) => void; disabled?: boolean; step: number;
}) {
  const measured = past.slice(first - 1, cutoff);
  const avg = measured.length ? sum(measured) / measured.length : 0;
  const rest = 12 - cutoff;
  const fut = a === 'chg' && months?.length === rest ? months : Array(rest).fill(avg);
  const all = [...past.slice(0, cutoff), ...fut];
  const max = Math.max(1, ...all);
  const year = sum(all);
  return (
    <div className={`fm-card fm-${kind}`} data-fm={kind}>
      <div className="fm-head"><span>{label}</span><small>מפייפרלס</small></div>
      <div className="fm-chart" aria-hidden="true">
        {all.map((v, i) => (
          <div key={i}><i className={i >= cutoff ? 'is-f' : ''} style={{ height: `${Math.round((v / max) * 54)}px` }} /><span>{MONTHS[i]}</span></div>
        ))}
      </div>
      <p className="fm-text">עד {MONTHS_FULL[cutoff - 1]} <b>{nis(sum(past.slice(0, cutoff)))}</b><br />
        {a === 'chg' ? <>לפי ההערכה שלך — לכל השנה <b>{nis(year)}</b></> : <>אם הקצב יימשך — לכל השנה <b>כ-{nis(r1000(year))}</b></>}</p>
      <div className="fm-seg" role="group" aria-label={label}>
        <button type="button" aria-pressed={a === 'ok'} disabled={disabled} onClick={() => onChange('ok', [])}>נכון</button>
        <button type="button" aria-pressed={a === 'chg'} disabled={disabled}
          onClick={() => onChange('chg', months?.length === rest ? months : Array(rest).fill(r1000(avg)))}>יהיה אחרת</button>
      </div>
      {a === 'chg' && (
        <div className="fm-months">
          <p>כמה לדעתך בכל חודש?</p>
          {fut.map((v, j) => (
            <div className="fm-row" key={j}>
              <span>{MONTHS_FULL[cutoff + j]}</span>
              <div className="fm-step">
                <button type="button" aria-label={`פחות ב${MONTHS_FULL[cutoff + j]}`} disabled={disabled} onClick={() => onChange('chg', fut.map((x, k) => (k === j ? Math.max(0, x - step) : x)))}>−</button>
                <output>{nis(v)}</output>
                <button type="button" aria-label={`יותר ב${MONTHS_FULL[cutoff + j]}`} disabled={disabled} onClick={() => onChange('chg', fut.map((x, k) => (k === j ? x + step : x)))}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function YearOnly({ label, value, onChange, disabled, step }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; step: number }) {
  return (
    <div className="fm-card">
      <p className="fm-q">{label}</p>
      <div className="fm-step fm-step-lg">
        <button type="button" aria-label="פחות" disabled={disabled} onClick={() => onChange(Math.max(0, value - step))}>−</button>
        <output>{nis(value)}</output>
        <button type="button" aria-label="יותר" disabled={disabled} onClick={() => onChange(value + step)}>+</button>
      </div>
    </div>
  );
}

export default function ForecastMonthsEditor({ context, value, onChange, disabled, showErrors }: {
  context?: Record<string, string>; value: RecordAnswer; onChange: (v: RecordAnswer) => void; disabled?: boolean; showErrors?: boolean;
}) {
  const c = parseForecastContext(context);
  if (!c) return <p className="ty-note">אין כרגע נתונים להציג.</p>;
  const r: RecordValue = value.items[0] ?? {};
  const needsExp = c.exp != null;
  const set = (patch: RecordValue) => onChange({ items: [{ ...r, needsExp, ...patch }], none: false });
  const missing = showErrors && (!r.incA || (needsExp && !r.expA));

  if (c.cutoff === 0) {
    const inc = Number(r.incY ?? c.newInc ?? 0), exp = Number(r.expY ?? c.newExp ?? 0);
    return (
      <div className="fm" data-record-forecast>
        <YearOnly label="כמה בערך תכניס השנה בעסק? (לפני הוצאות)" value={inc} step={20000} disabled={disabled} onChange={v => set({ incA: 'chg', incY: v, ...(needsExp ? { expA: 'chg', expY: exp } : {}) })} />
        {needsExp && <YearOnly label="וכמה בערך יהיו ההוצאות?" value={exp} step={10000} disabled={disabled} onChange={v => set({ incA: 'chg', incY: inc, expA: 'chg', expY: v })} />}
      </div>
    );
  }
  const first = Math.max(1, Math.min(c.first ?? 1, c.cutoff));
  return (
    <div className="fm" data-record-forecast>
      <p className="fm-sub">מסומן בפסים — לפי הקצב שלך</p>
      <Side kind="inc" label="הכנסות" past={c.inc} first={first} cutoff={c.cutoff} a={r.incA as string | undefined} months={r.incM as number[] | undefined}
        step={2000} disabled={disabled} onChange={(a, m) => set({ incA: a, incM: a === 'chg' ? m : undefined })} />
      {needsExp && <Side kind="exp" label="הוצאות" past={c.exp!} first={first} cutoff={c.cutoff} a={r.expA as string | undefined} months={r.expM as number[] | undefined}
        step={1000} disabled={disabled} onChange={(a, m) => set({ expA: a, expM: a === 'chg' ? m : undefined })} />}
      {missing && <p className="ty-err" role="alert">לבחור «נכון» או «יהיה אחרת»{needsExp ? ' — בהכנסות ובהוצאות' : ''}</p>}
    </div>
  );
}
