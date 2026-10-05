// ─── «צפייה» — מה אפשר לראות, ואיך מגיעים אליו מהכתובת ─────────────────────────
// יעד אחד לכל שורה בספרייה ולכל מקום שבו בוחרים בקשה. הכתובת (focus) נושאת את מה שפתוח, כך שרענון שומר
// ו«אחורה» בטלפון סוגר: `view:<יעד>[@<בחירה>]`.
//   view:template:<id> · view:system:<stepType> · view:group:<key> · view:doc:<docId> · view:catalog:<type>
// הבחירה — צירי המצב: `@state-done.persona-couple` (מפתחות ואפשרויות באותיות קטנות ומספרים בלבד).

import type { RequestGroupKey } from '../requests/requestGroups';
import { GROUP_ORDER } from '../requests/requestGroups';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { entryOf, listOf, ownerOf, payloadOf, systemTypeOf } from '../../components/office/pages/library/libraryModel';

/** מה שהרשימה במקומות «＋ בקשה חדשה» מציעה ושאינו שורה בספרייה. מקור אחד: ADD_REQUEST_CATALOG ב-AddRequestDialog. */
export type CatalogType =
  | 'bank_debit' | 'send_document' | 'client_documents' | 'prev_accountant_track' | 'paperless_sequence'
  | 'business_details' | 'paperless_tax_authority' | 'intake_questionnaire' | 'authority_representation'
  | 'smart_form_btl6101';

export const CATALOG_TYPES: readonly CatalogType[] = [
  'bank_debit', 'send_document', 'client_documents', 'prev_accountant_track', 'paperless_sequence',
  'business_details', 'paperless_tax_authority', 'intake_questionnaire', 'authority_representation', 'smart_form_btl6101',
];

/** עובדות על נוסח בספרייה — מה שצריך כדי לבחור צירים (בלי להעתיק את הנוסח עצמו). */
export interface TemplateFacts {
  stepType: string;
  owner: 'client' | 'me' | 'external';
  /** משימה של המשרד — השרת לא מציג אותה בדף. */
  internal: boolean;
  messageOnly: boolean;
  /** חומר עזר (קובץ/קישור) — הכרטיס נפתח בדף ונסגר בהצהרה. */
  hasResource: boolean;
  listLength: number;
  hasConfirm: boolean;
  /** נוסח מוכן מסוג קבוע (מסמכים מהלקוח, פרטי רו״ח קודם) — הסוג, אחרת null. */
  systemType: string | null;
}

export function templateFacts(t: RequestTemplate): TemplateFacts {
  const e = entryOf(t);
  const p = payloadOf(t);
  const owner = ownerOf(t);
  const messageOnly = p.messageOnly === true || p.messageOnly === 'true';
  const list = listOf(p);
  return {
    stepType: e?.stepType || 'custom_request',
    owner,
    internal: owner === 'me' && !messageOnly,
    messageOnly,
    hasResource: !!(p.clientResource || p.clientLinkUrl || (Array.isArray(p.clientResources) && p.clientResources.length > 0)),
    listLength: list.length,
    hasConfirm: list.some(x => x.kind === 'confirm'),
    systemType: systemTypeOf(t),
  };
}

export type PreviewTarget =
  | { kind: 'template'; templateId: string; name: string; facts: TemplateFacts }
  | { kind: 'system'; stepType: string; name: string }
  | { kind: 'group'; group: RequestGroupKey; name: string }
  | { kind: 'doc'; docId: string; name: string }
  | { kind: 'catalog'; type: CatalogType; name: string }
  /** טיוטה בעורך — לא נשמרה, ולכן לא בכתובת. */
  | { kind: 'draft'; name: string; stepType: string; owner: 'client' | 'me' | 'external'; payload: Record<string, unknown> };

export const targetOfTemplate = (t: RequestTemplate): PreviewTarget =>
  ({ kind: 'template', templateId: t.id, name: t.name, facts: templateFacts(t) });

/** מפתח יציב ליעד — לזיהוי «אותו יעד» (פתוח/סגור, מפתח בדיקות). */
export function targetKey(t: PreviewTarget): string {
  switch (t.kind) {
    case 'template': return `template:${t.templateId}`;
    case 'system': return `system:${t.stepType}`;
    case 'group': return `group:${t.group}`;
    case 'doc': return `doc:${t.docId}`;
    case 'catalog': return `catalog:${t.type}`;
    default: return 'draft';
  }
}

export type Selection = Record<string, string>;

const SEL_RE = /^[a-z0-9]+$/;

export function selectionToText(sel: Selection): string {
  return Object.entries(sel).filter(([k, v]) => SEL_RE.test(k) && SEL_RE.test(v)).map(([k, v]) => `${k}-${v}`).join('.');
}

export function selectionFromText(text: string | undefined): Selection {
  const out: Selection = {};
  for (const part of (text ?? '').split('.')) {
    const [k, v] = part.split('-');
    if (k && v && SEL_RE.test(k) && SEL_RE.test(v)) out[k] = v;
  }
  return out;
}

/** הכתובת של יעד (בלי טיוטה). */
export function targetToFocus(t: PreviewTarget, sel: Selection = {}): string | null {
  if (t.kind === 'draft') return null;
  const s = selectionToText(sel);
  return `view:${targetKey(t)}${s ? `@${s}` : ''}`;
}

export interface ParsedViewFocus { kind: PreviewTarget['kind']; id: string; selection: Selection }

export function parseViewFocus(focus: string | null | undefined): ParsedViewFocus | null {
  const m = /^view:(template|system|group|doc|catalog):([^@]+)(?:@(.*))?$/.exec(focus ?? '');
  if (!m) return null;
  return { kind: m[1] as PreviewTarget['kind'], id: m[2], selection: selectionFromText(m[3]) };
}

export interface TargetSources {
  templates: RequestTemplate[] | null;
  /** מסמכי הספרייה (settings.client_documents). */
  docs: { id: string; label: string }[];
  /** שמות בקשות מערכת לפי סוג (systemName). */
  systemName: (stepType: string) => string;
  groupTitle: (g: RequestGroupKey) => string;
  catalogName: (type: CatalogType) => string;
}

/** הכתובת ← יעד. null: לא נמצא (נמחק מהספרייה) — המסך אומר זאת, לא פותח מגירה ריקה. */
export function resolveFocus(parsed: ParsedViewFocus, src: TargetSources): PreviewTarget | null {
  switch (parsed.kind) {
    case 'template': {
      const t = src.templates?.find(x => x.id === parsed.id || x.overrides?.includes(parsed.id));
      return t ? targetOfTemplate(t) : null;
    }
    case 'system': return { kind: 'system', stepType: parsed.id, name: src.systemName(parsed.id) };
    case 'group': return (GROUP_ORDER as string[]).includes(parsed.id)
      ? { kind: 'group', group: parsed.id as RequestGroupKey, name: src.groupTitle(parsed.id as RequestGroupKey) } : null;
    case 'doc': {
      const d = src.docs.find(x => x.id === parsed.id);
      return d ? { kind: 'doc', docId: d.id, name: d.label } : null;
    }
    case 'catalog': return (CATALOG_TYPES as readonly string[]).includes(parsed.id)
      ? { kind: 'catalog', type: parsed.id as CatalogType, name: src.catalogName(parsed.id as CatalogType) } : null;
    default: return null;
  }
}
