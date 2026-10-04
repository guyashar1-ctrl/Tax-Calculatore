// ─── ספרייה · מסלולים · ריצה אצל לקוח ──────────────────────────────────────
// ‼ מסלול אינו מנוע נוסף. הוא מתורגם למה שכבר קיים: שורות onboarding_steps,
// קשתות onboarding_step_dependencies, פרסום (published_at) ושער התהליך,
// והמחולל הקיים במסלול הקליטה. המקור המחייב: docs/PLAN-LIBRARY-FLOWS.md.
//
// שלושה מקומות, כל דבר מוגדר פעם אחת:
//   ספרייה — מה מבקשים מהלקוח (journey_templates kind='request' + בקשות המערכת)
//            ומה שולחים לו (settings.client_documents).
//   מסלול  — office_flows + office_flow_versions: טריגר, שלבים, תנאים, ומה קורה כשהשלב נפתח.
//   ריצה   — flow_runs: המסלול אצל לקוח אחד, בגרסה שבה התחיל.

import type { ClientKind, DefaultVariant, FactKey as JourneyFactKey } from '../../types/journeyDefaults';
import type { InstitutionKey } from '../../types/onboarding';

export type { ClientKind };

/** העובדות שהמחולל יודע לשאול, ועוד מצב משפחתי מהכרטיס. אוצר מילים סגור. */
export type FlowFactKey = JourneyFactKey | 'married';

export type FlowTrigger = 'quote_approved' | 'manual' | 'annual';

/**
 * פעולות מול רשות שמותר לשבץ במסלול — קריאה בלבד. ‼ זהה לרשימה בשרת
 * (flow_auto_action_allowed, 215). הזנה והגשה — רק ממרכז הייצוג.
 */
export const FLOW_ACTION_TYPES = ['shaam.sync_income_tax_file', 'btl.sync_file'] as const;

/** השם והמערכת של כל פעולה — מקום אחד לבונה, לרצועה בכרטיס ולעמוד האוטומציות. */
export const FLOW_ACTIONS: { type: typeof FLOW_ACTION_TYPES[number]; name: string; system: string }[] = [
  { type: 'shaam.sync_income_tax_file', name: 'קריאת תיק מס הכנסה מהשע״ם', system: 'שע״ם' },
  { type: 'btl.sync_file', name: 'קריאת התיק בביטוח לאומי', system: 'ביטוח לאומי' },
];
export const FLOW_ACTION_NAMES: Record<string, string> = Object.fromEntries(FLOW_ACTIONS.map(a => [a.type, a.name]));

/**
 * סוג הפעולה של פריט. ‼ השרת קורא ref.actionType (215); הגדרה ישנה בדפדפן
 * נשאה רק actionId — קוראים את שניהם. '' — לא פעולה.
 */
export function actionTypeOf(ref: { kind: string; actionType?: string; actionId?: string }): string {
  return ref.kind !== 'action' ? '' : (ref.actionType || ref.actionId || '');
}

/**
 * איך שלב מגיע ללקוח — ארבע אפשרויות ולא שני מתגים, כדי שלא ייווצר צירוף
 * בלתי אפשרי («מייל לבד» על משהו שעוד לא מופיע בדף).
 *   approve — מופיע בדף מיד; המייל המרוכז ממתין במגש לשליחה שלך (ברירת המחדל).
 *   auto    — מופיע בדף ומייל מרוכז יוצא לבד.
 *   hold    — שום דבר לא מופיע לפני שאישרת («פרסם בדף»).
 *   page    — מופיע בדף, בלי מייל.
 */
export type Delivery = 'approve' | 'auto' | 'hold' | 'page';

export interface FactCond { key: FlowFactKey; is: boolean }

/** ריק = לכולם. סוגים — אחד מהם; עובדות — כולן. */
export interface When {
  kinds?: ClientKind[];
  facts?: FactCond[];
}

export type Opens =
  | { after: 'start' }
  | { after: 'stage'; stage: string }
  | { after: 'item'; item: string };

export type ItemRef =
  | { kind: 'system'; stepType: string }
  | { kind: 'template'; templateId: string }
  | { kind: 'document'; docId: string }
  /** ‼ השרת קורא actionType (flow_auto_action_allowed); actionId — מזהה בקטלוג האוטומציות. */
  | { kind: 'action'; actionId: string; actionType: string };

export interface FlowItem {
  key: string;
  /**
   * בקשת משרד במסלול הקליטה: המפתח שבו המחולל מזהה בקשה שכבר נוצרה
   * (defaultOrigin.key). ‼ קבוע — שינויו היה יוצר את הבקשה שוב אצל לקוח קיים.
   * חסר = key.
   */
  entryKey?: string;
  ref: ItemRef;
  when?: When;
  /** רשות — לא חוסם את סיום השלב, ולא את סגירת הקליטה. */
  optional?: boolean;
  /** בתוך השלב: נפתח רק אחרי פריט אחר (ברירת המחדל — במקביל). */
  after?: string;
  /** לכל אדם במשק הבית: הלקוח, ובן/בת הזוג כשיש. הנושא נשמר כתפקיד. */
  perPerson?: boolean;
  dueInDays?: number | null;
  /** פעולה מול רשות: 'auto' רק לפעולות קריאה, ורק אחרי הסכמת המשרד. */
  mode?: 'auto' | 'manual';
  /** מוצג במסלול כדי שיהיה מובן, אבל נוצר במנגנון אחר (ייצוג מההצעה). */
  fixed?: boolean;
  /** בקשת מערכת במסלול הקליטה: הגדרות שהמחולל הקיים קורא (ענפים, רשויות, חובה). */
  system?: {
    variants?: DefaultVariant[];
    authorities?: InstitutionKey[];
    requiredForClose?: boolean | null;
  };
  /** עותק לגיבוי בלבד — כשהפריט בספרייה נמחק. השרת מעדיף תמיד את הספרייה. */
  snapshot?: { stepType: string; title: string; payload?: Record<string, unknown> };
}

export interface StageReminder { afterDays: number; max: number }

export interface FlowStage {
  key: string;
  name: string;
  opens: Opens;
  delivery: Delivery;
  reminder?: StageReminder | null;
  /** הודעה אליך כשהשלב הושלם. */
  notifyOffice?: boolean;
  when?: When;
  items: FlowItem[];
}

export interface FlowDefinition { stages: FlowStage[] }

export interface OfficeFlow {
  id: string;
  name: string;
  trigger: FlowTrigger;
  status: 'active' | 'archived';
  currentVersion: number;
  seedKey?: string | null;
  definition: FlowDefinition;
  /** כמה ריצות פעילות לכל גרסה — כדי שעריכה תגיד על מי היא לא חלה. */
  runsByVersion?: Record<string, number>;
  updatedAt?: string;
}

export type ClientFacts = Partial<Record<FlowFactKey, boolean>> & {
  kind?: ClientKind | null;
  /** נשוי/אה, ובן/בת הזוג רשום/ה בכרטיס הזה (בלי כרטיס משלו) — רק אז «לכל אדם». */
  hasSpouse?: boolean;
};

export type RunStatus = 'active' | 'paused' | 'cancelled' | 'done';
export type StageState = 'waiting' | 'open' | 'done' | 'not_applicable';

export const TRIGGER_LABELS: Record<FlowTrigger, { label: string; hint: string }> = {
  quote_approved: { label: 'כשהלקוח מאשר הצעת מחיר', hint: 'מסלול הקליטה. אחד למשרד.' },
  manual: { label: 'מפעילים מכרטיס הלקוח', hint: 'פעם אחת בכל פעם, לכל לקוח.' },
  annual: { label: 'פעם בשנה', hint: 'מפעילים לשנת מס. כל שנה — הפעלה נפרדת.' },
};

/**
 * ‼ מה שבשלב שעוד לא נפתח כבר בדף, תחת «בהמשך» (215: נוצר מפורסם בתחילת המסלול;
 * 208: «בהמשך»), ונעשה פעיל כשהשלב נפתח. «מופיע כשהשלב נפתח» לא היה נכון.
 */
const PAGE_FROM_START = 'הלקוח רואה את מה שבשלב תחת «בהמשך» כבר מתחילת המסלול, ופועל עליו כשהשלב נפתח';

/**
 * איך שלב מגיע ללקוח — במילים של מה שקורה, לא של מצב פנימי. ‼ מקום אחד לכל
 * המסכים (בונה, «מה יקרה», אוטומציות, הפעלה, הכרטיס). שלוש עובדות לכל בחירה:
 * מה מופיע בדף · מתי יוצא מייל · מה מחכה לך. «לבד»/«הכול באישורך» לבד לא מספיקים.
 * ‼ «בדף» נשען על 214 (_client_announceable_steps): «רק בדף» לא שולח מייל וגם לא תזכורת.
 * ‼ «רק בדף» ולא «בדף, בלי מייל» — זה הסימן בשורת הבקשה לבקשה שעוד לא נשלח עליה
 * מייל (requestPresentation), כלומר ההפך: שם המייל עוד יכול לצאת.
 * ‼ המייל האוטומטי: המועד הוא «לא לפני» (שתי דקות + הסבב הבא של התזמון, ותוספות
 * דוחות אותו) — לכן «תוך כמה דקות», לא מספר. כנשלח נרשם בו רק מה שנפתח לבד
 * (214: _client_announceable_steps); שאר מה שבדף מופיע בבלוק «ועוד דברים…» (send-process-open-email).
 */
export const DELIVERY_LABELS: Record<Delivery, { short: string; page: string; mail: string; waits: string; long: string }> = {
  approve: {
    short: 'בדף מיד, מייל כשתשלח',
    page: PAGE_FROM_START,
    mail: 'מייל אחד מרוכז יוצא כשתלחץ «שלח מייל…» בכרטיס הלקוח — ורואים אותו לפני',
    waits: 'אישור המייל',
    long: 'מופיע בדף מיד. מייל אחד מרוכז יוצא כשתלחץ «שלח מייל…» בכרטיס הלקוח',
  },
  auto: {
    short: 'בדף מיד, מייל אוטומטי',
    page: PAGE_FROM_START,
    mail: 'מייל אחד מרוכז יוצא לבד תוך כמה דקות מהפתיחה',
    waits: 'כלום — עד שהמייל יוצא אפשר ללחוץ «אל תשלח לבד» בכרטיס הלקוח',
    long: 'מופיע בדף מיד. מייל אחד מרוכז יוצא לבד תוך כמה דקות מהפתיחה',
  },
  hold: {
    short: 'מחכה לאישורך',
    page: 'לא מופיע בדף עד שתאשר («פרסם בדף» בכרטיס הלקוח)',
    mail: 'אחרי הפרסום אתה בוחר אם לשלוח מייל',
    waits: 'פרסום בדף, ואז החלטה על מייל',
    long: 'לא מופיע בדף ולא נשלח עד שתאשר — ואז אתה בוחר אם לשלוח מייל',
  },
  page: {
    short: 'רק בדף',
    page: PAGE_FROM_START,
    mail: 'לא נשלח מייל — וגם לא תזכורות',
    waits: 'כלום',
    long: 'רק בדף — בלי מייל ובלי תזכורות',
  },
};
export const DELIVERIES: Delivery[] = ['approve', 'auto', 'hold', 'page'];

/**
 * מה נרשם כנשלח במייל האוטומטי — פירוט, ולכן רק בפתיחת שורת «מייל מרוכז» באוטומציות
 * (לא בבחירה בבונה ולא בכרטיס). 214: _client_announceable_steps; הבלוק — send-process-open-email.
 */
export const AUTO_MAIL_RECORDED = 'כנשלח נרשם רק מה שנפתח לבד; שאר מה שפתוח בדף רק מוזכר בו, תחת «ועוד דברים שממתינים לכם בדף»';

export const FLOW_FACT_LABELS: Record<FlowFactKey, { yes: string; no: string }> = {
  monthly: { yes: 'שירות חודשי בהצעה', no: 'בלי שירות חודשי' },
  paperless: { yes: 'פייפרלס או הנהלת חשבונות', no: 'בלי פייפרלס' },
  licensed: { yes: 'עוסק מורשה או חברה', no: 'לא עוסק מורשה' },
  rep: { yes: 'ייצוג בהצעה', no: 'בלי ייצוג' },
  has_prev: { yes: 'מגיע מרו״ח אחר', no: 'בלי רו״ח קודם' },
  new_business: { yes: 'עסק חדש', no: 'עסק קיים' },
  no_prev_email: { yes: 'אין מייל של הרו״ח הקודם', no: 'יש מייל של הרו״ח הקודם' },
  married: { yes: 'נשוי/אה', no: 'לא נשוי/אה' },
};
export const FLOW_FACT_KEYS: FlowFactKey[] = ['married', 'has_prev', 'new_business', 'monthly', 'paperless', 'licensed', 'rep', 'no_prev_email'];
