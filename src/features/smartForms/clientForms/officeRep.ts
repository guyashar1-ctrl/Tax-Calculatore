// ─── «הצהרת המייצג» — שם המייצג, מ«פרטי המשרד» ────────────────────────────────
// ‼ 17.10.2026 · גיא: בלי חותמת המשרד על הטופס — «אם ארצה, אוסיף אותה ידנית». שם המייצג
//   ותאריך נשארים. אותו מקור (profiles.full_name) גם בדף האישי — portal_smart_form_get.repName (259).

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { ClientFormDef } from './types';

export interface OfficeRep {
  /** הטעינה הסתיימה. */
  ready: boolean;
  name: string;
}

export const needsOfficeRep = (def: ClientFormDef) => def.template.fields.some(f => f.kind === 'signature' && f.signer === 'office');

export function useOfficeRep(def: ClientFormDef | null): OfficeRep {
  const [rep, setRep] = useState<OfficeRep>({ ready: false, name: '' });
  const needed = !!def && needsOfficeRep(def);
  useEffect(() => {
    if (!needed) { setRep({ ready: true, name: '' }); return; }
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { ready: true, name: '' };
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', uid).single();
      return { ready: true, name: String((p as { full_name?: string } | null)?.full_name ?? '').trim() };
    })().then(r => { if (alive) setRep(r); }).catch(() => { if (alive) setRep({ ready: true, name: '' }); });
    return () => { alive = false; };
  }, [needed]);
  return rep;
}
