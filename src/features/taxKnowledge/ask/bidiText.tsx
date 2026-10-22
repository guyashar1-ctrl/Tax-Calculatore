// ─── מספרי סעיפים בתוך עברית ──────────────────────────────────────────────────
// ‼ «17(5א)», «87ד(א)», «45א(ב)» בשורה עברית מתהפכים («(5א)17»). מבודדים אותם משמאל לימין — כך כותבים אותם.
import type { ReactNode } from 'react';

const SECTION = /\d+[א-ת]?(?:\([^)\s]{1,6}\))+/g;

export function bidiText(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SECTION)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(<bdi key={i} dir="ltr">{m[0]}</bdi>);
    last = i + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
