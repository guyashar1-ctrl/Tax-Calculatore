import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { supabase } from '../lib/supabase';
import { taskFromDb, taskToDb, sameValue } from '../lib/dbMappers';
import { SAMPLE_TASKS } from '../data/sampleTasks';

// DEV-only local brand-QA seed (see DEV_BYPASS_AUTHZ in useAuth). Compiled out of prod builds.
const DEV_SEED = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTHZ === 'true';

export function useTasks(userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>(DEV_SEED ? SAMPLE_TASKS : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // העותק העדכני ביותר שבזיכרון — הבסיס להשוואה "מה באמת השתנה" לפני כתיבה.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (DEV_SEED) { setTasks(SAMPLE_TASKS); setLoading(false); return; }
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

  /**
   * טעינה מחדש מהמסד. נדרשת כשהמסד עצמו משנה משימות מאחורי הקלעים —
   * "אצל מי הכדור" של משימת הייצוג מתעדכן שם בטריגר (28-rep-task-ball).
   */
  async function reloadTasks(): Promise<void> {
    if (DEV_SEED || !userId) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return;
    setTasks((data ?? []).map(taskFromDb));
  }

  async function addTask(task: Task): Promise<Task> {
    if (!userId) throw new Error('Not signed in');
    const row = taskToDb(task, userId);
    const { data, error } = await supabase.from('tasks').insert(row).select().single();
    if (error) throw error;
    const inserted = taskFromDb(data);
    setTasks(prev => [...prev, inserted]);
    return inserted;
  }

  /**
   * ‼ הדפדפן שולח רק מה שהשתנה מול העותק שבזיכרון, ולא את השורה כולה.
   * הד של שורה שלמה מהעותק שנטען היה דורס בשקט מה שהשרת כתב בינתיים — למשל
   * «אצל מי הכדור» של משימת ייצוג, שטריגר בשרת קובע. מפתח שנוקה בטופס
   * (תאריך יעד, תיאור, completed_at בפתיחה מחדש) נשלח כ-NULL (TASK_NULLABLE).
   */
  function taskPatch(next: Task, base: Task | undefined): Record<string, unknown> {
    const skip = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'onboardingStepId']);
    const n = next as unknown as Record<string, unknown>;
    const b = (base ?? {}) as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(n), ...Object.keys(b)])) {
      if (skip.has(k)) continue;
      if (!base || !sameValue(n[k], b[k])) patch[k] = n[k];
    }
    return taskToDb(patch as Partial<Task>);
  }

  function applyRows(rows: Record<string, any>[] | null): Task[] {
    const fresh = (rows ?? []).map(taskFromDb);
    if (fresh.length > 0) {
      const byId = new Map(fresh.map(t => [t.id, t]));
      setTasks(prev => prev.map(t => byId.get(t.id) ?? t));
    }
    return fresh;
  }

  async function updateTask(task: Task): Promise<Task> {
    const base = tasksRef.current.find(t => t.id === task.id);
    const patch = taskPatch(task, base);
    if (Object.keys(patch).length === 0 && base) return base;
    const { data, error } = await supabase.rpc('bulk_update_tasks', { p_ids: [task.id], p_patch: patch });
    if (error) throw new Error(`שמירת המשימה נכשלה: ${error.message}`);
    const [updated] = applyRows(data as Record<string, any>[] | null);
    if (!updated) throw new Error('שמירת המשימה נכשלה: המשימה לא נמצאה או שאינה שלך.');
    return updated;
  }

  /**
   * סדר ידני בלבד — sort_order לפי מקום ברשימה, בהוראה אחת בשרת (reorder_tasks).
   * מזהה שאינו של המשתמש פשוט לא נוגע בכלום.
   */
  async function reorderTasks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { data, error } = await supabase.rpc('reorder_tasks', { p_ids: ids });
    if (error) throw new Error(`שמירת הסדר נכשלה: ${error.message}`);
    applyRows(data as Record<string, any>[] | null);
  }

  /**
   * עדכון של כמה משימות בבת אחת (גרירה ושחרור: שינוי סטטוס של המשימה שזזה +
   * סדר חדש לקבוצה). ‼ לא N כתיבות במקביל של שורות שלמות (K3/K4): כל
   * משימה נבדקת מול העותק שבזיכרון, ורק מה שהשתנה נשלח — שינויי תוכן דרך
   * bulk_update_tasks (הכול-או-כלום), והסדר דרך reorder_tasks (sort_order
   * בלבד). המצב במסך נקבע ממה שחזר מהשרת, לא ממה שנשלח.
   */
  async function bulkUpdateTasks(updates: Task[]): Promise<void> {
    if (updates.length === 0) return;
    const cache = tasksRef.current;
    const contentGroups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();
    let orderChanged = false;
    for (const t of updates) {
      const base = cache.find(x => x.id === t.id);
      const patch = taskPatch(t, base);
      if ('sort_order' in patch) {
        orderChanged = true;
        delete patch.sort_order;
      }
      if (Object.keys(patch).length === 0) continue;
      const key = JSON.stringify(Object.entries(patch).sort(([a], [b]) => a.localeCompare(b)));
      const g = contentGroups.get(key) ?? { patch, ids: [] };
      g.ids.push(t.id);
      contentGroups.set(key, g);
    }
    for (const g of contentGroups.values()) {
      const { data, error } = await supabase.rpc('bulk_update_tasks', { p_ids: g.ids, p_patch: g.patch });
      if (error) throw new Error(`עדכון המשימות נכשל: ${error.message}`);
      applyRows(data as Record<string, any>[] | null);
    }
    // ‼ הרשימה כולה ולא רק מי שערכו השתנה: reorder_tasks נותנת מקום לפי
    // המיקום ברשימה שנשלחה, ולכן שליחת חלק מהקבוצה הייתה מקפיצה אותו לראש.
    if (orderChanged) {
      const ordered = updates
        .filter(t => typeof t.sortOrder === 'number')
        .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number));
      await reorderTasks(ordered.map(t => t.id));
    }
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

  return { tasks, loading, error, addTask, updateTask, bulkUpdateTasks, reorderTasks, deleteTask, bulkAddTasks, reloadTasks };
}
