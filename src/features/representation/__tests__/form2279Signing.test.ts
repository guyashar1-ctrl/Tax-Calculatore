// ─── טופס 2279 משע״ם → מסמך חתימה אוטומטי ───────────────────────────────────
// ‼ 28.09.2026 · נבדק מול שני טפסים אמיתיים שהופקו בשע״ם (23.09, 27.08) ומול
// הסימון הידני של גיא בהדגמה המוקלטת (27.08). ה-fixture הוא שכבת הטקסט הקבועה
// של הטופס — החיתוך של שני הטפסים, בלי אף ערך אישי.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import layout from './fixtures/form2279-layout-2026-09.json';
import {
  buildForm2279Fields, form2279BothSign, verifyForm2279Layout, FORM_2279_ANCHORS, FORM_2279_TEMPLATE,
  type Form2279Layout,
} from '../shaamRepresentation';

const L = layout as unknown as Form2279Layout;
const anchor = (id: string) => FORM_2279_ANCHORS.find(a => a.id === id)!;
const inside = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

export const TESTS: TestCase[] = [
  test('פריסה: שכבת הטקסט של טופס 2279 אמיתי עוברת את כל העוגנים', () => {
    const v = verifyForm2279Layout(L);
    assert(v.ok, v.problems.join(','));
    equal(L.items.some(i => /\d/.test(i.s)), false, 'אין ערכים אישיים ב-fixture');
  }),

  test('פריסה: טופס שזז / גודל אחר / כמה עמודים / לא נקרא ⇒ לא מסמנים אוטומטית', () => {
    const shifted = { ...L, items: L.items.map(i => ({ ...i, y: i.y + 0.03 })) };
    equal(verifyForm2279Layout(shifted).ok, false);
    // טופס 2279 הישן בריפו (A4 ‏595×842) — לא הטופס ששע״ם מפיקה היום.
    equal(verifyForm2279Layout({ ...L, width: 595.3, height: 841.9 }).ok, false);
    equal(verifyForm2279Layout({ ...L, numPages: 2 }).ok, false);
    equal(verifyForm2279Layout(null).ok, false);
    const noRegistered = { ...L, items: L.items.filter(i => i.s !== 'רשום') };
    assert(verifyForm2279Layout(noRegistered).problems.includes('anchor:registered_word'), 'העוגן החסר מדווח');
  }),

  test('מיקום: כל תיבה יושבת מעל התווית שלה בטופס', () => {
    const T = FORM_2279_TEMPLATE;
    // «חתימת "בן זוג רשום"/העוסק» — השורה בגובה 0.549, המילים בין 0.389 ל-0.534.
    const reg = anchor('registered_signature_label');
    assert(T.registeredSigner.yPct + T.registeredSigner.heightPct <= reg.y + 0.002 && T.registeredSigner.yPct >= reg.y - 0.06, 'מעל התווית');
    assert(inside(reg.x, T.registeredSigner.xPct, T.registeredSigner.xPct + T.registeredSigner.widthPct), 'באותו רוחב');
    const other = anchor('other_spouse_signature_label');
    assert(inside(other.x, T.otherSpouse.xPct, T.otherSpouse.xPct + T.otherSpouse.widthPct), 'בן/בת הזוג — מעל התווית שלו/ה');
    const stamp = anchor('representative_stamp_label');
    assert(inside(stamp.x, T.accountantStamp.xPct, T.accountantStamp.xPct + T.accountantStamp.widthPct), 'החותמת מעל «חתימה וחותמת»');
    assert(T.accountantStamp.yPct < stamp.y && T.accountantStamp.yPct + T.accountantStamp.heightPct >= stamp.y - 0.01, 'צמודה לשורה');
    // ✓ — מימין לתחילת השורה (טקסט RTL), על קו הבסיס שלה.
    const sms = anchor('sms_consent_line');
    assert(T.smsConsentCheck.xPct >= sms.x && inside(sms.y, T.smsConsentCheck.yPct, T.smsConsentCheck.yPct + T.smsConsentCheck.heightPct), 'ה-✓ של המסרון בתיבה של השורה');
    const orig = anchor('representative_original_line');
    assert(T.representativeOriginalCheck.xPct >= orig.x - 0.001 && inside(orig.y, T.representativeOriginalCheck.yPct, T.representativeOriginalCheck.yPct + T.representativeOriginalCheck.heightPct + 0.001), 'ה-✓ של «המקור במשרדי»');
  }),

  test('חותמים: רווק/ה — חתימה אחת; נשוי/אה במ"ה — שתיים; מע"מ של אדם — אחת', () => {
    const single = buildForm2279Fields('client', form2279BothSign({ authorities: ['incomeTax'] }, false));
    equal(single.filter(f => f.kind === 'signature').map(f => f.signerId).join(), 'client');
    const married = buildForm2279Fields('client', form2279BothSign({ authorities: ['incomeTax', 'vat'] }, true));
    equal(married.filter(f => f.kind === 'signature').map(f => f.signerId).sort().join(), 'client,spouse');
    const vatOnly = buildForm2279Fields('spouse', form2279BothSign({ authorities: ['vat'] }, true));
    equal(vatOnly.filter(f => f.kind === 'signature').map(f => f.signerId).join(), 'spouse');
  }),

  test('חותמים: בן/בת הזוג הרשום/ה ⇒ חותם/ת בתיבת «בן זוג רשום»; המשרד — חותמת + שני ✓ קבועים', () => {
    const f = buildForm2279Fields('spouse', true);
    equal(f.find(x => x.signerId === 'spouse')!.xPct, FORM_2279_TEMPLATE.registeredSigner.xPct);
    equal(f.find(x => x.signerId === 'client')!.xPct, FORM_2279_TEMPLATE.otherSpouse.xPct);
    equal(f.filter(x => x.signerId === 'accountant' && x.kind === 'stamp').length, 1);
    equal(f.filter(x => x.signerId === 'static' && x.kind === 'check').length, 2);
    for (const x of f) assert(x.xPct >= 0 && x.yPct >= 0 && x.xPct + x.widthPct <= 1 && x.yPct + x.heightPct <= 1 && x.pageIndex === 0, `בתוך העמוד: ${x.id}`);
    // מזהים ייחודיים — כל טופס מקבל שדות משלו.
    equal(new Set(f.map(x => x.id)).size, f.length);
  }),
];
