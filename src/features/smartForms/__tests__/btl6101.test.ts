// ─── טופס 6101 — מלאי, פריסה, פתרון נתונים ─────────────────────────────────
// הרצה: node scripts/run-unit-tests.mjs btl6101
// הבדיקה החזותית (רינדור ה-PDF האמיתי) — scripts/test-smart-form-6101.mjs.

import { test, assert, equal, deepEqual, includes, type TestCase } from '../../../testkit/tinyTest';
import { BTL6101_TEMPLATE, OCCUPATION_VISIBLE_ROWS } from '../btl6101/template';
import { layout6101, formId, formPhone, splitEmail, formMoney, formDate } from '../btl6101/layout6101';
import { EMPTY_6101, type Btl6101Data, type Btl6101Purpose } from '../btl6101/model';
import { resolve6101 } from '../btl6101/resolve';
import { parseHebrewAddress } from '../btl6101/address';
import { evaluateSelfEmployedDefinition, bandFromHours } from '../btl6101/definition';
import { FX_FULL, FX_GAPS, FX_LONG } from '../btl6101/fixtures';
import { canonicalJson } from '../hash';
import { fitText } from '../layout';
import type { DrawOp, FieldDef } from '../types';

/** מדידה משוערת: חצי em לתו — מספיק ללוגיקה (המדידה האמיתית בבדיקה החזותית). */
const measure = (t: string, size: number) => t.length * size * 0.5;
const T = BTL6101_TEMPLATE;
const AS_OF = '2026-09-28';

const texts = (ops: DrawOp[], prefix: string) =>
  ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text' && o.fieldId.startsWith(prefix));
const checks = (ops: DrawOp[]) => ops.filter(o => o.kind === 'check').map(o => (o as { fieldId: string }).fieldId);

const data = (over: Partial<Btl6101Data>): Btl6101Data => ({ ...EMPTY_6101, ...over });

export const TESTS: TestCase[] = [
  // ── המלאי ──
  test('מלאי: מזהים ייחודיים, כל מלבן בתוך העמוד', () => {
    const ids = new Set<string>();
    for (const f of T.fields) {
      assert(!ids.has(f.id), `מזהה כפול ${f.id}`);
      ids.add(f.id);
      assert(f.page >= 1 && f.page <= T.pageCount, `${f.id}: עמוד`);
      assert(f.box.x >= 0 && f.box.y >= 0 && f.box.x + f.box.w <= 612 && f.box.y + f.box.h <= 792, `${f.id}: מחוץ לעמוד`);
      assert(f.box.w > 0 && f.box.h > 0, `${f.id}: מלבן ריק`);
    }
  }),
  test('מלאי: אף שדה אינו נוגע בשטח הפנימי של ב"ל או בחותמת הקבלה', () => {
    const hit = (a: FieldDef['box'], b: FieldDef['box']) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const u of T.unmapped.filter(u => u.id.startsWith('p1.internal') || u.id.includes('clipped'))) {
      for (const f of T.fields.filter(f => f.page === u.page)) assert(!hit(f.box, u.box), `${f.id} חופף ל-${u.id}`);
    }
  }),
  test('מלאי: תיבות ספרות עולות משמאל לימין, והקבוצות מכסות את כל התיבות', () => {
    for (const f of T.fields.filter(f => f.kind === 'digits')) {
      const c = f.cells!;
      for (let i = 1; i < c.length; i++) assert(c[i] > c[i - 1], `${f.id}: תיבות לא עולות`);
      if (f.groups) equal(f.groups.reduce((a, b) => a + b, 0), c.length - 1, `${f.id}: קבוצות`);
    }
  }),
  test('מלאי: כל שדה חתימה משויך לחותם, ושני החותמים קיימים', () => {
    const sig = T.fields.filter(f => f.kind === 'signature');
    deepEqual(sig.map(s => s.signer).sort(), ['client', 'spouse']);
  }),
  test('מלאי: קשור לטביעת הקובץ ולגרסה', () => {
    equal(T.sha256.length, 64);
    equal(T.version, '06.2026');
  }),

  // ── עיצוב ערכים ──
  test('ת"ז: אפסים מובילים נשמרים ומשלימים ל-9', () => {
    equal(formId('12345674'), '012345674');
    equal(formId('012345674'), '012345674');
    equal(formId(''), '');
  }),
  test('טלפון: קידומת|מספר, 972 ⇒ 0', () => {
    equal(formPhone('03-6123456', 'landline'), '03|6123456');
    equal(formPhone('077-1234567', 'landline'), '077|1234567');
    equal(formPhone('+972-52-4491120', 'mobile'), '052|4491120');
  }),
  test('מייל: מתפצל סביב ה-@ האחרון', () => {
    deepEqual(splitEmail('noa.almog-83@mail.example.co.il'), { local: 'noa.almog-83', domain: 'mail.example.co.il' });
  }),
  test('סכום: מפריד אלפים; ריק נשאר ריק (לא 0)', () => {
    equal(formMoney('16500'), '16,500');
    equal(formMoney(''), '');
    equal(formDate('2026-06-01'), '01/06/2026');
  }),

  // ── פריסה ──
  test('פריסה: ת"ז עם אפס מוביל — ספרה בכל תיבה, ספרת הביקורת בתיבת ס"ב', () => {
    const r = layout6101(data({ idNumber: '12345674' }), [], measure);
    const f = T.fields.find(x => x.id === 'p1.applicant.idNumber')!;
    const ds = texts(r.ops, 'p1.applicant.idNumber');
    equal(ds.map(d => d.text).join(''), '012345674');
    equal(ds[0].x, Math.round(((f.cells![0] + f.cells![1]) / 2) * 100) / 100, 'הספרה הראשונה בתיבה הראשונה');
    equal(ds[8].x, Math.round(((f.cells![8] + f.cells![9]) / 2) * 100) / 100, 'ס"ב בתיבה האחרונה');
    const hdr = r.ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text' && o.fieldId.endsWith('.header.idNumber'));
    deepEqual(hdr.map(h => [h.page, h.text]), [[1, '012345674'], [2, '012345674'], [3, '012345674']], 'ת"ז בכותרת של שלושת העמודים');
  }),
  test('פריסה: טלפון קווי — קידומת של 2 ספרות צמודה לימין קבוצת הקידומת', () => {
    const r = layout6101(data({ landline: '03-6123456' }), [], measure);
    const f = T.fields.find(x => x.id === 'p1.contact.landline')!;
    const ds = texts(r.ops, 'p1.contact.landline');
    equal(ds.length, 9);
    equal(ds[0].text, '0');
    equal(ds[0].x, Math.round(((f.cells![2] + f.cells![3]) / 2) * 100) / 100, 'ה-0 בתיבה השלישית מתוך ארבע');
  }),
  test('פריסה: טלפון באורך שגוי ⇒ בעיה, לא חיתוך', () => {
    const r = layout6101(data({ mobile: '05212345678' }), [], measure);
    assert(r.issues.some(i => i.fieldId === 'p1.contact.mobile'), 'אין בעיה');
  }),
  test('פריסה: מצב משפחתי ⇒ X בתיבה הנכונה בלבד', () => {
    const r = layout6101(data({ maritalStatus: 'married' }), [], measure);
    deepEqual(checks(r.ops), ['p1.marital.married']);
  }),
  test('פריסה: גילוי הדרגתי — «עדכון פרטים» לא מצייר את סעיף 4 ולא את סעיף 3', () => {
    const d = data({ startDate: '2026-10-01', profession: 'מעצבת', occupations: [{ from: '2025-01-01', to: '', occupation: 'עצמאי', nonWorkIncome: '', nonWorkSource: '' }] });
    const r = layout6101(d, ['update_details'], measure);
    equal(r.ops.filter(o => o.page === 2 && o.kind !== 'appendix' && !('fieldId' in o && o.fieldId.startsWith('p2.header'))).length, 0);
  }),
  test('פריסה: פתיחת עצמאי מסמנת את התיבה ואת פס השעות', () => {
    const d = data({ startSelfEmployed: true, startDate: '2026-10-01', hoursBand: '20_plus', monthlyIncome: '9000', profession: 'מעצבת' });
    const r = layout6101(d, ['start'], measure);
    deepEqual(checks(r.ops).sort(), ['p2.start.check', 'p2.start.hours.20_plus']);
    equal(texts(r.ops, 'p2.start.monthlyIncome')[0].text, '9,000');
  }),
  test('פריסה: יותר משלוש תקופות ⇒ שלוש בטופס, השאר בנספח, והפניה מתחת לטבלה', () => {
    const occ = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31`, occupation: 'שכיר', nonWorkIncome: '', nonWorkSource: '' });
    const d = data({ idNumber: '12345674', occupations: [occ(2021), occ(2022), occ(2023), occ(2024), occ(2025)] });
    const r = layout6101(d, ['multi_year_report'], measure);
    equal(r.pageCount, 4);
    const app = r.ops.find(o => o.kind === 'appendix') as Extract<DrawOp, { kind: 'appendix' }>;
    equal(app.rows.length, 5 - OCCUPATION_VISIBLE_ROWS);
    equal(app.rows[0][0], '01/01/2022', 'הנספח ממשיך מהתקופה הרביעית (האחרונה קודם)');
    equal(texts(r.ops, 'p2.occupations.r1.from')[0].text, '01/01/2025', 'שורה ראשונה = האחרונה');
    assert(texts(r.ops, 'p2.occupations.appendixNote').length === 1, 'אין הפניה לנספח');
  }),
  test('פריסה: שלוש תקופות בדיוק ⇒ בלי נספח ובלי הפניה', () => {
    const occ = (y: number) => ({ from: `${y}-01-01`, to: '', occupation: 'שכיר', nonWorkIncome: '', nonWorkSource: '' });
    const r = layout6101(data({ occupations: [occ(2023), occ(2024), occ(2025)] }), ['multi_year_report'], measure);
    equal(r.pageCount, 3);
    equal(texts(r.ops, 'p2.occupations.appendixNote').length, 0);
  }),
  test('התאמה: טקסט ארוך מתכווץ, אחר כך שתי שורות, ורק אז בעיה', () => {
    const f = T.fields.find(x => x.id === 'p1.applicant.lastName')!;
    const fit1 = fitText('כהן', f, measure);
    equal(fit1.size, f.fontSize);
    const long = 'בן-שושן אלמוג-רוזנבלום ובניו לדורותיהם הבאים עד סוף כל הדורות שבעולם';
    const fit2 = fitText(long, f, measure);
    assert(fit2.fits && fit2.lines.length === 2, 'לא עבר לשתי שורות');
    const fit3 = fitText('א'.repeat(200), f, measure);
    assert(!fit3.fits, 'טקסט בלתי אפשרי סומן כנכנס');
  }),

  // ── פתרון נתונים ──
  test('פתרון: לקוחה מלאה — הכול מאומת, והעיסוקים מב"ל', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['multi_year_report'], entered: {}, asOf: AS_OF });
    equal(r.fields.lastName.status, 'verified');
    equal(r.fields.street.status, 'derived', 'פירוק כתובת = נגזר');
    equal(r.data.street, 'אבן גבירול');
    equal(r.data.houseNumber, '112');
    equal(r.data.entrance, 'ב');
    equal(r.data.apartment, '14');
    equal(r.data.bankName, 'בנק לאומי', 'החשבון הראשי');
    equal(r.data.bankBranchNumber, '064', 'אפס מוביל בסניף');
    equal(r.data.occupations.length, 3);
    equal(r.fields.occupations.sourceLabel, 'ב"ל · רשימת עיסוקים');
    includes(r.data.occupations.map(o => o.occupation), 'סטודנט');
    assert(!r.issues.some(i => i.severity === 'blocker'), JSON.stringify(r.issues.filter(i => i.severity === 'blocker')));
  }),
  test('פתרון: חוסרים וסתירות מזוהים, ולא ממולאים בשקט', () => {
    const r = resolve6101({ client: FX_GAPS, purposes: ['update_details'], entered: {}, asOf: AS_OF });
    equal(r.fields.spouseIdNumber.status, 'conflict');
    assert(r.issues.some(i => i.key === 'spouseIdNumber' && i.severity === 'blocker'), 'סתירת ת"ז אינה חוסמת');
    assert(r.issues.some(i => i.key === 'landline' && i.code === 'bad_phone'), 'נייד בשדה קווי לא זוהה');
    assert(r.issues.some(i => i.key === 'email' && i.code === 'bad_email'), 'מייל לא תקין לא זוהה');
    equal(r.data.bankName, '', 'אין חשבון ראשי ⇒ לא נבחר אוטומטית');
    assert((r.hints.bankName ?? []).length === 1, 'אין רמז לבחירת חשבון');
    equal(r.fields.houseNumber.status, 'missing');
  }),
  test('פתרון: לא ידוע ≠ אפס — בלי הכנסה מוצהרת בב"ל, «לפני» נשאר ריק וחסר', () => {
    const r = resolve6101({ client: FX_GAPS, purposes: ['change'], entered: {}, asOf: AS_OF });
    equal(r.data.incomeBefore, '');
    equal(r.fields.incomeBefore.status, 'missing');
  }),
  test('פתרון: הכנסה שנתית אינה מומרת לחודשית — רק רמז', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['start'], entered: {}, asOf: AS_OF });
    equal(r.data.monthlyIncome, '');
    assert((r.hints.monthlyIncome ?? []).some(h => h.includes('לא מומר')), 'אין רמז');
  }),
  test('פתרון: שינוי למפרע ⇒ אזהרה בולטת בלי הבטחת קבלה + אסמכתא חובה; שנה הבאה ⇒ חוסם', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['change'], entered: { changeToDate: '2025-07-01', hoursAfter: '25', incomeAfter: '12000' }, asOf: AS_OF });
    const w = r.issues.find(i => i.code === 'retro_change');
    assert(!!w && w.severity === 'warning', 'דיווח למפרע מותר — באזהרה');
    assert(w!.message.includes('אין בכך הבטחה'), 'בלי הבטחת קבלה');
    equal(r.retro.change, true);
    deepEqual(r.attachments.filter(a => a.required).map(a => a.key), ['retro_change']);
    const next = resolve6101({ client: FX_FULL, purposes: ['change'], entered: { changeToDate: '2027-01-01' }, asOf: AS_OF });
    assert(next.issues.some(i => i.code === 'change_future_year' && i.severity === 'blocker'), 'שנה הבאה אינה «השנה הנוכחית»');
  }),
  test('פתרון: סגירה מעבר לשנה השוטפת ⇒ דרישת אסמכתאות', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['end'], entered: { endDate: '2025-12-31', currentOccupation: 'שכיר' }, asOf: AS_OF });
    assert(r.issues.some(i => i.code === 'retro_end_docs'), 'אין דרישת אסמכתאות');
  }),
  test('פתרון: המצב הנוכחי בב"ל נפרד מהמבוקש', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['change'], entered: { changeToDate: '2026-10-01' }, asOf: AS_OF });
    equal(r.btl.classificationLabel, 'עצמאי מ-01/06/2025');
    equal(r.data.changeFromDate, '2025-06-01', '«מתאריך» הקודם — מב"ל');
    equal(r.data.incomeBefore, '16500', 'ההכנסה המוצהרת בב"ל');
    equal(r.data.hoursAfter, '', 'הערך המבוקש לא ממולא מעצמו');
  }),
  test('פתרון: ערך שהוזן גובר, והערך מהכרטיס נשמר כחלופה', () => {
    const r = resolve6101({ client: FX_FULL, purposes: [], entered: { city: 'רמת גן' }, asOf: AS_OF });
    equal(r.data.city, 'רמת גן');
    equal(r.fields.city.status, 'entered');
    equal(r.fields.city.alternatives?.[0].value, 'תל אביב - יפו');
  }),
  test('פתרון: בן/בת זוג מוצג רק לנשואים; «עדכון פרטים» לא מבקש סעיף 4', () => {
    const r = resolve6101({ client: FX_LONG, purposes: ['update_details'], entered: {}, asOf: AS_OF });
    equal(r.fields.spouseIdNumber.status, 'not_applicable');
    equal(r.fields.startDate.status, 'not_applicable');
    equal(r.fields.startDate.required, false);
  }),
  test('פתרון: עיסוקים של FX_LONG — חמש תקופות בשנתיים', () => {
    const r = resolve6101({ client: FX_LONG, purposes: ['multi_year_report'], entered: {}, asOf: AS_OF });
    equal(r.data.occupations.length, 5);
    includes(r.data.occupations.map(o => o.occupation), 'לא עובד');
  }),
  test('פתרון: תאריך ההצהרה אינו נקבע בטיוטה', () => {
    const r = resolve6101({ client: FX_FULL, purposes: [], entered: {}, asOf: AS_OF });
    equal(r.data.declarationDate, '');
  }),

  // ── עזרים ──
  test('כתובת: תבניות נפוצות', () => {
    const cases: [string, Partial<ReturnType<typeof parseHebrewAddress>>][] = [
      ['הרצל 12', { street: 'הרצל', houseNumber: '12' }],
      ["רח' הרצל 12/5", { street: 'הרצל', houseNumber: '12', apartment: '5' }],
      ['הרצל 12, דירה 4', { street: 'הרצל', houseNumber: '12', apartment: '4' }],
      ['שדרות רוטשילד 10 כניסה ב דירה 3', { street: 'שדרות רוטשילד', houseNumber: '10', entrance: 'ב', apartment: '3' }],
      ['ת.ד. 4521', { street: 'ת.ד. 4521' }],
      ['הנביאים', { street: 'הנביאים', houseNumber: '', confident: false }],
    ];
    for (const [raw, exp] of cases) {
      const got = parseHebrewAddress(raw);
      for (const [k, v] of Object.entries(exp)) equal((got as unknown as Record<string, unknown>)[k], v, `${raw} · ${k}`);
    }
  }),
  test('הגדרת עצמאי: הערכה בלבד, ולא ידוע כשחסרים נתונים', () => {
    equal(evaluateSelfEmployedDefinition(2026, 20, undefined).kind, 'meets');
    equal(evaluateSelfEmployedDefinition(2026, 5, 7000).kind, 'meets');
    equal(evaluateSelfEmployedDefinition(2026, 12, 2100).kind, 'meets');
    equal(evaluateSelfEmployedDefinition(2026, 10, 2000).kind, 'not_meets');
    equal(evaluateSelfEmployedDefinition(2026, 10, undefined).kind, 'unknown');
    equal(evaluateSelfEmployedDefinition(2024, 5, 9000).kind, 'unknown', 'שנה בלי ספים');
    equal(bandFromHours(12), '12_19');
  }),
  test('טביעה: JSON קנוני לא תלוי בסדר המפתחות', () => {
    equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  }),
  test('תרחיש: כל תרחיש מפעיל רק את הסעיפים שלו', () => {
    const all: Btl6101Purpose[] = ['start', 'change', 'end', 'stop_employees', 'spouse_in_business'];
    for (const p of all) {
      const r = resolve6101({ client: FX_FULL, purposes: [p], entered: {}, asOf: AS_OF });
      const active = Object.values(r.fields).filter(f => f.status !== 'not_applicable').map(f => f.key);
      if (p !== 'start') assert(!active.includes('monthlyIncome'), `${p}: monthlyIncome פעיל`);
      if (p !== 'end') assert(!active.includes('endDate'), `${p}: endDate פעיל`);
    }
  }),

  test('הכנסה שלא מעבודה: סכום בלי פרשנות ⇒ חוסם; עם פרשנות ⇒ נכתב «לחודש»/«לכל התקופה» בלי המרה', () => {
    const row = { from: '2025-01-01', to: '2025-12-31', occupation: 'הכנסה שלא מעבודה', nonWorkIncome: '3200', nonWorkSource: 'שכירות' };
    const noBasis = resolve6101({ client: FX_FULL, purposes: ['multi_year_report'], entered: { occupations: [row] }, asOf: AS_OF });
    assert(noBasis.issues.some(i => i.code === 'occ_income_basis' && i.severity === 'blocker'), 'חסרה פרשנות');
    const noAmount = resolve6101({ client: FX_FULL, purposes: ['multi_year_report'], entered: { occupations: [{ ...row, nonWorkIncome: '' }] }, asOf: AS_OF });
    assert(noAmount.issues.some(i => i.code === 'occ_income_missing'), 'חסר סכום — לא ממלאים 0');
    const ok = resolve6101({ client: FX_FULL, purposes: ['multi_year_report'], entered: { occupations: [{ ...row, nonWorkIncomeBasis: 'period_total' as const }] }, asOf: AS_OF });
    assert(!ok.issues.some(i => i.code.startsWith('occ_income')), 'תקין');
    const ops = layout6101(ok.data, ['multi_year_report'], measure).ops;
    const cell = texts(ops, 'p2.occupations').find(o => o.text.includes('3,200'));
    assert(!!cell, 'הסכום מופיע');
    assert(String(cell!.text).includes('לכל התקופה'), 'לכל התקופה');
  }),

  test('«התחלתי» ו«חדלתי» באותו טופס ⇒ חוסם עד אישור מקצועי עם סיבה', () => {
    const entered = { startSelfEmployed: true, startDate: '2026-02-01', endSelfEmployed: true, endDate: '2026-08-31', hoursBand: '20_plus' as const, monthlyIncome: '9000', profession: 'ייעוץ', currentOccupation: 'שכיר' };
    const blocked = resolve6101({ client: FX_FULL, purposes: ['start', 'end'], entered, asOf: AS_OF });
    assert(blocked.issues.some(i => i.code === 'start_end_confirmation' && i.severity === 'blocker'), 'נחסם');
    const empty = resolve6101({ client: FX_FULL, purposes: ['start', 'end'], entered, asOf: AS_OF, professional: { startAndEnd: { reason: '   ' } } });
    assert(empty.issues.some(i => i.code === 'start_end_confirmation'), 'סיבה ריקה אינה אישור');
    const ok = resolve6101({ client: FX_FULL, purposes: ['start', 'end'], entered, asOf: AS_OF, professional: { startAndEnd: { reason: 'עבודה עונתית שהסתיימה באותה שנה' } } });
    assert(!ok.issues.some(i => i.code === 'start_end_confirmation'), 'אושר עם סיבה');
  }),

  test('אסמכתאות: התחלה/סגירה למפרע ⇒ חובה; תלוש שכר לתקופות כשכיר ⇒ מומלץ', () => {
    const r = resolve6101({ client: FX_FULL, purposes: ['start'], entered: { startSelfEmployed: true, startDate: '2025-03-01', hoursBand: '12_19', monthlyIncome: '7000', profession: 'ייעוץ' }, asOf: AS_OF });
    deepEqual(r.attachments.map(a => [a.key, a.required]), [['retro_start', true]]);
    equal(r.retro.start, true);
    const m = resolve6101({ client: FX_FULL, purposes: ['multi_year_report'], entered: { occupations: [{ from: '2025-01-01', to: '2025-06-30', occupation: 'שכיר', nonWorkIncome: '', nonWorkSource: '' }] }, asOf: AS_OF });
    deepEqual(m.attachments.map(a => [a.key, a.required]), [['salary_slip', false]]);
  }),

  test('ב"ל רשם טווח שעות והכנסה להגדרה ⇒ רמז בלבד; «שעות לפני» לא מתמלא מהם', () => {
    const detail = { hoursBand: '20_plus' as const, definitionIncome: 9000, definitionText: 'עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר הממוצע',
      definitionRule: { weeklyHours: 12, averageWagePct: 15 }, profession: 'ייעוץ', registeredDate: '2025-06-16', status: 'תקף', periodFrom: '2025-06-01', periodTo: null };
    const client = { ...FX_GAPS, niOccupations: [{ id: 'o1', type: 'self_employed' as const, source: 'btl_portal' as const, sourceLabel: 'עצמאי', fromDate: '2025-06-01', btlDetail: detail }] };
    const r = resolve6101({ client, purposes: ['change'], entered: {}, asOf: AS_OF });
    equal(r.data.hoursBefore, '', 'טווח אינו מספר שעות');
    assert(String((r.hints.hoursBefore ?? []).join(' ')).includes('20 שעות ומעלה'), '20 שעות ומעלה');
    assert(String((r.hints.incomeBefore ?? []).join(' ')).includes('הכנסה להגדרה 9,000'), 'הכנסה להגדרה 9,000');
    equal(r.btl.currentSelfEmployed?.btlDetail?.definitionRule?.averageWagePct, 15);
  }),
];
