// ─── טפסי הלקוח הרשומים, השאלון הנגזר והציור ───────────────────────────────

import type { FieldDef, LayoutResult, SmartFormTemplate } from '../types';
import type { CfData, CfField, CfScreen, ClientFormDef, ClientFormKey } from './types';
import { ITA4440 } from './ita4440';
import { VAT821 } from './vat821';
import { fieldError } from './format';
import { layoutFields } from '../layout';
import { createMeasure, exportSmartForm } from '../exportPdf';
import { sha256Hex } from '../hash';
import { dataUrlToBytes } from '../signatureImage';
import { applyMapping, type MappingVersion } from '../mappingCore';
import type { MeasureText } from '../types';

export const CLIENT_FORMS: Record<ClientFormKey, ClientFormDef> = { 'ita-4440': ITA4440, 'vat-821': VAT821 };
export const CLIENT_FORM_KEYS = Object.keys(CLIENT_FORMS) as ClientFormKey[];
export const isClientFormKey = (k: unknown): k is ClientFormKey => typeof k === 'string' && k in CLIENT_FORMS;
export const clientFormOf = (k: string): ClientFormDef | null => (isClientFormKey(k) ? CLIENT_FORMS[k] : null);

// ── השאלון ───────────────────────────────────────────────────────────────────
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const present = (v: string | undefined) => !!(v ?? '').trim();
export const screenTitle = (s: CfScreen, d: CfData) => (typeof s.title === 'function' ? s.title(d) : s.title);
export const screenHint = (s: CfScreen, d: CfData) => (typeof s.hint === 'function' ? s.hint(d) : s.hint);
export const fieldVisible = (f: CfField, d: CfData) => (f.showIf ? f.showIf(d) : true);
export const fieldRequired = (f: CfField, d: CfData) => (typeof f.required === 'function' ? f.required(d) : !!f.required);

/** המסך רלוונטי ללקוח הזה (בלי קשר אם כבר ענה). */
export const screenRelevant = (s: CfScreen, d: CfData) => (s.showIf ? s.showIf(d) : true);

/** חסר במסך: שדה גלוי, חובה וריק. */
export function screenMissing(s: CfScreen, d: CfData): CfField[] {
  return s.fields.filter(f => fieldVisible(f, d) && fieldRequired(f, d) && !present(d[f.key]));
}

/**
 * המסכים שהלקוח עובר עליהם: מסך הצהרה (always) תמיד, ומסך של פרטי כרטיס — רק כשחסר בו משהו.
 * ‼ מסך זהות שאין בו חוסר אינו מוצג כלל — זהות לא נערכת מהדף.
 */
export function flowScreens(def: ClientFormDef, d: CfData, answered: Set<string>): CfScreen[] {
  return def.screens.filter(s => !s.officeOnly && screenRelevant(s, d)
    && (screenMissing(s, d).length > 0 || s.always || answered.has(s.id)));
}

/** כל השדות במסך שמותר לערוך בדף (זהות שכבר בכרטיס — לא). */
export function editableFields(s: CfScreen, d: CfData, card: CfData): CfField[] {
  return s.fields.filter(f => fieldVisible(f, d) && !(s.identity && present(card[f.key])));
}

/** בעיות שחוסמות את ההכנה לחתימה — חובה שחסרה או ערך לא תקין, בכל מסך רלוונטי. */
export function blockers(def: ClientFormDef, d: CfData): { screen: CfScreen; field: CfField; message: string }[] {
  const out: { screen: CfScreen; field: CfField; message: string }[] = [];
  for (const s of def.screens) {
    if (!screenRelevant(s, d)) continue;
    for (const f of s.fields) {
      if (!fieldVisible(f, d)) continue;
      const e = fieldError(f, d[f.key], d);
      if (e) out.push({ screen: s, field: f, message: e });
    }
  }
  return out;
}

/** מה נשלח מהמסך: השדות הגלויים שבו + הצעות לשדות נסתרים (כמו שנת המס) + השלמות המסך. */
export function screenValues(s: CfScreen, form: CfData, d: CfData): CfData {
  const merged = { ...d, ...form };
  const out: CfData = {};
  const visible = new Set(s.fields.filter(f => fieldVisible(f, merged)).map(f => f.key));
  for (const f of s.fields) {
    if (visible.has(f.key)) continue;
    if (f.suggest && !present(d[f.key])) {
      const sv = f.suggest(merged);
      if (sv) out[f.key] = sv;
    } else if (f.store === 'filing' && present(d[f.key])) {
      // שדה הגשה שהוסתר (למשל «אחר» שבוטל) — מנוקה, כדי שלא יופיע בטופס
      out[f.key] = '';
    }
  }
  for (const f of s.fields) if (visible.has(f.key)) out[f.key] = str(form[f.key] ?? d[f.key]).trim();
  return s.toSave ? s.toSave(out, merged) : out;
}

// ── ציור ─────────────────────────────────────────────────────────────────────
const templateCache = new Map<string, Promise<Uint8Array>>();
let measureCache: Promise<MeasureText> | null = null;

export function loadTemplateBytes(t: SmartFormTemplate): Promise<Uint8Array> {
  let p = templateCache.get(t.key);
  if (!p) {
    p = (async () => {
      const res = await fetch(t.fileUrl);
      if (!res.ok) throw new Error(`טעינת טופס ${t.formNumber} נכשלה (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (await sha256Hex(bytes) !== t.sha256) throw new Error(`קובץ טופס ${t.formNumber} שבשרת שונה מהקובץ שמופה — המילוי נחסם`);
      return bytes;
    })();
    p.catch(() => templateCache.delete(t.key));
    templateCache.set(t.key, p);
  }
  return p;
}

function measure(): Promise<MeasureText> {
  measureCache ??= createMeasure();
  measureCache.catch(() => { measureCache = null; });
  return measureCache;
}

/** התבנית בגרסת המיפוי שהשרת מסר (בסיס הקוד כשאין תיקונים). */
export function templateFor(def: ClientFormDef, mapping?: MappingVersion | null): SmartFormTemplate {
  return mapping && mapping.version > def.template.mappingVersion ? applyMapping(def.template, mapping) : def.template;
}

export async function layoutClientForm(def: ClientFormDef, d: CfData, template: SmartFormTemplate = def.template): Promise<LayoutResult> {
  const m = await measure();
  const { ops, issues } = layoutFields({
    template, measure: m,
    valueOf: (field: FieldDef) => def.valueOf(field, d),
    isActive: (field: FieldDef) => def.isActive(field, d),
  });
  return { ops, issues, pageCount: template.pageCount };
}

export interface RenderClientFormOpts {
  template?: SmartFormTemplate;
  /** חתימת הלקוח (data URL של PNG אחרי חיתוך). */
  signature?: string | null;
  draftMark?: string;
  title?: string;
  date?: Date;
}

export async function renderClientForm(def: ClientFormDef, d: CfData, opts: RenderClientFormOpts = {}): Promise<{ bytes: Uint8Array; layout: LayoutResult }> {
  const t = opts.template ?? def.template;
  const [bytes0, layout] = await Promise.all([loadTemplateBytes(def.template), layoutClientForm(def, d, t)]);
  const bytes = await exportSmartForm(bytes0, t, layout, {
    signatures: opts.signature ? { client: dataUrlToBytes(opts.signature) } : {},
    draftMark: opts.draftMark,
    meta: { title: opts.title ?? def.template.title, subject: `${def.authorityLabel} · טופס ${t.formNumber}`, keywords: [t.formNumber, t.sha256], date: opts.date },
  });
  return { bytes, layout };
}
