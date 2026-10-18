// ─── «החותמת שלי» — חותמת המשרד מ«פרטי המשרד», להנחה ידנית בעורך ה-PDF ──────────
// ‼ 19.10.2026 · גיא: החותמת לא נכנסת לבד לשום טופס; «אני רוצה שתהיה לי האופציה לסמן».
//   מקור אחד: profiles.branding.stampPath (הדלי הפרטי) — אותה חותמת שמועלית ב«פרטי המשרד».

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { downloadPrivateDataUrl } from './privateAsset';

/** pdf-lib צורב PNG/JPG בלבד — כל פורמט אחר (WebP וכו׳) עובר דרך קנבס ל-PNG. */
async function toBurnable(dataUrl: string): Promise<string | null> {
  if (/^data:image\/(png|jpe?g);/i.test(dataUrl)) return dataUrl;
  if (/^data:image\/svg/i.test(dataUrl)) return null;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d')?.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

/** החותמת השמורה של המשתמש המחובר, או null (אין חותמת / לא מחובר / תקלה). */
export function useOfficeStamp(): string | null {
  const [stamp, setStamp] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: p } = await supabase.from('profiles').select('branding').eq('id', uid).maybeSingle();
      const path = (p as { branding?: { stampPath?: string } } | null)?.branding?.stampPath;
      if (!path) return null;
      const raw = await downloadPrivateDataUrl(path);
      return raw ? toBurnable(raw) : null;
    })().then(s => { if (alive) setStamp(s); }).catch(() => { if (alive) setStamp(null); });
    return () => { alive = false; };
  }, []);
  return stamp;
}
