// ─── «הסרת בקשה» — מה אפשר, מתי זה קורה, ולמה כשאי אפשר (15.10.2026) ───────────
// ‼ פונקציה טהורה שמחליטה מה התפריט ⋯ בשורת הבקשה מציע. היא לא מחליפה שום כלל
// של השרת ולא מוסיפה התנהגות: כל אחת מהאפשרויות כאן היא פעולה שכבר הייתה קיימת
// (הסרה רגילה, הסרת עבודת מס, ביטול/מחיקת בקשת ב"ל לאדם, ביטול טופס חכם).
// מה שחדש הוא רק הגילוי: כל שורה אומרת מה ההסרה עושה, האם היא מיידית או ממתינה
// לפרסום, ואם אי אפשר — למה ומה עושים במקום.
//
// ‼ שלוש הפרדות שלא מתערבבות:
//   · «מיידית» — הבקשה עוד לא בדף הלקוח (או שהיא משימה פנימית): מבוטלת במסד מיד.
//   · «בפרסום» — הבקשה כבר בדף: מסומנת להסרה, והלקוח רואה אותה עד «פרסם בדף».
//   · «ייצוג» — מקומי ב-PIVO בלבד; לא מבטל בקשה או ייצוג אצל הרשות.

import type { OnboardingStepStatus } from '../types/onboarding';

/** סוג השורה לעניין ההסרה — נגזר בקומפוננטה מאותם פרדיקטים שהכרטיסים משתמשים בהם. */
export type RemovalKind =
  | 'standard'          // בקשת לקוח / משימה פנימית רגילה
  | 'prev_accountant'   // «חומרים מרו״ח קודם» — בקשה אחת בשלושה שלבים
  | 'tax_work'          // עבודת מס (אומדן / דוח שנתי / הצהרת הון / קליטה) — חלון ההסרה של 242
  | 'tax_child'         // «השלמת מידע» — חלק מעבודת מס
  | 'smart_form'        // טופס חכם 6101
  | 'ni_part'           // ב"ל לאדם — מחיקה/ביטול ייעודיים (212)
  | 'rep_parent'        // «ייצוג מול הרשויות» — נגזר מבקשת הייצוג
  | 'rep_upgrade'       // «שדרוג לייצוג ראשי» — נגזר מרמת הייצוג בכרטיס
  | 'spouse_confirm'    // «אישור אישי של בן/בת הזוג» — צעד חובה
  | 'creation_problem'  // «לא נוצרה» — תקלה, לא בקשה
  | 'system';           // משימת מערכת שאינה בקשת לקוח

/** מחזור החיים של הגשת 6101 (תואם ל-FilingState; כאן כמחרוזת כדי לא לייבא את שכבת הנתונים). */
export type SmartFormStateLike = string;

export interface RemovalTarget {
  /** כבר בדף הלקוח (published_at קיים). */
  published: boolean;
  /** משימה פנימית — לעולם לא בדף הלקוח. */
  internal: boolean;
  /** כבר מסומנת «תוסר בפרסום». */
  pendingCancel: boolean;
}

export interface RemovalInput {
  title: string;
  status: OnboardingStepStatus;
  kind: RemovalKind;
  /** השלבים שההסרה חלה עליהם — אחד, ובמסלול רו״ח קודם שלושה. */
  targets: RemovalTarget[];
  /** כותרות של בקשות פתוחות שממתינות לזאת (תלות) — יישארו נעולות. */
  dependents?: string[];
  smartState?: SmartFormStateLike;
  /** ב"ל: 'not_sent' מחיקה, 'sent' ביטול, null — אושר ואין פעולה. */
  niStage?: 'not_sent' | 'sent' | null;
  /** שם האדם בב"ל — לכותרת. */
  personName?: string;
}

export interface RemovalDialog {
  title: string;
  lead: string;
  goes: string[];
  stays: string[];
  warn?: string;
  confirmLabel: string;
}

export type RemovalWhen = 'now' | 'on_publish' | 'mixed';

export type RemovalPlan =
  | { kind: 'remove'; when: RemovalWhen; menuLabel: string; hint: string; dialog: RemovalDialog }
  | { kind: 'undo'; menuLabel: string; hint: string }
  | { kind: 'tax_work'; menuLabel: string; hint: string }
  | { kind: 'ni_cancel'; menuLabel: string; hint: string }
  | { kind: 'cancel_form'; menuLabel: string; hint: string; dialog: RemovalDialog }
  | { kind: 'blocked'; title: string; reason: string; next?: 'representation' };

/** השלבים של הטופס החכם שבהם השרת (206) מתיר ביטול, ושבהם הממשק מציע אותו: לפני חתימה. */
export const SMART_FORM_CANCELLABLE: readonly string[] = ['draft', 'waiting_client_info', 'review', 'awaiting_signatures'];

const KEPT_HISTORY = 'מה שקרה בבקשה נשמר בלשונית «פעילות»';
const KEPT_MAIL = 'מיילים ומסמכים שכבר נשלחו או הועלו לא נמחקים';
const NO_NOTICE = 'ההסרה עצמה לא שולחת הודעה ללקוח';

const CLOSED: OnboardingStepStatus[] = ['completed', 'verified', 'skipped', 'cancelled'];

function historyReason(status: OnboardingStepStatus): string {
  if (status === 'skipped') return 'הבקשה דולגה ונשמרת בהיסטוריה של הלקוח — בקשה שנסגרה אינה מוסרת.';
  if (status === 'cancelled') return 'הבקשה בוטלה, והיא נשמרת בלשונית «פעילות».';
  return 'הבקשה הושלמה ונשמרת בהיסטוריה של הלקוח — בקשה שהושלמה אינה מוסרת.';
}

function smartFormBlock(state: SmartFormStateLike): string {
  if (state === 'signed' || state === 'awaiting_client_submission') {
    return 'הטופס כבר נחתם, ולכן אין ביטול מהרשימה. ביטול טופס חתום הוא החלטה מקצועית שנעשית במסך הטופס.';
  }
  if (state === 'submitted' || state === 'info_requested' || state === 'result_received') {
    return 'הטופס כבר הוגש לביטוח לאומי, ולכן אי אפשר לבטל אותו. שינוי מחייב הגשה חדשה.';
  }
  return 'הטופס כבר נסגר ונשמר בהיסטוריה.';
}

export function removalWhen(targets: RemovalTarget[]): RemovalWhen {
  // ‼ אותה החלטה של removeRow: מה שעוד לא בדף (או פנימי שלא סומן) מבוטל מיד; השאר ממתין לפרסום.
  const now = (t: RemovalTarget) => !t.published || (t.internal && !t.pendingCancel);
  // שלב שכבר ממתין להסרה ואינו מבוטל מיד — ההסרה לא נוגעת בו שוב.
  const acting = targets.filter(t => now(t) || !t.pendingCancel);
  const rel = acting.length > 0 ? acting : targets;
  const nowCount = rel.filter(now).length;
  if (nowCount === rel.length) return 'now';
  if (nowCount === 0) return 'on_publish';
  return 'mixed';
}

export function removalPlan(i: RemovalInput): RemovalPlan {
  const { title } = i;

  if (CLOSED.includes(i.status)) {
    return { kind: 'blocked', title: 'בקשה שנסגרה', reason: historyReason(i.status) };
  }

  switch (i.kind) {
    case 'rep_parent':
      return {
        kind: 'blocked', title: 'בקשת ייצוג', next: 'representation',
        reason: 'בקשת הייצוג נגזרת מהמצב מול הרשויות, ולכן אין עליה הסרה רגילה. בקשה של אדם מסוים בביטוח לאומי נמחקת או מבוטלת מהשורה שלו, וכל השאר — במרכז הייצוג. מחיקה כאן אינה מבטלת ייצוג ברשות.',
      };
    case 'ni_part':
      if (i.niStage) return { kind: 'ni_cancel', menuLabel: i.niStage === 'sent' ? 'ביטול הבקשה' : 'מחיקת הבקשה', hint: i.niStage === 'sent'
        ? 'נשלחה ל' + (i.personName ?? 'אדם') + ' — ביטול מקומי בלבד, אחרי אזהרה'
        : 'טרם נשלחה — מחיקה מקומית מהעבודה הפעילה' };
      return {
        kind: 'blocked', title: 'ייצוג בביטוח לאומי', next: 'representation',
        reason: 'הייצוג בביטוח לאומי כבר אושר, ולכן אין מחיקה או ביטול. ביטול ייצוג פעיל נעשה מול הרשות, ואינו פעולה ב-PIVO.',
      };
    case 'rep_upgrade':
      return {
        kind: 'blocked', title: 'שדרוג לייצוג ראשי',
        reason: 'השלב נגזר מרמת הייצוג בכרטיס ונסגר מעצמו כשהרמה משתנה ל«מייצג ראשי». אין עליו הסרה ידנית.',
      };
    case 'spouse_confirm':
      return {
        kind: 'blocked', title: 'אישור אישי של בן/בת הזוג',
        reason: 'האישור האישי הוא צעד חובה בבקשה, ולכן לא מסירים אותו. אם אין בו צורך — «אין צורך» בכפתור של הבקשה (ונרשם בהיסטוריה).',
      };
    case 'creation_problem':
      return {
        kind: 'blocked', title: 'בקשה שלא נוצרה',
        reason: 'זו תקלה ביצירת בקשה ולא בקשה פעילה. «צור שוב» מנסה שוב, ו«אין צורך» סוגר אותה אחרי הסבר מה קורה למסלול.',
      };
    case 'tax_child':
      return {
        kind: 'blocked', title: 'השלמת מידע',
        reason: 'השלמת מידע היא חלק מעבודת המס. מסירים אותה יחד עם העבודה הראשית — «הסר…» בשורה של העבודה.',
      };
    case 'system':
      return {
        kind: 'blocked', title: 'משימת מערכת',
        reason: 'זו משימה שנוצרה אוטומטית עם הלקוח, ואינה בקשה מהלקוח — לכן לא מסירים אותה. «דלג על הבקשה» ב«עריכת הבקשות» סוגר אותה.',
      };
    case 'tax_work':
      return {
        kind: 'tax_work', menuLabel: 'הסר עבודה…',
        hint: 'נפתח חלון שאומר מה נמחק ומה נשמר — מחיקה רק כשדבר לא יצא ללקוח',
      };
    case 'smart_form': {
      const st = i.smartState ?? 'draft';
      if (!SMART_FORM_CANCELLABLE.includes(st)) {
        return { kind: 'blocked', title: 'טופס 6101', reason: smartFormBlock(st) };
      }
      return {
        kind: 'cancel_form', menuLabel: 'בטל את הטופס…',
        hint: 'ביטול מיידי, עם סיבה — הטופס לא יוגש והנתונים נשמרים',
        dialog: {
          title: 'לבטל את הטופס?',
          lead: 'הביטול מיידי. הטופס לא יוגש, והבקשה תיעלם מהדף של הלקוח.',
          goes: ['קישורי חתימה שנשלחו מפסיקים לעבוד', 'הבקשה יוצאת מהעבודה הפעילה'],
          stays: ['מה שמולא בטופס וההיסטוריה שלו נשמרים', KEPT_HISTORY],
          warn: st === 'awaiting_signatures' ? 'הטופס כבר נעול לחתימה — ייתכן שמישהו כבר קיבל קישור.' : undefined,
          confirmLabel: 'ביטול הטופס',
        },
      };
    }
    default:
      break;
  }

  // standard / prev_accountant
  const clicked = i.targets[0];
  // ‼ גם משימה פנימית עם הסרה ממתינה ישנה (מלפני הכלל) — לחיצה מבטלת אותה, כמו removeRow.
  const undo = !!clicked?.pendingCancel;
  if (undo) {
    return {
      kind: 'undo', menuLabel: 'בטל את ההסרה',
      hint: 'ההסרה ממתינה לפרסום — הלקוח עדיין רואה את הבקשה',
    };
  }

  const when = removalWhen(i.targets);
  const prev = i.kind === 'prev_accountant';
  const internal = i.targets.every(t => t.internal);
  const dependents = (i.dependents ?? []).filter(Boolean);
  const warn = dependents.length > 0
    ? `בקשות שממתינות לה — ${dependents.map(d => `«${d}»`).join(', ')} — יישארו נעולות אחרי ההסרה (אפשר לפתוח אותן ידנית ב«פתח עכשיו»).`
    : undefined;
  const scope = prev
    ? `ההסרה חלה על כל השלבים הפתוחים של המסלול (${i.targets.length}) — פרטי רו״ח, מכתב העברת טיפול וקבלת החומרים. מה שכבר הושלם נשאר בהיסטוריה. `
    : '';

  if (when === 'now') {
    return {
      kind: 'remove', when, menuLabel: internal ? 'הסר את המשימה' : 'הסר את הבקשה',
      hint: internal ? 'משימה פנימית — ההסרה מיידית' : 'עוד לא פורסמה ללקוח — ההסרה מיידית',
      dialog: {
        title: `להסיר את «${title}»?`,
        lead: scope + (internal
          ? 'זו משימה פנימית — הלקוח לא רואה אותה, ולכן ההסרה מיידית.'
          : 'הבקשה עוד לא פורסמה בדף הלקוח, ולכן ההסרה מיידית.'),
        goes: ['הבקשה יוצאת מהרשימה ומהעבודה הפעילה'],
        stays: [KEPT_HISTORY, KEPT_MAIL],
        warn,
        confirmLabel: 'הסר עכשיו',
      },
    };
  }
  if (when === 'on_publish') {
    return {
      kind: 'remove', when, menuLabel: 'הסר מדף הלקוח',
      hint: 'הלקוח ימשיך לראות אותה עד «פרסם בדף»',
      dialog: {
        title: `להסיר את «${title}» מדף הלקוח?`,
        lead: scope + 'הבקשה כבר בדף הלקוח, ולכן ההסרה לא מיידית — היא תחול כשתפרסם את השינויים בדף («פרסם בדף»).',
        goes: ['עד הפרסום הלקוח עדיין רואה אותה ויכול לפעול לפיה', 'בפרסום הבא היא יוצאת מהדף ומהרשימה'],
        stays: ['אפשר לבטל את ההסרה עד הפרסום', NO_NOTICE, KEPT_HISTORY],
        warn,
        confirmLabel: 'סמן להסרה בפרסום',
      },
    };
  }
  return {
    kind: 'remove', when, menuLabel: 'הסר את הבקשה',
    hint: 'חלק מהשלבים מוסרים מיד, ושלב שכבר בדף הלקוח — בפרסום',
    dialog: {
      title: `להסיר את «${title}»?`,
      lead: scope + 'שלבים שעוד לא בדף הלקוח יוסרו מיד. שלב שכבר בדף יוסר רק כשתפרסם את השינויים («פרסם בדף»), ועד אז הלקוח רואה אותו.',
      goes: ['שלבים שלא פורסמו — יוצאים מיד', 'שלבים שבדף — יוצאים בפרסום הבא'],
      stays: ['אפשר לבטל הסרה שממתינה לפרסום', NO_NOTICE, KEPT_HISTORY],
      warn,
      confirmLabel: 'הסר',
    },
  };
}

/** תגובת השרת להסרה — «ok:false» אינו שגיאת רשת, והמסך חייב לומר מה קרה. */
export function removalErrorText(code: string | undefined, fallback?: string): { text: string; stale: boolean } {
  switch (code) {
    case 'not_published': return { text: 'הבקשה עוד לא פורסמה, והמסך הציג אותה כאילו כן. הרשימה מתעדכנת — אפשר להסיר שוב.', stale: true };
    case 'step_terminal': return { text: 'הבקשה כבר נסגרה בינתיים, ולכן אין מה להסיר. הרשימה מתעדכנת.', stale: true };
    case 'step_not_found': return { text: 'הבקשה כבר לא קיימת. הרשימה מתעדכנת.', stale: true };
    case 'forbidden': return { text: 'אין הרשאה לפעולה הזאת.', stale: false };
    case 'locked': return { text: fallback || 'השלב נעול עד להשלמת השלב שהוא תלוי בו.', stale: false };
    default: return { text: fallback || 'ההסרה לא הושלמה. אפשר לנסות שוב.', stale: false };
  }
}

/** רשת/חריגה — לא «לא בוצע»: ייתכן שהשרת כן הסיר. אותו עיקרון כמו ב-NiCancelRequest. */
export const REMOVAL_UNKNOWN_TEXT =
  'לא ידוע אם ההסרה נקלטה. הרשימה מתעדכנת — אם הבקשה עדיין מופיעה, אפשר לנסות שוב.';

/**
 * מה «פרסם בדף» יעשה — בשפה שמפרידה בין מה שנכנס לדף לבין מה שיוצא ממנו.
 * ‼ הסרה שממתינה אינה «עוד לא בדף»: הלקוח עדיין רואה אותה עד הפרסום, והנוסח הקודם
 * («לא יראה עד שתפרסם») אמר את ההפך עליה.
 */
export function pageChangesText(
  items: { title: string; removal: boolean }[],
  addsAllNew: boolean,
  firstName: string,
): { head: string; why: string } {
  const adds = items.filter(i => !i.removal);
  const rems = items.filter(i => i.removal);
  const list = (xs: { title: string }[]) => xs.slice(0, 3).map(i => `«${i.title}»`).join(', ') + (xs.length > 3 ? ' ועוד' : '');
  if (adds.length === 0) {
    return {
      head: rems.length === 1 ? `תוסר מהדף בפרסום: «${rems[0].title}»` : `${rems.length} בקשות יוסרו מהדף בפרסום: ${list(rems)}`,
      why: `${firstName} עדיין רואה ${rems.length === 1 ? 'אותה' : 'אותן'} עד שתפרסם. הפרסום לא שולח מייל.`,
    };
  }
  const addHead = adds.length === 1
    ? (addsAllNew ? `עוד לא בדף: «${adds[0].title}»` : `שינוי שעוד לא בדף: «${adds[0].title}»`)
    : `${adds.length} ${addsAllNew ? 'בקשות' : 'שינויים'} עוד לא בדף: ${list(adds)}`;
  if (rems.length === 0) return { head: addHead, why: `הפרסום לא שולח מייל. ${firstName} לא יראה עד שתפרסם.` };
  return {
    head: `${addHead} · ${rems.length === 1 ? 'הסרה אחת ממתינה' : `${rems.length} הסרות ממתינות`}: ${list(rems)}`,
    why: `הפרסום לא שולח מייל. ${firstName} לא יראה את החדש עד שתפרסם, ומה שסומן להסרה נשאר אצלו עד אז.`,
  };
}
