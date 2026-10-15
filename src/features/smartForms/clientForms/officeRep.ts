// ─── «הצהרת המייצג» — שם המייצג וחותמת המשרד, מ«פרטי המשרד» ────────────────
// ‼ מקור אחד: אותה חותמת שמוטבעת על ייפויי הכוח (branding.stampPath, דלי פרטי). אין כאן העלאה משלו.
// ‼ החותמת נכנסת רק לקובץ החתום שהמשרד מפיק — הלקוח לא רואה אותה ולא חותם עליה.

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { downloadPrivateDataUrl } from '../../../utils/privateAsset';
import type { ClientFormDef } from './types';

export interface OfficeRep {
  /** הטעינה הסתיימה (גם אם אין חותמת). */
  ready: boolean;
  name: string;
  /** PNG כ-data URL (pdf-lib צורב PNG; JPG/WebP מומרים). */
  stamp: string | null;
  /** למה אין חותמת — להצגה במשרד. */
  problem: string | null;
}

export const needsOfficeRep = (def: ClientFormDef) => def.template.fields.some(f => f.kind === 'signature' && f.signer === 'office');

/** כל תמונה ⇒ PNG (דרך קנבס), כדי שהצריבה תהיה אחידה. */
async function toPng(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith('data:image/png')) return dataUrl;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

export function useOfficeRep(def: ClientFormDef | null): OfficeRep {
  const [rep, setRep] = useState<OfficeRep>({ ready: false, name: '', stamp: null, problem: null });
  const needed = !!def && needsOfficeRep(def);
  useEffect(() => {
    if (!needed) { setRep({ ready: true, name: '', stamp: null, problem: null }); return; }
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { ready: true, name: '', stamp: null, problem: 'לא מחובר' };
      const { data: p } = await supabase.from('profiles').select('full_name, branding').eq('id', uid).single();
      const name = String((p as { full_name?: string } | null)?.full_name ?? '').trim();
      const path = (p as { branding?: { stampPath?: string } } | null)?.branding?.stampPath;
      if (!path) return { ready: true, name, stamp: null, problem: 'אין חותמת ב«פרטי המשרד» ← «חתימה וחותמת»' };
      if (/\.svg$/i.test(path)) return { ready: true, name, stamp: null, problem: 'החותמת שמורה כ-SVG — יש להעלות PNG או JPG' };
      const raw = await downloadPrivateDataUrl(path);
      if (!raw) return { ready: true, name, stamp: null, problem: 'טעינת החותמת נכשלה' };
      return { ready: true, name, stamp: await toPng(raw), problem: null };
    })().then(r => { if (alive) setRep(r); }).catch(() => { if (alive) setRep({ ready: true, name: '', stamp: null, problem: 'טעינת החותמת נכשלה' }); });
    return () => { alive = false; };
  }, [needed]);
  return rep;
}
