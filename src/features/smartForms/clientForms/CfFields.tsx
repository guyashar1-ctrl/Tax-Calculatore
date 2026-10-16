// ─── שדות השאלון — רכיב אחד לדף האישי ולמילוי במשרד ──────────────────────────
// ‼ עיר ורחוב — HebrewTextInput (אותו כלל כמו בכרטיס ובמסד, 193). בנק — מרשימת בנק ישראל.

import { useEffect, useId, useState } from 'react';
import HebrewTextInput from '../../../components/ui/HebrewTextInput';
import { loadBankDirectory } from '../../taxYear/RecordEditor';
import type { BankDirectory } from '../../taxYear/records';
import type { CfData, CfField } from './types';
import { fieldError } from './format';

interface Props {
  fields: CfField[];
  values: CfData;
  /** נתוני הטופס (כרטיס + תשובות) — לתנאים ולהצעות. */
  data: CfData;
  onChange: (key: string, value: string) => void;
  showErrors?: boolean;
  disabled?: boolean;
}

export default function CfFields({ fields, values, data, onChange, showErrors, disabled }: Props) {
  const uid = useId();
  const merged = { ...data, ...values };
  const [dir, setDir] = useState<BankDirectory | null>(null);
  const needsDir = fields.some(f => f.input === 'bank');
  useEffect(() => { if (needsDir) void loadBankDirectory().then(setDir); }, [needsDir]);

  const checks = fields.filter(f => f.input === 'check');
  const rest = fields.filter(f => f.input !== 'check');
  const err = (f: CfField) => (showErrors ? fieldError(f, values[f.key], merged) : null);

  return (
    <div className="cf-grid">
      {checks.length > 0 && (
        <div className="cf-checks" role="group">
          {checks.map(f => {
            const on = values[f.key] === '1';
            return (
              <button key={f.key} type="button" className="ty-choice" aria-pressed={on} disabled={disabled}
                onClick={() => onChange(f.key, on ? '' : '1')}>
                <span className="cf-check-mark" aria-hidden="true">{on ? '✓' : ''}</span>{f.label}
              </button>
            );
          })}
        </div>
      )}
      {rest.map((f, i) => {
        const id = `${uid}-${f.key}-${i}`;
        const e = err(f);
        const v = values[f.key] ?? '';
        const full = !f.half || f.input === 'textarea' || f.input === 'choice' || f.input === 'bank' || f.input === 'select';
        const cls = `ty-field${full ? ' is-full' : ''}${e ? ' has-err' : ''}`;
        const describedBy = e ? `${id}-e` : f.hint ? `${id}-h` : undefined;
        if (f.input === 'choice') {
          return (
            <div key={id} className={cls} role="group" aria-labelledby={`${id}-l`} data-cf-key={f.key}>
              <span id={`${id}-l`} className="cf-label">{f.label}</span>
              <div className="cf-choice-row">
                {(f.options ?? []).map(o => (
                  <button key={o.value} type="button" className="ty-choice" aria-pressed={v === o.value} disabled={disabled}
                    onClick={() => onChange(f.key, o.value)}>{o.label}</button>
                ))}
              </div>
              {e && <span id={`${id}-e`} className="cf-field-err">{e}</span>}
            </div>
          );
        }
        const common = {
          id, value: v, disabled, 'aria-invalid': !!e || undefined, 'aria-describedby': describedBy,
          placeholder: f.placeholder,
        };
        let input: React.ReactNode;
        if (f.input === 'hebrew') {
          input = <HebrewTextInput {...common} onChange={ev => onChange(f.key, ev.target.value)} />;
        } else if (f.input === 'textarea') {
          input = <textarea {...common} onChange={ev => onChange(f.key, ev.target.value)} />;
        } else if (f.input === 'select') {
          // רשימה סגורה ארוכה (ענף כלכלי) — select, לא כפתורים
          input = (
            <select {...common} onChange={ev => onChange(f.key, ev.target.value)}>
              <option value="">בחירה…</option>
              {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        } else if (f.input === 'bank') {
          input = (
            <select {...common} onChange={ev => onChange(f.key, ev.target.value)}>
              <option value="">{dir ? 'בחירת בנק…' : 'טוען את רשימת הבנקים…'}</option>
              {(dir?.banks ?? []).map(b => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
              {v && dir && !dir.banks.some(b => b.code === v) && <option value={v}>בנק {v}</option>}
            </select>
          );
        } else {
          const numeric = ['id', 'zip', 'number', 'money', 'branch', 'account'].includes(f.input);
          const type = f.input === 'date' ? 'date' : f.input === 'month' ? 'month' : f.input === 'phone' ? 'tel' : 'text';
          input = (
            <input {...common} type={type} dir={numeric || f.input === 'phone' || f.input === 'date' || f.input === 'month' ? 'ltr' : undefined}
              inputMode={numeric ? 'numeric' : f.input === 'phone' ? 'tel' : undefined}
              autoComplete={f.input === 'phone' ? 'tel' : 'off'}
              onChange={ev => onChange(f.key, ev.target.value)} />
          );
        }
        return (
          <label key={id} className={cls} htmlFor={id} data-cf-key={f.key}>
            <span className="cf-label">{f.label}</span>
            {input}
            {f.hint && !e && <span id={`${id}-h`} className="ty-note">{f.hint}</span>}
            {e && <span id={`${id}-e`} className="cf-field-err">{e}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** שם הבנק לפי הקוד — נשמר בכרטיס יחד עם הקוד. */
export async function bankNameOf(code: string | undefined): Promise<string | undefined> {
  if (!code) return undefined;
  const dir = await loadBankDirectory();
  return dir?.banks.find(b => Number(b.code) === Number(code))?.name;
}
