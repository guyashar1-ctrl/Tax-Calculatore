// apiClient.mjs (סימולציה) — בלי רשת. reportStatus נאסף ל-world.reports.
import { world } from './world.mjs';
export const authHeaders = () => ({});
export const claim = async () => ({ ok: true, job: null });
export const heartbeat = async () => ({ ok: true });
export const complete = async () => ({ ok: true });
export const fail = async () => ({ ok: true });
export const reportStatus = async (userId, workerId, status) => { world.reports.push(status); return { ok: true, resumed: [] }; };
export const putDocument = async () => ({ ok: true });
export const getDocument = async () => null;
export const updateJobProgress = async (workerId, jobId, revision) => ({ ok: true, job: { revision: revision + 1, cancel_requested: false } });
