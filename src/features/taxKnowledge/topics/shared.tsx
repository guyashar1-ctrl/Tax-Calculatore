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
function quizOrder(q:string,n:number){const h=(s:string)=>{let x=2166136261;for(const ch of s)x=Math.imul(x^ch.charCodeAt(0),16777619);return x>>>0};return Array.from({length:n},(_,i)=>i).sort((a,b)=>h(q+'|'+a)-h(q+'|'+b))}
export function Quiz({ items }: { items: QuizItem[] }) {
 const [picked,setPicked]=useState<Record<number,number>>({});
 const [qi,setQi]=useState(0);
 const it=items[qi],p=picked[qi],right=p!==undefined&&it.options[p].right,order=quizOrder(it.q,it.options.length);
 const answered=Object.keys(picked).length,correct=Object.entries(picked).filter(([i,o])=>items[+i].options[o].right).length,wrong=items.map((_,i)=>i).filter(i=>picked[i]!==undefined&&!items[i].options[picked[i]].right);
 const move=(next:number)=>{setQi(next);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.focused-quiz .kn-q')?.focus())};
 return <div className="kn-page focused-quiz" style={{gap:14}}>
  <div className="quiz-position"><span>שאלה {qi+1} מתוך {items.length}</span><span>תרגול · ללא ציון</span></div>
  <div className="kn-q" tabIndex={-1}><strong className="kn-small">{it.q}{it.level?<span className="kn-level" style={{marginInlineStart:8}}>{it.level}</span>:null}</strong>
  <div role="radiogroup" aria-label={it.q}>{order.map(oi=>{const o=it.options[oi];return <label key={oi} className={`kn-opt ${p===oi?(o.right?'is-right':'is-wrong'):p!==undefined&&o.right?'is-answer':''}`}><input type="radio" name={'practice-'+it.q} checked={p===oi} onChange={()=>setPicked(s=>({...s,[qi]:oi}))}/><span>{o.text}</span></label>})}</div>
  <div aria-live="polite">{p!==undefined&&<p className="kn-small quiz-feedback">{right?'נכון. ':'התשובה הנכונה מסומנת. '}{it.why}</p>}</div></div>
  {qi===items.length-1&&answered===items.length&&<div className="quiz-recap" role="status"><b>{correct} מתוך {items.length} נכונות</b>{wrong.length>0&&<span>לחזור אל: {wrong.map(i=><button key={i} onClick={()=>move(i)}>שאלה {i+1}</button>)}</span>}</div>}
  <nav className="quiz-navigation" aria-label="ניווט בתרגול"><button disabled={qi===0} onClick={()=>move(qi-1)}>→ השאלה הקודמת</button>{qi<items.length-1&&<button onClick={()=>move(qi+1)}>{p===undefined?'לדלג כרגע':'לשאלה הבאה'} ←</button>}</nav>
 </div>;
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
      <input aria-label={label+" — סכום מדויק"} type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(Math.max(min,+e.target.value))} /><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  );
}
