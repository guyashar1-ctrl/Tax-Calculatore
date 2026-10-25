// certificates413.mjs — הצעד המשותף לקריאה ולהנפקה: מצב שני האישורים, הדפסת העתק, ושמירה.
//
// ‼ כל אישור בתוקף נשמר כ-PDF בתיק הלקוח (put_certificate), וגם «אין אישור» נרשם — כך שורת
// הכרטיס אומרת מה שע״ם אומרת, עם הקובץ כראיה.
import { putCertificate } from './apiClient.mjs';
import { parseIshur, ratesText } from './gmf413.mjs';
import { openCard, printCopy } from './gmf413Session.mjs';

export const CERT_KINDS = ['withholding', 'bookkeeping'];
export const CERT_LABEL = { withholding: 'ניכוי מס במקור', bookkeeping: 'ניהול ספרים' };

/** מה נשלח לשרת על אישור אחד. */
export function certificatePayload(info, extra = {}) {
  return {
    kind: info.kind,
    year: info.year,
    status: info.valid ? 'valid' : 'none',
    statusText: info.statusText,
    validFrom: info.validFrom,
    validUntil: info.validUntil,
    rates: info.rates,
    ratesText: ratesText(info.rates),
    isn: info.isn,
    updatedOn: info.updatedOn,
    entity: info.entity,
    newBusiness: info.newBusiness,
    ...extra,
  };
}

/**
 * פותח כרטיס אחד, מפענח, ואם בתוקף — מדפיס העתק. לא שומר.
 * @returns {{ok:true, info, buffer?:Buffer, body} | {ok:false, reason, text?}}
 */
export async function readOne(work, entity, kind, log) {
  const opened = await openCard(work, entity, kind);
  if (!opened.ok) return opened;
  const info = parseIshur(opened.body, kind);
  if (!info.ok) return { ok: false, reason: info.reason };
  // ‼ המסך הוא של מי שביקשנו — לפני שקוראים ממנו ולו ערך אחד.
  if (info.entity && info.entity.replace(/^0+/, '') !== entity.replace(/^0+/, '')) {
    return { ok: false, reason: 'file_mismatch' };
  }
  log(`413 ${CERT_LABEL[kind]}: ${info.statusText}${info.validUntil ? ` · עד ${info.validUntil}` : ''}${info.rates.length ? ` · ${ratesText(info.rates)}` : ''}`);
  if (!info.valid) return { ok: true, info, body: opened.body };
  const pdf = await printCopy(work);
  if (!pdf.ok) log(`413 ${CERT_LABEL[kind]}: ההעתק לא הודפס (${pdf.reason})`);
  return { ok: true, info, body: opened.body, ...(pdf.ok ? { buffer: pdf.buffer } : { printError: pdf.reason }) };
}

/**
 * «אין אישור, ולא ניתן להנפיק» — ההודעה של שע״ם נשמרת בכרטיס (גיא, 25.10.2026: «צריך לציין את
 * ההודעה»). blocked = הסירוב כבר בפתיחת הכרטיס ⇒ אין טעם בכפתור «הנפק».
 */
export function messagePayload(kind, { message, blocked, info = null }) {
  return {
    kind, year: info?.year ?? null, status: 'none',
    statusText: info?.statusText || 'אין אישור בתוקף',
    message: String(message ?? '').trim() || null, blocked: !!blocked,
    entity: info?.entity ?? null,
  };
}

export async function saveMessage(ctx, kind, opts) {
  const r = await putCertificate(ctx.workerId, ctx.job.id, { certificate: messagePayload(kind, opts) });
  if (!r?.ok) ctx.log(`413 ${CERT_LABEL[kind]}: שמירת ההודעה נכשלה (${r?.error ?? 'unknown'})`);
  return r;
}

/** שומר אישור אחד בשרת. כשל שמירה אינו מפיל את הקריאה — מדווח. */
export async function saveOne(ctx, read, extra = {}) {
  const r = await putCertificate(ctx.workerId, ctx.job.id, {
    certificate: certificatePayload(read.info, extra),
    buffer: read.buffer,
  });
  if (!r?.ok) ctx.log(`413 ${CERT_LABEL[read.info.kind]}: השמירה בשרת נכשלה (${r?.error ?? 'unknown'})`);
  return r;
}
