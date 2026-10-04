// ─── אב-טיפוס: ספרייה · מסלולים · מעקב אצל הלקוח (2.10.2026) ────────────────
// ‼ הדגמה בלבד. שום דבר כאן אינו מחובר למסד, למיילים או לרשויות. המטרה:
// להראות את המודל המוצע על נתונים מדומים, ולבדוק את כלליו בבדיקות יחידה.
// הממצאים והמודל: docs/DESIGN-LIBRARY-FLOWS-2026-10-02.md.
//
// שלושה מושגים, כל אחד מוגדר במקום אחד:
//   ספרייה  — מה אפשר לבקש מהלקוח (בקשות) ומה שולחים לו (מסמכים).
//   מסלול   — מתי ובאיזה סדר: טריגר, שלבים, תנאים, ומה קורה כשהשלב נפתח.
//   ריצה    — המסלול אצל לקוח אחד: מה נפתח, מה נשלח, מה ממתין ולמי.
// פעולות מול רשות אינן בספרייה — הן מוגדרות ב«אוטומציות» ומשובצות במסלול.

export type ClientKind = 'exempt_dealer' | 'licensed_dealer' | 'company' | 'tax_refund' | 'representation_only';

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  exempt_dealer: 'עוסק פטור',
  licensed_dealer: 'עוסק מורשה',
  company: 'חברה',
  tax_refund: 'החזר מס',
  representation_only: 'ייצוג בלבד',
};
export const CLIENT_KINDS: ClientKind[] = ['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only'];

/** עובדות שכבר קיימות במערכת (FACTS ב-journeyDefaults + מצב משפחתי בכרטיס). */
export type FactKey = 'married' | 'has_prev' | 'new_business' | 'monthly' | 'paperless' | 'rep';

export const FACT_LABELS: Record<FactKey, { yes: string; no: string }> = {
  married: { yes: 'נשוי/אה', no: 'לא נשוי/אה' },
  has_prev: { yes: 'מגיע מרו״ח אחר', no: 'בלי רו״ח קודם' },
  new_business: { yes: 'עסק חדש', no: 'עסק קיים' },
  monthly: { yes: 'שירות חודשי בהצעה', no: 'בלי שירות חודשי' },
  paperless: { yes: 'פייפרלס בהצעה', no: 'בלי פייפרלס' },
  rep: { yes: 'ייצוג בהצעה', no: 'בלי ייצוג' },
};
export const FACT_KEYS: FactKey[] = ['married', 'has_prev', 'new_business', 'monthly', 'paperless', 'rep'];

/** תנאי אחד לכל פריט/שלב. ריק = לכולם. סוגים — אחד מהם; עובדות — כולן. */
export interface Condition {
  kinds?: ClientKind[];
  facts?: { key: FactKey; is: boolean }[];
}

export interface DemoClient {
  id: string;
  name: string;
  firstName: string;
  kind: ClientKind;
  facts: Record<FactKey, boolean>;
  spouseName?: string;
  /** null — אין מייל בכרטיס (מדגים כשל שליחה כן). */
  email: string | null;
  spouseEmail?: string | null;
  prevAccountant?: string;
}

// ─── ספרייה ──────────────────────────────────────────────────────────────────

/** מי עושה את העבודה. */
export type Actor = 'client' | 'office' | 'external';

export const ACTOR_LABELS: Record<Actor, string> = {
  client: 'הלקוח',
  office: 'המשרד',
  external: 'גורם חיצוני',
};

export interface ChecklistLine { label: string; when?: Condition }

export interface LibraryRequest {
  id: string;
  shelf: 'request';
  name: string;
  actor: Actor;
  /** מה הלקוח רואה בדף האישי (כותרת, שורה מתחת). */
  clientTitle: string;
  clientSub?: string;
  /** מה מסיים אותה — עם ראיה, לא בלחיצה. */
  doneWhen: string;
  /** לכל אדם במשק הבית: הלקוח, ובן/בת הזוג כשנשוי/אה. */
  perPerson?: boolean;
  /** למי הולכת ההודעה: בעל הכרטיס (בדף האישי), הנושא עצמו (ב״ל), או גורם חיצוני במייל נפרד. */
  notify: 'owner' | 'subject' | 'external';
  /** דורש הכנה שלך לפני שיוצא (מכתב לרו״ח הקודם). */
  needsPrep?: string;
  /** ‼ פעם אחת ללקוח: אם הושלמה כבר — לא נפתחת שוב גם במסלול חדש. */
  once?: boolean;
  checklist?: ChecklistLine[];
  /** מוגדרת במערכת (מנגנון קיים) או בקשה של המשרד. */
  source: 'system' | 'office';
  /** הסוג הקיים במסד היום — כדי שהמודל לא יחדש סוג במקום להשתמש בקיים. */
  realType: string;
  /** מסך פירוט קיים, כשיש. */
  detail?: string;
}

export interface LibraryDocument {
  id: string;
  shelf: 'document';
  name: string;
  fileName: string;
  updated: string;
  realType: string;
}

export type LibraryEntry = LibraryRequest | LibraryDocument;

const DOCS_CHECKLIST: ChecklistLine[] = [
  { label: 'צילום תעודת זהות' },
  { label: 'אישור ניהול חשבון בנק' },
  { label: 'תעודת עוסק', when: { facts: [{ key: 'new_business', is: true }] } },
  { label: 'דוח שנתי אחרון', when: { facts: [{ key: 'has_prev', is: true }] } },
  { label: 'טופסי 106', when: { facts: [{ key: 'has_prev', is: true }] } },
  { label: 'תעודת התאגדות ותקנון', when: { kinds: ['company'] } },
];

export const LIBRARY: LibraryEntry[] = [
  { id: 'rep', shelf: 'request', name: 'בקשת ייצוג', actor: 'client', notify: 'owner', source: 'system', realType: 'representation',
    clientTitle: 'פרטים וחתימה על ייפוי הכוח', clientSub: 'כמה דקות, גם מהטלפון',
    doneWhen: 'הלקוח מילא וחתם. ‼ זו לא הגשה לרשות — ההגשה היא פעולה נפרדת.', once: true, detail: 'מרכז הייצוג' },
  { id: 'docs', shelf: 'request', name: 'מסמכים לפתיחת תיק', actor: 'client', notify: 'owner', source: 'system', realType: 'client_documents',
    clientTitle: 'להעלות מסמכים', doneWhen: 'כל המסמכים ברשימה הועלו', checklist: DOCS_CHECKLIST },
  { id: 'prev_details', shelf: 'request', name: 'פרטי הרו״ח הקודם', actor: 'client', notify: 'owner', source: 'system', realType: 'prev_accountant_details',
    clientTitle: 'פרטי רואה החשבון הקודם שלך', clientSub: 'שם, מייל וטלפון', doneWhen: 'הפרטים נשמרו בכרטיס', once: true },
  { id: 'release', shelf: 'request', name: 'מכתב העברה לרו״ח הקודם', actor: 'external', notify: 'external', source: 'system', realType: 'release_letter',
    clientTitle: 'מכתב לרו״ח הקודם', doneWhen: 'המכתב נשלח והרו״ח הקודם העביר חומרים', needsPrep: 'לעבור על המכתב לפני השליחה', once: true },
  { id: 'tax_status', shelf: 'request', name: 'עדכון סטטוס מס', actor: 'client', notify: 'owner', source: 'system', realType: 'intake_questionnaire',
    clientTitle: 'שאלון קצר על המצב שלך', clientSub: 'עונים רק על מה שרלוונטי', doneWhen: 'השאלון הוגש' },
  { id: 'paperless', shelf: 'request', name: 'הרשמה לפייפרלס', actor: 'client', notify: 'owner', source: 'system', realType: 'paperless_invite',
    clientTitle: 'לפתוח חשבון בפייפרלס', doneWhen: 'הלקוח דיווח שנרשם', once: true },
  { id: 'paperless_connect', shelf: 'request', name: 'חיבור הפייפרלס למשרד', actor: 'office', notify: 'owner', source: 'system', realType: 'paperless_connection',
    clientTitle: 'מחברים את החשבון למשרד', doneWhen: 'סימנת שהחשבון מחובר', once: true },
  { id: 'retainer', shelf: 'request', name: 'הרשאה לתשלום חודשי', actor: 'client', notify: 'owner', source: 'system', realType: 'retainer_authorization',
    clientTitle: 'הרשאה לתשלום החודשי', clientSub: 'בתוך חשבון הפייפרלס', doneWhen: 'ההרשאה אושרה' },
  { id: 'portal_approval', shelf: 'request', name: 'אישור המייצג באזור האישי', actor: 'client', notify: 'owner', source: 'system', realType: 'rep_client_approval',
    clientTitle: 'זירוז אישור הייצוג באזור האישי', clientSub: 'עם מדריך מצולם', doneWhen: 'הלקוח דיווח, ושע״ם הראתה קליטה', once: true },
  { id: 'ni_approval', shelf: 'request', name: 'אישור ייפוי הכוח בביטוח לאומי', actor: 'client', notify: 'subject', perPerson: true, source: 'system', realType: 'authority_representation',
    clientTitle: 'לאשר את ייפוי הכוח בביטוח לאומי', clientSub: 'באתר ב״ל או בטלפון', doneWhen: 'הבדיקה בב״ל מצאה «אושר»', once: true },
  { id: 'withholding', shelf: 'request', name: 'אישורי ניכוי מס במקור', actor: 'client', notify: 'owner', source: 'office', realType: 'custom_request',
    clientTitle: 'אישורי ניכוי מס במקור לשנה', doneWhen: 'הקבצים הועלו' },
  { id: 'annual_docs', shelf: 'request', name: 'מסמכים לדוח השנתי', actor: 'client', notify: 'owner', perPerson: true, source: 'office', realType: 'client_documents',
    clientTitle: 'מסמכים לדוח השנתי', doneWhen: 'כל המסמכים הועלו',
    checklist: [{ label: 'טופסי 106' }, { label: 'אישורי הפקדה לפנסיה' }, { label: 'קבלות על תרומות' }] },
  { id: 'report_sign', shelf: 'request', name: 'אישור וחתימה על הדוח', actor: 'client', notify: 'owner', source: 'office', realType: 'custom_request',
    clientTitle: 'לעבור על הדוח ולאשר', doneWhen: 'הלקוח אישר' },
  { id: 'guide_expenses', shelf: 'document', name: 'מדריך הוצאות מוכרות', fileName: 'הוצאות-מוכרות-2026.pdf', updated: '12.9.2026', realType: 'send_document' },
  { id: 'work_policy', shelf: 'document', name: 'נוהל העבודה במשרד', fileName: 'נוהל-עבודה.pdf', updated: '1.8.2026', realType: 'send_document' },
  { id: 'year_checklist', shelf: 'document', name: 'מה להכין לדוח השנתי', fileName: 'רשימת-דוח-שנתי.pdf', updated: '20.9.2026', realType: 'send_document' },
];

export const libraryEntry = (id: string): LibraryEntry | undefined => LIBRARY.find(e => e.id === id);

/** הדגמה: בקשה חדשה שהמשרד מוסיף לספרייה — זמינה מיד לכל המסלולים. */
export function registerLibraryEntry(e: LibraryEntry) {
  if (!LIBRARY.some(x => x.id === e.id)) LIBRARY.push(e);
}

/** באילו מסלולים ושלבים פריט מהספרייה משמש — «בשימוש ב…». */
export function usages(flows: Flow[], libId: string): { flow: Flow; stage: Stage }[] {
  const out: { flow: Flow; stage: Stage }[] = [];
  for (const f of flows) for (const s of f.stages) if (s.items.some(i => i.ref.kind === 'library' && i.ref.id === libId)) out.push({ flow: f, stage: s });
  return out;
}

// ─── פעולות מול רשות — מוגדרות ב«אוטומציות», משובצות במסלול ─────────────────
// ‼ אותן פעולות כמו ב-features/automation/automationCatalog — במסלול הן תמיד
// «ממתין לך»: פעולה מול רשות דורשת חיבור ואחריות, ואינה רצה מעצמה.

export interface ActionRef { id: string; name: string; perPerson?: boolean; system: 'שע״ם' | 'ביטוח לאומי' }

export const ACTIONS: ActionRef[] = [
  { id: 'shaam-create', name: 'הזנת ייפוי כוח בשע״ם', system: 'שע״ם' },
  { id: 'shaam-submit', name: 'שליחת הטופס החתום לשע״ם', system: 'שע״ם' },
  { id: 'btl-create', name: 'הזנת ייפוי כוח בביטוח לאומי', system: 'ביטוח לאומי', perPerson: true },
  { id: 'shaam-check', name: 'בדיקת קבלת הייצוג בשע״ם', system: 'שע״ם' },
  { id: 'btl-check', name: 'בדיקת קבלת הייצוג בב״ל', system: 'ביטוח לאומי', perPerson: true },
];
export const actionRef = (id: string) => ACTIONS.find(a => a.id === id);

// ─── מסלול ───────────────────────────────────────────────────────────────────

export type TriggerId = 'quote_approved' | 'manual' | 'rep_active';

/** רק אירועים שקיימים במערכת היום. */
export const TRIGGERS: Record<TriggerId, { label: string; real: string }> = {
  quote_approved: { label: 'הלקוח אישר הצעת מחיר', real: 'approve_quotation' },
  manual: { label: 'מפעילים מכרטיס הלקוח', real: '«＋ בקשה חדשה» ← מסלול' },
  rep_active: { label: 'הייצוג נקלט ברשויות', real: 'representation_requests → active' },
};

export type StageStart =
  | { kind: 'flow_start' }
  | { kind: 'after_stage'; stageId: string }
  | { kind: 'after_item'; itemUid: string };

/**
 * איך השלב מגיע ללקוח — ארבע אפשרויות ולא שני מתגים, כדי שלא יהיה צירוף
 * בלתי אפשרי («מייל אוטומטי» על משהו שעוד לא מופיע בדף).
 */
export type Delivery = 'auto' | 'publish_then_me' | 'me_first' | 'page_only';

export const DELIVERY_LABELS: Record<Delivery, { short: string; long: string }> = {
  auto: { short: 'לבד', long: 'מופיע בדף ונשלח מייל מרוכז — לבד' },
  publish_then_me: { short: 'מייל באישורך', long: 'מופיע בדף מיד; את המייל המרוכז אתה שולח' },
  me_first: { short: 'הכול באישורך', long: 'מופיע בדף ונשלח רק אחרי שתאשר' },
  page_only: { short: 'רק בדף', long: 'מופיע בדף, בלי מייל' },
};
export const DELIVERIES: Delivery[] = ['publish_then_me', 'auto', 'me_first', 'page_only'];

export type ItemRef =
  | { kind: 'library'; id: string }
  | { kind: 'action'; id: string }
  | { kind: 'task'; title: string };

export interface StageItem {
  uid: string;
  ref: ItemRef;
  when?: Condition;
  /** רשות — לא חוסם את סיום השלב. */
  optional?: boolean;
}

export interface Stage {
  id: string;
  name: string;
  start: StageStart;
  when?: Condition;
  items: StageItem[];
  delivery: Delivery;
  /** תזכורת מרוכזת ללקוח על מה שעוד פתוח. null — בלי. */
  reminderDays: number | null;
  /** הודעה אליך כשהשלב הושלם. */
  notifyOfficeOnDone: boolean;
}

export interface Flow {
  id: string;
  name: string;
  trigger: TriggerId;
  version: number;
  stages: Stage[];
}

const ALL_REP: Condition = { facts: [{ key: 'rep', is: true }] };

export const DEMO_FLOWS: Flow[] = [
  {
    id: 'onboarding', name: 'קליטת לקוח חדש', trigger: 'quote_approved', version: 1,
    stages: [
      { id: 's1', name: 'פתיחה', start: { kind: 'flow_start' }, delivery: 'publish_then_me', reminderDays: 5, notifyOfficeOnDone: true,
        items: [
          { uid: 'i-rep', ref: { kind: 'library', id: 'rep' }, when: ALL_REP },
          { uid: 'i-docs', ref: { kind: 'library', id: 'docs' } },
          { uid: 'i-prev', ref: { kind: 'library', id: 'prev_details' }, when: { facts: [{ key: 'has_prev', is: true }] } },
          { uid: 'i-tax', ref: { kind: 'library', id: 'tax_status' }, when: { kinds: ['exempt_dealer', 'licensed_dealer', 'tax_refund'] } },
          { uid: 'i-guide', ref: { kind: 'library', id: 'guide_expenses' }, when: { kinds: ['exempt_dealer', 'licensed_dealer'] }, optional: true },
        ] },
      { id: 's2', name: 'מול הרשויות', start: { kind: 'after_item', itemUid: 'i-rep' }, when: ALL_REP, delivery: 'page_only', reminderDays: null, notifyOfficeOnDone: false,
        items: [
          { uid: 'i-shaam', ref: { kind: 'action', id: 'shaam-create' } },
          { uid: 'i-btl', ref: { kind: 'action', id: 'btl-create' } },
        ] },
      { id: 's3', name: 'אישורי הלקוח ברשויות', start: { kind: 'after_stage', stageId: 's2' }, when: ALL_REP, delivery: 'auto', reminderDays: 3, notifyOfficeOnDone: true,
        items: [
          { uid: 'i-portal', ref: { kind: 'library', id: 'portal_approval' }, optional: true },
          { uid: 'i-ni', ref: { kind: 'library', id: 'ni_approval' } },
        ] },
      { id: 's4', name: 'פייפרלס', start: { kind: 'flow_start' }, when: { facts: [{ key: 'paperless', is: true }] }, delivery: 'publish_then_me', reminderDays: 5, notifyOfficeOnDone: false,
        items: [
          { uid: 'i-pl', ref: { kind: 'library', id: 'paperless' } },
        ] },
      { id: 's5', name: 'חיבור ותשלום חודשי', start: { kind: 'after_stage', stageId: 's4' }, when: { facts: [{ key: 'paperless', is: true }] }, delivery: 'auto', reminderDays: null, notifyOfficeOnDone: true,
        items: [
          { uid: 'i-plc', ref: { kind: 'library', id: 'paperless_connect' } },
          { uid: 'i-ret', ref: { kind: 'library', id: 'retainer' }, when: { facts: [{ key: 'monthly', is: true }] } },
        ] },
      { id: 's6', name: 'מעבר מהרו״ח הקודם', start: { kind: 'after_item', itemUid: 'i-prev' }, when: { facts: [{ key: 'has_prev', is: true }] }, delivery: 'page_only', reminderDays: null, notifyOfficeOnDone: true,
        items: [
          { uid: 'i-release', ref: { kind: 'library', id: 'release' } },
        ] },
    ],
  },
  {
    id: 'annual', name: 'דוח שנתי', trigger: 'manual', version: 1,
    stages: [
      { id: 'a1', name: 'איסוף', start: { kind: 'flow_start' }, delivery: 'publish_then_me', reminderDays: 7, notifyOfficeOnDone: true,
        items: [
          { uid: 'a-q', ref: { kind: 'library', id: 'tax_status' } },
          { uid: 'a-docs', ref: { kind: 'library', id: 'annual_docs' } },
          { uid: 'a-wh', ref: { kind: 'library', id: 'withholding' }, when: { kinds: ['licensed_dealer', 'company'] }, optional: true },
          { uid: 'a-list', ref: { kind: 'library', id: 'year_checklist' } },
        ] },
      { id: 'a2', name: 'הכנת הדוח', start: { kind: 'after_stage', stageId: 'a1' }, delivery: 'page_only', reminderDays: null, notifyOfficeOnDone: false,
        items: [{ uid: 'a-prep', ref: { kind: 'task', title: 'הכנת הדוח ובדיקה' } }] },
      { id: 'a3', name: 'אישור הלקוח', start: { kind: 'after_stage', stageId: 'a2' }, delivery: 'auto', reminderDays: 3, notifyOfficeOnDone: true,
        items: [{ uid: 'a-sign', ref: { kind: 'library', id: 'report_sign' } }] },
    ],
  },
];

export const DEMO_CLIENTS: DemoClient[] = [
  { id: 'c-dana', name: 'דנה לוי', firstName: 'דנה', kind: 'exempt_dealer', email: 'dana@example.com',
    facts: { married: false, has_prev: false, new_business: true, monthly: false, paperless: false, rep: true } },
  { id: 'c-alpha', name: 'אלפא שיווק בע״מ', firstName: 'יוסי', kind: 'company', email: 'yossi@alpha.example',
    prevAccountant: 'רו״ח מיכאל שמש',
    facts: { married: false, has_prev: true, new_business: false, monthly: true, paperless: true, rep: true } },
  { id: 'c-cohen', name: 'דוד ורונית כהן', firstName: 'דוד', kind: 'licensed_dealer', email: 'david@example.com',
    spouseName: 'רונית', spouseEmail: 'ronit@example.com', prevAccountant: 'רו״ח אורנה בר',
    facts: { married: true, has_prev: true, new_business: false, monthly: true, paperless: true, rep: true } },
];

// ─── תנאים ───────────────────────────────────────────────────────────────────

export function matches(cond: Condition | undefined, client: DemoClient): boolean {
  if (!cond) return true;
  if (cond.kinds?.length && !cond.kinds.includes(client.kind)) return false;
  for (const f of cond.facts ?? []) if (client.facts[f.key] !== f.is) return false;
  return true;
}

/** «רק: עוסק מורשה · חברה» / «מגיע מרו״ח אחר» — צ'יפים קצרים, בלי תחביר. */
export function conditionChips(cond: Condition | undefined): string[] {
  if (!cond) return [];
  const out: string[] = [];
  if (cond.kinds?.length) out.push(cond.kinds.map(k => CLIENT_KIND_LABELS[k]).join(' · '));
  for (const f of cond.facts ?? []) out.push(f.is ? FACT_LABELS[f.key].yes : FACT_LABELS[f.key].no);
  return out;
}

/** למה הפריט לא חל על הלקוח — הצ'יפ הראשון שלא מתקיים. */
export function whyNot(cond: Condition | undefined, client: DemoClient): string | null {
  if (!cond) return null;
  if (cond.kinds?.length && !cond.kinds.includes(client.kind)) return `רק ל${cond.kinds.map(k => CLIENT_KIND_LABELS[k]).join(' · ')}`;
  for (const f of cond.facts ?? []) if (client.facts[f.key] !== f.is) return `רק כש${f.is ? FACT_LABELS[f.key].yes : FACT_LABELS[f.key].no}`;
  return null;
}

export function itemName(ref: ItemRef): string {
  if (ref.kind === 'library') return libraryEntry(ref.id)?.name ?? ref.id;
  if (ref.kind === 'action') return actionRef(ref.id)?.name ?? ref.id;
  return ref.title;
}

/** מי פועל בפריט — כדי שיהיה ברור מה ממתין למי. */
export function itemActor(ref: ItemRef): Actor | 'document' | 'action' {
  if (ref.kind === 'action') return 'action';
  if (ref.kind === 'task') return 'office';
  const e = libraryEntry(ref.id);
  if (!e) return 'office';
  return e.shelf === 'document' ? 'document' : e.actor;
}

export function persons(client: DemoClient): { role: 'client' | 'spouse'; name: string }[] {
  return client.facts.married && client.spouseName
    ? [{ role: 'client', name: client.firstName }, { role: 'spouse', name: client.spouseName }]
    : [{ role: 'client', name: client.firstName }];
}

export function isPerPerson(ref: ItemRef): boolean {
  if (ref.kind === 'library') { const e = libraryEntry(ref.id); return e?.shelf === 'request' && !!e.perPerson; }
  if (ref.kind === 'action') return !!actionRef(ref.id)?.perPerson;
  return false;
}

/** איך השלב נפתח — משפט אחד. */
export function startLabel(start: StageStart, flow: Flow): string {
  if (start.kind === 'flow_start') return 'מיד כשהמסלול מתחיל';
  if (start.kind === 'after_stage') {
    const s = flow.stages.find(x => x.id === start.stageId);
    return `אחרי ש«${s?.name ?? '?'}» הושלם`;
  }
  const item = flow.stages.flatMap(s => s.items).find(i => i.uid === start.itemUid);
  return `אחרי ש«${item ? itemName(item.ref) : '?'}» הושלמה`;
}

/** אילו שלבים מתחילים יחד — לסימון «במקביל» בבונה. */
export function parallelWith(stage: Stage, flow: Flow): string[] {
  return flow.stages
    .filter(s => s.id !== stage.id && JSON.stringify(s.start) === JSON.stringify(stage.start))
    .map(s => s.name);
}

/** הוספת שורת רשימה לפי תנאי — לרשימות מסמכים. */
export function checklistFor(entry: LibraryRequest, client: DemoClient): string[] {
  return (entry.checklist ?? []).filter(l => matches(l.when, client)).map(l => l.label);
}
