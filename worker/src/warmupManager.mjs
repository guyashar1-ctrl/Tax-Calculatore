// warmupManager.mjs — מנגנון ה-ensure המשותף: warm-up מלא ("התחבר לשע״ם")
// ושחזור נקודתי (ensureCapability, בזמן פעולה עסקית) עוברים דרך אותו קוד.
// זו התשובה הישירה לדרישת פרק 16 §16.1: "login/warm-up משתמשים באותו
// מנגנון ensure כמו הפעולות העסקיות."
//
// ‼ שינוי ההתנהגות המרכזי מול shaamConnect.mjs הישן: capability שדורשת
// אדם לא עוצרת את הבדיקה של שאר ה-capabilities — כל אחת נבדקת ומדווחת
// בנפרד. "3 מתוך 4 מוכנות" הוא תוצאה תקינה (completed, לא failed), לא
// כישלון. ראה פרק 16 §16.4: "completed כולל outcome מלא או חלקי."
import {
  openGmfAndCheck, openVatAndCheck, openNikuiAndCheck,
  openRepresentationAndCheck, attemptRepresentationLoginConfirm,
  readGmfOnCurrentPage, readVatOnCurrentPage, readNikuiOnCurrentPage, readRepresentationOnCurrentPage,
  readGmfLoginForm, focusGmfLoginField, attemptGmfLoginConfirm,
  ensureWithBoundedRecovery,
  isOnWorkScreen,
} from './browserSession.mjs';
import { updateJobProgress } from './apiClient.mjs';
import { isShaamLifecycleEstablished, markGmfVerified } from './connectionMonitor.mjs';

export const CAPABILITY_ORDER = ['gmf', 'vat', 'nikui', 'representation'];
export const DEFAULT_CAPABILITIES = [...CAPABILITY_ORDER];

export const HUMAN_REASON = {
  gmf: 'awaiting_gmf_auth',
  vat: 'awaiting_vat_auth',
  nikui: 'awaiting_nikui_auth',
  representation: 'awaiting_representation_auth',
};

export const HUMAN_MESSAGE = {
  gmf: 'מערכת גביית מס הכנסה מבקשת סיסמה. בחלון שע״ם: הקלידו את הסיסמה (אפשר לאשר ל-Chrome לשמור אותה) — ואמשיך משם לבד.',
  vat: 'מע״מ מבקשת סיסמה. הזינו אותה בחלון שע״ם שנפתח, ואמשיך משם לבד.',
  nikui: 'מגן (ניכויים) מבקשת סיסמה. הזינו אותה בחלון שע״ם שנפתח, ואמשיך משם לבד.',
  representation: 'מערכת רישום הייצוג מבקשת התחברות נפרדת משלה. השלימו אותה בחלון שע״ם, ואמשיך משם לבד.',
};

/** ממפה תוצאת gmfState/vatState/nikuiState הישנה (ready/reason) למילון המצבים החדש. */
const UNAVAILABLE_REASONS = new Set(['unexpected_destination', 'transient_recovery_exhausted']);
function mapLegacyResult(r) {
  if (r.ready) return { state: 'ready', reasonCode: r.reason, evidenceKind: 'dom_state' };
  if (UNAVAILABLE_REASONS.has(r.reason)) {
    return { state: 'unavailable', reasonCode: r.reason, evidenceKind: 'dom_state' };
  }
  return { state: 'human_required', reasonCode: r.reason ?? 'login_required', evidenceKind: 'dom_state' };
}

/**
 * ‼ כל capability עוברת דרך אותה התאוששות תחומה (browserSession.mjs) לפני
 * שדף לא-ודאי (ריק/בטעינה) נחשב "לא זמינה" — לא רק ניסיון בודד. reopen כאן
 * הוא בדיוק אותה openXAndCheck שכבר קיימת; readCurrent הוא הקריאה הזולה
 * הקיימת. שום שינוי בלוגיקת הסיווג של gmfState/vatState/nikuiState עצמן.
 */
/**
 * ‼ GMF היא ה-bootstrap של החיבור (תיקון מוצר 16.09.2026): "מחובר לשע״ם"
 * ירוק רק אחרי שהחיבור הטרי הזה נכנס ל-GMF. מסך הכניסה שלה נצפה חי — ראה
 * browserSession.mjs (readGmfLoginForm): Chrome לא ממלא לבד; הוא מציע את
 * הסיסמה השמורה בחלונית מקומית כשהשדה בפוקוס, והבחירה בה (או הקלדה בפעם
 * הראשונה) היא של הרו"ח. PIVO: ממקדת את השדה, ממתינה זמן קצוב לעדות
 * בוליאנית שהשדה מולא, ואז לוחצת «כניסה» פעם אחת ומאמתת את התפריט.
 * לעולם לא קוראת/מקלידה את הערך, ולא נוגעת בחלונית של Chrome או במודאלים.
 */
const GMF_FILL_WAIT_MS = 25_000;
const GMF_FILL_POLL_MS = 1_000;

export async function ensureGmf(page, { waitForFillMs = GMF_FILL_WAIT_MS } = {}) {
  const initial = await openGmfAndCheck(page);
  const r = await ensureWithBoundedRecovery(page, { initial, readCurrent: readGmfOnCurrentPage, reopen: openGmfAndCheck });
  if (r.ready) { markGmfVerified(); return { state: 'ready', reasonCode: r.reason, evidenceKind: 'dom_state' }; }
  if (r.reason !== 'login_required') return mapLegacyResult(r);

  const form = await readGmfLoginForm(page);
  if (form.humanOnlyModal) {
    return { state: 'human_required', reasonCode: 'human_only_modal', evidenceKind: 'dom_state' };
  }
  if (!form.hasValue) {
    await focusGmfLoginField(page);
    const deadline = Date.now() + waitForFillMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(GMF_FILL_POLL_MS);
      const f = await readGmfLoginForm(page);
      if (!f.onLogin) break; // הרו"ח כבר שלח בעצמו (Enter) — נבדוק את היעד למטה
      if (f.humanOnlyModal) return { state: 'human_required', reasonCode: 'human_only_modal', evidenceKind: 'dom_state' };
      if (f.hasValue) break;
    }
  }

  const now = await readGmfOnCurrentPage(page);
  if (now.ready === true) { markGmfVerified(); return { state: 'ready', reasonCode: now.reason, evidenceKind: 'dom_state' }; }

  const confirm = await attemptGmfLoginConfirm(page);
  if (confirm.ok) { markGmfVerified(); return { state: 'ready', reasonCode: 'confirmed_fill', evidenceKind: 'dom_state' }; }
  return { state: 'human_required', reasonCode: confirm.reason ?? 'login_required', evidenceKind: 'dom_state' };
}
async function ensureVat(page) {
  const initial = await openVatAndCheck(page);
  const r = await ensureWithBoundedRecovery(page, { initial, readCurrent: readVatOnCurrentPage, reopen: openVatAndCheck });
  return mapLegacyResult(r);
}
async function ensureNikui(page) {
  const initial = await openNikuiAndCheck(page);
  const r = await ensureWithBoundedRecovery(page, { initial, readCurrent: readNikuiOnCurrentPage, reopen: openNikuiAndCheck });
  return mapLegacyResult(r);
}

/**
 * ‼ 23.09.2026 · הדגל של isShaamLifecycleEstablished הוא זיכרון **תוך-תהליכי**
 * (משתנה מודול, לא DB) — תהליך worker שהופעל מחדש (או עותק מבודד שרץ
 * במקביל לזה שראה בפועל את ההתחברות) לא "זוכר" ש-GMF כבר אומתה שם. בלי
 * הבדיקה הזאת, כל תהליך חדש היה נכנס ל-bootstrap_required תמיד — גם כשה-
 * סשן האמיתי (Chrome, אותו פרופיל) עדיין חי לגמרי, מה שהיה כופה מסך אדם
 * מיותר. הפתרון: כשהדגל כבוי — למדוד את GMF **בפועל**, לא לנחש שהוא כבוי.
 *
 * ‼ בלשונית **נפרדת**, לא ב-`page` שהקורא מעביר: אם GMF כבר מחוברת (המצב
 * הצפוי, כי הרו"ח לא נדרש להתחברות ראשית מחדש) — הבדיקה נוחתת ישר על
 * התפריט שלה, בלי מסך כניסה ובלי לחיצה. אם לא — `ensureGmf` מטפלת בה לפי
 * אותו כלל בדיוק (המתנה למילוי + אישור יחיד). בשני המקרים הלשונית של
 * מערכת הייצוג (`page`) לא זזה, כדי לא לחטוף אותה מתחת לרו"ח.
 */
async function refreshLifecycleIfStale(page) {
  if (isShaamLifecycleEstablished()) return;
  let scratch = null;
  try {
    scratch = await page.context().newPage();
  } catch {
    return; // אין דרך למדוד בלי לשונית — הקורא ימשיך לראות "לא מבוסס"
  }
  try {
    await ensureGmf(scratch);
  } catch { /* מדידה שנכשלה — נשאר "לא מבוסס", לא זורקים */ }
  finally {
    await scratch.close().catch(() => {});
  }
}

/**
 * ‼ שכבת הייצוג היא היחידה עם אישור אוטומטי: אם הטופס כבר מלא (Chrome),
 * מנסים לאשר פעם אחת. attemptRepresentationLoginConfirm לא קורא/מקליד
 * סיסמה בעצמו — רק בודק ולוחץ על כפתור מזוהה מבנית. תוצאה לא-חיובית לא
 * מנוסה שוב באותו סבב. ‼ ההתאוששות התחומה חלה על שלב ה**ניווט/סיווג** —
 * לפני שמגיעים בכלל להחלטה אם לנסות אישור אוטומטי, לא אחריה.
 */
export async function ensureRepresentation(page) {
  const initial = await openRepresentationAndCheck(page);
  const r = await ensureWithBoundedRecovery(page, {
    initial, readCurrent: readRepresentationOnCurrentPage, reopen: openRepresentationAndCheck,
  });
  if (r.ready) return { state: 'ready', reasonCode: r.reason, evidenceKind: 'dom_state' };
  if (r.reason === 'login_required') {
    // ‼ שער מחזור-החיים: אישור אוטומטי של סיסמה שמורה מותר רק אחרי ש-GMF
    // אומתה במחזור החיים הזה (ראה connectionMonitor.isShaamLifecycleEstablished).
    // במחזור חדש הרו"ח מקים את החיבור בעצמו קודם; הטופס לא נלחץ.
    if (!isShaamLifecycleEstablished()) {
      await refreshLifecycleIfStale(page);
    }
    if (!isShaamLifecycleEstablished()) {
      return { state: 'human_required', reasonCode: 'bootstrap_required', evidenceKind: 'dom_state' };
    }
    const confirm = await attemptRepresentationLoginConfirm(page);
    if (confirm.ok) return { state: 'ready', reasonCode: 'confirmed_autofill', evidenceKind: 'dom_state' };
    return { state: 'human_required', reasonCode: confirm.reason ?? 'login_required', evidenceKind: 'dom_state' };
  }
  return { state: 'unavailable', reasonCode: r.reason ?? 'unknown_screen', evidenceKind: 'dom_state' };
}

const ADAPTERS = { gmf: ensureGmf, vat: ensureVat, nikui: ensureNikui, representation: ensureRepresentation };

/**
 * מריץ ensure לרשימת capabilities נתונה, על אותה לשונית שע״ם (page).
 * לא עוצר בראשון שדורש אדם — ממשיך לבדוק את השאר, ומעדכן progress עמיד
 * (CAS על revision) אחרי כל צעד כדי ש-PIVO יראה "N מתוך M מוכנות" בזמן אמת
 * וידע לבטל בין capabilities (cancel_requested).
 *
 * ‼ משמש גם ל-warm-up מלא (כל הרשימה) וגם ל-ensureCapability נקודתי
 * (רשימה של פריט אחד) — אותו קוד בדיוק. זה כל הרעיון של המנגנון המשותף.
 * ‼ ctx.job הוא שורת ה-job המלאה (id/progress/revision), לא רק ה-input —
 * ראה index.mjs: runJob מעביר את זה במפורש כדי שאפשר יהיה לכתוב CAS.
 */
export async function runCapabilities(ctx, page, capabilities) {
  const { job, workerId } = ctx;
  const list = (capabilities?.length ? capabilities : DEFAULT_CAPABILITIES)
    .filter((c) => ADAPTERS[c]);

  const progress = {
    ...(job.progress ?? {}),
    capabilities: { ...(job.progress?.capabilities ?? {}) },
  };
  let revision = job.revision ?? 0;
  let cancelled = false;

  for (const capability of list) {
    // ‼ "דלג כרגע" — capability שסומנה deferred (מהדפדפן, defer_job_capability)
    // לא נבדקת שוב באותו job.
    if (progress.capabilities[capability]?.state === 'deferred') continue;

    if (await isOnWorkScreen(page)) {
      ctx.log('דילוג על יתר ה-capabilities: הדפדפן עומד על מסך שנפתח עבור הרו"ח');
      break;
    }

    const evidence = await ADAPTERS[capability](page);
    progress.capabilities[capability] = { ...evidence, observedAt: new Date().toISOString() };
    ctx.log(`capability ${capability}: ${evidence.state} (${evidence.reasonCode})`);

    const saved = await updateJobProgress(workerId, job.id, revision, progress);
    if (saved?.ok) {
      revision = saved.job.revision;
      cancelled = !!saved.job.cancel_requested;
    } else if (saved?.error === 'revision_conflict') {
      // ‼ גרסה חדשה יותר כבר נכתבה (למשל "דלג כרגע" מהדפדפן) — מוותרים על
      // הכתיבה הזאת בלי לדרוס אותה, וממשיכים עם ההתקדמות המקומית.
      ctx.log('עדכון התקדמות התנגש בגרסה קיימת — לא דורס, ממשיך');
    } else {
      ctx.log(`עדכון התקדמות נכשל: ${saved?.error ?? 'unknown'}`);
    }

    if (cancelled) {
      ctx.log('בקשת ביטול זוהתה — עוצר בין capabilities, לא באמצע אחת');
      break;
    }
  }

  return { progress, revision, cancelled };
}

/** capability הראשונה שדורשת אדם ברשימה, לצורך בניית הודעת needs_human מסכמת. */
export function firstHumanRequired(progress, capabilities) {
  const list = capabilities?.length ? capabilities : DEFAULT_CAPABILITIES;
  return list.find((c) => progress?.capabilities?.[c]?.state === 'human_required') ?? null;
}

export function anyReady(progress, capabilities) {
  const list = capabilities?.length ? capabilities : DEFAULT_CAPABILITIES;
  return list.some((c) => progress?.capabilities?.[c]?.state === 'ready');
}

/** deferred נחשבת "טופלה" לצורך full/partial — המשתמש בחר לדלג, לא כשל. */
export function allSettled(progress, capabilities) {
  const list = capabilities?.length ? capabilities : DEFAULT_CAPABILITIES;
  return list.every((c) => {
    const st = progress?.capabilities?.[c]?.state;
    return st === 'ready' || st === 'deferred';
  });
}
