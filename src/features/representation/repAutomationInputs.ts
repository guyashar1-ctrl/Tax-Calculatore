// ─── הקלט לעובד בהזנת ייצוג — שע״ם וב״ל, ממקום אחד ─────────────────────────────
// ‼ שלושה מקומות מפעילים את אותן שתי פעולות: הכפתור של הגשה בשע״ם, הכפתור של אדם
// בב״ל, ו«הפעל הכול» (269). הקלט נבנה כאן בלבד — אחרת «הפעל הכול» היה שולח לרשות
// משהו אחר ממה שהכפתור הבודד שולח.
// ‼ «חסר נתון» מוחזר כשגיאה לפני יצירת משימה — עדיף לומר לרו"ח מה חסר בכרטיס מאשר
// לתת לעובד לגלות את זה אחרי שכבר נגע ברשות.

import type { Client, PersonRole, RepresentationRequest } from '../../types';
import type { ShaamSubmission } from '../../utils/repScope';
import { niPersons, niPersonIdentity } from '../../utils/niPersons';
import {
  preflightShaamSubmission, SHAAM_SYSTEM_SCREEN_LABELS, SHAAM_REPRESENTATION_TYPE,
  shaamRequestExists, type ShaamRequestTracking,
} from './shaamRepresentation';
import { shaamPersonFacts, shaamBirthDateInput } from './shaamPersonFacts';

export type JobInput = { ok: true; input: Record<string, unknown> } | { ok: false; error: string };

/** «הזן בשע״ם» להגשה אחת (shaam.create_representation). */
export function shaamCreateInput(
  request: RepresentationRequest,
  client: Client,
  submission: ShaamSubmission,
  married: boolean,
  tracking?: ShaamRequestTracking,
): JobInput {
  const person = shaamPersonFacts(request, client, submission.target);
  const pre = preflightShaamSubmission(submission, person, client, married);
  if (!pre.ok) return { ok: false, error: pre.issues.map(i => i.message).join(' · ') };
  return {
    ok: true,
    input: {
      submissionKey: submission.key,
      role: submission.target,
      requestId: request.id,
      personName: person.name,
      entityId: person.idNumber.replace(/\D/g, ''),
      birthDateDDMMYYYY: shaamBirthDateInput(person.birthDate),
      secondary: { type: person.secondaryType, value: person.secondaryValue },
      // ‼ בדיוק מה ש-PIVO ביקש, ותו לא. העובד מסמן את השורות האלה ולא אחרות.
      systems: pre.systems.map(s => ({
        key: s,
        screenLabel: SHAAM_SYSTEM_SCREEN_LABELS[s],
        fileNumber: pre.fileNumbers[s] ?? '',
        repType: SHAAM_REPRESENTATION_TYPE,
      })),
      spousePhone: married ? person.spousePhone : '',
      // ‼ 28.09.2026 · מסך פרטי ההתקשרות בשע״ם דורש את הטלפון של המיוצג.
      clientPhone: person.phone,
      clientEmail: person.email,
      formFileName: `ייפוי כוח לחתימה - ${person.name}.pdf`,
      existingRequestNumber: tracking?.requestNumber ?? null,
      alreadyFoundInShaam: shaamRequestExists(tracking),
    },
  };
}

/** «הזן ייפוי כוח בביטוח לאומי» לאדם אחד (btl.create_representation). */
export function niCreateInput(client: Client, role: PersonRole, spouseClient?: Client): JobInput {
  const person = niPersons(client, spouseClient).find(p => p.role === role);
  const identity = person ? niPersonIdentity(person, client) : null;
  if (!identity || identity.birthYear == null) {
    return { ok: false, error: 'חסרים בכרטיס פרטים הדרושים לטופס ביטוח לאומי (שם פרטי, שם משפחה או שנת לידה).' };
  }
  return {
    ok: true,
    input: {
      role, idNumber: identity.idNumber, firstName: identity.firstName,
      lastName: identity.lastName, birthYear: identity.birthYear,
    },
  };
}
