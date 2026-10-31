// paperlessReadRetainer.mjs — «בדיקה בפייפרלס» בגבייה: כל טבלת הריטיינר בקריאה אחת.
// לכל לקוח: כרטיס, סכום, והחודשים שחויבו; ולמעלה — חודש הגבייה הנוכחי בריטיינר.
// ‼ קריאה בלבד: אין לחיצה על הרצה, על «חודש הבא» או על שינוי סכום/אמצעי תשלום.
import { detachPaperless, ensureBusiness, openRetainer } from '../paperlessSession.mjs';
import { retainerSnapshot } from '../paperlessModel.mjs';
import { connectPaperless, translatePaperlessError } from './paperlessCommon.mjs';

export const actionType = 'paperless.read_retainer';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  const { browser, page, params } = await connectPaperless(ctx);
  let stage = { key: 'business', label: 'מעבר לעסק של המשרד' };
  try {
    await ensureBusiness(page, params);
    stage = { key: 'retainer', label: 'קריאת טבלת הריטיינר' };
    const { clients, fees, period, invoiceDate } = await openRetainer(page);
    const snapshot = retainerSnapshot({ clients, fees, period, invoiceDate });
    ctx.log(`פייפרלס: ריטיינר נקרא · חודש ${snapshot.period ?? '—'} · ${snapshot.clients.length} לקוחות · `
      + `${snapshot.clients.filter(c => c.cardEntered).length} עם כרטיס`);
    return { result: { readAt: new Date().toISOString(), retainer: snapshot } };
  } catch (e) {
    throw translatePaperlessError(e, page, stage);
  } finally {
    await detachPaperless(browser);
  }
}
