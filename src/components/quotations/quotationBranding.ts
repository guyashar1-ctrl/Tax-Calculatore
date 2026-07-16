// גוזר מיתוג + עיצוב אחיד (צבעים, פינות, כותרת, כפתור, לוגו) מפרופיל המשרד —
// מקור אמת יחיד לתצוגה המקדימה, למייל ולעמוד ההצעה/ייצוג הציבורי. לא מכפיל דבר.

import type { FirmProfile } from '../../types/firmProfile';
import { BRAND_THEMES, deriveMonogram } from '../../types/firmProfile';
import {
  findPreset, CORNER_RADIUS, DEFAULT_PRESET_ID,
  type HeaderStyle, type ButtonStyle,
} from '../../data/quotationDesignPresets';

export interface QuotationBrand {
  firmName: string;
  monogram: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  emailSignature?: string;
  // ─ טוקני עיצוב ─
  font: string;
  ink: string;
  accent: string;
  pageBg: string;
  cardBg: string;
  border: string;
  muted: string;
  radius: number;
  headerStyle: HeaderStyle;
  buttonStyle: ButtonStyle;
  presetId: string;
}

export function deriveQuotationBrand(profile: FirmProfile | null | undefined): QuotationBrand {
  const branding = profile?.branding ?? {};
  const dd = branding.docDesign ?? {};

  // בסיס: אם נבחרה תבנית — היא הבסיס. אחרת נבנה בסיס מהמותג הקיים (theme/accent/font)
  // כדי לשמר את המראה של משרדים ותיקים עד שיבחרו תבנית בסטודיו.
  const theme = BRAND_THEMES.find(t => t.id === (branding.theme ?? 'monochrome')) ?? BRAND_THEMES[0];
  const structural = findPreset(DEFAULT_PRESET_ID);
  const base = dd.preset
    ? findPreset(dd.preset)
    : {
        ...structural,
        ink: theme.ink,
        accent: branding.accentColor || theme.accent,
        font: branding.font || structural.font,
      };

  return {
    firmName: profile?.firmName || 'משרד רואי חשבון',
    monogram: (branding.monogram || deriveMonogram(profile?.firmName)).slice(0, 2),
    logoUrl: branding.logoUrl,
    email: profile?.email,
    phone: profile?.phone,
    website: profile?.website,
    address: profile?.address,
    emailSignature: profile?.communication?.emailSignature,
    // עיצוב — כיוונון פרטני דורס את התבנית
    font: dd.font || base.font,
    ink: dd.ink || base.ink,
    accent: dd.accent || branding.accentColor || base.accent,
    pageBg: dd.pageBg || base.pageBg,
    cardBg: dd.cardBg || base.cardBg,
    border: base.border,
    muted: base.muted,
    radius: CORNER_RADIUS[dd.corner || base.corner],
    headerStyle: dd.headerStyle || base.headerStyle,
    buttonStyle: dd.buttonStyle || base.buttonStyle,
    presetId: dd.preset || 'custom',
  };
}

export function fallbackBrand(): QuotationBrand {
  return deriveQuotationBrand(null);
}
