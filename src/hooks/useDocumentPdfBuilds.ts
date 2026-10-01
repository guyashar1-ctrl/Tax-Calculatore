// ─── PDF מוכן ברקע לצילומים המזהים של בקשה (211) ────────────────────────────
// המסד יוצר «בנייה» לכל אדם × סוג מסמך ברגע שצילום משויך או מוחלף. השרת
// (document-pdf) בונה JPG/PNG מיד; עובד האוטומציה במחשב המשרד בונה את השאר
// (HEIC, WebP, פריימים, וגרסת הגשה כשהמקור חורג מ-30MB). כאן — רק תצוגה והחלטות:
//   · המצב (מוכן / בהכנה / ממתין למחשב המשרד / נכשל — עם הסבר ודרך להמשך);
//   · «נסה שוב»;
//   · החלטת המשרד על גרסת הגשה מוקטנת (קריא ⇒ מאשרים; לא ⇒ צריך מקור טוב יותר).
// ‼ הדף הזה לא ממיר כלום. סגירת הדף לא עוצרת שום הכנה.
// ‼ «PDF מוכן» אינו «הלקוח אישר» — את זה קובע identity_docs (208), לא הבנייה.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAutomationWorkers } from '../lib/automationJobs';
import { WORKER_STALE_AFTER_MS } from '../types/automation';
import type { FocusRegion } from '../utils/imageToPdf';

export type PdfBuildStatus = 'pending' | 'ready' | 'needs_worker' | 'failed' | 'superseded';
/** same = המקור הוא קובץ ההגשה · auto = דחוס ברזולוציה מלאה · review/approved/rejected = מוקטן, החלטת המשרד. */
export type PdfSubmissionState = 'same' | 'auto' | 'review' | 'approved' | 'rejected';

export interface PdfPageMeta { page: number; srcW: number; srcH: number; outW: number; outH: number; quality: number; downscaled: boolean }

export interface PdfBuild {
  id: string;
  person: 'client' | 'spouse';
  slot: string;
  docKind: string | null;
  sourceIds: string[];
  fingerprint: string;
  status: PdfBuildStatus;
  errorCode: string | null;
  errorMessage: string | null;
  errorNext: string | null;
  pageCount: number | null;
  pdfBytes: number | null;
  lossless: boolean | null;
  notes: string[];
  builtBy: string | null;
  readyAt: string | null;
  updatedAt: string;
  submissionState: PdfSubmissionState | null;
  submissionDocumentId: string | null;
  submissionBytes: number | null;
  submissionNotes: string[];
  submissionMode: 'recompressed' | 'downscaled' | null;
  submissionFocus: FocusRegion[];
  submissionPages: PdfPageMeta[];
  submissionDecidedAt: string | null;
  /** תקרת ההגשה שהגרסה נבנתה מולה (שע״ם: 30MB). */
  submissionLimit: number | null;
}

// deno-lint-ignore no-explicit-any
function fromRow(r: any): PdfBuild {
  const meta = r.submission_meta ?? {};
  return {
    id: r.id, person: r.person, slot: r.slot, docKind: r.doc_kind ?? null, sourceIds: r.source_ids ?? [],
    fingerprint: r.source_fingerprint, status: r.status, errorCode: r.error_code ?? null,
    errorMessage: r.error_message ?? null, errorNext: r.error_next ?? null, pageCount: r.page_count ?? null,
    pdfBytes: r.pdf_bytes ?? null, lossless: r.lossless ?? null, notes: r.notes ?? [], builtBy: r.built_by ?? null,
    readyAt: r.ready_at ?? null, updatedAt: r.updated_at,
    submissionState: r.status === 'ready' ? (r.submission_state ?? 'same') : null,
    submissionDocumentId: r.submission_document_id ?? (r.status === 'ready' ? r.id : null),
    submissionBytes: r.submission_bytes ?? null, submissionNotes: r.submission_notes ?? [],
    submissionMode: meta.mode ?? null, submissionFocus: meta.focus ?? [], submissionPages: meta.pages ?? [],
    submissionDecidedAt: r.submission_decided_at ?? null,
    submissionLimit: typeof meta.limit === 'number' ? meta.limit : null,
  };
}

/** האם יש גרסת הגשה נפרדת מהמקור. */
export const hasSeparateSubmission = (b?: PdfBuild | null) =>
  !!b && b.status === 'ready' && !!b.submissionState && b.submissionState !== 'same';

/** האם מה שיוגש מוכן ומותר. */
export const submissionUsable = (b?: PdfBuild | null) =>
  !!b && b.status === 'ready' && (b.submissionState === 'same' || b.submissionState === 'auto' || b.submissionState === 'approved');

/**
 * @param identityKey משתנה כשהצילומים המשויכים משתנים — מפעיל סנכרון מחדש.
 */
export function useDocumentPdfBuilds(args: { requestId?: string; identityKey?: string; enabled?: boolean }) {
  const { requestId, identityKey, enabled = true } = args;
  const [builds, setBuilds] = useState<PdfBuild[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** מחשב עבודה חי (פעימה טרייה) — null עד שנבדק. */
  const [officeOnline, setOfficeOnline] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return [] as PdfBuild[];
    const { data } = await supabase.from('document_pdf_builds').select('*')
      .eq('request_id', requestId).neq('status', 'superseded').order('created_at');
    const list = (data ?? []).map(fromRow);
    setBuilds(list);
    setLoaded(true);
    return list;
  }, [requestId]);

  // סנכרון כשהצילומים משתנים.
  useEffect(() => {
    if (!enabled || !requestId) return;
    let cancelled = false;
    (async () => {
      const { data: sync } = await supabase.rpc('sync_document_pdf_builds', { p_request_id: requestId });
      // ‼ גיבוי לטריגר: אם משהו ממתין לשרת, מבקשים ממנו לבנות עכשיו (חכירה בשרת מונעת בנייה כפולה).
      if ((sync?.pending ?? 0) > 0) void supabase.functions.invoke('document-pdf', { body: { requestId } });
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [enabled, requestId, identityKey, load]);

  // מעקב בזמן שמשהו בהכנה — שרת (שניות) או מחשב המשרד (עד חצי דקה).
  const waitingServer = builds.some(b => b.status === 'pending');
  const waitingWorker = builds.some(b => b.status === 'needs_worker');
  useEffect(() => {
    if (!waitingServer && !waitingWorker) return;
    const t = window.setTimeout(() => void load(), waitingServer ? 4000 : 8000);
    return () => window.clearTimeout(t);
  }, [builds, waitingServer, waitingWorker, load]);

  // האם מחשב המשרד מחובר — רק כשיש מה שממתין לו.
  useEffect(() => {
    if (!waitingWorker) return;
    let cancelled = false;
    void fetchAutomationWorkers().then(({ workers }) => {
      if (cancelled) return;
      const now = Date.now();
      setOfficeOnline(workers.some(w => !(w as { revokedAt?: string | null }).revokedAt
        && now - new Date(w.lastSeenAt).getTime() < WORKER_STALE_AFTER_MS));
    });
    return () => { cancelled = true; };
  }, [builds, waitingWorker]);

  const retry = useCallback(async (id: string) => {
    await supabase.rpc('retry_document_pdf_build', { p_id: id });
    await load();
  }, [load]);

  /** החלטת המשרד על גרסת הגשה מוקטנת. */
  const decide = useCallback(async (b: PdfBuild, decision: 'approve' | 'reject' | 'reopen') => {
    const { data, error } = await supabase.rpc('decide_document_pdf_submission', {
      p_id: b.id, p_fingerprint: b.fingerprint, p_decision: decision,
    });
    await load();
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error === 'stale' ? 'הצילום הוחלף בינתיים — יש גרסה חדשה לבדיקה.' : 'ההחלטה לא נשמרה.');
  }, [load]);

  return { builds, loaded, reload: load, retry, decide, officeOnline };
}

/** ה-PDF של אדם ומשבצת (או של קבוצת מקורות). */
export function pdfBuildFor(builds: PdfBuild[], person: 'client' | 'spouse', sourceIds?: string[]): PdfBuild | undefined {
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  return builds.find(b => b.person === person && (!sourceIds || same(b.sourceIds, sourceIds)))
    ?? builds.find(b => b.person === person);
}
