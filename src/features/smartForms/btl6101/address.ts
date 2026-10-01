// ─── פירוק כתובת חופשית לתאי הטופס (רחוב · מס' בית · כניסה · דירה) ─────────
// ‼ פירוק הוא נגזרת, לא עובדה: התוצאה מסומנת «נגזר — לאישור» ולעולם אינה
// נכתבת לכרטיס בלי אישור. כתובת שלא מתפרקת בביטחון נשארת ברחוב כולה.

export interface AddressParts {
  street: string;
  houseNumber: string;
  entrance: string;
  apartment: string;
  /** האם הפירוק מצא מספר בית (אחרת — הרחוב הוא כל הטקסט). */
  confident: boolean;
}

export function parseHebrewAddress(raw: string | null | undefined): AddressParts {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();
  const out: AddressParts = { street: '', houseNumber: '', entrance: '', apartment: '', confident: false };
  if (!s) return out;

  const po = /ת\.?\s?ד\.?\s*(\d{1,6})/.exec(s);
  if (po) return { ...out, street: `ת.ד. ${po[1]}`, confident: true };

  const take = (re: RegExp): string => {
    const m = re.exec(s);
    if (!m) return '';
    s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/\s*,\s*,/g, ',').trim();
    return m[1];
  };
  out.apartment = take(/(?:,\s*)?(?:דירה|דיר['׳]|ד['׳])\s*(\d{1,4}[א-ת]?)/);
  out.entrance = take(/(?:,\s*)?(?:כניסה|כנ['׳])\s*([א-ת]|\d{1,2})(?![א-ת])/);
  s = s.replace(/^(?:רחוב|רח['׳])\s*/, '').replace(/[,\s]+$/, '');

  const m = /^(.*?\D)[\s,]*(\d{1,4}[א-ת]?)(?:\s*\/\s*(\d{1,4}))?$/.exec(s);
  if (m && m[1].replace(/[,\s]/g, '')) {
    out.street = m[1].replace(/[,\s]+$/, '').trim();
    out.houseNumber = m[2];
    if (m[3] && !out.apartment) out.apartment = m[3];
    out.confident = true;
  } else {
    out.street = s;
  }
  return out;
}
