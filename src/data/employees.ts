import { Employee } from '../types/clientWorkspace';

// משרד קטן — אפשר להחליף ידנית. ה-id חייב להישאר יציב.
export const EMPLOYEES: Employee[] = [
  { id: 'emp-self',   name: 'גיא (אני)',     role: 'רו״ח',           initials: 'גי', color: '#3f5f8f' },
  { id: 'emp-shira',  name: 'שירה כהן',      role: 'מנהלת חשבונות', initials: 'שכ', color: '#2e7d5b' },
  { id: 'emp-ron',    name: 'רון לוי',        role: 'מתמחה',         initials: 'רל', color: '#b07515' },
  { id: 'emp-orit',   name: 'אורית פרידמן',  role: 'יועצת מס',      initials: 'אפ', color: '#6b4a87' },
];

export function findEmployee(id?: string): Employee | undefined {
  if (!id) return undefined;
  return EMPLOYEES.find(e => e.id === id);
}

export function employeeName(id?: string): string {
  return findEmployee(id)?.name ?? 'לא הוקצה';
}
