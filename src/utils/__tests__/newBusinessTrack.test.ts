// ─── עסק חדש שהמשרד פותח (234): מצב העסק, ערכת התעודות, «עובד מהבית?» ──────────
// גיא (12.10.2026): «לא סומן» אינו «עסק חדש»; «האם תעבוד גם מהבית?» לפני שאלת החדר.
// גיא (21.10.2026, 269): רישיון הנהיגה של עסק חדש אינו חלק מבקשת הייצוג — רק תעודה מזהה.
import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { businessSituationFields, businessSituationOf } from '../businessSituation';
import { identityRequirements, missingIdentity } from '../identityEvidence';
import { validateHomeOffice } from '../../features/requests/homeOffice';
import type { AuthorityRepresentations } from '../../types';

const scope = { incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary' } } as unknown as AuthorityRepresentations;
const people = { married: false, clientName: 'אמיר', spouseName: '' };
const kinds = (rs: { kind: string }[]) => rs.map(r => r.kind).join(',');

export const TESTS: TestCase[] = [
  test('מצב העסק: שלוש בחירות ⇒ שני השדות, ובחזרה', () => {
    for (const s of ['new', 'transfer', 'existing'] as const) {
      equal(businessSituationOf(businessSituationFields(s)), s);
    }
  }),
  test('«לא סומן» (ליד בלי רו״ח קודם) אינו «עסק חדש»', () => {
    equal(businessSituationOf({ businessTransfer: undefined, hasPreviousAccountant: false }), undefined);
  }),
  test('ליד ישן שסומן רק «עובר מרו״ח אחר» ⇒ העברה', () => {
    equal(businessSituationOf({ hasPreviousAccountant: true }), 'transfer');
  }),
  test('עסק קיים בלי רו״ח קודם ⇒ businessTransfer=true, אין רו״ח קודם', () => {
    equal(JSON.stringify(businessSituationFields('existing')), JSON.stringify({ businessTransfer: true, hasPreviousAccountant: false }));
  }),
  test('בקשת הייצוג — צילום אחד לאדם, גם בעסק חדש (בלי רישיון)', () => {
    equal(kinds(identityRequirements(scope, people, {})), 'idCard');
  }),
  test('רישיון לבדו מספק את דרישת התעודה המזהה', () => {
    const reqs = identityRequirements(scope, people, {});
    equal(missingIdentity(reqs, { client: [{ documentId: 'd1', docKind: 'driverLicense' }] }).length, 0);
  }),
  test('ב״ל לבדו — אין דרישת צילום', () => {
    const ni = { nationalInsurance: { status: 'in_process', targets: ['client'] } } as unknown as AuthorityRepresentations;
    equal(identityRequirements(ni, people, {}).length, 0);
  }),
  test('«לא עובד מהבית» ⇒ תקין, בלי שאלת החדר', () => {
    const r = validateHomeOffice({ worksFromHome: false, hasDedicatedRoom: null, totalRooms: null, businessRooms: null });
    equal(r.ok && r.value.hasDedicatedRoom === false && r.value.worksFromHome === false, true);
  }),
  test('«עובד מהבית» בלי תשובה על החדר ⇒ חסר', () => {
    const r = validateHomeOffice({ worksFromHome: true, hasDedicatedRoom: null, totalRooms: null, businessRooms: null });
    equal(r.ok ? 'ok' : r.error, 'missing_has_room');
  }),
  test('השאלה הראשונה לא נענתה ⇒ חסר', () => {
    const r = validateHomeOffice({ worksFromHome: null, hasDedicatedRoom: null, totalRooms: null, businessRooms: null });
    equal(r.ok ? 'ok' : r.error, 'missing_works_from_home');
  }),
  test('מסך שלא שואל את השאלה (undefined) — ההתנהגות הקודמת', () => {
    const r = validateHomeOffice({ hasDedicatedRoom: false, totalRooms: null, businessRooms: null });
    equal(r.ok && r.value.worksFromHome === undefined, true);
  }),
];
