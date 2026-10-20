// ─── בלי לוכסנים: «נפטר/ה», «קיבל/ה», «את/ה» — לפי המין שבכרטיס (20.10.2026) ──────────────────────────────
// ‼ גיא: «נפטר/ה», «את/ה קיבל/ה» בשאלון ללקוח — לא. כשהמין ידוע (בכרטיס) כותבים בזכר או בנקבה; כשלא ידוע — נשאר כמו שהוא.
// ‼ טהור. מילים של ילד/ה (נולד/ה) — לא נוגעים: המין של הילד אינו המין של האדם שעליו השאלה.

import type { Client, Gender } from '../../types';

export type G = 'm' | 'f';

const KEEP = new Set(['ילד', 'נולד']);
const SPECIAL: Record<string, [string, string]> = {
  'את/ה': ['אתה', 'את'], 'בן/בת': ['בן', 'בת'], 'נשוי/אה': ['נשוי', 'נשואה'], 'לו/לה': ['לו', 'לה'], 'שלו/ה': ['שלו', 'שלה'],
  'הוא/היא': ['הוא', 'היא'], 'אותו/ה': ['אותו', 'אותה'],
};

/** מחליף צורות לוכסן לפי המין. בלי מין ידוע — מחזיר כמו שהוא. */
export function genderize(text: string, g: G | undefined): string {
  if (!g || !text || !text.includes('/')) return text;
  const k = g === 'm' ? 0 : 1;
  let out = text;
  for (const [form, pair] of Object.entries(SPECIAL)) out = out.split(form).join(pair[k]);
  // X/ה · X/ת · X/ית — זכר: X; נקבה: X + הסיומת
  return out.replace(/([א-ת]+)\/(ה|ת|ית)(?![א-ת])/g, (all, base: string, suf: string) => (KEEP.has(base) ? all : g === 'm' ? base : base + suf));
}

const fromGender = (x?: Gender | string | null): G | undefined => (x === 'male' ? 'm' : x === 'female' ? 'f' : undefined);

/** המין של מי שעליו השאלה. בן/בת הזוג: מהכרטיס, ואם לא רשום — ההפך מהלקוח (בני זוג רשומים כזוג). */
export function genderOf(c: Pick<Client, 'gender' | 'familyStatus'> & { spouse?: unknown }, role: string): G | undefined {
  const own = fromGender(c.gender);
  if (role !== 'spouse') return own;
  const sp = fromGender((c.spouse as { gender?: Gender } | null | undefined)?.gender);
  if (sp) return sp;
  return own === 'm' ? 'f' : own === 'f' ? 'm' : undefined;
}

/** איך פונים ללקוח בדף: יחיד/ה או רבים (זוג). */
export function addresseeOf(c: Pick<Client, 'gender' | 'familyStatus'>): 'm' | 'f' | 'p' {
  if (c.familyStatus === 'married') return 'p';
  return fromGender(c.gender) ?? 'p';
}
