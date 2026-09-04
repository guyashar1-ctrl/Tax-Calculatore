// ─── דגלי "דורש טיפול" — המסקנות שנגזרות מיישור קו מול הרשויות ──────────────
// ‼ אב-הטיפוס שממנו נולד הקובץ (institution-alignment-status-v1.html) בוטל.
// הלוגיקה כאן — אילו ממצאים הם חריגה שמניעה עבודה — שרדה ומשמשת את שכבת
// «דורש טיפול» בתיק המס. מקור ה-UX המחייב היום: tax-file-v6-living-tax-file.html.
//
// ‼ כל דגל נגזר מ*הערך המקובל על הלקוח* ולא מ-payload של שלב. הסיבה: payload
// של בקשה נמחק כשהיא מוסרת ונוספת מחדש מהקטלוג (ראה catalog-readd-wipes-payload),
// ואילו הערך המקובל הוא הרשומה המקצועית שנשארת. השלבים נקראים כאן רק כדי לדעת
// אם *כבר נוצרה בקשה* לדגל — ולא כמקור לנתון עצמו.
//
// ‼ שדה שלא מולא אינו מייצר דגל. "לא יודעים" אינו "תקין" ואינו "בעיה" —
// המצאת דגל מהיעדר נתון הייתה שולחת את הרו"ח לטפל במשהו שלא נבדק.

import type { Client } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { niPersons, niEditable, niRepresentationOf, niRepresentationAction } from './niPersons';
import type { NiExecutionByRole, NiRepresentationAction } from './niPersons';

export type FlagSeverity = 'high' | 'medium' | 'info';

/** מה אפשר לעשות עם הדגל. דגל מידע לא מציע דבר — הוא רק ראוי לתשומת לב. */
export type FlagActionKind = 'task' | 'request';

export interface AuthorityFlag {
  /** מפתח יציב — משמש גם לזיהוי בקשה שכבר נוצרה (payload.flagKey). */
  key: string;
  severity: FlagSeverity;
  title: string;
  /** למה זה חשוב — משפט אחד בשפת העבודה, לא הסבר טכני. */
  why: string;
  actions: FlagActionKind[];
  /** כותרת המשימה שתיווצר בלחיצה על "צור משימה". */
  taskTitle?: string;
  /** נוסח הבקשה ללקוח, אם הדגל מציע בקשה. */
  requestTitle?: string;
  requestSub?: string;
  /** נוצרה כבר בקשה לדגל הזה ⇒ מציגים חותמת במקום כפתור. */
  requestExists?: boolean;
  /**
   * פעולה ייעודית לדגל ייצוג ב"ל של בן/בת הזוג — לא task/request כלליים.
   * 'add' → onAddNiTarget('spouse'); 'continue' → onOpenRepresentation.
   * ראה docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md.
   */
  niAction?: NiRepresentationAction;
}

function money(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString('he-IL')} ₪`;
}

/** תאריך קצר לתצוגה בתוך משפט. */
function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL');
}

interface BalanceSpec {
  key: string;
  authority: string;
  value?: number;
}

/**
 * ‼ מוסכמת הסימן: חיובי = חוב, שלילי = יתרת זכות. אותה מוסכמת מוצגת לרו"ח
 * בשדה עצמו במסך יישור הקו (BALANCE_NOTE ב-InstitutionAlignment.tsx) — שני
 * הצדדים חייבים להישאר זהים, אחרת חוב יוצג כזכות.
 */
function balanceFlags(client: Client): AuthorityFlag[] {
  const balances: BalanceSpec[] = [
    { key: 'niBalance', authority: 'בביטוח לאומי', value: client.niBalance },
    { key: 'vatBalance', authority: 'במע״מ', value: client.vatBalance },
    { key: 'incomeTaxBalance', authority: 'במס הכנסה', value: client.incomeTaxBalance },
  ];
  const out: AuthorityFlag[] = [];
  for (const b of balances) {
    if (b.value == null || b.value === 0) continue;
    if (b.value > 0) {
      out.push({
        key: `debt_${b.key}`,
        severity: 'high',
        title: `חוב ${b.authority} - ${money(b.value)}`,
        why: 'יתרה לחובה כפי שנרשמה ביישור הקו. לבדוק את מקור החוב ולתאם תשלום או הסדר.',
        actions: ['task'],
        taskTitle: `טיפול בחוב ${b.authority} (${money(b.value)})`,
      });
    } else {
      out.push({
        key: `credit_${b.key}`,
        severity: 'info',
        title: `יתרת זכות ${b.authority} - ${money(b.value)}`,
        why: 'ייתכן שמגיע החזר או שניתן לקזז מול חיוב עתידי.',
        actions: [],
      });
    }
  }
  return out;
}

/** הרשאות חיוב — כל רשות בנפרד; הרשאה במע"מ אינה מעידה על מס הכנסה. */
function debitAuthFlags(client: Client): AuthorityFlag[] {
  const specs: Array<{ key: string; authority: string; value?: boolean; sub: string }> = [
    { key: 'niDebitAuthorization', authority: 'בביטוח לאומי', value: client.niDebitAuthorization,
      sub: 'להקים הרשאה לחיוב חשבון בביטוח לאומי, קוד מוטב 28900.' },
    { key: 'vatDebitAuthorization', authority: 'במע״מ', value: client.vatDebitAuthorization,
      sub: 'להקים הרשאה לחיוב חשבון במע״מ דרך פורטל המייצגים.' },
    { key: 'incomeTaxDebitAuthorization', authority: 'במס הכנסה', value: client.incomeTaxDebitAuthorization,
      sub: 'להקים הרשאה לחיוב חשבון במס הכנסה דרך פורטל המייצגים.' },
  ];
  return specs
    .filter(s => s.value === false)
    .map(s => ({
      key: s.key,
      severity: 'medium' as const,
      title: `אין הרשאה לחיוב חשבון ${s.authority}`,
      why: 'התשלומים אינם נגבים אוטומטית, ולכן נוצרים פיגורים וקנסות בלי שאף אחד שם לב.',
      actions: ['request', 'task'] as FlagActionKind[],
      taskTitle: `הקמת הרשאה לחיוב ${s.authority}`,
      requestTitle: `הקמת הרשאה לחיוב ${s.authority}`,
      requestSub: s.sub,
    }));
}

/**
 * "בן/בת הזוג אינו/ה מיוצג/ת בביטוח לאומי" — הפער היחיד שנגזר מהמצב
 * האמיתי פר-אדם, לא מרשומה משותפת. ‼ אותו רזולבר בדיוק כמו כרטיס ב"ל
 * (`niPersons`/`niRepresentationOf`), כדי שהדגל כאן והשורה שם לעולם לא
 * יסתרו זה את זה. נעלם לגמרי כש-kind הוא 'active'/'elsewhere'/'unknown',
 * וגם כשאין פעולה בטוחה להציע (אין בקשת ייצוג בכלל — ראה `niRepresentationAction`).
 * ‼ בן/בת זוג מקושר/ת (`!niEditable`) לא מקבל/ת דגל — המקור אמת אצלו/ה.
 */
function niSpouseRepresentationFlag(
  client: Client, spouseClient: Client | undefined, niExecution: NiExecutionByRole | undefined,
): AuthorityFlag[] {
  const spouse = niPersons(client, spouseClient).find(p => p.role === 'spouse');
  if (!spouse || !niEditable(spouse)) return [];

  const line = niRepresentationOf(spouse, client, spouseClient, niExecution);
  if (line.kind === 'active' || line.kind === 'elsewhere' || line.kind === 'unknown') return [];

  const action = niRepresentationAction(spouse, client, line);
  if (!action) return [];

  const why = line.kind === 'pending'
    ? (line.detail
        ? `ממתינים לאישור ${spouse.name} בביטוח לאומי — ${line.detail}.`
        : `התבקש ייצוג בביטוח לאומי עבור ${spouse.name} — נדרשת הזנה ידנית בפורטל ביטוח לאומי.`)
    : `הייצוג בביטוח לאומי הוא לכל אדם בנפרד — עדיין לא התבקש עבור ${spouse.name}.`;

  return [{
    key: 'niSpouseNotRepresented',
    severity: 'medium',
    title: `${spouse.name} אינו/ה מיוצג/ת בביטוח לאומי`,
    why,
    actions: [],
    niAction: action,
  }];
}

/**
 * מחשב את רשימת "דורש טיפול" ללקוח.
 * @param steps שלבי הבקשות של הלקוח — לזיהוי בקשה שכבר נוצרה לדגל (payload.flagKey).
 * @param spouseClient הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150).
 * @param niExecution מסלולי הביצוע של ב"ל בבקשת הייצוג המקושרת — לדגל הייצוג פר-אדם.
 */
export function computeAuthorityFlags(
  client: Client, steps: OnboardingStep[] = [],
  spouseClient?: Client, niExecution?: NiExecutionByRole,
): AuthorityFlag[] {
  const flags: AuthorityFlag[] = [];

  flags.push(...niSpouseRepresentationFlag(client, spouseClient, niExecution));

  flags.push(...balanceFlags(client));

  // ── ניכוי במקור ──
  if (client.withholdingStatus === 'none') {
    flags.push({
      key: 'withholdingStatus',
      severity: 'high',
      title: 'אין אישור ניכוי מס במקור בתוקף',
      why: 'לקוחות שמשלמים לו ינכו מס בשיעור המלא. לטפל בהוצאת אישור מול פקיד השומה.',
      actions: ['task'],
      taskTitle: 'הוצאת אישור ניכוי מס במקור',
    });
  }

  // ── ניהול ספרים ──
  if (client.bookStatus === 'rejected') {
    flags.push({
      key: 'bookStatus',
      severity: 'high',
      title: 'ניהול הספרים נפסל',
      why: 'לפסילה יש השלכות על השומה ועל ההוצאות המוכרות. לברר את הסיבה ואת דרך התיקון.',
      actions: ['task'],
      taskTitle: 'טיפול בפסילת ניהול ספרים',
    });
  } else if (client.bookStatus === 'unknown') {
    flags.push({
      key: 'bookStatusUnknown',
      severity: 'medium',
      title: 'מצב ניהול הספרים אינו ידוע',
      why: 'לא נמצא אישור תקף ולא נקבע שנפסל. לברר מול פקיד השומה.',
      actions: ['task'],
      taskTitle: 'בירור מצב ניהול ספרים',
    });
  }

  // ── הצהרת הון ──
  if (client.capitalDeclarationRequired) {
    const deadline = shortDate(client.capitalDeclarationDeadline);
    flags.push({
      key: 'capitalDeclarationRequired',
      severity: 'medium',
      title: `דרישת הצהרת הון פתוחה${deadline ? ` - להגשה עד ${deadline}` : ''}`,
      why: 'הכנת הצהרת הון דורשת איסוף מסמכים מהלקוח, ולכן כדאי להתחיל מוקדם.',
      actions: ['request', 'task'],
      taskTitle: 'הכנת הצהרת הון',
      requestTitle: 'מסמכים להצהרת הון',
      requestSub: 'לצורך הכנת הצהרת ההון נדרשים מסמכים על הנכסים וההתחייבויות.',
    });
  }

  flags.push(...debitAuthFlags(client));

  // ── דיווחים חסרים ──
  const reporting = client.incomeTaxReportingStatus?.trim();
  if (reporting && reporting !== 'אין דיווחים חסרים') {
    flags.push({
      key: 'incomeTaxReportingStatus',
      severity: 'medium',
      title: `מצב הדיווחים במס הכנסה: ${reporting}`,
      why: 'דיווח חסר גורר קנסות ועלול לעכב אישורים. לבדוק מה חסר ולהשלים.',
      actions: ['task'],
      taskTitle: 'השלמת דיווחים חסרים במס הכנסה',
    });
  }

  // ── מידע בלבד: תדירות דיווח חודשית משפיעה על קצב העבודה השוטף ──
  if (client.vatFrequency === 'monthly') {
    flags.push({
      key: 'vatMonthly',
      severity: 'info',
      title: 'דיווח מע״מ חד-חודשי (ולא דו-חודשי)',
      why: 'קצב העבודה השוטף מול הלקוח כפול מהרגיל.',
      actions: [],
    });
  }

  // ── בקשה שכבר נוצרה לדגל הזה ⇒ חותמת במקום כפתור ──
  const existingFlagKeys = new Set(
    steps
      .map(s => s.payload?.flagKey)
      .filter((k): k is string => typeof k === 'string'),
  );
  return flags.map(f => (existingFlagKeys.has(f.key) ? { ...f, requestExists: true } : f));
}

export const FLAG_SEVERITY_ORDER: Record<FlagSeverity, number> = { high: 0, medium: 1, info: 2 };

/** דגלים שדורשים פעולה — לצורך המונה בכותרת ("דורש טיפול · 4"). */
export function actionableFlagCount(flags: AuthorityFlag[]): number {
  return flags.filter(f => f.severity !== 'info').length;
}
