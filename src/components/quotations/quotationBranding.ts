// מתאם דק בין פרופיל המשרד (FirmProfile) למערכת העיצוב המשותפת.
// הפענוח עצמו (תבניות, טוקנים, נפילה-אחורה למותג הישן) חי במקור האמת היחיד:
//   supabase/functions/_shared/designSystem.ts
// אותו קובץ בדיוק נצרך גם ע"י ה-Edge Functions — אין כפילות.

import type { FirmProfile } from '../../types/firmProfile';
import {
  resolveBrand,
  type ResolvedBrand,
  type BrandingJson,
} from '../../../supabase/functions/_shared/designSystem.ts';

/** המותג המפוענח כפי שכל צד-הלקוח מכיר אותו */
export type QuotationBrand = ResolvedBrand;

export function deriveQuotationBrand(profile: FirmProfile | null | undefined): QuotationBrand {
  return resolveBrand({
    firmName: profile?.firmName,
    branding: (profile?.branding ?? {}) as BrandingJson,
    email: profile?.email,
    phone: profile?.phone,
    website: profile?.website,
    address: profile?.address,
    emailSignature: profile?.communication?.emailSignature,
  });
}

export function fallbackBrand(): QuotationBrand {
  return deriveQuotationBrand(null);
}
