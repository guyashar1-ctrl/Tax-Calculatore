// ─── חילוץ טענות מסומנות מתוך HTML של נושא ───────────────────────────────────
// ‼ 21.10.2026: דפי הנושאים הם המקור — כל טענה בהם כבר מסומנת <ClaimTag> (מאומת / פרשנות / פתוח).
//   כאן לא כותבים את הידע מחדש: מרנדרים את הנושא, ולוקחים את היחידה הקרובה ביותר שמכילה את התג.
// ‼ טהור, בלי DOM — מפרק תגיות פשוט. מספיק ל-HTML של renderToStaticMarkup (מאוזן תמיד, בלי סקריפטים).

import type { ClaimStatus } from '../claim';

export interface HtmlClaim {
  text: string;
  status: ClaimStatus;
  /** מזהה הסעיף (<section id>) שהטענה בתוכו. */
  sectionId?: string;
  sectionTitle?: string;
}

/** בלוקים שטענה יכולה להיות «כל» הבלוק שלהם — הקרוב ביותר לתג מנצח. */
const BLOCK = new Set(['p', 'li', 'td', 'dd', 'dt', 'span', 'div', 'summary', 'blockquote', 'details']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'wbr']);
/** תגים ששוברים שורה — מוסיפים רווח, כדי ש«טעות» ו«נכון» לא יידבקו למילה אחת. */
const BREAK = new Set([...BLOCK, 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'tr', 'th', 'table', 'button', 'label']);
const STATUS: Record<string, ClaimStatus> = { verified: 'verified', interpretation: 'interpretation', open: 'open' };

interface Frame { tag: string; cls: string; text: string; status?: ClaimStatus; isClaim: boolean; isH2: boolean; header?: string }

/** האחרון במחסנית שעונה על התנאי (findLast — בלי להעלות את גרסת ה-lib). */
const lastOf = <T,>(a: T[], f: (x: T) => boolean): number => { for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) return i; return -1; };
const hasClass = (cls: string, names: string[]) => cls.split(/\s+/).some(c => names.includes(c));
/** חלק מטענה (מונח בלי הגדרתו, «נכון» בלי «טעות», שורת כותרת של דוגמה) — הטענה היא האב. */
const isPart = (f: Frame) => f.tag === 'dt' || hasClass(f.cls, ['kn-mistake-right', 'kn-row', 'kn-spread']);
/** יחידה שלמה (שורת מילון, טעות+תיקון, מונח+הגדרה, דוגמה פתורה) — תג בתוכה שייך לכולה. */
const isGroup = (f: Frame) => hasClass(f.cls, ['kn-dict-row', 'kn-mistake', 'kn-gloss-row', 'kn-solve']);
/** מקרא התגים — לא טענה. */
const isSkip = (f: Frame) => hasClass(f.cls, ['kn-legend-claims']);

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (ENT[e]) return ENT[e];
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return m;
});
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([.,:;)])/g, '$1').replace(/^[\s|]+|[\s|]+$/g, '').trim();

export function claimsFromHtml(html: string): HtmlClaim[] {
  const out: HtmlClaim[] = [];
  const stack: Frame[] = [];
  let section: { id?: string; title?: string } = {};
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  const addText = (t: string) => { if (!stack.some(g => g.isClaim)) for (const f of stack) f.text += t; };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { addText(decode(m[4])); continue; } // טקסט של תג המעמד עצמו לא נכנס לטענה
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (BREAK.has(tag)) addText(' ');
    // עמודות בטבלה מופרדות ב-« | »
    if (!closing && (tag === 'td' || tag === 'th')) { const tr = stack[lastOf(stack, f => f.tag === 'tr')]; if (tr && tr.text.trim()) addText(' | '); }
    if (!closing) {
      if (VOID.has(tag) || attrs.trim().endsWith('/')) { addText(' '); continue; }
      const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const id = /id="([^"]*)"/.exec(attrs)?.[1];
      const claim = hasClass(cls, ['kn-claim']) ? cls.split(/\s+/).map(c => STATUS[c]).find(Boolean) : undefined;
      if (claim) {
        const group = lastOf(stack, isGroup);
        if (group >= 0) stack[group].status ??= claim;
        else {
          // ‼ תג בתוך תא בטבלה — הטענה היא כל השורה (שם הפריט + הערכים), לא התא לבדו
          const row = lastOf(stack, f => f.tag === 'tr');
          for (let i = stack.length - 1; i >= 0; i--) {
            if (row >= 0 && i > row) continue;
            if ((BLOCK.has(stack[i].tag) || stack[i].tag === 'tr') && !stack[i].isClaim && !isPart(stack[i])) { stack[i].status ??= claim; break; }
          }
        }
      }
      if (tag === 'section' && id) section = { id };
      stack.push({ tag, cls, text: '', isClaim: !!claim, isH2: tag === 'h2' });
      continue;
    }
    // סגירה — עד התג המתאים (HTML של React תמיד מאוזן)
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx].tag !== tag) idx--;
    if (idx < 0) continue;
    const f = stack[idx];
    stack.length = idx;
    if (f.isH2 && section.id && !section.title) section.title = clean(f.text);
    // שורת כותרת של טבלה נשמרת על הטבלה, ומצורפת לכל שורה שהיא טענה
    if (tag === 'tr' && stack.some(g => g.tag === 'thead')) { const t = stack[lastOf(stack, g => g.tag === 'table')]; if (t) t.header = clean(f.text); }
    if (f.status && !isSkip(f)) {
      const header = tag === 'tr' ? stack[lastOf(stack, g => g.tag === 'table')]?.header : undefined;
      const text = clean(header ? `(${header}) ${f.text}` : f.text);
      if (text.length >= 12) out.push({ text, status: f.status, sectionId: section.id, sectionTitle: section.title });
    }
    if (tag === 'section') section = {};
  }
  return out;
}
