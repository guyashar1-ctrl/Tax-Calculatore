// ─── קריאת 154 שהסתיימה → «מרשימות שע״ם» של הלקוח (21.10.2026) ─────────────────────────────────────
// ‼ פעם אחת לכל ריצה (מזהה המשימה), ובשרת אידמפוטנטי ממילא (אותו מקור לפי sha של הריצה; אותם ערכים ⇒
//   «ללא שינוי»). מצב נגזר על התיק — לא עובדה בכרטיס ולא בקשה: «פתח בקשה» נשאר בידי המשרד.
// ‼ ריצה ישנה (134 בלבד) או 154 שלא נקראה — אין מה לקלוט, ולא נוגעים בשורות קיימות.

import { useEffect, useRef, useState } from 'react';
import type { AutomationJob } from '../../types/automation';
import { listObligations, saveImport } from './api';
import { batchFromGmf154, gmf154Filing, GMF154_SOURCE_NAME } from './fromGmf154';
import { notifyObligationsChanged } from './useObligations';

export function useGmf154Import(clientId: string | undefined, job: AutomationJob | null, enabled = true) {
  const done = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const runId = job?.status === 'succeeded' ? job.id : null;

  useEffect(() => {
    if (!enabled || !clientId || !job || !runId || done.current.has(runId)) return;
    const filing = gmf154Filing(job.result);
    const fileNumber = String((job.input as { fileNumber?: unknown })?.fileNumber ?? '');
    if (!filing || !fileNumber) return;
    done.current.add(runId);
    void (async () => {
      try {
        const file9 = fileNumber.replace(/\D/g, '').padStart(9, '0');
        const existing = await listObligations(clientId);
        const mine = (existing.obligations ?? []).filter(o => o.fileNumber === file9);
        const knownAnnualYears = new Set(mine.filter(o => o.kind === 'annual').map(o => o.yearShown));
        const listWealthYears = new Set(mine.filter(o => o.kind === 'wealth' && o.sourceName !== GMF154_SOURCE_NAME).map(o => o.yearShown));
        const batch = batchFromGmf154(filing, {
          fileNumber, runId, knownAnnualYears, listWealthYears,
          producedOn: (job.finishedAt ?? job.updatedAt ?? new Date().toISOString()).slice(0, 10),
        });
        if (!batch) return;
        const r = await saveImport(batch);
        if (!r.ok) throw new Error(r.error ?? 'import_failed');
        setError(null);
        notifyObligationsChanged();
      } catch (e) {
        // ‼ ניסיון נוסף רק בריצה הבאה או בטעינה מחדש — לא בלולאה.
        setError((e as Error).message);
      }
    })();
  }, [enabled, clientId, job, runId]);

  return { error };
}
