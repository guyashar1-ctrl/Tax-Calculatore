// ─── רשימות היישובים והרחובות מהמסד (מיגרציה 285) ─────────────────────────────
// נטענות פעם אחת לכל טעינת דף; רחובות — לכל יישוב שנבחר. גם הדף של הלקוח
// (anon) קורא אותן. כשל ⇒ null, והטופס חוזר לשדה טקסט רגיל (לא חוסם את הלקוח).
import { supabase } from './supabase';
import type { IlLocality, IlStreet } from '../utils/ilAddress';

let localities: Promise<IlLocality[] | null> | null = null;
const streets = new Map<number, Promise<IlStreet[] | null>>();

export function loadLocalities(): Promise<IlLocality[] | null> {
  localities ??= (async () => {
    const { data, error } = await supabase.rpc('il_localities_list');
    if (error || !Array.isArray(data) || data.length === 0) { localities = null; return null; }
    return (data as [number, string, boolean, boolean][]).map(([code, name, municipal, hasStreets]) => ({ code, name, municipal, hasStreets }));
  })();
  return localities;
}

export function loadStreets(localityCode: number): Promise<IlStreet[] | null> {
  let p = streets.get(localityCode);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.rpc('il_streets_for', { p_locality_code: localityCode });
      if (error || !Array.isArray(data)) { streets.delete(localityCode); return null; }
      return (data as [number, string][]).map(([code, name]) => ({ code, name }));
    })();
    streets.set(localityCode, p);
  }
  return p;
}
