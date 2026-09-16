// test-authority-connection-model.ts — בדיקות למודל נוריות החיבור בכותרת.
// הרצה: node scripts/test-authority-connection-model.ts   (Node ≥ 22.6, בלי בנייה)
//
// ‼ מכסה את רגרסיית שע״ם מספטמבר 2026: משימת needs_human פתוחה שהזדקנה מעל
// חלון השליפה הוסתרה מהכותרת, האינדקס הייחודי במסד עדיין ראה אותה כפתוחה,
// ולחיצה על «שע״ם» הפכה ל-no-op לצמיתות. ראה authorityConnectionModel.ts.

import assert from 'node:assert/strict';
import {
  derivePhase, selectAuthorityJob, mustCancelBeforeStart, jobStatusFilter,
  failedCutoffIso, OPEN_JOB_STATUSES, NEEDS_YOU_MAX_AGE_MS, FAILED_LOOKBACK_MS,
} from '../src/hooks/authorityConnectionModel.ts';
import type { AutomationJob, AutomationJobStatus } from '../src/types/automation.ts';

const NOW = Date.parse('2026-09-15T14:00:00.000Z');
const MIN = 60_000;
const SHAAM = 'shaam.connect';
const BTL = 'btl.connect';

function job(p: {
  id: string; actionType: string; status: AutomationJobStatus; ageMin: number; errorCode?: string;
  /** רק ל-running: מפורש ב-ms יחסית ל-NOW. ברירת המחדל — חכירה חיה (NOW+5min),
   *  כדי ש"running" בבדיקה תתנהג כמו running אמיתי שנתפס זה עתה, אלא אם
   *  הבדיקה מדמה במפורש חכירה שפקעה (leaseAgoMin). */
  leaseAgoMin?: number;
}): AutomationJob {
  const createdAt = new Date(NOW - p.ageMin * MIN).toISOString();
  const leaseUntil = p.status === 'running'
    ? new Date(NOW - (p.leaseAgoMin ?? -5) * MIN).toISOString()
    : undefined;
  return {
    id: p.id, userId: 'u', clientId: null as unknown as string, actionType: p.actionType,
    input: {}, status: p.status, attempts: 1, maxAttempts: 3, artifacts: [],
    errorCode: p.errorCode, createdAt, updatedAt: createdAt, leaseUntil,
  };
}

const notOwner = () => false;
const online = { connected: false, workerOffline: false, localError: null, isOwnJobId: notOwner, now: NOW };

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('authorityConnectionModel');

// ── A. משימה פתוחה ישנה עדיין נטענת ונבחרת — מחזור החיים מכיר אותה ──
test('A. needs_human older than the failed lookback is still selected as the authority job', () => {
  const old = job({ id: 'old', actionType: SHAAM, status: 'needs_human', ageMin: 13 * 24 * 60, errorCode: 'awaiting_shaam_auth' });
  assert.equal(selectAuthorityJob(SHAAM, [old]), old);
  // המסנן של השאילתה: פתוחות בלי תנאי זמן, failed רק מהחלון.
  const f = jobStatusFilter(NOW);
  assert.match(f, /^status\.in\.\(queued,running,needs_human\),/);
  assert.match(f, /and\(status\.eq\.failed,created_at\.gte\./);
  assert.ok(!/needs_human[^)]*created_at/.test(f), 'open statuses must not be time-bounded');
});

// ── B. אותה משימה ישנה לא מוצגת כתום ──
test('B. old needs_human is loaded but NOT orange (20-minute freshness rule)', () => {
  const old = job({ id: 'old', actionType: SHAAM, status: 'needs_human', ageMin: 13 * 24 * 60, errorCode: 'awaiting_shaam_auth' });
  assert.equal(derivePhase({ ...online, job: old }).phase, 'idle');
  const justOver = job({ id: 'j', actionType: SHAAM, status: 'needs_human', ageMin: NEEDS_YOU_MAX_AGE_MS / MIN + 1 });
  assert.equal(derivePhase({ ...online, job: justOver }).phase, 'idle');
});

// ── C. לחיצה עם משימה פתוחה ישנה ⇒ ביטול לפני יצירה ──
test('C. explicit click must cancel an old open needs_human/queued job before creating a new one', () => {
  const oldNeedsHuman = job({ id: 'o1', actionType: SHAAM, status: 'needs_human', ageMin: 13 * 24 * 60 });
  const oldQueued = job({ id: 'o2', actionType: SHAAM, status: 'queued', ageMin: 60 });
  assert.equal(mustCancelBeforeStart(oldNeedsHuman, NOW), true);
  assert.equal(mustCancelBeforeStart(oldQueued, NOW), true);
  // running אינה ניתנת לביטול ב-cancel_automation_job — העובד תופס אותה מחדש.
  assert.equal(mustCancelBeforeStart(job({ id: 'r', actionType: SHAAM, status: 'running', ageMin: 60 }), NOW), false);
  assert.equal(mustCancelBeforeStart(job({ id: 'f', actionType: SHAAM, status: 'failed', ageMin: 1 }), NOW), false);
  assert.equal(mustCancelBeforeStart(null, NOW), false);
});

// ── D. needs_human טרייה ⇒ כתום ──
test('D. fresh needs_human renders needs_you with its errorCode', () => {
  const fresh = job({ id: 'n', actionType: SHAAM, status: 'needs_human', ageMin: 3, errorCode: 'awaiting_gmf_auth' });
  const s = derivePhase({ ...online, job: fresh });
  assert.equal(s.phase, 'needs_you');
  assert.equal(s.errorCode, 'awaiting_gmf_auth');
  // עובד כבוי גובר גם על משימה טרייה.
  assert.equal(derivePhase({ ...online, workerOffline: true, job: fresh }).phase, 'idle');
  // מוכנות גוברת על הכול.
  assert.equal(derivePhase({ ...online, connected: true, job: fresh }).phase, 'ready');
});

// ── E. היסטוריית failed נשארת חסומה בזמן ──
test('E. failed history is time-bounded and an open job always wins over failed', () => {
  assert.equal(FAILED_LOOKBACK_MS, 30 * MIN);
  assert.equal(failedCutoffIso(NOW), new Date(NOW - 30 * MIN).toISOString());
  assert.ok(jobStatusFilter(NOW).includes(`created_at.gte.${failedCutoffIso(NOW)}`));
  assert.deepEqual([...OPEN_JOB_STATUSES], ['queued', 'running', 'needs_human']);
  // failed טרייה יותר מפתוחה ישנה? הפתוחה עדיין המצב (המסד לא ייצור חדשה).
  const open = job({ id: 'open', actionType: SHAAM, status: 'needs_human', ageMin: 500 });
  const failed = job({ id: 'failed', actionType: SHAAM, status: 'failed', ageMin: 2 });
  assert.equal(selectAuthorityJob(SHAAM, [failed, open]), open);
  // בלי פתוחה — ה-failed האחרונה, ומוצגת רק לבעלים.
  assert.equal(selectAuthorityJob(SHAAM, [failed]), failed);
  assert.equal(derivePhase({ ...online, job: failed }).phase, 'idle');
  assert.equal(derivePhase({ ...online, job: failed, isOwnJobId: (id) => id === 'failed' }).phase, 'failed');
});

// ── F. מסלול ב״ל לא השתנה ──
test('F. BTL path: independent selection, connecting/needs_you/ready derive the same way', () => {
  const shaamOld = job({ id: 's', actionType: SHAAM, status: 'needs_human', ageMin: 13 * 24 * 60 });
  const btlQueued = job({ id: 'b', actionType: BTL, status: 'queued', ageMin: 0.2 });
  assert.equal(selectAuthorityJob(BTL, [btlQueued, shaamOld]), btlQueued);
  assert.equal(selectAuthorityJob(BTL, [shaamOld]), null, 'a SHAAM job must never leak into BTL');
  assert.equal(derivePhase({ ...online, job: btlQueued }).phase, 'connecting');
  const btlNeeds = job({ id: 'bn', actionType: BTL, status: 'needs_human', ageMin: 1, errorCode: 'awaiting_btl_auth' });
  assert.equal(derivePhase({ ...online, job: btlNeeds }).errorCode, 'awaiting_btl_auth');
  assert.equal(derivePhase({ ...online, connected: true, job: btlNeeds }).phase, 'ready');
  assert.equal(mustCancelBeforeStart(btlNeeds, NOW), true);
});

// ── G. השרשרת המדויקת של הרגרסיה אינה אפשרית עוד ──
test('G. the diagnosed trap: hidden old open job → created:false → hidden again — cannot recur', () => {
  // לפני: refresh סינן לפי 30 דקות ⇒ open=null ⇒ אין ביטול ⇒ create מחזיר את הישנה.
  // אחרי: המסנן טוען כל פתוחה ⇒ selectAuthorityJob מחזיר אותה ⇒ mustCancel=true.
  const old = job({ id: 'old', actionType: SHAAM, status: 'needs_human', ageMin: 13 * 24 * 60 });
  const loaded = selectAuthorityJob(SHAAM, [old]);
  assert.ok(loaded, 'old open job is loaded regardless of age');
  assert.equal(mustCancelBeforeStart(loaded, NOW), true, 'and the click will cancel it before creating');
  assert.equal(derivePhase({ ...online, job: loaded }).phase, 'idle', 'while still not shown as orange');
});

// ── H. running שהחכירה שלו פקעה (170/N5) — כמו needs_human/queued, לא כמו running חי ──
test('H. running with an expired lease is treated as dead: not "connecting", and cancellable', () => {
  const liveRunning = job({ id: 'live', actionType: SHAAM, status: 'running', ageMin: 0.5 });
  assert.equal(derivePhase({ ...online, job: liveRunning }).phase, 'connecting');
  assert.equal(mustCancelBeforeStart(liveRunning, NOW), false, 'a running job with a live lease is still owned by a worker');

  const staleRunning = job({ id: 'stale', actionType: SHAAM, status: 'running', ageMin: 0.5, leaseAgoMin: 10 });
  assert.equal(derivePhase({ ...online, job: staleRunning }).phase, 'idle',
    'an expired lease is not "connecting..." — nobody is holding it');
  assert.equal(derivePhase({ ...online, job: staleRunning, isOwnJobId: (id) => id === 'stale' }).phase, 'failed',
    'the owner sees it as a timeout failure, not a silent no-op');
  assert.equal(mustCancelBeforeStart(staleRunning, NOW), true,
    'clicking retry must clear a dead running job before creating a new one — the exact worker-crash trap from N5');
});

console.log(`\n${passed} passed`);
