// ─── עורך רשומות מובנות — ללקוח בדף האישי ולמשרד (13.10.2026) ──────────────────────
// ‼ כל נתון בשדה משלו (records.ts). כרטיס לכל פריט, «＋ הוספה», «הסרה», ו«אין» כתשובה.
// ‼ בנק וסניף — מהרשימה של בנק ישראל (public/data/bank-branches.json, scripts/update-bank-branches.mjs),
//   עם חיפוש לפי שם או מספר. סניף שאינו ברשימה (בנק דיגיטלי, סניף חדש) — מוזן ידנית, לא נדחה.
// ‼ תאריך עם דיוק: «רק שנה», «בערך» ו«לא יודע/ת» הם תשובות; לא הופכים אותם לתאריך מדויק.

import { useEffect, useId, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { RecordSchemaId } from './types';
import type { DatedValue } from './temporal';
import { PRECISION_LABEL, monthInKey, schemaFor, validateRecord, type BankDirectory, type RecordAnswer, type RecordField, type RecordValue } from './records';

let dirPromise: Promise<BankDirectory | null> | null = null;
/** רשימת הבנקים והסניפים — נטענת פעם אחת, רק כשיש שדה בנק. כשל טעינה ⇒ הזנה ידנית (לא חוסם). */
export function loadBankDirectory(): Promise<BankDirectory | null> {
  if (!dirPromise) {
    dirPromise = fetch('/data/bank-branches.json').then(r => (r.ok ? r.json() as Promise<BankDirectory> : null)).catch(() => null);
  }
  return dirPromise;
}

interface Props {
  schemaId: RecordSchemaId;
  client?: Client;
  context?: Record<string, string>;
  value: RecordAnswer;
  onChange: (v: RecordAnswer) => void;
  /** הצג שגיאות (אחרי ניסיון שליחה). */
  showErrors?: boolean;
  disabled?: boolean;
}

const emptyFor = (fields: RecordField[]): RecordValue =>
  Object.fromEntries(fields.filter(f => f.type === 'choice' && f.key === 'foreign').map(f => [f.key, 'no']));

export default function RecordEditor({ schemaId, client, context, value, onChange, showErrors, disabled }: Props) {
  const schema = useMemo(() => schemaFor(schemaId, client, context), [schemaId, client, context]);
  const uid = useId();
  const items = value.items.length || value.none ? value.items : [emptyFor(schema.fields)];
  const [dir, setDir] = useState<BankDirectory | null>(null);
  const needsDir = schema.fields.some(f => f.type === 'bank' || f.type === 'branch');
  useEffect(() => { if (needsDir) void loadBankDirectory().then(setDir); }, [needsDir]);

  const setItem = (i: number, patch: RecordValue) => {
    const next = items.map((r, k) => (k === i ? { ...r, ...patch } : r));
    onChange({ items: next, none: false });
  };
  const remove = (i: number) => onChange({ items: items.filter((_, k) => k !== i), none: false });
  const add = () => onChange({ items: [...items, emptyFor(schema.fields)], none: false });

  return (
    <div className="rec" data-record={schemaId}>
      {schema.noneLabel && (
        <div className="ty-choices" role="group" aria-label="יש או אין">
          <button type="button" className="ty-choice" aria-pressed={!!value.none} disabled={disabled}
            onClick={() => onChange(value.none ? { items: [emptyFor(schema.fields)] } : { items: [], none: true })}>{schema.noneLabel}</button>
        </div>
      )}
      {!value.none && items.map((r, i) => {
        const errs = showErrors ? validateRecord(schema, r) : {};
        return (
          <fieldset key={i} className="rec-card" disabled={disabled}>
            {schema.multiple && <legend className="rec-legend">{schema.noun} {items.length > 1 ? i + 1 : ''}</legend>}
            <div className="rec-grid">
              {schema.fields.filter(f => !f.showIf || f.showIf(r)).map(f => (
                <Field key={f.key} f={f} r={r} err={errs[f.key]} dir={dir} id={`${uid}-${i}-${f.key}`} onChange={v => setItem(i, v)} />
              ))}
            </div>
            {schema.multiple && items.length > 1 && (
              <button type="button" className="rec-remove" onClick={() => remove(i)}>הסרת {schema.noun}</button>
            )}
          </fieldset>
        );
      })}
      {!value.none && schema.multiple && <button type="button" className="rec-add" disabled={disabled} onClick={add}>{schema.addLabel}</button>}
      {needsDir && dir?.sourceUpdated && (
        <p className="rec-src">רשימת הבנקים והסניפים: בנק ישראל (סניפים פיזיים), עודכנה {dir.sourceUpdated.slice(0, 10).split('-').reverse().join('.')}. סניף שלא ברשימה — אפשר להזין את מספרו.</p>
      )}
    </div>
  );
}

function Field({ f, r, err, dir, id, onChange }: { f: RecordField; r: RecordValue; err?: string; dir: BankDirectory | null; id: string; onChange: (patch: RecordValue) => void }) {
  const v = r[f.key];
  const label = <span className="rec-label">{f.label}{f.required ? '' : <span className="rec-opt"> (לא חובה)</span>}</span>;
  const hintId = f.hint ? `${id}-h` : undefined;
  const errId = err ? `${id}-e` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const foot = <>{f.hint && <span className="rec-hint" id={hintId}>{f.hint}</span>}{err && <span className="rec-err" id={errId} role="alert">{err}</span>}</>;
  const cls = `rec-field${f.half ? ' is-half' : ''}${err ? ' has-err' : ''}`;

  if (f.type === 'choice') {
    return (
      <div className={cls} role="radiogroup" aria-labelledby={`${id}-l`} aria-describedby={describedBy}>
        <span id={`${id}-l`} className="rec-label">{f.label}</span>
        <div className="rec-seg">
          {f.options!.map(o => (
            <button key={o.value} type="button" role="radio" aria-checked={v === o.value} className="rec-seg-btn" onClick={() => onChange({ [f.key]: o.value })}>{o.label}</button>
          ))}
        </div>
        {foot}
      </div>
    );
  }
  if (f.type === 'pick') {
    return (
      <label className={cls} htmlFor={id}>
        <span className="rec-label">{f.label}</span>
        <select id={id} value={String(v ?? '')} aria-invalid={!!err} aria-describedby={describedBy} onChange={e => onChange({ [f.key]: e.target.value || undefined })}>
          <option value="">בחירה…</option>
          {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {foot}
      </label>
    );
  }
  if (f.type === 'monthIn' && f.year) {
    // ‼ 20.10.2026 · חודש בשנת הדוח בלבד; «לפני» שומר את התאריך מהתיק כשהוא לפני השנה (לא ממציאים תאריך)
    const Y = f.year;
    const cur = monthInKey(v, Y, f.edge ?? 'start');
    const pick = (k: string) => onChange({ [f.key]: k === '' ? undefined : k === 'before'
      ? ((v as DatedValue | undefined)?.date && (v as DatedValue).date! < `${Y}-01-01` ? v : { precision: 'unknown' })
      : { precision: 'month', date: `${Y}-${k}-01` } });
    return (
      <label className={cls} htmlFor={id}>
        <span className="rec-label">{f.label}</span>
        <select id={id} value={cur} aria-invalid={!!err} aria-describedby={describedBy} onChange={e => pick(e.target.value)}>
          {f.edge === 'end' ? <option value="">עדיין שם</option> : <>{!cur && <option value="">בחירה…</option>}<option value="before">לפני {Y}</option></>}
          {MONTHS_HE.map((m, i) => { const k = String(i + 1).padStart(2, '0'); return <option key={k} value={k}>{m} {Y}</option>; })}
        </select>
        {foot}
      </label>
    );
  }
  if (f.type === 'dated') return <DatedField f={f} v={v as DatedValue | undefined} id={id} cls={cls} foot={foot} describedBy={describedBy} onChange={d => onChange({ [f.key]: d })} />;
  if (f.type === 'bank') return <BankField id={id} cls={cls} label={f.label} foot={foot} dir={dir} value={String(v ?? '')} onPick={code => onChange({ [f.key]: code, branchCode: '' })} />;
  if (f.type === 'branch') return <BranchField id={id} cls={cls} label={f.label} foot={foot} dir={dir} bank={String(r.bankCode ?? '')} value={String(v ?? '')} onPick={code => onChange({ [f.key]: code })} />;

  const type = f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'percent' ? 'number' : 'text';
  const ltr = f.type === 'digits' || f.type === 'number' || f.type === 'percent' || f.type === 'date';
  return (
    <label className={cls} htmlFor={id}>
      {label}
      <input id={id} type={type} dir={ltr ? 'ltr' : undefined} value={String(v ?? '')} placeholder={f.placeholder}
        inputMode={f.type === 'digits' ? 'numeric' : f.type === 'number' || f.type === 'percent' ? 'decimal' : undefined}
        maxLength={f.maxLength} min={type === 'number' ? 0 : undefined} max={f.type === 'percent' ? 100 : f.type === 'date' && !f.allowFuture ? new Date().toISOString().slice(0, 10) : undefined}
        aria-invalid={!!err} aria-describedby={describedBy}
        // ‼ ספרות: מסננים כל תו שאינו ספרה, אבל לא נוגעים באפסים מובילים
        onChange={e => onChange({ [f.key]: f.type === 'digits' ? e.target.value.replace(/\D/g, '') : e.target.value })} />
      {foot}
    </label>
  );
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function DatedField({ f, v, id, cls, foot, describedBy, onChange }: { f: RecordField; v?: DatedValue; id: string; cls: string; foot: React.ReactNode; describedBy?: string; onChange: (d: DatedValue | undefined) => void }) {
  const precision = v?.precision ?? 'day';
  const y = v?.date?.slice(0, 4) ?? '';
  const m = v?.date ? Number(v.date.slice(5, 7)) : 0;
  const set = (p: DatedValue['precision'], date?: string) => onChange(p === 'unknown' ? { precision: 'unknown' } : date ? { precision: p, date } : { precision: p });
  const allowed = f.precisions ?? (['day', 'month', 'year', 'approx', 'unknown'] as DatedValue['precision'][]);
  return (
    <div className={cls} role="group" aria-labelledby={`${id}-l`} aria-describedby={describedBy}>
      <span id={`${id}-l`} className="rec-label">{f.label}{f.required ? '' : <span className="rec-opt"> (לא חובה)</span>}</span>
      <div className="rec-dated">
        <select aria-label={`${f.label} — כמה מדויק`} value={v ? precision : ''} onChange={e => set(e.target.value as DatedValue['precision'], e.target.value === 'unknown' ? undefined : v?.date)}>
          {!v && <option value="">בחירה…</option>}
          {allowed.map(p => <option key={p} value={p}>{PRECISION_LABEL[p]}</option>)}
        </select>
        {v && precision === 'day' && <input type="date" dir="ltr" aria-label={f.label} value={v.date ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={e => set('day', e.target.value)} />}
        {v && precision === 'month' && (
          <>
            <select aria-label="חודש" value={m || ''} onChange={e => set('month', `${y || new Date().getFullYear()}-${String(e.target.value).padStart(2, '0')}-01`)}>
              <option value="">חודש</option>{MONTHS_HE.map((n, k) => <option key={k} value={k + 1}>{n}</option>)}
            </select>
            <input type="number" dir="ltr" inputMode="numeric" aria-label="שנה" placeholder="שנה" min={1950} max={2100} value={y}
              onChange={e => set('month', `${e.target.value}-${String(m || 1).padStart(2, '0')}-01`)} />
          </>
        )}
        {v && (precision === 'year' || precision === 'approx') && (
          <input type="number" dir="ltr" inputMode="numeric" aria-label="שנה" placeholder="שנה" min={1950} max={2100} value={y}
            onChange={e => set(precision, e.target.value.length === 4 ? `${e.target.value}-01-01` : undefined)} />
        )}
      </div>
      {foot}
    </div>
  );
}

const norm = (s: string) => s.replace(/["׳״'\-.,]/g, '').replace(/\s+/g, ' ').trim();

function BankField({ id, cls, label, foot, dir, value, onPick }: { id: string; cls: string; label: string; foot: React.ReactNode; dir: BankDirectory | null; value: string; onPick: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!value);
  const picked = dir?.banks.find(b => b.code === value.padStart(2, '0'));
  const list = !dir ? [] : dir.banks.filter(b => !q || b.code.includes(q.replace(/^0+/, '') || q) || norm(b.name).includes(norm(q))).slice(0, 8);
  if (value && !open) {
    return (
      <div className={cls}>
        <span className="rec-label">{label}</span>
        <div className="rec-picked"><b dir="ltr">{value.padStart(2, '0')}</b> <span>{picked?.name ?? 'בנק שאינו ברשימה'}</span>
          <button type="button" className="rec-link" onClick={() => setOpen(true)}>שינוי</button></div>
        {foot}
      </div>
    );
  }
  return (
    <div className={cls}>
      <label className="rec-label" htmlFor={id}>{label}</label>
      <input id={id} value={q} placeholder="שם הבנק או מספר — למשל «לאומי» או 10" autoComplete="off" onChange={e => setQ(e.target.value)} />
      {!dir && <span className="rec-hint">רשימת הבנקים לא נטענה — אפשר לכתוב את מספר הבנק (2 ספרות) ולבחור «הזנה ידנית».</span>}
      <ul className="rec-options" role="listbox" aria-label="בנקים">
        {list.map(b => <li key={b.code}><button type="button" role="option" aria-selected={b.code === value} onClick={() => { onPick(b.code); setOpen(false); setQ(''); }}><b dir="ltr">{b.code}</b> {b.name}</button></li>)}
        {/^\d{1,2}$/.test(q) && !list.some(b => b.code === q.padStart(2, '0')) && (
          <li><button type="button" role="option" aria-selected={false} onClick={() => { onPick(q.padStart(2, '0')); setOpen(false); setQ(''); }}>הזנה ידנית: בנק <b dir="ltr">{q.padStart(2, '0')}</b> (לא ברשימה)</button></li>
        )}
      </ul>
      {foot}
    </div>
  );
}

function BranchField({ id, cls, label, foot, dir, bank, value, onPick }: { id: string; cls: string; label: string; foot: React.ReactNode; dir: BankDirectory | null; bank: string; value: string; onPick: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!value);
  const b = bank.padStart(2, '0');
  const all = useMemo(() => (dir ? dir.branches.filter(x => x[0] === b) : []), [dir, b]);
  const picked = all.find(x => x[1] === value.padStart(3, '0'));
  if (!bank) return <div className={cls}><span className="rec-label">{label}</span><span className="rec-hint">קודם בוחרים בנק.</span></div>;
  if (value && !open) {
    return (
      <div className={cls}>
        <span className="rec-label">{label}</span>
        <div className="rec-picked"><b dir="ltr">{value.padStart(3, '0')}</b> <span>{picked ? `${picked[2]}${picked[3] ? ` · ${picked[3]}` : ''}${picked[4] ? ' (נסגר)' : ''}` : 'סניף שאינו ברשימה — נשמר כפי שהוזן'}</span>
          <button type="button" className="rec-link" onClick={() => setOpen(true)}>שינוי</button></div>
        {foot}
      </div>
    );
  }
  const qq = norm(q);
  const list = all.filter(x => !q || x[1].includes(q.replace(/^0+/, '') || q) || norm(x[2]).includes(qq) || norm(x[3]).includes(qq)).slice(0, 8);
  return (
    <div className={cls}>
      <label className="rec-label" htmlFor={id}>{label}</label>
      <input id={id} value={q} placeholder="מספר הסניף, שם הסניף או העיר" autoComplete="off" onChange={e => setQ(e.target.value)} />
      <ul className="rec-options" role="listbox" aria-label="סניפים">
        {list.map(x => (
          <li key={x[1]}><button type="button" role="option" aria-selected={x[1] === value} onClick={() => { onPick(x[1]); setOpen(false); setQ(''); }}>
            <b dir="ltr">{x[1]}</b> {x[2]}{x[3] ? ` · ${x[3]}` : ''}{x[4] ? <span className="rec-hint"> — נסגר{x[6] ? `, מוזג לסניף ${x[6]}` : ''}</span> : null}
          </button></li>
        ))}
        {/^\d{1,3}$/.test(q) && !list.some(x => x[1] === q.padStart(3, '0')) && (
          <li><button type="button" role="option" aria-selected={false} onClick={() => { onPick(q.padStart(3, '0')); setOpen(false); setQ(''); }}>הזנה ידנית: סניף <b dir="ltr">{q.padStart(3, '0')}</b> (לא ברשימה)</button></li>
        )}
        {q && list.length === 0 && !/^\d{1,3}$/.test(q) && <li className="rec-hint">לא נמצא. אפשר לכתוב את מספר הסניף (3 ספרות).</li>}
      </ul>
      {foot}
    </div>
  );
}
