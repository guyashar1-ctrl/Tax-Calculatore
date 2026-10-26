// ─── שלושת הצעדים בשורת בקשת תיק מס — «תשובות הלקוח · יישור קו ברשויות · לתיק» (17.10.2026, שלב 1) ─────────
// ‼ טהור (בלי React ובלי רשת). מצב נגזר בלבד — מהבן «השלמת מידע» (buildWorkRows), משלבי יישור הקו הקיימים
//   (institution_alignment_*) ומההצעות הממתינות בתיק (tax_fact_changes) של הבקשה הזו. אין מנוע חדש ואין מצב שנכתב.
// ‼ ההדמיה המאושרת: docs/prototypes/one-request-tax-file-2026-10-16/index.html («בקשות»). שלב 4 יחבר את הצעד
//   השני לעבודות העובד; עד אז הוא מראה את יישור הקו האחרון שבוצע מכרטיס «זהות ורשויות».

import type { RowState } from '../../utils/requestPresentation';
import type { WorkRow } from './taxWork';

export type StepTone = 'idle' | 'wait' | 'mine' | 'new' | 'ok';
export interface RequestStepView { key: 'answers' | 'card'; title: string; line: string; tone: StepTone }
export interface RequestStepsView {
  /** המצב הקצר בשורה הסגורה; undefined = המצב הנגזר הרגיל של השורה («הושלם» וכו׳). */
  chip?: RowState;
  steps: RequestStepView[];
}

const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

// ‼ 19.10.2026 (גיא): יישור קו ברשויות אינו צעד בבקשה — הוא כלי בתיק המס («בצע יישור קו»), ולכן ירד מהצעדים.
export function deriveRequestSteps(row: WorkRow, pendingToCard: number, opts: { firstName: string; awaitingPage?: boolean }): RequestStepsView {
  const first = opts.firstName || 'הלקוח';
  const closed = CLOSED.includes(row.parent.status);
  const open = row.missing.length - row.unavailable;
  const total = row.answered + row.missing.length + row.drafts;
  const asked = total > 0;

  let answers: RequestStepView;
  let chip: RowState | undefined;
  if (row.parent.status === 'cancelled') answers = { key: 'answers', title: 'תשובות הלקוח', line: 'הבקשה בוטלה', tone: 'idle' };
  else if (closed) answers = { key: 'answers', title: 'תשובות הלקוח', line: row.answered ? `${count(row.answered, 'תשובה אחת', 'תשובות')} · הושלם` : 'הושלם', tone: 'ok' };
  else if (!asked) {
    answers = row.kind === 'intake'
      ? { key: 'answers', title: 'תשובות הלקוח', line: 'השאלון נגזר מהתיק ונשלח לבד', tone: 'idle' }
      : { key: 'answers', title: 'תשובות הלקוח', line: 'אין עדיין שאלות ללקוח', tone: 'idle' };
  } else if (row.drafts > 0 && row.answered === 0 && row.missing.length === 0) {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: `טיוטה: ${count(row.drafts, 'שאלה אחת', 'שאלות')} — לפרסם`, tone: 'mine' };
    chip = { text: 'טיוטה', tone: 'amber' };
  } else if (opts.awaitingPage) {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: `${count(total, 'שאלה אחת', 'שאלות')} · ממתין לפרסום הדף`, tone: 'wait' };
    chip = { text: 'ממתין לפרסום', tone: 'amber' };
  } else if (row.toReview > 0) {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: `${row.answered} מתוך ${total} · ${count(row.toReview, 'פריט אחד לבדיקתך', 'פריטים לבדיקתך')}`, tone: 'mine' };
    chip = { text: 'הגיעו תשובות', tone: 'blue' };
  } else if (open > 0) {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: row.answered ? `אצל ${first} · ${row.answered} מתוך ${total}` : `בדף של ${first} · טרם נענה`, tone: 'wait' };
    chip = { text: `אצל ${first} · ${row.answered} מתוך ${total}`, tone: 'gray' };
  } else if (row.unavailable > 0) {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: `${row.answered} מתוך ${total} · ${count(row.unavailable, 'מסמך אחד', 'מסמכים')} «אין לי עדיין»`, tone: 'wait' };
    chip = { text: 'ממתין למסמכים', tone: 'gray' };
  } else {
    answers = { key: 'answers', title: 'תשובות הלקוח', line: `${row.answered} מתוך ${total} נענו`, tone: 'ok' };
    chip = pendingToCard > 0 ? { text: 'לאישורך בתיק', tone: 'blue' } : { text: 'נענה', tone: 'gray' };
  }

  // ‼ 19.10.2026 · דוח שנתי: הצעד השני הוא הדוח עצמו (הכנה, אישורך, חתימת הלקוח) — התשובות נכנסות לחישוב, לא «לתיק»
  if (row.kind === 'annual') {
    const report: RequestStepView = closed && row.parent.status !== 'cancelled'
      ? { key: 'card', title: 'הדוח', line: 'הושלם', tone: 'ok' }
      : { key: 'card', title: 'הדוח', line: 'הכנה, אישורך וחתימת הלקוח — אחרי התשובות והמסמכים', tone: 'idle' };
    return { chip: closed ? undefined : chip, steps: [answers, report] };
  }
  // ‼ 26.10.2026 · הצהרת הון והערכת מס — כמו הדוח השנתי: התשובות נכנסות לבד; הצעד השני הוא ההצהרה / ההערכה עצמה
  if (row.kind === 'wealth' || row.kind === 'estimate') {
    const title = row.kind === 'wealth' ? 'ההצהרה' : 'ההערכה';
    const second: RequestStepView = closed && row.parent.status !== 'cancelled'
      ? { key: 'card', title, line: 'הושלם', tone: 'ok' }
      : { key: 'card', title, line: row.kind === 'wealth' ? 'סכום לכל סעיף, אישורך וחתימת הלקוח — אחרי התשובות והמסמכים' : 'ההערכה, אישורך והסיכום ללקוח — אחרי התשובות', tone: 'idle' };
    return { chip: closed ? undefined : chip, steps: [answers, second] };
  }
  const card: RequestStepView = pendingToCard > 0
    ? { key: 'card', title: 'לתיק', line: `${count(pendingToCard, 'עדכון אחד ממתין', 'עדכונים ממתינים')} לאישורך בתיק המס`, tone: 'new' }
    : closed && row.parent.status !== 'cancelled'
      ? { key: 'card', title: 'לתיק', line: 'בתיק', tone: 'ok' }
      : { key: 'card', title: 'לתיק', line: 'ייכנס כ«ממתין לאישורך»', tone: 'idle' };

  return { chip: closed ? undefined : chip, steps: [answers, card] };
}

/** כמה הצעות ממתינות בתיק נולדו מהבקשה הזו: source_ref = tax_year_fact:<עובדה> ⇐ העובדה שייכת לבקשה (request_id). */
export function pendingToCardFor(stepId: string, pending: { source: string; sourceRef?: string }[], facts: { id: string; requestId?: string }[]): number {
  const mine = new Set(facts.filter(f => f.requestId === stepId).map(f => `tax_year_fact:${f.id}`));
  return pending.filter(c => c.source === 'questionnaire' && !!c.sourceRef && mine.has(c.sourceRef)).length;
}
