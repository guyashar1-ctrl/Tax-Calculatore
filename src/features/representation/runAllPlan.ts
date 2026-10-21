// ─── «הפעל הכול» — מה ירוץ, למי, ומה חסום (269/270) ─────────────────────────────
// ‼ גיא (21.10.2026): «לחיצה אחת, והוא ירוץ גם בשע״ם וגם בביטוח לאומי לשניהם».
// נגזר כאן, טהור, מאותן נגזרות של הכפתורים הבודדים במרכז הייצוג — אותן הגשות
// (repSubmissions), אותה הכרעה «מה הצעד» (shaamRepresentationAction /
// niRepresentationAction), ואותו קלט לעובד (repAutomationInputs). «הפעל הכול» לעולם
// לא מריץ משהו שהכפתור הבודד לא היה מריץ באותו רגע.
// ‼ רק הזנות (פתיחת בקשה בשע״ם, הזנת ייפוי כוח בב״ל) — לא שידור טופס חתום ולא בדיקות.

import type { Client, PersonRole, RepresentationRequest } from '../../types';
import { SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE } from '../../types/automation';
import { niPersons, niRepresentationOf, niRepresentationAction } from '../../utils/niPersons';
import { peopleFromClient, targetsOf } from '../../utils/repScope';
import { allDocumentsStamped } from '../../utils/repDocuments';
import { shaamRepresentationAction } from '../taxFile/shaamRepresentationAction';
import { shaamSystemsOf, SHAAM_SYSTEM_SCREEN_LABELS } from './shaamRepresentation';
import { repSubmissions, shaamEnteredAt } from './repPreparation';
import { shaamCreateInput, niCreateInput } from './repAutomationInputs';

export type RunAllAuthority = 'shaam' | 'btl';

export interface RunAllItem {
  key: string;
  authority: RunAllAuthority;
  actionType: string;
  /** «ליאת ברנשטיין · מס הכנסה, מע"מ» */
  label: string;
  /** הקלט לעובד, או למה אי אפשר להריץ עכשיו (חסר נתון בכרטיס). */
  input?: Record<string, unknown>;
  blocked?: string;
  /** מזהה האדם/ההגשה במשימה — אותו מפתח שהכפתור הבודד מסנן לפיו. */
  who: string;
}

export function runAllPlan(
  request: RepresentationRequest,
  client: Client,
  spouseClient?: Client,
): RunAllItem[] {
  const items: RunAllItem[] = [];
  const exec = request.execution ?? {};
  const people = peopleFromClient(client);
  const sentToShaam = ['awaiting_authorities', 'active'].includes(request.status);
  const stamped = allDocumentsStamped(request) || sentToShaam;

  repSubmissions(request, client).forEach((sub, i) => {
    if (shaamSystemsOf(sub).length === 0) return;
    if (shaamEnteredAt(exec, sub.key, i === 0)) return;
    const tracking = exec.shaam?.[sub.key];
    const action = shaamRepresentationAction(request.status, tracking, stamped);
    if (action?.kind !== 'create' || action.disabled) return;
    const built = shaamCreateInput(request, client, sub, people.married, tracking);
    items.push({
      key: `shaam:${sub.key}`,
      authority: 'shaam',
      actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
      label: `${sub.personName} · ${shaamSystemsOf(sub).map(s => SHAAM_SYSTEM_SCREEN_LABELS[s]).join(', ')}`,
      who: sub.key,
      ...(built.ok ? { input: built.input } : { blocked: built.error }),
    });
  });

  // ‼ אותו כלל «עבור מי» של מרכז הייצוג: בן/בת זוג רק אצל נשוי, או מסלול שכבר התחיל (237).
  const niTargets = targetsOf(client.authorityRepresentations, 'nationalInsurance');
  const niExec = { client: exec.nationalInsurance ?? {}, spouse: exec.nationalInsuranceSpouse ?? {} };
  const spouseStarted = !!(niExec.spouse.enteredAt || niExec.spouse.referenceNumber || niExec.spouse.confirmedAt);
  const roles: PersonRole[] = (['client', 'spouse'] as PersonRole[]).filter(r =>
    niTargets.includes(r) && (r === 'client' || client.familyStatus === 'married' || spouseStarted));
  for (const role of roles) {
    const person = niPersons(client, spouseClient).find(p => p.role === role);
    if (!person) continue;
    const line = niRepresentationOf(person, client, spouseClient, niExec);
    if (niRepresentationAction(person, client, line, niExec[role])?.kind !== 'enter_btl') continue;
    const built = niCreateInput(client, role, spouseClient);
    items.push({
      key: `btl:${role}`,
      authority: 'btl',
      actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE,
      label: person.name,
      who: role,
      ...(built.ok ? { input: built.input } : { blocked: built.error }),
    });
  }
  return items;
}
