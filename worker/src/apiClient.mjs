// apiClient.mjs — עטיפה דקה לארבע הפעולות של automation-worker edge function.
// שום גישה ישירה למסד — הכול עובר דרך ה-HTTP הזה, מאומת ב-x-worker-secret.
import { FUNCTION_URL, WORKER_SECRET, WORKER_TOKEN, WORKER_ID, INSTANCE_ID } from './config.mjs';

/**
 * 203 · אסימון המחשב (מועדף) — השרת גוזר ממנו חשבון וזהות. בלעדיו: הסוד
 * המשותף הישן, רק לזהות שעוד לא נרשמה. המופע נשלח תמיד.
 */
export function authHeaders() {
  const h = { 'content-type': 'application/json', 'x-worker-instance': INSTANCE_ID };
  if (WORKER_TOKEN) { h['x-worker-id'] = WORKER_ID; h['x-worker-token'] = WORKER_TOKEN; }
  else h['x-worker-secret'] = WORKER_SECRET;
  return h;
}

async function call(body) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: authHeaders(),
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

/** מצב חיבור לרשויות — דגלים בלבד. לעולם לא עוגיות/טוקנים/PIN. */
export const reportStatus = (userId, workerId, status) =>
  call({ op: 'status', userId, workerId, status });

/**
 * 194 · שמירת מסמך בתיק הלקוח של ה-job שהעובד מחזיק עכשיו.
 * ‼ הגבול: ה-edge function מאמת מול automation_job_document_context שה-job
 * בבעלות העובד ורץ. אין כאן שום גישה כללית למסמכים.
 */
export const putDocument = (workerId, jobId, doc) =>
  call({
    op: 'put_document', workerId, jobId,
    documentId: doc.documentId, fileName: doc.fileName,
    contentBase64: doc.buffer.toString('base64'),
    description: doc.description, linkedTo: doc.linkedTo, linkedLabel: doc.linkedLabel,
  });

/** 194 · קריאת מסמך של אותו לקוח — לשידור הטופס החתום חזרה לשע״ם. */
export const getDocument = async (workerId, jobId, documentId) => {
  const r = await call({ op: 'get_document', workerId, jobId, documentId });
  if (!r?.ok) return r;
  return { ...r, buffer: Buffer.from(r.contentBase64, 'base64') };
};

// ‼ 168: התקדמות עמידה לפי capability (warmupManager.mjs) — CAS על revision,
// כדי ש-worker "זומבי" שהחכירה שלו פקעה לא ידרוס עדכון של המחזיק הנוכחי.
export const updateJobProgress = (workerId, jobId, expectedRevision, progress) =>
  call({ op: 'progress', workerId, jobId, expectedRevision, progress });

// ‼ 170: אין כאן עטיפה ל-resolve_needs_human — חידוש needs_human עמיד קורה
// עכשיו בתוך report_worker_status עצמה (RPC), נגזר מהסטטוס שכבר נכתב, בלי
// זיכרון תוך-תהליכי. ה-op/RPC resolve_needs_human עדיין קיימים במסד כפרימיטיב
// זמין (למשל לכפתור "נסה עכשיו" ידני עתידי), אך אינם בשימוש בנתיב האוטומטי.
