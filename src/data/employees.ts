import { Employee } from '../types/clientWorkspace';

// משרד קטן — אפשר להחליף ידנית. ה-id חייב להישאר יציב.
export const EMPLOYEES: Employee[] = [
  { id: 'emp-self',   name: 'גיא (אני)',     role: 'רו״ח',           initials: 'גי', color: '#2563eb' },
  { id: 'emp-shira',  name: 'שירה כהן',      role: 'מנהלת חשבונות', initials: 'שכ', color: '#059669' },
  { id: 'emp-ron',    name: 'רון לוי',        role: 'מתמחה',         initials: 'רל', color: '#d97706' },
  { id: 'emp-orit',   name: 'אורית פרידמן',  role: 'יועצת מס',      initials: 'אפ', color: '#7c3aed' },
];

export function findEmployee(id?: string): Employee | undefined {
  if (!id) return undefined;
  return EMPLOYEES.find(e => e.id === id);
}

export function employeeName(id?: string): string {
  return findEmployee(id)?.name ?? 'לא הוקצה';
}
