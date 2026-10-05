// ─── «צפייה» בבקשה — כיסוי הרשומות, הצירים והכתובות ────────────────────────────
// ‼ השער: סוג בקשה/מקור חדש בלי רשומה ב-registry.ts — נופל כאן (וגם בקומפילציה: Record<OnboardingStepType, …>).
//   הטקסט שהלקוח רואה אינו כאן: הדוגמאות הן מפתחות ומצבים; רק בקשה שנבנית בדפדפן בנתיב היצירה (D3) נושאת payload.

import { test, assert, equal, deepEqual, type TestCase } from '../../../testkit/tinyTest';
import { PORTAL_STEP_TYPES } from '../../../types/onboarding';
import { GROUP_ORDER, REQUEST_GROUPS } from '../../requests/requestGroups';
import type { RequestTemplate } from '../../../lib/requestTemplates';
import { CATALOG_META, STEP_TYPE_META, viewOf, type TargetView } from '../registry';
import {
  CATALOG_TYPES, parseViewFocus, resolveFocus, selectionFromText, selectionToText, targetKey, targetOfTemplate, targetToFocus,
  templateFacts, type PreviewTarget,
} from '../targets';
import { requestKey } from '../api';
import ADD_DIALOG_RAW from '../../../components/clientTabs/AddRequestDialog.tsx?raw';
import REGISTRY_RAW from '../registry.ts?raw';
import SQL_157_RAW from '../../../../supabase/157-authority-representation-request.sql?raw';

const tpl = (over: Partial<RequestTemplate> & { entries: RequestTemplate['entries'] }): RequestTemplate => ({
  id: 't1', name: 'בקשה', kind: 'request', officeId: 'o1', seedKey: null, ...over,
});
const free = (payload: Record<string, unknown>, owner: 'client' | 'me' | 'external' = 'client') =>
  tpl({ entries: [{ stepType: 'custom_request', owner, payload }] });

/** כל הבחירות האפשריות במבט (מכפלה של הצירים — מוגבלת, כדי שהבדיקה לא תתפוצץ). */
function allSelections(v: TargetView): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (let depth = 0; depth < 4; depth++) {
    const next: Record<string, string>[] = [];
    for (const c of combos) {
      const axes = v.axes(c);
      const open = axes.find(a => !(a.key in c));
      if (!open) { next.push(c); continue; }
      for (const o of open.options) next.push({ ...c, [open.key]: o.key });
    }
    combos = next;
  }
  return combos;
}

const targets = (): PreviewTarget[] => [
  ...CATALOG_TYPES.map(type => ({ kind: 'catalog', type, name: type }) as PreviewTarget),
  ...GROUP_ORDER.map(group => ({ kind: 'group', group, name: group }) as PreviewTarget),
  ...PORTAL_STEP_TYPES.map(stepType => ({ kind: 'system', stepType, name: stepType }) as PreviewTarget),
  { kind: 'doc', docId: 'd1', name: 'מסמך' },
  targetOfTemplate(free({ title: 'חופשית', requirements: [{ key: 'a', kind: 'text', label: 'א' }, { key: 'b', kind: 'confirm', label: 'ב' }] })),
  targetOfTemplate(free({ title: 'פנימית' }, 'me')),
  targetOfTemplate(free({ title: 'הודעה', messageOnly: true, message: 'שלום' })),
  targetOfTemplate(tpl({ entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist: [{ key: 'a', label: 'א' }, { key: 'b', label: 'ב' }] } }], seedKey: 'client_documents', officeId: null })),
  targetOfTemplate(tpl({ entries: [{ stepType: 'prev_accountant_details', owner: 'client', payload: {} }], seedKey: 'prev_accountant_details', officeId: null })),
  { kind: 'draft', name: 'טיוטה', stepType: 'custom_request', owner: 'client', payload: { title: 'טיוטה' } },
];

export const TESTS: TestCase[] = [
  test('כיסוי · כל סוג שהדף האישי מצייר (PORTAL_STEP_TYPES) יש לו רשומה', () => {
    for (const t of PORTAL_STEP_TYPES) assert(STEP_TYPE_META[t], `חסרה רשומה ל-${t}`);
  }),

  test('כיסוי · כל חבר בכל קבוצה (REQUEST_GROUPS) יש לו רשומה, וכל סוג שהקבוצה מציגה לא «נעלם» בלי נימוק', () => {
    for (const g of GROUP_ORDER) for (const m of REQUEST_GROUPS[g].members) {
      const meta = STEP_TYPE_META[m.stepType];
      assert(meta, `חסרה רשומה ל-${m.stepType} (${g})`);
      if (meta.clientSees === 'nothing') assert(!!meta.why, `${m.stepType}: clientSees=nothing בלי נימוק`);
    }
  }),

  test('כיסוי · כל פריט ב-ADD_REQUEST_CATALOG (חלון «＋ בקשה חדשה») יש לו רשומה — והרשימה כאן זהה לו', () => {
    const src = ADD_DIALOG_RAW.replace(/\r\n/g, '\n');
    const start = src.indexOf('export const ADD_REQUEST_CATALOG');
    assert(start >= 0, 'ADD_REQUEST_CATALOG לא נמצא');
    const block = src.slice(start, src.indexOf('\n];', start));
    const types = [...block.matchAll(/\{\s*type:\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
    assert(types.length >= 8, `נמצאו רק ${types.length} פריטי קטלוג`);
    deepEqual([...types].sort(), [...CATALOG_TYPES].sort(), 'CATALOG_TYPES ב-targets.ts שונה מהקטלוג ב-AddRequestDialog');
    for (const type of types) assert(CATALOG_META[type as keyof typeof CATALOG_META], `חסרה רשומה ל-${type}`);
  }),

  test('כיסוי · סוג שאינו מופיע ללקוח אומר למה (clientSees: nothing + נימוק)', () => {
    for (const [type, meta] of Object.entries(STEP_TYPE_META)) {
      if (meta.clientSees === 'nothing') {
        assert(!!meta.why && meta.mails.length === 0 && meta.docs.length === 0, `${type}: nothing בלי נימוק, או עם מייל/מסמך`);
      }
    }
  }),

  test('צירים · לכל מבט: מפתחות ייחודיים, ברירת מחדל תקפה, והבקשה נבנית לכל בחירה', () => {
    for (const target of targets()) {
      const v = viewOf(target);
      for (const sel of allSelections(v)) {
        const axes = v.axes(sel);
        assert(axes.length <= 3, `${targetKey(target)}: יותר משלושה צירים`);
        equal(new Set(axes.map(a => a.key)).size, axes.length, `${targetKey(target)}: ציר כפול`);
        for (const a of axes) {
          assert(a.options.length >= 2, `${targetKey(target)}: ציר ${a.key} עם פחות משתי אפשרויות`);
          equal(new Set(a.options.map(o => o.key)).size, a.options.length, `${targetKey(target)}: אפשרות כפולה בציר ${a.key}`);
        }
        const req = v.build(sel);
        assert(req.samples.length >= 1, `${targetKey(target)}: בקשה בלי דוגמאות`);
        equal(new Set(req.samples.map(s => s.key)).size, req.samples.length, `${targetKey(target)}: מפתחות דוגמה כפולים`);
        assert(req.samples.length <= 20, `${targetKey(target)}: יותר מ-20 דוגמאות (השרת מסרב)`);
      }
      const d = v.defaults;
      for (const a of v.axes(d)) assert(a.options.some(o => o.key === d[a.key]), `${targetKey(target)}: ברירת המחדל של ${a.key} לא ברשימה`);
    }
  }),

  test('בלי טקסט ללקוח · דוגמה מהספרייה/ממערכת/ממסמך נושאת מפתחות בלבד — payload רק לבקשה שנבנית בדפדפן (D3)', () => {
    for (const target of targets()) {
      if (target.kind === 'catalog' || target.kind === 'draft') continue;
      const v = viewOf(target);
      for (const sel of allSelections(v)) {
        for (const s of v.build(sel).samples) {
          assert(!s.payload, `${targetKey(target)}: payload בדוגמה ${s.key}`);
          const patch = JSON.stringify(s.patch ?? {});
          assert(!/clientNote|clientSub|clientCta|clientRefs|clientLink/.test(patch), `${targetKey(target)}: patch נושא טקסט ללקוח: ${patch}`);
        }
      }
    }
  }),

  test('בלי טקסט ללקוח · registry.ts לא מכיל את נוסחי הכרטיסים שהשרת בונה', () => {
    const src = REGISTRY_RAW.replace(/\r\n/g, '\n');
    for (const phrase of ['אישרתי באזור האישי', 'נרשמתי לפייפרלס', 'בימים הקרובים ניכנס', 'להזין אמצעי תשלום', 'לכניסה לאזור האישי', 'זירוז אישור הייצוג']) {
      assert(!src.includes(phrase), `הנוסח «${phrase}» מועתק ל-registry.ts — הוא נבנה בשרת`);
    }
  }),

  test('כותרת «ייצוג בביטוח לאומי — שם» בדוגמה זהה לנוסח שהשרת יוצר (157)', () => {
    const src = SQL_157_RAW.replace(/\r\n/g, '\n');
    assert(src.includes("'title', 'ייצוג בביטוח לאומי — ' || coalesce(v_name,'')"), 'הנוסח ב-157 השתנה — לעדכן את niTitle ב-registry.ts');
    assert(REGISTRY_RAW.includes('`ייצוג בביטוח לאומי — ${name}`'), 'niTitle ב-registry.ts השתנה');
  }),

  test('קבוצות · פייפרלס: ארבעה רגעים; הרשמה לפי חשבון; «בהמשך» נושא את שם הבקשה הקודמת (קלט)', () => {
    const v = viewOf({ kind: 'group', group: 'paperless', name: 'פייפרלס' });
    deepEqual(v.axes({})[0].options.map(o => o.key), ['start', 'signed', 'setup', 'done']);
    const start = v.build({ moment: 'start', account: 'self' });
    const invite = start.samples.find(s => s.key === 'paperless_invite');
    equal(invite?.inputs?.paperlessStatus, 'self');
    const conn = start.samples.find(s => s.key === 'paperless_connection');
    equal(conn?.status, 'locked');
    deepEqual(conn?.lockAfter, ['הרשמה לפייפרלס']);
    const done = v.build({ moment: 'done' });
    assert(done.samples.every(s => s.status === 'completed'), 'ברגע «הושלם» כל הבקשות הושלמו');
  }),

  test('קבוצות · ייצוג: «זוג» מוסיף את חתימת בן/בת הזוג ואת שורת בן/בת הזוג; «חובה» מעביר את שע״ם ל-awaiting', () => {
    const v = viewOf({ kind: 'group', group: 'representation', name: 'ייצוג' });
    assert(!v.axes({ persona: 'single' })[0].options.some(o => o.key === 'spouse'), 'יחיד — בלי חתימת בן/בת זוג');
    assert(v.axes({ persona: 'couple' })[0].options.some(o => o.key === 'spouse'), 'זוג — יש');
    equal(v.axes({ moment: 'fill' }).length, 2, 'לפני ההגשה אין ציר זירוז/חובה');
    equal(v.axes({ moment: 'filed' }).length, 3, 'מרגע ההגשה יש');
    const single = v.build({ moment: 'filed', persona: 'single', approval: 'optional' });
    equal(single.samples.filter(s => s.key.startsWith('ni-')).length, 1);
    const couple = v.build({ moment: 'filed', persona: 'couple', approval: 'required' });
    equal(couple.samples.filter(s => s.key.startsWith('ni-')).length, 2);
    equal(couple.rep?.awaiting, 'spouse');
    equal(couple.rep?.approvals, 'couple');
    equal(couple.samples.find(s => s.key === 'rep_client_approval')?.required, true);
    equal(v.build({ moment: 'sign', persona: 'couple' }).rep?.status, 'pending_signature');
    equal(v.build({ moment: 'spouse', persona: 'couple' }).rep?.spousePending, true);
  }),

  test('אישור הייצוג באזור האישי · מצב (ממתין / אחרי «אישרתי» / הושלם) × לקוח / זוג × זירוז / חובה — מחוברים לשרת', () => {
    const v = viewOf({ kind: 'system', stepType: 'rep_client_approval', name: 'אישור' });
    deepEqual(v.axes({}).map(a => a.key), ['state', 'persona', 'approval']);
    deepEqual(v.axes({})[0].options.map(o => o.key), ['waiting', 'declared', 'done']);
    const declared = v.build({ state: 'declared', persona: 'couple', approval: 'required' });
    equal(declared.samples[0].patch?.clientDeclaredAt, '2026-10-05T10:00:00Z');
    equal(declared.samples[0].required, true);
    equal(declared.persona?.couple, true);
    equal(declared.rep?.approvals, 'couple');
    equal(declared.rep?.awaiting, 'spouse');
    const single = v.build({ state: 'waiting', persona: 'single', approval: 'optional' });
    equal(single.samples[0].required, false);
    equal(single.rep?.awaiting, undefined);
    equal(v.build({ state: 'done' }).samples[0].status, 'completed');
  }),

  test('סוגי מערכת עם מצבים משלהם: הרשאת תשלום (4), פרטי עסק (4), חיבור פייפרלס (חשבון), הרשמה (חשבון), בקשת ייצוג (רגע × אדם)', () => {
    const ret = viewOf({ kind: 'system', stepType: 'retainer_authorization', name: 'ה' });
    deepEqual(ret.axes({})[0].options.map(o => o.key), ['before', 'card', 'entered', 'done']);
    equal(ret.build({ state: 'card' }).samples[0].patch?.authorizationCreatedAt, '2026-10-01');
    equal(ret.build({ state: 'entered' }).samples[0].patch?.cardEnteredAt, '2026-10-01');
    const conn = viewOf({ kind: 'system', stepType: 'paperless_connection', name: 'ח' });
    equal(conn.build({ state: 'waiting', account: 'otherrep' }).samples[0].patch?.paperlessStatus, 'other_rep');
    const inv = viewOf({ kind: 'system', stepType: 'paperless_invite', name: 'ה' });
    equal(inv.build({ state: 'waiting', account: 'self' }).samples[0].inputs?.paperlessStatus, 'self');
    const rep = viewOf({ kind: 'system', stepType: 'representation', name: 'ב' });
    equal(rep.build({ moment: 'filed', persona: 'couple' }).rep?.status, 'awaiting_authorities');
    equal(rep.build({ moment: 'active', persona: 'single' }).samples[0].status, 'completed');
    const bd = viewOf({ kind: 'system', stepType: 'business_details', name: 'פ' });
    equal(bd.build({ state: 'review' }).samples[0].ball, 'me');
  }),

  test('קבוצות · העברת טיפול: «פרטים ידועים» הופך ל-prevKnown', () => {
    const v = viewOf({ kind: 'group', group: 'prevAccountant', name: 'רו״ח קודם' });
    equal(v.build({ moment: 'start', details: 'known' }).persona?.prevKnown, true);
    equal(v.build({ moment: 'start', details: 'missing' }).persona?.prevKnown, false);
  }),

  test('נוסחים מהספרייה · משימה של המשרד ללא צירים ומסומנת «לא מופיע»; הודעה — ללא צירים', () => {
    const internal = viewOf(targetOfTemplate(free({ title: 'פנימית' }, 'me')));
    equal(internal.meta.clientSees, 'nothing');
    equal(internal.axes({}).length, 0);
    const msg = viewOf(targetOfTemplate(free({ title: 'הודעה', messageOnly: true, message: 'x' })));
    equal(msg.axes({}).length, 0);
  }),

  test('נוסחים מהספרייה · «התקבל חלק» רק כשיש יותר מפריט אחד; אישור אישי ⇒ ציר «לקוח / זוג» והסבר', () => {
    const one = viewOf(targetOfTemplate(free({ requirements: [{ key: 'a', kind: 'text', label: 'א' }] })));
    assert(!one.axes({})[0].options.some(o => o.key === 'partial'), 'פריט אחד — אין «התקבל חלק»');
    const many = viewOf(targetOfTemplate(free({ requirements: [{ key: 'a', kind: 'confirm', label: 'א' }, { key: 'b', kind: 'file', label: 'ב' }] })));
    assert(many.axes({})[0].options.some(o => o.key === 'partial'), 'יותר מפריט אחד — יש «התקבל חלק»');
    assert(many.axes({}).some(a => a.key === 'persona'), 'אישור אישי ⇒ ציר זוג');
    assert(many.notes({ persona: 'couple' }).length === 1 && many.notes({ persona: 'single' }).length === 0, 'ההסבר על בן/בת הזוג — רק בזוג');
    equal(many.build({ persona: 'couple' }).persona?.couple, true);
  }),

  test('נוסחים מהספרייה · «מסמכים מהלקוח»: ציר «איפה נפתחת» — במסלול שנתי repeatable', () => {
    const t = tpl({ entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist: [{ key: 'a', label: 'א' }, { key: 'b', label: 'ב' }] } }], seedKey: 'client_documents', officeId: null });
    const v = viewOf(targetOfTemplate(t));
    equal(v.build({ flow: 'annual' }).samples[0].repeatable, true);
    equal(v.build({ flow: 'intake' }).samples[0].repeatable, false);
  }),

  test('מסמך · «נפתח» = markDone 1; «עברתי עליו» = הושלם', () => {
    const v = viewOf({ kind: 'doc', docId: 'd1', name: 'מסמך' });
    equal(v.build({ state: 'opened' }).samples[0].markDone, 1);
    equal(v.build({ state: 'done' }).samples[0].status, 'completed');
    deepEqual(v.build({ state: 'new' }).samples[0].ref, { kind: 'document', docId: 'd1' });
  }),

  test('עובדות על נוסח: templateFacts', () => {
    const f = templateFacts(free({ clientLinkUrl: 'https://x.test', requirements: [{ key: 'a', kind: 'confirm', label: 'א' }] }));
    equal(f.hasResource, true);
    equal(f.hasConfirm, true);
    equal(f.internal, false);
    equal(templateFacts(free({ title: 'פנימית' }, 'me')).internal, true);
  }),

  test('כתובת · הלוך-חזור לכל סוג יעד, כולל בחירה', () => {
    const sources = {
      templates: [tpl({ id: 'abc', entries: [{ stepType: 'custom_request', owner: 'client', payload: {} }] })],
      docs: [{ id: 'doc9', label: 'מסמך' }], systemName: (s: string) => s, groupTitle: (g: string) => g, catalogName: (c: string) => c,
    };
    const cases: [PreviewTarget, string][] = [
      [targetOfTemplate(sources.templates[0]), 'view:template:abc'],
      [{ kind: 'system', stepType: 'intake_questionnaire', name: 'x' }, 'view:system:intake_questionnaire'],
      [{ kind: 'group', group: 'paperless', name: 'x' }, 'view:group:paperless'],
      [{ kind: 'doc', docId: 'doc9', name: 'מסמך' }, 'view:doc:doc9'],
      [{ kind: 'catalog', type: 'bank_debit', name: 'x' }, 'view:catalog:bank_debit'],
    ];
    for (const [target, focus] of cases) {
      equal(targetToFocus(target), focus);
      const back = resolveFocus(parseViewFocus(focus)!, sources);
      assert(back && targetKey(back) === targetKey(target), `${focus}: לא חזר לאותו יעד`);
    }
    equal(targetToFocus({ kind: 'draft', name: 'x', stepType: 'custom_request', owner: 'client', payload: {} }), null, 'טיוטה לא בכתובת');
    const withSel = targetToFocus(cases[2][0], { moment: 'setup', account: 'self' })!;
    equal(withSel, 'view:group:paperless@moment-setup.account-self');
    deepEqual(parseViewFocus(withSel)?.selection, { moment: 'setup', account: 'self' });
    equal(parseViewFocus('view:bogus:x'), null);
    equal(parseViewFocus('request:abc'), null);
    equal(resolveFocus(parseViewFocus('view:template:gone')!, sources), null, 'נמחק מהספרייה ⇒ null (המסך אומר זאת)');
    equal(resolveFocus(parseViewFocus('view:group:nope')!, sources), null);
    deepEqual(selectionFromText(selectionToText({ a: 'b', 'bad key': 'x' })), { a: 'b' });
  }),

  test('מפתח בקשה יציב — סדר המפתחות לא משנה (ההדגמה נלכדת לפיו)', () => {
    equal(requestKey({ samples: [{ key: 'a', status: 'pending', ref: { kind: 'system', stepType: 'x' } }], persona: { couple: true } }),
      requestKey({ persona: { couple: true }, samples: [{ ref: { stepType: 'x', kind: 'system' }, status: 'pending', key: 'a' }] }));
  }),
];
