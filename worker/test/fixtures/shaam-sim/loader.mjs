// loader.mjs — מחליף את נקודות המגע עם העולם (Chrome, רשת, Windows) בסימולציה,
// רק כשהן מיובאות מקוד העובד. הקבצים בתיקייה הזו עצמם מקבלים את האמיתיים.
const FAKE = new Set(['browserSession.mjs', 'btlSession.mjs', 'apiClient.mjs', 'hostActivity.mjs', 'chromePasswordPicker.mjs']);
const SIM_DIR = new URL('./', import.meta.url).href;

export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  const name = r.url.split('/').pop();
  const fromSim = (context.parentURL ?? '').startsWith(SIM_DIR);
  if (FAKE.has(name) && r.url.includes('/worker/src/') && !fromSim) {
    return { ...r, url: new URL(name, SIM_DIR).href, shortCircuit: true };
  }
  return r;
}
