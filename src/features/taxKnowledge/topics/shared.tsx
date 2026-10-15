import { createContext, useContext, useState, type ReactNode } from 'react';

/** לשוניות של נושא שיש לו שכבת לימוד: «ללמוד» ו«בתיק». «בקצרה» ו«מקורות» מוצגים בעמוד הנושא. */
export type TopicView = 'learn' | 'apply';

export interface TopicBodyProps {
  year: number;
  /** נושא בלי שכבת לימוד מתעלם — ומציג הכול ברצף, כמו קודם. */
  view?: TopicView;
  /** ערכים שידועים מהתיק כשנפתח מלקוח — לא מנחשים את מה שחסר. */
  ctx?: { name: string; selfEmployedStudyFund?: number; selfEmployedPension?: number; mixed?: boolean };
}

export interface TocItem { id: string; label: string; view?: TopicView }

/** ‼ 14.10.2026 · מסלול הלימוד: עמוד הנושא מחליט אילו סעיפים מוצגים בשלב הנוכחי (learnPath.ts). בלי ספק — הכול. */
export const SecFilter = createContext<((id: string) => boolean) | null>(null);

export function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const show = useContext(SecFilter);
  if (show && !show(id)) return null;
  return (
    <section className="kn-sec" id={id} aria-labelledby={`${id}-h`} tabIndex={-1}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

export interface QuizItem { q: string; options: { text: string; right: boolean }[]; why: string; level?: 'יסוד' | 'יישום' | 'מתקדם' }

/** תרגול קצר. ‼ לא נשמר ולא נמדד — כלי לעצמי, לא מבחן. */
export function Quiz({ items }: { items: QuizItem[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  return (
    <div className="kn-page" style={{ gap: 10 }}>
      <p className="kn-xs kn-muted" style={{ margin: 0 }}>לתרגול בלבד. לא נשמר ולא נמדד.</p>
      {items.map((it, qi) => {
        const p = picked[qi];
        const right = p !== undefined && it.options[p].right;
        return (
          <div key={qi} className="kn-q">
            <strong className="kn-small">{qi + 1}. {it.q}{it.level ? <span className="kn-level" style={{ marginInlineStart: 8 }}>{it.level}</span> : null}</strong>
            {it.options.map((o, oi) => (
              <button key={oi} type="button" aria-pressed={p === oi}
                className={`btn btn-secondary kn-opt ${p === oi ? (o.right ? 'is-right' : 'is-wrong') : ''}`}
                onClick={() => setPicked(s => ({ ...s, [qi]: oi }))}>{o.text}</button>
            ))}
            <div aria-live="polite">{p !== undefined && <p className="kn-small" style={{ margin: 0 }}>{right ? 'נכון. ' : 'לא בדיוק. '}{it.why}</p>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** הסבר צעד אחר צעד, עם «להציג הכל» למי שמעדיף לקרוא. */
export function Walk({ steps }: { steps: { title: string; value: string; note: string }[] }) {
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  if (all) return (
    <div className="kn-walk">
      <ol className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map(s => <li key={s.title}><strong>{s.title}:</strong> <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{s.value}</span> — {s.note}</li>)}
      </ol>
      <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setAll(false); setI(0); }}>צעד אחר צעד</button>
    </div>
  );
  const s = steps[i];
  return (
    <div className="kn-walk" aria-live="polite">
      <div className="kn-dots" aria-hidden="true">{steps.map((_, k) => <span key={k} className={k <= i ? 'is-on' : ''} />)}</div>
      <span className="kn-xs kn-muted">צעד {i + 1} מתוך {steps.length}</span>
      <strong>{s.title}</strong>
      <span className="kn-walk-num" dir="ltr" style={{ unicodeBidi: 'isolate', textAlign: 'end' }}>{s.value}</span>
      <span className="kn-small">{s.note}</span>
      <div className="kn-spread">
        <button type="button" className="btn btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}>הקודם</button>
        <div className="kn-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(true)}>להציג הכל</button>
          {i < steps.length - 1 && <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>הצעד הבא</button>}
        </div>
      </div>
    </div>
  );
}

export function NumField({ id, label, value, onChange, min = 0, max, step = 1 }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max: number; step?: number | 'any' }) {
  return (
    <label className="kn-field" htmlFor={id}>
      <span>{label}: <output htmlFor={id}>{Math.round(value).toLocaleString('he-IL')} ₪</output></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  );
}
