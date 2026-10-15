// ─── «PIVO השבוע» · שבוע, בקשה ל-Claude ופירוק התשובה ─────────────────────────
// לוגיקה טהורה (בלי React ובלי מסד), כדי שתיבדק ב-node.
// שבוע = ראשון עד שבת, ומזוהה ביום הראשון שלו (‎'YYYY-MM-DD'‎, לפי השעון המקומי).

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** יום ראשון של השבוע שבו נמצא התאריך. */
export function weekStartOf(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return isoOf(d);
}

/** ‎«11–17 באוקטובר 2026»‎, ובין חודשים ‎«27 בספטמבר – 3 באוקטובר 2026»‎. */
export function weekLabel(weekStart: string, withYear = true): string {
  const a = parse(weekStart), b = parse(addDays(weekStart, 6));
  const year = withYear ? ` ${b.getFullYear()}` : '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ב${MONTHS[b.getMonth()]}${year}`;
  const aYear = withYear && a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : '';
  return `${a.getDate()} ב${MONTHS[a.getMonth()]}${aYear} – ${b.getDate()} ב${MONTHS[b.getMonth()]}${year}`;
}

const dmy = (iso: string) => { const d = parse(iso); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };

/**
 * הבקשה שמדביקים ב-Claude Code, בתיקיית הפרויקט — רק שם הוא רואה מה השתנה
 * (git ומסמך המצב). ‼ קריאה בלבד: הבקשה אומרת במפורש לא לשנות דבר.
 */
export function buildPrompt(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return [
    `סכם לי בקצרה איך PIVO התפתח בשבוע ${weekLabel(weekStart)} (${dmy(weekStart)} עד ${dmy(end)}).`,
    `קריאה בלבד, בלי לשנות שום דבר: git log --all --since=${weekStart} --until=${addDays(end, 1)}, וגם docs/CODEX-PROJECT-STATE.md ורשומות הזיכרון שעודכנו בשבוע הזה.`,
    'כתוב בעברית פשוטה, לרו״ח ולא למתכנת:',
    '• עד 5 שורות. כל שורה: מה המשרד או הלקוח יכולים לעשות עכשיו, ולא איך זה נבנה.',
    '• בסוף כל שורה, בסוגריים: בייצור / ב־staging / בפיתוח.',
    '• שורה אחרונה: «הכי משמעותי השבוע:» ומשפט אחד.',
    'בלי שמות קבצים, מספרי מיגרציות או מונחים טכניים. רק השורות, בלי הקדמה ובלי סיכום.',
  ].join('\n');
}

/** התשובה כשורות: בלי תבליטים, מספור או הדגשות של Markdown, ובלי שורות ריקות. */
export function noteLines(body: string): string[] {
  return String(body ?? '').split(/\r?\n/)
    .map(x => x.replace(/\*\*/g, '').replace(/^\s*(?:[•\-–·*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

export const HIGHLIGHT_PREFIX = 'הכי משמעותי השבוע:';

/** השבוע הנוכחי ועוד כמה לפניו — לבחירה כשממלאים שבוע שעבר. */
export function recentWeeks(today: Date, count = 6): string[] {
  const cur = weekStartOf(today);
  return Array.from({ length: count }, (_, i) => addDays(cur, -7 * i));
}

/**
 * איזה שבוע לפתוח כברירת מחדל: השבוע הנוכחי — אלא אם היום ראשון או שני והשבוע
 * שעבר עוד ריק (מי שממלא אחרי סוף השבוע ממלא את השבוע שנגמר).
 */
export function defaultWeek(today: Date, filled: ReadonlySet<string>): string {
  const cur = weekStartOf(today), prev = addDays(cur, -7);
  if (today.getDay() <= 1 && !filled.has(cur) && !filled.has(prev)) return prev;
  return cur;
}

/** כל היומן כטקסט — לתיעוד מחוץ למערכת. החדש למעלה. */
export function journalText(notes: { weekStart: string; body: string }[]): string {
  return [...notes].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map(n => `${weekLabel(n.weekStart)}\n${noteLines(n.body).map(l => `• ${l}`).join('\n')}`)
    .join('\n\n');
}
