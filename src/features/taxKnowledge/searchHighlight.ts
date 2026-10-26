// ─── מהחיפוש לקטע עצמו (26.10.2026) ─────────────────────────────────────────────────────────
// ‼ תוצאת חיפוש פותחת את השלב שהכלל כתוב בו, והקטע מסומן לרגע — לא «הנושא נפתח, תחפש בעצמך».
// הכלל במאגר נבנה מטקסט הדף (corpus), ולכן מזהים את הקטע לפי תחילת הטקסט שלו.

let pending: string | null = null;
let focusSearch = false;

/** הקטע לסימון בעמוד הבא שנפתח. */
export function highlightNext(text: string) { pending = text; }
/** הקטע שממתין לסימון (בלי לנקות — StrictMode מריץ אפקט פעמיים). */
export function peekHighlight(): string | null { return pending; }
/** ‼ אחרי ניסיון סימון — מנקים, כך שסימון שלא נמצא לא נשאר לעמוד אחר. */
export function clearHighlight() { pending = null; }

/** «חיפוש» מכל עמוד: הספרייה נפתחת עם הסמן בתיבת החיפוש. */
export function requestSearchFocus() { focusSearch = true; }
export function takeSearchFocus(): boolean { const f = focusSearch; focusSearch = false; return f; }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** מסמן בתוך root את הרכיב הקטן ביותר שמכיל את תחילת הטקסט. מחזיר האם נמצא. */
export function markPassage(root: HTMLElement, text: string): boolean {
  const needle = norm(text).slice(0, 28);
  if (needle.length < 6) return false;
  const cands = Array.from(root.querySelectorAll<HTMLElement>('p, li, td, dd, h3, h4, summary, .kn-box, .kn-gloss-item, div'))
    .filter(el => norm(el.innerText || el.textContent || '').includes(needle));
  const el = cands.find(c => !cands.some(o => o !== c && c.contains(o)));
  if (!el) return false;
  el.closest('details')?.setAttribute('open', '');
  el.scrollIntoView({ block: 'center' });
  el.classList.add('kn-search-hit');
  window.setTimeout(() => el.classList.remove('kn-search-hit'), 2600);
  return true;
}
