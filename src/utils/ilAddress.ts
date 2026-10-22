// ─── כתובת מרשימה סגורה — הכללים הטהורים (בלי רשת) ────────────────────────────
// הטופס (components/ui/AddressFields) בונה מהבחירה שתי מחרוזות בלבד — יישוב
// וכתובת — וכל כותב של הכרטיס שומר אותן כמו קודם. המסד (מיגרציה 285) מזהה מהן
// את סמל היישוב, הרחוב והיישוב המזכה. לכן הפורמט כאן והפירוק ב-_il_address_parts
// חייבים להתאים: «<רחוב> <מספר>[, דירה <דירה>]».

/** אותו כלל כמו public.il_norm: «קריית שמונה» = «קרית שמונה», «אל־רום» = «אל רום». */
export function normIl(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/["'׳״`]/g, '')
    .replace(/[()־–-]/g, ' ')
    .replace(/יי/g, 'י')
    .replace(/וו/g, 'ו')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface IlLocality { code: number; name: string; municipal: boolean; hasStreets: boolean }
export interface IlStreet { code: number; name: string }

/** סמל «הרחוב» שהוא שם היישוב — ביישוב בלי רחובות (קיבוץ, מושב). */
export const NO_STREET_CODE = 9000;

export function composeAddress(street: string, house: string, apartment: string): string {
  const base = [street.trim(), house.trim()].filter(Boolean).join(' ');
  return apartment.trim() && base ? `${base}, דירה ${apartment.trim()}` : base;
}

/**
 * פירוק כתובת שמורה לחלקים — רק כדי למלא את הטופס מחדש. ‼ לא המקור: השרת
 * מפרק בעצמו (_il_address_parts). כשרשימת הרחובות ידועה — רחוב שבשמו מספר
 * («דרך 4») מזוהה כשלם.
 */
export function splitAddress(address: string, streets?: IlStreet[]): { street: string; house: string; apartment: string } {
  let s = (address ?? '').trim();
  let apartment = '';
  let m = s.match(/^(.*?\S)\s*(?:,\s*|\s+)(?:דירה|ד['׳.])\s*(\d+[א-ת]?)$/);
  if (m) { apartment = m[2]; s = m[1].replace(/[\s,]+$/, ''); }
  m = s.match(/^(.*\S)\s+(\d+[א-ת]?)\s*\/\s*(\d+)$/);
  if (m && !apartment) { s = `${m[1]} ${m[2]}`; apartment = m[3]; }
  s = s.replace(/^(רחוב|רח['׳.])\s+/, '');
  if (streets?.some(x => normIl(x.name) === normIl(s))) return { street: s, house: '', apartment };
  m = s.match(/^(.*\S)\s+(\d+[א-ת]?)$/);
  return m ? { street: m[1], house: m[2], apartment } : { street: s, house: '', apartment };
}

/** חיפוש בשם: מתחילים-ב לפני מכילים; בתוך כל קבוצה — ערים לפני יישובים במועצה אזורית, ואז הקצר. */
export function searchByName<T extends { name: string; municipal?: boolean }>(items: T[], query: string, limit = 8): T[] {
  const q = normIl(query);
  if (!q) return [];
  const rank = (a: T, b: T) => Number(!!b.municipal) - Number(!!a.municipal) || a.name.length - b.name.length || a.name.localeCompare(b.name, 'he');
  const starts: T[] = [], has: T[] = [];
  for (const it of items) {
    const n = normIl(it.name);
    if (n.startsWith(q)) starts.push(it);
    else if (n.includes(q) || n.split(' ').some(w => w.startsWith(q))) has.push(it);
  }
  return [...starts.sort(rank), ...has.sort(rank)].slice(0, limit);
}

export function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const n = normIl(name);
  if (!n) return undefined;
  const hits = items.filter(i => normIl(i.name) === n);
  return hits.length === 1 ? hits[0] : undefined;
}
