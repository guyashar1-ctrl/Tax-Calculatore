// ─── PDF מוכן ברקע לצילומים המזהים של בקשה (210) ────────────────────────────
// המסד יוצר «בנייה» לכל אדם × סוג מסמך ברגע שצילום משויך או מוחלף, והשרת
// (document-pdf) בונה JPG/PNG מיד. כאן:
//   · מציגים את המצב (מוכן / מכין / נכשל — עם הסבר ודרך להמשך);
//   · משלימים בדפדפן מה שהשרת לא מפענח (HEIC, WebP…) — אוטומטית, בלי לחיצה;
//   · «נסה שוב» למשרד.
// ‼ «PDF מוכן» אינו «הלקוח אישר» — את זה קובע identity_docs (208), לא הבנייה.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildDocumentPdf, ImageConversionError, SHAAM_UPLOAD_MAX_BYTES } from '../utils/imageToPdf';

const BUCKET = 'client-documents';
const SLOT_LABEL: Record<string, string> = { idOrLicense: 'תעודה מזהה', passport: 'דרכון' };

export type PdfBuildStatus = 'pending' | 'ready' | 'needs_browser' | 'failed' | 'superseded';

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
  /** בתהליך בדפדפן הזה עכשיו. */
  buildingHere?: boolean;
}

// deno-lint-ignore no-explicit-any
function fromRow(r: any): PdfBuild {
  return {
    id: r.id, person: r.person, slot: r.slot, docKind: r.doc_kind ?? null, sourceIds: r.source_ids ?? [],
    fingerprint: r.source_fingerprint, status: r.status, errorCode: r.error_code ?? null,
    errorMessage: r.error_message ?? null, errorNext: r.error_next ?? null, pageCount: r.page_count ?? null,
    pdfBytes: r.pdf_bytes ?? null, lossless: r.lossless ?? null, notes: r.notes ?? [], builtBy: r.built_by ?? null,
    readyAt: r.ready_at ?? null, updatedAt: r.updated_at,
  };
}

/**
 * @param identityKey משתנה כשהצילומים המשויכים משתנים — מפעיל סנכרון מחדש.
 */
export function useDocumentPdfBuilds(args: {
  requestId?: string; clientId?: string; userId?: string; personName?: (p: 'client' | 'spouse') => string;
  identityKey?: string; enabled?: boolean;
}) {
  const { requestId, clientId, userId, personName, identityKey, enabled = true } = args;
  const [builds, setBuilds] = useState<PdfBuild[]>([]);
  const [loaded, setLoaded] = useState(false);
  const busy = useRef(new Set<string>());
  const [buildingHere, setBuildingHere] = useState<Record<string, boolean>>({});
  const nameRef = useRef(personName);
  nameRef.current = personName;

  const load = useCallback(async () => {
    if (!requestId) return [] as PdfBuild[];
    const { data } = await supabase.from('document_pdf_builds').select('*')
      .eq('request_id', requestId).neq('status', 'superseded').order('created_at');
    const list = (data ?? []).map(fromRow);
    setBuilds(list);
    setLoaded(true);
    return list;
  }, [requestId]);

  /** השלמה בדפדפן — HEIC/WebP, או סולם גודל גלוי. רץ פעם אחת לכל בנייה. */
  const buildInBrowser = useCallback(async (b: PdfBuild) => {
    if (!userId || !clientId || busy.current.has(b.id)) return;
    busy.current.add(b.id);
    setBuildingHere(m => ({ ...m, [b.id]: true }));
    try {
      const { data: rows } = await supabase.from('documents').select('id, storage_path, file_name').in('id', b.sourceIds);
      const parts: Uint8Array[] = [];
      for (const id of b.sourceIds) {
        const row = rows?.find(r => r.id === id);
        if (!row?.storage_path) throw new ImageConversionError('אחד הקבצים לא נמצא באחסון.', 'corrupt', 'להעלות את הצילום מחדש.');
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
        if (error || !blob) throw new Error('download');
        parts.push(new Uint8Array(await blob.arrayBuffer()));
      }
      const pdf = await buildDocumentPdf(parts, { maxBytes: SHAAM_UPLOAD_MAX_BYTES, allowSizeFallback: true });
      const path = `${userId}/${clientId}/${b.id}`;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw new Error('upload');
      const who = nameRef.current?.(b.person);
      await supabase.rpc('complete_document_pdf_build', {
        p_id: b.id, p_fingerprint: b.fingerprint, p_storage_path: path,
        p_file_name: `${SLOT_LABEL[b.slot] ?? 'מסמך'}${who ? ` - ${who}` : ''} (PDF).pdf`,
        p_bytes: pdf.bytes.byteLength, p_pages: pdf.pageCount, p_lossless: pdf.lossless,
        p_notes: pdf.notes, p_built_by: 'browser',
      });
    } catch (e) {
      const conv = e instanceof ImageConversionError;
      // מפענח שלא נטען (רשת) / הורדה שנכשלה ⇒ זמני. קובץ פגום / לא נתמך / גדול מדי ⇒ כשל עם הסבר.
      const transient = !conv || e.code === 'needs_decoder';
      await supabase.rpc('fail_document_pdf_build', {
        p_id: b.id, p_fingerprint: b.fingerprint,
        p_code: conv ? e.code : 'transient',
        p_message: conv ? e.message : 'תקלה זמנית בהכנת ה-PDF.',
        p_next: conv ? e.next : 'ניסיון נוסף יתבצע אוטומטית.',
        p_status: transient ? 'retry' : 'failed',
      });
    } finally {
      busy.current.delete(b.id);
      setBuildingHere(m => { const n = { ...m }; delete n[b.id]; return n; });
      void load();
    }
  }, [userId, clientId, load]);

  // סנכרון כשהצילומים משתנים, ואז השלמה בדפדפן למה שצריך.
  useEffect(() => {
    if (!enabled || !requestId) return;
    let cancelled = false;
    (async () => {
      const { data: sync } = await supabase.rpc('sync_document_pdf_builds', { p_request_id: requestId });
      // ‼ גיבוי לטריגר: אם משהו ממתין, מבקשים מהשרת לבנות עכשיו (חכירה בשרת מונעת בנייה כפולה).
      if ((sync?.pending ?? 0) > 0) void supabase.functions.invoke('document-pdf', { body: { requestId } });
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [enabled, requestId, identityKey, load]);

  // מה שהשרת השאיר לדפדפן — מתחיל לבד.
  useEffect(() => {
    for (const b of builds) if (b.status === 'needs_browser' && !busy.current.has(b.id)) void buildInBrowser(b);
  }, [builds, buildInBrowser]);

  // מעקב קצר בזמן שהשרת בונה.
  useEffect(() => {
    if (!builds.some(b => b.status === 'pending')) return;
    const t = window.setTimeout(() => void load(), 4000);
    return () => window.clearTimeout(t);
  }, [builds, load]);

  const retry = useCallback(async (id: string) => {
    await supabase.rpc('retry_document_pdf_build', { p_id: id });
    await load();
  }, [load]);

  return {
    builds: builds.map(b => ({ ...b, buildingHere: !!buildingHere[b.id] })),
    loaded, reload: load, retry,
  };
}

/** ה-PDF של אדם ומשבצת (או של קבוצת מקורות). */
export function pdfBuildFor(builds: PdfBuild[], person: 'client' | 'spouse', sourceIds?: string[]): PdfBuild | undefined {
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  return builds.find(b => b.person === person && (!sourceIds || same(b.sourceIds, sourceIds)))
    ?? builds.find(b => b.person === person);
}
