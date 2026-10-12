// ─── עסק חדש שהמשרד פותח (234): מצב העסק, ערכת התעודות, «עובד מהבית?» ──────────
// גיא (12.10.2026): «לא סומן» אינו «עסק חדש»; בעסק חדש — ת.ז. וגם רישיון נהיגה, אלא אם
// סומן במפורש «אין לי רישיון»; «האם תעבוד גם מהבית?» לפני שאלת החדר.
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
  test('בלי ערכה — צילום אחד לאדם, כמו קודם', () => {
    equal(kinds(identityRequirements(scope, people, {})), 'idCard');
  }),
  test('עסק חדש ⇒ ת.ז. וגם רישיון נהיגה', () => {
    equal(kinds(identityRequirements(scope, people, {}, { newBusinessKit: true })), 'idCard,driverLicense');
  }),
  test('עסק חדש + «אין לי רישיון» ⇒ ת.ז. בלבד', () => {
    equal(kinds(identityRequirements(scope, people, {}, { newBusinessKit: true, noLicense: { client: true } })), 'idCard');
  }),
  test('ערכה: רישיון לבדו אינו מספק את דרישת ת.ז. (ולהפך)', () => {
    const reqs = identityRequirements(scope, people, {}, { newBusinessKit: true });
    const onlyLicense = { client: [{ documentId: 'd1', docKind: 'driverLicense' }] };
    equal(kinds(missingIdentity(reqs, onlyLicense)), 'idCard');
    const both = { client: [{ documentId: 'd1', docKind: 'driverLicense' }, { documentId: 'd2', docKind: 'idCard' }] };
    equal(missingIdentity(reqs, both).length, 0);
  }),
  test('ערכה: ב״ל לבדו — אין דרישת צילום, גם לא רישיון', () => {
    const ni = { nationalInsurance: { status: 'in_process', targets: ['client'] } } as unknown as AuthorityRepresentations;
    equal(identityRequirements(ni, people, {}, { newBusinessKit: true }).length, 0);
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
