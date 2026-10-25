// ─── «נקרא» בנושא, והמקום האחרון בספרייה (26.10.2026) ─────────────────────────────────────────
// ‼ נוחות למשתמש בדפדפן הזה בלבד: בלי ציון ובלי מעקב במשרד. אחסון חסום (חלון פרטי) ⇒ הכול עובד, רק לא נשמר.

import { useState } from 'react';

const MARKS_KEY = 'pivo.knowledge.read.v1';
const LAST_KEY = 'pivo.knowledge.last.v1';

type Marks = Record<string, string[]>;
function loadMarks(): Marks {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKS_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Marks : {};
  } catch { return {}; }
}

/** השלבים שסומנו כנקראו בנושא — רק מזהים שעדיין קיימים בו. */
export function readMarks(topicId: string, validIds: string[]): string[] {
  const v = loadMarks()[topicId];
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && validIds.includes(x)) : [];
}

export function useReadingMarks(topicId: string, validIds: string[]) {
  const [done, setDone] = useState<string[]>(() => readMarks(topicId, validIds));
  const [saved, setSaved] = useState(true);
  const mark = (id: string, value = true) => {
    setDone(prev => {
      const next = value ? [...new Set([...prev, id])] : prev.filter(x => x !== id);
      try { localStorage.setItem(MARKS_KEY, JSON.stringify({ ...loadMarks(), [topicId]: next })); setSaved(true); } catch { setSaved(false); }
      return next;
    });
  };
  return { done, mark, saved };
}

export interface LastRead { path: string; title: string }
export function readLastRead(): LastRead | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null') as LastRead | null;
    return v && typeof v.path === 'string' && typeof v.title === 'string' ? v : null;
  } catch { return null; }
}
export function saveLastRead(v: LastRead) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* אין אחסון — אין «להמשיך» */ }
}
