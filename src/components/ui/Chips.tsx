/**
 * שתי דקדוקי הבחירה של המוצר — אפיון D1. ההבדל אינו קישוטי:
 *
 *   FilterChip (אפור)  — משנה את מה שאתה *רואה*: סינון, תצוגה, ניווט, בחירת שנה.
 *   SelectPill (שחור)  — משנה את מה שאתה *שומר* או את התשובה המחושבת.
 *
 * מסך שמערבב את השניים מלמד את המשתמש שהצבע לא אומר כלום. אין ערבוב.
 */
import { ReactNode } from 'react';
import Icon from './Icon';

// ─── צ'יפ סינון · אפור ──────────────────────────────────────────────────────

interface FilterChipProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** מציג בקצה — הצ'יפ מייצג סינון שאפשר להסיר. לחיצה בכל מקום מסירה. */
  removable?: boolean;
  count?: number;
  title?: string;
}

export function FilterChip({ active, onClick, children, removable, count, title }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`ui-chip ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={!!active}
      title={title}
    >
      <span>{children}</span>
      {count !== undefined && <span className="ui-chip-count">{count}</span>}
      {removable && active && <Icon name="close" size={12} className="ui-chip-x" />}
    </button>
  );
}

// ─── גלולת בחירה · שחור ─────────────────────────────────────────────────────

export interface PillOption<T extends string> {
  value: T;
  label: ReactNode;
  color?: string;
}

interface SelectPillsProps<T extends string> {
  options: PillOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** שם הקבוצה לקוראי מסך — למשל "הכדור אצל" */
  label: string;
  size?: 'sm' | 'md';
}

export function SelectPills<T extends string>({ options, value, onChange, label, size = 'md' }: SelectPillsProps<T>) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex(o => o.value === value);
    // RTL: חץ שמאלה מתקדם קדימה ברשימה, ימינה חוזר אחורה
    const forward = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
    const next = i < 0 ? 0 : (i + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
  }

  return (
    <div className={`ui-pills ui-pills-${size}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map(o => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === null && o === options[0]) ? 0 : -1}
            className={`ui-pill ${selected ? 'is-selected' : ''}`}
            style={!selected && o.color ? { color: o.color } : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
