// ─── «PIVO השבוע» · קריאה ושמירה (טבלה pivo_weekly_notes, מיגרציה 243) ───────
import { supabase } from '../../lib/supabase';

export interface WeeklyNote { id: string; weekStart: string; body: string; updatedAt: string | null }

type Row = { id: string; week_start: string; body: string; updated_at?: string | null };
const toNote = (r: Row): WeeklyNote => ({ id: r.id, weekStart: String(r.week_start).slice(0, 10), body: r.body, updatedAt: r.updated_at ?? null });

export async function listNotes(): Promise<WeeklyNote[]> {
  const { data, error } = await supabase.from('pivo_weekly_notes')
    .select('id, week_start, body, updated_at').order('week_start', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toNote);
}

/** שבוע שכבר כתוב מתעדכן; שבוע חדש נוסף. ‼ user_id נקבע בשרת (auth.uid()). */
export async function saveNote(existing: WeeklyNote | null, weekStart: string, body: string): Promise<WeeklyNote> {
  const q = existing
    ? supabase.from('pivo_weekly_notes').update({ body }).eq('id', existing.id).select('id, week_start, body, updated_at').single()
    : supabase.from('pivo_weekly_notes').insert({ week_start: weekStart, body }).select('id, week_start, body, updated_at').single();
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return toNote({ week_start: weekStart, body, ...(data as Partial<Row>) } as Row);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('pivo_weekly_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
