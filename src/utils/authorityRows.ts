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
import {
  niPersons, niFactsOf, niFileOf, niFieldKeys, niEditable, niRepresentationOf, niRepresentationAction,
} from './niPersons';
import type { NiExecutionByRole, NiRepresentationAction } from './niPersons';
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
  /**
   * `taxFileNumberAuthority` — קיים על שורת «מספר תיק/עוסק» כשהערך נגזר
   * מ-`taxFiles`, לא משדה שטוח על הלקוח. אין לזה `editKey` (אין שדה כזה
   * ב-editModel — המבנה הוא רשימה), ולכן המסך צריך לדעת בנפרד: זו עדיין
   * שורה הניתנת לעריכה, רק דרך מסלול `taxFiles` ולא דרך `EDIT_FIELD_BY_KEY`.
   */
  facts: AuthorityRowFact[];
  /**
   * שני האנשים של כרטיס ב"ל, כשיש בן/בת זוג לזהות (154) — ‼ קיים **רק**
   * על `national_insurance`. `facts` למעלה נשאר זהה לעובדות של הלקוח עצמו
   * (תאימות: כך שהאוטומציה שקוראת `row.facts` לא צריכה לדעת על אנשים).
   * `persons[0]` תמיד שווה למה ש-`facts` מתאר; `persons[1]` (אם קיים) הוא
   * בן/בת הזוג. ראה `utils/niPersons.ts`.
   */
  persons?: AuthorityRowPerson[];
  /** יש בכלל מה להציג על הרשות הזו. רשות בלי תיק ובלי נתון אינה שורה. */
  present: boolean;
}

export interface AuthorityRowFact {
  k: string; v: string; tone?: 'warn' | 'ok';
  syncKey?: string; btlSyncKey?: string; editKey?: string;
  taxFileNumberAuthority?: TaxAuthority;
  /** מספר התיק שייך לאיזה owner ב-taxFiles. חסר = 'client' (ברירת המחדל של כל הרשויות מלבד ב"ל). */
  taxFileNumberOwner?: 'client' | 'spouse';
  /**
   * פעולה ליד שורת "ייצוג" בב"ל — 'add' ("בקש ייצוג", מוסיף target
   * ל-authorityRepresentations + טיוטת taxFiles, בלי לגעת בבקשה) או
   * 'continue' ("המשך במרכז הייצוג"). קיים **רק** על שורת «ייצוג».
   * ראה docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md.
   */
  niRepAction?: NiRepresentationAction;
}

export interface AuthorityRowPerson {
  role: 'client' | 'spouse';
  name: string;
  idNumber: string;
  /** false = הנתונים בכרטיס בן/בת הזוג המקושר — לקריאה בלבד כאן. */
  editable: boolean;
  facts: AuthorityRowFact[];
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
export function buildAuthorityRows(
  client: Client, spouseClient?: Client, niExecution?: NiExecutionByRole,
): AuthorityRow[] {
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
    facts.push({ k: 'מספר תיק', v: num || EMPTY, taxFileNumberAuthority: 'income_tax' });
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
    // ‼ syncKey נוסף לשורה הקיימת — לא שורה חדשה. עד עכשיו הוחסר בכוונה:
    // «יתרה» ב-134 היא יתרת חשבון המקדמות לשנה, לא יתרת חשבון מס הכנסה
    // הכללית שהשדה הזה מתאר, וההבדל הזה תועד במפורש (786468f). זו החלטת
    // מוצר מודעת למפות בכל זאת — לא תיקון של אותה הסתייגות.
    facts.push(bal
      ? { k: 'יתרה', v: bal.text, tone: bal.tone, editKey: 'incomeTaxBalance', syncKey: 'incomeTaxBalance' }
      : { k: 'יתרה', v: EMPTY, editKey: 'incomeTaxBalance', syncKey: 'incomeTaxBalance' });
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
    facts.push({
      k: 'מועד הצהרת הון',
      v: client.capitalDeclarationDeadline ? shortDate(client.capitalDeclarationDeadline) : EMPTY,
      editKey: 'capitalDeclarationDeadline',
    });
    if (client.withholdingStatus) {
      const t = WITHHOLDING_LABELS[client.withholdingStatus];
      facts.push({ k: 'ניכוי מס במקור',
        v: client.withholdingStatus === 'rates' && client.withholdingDetail ? `${t} · ${client.withholdingDetail}` : t,
        tone: client.withholdingStatus === 'none' ? 'warn' : 'ok', editKey: 'withholdingStatus' });
    } else {
      facts.push({ k: 'ניכוי מס במקור', v: EMPTY, editKey: 'withholdingStatus' });
    }
    facts.push({ k: 'פירוט ניכוי', v: client.withholdingDetail || EMPTY, editKey: 'withholdingDetail' });
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
    facts.push({ k: 'מספר עוסק', v: num || EMPTY, taxFileNumberAuthority: 'vat' });
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

  // ── ביטוח לאומי — לפי אדם (154, docs/PLAN-BTL-PER-PERSON.md) ──
  // ‼ לזוג נשוי, החמישה שדות התפעוליים, מספר התיק והייצוג נגזרים בנפרד
  // לכל אחד מבני הזוג דרך `utils/niPersons.ts` — הם אינם עוד סינגלטון
  // ברמת הכרטיס. `facts` נשאר תואם לאחור (=`persons[0]`, כלומר הלקוח עצמו)
  // כדי שהאוטומציה שממשיכה לקרוא `row.facts` תעבוד בדיוק כמו קודם.
  {
    // ‼ מחושב פעם אחת לכל אדם — עובדות, תיק וייצוג — ונקרא ממנו הלאה
    // (שורות, תקציר, חריגה, present) בלי לחשב שוב את אותו דבר פעמיים.
    const built = niPersons(client, spouseClient).map(person => {
      const rep = niRepresentationOf(person, client, spouseClient, niExecution);
      return {
        person,
        pf: niFactsOf(person, client),
        file: niFileOf(person, client),
        rep,
        niAction: niRepresentationAction(person, client, rep),
        editable: niEditable(person),
        keys: niFieldKeys(person, client),
      };
    });

    const personRows: AuthorityRowPerson[] = built.map(({ person, pf, file, rep, niAction, editable, keys }) => {
      const bal = balanceText(pf.balance);
      const auth = authText(pf.debitAuthorization);
      const facts: AuthorityRow['facts'] = [];

      // ‼ ת.ז. מוצגת כהקשר מזהה בלבד — לקריאה, לעולם לא לעריכה כאן, ולעולם
      // לא נגזר ממנה מספר התיק. שתי עובדות נפרדות באותה רשות. ‼ נשארת
      // בעובדות עצמן (לא רק בכותרת) כדי שלקוח/ה יחיד/ה — הענף ללא כותרת-שם
      // — ימשיך להראות אותה בדיוק כמו לפני 154; בבלוק-אדם עם כותרת היא
      // מוסתרת כפילות ב-TaxFileTab, לא כאן.
      facts.push({ k: 'ת.ז.', v: person.idNumber || EMPTY });
      facts.push({
        k: 'מספר תיק', v: file?.fileNumber || EMPTY,
        ...(editable ? { taxFileNumberAuthority: 'national_insurance' as TaxAuthority, taxFileNumberOwner: person.role } : {}),
      });
      // ‼ «עיסוקים» הוא רשימה (niOccupations/spouseNiOccupations) עם עורך
      // מובנה משלה — התיק מרכיב אותו בעצמו בעריכה, לכל אדם בנפרד.
      facts.push({ k: 'עיסוקים', v: pf.occupations.length ? `${pf.occupations.length} עיסוקים` : EMPTY });
      facts.push({
        k: 'בסיס למקדמות',
        v: pf.incomeBasisMonthly != null ? `${money(pf.incomeBasisMonthly)} לחודש` : EMPTY,
        ...(editable ? { editKey: keys.incomeBasisMonthly } : {}),
      });
      facts.push({
        k: 'מקדמה חודשית',
        v: pf.advanceMonthly != null ? money(pf.advanceMonthly) : EMPTY,
        ...(editable ? { editKey: keys.advanceMonthly } : {}),
      });
      // ‼ השדה היחיד בביטוח לאומי שיש לו כרגע מקור ודאי בפורטל (הלקוח
      // בלבד — האוטומציה עוד לא נתמכת לבן/בת הזוג), ולכן היחיד שמקבל
      // btlSyncKey. הכפתור **וגם** העריכה — הקריאה מהרשות אינה מחליפה
      // את היכולת לתקן ידנית.
      const balSync = editable && person.role === 'client' ? { btlSyncKey: keys.balance } : {};
      facts.push(bal
        ? { k: 'יתרה', v: bal.text, tone: bal.tone, ...balSync, ...(editable ? { editKey: keys.balance } : {}) }
        : { k: 'יתרה', v: EMPTY, ...balSync, ...(editable ? { editKey: keys.balance } : {}) });
      facts.push(auth
        ? { k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone, ...(editable ? { editKey: keys.debitAuthorization } : {}) }
        : { k: 'הרשאה לחיוב', v: EMPTY, ...(editable ? { editKey: keys.debitAuthorization } : {}) });
      // ‼ `detail` (אסמכתא/"טרם הוזן") מצטרף לערך עצמו, לא שורה נוספת —
      // בדיוק כמו כל שורת עובדה אחרת בכרטיס. `niRepAction` מוצג ליד
      // הערך ב-TaxFileTab, לא כאן (זו שכבת נתונים בלבד).
      facts.push({
        k: 'ייצוג', v: rep.detail ? `${rep.v} · ${rep.detail}` : rep.v, tone: rep.tone,
        ...(niAction ? { niRepAction: niAction } : {}),
      });

      return { role: person.role, name: person.name, idNumber: person.idNumber, editable, facts };
    });

    // ‼ שורת "אין הרשאה לחיוב" נשארת בדיוק כמו קודם ללקוח יחיד (בלי שם
    // מצורף — שינוי טקסט היה שובר את התאימות לכרטיס לא-נשוי). לבן/בת זוג
    // שם מצטרף, כדי שהחריגה תדע למי היא שייכת.
    const exception: AuthorityException | null = built
      .map(({ person, pf }, i): AuthorityException | null => pf.debitAuthorization === false
        ? { text: i === 0 ? 'אין הרשאה לחיוב' : `אין הרשאה לחיוב · ${person.name}`, tone: 'warn' }
        : null)
      .find((e): e is AuthorityException => e !== null) ?? null;

    // ‼ תקציר סגור: לקוח יחיד — בדיוק הטקסט הקודם, בלי שם (התאמה לאחור
    // מלאה לכרטיס לא-נשוי). זוג — שורה לכל אדם, כדי שהתשובה ל"של מי
    // הנתונים" תהיה קריאה גם בלי לפתוח.
    const personLine = ({ pf, rep }: (typeof built)[number]) =>
      join([pf.advanceMonthly != null ? `מקדמה ${money(pf.advanceMonthly)}` : null, balanceText(pf.balance)?.text])
      || (rep.represented ? rep.v : null);

    const summary = built.length === 1
      ? (personLine(built[0]) || 'טרם נאספו נתונים')
      : built.map((b, i) => `${personRows[i].name} · ${personLine(b) || 'לא מיוצג/ת'}`).join(' — ');

    // ‼ `!!file` (לא רק fileNumber): רשומת taxFiles קיימת היא כשלעצמה
    // "יש מה להציג" גם ברשות none — בדיוק ההתנהגות הקודמת, ש-`repOf` כבר
    // סיפקה כשהחזירה «אין ייצוג» עבור תיק ריק.
    const present = built.some(({ pf, file, rep }) =>
      !!file || pf.occupations.length > 0 || pf.incomeBasisMonthly != null
      || pf.advanceMonthly != null || pf.balance != null || pf.debitAuthorization != null
      || rep.represented);

    rows.push({
      authority: 'national_insurance', name: TAX_AUTHORITY_LABELS.national_insurance,
      summary, exception,
      facts: personRows[0].facts, persons: personRows,
      present,
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

    facts.push({ k: 'תיק ניכויים', v: num || EMPTY, taxFileNumberAuthority: 'deductions' });
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
