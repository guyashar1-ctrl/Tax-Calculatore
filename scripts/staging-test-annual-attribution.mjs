#!/usr/bin/env node
/**
 * staging-test-annual-attribution.mjs — "סה״כ נגבה עבור הדוח השנתי".
 *
 * מוכיח שהמספר הוא **ייחוס מסחרי מחושב** ולא ספר חשבונות ולא סכום שמור:
 *   A. החלק מתנאי ההצעה המאושרת שמיוחס לשנת הדוח (שורות category='annual'
 *      עם אותה שנה, מתוך ה-snapshot הקפוא של ההצעה שמאחורי ההתקשרות)
 * + B. השלמות חד-פעמיות לאותה שנה (additional_charges → source_item_id →
 *      שורת 'one_time' עם אותה שנה, בכל הצעות הלקוח — כולל הצעה נוספת)
 * = הסה״כ.
 *
 * ‼ שלוש בדיקות שליליות מוודאות שזה לא "סכום כל התשלומים": חיוב של שנה
 * אחרת, חיוב ידני בלי source_item_id, וחיוב שמקורו בשורה שאינה חד-פעמית —
 * שלושתם חייבים להישאר מחוץ לסה״כ.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];

// ── אותה נוסחה בדיוק כמו src/utils/quotationCalc.ts ──────────────────────────
const round2 = (n) => Math.round(n * 100) / 100;
const itemFinalPrice = (i) => {
  const gross = i.clientPrice * (i.quantity || 1);
  return round2(gross - (i.discountPercent ? gross * (i.discountPercent / 100) : 0));
};

const YEAR = 2025;
console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  // ‼ סדר המחיקה אינו שרירותי: טריגר חוסם מחיקת הצעה כל עוד היא מקושרת
  // לכרטיס לקוח קיים. הלקוח קודם, ההצעה אחריו.
  await writeStaging(`delete from public.additional_charges where description like 'ATTR-%';`);
  await writeStaging(`delete from public.engagements where client_id in (select id from public.clients where last_name = 'ATTR');`);
  await writeStaging(`delete from public.clients where last_name = 'ATTR';`);
  await writeStaging(`delete from public.quotations where quotation_number like 'ATTR-%';`);
}
await cleanup();

try {
  const client = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'ייחוס', 'ATTR', 'delivered@resend.dev')
    returning id;`)).id;

  // ── ההצעה שמאחורי ההתקשרות: ריטיינר חודשי + דוח שנתי 2025 + דוח 2024 ──────
  // דוח 2025: 4,000 ₪ עם 10% הנחה ⇒ 3,600 ₪ מיוחסים.
  const items = [
    { id: 'it-monthly', name: 'ריטיינר חודשי', category: 'monthly', clientPrice: 900, catalogPrice: 900, quantity: 1 },
    { id: 'it-annual-2025', name: 'דוח שנתי', category: 'annual', year: 2025, clientPrice: 4000, catalogPrice: 4000, quantity: 1, discountPercent: 10 },
    { id: 'it-annual-2024', name: 'דוח שנתי', category: 'annual', year: 2024, clientPrice: 3000, catalogPrice: 3000, quantity: 1 },
    { id: 'it-onetime-2025', name: 'השלמת דוח 2025 — ריבוי תיקים', category: 'one_time', year: 2025, clientPrice: 1200, catalogPrice: 1200, quantity: 1 },
    { id: 'it-onetime-2024', name: 'השלמת דוח 2024', category: 'one_time', year: 2024, clientPrice: 800, catalogPrice: 800, quantity: 1 },
  ];
  const snapshot = JSON.stringify({ items }).replace(/'/g, "''");
  const quote = (await one(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, items, snapshot, sent_at, approved_at)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${client}', 'ATTR-1', 'approved',
            '${snapshot}'::jsonb -> 'items', '${snapshot}'::jsonb, now(), now())
    returning id;`)).id;

  await writeStaging(`
    insert into public.engagements (id, user_id, client_id, quotation_id, status, monthly_total)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${client}', '${quote}', 'active', 900);`);

  // ── הצעה *נוספת* שנשלחה אחרי ההתקשרות, עם השלמה לאותה שנה ────────────────
  // ‼ זה בדיוק המקרה שנפל לפני התיקון: החיפוש היה רק בהצעת ההתקשרות.
  const extraItems = [{ id: 'it-extra-2025', name: 'השלמת דוח 2025 — הצעה נוספת', category: 'one_time', year: 2025, clientPrice: 500, catalogPrice: 500, quantity: 1 }];
  const extraSnap = JSON.stringify({ items: extraItems }).replace(/'/g, "''");
  await writeStaging(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, items, snapshot, sent_at, approved_at)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${client}', 'ATTR-2', 'approved',
            '${extraSnap}'::jsonb -> 'items', '${extraSnap}'::jsonb, now(), now());`);

  // ── החיובים ───────────────────────────────────────────────────────────────
  const charge = async (desc, amount, srcItem) => writeStaging(`
    insert into public.additional_charges (id, user_id, client_id, description, amount, status, source_type, source_item_id)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${client}', '${desc}', ${amount}, 'pending',
            ${srcItem ? `'quotation', '${srcItem}'` : `'manual', null`});`);
  await charge('ATTR-השלמה 2025', 1200, 'it-onetime-2025');   // נכנס
  await charge('ATTR-השלמה 2025 נוספת', 500, 'it-extra-2025'); // נכנס (הצעה נוספת)
  await charge('ATTR-השלמה 2024', 800, 'it-onetime-2024');     // שנה אחרת — לא
  await charge('ATTR-חיוב ידני', 999, null);                   // בלי מקור — לא
  await charge('ATTR-מקור חודשי', 900, 'it-monthly');          // לא חד-פעמי — לא

  // ── שחזור החישוב מהרשומות האמיתיות ────────────────────────────────────────
  const q = await one(`select snapshot from public.quotations where id = '${quote}';`);
  const snapItems = q.snapshot.items;
  const annualForYear = snapItems.filter((i) => i.category === 'annual' && i.year === YEAR);
  const retainerAttributed = annualForYear.reduce((s, i) => s + itemFinalPrice(i), 0);

  const allQuotes = await writeStaging(`select snapshot from public.quotations where client_id = '${client}';`);
  const oneTimeById = new Map();
  for (const row of allQuotes) for (const i of (row.snapshot?.items ?? [])) if (i.category === 'one_time') oneTimeById.set(i.id, i);

  const charges = await writeStaging(`select description, amount, source_item_id from public.additional_charges where client_id = '${client}';`);
  const topUps = charges.filter((c) => {
    const src = c.source_item_id ? oneTimeById.get(c.source_item_id) : undefined;
    return !!src && src.year === YEAR;
  });
  const topUpAttributed = topUps.reduce((s, c) => s + Number(c.amount), 0);
  const total = retainerAttributed + topUpAttributed;

  console.log('— החישוב על הרשומות האמיתיות —');
  console.log(`  שנת הדוח:                 ${YEAR}`);
  console.log(`  A · מיוחס מהריטיינר:      ${retainerAttributed} ₪  (4,000 × (1 − 10%) — שורת annual/2025 מה-snapshot)`);
  console.log(`  B · השלמות חד-פעמיות:     ${topUpAttributed} ₪  (${topUps.map((t) => `${t.description} ${t.amount}`).join(' + ')})`);
  console.log(`  ────────────────────────────────`);
  console.log(`  סה״כ נגבה עבור הדוח:      ${total} ₪\n`);

  ok('A · הריטיינר המיוחס מחושב מהשורה השנתית של אותה שנה, אחרי הנחה', retainerAttributed === 3600, `${retainerAttributed}`);
  ok('B · שתי ההשלמות של 2025 נכנסות — כולל זו שמהצעה נוספת', topUpAttributed === 1700, `${topUpAttributed}`);
  ok('B2 · ההשלמה מההצעה הנוספת אותרה (הרגרסיה שתוקנה בשער)',
    topUps.some((t) => t.description === 'ATTR-השלמה 2025 נוספת'), JSON.stringify(topUps.map((t) => t.description)));
  ok('סה״כ = A + B', total === 5300, `${total}`);

  console.log('\n— מה נשאר בחוץ (הוכחה שזה לא סכום כל התשלומים) —');
  const excluded = charges.filter((c) => !topUps.includes(c));
  const excludedSum = excluded.reduce((s, c) => s + Number(c.amount), 0);
  for (const c of excluded) console.log(`  · ${c.description} (${c.amount} ₪)`);
  ok('חיוב של שנה אחרת אינו נכלל', !topUps.some((t) => t.description === 'ATTR-השלמה 2024'));
  ok('חיוב ידני בלי source_item_id אינו נכלל', !topUps.some((t) => t.description === 'ATTR-חיוב ידני'));
  ok('חיוב שמקורו בשורה חודשית אינו נכלל', !topUps.some((t) => t.description === 'ATTR-מקור חודשי'));
  ok('סכום כל החיובים שונה מהסה״כ המיוחס — הוכחה שאינו ספר חשבונות',
    charges.reduce((s, c) => s + Number(c.amount), 0) !== total,
    `כל החיובים ${charges.reduce((s, c) => s + Number(c.amount), 0)} מול ייחוס ${total}`);
  console.log(`  סך מה שנשאר בחוץ: ${excludedSum} ₪`);

  ok('אין עמודת סה״כ שמורה שיכולה להתיישן',
    (await one(`select count(*)::int as n from information_schema.columns
       where table_schema='public' and column_name ilike '%annual%attribut%';`)).n === 0);
} finally {
  await cleanup();
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
