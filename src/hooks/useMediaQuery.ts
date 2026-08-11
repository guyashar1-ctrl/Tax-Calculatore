// ─── שאילתת מדיה כ-hook ──────────────────────────────────────────────────────
// נקודת השבירה של האפליקציה היא 760px (סרגל הניווט התחתון, index.css) —
// כל מי שצריך "מובייל?" ב-JS שואל כאן, ולא ממציא סף משלו.

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 760;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);
}
