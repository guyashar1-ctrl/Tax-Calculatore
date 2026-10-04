// דף בדיקה — מוכנות ייפוי הכוח לחתימה ומקומות החתימה על הטופס (04.10.2026).
// נטען רק כש-URL כולל ?test-poa-readiness. אין מסד, אין שליחה: הטפסים נוצרים כאן בדפדפן
// (טופס 2279 נבנה משכבת הטקסט הקבועה של הטופס האמיתי, בלי שום פרט אישי), והשמות בדויים.
//
// ?scenario=single|couple|multipage|missing|layout|sent|signed|final
// ?scenario=external — בקשה וקובץ שמוגשים לדף מבחוץ (/__qa-external/…, יירוט בסקריפט בדיקה מקומי
// בלבד; אין כאן נתונים, ושום דבר לא נשמר) — כדי להריץ בקשה אמיתית דרך אותו קוד, לקריאה בלבד.
//
// ‼ הכרעת המוכנות כאן היא הקוד האמיתי (signatureReadiness / repSendPhase), ומרכז הייצוג
// הוא הרכיב האמיתי — רק מקור הקבצים מוזרק (documentSourceOverride).

import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Client, RepresentationRequest, RepSignatureDocument, SignatureValue } from '../../types';
import type { StoredDoc } from '../../hooks/useIndexedDB';
import RepresentationExecutionCenter, { type ShaamFormLayouts } from '../RepresentationExecutionCenter';
import { repPreparationFacts, shaamPrepLine } from '../../features/representation/repPreparation';
import { repSubmissions } from '../../features/representation/repPreparation';
import { embedPdfFonts, layoutMixed, drawMixedVisual, measureMixed } from '../../utils/pdfHebrew';
import { buildForm2279Fields } from '../../features/representation/shaamRepresentation';
import { repSendPhase, representationStatusLabel, representationAction } from '../../utils/representationAction';
import { repShortAction } from '../../utils/requestPresentation';
import { signatureReadiness } from '../../features/representation/signatureReadiness';
import FORM_2279_TEXT from '../../features/representation/__tests__/fixtures/form2279-layout-2026-09.json';

const CLIENT_ID = 'client-poa';
const REQ_ID = 'req-poa';

// ── קבצי בדיקה ───────────────────────────────────────────────────────────────

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return { doc, fonts: await embedPdfFonts(doc) };
}

/** טופס 2279 — הטקסט הקבוע של הטופס במקומו (ממדידה של שני טפסים אמיתיים), ושם בדוי. */
async function form2279(person: string, spouse?: string): Promise<Uint8Array> {
  const { doc, fonts } = await newDoc();
  // ‼ שני עותקים של הגופן, לסירוגין בין מילים: אחרת pdfjs מאחד מילים סמוכות לפריט אחד,
  // ובדיקת התבנית (verifyForm2279Layout) — הקוד האמיתי — לא מוצאת את העוגנים.
  const hebrew2 = await doc.embedFont(await (await fetch('/fonts/NotoSansHebrew-Regular.ttf')).arrayBuffer());
  const page = doc.addPage([612, 792]);
  FORM_2279_TEXT.items.forEach((it, k) => {
    const f = /[֐-׿]/.test(it.s) ? (k % 2 ? hebrew2 : fonts.hebrew) : fonts.latin;
    try { page.drawText(it.s, { x: it.x * 612, y: 792 - it.y * 792, size: 7.5, font: f }); } catch { /* תו שאין בגופן */ }
  });
  const line = `לקוח לדוגמה: ${person}${spouse ? ` · בן/בת זוג: ${spouse}` : ''}`;
  const segs = layoutMixed(line);
  drawMixedVisual(page, segs, 40, 792 - 0.025 * 792, 9, fonts);
  return doc.save();
}

/** מסמך של כמה עמודים שהועלה ידנית — המקום לחתימה בעמוד האחרון. */
async function multiPage(n: number): Promise<Uint8Array> {
  const { doc, fonts } = await newDoc();
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([612, 792]);
    const title = layoutMixed(`הסכם ייצוג לדוגמה — עמוד ${i} מתוך ${n}`);
    drawMixedVisual(page, title, 612 - 50 - measureMixed(title, 16, fonts), 740, 16, fonts);
    for (let r = 0; r < 26; r++) {
      const t = layoutMixed(`סעיף ${i}.${r + 1} — טקסט לדוגמה של מסמך מרובה עמודים, לבדיקת הגדלה ומעבר בין עמודים.`);
      drawMixedVisual(page, t, 612 - 50 - measureMixed(t, 10, fonts), 700 - r * 20, 10, fonts);
    }
    if (i === n) {
      const s = layoutMixed('חתימת הלקוח: ____________     חתימה וחותמת המשרד: ____________');
      drawMixedVisual(page, s, 612 - 50 - measureMixed(s, 11, fonts), 120, 11, fonts);
    }
  }
  return doc.save();
}

/** טופס שונה מהתבנית (A4) — ההכנה האוטומטית לא מסמנת עליו. */
async function otherForm(): Promise<Uint8Array> {
  const { doc, fonts } = await newDoc();
  const page = doc.addPage([595, 842]);
  const t = layoutMixed('טופס בפורמט אחר (A4) — לא הטופס שהתבנית נמדדה עליו');
  drawMixedVisual(page, t, 595 - 50 - measureMixed(t, 14, fonts), 780, 14, fonts);
  return doc.save();
}

/** חתימה בכתב יד מדומה — תמונה, כמו שחדר החתימה שומר. */
function scribble(): string {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 90;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#1e3a8a'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 60);
  for (let x = 10; x < 290; x += 12) g.quadraticCurveTo(x + 6, 10 + ((x * 7) % 60), x + 12, 55 - ((x * 3) % 30));
  g.stroke();
  return c.toDataURL('image/png');
}

/** הקובץ הסופי (חתום ומוחתם) — לתרחיש «כבר נחתם». */
async function finalSigned(base: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base);
  const page = doc.getPage(0);
  const png = await doc.embedPng(scribble());
  const f = buildForm2279Fields('client', false);
  const sig = f.find(x => x.kind === 'signature')!;
  const st = f.find(x => x.kind === 'stamp')!;
  page.drawImage(png, { x: sig.xPct * 612, y: 792 - (sig.yPct + sig.heightPct) * 792, width: sig.widthPct * 612, height: sig.heightPct * 792 });
  page.drawRectangle({ x: st.xPct * 612, y: 792 - (st.yPct + st.heightPct) * 792, width: st.widthPct * 612, height: st.heightPct * 792, borderColor: rgb(0.1, 0.2, 0.6), borderWidth: 2 });
  return doc.save();
}

const stored = (id: string, fileName: string, bytes: Uint8Array): StoredDoc => ({
  id, clientId: CLIENT_ID, fileName, fileType: 'application/pdf', fileSize: bytes.byteLength, category: 'other',
  year: 'general', uploadedAt: '2026-10-01T08:00:00.000Z', description: fileName, notes: '',
  fileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
} as StoredDoc);

// ── לקוחות ובקשות בדויים ─────────────────────────────────────────────────────

const SINGLE_CLIENT = {
  id: CLIENT_ID, name: 'נועם בדיקה', firstName: 'נועם', lastName: 'בדיקה', idNumber: '000000018', familyStatus: 'single',
  email: 'noam@example.test', authorityRepresentations: {
    incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary', targets: ['client'] },
    nationalInsurance: { status: 'in_process', targets: ['client'] },
  },
  representationStatus: 'awaiting_accountant',
} as unknown as Client;

const COUPLE_CLIENT = {
  id: CLIENT_ID, name: 'דנה בדיקה', firstName: 'דנה', lastName: 'בדיקה', idNumber: '000000018', familyStatus: 'married',
  email: 'dana@example.test', spouseName: 'רון בדיקה', spouseFirstName: 'רון', spouseLastName: 'בדיקה', spouseIdNumber: '000000026',
  spouseEmail: 'ron@example.test', registeredSpouseVerified: true,
  taxFiles: [{ authority: 'income_tax', owner: 'client', fileNumber: '000000018' }],
  authorityRepresentations: { incomeTax: { status: 'in_process', level: 'primary' } },
  representationStatus: 'awaiting_accountant',
} as unknown as Client;

/** זוג עם מס הכנסה (הרשומה: דנה) ומע״מ לשניהם — שתי הגשות בשע״ם. */
const COUPLE_VAT_CLIENT = {
  ...(COUPLE_CLIENT as unknown as Record<string, unknown>),
  authorityRepresentations: {
    incomeTax: { status: 'in_process', level: 'primary' },
    vat: { status: 'in_process', level: 'primary', targets: ['client', 'spouse'] },
  },
} as unknown as Client;

const SIGNER = { id: 'client', role: 'client', source: 'client_self', name: 'נועם בדיקה', email: 'noam@example.test', order: 1, signStatus: 'pending', signToken: 'a'.repeat(32) };
const SIGNERS_COUPLE = [
  { id: 'client', role: 'client', source: 'client_self', name: 'דנה בדיקה', email: 'dana@example.test', order: 1, signStatus: 'pending', signToken: 'b'.repeat(32) },
  { id: 'spouse', role: 'spouse', source: 'spouse', name: 'רון בדיקה', email: 'ron@example.test', order: 2, signStatus: 'pending', signToken: 'c'.repeat(32) },
];

const NI = { nationalInsurance: { enteredAt: '2026-10-01T09:00:00.000Z', referenceNumber: '70000001', deadline: '2026-11-30', externalState: 'pending', rawExternalState: 'ממתין לאישור', syncedAt: '2026-10-01T09:00:00.000Z' } };
const shaamTrack = (formId: string, name: string, extra: Record<string, unknown> = {}) => ({
  requestNumber: '2026000123', createdAt: '2026-10-01T08:30:00Z', formDocumentId: formId, formFileName: `ייפוי כוח לחתימה - ${name}.pdf`, formFetchedAt: '2026-10-01T08:30:00Z',
  ...extra,
});
/** מה שהשרת רושם כשהכין את המקומות עם קבלת הטופס (218). */
const SERVER_PREPARED = { formLayout: { ok: true, by: 'worker', at: '2026-10-01T08:30:05Z' }, formPreparation: { state: 'prepared', at: '2026-10-01T08:30:05Z' } };

function base(over: Partial<RepresentationRequest>): RepresentationRequest {
  return {
    id: REQ_ID, linkedClientId: CLIENT_ID, clientName: 'נועם בדיקה', clientEmail: 'noam@example.test',
    authorities: ['incomeTax', 'vat', 'withholding'], status: 'awaiting_accountant', createdAt: '2026-10-01T08:00:00.000Z',
    signers: [SIGNER], scope: SINGLE_CLIENT.authorityRepresentations,
    ...over,
  } as unknown as RepresentationRequest;
}

const docOf = (key: string, title: string, pdfDocId: string, fileName: string, fields = buildForm2279Fields('client', false)): RepSignatureDocument =>
  ({ key, title, pdfDocId, pdfFileName: fileName, fields, createdAt: '2026-10-01T08:31:00.000Z', signedPdfStoredId: null });

interface Scenario { key: string; label: string; client: Client; req: () => RepresentationRequest }

const SIG_IMG = typeof document !== 'undefined' ? scribble() : '';

const SCENARIOS: Scenario[] = [
  {
    key: 'single', label: 'חותם יחיד — המקומות הוכנו בשרת עם קבלת הטופס', client: SINGLE_CLIENT,
    req: () => base({
      signatureDocuments: [docOf('person:client', 'מס הכנסה, ניכויים, מע״מ', 'form-single', 'ייפוי כוח לחתימה - נועם בדיקה.pdf')],
      execution: { ...NI, shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה', SERVER_PREPARED) } } as never,
    }),
  },
  {
    key: 'fallback', label: 'עובד בגרסה ישנה — הדפדפן בודק, השרת מכין', client: SINGLE_CLIENT,
    req: () => base({ execution: { ...NI, shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה') } } as never }),
  },
  {
    key: 'prepfail', label: 'ההכנה נכשלה — נסה שוב / סימון ידני', client: SINGLE_CLIENT,
    req: () => base({ execution: { ...NI, shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה') } } as never }),
  },
  {
    key: 'couple', label: 'שני חותמים — זוג, מס הכנסה', client: COUPLE_CLIENT,
    req: () => base({
      clientName: 'דנה בדיקה', signers: SIGNERS_COUPLE as never, authorities: ['incomeTax'], scope: COUPLE_CLIENT.authorityRepresentations,
      signatureDocuments: [docOf('person:client', 'מס הכנסה', 'form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf', buildForm2279Fields('client', true))],
      execution: { shaam: { 'person:client': shaamTrack('form-couple', 'דנה בדיקה', SERVER_PREPARED) } } as never,
    }),
  },
  {
    key: 'couple-pending', label: 'זוג — ההגשה של בן הזוג טרם נפתחה', client: COUPLE_VAT_CLIENT,
    req: () => base({
      clientName: 'דנה בדיקה', signers: SIGNERS_COUPLE as never, authorities: ['incomeTax', 'vat'], scope: (COUPLE_VAT_CLIENT as unknown as { authorityRepresentations: never }).authorityRepresentations,
      signatureDocuments: [docOf('person:client', 'דנה בדיקה · מס הכנסה, מע״מ', 'form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf', buildForm2279Fields('client', true))],
      execution: { shaam: { 'person:client': shaamTrack('form-couple', 'דנה בדיקה', SERVER_PREPARED) } } as never,
    }),
  },
  {
    key: 'couple-waiting', label: 'זוג — ההגשה של בן הזוג נפתחה, הטופס שלו טרם הגיע', client: COUPLE_VAT_CLIENT,
    req: () => base({
      clientName: 'דנה בדיקה', signers: SIGNERS_COUPLE as never, authorities: ['incomeTax', 'vat'], scope: (COUPLE_VAT_CLIENT as unknown as { authorityRepresentations: never }).authorityRepresentations,
      signatureDocuments: [docOf('person:client', 'דנה בדיקה · מס הכנסה, מע״מ', 'form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf', buildForm2279Fields('client', true))],
      execution: { shaam: {
        'person:client': shaamTrack('form-couple', 'דנה בדיקה', SERVER_PREPARED),
        'person:spouse': { requestNumber: '2026000124', createdAt: '2026-10-01T09:10:00Z' },
      } } as never,
    }),
  },
  {
    key: 'couple-ready', label: 'זוג — שני הטפסים הוכנו בשרת', client: COUPLE_VAT_CLIENT,
    req: () => base({
      clientName: 'דנה בדיקה', signers: SIGNERS_COUPLE as never, authorities: ['incomeTax', 'vat'], scope: (COUPLE_VAT_CLIENT as unknown as { authorityRepresentations: never }).authorityRepresentations,
      signatureDocuments: [
        docOf('person:client', 'דנה בדיקה · מס הכנסה, מע״מ', 'form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf', buildForm2279Fields('client', true)),
        docOf('person:spouse', 'רון בדיקה · מע״מ', 'form-spouse', 'ייפוי כוח לחתימה - רון בדיקה.pdf', buildForm2279Fields('spouse', false)),
      ],
      execution: { shaam: {
        'person:client': shaamTrack('form-couple', 'דנה בדיקה', SERVER_PREPARED),
        'person:spouse': { ...shaamTrack('form-spouse', 'רון בדיקה', SERVER_PREPARED), requestNumber: '2026000124' },
      } } as never,
    }),
  },
  {
    key: 'multipage', label: 'מסמך של 3 עמודים (הועלה ידנית)', client: SINGLE_CLIENT,
    req: () => base({
      authorities: ['incomeTax'], scope: { incomeTax: { status: 'in_process', level: 'primary' } } as never,
      signatureDocuments: [docOf('incomeTax', 'ייפוי כוח', 'doc-multi', 'הסכם ייצוג (3 עמודים).pdf', [
        { id: 'm-sig', signerId: 'client', kind: 'signature', pageIndex: 2, xPct: 0.55, yPct: 0.82, widthPct: 0.2, heightPct: 0.045 },
        { id: 'm-stamp', signerId: 'accountant', kind: 'stamp', pageIndex: 2, xPct: 0.12, yPct: 0.8, widthPct: 0.22, heightPct: 0.07 },
        { id: 'm-check', signerId: 'static', kind: 'check', pageIndex: 0, xPct: 0.85, yPct: 0.12, widthPct: 0.035, heightPct: 0.025 },
      ])],
      execution: { ...NI, incomeTax: { enteredAt: '2026-10-01T08:30:00.000Z' } } as never,
    }),
  },
  {
    key: 'missing', label: 'מקומות חסרים — לבן הזוג אין מקום חתימה', client: COUPLE_CLIENT,
    req: () => base({
      clientName: 'דנה בדיקה', signers: SIGNERS_COUPLE as never, authorities: ['incomeTax'], scope: COUPLE_CLIENT.authorityRepresentations,
      signatureDocuments: [docOf('person:client', 'מס הכנסה', 'form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf')],
      execution: { shaam: { 'person:client': shaamTrack('form-couple', 'דנה בדיקה') } } as never,
    }),
  },
  {
    key: 'layout', label: 'טופס שונה מהתבנית — השרת לא סימן', client: SINGLE_CLIENT,
    req: () => base({ execution: { ...NI, shaam: { 'person:client': shaamTrack('form-other', 'נועם בדיקה', {
      formLayout: { ok: false, problems: ['size:595x842'], by: 'worker' }, formPreparation: { state: 'layout_mismatch', problems: ['size:595x842'] },
    }) } } as never }),
  },
  {
    key: 'sent', label: 'כבר נשלח ללקוח לחתימה', client: SINGLE_CLIENT,
    req: () => base({
      status: 'pending_signature',
      signatureDocuments: [docOf('person:client', 'מס הכנסה, מע״מ, ניכויים', 'form-single', 'ייפוי כוח לחתימה - נועם בדיקה.pdf')],
      execution: { ...NI, signatureEmailSentAt: '2026-10-02T09:15:00.000Z', shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה') } } as never,
    }),
  },
  {
    key: 'signed', label: 'הלקוח חתם — חסרות החתימה והחותמת של המשרד', client: SINGLE_CLIENT,
    req: () => {
      const d = docOf('person:client', 'מס הכנסה, מע״מ, ניכויים', 'form-single', 'ייפוי כוח לחתימה - נועם בדיקה.pdf');
      const sig = d.fields.find(f => f.kind === 'signature')!;
      const values: Record<string, SignatureValue> = { [sig.id]: { fieldId: sig.id, imageDataUrl: SIG_IMG, signedAt: '2026-10-03T10:00:00.000Z' } };
      return base({
        status: 'awaiting_stamp', signatureDocuments: [d], signatureValues: values,
        signers: [{ ...SIGNER, signStatus: 'signed' }] as never,
        execution: { ...NI, signatureEmailSentAt: '2026-10-02T09:15:00.000Z', shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה') } } as never,
      });
    },
  },
  {
    key: 'final', label: 'נחתם והוטבעה חותמת — הקובץ הסופי', client: SINGLE_CLIENT,
    req: () => base({
      status: 'awaiting_stamp',
      signatureDocuments: [{ ...docOf('person:client', 'מס הכנסה, מע״מ, ניכויים', 'form-single', 'ייפוי כוח לחתימה - נועם בדיקה.pdf'), signedPdfStoredId: 'signed-final' }],
      signers: [{ ...SIGNER, signStatus: 'signed' }] as never,
      execution: { ...NI, signatureEmailSentAt: '2026-10-02T09:15:00.000Z', shaam: { 'person:client': shaamTrack('form-single', 'נועם בדיקה') } } as never,
    }),
  },
];

export default function TestPoaReadiness() {
  const qp = new URLSearchParams(window.location.search);
  const fromUrl = qp.get('scenario');
  const [external, setExternal] = useState<Scenario | null>(null);
  const [key, setKey] = useState(fromUrl === 'external' || SCENARIOS.some(s => s.key === fromUrl) ? fromUrl! : 'single');
  const sc = key === 'external' ? external : SCENARIOS.find(s => s.key === key)!;
  const [req, setReq] = useState<RepresentationRequest | null>(() => sc?.req() ?? null);
  const [files, setFiles] = useState<Record<string, StoredDoc> | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const failedOnce = useRef(false);

  useEffect(() => { if (sc) { failedOnce.current = false; setReq(sc.req()); } }, [sc]);
  useEffect(() => {
    if (key !== 'external') return;
    void (async () => {
      const j = await (await fetch('/__qa-external/request.json')).json() as { request: RepresentationRequest; client: Client; files: { id: string; fileName: string }[] };
      const extra: Record<string, StoredDoc> = {};
      for (const f of j.files) {
        const b = new Uint8Array(await (await fetch(`/__qa-external/${encodeURIComponent(f.id)}`)).arrayBuffer());
        extra[f.id] = stored(f.id, f.fileName, b);
      }
      setFiles(prev => ({ ...(prev ?? {}), ...extra }));
      setExternal({ key: 'external', label: 'חיצוני', client: j.client, req: () => j.request });
    })();
  }, [key]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const single = await form2279('נועם בדיקה');
      const couple = await form2279('דנה בדיקה', 'רון בדיקה');
      const out: Record<string, StoredDoc> = {
        'form-single': stored('form-single', 'ייפוי כוח לחתימה - נועם בדיקה.pdf', single),
        'form-couple': stored('form-couple', 'ייפוי כוח לחתימה - דנה בדיקה.pdf', couple),
        'form-spouse': stored('form-spouse', 'ייפוי כוח לחתימה - רון בדיקה.pdf', await form2279('רון בדיקה')),
        'doc-multi': stored('doc-multi', 'הסכם ייצוג (3 עמודים).pdf', await multiPage(3)),
        'form-other': stored('form-other', 'טופס אחר.pdf', await otherForm()),
        'signed-final': stored('signed-final', 'ייפוי כוח - חתום.pdf', await finalSigned(single)),
      };
      if (alive) setFiles(prev => ({ ...out, ...(prev ?? {}) }));
    })();
    return () => { alive = false; };
  }, []);

  const source = useMemo(() => (files ? {
    getDoc: async (id: string) => {
      const f = files[id];
      return f ? { ...f, fileData: f.fileData.slice(0) } : undefined;
    },
  } : null), [files]);

  if (!req || !sc) return <div dir="rtl" style={{ padding: '1rem' }}>טוען…</div>;
  // ‼ כמו ב-App: עם הכרטיס — לפי אדם ורשות.
  const phase = repSendPhase(req, sc.client);
  const facts = repPreparationFacts(req, sc.client);
  const readiness = signatureReadiness(req);
  const push = (s: string) => setLog(l => [`${new Date().toLocaleTimeString('he-IL')} · ${s}`, ...l].slice(0, 6));
  /**
   * מדמה את prepare_shaam_signature_documents (218) — אותם כללים: בלי מסמך כפול, תבנית שונה ⇒
   * layout_mismatch, ומי חותם לפי bothSign. «ההכנה נכשלה» מחזיר unverified בפעם הראשונה.
   */
  const simulateServer = async (layouts: ShaamFormLayouts): Promise<Record<string, string> | null> => {
    if (key === 'prepfail' && !failedOnce.current) { failedOnce.current = true; push('השרת: unverified (מדומה)'); return Object.fromEntries(Object.keys(layouts).map(k => [k, 'unverified'])); }
    const out: Record<string, string> = {};
    // ‼ מחושב מהעותק הנוכחי ומחוץ לפונקציית העדכון (StrictMode מריץ אותה פעמיים).
    const next = ((r: RepresentationRequest) => {
      const docs = [...(r.signatureDocuments ?? [])];
      const shaam = { ...(r.execution?.shaam ?? {}) };
      const subs = repSubmissions(r, sc.client);
      for (const [k, l] of Object.entries(layouts)) {
        const t = shaam[k];
        if (!t?.formDocumentId || docs.some(d => d.key === k)) { out[k] = 'exists'; continue; }
        if (!l.ok) { shaam[k] = { ...t, formLayout: { ok: false, problems: l.problems, by: 'office_browser' }, formPreparation: { state: 'layout_mismatch' } }; out[k] = 'layout_mismatch'; continue; }
        const target = (subs.find(s => s.key === k)?.target ?? 'client');
        docs.push(docOf(k, l.title, t.formDocumentId, t.formFileName || 'ייפוי כוח לחתימה.pdf', buildForm2279Fields(target, l.bothSign)));
        shaam[k] = { ...t, formLayout: { ok: true, by: 'office_browser' }, formPreparation: { state: 'prepared' } };
        out[k] = 'prepared';
      }
      return { ...r, signatureDocuments: docs, execution: { ...(r.execution ?? {}), shaam } };
    })(req);
    setReq(next);
    push(`השרת הכין: ${JSON.stringify(out)}`);
    return out;
  };

  return (
    <div style={{ padding: '1rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'Heebo, sans-serif' }} dir="rtl">
      <div style={{ fontSize: 12, color: 'var(--ink-4, #888)', marginBottom: 8 }}>
        מסך בדיקה · נתונים בדויים · אין מסד ואין שליחה · הטפסים נוצרים בדפדפן
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SCENARIOS.map(s => (
          <button key={s.key} type="button" className={`btn btn-sm ${s.key === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setKey(s.key); history.replaceState(null, '', `?test-poa-readiness&scenario=${s.key}`); }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* מה מסך הבקשות מציג — אותה הכרעה (repSendPhase), אותן פונקציות שהשורה בכרטיס קוראת */}
      <div className="card" data-testid="poa-requests-line" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-3, #666)' }}>במסך «בקשות» של הלקוח (אותה הכרעה):</div>
        <div style={{ fontSize: 15 }}>
          <strong>ייצוג מול הרשויות</strong> · {repShortAction(req.status, phase) ?? representationAction(req.status, phase).action}
          <span style={{ color: 'var(--ink-3, #666)' }}> · בכותרת הכרטיס: «{representationStatusLabel(req.status, phase)}»</span>
        </div>
        {facts.shaam.length > 0 && (
          <div data-testid="poa-requests-parts" style={{ fontSize: 13, margin: '4px 0' }}>
            {facts.shaam.map(f => (
              <div key={f.key}>רשות המסים · {facts.shaam.length > 1 ? `${f.personName} · ` : ''}{f.authoritiesLabel} — {shaamPrepLine(f)}</div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--ink-3, #666)' }}>
          מוכנות הטופס: <span data-testid="poa-readiness-state">{readiness.state}</span>
          {readiness.problems.length > 0 && <> · {readiness.problems.map(p => p.code).join(', ')}</>}
          {' · '}<a href={`?test-requests&rep=${req.status}${phase ? `&send=${phase}` : ''}`}>המסך המלא ←</a>
        </div>
      </div>

      {log.length > 0 && <div style={{ fontSize: 12, marginBottom: 8 }}>{log.map((l, i) => <div key={i}>{l}</div>)}</div>}

      {!source ? <div>מכין טפסי בדיקה…</div> : (
        <RepresentationExecutionCenter
          key={key}
          request={req}
          niIncluded={!!req.scope?.nationalInsurance}
          niCoversSpouse={false}
          onSaveExecution={() => push('onSaveExecution')}
          onProduce={() => push('נפתח עורך מקומות החתימה (onProduce)')}
          onStamp={() => push('onStamp')}
          onMarkSentToShaam={() => push('onMarkSentToShaam')}
          onMarkActive={() => push('onMarkActive')}
          onSendToSigner={async () => null}
          userId={undefined}
          repApprovalOverride={null}
          repApprovalPeopleOverride={null}
          linkedClient={sc.client}
          engagements={[]}
          steps={[]}
          onPrepareShaamForms={simulateServer}
          documentSourceOverride={source}
        />
      )}
    </div>
  );
}
