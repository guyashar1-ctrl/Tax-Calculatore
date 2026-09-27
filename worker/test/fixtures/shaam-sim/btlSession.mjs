// btlSession.mjs (סימולציה) — אין חלון ב״ל בסימולציה.
export * from '../../../src/btlSession.mjs';
export async function attachBtl() { return { ok: false, reason: 'not_running' }; }
export async function detachBtl() {}
