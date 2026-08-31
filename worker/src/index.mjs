#!/usr/bin/env node
// index.mjs — לולאת העובד המקומי: heartbeat → claim → dispatch → report.
// לא Playwright, לא דפדפן, לא שע״ם — אבן דרך 1 מוכיחה רק את הצנרת. ראה
// docs/PIVO-AUTOMATION-FOUNDATION.html לארכיטקטורה המלאה ול-worker/README.md
// להרצה.
import { USER_ID, WORKER_ID, POLL_SECONDS, LEASE_SECONDS } from './config.mjs';
import { claim, heartbeat, complete, fail } from './apiClient.mjs';
import { handlerFor, supportedActionTypes } from './dispatcher.mjs';
import { NeedsHumanError, PermanentError } from './errors.mjs';
import { tickConnectionMonitor, invalidateConnectionCache } from './connectionMonitor.mjs';

const VERSION = '0.1.0';
let stopping = false;

process.on('SIGINT', () => { console.log('\n⏹ עצירה מבוקשת — מסיים את המשימה הנוכחית (אם יש) ויוצא...'); stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().slice(11, 19); }
function log(...args) { console.log(`[${ts()}]`, ...args); }

// ‼ הפונקציות ב-SQL מחזירות jsonb גולמי (to_jsonb) — snake_case כמו בעמודות
// המסד, לא camelCase כמו ב-Client/AutomationJob של הדפדפן. אין כאן שכבת
// מיפוי כמו dbMappers.ts, אז קריאה ל-job.actionType הייתה תמיד undefined.
function normalizeJob(raw) {
  return { ...raw, actionType: raw.action_type };
}

/** מריצה את ה-handler ומחזיקה heartbeat רץ ברקע כדי להאריך את החכירה. */
async function runJob(job) {
  const h = handlerFor(job.actionType);
  if (!h) {
    log(`✗ אין handler רשום ל-action_type "${job.actionType}" — נכשל`);
    await fail(WORKER_ID, job.id, 'unknown_action_type', `אין handler רשום ל-${job.actionType}`);
    return;
  }

  const pre = await h.preflight?.().catch((e) => ({ ok: false, needsHuman: e?.message ?? 'preflight failed' }));
  if (pre && pre.ok === false) {
    log(`⏸ ${job.actionType}: דרוש אדם — ${pre.needsHuman}`);
    await fail(WORKER_ID, job.id, 'preflight_needs_human', pre.needsHuman, pre.needsHuman);
    return;
  }

  // חכירה חוזרת כל עוד ה-handler רץ, כדי שמשימה איטית לא תפקע תחת עצמה.
  const heartbeatTimer = setInterval(() => {
    void heartbeat(USER_ID, WORKER_ID, job.id, LEASE_SECONDS, VERSION).catch(() => { /* ננסה שוב בסבב הבא */ });
  }, Math.max(5, Math.floor(LEASE_SECONDS / 2)) * 1000);

  try {
    const ctx = { log: (...a) => log('  ', ...a), heartbeat: () => heartbeat(USER_ID, WORKER_ID, job.id, LEASE_SECONDS, VERSION) };
    const out = await h.run(ctx, job.input ?? {});
    clearInterval(heartbeatTimer);
    const r = await complete(WORKER_ID, job.id, out.result ?? {}, out.artifacts ?? []);
    log(r.ok ? `✓ ${job.actionType} הושלם` : `✗ הדיווח נכשל: ${r.error}`);
  } catch (e) {
    clearInterval(heartbeatTimer);
    if (e instanceof NeedsHumanError) {
      log(`⏸ ${job.actionType}: דרוש אדם — ${e.message}`);
      await fail(WORKER_ID, job.id, e.code, e.message, e.message);
    } else if (e instanceof PermanentError) {
      log(`✗ ${job.actionType} נכשל (${e.code}): ${e.message}`);
      await fail(WORKER_ID, job.id, e.code, e.message);
    } else {
      log(`✗ ${job.actionType} נכשל עם שגיאה לא צפויה:`, e);
      await fail(WORKER_ID, job.id, 'unexpected_error', e instanceof Error ? e.message : String(e));
    }
  }
}

async function tick() {
  const actionTypes = supportedActionTypes();
  const j = await claim(USER_ID, WORKER_ID, actionTypes, LEASE_SECONDS).catch((e) => {
    log('✗ claim נכשל (רשת?):', e?.message ?? e);
    return { ok: false };
  });
  if (j?.job) {
    const job = normalizeJob(j.job);
    log(`▶ תפסתי משימה ${job.id} · ${job.actionType} · ניסיון #${job.attempts}`);
    await runJob(job);
    // חיבור/ניתוק משנים את מצב הנורית — לא ממתינים למחזור הבדיקה הרגיל.
    if (job.actionType.startsWith('shaam.')) invalidateConnectionCache();
    return true; // רץ עוד סבב מיד — אולי יש עוד עבודה בתור
  }
  // אין עבודה — פעימת נוכחות ריקה, כדי ש-PIVO ידע שהמחשב הזה חי
  await heartbeat(USER_ID, WORKER_ID, null, LEASE_SECONDS, VERSION).catch(() => { /* לא קריטי */ });
  return false;
}

async function main() {
  log(`עובד אוטומציה PIVO · worker=${WORKER_ID} · v${VERSION}`);
  log(`פעולות נתמכות: ${supportedActionTypes().join(', ') || '(אין)'}`);
  log(`תשאול כל ${POLL_SECONDS}s · חכירה ${LEASE_SECONDS}s`);
  while (!stopping) {
    const found = await tick();
    // ניטור החיבור רץ באותה לולאה ולא בטיימר נפרד — כדי ששני הדברים לא
    // ייגעו ב-Chrome בו-זמנית ויתחרו על אותו חיבור CDP.
    await tickConnectionMonitor(USER_ID, WORKER_ID, log).catch((e) =>
      log('ניטור חיבור נכשל:', e?.message ?? e));
    if (!found && !stopping) await sleep(POLL_SECONDS * 1000);
  }
  log('להתראות.');
}

main();
