// ─── בדיקות: «תביעת מילואים» — הנוסח בשרת (221) והמסד המדומה שמחקה אותו ────────
// ‼ מה נעול כאן:
//   · הנוסח המוכן בהדגמה (RESERVE_DUTY_PAYLOAD) זהה מילה במילה לנוסח ב-supabase/221-reserve-duty-claim.sql —
//     בלי זה ההדגמה והבדיקות מראות נוסח שלא קיים בייצור.
//   · הנוסח: בלי clientLinkUrl (היה הופך אותה לחומר עזר שנסגר בפתיחה), בלי פסיקים בתשובות (הקומפוזר
//     מפצל לפי פסיק), שאלה אחת מסוג בחירה.
//   · הכרטיס בדף כמו ש-build_client_portal שולח אותו (kind='custom', photoGuide מפתח בלבד, הסבר, דרישות),
//     והתשובה כמו portal_submit_step (208): ערך מהאפשרויות ⇒ הושלם; אחר ⇒ bad_choice; שליחה שנייה ⇒ noop.
//   · «הושלמו» במשרד מציג את מה שהלקוח ענה (requestAnswers).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  RESERVE_DUTY_SEED_KEY, reserveDutyPayload, reserveDutyTemplateRow, reserveDutyPortalItem, reserveDutySubmit,
} from '../__fakeReserveDuty';
import { requestAnswers } from '../../../utils/requestPresentation';

type Row = Record<string, unknown>;
const SQL = readFileSync(join(process.cwd(), 'supabase/221-reserve-duty-claim.sql'), 'utf8').replace(/\r\n/g, '\n');

/** כל מחרוזות ה-SQL הרגילות ('…', '' = גרש) בטקסט, בלי הערות. */
function sqlStrings(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '-' && text[i + 1] === '-') { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl + 1; continue; }
    if (text[i] !== "'") { i++; continue; }
    i++;
    let v = '';
    while (i < text.length) {
      if (text[i] === "'") { if (text[i + 1] === "'") { v += "'"; i += 2; continue; } i++; break; }
      v += text[i++];
    }
    out.push(v);
  }
  return out;
}

/** אזור ההוספה של הנוסח המוכן בקובץ (בין «1 · הנוסח המוכן» ל«2 · הדף האישי»). */
const insertRegion = SQL.slice(SQL.indexOf('insert into public.journey_templates'), SQL.indexOf('-- ── 2 · הדף האישי'));
const lits = sqlStrings(insertRegion);

const RESERVE_DUTY_PAYLOAD = reserveDutyPayload();
const RESERVE_DUTY_TEMPLATE_ROW = reserveDutyTemplateRow();
const STEP = (extra: Row = {}): Row => ({
  id: 'd-reserve', step_type: 'custom_request', status: 'waiting_client', ball: 'client', published_at: '2026-10-03T00:00:00Z',
  payload: reserveDutyPayload(), completed_at: null, ...extra,
});
const OUTCOME = RESERVE_DUTY_PAYLOAD.requirements[0].options;

export const TESTS: TestCase[] = [
  test('הנוסח בהדגמה זהה מילה במילה לנוסח ב-221', () => {
    const p = RESERVE_DUTY_PAYLOAD;
    for (const s of [RESERVE_DUTY_SEED_KEY, RESERVE_DUTY_TEMPLATE_ROW.name as string, RESERVE_DUTY_TEMPLATE_ROW.description as string,
      p.title, p.clientTitle, p.clientSub, p.clientNote, p.clientNoteAfter, p.clientPhotoGuide, p.requirements[0].label, ...OUTCOME]) {
      assert(lits.includes(s), `חסר בנוסח של 221: «${s.slice(0, 60)}…»`);
    }
    // ושום מחרוזת ב-221 אינה סוטה: כל מחרוזת עברית בנוסח קיימת גם בהדגמה.
    const demo = new Set<string>([RESERVE_DUTY_TEMPLATE_ROW.name as string, RESERVE_DUTY_TEMPLATE_ROW.description as string,
      p.title, p.clientTitle, p.clientSub, p.clientNote, p.clientNoteAfter, p.clientPhotoGuide, p.requirements[0].label, ...OUTCOME]);
    for (const s of lits.filter(x => /[א-ת]/.test(x))) assert(demo.has(s), `ב-221 ולא בהדגמה: «${s.slice(0, 60)}…»`);
  }),

  test('הנוסח: אין clientLinkUrl ואין clientCta, בלי פסיקים בתשובות, שאלה אחת מסוג בחירה', () => {
    assert(!lits.includes('clientLinkUrl') && !lits.includes('clientCta'), '221: לא clientLinkUrl');
    assert(!('clientLinkUrl' in RESERVE_DUTY_PAYLOAD) && !('clientCta' in RESERVE_DUTY_PAYLOAD), 'הדמו: לא clientLinkUrl');
    for (const o of OUTCOME) assert(!o.includes(','), `פסיק בתשובה: ${o}`);
    equal(OUTCOME.length, 4);
    // ‼ ארבע התשובות: מופיעות / חסרה והגשתי / המערכת לא אפשרה — «צור קשר» (גיא, 05.10) / שכיר ועצמאי — 502.
    deepEqual(OUTCOME, [
      'כל תקופות המילואים מופיעות - לא היה צריך להגיש',
      'חסרה תקופה - הגשתי עליה תביעה',
      'המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»',
      'עבדתי גם כשכיר/ה - הגשתי בטופס 502',
    ]);
    // רשימת הבחירה בדף האישי (עד חמש תשובות) — ארבע עוברות כרשימה גלויה.
    assert(OUTCOME.length <= 5, 'עד חמש תשובות — רשימה גלויה');
    equal(RESERVE_DUTY_PAYLOAD.requirements.length, 1);
    equal(RESERVE_DUTY_PAYLOAD.requirements[0].kind, 'select');
    equal(RESERVE_DUTY_PAYLOAD.requirements[0].done, false);
    assert(!('required' in RESERVE_DUTY_PAYLOAD.requirements[0]), 'חובה כברירת מחדל (בלי required)');
    const row = RESERVE_DUTY_TEMPLATE_ROW;
    equal(row.office_id, null, 'מובנית');
    equal(row.seed_key, 'reserve_duty_claim');
    const e = (row.entries as Row[])[0];
    equal(e.stepType, 'custom_request');
    equal(e.owner, 'client');
    equal(e.requiredForClose, false);
  }),

  test('221 מחבר: מובנית (office_id ריק), אידמפוטנטית, ובלי נגיעה בשאר הפונקציות', () => {
    assert(/where not exists \(select 1 from public\.journey_templates\s+where seed_key = 'reserve_duty_claim' and office_id is null\)/.test(insertRegion), 'לא מוסיף פעמיים');
    assert(/select null, null, 'request', 'reserve_duty_claim'/.test(insertRegion), 'user_id ו-office_id ריקים, kind=request');
    const defs = [...SQL.matchAll(/create\s+or\s+replace\s+function\s+(public\.\w+)/gi)].map(m => m[1]);
    deepEqual(defs, ['public.build_client_portal'], 'הפונקציה היחידה שמוחלפת');
    assert(/revoke all on function public\.build_client_portal\(text, text\) from public, anon, authenticated;/.test(SQL), 'ההרשאות נסגרות אחרי ההגדרה');
    assert(/select public\.assert_domain_function_invariants\(\);\s*$/.test(SQL), 'אימות בסוף הקובץ');
    assert(/'photoGuide', nullif\(s\.payload->>'clientPhotoGuide',''\),/.test(SQL), 'השדה החדש');
    equal(SQL.split("'photoGuide'").length - 1, 1, 'פעם אחת בלבד');
  }),

  test('הכרטיס בדף: kind=custom, מפתח מדריך, הסבר, דרישות — בלי linkUrl', () => {
    const item = reserveDutyPortalItem(STEP(), 'תביעת מילואים בביטוח לאומי')!;
    equal(item.bucket, 'action');
    equal(item.kind, 'custom');
    equal(item.key, 'custom_d-reserve');
    equal(item.actionKind, 'portal');
    equal(item.actionValue, 'd-reserve');
    equal(item.photoGuide, 'reserve_duty_claim');
    equal(item.note, RESERVE_DUTY_PAYLOAD.clientNote);
    equal(item.noteAfter, RESERVE_DUTY_PAYLOAD.clientNoteAfter);
    equal(item.sub, RESERVE_DUTY_PAYLOAD.clientSub);
    assert(!('linkUrl' in item) && !('resourceUrl' in item), '‼ אין linkUrl');
    const reqs = item.requirements as Row[];
    equal(reqs.length, 1);
    equal(reqs[0].kind, 'select');
    deepEqual(reqs[0].options, OUTCOME);
    equal(reqs[0].done, false);
    equal(reqs[0].required, true);
    // בלי מפתח — אין שדה (פלט זהה לקודם); בקשה בלי דרישות — לא נוגעים (נשארת כמו היום).
    const plain = reserveDutyPortalItem(STEP({ payload: { title: 'x', requirements: [{ key: 'r', kind: 'confirm', label: 'קראתי', done: false }] } }), 'x')!;
    assert(!('photoGuide' in plain), 'בלי מדריך — בלי שדה');
    equal(reserveDutyPortalItem(STEP({ payload: { title: 'x' } }), 'x'), null);
    equal(reserveDutyPortalItem(STEP({ step_type: 'client_documents' }), 'x'), null);
  }),

  test('תשובה: ערך מהאפשרויות ⇒ הושלם, ball=me, הערך נשמר; אחר ⇒ bad_choice; שנייה ⇒ noop', () => {
    const s = STEP();
    deepEqual(reserveDutySubmit(s, { key: 'outcome', value: 'לא קיימת' }), { ok: false, error: 'bad_choice' });
    deepEqual(reserveDutySubmit(s, { key: 'outcome' }), { ok: false, error: 'missing_value' });
    deepEqual(reserveDutySubmit(s, { key: 'nope', value: OUTCOME[0] }), { ok: false, error: 'requirement_not_found' });
    deepEqual(reserveDutySubmit(s, {}), { ok: false, error: 'missing_key' });
    equal(s.status, 'waiting_client', 'שגיאה לא משנה כלום');
    deepEqual(reserveDutySubmit(s, { key: 'outcome', value: OUTCOME[1] }), { ok: true, remaining: 0, completed: true });
    equal(s.status, 'completed');
    equal(s.ball, 'me');
    assert(typeof s.completed_at === 'string' && s.completed_at !== '', 'completed_at');
    const r0 = ((s.payload as Row).requirements as Row[])[0];
    equal(r0.done, true);
    equal(r0.value, OUTCOME[1]);
    deepEqual(reserveDutySubmit(s, { key: 'outcome', value: OUTCOME[0] }), { ok: true, noop: true });
    equal(((s.payload as Row).requirements as Row[])[0].value, OUTCOME[1], 'התשובה לא נדרסת');
    // אחרי ההשלמה — «הושלם» בדף, בלי פקד ובלי מדריך.
    const done = reserveDutyPortalItem(s, 'x')!;
    equal(done.bucket, 'done');
    assert(!('actionKind' in done) && !('photoGuide' in done), 'הושלם: בלי פקד ובלי מדריך');
  }),

  test('«הושלמו» במשרד: מה שהלקוח ענה — התשובה בלבד לבחירה יחידה, «שאלה: תשובה» בשאר', () => {
    deepEqual(requestAnswers([{ label: 'מה מצאתם באזור האישי?', kind: 'select', value: OUTCOME[1] }]), [OUTCOME[1]]);
    deepEqual(requestAnswers([{ label: 'מספר תיק', kind: 'text', value: '12345' }]), ['מספר תיק: 12345']);
    deepEqual(requestAnswers([
      { label: 'מה מצאתם?', kind: 'select', value: 'א' }, { label: 'הערות', kind: 'text', value: 'ב' }, { label: 'קובץ', kind: 'file' },
    ]), ['מה מצאתם?: א', 'הערות: ב']);
    deepEqual(requestAnswers([{ label: 'קראתי', kind: 'confirm' }]), []);
    deepEqual(requestAnswers([{ label: 'קובץ', kind: 'file', value: '' }, { label: 'x', kind: 'text', value: '   ' }]), []);
    deepEqual(requestAnswers([]), []);
    deepEqual(requestAnswers(null), []);
    deepEqual(requestAnswers(undefined), []);
    deepEqual(requestAnswers('x' as unknown as []), []);
    deepEqual(requestAnswers([{ kind: 'text', value: 'ללא תווית' }]), ['ללא תווית']);
  }),
];
