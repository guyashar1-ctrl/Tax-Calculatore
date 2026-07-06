// ─── רכיב שאלה בודדת — משמש גם בשאלון רץ וגם בעריכת תשובה קיימת ───────────

import { useEffect, useState } from 'react';
import type { AnswerValue, QuestionNode } from './types';

interface Props {
  node: QuestionNode;
  initialValue?: AnswerValue;       // לערוך תשובה קיימת — נטען כברירת מחדל
  disabled: boolean;
  submitLabel?: string;             // ברירת מחדל: "המשך →" / בעריכה: "שמור"
  variant?: 'tiles';                // תצוגת אריחים גדולה — למסך השער
  onSubmit: (value: AnswerValue) => void;
  onCancel?: () => void;
}

export default function QuestionCard({
  node,
  initialValue,
  disabled,
  submitLabel,
  variant,
  onSubmit,
  onCancel,
}: Props) {
  const [singleValue, setSingleValue] = useState<string>('');
  const [multiValue, setMultiValue] = useState<string[]>([]);
  const [textValue, setTextValue] = useState<string>('');
  const [numberValue, setNumberValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean | null>(null);

  // טען ערך התחלתי לפי סוג השאלה כשהשאלה משתנה או כשהערך משתנה
  useEffect(() => {
    setSingleValue(typeof initialValue === 'string' ? initialValue : '');
    setMultiValue(Array.isArray(initialValue) ? (initialValue as string[]) : []);
    setTextValue(typeof initialValue === 'string' ? initialValue : '');
    setNumberValue(typeof initialValue === 'number' ? String(initialValue) : (initialValue !== undefined && initialValue !== null && initialValue !== '' ? String(initialValue) : ''));
    setBoolValue(typeof initialValue === 'boolean' ? initialValue : null);
  }, [node.id, initialValue]);

  function handleSubmit() {
    if (node.type === 'single_select') {
      if (!singleValue && node.required) return;
      onSubmit(singleValue);
    } else if (node.type === 'multi_select') {
      if (multiValue.length === 0 && node.required) return;
      onSubmit(multiValue);
    } else if (node.type === 'text') {
      onSubmit(textValue);
    } else if (node.type === 'number') {
      const n = Number(numberValue);
      onSubmit(isNaN(n) ? 0 : n);
    } else if (node.type === 'boolean') {
      if (boolValue === null && node.required) return;
      onSubmit(boolValue ?? false);
    }
  }

  const canSubmit = (() => {
    if (!node.required) return true;
    if (node.type === 'single_select') return !!singleValue;
    if (node.type === 'multi_select') return multiValue.length > 0;
    if (node.type === 'boolean') return boolValue !== null;
    if (node.type === 'number') return numberValue !== '';
    return true;
  })();

  return (
    <div>
      <h3 style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.5 }}>{node.question}</h3>
      {node.helpText && (
        <p style={{ marginTop: '.5rem', marginBottom: 0, color: 'var(--gray-600)', fontSize: '.9rem', lineHeight: 1.5 }}>
          {node.helpText}
        </p>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        {node.type === 'single_select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {node.options?.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '.6rem .9rem', border: '1px solid var(--gray-200)',
                  borderRadius: 6, cursor: 'pointer',
                  background: singleValue === opt.value ? 'var(--blue-light)' : 'white',
                }}
              >
                <input
                  type="radio"
                  name={node.id}
                  checked={singleValue === opt.value}
                  onChange={() => setSingleValue(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {node.type === 'multi_select' && variant === 'tiles' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.7rem' }}>
            {node.options?.map((opt) => {
              const checked = multiValue.includes(opt.value);
              // התווית באה בפורמט "אימוג'י כותרת (פירוט)" — מפצלים לתצוגת אריח
              const [icon, ...rest] = opt.label.split(' ');
              const text = rest.join(' ');
              const parenIdx = text.indexOf('(');
              const title = parenIdx > 0 ? text.slice(0, parenIdx).trim() : text;
              const sub = parenIdx > 0 ? text.slice(parenIdx + 1).replace(/\)$/, '') : '';
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    setMultiValue((prev) =>
                      prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value],
                    );
                  }}
                  aria-pressed={checked}
                  style={{
                    textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer',
                    padding: '.85rem .95rem', borderRadius: 10,
                    border: checked ? '2px solid var(--blue)' : '1.5px solid var(--gray-200)',
                    background: checked ? 'var(--blue-light, #dbeafe)' : 'white',
                    position: 'relative', transition: 'border-color .12s, background .12s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 8, left: 10, width: 20, height: 20, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem',
                    background: checked ? 'var(--blue)' : 'var(--gray-100)',
                    color: checked ? 'white' : 'transparent',
                  }}>✓</span>
                  <span style={{ fontSize: '1.4rem', display: 'block' }}>{icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '.92rem', display: 'block', marginTop: 4 }}>{title}</span>
                  {sub && <span style={{ fontSize: '.76rem', color: 'var(--gray-500)', display: 'block', lineHeight: 1.35 }}>{sub}</span>}
                </button>
              );
            })}
          </div>
        )}

        {node.type === 'multi_select' && variant !== 'tiles' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.5rem' }}>
            {node.options?.map((opt) => {
              const checked = multiValue.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '.6rem .9rem', border: '1px solid var(--gray-200)',
                    borderRadius: 6, cursor: 'pointer',
                    background: checked ? 'var(--blue-light)' : 'white',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setMultiValue([...multiValue, opt.value]);
                      else setMultiValue(multiValue.filter((v) => v !== opt.value));
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {node.type === 'boolean' && (
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button
              type="button"
              className={`btn ${boolValue === true ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBoolValue(true)}
            >
              כן
            </button>
            <button
              type="button"
              className={`btn ${boolValue === false ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBoolValue(false)}
            >
              לא
            </button>
            {node.audience !== 'accountant' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onSubmit('unknown')}
                disabled={disabled}
                style={{ color: 'var(--gray-500)' }}
                title="נמשיך הלאה — רואה החשבון יבדוק את זה איתך"
              >
                🤷 לא בטוח/ה
              </button>
            )}
          </div>
        )}

        {node.type === 'number' && (
          <input
            type="number"
            className="input"
            value={numberValue}
            onChange={(e) => setNumberValue(e.target.value)}
            style={{ maxWidth: 300, padding: '.6rem .9rem', fontSize: '1rem' }}
            placeholder="הזן מספר"
          />
        )}

        {node.type === 'text' && (
          <input
            type="text"
            className="input"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            style={{ maxWidth: 500, padding: '.6rem .9rem' }}
          />
        )}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={disabled}>
            ביטול
          </button>
        ) : <div />}
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSubmit}
          disabled={!canSubmit || disabled}
        >
          {disabled ? 'שומר...' : (submitLabel ?? 'המשך →')}
        </button>
      </div>
    </div>
  );
}
