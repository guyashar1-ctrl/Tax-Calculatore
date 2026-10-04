// התזכורות הקבועות ללקוח, ופקדים קטנים שחוזרים ב«אוטומציות» וב«מיילים».
// (2.10.2026) הועבר מ-RemindersPage, שאוחד לתוך «אוטומציות».
import { useState } from 'react';
import type { RepReminderAudience } from '../../../../supabase/functions/_shared/repTemplates.ts';

/**
 * ‼ הנושא כאן הוא הנושא שהשרת שולח בפועל (supabase/functions/representation-reminders,
 * quotation-reminders). הנוסח של התזכורות קבוע ואינו נערך — אומרים את זה בשורה,
 * במקום שהמשתמש יחפש אותו ב«מיילים» ולא ימצא.
 * ‼ `also` — נושא נוסף שאותה תזכורת שולחת במצב אחר (portal: כששע״ם ממתינה לאישור
 * הלקוח האישור הוא חובה, והנושא משתנה — index.ts, `required`). שניהם מוצגים.
 */
export interface RepReminderSpec {
  audience: RepReminderAudience;
  name: string;
  who: string;
  subject: string;
  also?: { when: string; subject: string };
}

export const REP_REMINDERS: RepReminderSpec[] = [
  { audience: 'sign', name: 'לחתום על ייפוי הכוח', who: 'למי שעוד לא חתם', subject: 'תזכורת - נשאר רק לחתום על ייפוי הכוח' },
  { audience: 'niClient', name: 'לאשר את הייצוג בביטוח לאומי', who: 'ללקוח, כשהוא זה שצריך לאשר', subject: 'תזכורת - אישור ייפוי הכוח בביטוח הלאומי עדיין ממתין' },
  { audience: 'niSpouse', name: 'לאשר את הייצוג בביטוח לאומי — בן/בת הזוג', who: 'לבן/בת הזוג, כשהם צריכים לאשר', subject: 'תזכורת - אישור ייפוי הכוח בביטוח הלאומי עדיין ממתין' },
  // ‼ «ברשות המסים» ולא «במס הכנסה»: האישור באזור האישי כולל גם מע״מ וניכויים.
  // ‼ 217 (H2.5b): בנושא של «חובה» — של מי ששע״ם ממתינה לו («שלך» או «של {שם}»), לא תמיד «שלך».
  { audience: 'portal', name: 'לאשר את הייצוג באזור האישי ברשות המסים', who: 'ללקוח, אחרי ההגשה לשע״ם',
    subject: 'תזכורת - יש לכם פעולה זמינה בדף האישי',
    also: { when: 'כשרשות המסים ממתינה לאישור הלקוח', subject: 'תזכורת - נדרש אישור (שלך / של בן/בת הזוג) לבקשת הייצוג ברשות המסים' } },
];
export const EXPIRY_SUBJECT = 'תזכורת - הצעת המחיר שלך בתוקף עד…';

/** שורת הנושא לתצוגה — כל הנושאים שהתזכורת יכולה לשלוח, כל אחד במצב שלו. */
export function reminderSubjectsText(r: RepReminderSpec): string {
  return r.also ? `«${r.subject}» · ${r.also.when}: «${r.also.subject}»` : `«${r.subject}»`;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="of-switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label}
        onChange={e => onChange(e.target.checked)} />
      <span className="of-switch-track" aria-hidden="true" />
      <span className="of-switch-text">{checked ? 'פעיל' : 'כבוי'}</span>
    </label>
  );
}

/** רק ספרות — מה שמוצג בשדה בזמן ההקלדה. */
export const numDigits = (text: string) => text.replace(/\D/g, '').slice(0, 3);

/** ערך שאפשר להעביר כבר בזמן ההקלדה: מספר שלם בטווח. אחרת null (ריק, 0, 70 כשהמקסימום 60). */
export function numLive(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

/** בעזיבת השדה / Enter: ריק — חוזר לערך הקודם; מחוץ לטווח — הגבול הקרוב. */
export function numCommit(text: string, min: number, max: number, previous: number): number {
  if (!/^\d+$/.test(text)) return previous;
  return Math.min(max, Math.max(min, Number(text)));
}

/**
 * שדה מספר קטן («אחרי [5] ימים»). ‼ ההגבלה רק בעזיבה / Enter: הגבלה בכל הקשה
 * הפכה מחיקה ל-1 ו«7» ל-17 — ונשמר ערך אחר מזה שהוקלד. בזמן ההקלדה מותר ריק,
 * וערך בטווח עובר מיד (כדי ששורת השמירה תופיע).
 */
export function Num({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const editing = text !== null;
  const commit = () => {
    if (text === null) return;
    const n = numCommit(text, min, max, value);
    setText(null);
    if (n !== value) onChange(n);
  };
  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" className="of-num"
      value={editing ? text : String(value)} aria-label={`${label} (${min}–${max})`}
      aria-invalid={editing && text !== '' && numLive(text, min, max) === null ? true : undefined}
      onFocus={e => { setText(String(value)); e.currentTarget.select(); }}
      onChange={e => {
        const t = numDigits(e.target.value);
        setText(t);
        const n = numLive(t, min, max);
        if (n !== null && n !== value) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}
