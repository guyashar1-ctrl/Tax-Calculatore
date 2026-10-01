// ─── טופס 6101 בדפדפן: טעינת הקובץ, ייצוא, וצילום לנעילה ────────────────────

import { BTL6101_TEMPLATE } from './template';
import { layout6101 } from './layout6101';
import type { Btl6101Data, Btl6101Purpose } from './model';
import type { ProfessionalConfirmations, Resolve6101Result } from './resolve';
import { createMeasure, exportSmartForm } from '../exportPdf';
import { sha256Hex } from '../hash';
import { dataUrlToBytes } from '../signatureImage';
import type { LayoutResult, MeasureText } from '../types';

let templateCache: Promise<Uint8Array> | null = null;
let measureCache: Promise<MeasureText> | null = null;

/** הקובץ הרשמי הריק. ‼ נבדק מול הטביעה לפני כל שימוש — קובץ אחר אינו ממופה. */
export function loadBtl6101Template(): Promise<Uint8Array> {
  templateCache ??= (async () => {
    const res = await fetch(BTL6101_TEMPLATE.fileUrl);
    if (!res.ok) throw new Error(`טעינת טופס 6101 נכשלה (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = await sha256Hex(bytes);
    if (hash !== BTL6101_TEMPLATE.sha256) throw new Error('קובץ טופס 6101 שבשרת שונה מהקובץ שמופה — המילוי נחסם');
    return bytes;
  })();
  templateCache.catch(() => { templateCache = null; });
  return templateCache;
}

export function measure6101(): Promise<MeasureText> {
  measureCache ??= createMeasure();
  measureCache.catch(() => { measureCache = null; });
  return measureCache;
}

export async function layoutFor(data: Btl6101Data, purposes: readonly Btl6101Purpose[]): Promise<LayoutResult> {
  return layout6101(data, purposes, await measure6101());
}

export interface RenderOpts {
  signatures?: Partial<Record<'client' | 'spouse', string>>;
  draftMark?: string;
  title?: string;
  date?: Date;
}

export async function renderBtl6101(data: Btl6101Data, purposes: readonly Btl6101Purpose[], opts: RenderOpts = {}): Promise<{ bytes: Uint8Array; layout: LayoutResult }> {
  const [template, layout] = await Promise.all([loadBtl6101Template(), layoutFor(data, purposes)]);
  const signatures: Partial<Record<'client' | 'spouse', Uint8Array>> = {};
  for (const [role, url] of Object.entries(opts.signatures ?? {})) {
    if (url) signatures[role as 'client' | 'spouse'] = dataUrlToBytes(url);
  }
  const bytes = await exportSmartForm(template, BTL6101_TEMPLATE, layout, {
    signatures, draftMark: opts.draftMark,
    meta: { title: opts.title ?? 'דין וחשבון רב שנתי (6101)', subject: `ביטוח לאומי · טופס 6101 (${BTL6101_TEMPLATE.version})`, keywords: ['6101', BTL6101_TEMPLATE.sha256], date: opts.date },
  });
  return { bytes, layout };
}

/** תאריך ההצהרה = יום החתימה של המבוטח, לפי שעון ישראל. */
export function israelDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return parts; // YYYY-MM-DD
}

/** מה ננעל לחתימה: הנתונים שעל הטופס + מקור כל שדה + אזהרות שנשארו. */
export function snapshotFor(res: Resolve6101Result, layoutIssues: LayoutResult['issues'], professional: ProfessionalConfirmations = {}) {
  const fields: Record<string, { status: string; source: string; at?: string }> = {};
  for (const [k, f] of Object.entries(res.fields)) {
    if (f.status === 'not_applicable') continue;
    fields[k] = { status: f.status, source: f.sourceLabel, ...(f.sourceAt ? { at: f.sourceAt } : {}) };
  }
  const blockers = [
    ...res.issues.filter(i => i.severity === 'blocker').map(i => i.message),
    ...layoutIssues.map(i => i.message),
  ];
  return {
    data: { ...res.data, declarationDate: '' },
    fields,
    blockers,
    warnings: res.issues.filter(i => i.severity !== 'blocker').map(i => i.message),
    // ‼ נרשמים בשרת בנעילה: האישור המקצועי (עם הסיבה) והאסמכתאות שהשרת יאכוף בהגשה.
    professional,
    requiredAttachments: res.attachments,
    retro: res.retro,
    btl: {
      classification: res.btl.classificationLabel,
      syncedAt: res.btl.syncedAt ?? null,
      declaredIncomeMonthly: res.btl.declaredIncomeMonthly ?? null,
      declaredIncomeYear: res.btl.declaredIncomeYear ?? null,
      // (207) מה ב"ל רשם ברגע הנעילה — ראיה למצב שממנו ביקשו את השינוי
      recorded: res.btl.recorded ?? null,
    },
    template: { key: BTL6101_TEMPLATE.key, version: BTL6101_TEMPLATE.version, sha256: BTL6101_TEMPLATE.sha256, mappingVersion: BTL6101_TEMPLATE.mappingVersion },
  };
}
