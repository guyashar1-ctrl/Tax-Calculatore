// ─── העלאה מהמשרד של צילום מזהה — בלי עותק כפול בתיק (213) ──────────────────
// גיא, 01.10.2026: «השלם מניעת כפילויות גם בהעלאה מהמשרד, תוך שמירה על ההפרדה»
// (שיוך ואישור נפרדים לכל אדם; לא מסיקים בעלות מזהות הקבצים).
//   · אותו קובץ בדיוק כבר משויך לאדם הזה ⇒ אין מה להעלות.
//   · אותו קובץ כבר בתיק ולא משויך לאף אחד ⇒ משייכים את הקיים (לא עוד עותק).
//   · אותו קובץ משויך לאדם האחר ⇒ רשומה נפרדת לאדם הזה (עותק משלו).
// «זהה» = אותם בייטים (sha256). מסמך ישן בלי טביעה נבדק לפי גודל ואז לפי התוכן.

import { supabase } from '../../lib/supabase';

const BUCKET = 'client-documents';
const ID_CATEGORIES = ['id_card', 'drivers_license', 'passport'];

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** מסמכים מזהים של הלקוח עם אותו תוכן בדיוק. */
export async function identicalIdDocs(clientId: string, data: ArrayBuffer, hash: string): Promise<string[]> {
  const { data: rows } = await supabase.from('documents')
    .select('id, storage_path, file_size, content_sha256')
    .eq('client_id', clientId).in('category', ID_CATEGORIES);
  const out: string[] = [];
  for (const r of (rows ?? []) as { id: string; storage_path: string | null; file_size: number | null; content_sha256: string | null }[]) {
    if (r.content_sha256) { if (r.content_sha256 === hash) out.push(r.id); continue; }
    if (Number(r.file_size) !== data.byteLength || !r.storage_path) continue;
    const { data: blob } = await supabase.storage.from(BUCKET).download(r.storage_path);
    if (!blob) continue;
    const h = await sha256Hex(await blob.arrayBuffer());
    // ‼ בלי await השאילתה לא נשלחת בכלל (הבונה של supabase עצל) — נמצא בבדיקה.
    await supabase.from('documents').update({ content_sha256: h }).eq('id', r.id);
    if (h === hash) out.push(r.id);
  }
  return out;
}

export { planOfficeUpload, type OfficeUploadPlan } from './identityDedupePlan';
