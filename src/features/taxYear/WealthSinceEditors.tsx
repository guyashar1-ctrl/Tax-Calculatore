// ─── הצהרת הון: «רמת חיים», «מה נכנס» ו«מה יצא» מאז ההצהרה הקודמת (27.10.2026) ─────────────────────────────
// ‼ הדמיה מאושרת: docs/proposals/2026-10-27-wealth-declaration.html. ריבועים, ולמה שסומן — סכום ב-± (בלי הקלדה ובלי טקסט
//   חופשי). מה שנשמר הוא רשומה אחת ('record'); הגישור במשרד (wealthDeclaration/bridge.ts) קורא אותה כמו שהיא.
import type { RecordAnswer, RecordValue } from './records';
import { LIFE_COSTS, MONEY_IN, MONEY_OUT } from './records';
import './wealthSince.css';

const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;

function Step({ value, step, onChange, disabled, label }: { value: number; step: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className="ws-step">
      <button type="button" aria-label={`פחות — ${label}`} disabled={disabled} onClick={() => onChange(Math.max(0, value - step))}>−</button>
      <output>{nis(value)}</output>
      <button type="button" aria-label={`יותר — ${label}`} disabled={disabled} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}

/** «טופס רמת חיים»: לשנה, בערך. שכר דירה ומשכנתא — לחודש. */
export function LifeCostsEditor({ value, onChange, disabled, showErrors }: { value: RecordAnswer; onChange: (v: RecordAnswer) => void; disabled?: boolean; showErrors?: boolean }) {
  const r: RecordValue = value.items[0] ?? {};
  const costs = (r.costs ?? {}) as Record<string, number>;
  const set = (patch: RecordValue) => onChange({ items: [{ ...r, ...patch }], none: false });
  const on = (k: string) => costs[k] !== undefined;
  const toggle = (k: string) => { const c = { ...costs }; if (on(k)) delete c[k]; else c[k] = k === 'home' ? 12000 : 5000; set({ costs: c }); };
  const monthly: [string, string, number][] = [['rentMonthly', 'שכר דירה', 4000], ['mortgageMonthly', 'החזר משכנתא', 4000]];
  const empty = !Object.keys(costs).length && !Number(r.rentMonthly) && !Number(r.mortgageMonthly);
  return (
    <div className="ws" data-record-life>
      <p className="ws-sub">בערך מספיק — בשנה רגילה. משמש להסבר הגידול בהון.</p>
      <div className="ws-tiles">
        {LIFE_COSTS.map(c => (
          <button type="button" key={c.key} className={`ws-tile${on(c.key) ? ' is-on' : ''}`} aria-pressed={on(c.key)} disabled={disabled} onClick={() => toggle(c.key)}>
            <b>{c.label}</b>{c.hint && <small>{c.hint}</small>}
          </button>
        ))}
        {monthly.map(([k, label, d]) => (
          <button type="button" key={k} className={`ws-tile${Number(r[k]) > 0 ? ' is-on' : ''}`} aria-pressed={Number(r[k]) > 0} disabled={disabled}
            onClick={() => set({ [k]: Number(r[k]) > 0 ? 0 : d })}><b>{label}</b><small>בחודש</small></button>
        ))}
      </div>
      {LIFE_COSTS.filter(c => on(c.key)).map(c => (
        <div className="ws-row" key={c.key}><span>{c.label} — בשנה</span><Step label={c.label} value={costs[c.key]} step={1000} disabled={disabled} onChange={v => set({ costs: { ...costs, [c.key]: v } })} /></div>
      ))}
      {monthly.filter(([k]) => Number(r[k]) > 0).map(([k, label]) => (
        <div className="ws-row" key={k}><span>{label} — בחודש</span><Step label={label} value={Number(r[k])} step={250} disabled={disabled} onChange={v => set({ [k]: v })} /></div>
      ))}
      {showErrors && empty && <p className="ty-err" role="alert">לסמן לפחות דבר אחד</p>}
    </div>
  );
}

/** «מה נכנס» / «מה יצא» מאז ההצהרה הקודמת — לכל סוג שסומן: כמה ובאיזו שנה. */
export function MoneyFlowsEditor({ kind, context, value, onChange, disabled, showErrors }: {
  kind: 'in' | 'out'; context?: Record<string, string>; value: RecordAnswer; onChange: (v: RecordAnswer) => void; disabled?: boolean; showErrors?: boolean;
}) {
  const kinds = kind === 'in' ? MONEY_IN : MONEY_OUT;
  const toYear = Number(context?.toYear) || new Date().getFullYear();
  const fromYear = Math.max(toYear - 9, Number(context?.fromYear) || toYear - 5);
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);
  const r: RecordValue = value.items[0] ?? {};
  const flows = (r.flows ?? []) as { kind: string; amount: number; year?: number }[];
  const set = (f: typeof flows) => onChange({ items: [{ flows: f }], none: false });
  const has = (k: string) => flows.some(f => f.kind === k);
  const missing = showErrors && !value.none && (!flows.length || flows.some(f => !(f.amount > 0) || !f.year));
  return (
    <div className="ws" data-record-flows={kind}>
      <div className="ws-gate" role="group" aria-label="היה או לא היה">
        <button type="button" aria-pressed={!value.none && flows.length > 0} disabled={disabled} onClick={() => { if (!flows.length) set([{ kind: kinds[0].key, amount: 50000 }]); }}>היה</button>
        <button type="button" aria-pressed={!!value.none} disabled={disabled} onClick={() => onChange({ items: [], none: true })}>לא היה</button>
      </div>
      {!value.none && flows.length > 0 && (
        <>
          <div className="ws-tiles">
            {kinds.map(k => (
              <button type="button" key={k.key} className={`ws-tile${has(k.key) ? ' is-on' : ''}`} aria-pressed={has(k.key)} disabled={disabled}
                onClick={() => set(has(k.key) ? flows.filter(f => f.kind !== k.key) : [...flows, { kind: k.key, amount: 50000 }])}><b>{k.label}</b></button>
            ))}
          </div>
          {flows.map((f, i) => (
            <div className="ws-follow" key={f.kind}>
              <p>{kinds.find(k => k.key === f.kind)?.label} — כמה ובאיזו שנה?</p>
              <Step label={kinds.find(k => k.key === f.kind)?.label ?? ''} value={f.amount} step={10000} disabled={disabled} onChange={v => set(flows.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              <div className="ws-chips">
                {years.map(y => <button type="button" key={y} aria-pressed={f.year === y} disabled={disabled} onClick={() => set(flows.map((x, j) => (j === i ? { ...x, year: y } : x)))}>{y}</button>)}
              </div>
            </div>
          ))}
        </>
      )}
      {missing && <p className="ty-err" role="alert">{flows.length ? 'לכל אחד — סכום ושנה' : 'לבחור «היה» או «לא היה»'}</p>}
    </div>
  );
}
