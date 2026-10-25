// ─── הקובץ החתום: עמוד הריכוז ← 1301 ← נספחים ← עמוד החתימות (297) ──────────────────────────────────────────────
// ‼ נבנה מהצילום ששמור בשרת (מה שהלקוח ראה וחתם עליו) ומהחתימות ששמורות שם — לא מהדוח הנוכחי במסך. הטופס הרשמי
//   (public/forms/2025/pdf) עם הערכים באותם מיקומים של המסך (formPages.valuesOnPage); העברית — בגופן של עורך ה-PDF.
import { PDFDocument, type PDFPage } from 'pdf-lib';
import { createBurnContext, drawAnnotations, visibleBox, type Annotation } from '../../utils/pdfAnnotations';
import type { FormSlug } from '../taxKnowledge/formMap/model';
import { annexValues, pagesOf, slugOfForm, valuesOnPage } from './formPages';
import { balanceText, neededAnnexes, summaryRows } from './workspace';
import type { Signing } from './signing';

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

async function officialPages(doc: PDFDocument, ctx: Awaited<ReturnType<typeof createBurnContext>>, slug: FormSlug, values: boolean, s: Signing) {
  const res = await fetch(`/forms/2025/pdf/${slug}.pdf`);
  if (!res.ok) return;
  const src = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
  const copied = await doc.copyPages(src, src.getPageIndices());
  for (let i = 0; i < copied.length; i++) {
    const page = doc.addPage(copied[i]);
    if (!values) continue;
    const anns = valuesOnPage(slug, i + 1, s.snapshot.out).map((v, k): Annotation => ({
      id: `v${i}-${k}`, pageId: 'p', kind: 'text', xPct: v.box[0], yPct: v.box[1], widthPct: v.box[2], heightPct: v.box[3],
      color: '#0b3a8c', text: v.text, fontPct: Math.min(0.0105, v.box[3] * 0.8), align: 'right', bold: true,
    }));
    if (anns.length) await drawAnnotations(page, anns, ctx, visibleBox(page));
  }
}

/** הקובץ החתום, מהצילום ומהחתימות שבשרת. */
export async function buildSignedSetPdf(s: Signing): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = await createBurnContext(doc);
  const { out, names, year, docs } = s.snapshot;
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
  await officialPages(doc, ctx, '1301', true, s);
  // 3 · נספחים — רשימת הערכים, ואז העמודים הרשמיים
  for (const a of neededAnnexes(out)) {
    const vals = annexValues(a.formId, out);
    if (vals.length) await textPages(doc, ctx, [[text(`${a.formId} · ${a.title}`, 0, { bold: true, fontPct: 0.018, heightPct: 0.03 })],
      ...vals.map(v => [text(v.label, 0, { widthPct: 0.62, xPct: 0.31 }), text(v.text, 0, { widthPct: 0.22, xPct: 0.07, align: 'left' })])]);
    const slug = slugOfForm(a.formId);
    if (slug && pagesOf(slug).length) await officialPages(doc, ctx, slug, false, s);
  }
  // 4 · החתימות
  const page = doc.addPage(A4);
  const anns: Annotation[] = [text('הצהרה וחתימה', 0.07, { bold: true, fontPct: 0.02, heightPct: 0.03 })];
  let y = 0.13;
  for (const g of s.signers) {
    const sig = s.signatures?.[g.role];
    anns.push(text(`${g.gender === 'f' ? 'אני מצהירה' : 'אני מצהיר'} שהפרטים בדוח נכונים ומלאים.`, y));
    anns.push(text(`${g.name}${sig ? ` · ${new Date(sig.signedAt).toLocaleDateString('he-IL')}` : ''}`, y + 0.03, { bold: true }));
    if (sig?.png) anns.push({ id: `sig-${g.role}`, pageId: 'p', kind: 'image', xPct: 0.55, yPct: y + 0.06, widthPct: 0.38, heightPct: 0.1, color: '#000000', imageData: sig.png });
    y += 0.2;
  }
  anns.push(text(`נחתם בדף האישי · גרסה ${s.version} · טביעה ${s.contentSha256.slice(0, 16)}`, 0.92, { color: '#888888', fontPct: 0.011 }));
  await drawAnnotations(page, anns, ctx, visibleBox(page));
  return doc.save();
}

/** SHA-256 של הקובץ (hex) — נשמר עם המסמך. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
