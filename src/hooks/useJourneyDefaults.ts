// ─── טעינה ושמירה של ברירת המחדל ────────────────────────────────────────────
// ‼ מקור אמת אחד: `office_journey_defaults`. אין כאן זריעה מהדפדפן — הזריעה
// נעשתה במיגרציה 135 לכל משרד קיים, ו-`seed_office_journey_defaults` מכסה
// משרד שנוצר אחר כך. דפדפן שזורע בעצמו היה מקור שני שסותר את השרת.
//
// ‼ השמירה היא לכל (משרד × סוג לקוח) בנפרד: `update` על שורה אחת לפי המפתח
// הייחודי, ולא upsert על הכול. RLS מוודאת שאי אפשר לגעת במשרד אחר.

import { useCallback, useEffect, useState } from 'react';
import type { ClientKind, DefaultEntry } from '../types/journeyDefaults';
import { CLIENT_KIND_ORDER } from '../types/journeyDefaults';
import { supabase } from '../lib/supabase';

type ByKind = Partial<Record<ClientKind, DefaultEntry[]>>;

function normalizeEntry(raw: unknown): DefaultEntry | null {
  const e = raw as Record<string, unknown>;
  if (!e || typeof e.stepType !== 'string') return null;
  return {
    key: typeof e.key === 'string' ? e.key : (e.stepType as string),
    stepType: e.stepType as string,
    enabled: e.enabled !== false,
    sortIndex: Number(e.sortIndex ?? 0),
    source: e.source === 'office' ? 'office' : 'system',
    requiredForClose: typeof e.requiredForClose === 'boolean' ? e.requiredForClose : null,
    dueInDays: typeof e.dueInDays === 'number' ? e.dueInDays : null,
    dependsOn: typeof e.dependsOn === 'string' ? e.dependsOn : null,
    variants: Array.isArray(e.variants)
      ? (e.variants as Record<string, unknown>[]).map((v, i) => ({
          key: typeof v.key === 'string' ? v.key : `v${i}`,
          fact: (typeof v.fact === 'string' ? v.fact : null) as never,
          items: Array.isArray(v.items)
            ? (v.items as Record<string, unknown>[]).map(it => ({
                key: typeof it.key === 'string' ? it.key : undefined,
                label: String(it.label ?? ''),
              }))
            : undefined,
          copy: (v.copy ?? undefined) as never,
        }))
      : [],
  };
}

export function useJourneyDefaults(officeId: string | undefined) {
  const [byKind, setByKind] = useState<ByKind>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!officeId) { setByKind({}); setLoading(false); return; }
    setLoading(true);
    const { data, error: e } = await supabase
      .from('office_journey_defaults')
      .select('client_kind, entries');
    if (e) { setError(e.message); setLoading(false); return; }

    const next: ByKind = {};
    for (const row of data ?? []) {
      const kind = row.client_kind as ClientKind;
      if (!CLIENT_KIND_ORDER.includes(kind)) continue;
      next[kind] = (Array.isArray(row.entries) ? row.entries : [])
        .map(normalizeEntry)
        .filter((x): x is DefaultEntry => x !== null)
        .sort((a, b) => a.sortIndex - b.sortIndex);
    }
    setByKind(next);
    setError(null);
    setLoading(false);
  }, [officeId]);

  useEffect(() => { void load(); }, [load]);

  /** שומרת סוג אחד. מחזירה הודעת שגיאה, או null בהצלחה. */
  const save = useCallback(async (kind: ClientKind, entries: DefaultEntry[]): Promise<string | null> => {
    if (!officeId) return 'אין משרד מחובר.';
    setSaving(true);
    // ‼ המקום השמור נגזר מהסדר על המסך ולא נשמר כפי שהיה: גרירה משנה מיקום,
    // והמספרים חייבים לשקף אותו. כפולות של 10, כמו reorder_onboarding_steps.
    const payload = entries.map((e, i) => ({ ...e, sortIndex: (i + 1) * 10 }));
    const { error: e } = await supabase
      .from('office_journey_defaults')
      .update({ entries: payload })
      .eq('office_id', officeId)
      .eq('client_kind', kind);
    setSaving(false);
    if (e) return e.message;
    setByKind(prev => ({ ...prev, [kind]: payload }));
    return null;
  }, [officeId]);

  return { byKind, loading, error, saving, reload: load, save };
}
