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
  facts: { k: string; v: string; tone?: 'warn' | 'ok' }[];
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
    facts.push({ k: 'סוג תיק', v: fileTypeText(client.incomeTaxFileType) });
    facts.push({ k: 'פקיד שומה', v: client.taxOfficeName || EMPTY });
    facts.push({ k: 'חוליה', v: client.incomeTaxUnit || EMPTY });
    facts.push({ k: 'ענף כלכלי', v: client.incomeTaxEconomicIndustry || EMPTY });
    const adv = client.pitAdvancePercent != null
      ? `${client.pitAdvancePercent}%${client.pitAdvanceFrequency ? ` · ${VAT_FREQ_LABELS[client.pitAdvanceFrequency]}` : ''}`
      : null;
    facts.push({ k: 'שיעור מקדמות', v: client.pitAdvancePercent != null ? `${client.pitAdvancePercent}%` : EMPTY });
    facts.push({
      k: 'תדירות מקדמות',
      v: client.pitAdvanceFrequency ? VAT_FREQ_LABELS[client.pitAdvanceFrequency] : EMPTY,
    });
    const bal = balanceText(client.incomeTaxBalance);
    facts.push(bal ? { k: 'יתרה', v: bal.text, tone: bal.tone } : { k: 'יתרה', v: EMPTY });
    if (client.incomeTaxReportingStatus) {
      const ok = client.incomeTaxReportingStatus.trim() === 'אין דיווחים חסרים';
      facts.push({ k: 'מצב דיווחים', v: client.incomeTaxReportingStatus, tone: ok ? 'ok' : 'warn' });
    } else {
      facts.push({ k: 'מצב דיווחים', v: EMPTY });
    }
    if (client.capitalDeclarationRequired != null) {
      facts.push(client.capitalDeclarationRequired
        ? { k: 'הצהרת הון', tone: 'warn',
            v: `דרישה פתוחה${client.capitalDeclarationDeadline ? ` · עד ${shortDate(client.capitalDeclarationDeadline)}` : ''}` }
        : { k: 'הצהרת הון', v: 'אין דרישה פתוחה', tone: 'ok' });
    } else {
      facts.push({ k: 'הצהרת הון', v: EMPTY });
    }
    if (client.withholdingStatus) {
      const t = WITHHOLDING_LABELS[client.withholdingStatus];
      facts.push({ k: 'ניכוי מס במקור',
        v: client.withholdingStatus === 'rates' && client.withholdingDetail ? `${t} · ${client.withholdingDetail}` : t,
        tone: client.withholdingStatus === 'none' ? 'warn' : 'ok' });
    } else {
      facts.push({ k: 'ניכוי מס במקור', v: EMPTY });
    }
    if (client.bookStatus && client.bookStatus !== 'unknown') {
      facts.push({ k: 'ניהול ספרים', v: client.bookStatus === 'kosher' ? 'תקין' : 'נפסל',
        tone: client.bookStatus === 'kosher' ? 'ok' : 'warn' });
    } else {
      facts.push({ k: 'ניהול ספרים', v: EMPTY });
    }
    const auth = authText(client.incomeTaxDebitAuthorization);
    facts.push(auth ? { k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone } : { k: 'הרשאה לחיוב', v: EMPTY });
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
  {
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('vat');
    if (num) facts.push({ k: 'מספר עוסק', v: num });
    const vatViaSpouse = !num ? viaSpouse('vat') : null;
    if (vatViaSpouse) facts.push({ k: 'ייצוג', v: vatViaSpouse, tone: 'ok' });
    if (client.vatFileType) facts.push({ k: 'סוג תיק', v: client.vatFileType });
    if (client.vatOpeningDate) facts.push({ k: 'תאריך פתיחה', v: shortDate(client.vatOpeningDate) });
    if (client.vatPrimaryIndustry) facts.push({ k: 'ענף עיקרי', v: client.vatPrimaryIndustry });
    const freq = client.vatFrequency ? VAT_FREQ_LABELS[client.vatFrequency] : null;
    if (freq) facts.push({ k: 'תדירות דיווח', v: freq });
    if (client.vatLastReportPeriod) facts.push({ k: 'דוח אחרון שהוגש', v: client.vatLastReportPeriod });
    const bal = balanceText(client.vatBalance);
    if (bal) facts.push({ k: 'יתרה', v: bal.text, tone: bal.tone });
    const auth = authText(client.vatDebitAuthorization);
    if (auth) facts.push({ k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone });
    const rep = repOf('vat');
    if (rep) facts.push({ k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined });

    rows.push({
      authority: 'vat', name: TAX_AUTHORITY_LABELS.vat,
      summary: join([client.vatFileType, freq ? `דיווח ${freq}` : null,
        client.vatLastReportPeriod ? `דוח אחרון ${client.vatLastReportPeriod}` : null])
        || vatViaSpouse || 'טרם נאספו נתונים',
      exception: (client.vatBalance ?? 0) > 0 ? { text: `חוב ${money(client.vatBalance)}`, tone: 'high' } : null,
      facts, present: facts.length > 0,
    });
  }

  // ── ביטוח לאומי ──
  {
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('national_insurance');
    if (num) facts.push({ k: 'מספר תיק', v: num });
    const occ = client.niOccupations ?? [];
    if (occ.length) {
      facts.push({ k: 'עיסוקים', v: `${occ.length} עיסוקים` });
    }
    if (client.niIncomeBasisMonthly != null) {
      facts.push({ k: 'בסיס למקדמות', v: `${money(client.niIncomeBasisMonthly)} לחודש` });
    }
    if (client.niAdvanceMonthly != null) facts.push({ k: 'מקדמה חודשית', v: money(client.niAdvanceMonthly) });
    const bal = balanceText(client.niBalance);
    if (bal) facts.push({ k: 'יתרה', v: bal.text, tone: bal.tone });
    const auth = authText(client.niDebitAuthorization);
    if (auth) facts.push({ k: 'הרשאה לחיוב', v: auth.text, tone: auth.tone });
    // ‼ אין כאן נתון תפעולי משלו/ה (מקדמה, יתרה...) — אבל ייתכן שהייצוג
    // עצמו כבר הושג דרך בן/בת הזוג המקושר/ת. "אין נתונים" ו"לא מיוצג" הם
    // שני דברים שונים; הראשון לא אמור להישמע כמו השני.
    const niViaSpouse = facts.length === 0 ? viaSpouse('national_insurance') : null;
    if (niViaSpouse) facts.push({ k: 'ייצוג', v: niViaSpouse, tone: 'ok' });

    rows.push({
      authority: 'national_insurance', name: TAX_AUTHORITY_LABELS.national_insurance,
      summary: join([
        client.niAdvanceMonthly != null ? `מקדמה ${money(client.niAdvanceMonthly)}` : null,
        bal?.text,
      ]) || (niViaSpouse ? niViaSpouse : null) || 'טרם נאספו נתונים',
      exception: client.niDebitAuthorization === false ? { text: 'אין הרשאה לחיוב', tone: 'warn' } : null,
      facts, present: facts.length > 0,
    });
  }

  // ── ניכויים — ‼ רק כשיש תיק ניכויים בפועל. לקוח בלי עובדים לא מקבל שורה ריקה. ──
  {
    const dedFiles = filesOf('deductions');
    const facts: AuthorityRow['facts'] = [];
    const num = numbersOf('deductions');
    if (num) facts.push({ k: 'תיק ניכויים', v: num });
    if (client.withholdingRate != null) facts.push({ k: 'שיעור ניכוי', v: `${client.withholdingRate}%` });
    if (client.withholdingValidUntil) facts.push({ k: 'תוקף האישור', v: shortDate(client.withholdingValidUntil) });
    const rep = repOf('deductions');
    if (rep) facts.push({ k: 'ייצוג', v: rep, tone: rep === 'ייצוג פעיל' ? 'ok' : undefined });
    const dedViaSpouse = !num && !rep ? viaSpouse('deductions') : null;
    if (dedViaSpouse) facts.push({ k: 'ייצוג', v: dedViaSpouse, tone: 'ok' });

    rows.push({
      authority: 'deductions', name: TAX_AUTHORITY_LABELS.deductions,
      summary: join([num ? `תיק ${num}` : null,
        client.withholdingRate != null ? `ניכוי ${client.withholdingRate}%` : null])
        || dedViaSpouse || 'טרם נאספו נתונים',
      exception: null, facts,
      present: dedFiles.length > 0 || facts.length > 0 || !!dedViaSpouse,
    });
  }

  // ‼ «טרם נאספו נתונים» על שורה שיש בה עובדות הוא שקר קטן: הרו"ח קורא
  // שורה ריקה וממשיך, בזמן שהנתון קיים בפנים. כשהתקציר המתוכנן לא נבנה —
  // מציגים את מה שכן ידוע, ולא הצהרה על היעדר.
  return rows.filter(r => r.present).map(r => r.summary !== 'טרם נאספו נתונים' ? r : {
    ...r,
    summary: r.facts.slice(0, 2).map(f => `${f.k}: ${f.v}`).join(' · ') || r.summary,
  });
}
