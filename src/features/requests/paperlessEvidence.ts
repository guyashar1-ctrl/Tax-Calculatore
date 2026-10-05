// ─── פייפרלס: על מה נשען «נרשם», ובדיקת ההגדרות בחשבון (05.10.2026) ────────
// ‼ אין אינטגרציה עם פייפרלס. כל מה שכאן הוא הצהרה — של הלקוח בדף האישי, או של
// המשרד בכרטיס — עם מקור ותאריך. אסור לנסח «הלקוח נרשם» כשמי שסימן הוא המשרד,
// ואסור להציג 0/5 כ«אין חשבון»: הרשימה סופרת סימונים, לא קיום חשבון.

import type { OnboardingStep } from '../../types/onboarding';
import type { Client } from '../../types';
import { formatPercent, type HomeOfficeState } from './homeOffice';
import { dealerTypeDisplay } from '../taxFile/editModel';

export type SignupSource = 'client' | 'office' | 'alreadyConnected' | 'transferred' | 'none';

export interface SignupEvidence {
  /** האם ההרשמה נחשבת כגמורה (לצורך ההמשך). */
  done: boolean;
  source: SignupSource;
  at?: string;
  /** שורה קצרה לשורת הבקשה: «אישור המשרד · 5.10.2026». */
  line: string;
  /** משפט מלא למקום שמסביר («על מה זה נשען»). */
  detail: string;
}

const dateIL = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

/**
 * מה ידוע על ההרשמה לפייפרלס — לפי מה שנרשם על הבקשה עצמה.
 * ‼ «השלמה מהדף» = completion_method 'system' + submittedByClient (208); «השלמה ידנית» =
 * המשרד לחץ «הלקוח נרשם» (completion_method 'manual'). דילוג «כבר מחובר» — המשרד קבע.
 */
export function paperlessSignupEvidence(invite: Pick<OnboardingStep, 'status' | 'payload' | 'completionMethod' | 'completedAt' | 'updatedAt'> | undefined): SignupEvidence {
  if (!invite) return { done: false, source: 'none', line: 'אין בקשת הרשמה', detail: 'לא נפתחה בקשת הרשמה לפייפרלס.' };
  const p = (invite.payload ?? {}) as Record<string, unknown>;
  const at = String(p.clientConfirmedAt ?? invite.completedAt ?? invite.updatedAt ?? '') || undefined;
  if (invite.status === 'skipped') {
    const reason = String(p.skipReason ?? '');
    if (reason === 'already_connected') {
      return { done: true, source: 'alreadyConnected', at, line: `המשרד סימן: כבר מחובר${at ? ` · ${dateIL(at)}` : ''}`,
        detail: 'המשרד סימן שללקוח כבר יש חשבון פייפרלס ואין צורך בהרשמה. זו קביעה של המשרד — לא בדיקה מול פייפרלס.' };
    }
    if (reason === 'transferred_rep') {
      return { done: true, source: 'transferred', at, line: `הועבר מהמייצג הקודם${at ? ` · ${dateIL(at)}` : ''}`,
        detail: 'החשבון הועבר אלינו מהמייצג הקודם, לפי סימון המשרד.' };
    }
    return { done: false, source: 'none', line: 'אין צורך', detail: 'סומן שאין צורך בהרשמה.' };
  }
  if (invite.status === 'completed' || invite.status === 'verified') {
    const byClient = p.submittedByClient === true || invite.completionMethod === 'system';
    return byClient
      ? { done: true, source: 'client', at, line: `הלקוח אישר בדף האישי${at ? ` · ${dateIL(at)}` : ''}`,
          detail: 'הלקוח לחץ בדף האישי שנרשם. זו הצהרה שלו — לא בדיקה מול פייפרלס.' }
      : { done: true, source: 'office', at, line: `אישור המשרד${at ? ` · ${dateIL(at)}` : ''}`,
          detail: 'המשרד סימן שהלקוח נרשם (למשל אחרי שיחה, או אחרי שראה את החשבון). זו אינה בדיקה אוטומטית מול פייפרלס.' };
  }
  return { done: false, source: 'none', line: 'טרם אושרה הרשמה', detail: 'עדיין אין אישור — לא מהלקוח ולא מהמשרד.' };
}

/** משפט הפתיחה של הקמת העסק — לפי המסלול ועל מה שההרשמה נשענת. */
export function connectionIntro(path: string | undefined, ev: SignupEvidence): string {
  if (path === 'other_rep') return 'הלקוח קיים בפייפרלס אצל המייצג הקודם. נכנסים לחשבון, מושכים אותו אלינו, ומשלימים את ההקמה.';
  if (path === 'self') return 'ללקוח יש חשבון משלו, והוא אמור להוסיף את המשרד כמייצג. נכנסים לחשבון ומשלימים את ההקמה.';
  if (!ev.done) return 'עדיין אין אישור שהלקוח נרשם. אפשר להתחיל כשיהיה חשבון.';
  const who = ev.source === 'client' ? 'הלקוח אישר שנרשם' : ev.source === 'office' ? 'המשרד סימן שהלקוח נרשם' : ev.line;
  return `${who}${ev.at ? ` (${dateIL(ev.at)})` : ''}. נכנסים לחשבון בפייפרלס ומשלימים את ההקמה.`;
}

// ─── בדיקת הגדרות בפייפרלס ─────────────────────────────────────────────────
// ‼ סימון ידני של המשרד: «בדקתי שבפייפרלס מוגדר נכון». נשמר על בקשת ההקמה
// (payload.settingsReview) עם מי ומתי — ואינו כותב לשום עובדה בתיק. מה ש-PIVO
// יודע מוצג לידו להשוואה; ערך שלא ידוע ב-PIVO נאמר כ«לא ידוע», לא כאפס.

export type SettingsReviewKey = 'dealer_sale' | 'home_office' | 'advances' | 'withholding' | 'ni' | 'bookkeeping';

export interface SettingsReviewMark { state: 'checked' | 'na'; at: string; note?: string }
export type SettingsReview = Partial<Record<SettingsReviewKey, SettingsReviewMark>>;

export interface SettingsReviewItem {
  key: SettingsReviewKey;
  label: string;
  /** מה כתוב ב-PIVO, אחרי מיפוי משמעות. null ⇒ לא ידוע ב-PIVO. */
  pivo: string | null;
  /** מה ממופה — למי שתוהה מה בדיוק להשוות. */
  compareHint: string;
}

const ADV_FREQ: Record<string, string> = { monthly: 'חודשי', bi_monthly: 'דו־חודשי' };

const has = (v: unknown) => v !== null && v !== undefined && v !== '';

export function paperlessSettingsItems(client: Partial<Client>, ho: HomeOfficeState | null): SettingsReviewItem[] {
  const c = client as Record<string, unknown>;
  // ‼ הסיווג הקנוני (cardDealerKind/dealerTypeDisplay): «פטור» בשדה עם סיווג מע״מ «מורשה» = מורשה.
  const dealerD = dealerTypeDisplay(client as Pick<Client, 'dealerType' | 'vatStatus'>);
  const dealer = dealerD.unknown ? null : dealerD.text;
  const adv = has(c.pitAdvancePercent) || has(c.pitAdvanceFrequency)
    ? [has(c.pitAdvancePercent) ? `${c.pitAdvancePercent}%` : null,
       has(c.pitAdvanceFrequency) ? (ADV_FREQ[String(c.pitAdvanceFrequency)] ?? String(c.pitAdvanceFrequency)) : null]
        .filter(Boolean).join(' · ')
    : null;
  // ‼ ניכוי במקור בפייפרלס = מה שמנוכה מהתקבולים של העסק — אישור הניכוי של הלקוח
  // (withholdingStatus + פירוט), לא withholdingRate, שהוא שיעור תיק הניכויים (עובדים).
  const wh = c.withholdingStatus === 'none' ? 'אין אישור ניכוי תקף'
    : c.withholdingStatus === 'exempt' ? 'פטור מניכוי'
    : c.withholdingStatus === 'rates' ? (has(c.withholdingDetail) ? `לפי פעילות · ${c.withholdingDetail}` : 'שיעורים לפי פעילות (בלי פירוט)')
    : null;
  const ni = has(c.niAdvanceMonthly) ? `${Number(c.niAdvanceMonthly).toLocaleString('he-IL')} ₪ לחודש` : null;
  const hoText = !ho || ho.phase === 'unanswered' ? null
    : ho.phase === 'noRoom' ? 'אין חדר בלעדי'
    : ho.phase === 'approved' ? `אושר ${formatPercent(ho.current?.approved_percent)}`
    : ho.phase === 'stale' ? 'לבדיקה — התשובות השתנו'
    : 'ממתין לאישור המשרד';
  return [
    { key: 'dealer_sale', label: 'סוג העוסק וסוג המכירה', pivo: dealer, compareHint: 'סוג העוסק כפי שהמערכת קוראת אותו (כולל סיווג מע״מ). סוג המכירה אינו מתועד ב-PIVO.' },
    { key: 'home_office', label: 'אחוז משרד ביתי', pivo: hoText, compareHint: 'האחוז שהמשרד אישר בפרטי העסק.' },
    { key: 'advances', label: 'מקדמות מס הכנסה — שיעור ותדירות', pivo: adv, compareHint: 'שיעור ותדירות המקדמות מתיק המס.' },
    { key: 'withholding', label: 'ניכוי במקור מהתקבולים', pivo: wh, compareHint: 'אישור הניכוי במקור של הלקוח (מס הכנסה) — לא שיעור תיק הניכויים.' },
    { key: 'ni', label: 'ביטוח לאומי — סכום והגדרת תשלום', pivo: ni, compareHint: 'מקדמה חודשית בביטוח לאומי מתיק המס.' },
    { key: 'bookkeeping', label: 'שיטת הנהלת החשבונות', pivo: null, compareHint: 'שיטת הנהלת החשבונות אינה מתועדת ב-PIVO («ניהול ספרים תקין/נפסל» הוא דבר אחר).' },
  ];
}

export function settingsReviewCount(items: SettingsReviewItem[], review: SettingsReview | undefined, hoEntered: boolean) {
  const marked = items.filter(i => i.key === 'home_office' ? (hoEntered || review?.home_office?.state === 'na') : !!review?.[i.key]).length;
  return { marked, total: items.length };
}
