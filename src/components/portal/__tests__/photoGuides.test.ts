// ─── בדיקות: המדריכים המצולמים — הרישום, הצילומים והתוכן המאומת (221) ──────────
// ‼ מה נעול כאן:
//   · «תביעת מילואים»: שבעה צעדים — שישה עם צילום; השישי («צור קשר») נושא גם נוסח להעתקה, והשביעי (טופס 502,
//     עם קישור) בלי צילום.
//   · לכל צעד עם צילום: הקובץ קיים ב-public/guides/reserve-duty-claim, המידות המוצהרות הן המידות
//     האמיתיות של ה-webp, ומרכז ההגדלה בתוך התמונה. בתיקייה רק הצילומים המנוקים — לא מקורות.
//   · מפתח לא מוכר (ישן, שגוי, או שם של תכונת אובייקט) ⇒ אין מדריך.
//   · תוכן מקצועי: אין הנחיה שאינה מבוססת (לא «תוך כ-10 ימים»), הסכום 2,548 ₪ הוא דוגמה בלבד ולא «מינימום»,
//     טופס 502 מצרף את אישור צה״ל (3010) ואילו בהגשה באזור האישי אין צורך בו, והקישורים הם של האתרים הרשמיים.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { PHOTO_GUIDES, photoGuideFor, photoGuideImagePath } from '../photoGuides';

const ROOT = process.cwd();
const G = PHOTO_GUIDES.reserve_duty_claim;

/** מידות webp מהכותרת (VP8 / VP8L / VP8X) — בלי תלות חדשה. */
function webpSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`לא webp: ${path}`);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  throw new Error(`סוג webp לא מוכר: ${kind}`);
}

const allText = G.steps.map(s => `${s.title}\n${s.text}\n${s.extra ?? ''}`).join('\n');

export const TESTS: TestCase[] = [
  test('«תביעת מילואים»: שבעה צעדים — שישה עם צילום, השישי («צור קשר») גם עם נוסח להעתקה, והשביעי עם קישור לטופס 502 (בלי צילום)', () => {
    equal(G.steps.length, 7);
    deepEqual(G.steps.map(s => !!s.image), [true, true, true, true, true, true, false]);
    deepEqual(G.steps.map(s => !!s.link), [false, false, false, false, false, false, true]);
    deepEqual(G.steps.map(s => !!s.copy), [false, false, false, false, false, true, false]);
    equal(G.key, 'reserve_duty_claim');
    equal(G.dir, 'reserve-duty-claim');
    equal(G.siteLabel, 'לאזור האישי בביטוח לאומי');
    for (const s of G.steps) assert(s.title.trim() !== '' && s.text.trim() !== '', `צעד בלי כותרת/הוראה: ${s.title}`);
  }),

  test('כל צעד עם צילום: הקובץ קיים, המידות המוצהרות הן האמיתיות, והמרכז בתוך התמונה', () => {
    G.steps.forEach((s, i) => {
      if (!s.image) return;
      const rel = photoGuideImagePath(G, i);
      assert(!!rel, `צעד ${i + 1}: אין נתיב`);
      const file = join(ROOT, 'public', rel!);
      assert(existsSync(file), `צעד ${i + 1}: חסר ${rel}`);
      const real = webpSize(file);
      equal(real.w, s.image.w, `צעד ${i + 1}: רוחב`);
      equal(real.h, s.image.h, `צעד ${i + 1}: גובה`);
      const [fx, fy] = s.image.focus;
      assert(fx > 0 && fx < s.image.w && fy > 0 && fy < s.image.h, `צעד ${i + 1}: focus [${fx},${fy}] מחוץ ל-${s.image.w}×${s.image.h}`);
      assert(s.image.alt.trim().length > 40, `צעד ${i + 1}: alt קצר מדי`);
    });
  }),

  test('הצילומים ממוספרים לפי הצילומים (הצעד בלי צילום לא תופס מספר), ובתיקייה רק הצילומים המנוקים', () => {
    deepEqual(G.steps.map((_, i) => photoGuideImagePath(G, i)), [
      'guides/reserve-duty-claim/step-1.webp', 'guides/reserve-duty-claim/step-2.webp', 'guides/reserve-duty-claim/step-3.webp',
      'guides/reserve-duty-claim/step-4.webp', 'guides/reserve-duty-claim/step-5.webp', 'guides/reserve-duty-claim/step-6.webp', null,
    ]);
    equal(photoGuideImagePath(G, 99), null);
    // ‼ מקורות (docx, תמונות עם פרטים אישיים) וסקריפט העיבוד לעולם לא בפרויקט.
    deepEqual(readdirSync(join(ROOT, 'public/guides', G.dir)).sort(), ['step-1.webp', 'step-2.webp', 'step-3.webp', 'step-4.webp', 'step-5.webp', 'step-6.webp']);
  }),

  test('מפתח לא מוכר ⇒ אין מדריך (גם שמות של תכונות אובייקט)', () => {
    equal(photoGuideFor('reserve_duty_claim'), G);
    for (const k of ['nope', '', ' ', 'Reserve_Duty_Claim', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 42, {}, []]) {
      equal(photoGuideFor(k), null, `מפתח ${JSON.stringify(k)}`);
    }
  }),

  test('תוכן מקצועי מאומת: אין «10 ימים», 2,548 ₪ דוגמה בלבד, וטופס 502 מצרף את אישור צה״ל', () => {
    // ‼ «התשלום מגיע תוך כ-10 ימים» אין לו בסיס במקורות הרשמיים — ירד.
    assert(!/10 ימים|עשרה ימים/.test(allText), 'אין הבטחת זמן תשלום');
    // ‼ 2,548 ₪ הוא תביעה אחת של 31 ימים (25% מתגמול המינימום ליום × 31) — לא מינימום ולא סכום מובטח.
    assert(!/מינימום\s*(של\s*)?2,?548/.test(allText), 'אין «מינימום 2,548»');
    const withAmount = G.steps.filter(s => /2,548/.test(`${s.text} ${s.extra ?? ''}`));
    equal(withAmount.length, 1, 'הסכום מופיע במקום אחד');
    assert(/דוגמה בלבד/.test(withAmount[0].extra ?? ''), 'הסכום מסומן «דוגמה בלבד»');
    assert(/31 ימים/.test(withAmount[0].extra ?? ''), 'הסכום צמוד למספר הימים שלו');
    // בהגשה באזור האישי אין צורך בטופס 3010 (כך כתוב באתר) — ובטופס 502 הוא חובה.
    assert(/את טופס 3010 לא צריך לצרף/.test(G.steps[4].extra ?? ''), 'צעד 5: אין צורך ב-3010');
    const s7 = G.steps[6];
    assert(/טופס 502/.test(s7.text) && /טופס 3010/.test(s7.text), 'צעד 7: טופס 502 עם אישור צה״ל (3010)');
    assert(/כשכיר וגם כעצמאי/.test(s7.text), 'צעד 7: מי שעבד גם כשכיר');
    assert(/לא בטוחים\? שאלו אותנו/.test(s7.extra ?? ''), 'צעד 7: אין ניחוש — שואלים');
    // ההצהרה בצעד 5 («לא עבדתי כשכיר ערב השירות») מסומנת רק אם נכונה — וההפניה היא לצעד 5, לא ל«הקודם».
    assert(/את ההצהרה בצעד 5 \(«לא עבדתי כשכיר ערב השירות»\) מסמנים רק אם היא נכונה/.test(s7.text), 'צעד 7: ההצהרה (צעד 5) רק אם נכונה');
    assert(/קראו את הצעד האחרון/.test(G.steps[0].extra ?? ''), 'צעד 1 מפנה לצעד האחרון (שכיר ועצמאי)');
  }),

  test('«צור קשר» (צעד 6): התפריט והשדות כמו באתר, נוסח להעתקה עם מקום-שמור לחודשים, וחזרה לדף', () => {
    // ‼ מקור: צילום האתר ששלח גיא. «צור קשר» הוא פריט תפריט ראשי; בלשונית «פניה חדשה» — נושא, מהות, פירוט ותוכן.
    const s6 = G.steps[5];
    equal(s6.title, 'המערכת לא מאפשרת להגיש תביעה?');
    for (const w of ['«צור קשר»', '«פניה חדשה»', 'נושא הפניה «מילואים»', 'מהות הפניה «עצמאי»', 'פירוט הפניה «איך ישולם התגמול לעצמאי?»']) {
      assert(s6.text.includes(w), `חסר: ${w}`);
    }
    assert(!/«מילואים» ← «צור קשר»/.test(s6.text), '«צור קשר» אינו תחת «מילואים» בתפריט');
    // ‼ תנאי, לא קביעה: את החסימה עצמה לא מצאנו במקור כתוב של ביטוח לאומי.
    assert(/אם המערכת לא מאפשרת להגיש תביעה/.test(s6.text), 'מנוסח כתנאי');
    assert(/ביטוח לאומי משלם לעצמאים כל חודש/.test(s6.text), 'למה (נבדק מול ביטוח לאומי: תשלום בתחילת כל חודש)');
    const c = s6.copy!;
    equal(c.label, 'נוסח לדוגמה לשדה «תוכן הפניה»');
    assert(c.text.startsWith('אני עצמאי שעונה להגדרה מתחילת השנה וקיבלתי פיצוי בשיעור 25% עבור [חודש] בלבד;'), 'הנוסח של גיא');
    assert(c.text.endsWith('אודה להשלמת הפיצוי המגיע לי מחודש [חודש] ועד היום.'), 'סוף הנוסח');
    equal((c.text.match(/\[חודש\]/g) ?? []).length, 2, 'שני מקומות-שמור לחודשים');
    assert(/מחליפים את \[חודש\] בחודשים שלכם/.test(s6.extra ?? ''), 'מסבירים להחליף');
    assert(/חוזרים לדף ובוחרים «המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»»/.test(s6.extra ?? ''), 'חוזרים ובוחרים את התשובה המתאימה');
    // ההפניות מהצעדים 2 ו-3 לצעד 6 מגיעות לצעד הזה.
    assert(/ראו צעד 6/.test(G.steps[1].extra ?? '') && /ראו צעד 6/.test(G.steps[2].extra ?? ''), 'צעדים 2–3 מפנים לצעד 6');
    // צעד 5 (הגשה רגילה) אומר לחזור ולבחור.
    assert(/אחרי השליחה חוזרים לדף ובוחרים «חסרה תקופה - הגשתי עליה תביעה»/.test(G.steps[4].extra ?? ''), 'צעד 5: חוזרים לדף');
    assert(!/\.\.\.|TODO|XXX/.test(c.text), 'אין שאריות');
    // ‼ הצילום: הצילום של גיא, נחתך לדף בלבד. השם והדואר האלקטרוני מוסתרים (כיסוי בלי פיקסל מהמקור), והחצים — על «צור קשר»
    //   בתפריט ועל תיבת «תוכן הפניה». ה-alt אומר את שלושת הדברים, כדי שגם מי שלא רואה את התמונה יבין מה בה.
    const im = s6.image!;
    assert(/«צור קשר» מוקף ומסומן בחץ/.test(im.alt), 'alt: «צור קשר» בתפריט מסומן');
    assert(/«תוכן הפניה» מוקפת ומסומנת בחץ/.test(im.alt), 'alt: תיבת התוכן מסומנת');
    assert(/השם וכתובת הדואר האלקטרוני מוסתרים/.test(im.alt), 'alt: הפרטים האישיים מוסתרים');
    // המרכז: ראש החץ של התפריט — בצד הימני של התמונה (שם התפריט), לא באמצע.
    assert(im.focus[0] > im.w * 0.6, 'המרכז בצד התפריט');
  }),

  test('הקישורים: האזור האישי של ביטוח לאומי, וטופס 502 המקוון באתר הרשמי', () => {
    equal(G.entry.url, 'https://ps.btl.gov.il/#/Mevutach/Berur/');
    equal(G.entry.host, 'ps.btl.gov.il');
    equal(new URL(G.entry.url).hostname, G.entry.host);
    equal(G.entry.note, 'נדרשות כניסה והזדהות.');
    const l = G.steps[6].link!;
    equal(l.url, 'https://govforms.gov.il/mw/forms/T502@btl.gov.il?gbxid=0');
    equal(l.host, 'govforms.gov.il');
    equal(new URL(l.url).hostname, l.host);
    for (const u of [G.entry.url, l.url]) assert(u.startsWith('https://'), `לא https: ${u}`);
    // ‼ אף צעד אחר לא נושא קישור — הכניסה לאתר היא ב-entry, והטופס בצעד האחרון בלבד.
    equal(G.steps.filter(s => s.link).length, 1);
  }),

  test('הסתייגות מתחת לצילום וכותרת עליונה', () => {
    equal(G.kicker, 'מדריך מצולם · תביעת מילואים בביטוח לאומי');
    equal(G.fine, 'הצילומים להמחשה, ופרטים אישיים הוסתרו בהם. המסכים באתר ביטוח לאומי עשויים להשתנות.');
  }),
];
