// ─── «בקשות ללקוח חדש» · טיוטה לכל סוג לקוח, שמורה בטבלה נפרדת ─────────────
// ‼ יחידת שמירה נפרדת מרשומת המשרד: office_journey_defaults, שורה לכל סוג
// לקוח. לכן השמירה כאן היא כתיבה אחת לכל סוג ששונה — ותוצאה לכל סוג בנפרד.
// אין כאן "נשמר הכול" כשאחת הכתיבות נכשלה.
//
// ‼ הטיוטה חיה ברמת «המשרד» ולא בתוך העמוד: קודם היא ישבה ברכיב, ומעבר לעמוד
// אחר מחק אותה בשקט. וגם: שמירה של סוג אחד דרסה טיוטות פתוחות של סוגים אחרים
// (הטעינה מחדש החליפה את כולן). כאן סוג פתוח לעולם אינו נדרס.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientKind, DefaultEntry } from '../../types/journeyDefaults';
import { CLIENT_KIND_LABELS } from '../../types/journeyDefaults';
import type { FirmProfile } from '../../types/firmProfile';
import { useJourneyDefaults } from '../../hooks/useJourneyDefaults';
import { changedKinds, mergeLoaded } from './intakeModel';
export { entriesOf } from './intakeModel';

import type { ByKind } from './intakeModel';

export interface IntakeSaveResult {
  saved: ClientKind[];
  failed: { kind: ClientKind; error: string }[];
}

export interface IntakeDraft {
  loading: boolean;
  loadError: string | null;
  saved: ByKind;
  draft: ByKind;
  kind: ClientKind;
  setKind: (k: ClientKind) => void;
  mutate: (kind: ClientKind, next: DefaultEntry[]) => void;
  dirtyKinds: ClientKind[];
  saving: boolean;
  /** תוצאת השמירה האחרונה — מוצגת בשורת השמירה עד הפעולה הבאה. */
  lastResult: IntakeSaveResult | null;
  saveAll: (profile: FirmProfile) => Promise<IntakeSaveResult>;
  discardAll: () => void;
}

export function useIntakeDraft(officeId: string): IntakeDraft {
  const { byKind, loading, error, save } = useJourneyDefaults(officeId);
  const [draft, setDraft] = useState<ByKind>({});
  const [kind, setKind] = useState<ClientKind>('licensed_dealer');
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<IntakeSaveResult | null>(null);
  const savedRef = useRef<ByKind>({});

  useEffect(() => {
    const prevSaved = savedRef.current;
    setDraft(prev => mergeLoaded(prev, prevSaved));
    savedRef.current = byKind;
  }, [byKind]);

  const dirtyKinds = useMemo(() => changedKinds(draft, byKind), [draft, byKind]);

  const mutate = useCallback((k: ClientKind, next: DefaultEntry[]) => {
    setDraft(d => ({ ...d, [k]: next }));
    setLastResult(null);
  }, []);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const saveAll = useCallback(async (profile: FirmProfile): Promise<IntakeSaveResult> => {
    const kinds = changedKinds(draftRef.current, savedRef.current);
    const result: IntakeSaveResult = { saved: [], failed: [] };
    setSaving(true);
    // ‼ אחד אחרי השני, וכל אחד עם תוצאה משלו: כשל בסוג אחד לא מבטל את
    // ההצלחה של אחר, ולא מוסתר מאחוריה.
    for (const k of kinds) {
      const sent = draftRef.current[k] ?? [];
      const err = await save(k, sent, profile);
      if (err) { result.failed.push({ kind: k, error: err }); continue; }
      result.saved.push(k);
      // הסוג שנשמר יורד מהטיוטה ונקרא מהשמור — אלא אם נערך שוב בזמן השמירה.
      setDraft(d => {
        if (d[k] !== sent) return d;
        const n = { ...d };
        delete n[k];
        return n;
      });
    }
    setSaving(false);
    setLastResult(result);
    return result;
  }, [save]);

  const discardAll = useCallback(() => {
    setDraft({});
    setLastResult(null);
  }, []);

  return {
    loading, loadError: error, saved: byKind, draft, kind, setKind, mutate,
    dirtyKinds, saving, lastResult, saveAll, discardAll,
  };
}

export const kindLabel = (k: ClientKind) => CLIENT_KIND_LABELS[k];
