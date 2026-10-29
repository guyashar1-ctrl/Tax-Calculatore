import type { AutoRow } from './automationList';

export const ACTION_FILTERS = [
  { id: 'all', label: 'הכול' }, { id: 'bookkeeping', label: 'הנהלת חשבונות' },
  { id: 'authorities', label: 'רשויות ופייפרלס' }, { id: 'messages', label: 'בקשות ומיילים' },
] as const;
export type ActionFilter = typeof ACTION_FILTERS[number]['id'];

/** תוכנית בלבד. אינה חלק מקטלוג ה-handlers ולעולם אינה מייצרת משימה. */
export const PLANNED_BOOKKEEPING: AutoRow = {
  id: 'bookkeeping-agent', group: 'authority', name: 'הכנת הוצאות לקליטה',
  trigger: 'דרך קלוד — לאחר הקמת הסוכן ואישור הצעות המיון',
  effect: 'מציג את החשבונית והסיווג המוצע לפי תורת המשרד, לבדיקה ולאישור שלך.',
  state: { label: 'בתכנון', tone: 'off' }, source: { type: 'none', text: 'הסוכן טרם הותקן' },
};
export function filterActionRows(rows: AutoRow[], query: string, group: ActionFilter): AutoRow[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    const planned = r.id === PLANNED_BOOKKEEPING.id;
    const inGroup = group === 'all' || (group === 'bookkeeping' ? planned || r.action?.system === 'paperless'
      : group === 'authorities' ? r.group === 'authority' && !planned : r.group !== 'authority');
    const text = [r.name, r.effect, r.trigger, r.action?.what, r.action?.manual, ...(r.action?.needs ?? [])].join(' ').toLowerCase();
    return inGroup && terms.every(t => text.includes(t));
  });
}
