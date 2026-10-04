// ─── בדיקות: «אוטומציות» כרשימה אחת (סבב 4) ─────────────────────────────────
// ‼ מה נעול כאן:
//   · שורה לכל מנגנון — מסלול ארוך לא מאריך את הרשימה; השלבים בפתיחה.
//   · «רק בדף» אינו מוצג כתזכורת (אין מייל, ולכן אין תזכורת — 214).
//   · מסלול בארכיון אינו «קורה לבד».
//   · «מה מפעיל» של קריאה מול רשות אומר גם מתי היא רצה לבד במסלול.
//   · «תוצאה אחרונה» של מייל אוטומטי — רק מיילים שיצאו לבד (meta.origin), לא לחיצה.
//   · מייל שלא הגיע אינו «נשלח».

import { test, equal, deepEqual, includes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { OfficeFlow, FlowStage } from '../../flows/types';
import type { EmailMessage } from '../../../types/emailActivity';
import { isInternalEmailKind } from '../../../types/emailActivity';
import { AUTOMATION_ACTIONS, FLOW_AUTO_GATES } from '../automationCatalog';
import {
  AUTO_GROUPS, FLOW_DONE_KIND, MECHANISM_ROW_IDS, automationRows, flowUses, stagesPhrase, actionTrigger, emailsFor, emailResult, onboardingEffect,
  needsAttention, resolveAutomationFocus, noticeEvent, rowEvents, raisesAttention, jobEvent, intakeMoments, intakeCountText,
  repRemindersState, expiryState, attentionEvents, type NoticeRow, type RowEvent,
  INTAKE_ON_FIRST_APPROVAL, afterFirstSentence, intakeStageMeta, flowWaits, flowDefKey, waitEvent, type WaitRun, type WaitJob,
} from '../automationList';
import { AUTO_MAIL_RECORDED, DELIVERY_LABELS } from '../../flows/types';

const stage = (key: string, p: Partial<FlowStage> = {}): FlowStage => ({
  key, name: `שלב ${key}`, opens: { after: 'start' }, delivery: 'approve', reminder: null, notifyOffice: false, items: [], ...p,
});
const flow = (id: string, stages: FlowStage[], p: Partial<OfficeFlow> = {}): OfficeFlow => ({
  id, name: `מסלול ${id}`, trigger: 'annual', status: 'active', currentVersion: 1, definition: { stages }, ...p,
});

const input = (flows: OfficeFlow[] | null) => ({
  flows, expiryOn: false, repOn: 1, repTotal: 4, firmOn: 9, firmTotal: 13, officeEmail: 'office@x.co.il', actions: AUTOMATION_ACTIONS,
});

const mail = (p: Partial<EmailMessage>): EmailMessage => ({
  id: Math.random().toString(36).slice(2), toEmail: 'a@b.co', status: 'sent', sentAt: '2026-10-01T10:00:00Z', ...p,
});

export const TESTS: TestCase[] = [
  test('ארבע קבוצות, ושורה לכל מנגנון — לא לכל שלב', () => {
    deepEqual(AUTO_GROUPS.map(g => g.id), ['client', 'office', 'card', 'authority']);
    const long = flow('big', Array.from({ length: 12 }, (_, i) => stage(`s${i}`, { delivery: 'auto', reminder: { afterDays: 3, max: 2 }, notifyOffice: true })));
    const short = automationRows(input([flow('a', [stage('x')])]));
    const big = automationRows(input([long]));
    equal(big.length, short.length, 'מסלול ארוך לא מאריך את הרשימה');
    const m = big.find(r => r.id === 'flow-mail')!;
    equal(m.uses!.length, 12);
    equal(m.trigger, 'כשנפתח אחד מ-12 שלבים במסלול «מסלול big»');
    equal(m.state.label, 'ב-12 שלבים');
  }),

  test('כל שורה עם «מה מפעיל», «מה קורה» ומקור לתוצאה; מזהים ייחודיים', () => {
    const rows = automationRows(input([]));
    equal(new Set(rows.map(r => r.id)).size, rows.length);
    for (const r of rows) {
      equal(r.trigger.length > 5, true, `${r.id} trigger`);
      equal(r.effect.length > 5, true, `${r.id} effect`);
    }
    // מע״מ — עדיין אין פעולה; לא שורה ברשימה
    equal(rows.some(r => r.id === 'vat-read'), false);
    equal(rows.filter(r => r.group === 'authority').length, AUTOMATION_ACTIONS.filter(a => a.actionType).length);
  }),

  test('«רק בדף» — בלי תזכורת; מסלול בארכיון — לא קורה לבד', () => {
    const u = flowUses([
      flow('a', [stage('p', { delivery: 'page', reminder: { afterDays: 5, max: 2 } }), stage('r', { reminder: { afterDays: 7, max: 1 } })]),
      flow('z', [stage('q', { delivery: 'auto', notifyOffice: true })], { status: 'archived' }),
    ]);
    deepEqual(u.reminders.map(s => s.stageKey), ['r']);
    equal(u.reminders[0].detail, 'אחרי 7 ימים, עד פעם אחת');
    equal(u.autoMail.length, 0);
    equal(u.notify.length, 0);
  }),

  test('תזכורת בשלב אחד — «מה מפעיל» אומר מתי ובאיזה שלב', () => {
    const rows = automationRows(input([flow('a', [stage('r', { name: 'איסוף מסמכים', reminder: { afterDays: 7, max: 3 } })])]));
    equal(rows.find(r => r.id === 'flow-reminder')!.trigger, 'אחרי 7 ימים, עד 3 פעמים — בשלב «איסוף מסמכים»');
  }),

  test('לפני שהמסלולים נטענו — לא אומרים «לא בשימוש»', () => {
    const rows = automationRows(input(null));
    const m = rows.find(r => r.id === 'flow-mail')!;
    equal(m.state.label, '…');
    equal(m.trigger.includes('טוען'), true);
    equal(rows.find(r => r.id === 'intake')!.state.label, '…');
  }),

  test('קריאה מול רשות: «מה מפעיל» כולל את השלב שבו היא רצה לבד', () => {
    const btl = AUTOMATION_ACTIONS.find(a => a.id === 'btl-sync')!;
    const f = flow('ann', [stage('a1', { name: 'איסוף', items: [{ key: 'b', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' }, mode: 'auto' }] })]);
    const uses = flowUses([f]).actions['btl.sync_file'];
    equal(uses.length, 1);
    equal(uses[0].auto, true);
    equal(actionTrigger(btl, uses), 'בלחיצה, בלשונית «תיק מס» של הלקוח · כשנפתח «איסוף» — לבד, כשאפשר');
    equal(uses[0].detail, 'לבד, כשאפשר', 'אותה מילה כמו בבונה — «לבד» אינו מובטח');
    equal(actionTrigger(btl, [...uses, { ...uses[0], stageKey: 'a2', stageName: 'סגירה' }]), 'בלחיצה, בלשונית «תיק מס» של הלקוח · כשנפתח אחד מ-2 שלבים במסלולים — לבד, כשאפשר');
    // בלחיצה בלבד במסלול — לא נאמר «לבד»
    const manual = flowUses([flow('m', [stage('m1', { items: [{ key: 'b', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' }, mode: 'manual' }] })])]);
    equal(actionTrigger(btl, manual.actions['btl.sync_file']), btl.trigger);
    const row = automationRows(input([f])).find(r => r.id === 'btl-sync')!;
    equal(row.uses!.length, 1);
    equal(row.state.label, 'קורא בלבד');
    equal(FLOW_AUTO_GATES.length >= 4, true, 'השערים מוסברים במילים');
  }),

  test('שלבים בכמה מסלולים — נספרים במילים', () => {
    const uses = flowUses([flow('a', [stage('1', { delivery: 'auto' })]), flow('b', [stage('2', { delivery: 'auto' })])]).autoMail;
    equal(stagesPhrase(uses, 'כשנפתח'), 'כשנפתח אחד מ-2 שלבים ב-2 מסלולים');
  }),

  test('אין אימייל למשרד — ההודעות אליך מסומנות, לא «פעילות»', () => {
    const rows = automationRows({ ...input([flow('a', [stage('1', { notifyOffice: true })])]), officeEmail: '' });
    equal(rows.find(r => r.id === 'notifications')!.state.tone, 'warn');
    equal(rows.find(r => r.id === 'flow-notify')!.state.tone, 'warn');
    equal(rows.find(r => r.id === 'notifications')!.effect.includes('לא נשלחת'), true);
  }),

  test('מסלול הקליטה: מה נפתח ואיך מגיע', () => {
    const onb = flow('onb', [
      stage('s1', { delivery: 'hold', items: [
        { key: 'a', ref: { kind: 'system', stepType: 'client_documents' } },
        { key: 'b', ref: { kind: 'template', templateId: 't' } },
        { key: 'c', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' } },
      ] }),
    ], { trigger: 'quote_approved', name: 'קליטת לקוח חדש' });
    // ‼ בלי מספר מצטבר — ענפים לפי סוג אינם נפתחים יחד; «איך מגיע» — לכל שלב בפתיחה.
    equal(onboardingEffect(onb), 'נפתחות בקשות בכרטיס הלקוח');
    const branched = flow('b', [stage('s1', { items: [{ key: 'p', ref: { kind: 'system', stepType: 'prev_accountant_details' } }] })], { trigger: 'quote_approved' });
    equal(onboardingEffect(branched), 'נפתחות בקשות בכרטיס הלקוח — לפי סוג הלקוח ומה שבהצעה', 'רו״ח קודם — רק כשיש');
    equal(/\d/.test(onboardingEffect(branched)), false);
    const row = automationRows(input([onb])).find(r => r.id === 'intake')!;
    equal(row.name, 'קליטת לקוח חדש');
    deepEqual(row.source, { type: 'runs', flowId: 'onb' });
    // ‼ משרד חדש: נוצר באישור הראשון (216) — מצב ניטרלי, לא «צריך אותך».
    const fresh = automationRows(input([])).find(r => r.id === 'intake')!;
    deepEqual(fresh.state, { label: 'ייווצר באישור הראשון', tone: 'manual' });
    equal(fresh.effect, INTAKE_ON_FIRST_APPROVAL);
    deepEqual(fresh.source, { type: 'none', text: 'עוד לא נפתח לאף לקוח' });
  }),

  test('מייל אוטומטי — רק מה שיצא לבד; הודעות אליך — רק פנימיות', () => {
    const msgs = [
      mail({ id: 'm1', kind: 'process_open', meta: { origin: 'manual' }, sentAt: '2026-10-02T10:00:00Z' }),
      mail({ id: 'm2', kind: 'process_open', meta: { origin: 'auto' }, sentAt: '2026-10-01T10:00:00Z' }),
      mail({ id: 'm3', kind: 'documents_sent', meta: { origin: 'auto' }, sentAt: '2026-10-03T10:00:00Z' }),
      mail({ id: 'm4', kind: 'notify_poa_signed' }),
      mail({ id: 'm5', kind: 'weekly_backup' }),
    ];
    deepEqual(emailsFor(msgs, { kinds: ['process_open', 'documents_sent'], origin: 'auto' }, isInternalEmailKind).map(m => m.id), ['m3', 'm2']);
    const internal = emailsFor(msgs, { internal: true }, isInternalEmailKind).map(m => m.id);
    includes(internal, 'm4');
    includes(internal, 'm5');
    equal(internal.includes('m1'), false);
    equal(emailsFor(msgs, {}, isInternalEmailKind).length, 0, 'בלי סינון — אין ראיה');
  }),

  test('«הודעות אליך» לא סופרת «שלב הושלם» — יש לו שורה משלו', () => {
    const rows = automationRows(input([]));
    const notif = rows.find(r => r.id === 'notifications')!;
    const done = rows.find(r => r.id === 'flow-notify')!;
    const msgs = [mail({ id: 'd', kind: FLOW_DONE_KIND }), mail({ id: 'q', kind: 'notify_quotation_approved' })];
    if (notif.source.type !== 'emails' || done.source.type !== 'emails') throw new Error('source');
    deepEqual(emailsFor(msgs, notif.source.mail, isInternalEmailKind).map(m => m.id), ['q']);
    deepEqual(emailsFor(msgs, done.source.mail, isInternalEmailKind).map(m => m.id), ['d']);
  }),

  test('מייל לגורם חיצוני — רק מה שיצא לבד (מפתח auto:step:), לא תזכורת ידנית', () => {
    const row = automationRows(input([])).find(r => r.id === 'auto-request')!;
    if (row.source.type !== 'emails') throw new Error('source');
    const msgs = [
      mail({ id: 'a', kind: 'step_reminder', idempotencyKey: 'auto:step:s1' } as Partial<EmailMessage>),
      mail({ id: 'b', kind: 'step_reminder' }),
    ];
    deepEqual(emailsFor(msgs, row.source.mail, isInternalEmailKind).map(m => m.id), ['a']);
  }),

  test('הודעה ללקוח: מתוזמנת, דולגה, לא ידוע — במילים, לא «עוד לא יצא»', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    const n = (p: Partial<NoticeRow>): NoticeRow => ({ id: 'n1', clientId: 'c1', kind: 'new', status: 'queued', createdAt: '2026-10-03T09:59:00Z', ...p });
    const q = noticeEvent(n({ dueAt: '2026-10-03T10:02:00Z' }), now);
    equal(q.label.startsWith('מתוזמן ל-'), true);
    equal(q.timeInLabel, true);
    equal(q.tone, 'live');
    equal(noticeEvent(n({ dueAt: '2026-10-03T09:00:00Z' }), now).tone, 'warn', 'איחר — לא מבטיחים שעה שעברה');
    const skipped = noticeEvent(n({ status: 'skipped', reason: 'no_email' }), now);
    equal(skipped.label, 'לא נשלח — אין ללקוח כתובת מייל');
    equal(raisesAttention(skipped, { on: true, now }), false, 'אין כתובת — מוצג, לא «צריך אותך»');
    const unknown = noticeEvent(n({ status: 'unknown', updatedAt: '2026-09-01T10:00:00Z' }), now);
    equal(unknown.tone, 'warn');
    equal(raisesAttention(unknown, { on: false, now }), true, 'לא ידוע — חוסם הודעות הבאות; תמיד מול העיניים');
    const failed = noticeEvent(n({ status: 'failed', updatedAt: '2026-10-02T10:00:00Z' }), now);
    equal(failed.tone, 'bad');
    equal(raisesAttention(failed, { on: true, now }), true);
    equal(noticeEvent(n({ status: 'failed', reason: 'office_marked_not_sent' }), now).tone, 'muted', 'הוכרע במשרד — לא כשל');
    equal(noticeEvent(n({ status: 'cancelled', reason: 'office_cancelled' }), now).label, 'עצרת אותו לפני שיצא');
    equal(noticeEvent(n({ status: 'skipped', reason: 'code_we_do_not_know' }), now).label, 'לא נשלח', 'קוד לא מוכר — בלי אנגלית');
  }),

  test('הודעה ומייל של אותה שליחה הם אירוע אחד; המצב מהיומן (נמסר/לא הגיע)', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    const notice: NoticeRow = { id: 'n1', clientId: 'c1', kind: 'new', status: 'sent', createdAt: '2026-10-03T09:00:00Z', sentAt: '2026-10-03T09:02:00Z', emailMessageId: 'm1' };
    const evs = rowEvents([
      mail({ id: 'm1', kind: 'process_open', status: 'bounced', sentAt: '2026-10-03T09:02:00Z', meta: { origin: 'auto', noticeId: 'n1' } }),
      mail({ id: 'm0', kind: 'process_open', status: 'delivered', sentAt: '2026-10-01T09:02:00Z', meta: { origin: 'auto', noticeId: 'old' } }),
    ], [notice, { id: 'n2', clientId: 'c2', kind: 'new', status: 'queued', createdAt: '2026-10-03T09:59:00Z', dueAt: '2026-10-03T10:01:00Z' }], now);
    equal(evs.length, 3);
    equal(evs[0].id, 'n:n2', 'המתוזמן קודם — זה הדבר הבא שיקרה');
    equal(evs[1].label, 'לא הגיע — הכתובת דחתה');
    equal(evs[1].email?.id, 'm1');
    equal(evs[2].id, 'm:m0');
  }),

  test('«צריך אותך»: רק אחרון, מהשבוע, ובמנגנון שפועל', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    const bad = { tone: 'bad' as const, at: '2026-10-02T10:00:00Z' };
    equal(raisesAttention(bad, { on: true, now }), true);
    equal(raisesAttention(bad, { on: false, now }), false, 'תזכורת כבויה — אין מה לעשות עם כשל ישן שלה');
    equal(raisesAttention({ ...bad, at: '2026-09-20T10:00:00Z' }, { on: true, now }), false, 'ישן משבוע');
    equal(raisesAttention({ tone: 'ok', at: bad.at }, { on: true, now }), false);
    const stale = jobEvent({ id: 'j', userId: 'u', clientId: 'c', actionType: 'shaam.create_representation', input: {}, status: 'needs_human',
      attempts: 1, maxAttempts: 1, artifacts: [], errorCode: 'external_outcome_unknown', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' });
    equal(raisesAttention(stale, { on: true, now }), true, 'לא ידוע אם נקלט — גם כשישן');
  }),

  test('«צריך אותך» משורה: «לא ידוע» פעם אחת ללקוח; ריצה מאוחרת יותר של אותו לקוח סוגרת אותו', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    const ev = (id: string, clientId: string, p: Partial<RowEvent> = {}): RowEvent => ({ id, clientId, tone: 'muted', label: id, at: '2026-10-01T10:00:00Z', ...p });
    const unknownJob = (id: string, c: string) => ev(`j:${id}`, c, { tone: 'warn', sticky: true });
    // לקוח א: שתי ריצות «לא ידוע» — אחת מוצגת. לקוח ב: «בוטלה» אחרי «לא ידוע» — סגור.
    const jobs = [ev('j:b2', 'b'), unknownJob('a2', 'a'), unknownJob('a1', 'a'), unknownJob('b1', 'b')];
    deepEqual(attentionEvents(jobs, { on: true, now }).map(e => e.id), ['j:a2']);
    // הודעה «לא ידוע» נשארת גם כשנרשם אחריה דילוג לאותו לקוח (unknown_pending).
    const notices = [ev('n:skip', 'a', { tone: 'warn', attention: false }), ev('n:unk', 'a', { tone: 'warn', sticky: true })];
    deepEqual(attentionEvents(notices, { on: true, now }).map(e => e.id), ['n:unk']);
    // כשל אחרון בשבוע האחרון — עולה; כשהמנגנון כבוי — לא.
    const fail = [ev('m:f', 'c', { tone: 'bad', at: '2026-10-02T10:00:00Z' })];
    equal(attentionEvents(fail, { on: true, now }).length, 1);
    equal(attentionEvents(fail, { on: false, now }).length, 0);
  }),

  test('מסלול הקליטה בפתיחה: רגעים לפי «נפתח אחרי», במקביל, ותנאי לכל שלב', () => {
    const onb = flow('onb', [
      stage('s1', { name: 'באישור', items: [
        { key: 'prev', ref: { kind: 'system', stepType: 'prev_accountant_details' } },
        { key: 'fee', ref: { kind: 'template', templateId: 't' }, snapshot: { stepType: 'custom_request', title: 'אישור שכר טרחה' } },
      ] }),
      stage('meet', { name: 'פגישה', opens: { after: 'item', item: 'fee' }, items: [{ key: 'm', ref: { kind: 'template', templateId: 'x' } }] }),
      stage('ex', { name: 'עוסק פטור', when: { kinds: ['exempt_dealer'] }, items: [{ key: 'e', ref: { kind: 'template', templateId: 'y' } }] }),
    ], { trigger: 'quote_approved', name: 'קליטה' });
    const ms = intakeMoments(onb);
    // ‼ נוסח «אחרי ש…» — של המפה (flowMoments, preview.ts); כאן רק שהרגע השני הוא אחרי הבקשה הנכונה.
    equal(ms.length, 2);
    equal(ms[0].label, 'באישור ההצעה');
    equal(ms[1].label.includes('«אישור שכר טרחה»') && ms[1].label.startsWith('אחרי ש'), true, ms[1].label);
    deepEqual(ms[0].stages.map(s => s.key), ['s1', 'ex'], 'שני שלבים באותו רגע — במקביל, לפי «נפתח», לא לפי המיקום');
    equal(ms[0].stages[1].condition, 'רק לעוסק פטור');
    equal(ms[0].stages[0].condition, null);
    equal(intakeCountText(ms[0].stages[0]), 'בקשה אחת · ועוד 1 לפי סוג הלקוח ומה שבהצעה');
    equal(intakeCountText({ always: 0, conditional: 0 }), 'בלי בקשות ללקוח');
  }),

  test('מצב התזכורות הקבועות — אותה מילה בשני העמודים', () => {
    deepEqual(repRemindersState(0, 4), { label: 'כבויות', tone: 'off' });
    deepEqual(repRemindersState(2, 4), { label: '2 מתוך 4 פעילות', tone: 'on' });
    deepEqual(expiryState(false), { label: 'כבויה', tone: 'off' });
    const rows = automationRows({ ...input([]), repOn: 0 });
    deepEqual(rows.find(r => r.id === 'rep-reminders')!.state, repRemindersState(0, 4));
  }),

  test('מייל שלא הגיע — לא «נשלח», ומבקש תשומת לב', () => {
    equal(emailResult({ status: 'bounced' }).tone, 'bad');
    equal(emailResult({ status: 'failed' }).label, 'השליחה נכשלה');
    equal(emailResult({ status: 'opened' }).tone, 'ok');
    equal(needsAttention(emailResult({ status: 'delivery_delayed' }).tone), true);
    equal(needsAttention('ok'), false);
  }),

  test('מסלולים שלא נטענו — «לא נטען», לא «לא בשימוש»', () => {
    const rows = automationRows({ ...input(null), flowsError: true });
    for (const id of ['flow-mail', 'flow-reminder', 'flow-notify', 'intake']) {
      const r = rows.find(x => x.id === id)!;
      equal(r.state.label, 'לא נטען', id);
      equal(r.state.tone, 'warn', id);
    }
    equal(rows.find(r => r.id === 'flow-mail')!.trigger.includes('לא נטענו'), true);
  }),

  test('כל שורה ניתנת לפתיחה מקישור; כתובות ישנות נוחתות על השורה הנכונה', () => {
    const rows = automationRows(input([]));
    const rowIds = [...MECHANISM_ROW_IDS, ...AUTOMATION_ACTIONS.filter(a => a.actionType).map(a => a.id)];
    for (const r of rows) includes(rowIds, r.id, r.id);
    const known = { rowIds, repAudiences: ['sign', 'niClient', 'niSpouse', 'portal'], notificationKinds: ['poa_signed', 'flow_stage_done'] };
    deepEqual(resolveAutomationFocus('reminders', known), { group: 'client' });
    deepEqual(resolveAutomationFocus('notifications', known), { row: 'notifications' });
    deepEqual(resolveAutomationFocus('rem-expiry', known), { row: 'expiry' });
    deepEqual(resolveAutomationFocus('rem-niSpouse', known), { row: 'rep-reminders', sub: 'niSpouse' });
    deepEqual(resolveAutomationFocus('rem-poa_signed', known), { row: 'notifications', sub: 'poa_signed' });
    deepEqual(resolveAutomationFocus('rem-flow_stage_done', known), { row: 'flow-notify' });
    deepEqual(resolveAutomationFocus('shaam-sync', known), { row: 'shaam-sync' });
    deepEqual(resolveAutomationFocus('onboarding', known), { row: 'intake' });
    deepEqual(resolveAutomationFocus('authority', known), { group: 'authority' });
    equal(resolveAutomationFocus('vat-read', known), null, 'מע״מ אינו שורה');
    equal(resolveAutomationFocus(null, known), null);
  }),
  // ── סבב תיקונים 4.10 ────────────────────────────────────────────────────

  test('«צריך אותך» לכל לקוח: כשל של מיכל לא נעלם כשדוד נכנס לתור (D1-3)', () => {
    const now = Date.parse('2026-10-03T10:00:00Z');
    const ev = (id: string, clientId: string | undefined, p: Partial<RowEvent> = {}): RowEvent => ({ id, clientId, tone: 'muted', label: id, at: '2026-10-03T09:00:00Z', ...p });
    // דוד נכנס לתור (חי) אחרי שהקריאה של מיכל נכשלה — הכשל שלה עדיין שלה.
    const evs = [ev('j:d', 'david', { tone: 'live' }), ev('j:m', 'michal', { tone: 'bad', at: '2026-10-03T04:00:00Z' })];
    deepEqual(attentionEvents(evs, { on: true, now }).map(e => e.id), ['j:m']);
    // ריצה מאוחרת יותר של מיכל עצמה — סוגרת.
    deepEqual(attentionEvents([ev('j:m2', 'michal', { tone: 'ok' }), ...evs], { on: true, now }).map(e => e.id), []);
    // תזכורת שחזרה ללקוח א' לא נעלמת מאחורי תזכורת מאוחרת ללקוח ב'.
    const mails = [ev('m:b', 'b', { tone: 'ok' }), ev('m:a', 'a', { tone: 'bad' })];
    deepEqual(attentionEvents(mails, { on: true, now }).map(e => e.id), ['m:a']);
    // הודעות אליך (בלי לקוח) — קבוצה אחת: רק האחרונה.
    const office = [ev('m:2', undefined, { tone: 'ok' }), ev('m:1', undefined, { tone: 'bad' })];
    deepEqual(attentionEvents(office, { on: true, now }).map(e => e.id), []);
    deepEqual(attentionEvents([...office].reverse(), { on: true, now }).map(e => e.id), ['m:1']);
  }),

  test('ריצה שממתינה להתחברות — הקישור הוא להתחברות, לא ללקוח (X-10)', () => {
    const base = { id: 'j', userId: 'u', clientId: 'c', input: {}, attempts: 1, maxAttempts: 1, artifacts: [], createdAt: '2026-10-03T09:00:00Z', updatedAt: '2026-10-03T09:00:00Z' };
    equal(jobEvent({ ...base, actionType: 'shaam.sync_income_tax_file', status: 'needs_human', errorCode: 'awaiting_gmf_auth' }).connect, 'shaam');
    equal(jobEvent({ ...base, actionType: 'btl.sync_file', status: 'needs_human', errorCode: 'awaiting_btl_auth' }).connect, 'btl');
    equal(jobEvent({ ...base, actionType: 'btl.sync_file', status: 'failed', errorCode: 'portal_timeout' }).connect, undefined);
  }),

  test('משרד חדש: «קליטת לקוח חדש» אינה ב«צריך אותך» ואינה טוענת «לא הוקם» (X-2)', () => {
    const fresh = automationRows(input([])).find(r => r.id === 'intake')!;
    equal(fresh.state.tone === 'warn', false);
    equal(/לא הוקם|לא נפתחת לבד/.test(`${fresh.effect} ${fresh.state.label}`), false);
    // עוד נטען — לא אומרים כלום על המשרד
    equal(automationRows(input(null)).find(r => r.id === 'intake')!.effect.includes('טוען'), true);
  }),

  test('מייל מרוכז: ברשימה המשפט הקצר; הפירוט — בפתיחה, בלי לחזור על הראשון (X-3)', () => {
    const row = automationRows(input([])).find(r => r.id === 'flow-mail')!;
    equal(row.effect, DELIVERY_LABELS.auto.long);
    // ‼ הפירוט (מה נרשם כנשלח) יושב בנפרד — המשפט ברשימה ובבונה נשאר קצר.
    equal(afterFirstSentence(DELIVERY_LABELS.auto.mail), '');
    equal(AUTO_MAIL_RECORDED.length > 10, true, AUTO_MAIL_RECORDED);
    equal(AUTO_MAIL_RECORDED.includes('תוך כמה דקות'), false);
    equal(afterFirstSentence('משפט אחד בלבד'), '');
  }),

  test('שלב בקליטה: מסמך נספר כ«מסמך», והקריאה מול הרשות מופיעה (X-7)', () => {
    const onb = flow('onb', [
      stage('s2', { name: 'אחרי שהמסמכים הגיעו', delivery: 'approve', items: [
        { key: 'guide', ref: { kind: 'document', docId: 'd1' }, optional: true },
        { key: 'read', ref: { kind: 'action', actionId: 'shaam.sync_income_tax_file', actionType: 'shaam.sync_income_tax_file' }, mode: 'manual' },
      ] }),
    ], { trigger: 'quote_approved' });
    const st = intakeMoments(onb)[0].stages[0];
    equal(st.always, 0);
    deepEqual(st.docs, { always: 1, conditional: 0 });
    equal(intakeCountText(st), 'מסמך אחד');
    equal(intakeStageMeta(st), `מסמך אחד · ${DELIVERY_LABELS.approve.long} · קריאת תיק מס הכנסה מהשע״ם — בלחיצה שלך`);
    // רק פעולה — לא מגיע ללקוח, ולכן בלי «איך מגיע»
    const only = intakeMoments(flow('o', [stage('x', { delivery: 'auto', items: [
      { key: 'b', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' }, mode: 'auto' }] })], { trigger: 'quote_approved' }))[0].stages[0];
    equal(intakeStageMeta(only), 'בלי בקשות ללקוח · קריאת התיק בביטוח לאומי — לבד, כשאפשר');
  }),

  test('קריאה במסלול שלא רצה — «ממתינה לך» עם הסיבה, עד שמריצים (D2-2)', () => {
    const def = { stages: [stage('a1', { name: 'איסוף מסמכים לדוח', items: [
      { key: 'read_btl', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' }, mode: 'auto' },
      { key: 'read_tax', ref: { kind: 'action', actionId: 'shaam.sync_income_tax_file', actionType: 'shaam.sync_income_tax_file' }, mode: 'manual' },
    ] })] };
    const defs = new Map([[flowDefKey('f1', 2), def]]);
    const run = (id: string, clientId: string, actions: Record<string, unknown>): WaitRun => ({ id, clientId, flowId: 'f1', flowVersion: 2, state: { actions } });
    const at = '2026-10-03T08:00:00Z';
    const runs = [
      run('r1', 'c1', { read_btl: { state: 'waiting_office', reason: 'worker_offline', at }, read_tax: { state: 'waiting_office', at } }),
      run('r2', 'c2', { read_btl: { state: 'waiting_office', reason: 'recent_job', at } }),
      run('r3', 'c3', { read_btl: { state: 'queued', jobId: 'j', at } }),
      run('r4', 'c4', { read_btl: { state: 'waiting_office', reason: 'not_connected', at } }),
      run('r5', 'c5', { gone: { state: 'waiting_office', reason: 'worker_offline', at } }),
      { id: 'r6', clientId: 'c6', flowId: 'f1', flowVersion: 9, state: { actions: { read_btl: { state: 'waiting_office', reason: 'office_busy', at } } } },
    ];
    // c4 — הורץ מאז בלחיצה; ריצה שבוטלה אינה «הורץ»; ריצה מלפני ההמתנה — לא סוגרת.
    const jobs: WaitJob[] = [
      { clientId: 'c4', actionType: 'btl.sync_file', status: 'succeeded', createdAt: '2026-10-03T09:00:00Z' },
      { clientId: 'c1', actionType: 'btl.sync_file', status: 'cancelled', createdAt: '2026-10-03T09:00:00Z' },
      { clientId: 'c1', actionType: 'shaam.sync_income_tax_file', status: 'failed', createdAt: '2026-10-03T07:00:00Z' },
    ];
    const ws = flowWaits(runs, defs, jobs, { f1: 'דוח שנתי' });
    deepEqual(ws.map(w => `${w.clientId}:${w.itemKey}`).sort(), ['c1:read_btl', 'c1:read_tax']);
    const btl = ws.find(w => w.itemKey === 'read_btl')!;
    equal(btl.actionType, 'btl.sync_file');
    equal(btl.auto, true);
    const reasons = { worker_offline: 'מחשב העבודה כבוי', run_not_authorized: 'לא אושר' };
    const e = waitEvent(btl, reasons);
    equal(e.label, 'ממתינה לך — מחשב העבודה כבוי');
    equal(e.note, 'במסלול «דוח שנתי», בשלב «איסוף מסמכים לדוח»');
    equal(e.connect, 'worker');
    equal(raisesAttention(e, { on: true, now: Date.parse('2026-10-03T10:00:00Z') }), true);
    // פריט «בלחיצה שלך» — מוצג, אבל זו ההגדרה ולא חריגה: לא «צריך אותך».
    const manual = waitEvent(ws.find(w => w.itemKey === 'read_tax')!, reasons);
    equal(manual.label, 'ממתינה ללחיצה שלך');
    equal(manual.attention, false);
    // לא אושר בהפעלה — בחירה, לא תקלה
    equal(waitEvent({ ...btl, reason: 'run_not_authorized' }, reasons).attention, false);
    equal(waitEvent({ ...btl, reason: 'not_connected' }, reasons).connect, 'btl');
  }),
];
