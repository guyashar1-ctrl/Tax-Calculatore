import { useEffect, useState } from 'react';
import type { Employee } from '../types/clientWorkspace';
import { supabase } from '../lib/supabase';
import { employeeFromDb, employeeToDb } from '../lib/dbMappers';
import { useAuth } from './useAuth';

export function useEmployees() {
  const { user } = useAuth();
  const userId = user?.id;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setEmployees([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setEmployees((data ?? []).map(employeeFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function findEmployee(id?: string): Employee | undefined {
    if (!id) return undefined;
    return employees.find(e => e.id === id);
  }

  function employeeName(id?: string): string {
    return findEmployee(id)?.name ?? 'לא הוקצה';
  }

  /** Save = upsert: insert if new, update if exists. */
  async function saveEmployee(e: Employee): Promise<void> {
    if (!userId) throw new Error('Not signed in');
    const exists = employees.some(x => x.id === e.id);
    if (exists) {
      const row = employeeToDb(e);
      delete row.id;
      delete row.user_id;
      delete row.created_at;
      const { data, error } = await supabase
        .from('employees')
        .update(row)
        .eq('id', e.id)
        .select()
        .single();
      if (error) throw error;
      const updated = employeeFromDb(data);
      setEmployees(prev => prev.map(x => x.id === updated.id ? updated : x));
    } else {
      const row = employeeToDb(e, userId);
      const { data, error } = await supabase
        .from('employees')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      const inserted = employeeFromDb(data);
      setEmployees(prev => [...prev, inserted]);
    }
  }

  async function deleteEmployee(id: string): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
    setEmployees(prev => prev.filter(e => e.id !== id));
  }

  return { employees, loading, error, findEmployee, employeeName, saveEmployee, deleteEmployee };
}
