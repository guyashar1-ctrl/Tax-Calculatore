// ─── «צפייה» — מה לראות בכל סוג בקשה ─────────────────────────────────────────
// רשומה לכל סוג/מקור: אילו צירי מצב יש, אילו מיילים ומסמכים קשורים, איזה מסך נפתח, ואיפה עורכים.
// ‼ אין כאן טקסט שהלקוח רואה: רק בחירת מצבים ומפתחות. הטקסט נבנה בשרת באותו קוד של הדף (222).
//    שמות הצירים והאפשרויות הם טקסט של המשרד (התפריט שמעל הדף), לא של הלקוח.
// ‼ בדיקת הכיסוי (__tests__/registry.test.ts): סוג חדש בלי רשומה — נופל. `Record<OnboardingStepType, …>` נאכף גם בקומפילציה.

import type { OnboardingStepType } from '../../types/onboarding';
import { DEBIT_INSTITUTION_ORDER, paperlessTaxAuthorityPayload } from '../../types/onboarding';
import { buildBankDebitPayload } from '../../lib/bankDebitRequest';
import { buildSendDocumentsPayload } from '../../lib/sendDocuments';
import { GROUP_ORDER, REQUEST_GROUPS, type RequestGroupKey } from '../requests/requestGroups';
import { PAPERLESS_SEQUENCE } from '../../lib/paperlessSequence';
import type { PreviewRequest, PreviewSample, PreviewStepStatus } from './types';
import { CATALOG_TYPES, type CatalogType, type PreviewTarget, type Selection } from './targets';

// ─── מבנה הרשומה ────────────────────────────────────────────────────────────

/** מה הלקוח רואה: כרטיס בדף · שורה שקטה של המשרד · כלום · מסך נפרד דרך קישור. */
export type ClientSees = 'page' | 'officeLine' | 'nothing' | 'separateLink';
export type MailKey =
  | 'portalLink' | 'portalReminder' | 'documentsSent' | 'repOnboard' | 'repSign' | 'repNiApprove' | 'repActive'
  | 'repPrerequisites' | 'releaseLetter';
export type DocKind = 'officeFile' | 'clientUpload' | 'generatedPoa' | 'generatedRelease' | 'smartForm' | 'clientFile';
/** המסך הנפרד שהכפתור פותח — ?onboard= · ?sign= · ?release= · ?intake= · ?sign-form=. */
export type LinkedKey = 'onboard' | 'sign' | 'release' | 'intake' | 'signForm';
export type EditHint =
  | { kind: 'editor' }
  | { kind: 'emails'; focus: string; label: string }
  | { kind: 'rules'; label: string }
  | { kind: 'docsShelf' }
  | { kind: 'addDialog' }
  | { kind: 'none'; why: string };

export interface EntryMeta {
  clientSees: ClientSees;
  /** מה זה אומר כשהלקוח רואה פחות מבקשה מלאה («שורה שקטה», «כלום»). */
  why?: string;
  mails: MailKey[];
  docs: DocKind[];
  linked?: LinkedKey;
  editAt: EditHint;
}

export interface AxisOption { key: string; label: string }
export interface AxisDef { key: string; label: string; options: AxisOption[] }

export interface TargetView {
  meta: EntryMeta;
  /** ‼ הצירים תלויים בבחירה: «חתימת בן/בת הזוג» רק לזוג; «זירוז/חובה» רק מרגע ההגשה. */
  axes(sel: Selection): AxisDef[];
  defaults: Selection;
  build(sel: Selection): PreviewRequest;
  /** משפטים מעל הדף — הסבר של המשרד, בלי נתוני לקוח. */
  notes(sel: Selection): string[];
}

/** מיילים קשורים — למה כל אחד יוצא, ואיפה עורכים את הנוסח («מיילים», focus). */
export const MAIL_INFO: Record<MailKey, { title: string; when: string; focus: string; external?: boolean }> = {
  portalLink: { title: 'המייל שמפנה לדף', when: 'יוצא כשלוחצים «שלח מייל…» בכרטיס הלקוח, או לבד אם כלל הפתיחה מוגדר כך', focus: 'tpl:process_open' },
  portalReminder: { title: 'תזכורת לדף האישי', when: 'יוצאת לבד כשבקשה ממתינה ללקוח זמן ארוך', focus: 'tpl:portal_reminder' },
  documentsSent: { title: 'שלחנו לך מסמך', when: 'יוצא כשמסמך נשלח ללקוח', focus: 'tpl:documents_sent' },
  repOnboard: { title: 'בקשת ייצוג — מילוי פרטים', when: 'כשפותחים בקשת ייצוג ושולחים ללקוח', focus: 'rep:onboard' },
  repSign: { title: 'חתימה על ייפוי הכוח', when: 'כשייפוי הכוח מוכן לחתימה', focus: 'rep:sign' },
  repNiApprove: { title: 'אישור הייצוג בביטוח לאומי', when: 'כשההוראות לא נכנסו למייל החתימה', focus: 'rep:ni_approve' },
  repActive: { title: 'הייצוג פעיל', when: 'בלחיצה שלך, כשהייצוג אושר', focus: 'rep:active' },
  repPrerequisites: { title: 'השלמת פרטים חסרים', when: 'כשביטוח לאומי דורש פרטים שאין בכרטיס', focus: 'rep:prerequisites' },
  releaseLetter: { title: 'מכתב העברת טיפול', when: 'נשלח לרו״ח הקודם — לא ללקוח', focus: '', external: true },
};

// ─── צירים שחוזרים ──────────────────────────────────────────────────────────

const STATE_LABELS = { waiting: 'ממתין ללקוח', partial: 'התקבל חלק', done: 'הושלם', later: 'בהמשך' } as const;
type StateKey = keyof typeof STATE_LABELS;

const stateAxis = (keys: StateKey[]): AxisDef => ({
  key: 'state', label: 'מצב הבקשה', options: keys.map(k => ({ key: k, label: STATE_LABELS[k] })),
});
const personaAxis: AxisDef = {
  key: 'persona', label: 'לקוח', options: [{ key: 'single', label: 'לקוח יחיד' }, { key: 'couple', label: 'זוג' }],
};

const defaultsOf = (axes: AxisDef[]): Selection => Object.fromEntries(axes.map(a => [a.key, a.options[0].key]));
const pick = (sel: Selection, axis: AxisDef) => (axis.options.some(o => o.key === sel[axis.key]) ? sel[axis.key] : axis.options[0].key);

/** «אחרי מי נפתחת» בדוגמה — שם הבקשה הקודמת הוא קלט (כמו שם הלקוח), כך נראית שורת «בהמשך». */
const AFTER_PREVIOUS = 'הבקשה הקודמת';

/** מצב הבקשה ← סטטוס השלב והשדות שמשתנים בו. */
function stateSample(base: PreviewSample, state: StateKey, listLength: number): PreviewSample {
  switch (state) {
    case 'done': return { ...base, status: 'completed' };
    case 'later': return { ...base, status: 'locked', lockAfter: [AFTER_PREVIOUS] };
    case 'partial': return { ...base, markDone: Math.max(1, Math.min(listLength - 1, Math.ceil(listLength / 2))) };
    default: return base;
  }
}

const stateKeys = (listLength: number, extra: { partial?: boolean; later?: boolean } = {}): StateKey[] => {
  const keys: StateKey[] = ['waiting'];
  if (extra.partial !== false && listLength >= 2) keys.push('partial');
  keys.push('done');
  if (extra.later !== false) keys.push('later');
  return keys;
};

// ─── רשומות לפי סוג השלב ─────────────────────────────────────────────────────
// ‼ Record<OnboardingStepType, …>: סוג חדש ב-OnboardingStepType בלי רשומה כאן — שגיאת קומפילציה.

const internalOnly = (why: string): EntryMeta => ({ clientSees: 'nothing', why, mails: [], docs: [], editAt: { kind: 'none', why } });
const REP_MAILS_EDIT: EditHint = { kind: 'emails', focus: 'rep:onboard', label: 'עריכת הנוסח ב«מיילים»' };

export const STEP_TYPE_META: Record<OnboardingStepType, EntryMeta> = {
  representation: { clientSees: 'page', mails: ['repOnboard', 'repSign', 'repActive'], docs: ['generatedPoa'], linked: 'onboard', editAt: REP_MAILS_EDIT },
  representation_upgrade: internalOnly('שדרוג לייצוג ראשי — משימה פנימית של המשרד, הלקוח לא רואה אותה'),
  rep_client_approval: {
    clientSees: 'page', mails: ['portalReminder'], docs: [],
    editAt: { kind: 'emails', focus: 'rep:portal', label: 'עריכת הנוסח ב«מיילים»' },
  },
  file_opening: {
    clientSees: 'officeLine', why: 'הלקוח רואה שורה שקטה — «בטיפולנו», בלי פעולה', mails: [], docs: [],
    editAt: { kind: 'rules', label: 'מתי נפתחת?' },
  },
  release_letter: {
    clientSees: 'officeLine', why: 'הלקוח רואה שורה אחת — «קבלת החומרים מרואה החשבון הקודם». המכתב עצמו יוצא לרו״ח הקודם, לא ללקוח',
    mails: ['releaseLetter'], docs: ['generatedRelease'], linked: 'release',
    editAt: { kind: 'emails', focus: '', label: 'עריכת המכתב ב«מיילים»' },
  },
  materials_received: {
    clientSees: 'officeLine', why: 'מקופלת לאותה שורה של «קבלת החומרים מרואה החשבון הקודם»', mails: [], docs: [],
    editAt: { kind: 'rules', label: 'מתי נפתחת?' },
  },
  paperless_invite: { clientSees: 'page', mails: ['portalLink'], docs: [], editAt: { kind: 'rules', label: 'מתי נפתחת?' } },
  paperless_connection: {
    clientSees: 'officeLine', why: 'הפעולה היא של המשרד — הלקוח רואה «בטיפול המשרד», בלי פעולה', mails: [], docs: [],
    editAt: { kind: 'rules', label: 'מתי נפתחת?' },
  },
  paperless_tax_authority: { clientSees: 'page', mails: ['portalLink'], docs: [], editAt: { kind: 'rules', label: 'מתי נפתחת?' } },
  business_details: { clientSees: 'page', mails: ['portalLink'], docs: [], editAt: { kind: 'rules', label: 'מתי נפתחת?' } },
  data_import: internalOnly('עבודה פנימית של המשרד — הלקוח לא רואה אותה'),
  data_verification: internalOnly('עבודה פנימית של המשרד — הלקוח לא רואה אותה'),
  retainer_authorization: {
    clientSees: 'page', why: 'ההזנה עצמה בפייפרלס — בדף הלקוח רואה הסבר, בלי פקד', mails: ['portalLink'], docs: [],
    editAt: { kind: 'rules', label: 'מתי נפתחת?' },
  },
  internal_setup: internalOnly('הקמה פנימית של המשרד — הלקוח לא רואה אותה'),
  kyc_identification: internalOnly('זיהוי לקוח במשרד — הלקוח לא רואה אותו'),
  first_month_review: internalOnly('ביקורת חודש ראשון — משימה פנימית של המשרד'),
  intake_questionnaire: {
    clientSees: 'separateLink', why: 'בדף כרטיס עם «להמשך» — השאלון עצמו נפתח במסך נפרד', mails: ['portalLink'], docs: [], linked: 'intake',
    editAt: { kind: 'rules', label: 'מתי נפתחת?' },
  },
  client_documents: { clientSees: 'page', mails: ['portalLink'], docs: ['clientUpload'], editAt: { kind: 'editor' } },
  prev_accountant_details: { clientSees: 'page', mails: ['portalLink'], docs: [], editAt: { kind: 'editor' } },
  custom_request: { clientSees: 'page', mails: ['portalLink'], docs: ['officeFile', 'clientUpload'], editAt: { kind: 'editor' } },
  institution_alignment_btl: internalOnly('יישור קו מול הרשות — עבודה של המשרד'),
  institution_alignment_vat: internalOnly('יישור קו מול הרשות — עבודה של המשרד'),
  institution_alignment_income: internalOnly('יישור קו מול הרשות — עבודה של המשרד'),
  opening_call: internalOnly('שיחת פתיחה — משימה פנימית של המשרד'),
  authority_representation: {
    clientSees: 'page', why: 'בטיפולנו — ובשלב אישור הלקוח הודעה עם אסמכתה וקישור לאתר ביטוח לאומי', mails: ['repNiApprove'], docs: [],
    editAt: { kind: 'emails', focus: 'rep:ni_approve', label: 'עריכת הנוסח ב«מיילים»' },
  },
};

/** פריטי הקטלוג שב«＋ בקשה חדשה» — מקור אחד: ADD_REQUEST_CATALOG ב-AddRequestDialog (בדיקת הכיסוי משווה). */
export const CATALOG_META: Record<CatalogType, EntryMeta> = {
  bank_debit: { clientSees: 'page', mails: ['portalLink'], docs: ['clientUpload'], editAt: { kind: 'addDialog' } },
  send_document: { clientSees: 'page', why: 'שורה לכל קובץ תחת «מסמכים מהמשרד»', mails: ['documentsSent'], docs: ['officeFile', 'clientFile'], editAt: { kind: 'addDialog' } },
  client_documents: STEP_TYPE_META.client_documents,
  prev_accountant_track: { ...STEP_TYPE_META.prev_accountant_details, mails: ['portalLink', 'releaseLetter'], docs: ['generatedRelease'], linked: 'release', editAt: { kind: 'addDialog' } },
  paperless_sequence: { clientSees: 'page', mails: ['portalLink'], docs: [], editAt: { kind: 'addDialog' } },
  business_details: STEP_TYPE_META.business_details,
  paperless_tax_authority: STEP_TYPE_META.paperless_tax_authority,
  intake_questionnaire: STEP_TYPE_META.intake_questionnaire,
  authority_representation: STEP_TYPE_META.authority_representation,
  smart_form_btl6101: {
    clientSees: 'separateLink', why: 'לא מופיעה בדף — הלקוח מקבל קישור חתימה אישי לטופס', mails: [], docs: ['smartForm'], linked: 'signForm',
    editAt: { kind: 'none', why: 'הטופס מנוהל בתבנית 6101' },
  },
};

// ─── קבוצות: רגעים בתהליך ────────────────────────────────────────────────────

interface MomentDef { key: string; label: string; coupleOnly?: boolean; samples: (opts: { couple: boolean; account: string; approval: string }) => PreviewSample[]; rep?: PreviewRequest['rep'] }

const sys = (stepType: string, over: Partial<PreviewSample> = {}): PreviewSample =>
  ({ key: over.key ?? stepType, ref: { kind: 'system', stepType }, ...over });
const st = (status: PreviewStepStatus) => ({ status });
const after = (...names: string[]) => ({ status: 'locked' as const, lockAfter: names });

const PAPERLESS_MOMENTS: MomentDef[] = [
  { key: 'start', label: 'בהתחלה', samples: ({ account }) => [
    sys('paperless_invite', { ...st('pending'), inputs: { paperlessStatus: account } }),
    sys('business_details', st('pending')),
    sys('paperless_connection', { ...after('הרשמה לפייפרלס'), patch: { paperlessStatus: account } }),
    sys('retainer_authorization', { ...after('חיבור לפייפרלס'), ball: 'me' }),
    sys('paperless_tax_authority', after('חיבור לפייפרלס')),
  ] },
  { key: 'signed', label: 'אחרי ההרשמה', samples: ({ account }) => [
    sys('paperless_invite', { ...st('completed'), inputs: { paperlessStatus: account } }),
    sys('business_details', st('pending')),
    sys('paperless_connection', { ...st('pending'), ball: 'me', patch: { paperlessStatus: account } }),
    sys('retainer_authorization', { ...after('חיבור לפייפרלס'), ball: 'me' }),
    sys('paperless_tax_authority', after('חיבור לפייפרלס')),
  ] },
  { key: 'setup', label: 'בהקמה אצלנו', samples: ({ account }) => [
    sys('paperless_invite', { ...st('completed'), inputs: { paperlessStatus: account } }),
    sys('business_details', { ...st('in_progress'), ball: 'me' }),
    sys('paperless_connection', { ...st('pending'), ball: 'me', patch: { paperlessStatus: account } }),
    sys('retainer_authorization', { ...st('pending'), ball: 'me', patch: { authorizationCreatedAt: '2026-10-01' } }),
    sys('paperless_tax_authority', after('חיבור לפייפרלס')),
  ] },
  { key: 'done', label: 'הושלם', samples: ({ account }) => [
    sys('paperless_invite', { ...st('completed'), inputs: { paperlessStatus: account } }),
    sys('business_details', st('completed')),
    sys('paperless_connection', { ...st('completed'), ball: 'me', patch: { paperlessStatus: account } }),
    sys('retainer_authorization', { ...st('completed'), ball: 'me' }),
    sys('paperless_tax_authority', st('completed')),
  ] },
];

const PREV_MOMENTS: MomentDef[] = [
  { key: 'start', label: 'בהתחלה', samples: () => [
    sys('prev_accountant_details', { ...st('pending'), inputs: { needsDetails: true } }),
    sys('release_letter', { ...after('פרטי רואה החשבון הקודם'), ball: 'me' }),
    sys('materials_received', { ...after('מכתב העברת טיפול'), ball: 'prev_accountant' }),
  ] },
  { key: 'details', label: 'הפרטים נשלחו', samples: () => [
    sys('prev_accountant_details', st('completed')),
    sys('release_letter', { ...st('pending'), ball: 'me' }),
    sys('materials_received', { ...after('מכתב העברת טיפול'), ball: 'prev_accountant' }),
  ] },
  { key: 'done', label: 'החומרים התקבלו', samples: () => [
    sys('prev_accountant_details', st('completed')),
    sys('release_letter', { ...st('completed'), ball: 'me' }),
    sys('materials_received', { ...st('completed'), ball: 'prev_accountant' }),
  ] },
];

const niTitle = (name: string) => `ייצוג בביטוח לאומי — ${name}`;
const REP_MOMENTS: MomentDef[] = [
  { key: 'fill', label: 'מילוי', rep: { status: 'pending_fill' },
    samples: () => [sys('representation', { ...st('in_progress'), ball: 'me' })] },
  { key: 'sign', label: 'חתימה', rep: { status: 'pending_signature' },
    samples: () => [sys('representation', { ...st('in_progress'), ball: 'me' })] },
  { key: 'spouse', label: 'חתימת בן/בת הזוג', coupleOnly: true, rep: { status: 'pending_signature', spousePending: true },
    samples: () => [sys('representation', { ...st('in_progress'), ball: 'me' })] },
  { key: 'review', label: 'בבדיקה אצלנו', rep: { status: 'awaiting_accountant', signed: true },
    samples: () => [sys('representation', { ...st('in_progress'), ball: 'me' })] },
  { key: 'filed', label: 'הוגש לרשויות', rep: { status: 'awaiting_authorities', niReference: true },
    samples: ({ couple, approval }) => [
      sys('representation', { ...st('in_progress'), ball: 'me' }),
      sys('rep_client_approval', { ...st('pending'), required: approval === 'required' }),
      sys('authority_representation', { key: 'ni-client', ...st('in_progress'), ball: 'me', patch: { title: niTitle('ישראל'), subjectRole: 'client' } }),
      ...(couple ? [sys('authority_representation', { key: 'ni-spouse', ...st('waiting_client'), patch: { title: niTitle('ישראלה'), subjectRole: 'spouse' } })] : []),
      sys('file_opening', { ...st('pending'), ball: 'me' }),
    ] },
  { key: 'active', label: 'פעיל', rep: { status: 'active', niReference: true },
    samples: ({ couple, approval }) => [
      sys('representation', { ...st('completed'), ball: 'me' }),
      sys('rep_client_approval', { ...st('completed'), required: approval === 'required' }),
      sys('authority_representation', { key: 'ni-client', ...st('completed'), ball: 'me', patch: { title: niTitle('ישראל'), subjectRole: 'client' } }),
      ...(couple ? [sys('authority_representation', { key: 'ni-spouse', ...st('completed'), patch: { title: niTitle('ישראלה'), subjectRole: 'spouse' } })] : []),
      sys('file_opening', { ...st('completed'), ball: 'me' }),
    ] },
];

const GROUP_MOMENTS: Record<RequestGroupKey, MomentDef[]> = {
  paperless: PAPERLESS_MOMENTS, prevAccountant: PREV_MOMENTS, representation: REP_MOMENTS,
};

const ACCOUNT_AXIS: AxisDef = {
  key: 'account', label: 'חשבון פייפרלס',
  options: [{ key: 'unknown', label: 'אין חשבון' }, { key: 'self', label: 'יש חשבון' }, { key: 'otherrep', label: 'מייצג קודם' }],
};
const ACCOUNT_VALUE: Record<string, string> = { unknown: 'unknown', self: 'self', otherrep: 'other_rep' };
const DETAILS_AXIS: AxisDef = {
  key: 'details', label: 'פרטי הרו״ח', options: [{ key: 'missing', label: 'חסרים בכרטיס' }, { key: 'known', label: 'יש בכרטיס — לאישור' }],
};
const APPROVAL_AXIS: AxisDef = {
  key: 'approval', label: 'אישור באזור האישי', options: [{ key: 'optional', label: 'זירוז' }, { key: 'required', label: 'רשות המסים ממתינה — חובה' }],
};

function groupView(group: RequestGroupKey): TargetView {
  const g = REQUEST_GROUPS[group];
  const moments = GROUP_MOMENTS[group];
  const momentsFor = (couple: boolean) => moments.filter(m => !m.coupleOnly || couple);
  const momentAxis = (couple: boolean): AxisDef => ({ key: 'moment', label: 'רגע בתהליך', options: momentsFor(couple).map(m => ({ key: m.key, label: m.label })) });
  const isCouple = (sel: Selection) => group === 'representation' && sel.persona === 'couple';
  const axesFor = (sel: Selection): AxisDef[] => {
    const axes: AxisDef[] = [momentAxis(isCouple(sel))];
    if (group === 'paperless') axes.push(ACCOUNT_AXIS);
    if (group === 'prevAccountant') axes.push(DETAILS_AXIS);
    if (group === 'representation') {
      axes.push(personaAxis);
      if (['filed', 'active'].includes(pick(sel, axes[0]))) axes.push(APPROVAL_AXIS);
    }
    return axes;
  };
  const meta: EntryMeta = {
    clientSees: 'page', mails: group === 'representation' ? ['repOnboard', 'repSign', 'repActive', 'portalReminder'] : group === 'prevAccountant' ? ['portalLink', 'releaseLetter'] : ['portalLink'],
    docs: group === 'representation' ? ['generatedPoa'] : group === 'prevAccountant' ? ['generatedRelease'] : [],
    linked: group === 'representation' ? 'onboard' : group === 'prevAccountant' ? 'release' : undefined,
    editAt: { kind: 'rules', label: 'מתי פותחים את הקבוצה?' },
  };
  return {
    meta, axes: axesFor, defaults: defaultsOf(axesFor({})),
    build(sel) {
      const couple = isCouple(sel);
      const m = momentsFor(couple).find(x => x.key === sel.moment) ?? moments[0];
      const approval = group === 'representation' && sel.approval === 'required' ? 'required' : 'optional';
      const account = group === 'paperless' ? ACCOUNT_VALUE[pick(sel, ACCOUNT_AXIS)] : 'unknown';
      const rep = group === 'representation'
        ? { approvals: couple ? 'couple' as const : 'single' as const, ...(approval === 'required' ? { awaiting: couple ? 'spouse' as const : 'client' as const } : {}), ...m.rep }
        : undefined;
      return {
        persona: { couple, prevKnown: group === 'prevAccountant' && pick(sel, DETAILS_AXIS) === 'known' },
        ...(rep ? { rep } : {}),
        samples: m.samples({ couple, account, approval }),
      };
    },
    notes: () => [g.clientSummary],
  };
}

// ─── בקשות בודדות ────────────────────────────────────────────────────────────

const ref = (r: NonNullable<PreviewSample['ref']>): Pick<PreviewSample, 'key' | 'ref'> => ({ key: 'a', ref: r });

function singleView(meta: EntryMeta, axes: AxisDef[], make: (sel: Selection) => PreviewRequest, notes: (sel: Selection) => string[] = () => []): TargetView {
  return { meta, axes: () => axes, defaults: defaultsOf(axes), build: make, notes };
}

function templateView(t: Extract<PreviewTarget, { kind: 'template' }>): TargetView {
  const f = t.facts;
  const base = STEP_TYPE_META[f.stepType as OnboardingStepType] ?? STEP_TYPE_META.custom_request;
  const meta: EntryMeta = f.internal
    ? { clientSees: 'nothing', why: 'משימה של המשרד — לא מופיעה ללקוח', mails: [], docs: [], editAt: { kind: 'editor' } }
    : { ...base, editAt: { kind: 'editor' } };
  if (f.internal || f.messageOnly) {
    return singleView(meta, [], () => ({ samples: [{ ...ref({ kind: 'template', templateId: t.templateId }), status: 'pending' }] }));
  }
  if (f.stepType === 'client_documents') {
    const flowAxis: AxisDef = { key: 'flow', label: 'איפה נפתחת', options: [{ key: 'intake', label: 'בקליטה' }, { key: 'annual', label: 'במסלול שנתי' }] };
    const axes = [stateAxis(stateKeys(f.listLength)), flowAxis];
    return singleView(meta, axes, sel => ({
      samples: [stateSample({ ...ref({ kind: 'template', templateId: t.templateId }), repeatable: pick(sel, flowAxis) === 'annual' },
        pick(sel, axes[0]) as StateKey, f.listLength)],
    }));
  }
  if (f.stepType === 'prev_accountant_details') {
    const axes = [stateAxis(['waiting', 'done', 'later']), DETAILS_AXIS];
    return singleView(meta, axes, sel => ({
      persona: { prevKnown: pick(sel, DETAILS_AXIS) === 'known' },
      samples: [stateSample(ref({ kind: 'template', templateId: t.templateId }), pick(sel, axes[0]) as StateKey, f.listLength)],
    }));
  }
  const axes: AxisDef[] = [stateAxis(stateKeys(f.hasResource ? 2 : f.listLength))];
  if (f.hasConfirm) axes.push(personaAxis);
  return singleView(meta, axes, sel => ({
    persona: { couple: f.hasConfirm && pick(sel, personaAxis) === 'couple' },
    samples: [stateSample(ref({ kind: 'template', templateId: t.templateId }), pick(sel, axes[0]) as StateKey, f.hasResource ? 2 : f.listLength)],
  }), sel => (f.hasConfirm && pick(sel, personaAxis) === 'couple'
    ? ['בן/בת הזוג: אין לו/ה דף משלו — האישור האישי שלו/ה נפתח כמשימה למשרד, והוא לא מופיע בדף של בעל הכרטיס.'] : []));
}

/** מצב של בקשת מערכת — תווית ומה משתנה בדוגמה. ‼ מצבים בלבד (סטטוס, כדור, שדה מצב) — לא טקסט שהלקוח רואה. */
interface StateOption { key: string; label: string; sample: Partial<PreviewSample> }

const DECLARED_AT = '2026-10-05T10:00:00Z';
/** מצבי הסוגים שיש להם יותר מ«ממתין / הושלם / בהמשך» (תוכנית §7). */
const SYSTEM_STATES: Record<string, StateOption[]> = {
  rep_client_approval: [
    { key: 'waiting', label: 'ממתין ללקוח', sample: {} },
    { key: 'declared', label: 'אחרי «אישרתי»', sample: { patch: { clientDeclaredAt: DECLARED_AT } } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed' } },
  ],
  retainer_authorization: [
    { key: 'before', label: 'לפני', sample: { status: 'locked', ball: 'me', lockAfter: ['חיבור לפייפרלס'] } },
    { key: 'card', label: 'נדרש כרטיס', sample: { status: 'pending', ball: 'me', patch: { authorizationCreatedAt: '2026-10-01' } } },
    { key: 'entered', label: 'הכרטיס הוזן', sample: { status: 'pending', ball: 'me', patch: { cardEnteredAt: '2026-10-01' } } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed', ball: 'me' } },
  ],
  business_details: [
    { key: 'waiting', label: 'ממתין ללקוח', sample: {} },
    { key: 'review', label: 'בבדיקה אצלנו', sample: { status: 'in_progress', ball: 'me' } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed' } },
    { key: 'later', label: 'בהמשך', sample: { status: 'locked', lockAfter: ['הרשמה לפייפרלס'] } },
  ],
  paperless_connection: [
    { key: 'later', label: 'בהמשך', sample: { status: 'locked', ball: 'me', lockAfter: ['הרשמה לפייפרלס'] } },
    { key: 'waiting', label: 'בטיפולנו', sample: { status: 'pending', ball: 'me' } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed', ball: 'me' } },
  ],
  release_letter: [
    { key: 'waiting', label: 'בתהליך', sample: { status: 'pending', ball: 'me' } },
    { key: 'done', label: 'התקבלו החומרים', sample: { status: 'completed', ball: 'me' } },
  ],
  materials_received: [
    { key: 'waiting', label: 'בתהליך', sample: { status: 'pending', ball: 'prev_accountant' } },
    { key: 'done', label: 'התקבלו החומרים', sample: { status: 'completed', ball: 'prev_accountant' } },
  ],
  file_opening: [
    { key: 'waiting', label: 'בטיפולנו', sample: { status: 'pending', ball: 'me' } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed', ball: 'me' } },
  ],
  intake_questionnaire: [
    { key: 'waiting', label: 'ממתין ללקוח', sample: { status: 'waiting_client' } },
    { key: 'done', label: 'הושלם', sample: { status: 'completed' } },
    { key: 'later', label: 'בהמשך', sample: { status: 'locked', lockAfter: [AFTER_PREVIOUS] } },
  ],
};

const GENERIC_STATES: StateOption[] = [
  { key: 'waiting', label: STATE_LABELS.waiting, sample: {} },
  { key: 'done', label: STATE_LABELS.done, sample: { status: 'completed' } },
  { key: 'later', label: STATE_LABELS.later, sample: { status: 'locked', lockAfter: [AFTER_PREVIOUS] } },
];

/** בקשת מערכת בודדת — כשהיא נפתחת מתוך «התהליך» או כשורה בספרייה. */
function systemView(stepType: string): TargetView {
  if (stepType === 'authority_representation') return catalogView('authority_representation');
  const meta = STEP_TYPE_META[stepType as OnboardingStepType] ?? STEP_TYPE_META.custom_request;

  if (stepType === 'representation') {
    // «בקשת ייצוג» — הרגע בתהליך (מצב הבקשה אצל הרשות) והאדם: אותם רגעים כמו בקבוצה.
    const moments = REP_MOMENTS;
    const axesFor = (sel: Selection): AxisDef[] => [
      { key: 'moment', label: 'רגע בתהליך', options: moments.filter(m => !m.coupleOnly || sel.persona === 'couple').map(m => ({ key: m.key, label: m.label })) },
      personaAxis,
    ];
    return {
      meta, axes: axesFor, defaults: defaultsOf(axesFor({})),
      build(sel) {
        const couple = sel.persona === 'couple';
        const m = moments.find(x => x.key === sel.moment && (!x.coupleOnly || couple)) ?? moments[0];
        return { persona: { couple }, rep: { approvals: couple ? 'couple' : 'single', ...m.rep },
          samples: [sys('representation', { key: 'a', status: m.key === 'active' ? 'completed' : 'in_progress', ball: 'me' })] };
      },
      notes: () => [],
    };
  }

  const stateOpts = SYSTEM_STATES[stepType] ?? GENERIC_STATES;
  const stateAx: AxisDef = { key: 'state', label: 'מצב הבקשה', options: stateOpts.map(o => ({ key: o.key, label: o.label })) };
  const extra: AxisDef[] = [];
  if (stepType === 'rep_client_approval') extra.push(personaAxis, APPROVAL_AXIS);
  if (stepType === 'paperless_invite' || stepType === 'paperless_connection') extra.push(ACCOUNT_AXIS);
  if (stepType === 'prev_accountant_details') extra.push(DETAILS_AXIS);
  const axes: AxisDef[] = [stateAx, ...extra];
  return singleView(meta, axes, sel => {
    const opt = stateOpts.find(o => o.key === pick(sel, stateAx)) ?? stateOpts[0];
    const couple = stepType === 'rep_client_approval' && pick(sel, personaAxis) === 'couple';
    const required = stepType === 'rep_client_approval' && pick(sel, APPROVAL_AXIS) === 'required';
    let sample: PreviewSample = { ...sys(stepType, { key: 'a' }), ...opt.sample };
    if (stepType === 'rep_client_approval') sample = { ...sample, required };
    if (stepType === 'paperless_invite') sample = { ...sample, inputs: { paperlessStatus: ACCOUNT_VALUE[pick(sel, ACCOUNT_AXIS)] } };
    if (stepType === 'paperless_connection') sample = { ...sample, patch: { ...(sample.patch ?? {}), paperlessStatus: ACCOUNT_VALUE[pick(sel, ACCOUNT_AXIS)] } };
    return {
      persona: { couple, prevKnown: stepType === 'prev_accountant_details' && pick(sel, DETAILS_AXIS) === 'known' },
      ...(stepType === 'rep_client_approval' ? { rep: { status: 'awaiting_authorities' as const, approvals: couple ? 'couple' as const : 'single' as const,
        ...(required ? { awaiting: couple ? 'spouse' as const : 'client' as const } : {}) } } : {}),
      samples: [sample],
    };
  }, sel => (stepType === 'rep_client_approval' && pick(sel, personaAxis) === 'couple'
    ? ['זוג: כל אחד נכנס לאזור האישי שלו ומאשר את הבקשות שעל שמו.'] : []));
}

function docView(target: Extract<PreviewTarget, { kind: 'doc' }>): TargetView {
  const meta: EntryMeta = { clientSees: 'page', mails: ['documentsSent'], docs: ['officeFile'], editAt: { kind: 'docsShelf' } };
  const axes: AxisDef[] = [{ key: 'state', label: 'מצב המסמך', options: [
    { key: 'new', label: 'חדש' }, { key: 'opened', label: 'נפתח' }, { key: 'done', label: 'עברתי עליו' }] }];
  return singleView(meta, axes, sel => {
    const s = pick(sel, axes[0]);
    return { samples: [{ ...ref({ kind: 'document', docId: target.docId }),
      ...(s === 'opened' ? { markDone: 1 } : s === 'done' ? { status: 'completed' as const } : {}) }] };
  });
}

/** כל מה שהקטלוג של «＋ בקשה חדשה» יוצר בדפדפן — אותה פונקציית בנייה כמו ביצירה (D3). */
function catalogView(type: CatalogType): TargetView {
  const meta = CATALOG_META[type];
  const draft = (stepType: string, payload: Record<string, unknown>, extra: Partial<PreviewSample> = {}): PreviewSample =>
    ({ key: 'a', stepType, payload, ...extra });
  switch (type) {
    case 'bank_debit': {
      const axes = [stateAxis(['waiting', 'done'])];
      return singleView(meta, axes, sel => ({ samples: [stateSample(
        draft('custom_request', buildBankDebitPayload([...DEBIT_INSTITUTION_ORDER]) as Record<string, unknown>),
        pick(sel, axes[0]) as StateKey, 0)] }));
    }
    case 'send_document': {
      const axes: AxisDef[] = [{ key: 'state', label: 'מצב', options: [{ key: 'new', label: 'חדש' }, { key: 'opened', label: 'נפתח' }] }];
      return singleView(meta, axes, sel => ({ samples: [draft('custom_request',
        buildSendDocumentsPayload({ resources: [{ key: 'a1', source: 'client', documentId: 'sample', label: 'מסמך לדוגמה', fileName: 'מסמך-לדוגמה.pdf' }], message: '' }),
        pick(sel, axes[0]) === 'opened' ? { markDone: 1 } : {})] }),
      () => ['קובץ מספריית המשרד נפתח כמו שהוא; קובץ מהתיק של הלקוח נפתח רק אצל הלקוח.']);
    }
    case 'client_documents': {
      const axes = [stateAxis(['waiting', 'partial', 'done'])];
      return singleView(meta, axes, sel => ({ samples: [stateSample(
        draft('client_documents', {
          checklist: [{ key: 'd1', label: 'מסמך ראשון', done: false }, { key: 'd2', label: 'מסמך שני', done: false }],
          clientTitle: 'להעלות 2 מסמכים', clientSub: 'מסמך ראשון · מסמך שני', clientCta: 'להעלאה',
        }), pick(sel, axes[0]) as StateKey, 2)] }));
    }
    case 'paperless_sequence': {
      const axes = [stateAxis(['waiting', 'done'])];
      return singleView(meta, axes, sel => ({
        samples: PAPERLESS_SEQUENCE.map((p, i): PreviewSample => {
          const base: PreviewSample = { key: `p${i}`, stepType: p.type, payload: p.payload, owner: p.owner, ball: p.owner === 'me' ? 'me' : 'client',
            ...(i > 0 ? { status: 'locked', lockAfter: [PAPERLESS_SEQUENCE[i - 1].payload.clientTitle as string] } : {}) };
          return pick(sel, axes[0]) === 'done' ? { ...base, status: 'completed', lockAfter: undefined } : base;
        }),
      }));
    }
    case 'paperless_tax_authority': {
      const axes = [stateAxis(['waiting', 'done'])];
      return singleView(meta, axes, sel => ({ samples: [stateSample(
        draft('paperless_tax_authority', paperlessTaxAuthorityPayload()), pick(sel, axes[0]) as StateKey, 0)] }));
    }
    case 'prev_accountant_track': return groupView('prevAccountant');
    case 'business_details': return systemView('business_details');
    case 'intake_questionnaire': return systemView('intake_questionnaire');
    case 'authority_representation': {
      const axes: AxisDef[] = [personaAxis, { key: 'state', label: 'מצב', options: [
        { key: 'office', label: 'בטיפולנו' }, { key: 'client', label: 'ממתין לאישור הלקוח' }, { key: 'done', label: 'אושר' }] }];
      return singleView(meta, axes, sel => {
        const couple = pick(sel, personaAxis) === 'couple';
        const s = pick(sel, axes[1]);
        const status: PreviewStepStatus = s === 'client' ? 'waiting_client' : s === 'done' ? 'completed' : 'in_progress';
        const one = (key: string, name: string, role: 'client' | 'spouse'): PreviewSample => sys('authority_representation',
          { key, status, ball: s === 'client' ? 'client' : 'me', patch: { title: niTitle(name), subjectRole: role } });
        return { persona: { couple }, rep: { status: 'awaiting_authorities', niReference: true },
          samples: [one('ni-client', 'ישראל', 'client'), ...(couple ? [one('ni-spouse', 'ישראלה', 'spouse')] : [])] };
      });
    }
    case 'smart_form_btl6101':
      return singleView(meta, [], () => ({ samples: [draft('data_import', {})] }), () => []);
  }
}

// ─── הכניסה היחידה ───────────────────────────────────────────────────────────

export function viewOf(target: PreviewTarget): TargetView {
  switch (target.kind) {
    case 'template': return templateView(target);
    case 'system': return systemView(target.stepType);
    case 'group': return groupView(target.group);
    case 'doc': return docView(target);
    case 'catalog': return catalogView(target.type);
    case 'draft': {
      const meta = STEP_TYPE_META.custom_request;
      return singleView({ ...meta, editAt: { kind: 'none', why: 'טיוטה בעורך — עוד לא נשמרה' } }, [], () => ({
        samples: [{ key: 'a', stepType: target.stepType, payload: target.payload, owner: target.owner }],
      }));
    }
  }
}

export const REGISTRY_COVERAGE = { catalog: CATALOG_TYPES, groups: GROUP_ORDER };

/**
 * כל הבחירות האפשריות במבט — מכפלת הצירים (הצירים תלויים בבחירה, ולכן מרחיבים ציר אחד בכל פעם).
 * ‼ משמשת את בדיקות הכיסוי ואת לכידת הדוגמאות להדגמה (scripts/capture-request-preview-fixtures.mjs).
 */
export function enumerateSelections(v: TargetView): Selection[] {
  let combos: Selection[] = [{}];
  for (let depth = 0; depth < 5; depth++) {
    const next: Selection[] = [];
    for (const c of combos) {
      const open = v.axes(c).find(a => !(a.key in c));
      if (!open) { next.push(c); continue; }
      for (const o of open.options) next.push({ ...c, [open.key]: o.key });
    }
    combos = next;
  }
  return combos;
}
