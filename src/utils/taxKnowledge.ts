// ─── מה אנחנו יודעים על הלקוח, ומה עוד לא ─────────────────────────────────
// מקור UX מחייב: docs/prototypes/tax-file-v6-living-tax-file.html
// רקע והכרעות: docs/TAX-FILE-V6-READINESS.md §D-E
//
// ‼ הרעיון המרכזי: **אין טרי-סטייט על כל בוליאני.** `client.fieldMeta` נכתב
// אך ורק דרך ה-RPC המבוקר של העובדות המנוהלות, ושמירה רגילה מוציאה אותו
// במפורש (ClientWorkspace: `plainClientRec.fieldMeta = undefined`). לכן עצם
// קיום הרשומה הוא העדות ש**מישהו קבע** את הערך:
//
//   אין רשומה   ⇒ טרם ביררנו   (גם אם הערך false — newEmptyClient כותב false
//                                לשדות שאיש לא נשאל עליהם)
//   יש + ערך    ⇒ ידוע
//   יש + falsy  ⇒ ידוע שאין
//   syncedAt ישן ⇒ מיושן
//
// ‼ ומה שלא פחות חשוב: המצב "טרם ביררנו" מוצג **רק על דומייני V6 המהותיים**
// (DOMAINS למטה), ולא על כל שדה בכרטיס. אחרת 22 הלקוחות הקיימים — שלכולם
// אין כמעט field_meta — היו נראים קטסטרופליים ביום ההשקה.

import type { Client } from '../types';

export type KnowledgeState = 'known' | 'none' | 'stale' | 'unknown';

/** קבוצת טריות — כמה זמן ערך נחשב עדכני. הכרעת גיא, V1. */
export type FreshnessGroup = 'balance' | 'certificate' | 'standard';

const FRESHNESS_DAYS: Record<FreshnessGroup, number> = {
  balance: 90,      // יתרות ומצב דיווחים — זזים מעצמם
  certificate: 0,   // נגזר מ-validUntil בפועל, לא מגיל הרשומה
  standard: 365,    // שאר עובדות המס — מחזור שנתי
};

export interface TaxDomain {
  key: string;
  label: string;
  /** השדה שקיומו ב-fieldMeta מעיד שהדומיין נשאל ונענה. */
  anchor: keyof Client & string;
  group: FreshnessGroup;
  /** רלוונטי ללקוח הזה בכלל? דומיין לא רלוונטי אינו "חסר". */
  relevant?: (c: Client) => boolean;
  /** האם משפיע מהותית על הערכת מס. משמש למדד המוכנות. */
  material: boolean;
  /** באיזו קבוצה במסך השורה יושבת כשהיא לא-ידועה. */
  section: 'income' | 'family' | 'assets' | 'deposits';
  /** מה חסר בפועל — מה שהרו"ח יראה כשיפתח שורה שטרם בוררה. */
  missing: string;
}

/**
 * דומייני V6. ‼ מכוון: זו רשימה קצרה של מה שמשנה להערכת מס — לא מיפוי של
 * כל הכרטיס. הרחבה כאן היא החלטת מוצר, לא תוספת טכנית.
 */
export const TAX_DOMAINS: TaxDomain[] = [
  { key: 'capital',    label: 'שוק ההון',          anchor: 'hasInvestments',           group: 'standard', material: true, section: 'assets', missing: 'תיקי השקעות · אישורי 867 · רווחי הון ודיבידנד' },
  { key: 'crypto',     label: 'קריפטו',             anchor: 'hasCrypto',                group: 'standard', material: true, section: 'assets', missing: 'החזקה במטבעות דיגיטליים ומכירות בשנת המס' },
  { key: 'realestate', label: 'נדל״ן',              anchor: 'hasResidentialProperty',   group: 'standard', material: true, section: 'assets', missing: 'בעלות על נכסי מקרקעין' },
  { key: 'rental',     label: 'שכירות',             anchor: 'hasRentalIncome',          group: 'standard', material: true, section: 'income', missing: 'הכנסות משכירות ומסלול המיסוי' },
  { key: 'pension',    label: 'פנסיה והשתלמות',     anchor: 'hasPension',               group: 'standard', material: true, section: 'deposits', missing: 'קופות פנסיה, השתלמות וביטוחים - משפיע ישירות על הזיכויים' },
  { key: 'foreign',    label: 'פעילות בחו״ל',       anchor: 'hasForeignAssets',         group: 'standard', material: true, section: 'assets', missing: 'נכסים, חשבונות או הכנסות מחוץ לישראל' },
  { key: 'donations',  label: 'תרומות',             anchor: 'donationsAnnual',          group: 'standard', material: true, section: 'deposits', missing: 'תרומות למוסדות מוכרים לפי סעיף 46' },
  { key: 'reserve',    label: 'מילואים',            anchor: 'reserveCombatDaysPrevYear', group: 'standard', material: true, section: 'family', missing: 'ימי מילואים כלוחם בשנה הקודמת - מזכים בנקודות זיכוי' },
  { key: 'insurance',  label: 'ביטוחי חיים ואכ״ע',  anchor: 'hasLifeInsurance',         group: 'standard', material: false, section: 'deposits', missing: 'ביטוח חיים ואובדן כושר עבודה' },
];

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** האם הערך עצמו "יש" או "אין" — falsy/ריק/מערך ריק נחשב "אין". */
function valuePresent(v: unknown): boolean {
  if (v === undefined || v === null || v === '' || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  return true;
}

/**
 * מצב הידיעה של שדה בודד.
 * ‼ הבדיקה הראשונה היא על ה-meta ולא על הערך — זה כל ההבדל בין
 * "אין ללקוח" ל"לא שאלנו".
 */
export function fieldKnowledge(
  client: Client,
  key: string,
  group: FreshnessGroup = 'standard',
): KnowledgeState {
  const meta = client.fieldMeta?.[key];
  if (!meta || !meta.syncedAt) return 'unknown';

  if (group === 'certificate') {
    if (meta.validUntil) {
      const until = new Date(meta.validUntil).getTime();
      if (!Number.isNaN(until) && until < Date.now()) return 'stale';
    }
  } else {
    const age = daysSince(meta.syncedAt);
    if (age !== null && age > FRESHNESS_DAYS[group]) return 'stale';
  }

  const raw = (client as unknown as Record<string, unknown>)[key];
  return valuePresent(raw) ? 'known' : 'none';
}

export interface DomainKnowledge extends TaxDomain {
  state: KnowledgeState;
  /** מתי נקבע לאחרונה — לתצוגת "עודכן". */
  syncedAt?: string;
}

export function domainKnowledge(client: Client): DomainKnowledge[] {
  return TAX_DOMAINS
    .filter(d => !d.relevant || d.relevant(client))
    .map(d => ({
      ...d,
      state: fieldKnowledge(client, d.anchor, d.group),
      syncedAt: client.fieldMeta?.[d.anchor]?.syncedAt,
    }));
}

// ─── מוכנות להערכת מס ──────────────────────────────────────────────────────
// ‼ שני מדדים נפרדים ולעולם לא ציון אחד. הם עונים על שתי שאלות שונות:
// "מה אני צריך לשאול את הלקוח" מול "על מה אני ממתין מבחוץ" — שתי פעולות
// שונות לגמרי, ומיזוג היה מוחק בדיוק את ההבדל.

/** האם ללקוח יש בכלל פעילות עסקית — קובע אם שורת "נתוני העסק" מוצגת. */
export function hasBusinessActivity(client: Client): boolean {
  return (client.businesses ?? []).length > 0
    || client.incomeTaxType === 'selfEmployed'
    || client.incomeTaxType === 'both'
    || client.vatStatus === 'authorizedDealer'
    || client.vatStatus === 'exemptDealer';
}

export type BusinessDataState = 'not_applicable' | 'received' | 'waiting';

/**
 * מצב נתוני ההנהלה. ‼ אין אינטגרציה לפייפרלס, ולכן זה **סימון** ולא ייבוא:
 * סימון ידני בכרטיס גובר; אחרת נגזר משלב data_verification בקליטה; אחרת
 * "ממתין". אין כאן העמדת פנים שהנתונים כאן.
 */
export function businessDataState(
  client: Client,
  steps?: { stepType: string; status: string }[],
): BusinessDataState {
  if (!hasBusinessActivity(client)) return 'not_applicable';
  if (client.businessDataStatus === 'received') return 'received';
  if (client.businessDataStatus === 'not_applicable') return 'not_applicable';
  if (client.businessDataStatus === 'waiting') return 'waiting';
  const verified = (steps ?? []).some(
    s => s.stepType === 'data_verification' && (s.status === 'completed' || s.status === 'verified'),
  );
  return verified ? 'received' : 'waiting';
}

export interface Readiness {
  /** צד תיק המס — מה שתלוי בנו ובלקוח. */
  personal: { ok: boolean; unknown: string[]; stale: string[] };
  /** צד ההנהלה — תלות חיצונית. null = ללקוח אין עסק. */
  business: BusinessDataState | null;
}

export function taxReadiness(
  client: Client,
  steps?: { stepType: string; status: string }[],
): Readiness {
  const doms = domainKnowledge(client).filter(d => d.material);
  const unknown = doms.filter(d => d.state === 'unknown').map(d => d.label);
  const stale = doms.filter(d => d.state === 'stale').map(d => d.label);
  const bState = businessDataState(client, steps);
  return {
    personal: { ok: unknown.length === 0 && stale.length === 0, unknown, stale },
    business: bState === 'not_applicable' && !hasBusinessActivity(client) ? null : bState,
  };
}

export const BUSINESS_STATE_LABELS: Record<BusinessDataState, string> = {
  received: 'התקבלו',
  waiting: 'ממתין לנתוני הנהלת החשבונות',
  not_applicable: 'לא רלוונטי',
};
