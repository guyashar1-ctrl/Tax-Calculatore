#!/usr/bin/env node
/**
 * staging-test-vat-snapshot.mjs — שער הרגרסיה של מיגרציה 177 (הכרעת מוצר C6).
 *
 *  1  create_engagement_for_quotation מעגלת כל שורה חודשית לאגורות לפני
 *     הסכימה (round(x,2)) — לא סכום גולמי בלי עיגול.
 *  2  vat_rate_at_signing ו-monthly_total_with_vat נכתבים פעם אחת מהתקשרות
 *     חדשה, ותואמים את הכלל: withVat = round(base * (1+rate/100), 2).
 *  3  שינוי quotations.vat_rate אחרי יצירת ההתקשרות אינו משנה את השדות
 *     הקפואים — "מה שהלקוח חתם" אינו נגזר-מחדש.
 *  4  קריאה חוזרת ל-create_engagement_for_quotation (אידמפוטנטיות) אינה
 *     כותבת שוב על ההתקשרות הקיימת ואינה מייצרת ערכים אחרים.
 *  5  חידוש (התקשרות שנייה לאותו לקוח, engagements.status='scheduled')
 *     מקבל את אותם שני שדות קפואים משלו, בלתי תלוי בראשונה.
 *
 * הרצה:  node scripts/staging-test-vat-snapshot.mjs
 * לא דורש seed-staging; קידומת הנתונים: VATSNAP.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];

console.log(`סביבה: ${STAGING_REF}\n`);
const cleanup = () => writeStaging(`
  delete from public.engagements where client_id in (select id from public.clients where last_name='VATSNAP');
  delete from public.additional_charges where client_id in (select id from public.clients where last_name='VATSNAP');
  delete from public.clients where last_name='VATSNAP';
  delete from public.quotations where id like 'vatsnap-%';`);
await cleanup();

try {
  const c = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'וט', 'VATSNAP', 'delivered@resend.dev', 'quoted')
    returning id;`)).id;

  // שלוש שורות חודשיות שסכומן הגולמי (בלי עיגול) שונה מהסכום המעוגל-לכל-שורה:
  // 33.333, 33.333, 33.334 -> גולמי 100.000 (בלי עיגול נראה זהה); הבדל אמיתי
  // מגיע מהנחה שמייצרת שבר: 100 * (1 - 1/3) = 66.666666...
  const items = JSON.stringify([
    { id: 'i1', name: 'פריט א', category: 'monthly', billingType: 'recurring', quantity: 1,
      catalogPrice: 100, clientPrice: 100, discountPercent: 33.333333, vatFlag: true, installments: 12 },
    { id: 'i2', name: 'פריט ב', category: 'monthly', billingType: 'recurring', quantity: 1,
      catalogPrice: 50, clientPrice: 50, vatFlag: true, installments: 12 },
  ]);

  const q1 = 'vatsnap-q1';
  await writeStaging(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, vat_rate, approved_at)
    values ('${q1}', '${U}', '${c}', 'VATSNAP-1', 'approved', replace(gen_random_uuid()::text,'-',''),
            '${items}'::jsonb, 18, now());`);

  const r1 = (await one(`select public.create_engagement_for_quotation('${q1}', false) as r`)).r;
  ok('1 create_engagement_for_quotation הצליחה', r1?.ok === true, JSON.stringify(r1));

  const eng1 = await one(`select monthly_total, vat_rate_at_signing, monthly_total_with_vat, status
                            from public.engagements where id = '${r1.engagementId}'`);
  // itemFinalPrice(i1) = round(100 * (1-0.33333333)) = round(66.666667) = 66.67
  // itemFinalPrice(i2) = 50.00 ; סכום מעוגל-לכל-שורה = 116.67
  ok('1 הסכום החודשי מעוגל לכל שורה בנפרד ולא כסכום גולמי',
    Number(eng1.monthly_total) === 116.67, JSON.stringify(eng1));
  ok('2 vat_rate_at_signing נשמר מ-quotations.vat_rate', Number(eng1.vat_rate_at_signing) === 18);
  ok('2 monthly_total_with_vat = round(base * 1.18, 2)',
    Number(eng1.monthly_total_with_vat) === Math.round(116.67 * 1.18 * 100) / 100,
    `${eng1.monthly_total_with_vat} vs ${Math.round(116.67 * 1.18 * 100) / 100}`);

  // 3 · שינוי שיעור המע"מ על ההצעה אחרי יצירת ההתקשרות אינו נוגע בשדות הקפואים
  await writeStaging(`update public.quotations set vat_rate = 17 where id = '${q1}';`);
  const eng1b = await one(`select vat_rate_at_signing, monthly_total_with_vat from public.engagements where id = '${r1.engagementId}'`);
  ok('3 שינוי vat_rate על ההצעה אחרי האישור אינו משנה את ההתקשרות הקפואה',
    Number(eng1b.vat_rate_at_signing) === 18 && Number(eng1b.monthly_total_with_vat) === Number(eng1.monthly_total_with_vat),
    JSON.stringify(eng1b));

  // 4 · אידמפוטנטיות — קריאה חוזרת לא כותבת שוב
  const r1again = (await one(`select public.create_engagement_for_quotation('${q1}', false) as r`)).r;
  ok('4 קריאה חוזרת מזהה "existed" ולא יוצרת התקשרות שנייה',
    r1again?.ok === true && r1again?.existed === true && r1again?.engagementId === r1.engagementId, JSON.stringify(r1again));
  const engCount = (await one(`select count(*)::int as n from public.engagements where client_id = '${c}'`)).n;
  ok('4 עדיין התקשרות אחת בלבד', engCount === 1, String(engCount));

  // 5 · חידוש — התקשרות שנייה מקבלת שדות קפואים משלה
  await writeStaging(`update public.engagements set status = 'active' where id = '${r1.engagementId}';`);
  const q2 = 'vatsnap-q2';
  const items2 = JSON.stringify([
    { id: 'j1', name: 'פריט חדש', category: 'monthly', billingType: 'recurring', quantity: 1,
      catalogPrice: 200, clientPrice: 200, vatFlag: true, installments: 12 },
  ]);
  await writeStaging(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, vat_rate, approved_at, effective_from)
    values ('${q2}', '${U}', '${c}', 'VATSNAP-2', 'approved', replace(gen_random_uuid()::text,'-',''),
            '${items2}'::jsonb, 18, now(), current_date + interval '30 day');`);
  const r2 = (await one(`select public.create_engagement_for_quotation('${q2}', false) as r`)).r;
  const eng2 = await one(`select monthly_total, vat_rate_at_signing, monthly_total_with_vat, status
                            from public.engagements where id = '${r2.engagementId}'`);
  ok('5 החידוש נוצר עם status=scheduled ושדות קפואים משלו',
    eng2.status === 'scheduled' && Number(eng2.monthly_total) === 200 && Number(eng2.monthly_total_with_vat) === 236,
    JSON.stringify(eng2));
  ok('5 ההתקשרות הראשונה נשארה כפי שהייתה',
    Number((await one(`select monthly_total_with_vat from public.engagements where id = '${r1.engagementId}'`)).monthly_total_with_vat)
      === Number(eng1.monthly_total_with_vat));
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
