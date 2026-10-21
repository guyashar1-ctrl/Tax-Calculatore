// ─── «איך מפיקים משע״ם» — מדריך צעדים עם צילומים מסומנים (16.10.2026) ──────────────────────────────
// ‼ הסימון מצויר כ-SVG מעל הצילום האמיתי (המושחר), וההסבר של כל סימון כתוב גם כטקסט ליד — לא רק בלחיצה.
// ‼ לחיצה על הצילום — הגדלה (מסך מלא, Escape סוגר).

import { useEffect, useState } from 'react';
import { ArrowChain } from '../../components/ui/ArrowPath';
import { ANNUAL_GUIDE, WEALTH_GUIDE, type GuideStep } from './guideSteps';

/** «IDOM ← אפשרות 4: «מעקב הגשת דוחות — כללי»» — הנתיב במסוף כשרשרת, ואז הכותרת. */
function StepLabel({ step }: { step: GuideStep }) {
  if (!step.path?.length) return <>{step.title}</>;
  return <><ArrowChain steps={step.path} />: {step.title}</>;
}

function Shot({ step, big }: { step: GuideStep; big?: boolean }) {
  if (!step.img) return null;
  const { w, h } = step.img;
  return (
    <span className={`shf-shot${big ? ' is-big' : ''}`}>
      <img src={step.img.src} alt={step.img.alt} width={w} height={h} loading="lazy" />
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        {(step.marks ?? []).map(m => {
          const r = Math.max(18, Math.min(w, h) * 0.028);
          const cx = Math.min(w - r - 2, m.x + m.w + r * 0.2), cy = Math.max(r + 2, m.y - r * 0.2);
          return (
            <g key={m.n}>
              <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={6} fill="none" stroke="#ff8a1f" strokeWidth={Math.max(3, w / 380)} />
              <circle cx={cx} cy={cy} r={r} fill="#ff8a1f" />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.25} fontWeight={700} fill="#1b1f24" fontFamily="Arial, sans-serif">{m.n}</text>
            </g>
          );
        })}
      </svg>
      {step.badge && <span className={`shf-badge${step.pending ? ' is-pending' : ''}`}>{step.badge}</span>}
    </span>
  );
}

export default function ShaamGuide({ initial = 'annual' }: { initial?: 'annual' | 'wealth' }) {
  const [tab, setTab] = useState<'annual' | 'wealth'>(initial);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const steps = tab === 'annual' ? ANNUAL_GUIDE : WEALTH_GUIDE;
  const step = steps[Math.min(i, steps.length - 1)];
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [zoom]);

  return (
    <div className="shf-guide" data-sf-guide>
      <div className="shf-seg" role="tablist" aria-label="איזו רשימה">
        {(['annual', 'wealth'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`shf-seg-btn${tab === t ? ' is-on' : ''}`} onClick={() => { setTab(t); setI(0); }} data-sf-guide-tab={t}>
            {t === 'annual' ? 'דוחות שנתיים (IDOM)' : 'הצהרות הון (AHZM)'}
          </button>
        ))}
      </div>
      <div className="shf-guide-body">
        <ol className="shf-steps" aria-label="הצעדים">
          {steps.map((s, k) => (
            <li key={s.id}>
              <button type="button" className={`shf-step-dot${k === i ? ' is-on' : ''}${s.pending ? ' is-pending' : ''}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)} data-sf-step={s.id}>
                <b>{k + 1}</b><span><StepLabel step={s} /></span>
              </button>
            </li>
          ))}
        </ol>
        <section className="shf-step" aria-live="polite" data-sf-step-body={step.id}>
          <h4><span>{i + 1}. <StepLabel step={step} /></span>{step.pending && <span className="shf-chip amber">ממתין לאימות</span>}</h4>
          <p>{step.body}</p>
          {step.img && (
            <button type="button" className="shf-shot-btn" onClick={() => setZoom(true)} aria-label={`הגדלת הצילום: ${step.img.alt}`} data-sf-zoom>
              <Shot step={step} />
            </button>
          )}
          {!!step.marks?.length && (
            <ol className="shf-marks">{step.marks.map(m => <li key={m.n}><b>{m.n}</b> {m.text}</li>)}</ol>
          )}
          <div className="shf-step-nav">
            <button type="button" className="btn btn-sm btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}>→ הקודם</button>
            <span className="shf-muted">{i + 1} מתוך {steps.length}</span>
            <button type="button" className="btn btn-sm btn-secondary" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>הבא ←</button>
          </div>
        </section>
      </div>
      {zoom && step.img && (
        <div className="shf-zoom" role="dialog" aria-modal="true" aria-label={step.img.alt} onClick={() => setZoom(false)} data-sf-zoom-open>
          <Shot step={step} big />
          <button type="button" className="shf-zoom-x" aria-label="סגירה" onClick={() => setZoom(false)}>✕</button>
        </div>
      )}
    </div>
  );
}
