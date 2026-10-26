// paperlessSetupClient.mjs — «הקמה בפייפרלס»: מה שגיא עושה בסרטון «פייפרלס עסק חדש».
//   1. בכרטיס העוסק אצל המשרד: מספר עוסק (ת״ז) ושם העסק — רק אם ריקים.
//   2. בעסק של המשרד ← ריטיינר: «משיכת עוסקים» אם הלקוח עוד לא בטבלה.
//   3. אמצעי תשלום ← «סליקת אשראי», והסכום מההסכם (לפני מע״מ וכולל מע״מ).
//   4. קריאה חוזרת של הטבלה — התוצאה היא מה שנראה בפועל, לא מה שניסינו.
//
// ‼ פעולה משנה (304 · is_external_mutation_action): ניסיון אחד. הסימן
// externalAttempt נרשם **לפני** הכתיבה הראשונה; נקטע אחריו ⇒ «לא ידוע אם נשמר»,
// ואז «בדיקת כרטיס» (קריאה) מכריעה מה נשמר — לא ניסיון חוזר עיוור.
// ‼ לא דורסים: ת״ז/שם קיימים לא משתנים; אמצעי תשלום אחר או סכום אחר ⇒ conflict
// בתוצאה, בלי לגעת (אלא אם המשרד ביקש «עדכן לסכום שבהסכם» — input.overrideAmount).
import { updateJobProgress } from '../apiClient.mjs';
import {
  detachPaperless, ensureBusiness, ensureOffice, openRetainer, retainerRow, pullDealers,
  setCreditPayment, setRetainerAmount, readDealers, openDealer, editDealerField,
} from '../paperlessSession.mjs';
import { observationFrom, findRetainerClient, retainerPlan, matchDealer, sameId } from '../paperlessModel.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { connectPaperless, translatePaperlessError } from './paperlessCommon.mjs';

export const actionType = 'paperless.setup_client';

export async function preflight() {
  return { ok: true };
}

/** כמה עוסקים לא מקושרים פותחים לכל היותר כדי למצוא לפי ת״ז (כל פתיחה ≈ 2 שנ׳). */
const MAX_DEALER_PROBES = 15;

export async function run(ctx, input) {
  const idNumber = String(input?.idNumber ?? '').replace(/\D/g, '');
  const before = Number(input?.monthlyBeforeVat);
  const withVat = Number(input?.monthlyWithVat);
  if (!idNumber) throw new PermanentError('אין מספר זהות ללקוח הזה בכרטיס.', 'missing_id_number');
  if (!(before > 0) || !(withVat > 0)) throw new PermanentError('אין סכום חודשי בהסכם החתום.', 'no_signed_amount');
  if (ctx.job.progress?.externalAttempt) {
    throw new NeedsHumanError(
      'ההקמה הקודמת נקטעה אחרי שהתחילה לכתוב בפייפרלס. לא מריץ שוב — «בדוק עכשיו» יראה מה נשמר.',
      'external_outcome_unknown',
    );
  }

  let rev = ctx.job.revision ?? 0;
  let marked = false;
  const progress = { ...(ctx.job.progress ?? {}) };
  /** ‼ לפני הכתיבה הראשונה. לא נרשם ⇒ לא כותבים. */
  const markExternal = async (stageKey) => {
    // בדיקה חיה על לקוח שכבר הוקם: כל ניסיון כתיבה נעצר כאן, לפני שנגע בפייפרלס.
    if (process.env.PAPERLESS_DRY_RUN === '1') throw new PermanentError(`הרצת ניסיון — הייתה כתיבה בשלב ${stageKey}`, 'dry_run_would_write');
    progress.stage = stageKey;
    if (!marked) progress.externalAttempt = { at: new Date().toISOString(), stage: stageKey };
    const r = await updateJobProgress(ctx.workerId, ctx.job.id, rev, progress).catch(() => null);
    if (r?.ok && r.job) rev = r.job.revision ?? rev + 1;
    if (!marked && !r?.ok) {
      throw new NeedsHumanError(
        'לא הצלחתי לרשום את תחילת ההקמה, ולכן לא כתבתי כלום בפייפרלס. בדקו את החיבור לאינטרנט ונסו שוב.',
        'progress_write_failed_before_external',
      );
    }
    marked = true;
  };

  const did = { idNumber: false, businessName: false, pulled: false, payment: false, amount: false };
  const conn = await connectPaperless(ctx);
  const { browser, page } = conn;
  let params = conn.params;
  let stage = { key: 'retainer_read', label: 'קריאת טבלת הריטיינר' };
  try {
    // ── 1 · מי כבר בריטיינר ──────────────────────────────────────────────
    params = await ensureBusiness(page, params);
    let { clients, fees } = await openRetainer(page);
    let found = findRetainerClient(clients, idNumber);
    if (found.ambiguous) throw new PermanentError(`בטבלת הריטיינר יש כמה לקוחות עם ת״ז ${idNumber}.`, 'paperless_ambiguous_client');

    // ── 2 · העוסק אצל המשרד ──────────────────────────────────────────────
    stage = { key: 'dealer', label: 'איתור העוסק ברשימת העוסקים' };
    params = await ensureOffice(page, params);
    const dealers = await readDealers(page);
    let dealer = null;
    let u2 = null;
    if (found.client?.sPLID) {
      dealer = dealers.find(d => d.sID === found.client.sPLID) ?? null;
      if (dealer) u2 = await openDealer(page, dealer);
    } else {
      const linked = new Set(clients.map(c => c.sPLID).filter(Boolean));
      const candidates = dealers.filter(d => !d.bIsPersonal && !linked.has(d.sID)).slice(0, MAX_DEALER_PROBES);
      const detailed = [];
      for (const d of candidates) {
        const card = await openDealer(page, d);
        detailed.push({ ...d, sBusinessNumber: card?.sBusinessNumber ?? '', sBusinessName: card?.sBusinessName ?? d.sBusinessName, _card: card });
        await readDealers(page);
      }
      const m = matchDealer(detailed, { idNumber, firstName: input.firstName, lastName: input.lastName });
      if (m.ambiguous) throw new PermanentError('ברשימת העוסקים יש יותר מעוסק אחד שמתאים ללקוח הזה — לא בוחר לבד.', 'paperless_ambiguous_dealer');
      dealer = m.dealer;
      if (dealer) { ctx.log(`נמצא עוסק לפי ${m.by === 'id' ? 'ת״ז' : 'שם'}`); u2 = await openDealer(page, dealer); }
    }
    if (!dealer || !u2) {
      throw new PermanentError(
        'הלקוח עוד לא מופיע ברשימת העוסקים של המשרד בפייפרלס. ייתכן שההרשמה לא הושלמה, או שנרשם עם שם אחר. ' +
        'כשהוא יופיע — «הקם בפייפרלס».',
        'paperless_dealer_not_found',
      );
    }

    // ── 3 · ת״ז ושם עסק — רק כשריקים ──────────────────────────────────────
    stage = { key: 'dealer_fields', label: 'מספר עוסק ושם העסק' };
    const currentNumber = String(u2.sBusinessNumber ?? '').replace(/\D/g, '');
    if (!currentNumber) {
      await markExternal('id_number');
      did.idNumber = await editDealerField(page, 'מספר עוסק', 'sBusinessNumber', idNumber);
      ctx.log(`מספר עוסק ${did.idNumber ? 'הוזן' : 'לא אומת אחרי השמירה'}`);
    } else if (!sameId(currentNumber, idNumber)) {
      throw new PermanentError('בכרטיס העוסק בפייפרלס כבר רשום מספר עוסק אחר — לא משנה אותו.', 'paperless_id_mismatch');
    }
    let dealerName = String(u2.sBusinessName ?? '').trim();
    if (!dealerName && input.businessName) {
      await markExternal('business_name');
      did.businessName = await editDealerField(page, 'שם העסק', 'sBusinessName', input.businessName);
      if (did.businessName) dealerName = String(input.businessName);
    }

    // ── 4 · ריטיינר: משיכה, אמצעי תשלום, סכום ─────────────────────────────
    stage = { key: 'pull', label: 'משיכת עוסקים' };
    await readDealers(page);                              // חזרה לרשימה — תפריט המשרד גלוי
    params = await ensureBusiness(page, params);
    ({ clients, fees } = await openRetainer(page));
    found = findRetainerClient(clients, idNumber);
    if (!found.client?.sPLID) {
      await markExternal('pull_dealers');
      await pullDealers(page);
      did.pulled = true;
      ({ clients, fees } = await openRetainer(page));
      found = findRetainerClient(clients, idNumber);
      if (!found.client) throw new PermanentError('אחרי «משיכת עוסקים» הלקוח עדיין לא בטבלת הריטיינר.', 'paperless_pull_did_not_link');
    }

    stage = { key: 'retainer', label: 'אמצעי תשלום וסכום' };
    let row = await retainerRow(page, found.client.sBusinessName);
    if (!row.row) throw new PermanentError(`לא נמצאה שורה אחת בשם «${found.client.sBusinessName}» בטבלת הריטיינר.`, 'paperless_row_not_found');
    let observed = observationFrom({ clientsAll: clients, fees, idNumber, row, dealer: { ...u2, sBusinessName: dealerName } });
    const plan = retainerPlan(observed, { monthlyBeforeVat: before, overrideAmount: !!input.overrideAmount });
    if (plan.conflict) {
      ctx.log(`לא דורס: בפייפרלס ${plan.conflict.paperlessBeforeVat ?? '—'} (${plan.conflict.paperlessPayment}), בהסכם ${before}`);
      return { result: { observed, did, conflict: plan.conflict } };
    }
    if (plan.setPayment) {
      await markExternal('payment');
      await setCreditPayment(row.row);
      did.payment = true;
      ({ clients, fees } = await openRetainer(page));
      row = await retainerRow(page, found.client.sBusinessName);
    }
    if (plan.setAmount) {
      await markExternal('amount');
      await setRetainerAmount(row.row, before, withVat);
      did.amount = true;
      ({ clients, fees } = await openRetainer(page));
      row = await retainerRow(page, found.client.sBusinessName);
    }

    // ── 5 · מה רואים עכשיו ───────────────────────────────────────────────
    observed = observationFrom({ clientsAll: clients, fees, idNumber, row: row.row ? row : null, dealer: { ...u2, sBusinessName: dealerName } });
    const ok = observed.paymentMethod === 'credit' && Math.abs((observed.amountBeforeVat ?? -1) - before) < 0.01;
    ctx.log(`פייפרלס אחרי ההקמה: תשלום=${observed.paymentMethod} · סכום=${observed.amountBeforeVat} · ${ok ? 'אומת' : 'לא אומת'}`);
    if (!ok) {
      throw new PermanentError(
        'ההקמה הסתיימה אבל בקריאה החוזרת הריטיינר לא מראה סליקת אשראי בסכום שבהסכם. «בדוק עכשיו» יראה מה נשמר.',
        'paperless_verify_failed',
      );
    }
    return { result: { observed, did } };
  } catch (e) {
    throw translatePaperlessError(e, page, stage);
  } finally {
    await detachPaperless(browser);
  }
}
