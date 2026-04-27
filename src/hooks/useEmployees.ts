// ─── רשימת עובדי המשרד — נשמרת ב-localStorage ─────────────────────────────
// ערכי ברירת מחדל מתוך data/employees.ts. ניתנת לעריכה מרכיב EmployeesPanel.

import { Employee } from '../types/clientWorkspace';
import { EMPLOYEES as DEFAULT_EMPLOYEES } from '../data/employees';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'crm_employees';

export function useEmployees() {
  const [employees, setEmployees] = useLocalStorage<Employee[]>(STORAGE_KEY, DEFAULT_EMPLOYEES);

  function findEmployee(id?: string): Employee | undefined {
    if (!id) return undefined;
    return employees.find(e => e.id === id);
  }

  function employeeName(id?: string): string {
    return findEmployee(id)?.name ?? 'לא הוקצה';
  }

  function saveEmployee(e: Employee) {
    setEmployees(prev => {
      const idx = prev.findIndex(x => x.id === e.id);
      if (idx >= 0) return prev.map(x => x.id === e.id ? e : x);
      return [...prev, e];
    });
  }

  function deleteEmployee(id: string) {
    setEmployees(prev => prev.filter(e => e.id !== id));
  }

  return { employees, setEmployees, saveEmployee, deleteEmployee, findEmployee, employeeName };
}
