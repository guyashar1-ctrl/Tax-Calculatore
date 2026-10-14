// ─── קובץ 1301 לפי «מבנה קובץ לדוחות שנתיים — 1301 לשנת 2025» (רשות המסים, מכתב 26.03.2026) ─────────────
// ‼ תוצר למסלול ההגשה: אותו מבנה משמש לשידור OPCN ולהעלאה כ«מייצג מזוהה». כאן רק מפיקים ובודקים מקומית —
//   אין שידור, אין העלאה ואין שימוש בבודק המבנה של שע״ם (שולח מידע החוצה).
// ‼ המבנה: רשומה 1000 (כותרת + אזור קוד-סכום) ורשומת סגירה 9999. מפרט השדות: taxForms/data/file1301-2025.spec.json.
// ‼ לא מוגדר במפרט ולכן מסומן כהנחה: קידוד העברית (כאן Windows-1255, לוגי), סוף שורה (CRLF) ושם הקובץ.
// ‼ «נבדק» = נקרא בחזרה לפי המפרט: אורך כל רשומה, שדות נומריים רק ספרות, כל שדה בכותרת וכל קוד באזור הקוד-סכום
//   שווים לערכי הדוח. זו בדיקה מקומית — לא אישור של רשות המסים.

import specJson from '../taxForms/data/file1301-2025.spec.json';
import type { Client } from '../../types';
import type { Person } from '../taxEstimate/types';
import type { ReturnDraft, ReturnOutputs, ReturnField } from './types';

interface FieldSpec { seq: number; start: number; length: number; type: string; name: string; notes?: string; person?: string | null }
interface CodeSpec { code1301: string; length: number; type: string; person?: string | null; name: string; notes?: string }
interface RecordSpec { type: string; length: number; fields: FieldSpec[]; codeAmount?: { start: number; length: number; codeLength: number; maxFilledCodes: number; codes: CodeSpec[] } }
const SPEC = specJson as unknown as { records: RecordSpec[] };
const R1000 = SPEC.records.find(r => r.type === '1000')!;
const R9999 = SPEC.records.find(r => r.type === '9999')!;
const CODE_SPEC = new Map(R1000.codeAmount!.codes.map(c => [c.code1301, c]));

export interface File1301 {
  records: string[];
  text: string;
  /** ערכי הכותרת לפי מספר שדה (seq) וערכי אזור הקוד-סכום — מה שהתכוונו לכתוב. */
  header: Record<number, string>;
  codes: { code: string; value: string }[];
  /** הנחות שאינן מהמפרט. */
  assumptions: string[];
  /** שדות בגיליון שאין להם מקום בקובץ (לידיעה). */
  notInFile: string[];
  /** בעיות שזוהו בהפקה (ערך ארוך מדי, תו לא נומרי…). */
  issues: string[];
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** הצהרות כן/לא בכותרת: 1 – כן; 2 – לא. */
const yn = (v: boolean | undefined) => (v === undefined ? '' : v ? '1' : '2');

function fieldValue(o: ReturnOutputs, id: string, person?: Person | 'joint'): ReturnField | undefined {
  return o.fields.find(f => f.code === id && (person == null || f.person === person));
}
const txt = (o: ReturnOutputs, id: string) => fieldValue(o, id)?.text ?? '';
const flag = (o: ReturnOutputs, id: string): boolean | undefined => {
  const f = fieldValue(o, id);
  if (!f) return undefined;
  if (f.kind === 'checkbox') return !!f.checked;
  return f.text === 'כן' ? true : f.text === 'לא' ? false : undefined;
};
const ymd = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, '') : '');
const dmy = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const phone = (p?: string) => { const d = digits(p); if (!d) return { pre: '', num: '' }; const pre = /^(05\d|07\d)/.test(d) ? d.slice(0, 3) : d.slice(0, 2); return { pre, num: d.slice(pre.length) }; };
const FAMILY: Record<string, string> = { single: '1', married: '2', widowed: '3', divorced: '4', singleParent: '4' };

/** קוד הטופס לשדה בגיליון: קוד מספרי, או קוד הקטלוג (F###) של שורה מהתיק — לפי האדם. */
const CHILD_GROUPS: { code: string; person: Person; ids: string[] }[] = [
  { code: '260', person: 'client', ids: ['F196', 'F197', 'F198', 'F199', 'F200', 'F201'] },
  { code: '262', person: 'spouse', ids: ['F202', 'F203', 'F204', 'F205', 'F206', 'F207'] },
  { code: '190', person: 'client', ids: ['F208', 'F209', 'F210', 'F211', 'F212', 'F213'] },
  { code: '291', person: 'spouse', ids: ['F214', 'F215', 'F216', 'F217', 'F218', 'F219'] },
  { code: '022', person: 'client', ids: ['F220', 'F221', 'F222', 'F223', 'F224', 'F225'] },
];
/** שדות בגיליון שהמידע שלהם עובר בכותרת (לא באזור הקוד-סכום). */
const IN_HEADER = new Set(['F001', 'F002', 'F003', 'F004', 'F005', 'F007', 'F016', 'F017', 'F018', 'F024', 'F026', 'F032', 'F033', 'F037', 'F038', 'F039', 'F040', 'F041', 'F044', 'F045', 'F046', 'F047',
  'F048', 'F049', 'F050', 'F051', 'F052', 'F053', 'F054', 'F055', 'F057', 'F058', 'F059', 'F060', 'F061', 'F062', 'F063', 'F064', 'F065', 'F066', 'F067', 'F069', 'F072', 'F073', 'F076',
  'F079', 'F080', 'F081', 'F082', 'F083', 'F084', 'F085', 'F086', 'F087', 'F088', 'F089', 'F090', 'F091', 'F092', 'F096', 'F195', 'F235', 'F236', 'F269', 'F028', 'F029', 'F030', 'F031',
  'F006', 'F008', 'F009', 'F012', 'F013', 'F014', 'F015', 'F019', 'F020', 'F021', 'F022', 'F023', 'F025', 'F027', 'F034', 'F035', 'F036', 'F042', 'F043', 'F254', 'F255', 'F256']);

export function buildFile1301(o: ReturnOutputs, ctx: { client: Client; draft: ReturnDraft; savedOn: string; software?: string }): File1301 {
  const { client } = ctx;
  const issues: string[] = [], notInFile: string[] = [];
  const assumptions = [
    'קידוד העברית: Windows-1255, סדר לוגי — המפרט אינו מגדיר; לאמת מול שע״ם לפני שידור',
    'סוף רשומה: CRLF — המפרט אינו מגדיר',
    'פרטי המסייע (שדות 50–56) — ממולאים בשידור, לא כאן',
  ];
  const by = o.byPerson ?? {};
  const married = client.familyStatus === 'married';
  const h: Record<number, string> = {};
  const set = (seq: number, v: unknown) => { if (v !== undefined && v !== null && v !== '') h[seq] = String(v); };
  const firstEmployer = (spouse: boolean) => (client.employers ?? []).filter(e => !!(e as { belongsToSpouse?: boolean }).belongsToSpouse === spouse).map(e => e.name).filter(Boolean)[0];
  const ph = phone(client.landlinePhone), mob = phone(client.phone), sph = phone(client.spousePhone ?? client.spouse?.phone);
  // ── כותרת ──
  set(4, digits(txt(o, 'F055'))); set(5, o.taxYear);
  set(6, Object.values(ctx.draft.books ?? {}).some(b => b.answers.basedOnBooks === true) ? '1' : '0');
  const turnoverOver = flag(o, 'F054');
  const x6111 = o.formCoverage?.rows.find(r => r.id === 'X6111')?.value;
  set(8, turnoverOver || x6111 !== undefined ? (x6111 === true || o.unsupported.some(u => /6111/.test(u.text)) ? '5' : '6') : '0');
  set(10, digits(txt(o, 'F057'))); set(11, txt(o, 'F058')); set(12, txt(o, 'F059')); set(13, txt(o, 'F060')); set(14, ymd(txt(o, 'F061')));
  set(15, ph.pre); set(16, ph.num);
  set(19, txt(o, 'F079')); set(20, txt(o, 'F080')); set(21, txt(o, 'F081')); set(22, digits(txt(o, 'F083'))); set(23, digits(txt(o, 'F084'))); set(24, firstEmployer(false));
  if (married) { set(25, digits(txt(o, 'F062'))); set(26, txt(o, 'F063')); set(27, txt(o, 'F064')); set(28, txt(o, 'F065')); set(29, ymd(txt(o, 'F066'))); }
  set(30, mob.pre); set(31, mob.num);
  if (married) { set(32, sph.pre); set(33, sph.num); set(34, txt(o, 'F086')); set(37, digits(txt(o, 'F090'))); set(38, digits(txt(o, 'F091'))); }
  set(39, married ? firstEmployer(true) : (client.employers ?? []).map(e => e.name).filter(Boolean)[1]);
  set(42, txt(o, 'F072'));
  set(57, FAMILY[client.familyStatus]);
  const relR = o.fields.find(f => f.code === 'F238' && f.person === 'client')?.text, relS = o.fields.find(f => f.code === 'F238' && f.person === 'spouse')?.text;
  if (relR && digits(relR).length >= 5) { const d = digits(relR).padStart(6, '0'); set(58, d.slice(2)); set(59, d.slice(0, 2)); }
  if (relS && digits(relS).length >= 5) { const d = digits(relS).padStart(6, '0'); set(60, d.slice(2)); set(61, d.slice(0, 2)); }
  set(62, flag(o, 'F001') ? '1' : '2');
  if (flag(o, 'F003')) set(63, '1');
  if (flag(o, 'F004')) set(64, '1'); else if (flag(o, 'F005')) set(64, '2');
  if (flag(o, 'F007') === false && married && o.persons.length > 1) set(65, '1');
  if (flag(o, 'F016')) set(66, '1');
  if (flag(o, 'F017')) set(68, '1');
  set(69, yn(flag(o, 'F040'))); set(70, yn(flag(o, 'F041')));
  set(72, digits(txt(o, 'F048'))); set(73, txt(o, 'F049'));
  const dbl = txt(o, 'F051'); if (dbl) set(74, /כפול|double|1/.test(dbl) ? '1' : '2');
  set(75, yn(flag(o, 'F052')));
  if (flag(o, 'F046')) set(77, '1');
  if (flag(o, 'F047')) set(78, '1');
  const sumBy = (k: 'salaryWithheld' | 'otherWithheld' | 'interestWithheld' | 'advances' | 'forms106') => (p: Person) => by[p]?.[k] ?? 0;
  set(90, (sumBy('forms106')('client') + sumBy('forms106')('spouse')) || '');
  set(91, sumBy('salaryWithheld')('client') || ''); set(92, sumBy('salaryWithheld')('spouse') || '');
  const other = sumBy('otherWithheld')('client') + sumBy('otherWithheld')('spouse');
  if (other) { set(93, 1); assumptions.push('מספר אישורי ניכוי במקור (שדה 93) — 1 כשיש ניכוי מהכנסות אחרות; לעדכן לפי האישורים בפועל'); }
  set(94, sumBy('otherWithheld')('client') || ''); set(95, sumBy('otherWithheld')('spouse') || '');
  if (sumBy('interestWithheld')('client')) { set(96, 1); set(97, sumBy('interestWithheld')('client')); }
  set(101, sumBy('advances')('client') || ''); set(102, sumBy('advances')('spouse') || '');
  set(108, txt(o, 'F096'));
  set(110, '2'); set(111, '2');
  set(112, txt(o, 'F235')); set(113, txt(o, 'F236'));
  if (flag(o, 'F195')) set(114, '1');
  set(115, (ctx.software ?? 'PIVO').slice(0, 15)); set(116, dmy(ctx.savedOn));
  if ([flag(o, 'F028'), flag(o, 'F029'), flag(o, 'F030'), flag(o, 'F031')].every(v => v === false)) set(117, '3');
  set(118, '2'); set(119, '2');
  if (flag(o, 'F039') === false) set(128, '2');
  set(132, txt(o, 'F269') || '1');
  set(134, '1');
  set(135, yn(flag(o, 'F044'))); set(139, yn(flag(o, 'F045')));
  if (flag(o, 'F024')) set(137, '1');
  set(142, yn(flag(o, 'F018')));
  if (flag(o, 'F032')) set(151, '1');
  if (married) set(158, '1');
  set(159, yn(flag(o, 'F026')));
  if (flag(o, 'F033')) set(165, '1');
  const don = [flag(o, 'F008'), flag(o, 'F009')]; if (don.some(v => v !== undefined)) set(166, don.some(v => v) ? '1' : '2');
  set(167, yn(flag(o, 'F037'))); set(168, yn(flag(o, 'F038')));
  if (flag(o, 'F050')) { set(146, '1'); assumptions.push('סימון עוסק פטור (שדה 146) — ערכי הסימון לא מודפסים במפרט; נכתב 1'); }

  // ── אזור קוד-סכום ──
  const codes: { code: string; value: string }[] = [];
  const pushCode = (code: string, value: string) => {
    const cs = CODE_SPEC.get(code);
    if (!cs) { issues.push(`קוד ${code} אינו במפרט`); return; }
    if (codes.some(c => c.code === code)) { issues.push(`קוד ${code} כפול`); return; }
    codes.push({ code, value });
  };
  const codeFor = (f: ReturnField): string | undefined => {
    if (/^\d{3}$/.test(f.code)) return f.code;
    return undefined;
  };
  for (const f of o.fields) {
    const c = codeFor(f);
    if (!c) { if (!IN_HEADER.has(f.code) && !CHILD_GROUPS.some(g => g.ids.includes(f.code)) && !/^F(19[3-9]|23[0-9]|24[0-2]|26[8-9]|27[0-9]|28[0-9]|290)$/.test(f.code)) notInFile.push(`${f.code} ${f.label.slice(0, 40)}`); continue; }
    if (f.kind === 'amount') pushCode(c, String(Math.round(Math.max(0, f.amount ?? 0))));
    else if (f.kind === 'checkbox') pushCode(c, c === '233' || c === '234' ? '2' : '1');
    else pushCode(c, digits(f.text));
  }
  // שורות מהתיק — לפי מזהה הקטלוג → קוד הטופס לפי האדם
  const catCode = (id: string, person: Person | 'joint'): string | undefined => {
    const m: Record<string, [string, string]> = { F193: ['020', ''], F194: ['021', ''], F195: ['025', ''], F230: ['026', ''], F232: ['029', '129'], F234: ['023', '131'],
      F237: ['295', '296'], F238: ['224', '324'], F239: ['024', '124'], F268: ['331', ''], F270: ['255', ''], F271: ['263', ''], F272: ['365', ''], F277: ['307', ''], F279: ['034', ''], F281: ['107', ''] };
    const x = m[id]; if (!x) return undefined;
    return person === 'spouse' ? x[1] || undefined : x[0];
  };
  for (const f of o.fields) {
    if (/^\d{3}$/.test(f.code)) continue;
    const c = catCode(f.code, f.person);
    if (!c) continue;
    const v = f.kind === 'checkbox' ? (f.checked ? '1' : '') : digits(f.text);
    if (!v) continue;
    pushCode(c, f.code === 'F238' ? v.padStart(6, '0') : v);
  }
  // ילדים לפי גיל: אפס מוביל + 6 זוגות — 18; 6–17; 4–5; 3; 1–2; נולדו בשנה
  for (const g of CHILD_GROUPS) {
    const counts = g.ids.map(id => Number(o.fields.find(f => f.code === id)?.text ?? 0));
    if (counts.every(n => !n)) continue;
    pushCode(g.code, '0' + [5, 4, 3, 2, 1, 0].map(i => String(Math.min(99, counts[i])).padStart(2, '0')).join(''));
  }
  // תואר: שנת סיום (4) + קוד (2) + שנת סיום התמחות (4, אפסים)
  for (const p of ['client', 'spouse'] as Person[]) {
    const code = o.fields.find(f => f.code === 'F240' && f.person === p)?.text, year = o.fields.find(f => f.code === 'F241' && f.person === p)?.text;
    if (code && year) pushCode(p === 'client' ? '181' : '182', `${digits(year).slice(0, 4)}${digits(code).padStart(2, '0')}0000`);
  }
  // חשבון בנק להחזר: 277 + 278 נלקחים רק כש-280 = 1
  const acc = txt(o, 'F093'), bank = txt(o, 'F094');
  if (acc && bank) { pushCode('280', '1'); pushCode('277', digits(acc)); pushCode('278', digits(bank)); }
  if (o.fields.some(f => f.code === 'F010' && f.checked)) notInFile.push('F010 «בעל עסק זעיר» — אין שדה בכותרת; עובר בקוד 255');

  // ── הרכבה ──
  const pad = (fs: FieldSpec, v: string) => {
    if (fs.type === 'N') {
      const d = v.replace(/\D/g, '');
      if (d !== v) issues.push(`שדה ${fs.seq} (${fs.name}) — ערך לא נומרי «${v}»`);
      if (d.length > fs.length) { issues.push(`שדה ${fs.seq} (${fs.name}) — ארוך מדי`); return d.slice(-fs.length); }
      return d.padStart(fs.length, '0');
    }
    if (v.length > fs.length) { issues.push(`שדה ${fs.seq} (${fs.name}) — נקטע ל-${fs.length} תווים`); return v.slice(0, fs.length); }
    return v.padStart(fs.length, ' ');
  };
  const header = (rec: RecordSpec, vals: Record<number, string>) => rec.fields.filter(f => !rec.codeAmount || f.start < rec.codeAmount.start).map(f => {
    if (f.seq === 1) return rec === R1000 ? '1301' : '1301';
    if (f.seq === 2) return rec.type.padStart(4, '0');
    return pad(f, vals[f.seq] ?? '');
  }).join('');
  if (codes.length > R1000.codeAmount!.maxFilledCodes) issues.push(`${codes.length} קודים — מעל ${R1000.codeAmount!.maxFilledCodes} שהמפרט מתיר`);
  const area = codes.map(c => {
    const cs = CODE_SPEC.get(c.code)!;
    const max = cs.length === 13 && !/\d+ ספרות|DDMMYYYY|YYYY|אפס מוביל|פוזיצי/.test(cs.notes ?? '') ? 9 : cs.length;
    if (c.value.length > max) issues.push(`קוד ${c.code} — ${c.value.length} ספרות (מותר ${max})`);
    return c.code + c.value.slice(-cs.length).padStart(cs.length, '0');
  }).join('');
  if (area.length > R1000.codeAmount!.length) issues.push('אזור הקוד-סכום חורג מ-2048 תווים');
  const rec1000 = header(R1000, h) + area.padEnd(R1000.codeAmount!.length, '0').slice(0, R1000.codeAmount!.length);
  const rec9999 = header(R9999, { 4: '1', 5: '0', 6: '0', 8: '0', 9: '0' });
  if (rec1000.length !== R1000.length) issues.push(`רשומה 1000 באורך ${rec1000.length} במקום ${R1000.length}`);
  if (rec9999.length !== R9999.length) issues.push(`רשומה 9999 באורך ${rec9999.length} במקום ${R9999.length}`);
  const records = [rec1000, rec9999];
  return { records, text: records.join('\r\n') + '\r\n', header: h, codes, assumptions, notInFile, issues };
}

/** קריאה בחזרה לפי המפרט — כותרת לפי שדה, ואזור הקוד-סכום לפי אורכי הקודים. */
export function parseFile1301(text: string): { header: Record<number, string>; codes: { code: string; value: string }[]; problems: string[] } {
  const problems: string[] = [];
  const recs = text.split('\r\n').filter(Boolean);
  const r = recs.find(x => x.slice(4, 8) === '1000');
  if (!r) return { header: {}, codes: [], problems: ['אין רשומה 1000'] };
  if (r.length !== R1000.length) problems.push(`רשומה 1000 באורך ${r.length}`);
  const close = recs.find(x => x.slice(4, 8) === '9999');
  if (!close) problems.push('אין רשומת סגירה 9999'); else if (close.length !== R9999.length) problems.push(`רשומה 9999 באורך ${close.length}`);
  const header: Record<number, string> = {};
  for (const f of R1000.fields) {
    if (f.start >= R1000.codeAmount!.start) continue;
    const raw = r.slice(f.start - 1, f.start - 1 + f.length);
    if (f.type === 'N' && /\D/.test(raw)) problems.push(`שדה ${f.seq} (${f.name}) — תו לא נומרי בשדה נומרי`);
    const v = f.type === 'N' ? raw.replace(/^0+/, '') : raw.trimStart();
    if (v) header[f.seq] = v;
  }
  const area = r.slice(R1000.codeAmount!.start - 1);
  const codes: { code: string; value: string }[] = [];
  let i = 0;
  while (i + 3 <= area.length) {
    const code = area.slice(i, i + 3);
    if (code === '000') break;
    const cs = CODE_SPEC.get(code);
    if (!cs) { problems.push(`קוד לא מוכר באזור הקוד-סכום: ${code} (מקום ${i})`); break; }
    const raw = area.slice(i + 3, i + 3 + cs.length);
    if (/\D/.test(raw)) problems.push(`קוד ${code} — ערך לא נומרי`);
    codes.push({ code, value: raw.replace(/^0+(?=\d)/, '') });
    i += 3 + cs.length;
  }
  if (/[^0]/.test(area.slice(i))) problems.push('אחרי הקוד האחרון יש תווים שאינם אפסים');
  return { header, codes, problems };
}

/** בדיקה: מה שנקרא בחזרה זהה למה שהתכוונו לכתוב, ומבנה תקין. */
export function verifyFile1301(built: File1301): string[] {
  const back = parseFile1301(built.text);
  const issues = [...built.issues, ...back.problems];
  for (const [seq, v] of Object.entries(built.header)) {
    const fs = R1000.fields.find(f => f.seq === Number(seq))!;
    const want = fs.type === 'N' ? v.replace(/\D/g, '').replace(/^0+/, '') : v.slice(0, fs.length);
    if ((back.header[Number(seq)] ?? '') !== want) issues.push(`כותרת, שדה ${seq} (${fs.name}): נקרא «${back.header[Number(seq)] ?? ''}» במקום «${want}»`);
  }
  for (const c of built.codes) {
    const got = back.codes.find(x => x.code === c.code);
    const want = c.value.replace(/^0+(?=\d)/, '');
    if (!got) issues.push(`קוד ${c.code} — לא נמצא בקריאה חוזרת`);
    else if (got.value !== want) issues.push(`קוד ${c.code}: נקרא ${got.value} במקום ${want}`);
  }
  if (back.codes.length !== built.codes.length) issues.push(`נקראו ${back.codes.length} קודים במקום ${built.codes.length}`);
  return issues;
}

/** קידוד Windows-1255 (הנחה — המפרט אינו מגדיר): ASCII כמו שהוא, אותיות עבריות א–ת ל-0xE0–0xFA. */
export function encodeCp1255(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c < 0x80 ? c : c >= 0x05d0 && c <= 0x05ea ? 0xe0 + (c - 0x05d0) : 0x3f;
  }
  return out;
}
