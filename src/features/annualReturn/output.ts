// ─── הדוח השנתי: גיליון עבודה לפי קודי 1301, וקובץ נתונים שנפתח מחדש ─────────────────
// ‼ שלושה תוצרים שאסור לערבב (מחקר 11.10.2026):
//   1. גיליון עבודה — זה. לפי קודי הטופס, עם מקור לכל שורה, בדיקת כיסוי ומה לא מופק. הקלדה במערכת המקוונת לפיו.
//   2. טופס רשמי שהופק — אין: טופסי 2025 אינם PDF למילוי, ומי שחייב בדוח מקוון (שכר / עסק) מגיש בשידור.
//      הטופס הרשמי החתום (עם ברקוד) מודפס רק ממערכת רשות המסים אחרי השידור.
//   3. תוצר למסלול ההגשה — קובץ לפי «מבנה קובץ 1301 לשנת 2025» (file1301.ts), שנבדק מקומית. אין שידור.
// ‼ הסטטוס כתוב בראש: טיוטה פנימית / גיליון חלקי / גיליון מלא / מוכן להגשה (אושר) / הוגש בפועל.
import type { ReturnField, ReturnOutputs } from './types';

export const RETURN_SCHEMA = 'pivo-1301-draft@2';
export type FileStatus = 'internalDraft' | 'partialWorksheet' | 'completeWorksheet' | 'approved' | 'filed';
export interface ReturnFile {
  schema: string;
  formVersionId: string;
  taxYear: number;
  version: number;
  status: FileStatus;
  client: string;
  fields: { code: string; person: string; amount?: number; checked?: boolean; text?: string }[];
  annexes: { formId: string; status: string; entityRef?: string }[];
  balance: number;
}

export const STATUS_HE: Record<FileStatus, string> = {
  internalDraft: 'טיוטה פנימית — חסרים נתונים; לא להגשה',
  partialWorksheet: 'גיליון עבודה חלקי — יש שדות או נספחים שהמערכת לא מפיקה ללקוח הזה; לא להגשה',
  completeWorksheet: 'גיליון עבודה מלא — טרם אושר בסקירת המשרד',
  approved: 'מוכן להגשה — אושר בסקירת המשרד; הקלדה במערכת המקוונת לפי הגיליון; לא שודר',
  filed: 'הוגש בפועל (נרשם ידנית)',
};

export function fileStatusOf(o: Pick<ReturnOutputs, 'status'>, meta: { approved: boolean; filed?: boolean }): FileStatus {
  return meta.filed ? 'filed' : meta.approved && o.status === 'completeWorksheet' ? 'approved' : o.status;
}

const fieldOut = (f: ReturnField) => (f.kind === 'amount' ? { code: f.code, person: f.person, amount: f.amount }
  : f.kind === 'checkbox' ? { code: f.code, person: f.person, checked: !!f.checked } : { code: f.code, person: f.person, text: f.text ?? '' });

export function returnFile(o: ReturnOutputs, meta: { clientName: string; version: number; approved: boolean; filed?: boolean }): ReturnFile {
  return {
    schema: RETURN_SCHEMA, formVersionId: o.formVersionId, taxYear: o.taxYear, version: meta.version,
    status: fileStatusOf(o, meta), client: meta.clientName,
    fields: o.fields.map(fieldOut),
    annexes: o.annexes.map(a => ({ formId: a.formId, status: a.status, entityRef: a.entityRef })),
    balance: o.household.balance,
  };
}

/** הקובץ מתוך הגיליון (פתיחה מחדש של ה-HTML שהורד). */
export function fileFromHtml(html: string): ReturnFile {
  const m = /<script type="application\/json" id="pivo-1301">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('בגיליון אין נתוני טופס');
  return parseReturnFile(m[1]);
}

/** קריאה בחזרה של הקובץ — עם בדיקת מבנה. */
export function parseReturnFile(text: string): ReturnFile {
  const j = JSON.parse(text) as ReturnFile;
  if (j.schema !== RETURN_SCHEMA) throw new Error(`קובץ לא מוכר (${String(j.schema)})`);
  if (!Array.isArray(j.fields)) throw new Error('חסרים שדות');
  return j;
}

/** פתיחה מחדש: כל שדה בגרסה מופיע בקובץ באותו סכום / סימון / טקסט, ואין שדות עודפים. */
export function verifyReopened(o: ReturnOutputs, f: ReturnFile): string[] {
  const issues: string[] = [];
  const key = (x: { code: string; person: string }) => `${x.code}|${x.person}`;
  const inFile = new Map(f.fields.map(x => [key(x), x]));
  for (const x of o.fields) {
    const y = inFile.get(key(x));
    if (!y) { issues.push(`חסר בקובץ: ${x.code} (${x.person})`); continue; }
    if (x.kind === 'amount' && y.amount !== x.amount) issues.push(`סכום שונה ב-${x.code}: ${y.amount} במקום ${x.amount}`);
    if (x.kind === 'checkbox' && !!y.checked !== !!x.checked) issues.push(`סימון שונה ב-${x.code}`);
    if ((x.kind === 'text' || x.kind === 'code') && (y.text ?? '') !== (x.text ?? '')) issues.push(`טקסט שונה ב-${x.code}`);
    inFile.delete(key(x));
  }
  for (const k of inFile.keys()) issues.push(`שדה עודף בקובץ: ${k}`);
  if (f.taxYear !== o.taxYear) issues.push('שנת מס שונה');
  if (f.balance !== o.household.balance) issues.push('יתרה שונה');
  return issues;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nis = (n?: number) => (n == null ? '' : `${Math.round(n).toLocaleString('he-IL')}`);
const TRUST: Record<string, string> = { verified: '✓ אומת מול מסמך', read: '⟳ נקרא מהרשות', manual: '✎ הוזן / הוצהר' };
const srcMark = (f: ReturnField) => f.source.kind === 'fact' ? TRUST[f.source.trust ?? 'manual'] : f.source.kind === 'calculation' ? '∑ חישוב' : f.source.kind === 'completion' ? '✍ השלמה מקצועית' : '☰ מהתיק';
const valueOf = (f: ReturnField) => (f.kind === 'amount' ? nis(f.amount) : f.kind === 'checkbox' ? (f.checked ? '☒ מסומן' : '☐') : esc(f.text ?? ''));

/** גיליון HTML עצמאי (עברית, RTL, להדפסה): סטטוס, סיכום, שדות לפי חלק וקוד, נספחים, בקרות, בדיקת כיסוי, מה חסר ומה לא מופק. */
export function returnHtml(o: ReturnOutputs, meta: { clientName: string; spouseName?: string; version: number; approved: boolean; filed?: { at: string; ref?: string } }): string {
  const file = returnFile(o, { clientName: meta.clientName, version: meta.version, approved: meta.approved, filed: !!meta.filed });
  const parts = [...new Set(o.fields.map(f => f.part))];
  const who = (p: string) => (p === 'client' ? meta.clientName : p === 'spouse' ? meta.spouseName ?? 'בן/בת הזוג' : 'משותף');
  const rows = (part: string) => o.fields.filter(f => f.part === part).map(f => `<tr><td class="c">${esc(f.code)}</td><td>${esc(f.label)}</td><td>${esc(who(f.person))}</td><td class="n">${valueOf(f)}</td><td class="s">${esc(srcMark(f))}<br><span>${esc(f.source.text)}</span></td></tr>`).join('');
  const bal = o.household.balance;
  const cov = o.formCoverage;
  const ok = file.status === 'approved' || file.status === 'filed' || file.status === 'completeWorksheet';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>גיליון 1301 · ${esc(meta.clientName)} · ${o.taxYear}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1f22;--mut:#5d6168;--bd:#e3e0d8;--warn:#8a4b0c;--ok:#1f6b45}
@media (prefers-color-scheme:dark){:root{--bg:#16181b;--fg:#ecebe7;--mut:#a5a8ad;--bd:#2c2f34;--warn:#e3a25a;--ok:#6cc79a}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 "Segoe UI",Arial,sans-serif}main{max-width:980px;margin:0 auto;padding:20px 16px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 6px}.st{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:99px;border:1px solid var(--warn);color:var(--warn);font-weight:600}
.st.ok{border-color:var(--ok);color:var(--ok)}.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px;margin-top:12px}.sum div{border:1px solid var(--bd);border-radius:8px;padding:8px 10px}.sum span{display:block;color:var(--mut);font-size:12px}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:start;padding:5px 7px;border-bottom:1px solid var(--bd);vertical-align:top}th{color:var(--mut);font-weight:600}
td.c{font-weight:700;white-space:nowrap}td.n{white-space:nowrap;font-weight:600}td.s{font-size:12px;color:var(--mut)}ul{padding-inline-start:20px;margin:0}.bad{color:var(--warn)}.note{color:var(--mut);font-size:12px}footer{margin-top:24px;font-size:12px;color:var(--mut)}
@media print{body{background:#fff;color:#000}}
</style></head><body><main>
<h1>גיליון עבודה לדוח השנתי 1301 — ${esc(meta.clientName)}${meta.spouseName && o.persons.length > 1 ? ` ו${esc(meta.spouseName)}` : ''} · שנת המס ${o.taxYear}</h1>
<div class="st${ok ? ' ok' : ''}">${esc(STATUS_HE[file.status])}${meta.filed ? ` · ${esc(meta.filed.at)}${meta.filed.ref ? ` · ${esc(meta.filed.ref)}` : ''}` : ''}</div>
<p>גרסה ${meta.version} · טופס ${esc(o.formVersionId)} · ${esc(o.coverage.text)}</p>
<p class="note">זה גיליון עבודה להקלדה במערכת המקוונת של רשות המסים — לא טופס רשמי. טופסי 2025 אינם PDF למילוי; הטופס הרשמי החתום מודפס מהמערכת אחרי השידור.</p>
${o.household.incomplete ? '<p class="bad"><b>חסרים נתוני הכנסה</b> — החבות והיתרה אינן סופיות.</p>' : ''}
<div class="sum"><div><span>חבות מס הכנסה</span><b>${o.household.incomplete ? 'חסר' : `${nis(o.household.liability)} ₪`}</b></div><div><span>נוכה במקור</span><b>${nis(o.household.withheld)} ₪</b></div><div><span>מקדמות</span><b>${nis(o.household.advancesPaid)} ₪</b></div><div><span>${o.household.incomplete ? 'יתרה' : bal > 0 ? 'לתשלום' : bal < 0 ? 'להחזר' : 'יתרה'}</span><b>${o.household.incomplete ? 'חסר' : `${nis(Math.abs(bal))} ₪`}</b></div></div>
${cov ? `<h2>בדיקת כיסוי — כל שדות הטופס ללקוח הזה</h2><p>${cov.counts.relevant} שדות רלוונטיים · ${cov.counts.filled} מולאו · ${cov.counts.missing} חסרים · ${cov.counts.notSupported} לא מופקים · ${cov.counts.office} למשרד השומה / בחתימה</p>` : ''}
${o.unsupported?.length ? `<h2 class="bad">מה המערכת לא מפיקה ללקוח הזה</h2><ul>${o.unsupported.map(u => `<li>${esc(u.text)}</li>`).join('')}</ul><p class="note">לא נסגר בהשלמה מקצועית. כל עוד יש כאן משהו — «גיליון עבודה חלקי», לא «מוכן להגשה».</p>` : ''}
${o.blockers.length ? `<h2 class="bad">מה חסר</h2><ul>${o.blockers.map(b => `<li>${esc(b.text)}</li>`).join('')}</ul>` : ''}
${parts.map(p => `<h2>חלק ${esc(p)}</h2><div class="wrap"><table><thead><tr><th>קוד</th><th>שדה</th><th>של מי</th><th>ערך</th><th>מקור</th></tr></thead><tbody>${rows(p)}</tbody></table></div>`).join('')}
${(o.annex1320 ?? []).map(a => `<h2>נספח 1320 — ${esc(a.label)}${a.complete ? '' : ' <span class="bad">(חלקי)</span>'}</h2><div class="wrap"><table><tbody>${Object.entries(a.lines).map(([k, v]) => `<tr><td class="c">${esc(k)}</td><td class="n">${nis(v)}</td></tr>`).join('')}</tbody></table></div>${a.problems.length ? `<p class="bad">${esc(a.problems.join(' · '))}</p>` : ''}`).join('')}
${o.annex1321 ? `<h2>נספח 1321 — שכירות למגורים 10%${o.annex1321.complete ? '' : ' <span class="bad">(חלקי)</span>'}</h2><p>הכנסה ${nis(o.annex1321.gross)} · ניכוי שכר דירה למגורים ${nis(o.annex1321.ownHousingRent)} · נטו לשדה 284: ${nis(o.annex1321.net)} · דירה יחידה: ${o.annex1321.singleApartment == null ? '—' : o.annex1321.singleApartment ? 'כן' : 'לא'}</p><ul>${o.annex1321.props.map(p => `<li>${esc(p.address)} · גוש ${esc(p.block ?? '—')} חלקה ${esc(p.parcel ?? '—')}${p.area ? ` · ${esc(p.area)} מ״ר` : ''}${p.floor ? ` · קומה ${esc(p.floor)}` : ''}</li>`).join('')}</ul>` : ''}
<h2>נספחים</h2><ul>${o.annexes.map(a => `<li>${esc(a.formId)} — ${esc(a.title)} · ${esc(a.reason)} · <b>${a.status === 'filled' ? 'מולא' : a.status === 'partial' ? 'חלקי' : a.status === 'manual' ? 'מולא ידנית' : 'חסר'}</b>${a.note ? `<br><span class="bad">${esc(a.note)}</span>` : ''}</li>`).join('') || '<li>לא נדרשים נספחים</li>'}</ul>
${(o.completions ?? []).length ? `<h2>השלמות מקצועיות (אושרו במשרד)</h2><ul>${(o.completions ?? []).map(c => `<li>✍ ${esc(c.gap)}${c.fields.length ? ` · ${c.fields.map(x => `${esc(x.code)}: ${nis(x.amount)}`).join(', ')}` : ''}${c.taxAmount ? ` · מס על הרכיב ${nis(c.taxAmount)} ₪` : ''} · ${esc(c.justification)}${c.approvedAt ? ` · אושר ${esc(c.approvedAt)}` : ''}</li>`).join('')}</ul>` : ''}
<h2>בקרות התאמה</h2><ul>${o.controls.map(c => `<li class="${c.ok === false ? 'bad' : ''}">${c.ok === true ? '✓' : c.ok === false ? '✗' : '—'} ${esc(c.text)} · ${esc(c.detail)}</li>`).join('')}</ul>
${o.limits.length ? `<h2>הערות</h2><ul>${o.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
<footer>גיליון עבודה לפי קודי טופס ${esc(o.formVersionId)}. אין כאן שידור לרשות: ההגשה נעשית במערכת המקוונת, וההגשה בפועל נרשמת בתיק עם תאריך ואסמכתה.</footer>
<script type="application/json" id="pivo-1301">${JSON.stringify(file).replace(/</g, '\\u003c')}</script>
</main></body></html>`;
}
