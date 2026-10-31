// paperlessReadPending.mjs — «בדיקת ממתינים» בהנהלת חשבונות: טבלת כל הממתינים של המשרד.
// ‼ קריאה בלבד, בלי AI: מי ממתין וכמה. הסיווג והקליטה — בשיחת Claude, לא כאן.
import { detachPaperless, ensureOffice, openPendingTable } from '../paperlessSession.mjs';
import { parsePendingRows } from '../paperlessModel.mjs';
import { connectPaperless, translatePaperlessError } from './paperlessCommon.mjs';

export const actionType = 'paperless.read_pending';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  const { browser, page, params } = await connectPaperless(ctx);
  let stage = { key: 'office', label: 'מעבר להקשר המשרד' };
  try {
    await ensureOffice(page, params);
    stage = { key: 'pending', label: 'קריאת טבלת הממתינים' };
    const { rows, badge, filterText } = await openPendingTable(page);
    const parsed = parsePendingRows(rows);
    ctx.log(`פייפרלס: ממתינים נקראו · ${parsed.clients.length} לקוחות · ${parsed.total} מסמכים · בתפריט ${badge ?? '—'}`);
    return { result: { readAt: new Date().toISOString(), pending: { ...parsed, badge, filtered: !!filterText } } };
  } catch (e) {
    throw translatePaperlessError(e, page, stage);
  } finally {
    await detachPaperless(browser);
  }
}
