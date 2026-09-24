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
  fillContactDetails, capturePdf, fetchGeneratedForm,
  findRequestRows, createPreflightDecision,
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
  return { submissionKey, role, entityId, birthDate, systems, secondary: input.secondary, personName };
}

/**
 * התלויות של ההרצה — דפדפן, מסכי שע״ם, שמירה. ‼ קיים כדי שהבדיקות יריצו את
 * **הזרימה עצמה** (מה נקרא, מה נעצר, כמה פעמים נוצר) בלי דפדפן ובלי רשות.
 */
export const DEFAULT_DEPS = {
  attach, detach, detectBlockingSignal, openRepresentationSystem, findRequestRows, startNewRequest, verifyEntity, readExistingRepresentations, selectRequestedSystems, confirmSystemsStep, fillContactDetails, capturePdf, fetchGeneratedForm, putDocument, captureDiagnostics, progressTracker,
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
          requestNumber: rows.find(r => r.requestNumber)?.requestNumber ?? '',
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

    const started = await d.startNewRequest(page, v.entityId);
    if (!started.ok) {
      if (started.reason === 'entity_mismatch') {
        throw new PermanentError(
          `מסך הבקשה החדשה כבר מכיל ישות אחרת (${started.current}). סגרו את המסך בשע״ם והריצו שוב.`,
          'entity_mismatch',
        );
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
    });
    if (!verified.ok) {
      const signal = await d.detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'אימות הישות בשע״ם');
      if (verified.reason === 'verification_rejected') {
        throw new NeedsHumanError(
          'שע״ם לא אישרה את פרטי אימות הישות. המערכת לא תנסה שוב מעצמה — ' +
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
    await progress.set({ requestNumber, stage: 'request_created' });

    // ── פרטי התקשרות + לכידת הטופס שמופק ─────────────────────────────────
    let captured = null;
    const contact = await d.capturePdf(
      page,
      async () => {
        const r = await d.fillContactDetails(page, { spousePhone: input?.spousePhone });
        captured = r;
      },
      { timeoutMs: 45000 },
    );
    if (!captured?.ok) {
      if (captured?.reason === 'spouse_phone_required_but_missing') {
        throw new NeedsHumanError(
          'שע״ם מבקשת מספר טלפון של בן/בת הזוג, והוא אינו קיים בכרטיס. ' +
          'השלימו אותו בפרטי הקשר של הלקוח והריצו שוב — המערכת לא ממציאה מספר.',
          'missing_spouse_phone',
        );
      }
      throw navFailure('פרטי התקשרות', captured ?? { reason: 'contact_step_failed' });
    }

    const form = await d.fetchGeneratedForm(page, { alreadyCaptured: contact });
    if (!form.ok) {
      // ‼ הבקשה כבר נוצרה — לכן זו **לא** שגיאה סופית: הטופס ניתן להבאה
      // בניסיון חוזר, שיתחיל מהשלב הנכון בזכות requestNumber שנשמר.
      throw new NeedsHumanError(
        `הבקשה נפתחה בשע״ם (${requestNumber}), אבל לא הצלחתי להביא את טופס ייפוי הכוח (${form.reason}). ` +
        'פתחו את הבקשה בשע״ם, ודאו שהטופס הופק, והריצו שוב.',
        'form_not_captured',
      );
    }

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
      },
      artifacts: [{ kind: 'poa_form', documentId, fileName, source: form.source }],
    };
  } finally {
    await d.detach(conn.browser);
  }
}
