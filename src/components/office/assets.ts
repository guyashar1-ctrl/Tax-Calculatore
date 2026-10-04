// ─── העלאת קבצי מיתוג ────────────────────────────────────────────────────────
// ‼ שם ייחודי לכל העלאה ובלי upsert: מדיניות הדלי חוסמת upsert ("new row
// violates RLS policy"), והקובץ הקודם חייב להישאר עד שהשינוי נשמר.
import { supabase } from '../../lib/supabase';

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function imageProblem(file: File): string | null {
  if (!IMAGE_MIME.includes(file.type)) return 'פורמט לא נתמך — PNG, JPG, SVG או WEBP.';
  if (file.size > IMAGE_MAX_BYTES) return 'הקובץ גדול מדי — עד 2MB.';
  return null;
}

export function uniquePath(ownerId: string, prefix: string, file: File): string {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  return `${ownerId}/${prefix}-${Date.now()}.${ext}`;
}

export async function uploadFile(bucket: string, path: string, file: File): Promise<string | null> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  return error ? (error.message || 'ההעלאה נכשלה') : null;
}
