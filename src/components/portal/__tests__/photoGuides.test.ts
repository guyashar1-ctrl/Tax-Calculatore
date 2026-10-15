// ─── בדיקות: המדריכים המצולמים — הרישום, הצילומים והתוכן המאומת (221, 248) ──────────
// ‼ מה נעול כאן:
//   · «תביעת מילואים» מתחיל בשאלה «מה הייתם ערב השירות?» (ארבע תשובות), ואחריה שני מסלולים של שישה צעדים מצולמים:
//     האזור האישי (עצמאים, סטודנטים ומי שלא עבד) וטופס 502 (עצמאי וגם שכיר). «שכיר בשכר חודשי» — אין צעדים: המעסיק מגיש.
//     כל לקוח עובר שבעה צעדים, ולכן הכפתור אומר «7 צעדים» בכל מסלול.
//   · לכל צעד עם צילום: הקובץ קיים ב-public/guides/reserve-duty-claim, המידות המוצהרות הן המידות
//     האמיתיות של ה-webp, ומרכז ההגדלה בתוך התמונה. בתיקייה רק הצילומים המנוקים — לא מקורות.
//   · מפתח לא מוכר (ישן, שגוי, או שם של תכונת אובייקט) ⇒ אין מדריך.
//   · תוכן מקצועי (מקורות ב-photoGuides.ts): אין הנחיה שאינה מבוססת (לא «תוך כ-10 ימים»), 2,548 ₪ דוגמה בלבד,
//     «שלושה שבועות» לעצמאי (ראש טופס 502), שלושת המעמדות באזור האישי, ובטופס 502 — כל חודש בנפרד, «עובד עצמאי ושכיר»,
//     ושתי האפשרויות של «אני תובע» לפי מי שחייב לשלם.
//   · כל תשובה שהמדריך אומר «חוזרים לדף ובוחרים» קיימת בנוסח המוכן (248) — אחרת הלקוח מחפש תשובה שאין.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { PHOTO_GUIDES, photoGuideFor, photoGuideImagePath, photoGuideStepCount } from '../photoGuides';
import { stepsOnTrack } from '../photoGuideSteps';
import { reserveDutyPayload } from '../../office/__fakeReserveDuty';

const ROOT = process.cwd();
const G = PHOTO_GUIDES.reserve_duty_claim;
const PORTAL = stepsOnTrack(G.steps, 'portal').map(v => v.step);
const FORM = stepsOnTrack(G.steps, 'form502').map(v => v.step);
const CHOICES = G.steps[0].choices!;

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

const textOf = (s: { title: string; text: string; extra?: string }) => `${s.title}\n${s.text}\n${s.extra ?? ''}`;
const allText = [...G.steps.map(textOf), ...CHOICES.map(c => `${c.label}\n${c.sub ?? ''}\n${c.note ?? ''}`)].join('\n');

export const TESTS: TestCase[] = [
  test('«תביעת מילואים»: שאלה משותפת ואחריה שני מסלולים של שישה צעדים מצולמים — שבעה צעדים בכל מסלול', () => {
    equal(G.key, 'reserve_duty_claim');
    equal(G.dir, 'reserve-duty-claim');
    equal(G.siteLabel, 'לאזור האישי בביטוח לאומי');
    equal(G.defaultTrack, 'portal');
    equal(G.steps[0].title, 'מה הייתם ערב השירות?');
    assert(!G.steps[0].track && !G.steps[0].image, 'השאלה משותפת ובלי צילום');
    deepEqual(CHOICES.map(c => c.track), ['portal', 'portal', 'form502', null]);
    deepEqual(CHOICES.map(c => c.label), ['עצמאי/ת בלבד', 'סטודנט/ית, או לא עבדתי', 'עצמאי/ת וגם שכיר/ה', 'שכיר/ה בשכר חודשי']);
    equal(G.steps.filter(s => s.choices).length, 1, 'שאלה אחת בלבד');
    equal(PORTAL.length, 7);
    equal(FORM.length, 7);
    equal(stepsOnTrack(G.steps, null).length, 1, 'שכיר בשכר חודשי: רק השאלה (וההסבר שלה)');
    equal(photoGuideStepCount(G), 7);
    assert(PORTAL.slice(1).every(s => s.image && s.track === 'portal'), 'האזור האישי: שישה צעדים מצולמים');
    assert(FORM.slice(1).every(s => s.image && s.track === 'form502'), 'טופס 502: שישה צעדים מצולמים');
    deepEqual(G.steps.map(s => !!s.copy), [false, false, false, false, false, false, true, false, false, false, false, false, false]);
    for (const s of G.steps) assert(s.title.trim() !== '' && s.text.trim() !== '', `צעד בלי כותרת/הוראה: ${s.title}`);
    for (const c of CHOICES) assert(!!c.sub, `תשובה בלי הסבר: ${c.label}`);
  }),

  test('stepsOnTrack: צעד בלי מסלול משותף, צעד עם מסלול רק שם, והמיקום ברשימה המלאה נשמר', () => {
    const steps = [{ title: 'א', text: '' }, { title: 'ב', text: '', track: 'x' }, { title: 'ג', text: '', track: 'y' }, { title: 'ד', text: '' }];
    deepEqual(stepsOnTrack(steps, 'y').map(v => [v.step.title, v.at]), [['א', 0], ['ג', 2], ['ד', 3]]);
    deepEqual(stepsOnTrack(steps, undefined).map(v => v.at), [0, 3]);
    deepEqual(stepsOnTrack(steps, null).map(v => v.at), [0, 3]);
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

  test('הצילומים ממוספרים לפי הצילומים: השאלה לא תופסת מספר, האזור האישי step-1..6 וטופס 502 step-7..12 — ובתיקייה רק הם', () => {
    const N = (n: number) => `guides/reserve-duty-claim/step-${n}.webp`;
    deepEqual(G.steps.map((_, i) => photoGuideImagePath(G, i)), [null, ...Array.from({ length: 12 }, (_, k) => N(k + 1))]);
    equal(photoGuideImagePath(G, 99), null);
    // ‼ מקורות (docx, PDF, תמונות עם פרטים אישיים) וסקריפט העיבוד לעולם לא בפרויקט.
    deepEqual(readdirSync(join(ROOT, 'public/guides', G.dir)).sort(), Array.from({ length: 12 }, (_, k) => `step-${k + 1}.webp`).sort());
  }),

  test('צילומי טופס 502: ה-alt אומר מה מסומן ושהפרטים האישיים מוסתרים', () => {
    for (const s of FORM.slice(1)) assert(/מוקף|מוקפת|מוקפות/.test(s.image!.alt), `alt בלי סימון: ${s.title}`);
    assert(/השם, מספר הזהות, הטלפונים, הדואר האלקטרוני ופרטי הבנק מוסתרים/.test(FORM[2].image!.alt), 'פרטי התובע מוסתרים');
    assert(/התאריכים מוסתרים/.test(FORM[3].image!.alt), 'תאריכי השירות מוסתרים');
    assert(/שם המעסיק מוסתר/.test(FORM[4].image!.alt), 'שם המעסיק מוסתר');
    assert(/קיזוז החוב מוסתרת/.test(FORM[5].image!.alt), 'תשובת הקיזוז מוסתרת');
    assert(/שם מקום העבודה מוסתר/.test(FORM[6].image!.alt), 'מקום העבודה בתלוש מוסתר');
  }),

  test('מפתח לא מוכר ⇒ אין מדריך (גם שמות של תכונות אובייקט)', () => {
    equal(photoGuideFor('reserve_duty_claim'), G);
    for (const k of ['nope', '', ' ', 'Reserve_Duty_Claim', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 42, {}, []]) {
      equal(photoGuideFor(k), null, `מפתח ${JSON.stringify(k)}`);
    }
  }),

  test('תוכן מקצועי — האזור האישי: אין «10 ימים», 2,548 ₪ דוגמה בלבד, «שלושה שבועות», ושלושת המעמדות', () => {
    // ‼ «התשלום מגיע תוך כ-10 ימים» אין לו בסיס במקורות הרשמיים — ירד.
    assert(!/10 ימים|עשרה ימים/.test(allText), 'אין הבטחת זמן תשלום');
    // ‼ 2,548 ₪ הוא תביעה אחת של 31 ימים — לא מינימום ולא סכום מובטח.
    assert(!/מינימום\s*(של\s*)?2,?548/.test(allText), 'אין «מינימום 2,548»');
    const withAmount = G.steps.filter(s => /2,548/.test(`${s.text} ${s.extra ?? ''}`));
    equal(withAmount.length, 1, 'הסכום מופיע במקום אחד');
    assert(/דוגמה בלבד/.test(withAmount[0].extra ?? '') && /31 ימים/.test(withAmount[0].extra ?? ''), 'דוגמה בלבד, צמוד למספר הימים');
    // ‼ ראש טופס 502 (04.2026): לעצמאי — אם לא שולם אוטומטית «בתוך שלושה שבועות».
    assert(/שלושה שבועות/.test(PORTAL[3].extra ?? ''), 'צעד 4: שלושה שבועות');
    assert(!/שבועיים/.test(allText), 'אין «שבועיים»');
    // לעצמאים התשלום אוטומטי; לסטודנטים ולמי שלא עבד — לא, ולכן מגישים על כל תקופה.
    assert(/התשלום לא מגיע לבד - מגישים תביעה על כל תקופה/.test(PORTAL[2].extra ?? ''), 'צעד 3: סטודנטים מגישים על כל תקופה');
    // ‼ שלושת המעמדות כמו במסך «הוספת תקופה».
    for (const w of ['«עצמאי»', '«תלמיד»', '«לא שכיר ולא עצמאי»']) assert(PORTAL[4].text.includes(w), `צעד 5: ${w}`);
    assert(/את טופס 3010 לא צריך לצרף כאן/.test(PORTAL[5].extra ?? ''), 'צעד 6: אין צורך ב-3010 באזור האישי');
    assert(/«לא עבדתי כשכיר ערב השירות» מסמנים רק אם היא נכונה/.test(PORTAL[5].extra ?? ''), 'צעד 6: ההצהרה רק אם נכונה');
    assert(/חזרו לצעד 1 ובחרו «עצמאי\/ת וגם שכיר\/ה»/.test(PORTAL[1].extra ?? ''), 'צעד 2: גם שכיר ⇒ חזרה לשאלה');
  }),

  test('תוכן מקצועי — טופס 502: למי, מה מכינים, כל חודש בנפרד, «עובד עצמאי ושכיר» ושתי האפשרויות של «אני תובע»', () => {
    const [, open, details, periods, status, declare, attach] = FORM;
    assert(open.text.includes('«לעצמאי ושכיר - הנך נדרש להגיש תביעה אישית כעצמאי»'), 'ציטוט מראש הטופס');
    assert(/בלי קוד משתמש וסיסמה/.test(open.text), 'אפשר בלי קוד משתמש');
    for (const w of ['3010', '3021', 'בל/510', '6 החודשים']) assert((open.extra ?? '').includes(w), `מכינים: ${w}`);
    assert(/«רגילה»/.test(details.text) && /6א׳/.test(details.extra ?? ''), 'סוג התביעה: רגילה; 6א׳ רק להפרשים');
    assert(/כל חודש בנפרד/.test(periods.text) && /בלי לאחד ובלי לפצל/.test(periods.text), 'תקופות כמו באישור, חודש-חודש');
    assert(/«חרבות ברזל» הוא שירות «רגיל», לא מל״ח/.test(periods.extra ?? ''), 'חרבות ברזל = רגיל');
    assert(status.text.includes('«עובד עצמאי ושכיר»'), 'המעמד');
    assert(status.text.includes('«השלמה כעצמאי בלבד ומסרתי את האישור המקורי למעסיק»'), 'השלמה — כשהמעסיק משלם');
    assert(status.text.includes('«תגמול על בסיס הכנסותיי כשכיר וכעצמאי»'), 'כל ההכנסות — אחרת');
    assert(/75 ימי עבודה/.test(status.text), 'מתי המעסיק חייב');
    assert(/לא בטוחים\? שאלו אותנו/.test(status.extra ?? ''), 'אין ניחוש — שואלים');
    assert(/«בסימון תיבה זו אני מצהיר\/מצהירה שכל הנתונים לעיל נכונים»/.test(declare.text), 'ההצהרה');
    assert(/קובץ שמוגן בסיסמה לא ייקלט/.test(attach.extra ?? '') && /60MB/.test(attach.extra ?? ''), 'מגבלות הצרופות');
    assert(/חותמים/.test(attach.text), 'חתימה');
  }),

  test('כל «חוזרים לדף ובוחרים «…»» במדריך הוא תשובה שקיימת בנוסח המוכן', () => {
    const options = reserveDutyPayload().requirements[0].options;
    // ‼ עד ה-» הראשון: בתשובה עם «צור קשר» בתוכה נלכדת התחילית — ולכן startsWith.
    const refs = [...allText.matchAll(/(?:ובחרו|ובוחרים) «([^»]+)»/g)].map(m => m[1].trim());
    const answerRefs = refs.filter(r => !r.includes('עצמאי/ת וגם שכיר/ה'));
    assert(answerRefs.length >= 5, `נמצאו ${answerRefs.length} הפניות לתשובות`);
    for (const r of answerRefs) assert(options.some(o => o.startsWith(r)), `אין תשובה כזאת בנוסח: «${r}»`);
    // השכיר בשכר חודשי מקבל תשובה משלו (248).
    assert(CHOICES[3].note!.includes('«הייתי שכיר/ה בלבד - המעסיק מגיש»'), 'שכיר — התשובה החמישית');
    assert(options.includes('הייתי שכיר/ה בלבד - המעסיק מגיש'), '248: התשובה קיימת');
  }),

  test('«צור קשר» (האזור האישי, צעד 7): התפריט והשדות כמו באתר, נוסח להעתקה עם מקום-שמור לחודשים, וחזרה לדף', () => {
    // ‼ מקור: צילום האתר ששלח גיא. «צור קשר» הוא פריט תפריט ראשי; בלשונית «פניה חדשה» — נושא, מהות, פירוט ותוכן.
    const s = PORTAL[6];
    equal(s.title, 'המערכת לא מאפשרת להגיש תביעה?');
    for (const w of ['«צור קשר»', '«פניה חדשה»', 'נושא הפניה «מילואים»', 'מהות הפניה «עצמאי»', 'פירוט הפניה «איך ישולם התגמול לעצמאי?»']) {
      assert(s.text.includes(w), `חסר: ${w}`);
    }
    // ‼ תנאי, לא קביעה: את החסימה עצמה לא מצאנו במקור כתוב של ביטוח לאומי.
    assert(/אם המערכת לא מאפשרת להגיש תביעה/.test(s.text), 'מנוסח כתנאי');
    const c = s.copy!;
    equal(c.label, 'נוסח לדוגמה לשדה «תוכן הפניה»');
    assert(c.text.startsWith('אני עצמאי שעונה להגדרה מתחילת השנה וקיבלתי פיצוי בשיעור 25% עבור [חודש] בלבד;'), 'הנוסח של גיא');
    equal((c.text.match(/\[חודש\]/g) ?? []).length, 2, 'שני מקומות-שמור לחודשים');
    // ההפניות מהצעדים הקודמים מגיעות לצעד הזה — הוא השביעי במסלול.
    assert(/ראו צעד 7/.test(PORTAL[2].extra ?? '') && /ראו צעד 7/.test(PORTAL[3].extra ?? ''), 'צעדים 3–4 מפנים לצעד 7');
    assert(!/ראו צעד 6/.test(allText), 'אין הפניה ישנה');
    const im = s.image!;
    assert(/השם וכתובת הדואר האלקטרוני מוסתרים/.test(im.alt), 'alt: הפרטים האישיים מוסתרים');
    assert(im.focus[0] > im.w * 0.6, 'המרכז בצד התפריט');
  }),

  test('הקישורים: האזור האישי של ביטוח לאומי, וטופס 502 המקוון באתר הרשמי — בפתיחת מסלול 502 בלבד', () => {
    equal(G.entry.url, 'https://ps.btl.gov.il/#/Mevutach/Berur/');
    equal(G.entry.host, 'ps.btl.gov.il');
    equal(new URL(G.entry.url).hostname, G.entry.host);
    equal(G.entry.note, 'נדרשות כניסה והזדהות.');
    const linked = G.steps.filter(s => s.link);
    equal(linked.length, 1);
    equal(linked[0], FORM[1]);
    const l = linked[0].link!;
    equal(l.url, 'https://govforms.gov.il/mw/forms/T502@btl.gov.il?gbxid=0');
    equal(new URL(l.url).hostname, l.host);
    for (const u of [G.entry.url, l.url]) assert(u.startsWith('https://'), `לא https: ${u}`);
  }),

  test('הסתייגות מתחת לצילום וכותרת עליונה', () => {
    equal(G.kicker, 'מדריך מצולם · תביעת מילואים בביטוח לאומי');
    equal(G.fine, 'הצילומים להמחשה, ופרטים אישיים הוסתרו בהם. המסכים באתר ביטוח לאומי ובטופס המקוון עשויים להשתנות.');
  }),
];
