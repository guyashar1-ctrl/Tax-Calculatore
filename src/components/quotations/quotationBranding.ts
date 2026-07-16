// גוזר מיתוג אחיד (צבעים, לוגו, מונוגרמה, פרטי קשר) מתוך פרופיל המשרד —
// מקור אמת יחיד המשמש את התצוגה המקדימה, את המייל ואת עמוד ההצעה הציבורי.
// לא מכפיל שום נתון מיתוג — הכל נקרא מ-FirmProfile / profiles.branding.

import type { FirmProfile } from '../../types/firmProfile';
import { BRAND_THEMES, deriveMonogram } from '../../types/firmProfile';

export interface QuotationBrand {
  firmName: string;
  ink: string;        // צבע ראשי כהה (כותרות, כפתור ראשי)
  accent: string;     // צבע אקסנט (קו תחתון, הדגשות)
  monogram: string;
  logoUrl?: string;
  font: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  emailSignature?: string;
}

export function deriveQuotationBrand(profile: FirmProfile | null | undefined): QuotationBrand {
  const branding = profile?.branding ?? {};
  const theme = BRAND_THEMES.find(t => t.id === (branding.theme ?? 'monochrome')) ?? BRAND_THEMES[0];
  return {
    firmName: profile?.firmName || 'משרד רואי חשבון',
    ink: theme.ink,
    accent: branding.accentColor || theme.accent,
    monogram: (branding.monogram || deriveMonogram(profile?.firmName)).slice(0, 2),
    logoUrl: branding.logoUrl,
    font: branding.font || 'Heebo',
    email: profile?.email,
    phone: profile?.phone,
    website: profile?.website,
    address: profile?.address,
    emailSignature: profile?.communication?.emailSignature,
  };
}

// מיתוג "כאילו" לתצוגה מקדימה לפני שהוגדר פרופיל — לא נשמר לשום מקום.
export function fallbackBrand(): QuotationBrand {
  const theme = BRAND_THEMES[0];
  return {
    firmName: 'משרד רואי חשבון',
    ink: theme.ink,
    accent: theme.accent,
    monogram: '★',
    font: 'Heebo',
  };
}
