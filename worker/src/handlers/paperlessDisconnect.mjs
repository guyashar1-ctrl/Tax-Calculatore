// paperlessDisconnect.mjs — «התנתק» בכותרת (306): סוגר את חלון הפייפרלס הייעודי בלבד.
import { closeDedicatedPaperlessChrome } from '../paperlessSession.mjs';

export const actionType = 'paperless.disconnect';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  ctx.log('סוגר את חלון Chrome הייעודי של פייפרלס');
  const closed = closeDedicatedPaperlessChrome();
  return { result: { connected: false, system: 'paperless', closed } };
}
