// ─── גרירת שורות ב«בקשות» (310, 29.10.2026) ──────────────────────────────────
// ‼ גוררים את השורה עצמה — לא ידית. כפתורים, קישורים, שדות ותפריטים בתוך השורה
// ממשיכים לעבוד כרגיל: גרירה מתחילה רק מאזור «שקט» בשורה, ורק אחרי תזוזה של
// כמה פיקסלים (בעכבר) או לחיצה ארוכה (במגע) — כך לחיצה רגילה נשארת לחיצה.
// כל פריט עטוף ב-[data-drag-key] (display: contents), וזה כל מה שהמנגנון צריך.
import { useEffect, useRef } from 'react';

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="menu"], [role="menuitem"], [contenteditable="true"]';
/** אזור הפתיחה של השורה (השם, כותרת הקבוצה) — כפתור, אבל ממנו גוררים: הוא רוב השורה. */
const ROW_HIT = '.rl-hit, .rg-head';
const MOVE_PX = 8;
const HOLD_MS = 380;

type Drag = {
  key: string; wrap: HTMLElement; x: number; y: number; touch: boolean;
  on: boolean; over: string | null; timer?: number;
};

/**
 * @param listRef  — המכל של הרשימה (שורשי הפריטים בתוכו).
 * @param enabled  — כבוי במצב עריכה (↑↓ שם) או כשיש פחות משני פריטים.
 * @param onDrop   — (מה זז, על מה נחת, באיזו רמה: 'root' או מזהה הקבוצה). אותו פריט / שום יעד ⇒ לא נקרא.
 */
export function useListDrag(
  listRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onDrop: (fromKey: string, toKey: string, scope: string) => void,
) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !enabled) return;
    let d: Drag | null = null;
    let eatClick = false;

    const wrapOf = (el: Element | null) => el?.closest<HTMLElement>('[data-drag-key]') ?? null;
    const clearMarks = () => list.querySelectorAll('[data-drop]').forEach(x => x.removeAttribute('data-drop'));
    const start = () => {
      if (!d) return;
      d.on = true;
      d.wrap.setAttribute('data-dragging', '');
      list.classList.add('is-dragging');
    };
    const end = () => {
      if (!d) return;
      window.clearTimeout(d.timer);
      d.wrap.removeAttribute('data-dragging');
      list.classList.remove('is-dragging');
      clearMarks();
      d = null;
    };

    const down = (e: PointerEvent) => {
      if (e.button > 0 || !(e.target instanceof Element)) return;
      const control = e.target.closest(INTERACTIVE);
      if (control && !control.matches(ROW_HIT)) return;
      const wrap = wrapOf(e.target);
      if (!wrap || !list.contains(wrap) || e.target.closest('.rl-dot')) return;   // הנקודה = סימון, לא גרירה
      d = { key: wrap.dataset.dragKey!, wrap, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', on: false, over: null };
      if (d.touch) d.timer = window.setTimeout(start, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (!d) return;
      const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_PX;
      if (!d.on) {
        if (!far) return;
        if (d.touch) { end(); return; }        // תזוזה לפני הלחיצה הארוכה = גלילה
        start();
      }
      clearMarks();
      const over = wrapOf(document.elementFromPoint(e.clientX, e.clientY));
      // ‼ 311: גוררים רק בתוך אותה רמה — בתוך הקבוצה, או בין הפריטים שבראש הרשימה.
      d.over = over && over !== d.wrap && list.contains(over)
        && over.dataset.dragScope === d.wrap.dataset.dragScope ? over.dataset.dragKey! : null;
      if (d.over) over!.setAttribute('data-drop', '');
    };
    const up = () => {
      if (!d) return;
      const { on, key, over } = d;
      const scope = d.wrap.dataset.dragScope ?? 'root';
      end();
      if (!on) return;
      eatClick = true;                          // הלחיצה שמגיעה אחרי שחרור הגרירה — לא פותחת שורה
      if (over) dropRef.current(key, over, scope);
    };
    const click = (e: MouseEvent) => {
      if (!eatClick) return;
      eatClick = false;
      e.stopPropagation(); e.preventDefault();
    };
    // ‼ במגע: אחרי שהגרירה התחילה, הדפדפן לא יגלול במקומה.
    const touchMove = (e: TouchEvent) => { if (d?.on) e.preventDefault(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };

    list.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', end);
    document.addEventListener('keydown', key);
    document.addEventListener('touchmove', touchMove, { passive: false });
    list.addEventListener('click', click, true);
    return () => {
      end();
      list.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', end);
      document.removeEventListener('keydown', key);
      document.removeEventListener('touchmove', touchMove);
      list.removeEventListener('click', click, true);
    };
  }, [listRef, enabled]);
}
