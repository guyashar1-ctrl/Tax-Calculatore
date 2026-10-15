// ─── עיצוב ובדיקת ערכים לטפסי הלקוח ───────────────────────────────────────────
// ‼ הבדיקות כאן = _scf_invalid בשרת (247), ועוד ספרת ביקורת של ת.ז. שהשרת לא בודק.

import type { CfData, CfField, CfInput } from './types';
import { hasNonHebrewLetters } from '../../../utils/hebrewText';

const s = (v: string | undefined) => (v ?? '').trim();

/** YYYY-MM-DD ⇒ DD/MM/YYYY. ערך אחר — כמו שהוא. */
export function ilDate(iso: string | undefined): string {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s(iso);
}

export const digits = (v: string | undefined) => s(v).replace(/\D/g, '');

/** טלפון ישראלי ⇒ [קידומת, מספר]. נייד ו-07x: 3 ספרות; קווי: 2. */
export function splitPhone(v: string | undefined): [string, string] {
  const d = digits(v);
  if (!d) return ['', ''];
  if (d.length === 10) return [d.slice(0, 3), d.slice(3)];
  if (d.length === 9) return [d.slice(0, 2), d.slice(2)];
  return ['', d];
}

export function phoneDisplay(v: string | undefined): string {
  const [p, n] = splitPhone(v);
  return p ? `${p}-${n}` : n;
}

/** רחוב + מספר, ואז עיר: «הרצל 12, חיפה». */
export function addressLine(street?: string, house?: string, city?: string): string {
  const first = [s(street), s(house)].filter(Boolean).join(' ');
  return [first, s(city)].filter(Boolean).join(', ');
}

export function validIsraeliId(v: string): boolean {
  if (!/^\d{9}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let x = Number(v[i]) * ((i % 2) + 1);
    if (x > 9) x -= 9;
    sum += x;
  }
  return sum % 10 === 0;
}

export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** הודעת שגיאה לשדה, או null. ריק — רק כשחובה. */
export function fieldError(f: CfField, value: string | undefined, d: CfData): string | null {
  const v = s(value);
  const required = typeof f.required === 'function' ? f.required(d) : !!f.required;
  if (!v) return required ? 'חסר' : null;
  return inputError(f.input, v);
}

export function inputError(input: CfInput, v: string): string | null {
  switch (input) {
    case 'id': return validIsraeliId(v) ? null : 'מספר זהות לא תקין (9 ספרות כולל ספרת ביקורת)';
    case 'phone': return /^0\d{8,9}$/.test(v.replace(/[\s-]/g, '')) ? null : 'מספר טלפון לא תקין';
    case 'zip': return /^\d{7}$/.test(v) ? null : 'מיקוד — 7 ספרות';
    case 'hebrew': return hasNonHebrewLetters(v) ? 'בעברית בלבד' : null;
    case 'house': return /^[0-9א-ת/ -]{1,12}$/.test(v) ? null : 'מספר בית לא תקין';
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'תאריך לא תקין';
      const t = Date.parse(`${v}T12:00:00Z`);
      if (Number.isNaN(t) || v > todayIso() || v < '1930-01-01') return 'תאריך לא תקין';
      return null;
    }
    case 'month': return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? null : 'חודש לא תקין';
    case 'number': return /^\d{1,3}$/.test(v) && Number(v) >= 1 ? null : 'מספר לא תקין';
    case 'money': return /^\d{1,10}$/.test(v) ? null : 'סכום בשקלים, ספרות בלבד';
    case 'bank': return /^\d{1,3}$/.test(v) ? null : 'נא לבחור בנק';
    case 'branch': return /^\d{1,4}$/.test(v) ? null : 'מספר סניף — ספרות בלבד';
    case 'account': return /^\d{2,12}$/.test(v) ? null : 'מספר חשבון — ספרות בלבד';
    case 'text': case 'textarea': return v.length > 300 ? 'ארוך מדי' : null;
    default: return null;
  }
}

/** ניקוי לפני שליחה: טלפון — ספרות ומקף; ת.ז. — ספרות; כסף — ספרות. */
export function cleanValue(input: CfInput, v: string): string {
  const t = v.trim();
  if (input === 'phone') return phoneDisplay(t);
  if (input === 'id' || input === 'money' || input === 'zip' || input === 'branch' || input === 'account' || input === 'number') return t.replace(/[^\d]/g, '');
  return t;
}
