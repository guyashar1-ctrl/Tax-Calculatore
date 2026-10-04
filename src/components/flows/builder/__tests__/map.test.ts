// ─── בדיקות: מפת הבונה — סיכום שלב, מייל מרוכז לכל רגע, סדר בתוך רגע ──────
// ‼ מה נעול כאן:
//   · מייל «לבד» כולל רק פריטים של שלבי «לבד» (214: origin auto); «בדף מיד» מחכה
//     במגש; «רק בדף» בלי מייל; פריט «אחרי» לא נכנס למייל של הרגע.
//   · ייצוג/שאלון — מייל משלהם; בקשה של המשרד — לא מגיעה ללקוח.
//   · מה שלא ייפתח לסוג (או שהספרייה לא תיצור) — לא נספר ולא נכנס למייל.
//   · «סדר» מזיז רק בין שלבים של אותו רגע.
import { test, equal, deepEqual, assert } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import { VERDICT_ON, type Verdict } from '../../../../features/flows/conditions';
import { itemVerdict, lensFacts } from '../../../../features/flows/preview';
import type { FlowDefinition, FlowItem, FlowStage } from '../../../../features/flows/types';
import type { RequestTemplate } from '../../../../lib/requestTemplates';
import {
  actionRef, buildLibraryLookup, countsText, firstLensWithMail, lensValue, mailRoute, momentMail, moveWithinMoment, noMailText,
  normalizeDefinition, stageCounts, stagesAfter, systemActor, type MomentMail,
} from '../model';

// ‼ «המשרד» נשמר בספרייה עם officeTask: true (upsert_library_request, 215). בלי הסימון — רשומה
// ישנה, והשרת יוצר ממנה בקשה ללקוח כשיש בה פריטים (_template_entry_owner / templateEntryOwner).
const T = (id: string, owner: 'client' | 'me' | 'external' = 'client', stepType = 'custom_request', officeTask = owner === 'me'): RequestTemplate => ({
  id, name: `בקשה ${id}`, kind: 'request', officeId: 'o', seedKey: null,
  entries: [{ stepType, owner, ...(officeTask ? { officeTask: true } : {}), payload: { requirements: [{ key: 'r', kind: 'file', label: 'x' }] } }],
});
const templates = [T('c1'), T('c2'), T('me', 'me'), T('ext', 'external'), T('q', 'client', 'intake_questionnaire')];
const lib = buildLibraryLookup(templates, []);
const tpl = (id: string, extra: Partial<FlowItem> = {}): FlowItem => ({ key: id, ref: { kind: 'template', templateId: id }, ...extra });
const st = (key: string, delivery: FlowStage['delivery'], items: FlowItem[], extra: Partial<FlowStage> = {}): FlowStage =>
  ({ key, name: key, opens: { after: 'start' }, delivery, items, ...extra });
const title = (i: FlowItem) => i.key;
const on = (): Verdict => VERDICT_ON;

export const TESTS: TestCase[] = [
  test('לאן פריט מגיע: מייל מרוכז / מייל משלו / לא ללקוח', () => {
    equal(mailRoute(tpl('c1'), lib, templates), 'email');
    equal(mailRoute(tpl('me'), lib, templates), 'none');
    // רשומה ישנה: «המשרד» בלי officeTask, עם פריט ללקוח — מגיעה ללקוח, כמו בשרת.
    const legacy = [T('old', 'me', 'custom_request', false)];
    equal(mailRoute(tpl('old'), buildLibraryLookup(legacy, []), legacy), 'email');
    equal(mailRoute(tpl('ext'), lib, templates), 'none');
    equal(mailRoute(tpl('q'), lib, templates), 'own');
    equal(mailRoute({ key: 'r', ref: { kind: 'system', stepType: 'representation' } }, lib, templates), 'own');
    equal(mailRoute({ key: 'd', ref: { kind: 'system', stepType: 'client_documents' } }, lib, templates), 'email');
    equal(mailRoute({ key: 'a', ref: actionRef('btl.sync_file') }, lib, templates), 'none');
  }),
  test('מייל לרגע: «לבד» לחוד, מגש לחוד, «רק בדף» בלי מייל, «אחרי» לא נכלל', () => {
    const def: FlowDefinition = { stages: [
      st('ap', 'approve', [tpl('c1'), tpl('c2', { after: 'c1' }), tpl('me')]),
      st('au', 'auto', [tpl('c2', { key: 'c2b' } as Partial<FlowItem>)]),
      st('pg', 'page', [tpl('c1', { key: 'c1p' } as Partial<FlowItem>)]),
      st('hd', 'hold', [tpl('q')]),
    ] };
    const m = momentMail(def, ['ap', 'au', 'pg', 'hd'], lib, templates, title, () => on(), new Set());
    deepEqual(m.approve.map(e => e.key), ['c1']);
    deepEqual(m.auto.map(e => e.key), ['c2b']);
    deepEqual(m.page.map(e => e.key), ['c1p']);
    deepEqual(m.hold.map(e => e.key), []);
    deepEqual(m.own.map(e => e.key), ['q']);
  }),
  test('מייל לרגע: מה שלא ייפתח לסוג או שהספרייה לא תיצור — לא נכנס', () => {
    const s = st('s', 'approve', [tpl('c1', { when: { kinds: ['company'] } }), tpl('c2'), tpl('ext')]);
    const lf = lensFacts({ t: 'kind', kind: 'exempt_dealer' });
    const m = momentMail({ stages: [s] }, ['s'], lib, templates, title, (stage, i) => itemVerdict(stage, i, false, lf), new Set(['c2']));
    deepEqual(m.approve, []);
    const all = momentMail({ stages: [s] }, ['s'], lib, templates, title, (stage, i) => itemVerdict(stage, i, false, lensFacts({ t: 'all' })), new Set());
    deepEqual(all.approve.map(e => [e.key, e.depends]), [['c1', true], ['c2', false]]);
  }),
  test('סיכום שלב: לפי מי עושה, בלי מה שלא ייפתח', () => {
    const s = st('s', 'approve', [tpl('c1'), tpl('me'), tpl('ext'), { key: 'a', ref: actionRef('btl.sync_file'), mode: 'auto' }]);
    equal(countsText(stageCounts(s, templates)), '1 ללקוח · 1 לך · 1 לגורם חיצוני · קריאה מהרשות — לבד, כשאפשר');
    equal(countsText(stageCounts(s, templates, i => i.key === 'c1')), '1 לך · 1 לגורם חיצוני · קריאה מהרשות — לבד, כשאפשר');
    equal(countsText(stageCounts(st('e', 'approve', []), templates)), 'אין כאן כלום עדיין');
  }),
  test('סדר בתוך רגע: מחליף רק עם שלב שנפתח באותו רגע', () => {
    const def: FlowDefinition = { stages: [
      st('a', 'approve', []), st('x', 'approve', [], { opens: { after: 'stage', stage: 'a' } }), st('b', 'approve', []),
    ] };
    deepEqual(moveWithinMoment(def, 'b', -1).stages.map(s => s.key), ['b', 'x', 'a']);
    deepEqual(moveWithinMoment(def, 'x', -1).stages.map(s => s.key), ['a', 'x', 'b'], 'לבד ברגע שלו — לא זז');
    deepEqual(moveWithinMoment(def, 'a', -1).stages.map(s => s.key), ['a', 'x', 'b']);
  }),
  test('«איך ייראה»: ב«כולם» — הלקוח הראשון לדוגמה שמקבל מייל; בסוג שנבחר — הוא עצמו', () => {
    const empty: MomentMail = { approve: [], auto: [], hold: [], page: [], own: [] };
    const e = { key: 'x', title: 'בקשה', isDocument: false, depends: false, stageKey: 's' };
    const onlyS2 = (l: Parameters<typeof lensValue>[0]) => lensValue(l) === 's2' ? { ...empty, approve: [e] } : empty;
    deepEqual(firstLensWithMail({ t: 'all' }, onlyS2), { lens: { t: 'sample', i: 2 }, picked: true });
    deepEqual(firstLensWithMail({ t: 'kind', kind: 'company' }, onlyS2), { lens: { t: 'kind', kind: 'company' }, picked: false });
    equal(firstLensWithMail({ t: 'all' }, () => empty).picked, false, 'אף אחד לא מקבל — נשארים בראשון');
  }),
  test('«איך ייראה»: למה אין מייל — לפי מה שבאמת קורה ללקוח', () => {
    const empty: MomentMail = { approve: [], auto: [], hold: [], page: [], own: [] };
    const e = (title: string) => ({ key: title, title, isDocument: false, depends: false, stageKey: 's' });
    assert(/רק בדף — בלי מייל ובלי תזכורות: חוזה/.test(noMailText({ ...empty, page: [e('חוזה')] })), 'רק בדף — בלי מייל ובלי תזכורות');
    assert(/במייל נפרד משלה/.test(noMailText({ ...empty, own: [e('בקשת ייצוג')] })), 'מייל משלה');
    assert(/לא נפתח/.test(noMailText(empty)), 'שום דבר לא נפתח');
  }),
  test('פעולה שנשמרה עם actionId בלבד — מנורמלת לשני השדות; השאר לא משתנה', () => {
    const def: FlowDefinition = { stages: [st('s', 'approve', [
      { key: 'a', ref: { kind: 'action', actionId: 'btl.sync_file' } as never },
      { key: 'b', ref: { kind: 'action', actionType: 'shaam.sync_income_tax_file' } as never },
      tpl('c1'),
    ])] };
    const n = normalizeDefinition(def);
    deepEqual(n.stages[0].items.map(i => i.ref), [actionRef('btl.sync_file'), actionRef('shaam.sync_income_tax_file'), def.stages[0].items[2].ref]);
    equal(n.stages[0].items[2], def.stages[0].items[2], 'פריט שאינו פעולה — אותו אובייקט');
    deepEqual(normalizeDefinition(n), n, 'פעם שנייה — בלי שינוי');
  }),
  test('«מתי נפתח»: כל מה שכבר נפתח אחרי השלב (גם דרך שלב אחר) — מחוץ לבחירה', () => {
    const def: FlowDefinition = { stages: [
      st('a', 'approve', [tpl('a1')]),
      st('b', 'approve', [tpl('b1')], { opens: { after: 'stage', stage: 'a' } }),
      st('c', 'approve', [], { opens: { after: 'item', item: 'b1' } }),
      st('d', 'approve', [], { opens: { after: 'start' } }),
    ] };
    deepEqual([...stagesAfter(def, 'a')].sort(), ['b', 'c']);
    deepEqual([...stagesAfter(def, 'c')], []);
    const loop: FlowDefinition = { stages: [st('x', 'approve', [], { opens: { after: 'stage', stage: 'y' } }), st('y', 'approve', [], { opens: { after: 'stage', stage: 'x' } })] };
    deepEqual([...stagesAfter(loop, 'x')], ['y'], 'מעגל קיים — לא נתקע');
  }),
  test('מי מבצע בקשת מערכת — מ-REQUEST_META, לא רשימה שנייה', () => {
    equal(systemActor('paperless_connection'), 'office');
    equal(systemActor('release_letter'), 'external');
    equal(systemActor('materials_received'), 'external');
    equal(systemActor('client_documents'), 'client');
    equal(systemActor('representation'), 'client');
  }),
];
