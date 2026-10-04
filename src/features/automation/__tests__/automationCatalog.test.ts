// ─── בדיקות: «אוטומציות» — הרשימה אומרת רק מה שקיים, וריצה לא נקראת כהצלחה בטעות ─
// ‼ מה נעול כאן:
//   · כל פעולה ברשימה מצביעה על handler שקיים בעובד, ופעולת פיתוח/חיבור לא נכנסת.
//   · «לא ידוע אם נקלט» אינו «הסתיימה», גם כשהסטטוס succeeded/failed.
//   · בדיקת ב״ל עם מצב לא מזוהה אינה «אושר».
//   · ריצה שנוצרה בשרת (אחרי שליחה / כשמסמך הגיע / שלב במסלול נפתח) מסומנת «לבד».
//   · במסלול נכנסות רק שתי פעולות הקריאה.

import { test, equal, includes, excludes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { AutomationJob } from '../../../types/automation';
import {
  AUTOMATION_ACTIONS, AUTOMATION_ACTION_TYPES, summarizeRun, runIsStale, runIsAuto, runAwaitsLogin,
} from '../automationCatalog';
import { FLOW_ACTION_NAMES, actionTypeOf as flowActionTypeOf } from '../../flows/types';

const job = (p: Partial<AutomationJob>): AutomationJob => ({
  id: 'j', userId: 'u', clientId: 'c', actionType: 'btl.check_representation', input: {},
  status: 'succeeded', attempts: 1, maxAttempts: 1, artifacts: [],
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:01:00Z', ...p,
});

// מה שהעובד יודע להריץ (worker/src/dispatcher.mjs) — רשימה סגורה, מועתקת במכוון.
const WORKER_HANDLERS = new Set([
  'shaam.sync_income_tax_file', 'shaam.create_representation', 'shaam.submit_poa', 'shaam.check_representation',
  'btl.sync_file', 'btl.create_representation', 'btl.check_representation',
]);

export const TESTS: TestCase[] = [
  test('כל פעולה ברשימה רצה בעובד; פעולת פיתוח וחיבור אינן ברשימה', () => {
    for (const t of AUTOMATION_ACTION_TYPES) equal(WORKER_HANDLERS.has(t), true, `${t} קיים בעובד`);
    excludes(AUTOMATION_ACTION_TYPES, 'dev.test_automation');
    excludes(AUTOMATION_ACTION_TYPES, 'shaam.connect');
    excludes(AUTOMATION_ACTION_TYPES, 'shaam.ensure_capability');
    excludes(AUTOMATION_ACTION_TYPES, 'shaam.open_client_file');
  }),

  test('מע״מ מוצג כ«עוד לא קיים» — בלי action_type ובלי הבטחה', () => {
    const vat = AUTOMATION_ACTIONS.find(a => a.system === 'vat')!;
    equal(vat.actionType, null);
    equal(vat.mode, 'עוד לא קיים');
    equal(vat.manual, null);
  }),

  test('«לבד» רק איפה שיש מנגנון בשרת: בדיקה אחרי שליחה, והמשך שליחה כשמסמך הגיע', () => {
    const auto = AUTOMATION_ACTIONS.filter(a => a.automatic).map(a => a.actionType);
    equal(auto.length, 2);
    includes(auto, 'shaam.check_representation');
    includes(auto, 'shaam.submit_poa');
  }),

  test('לא ידוע אם נקלט — אף פעם לא «הסתיימה», גם בסטטוס succeeded', () => {
    const s = summarizeRun(job({ actionType: 'shaam.submit_poa', status: 'failed', errorCode: 'external_outcome_unknown' }));
    equal(s.label, 'לא ידוע אם נקלט');
    equal(s.tone, 'warn');
    equal(summarizeRun(job({ actionType: 'shaam.submit_poa', status: 'succeeded', errorCode: 'ambiguous_submit_result' })).tone, 'warn');
  }),

  test('בדיקת ב״ל: רק approved הוא «אושר»; מצב לא מזוהה ולא-נמצא אינם הצלחה', () => {
    equal(summarizeRun(job({ result: { status: 'approved' } })).tone, 'ok');
    equal(summarizeRun(job({ result: { status: 'unknown' } })).tone, 'warn');
    equal(summarizeRun(job({ result: { status: 'not_found' } })).tone, 'warn');
    equal(summarizeRun(job({ result: {} })).tone, 'warn');
  }),

  test('בדיקת שע״ם: «לא נמצאה» אינו כישלון ואינו הצלחה; settled הוא «נקלט במה שיש לו תיק»', () => {
    equal(summarizeRun(job({ actionType: 'shaam.check_representation', result: { found: false } })).tone, 'warn');
    equal(summarizeRun(job({ actionType: 'shaam.check_representation', result: { found: true, allAccepted: true } })).tone, 'ok');
    equal(summarizeRun(job({ actionType: 'shaam.check_representation', result: { found: true, settled: true } })).label, 'נקרא: נקלט בכל מערך שיש בו תיק');
    equal(summarizeRun(job({ actionType: 'shaam.check_representation', result: { found: true } })).tone, 'muted');
  }),

  test('שליחה: «נשלח» רק כשהמסך אישר קליטה', () => {
    equal(summarizeRun(job({ actionType: 'shaam.submit_poa', result: { submitted: true } })).tone, 'ok');
    equal(summarizeRun(job({ actionType: 'shaam.submit_poa', result: {} })).tone, 'warn');
  }),

  test('ממתינה להתחברות מול נעצרה מסיבה אחרת', () => {
    equal(summarizeRun(job({ status: 'needs_human', errorCode: 'awaiting_btl_auth' })).label, 'ממתינה להתחברות');
    const s = summarizeRun(job({ status: 'needs_human', needsHuman: 'לאדם הזה יש בשע״ם יותר מבקשה פתוחה אחת. שום מצב לא עודכן.' }));
    equal(s.label, 'נעצרה — צריך אותך');
    equal(s.note, 'לאדם הזה יש בשע״ם יותר מבקשה פתוחה אחת.');
  }),

  test('ריצה שנוצרה בשרת מסומנת «לבד»; לחיצה — לא', () => {
    equal(runIsAuto(job({ input: { reason: 'post_submission_reconciliation' } })), true);
    equal(runIsAuto(job({ input: { resumeReason: 'required_documents_arrived' } })), true);
    equal(runIsAuto(job({ input: { role: 'client' } })), false);
    equal(summarizeRun(job({ input: { reason: 'post_submission_reconciliation' } })).auto, true);
  }),

  test('קריאה שנפתחה בשלב של מסלול (215) מסומנת «לבד»', () => {
    equal(runIsAuto(job({ actionType: 'shaam.sync_income_tax_file', input: { reason: 'flow_stage_opened', flowRunId: 'r1' } })), true);
    equal(summarizeRun(job({ actionType: 'btl.sync_file', input: { reason: 'flow_stage_opened' } })).auto, true);
    equal(runIsAuto(job({ actionType: 'btl.sync_file', input: { subjects: [] } })), false);
  }),

  test('במסלול — רק שתי פעולות הקריאה; שום פעולה שמשנה ברשות', () => {
    const inFlow = AUTOMATION_ACTIONS.filter(a => a.flow);
    equal(inFlow.map(a => a.actionType).sort().join(','), 'btl.sync_file,shaam.sync_income_tax_file');
    for (const a of inFlow) equal(a.effect, 'read', `${a.id} קורא בלבד`);
    equal(Object.keys(FLOW_ACTION_NAMES).sort().join(','), 'btl.sync_file,shaam.sync_income_tax_file');
    equal(flowActionTypeOf({ kind: 'action', actionType: 'btl.sync_file' }), 'btl.sync_file');
    equal(flowActionTypeOf({ kind: 'action', actionId: 'shaam.sync_income_tax_file' }), 'shaam.sync_income_tax_file');
    equal(flowActionTypeOf({ kind: 'template' }), '');
  }),

  test('נתון מלפני יותר משבוע — ישן', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');
    equal(runIsStale(job({ finishedAt: '2026-10-01T10:00:00Z' }), now), true);
    equal(runIsStale(job({ finishedAt: '2026-10-08T10:00:00Z' }), now), false);
  }),
  test('שם אחד לכל פעולה: הקריאות בשם של המסלולים, לא «עדכון נתוני…» (D2-3)', () => {
    for (const a of AUTOMATION_ACTIONS.filter(x => x.flow)) {
      equal(a.name, FLOW_ACTION_NAMES[a.actionType!], `${a.id} — אותו שם כמו בבונה וברצועה`);
    }
    equal(AUTOMATION_ACTIONS.some(a => a.name.startsWith('עדכון נתוני')), false);
    equal(new Set(AUTOMATION_ACTIONS.map(a => a.name)).size, AUTOMATION_ACTIONS.length, 'שמות ייחודיים');
  }),

  test('לאן נוחתים מריצה: כרטיס הרשות לקריאה, מרכז הייצוג להזנה/הגשה/בדיקה (D1-1)', () => {
    const by = Object.fromEntries(AUTOMATION_ACTIONS.map(a => [a.id, a]));
    equal(by['shaam-sync'].clientTarget, 'taxfile:income_tax');
    equal(by['btl-sync'].clientTarget, 'taxfile:national_insurance');
    for (const id of ['shaam-create', 'shaam-submit', 'shaam-check', 'btl-create', 'btl-check']) {
      equal(by[id].clientTarget, 'rep-center', id);
      equal(by[id].clientTab, 'journey', id);
    }
    for (const a of AUTOMATION_ACTIONS.filter(x => x.clientTarget?.startsWith('taxfile:'))) equal(a.clientTab, 'taxfile', a.id);
  }),

  test('ממתינה להתחברות — לאיזה חיבור; ריצה שנעצרה מסיבה אחרת — לא (X-10)', () => {
    equal(runAwaitsLogin(job({ status: 'needs_human', errorCode: 'awaiting_shaam_auth' })), 'shaam');
    equal(runAwaitsLogin(job({ status: 'needs_human', errorCode: 'awaiting_gmf_auth' })), 'shaam');
    equal(runAwaitsLogin(job({ status: 'needs_human', errorCode: 'awaiting_btl_auth' })), 'btl');
    equal(runAwaitsLogin(job({ status: 'needs_human', errorCode: 'external_outcome_unknown' })), null);
    equal(runAwaitsLogin(job({ status: 'failed', errorCode: 'awaiting_btl_auth' })), null);
  }),
];
