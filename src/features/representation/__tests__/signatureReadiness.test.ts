// ─── מוכנות הטופס לחתימה — מקור אחד למסך הבקשות, למרכז הייצוג ולשרת (04.10.2026) ──
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { RepresentationRequest, RepSignatureDocument, RepSigner, SignatureField } from '../../../types';
import { signatureReadiness, placesSentence, placeLabel } from '../signatureReadiness';
import { poaOverlay } from '../poaOverlay';
import { currentPoaVersion } from '../poaVersion';
import { buildForm2279Fields, FORM_2279_TEMPLATE } from '../shaamRepresentation';
import { repPreparationFacts, shaamPrepLine } from '../repPreparation';
import SQL_218 from '../../../../supabase/218-signature-readiness.sql?raw';
import type { Client } from '../../../types';
import { repSendPhase, representationStatusLabel, representationAction } from '../../../utils/representationAction';
import { repShortAction } from '../../../utils/requestPresentation';

const CLIENT: RepSigner = { id: 'client', role: 'client', name: 'דנה בדיקה', email: 'dana@example.test', signStatus: 'pending' };
const SPOUSE: RepSigner = { id: 'spouse', role: 'spouse', name: 'רון בדיקה', email: 'ron@example.test', signStatus: 'pending' };

const doc = (key: string, fields: SignatureField[], extra: Partial<RepSignatureDocument> = {}): RepSignatureDocument => ({
  key, title: 'מס הכנסה, מע"מ', pdfDocId: `poa-pdf-req-${key}`, pdfFileName: 'ייפוי כוח.pdf', fields,
  createdAt: '2026-10-01T10:00:00Z', signedPdfStoredId: null, ...extra,
});
const f = (id: string, signerId: string, kind: SignatureField['kind'] = 'signature', pageIndex = 0): SignatureField =>
  ({ id, signerId, kind, pageIndex, xPct: 0.3, yPct: 0.5, widthPct: 0.15, heightPct: 0.04 });

function req(over: Partial<RepresentationRequest>): RepresentationRequest {
  return {
    id: 'req', linkedClientId: 'c1', clientName: 'דנה בדיקה', clientEmail: 'dana@example.test',
    authorities: ['incomeTax', 'vat'], status: 'awaiting_accountant', createdAt: '2026-10-01T10:00:00Z',
    signers: [CLIENT], execution: {}, ...over,
  } as RepresentationRequest;
}

// טופס 2279 כפי שהמרכז מכין אותו אוטומטית — אותם שדות בדיוק.
const singleForm = () => doc('person:client', buildForm2279Fields('client', false));
const coupleForm = () => doc('person:client', buildForm2279Fields('client', true));

export const TESTS: TestCase[] = [
  test('חותם יחיד, טופס שסומן אוטומטית ⇒ מוכן; ומה כתוב בשורה', () => {
    const r = signatureReadiness(req({ signatureDocuments: [singleForm()] }));
    equal(r.state, 'ready');
    equal(r.problems.length, 0);
    equal(placesSentence(r.docs[0]), 'דנה בדיקה: חתימה · המשרד: חתימה וחותמת · 2 סימונים קבועים');
  }),
  test('שני חותמים: לכל אחד מקום משלו ⇒ מוכן; התווית על הטופס נושאת את השם', () => {
    const d = coupleForm();
    const r = signatureReadiness(req({ signers: [CLIENT, SPOUSE], signatureDocuments: [d] }));
    equal(r.state, 'ready');
    const spouseField = d.fields.find(x => x.signerId === 'spouse')!;
    equal(placeLabel(spouseField, [CLIENT, SPOUSE]), 'חתימה · רון בדיקה');
  }),
  test('שני חותמים אבל בטופס מקום רק לאחד ⇒ לא מוכן, ונאמר למי חסר', () => {
    const r = signatureReadiness(req({ signers: [CLIENT, SPOUSE], signatureDocuments: [singleForm()] }));
    equal(r.state, 'incomplete');
    equal(r.problems.map(p => p.code).join(','), 'signer_without_field');
    equal(r.problems[0].text, 'אין בטופס מקום חתימה של רון בדיקה.');
  }),
  test('מקום חתימה של בן/בת זוג שאינו ברשימת החותמים ⇒ שיוך שגוי (לא יקבל קישור)', () => {
    const r = signatureReadiness(req({ signatureDocuments: [coupleForm()] }));
    equal(r.state, 'incomplete');
    equal(r.problems.some(p => p.code === 'unknown_signer' && p.signerId === 'spouse'), true);
  }),
  test('בלי מקום לחתימה/חותמת של המשרד ⇒ לא מוכן', () => {
    const r = signatureReadiness(req({ signatureDocuments: [doc('person:client', [f('a', 'client')])] }));
    equal(r.problems.map(p => p.code).join(','), 'no_office_field');
  }),
  test('טופס בלי שום מקום חתימה ⇒ חסר ללקוח ולמשרד', () => {
    const r = signatureReadiness(req({ signatureDocuments: [doc('person:client', [])] }));
    equal(r.state, 'incomplete');
    equal(r.problems.map(p => p.code).sort().join(','), 'no_office_field,signer_without_field');
  }),
  test('מע״מ אישי של בן/בת הזוג: הטופס חייב מקום חתימה לבעל/ת הטופס', () => {
    // המצב שהמרכז ייצר קודם: «הרשום» (הלקוח) הוצב גם על הטופס האישי של בן/בת הזוג.
    const wrong = doc('person:spouse', buildForm2279Fields('client', false), { title: 'מע"מ · רון בדיקה' });
    const r = signatureReadiness(req({ signers: [CLIENT, SPOUSE], signatureDocuments: [coupleForm(), wrong] }));
    equal(r.state, 'incomplete');
    equal(r.problems.some(p => p.code === 'owner_without_field' && p.docKey === 'person:spouse'), true);
    const right = doc('person:spouse', buildForm2279Fields('spouse', false), { title: 'מע"מ · רון בדיקה' });
    equal(signatureReadiness(req({ signers: [CLIENT, SPOUSE], signatureDocuments: [coupleForm(), right] })).state, 'ready');
  }),
  test('הטופס הגיע משע״ם ועוד אין לו מקומות ⇒ not_prepared (לא «מוכן»)', () => {
    const r = signatureReadiness(req({ execution: { shaam: { 'person:client': { requestNumber: '1', formDocumentId: 'x' } } } as never }));
    equal(r.state, 'incomplete');
    equal(r.problems[0].code, 'not_prepared');
  }),
  test('בקשה שבוטלה והוחלפה (replacement) — הטופס הישן לא נחשב', () => {
    const r = signatureReadiness(req({ execution: { shaam: { 'person:client': { requestNumber: '1', formDocumentId: 'x', replacement: { requestNumber: '1', removed: [] } } } } as never }));
    equal(r.state, 'no_form');
  }),
  test('מסמך מרובה עמודים: מקום בעמוד 3 תקין רק כשיש 3 עמודים', () => {
    const d = doc('incomeTax', [f('a', 'client', 'signature', 2), f('b', 'accountant', 'stamp', 2)]);
    equal(signatureReadiness(req({ signatureDocuments: [d] }), { pageCounts: { [d.pdfDocId]: 3 } }).state, 'ready');
    const r = signatureReadiness(req({ signatureDocuments: [d] }), { pageCounts: { [d.pdfDocId]: 1 } });
    equal(r.problems.map(p => p.code).join(','), 'out_of_page');
  }),
  test('מקום שחורג מגבולות העמוד ⇒ לא מוכן', () => {
    const bad = { ...f('a', 'client'), xPct: 0.95, widthPct: 0.2 };
    const r = signatureReadiness(req({ signatureDocuments: [doc('incomeTax', [bad, f('b', 'accountant', 'stamp')])] }));
    equal(r.problems.map(p => p.code).join(','), 'out_of_page');
  }),
  test('כבר נחתם ⇒ «signed» בלי בעיות — לא מסמנים מסמך חתום כתקלה', () => {
    const r = signatureReadiness(req({ status: 'awaiting_stamp', signatureDocuments: [doc('incomeTax', [])] }));
    equal(r.state, 'signed');
    equal(r.problems.length, 0);
  }),

  // ── מסך הבקשות ומרכז הייצוג קוראים את אותה הכרעה ────────────────────────
  test('עידן (הבאג): awaiting_accountant + טופס מסומן ⇒ «מוכן לשליחה», לא «להזין ולהפיק טופס»', () => {
    const r = req({ signatureDocuments: [singleForm()], scope: { nationalInsurance: { status: 'in_process', targets: ['client'] } } as never,
      execution: { nationalInsurance: { referenceNumber: '75200000' } } as never });
    const phase = repSendPhase(r);
    equal(phase, 'unsent');
    equal(repShortAction('awaiting_accountant', phase), 'לשלוח ללקוח לחתימה');
    equal(representationStatusLabel('awaiting_accountant', phase), 'מוכן לשליחה ללקוח');
    equal(representationAction('awaiting_accountant', phase).action, 'לשלוח ללקוח לחתימה');
  }),
  test('טופס מוכן אבל חסרה אסמכתת ב״ל שהתבקשה ⇒ «להשלים לפני השליחה»', () => {
    const r = req({ signatureDocuments: [singleForm()], scope: { nationalInsurance: { status: 'in_process', targets: ['client'] } } as never });
    const phase = repSendPhase(r);
    equal(phase, 'prep_open');
    equal(repShortAction('awaiting_accountant', phase), 'להשלים לפני השליחה');
  }),
  test('טופס שהועלה ידנית לפני שהבקשה נפתחה בשע״ם ⇒ לא «מוכן לשליחה»', () => {
    const scope = { incomeTax: { status: 'in_process', level: 'primary' } } as never;
    equal(repSendPhase(req({ signatureDocuments: [singleForm()], scope })), 'prep_open');
    equal(repSendPhase(req({ signatureDocuments: [singleForm()], scope,
      execution: { shaam: { 'person:client': { requestNumber: '2026000123' } } } as never })), 'unsent');
  }),
  test('הטופס הגיע משע״ם ועוד לא הוכן ⇒ «להכין את הטופס לחתימה» (לא «להפיק», לא «מוכן»)', () => {
    const phase = repSendPhase(req({ execution: { shaam: { 'person:client': { requestNumber: '1', formDocumentId: 'x' } } } as never }));
    equal(phase, 'form_arrived');
    equal(repShortAction('awaiting_accountant', phase), 'להכין את הטופס לחתימה');
  }),
  test('ב״ל שלא התבקש (status none) אינו חוסם', () => {
    const r = req({ signatureDocuments: [singleForm()], scope: { nationalInsurance: { status: 'none' } } as never });
    equal(repSendPhase(r), 'unsent');
  }),
  test('טופס חסר ⇒ «להשלים מקומות חתימה» — לא «מוכן»', () => {
    const r = req({ signers: [CLIENT, SPOUSE], signatureDocuments: [singleForm()] });
    const phase = repSendPhase(r);
    equal(phase, 'form_incomplete');
    equal(repShortAction('awaiting_accountant', phase), 'להשלים מקומות חתימה');
    equal(representationStatusLabel('awaiting_accountant', phase), 'הטופס דורש השלמה');
  }),
  test('אין טופס עדיין ⇒ הנוסח הישן («להזין ולהפיק טופס»)', () => {
    const phase = repSendPhase(req({}));
    equal(phase, null);
    equal(repShortAction('awaiting_accountant', phase), 'להזין ולהפיק טופס');
  }),
  test('נשלח בפועל ⇒ אין פער (ממתינים ללקוח); לא נשלח ⇒ unsent', () => {
    equal(repSendPhase(req({ status: 'pending_signature', signatureDocuments: [singleForm()], execution: { signatureEmailSentAt: '2026-10-02T09:00:00Z' } })), null);
    equal(repSendPhase(req({ status: 'pending_signature', signatureDocuments: [singleForm()] })), 'unsent');
  }),

  // ── מה מוצג על הטופס: עתידי מול בוצע ─────────────────────────────────────
  test('לפני חתימה: כל המקומות מסומנים, עם שם החותם; ההערה אומרת שאלה לא חתימות', () => {
    const d = coupleForm();
    const v = currentPoaVersion({ doc: d, values: {}, allSignersDone: false });
    const o = poaOverlay({ doc: d, version: v, signers: [CLIENT, SPOUSE] })!;
    equal(o.boxes.length, d.fields.length);
    equal(o.legend.map(l => l.text).join(' | '),
      'דנה בדיקה: חתימה | רון בדיקה: חתימה | המשרד: חתימה וחותמת — אחרי חתימת הלקוח | סימון ✓ שהמשרד מוסיף לפני השליחה (2)');
    equal(o.note!.includes('לא חתימות'), true);
  }),
  test('אחרי חתימת הלקוח: רק המקום של המשרד נשאר כמסגרת (החתימות עצמן צרובות)', () => {
    const d = singleForm();
    const sig = d.fields.find(x => x.signerId === 'client')!;
    const values = { [sig.id]: { fieldId: sig.id, imageDataUrl: 'data:', signedAt: '2026-10-03T10:00:00Z' } };
    const v = currentPoaVersion({ doc: d, values, allSignersDone: true });
    equal(v.kind, 'client_signed');
    const o = poaOverlay({ doc: d, version: v, signers: [CLIENT], values })!;
    equal(o.boxes.map(b => b.tone).join(','), 'office');
  }),
  // ── 218 ב · השרת מכין את המקומות עם קבלת הטופס ──────────────────────────
  test('218 · מקומות זהים: הבונה בשרת משתמש בדיוק במיקומי FORM_2279_TEMPLATE', () => {
    const body = SQL_218.slice(SQL_218.indexOf('_rep_build_2279_fields(p_registered'), SQL_218.indexOf('revoke all on function public._rep_build_2279_fields'));
    for (const [name, box] of Object.entries(FORM_2279_TEMPLATE)) {
      for (const k of ['xPct', 'yPct', 'widthPct', 'heightPct'] as const) {
        equal(body.includes(`'${k}', ${box[k]}`), true, `${name}.${k} = ${box[k]}`);
      }
    }
  }),
  test('218 · השרת הכין (formPreparation=prepared) ⇒ מוכן, בלי תלות בפתיחת מרכז הייצוג', () => {
    const r = req({
      signatureDocuments: [singleForm()],
      execution: { shaam: { 'person:client': { requestNumber: '1', formDocumentId: 'poa-pdf-req-person:client', formLayout: { ok: true, by: 'worker' }, formPreparation: { state: 'prepared' } } } } as never,
    });
    equal(signatureReadiness(r).state, 'ready');
    equal(repSendPhase(r), 'unsent');
  }),
  test('218 · השרת עצר על תבנית שונה ⇒ «להשלים מקומות חתימה», עם ההסבר — לא «בהכנה»', () => {
    const r = req({ execution: { shaam: { 'person:client': { requestNumber: '1', formDocumentId: 'x', formLayout: { ok: false }, formPreparation: { state: 'layout_mismatch' } } } } as never });
    const sr = signatureReadiness(r);
    equal(sr.problems[0].code, 'layout_mismatch');
    equal(repSendPhase(r), 'form_incomplete');
  }),
  test('218 · טופס חדש אחרי שליחה (held_sent) ⇒ נאמר במפורש, לא צורף', () => {
    const r = req({ status: 'pending_signature', signatureDocuments: [singleForm()],
      execution: { signatureEmailSentAt: '2026-10-01T10:00:00Z', shaam: { 'person:spouse': { requestNumber: '2', formDocumentId: 'y', formPreparation: { state: 'held_sent' } } } } as never });
    equal(signatureReadiness(r).problems.some(p => p.code === 'held_sent'), true);
  }),

  // ── זוג: אותן עובדות לשורה ולמרכז, לפי אדם ורשות ─────────────────────────
  ...(() => {
    const couple = {
      id: 'c1', firstName: 'דנה', lastName: 'בדיקה', familyStatus: 'married', spouseName: 'רון בדיקה',
      spouseFirstName: 'רון', spouseLastName: 'בדיקה', registeredSpouseVerified: true,
      taxFiles: [{ authority: 'income_tax', owner: 'client', fileNumber: '1' }],
      authorityRepresentations: { incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary', targets: ['client', 'spouse'] } },
    } as unknown as Client;
    const itForm = doc('person:client', buildForm2279Fields('client', true), { title: 'דנה בדיקה · מס הכנסה, מע"מ' });
    const base = (exec: object, docs: RepSignatureDocument[] = [itForm]) => req({
      signers: [CLIENT, SPOUSE], signatureDocuments: docs, scope: couple.authorityRepresentations, execution: { shaam: exec } as never,
    });
    const first = { 'person:client': { requestNumber: '2026000006', createdAt: '2026-10-01T08:00:00Z', formDocumentId: 'poa-pdf-req-person:client' } };
    return [
      test('זוג · ההגשה השנייה טרם נפתחה ⇒ השורה «להשלים לפני השליחה», ולא «מוכן לשליחה»', () => {
        const r = base(first);
        equal(repSendPhase(r, couple), 'prep_open');
        const f = repPreparationFacts(r, couple);
        equal(f.shaam.map(s => `${s.personName}|${s.authoritiesLabel}|${shaamPrepLine(s)}`).join(' / '),
          'דנה בדיקה|מס הכנסה, מע"מ|בקשה 2026000006 · הטופס מוכן לחתימה / רון בדיקה|מע"מ|טרם נפתחה בקשה בשע״ם');
      }),
      test('זוג · השנייה נפתחה והטופס שלה עוד לא הגיע ⇒ ממתין לטופס, ולא «חסר מקום חתימה לרון»', () => {
        const r = base({ ...first, 'person:spouse': { requestNumber: '2026000007', createdAt: '2026-10-01T09:00:00Z' } });
        const f = repPreparationFacts(r, couple);
        equal(f.problems.length, 0);
        equal(shaamPrepLine(f.shaam[1]), 'בקשה 2026000007 · ממתין לטופס משע״ם');
        equal(repSendPhase(r, couple), 'prep_open');
      }),
      test('זוג · שני הטפסים הוכנו ⇒ «מוכן לשליחה» בשורה, ושני חלקים מוכנים', () => {
        const spouseForm = doc('person:spouse', buildForm2279Fields('spouse', false), { title: 'רון בדיקה · מע"מ' });
        const r = base({ ...first, 'person:spouse': { requestNumber: '2026000007', createdAt: '2026-10-01T09:00:00Z', formDocumentId: 'poa-pdf-req-person:spouse' } }, [itForm, spouseForm]);
        equal(repSendPhase(r, couple), 'unsent');
        equal(repPreparationFacts(r, couple).shaam.every(s => s.form === 'ready'), true);
      }),
    ];
  })(),
  test('סופי (חתום ומוחתם) ⇒ אין שכבת סימונים', () => {
    const d = { ...singleForm(), signedPdfStoredId: 'signed-1' };
    const v = currentPoaVersion({ doc: d, values: {}, allSignersDone: true });
    equal(poaOverlay({ doc: d, version: v, signers: [CLIENT] }), null);
  }),
];
