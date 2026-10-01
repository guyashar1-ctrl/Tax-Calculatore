// shaamCreateRepresentation.mjs — «הזן את הפרטים בשע״ם»: פותח בקשת ייצוג
// חדשה במערכת רישום הייצוג ומביא ממנה את טופס 2279 שנוצר.
//
// ‼ מה שהפעולה הזו **לא** עושה, ובכוונה:
//   · לא מחליטה אילו מערכים לבקש. הרשימה מגיעה ב-input מ-PIVO («חובת ייצוג
//     מול»), והעובד מסמן בדיוק אותה. שורה שלא נמסרה — לא נוגעים בה.
//   · לא משלימה נתון חסר. preflight בדפדפן כבר עצר על מה שחסר; כאן
//     הבדיקה חוזרת כקו הגנה שני, ולעולם לא כניחוש.
//   · לא מנסה אימות ישות פעמיים. דחייה = עצירה. ניסיונות חוזרים מול רשות
//     עלולים לחסום את המשתמש, והמחיר של חסימה גבוה מהמחיר של עצירה.
//   · לא שולחת דבר ללקוח ולא לוחצת «שליחה ללקוח».
//
// ‼ אידמפוטנטיות — ארבע רמות, כמו ב-btlCreateRepresentation:
//   1. `automation_jobs_open_unique` (150) — משימה פתוחה אחת לכל (לקוח, סוג).
//   2. `input.existingRequestNumber` — ל-PIVO כבר יש מספר בקשה ⇒ לא יוצרים שנייה.
//   3. **בדיקה לפני כל נגיעה** (24.09.2026): רשימת «בקשות בתהליך» נקראת לפי
//      הישות, קריאה בלבד, לפני אימות הישות. נמצאה בקשה ⇒ לא יוצרים, ומדווחים
//      אותה כמו «בדוק קבלת הייצוג». לא ניתן לבסס/לקרוא ⇒ עוצרים. רק רשימה
//      ריקה-בוודאות מתירה להמשיך (createPreflightDecision).
//   3ב. בדיקה חיה במסך שלב 2: «ייצוגים פעילים (N)» ו«בקשות(N)» של אותה ישות.
//   4. checkpoint ב-progress לפני כל פעולה עם תופעת לוואי — אימות הישות
//      ויצירת הבקשה — כדי שקריסה בדיוק שם לא תוביל לניסיון עיוור שני.

import { attach, detach } from '../browserSession.mjs';
import {
  openRepresentationSystem, startNewRequest, verifyEntity,
  readExistingRepresentations, selectRequestedSystems, confirmSystemsStep,
  fillContactDetailsAndCaptureForm, splitShaamPhone,
  findRequestRows, createPreflightDecision, classifyRequestGroup,
} from '../shaamRepresentationSession.mjs';
import { reportedRows, allRowsAccepted } from './shaamCheckRepresentation.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { putDocument } from '../apiClient.mjs';
import {
  progressTracker, assertNotAlreadyAttempted, detectBlockingSignal, blockingError,
  captureDiagnostics, unknownScreenError,
} from '../shaamSafety.mjs';

export const actionType = 'shaam.create_representation';

const NOT_READY =
  'מערכת רישום הייצוג בשע״ם אינה מוכנה. לחצו על "שע״ם" בכותרת, השלימו את ' +
  'ההתחברות (כולל סיסמת מערכת הייצוג), ואז הריצו שוב.';

export async function preflight() {
  return { ok: true };
}

/** כשל ניווט/מילוי: הודעה קריאה + קוד, מהשלב והסיבה שהוחזרו מהשכבה. */
function navFailure(stepLabel, r) {
  const extra = [r.failedAt && `לא נמצא "${r.failedAt}"`, r.detail, r.extra && `נוסף: ${r.extra.join(', ')}`]
    .filter(Boolean).join(' · ');
  return new PermanentError(
    `שלב "${stepLabel}" בשע״ם נכשל (${r.reason ?? 'unknown'})${extra ? ` — ${extra}` : ''}. ` +
    'ייתכן שהמסך השתנה; יש לבדוק ידנית ולעדכן את הקוד לפני ניסיון נוסף.',
    `${r.step ?? 'shaam'}_${r.reason ?? 'failed'}`,
  );
}

export function validate(input) {
  const submissionKey = String(input?.submissionKey ?? '');
  const role = input?.role;
  const entityId = String(input?.entityId ?? '').replace(/\D/g, '');
  const birthDate = String(input?.birthDateDDMMYYYY ?? '').replace(/\D/g, '');
  const systems = Array.isArray(input?.systems) ? input.systems : [];
  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!submissionKey) throw new PermanentError('לא נמסר מפתח הגשה.', 'missing_submission_key');
  if (entityId.length < 5) throw new PermanentError('אין תעודת זהות תקינה לאדם הזה בכרטיס.', 'missing_id_number');
  if (birthDate.length !== 8) {
    throw new PermanentError('חסר תאריך לידה תקין בכרטיס — שע״ם דורש אותו לאימות הישות.', 'missing_birth_date');
  }
  if (!input?.secondary?.type || !String(input.secondary.value ?? '').trim()) {
    throw new PermanentError(
      'חסר אמצעי זיהוי נוסף (ת.ז. הורה / רישיון נהיגה / דרכון) — בלעדיו שע״ם לא מאמתת את הישות.',
      'missing_secondary_identity',
    );
  }
  if (systems.length === 0) {
    throw new PermanentError('לא נמסר אף מערך להזנה בשע״ם.', 'no_systems_requested');
  }
  // ‼ השם הוא ראיית השיוך של הבדיקה שלפני היצירה (attributeRows): בלעדיו
  // שורה ברשימה לא ניתנת לייחוס, ואז גם «אין בקשה» אינו ניתן לקביעה.
  const personName = String(input?.personName ?? '').trim();
  if (!personName) {
    throw new PermanentError(
      'לא נמסר שם האדם — בלעדיו אי אפשר לבדוק בשע״ם אם כבר קיימת לו בקשה, ולכן לא פותחים חדשה.',
      'missing_attribution_evidence',
    );
  }
  for (const s of systems) {
    if (!s?.screenLabel) throw new PermanentError('שורת מערך בלי שם.', 'bad_system_row');
    if (!String(s?.fileNumber ?? '').trim()) {
      throw new PermanentError(`חסר מספר תיק ל-${s.screenLabel} — לא מזינים בלעדיו.`, 'missing_file_number');
    }
  }
  // ‼ 28.09.2026 · שע״ם דורשת במסך פרטי ההתקשרות טלפון של המיוצג (קידומת + 7
  // ספרות) — אלא אם יש לה כבר טלפון מאומת, ואת זה אי אפשר לדעת מראש. המסך הזה
  // בא **אחרי** שהבקשה נוצרה, ולכן בודקים כאן, לפני כל נגיעה בשע״ם.
  const clientPhone = String(input?.clientPhone ?? '').trim();
  if (!splitShaamPhone(clientPhone)) {
    throw new PermanentError(
      `חסר מספר טלפון תקין של ${personName} בכרטיס — שע״ם מבקשת אותו כדי לשלוח ללקוח את הקישור לאישור הייצוג.`,
      'missing_client_phone',
    );
  }
  const spousePhone = String(input?.spousePhone ?? '').trim();
  if (spousePhone && !splitShaamPhone(spousePhone)) {
    throw new PermanentError('מספר הטלפון של בן/בת הזוג בכרטיס אינו תקין — תקנו אותו לפני ההזנה בשע״ם.', 'bad_spouse_phone');
  }
  return {
    submissionKey, role, entityId, birthDate, systems, secondary: input.secondary, personName,
    clientPhone, spousePhone, clientEmail: String(input?.clientEmail ?? '').trim(),
  };
}

/**
 * התלויות של ההרצה — דפדפן, מסכי שע״ם, שמירה. ‼ קיים כדי שהבדיקות יריצו את
 * **הזרימה עצמה** (מה נקרא, מה נעצר, כמה פעמים נוצר) בלי דפדפן ובלי רשות.
 */
export const DEFAULT_DEPS = {
  attach, detach, detectBlockingSignal, openRepresentationSystem, findRequestRows, startNewRequest, verifyEntity, readExistingRepresentations, selectRequestedSystems, confirmSystemsStep, fillContactDetailsAndCaptureForm, putDocument, captureDiagnostics, progressTracker,
};

export async function run(ctx, input, deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const v = validate(input);

  // ‼ קו הגנה שני נגד כפילות.
  if (input?.existingRequestNumber) {
    throw new PermanentError(
      `כבר קיימת בקשת ייצוג בשע״ם (${input.existingRequestNumber}) עבור ההגשה הזאת — לא נפתחת בקשה נוספת.`,
      'already_exists',
    );
  }
  // ‼ 23.09.2026 · אותו כלל כשהבקשה נמצאה בשע״ם בלי מספר (שורות משויכות
  // מ«בדוק קבלת הייצוג»). נבדק **לפני** כל פנייה לשע״ם: בלי זה, מסך ישן
  // היה מגיע עד אימות הישות — פנייה חיצונית אמיתית — לפני ש-openRequestCount
  // עוצר.
  if (input?.alreadyFoundInShaam === true) {
    throw new PermanentError(
      'הבקשה כבר נמצאה ברשימת הבקשות בשע״ם עבור ההגשה הזאת — לא נפתחת בקשה נוספת. '
      + 'להמשך הטיפול: «בדוק קבלת הייצוג».',
      'already_exists',
    );
  }

  // ‼ שער הכניסה: משימה שכבר נגעה בשע״ם אינה מורצת שוב, נקודה. מיגרציה
  // 196 כבר מונעת את התפיסה מחדש; זה קו ההגנה השני.
  const progress = d.progressTracker(ctx);
  assertNotAlreadyAttempted(progress, {
    operation: 'פתיחת בקשת הייצוג',
    howToCheck: 'בדקו בשע״ם אם הבקשה כבר נפתחה. אם כן — הזינו את מספרה, ואל תפתחו בקשה נוספת.',
  });

  const conn = await d.attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');

  try {
    const page = conn.page;

    // ‼ סימן חסימה/אבטחה עוצר לפני שנגענו במשהו.
    const blocked = await d.detectBlockingSignal(page);
    if (blocked) throw blockingError(blocked, 'פתיחת בקשת הייצוג');

    const open = await d.openRepresentationSystem(page);
    if (!open.ok) {
      if (open.reason === 'login_required') throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');
      if (open.reason === 'user_work_screen_open') {
        throw new NeedsHumanError(
          'חלון שע״ם פתוח כרגע על מסך עבודה. סגרו אותו או סיימו את מה שפתוח, ואז הריצו שוב.',
          'user_work_screen_open',
        );
      }
      const diag = await d.captureDiagnostics(page, 'פתיחת מערכת רישום הייצוג');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('פתיחת בקשת הייצוג', 'פתיחת מערכת רישום הייצוג', diag);
    }

    // ── בדיקה לפני יצירה — קריאה בלבד, לפני כל נגיעה ────────────────────
    // ‼ לא נרשם כאן externalAttempt: רשימת «בקשות בתהליך» היא קריאה, וכשל
    // בה אינו «לא ידוע אם נקלט». הסימן נכתב רק לפני אימות הישות.
    const observedAt = new Date().toISOString();
    const found = await d.findRequestRows(page, {
      entityId: v.entityId, expectedClientName: v.personName, expandDetails: true,
    });
    const pre = createPreflightDecision(found);
    ctx.log(`בדיקה לפני יצירה: ${pre.decision}${pre.reason ? ` (${pre.reason})` : ''}${found?.total !== undefined ? ` · שורות לישות=${found.total}` : ''}`);

    if (pre.decision === 'existing') {
      const rows = reportedRows(pre.rows);
      for (const r of rows) ctx.log(`  · ${r.systemLabel}: בקשה="${r.rawRequestState}" מערך="${r.rawSystemState}"`);
      return {
        result: {
          submissionKey: v.submissionKey,
          role: v.role,
          // ‼ הטריגר (202) מזהה את זה ומעדכן כמו בדיקה — בלי createdAt.
          preflight: 'existing_found',
          found: true,
          observedAt,
          rows,
          allAccepted: allRowsAccepted(rows),
          settled: allRowsAccepted(rows) || classifyRequestGroup(pre.rows) === 'settled',
          requestNumber: pre.requestNumber || (rows.find(r => r.requestNumber)?.requestNumber ?? ''),
          note: 'בשע״ם כבר קיימת בקשת ייצוג לאדם הזה — לא נפתחה בקשה נוספת.',
        },
      };
    }
    if (pre.decision === 'ambiguous') {
      throw new NeedsHumanError(
        'ברשימת הבקשות בשע״ם יש שורות לתעודת הזהות הזאת, אבל לא הצלחתי לוודא שהן של האדם הזה ' +
        '(שם שונה, או כמה בקשות). כדי לא ליצור בקשה כפולה — לא נפתחה בקשה ושום דבר לא נשלח לשע״ם. ' +
        'פתחו בשע״ם את «בקשות בתהליך», בדקו מה קיים שם, והמשיכו לפי זה.',
        'preflight_ambiguous',
      );
    }
    if (pre.decision !== 'none') {
      const diag = await d.captureDiagnostics(page, 'בדיקה לפני יצירה');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw new NeedsHumanError(
        'לא הצלחתי לקרוא בוודאות את רשימת הבקשות בשע״ם, ולכן לא ידוע אם כבר קיימת בקשה לאדם הזה. ' +
        'כדי לא ליצור בקשה כפולה — לא נפתחה בקשה ושום דבר לא נשלח לשע״ם. ' +
        'בדקו ב«בקשות בתהליך» בשע״ם, ואז הריצו שוב או סמנו ידנית.',
        'preflight_unreadable',
      );
    }

    // ‼ «המשך» אחרי מספר הישות הוא בדיקה (checkYeshut), לא אימות זהות: שום
    // דבר לא נוצר ושום ניסיון אימות לא נספר. שע״ם עונה כאן אם צריך אימות.
    const started = await d.startNewRequest(page, v.entityId);
    if (!started.ok) {
      if (started.reason === 'entity_mismatch' || started.reason === 'new_request_screen_not_fresh') {
        throw new PermanentError(
          started.reason === 'entity_mismatch'
            ? `מסך הבקשה החדשה כבר מכיל ישות אחרת (${started.current}). סגרו את המסך בשע״ם והריצו שוב.`
            : 'מסך הבקשה החדשה בשע״ם כבר באמצע תהליך. סגרו אותו (או עברו ל«בקשות בתהליך») והריצו שוב.',
          started.reason,
        );
      }
      if (started.reason === 'shaam_manual_handling') {
        throw new NeedsHumanError(
          `שע״ם לא מאפשרת אימות מקוון לישות הזאת: «${started.detail}». לא נפתחה בקשה ולא נוצל אימות. ` +
          'ההחלטה אם להגיש כך (לטיפול מחלקת המייצגים) היא שלכם — המשיכו ידנית בשע״ם.',
          'shaam_manual_handling',
        );
      }
      if (started.reason === 'entity_rejected') {
        throw new NeedsHumanError(
          `שע״ם דחתה את מספר הישות: «${started.detail}». לא נפתחה בקשה ולא נוצל אימות.`,
          'entity_rejected',
        );
      }
      if (started.reason === 'entity_is_corporation') {
        throw new PermanentError('שע״ם מזהה את הישות כתאגיד — האוטומציה מטפלת רק ביחידים. יש להזין ידנית.', 'entity_is_corporation');
      }
      if (started.reason === 'unknown_dialog') {
        throw new NeedsHumanError(`שע״ם הציגה חלונית לא מוכרת בבדיקת הישות: «${started.text}». לא אושרה.`, 'unknown_dialog');
      }
      const diag = await d.captureDiagnostics(page, 'בקשה חדשה');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('פתיחת בקשת הייצוג', 'מסך בקשה חדשה', diag);
    }

    // ── אימות ישות — ניסיון אחד, ולעולם לא שניים ──────────
    // ‼ מכאן והלאה יש תופעת לוואי חיצונית: אימות זהות מול רשות
    // נספר אצלה. רושמים את הנגיעה **לפני** הלחיצה, ולכן קריסה
    // בדיוק כאן תיראה כ«לא ידוע» ולא תורץ שוב (196).
    await progress.markExternalAttempt('verify_entity');
    ctx.log(`מאמת ישות ${v.entityId.slice(0, 4)}#####  ·  ניסיון יחיד`);
    const verified = await d.verifyEntity(page, {
      birthDateDDMMYYYY: v.birthDate,
      secondary: v.secondary,
      needsVerification: started.needsVerification,
    });
    if (!verified.ok) {
      const signal = await d.detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'אימות הישות בשע״ם');
      if (verified.reason === 'verification_input_rejected_on_screen') {
        throw new NeedsHumanError(
          `המסך בשע״ם לא קיבל את פרטי האימות («${verified.detail}») ולכן לא נשלחו לבדיקה — האימות לא נוצל. ` +
          'בדקו את תאריך הלידה ואת אמצעי הזיהוי הנוסף בכרטיס.',
          'verification_input_rejected',
        );
      }
      if (verified.reason === 'verification_rejected') {
        throw new NeedsHumanError(
          `שע״ם לא אישרה את פרטי אימות הישות («${verified.detail ?? ''}»). המערכת לא תנסה שוב מעצמה — ` +
          'ניסיונות חוזרים על אימות זהות עלולים לחסום את המשתמש בשע״ם. ' +
          'יש לבדוק מול הלקוח את תאריך הלידה ואת אמצעי הזיהוי הנוסף (ת.ז. הורה / ' +
          'רישיון נהיגה / דרכון), לעדכן בכרטיס, ורק אז להפעיל שוב ידנית.',
          'entity_verification_failed',
        );
      }
      const diag = await d.captureDiagnostics(page, 'אימות ישות');
      ctx.log('אבחון מסך:', JSON.stringify(diag), '·', verified.reason, verified.detail ?? '');
      throw unknownScreenError('אימות הישות בשע״ם', 'אימות ישות', diag);
    }

    // ── בדיקה חיה: אין כבר ייצוג/בקשה פתוחה לישות הזאת ────────────────────
    const existing = await d.readExistingRepresentations(page);
    ctx.log(`אצל הישות: ייצוגים פעילים=${existing.activeCount} · בקשות פתוחות=${existing.openRequestCount}`);
    // ‼ לא הצלחנו לקרוא את המונה ⇒ **לא** מסיקים «אין בקשה פתוחה». null
    // הוא היעדר ידיעה, וכאן היעדר ידיעה שקול לסיכון לפתוח בקשה כפולה.
    if (existing.openRequestCount === null || existing.openRequestCount === undefined) {
      throw new NeedsHumanError(
        'לא הצלחתי לקרוא בשע״ם כמה בקשות פתוחות כבר קיימות לישות הזאת, ולכן לא פתחתי ' +
        'בקשה חדשה — כדי לא ליצור בקשה כפולה. שום דבר לא נוצר בשע״ם. בדקו במסך אם כבר ' +
        'יש בקשה פתוחה, ורק לפי זה החליטו.',
        'existing_requests_unreadable',
      );
    }
    if (existing.openRequestCount > 0) {
      throw new NeedsHumanError(
        `בשע״ם כבר רשומה בקשת ייצוג פתוחה לישות הזאת (${existing.openRequestCount}). ` +
        'לא נפתחת בקשה נוספת. בדקו בשע״ם במה מדובר — אם זו הבקשה שלנו, המשיכו אותה שם.',
        'open_request_exists',
      );
    }

    // ── בחירת המערכים — בדיוק מה ש-PIVO ביקש ──────────────────────────────
    ctx.log(`מסמן מערכים: ${v.systems.map(s => s.screenLabel).join(', ')}`);
    const selected = await d.selectRequestedSystems(page, v.systems);
    if (!selected.ok) {
      if (selected.reason === 'unrequested_system_checked') {
        throw new PermanentError(
          `במסך שע״ם נשארו מסומנים מערכים שלא התבקשו (${selected.extra.join(', ')}) — לא ממשיכים. ` +
          'נקו את המסך בשע״ם והריצו שוב.',
          'unrequested_system_checked',
        );
      }
      throw navFailure('בחירת מערכים', selected);
    }

    // ‼ checkpoint לפני «אישור» — הרגע שבו הבקשה נוצרת בפועל אצל הרשות.
    await progress.set({ stage: 'systems_confirm' });

    const confirmed = await d.confirmSystemsStep(page);
    if (!confirmed.ok) {
      if (confirmed.reason === 'systems_rejected') {
        throw new NeedsHumanError(
          `שע״ם לא אישרה את פרטי התיקים: «${confirmed.detail}». לא נפתחה בקשה.`,
          'systems_rejected',
        );
      }
      if (confirmed.reason === 'create_outcome_unknown') {
        throw new NeedsHumanError(
          'אישרתי בשע״ם את פתיחת הבקשה, אבל המסך הבא לא הגיע — לא ידוע אם הבקשה נוצרה. ' +
          'אל תפתחו בקשה נוספת: לחצו «בדוק קבלת הייצוג», והיא תאותר לפי תעודת הזהות.',
          'create_outcome_unknown',
        );
      }
      if (confirmed.reason === 'unknown_dialog') {
        throw new NeedsHumanError(
          `שע״ם הציגה חלונית שלא מוכרת לאוטומציה, ולכן לא אושרה: «${confirmed.text}». ` +
          'יש לקרוא אותה בחלון שע״ם ולהחליט ידנית.',
          'unknown_dialog',
        );
      }
      throw navFailure('אישור בקשות ייפוי כוח', confirmed);
    }
    const requestNumber = confirmed.requestNumber;
    ctx.log(`נוצרה בקשה בשע״ם · מספר ${requestNumber}`);

    // ‼ שומרים את המזהה החיצוני **מיד**, לפני כל שלב נוסף: קריסה מכאן
    // והלאה חייבת להשאיר את המספר בידינו, אחרת ניסיון חוזר לא ידע שכבר
    // נוצרה בקשה והיה מנסה ליצור שנייה.
    await progress.set({ requestNumber, stage: 'request_created', ...(confirmed.notice ? { creationNotice: confirmed.notice } : {}), ...(confirmed.attach?.length ? { creationAttach: confirmed.attach } : {}) });

    // ── פרטי התקשרות + לכידת הטופס שמופק ─────────────────────────────────
    // ‼ מכאן הבקשה קיימת בשע״ם. כל עצירה אומרת את זה במפורש, עם המספר.
    const afterCreate = (what, code) => new NeedsHumanError(
      `הבקשה נפתחה בשע״ם (${requestNumber}), אבל ${what}. אל תפתחו בקשה נוספת: השלימו בשע״ם את ` +
      'פרטי ההתקשרות והורידו את הטופס, ואז «העלה טופס וסמן אזורי חתימה» בבקשה ב-PIVO.',
      code,
    );
    const contact = await d.fillContactDetailsAndCaptureForm(page, {
      clientPhone: v.clientPhone, spousePhone: v.spousePhone, clientEmail: v.clientEmail,
    });
    if (!contact?.ok) {
      if (contact?.reason === 'spouse_phone_required_but_missing') {
        throw afterCreate('שע״ם דורשת את הטלפון של בן/בת הזוג (חתימה משותפת) והוא אינו בכרטיס', 'missing_spouse_phone');
      }
      if (contact?.reason === 'client_phone_required_but_missing') {
        throw afterCreate('שע״ם דורשת את הטלפון של המיוצג והוא אינו בכרטיס', 'missing_client_phone');
      }
      if (contact?.reason === 'phone_prefix_not_in_list') {
        throw afterCreate(`הקידומת ${contact.detail} אינה ברשימת הקידומות של שע״ם`, 'phone_prefix_not_in_list');
      }
      if (contact?.reason === 'contact_save_error') {
        throw afterCreate(`שמירת פרטי ההתקשרות נדחתה: «${contact.detail}»`, 'contact_save_error');
      }
      throw afterCreate(`שלב פרטי ההתקשרות נעצר (${contact?.reason ?? 'unknown'}${contact?.detail ? ` — ${contact.detail}` : ''})`, 'contact_step_failed');
    }
    const form = contact.form;
    if (!form?.ok) {
      throw afterCreate(`לא הצלחתי להביא את טופס ייפוי הכוח (${form?.reason ?? 'unknown'})`, 'form_not_captured');
    }
    const captured = contact;

    const documentId = `poa-pdf-${input.requestId}-${v.submissionKey.replace(/[^a-z0-9]+/gi, '-')}`;
    const fileName = input?.formFileName || `ייפוי כוח לחתימה - ${input?.personName || v.entityId}.pdf`;
    const stored = await d.putDocument(ctx.workerId, ctx.job.id, {
      documentId, fileName, buffer: form.buffer,
      description: 'טופס ייפוי כוח - לחתימה',
      linkedTo: `rep:${input.requestId}`,
      linkedLabel: 'ייפוי כוח לחתימה',
    });
    if (!stored?.ok) {
      throw new NeedsHumanError(
        `הבקשה נפתחה בשע״ם (${requestNumber}) והטופס התקבל, אבל שמירתו בתיק הלקוח נכשלה (${stored?.error}). ` +
        'הריצו שוב — הבקשה לא תיווצר פעמיים.',
        'document_store_failed',
      );
    }

    ctx.log(`הטופס נשמר בתיק הלקוח · ${stored.size} בתים · מסמך ${documentId}`);
    return {
      result: {
        submissionKey: v.submissionKey,
        role: v.role,
        requestNumber,
        formDocumentId: documentId,
        formFileName: fileName,
        formBytes: stored.size,
        systems: v.systems.map(s => s.screenLabel),
        spousePhoneAsked: !!captured.spousePhoneAsked,
        // ‼ 28.09 · «לידיעתך» של שלב 2 כמו שהוא — מה שע״ם אמרה שיש לצרף.
        ...(confirmed.notice ? { creationNotice: confirmed.notice } : {}),
        // ‼ 28.09 · «בהמשך תתבקש לצרף» כרשימה — השרת הופך אותה לדרישות המסמכים של הבקשה.
        ...(confirmed.attach?.length ? { creationAttach: confirmed.attach } : {}),
      },
      artifacts: [{ kind: 'poa_form', documentId, fileName, source: form.source }],
    };
  } finally {
    await d.detach(conn.browser);
  }
}
