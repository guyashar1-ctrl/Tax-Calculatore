// ─── הצהרת הון: הדפסה — עמוד סיכום ואז 1219 הרשמי עם הסכומים (26.10.2026) ───────────────────────────────────────
// ‼ מהצילום (אותו מקור כמו החתימה) — מה שמודפס הוא מה שהלקוח רואה וחותם עליו.
import { pagesOf } from '../annualReturn/formPages';
import type { WealthSnapshot } from '../annualReturn/signing';
import { wealthValuesOnPage } from './engine';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const he = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

/** שורות הסיכום — גם לבדיקות. */
export function wealthSummaryRows(w: WealthSnapshot): { code: string; label: string; value: string; strong?: boolean }[] {
  const v = (n: number | null, none = false) => (n === null ? 'חסר' : none ? 'אין' : nis(n));
  return [
    ...w.sections.filter(s => s.kind === 'asset').map(s => ({ code: s.code, label: s.label, value: v(s.amount, s.none) })),
    { code: '200', label: 'סה״כ רכוש', value: v(w.assets), strong: true },
    ...w.sections.filter(s => s.kind === 'liability').map(s => ({ code: s.code, label: s.label, value: v(s.amount, s.none) })),
    { code: '210', label: 'סה״כ התחייבויות', value: v(w.liabilities), strong: true },
    { code: '220', label: 'רכוש פחות התחייבויות', value: v(w.netPrivate), strong: true },
    ...w.sections.filter(s => s.kind === 'business').map(s => ({ code: '', label: s.label, value: v(s.amount, s.none) })),
    { code: '800', label: 'הון נטו', value: v(w.total), strong: true },
    ...(w.previous ? [{ code: '', label: `בהצהרה הקודמת${w.previous.asOf ? ` (${he(w.previous.asOf)})` : ''}`, value: v(w.previous.total) }] : []),
    ...(w.change !== null ? [{ code: '', label: 'שינוי', value: v(w.change), strong: true }] : []),
  ];
}

/** ‼ חייב להיקרא ישר מהלחיצה (חוסם חלונות קופצים). */
export function printWealthSet(w: WealthSnapshot): 'ok' | 'blocked' {
  const win = window.open('', '_blank');
  if (!win) return 'blocked';
  const origin = window.location.origin;
  const names = [w.names.client, w.names.spouse].filter(Boolean).join(' ו');
  const rows = wealthSummaryRows(w);
  const pages = pagesOf('1219').map(pg => {
    const vals = wealthValuesOnPage(pg.n, w).map(v =>
      `<span class="v" style="left:${v.box[0] * 100}%;top:${v.box[1] * 100}%;width:${v.box[2] * 100}%;height:${v.box[3] * 100}%">${esc(v.text)}</span>`).join('');
    return `<section class="pg form"><div class="paper" style="aspect-ratio:${pg.w}/${pg.h}"><img src="${origin}${pg.img}" alt="">${vals}</div></section>`;
  }).join('');
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>הצהרת הון ליום ${he(w.asOf)} — ${esc(names)}</title><style>
    @page{size:A4;margin:10mm}
    body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#222}
    .pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto}
    h1{font-size:22px;margin:0 0 2px}.who{color:#555;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;font-size:13px}td{padding:4px;border-bottom:1px solid #eee}
    td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}td.c{color:#777;font-size:11.5px;width:40px}
    tr.s td{font-weight:700;border-top:1px solid #ccc}
    .paper{position:relative;width:100%}.paper img{display:block;width:100%}
    .v{position:absolute;display:flex;align-items:center;justify-content:flex-end;font:600 9.5px/1 "Segoe UI",Arial;color:#0b3a8c;padding:0 2px;direction:ltr;overflow:hidden;white-space:nowrap}
  </style></head><body>
  <section class="pg"><h1>הצהרת הון ליום ${he(w.asOf)}</h1><p class="who">${esc(names)}</p>
  <table>${rows.map(r => `<tr${r.strong ? ' class="s"' : ''}><td class="c">${esc(r.code)}</td><td>${esc(r.label)}</td><td class="n">${esc(r.value)}</td></tr>`).join('')}</table></section>
  ${pages}
  <script>window.onload=()=>{Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),300))}</script></body></html>`;
  win.document.open(); win.document.write(html); win.document.close();
  return 'ok';
}
