import { test, equal, assert, type TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { InfoAsk } from '../types';
import { prefillOpenAsks } from '../knownPrefill';
import { addedEmployerDraft, confirmedDraft, draftToAnswer } from '../flowDraft';

const c = { id: 'c', firstName: 'ישראל', familyStatus: 'single', employers: [],
  niOccupations: [{ id: 'ni1', type: 'employee', employerName: 'משרד לדוגמה', fromDate: '2020-03-01', toDate: '2025-08-31' }] } as unknown as Client;
const ask = (extra: Partial<InfoAsk> = {}): InfoAsk => ({ id: 'a', clientId: 'c', taxYear: 2025,
  itemKey: 'salary.employerDetails', subjectRole: 'client', entityRef: 'emp-new-client-annual', state: 'published',
  prompt: { title: 'איפה עבדת ב-2025?', why: '', input: { kind: 'record', schema: 'employer', context: { taxYear: '2025' } } },
  ...extra } as InfoAsk);
export const TESTS: TestCase[] = [
  test('adding a missing employer preserves known rows and asks only for the new record', () => {
    const [a] = prefillOpenAsks([ask()], c, 'annual', 2025);
    const original = confirmedDraft(a);
    const added = addedEmployerDraft(a, original);
    equal(added.record?.items.length, 2);
    equal(added.record?.items[0].name, 'משרד לדוגמה');
    equal(added.record?.items[1].name, undefined);
    equal((added.record?.items[1].endDate as { precision: string }).precision, 'unknown');
    equal(draftToAnswer(a, added), null, 'an empty added employer must be completed');
    const filled = { ...added, record: { items: [...added.record!.items.slice(0, 1), { name: 'מעסיק נוסף', startDate: { precision: 'unknown' }, endDate: { precision: 'unknown' } }] } };
    const answer = draftToAnswer(a, filled);
    assert(answer?.kind === 'record' && JSON.stringify(answer.value).includes('מעסיק נוסף') && JSON.stringify(answer.value).includes('משרד לדוגמה'), 'known and additional employers are sent together');
    equal(original.record?.items.length, 1, 'existing draft is not mutated');
    assert(a.prompt.input.kind === 'record', 'known employer record');
    const confirmation: InfoAsk = { ...a, prompt: { ...a.prompt, input: { kind: 'confirm', lines: ['משרד לדוגמה'],
      edit: { schema: 'employer', initial: a.prompt.input.initial, context: a.prompt.input.context } } } };
    const changed = draftToAnswer(confirmation, { ...addedEmployerDraft(confirmation), record: filled.record });
    assert(changed?.kind === 'record' && changed.assertion === 'changed', 'addition also works for card confirmation questions');
  }),
  test('an already published blank question receives known records and submits the displayed values', () => {
    const original = ask();
    const [a] = prefillOpenAsks([original], c, 'annual', 2025);
    assert(a.prompt.knownRow, 'complete known record is a confirmation row');
    const answer = draftToAnswer(a, { choice: 'yes' });
    assert(answer?.kind === 'record', 'confirmation sends record values');
    assert(JSON.stringify(answer.value).includes('משרד לדוגמה'), 'displayed employer is sent');
    equal(original.prompt.input.kind === 'record' ? original.prompt.input.initial : null, undefined);
  }),
  test('submitted answers, historical confirmation snapshots and customer drafts remain unchanged', () => {
    const answered = ask({ state: 'answered' });
    equal(prefillOpenAsks([answered], c, 'annual', 2025)[0], answered);
    const confirmed = ask({ prompt: { title: 'צילום ישן', why: '', input: { kind: 'confirm', lines: ['נתון ישן'] } } });
    const result = prefillOpenAsks([confirmed], c, 'annual', 2025)[0];
    equal(JSON.stringify(result.prompt), JSON.stringify(confirmed.prompt));
    const original = ask({ savedDraft: { v2: { 'salary.employerDetails|client|emp-new-client-annual': { record: { items: [{ name: 'מה שהלקוח הקליד' }] } } }, at: 1 } });
    equal(prefillOpenAsks([original], c, 'annual', 2025)[0].prompt.knownRow, undefined);
  }),
  test('an explicitly additional employer is not filled with an existing employer', () => {
    const a = ask(); a.prompt = { ...a.prompt, onCard: [['מעסיק קיים', 'כבר אצלנו']] };
    const [result] = prefillOpenAsks([a], c, 'annual', 2025);
    equal(result.prompt.knownRow, undefined);
    equal(result.prompt.input.kind === 'record' ? result.prompt.input.initial : null, undefined);
  }),
  test('a saved confirmation keeps the exact values shown even after source information changes', () => {
    const [a] = prefillOpenAsks([ask()], c, 'annual', 2025);
    const draft = confirmedDraft(a);
    assert(draft.record?.items[0].name === 'משרד לדוגמה', 'confirmed values saved in draft');
    const original = ask({ savedDraft: { v2: { 'salary.employerDetails|client|emp-new-client-annual': draft }, at: 1 } });
    const [reopened] = prefillOpenAsks([original], { ...c, niOccupations: [] }, 'annual', 2025);
    assert(reopened.prompt.knownRow, 'saved approval reopens as confirmation');
    const answer = draftToAnswer(reopened, draft);
    assert(answer?.kind === 'record' && JSON.stringify(answer.value).includes('משרד לדוגמה'), 'source changes do not alter saved answer');
  }),
  test('follow-ups inside older tiles receive the same prefill before they are submitted', () => {
    const child = ask();
    const a = ask({ itemKey: 'annual.whatHappened', prompt: { title: 'הכנסות', why: '', input: { kind: 'multi',
      options: [{ key: 'salary.worked', role: 'client', label: 'משכורת', followUps: [child] }] } } });
    const [result] = prefillOpenAsks([a], c, 'annual', 2025);
    assert(result.prompt.input.kind === 'multi', 'tile input retained');
    assert(result.prompt.input.options[0].followUps?.[0].prompt.knownRow, 'nested follow-up is prefilled');
  }),
];
