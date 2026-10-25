#!/usr/bin/env node
// index.mjs — לולאת העובד המקומי: heartbeat → claim → dispatch → report.
// לא Playwright, לא דפדפן, לא שע״ם — אבן דרך 1 מוכיחה רק את הצנרת. ראה
// docs/PIVO-AUTOMATION-FOUNDATION.html לארכיטקטורה המלאה ול-worker/README.md
// להרצה.
import { USER_ID, WORKER_ID, POLL_SECONDS, LEASE_SECONDS, ONLY_ACTIONS, MONITOR_SCOPE, PDF_ENABLED, PDF_ONLY } from './config.mjs';
import { claim, heartbeat, complete, fail } from './apiClient.mjs';
import { handlerFor, supportedActionTypes } from './dispatcher.mjs';
import { NeedsHumanError, PermanentError } from './errors.mjs';
import { tickConnectionMonitor, invalidateConnectionCache, checkBtlSoon, monitorSleepMs } from './connectionMonitor.mjs';
import { acquireSingleInstance } from './singleInstance.mjs';
import { startPdfLoop } from './pdfBuilds.mjs';
import { STARTUP_COMMIT, diskCommit, versionLabel, codeIsStale } from './codeVersion.mjs';

const BASE_VERSION = '0.1.0';
// ‼ 14.10.2026 · הגרסה בפעימה = הקומיט שנטען בהפעלה (ו«→חדש» כשהדיסק התקדם).
// כך אפשר לראות ב-automation_workers.version מה רץ בפועל, לא מה הועתק.
const version = () => versionLabel(BASE_VERSION, STARTUP_COMMIT, diskCommit());
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

  // ‼ 14.10.2026 · הקוד על הדיסק עודכן אחרי שהתהליך עלה ⇒ לא מריצים קוד ישן
  // מול רשות. עוצרים לפני הכול (שום דבר לא נפתח ולא נשלח) ומבקשים הפעלה מחדש.
  const disk = diskCommit();
  if (codeIsStale(STARTUP_COMMIT, disk)) {
    const msg = `במחשב הזה הותקנה גרסה חדשה של האוטומציה (${disk.slice(0, 7)}), אבל התהליך שרץ עדיין ` +
      `מריץ את הגרסה הקודמת (${STARTUP_COMMIT.slice(0, 7)}). הפעולה לא בוצעה ושום דבר לא נשלח לרשות. ` +
      'הפעילו מחדש את האוטומציה במחשב העבודה (restart-worker.ps1), ואז נסו שוב.';
    log(`⛔ ${job.actionType}: קוד ישן בזיכרון (${STARTUP_COMMIT.slice(0, 7)} ≠ ${disk.slice(0, 7)}) — לא מריץ`);
    await fail(WORKER_ID, job.id, 'worker_code_stale', msg);
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
    void heartbeat(USER_ID, WORKER_ID, job.id, LEASE_SECONDS, version()).catch(() => { /* ננסה שוב בסבב הבא */ });
  }, Math.max(5, Math.floor(LEASE_SECONDS / 2)) * 1000);

  try {
    // ‼ job מלא ב-ctx (לא רק input): warmupManager.mjs צריך id/progress/revision
    // כדי לכתוב התקדמות עמידה (CAS) תוך כדי ריצה, לא רק את הקלט שנשלח אליו.
    const ctx = {
      log: (...a) => log('  ', ...a),
      heartbeat: () => heartbeat(USER_ID, WORKER_ID, job.id, LEASE_SECONDS, version()),
      workerId: WORKER_ID,
      job,
    };
    const out = await h.run(ctx, job.input ?? {});
    clearInterval(heartbeatTimer);
    const r = await complete(WORKER_ID, job.id, out.result ?? {}, out.artifacts ?? []);
    log(r.ok ? `✓ ${job.actionType} הושלם` : `✗ הדיווח נכשל: ${r.error}`);
  } catch (e) {
    clearInterval(heartbeatTimer);
    if (e instanceof NeedsHumanError) {
      log(`⏸ ${job.actionType}: דרוש אדם — ${e.message}`);
      // ‼ 170: אין כאן עוד רישום תוך-תהליכי של מה לחדש — e.code (בתבנית
      // 'awaiting_<capability>_auth') כבר נשמר כ-error_code על ה-job עצמו
      // ע"י fail_automation_job, וזו הראיה העמידה ש-report_worker_status
      // קוראת בעצמה בכל סבב. שורד הפעלה מחדש בלי זיכרון בתהליך.
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

// 203 · מופע אחר של אותה זהות חי (תהליך כפול, או .env שהועתק למחשב אחר) —
// לא תופסים עבודה, ומודיעים פעם אחת לכל רצף ולא בכל סבב.
let blockedLogged = null;
function noteBlocked(reason) {
  if (reason === blockedLogged) return;
  blockedLogged = reason;
  if (reason) log(`⛔ לא תופס עבודה: ${reason === 'instance_conflict'
    ? 'תהליך אחר עם אותה זהות מחשב פעיל כרגע (כפול במחשב הזה, או הגדרות שהועתקו למחשב אחר)'
    : reason}`);
  else log('✓ הזהות פנויה — חוזר לתפוס עבודה');
}

// ‼ 25.10.2026 · שני מסלולים במקביל: ב״ל רצה בחלון Chrome משלה, ולכן אין סיבה
// שתחכה לשע״ם (יישור קו מלא לקח ~4 דקות בתור אחד). בכל מסלול — משימה אחת
// בכל רגע, כמו קודם: בשע״ם אין שתי משימות על אותו חלון.
const laneOf = (actionType) => (actionType.startsWith('btl.') ? 'btl' : 'shaam');
const running = { shaam: null, btl: null };
const busy = () => !!(running.shaam || running.btl);
// ‼ מסלול שהתפנה אחרי ש-tick כבר שאל (כשהמסלול עוד היה תפוס) — שואלים שוב לפני
// ניטור החיבור. בלי זה הניטור נכנס בדיוק בין קריאה לקריאה (~20 ש׳, נמדד 25.10.2026).
let freedSinceClaim = false;

/**
 * תופס משימה למסלול פנוי ומריץ אותה ברקע. ‼ ל-claim נשלחים רק סוגי הפעולות של
 * המסלולים הפנויים — כך claim_action_types בשרת אומר בדיוק מה המחשב מוכן לקחת.
 */
async function tick() {
  freedSinceClaim = false;
  const all = ONLY_ACTIONS.length ? supportedActionTypes().filter(a => ONLY_ACTIONS.includes(a)) : supportedActionTypes();
  const actionTypes = all.filter(a => !running[laneOf(a)]);
  if (!actionTypes.length) return false;
  const j = await claim(USER_ID, WORKER_ID, actionTypes, LEASE_SECONDS).catch((e) => {
    log('✗ claim נכשל (רשת?):', e?.message ?? e);
    return { ok: false };
  });
  if (j?.blocked) { noteBlocked(j.blocked); return false; }
  if (j?.ok) noteBlocked(null);
  if (j?.job) {
    const job = normalizeJob(j.job);
    const lane = laneOf(job.actionType);
    log(`▶ תפסתי משימה ${job.id} · ${job.actionType} · ניסיון #${job.attempts}`);
    running[lane] = runJob(job).catch((e) => log('✗ שגיאה בהרצה:', e?.message ?? e)).finally(() => {
      running[lane] = null;
      freedSinceClaim = true;
      // חיבור/ניתוק משנים את מצב הנורית — לא ממתינים למחזור הבדיקה הרגיל.
      if (job.actionType.startsWith('shaam.')) invalidateConnectionCache();
      // ‼ ב״ל: סבב מיידי, כדי שחלון שנפתח עכשיו על מסך הכניסה ייכנס מיד
      // להמתנה הצפופה (btlLoginWatch.mjs) ולא רק בעוד עד 30 שניות.
      if (job.actionType.startsWith('btl.')) checkBtlSoon();
    });
    return true; // רץ עוד סבב מיד — אולי יש עבודה למסלול השני
  }
  // אין עבודה — פעימת נוכחות ריקה, כדי ש-PIVO ידע שהמחשב הזה חי
  if (!busy()) await heartbeat(USER_ID, WORKER_ID, null, LEASE_SECONDS, version()).catch(() => { /* לא קריטי */ });
  return false;
}

async function main() {
  // ‼ עובד אחד לכל id. ה-watchdog של Task Scheduler מפעיל את העובד כל כמה
  // דקות; כשכבר יש עובד — יוצאים בשקט, בלי שורה ביומן (אחרת היומן היה
  // מתמלא שורה כל 5 דקות).
  const lock = await acquireSingleInstance(WORKER_ID);
  if (!lock.ok) process.exit(0);
  log(`עובד אוטומציה PIVO · worker=${WORKER_ID} · v${version()}`);
  // ‼ 211 · הכנת PDF ברקע — לולאה נפרדת, Chrome נפרד (pdfBuilds.mjs).
  const pdfLoop = PDF_ENABLED || PDF_ONLY ? startPdfLoop(log, () => stopping) : null;
  if (PDF_ONLY) {
    // ‼ עובד בדיקות: רק המרת PDF. לא תופס משימות, לא מנטר חיבור, לא נוגע בשע״ם/ב"ל.
    log('מצב PDF בלבד — בלי משימות ובלי ניטור חיבור לרשויות');
    await pdfLoop;
    log('להתראות.');
    return;
  }
  const claimed = ONLY_ACTIONS.length ? supportedActionTypes().filter(a => ONLY_ACTIONS.includes(a)) : supportedActionTypes();
  log(`פעולות נתמכות: ${claimed.join(', ') || '(אין)'}${MONITOR_SCOPE === 'btl' ? ' · ניטור: ב״ל בלבד' : ''}`);
  log(`תשאול כל ${POLL_SECONDS}s · חכירה ${LEASE_SECONDS}s`);
  while (!stopping) {
    const found = await tick();
    if (found) continue;
    if (busy()) {
      // ‼ ניטור החיבור לא רץ בזמן שמשימה נוגעת ב-Chrome — שניהם היו מתחרים על
      // אותו חלון. ממתינים שמסלול יתפנה, או שנייה כדי לתפוס עבודה למסלול השני.
      await Promise.race([sleep(1000), ...Object.values(running).filter(Boolean)]);
      continue;
    }
    if (freedSinceClaim) continue;
    // ניטור החיבור רץ באותה לולאה ולא בטיימר נפרד — כדי ששני הדברים לא
    // ייגעו ב-Chrome בו-זמנית ויתחרו על אותו חיבור CDP.
    await tickConnectionMonitor(USER_ID, WORKER_ID, log, { scope: MONITOR_SCOPE }).catch((e) =>
      log('ניטור חיבור נכשל:', e?.message ?? e));
    // ‼ 2 שניות בזמן המתנה להתחברות לב״ל ומיד אחריה — ראה btlLoginWatch.mjs.
    if (!stopping) await sleep(monitorSleepMs(POLL_SECONDS * 1000));
  }
  await Promise.all(Object.values(running).filter(Boolean));
  await pdfLoop;
  log('להתראות.');
}

main();
