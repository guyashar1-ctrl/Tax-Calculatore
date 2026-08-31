// apiClient.mjs — עטיפה דקה לארבע הפעולות של automation-worker edge function.
// שום גישה ישירה למסד — הכול עובר דרך ה-HTTP הזה, מאומת ב-x-worker-secret.
import { FUNCTION_URL, WORKER_SECRET } from './config.mjs';

async function call(body) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': WORKER_SECRET },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `bad_response_${res.status}` }));
  return data;
}

export const claim = (userId, workerId, actionTypes, leaseSeconds) =>
  call({ op: 'claim', userId, workerId, actionTypes, leaseSeconds });

export const heartbeat = (userId, workerId, jobId, leaseSeconds, workerVersion) =>
  call({ op: 'heartbeat', userId, workerId, jobId, leaseSeconds, workerVersion });

export const complete = (workerId, jobId, result, artifacts) =>
  call({ op: 'complete', workerId, jobId, result, artifacts });

export const fail = (workerId, jobId, errorCode, errorDetail, needsHuman) =>
  call({ op: 'fail', workerId, jobId, errorCode, errorDetail, needsHuman });
