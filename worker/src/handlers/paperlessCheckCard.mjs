// paperlessCheckCard.mjs — «בדיקת כרטיס»: קריאה בלבד בטבלת הריטיינר.
// האם הלקוח הזין כרטיס (כ״א), מה מוגדר לו (אמצעי תשלום וסכום), והאם חודש כבר חויב.
// ‼ שום דבר לא נכתב לפייפרלס. התצפית חוזרת ל-result.observed, והשרת (304) מתרגם
// אותה לסימונים — כולל «לא ידוע אם נשמר» אחרי הקמה שנקטעה.
import { detachPaperless, ensureBusiness, openRetainer, retainerRow } from '../paperlessSession.mjs';
import { observationFrom, findRetainerClient } from '../paperlessModel.mjs';
import { PermanentError } from '../errors.mjs';
import { connectPaperless, translatePaperlessError } from './paperlessCommon.mjs';

export const actionType = 'paperless.check_card';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  const idNumber = String(input?.idNumber ?? '').replace(/\D/g, '');
  if (!idNumber) throw new PermanentError('אין מספר זהות ללקוח הזה בכרטיס.', 'missing_id_number');

  const { browser, page, params } = await connectPaperless(ctx);
  let stage = { key: 'business', label: 'מעבר לעסק של המשרד' };
  try {
    await ensureBusiness(page, params);
    stage = { key: 'retainer', label: 'קריאת טבלת הריטיינר' };
    const { clients, fees } = await openRetainer(page);
    const found = findRetainerClient(clients, idNumber);
    if (found.ambiguous) {
      throw new PermanentError(`בטבלת הריטיינר יש כמה לקוחות עם ת״ז ${idNumber} — לא מסיק כלום בלי בירור.`, 'paperless_ambiguous_client');
    }
    const row = found.client ? await retainerRow(page, found.client.sBusinessName) : null;
    const observed = observationFrom({ clientsAll: clients, fees, idNumber, row: row?.row ? row : null });
    ctx.log(`פייפרלס: ${found.client ? 'נמצא בריטיינר' : 'לא בריטיינר'} · תשלום=${observed.paymentMethod ?? '—'} · `
      + `סכום=${observed.amountBeforeVat ?? '—'} · כרטיס=${observed.cardEntered ? 'הוזן' : 'לא'} · חויב=${observed.chargedPeriods?.join(',') || '—'}`);
    return { result: { observed } };
  } catch (e) {
    throw translatePaperlessError(e, page, stage);
  } finally {
    await detachPaperless(browser);
  }
}
