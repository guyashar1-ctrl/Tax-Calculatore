// certificates413.mjs — הצעד המשותף לקריאה ולהנפקה: מצב שני האישורים, הדפסת העתק, ושמירה.
//
// ‼ כל אישור בתוקף נשמר כ-PDF בתיק הלקוח (put_certificate), וגם «אין אישור» נרשם — כך שורת
// הכרטיס אומרת מה שע״ם אומרת, עם הקובץ כראיה.
import { putCertificate } from './apiClient.mjs';
import { parseIshur, ratesText } from './gmf413.mjs';
import { openCard, printCopy, backToEntry } from './gmf413Session.mjs';

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

/** שומר אישור אחד בשרת. כשל שמירה אינו מפיל את הקריאה — מדווח. */
export async function saveOne(ctx, read, extra = {}) {
  const r = await putCertificate(ctx.workerId, ctx.job.id, {
    certificate: certificatePayload(read.info, extra),
    buffer: read.buffer,
  });
  if (!r?.ok) ctx.log(`413 ${CERT_LABEL[read.info.kind]}: השמירה בשרת נכשלה (${r?.error ?? 'unknown'})`);
  return r;
}

/**
 * קריאת שני האישורים ושמירתם. מחזיר תקציר לתוצאת המשימה.
 * ‼ לא זורק: 413 היא תוספת לקריאת התיק — כשל בה נרשם ב-unavailable ולא מפיל את השאר.
 */
export async function readAndSaveCertificates(ctx, work, entity) {
  const summary = {};
  for (const kind of CERT_KINDS) {
    const read = await readOne(work, entity, kind, ctx.log);
    if (!read.ok) {
      summary[kind] = { ok: false, reason: read.reason, ...(read.text ? { text: read.text } : {}) };
      ctx.log(`413 ${CERT_LABEL[kind]}: לא נקרא (${read.reason}${read.text ? ` · ${read.text}` : ''})`);
    } else {
      const saved = await saveOne(ctx, read);
      summary[kind] = {
        ok: true, status: read.info.valid ? 'valid' : 'none', statusText: read.info.statusText,
        validUntil: read.info.validUntil, ratesText: ratesText(read.info.rates),
        documentId: saved?.documentId ?? null, saved: !!saved?.ok,
        ...(read.printError ? { printError: read.printError } : {}),
      };
    }
    await backToEntry(work);
  }
  return summary;
}
