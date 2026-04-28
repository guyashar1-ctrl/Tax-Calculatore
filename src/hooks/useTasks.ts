import { useEffect, useState } from 'react';
import type { Task } from '../types';
import { supabase } from '../lib/supabase';
import { taskFromDb, taskToDb } from '../lib/dbMappers';

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setTasks((data ?? []).map(taskFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function addTask(task: Task): Promise<Task> {
    if (!userId) throw new Error('Not signed in');
    const row = taskToDb(task, userId);
    const { data, error } = await supabase.from('tasks').insert(row).select().single();
    if (error) throw error;
    const inserted = taskFromDb(data);
    setTasks(prev => [...prev, inserted]);
    return inserted;
  }

  async function updateTask(task: Task): Promise<Task> {
    const row = taskToDb(task);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('tasks')
      .update(row)
      .eq('id', task.id)
      .select()
      .single();
    if (error) throw error;
    const updated = taskFromDb(data);
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    return updated;
  }

  /**
   * Update many tasks in one batch. Used by drag-and-drop reordering
   * which needs to update sortOrder on multiple rows at once.
   */
  async function bulkUpdateTasks(updates: Task[]): Promise<void> {
    if (updates.length === 0) return;
    const ops = updates.map(async t => {
      const row = taskToDb(t);
      delete row.id;
      delete row.user_id;
      delete row.created_at;
      const { error } = await supabase
        .from('tasks')
        .update(row)
        .eq('id', t.id);
      if (error) throw error;
    });
    await Promise.all(ops);
    const byId = new Map(updates.map(t => [t.id, t]));
    setTasks(prev => prev.map(t => byId.get(t.id) ?? t));
  }

  async function deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function bulkAddTasks(toAdd: Task[]): Promise<Task[]> {
    if (!userId) throw new Error('Not signed in');
    if (toAdd.length === 0) return [];
    const rows = toAdd.map(t => taskToDb(t, userId));
    const { data, error } = await supabase.from('tasks').insert(rows).select();
    if (error) throw error;
    const inserted = (data ?? []).map(taskFromDb);
    setTasks(prev => [...prev, ...inserted]);
    return inserted;
  }

  return { tasks, loading, error, addTask, updateTask, bulkUpdateTasks, deleteTask, bulkAddTasks };
}
