// ─── בדיקת יישור לפני פרסום מיפוי — רצה בדפדפן, על הטופס האמיתי ─────────────────
// אותם תרחישים ואותם ספים כמו scripts/test-smart-form-6101.mjs: ממלאים את הטופס בטיוטת
// המיפוי, מרנדרים (‎1/6 נק'), ומודדים את הדיו מול הטופס הריק. ובנוסף — מול הגיאומטריה
// המודפסת: כל ✗ במרכז ריבוע מודפס, כל קו כתיבה על הקו המודפס, כל תא ספרה על משבצת מודפסת.
// ‼ שדה שלא נבדק כאן לא «עובר» — כל בעיה נרשמת לשדה שלה, והפרסום נחסם עד שאין אף אחת.

import type { DrawOp, FieldDef, LayoutResult, PdfRect, SmartFormTemplate } from './types';
import { loadPdf } from '../../utils/pdfRender';
import { resolve6101 } from './btl6101/resolve';
import { layout6101 } from './btl6101/layout6101';
import { FX_CLIENTS } from './btl6101/fixtures';
import { loadBtl6101Template, measure6101 } from './btl6101/document';
import { exportSmartForm } from './exportPdf';
import { dataUrlToBytes, SIGNATURE_PAD_PX, trimSignature } from './signatureImage';
import { detectCells, detectLine, detectSquare, lumFromRgba, type Lum } from './printedGeometry';
import type { Btl6101Data, Btl6101Purpose } from './btl6101/model';

export const AUDIT_LIMITS = {
  digitDx: 0.3, digitDy: 0.9, checkD: 0.35, textClear: 0.3, textCenterDx: 0.5, textPadErr: 1.0,
  sigLine: 0.35, sigAspect: 0.03, lineClear: 0.2,
  printedSquare: 0.35, printedLine: 0.25, printedCells: 0.35, outsideTol: 2.5,
};
const AS = 6;
const INK = 40;   // הפרש בהירות שנחשב דיו (≈ 120 בסכום RGB, כמו בבדיקה)

export interface AuditProblem { fieldId: string; message: string }
export interface MappingAudit {
  passed: boolean;
  version: number;
  draftUpdatedAt: string;
  checkedAt: string;
  summary: { fields: number; targets: number; scenarios: number; problems: number };
  problems: AuditProblem[];
}

interface Scenario { name: string; client: keyof typeof FX_CLIENTS; purposes: Btl6101Purpose[]; entered: Record<string, unknown>; flags: Record<string, boolean>; sign: ('client' | 'spouse')[]; occExtra?: Record<number, Record<string, string>> }
const AS_OF = '2026-09-28';
/** אותם תרחישים כמו בבדיקה החזותית — יחד הם מפעילים כל שדה בטופס. */
const SCENARIOS: Scenario[] = [
  { name: 'דיווח עיסוקים', client: 'full', purposes: ['multi_year_report', 'update_details'], entered: { maritalSinceMonth: '08', declarationDate: AS_OF }, flags: {}, sign: ['client'] },
  { name: 'התחלה + בן/בת זוג + עובדים', client: 'full', purposes: ['start', 'spouse_in_business', 'stop_employees'],
    entered: { startDate: '2026-10-01', hoursBand: '20_plus', monthlyIncome: '9500', spouseFromDate: '2026-10-01', spouseSharePct: '25', spouseWeeklyHours: '12',
      stopEmployeesDate: '2026-08-31', declarationDate: AS_OF, refuseDigital: true, altContactLastName: 'אלמוג', altContactFirstName: 'עידו', altContactIdNumber: '3456787' },
    flags: { contactNotOwn: true }, sign: ['client', 'spouse'] },
  { name: 'שינוי', client: 'full', purposes: ['change'], entered: { hoursBefore: '12', changeToDate: '2026-07-01', hoursAfter: '25', incomeAfter: '14800', declarationDate: AS_OF }, flags: {}, sign: ['client'] },
  { name: 'הפסקה + מען', client: 'full', purposes: ['end'],
    entered: { endDate: '2026-08-31', currentOccupation: 'שכירה', currentOccupationFrom: '2026-09-01', declarationDate: AS_OF,
      mailRecipient: 'נועה אלמוג', mailStreet: 'ת.ד. 4521', mailCity: 'תל אביב - יפו', mailZip: '6104502' },
    flags: { separateMailing: true }, sign: ['client'] },
  { name: 'טבלה ארוכה', client: 'long', purposes: ['multi_year_report'], entered: { declarationDate: AS_OF }, flags: {}, sign: ['client'],
    occExtra: { 1: { nonWorkIncome: '3200', nonWorkIncomeBasis: 'monthly', nonWorkSource: 'דמי אבטלה — המוסד לביטוח לאומי' } } },
];

type Target =
  | { kind: 'digit'; id: string; page: number; rect: PdfRect }
  | { kind: 'check'; id: string; page: number; rect: PdfRect }
  | { kind: 'text'; id: string; page: number; rect: PdfRect; align: 'right' | 'left' | 'center'; pad: number; line?: number }
  | { kind: 'signature'; id: string; page: number; rect: PdfRect; line?: number; aspect: number };

function targetsFor(lay: LayoutResult, t: SmartFormTemplate, sigAspect: Record<string, number>): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const byId = new Map(t.fields.map(f => [f.id, f]));
  for (const op of lay.ops as DrawOp[]) {
    if (op.kind === 'appendix') continue;
    const f = byId.get(op.fieldId);
    if (!f) continue;
    if (op.kind === 'check') out.push({ kind: 'check', id: op.fieldId, page: op.page, rect: op.box });
    else if (op.kind === 'signature') {
      if (sigAspect[op.signer]) out.push({ kind: 'signature', id: op.fieldId, page: op.page, rect: op.box, line: op.line, aspect: sigAspect[op.signer] });
    } else if (op.kind === 'text' && f.kind === 'digits' && f.cells) {
      const c = f.cells.findIndex((x, i) => i < f.cells!.length - 1 && op.x > x && op.x < f.cells![i + 1]);
      if (c >= 0) out.push({ kind: 'digit', id: op.fieldId, page: op.page, rect: { x: f.cells[c], y: f.box.y, w: f.cells[c + 1] - f.cells[c], h: f.box.h } });
    } else if (op.kind === 'text' && !seen.has(op.fieldId)) {
      seen.add(op.fieldId);
      out.push({ kind: 'text', id: op.fieldId, page: op.page, rect: f.box, align: f.align ?? 'right', pad: f.box.h >= 14 ? 2.5 : 1, line: f.line });
    }
  }
  return out;
}

/** רינדור עמודים לבהירות בסקאלה 6 — גם לבדיקה וגם להצמדה בעריכה. */
export async function renderLums(bytes: Uint8Array, pages: number[]): Promise<Map<number, Lum>> {
  const pdf = await loadPdf(bytes);
  const out = new Map<number, Lum>();
  try {
    for (const n of pages) {
      const p = await pdf.doc.getPage(n);
      const vp = p.getViewport({ scale: AS });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      await p.render({ canvasContext: g, viewport: vp, canvas: c } as unknown as Parameters<typeof p.render>[0]).promise;
      out.set(n, lumFromRgba(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, AS, vp.height / AS));
      c.width = 0; c.height = 0;
    }
  } finally { void pdf.doc.destroy(); }
  return out;
}

/** תיבת הדיו (בנק') בתוך rect±1.5, מהשוואת המלא לריק. */
function inkBox(a: Lum, b: Lum, rect: PdfRect) {
  const m = 1.5;
  const x0 = Math.max(0, Math.floor((rect.x - m) * AS)), x1 = Math.min(a.w, Math.ceil((rect.x + rect.w + m) * AS));
  const y0 = Math.max(0, Math.floor((a.pageH - rect.y - rect.h - m) * AS)), y1 = Math.min(a.h, Math.ceil((a.pageH - rect.y + m) * AS));
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const k = y * a.w + x;
    if (Math.abs(a.d[k] - b.d[k]) < INK) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  return { left: minX / AS, right: (maxX + 1) / AS, top: a.pageH - minY / AS, bottom: a.pageH - (maxY + 1) / AS };
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** חפיפות שקיימות כבר בבסיס (שדות חלופיים כמו מייל שלם/מפוצל) — מותרות. */
function overlapPairs(t: SmartFormTemplate): Set<string> {
  const s = new Set<string>();
  const fs = t.fields;
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
    const a = fs[i], b = fs[j];
    if (a.page !== b.page) continue;
    const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
    const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
    if (w > 0.5 && h > 0.5) s.add([a.id, b.id].sort().join('|'));
  }
  return s;
}

/** גבולות ומבנה — בלי רינדור. */
function structural(t: SmartFormTemplate, base: SmartFormTemplate, push: (id: string, m: string) => void) {
  const allowed = overlapPairs(base);
  for (const f of t.fields) {
    const { x, y, w, h } = f.box;
    if (x < 0 || y < 0 || x + w > t.pageSize.width || y + h > t.pageSize.height) push(f.id, 'השדה יוצא מגבולות העמוד');
    if (w < 1 || h < 1) push(f.id, 'השדה קטן מדי');
    if (f.cells) {
      if (f.cells[0] < x - 0.5 || f.cells[f.cells.length - 1] > x + w + 0.5) push(f.id, 'תאי הספרות יוצאים מהשדה');
    }
    if (f.line != null && (f.line < y - 3 || f.line > y + h)) push(f.id, 'קו הכתיבה רחוק מתחתית השדה');
  }
  for (const pair of overlapPairs(t)) {
    if (allowed.has(pair)) continue;
    const [a, b] = pair.split('|');
    const lb = t.fields.find(f => f.id === b)?.label ?? b;
    push(a, `חופף לשדה «${lb}»`);
  }
}

/** מול הטופס המודפס: ריבועים, קווי כתיבה ותאי ספרות. */
function printed(t: SmartFormTemplate, blank: Map<number, Lum>, push: (id: string, m: string) => void) {
  for (const f of t.fields as FieldDef[]) {
    const l = blank.get(f.page);
    if (!l) continue;
    if (f.kind === 'checkbox') {
      const sq = detectSquare(l, f.box);
      if (!sq) { push(f.id, 'לא נמצא ריבוע סימון מודפס סביב השדה'); continue; }
      const d = Math.hypot(f.box.x + f.box.w / 2 - (sq.x + sq.w / 2), f.box.y + f.box.h / 2 - (sq.y + sq.h / 2));
      if (d > AUDIT_LIMITS.printedSquare) push(f.id, `ה-✗ לא ממורכז בריבוע המודפס (סטייה ${f2(d)} נק')`);
    }
    if (f.line != null) {
      const top = detectLine(l, f.box, f.line);
      if (top == null) push(f.id, 'לא נמצא קו כתיבה מודפס מתחת לשדה');
      else if (Math.abs(top - f.line) > AUDIT_LIMITS.printedLine) push(f.id, `קו הכתיבה המודפס ב-${f2(top)}, בשדה רשום ${f2(f.line)}`);
    }
    if (f.cells) {
      const got = detectCells(l, f.box, f.cells);
      if (!got) push(f.id, 'תאי הספרות לא נמצאו על המשבצות המודפסות');
      else {
        const d = Math.max(...got.map((x, i) => Math.abs(x - f.cells![i])));
        if (d > AUDIT_LIMITS.printedCells) push(f.id, `תאי הספרות זזים מהמשבצות המודפסות (עד ${f2(d)} נק')`);
      }
    }
  }
}

async function syntheticSignatures(): Promise<Record<'client' | 'spouse', { png: Uint8Array; aspect: number }>> {
  const draw = (seed: number) => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 180;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 180);
    g.strokeStyle = '#111827'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(260, 120);
    for (let i = 0; i < 9; i++) g.bezierCurveTo(280 + i * 38, 40 + ((i * seed) % 5) * 12, 300 + i * 38, 150 - ((i + seed) % 4) * 14, 320 + i * 38, 110);
    g.stroke(); g.beginPath(); g.moveTo(250, 135); g.lineTo(640, 128); g.stroke();
    return c.toDataURL('image/png');
  };
  const out = {} as Record<'client' | 'spouse', { png: Uint8Array; aspect: number }>;
  for (const [role, seed] of [['client', 3], ['spouse', 7]] as const) {
    const t = await trimSignature(draw(seed));
    out[role] = { png: dataUrlToBytes(t.dataUrl), aspect: (t.width - 2 * SIGNATURE_PAD_PX) / (t.height - 2 * SIGNATURE_PAD_PX) };
  }
  return out;
}

export async function auditMapping(
  template: SmartFormTemplate, base: SmartFormTemplate, draft: { version: number; updatedAt: string },
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<MappingAudit> {
  const problems: AuditProblem[] = [];
  const push = (fieldId: string, message: string) => {
    if (!problems.some(p => p.fieldId === fieldId && p.message === message)) problems.push({ fieldId, message });
  };
  const pages = Array.from({ length: template.pageCount }, (_, i) => i + 1);
  const total = 2 + SCENARIOS.length;
  let step = 0;
  const tick = (label: string) => onProgress?.(++step, total, label);

  structural(template, base, push);
  const templateBytes = await loadBtl6101Template();
  const blank = await renderLums(templateBytes, pages);
  printed(template, blank, push);
  tick('הטופס המודפס');

  const measure = await measure6101();
  const sigs = await syntheticSignatures();
  tick('חתימות לדוגמה');
  let targetCount = 0;

  for (const sc of SCENARIOS) {
    const client = FX_CLIENTS[sc.client];
    let r = resolve6101({ client, purposes: sc.purposes, entered: sc.entered as Partial<Btl6101Data>, asOf: AS_OF, flags: sc.flags });
    if (sc.occExtra) {
      const occ = r.data.occupations.map((o, i) => ({ ...o, ...(sc.occExtra![i] ?? {}) }));
      r = resolve6101({ client, purposes: sc.purposes, entered: { ...(sc.entered as Partial<Btl6101Data>), occupations: occ }, asOf: AS_OF, flags: sc.flags });
    }
    const lay = layout6101(r.data, sc.purposes, measure, template);
    for (const i of lay.issues) push(i.fieldId, `בתרחיש «${sc.name}»: ${i.message}`);
    const sigBytes = Object.fromEntries(sc.sign.map(s => [s, sigs[s].png]));
    const bytes = await exportSmartForm(templateBytes, template, lay, { signatures: sigBytes });
    const filled = await renderLums(bytes, pages);
    const byId = new Map(template.fields.map(f => [f.id, f]));
    const active = [...new Set(lay.ops.filter(o => o.kind !== 'appendix').map(o => (o as { fieldId: string }).fieldId))]
      .map(id => byId.get(id)).filter((f): f is FieldDef => !!f);

    // ‼ שום סימן מחוץ לשדות הפעילים (במרווח הנשך של הגופן)
    for (const n of pages) {
      const a = filled.get(n)!, b = blank.get(n)!;
      const mine = active.filter(f => f.page === n).map(f => f.box);
      const tol = AUDIT_LIMITS.outsideTol;
      let outside = 0; let at: [number, number] | null = null;
      for (let y = 0; y < a.h; y += 1) for (let x = 0; x < a.w; x += 1) {
        const k = y * a.w + x;
        if (Math.abs(a.d[k] - b.d[k]) < INK) continue;
        const px = x / AS, py = a.pageH - y / AS;
        if (mine.some(m => px >= m.x - tol && px <= m.x + m.w + tol && py >= m.y - tol && py <= m.y + m.h + tol)) continue;
        outside++; if (!at) at = [px, py];
      }
      if (outside > 0) {
        const near = at ? template.fields.filter(f => f.page === n)
          .sort((p, q) => Math.hypot(p.box.x + p.box.w / 2 - at![0], p.box.y + p.box.h / 2 - at![1]) - Math.hypot(q.box.x + q.box.w / 2 - at![0], q.box.y + q.box.h / 2 - at![1]))[0] : undefined;
        push(near?.id ?? `p${n}`, `בתרחיש «${sc.name}»: ${outside} פיקסלים צוירו מחוץ לשדות בעמוד ${n}`);
      }
    }

    // ‼ כל רכיב מול הגיאומטריה שלו — אותם ספים כמו בבדיקה החזותית
    const targets = targetsFor(lay, template, { client: sigs.client.aspect, spouse: sigs.spouse.aspect });
    targetCount += targets.length;
    for (const tg of targets) {
      const a = filled.get(tg.page), b = blank.get(tg.page);
      if (!a || !b) continue;
      const k = inkBox(a, b, tg.rect);
      if (!k) { push(tg.id, `בתרחיש «${sc.name}»: לא צויר דבר בשדה`); continue; }
      const cx = (k.left + k.right) / 2, cy = (k.top + k.bottom) / 2;
      const rcx = tg.rect.x + tg.rect.w / 2, rcy = tg.rect.y + tg.rect.h / 2;
      if (tg.kind === 'digit') {
        if (Math.abs(cx - rcx) > AUDIT_LIMITS.digitDx || Math.abs(cy - rcy) > AUDIT_LIMITS.digitDy) push(tg.id, `ספרה לא במרכז התא (${f2(cx - rcx)}, ${f2(cy - rcy)} נק')`);
      } else if (tg.kind === 'check') {
        if (Math.hypot(cx - rcx, cy - rcy) > AUDIT_LIMITS.checkD) push(tg.id, `ה-✗ לא במרכז השדה (${f2(Math.hypot(cx - rcx, cy - rcy))} נק')`);
      } else if (tg.kind === 'text') {
        const clear = Math.min(k.left - tg.rect.x, tg.rect.x + tg.rect.w - k.right, tg.line != null ? 99 : k.bottom - tg.rect.y, tg.rect.y + tg.rect.h - k.top);
        if (clear < AUDIT_LIMITS.textClear) push(tg.id, `הטקסט נוגע בקצה השדה (${f2(clear)} נק')`);
        if (tg.line != null && k.bottom - tg.line < AUDIT_LIMITS.lineClear) push(tg.id, `הטקסט נוגע בקו הכתיבה (${f2(k.bottom - tg.line)} נק')`);
        const dx = tg.align === 'center' ? cx - rcx : tg.align === 'right' ? (tg.rect.x + tg.rect.w - k.right) - tg.pad : (k.left - tg.rect.x) - tg.pad;
        if (Math.abs(dx) > (tg.align === 'center' ? AUDIT_LIMITS.textCenterDx : AUDIT_LIMITS.textPadErr)) push(tg.id, `יישור אופקי זז (${f2(dx)} נק')`);
      } else {
        const bottom = tg.line != null ? k.bottom - (tg.line + 0.5) : k.bottom - tg.rect.y;
        const aErr = Math.abs((k.right - k.left) / (k.top - k.bottom) / tg.aspect - 1);
        if (Math.abs(bottom) > AUDIT_LIMITS.sigLine) push(tg.id, `החתימה לא נחה על הקו (${f2(bottom)} נק')`);
        if (aErr > AUDIT_LIMITS.sigAspect) push(tg.id, `החתימה מעוותת (${f2(aErr * 100)}%)`);
        if (k.top > tg.rect.y + tg.rect.h + 0.2) push(tg.id, 'החתימה יוצאת מראש השדה');
      }
    }
    tick(sc.name);
  }

  return {
    passed: problems.length === 0,
    version: draft.version,
    draftUpdatedAt: draft.updatedAt,
    checkedAt: new Date().toISOString(),
    summary: { fields: template.fields.length, targets: targetCount, scenarios: SCENARIOS.length, problems: problems.length },
    problems,
  };
}
