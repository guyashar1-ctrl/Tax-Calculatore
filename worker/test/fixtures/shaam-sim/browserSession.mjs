// browserSession.mjs (סימולציה) — כל הפונקציות האמיתיות, חוץ מהחיבור ל-Chrome
// עצמו: attach מחזיר את הלשונית המדומה, ו'blocked' כשדיאלוג האישור פתוח.
import { world, context, SimPage } from './world.mjs';

export * from '../../../src/browserSession.mjs';

export async function attach() {
  if (world.chrome === 'closed') return { ok: false, reason: 'not_running', detail: 'sim' };
  if (world.chrome === 'dialog') return { ok: false, reason: 'blocked', detail: 'sim' };
  if (!world.pages.length) world.pages.push(new SimPage());
  return { ok: true, browser: null, page: world.pages[0], context };
}

export async function detach() {}

export function launchDedicatedChrome() {
  world.chrome = 'dialog';
  world.pages = [new SimPage('/taxes-login/login/otpCts')];
  return { ok: true };
}

export async function focusShaamWindow() {}
export function closeDedicatedChrome() { world.chrome = 'closed'; world.pages = []; return true; }
