// ─── גרסאות המיפוי (210): הבסיס שבקוד + תיקוני גיאומטריה שפורסמו מהמסך ──────────
// מיפוי = איפה כל שדה יושב על ה-PDF (מלבן, קו הכתיבה, תאי הספרות). הבסיס חי בקוד
// (template.ts, «מיפוי 2»); גרסה שפורסמה מ«מסמכים ללקוחות» שומרת רק את מה ששונה ממנו.
// ‼ כל ציור של טופס (תצוגה, נעילה, שמירת חתום, דף החתימה) משתמש באותה גרסה — הגרסה
//   הפעילה בשרת. לפני שהיא נטענה לא מציירים: מיפוי משוער = טופס שנחתם במקום הלא נכון.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SmartFormTemplate } from './types';

export { applyMapping, diffFromBase } from './mappingCore';
export type { FieldGeometry, MappingFields, MappingVersion } from './mappingCore';
import type { MappingFields, MappingVersion } from './mappingCore';
import { applyMapping } from './mappingCore';

export interface MappingState {
  codeBase: number;
  active: MappingVersion & { publishedAt: string | null };
  draft: (MappingVersion & { baseVersion: number; updatedAt: string; note: string | null }) | null;
  history: { version: number; status: 'published' | 'retired'; publishedAt: string | null; note: string | null; checked?: unknown }[];
}

// ─── שרת ─────────────────────────────────────────────────────────────────────

type Rpc = { ok?: boolean; error?: string } & Record<string, unknown>;
const call = async (fn: string, args: Record<string, unknown>): Promise<Rpc> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return data as Rpc;
};

export async function fetchMappingState(key: string): Promise<MappingState> {
  const r = await call('get_smart_form_mapping', { p_template_key: key });
  if (!r.ok) {
    if (r.error !== 'forbidden') console.warn('[smartForms] get_smart_form_mapping:', r.error);
    throw new Error(r.error === 'forbidden' ? 'אין הרשאה לקרוא את השדות של הטופס' : 'טעינת השדות של הטופס נכשלה');
  }
  return r as unknown as MappingState;
}
export const startMappingDraft = (key: string) => call('smart_form_mapping_draft_start', { p_template_key: key });
export const saveMappingDraft = (key: string, version: number, fields: MappingFields, expectedUpdatedAt: string) =>
  call('smart_form_mapping_draft_save', { p_template_key: key, p_version: version, p_fields: fields, p_expected_updated_at: expectedUpdatedAt });
export const discardMappingDraft = (key: string, version: number) =>
  call('smart_form_mapping_draft_discard', { p_template_key: key, p_version: version });
export const publishMapping = (key: string, version: number, audit: unknown, note: string) =>
  call('smart_form_mapping_publish', { p_template_key: key, p_version: version, p_audit: audit, p_note: note });

export function mappingErrorText(code?: string): string {
  switch (code) {
    case 'stale': return 'השדות של הטופס נשמרו בינתיים ממקום אחר — רעננו ונסו שוב';
    case 'invalid': return 'אחד השדות יצא מגבולות העמוד או קיבל מידה לא תקינה';
    case 'audit_required': return 'פרסום מחייב בדיקת יישור שעברה';
    case 'audit_stale': return 'השדות של הטופס השתנו אחרי הבדיקה — יש לבדוק שוב לפני פרסום';
    case 'not_draft': return 'אין טיוטה פתוחה (אולי פורסמה או בוטלה בינתיים)';
    case 'forbidden': return 'אין הרשאה';
    default:
      if (code) console.warn('[smartForms] קוד שגיאה בלי טקסט:', code);
      return 'הפעולה נכשלה';
  }
}

// ─── התבנית הפעילה — טעינה אחת לסשן, ורענון אחרי פרסום ──────────────────────

const activeCache = new Map<string, Promise<MappingVersion>>();
const listeners = new Set<() => void>();

export function loadActiveMapping(key: string): Promise<MappingVersion> {
  let p = activeCache.get(key);
  if (!p) {
    p = fetchMappingState(key).then(s => ({ version: s.active.version, fields: s.active.fields ?? {} }));
    p.catch(() => activeCache.delete(key));
    activeCache.set(key, p);
  }
  return p;
}

/** אחרי פרסום — כל מסך פתוח טוען מחדש את הגרסה הפעילה. */
export function invalidateActiveMapping(key: string) {
  activeCache.delete(key);
  listeners.forEach(l => l());
}

const versionCache = new Map<string, Promise<MappingVersion>>();

/**
 * גרסה מסוימת — לגרסה שננעלה/נחתמה מציירים במיפוי *שלה*, לא באחרון. ‼ גרסה ≤ בסיס
 * הקוד = הבסיס עצמו (בלי תיקונים); גרסה שפורסמה אינה משתנה, ולכן נשמרת במטמון.
 */
export function loadMappingVersion(key: string, version: number, codeBase: number): Promise<MappingVersion> {
  if (version <= codeBase) return Promise.resolve({ version, fields: {} });
  const ck = `${key}#${version}`;
  let p = versionCache.get(ck);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.from('smart_form_mappings').select('version, fields, status')
        .eq('template_key', key).eq('version', version).maybeSingle();
      if (error) {
        console.warn('[smartForms] smart_form_mappings:', error.message);
        throw new Error(`טעינת השדות של הטופס (גרסה ${version}) נכשלה`);
      }
      if (!data || data.status === 'draft') throw new Error(`גרסה ${version} של השדות של הטופס לא נמצאה`);
      return { version, fields: (data.fields ?? {}) as MappingFields };
    })();
    p.catch(() => versionCache.delete(ck));
    versionCache.set(ck, p);
  }
  return p;
}

type TemplateState = { template: SmartFormTemplate | null; error: string | null };

/** התבנית הפעילה (בסיס + הגרסה המפורסמת). null עד שנטענה; שגיאה ⇒ error. */
export function useActiveTemplate(base: SmartFormTemplate): TemplateState {
  return useTemplateVersion(base, null);
}

/** התבנית לגרסת מיפוי נתונה; null ⇒ הגרסה הפעילה (ומתעדכנת אחרי פרסום). */
export function useTemplateVersion(base: SmartFormTemplate, version: number | null): TemplateState {
  const [state, setState] = useState<TemplateState>({ template: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const p = version == null ? loadActiveMapping(base.key) : loadMappingVersion(base.key, version, base.mappingVersion);
    p.then(m => { if (!cancelled) setState({ template: applyMapping(base, m), error: null }); })
      .catch(e => { if (!cancelled) setState({ template: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [base, version, tick]);
  return state;
}
