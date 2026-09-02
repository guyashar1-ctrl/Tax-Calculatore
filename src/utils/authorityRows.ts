// ─── שורות הרשויות בתיק המס — סיכום קומפקטי + פירוט ────────────────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-tax — `.trow` עם `.tsum` שנושא את המצב, ו-`.exc` לחריגה בתוך השורה)
//
// ‼ שורה סגורה חייבת להיות שימושית. הייצור הציג כאן מטריצה של מספרי תיקים,
// ואצל עצמאי כל המספרים הם הת.ז. — כלומר המקום הכי בולט בתיק הציג את אותו
// מספר שלוש פעמים ולא אמר כלום. הסיכום כאן הוא מה שנקרא במבט של שתי שניות:
// מה שמניע עבודה שוטפת (מקדמות, תדירות דיווח, מקדמה חודשית) ומה שהוא כסף
// (יתרה). מספרי התיקים ירדו לפירוט הפתוח, פעם אחת.

import type { Client, TaxAuthority, TaxFileInfo } from '../types';
import { TAX_AUTHORITY_LABELS, TAX_FILE_REP_STATUS_LABELS } from '../types';
import { VAT_FREQ_LABELS, SHAAM_STATUS_LABELS } from '../types/clientWorkspace';
import { shortDate } from './clientDerived';
import { resolvePersonAuthority, resolveIncomeTaxHousehold } from './personRepresentation';
import { registeredFileInfo } from '../features/annualReport/profile';
import { incomeTaxFileType } from '../data/incomeTaxFileTypes';

const PERSON_AUTHORITY: Partial<Record<TaxAuthority, 'vat' | 'withholding' | 'nationalInsurance'>> = {
  vat: 'vat', deductions: 'withholding', national_insurance: 'nationalInsurance',
};

/** מציין «אין ערך» אחיד בכרטיס מס הכנסה. */
const EMPTY = '—';

/** סוג תיק: הקוד הגולמי כפי שהתקבל, ולצידו הפירוש מהטבלה הממוספרת. */
function fileTypeText(code: string | undefined): string {
  if (!code || !code.trim()) return EMPTY;
  const meta = incomeTaxFileType(code);
  return meta ? `${code} · ${meta.description}` : code;
}

export interface AuthorityException {
  text: string;
  tone: 'high' | 'warn' | 'ok';
}

export interface AuthorityRow {
  authority: TaxAuthority;
  name: string;
  summary: string;
  exception: AuthorityException | null;
  /**
   * `syncKey` — מפתח השדה בכרטיס הלקוח, כשיש לו מקור מוכח בשע״ם. קיים ⇒
   * הכרטיס מצייר לידו כפתור קריאה. ‼ נקבע כאן ולא במסך, כדי שהידע "לשדה
   * הזה יש מקור ודאי" יישב במקום אחד.
   */
  /**
   * `editKey` — מפתח השדה ב-editModel, כשהעובדה ניתנת לעריכה **במקום**
   * בכרטיס. חסר ⇒ נגזרת (למשל מספר תיק מתוך taxFiles) ולכן לקריאה בלבד.
   */
  /**
   * `btlSyncKey` — כמו `syncKey`, אך עבור ביטוח לאומי. ‼ שדה נפרד ולא דגל
   * על `syncKey`: שתי הרשויות הן שני חלונות, שני סשנים ושני פקדים, ואיחודן
   * למפתח אחד היה מזמין רגרסיה בנתיב של שע״ם שכבר עובד בייצור.
   */
  facts: { k: string; v: string; tone?: 'warn' | 'ok'; syncKey?: string; btlSyncKey?: string; editKey?: string }[];
  /** יש בכלל מה להציג על הרשות הזו. רשות בלי תיק ובלי נתון אינה שורה. */
  present: boolean;
}

function money(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return `${Math.abs(Math.round(n)).toLocaleString('he-IL')} ₪`;
}

/** חיובי = חוב, שלילי = זכות, 0 = אין. אותה מוסכמת כמו במסך יישור הקו. */
function balanceText(n?: number | null): { text: string; tone: 'warn' | 'ok' } | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n > 0) return { text: `חוב ${money(n)}`, tone: 'warn' };
  if (n < 0) return { text: `יתרת זכות ${money(n)}`, tone: 'ok' };
  return { text: 'אין יתרה', tone: 'ok' };
}

function authText(v?: boolean): { text: string; tone: 'warn' | 'ok' } | null {
  if (v == null) return null;
  return v ? { text: 'קיימת', tone: 'ok' } : { text: 'אין הרשאה', tone: 'warn' };
}

const WITHHOLDING_LABELS = {
  exempt: 'פטור מניכוי', rates: 'שיעורים לפי פעילות', none: 'אין אישור תקף',
} as const;

/** מחבר חלקי סיכום, מדלג על ריקים. */
function join(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/**
 * שורות הרשויות, מודעות לבן/בת הזוג המקושר/ת (150).
 *
 * ‼ `spouseClient` הוא הכרטיס שהתיק שהושג — לא מעתיקים ולא מזיזים מצב, רק
 * קוראים דרך `utils/personRepresentation.ts`. חסר ⇒ אין קישור, וההתנהגות
 * זהה למה שהייתה לפני 150.
 */
export function buildAuthorityRows(client: Client, spouseClient?: Client): AuthorityRow[] {
  const files = client.taxFiles ?? [];
  const filesOf = (a: TaxAuthority) => files.filter(f => f.authority === a);
  const repOf = (a: TaxAuthority): string | null => {
    const list = filesOf(a);
    if (!list.length) return null;
    const active = list.find((f: TaxFileInfo) => f.repStatus === 'active');
    return TAX_FILE_REP_STATUS_LABELS[(active ?? list[0]).repStatus];
  };
  const numbersOf = (a: TaxAuthority) =>
    filesOf(a).map(f => f.fileNumber).filter(Boolean).join(' · ');

  const spouseLabel = spouseClient ? `${spouseClient.firstName} ${spouseClient.lastName}`.trim() || 'בן/בת הזוג' : '';
  /**
   * מע"מ/ניכויים/ב"ל שייכים לאדם (31.8): כשלכרטיס הזה אין את הרשות ישירות
   * (לא מבחינת taxFiles ולא מבחינת authorityRepresentations), בודקים אם
   * היא כבר קיימת דרך בן/בת הזוג. ‼ לא "טרם מיוצג" — כבר מיוצג/ת, במקום אחר.
   */
  const viaSpouse = (a: TaxAuthority): string | null => {
    const key = PERSON_AUTHORITY[a];
    if (!key) return null;
    const res = resolvePersonAuthority(client, spouseClient ?? null, key);
    return res.represented && res.source === 'spouse'
      ? `כבר מיוצג/ת · הושג בקליטה של ${spouseLabel}`
      : null;
  };

  const rows: AuthorityRow[] = [];

  // ── מס הכנסה: תיק אחד לזוג, לא אחד לכל כרטיס ──
  const household = resolveIncomeTaxHousehold(client, spouseClient ?? null);
  {
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('income_tax');
    facts.push({ k: 'מספר תיק', v: num || EMPTY });
    // ‼ התיק אצל בן/בת הזוג המקושר/ת — לא "עדיין לא נבדק", אלא תיק משותף
    // שכבר קיים, בכתובת אחרת. שם ומצב האימות מגיעים דרך registeredFileInfo
    // על הכרטיס שמחזיק את התיק בפועל, לא על הכרטיס הזה.
    if (!num && household.holder === 'spouse') {
      const reg = spouseClient ? registeredFileInfo(spouseClient) : null;
      facts.push({ k: 'תיק מס הכנסה', v: `משותף · בכרטיס של ${spouseLabel}`, tone: 'ok' });
      if (reg) {
        facts.push({
          k: 'בן/בת הזוג הרשום/ה', v: reg.unverified ? `${reg.name} · טרם אומת מול מ"ה` : reg.name,
          tone: reg.unverified ? 'warn' : 'ok',
        });
      }
    }
    // ‼ שדות מס הכנסה נרשמים **תמיד**, גם ריקים, עם «—». זה ההבדל מהרשויות
    // האחרות, והוא מכוון: לפני סנכרון מול שע״ם צריך לראות מה חסר, ואחריו מה
    // התמלא. שורה שנעלמת כשאין לה ערך מסתירה בדיוק את מה שבאים לבדוק.
    // ‼ חוליה יצאה משורת «פקיד שומה» לשורה משלה — שדה עם סנכרון משלו צריך
    // להיראות כשדה, לא כזנב של אחר.
    facts.push({ k: 'סוג תיק', v: fileTypeText(client.incomeTaxFileType), editKey: 'incomeTaxFileType', syncKey: 'incomeTaxFileType' });
    facts.push({ k: 'פקיד שומה', v: client.taxOfficeName || EMPTY, syncKey: 'taxOfficeName', editKey: 'taxOfficeName' });
    facts.push({ k: 'חוליה', v: client.incomeTaxUnit || EMPTY, editKey: 'incomeTaxUnit', syncKey: 'incomeTaxUnit' });
    facts.push({ k: 'ענף כלכלי', v: client.incomeTaxEconomicIndustry || EMPTY, editKey: 'incomeTaxEconomicIndustry', syncKey: 'incomeTaxEconomicIndustry' });
    const adv = client.pitAdvancePercent != null
      ? `${client.pitAdvancePercent}%${client.pitAdvanceFrequency ? ` · ${VAT_FREQ_LABELS[client.pitAdvanceFrequency]}` : ''}`
      : null;
    facts.push({ k: 'שיעור מקדמות', v: client.pitAdvancePercent != null ? `${client.pitAdvancePercent}%` : EMPTY, editKey: 'pitAdvancePercent', syncKey: 'pitAdvancePercent' });
    facts.push({
      k: 'תדירות מקדמות',
      v: client.pitAdvanceFrequency ? VAT_FREQ_LABELS[client.pitAdvanceFrequency] : EMPTY,
      editKey: 'pitAdvanceFrequency',
      syncKey: 'pitAdvanceFrequency',
    });
    const bal = balanceText(client.incomeTaxBalance);
    facts.push(bal ? { k: 'יתרה', v: bal.text, tone: bal.tone, editKey: 'incomeTaxBalance' } : { k: 'יתרה', v: EMPTY, editKey: 'incomeTaxBalance' });
    if (client.incomeTaxReportingStatus) {
      const ok = client.incomeTaxReportingStatus.trim() === 'אין דיווחים חסרים';
      facts.push({ k: 'מצב דיווחים', v: client.incomeTaxReportingStatus, tone: ok ? 'ok' : 'warn', editKey: 'incomeTaxReportingStatus' });
    } else {
      facts.push({ k: 'מצב דיווחים', v: EMPTY, editKey: 'incomeTaxReportingStatus' });
    }
    if (client.capitalDeclarationRequired != null) {
      facts.push(client.capitalDeclarationRequired
        ? { k: 'הצהרת הון', tone: 'warn', editKey: 'capitalDeclarationRequired',
            v: `דרישה פתוחה${client.capitalDeclarationDeadline ? ` · עד ${shortDate(client.capitalDeclarationDeadline)}` : ''}` }
        : { k: 'הצהרת הון', v: 'אין דרישה פתוחה', tone: 'ok', editKey: 'capitalDeclarationRequired' });
    } else {
      facts.push({ k: 'הצהרת הון', v: EMPTY, editKey: 'capitalDeclarationRequired' });
    }
    if (client.withholdingStatus) {
      const t = WITHHOLDING_LABELS[client.withholdingStatus];
      facts.push({ k: 'ניכוי מס במקור',
        v: client.withholdingStatus === 'rates' && client.withholdingDetail ? `${t} · ${client.withholdingDetail}` : t,
        tone: client.withholdingStatus === 'none' ? 'warn' : 'ok', editKey: 'withholdingStatus' });
    } else {
      facts.push({ k: 'ניכוי מס במקור', v: EMPTY, editKey: 'withholdingStatus' });
    }
    if (client.bookStatus && client.bookStatus !== 'unknown') {
      facts.push({ k: 'ניהול ספרים', v: client.bookStatus === 'kosher' ? 'תקין' : 'נפסל',
        tone: client.bookStatus === 'kosher' ? 'ok' : 'warn', editKey: 'bookStatus' });
    } else {
      facts.push({ k: 'ניהול ספרים', v: EMPTY, editKey: 'bookStatus' });
    }
    const auth = authText(client.incomeTaxDebitAuthorization);
    facts.push(auth ? { k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone, editKey: 'incomeTaxDebitAuthorization' } : { k: 'הרשאה לחיוב', v: EMPTY, editKey: 'incomeTaxDebitAuthorization' });
    // ‼ שע״ם היא הרשאה אחת לכל הרשויות ולכן יושבת כאן בלבד, לא בכל שורה.
    facts.push({ k: 'הרשאת שע״ם', v: client.shaamStatus ? SHAAM_STATUS_LABELS[client.shaamStatus] : EMPTY });
    const rep = repOf('income_tax');
    facts.push(rep ? { k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined } : { k: 'ייצוג', v: EMPTY });

    let exception: AuthorityException | null = null;
    if (client.withholdingStatus === 'none') exception = { text: 'אין אישור ניכוי במקור', tone: 'high' };
    else if (client.bookStatus === 'rejected') exception = { text: 'ניהול ספרים נפסל', tone: 'high' };
    else if (client.capitalDeclarationRequired) {
      exception = { text: `הצהרת הון${client.capitalDeclarationDeadline ? ` עד ${shortDate(client.capitalDeclarationDeadline)}` : ''}`, tone: 'warn' };
    }

    rows.push({
      authority: 'income_tax', name: TAX_AUTHORITY_LABELS.income_tax,
      summary: join([adv ? `מקדמות ${adv}` : null, bal?.text])
        || (household.holder === 'spouse' ? `תיק משותף · בכרטיס של ${spouseLabel}` : null)
        || 'טרם נאספו נתונים',
      exception, facts, present: facts.length > 0 || household.holder === 'spouse',
    });
  }

  // ── מע״מ ──
  // ‼ מבנה קבוע, כמו במס הכנסה: **כל** השדות נרשמים תמיד, וריק נראה «—».
  // קודם הם נדחפו בתנאי, ולכן שדה חסר פשוט נעלם — והכרטיס שהרו"ח קורא בו
  // את מצב התיק הסתיר בדיוק את מה שבאים לבדוק. «אין ערך» הוא מידע.
  //
  // ‼ הופעת **הכרטיס** לא השתנתה: `present` נגזר מהנתונים עצמם ולא מאורך
  // הרשימה. אחרת לקוח בלי מע״מ בכלל היה מקבל כרטיס ריק חדש.
  {
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('vat');
    const vatViaSpouse = !num ? viaSpouse('vat') : null;
    const freq = client.vatFrequency ? VAT_FREQ_LABELS[client.vatFrequency] : null;
    const bal = balanceText(client.vatBalance);
    const auth = authText(client.vatDebitAuthorization);
    const rep = repOf('vat');

    // ‼ «מספר עוסק» ו«ייצוג» נגזרים מ-taxFiles ולכן נשארים לקריאה — בדיוק
    // כמו «מספר תיק» במס הכנסה. שאר השדות הם עובדות מנוהלות עם מסלול
    // כתיבה קיים, ולכן נערכים במקום.
    facts.push({ k: 'מספר עוסק', v: num || EMPTY });
    facts.push({ k: 'סוג תיק', v: client.vatFileType || EMPTY, editKey: 'vatFileType' });
    facts.push({ k: 'תאריך פתיחה', v: client.vatOpeningDate ? shortDate(client.vatOpeningDate) : EMPTY, editKey: 'vatOpeningDate' });
    facts.push({ k: 'ענף עיקרי', v: client.vatPrimaryIndustry || EMPTY, editKey: 'vatPrimaryIndustry' });
    facts.push({ k: 'תדירות דיווח', v: freq || EMPTY, editKey: 'vatFrequency' });
    facts.push({ k: 'דוח אחרון שהוגש', v: client.vatLastReportPeriod || EMPTY, editKey: 'vatLastReportPeriod' });
    facts.push(bal
      ? { k: 'יתרה', v: bal.text, tone: bal.tone, editKey: 'vatBalance' }
      : { k: 'יתרה', v: EMPTY, editKey: 'vatBalance' });
    facts.push(auth
      ? { k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone, editKey: 'vatDebitAuthorization' }
      : { k: 'הרשאה לחיוב', v: EMPTY, editKey: 'vatDebitAuthorization' });
    // ‼ שורת ייצוג אחת בלבד. קודם «ייצוג» יכול היה להופיע פעמיים — פעם דרך
    // בן/בת הזוג ופעם מהתיק עצמו — ושתי שורות באותו שם באותו כרטיס נקראות
    // כסתירה.
    facts.push(rep
      ? { k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined }
      : vatViaSpouse ? { k: 'ייצוג', v: vatViaSpouse, tone: 'ok' } : { k: 'ייצוג', v: EMPTY });

    rows.push({
      authority: 'vat', name: TAX_AUTHORITY_LABELS.vat,
      summary: join([client.vatFileType, freq ? `דיווח ${freq}` : null,
        client.vatLastReportPeriod ? `דוח אחרון ${client.vatLastReportPeriod}` : null])
        || vatViaSpouse || 'טרם נאספו נתונים',
      exception: (client.vatBalance ?? 0) > 0 ? { text: `חוב ${money(client.vatBalance)}`, tone: 'high' } : null,
      facts,
      present: !!num || !!client.vatFileType || !!client.vatOpeningDate || !!client.vatPrimaryIndustry
        || !!freq || !!client.vatLastReportPeriod || !!bal || !!auth || !!rep || !!vatViaSpouse,
    });
  }

  // ── ביטוח לאומי ──
  // ‼ אותו מבנה קבוע כמו מע״מ ומס הכנסה — ראה ההערה בסעיף מע״מ.
  {
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('national_insurance');
    const occ = client.niOccupations ?? [];
    const bal = balanceText(client.niBalance);
    const auth = authText(client.niDebitAuthorization);
    const rep = repOf('national_insurance');
    // ‼ אין כאן נתון תפעולי משלו/ה (מקדמה, יתרה...) — אבל ייתכן שהייצוג
    // עצמו כבר הושג דרך בן/בת הזוג המקושר/ת. "אין נתונים" ו"לא מיוצג" הם
    // שני דברים שונים; הראשון לא אמור להישמע כמו השני.
    // ‼ נגזר מהנתונים ולא מאורך רשימת השדות — מאז שהשדות נרשמים תמיד,
    // «הרשימה ריקה» כבר לא מעיד על היעדר נתון.
    const hasOwnData = !!num || occ.length > 0 || client.niIncomeBasisMonthly != null
      || client.niAdvanceMonthly != null || !!bal || !!auth;
    const niViaSpouse = !hasOwnData ? viaSpouse('national_insurance') : null;

    // ‼ «מספר תיק» ו«ייצוג» נגזרים מ-taxFiles ⇒ לקריאה. «עיסוקים» הוא רשימה
    // (niOccupations) שנערכת בעורך הייעודי שלה במסך יישור הקו — תא בודד
    // בכרטיס אינו יכול לייצג אותה, ולכן היא נשארת לקריאה כאן.
    facts.push({ k: 'מספר תיק', v: num || EMPTY });
    facts.push({ k: 'עיסוקים', v: occ.length ? `${occ.length} עיסוקים` : EMPTY });
    facts.push({
      k: 'בסיס למקדמות',
      v: client.niIncomeBasisMonthly != null ? `${money(client.niIncomeBasisMonthly)} לחודש` : EMPTY,
      editKey: 'niIncomeBasisMonthly',
    });
    facts.push({
      k: 'מקדמה חודשית',
      v: client.niAdvanceMonthly != null ? money(client.niAdvanceMonthly) : EMPTY,
      editKey: 'niAdvanceMonthly',
    });
    // ‼ השדה היחיד בביטוח לאומי שיש לו כרגע מקור ודאי בפורטל, ולכן היחיד
    // שמקבל כפתור קריאה. ‼ הכפתור **וגם** העריכה — הקריאה מהרשות אינה
    // מחליפה את היכולת לתקן ידנית, בדיוק כמו «פקיד שומה» במס הכנסה.
    facts.push(bal
      ? { k: 'יתרה', v: bal.text, tone: bal.tone, btlSyncKey: 'niBalance', editKey: 'niBalance' }
      : { k: 'יתרה', v: EMPTY, btlSyncKey: 'niBalance', editKey: 'niBalance' });
    facts.push(auth
      ? { k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone, editKey: 'niDebitAuthorization' }
      : { k: 'הרשאה לחיוב', v: EMPTY, editKey: 'niDebitAuthorization' });
    facts.push(rep
      ? { k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined }
      : niViaSpouse ? { k: 'ייצוג', v: niViaSpouse, tone: 'ok' } : { k: 'ייצוג', v: EMPTY });

    rows.push({
      authority: 'national_insurance', name: TAX_AUTHORITY_LABELS.national_insurance,
      summary: join([
        client.niAdvanceMonthly != null ? `מקדמה ${money(client.niAdvanceMonthly)}` : null,
        bal?.text,
      ]) || (niViaSpouse ? niViaSpouse : null) || 'טרם נאספו נתונים',
      exception: client.niDebitAuthorization === false ? { text: 'אין הרשאה לחיוב', tone: 'warn' } : null,
      facts, present: hasOwnData || !!rep || !!niViaSpouse,
    });
  }

  // ── ניכויים — ‼ רק כשיש תיק ניכויים בפועל. לקוח בלי עובדים לא מקבל שורה ריקה. ──
  {
    // ‼ אותו מבנה קבוע כמו שאר הרשויות — ראה ההערה בסעיף מע״מ.
    const dedFiles = filesOf('deductions');
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('deductions');
    const rep = repOf('deductions');
    const dedViaSpouse = !num && !rep ? viaSpouse('deductions') : null;

    facts.push({ k: 'תיק ניכויים', v: num || EMPTY });
    facts.push({
      k: 'שיעור ניכוי',
      v: client.withholdingRate != null ? `${client.withholdingRate}%` : EMPTY,
      editKey: 'withholdingRate',
    });
    // ‼ «תוקף האישור» נשאר לקריאה בלבד: withholdingValidUntil אינו עובדה
    // מנוהלת (אינו ב-GOVERNED_FACT_KEYS), ולכן אין לו מסלול כתיבה עם
    // פרובננס. עריכה כאן הייתה עוקפת את ההיסטוריה בשקט.
    facts.push({ k: 'תוקף האישור', v: client.withholdingValidUntil ? shortDate(client.withholdingValidUntil) : EMPTY });
    facts.push(rep
      ? { k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined }
      : dedViaSpouse ? { k: 'ייצוג', v: dedViaSpouse, tone: 'ok' } : { k: 'ייצוג', v: EMPTY });

    rows.push({
      authority: 'deductions', name: TAX_AUTHORITY_LABELS.deductions,
      summary: join([num ? `תיק ${num}` : null,
        client.withholdingRate != null ? `ניכוי ${client.withholdingRate}%` : null])
        || dedViaSpouse || 'טרם נאספו נתונים',
      exception: null, facts,
      // ‼ נגזר מהנתונים ולא מאורך הרשימה: לקוח בלי עובדים עדיין לא מקבל
      // כרטיס ניכויים ריק.
      present: dedFiles.length > 0 || !!num || client.withholdingRate != null
        || !!client.withholdingValidUntil || !!rep || !!dedViaSpouse,
    });
  }

  // ‼ «טרם נאספו נתונים» על שורה שיש בה עובדות הוא שקר קטן: הרו"ח קורא
  // שורה ריקה וממשיך, בזמן שהנתון קיים בפנים. כשהתקציר המתוכנן לא נבנה —
  // מציגים את מה שכן ידוע, ולא הצהרה על היעדר.
  // ‼ שדות ריקים מדולגים כאן: מאז שהמבנה קבוע, «—» הוא ערך לגיטימי בשורה
  // אבל חסר ערך בתקציר. בלי הסינון התקציר היה נקרא «מספר עוסק: — · סוג
  // תיק: —» — הצהרה על היעדר שתופסת את המקום של מה שכן ידוע.
  return rows.filter(r => r.present).map(r => r.summary !== 'טרם נאספו נתונים' ? r : {
    ...r,
    summary: r.facts.filter(f => f.v !== EMPTY).slice(0, 2).map(f => `${f.k}: ${f.v}`).join(' · ') || r.summary,
  });
}
