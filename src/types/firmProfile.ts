// ─── פרופיל המשרד — מקור האמת לזהות ולמיתוג של כל חוויות הלקוח ─────────────────
// מורחב מטבלת profiles. זהות-ליבה בשדות מובנים; מיתוג ותקשורת במבני jsonb גמישים
// כדי שמודולים עתידיים ייכנסו בלי migration בכל פעם.

export type BrandTheme = 'monochrome' | 'navy' | 'emerald';

export interface FirmBranding {
  theme?: BrandTheme;
  accentColor?: string; // hex, למשל #4F46E5
  font?: string;        // למשל 'Heebo'
  monogram?: string;    // ראשי תיבות — דריסה ידנית; אחרת נגזר משם המשרד
  logoPath?: string;    // עתידי — נתיב ב-Storage; כרגע משתמשים במונוגרמה
}

export type PreferredLanguage = 'he' | 'en';

export interface FirmCommunication {
  senderEmail?: string;
  replyTo?: string;
  whatsapp?: string;
  calendarLink?: string;
  preferredLanguage?: PreferredLanguage;
  emailSignature?: string;
}

export interface FirmProfile {
  id: string;
  email?: string;
  fullName?: string;
  firmName?: string;
  legalName?: string;
  representativeNumber?: string;
  representativeType?: string;
  phone?: string;
  website?: string;
  address?: string;
  branding: FirmBranding;
  communication: FirmCommunication;
  settings: Record<string, unknown>;
}

export const BRAND_THEMES: { id: BrandTheme; label: string; ink: string; accent: string }[] = [
  { id: 'monochrome', label: 'מינימל מונוכרום', ink: '#1A1A1A', accent: '#4F46E5' },
  { id: 'navy', label: 'נייבי קלאסי', ink: '#0E1F3A', accent: '#C9A75A' },
  { id: 'emerald', label: 'אמרלד מודרני', ink: '#0B3B36', accent: '#10B981' },
];

export const REP_TYPE_OPTIONS = ['רואה חשבון', 'יועץ מס', 'עורך דין'];

export const FONT_OPTIONS = ['Heebo', 'Assistant', 'Rubik'];

/** ראשי תיבות לברירת מחדל מתוך שם המשרד (עד 2 אותיות משמעותיות) */
export function deriveMonogram(firmName?: string): string {
  if (!firmName) return '★';
  const words = firmName
    .replace(/משרד|רואי|חשבון|רו״ח|רו"ח|ושות׳|ושות'|בע״מ|בע"מ/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || '') + (words[1][0] || '');
}
