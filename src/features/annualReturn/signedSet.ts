// ─── הקובץ החתום: עמוד הריכוז ← 1301 ← נספחים ← עמוד החתימות (297) ──────────────────────────────────────────────
// ‼ נבנה מהצילום ששמור בשרת (מה שהלקוח ראה וחתם עליו) ומהחתימות ששמורות שם — לא מהדוח הנוכחי במסך. הטופס הרשמי
//   (public/forms/2025/pdf) עם הערכים באותם מיקומים של המסך (formPages.valuesOnPage); העברית — בגופן של עורך ה-PDF.
import { PDFDocument, type PDFPage } from 'pdf-lib';
import { createBurnContext, drawAnnotations, visibleBox, type Annotation } from '../../utils/pdfAnnotations';
import type { FormSlug } from '../taxKnowledge/formMap/model';
import { annexValues, fitFontPct, pagesOf, slugOfForm, valuesOnPage } from './formPages';
import { balanceText, neededAnnexes, summaryRows } from './workspace';
import { isWealthSnap, type Signing, type WealthSnapshot } from './signing';
import { wealthValuesOnPage } from '../wealthDeclaration/engine';
import type { PageValue } from './formPages';

const A4: [number, number] = [595.28, 841.89];
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
let seq = 0;
const text = (t: string, y: number, o: Partial<Annotation> = {}): Annotation => ({
  id: `t${++seq}`, pageId: 'p', kind: 'text', xPct: 0.07, yPct: y, widthPct: 0.86, heightPct: 0.022, color: '#222222', text: t, fontPct: 0.0135, align: 'right', ...o,
});

/** עמוד טקסט (ריכוז / ערכי נספח / חתימות) — שורה אחרי שורה, עמוד חדש כשנגמר המקום. */
async function textPages(doc: PDFDocument, ctx: Awaited<ReturnType<typeof createBurnContext>>, lines: Annotation[][]) {
  let page: PDFPage | null = null; let y = 0.06; let batch: Annotation[] = [];
  const flush = async () => { if (page && batch.length) await drawAnnotations(page, batch, ctx, visibleBox(page)); batch = []; };
  for (const group of lines) {
    const h = group.reduce((m, a) => Math.max(m, a.heightPct), 0.022) + 0.006;
    if (!page || y + h > 0.95) { await flush(); page = doc.addPage(A4); y = 0.06; }
    for (const a of group) batch.push({ ...a, yPct: y + (a.yPct || 0) });
    y += h;
  }
  await flush();
}

type Vals = (page: number) => Pick<PageValue, 'box' | 'text' | 'center'>[];
async function officialPages(doc: PDFDocument, ctx: Awaited<ReturnType<typeof createBurnContext>>, slug: FormSlug, vals: Vals | null) {
  const res = await fetch(`/forms/2025/pdf/${slug}.pdf`);
  if (!res.ok) return;
  const src = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
  // ‼ רק עמודי הטופס (1219 — שבעה מתוך 15; השאר דברי הסבר)
  const n = pagesOf(slug).length || src.getPageCount();
  const copied = await doc.copyPages(src, src.getPageIndices().slice(0, n));
  for (let i = 0; i < copied.length; i++) {
    const page = doc.addPage(copied[i]);
    if (!vals) continue;
    const { width, height } = page.getSize();
    const anns = vals(i + 1).map((v, k): Annotation => {
      const fontPct = fitFontPct(v.box, v.text, width / height);
      // באמצע התא לגובה (האותיות נכתבות מראש התיבה)
      const yPct = Math.max(v.box[1], v.box[1] + v.box[3] / 2 - fontPct * 0.46);
      return {
        id: `v${i}-${k}`, pageId: 'p', kind: 'text', xPct: v.box[0], yPct, widthPct: v.box[2], heightPct: v.box[3],
        color: '#0b3a8c', text: v.text, fontPct, align: v.center ? 'center' : 'right', bold: true,
      };
    });
    if (anns.length) await drawAnnotations(page, anns, ctx, visibleBox(page));
  }
}

/** הקובץ החתום, מהצילום ומהחתימות שבשרת. */
/** עמוד החתימות — לשני הסוגים. */
async function signaturesPage(doc: PDFDocument, ctx: Awaited<ReturnType<typeof createBurnContext>>, s: Signing, what: string) {
  const page = doc.addPage(A4);
  const anns: Annotation[] = [text('הצהרה וחתימה', 0.07, { bold: true, fontPct: 0.02, heightPct: 0.03 })];
  let y = 0.13;
  for (const g of s.signers) {
    const sig = s.signatures?.[g.role];
    anns.push(text(`${g.gender === 'f' ? 'אני מצהירה' : 'אני מצהיר'} שהפרטים ב${what} נכונים ומלאים.`, y));
    anns.push(text(`${g.name}${sig ? ` · ${new Date(sig.signedAt).toLocaleDateString('he-IL')}` : ''}`, y + 0.03, { bold: true }));
    if (sig?.png) anns.push({ id: `sig-${g.role}`, pageId: 'p', kind: 'image', xPct: 0.55, yPct: y + 0.06, widthPct: 0.38, heightPct: 0.1, color: '#000000', imageData: sig.png });
    y += 0.2;
  }
  anns.push(text(`נחתם בדף האישי · גרסה ${s.version} · טביעה ${s.contentSha256.slice(0, 16)}`, 0.92, { color: '#888888', fontPct: 0.011 }));
  await drawAnnotations(page, anns, ctx, visibleBox(page));
}

/** 300 · הצהרת הון: עמוד סיכום ← 1219 הרשמי עם הסכומים ← עמוד החתימות. */
async function buildWealthPdf(s: Signing, w: WealthSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = await createBurnContext(doc);
  const he = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');
  const row = (label: string, v: number | null, none = false) => [
    text(label, 0, { widthPct: 0.62, xPct: 0.31 }), text(v === null ? 'חסר' : none ? 'אין' : nis(v), 0, { widthPct: 0.22, xPct: 0.07, align: 'left' })];
  await textPages(doc, ctx, [
    [text(`הצהרת הון ליום ${he(w.asOf)}`, 0, { fontPct: 0.026, heightPct: 0.036, bold: true })],
    [text([w.names.client, w.names.spouse].filter(Boolean).join(' ו'), 0, { color: '#555555' })],
    ...w.sections.filter(x => x.kind === 'asset').map(x => row(`${x.code} · ${x.label}`, x.amount, x.none)),
    row('200 · סה״כ רכוש', w.assets),
    ...w.sections.filter(x => x.kind === 'liability').map(x => row(`${x.code} · ${x.label}`, x.amount, x.none)),
    row('210 · סה״כ התחייבויות', w.liabilities), row('220 · רכוש פחות התחייבויות', w.netPrivate),
    ...w.sections.filter(x => x.kind === 'business').map(x => row(x.label, x.amount, x.none)),
    row('800 · הון נטו', w.total),
    ...(w.previous ? [row(`בהצהרה הקודמת${w.previous.asOf ? ` (${he(w.previous.asOf)})` : ''}`, w.previous.total)] : []),
    ...(w.change !== null ? [row('שינוי', w.change)] : []),
  ]);
  await officialPages(doc, ctx, '1219' as FormSlug, page => wealthValuesOnPage(page, w));
  await signaturesPage(doc, ctx, s, 'הצהרה');
  return doc.save();
}

export async function buildSignedSetPdf(s: Signing): Promise<Uint8Array> {
  if (isWealthSnap(s.snapshot)) return buildWealthPdf(s, s.snapshot);
  const snap = s.snapshot;
  const doc = await PDFDocument.create();
  const ctx = await createBurnContext(doc);
  const { out, names, year, docs } = snap;
  const person = (p: string) => (p === 'spouse' ? names.spouse ?? 'בן/בת הזוג' : p === 'joint' ? 'משותף' : names.client);
  const bal = balanceText(out);
  // 1 · עמוד הריכוז
  await textPages(doc, ctx, [
    [text(`דוח שנתי ${year}`, 0, { fontPct: 0.026, heightPct: 0.036, bold: true })],
    [text([names.client, names.spouse].filter(Boolean).join(' ו'), 0, { color: '#555555' })],
    ...(bal ? [[text(bal, 0, { fontPct: 0.02, heightPct: 0.03, bold: true, color: '#24654e' })]] : []),
    [text('מה נכנס לדוח', 0, { bold: true, fontPct: 0.016, heightPct: 0.028 })],
    ...summaryRows(out).map(r => [
      text(`${r.label} · ${person(r.person)}`, 0, { widthPct: 0.6, xPct: 0.33 }),
      text(r.code, 0, { widthPct: 0.08, xPct: 0.24, color: '#888888', align: 'left' }),
      text(nis(r.amount), 0, { widthPct: 0.17, xPct: 0.07, align: 'left' }),
    ]),
    ...(docs.length ? [[text('המסמכים', 0, { bold: true, fontPct: 0.016, heightPct: 0.028 })], ...docs.map(d => [text(`${d.title} — ${d.who}`, 0)])] : []),
  ]);
  // 2 · 1301
  await officialPages(doc, ctx, '1301', page => valuesOnPage('1301', page, out));
  // 3 · נספחים — רשימת הערכים, ואז העמודים הרשמיים
  for (const a of neededAnnexes(out)) {
    const vals = annexValues(a.formId, out);
    if (vals.length) await textPages(doc, ctx, [[text(`${a.formId} · ${a.title}`, 0, { bold: true, fontPct: 0.018, heightPct: 0.03 })],
      ...vals.map(v => [text(v.label, 0, { widthPct: 0.62, xPct: 0.31 }), text(v.text, 0, { widthPct: 0.22, xPct: 0.07, align: 'left' })])]);
    const slug = slugOfForm(a.formId);
    if (slug && pagesOf(slug).length) await officialPages(doc, ctx, slug, null);
  }
  // 4 · החתימות
  await signaturesPage(doc, ctx, s, 'דוח');
  return doc.save();
}

/** SHA-256 של הקובץ (hex) — נשמר עם המסמך. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
