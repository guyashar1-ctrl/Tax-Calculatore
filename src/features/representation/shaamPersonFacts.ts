// ─── מי האדם שמזינים עליו בשע״ם, לפי PIVO בלבד ────────────────────────────────
//
// ‼ מקור אחד לכל השדות שנשלחים לרשות, כדי שהעובד לא ייקח חלק מהכרטיס וחלק
// מצילום ישן. הכלל זהה לזה של «נתונים לביצוע הייצוג» (165): כשיש כרטיס
// מקושר, הזהות נקראת **ממנו**; הצילום שעל הבקשה משמש נפילה רק כשאין כרטיס.
// שדה קנוני ריק נשאר ריק — וזו בדיוק הנקודה: preflight יעצור עליו במקום
// שהעובד ישלים אותו מניחוש.
//
// ‼ תאריך לידה ואמצעי זיהוי נוסף (ת.ז. הורה / רישיון / דרכון) חיים היום רק
// על `identification` — אין להם עמודה בכרטיס. לכן דווקא הם נקראים משם גם
// כשיש כרטיס. זו קריאה של עובדה שנמסרה, לא צילום של החלטה.

import type { Client, RepresentationRequest, RepTarget } from '../../types';
import type { ShaamPersonFacts } from './shaamRepresentation';

function fullName(first: string, last: string, fallback: string): string {
  const n = `${first} ${last}`.trim();
  return n || fallback;
}

/**
 * הפרטים של אדם אחד להזנה בשע״ם.
 *
 * @param role מי — תמיד מפורש. לעולם לא «הראשון ברשימה».
 */
export function shaamPersonFacts(
  request: Pick<RepresentationRequest, 'identification' | 'prefill' | 'clientName' | 'clientEmail'>,
  client: Client | null | undefined,
  role: RepTarget,
): ShaamPersonFacts {
  const id = request.identification ?? {};
  const pre = request.prefill ?? {};
  const nameParts = (request.clientName || '').trim().split(/\s+/).filter(Boolean);

  if (role === 'client') {
    const first = client?.firstName || id.firstName || pre.firstName || nameParts[0] || '';
    const last = client?.lastName || id.lastName || pre.lastName || nameParts.slice(1).join(' ') || '';
    return {
      role,
      name: fullName(first, last, 'הלקוח/ה'),
      idNumber: client?.idNumber || id.idNumber || '',
      birthDate: client?.birthDate || id.birthDate || '',
      secondaryType: id.secondaryType,
      secondaryValue: id.secondaryValue,
      phone: client?.phone || id.phone || '',
      email: client?.email || id.email || pre.email || request.clientEmail || '',
      // ‼ הטלפון של בן/בת הזוג הוא פרט קשר קנוני בכרטיס. אין נפילה לטלפון
      // של הנישום: זה אדם אחר, וערך שגוי גרוע מערך חסר.
      spousePhone: client?.spousePhone || '',
    };
  }

  const first = client?.spouseFirstName || (client ? '' : (id.spouseFirstName || pre.spouseFirstName || ''));
  const last = client?.spouseLastName || (client ? '' : (id.spouseLastName || pre.spouseLastName || ''));
  const spouseFull = (client?.spouseName || id.spouseName || pre.spouseName || '').trim();
  const parts = spouseFull.split(/\s+/).filter(Boolean);
  return {
    role,
    name: fullName(first || parts[0] || '', last || parts.slice(1).join(' '), 'בן/בת הזוג'),
    idNumber: client ? (client.spouseIdNumber || '') : (id.spouseIdNumber || pre.spouseIdNumber || ''),
    birthDate: id.spouseBirthDate || '',
    secondaryType: id.spouseSecondaryType,
    secondaryValue: id.spouseSecondaryValue,
    phone: client?.spousePhone || '',
    email: client?.spouseEmail || id.spouseEmail || '',
    // ‼ מנקודת מבטו/ה של בן/בת הזוג, «בן/בת הזוג» הוא/היא הנישום/ת.
    spousePhone: client?.phone || id.phone || '',
  };
}

/** תאריך לידה בתבנית שהטופס בשע״ם מצפה לה (DDMMYYYY). ריק ⇒ ריק. */
export function shaamBirthDateInput(isoDate: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}
