// ─── מפת כיסוי האיסוף — נבנית מהקטלוג עצמו, לא נכתבת ביד ─────────────────────
// ‼ קטלוג שדות בטופס אינו הוכחה שהשאלון מכסה אותם. כאן, לכל פריט שהמשרד או הלקוח ממלאים, בשלושת המסלולים
//   (קליטה והשלמת תיק, דוח שנתי, הצהרת הון): מתי הוא רלוונטי, את מי שואלים ואיך מתפצל, איזה מסמך (וקבוע או לתקופה),
//   על מי, לאיזו תקופה, לאיזה טופס/נספח הוא שייך, איפה נשמר — ומה המשרד עושה איתו אחר כך.
// ‼ ובסוף: לכל שדה נספח (annex-info-2025.json) — איך הוא נאסף בפועל; שדה בלי מקור — פער גלוי, לא נסתר מאחורי ספירה.
// הרצה: node scripts/collection-coverage-matrix.mjs  ⇒  docs/tax-foundation/collection-coverage-matrix.md

import { AREAS, ITEMS, ITEM_BY_KEY, type InfoItem, type Area } from '../src/features/taxYear/catalog';
import { DOCS } from '../src/features/taxYear/documents';
import { periodFor } from '../src/features/taxYear/asks';
import { NEW_ENTITY_ITEMS } from '../src/features/taxFile/hub';
import { PROVISIONAL } from '../src/features/taxYear/picture';
import annexInfo from '../src/features/taxForms/data/annex-info-2025.json';
import type { Client } from '../src/types';
import type { Purpose } from '../src/features/taxYear/types';

const PER: Record<string, string> = {
  person: 'לכל אדם (נישום / בן־זוג)', couple: 'משק הבית', employer: 'לכל מעסיק', business: 'לכל עסק בתיק', property: 'לכל נכס',
  account: 'לכל חשבון השקעות', foreign_source: 'לכל מקור בחו״ל', fund: 'לכל קופה', child: 'לכל ילד שנולד בשנה',
  transaction: 'לכל עסקה (נולדת מתשובה)', company: 'לכל חברה', asset: 'לכל נכס',
};
const INPUT: Record<string, string> = { yesno: 'כן / לא / לא בטוח', amount: 'סכום', date: 'תאריך', text: 'טקסט', choice: 'בחירה', confirm: '«זה מה שידוע לנו» — נכון / השתנה', file: 'קובץ (או «אין לי עדיין»)' };
const PURPOSE: Record<Purpose, string> = { estimate: 'הערכה', annual: 'דוח שנתי', wealth: 'הצהרת הון', intake: 'קליטה והשלמת תיק' };
const AREA: Record<string, Area> = Object.fromEntries(AREAS.map(a => [a.id, a]));
const dummy = { id: 'c', firstName: 'א', familyStatus: 'single' } as unknown as Client;

function relevance(i: InfoItem): string {
  const r: string[] = [];
  if (i.after) r.push(`אחרי «כן» ב: ${ITEM_BY_KEY[i.after]?.label ?? i.after}`);
  if (i.onlyNew) r.push('רק על ישות חדשה (אחרי «כן», כשבתיק אין ישות כזו לאדם)');
  if (i.onlyIfOnCard) r.push('רק כשבכרטיס יש מה לאשר');
  if (i.noCardEntity) r.push('רק כשבכרטיס אין לאדם עסק');
  if (i.coveredBy) r.push(`לא נשאל כשהכרטיס עונה דרך «${ITEM_BY_KEY[i.coveredBy]?.label ?? i.coveredBy}»`);
  if (i.whenEmpty) r.push(`כרטיס ריק ⇒ «${i.whenEmpty.question}»`);
  if (i.rare) r.push('חריג — רק כשהמשרד פותח');
  if (i.declKind) r.push(i.declKind === 'first' ? 'הצהרה ראשונה בלבד' : 'הצהרת המשך בלבד');
  if (i.calcBlockedBy) r.push(`החישוב חסום (${i.calcBlockedBy}) — האיסוף נמשך`);
  if (i.cardKeys?.length) r.push(`ממולא מהכרטיס (${i.cardKeys.join(', ')})`);
  return r.join(' · ') || 'תמיד (בתכלית)';
}
function question(i: InfoItem): string {
  if (i.who === 'office') return 'המשרד משלים (לא נשאל הלקוח)';
  const kind = i.input ? INPUT[i.input] ?? i.input : '—';
  const q = (i.coupleQuestion ? `${i.question} · לזוג: «${i.coupleQuestion}»` : i.question) ?? i.label;
  return `${kind}: ${q}${i.followupQuestion ? ` · בהמשך: «${i.followupQuestion}»` : ''}`;
}
function doc(i: InfoItem): string {
  if (!i.docKind) return '';
  const d = DOCS[i.docKind];
  const from = d.availableFrom ? `זמין בד״כ מ-${d.availableFrom(2025).slice(5).split('-').reverse().join('.')} בשנה שאחרי` : 'זמין מיד';
  return `${d.label} — ${from}${d.durable ? ' · **קבוע**: מאושר פעם אחת — לא מתבקש שוב' : ' · לתקופה'}`;
}
function period(i: InfoItem, p: Purpose): string {
  const x = periodFor({ client: dummy, taxYear: 2025, purpose: p, cutoffMonth: 9, asOfDate: '2025-12-31' }, i);
  const kind = x.periodKind === 'as_of' ? (p === 'intake' ? 'ליום הקליטה' : 'ליום ההצהרה') : x.periodKind === 'months' ? 'עד חודש החתך' : 'שנת המס';
  return `${kind} (${x.basis})`;
}
function form(i: InfoItem, p: Purpose): string {
  const a = AREA[i.area];
  if (p === 'wealth') return a?.form1219 ? `1219: ${a.form1219}` : '1219';
  const parts = [...new Set([...(i.covers?.parts ?? []), ...(a?.parts1301 ?? [])])];
  const ann = [...new Set([...(i.covers?.annexItems ?? []).map(x => x.split('.')[0]), ...(i.covers?.annexItems?.length ? [] : a?.annexes ?? [])])];
  const s = `1301 ח׳ ${parts.join(', ')}${ann.length ? ` · ${ann.join(', ')}` : ''}`;
  return p === 'intake' ? `התיק (משמש ל-${s})` : s;
}
function stored(i: InfoItem): string {
  const s = ['tax_year_facts (ממתין לאישור)'];
  if (i.docKind) s.push('+ tax_evidence');
  if (NEW_ENTITY_ITEMS[i.key]) s.push(`ישות ⇒ «הוסף לתיק» (${NEW_ENTITY_ITEMS[i.key]})`);
  if (i.cardFlag || i.cardChoice) s.push(`⇒ «עדכן בתיק» (${i.cardFlag ?? i.cardChoice})`);
  if (PROVISIONAL[i.per] && i.after) s.push('ישות זמנית כשאין בתיק');
  return s.join(' · ');
}
function officeNext(i: InfoItem): string {
  if (i.officeNext) return i.officeNext;
  if (i.kind === 'document') return 'לבדוק «של מי?» ו«לתקופה הנכונה?», לאשר או «החזר ללקוח»; להזין ממנו סכומים (אין חילוץ אוטומטי)';
  if (i.who === 'office' && i.kind === 'amount') return 'להזין מהמסמך שאושר — נשמר מאושר, עם המסמך; בלי מסמך — «בפועל, בלי אסמכתה»';
  if (i.who === 'office') return 'המשרד מכריע ורושם (נשמר עם מי ומתי)';
  if (i.kind === 'screener') return '«כן» פותח את פריטי ההמשך; «לא» סוגר אותם (שאלה שכבר נשלחה — «לא רלוונטית», לביטול)';
  if (i.kind === 'confirm') return '«אין שינוי» — אישור מרוכז; «משהו השתנה» — לעדכן בכרטיס או «הוסף לתיק»';
  if (i.kind === 'amount') return 'להשוות למסמך; סכום בלי מסמך נשמר «מוצהר»';
  return 'לבדוק ולאשר; מה שחסר — «החזר ללקוח» עם מה לתקן';
}

const lines: string[] = [];
const all = ITEMS.filter(i => i.purposes.some(p => p === 'annual' || p === 'wealth' || p === 'intake'));
lines.push('# מפת כיסוי האיסוף — נבנתה מהקטלוג', '');
lines.push(`נוצר ${new Date().toISOString().slice(0, 10)} מ-\`src/features/taxYear/catalog.ts\`, \`wealthCatalog.ts\`, \`intakeCatalog.ts\` (${all.length} פריטים בשלושת המסלולים). לא לערוך ביד — \`node scripts/collection-coverage-matrix.mjs\`.`, '');
lines.push('‼ **מספר הפריטים אינו הוכחת כיסוי.** הכיסוי נבדק מול הטפסים והנספחים בסוף המסמך («כיסוי שדות הנספחים» — לכל שדה: שאלה, מסמך ייעודי או משימת משרד), ומול המחקר המקצועי (`docs/tax-foundation/research/`). נושא שהחישוב שלו טרם נתמך — נאסף, ויש לו טיפול משרד (העמודה האחרונה).', '');
lines.push('**איך לקרוא:** «מי» — הלקוח עונה או המשרד משלים; «מתי» — התנאי שבו הפריט נשאל; «על מי» — הפריט מוכפל לכל אדם או ישות; «תקופה» — איך התשובה נשמרת; «טופס» — לאן הנתון הולך; «נשמר» — הכול ממתין עד אישור המשרד; «המשרד אחר כך» — מה עושים עם התשובה או המסמך, גם ביד.', '');
lines.push('**כללים בכל המסלולים:**',
  '- חסר = אין שורה; «לא», אפס ו«לא חל» הן תשובות. תשובת לקוח היא הצעה — נכנסת לשימוש רק אחרי אישור המשרד (אפשר במרוכז, עם פירוט).',
  '- פריט פתוח אחד לזהות (לקוח + שנה/יום + פריט + אדם + ישות) — לא שואלים פעמיים. «אין לי עדיין» ⇒ מועד מעקב לפי סוג המסמך, והכדור חוזר למשרד.',
  '- מסמך **לתקופה** (106, 867, אישור יתרות ליום הצהרה, תלוש) — לכל שנה או יום. מסמך **קבוע** (תעודת זהות, תעודת עוסק, חוזה רכישה, אישור זכאות לתואר) שכבר אושר — בכל שנה ובכל תהליך — לא מתבקש שוב.',
  '- «כן» בלי ישות בתיק (מעסיק, נכס, חשבון, מקור בחו״ל, קופה) ⇒ **ישות זמנית**: שאלת פרטים ומסמך מיד; «הוסף לתיק» מכניס אותה לכרטיס עם אותו מזהה, והמסמך שהועלה נשאר שלה. עסק — משימה למשרד (פתיחה בכרטיס).',
  '- תשובה ששונתה (למשל «כן» שתוקן ל«לא») ⇒ שאלות פתוחות שנשענו עליה מסומנות «לא רלוונטיות» ומבוטלות — נשמרות בהיסטוריה.',
  '- הכרטיס משתנה רק דרך הצעה עם הערך הקודם והמקור («עדכן בתיק», «הוסף לתיק») או עריכה ידנית ואז «עודכן בתיק». תוצר שאושר — לא משתנה; מסומן «לבדיקה».',
  '- «נמסר בידי הלקוח» ≠ «אומת במסמך» ≠ «נבדק ברשות» (יישור קו). תשובת שאלון לעולם אינה אימות ברשות, והאיסוף אינו מחכה לאוטומציה.',
  '- עבודה ביד: «איך עושים את זה ביד» בכל דף תהליך — מה מכינים, השלבים, מה בודקים, באיזה טופס או מסך, ומה נחשב ראיה.', '');

for (const purpose of ['intake', 'annual', 'wealth'] as Purpose[]) {
  const items = ITEMS.filter(i => i.purposes.includes(purpose));
  lines.push(`## ${PURPOSE[purpose]} — ${items.length} פריטים (${items.filter(i => i.who === 'client').length} ללקוח, ${items.filter(i => i.who === 'office').length} למשרד, ${items.filter(i => i.kind === 'document').length} מסמכים)`, '');
  for (const a of [...new Set(items.map(i => i.area))]) {
    const ar = AREA[a];
    lines.push(`### ${ar?.title ?? a}${ar ? ` — ללקוח: «${ar.clientTitle}»` : ''}`, '');
    lines.push('| פריט | מי | מתי | שאלה והסתעפות | מסמך | על מי | תקופה | טופס | נשמר | המשרד אחר כך |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const i of items.filter(x => x.area === a)) {
      const cells = [i.label, i.who === 'office' ? 'משרד' : 'לקוח', relevance(i), question(i), doc(i), PER[i.per] ?? i.per, period(i, purpose), form(i, purpose), stored(i), officeNext(i)];
      lines.push('| ' + cells.map(c => c.replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |');
    }
    lines.push('');
  }
}

// ── כיסוי שדות הנספחים: לכל שדה — איך הוא נאסף בפועל ──
// ‼ 12.10.2026 (גיא): «אל תסמן כיסוי מלא רק משום שהלקוח התבקש להעלות מסמך כללי». לכל שדה שמקורו לקוח או מסמך
//   מוצג המקור הממשי: שאלה ללקוח, מסמך ייעודי (שמו), או משימת משרד עם המסמך שממנו ממלאים. שדה שאין לו אף אחד
//   מאלה — פער איסוף, גלוי.
type AnnexItem = { key: string; label: string; source?: string; note?: string; documents?: string[] };
const annexes = (annexInfo as unknown as { annexes: { formId: string; items: AnnexItem[] }[] }).annexes;
const coverers = (key: string) => ITEMS.filter(i => i.covers?.annexItems?.includes(key));
const how = (i: InfoItem): string => {
  if (i.who === 'office') return `משימת משרד «${i.label}»${i.docKind ? ` (מקור: ${DOCS[i.docKind].label})` : ''}`;
  if (i.kind === 'document' && i.docKind) return `מסמך ייעודי: ${DOCS[i.docKind].label}`;
  return `שאלה ללקוח: «${i.label}»`;
};
const SKIP = /identity|addressee|applicant|taxYear|worker|sellerIdentity/;
lines.push('## כיסוי שדות הנספחים — איך נאסף כל שדה (דוח שנתי 2025)', '');
lines.push('מתוך `src/features/taxForms/data/annex-info-2025.json`. «מקור» — מאיפה הנתון מגיע לפי המיפוי: `fileFact` (מהתיק), `office` (המשרד), `document` (מסמך), `client` (הלקוח), `calculation` (חישוב). לשדה שמקורו לקוח או מסמך מוצג **איך הוא נאסף בפועל**: שאלה ללקוח, מסמך ייעודי, או משימת משרד שממלאים ממסמך מוגדר. שדה של משרד/תיק/חישוב בלי פריט — המשרד ממלא בהכנת הדוח (בהמשך התוכנית).', '');
let gapClient = 0, docClient = 0;
for (const a of annexes) {
  const rows = a.items.filter(x => !SKIP.test(x.key));
  const need = rows.filter(x => /client|document/.test(String(x.source)));
  if (!need.length) continue;
  lines.push(`### ${a.formId}`, '', '| שדה בנספח | מקור לפי המיפוי | איך נאסף | כשחסר |', '|---|---|---|---|');
  for (const x of need) {
    docClient++;
    const c = coverers(x.key);
    if (!c.length) gapClient++;
    const office = c.filter(i => i.who === 'office');
    const missing = !c.length ? '**פער איסוף** — אין שאלה, מסמך ייעודי או משימת משרד'
      : office.length ? 'משימת משרד גלויה («להשלים במשרד»)' : 'שאלה פתוחה / «אין לי עדיין» — מעקב';
    lines.push(`| ${x.label.replace(/\|/g, '/')} | ${x.source} | ${c.length ? c.map(how).join('<br>').replace(/\|/g, '/') : '—'} | ${missing} |`);
  }
  lines.push('');
}
lines.push(`סה״כ שדות נספח שמקורם לקוח או מסמך: **${docClient}**; בלי מקור איסוף מוגדר: **${gapClient}**.`, '');
process.stdout.write(lines.join('\n'));
