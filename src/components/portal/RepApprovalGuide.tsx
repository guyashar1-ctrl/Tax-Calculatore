// ─── מדריך מצולם: אישור הייצוג באזור האישי של רשות המסים ────────────────────
// נפתח מכרטיס האישור בדף האישי, מהתצוגה המקדימה במשרד ומשלב האישור במרכז הייצוג.
//
// ‼ מה מסמנים — רק מהשרת (build_client_portal, `approvals` בפריט rep_approval:
// לכל אדם הרשויות שביקשנו בשע״ם). בלי רשימה — הנוסח הכללי. לא מנחשים כאן
// מהכרטיס: שם או רשות שגויים היו שולחים את הלקוח לאשר (או לדחות) שורה לא נכונה.
//
// ‼ הצילומים ב-public/guides/rep-approval הם עותקים מנוקים: שם, ת.ז., כתובת,
// שם המייצג ופרטי המשרד מכוסים בכיסוי אטום, והחצים הם שלנו. המקורות אינם
// בפרויקט ואסור להכניס אותם.
// ‼ שלב ושלב בכל פעם — בטלפון זה המסך כולו. התמונה נפתחת בגודל מלא בלחיצה,
// וממוקדת על הפקד המסומן.
// ‼ «אישרתי» הוא דיווח של הלקוח שמחזיר את הבקשה לבדיקה — לא הוכחה שהייצוג
// פעיל. השלב האחרון אומר את זה במפורש, ומשמר את התנאי שבהודעת הרשות.
// ‼ 05.10.2026 · החלון עצמו (שלב בכל פעם, הגדלה, מקלדת, פוקוס) עבר ל-PhotoGuide — רכיב גנרי
// שגם «תביעת מילואים» משתמשת בו. כאן נשאר רק מה שמיוחד לאישור הייצוג: הצעדים, מי מסמן מה
// והנוסח של הכרטיס. ה-exports וה-props כאן לא השתנו.
import { useMemo } from 'react';
import PhotoGuide, { PhotoGuideButton, type PhotoGuideStep } from './PhotoGuide';

/** אדם אחד ומה הוא מסמן באזור האישי שלו — כפי שהשרת שולח (שמות בלבד, בלי מספרים). */
export interface RepApprovalPerson {
  person: 'client' | 'spouse';
  name?: string;
  /** הרשויות שביקשנו בשע״ם על שמו, למשל «מס הכנסה», «מע״מ». */
  systems: string[];
  /** מה ששע״ם מציגה כממתין לאישורו כרגע. */
  awaiting?: string[];
}

interface GuideStep {
  title: string;
  text: string;
  /** שורת משנה. ‼ יכולה לכלול שורות נפרדות (\n) — שורה לכל אדם. */
  extra?: string;
  alt: string;
  w: number;
  h: number;
  /** מרכז הפקד המסומן, בפיקסלים של התמונה — לשם ממוקדת ההגדלה. */
  focus: [number, number];
}

export const REP_APPROVAL_GUIDE_STEPS: GuideStep[] = [
  {
    title: 'פותחים את התפריט',
    text: 'אחרי הכניסה לאזור האישי של רשות המסים, לוחצים על סמל התפריט ☰ בפס הכחול שלמעלה.',
    alt: 'החלק העליון של האזור האישי בטלפון. סמל התפריט — שלושה קווים בצד ימין של הפס הכחול — מוקף ומסומן בחץ.',
    w: 735, h: 352, focus: [661, 64],
  },
  {
    title: 'בוחרים «הפרטים שלי»',
    text: 'בתפריט שנפתח לוחצים על «הפרטים שלי».',
    alt: 'התפריט פתוח. השורה «הפרטים שלי» מוקפת ומסומנת בחץ.',
    w: 735, h: 766, focus: [582, 366],
  },
  {
    title: 'פותחים «המייצג שלי»',
    text: 'גוללים מטה ולוחצים על «המייצג שלי».',
    alt: 'רשימת אזורים: תיקי המס, חשבונות הבנק, המייצג שלי ותאגידים הקשורים אליי. «המייצג שלי» מוקף ומסומן בחץ.',
    w: 735, h: 665, focus: [367, 419],
  },
  {
    title: 'לוחצים «אישור ייצוג» ליד המייצג',
    text: 'בודקים שזה המייצג מהמשרד שלנו, ולוחצים «אישור ייצוג».',
    extra: 'בצילום הוסתרו שם המייצג ופרטי המשרד.',
    alt: 'האזור «המייצג שלי» פתוח: שם המייצג (מוסתר), התווית «ממתין לאישור ייצוג במס הכנסה» ופרטי המשרד (מוסתרים). הכפתור «אישור ייצוג» מוקף ומסומן בחץ.',
    w: 735, h: 598, focus: [559, 521],
  },
  {
    title: 'מסמנים את הבקשות שלנו',
    text: 'במסך «ניהול ייצוג» מסמנים ✓ את כל הבקשות של המייצג שלנו — שורה לכל רשות שביקשנו בה ייצוג.',
    extra: 'בדוגמה יש רק מס הכנסה; אצלכם הרשימה עשויה להיות שונה. בקשה של מייצג אחר — לא מסמנים.',
    alt: 'טבלת הבקשות במסך «ניהול ייצוג»: שורה אחת — מס הכנסה, שם המייצג (מוסתר), ראשי, ממתין לאישורך. תיבת הסימון בתחילת השורה מסומנת, מוקפת ומסומנת בחץ.',
    w: 735, h: 766, focus: [668, 657],
  },
  {
    title: 'לוחצים «אישור ייצוג»',
    text: 'אחרי שסימנתם את כל הבקשות שלנו, לוחצים «אישור ייצוג» — לא «דחיית בקשה».',
    alt: 'מתחת לטבלה שני כפתורים גדולים: «אישור ייצוג» עם סימן וי ירוק — מוקף ומסומן בחץ — ומתחתיו «דחיית בקשה».',
    w: 735, h: 685, focus: [367, 384],
  },
  {
    title: 'המסך שמופיע בסוף',
    text: 'רשות המסים מציגה «הפעולה בוצעה בהצלחה». אם כבר קיים תיק — הייצוג נקלט; אם עוד אין — הוא ממתין לפתיחת התיק.',
    extra: 'אחר כך חוזרים לכאן ולוחצים «אישרתי באזור האישי», כדי שנדע לבדוק. האישור שלכם עוד לא אומר שהייצוג פעיל — אנחנו בודקים ומעדכנים.',
    alt: 'הודעה ירוקה: «הפעולה בוצעה בהצלחה. אם קיים תיק הייצוג נקלט, אחרת ממתין לפתיחת התיק במשרד.» מתחתיה הבקשה למס הכנסה במצב «נקלט בהצלחה».',
    w: 735, h: 590, focus: [367, 242],
  },
];

export const REP_APPROVAL_GUIDE_LENGTH = REP_APPROVAL_GUIDE_STEPS.length;

/** המדריך כפי שהמשרד רואה אותו בלי לקוח — לא ההוראות האישיות של אף אחד. */
export const REP_APPROVAL_GUIDE_GENERIC_NOTE =
  'המדריך הכללי. אצל כל לקוח, בדף האישי ובמרכז הייצוג, הוא נפתח עם ההוראות האישיות: מי מאשר ובאילו רשויות.';

/** «א» · «א וב» · «א, ב וג». */
export function hebrewList(items: readonly string[]): string {
  const xs = items.map(s => String(s ?? '').trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} ו${xs[xs.length - 1]}`;
}

/**
 * מי מסמן מה — רק אנשים שיש להם רשות לסמן, כל אדם פעם אחת, הלקוח קודם.
 * ‼ ריק ⇒ אין רשימה, ונופלים לנוסח הכללי (גם כשהשרת שלח משהו לא צפוי).
 */
export function repApprovalPeople(approvals?: readonly RepApprovalPerson[] | null): RepApprovalPerson[] {
  if (!Array.isArray(approvals)) return [];
  const out: RepApprovalPerson[] = [];
  for (const a of approvals) {
    if (!a || (a.person !== 'client' && a.person !== 'spouse')) continue;
    if (out.some(o => o.person === a.person)) continue;
    const raw: unknown[] = Array.isArray(a.systems) ? a.systems : [];
    const systems = [...new Set(raw.map(s => String(s ?? '').trim()).filter(Boolean))];
    if (systems.length === 0) continue;
    out.push({ ...a, name: String(a.name ?? '').trim(), systems });
  }
  return out.sort((x, y) => (x.person === 'client' ? 0 : 1) - (y.person === 'client' ? 0 : 1));
}

function personName(p: RepApprovalPerson): string {
  return p.name || (p.person === 'spouse' ? 'בן/בת הזוג' : 'אתם');
}

/**
 * ‼ H2.5b · מה ששע״ם מציגה כרגע כממתין לאישור של האדם הזה (awaiting מהשרת) —
 * «ממתין לאישור», או רק חלק: «ממתין לאישור: מס הכנסה». בלי נתון ⇒ כלום.
 */
function awaitingText(p: RepApprovalPerson): string | undefined {
  const raw: unknown[] = Array.isArray(p.awaiting) ? p.awaiting : [];
  const a = [...new Set(raw.map(s => String(s ?? '').trim()).filter(Boolean))];
  if (a.length === 0) return undefined;
  return p.systems.every(s => a.includes(s)) ? 'ממתין לאישור' : `ממתין לאישור: ${hebrewList(a)}`;
}

export const REP_APPROVAL_EACH_OWN_AREA = 'כל אחד נכנס לאזור האישי שלו ומאשר את הבקשות שעל שמו.';

/**
 * הבלוק «מה מסמנים באזור האישי» (במשרד — ליד המדריך במרכז הייצוג). אדם אחד — בלי
 * שם; שניים — שורה לכל אחד, ומי נכנס לאיפה.
 * ‼ כשרק בן/בת הזוג מסמנים (למשל מס הכנסה רשום על שמם), השם כן מופיע: בלעדיו
 * בעל הכרטיס היה נכנס לאזור האישי שלו ולא מוצא שם כלום.
 * ‼ H2.5b · אצל זוג — ליד מי ששע״ם ממתינה לאישור שלו: «ממתין לאישור».
 */
export function repApprovalSummary(approvals?: readonly RepApprovalPerson[] | null): { lines: string[]; note?: string } | null {
  const people = repApprovalPeople(approvals);
  if (people.length === 0) return null;
  if (people.length === 1 && people[0].person === 'client') return { lines: [hebrewList(people[0].systems)] };
  if (people.length === 1) {
    const p = people[0];
    return { lines: [`${personName(p)}: ${hebrewList(p.systems)}`], note: `האישור נעשה באזור האישי של ${personName(p)}.` };
  }
  return {
    lines: people.map(p => {
      const wait = awaitingText(p);
      return `${personName(p)}: ${hebrewList(p.systems)}${wait ? ` · ${wait}` : ''}`;
    }),
    note: REP_APPROVAL_EACH_OWN_AREA,
  };
}

/** בלי רשימה מהשרת — מה עושים, במשפט אחד. */
export const REP_APPROVAL_MARK_ALL = 'באזור האישי מסמנים את כל הבקשות שבהן המשרד מופיע כמייצג, ולוחצים «אישור ייצוג».';
const MORE_LABEL = 'אין לך משתמש באזור האישי, או שמשהו לא עבד?';

/**
 * ההסבר השמור בכרטיס (clientNote + clientNoteAfter), בלי מה שהכרטיס כבר אומר.
 * ‼ X-3 · הנוסח של המערכת הוא שאלה («יש לך כבר משתמש…?»), «כן - …» (הדרך הרגילה),
 * ואחריהם «לא - …» ו-SMS. «כן» הוא בדיוק מה שהבלוק «מה מסמנים» והכפתורים אומרים —
 * ולכן הוא יורד (כך גם הנוסח הישן של 186, ביחיד, שסתר את «כל הבקשות»), והשאר נפתח
 * לפי דרישה. ניסוח שאינו במבנה הזה (המשרד כתב משלו) — כולו נפתח לפי דרישה.
 */
export function repApprovalNoteMore(note?: string | null, noteAfter?: string | null): { more: string[]; recognized: boolean } {
  const paras = String(note ?? '').replace(/\\n/g, '\n').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const after = String(noteAfter ?? '').trim();
  const tail = after ? [after] : [];
  const yes = paras.findIndex(p => /^כן\s*[-–—]/.test(p));
  if (yes < 0) return { more: [...paras, ...tail], recognized: false };
  const more = paras
    .filter((p, i) => i !== yes && !(i < yes && /\?\s*$/.test(p)))
    .map(p => p.replace(/^לא\s*[-–—]\s*/, ''));
  return { more: [...more, ...tail], recognized: true };
}

/** מה כרטיס האישור מציג בדף האישי. */
export interface RepApprovalCardView {
  /** איפה, מה ואיזה כפתור — במשפט אחד מעל הרשימה. */
  lead: string;
  /** שורה לכל אדם (אדם אחד — בלי שם). awaiting — אצל זוג, למי שע״ם ממתינה. */
  lines: { key: string; text: string; awaiting?: string }[];
  /** ההסבר המלא, נפתח לפי דרישה. ריק ⇒ אין מה לפתוח. */
  more: string[];
  moreLabel: string;
}

/**
 * ‼ X-3 / E:X-4 · הכרטיס בטלפון היה קיר של ארבע פסקאות, והפעולות מתחת לקפל. כאן:
 * משפט אחד + מה מסמנים (מהשרת) גלויים; «אין לך משתמש?» ו-SMS — בלחיצה.
 * «את כל הבקשות» נאמר פעם אחת (ובמדריך, כשפותחים אותו).
 */
export function repApprovalCard(
  approvals?: readonly RepApprovalPerson[] | null, note?: string | null, noteAfter?: string | null,
): RepApprovalCardView {
  const people = repApprovalPeople(approvals);
  const { more, recognized } = repApprovalNoteMore(note, noteAfter);
  const moreLabel = recognized ? MORE_LABEL : 'עוד הסבר';
  if (people.length === 0) return { lead: REP_APPROVAL_MARK_ALL, lines: [], more, moreLabel };
  if (people.length === 1) {
    const p = people[0];
    return {
      lead: p.person === 'spouse'
        ? `באזור האישי של ${personName(p)} מסמנים את כל הבקשות שלנו, ולוחצים «אישור ייצוג»:`
        : 'באזור האישי מסמנים את כל הבקשות שלנו, ולוחצים «אישור ייצוג»:',
      lines: [{ key: p.person, text: hebrewList(p.systems) }],
      more, moreLabel,
    };
  }
  return {
    lead: 'כל אחד נכנס לאזור האישי שלו, מסמן את כל הבקשות שלנו ולוחץ «אישור ייצוג»:',
    lines: people.map(p => ({ key: p.person, text: `${personName(p)}: ${hebrewList(p.systems)}`, awaiting: awaitingText(p) })),
    more, moreLabel,
  };
}

/** צעדי המדריך לפי מה שביקשנו: צעד 5 נוקב ברשויות (ובשמות כשיש יותר מאדם אחד). */
export function repApprovalGuideSteps(approvals?: readonly RepApprovalPerson[] | null): GuideStep[] {
  const people = repApprovalPeople(approvals);
  const steps = REP_APPROVAL_GUIDE_STEPS.map(s => ({ ...s }));
  const other = 'בקשה של מייצג אחר — לא מסמנים.';
  if (people.length === 1) {
    const p = people[0];
    steps[4].text = `במסך «ניהול ייצוג» מסמנים ✓ את כל הבקשות של המייצג שלנו: ${hebrewList(p.systems)}.`;
    steps[4].extra = p.person === 'spouse' ? `זה נעשה באזור האישי של ${personName(p)}. ${other}` : other;
  } else if (people.length > 1) {
    steps[4].extra = [...people.map(p => `${personName(p)}: ${hebrewList(p.systems)}`),
      `כל אחד באזור האישי שלו. ${other}`].join('\n');
    // ‼ H2.5c · זוג: «אישרתי» אחד לבית — ולכן רק אחרי ששניהם אישרו.
    steps[6].extra = 'כשכל אחד מכם אישר באזור האישי שלו — חוזרים לכאן ולוחצים «אישרתי באזור האישי», כדי שנדע לבדוק. האישור שלכם עוד לא אומר שהייצוג פעיל — אנחנו בודקים ומעדכנים.';
  }
  return steps;
}

/** ‼ הצילום של צעד לפי המיקום שלו — כל שבעת הצעדים כאן עם צילום, ולכן step-N ברצף. */
const imageUrl = (i: number): string => `${import.meta.env.BASE_URL}guides/rep-approval/step-${i + 1}.webp`;

const REP_APPROVAL_KICKER = 'מדריך מצולם · אישור הייצוג באזור האישי';
const REP_APPROVAL_FINE = 'הצילומים להמחשה, ופרטים אישיים הוסתרו בהם. המסכים באתר רשות המסים עשויים להשתנות.';

/** הכפתור שפותח את המדריך — אותו נוסח בדף האישי ובמשרד. */
export function RepApprovalGuideButton({ onClick, accent, className }: {
  onClick: () => void; accent?: string; className?: string;
}) {
  return <PhotoGuideButton steps={REP_APPROVAL_GUIDE_LENGTH} onClick={onClick} accent={accent} className={className} />;
}

/** הצעד כפי שהרכיב הגנרי מכיר אותו. */
const asPhotoStep = ({ alt, w, h, focus, ...rest }: GuideStep): PhotoGuideStep => ({ ...rest, image: { alt, w, h, focus } });

export default function RepApprovalGuide({ onClose, accent, entryUrl, entryInert, approvals, scopeNote }: {
  onClose: () => void;
  /** צבע המשרד בדף האישי; במשרד — ברירת המחדל. */
  accent?: string;
  /** קישור הכניסה לאזור האישי — מוצג בצעד הראשון. */
  entryUrl?: string;
  /** בתצוגה המקדימה במשרד הקישור אינו פעיל — רק היעד מוצג. */
  entryInert?: boolean;
  /** מה כל אדם מסמן — מהשרת. חסר ⇒ הנוסח הכללי. */
  approvals?: readonly RepApprovalPerson[] | null;
  /**
   * ‼ 04.10.2026 · במשרד, בלי לקוח: משפט אחד שאומר שזה המדריך הכללי — ההוראות האישיות
   * (מי מאשר, באילו רשויות) נוספות אצל כל לקוח מהשרת, בדף שלו ובמרכז הייצוג.
   */
  scopeNote?: string;
}) {
  const steps = useMemo(() => repApprovalGuideSteps(approvals).map(asPhotoStep), [approvals]);
  const entry = useMemo(() => (entryUrl
    ? { url: entryUrl, label: 'לכניסה לאזור האישי ↗', host: 'gov.il', note: 'נדרשות כניסה והזדהות.' } : undefined), [entryUrl]);
  return (
    <PhotoGuide onClose={onClose} accent={accent} kicker={REP_APPROVAL_KICKER} steps={steps} imageUrl={imageUrl}
      entry={entry} entryInert={entryInert} fine={REP_APPROVAL_FINE} scopeNote={scopeNote} />
  );
}
