// ─── templateEntryOwner / stepTemplateOwner — אותם מקרים כמו בשרת ─────────────
// ‼ המקרים כאן הם בדיוק אלה של _template_entry_owner / _step_template_owner ב-
// scripts/sql/test-r4-engine.sql (בלוק L), ועוד קצוות של הקריאה מ-JSON.
import { test, equal, type TestCase } from '../../testkit/tinyTest';
import { stepTemplateOwner, templateEntryOwner } from '../templateEntryOwner';

const CONFIRM = { requirements: [{ key: 'a', kind: 'confirm', label: 'x' }] };

export const TESTS: TestCase[] = [
  test('templateEntryOwner — המקרים של השרת (test-r4-engine.sql)', () => {
    equal(templateEntryOwner({ owner: 'me', payload: CONFIRM }), 'client');
    equal(templateEntryOwner({ owner: 'me', officeTask: true, payload: CONFIRM }), 'me');
    equal(templateEntryOwner({ owner: 'me', payload: { title: 'משימה' } }), 'me');
    equal(templateEntryOwner({ owner: 'me', payload: { messageOnly: true, message: 'x' } }), 'me');
    equal(templateEntryOwner({ owner: 'me', stepType: 'file_opening', payload: { checklist: [{ key: 'v' }] } }), 'me');
    equal(templateEntryOwner({ owner: 'me', stepType: 'client_documents', payload: { checklist: [{ key: 'v' }] } }), 'client');
    equal(templateEntryOwner({ owner: 'client', payload: { externalParty: { kind: 'other' } } }), 'external');
    equal(templateEntryOwner({ payload: {} }), 'client');
  }),

  test('templateEntryOwner — קצוות: officeTask כמחרוזת, סוג ריק, owner חיצוני, payload פגום', () => {
    equal(templateEntryOwner({ owner: 'me', officeTask: 'true', payload: CONFIRM }), 'me');
    equal(templateEntryOwner({ owner: 'me', officeTask: false, payload: CONFIRM }), 'client');
    equal(templateEntryOwner({ owner: 'me', stepType: '', payload: { title: 'x' } }), 'me');
    equal(templateEntryOwner({ owner: 'external', payload: {} }), 'external');
    equal(templateEntryOwner({ owner: 'me', payload: { externalParty: null, title: 'x' } }), 'me');
    equal(templateEntryOwner({ owner: 'me', stepType: 'prev_accountant_details', payload: {} }), 'client');
    equal(templateEntryOwner({ owner: 'me', payload: { messageOnly: 'true' } }), 'me');
    equal(templateEntryOwner({ owner: 'me', payload: [1, 2] }), 'me');
    equal(templateEntryOwner({ owner: 'me', payload: { clientLinkUrl: 'https://x' } }), 'client');
    equal(templateEntryOwner({ owner: 'me', payload: { clientLinkUrl: '   ' } }), 'me');
    equal(templateEntryOwner({ owner: 'me', payload: { guideKey: 'g' } }), 'client');
    equal(templateEntryOwner(null), 'client');
    equal(templateEntryOwner(undefined), 'client');
  }),

  test('stepTemplateOwner — המקרים של השרת (test-r4-engine.sql)', () => {
    equal(stepTemplateOwner('custom_request', 'client', { internalTask: true }), 'me');
    equal(stepTemplateOwner('custom_request', 'me', { requirements: [{ key: 'a' }] }), 'client');
    equal(stepTemplateOwner('custom_request', 'me', { messageOnly: true, message: 'x' }), 'me');
    equal(stepTemplateOwner('client_documents', 'me', { checklist: [{ key: 'a' }] }), 'client');
    equal(stepTemplateOwner('release_letter', 'me', {}), 'me');
    equal(stepTemplateOwner('custom_request', 'me', { externalParty: { kind: 'prev_accountant' } }), 'external');
  }),

  test('stepTemplateOwner — קצוות: אישור אישי, כדור אצל הלקוח, payload ריק', () => {
    equal(stepTemplateOwner('custom_request', 'client', { personalConfirmFor: 'i7', requirements: [{ key: 'a' }] }), 'me');
    equal(stepTemplateOwner('custom_request', 'client', {}), 'client');
    equal(stepTemplateOwner('custom_request', 'me', null), 'me');
    equal(stepTemplateOwner('prev_accountant_details', 'me', {}), 'client');
  }),
];
