// chromePasswordPicker.mjs (סימולציה) — החלונית של Chrome היא world.
import { simPickSavedPassword } from './world.mjs';
export { SHAAM_PROFILE_MARKER, isPickableUsername, parsePickOutput } from '../../../src/chromePasswordPicker.mjs';
export const pickSavedPassword = simPickSavedPassword;
export async function bringChromeToForeground() { return 'foreground'; }
