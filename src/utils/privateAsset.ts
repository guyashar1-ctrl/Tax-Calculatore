// גישה מאומתת לנכסים פרטיים (חתימה/חותמת) בדלי firm-private.
// שתי נקודות הצריכה רצות בדפדפן המחובר של הרו"ח, כך ש-download() מכבד RLS
// ומחזיר את הבייטים רק לבעלים — בלי כתובת ציבורית ובלי קישור חתום.
import { supabase } from '../lib/supabase';

export const FIRM_PRIVATE_BUCKET = 'firm-private';

/** מוריד קובץ פרטי לפי נתיב ומחזיר data URL (לתצוגה ב-<img> או להטבעה ב-PDF). */
export async function downloadPrivateDataUrl(path?: string): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await supabase.storage.from(FIRM_PRIVATE_BUCKET).download(path);
  if (error || !data) return undefined;
  return await new Promise<string | undefined>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => resolve(undefined);
    fr.readAsDataURL(data);
  });
}
