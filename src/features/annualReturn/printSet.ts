// ─── סט ההדפסה: עמוד ריכוז ← 1301 ← נספחים ← אסמכתאות (25.10.2026; הסדר — גיא, 16.10) ─────────────────────────
// ‼ חלון הדפסה אחד בדפדפן (גם «שמור כ-PDF»). העמודים הרשמיים עם הערכים מהמנוע (formPages.ts); האסמכתאות — הקבצים
//   שהלקוח העלה, עמוד-עמוד (PDF ⇒ תמונות). שום דבר לא נשלח ולא נשמר מכאן.
import { LAYOUTS, type FormSlug } from '../taxKnowledge/formMap/model';
import type { ReturnOutputs } from './types';
import { annexValues, fitFontCqw, pagesOf, slugOfForm, valuesOnPage } from './formPages';
import { balanceText, neededAnnexes, summaryRows, type Material } from './workspace';
import { fileAsImages, loadDocumentFile } from './docFile';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;

export interface SetPart { title: string; pages: number }
/** תוכן הסט (גם לתצוגה לפני ההדפסה). */
export function setContents(out: ReturnOutputs, mats: Material[]): SetPart[] {
  const annexes = neededAnnexes(out).map(a => ({ title: `${a.formId} · ${a.title}`, pages: (slugOfForm(a.formId) && pagesOf(slugOfForm(a.formId)!).length) || 1 }));
  const docs = mats.filter(m => m.evidence?.documentId);
  return [
    { title: 'עמוד ריכוז', pages: 1 },
    { title: 'טופס 1301', pages: pagesOf('1301').length },
    ...annexes,
    ...(docs.length ? [{ title: `אסמכתאות · ${docs.length}`, pages: docs.length }] : []),
  ];
}

function formPagesHtml(slug: FormSlug, out: ReturnOutputs, origin: string): string {
  return pagesOf(slug).map(pg => {
    const vals = valuesOnPage(slug, pg.n, out).map(v =>
      `<span class="v${v.center ? ' m' : ''}"${/[א-ת]/.test(v.text) ? ' dir="rtl"' : ''} style="left:${v.box[0] * 100}%;top:${v.box[1] * 100}%;width:${v.box[2] * 100}%;height:${v.box[3] * 100}%;font-size:${fitFontCqw(v.box, v.text, pg.w / pg.h)}cqw">${esc(v.text)}</span>`).join('');
    return `<section class="pg form"><div class="paper" style="aspect-ratio:${pg.w}/${pg.h}"><img src="${origin}${pg.img}" alt="">${vals}</div></section>`;
  }).join('');
}

export interface PrintInput { out: ReturnOutputs; mats: Material[]; clientName: string; spouseName?: string; year: number }

/** פותח את חלון ההדפסה. ‼ חייב להיקרא ישר מהלחיצה (חוסם חלונות קופצים) — התוכן נטען אחרי שהחלון נפתח. */
export async function openPrintSet(p: PrintInput): Promise<'ok' | 'blocked'> {
  const w = window.open('', '_blank');
  if (!w) return 'blocked';
  w.document.write(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>מכין את הסט…</title><body style="font-family:system-ui;padding:40px">מכין את הסט להדפסה…</body></html>`);
  const origin = window.location.origin;
  const { out, mats, year } = p;
  const names = [p.clientName, p.spouseName].filter(Boolean).join(' ו');
  const bal = balanceText(out);
  const rows = summaryRows(out);
  const person = (x: string) => (x === 'spouse' ? p.spouseName ?? 'בן/בת הזוג' : x === 'joint' ? 'משותף' : p.clientName);
  const summary = `<section class="pg sum">
    <h1>דוח שנתי ${year}</h1><p class="who">${esc(names)}</p>
    ${bal ? `<p class="bal">${esc(bal)}</p>` : ''}
    <h2>מה נכנס לדוח</h2>
    <table>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(person(r.person))}</td><td class="c">${esc(r.code)}</td><td class="n">${nis(r.amount)}</td><td class="s">${esc(r.from)}</td></tr>`).join('')}</table>
    <h2>המסמכים</h2>
    <ul>${mats.filter(m => m.state === 'done' || m.state === 'got').map(m => `<li>${esc(m.title)} — ${esc(m.who === 'spouse' ? p.spouseName ?? '' : m.who === 'client' ? p.clientName : 'משותף')}</li>`).join('')}</ul>
  </section>`;
  const annexHtml = neededAnnexes(out).map(a => {
    const slug = slugOfForm(a.formId);
    const vals = annexValues(a.formId, out);
    const list = vals.length ? `<section class="pg list"><h2>${esc(a.formId)} · ${esc(a.title)}</h2><table>${vals.map(v => `<tr><td>${esc(v.label)}</td><td class="n">${esc(v.text)}</td></tr>`).join('')}</table></section>` : '';
    return list + (slug && LAYOUTS[slug] ? formPagesHtml(slug, out, origin) : '');
  }).join('');
  // אסמכתאות — הקבצים עצמם
  const docs: string[] = [];
  for (const m of mats.filter(x => x.evidence?.documentId)) {
    const f = await loadDocumentFile(m.evidence!.documentId!).catch(() => null);
    if (!f) { docs.push(`<section class="pg list"><h2>${esc(m.title)}</h2><p>הקובץ לא נטען.</p></section>`); continue; }
    const imgs = await fileAsImages(f).catch(() => [] as string[]);
    URL.revokeObjectURL(f.url);
    docs.push(...imgs.map((src, i) => `<section class="pg doc"><p class="cap">${esc(m.title)}${imgs.length > 1 ? ` · ${i + 1}/${imgs.length}` : ''}</p><img src="${src}" alt=""></section>`));
  }
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דוח שנתי ${year} — ${esc(names)}</title><style>
    @page{size:A4;margin:10mm}
    body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#222}
    .pg{page-break-after:always;break-after:page}
    .pg:last-child{page-break-after:auto}
    .sum h1{font-size:22px;margin:0 0 2px}.who{color:#555;margin:0 0 12px}.bal{font-size:18px;font-weight:700;margin:0 0 14px}
    h2{font-size:15px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:3px 4px;border-bottom:1px solid #eee}
    td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}td.c,td.s{color:#777;font-size:11.5px;white-space:nowrap}
    ul{font-size:12.5px;padding-inline-start:18px}
    .paper{position:relative;width:100%;container-type:inline-size}.paper img{display:block;width:100%}
    .v{position:absolute;display:flex;align-items:center;justify-content:flex-end;font:600 9.5px/1 "Segoe UI",Arial;color:#0b3a8c;padding:0 2px;direction:ltr;overflow:hidden;white-space:nowrap}
    .v[dir=rtl]{direction:rtl;justify-content:flex-start}.v.m{justify-content:center;padding:0}
    .doc img{display:block;max-width:100%;max-height:265mm;margin:0 auto}.cap{font-size:11px;color:#666;margin:0 0 4px}
  </style></head><body>${summary}${formPagesHtml('1301', out, origin)}${annexHtml}${docs.join('')}
  <script>window.onload=()=>{Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),300))}</script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  return 'ok';
}
