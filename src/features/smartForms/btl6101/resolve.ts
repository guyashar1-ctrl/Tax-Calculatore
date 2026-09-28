// ─── טופס 6101 — מאיפה כל ערך מגיע, ומה מצבו ────────────────────────────────
// שלושה עולמות נפרדים, ולא מערבבים ביניהם:
//   1. הכרטיס (Client) — המצב הקנוני במשרד.
//   2. מה שב"ל מחזיק — niOccupations/niIncomeBasisMonthly שנקראו מהפורטל
//      (source='btl_portal', field_meta.source='automation') — «המצב הנוכחי».
//   3. ההגשה — מה שמבקשים לשנות. ‼ לעולם לא נכתב לכרטיס בגלל טיוטה/חתימה.
//
// כל שדה מקבל סטטוס: מאומת · ישן · סותר · נגזר · חסר · לא רלוונטי · לאישור
// הלקוח · הוזן בהגשה. ‼ ריק ≠ אפס ≠ לא רלוונטי.

import type { Client, NiOccupation, NiOccupationBtlDetail } from '../../../types';
import { NI_HOURS_BAND_LABELS } from '../../../types';
import type { FieldMeta } from '../../../types/clientWorkspace';
import { FIELD_SOURCE_LABELS } from '../../../types/clientWorkspace';
import { isValidIsraeliId } from '../../../utils/israeliId';
import { niOccupationLabel, niOccupationOverlaps } from '../../nationalInsurance/niOccupations';
import type { Btl6101Data, Btl6101Purpose, MaritalStatus6101, OccupationRow6101 } from './model';
import { EMPTY_6101, sectionApplies } from './model';
import { parseHebrewAddress } from './address';
import { bandFromHours, evaluateSelfEmployedDefinition, hoursFromBand, type DefinitionVerdict } from './definition';
import { formDate, formMoney } from './layout6101';

export type FieldStatus =
  | 'verified'        // קיים בכרטיס/בב"ל ומוכן לשימוש
  | 'stale'           // קיים אבל ישן
  | 'conflict'        // שני מקורות אומרים דברים שונים / ערך לא תקין
  | 'derived'         // נגזר מנתון אחר — לאישור
  | 'missing'         // נדרש ואין
  | 'not_applicable'  // הסעיף לא רלוונטי לתרחיש
  | 'confirm'         // הצהרה — דורשת אישור מפורש של הלקוח
  | 'entered';        // הוזן בהגשה הזו

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  verified: 'מהכרטיס', stale: 'ישן', conflict: 'סותר', derived: 'נגזר — לאישור',
  missing: 'חסר', not_applicable: 'לא רלוונטי', confirm: 'לאישור הלקוח', entered: 'הוזן בהגשה',
};

export interface FieldState {
  key: string;
  status: FieldStatus;
  sourceLabel: string;
  sourceAt?: string;
  note?: string;
  /** ערך אחר שנמצא במקור אחר — מוצג לבחירה, לא נבחר אוטומטית. */
  alternatives?: { value: string; sourceLabel: string }[];
  required: boolean;
  /** האם הערך הזה (במצבו) דורש אישור הלקוח לפני חתימה. */
  needsClientConfirmation: boolean;
}

export interface Issue {
  key: string;
  severity: 'blocker' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface CurrentBtlState {
  /** מתי נקראו העיסוקים מב"ל (field_meta.niOccupations). */
  syncedAt?: string;
  syncedFromPortal: boolean;
  occupations: { label: string; from?: string; to?: string; source: 'btl_portal' | 'manual'; weeklyHours?: number; definitionIncome?: number; btlDetail?: NiOccupationBtlDetail }[];
  /**
   * העיסוק העצמאי הפתוח כרגע לפי ב"ל (או לפי הכרטיס). `btlDetail` — «פירוט
   * עיסוק» כפי שב"ל רשם (טווח שעות, הכנסה להגדרה, נוסח ההגדרה): **המצב הרשום**,
   * לעולם לא נכתב לטופס כערך מבוקש.
   */
  currentSelfEmployed?: { label: string; from?: string; qualifying: boolean; source: 'btl_portal' | 'manual'; weeklyHours?: number; btlDetail?: NiOccupationBtlDetail };
  declaredIncomeMonthly?: number;
  declaredIncomeYear?: number;
  declaredIncomeAt?: string;
  advanceMonthly?: number;
  classificationLabel: string;
}

export interface Resolve6101Input {
  client: Client;
  purposes: readonly Btl6101Purpose[];
  /** ערכים שהוזנו/תוקנו בהגשה — גוברים על מה שנשלף. */
  entered: Partial<Btl6101Data>;
  /** אישורים מפורשים לפי מפתח (הלקוח אישר / המשרד אישר מול הלקוח). */
  confirmed?: Record<string, 'client' | 'office'>;
  /** ISO. ברירת מחדל: היום. קובע «שנתיים אחרונות» ו«השנה הנוכחית». */
  asOf: string;
  flags?: { contactNotOwn?: boolean; separateMailing?: boolean };
  /** אישורים מקצועיים של הרו"ח שנדרשים לפני נעילה (עם סיבה). */
  professional?: ProfessionalConfirmations;
}

/**
 * ‼ «התחלתי» ו«חדלתי» באותו טופס — מותר רק באישור מקצועי מפורש עם סיבה שנרשמת
 * (ביומן ובצילום הנעול). אין כאן ניחוש אם ב"ל יקבל זאת.
 */
export interface ProfessionalConfirmations {
  startAndEnd?: { reason: string; confirmedAt?: string };
}

/** אסמכתא שנדרשת או מומלצת לפי מה שהוזן — נשמרת על ההגשה בנעילה ונאכפת בהגשה. */
export interface RequiredAttachment { key: string; label: string; required: boolean }

export interface Resolve6101Result {
  data: Btl6101Data;
  fields: Record<string, FieldState>;
  issues: Issue[];
  btl: CurrentBtlState;
  /** רמזים שמוצגים לרו"ח ולא נכתבים לטופס (למשל הכנסה שנתית שלא מומרת). */
  hints: Record<string, string[]>;
  definition?: DefinitionVerdict;
  /** דיווח למפרע (שנה קודמת) — מוצג כאזהרה בולטת; לא מבטיח קבלה או אישור. */
  retro: { start: boolean; change: boolean; end: boolean };
  /** אסמכתאות לפי הכללים — ראה requiredAttachmentsFor. */
  attachments: RequiredAttachment[];
}

/** כמה ימים נתון נחשב טרי. */
const STALE_DAYS_BTL = 90;
const STALE_DAYS_CARD = 730;

const daysSince = (iso: string | undefined, asOf: string) =>
  iso ? Math.floor((Date.parse(asOf) - Date.parse(iso)) / 86_400_000) : Infinity;

const isMobile = (p: string) => /^05\d{8}$/.test(p.replace(/\D/g, '').replace(/^972/, '0'));

const MARITAL: Record<string, MaritalStatus6101> = { single: 'single', married: 'married', divorced: 'divorced', widowed: 'widowed' };

/** תווית העיסוק באוצר המילים של הטופס (◊) — או השם המדויק מב"ל. */
export function occupationFormLabel(o: NiOccupation): string {
  const src = (o.sourceLabel ?? '').trim();
  if (/^תלמיד להשכלה גבוהה/.test(src)) return 'סטודנט';
  if (src === 'עובד') return 'שכיר';
  if (/ללא עיסוק/.test(src)) return 'לא עובד';
  if (src) return src;
  switch (o.type) {
    case 'employee': return 'שכיר';
    case 'self_employed': return 'עצמאי';
    case 'self_employed_non_qualifying': return 'עצמאי שאינו עונה להגדרה';
    case 'student': return 'סטודנט';
    case 'early_pension': return 'פנסיה';
    case 'non_work_income': return 'בעל הכנסה שלא מעבודה';
    case 'not_working': return 'לא עובד';
    default: return niOccupationLabel(o);
  }
}

function metaOf(client: Client, key: string): FieldMeta | undefined {
  return client.fieldMeta?.[key];
}

function metaSourceLabel(m: FieldMeta | undefined, fallback: string): string {
  if (!m?.source) return fallback;
  return `${fallback} · ${FIELD_SOURCE_LABELS[m.source] ?? m.source}`;
}

export function currentBtlState(client: Client, asOf: string): CurrentBtlState {
  const occs = client.niOccupations ?? [];
  const meta = metaOf(client, 'niOccupations');
  const fromPortal = occs.some(o => o.source === 'btl_portal');
  const open = occs
    .filter(o => (o.type === 'self_employed' || o.type === 'self_employed_non_qualifying') && (!o.toDate || o.toDate >= asOf))
    .sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? ''))[0];
  const incMeta = metaOf(client, 'niIncomeBasisMonthly');
  const classificationLabel = open
    ? `${open.type === 'self_employed' ? 'עצמאי' : 'עצמאי שאינו עונה להגדרה'}${open.fromDate ? ` מ-${formDate(open.fromDate)}` : ''}`
    : occs.length ? 'לא רשום כעצמאי כרגע' : 'לא ידוע — לא נקרא מב"ל';
  return {
    syncedAt: meta?.syncedAt,
    syncedFromPortal: fromPortal,
    occupations: occs.map(o => ({
      label: niOccupationLabel(o), from: o.fromDate, to: o.toDate, source: o.source === 'btl_portal' ? 'btl_portal' : 'manual',
      weeklyHours: o.weeklyHours, definitionIncome: o.definitionIncome,
      ...(o.btlDetail ? { btlDetail: o.btlDetail } : {}),
    })),
    currentSelfEmployed: open ? {
      label: niOccupationLabel(open), from: open.fromDate, qualifying: open.type === 'self_employed',
      source: open.source === 'btl_portal' ? 'btl_portal' : 'manual', weeklyHours: open.weeklyHours,
      ...(open.btlDetail ? { btlDetail: open.btlDetail } : {}),
    } : undefined,
    declaredIncomeMonthly: client.niIncomeBasisMonthly,
    declaredIncomeYear: client.niInsuranceBasis?.sourceIncomeYear,
    declaredIncomeAt: incMeta?.syncedAt,
    advanceMonthly: client.niAdvanceMonthly,
    classificationLabel,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function resolve6101(input: Resolve6101Input): Resolve6101Result {
  const { client, purposes, entered, asOf } = input;
  const confirmed = input.confirmed ?? {};
  const flags = input.flags ?? {};
  const btl = currentBtlState(client, asOf);
  const fields: Record<string, FieldState> = {};
  const issues: Issue[] = [];
  const hints: Record<string, string[]> = {};
  const data: Btl6101Data = { ...EMPTY_6101, occupations: [] };
  const year = Number(asOf.slice(0, 4));

  const auto: Partial<Record<keyof Btl6101Data, { value: unknown; state: Omit<FieldState, 'key' | 'required' | 'needsClientConfirmation'> & { needsClientConfirmation?: boolean } }>> = {};
  const put = (k: keyof Btl6101Data, value: unknown, status: FieldStatus, sourceLabel: string, extra: Partial<FieldState> = {}) => {
    auto[k] = { value, state: { status, sourceLabel, ...extra } };
  };
  const hint = (k: string, text: string) => { (hints[k] ??= []).push(text); };

  // ── זהות ──
  const card = 'כרטיס הלקוח';
  if (client.lastName) put('lastName', client.lastName, 'verified', card);
  if (client.firstName) put('firstName', client.firstName, 'verified', card);
  if (client.idNumber) {
    const ok = isValidIsraeliId(client.idNumber);
    put('idNumber', client.idNumber, ok ? 'verified' : 'conflict', card, ok ? {} : { note: 'ספרת הביקורת של הת"ז אינה תקינה — יש לתקן בכרטיס' });
  }

  // ── מצב משפחתי ──
  const ms = MARITAL[client.familyStatus];
  if (ms) put('maritalStatus', ms, 'verified', card);
  else if (client.familyStatus === 'singleParent') {
    put('maritalStatus', '', 'confirm', card, { note: '«הורה יחיד» אינו מצב משפחתי בטופס — יש לבחור רווק/גרוש/אלמן' });
  }
  const sinceYear = ms === 'married' ? client.marriageYear : ms === 'divorced' ? client.divorceYear : ms === 'widowed' ? client.widowhoodYear : undefined;
  if (sinceYear) put('maritalSinceYear', String(sinceYear), 'derived', `${card} · שנה בלבד`, { note: 'החודש אינו שמור בכרטיס' });

  // ── בן/בת הזוג ──
  const spFirst = (client.spouseFirstName || client.spouse?.firstName || '').trim();
  const spLast = (client.spouseLastName || client.spouse?.lastName || '').trim();
  const spIdFlat = (client.spouseIdNumber || '').replace(/\D/g, '');
  const spIdNested = (client.spouse?.idNumber || '').replace(/\D/g, '');
  if (spFirst) put('spouseFirstName', spFirst, 'verified', card);
  if (spLast) put('spouseLastName', spLast, 'verified', card);
  if (spIdFlat || spIdNested) {
    if (spIdFlat && spIdNested && spIdFlat.padStart(9, '0') !== spIdNested.padStart(9, '0')) {
      put('spouseIdNumber', spIdFlat, 'conflict', card, {
        note: 'בכרטיס שתי ת"ז שונות לבן/בת הזוג', alternatives: [{ value: spIdNested, sourceLabel: 'פרטי בן/בת הזוג (רשומה מלאה)' }],
      });
    } else {
      const v = spIdFlat || spIdNested;
      put('spouseIdNumber', v, isValidIsraeliId(v) ? 'verified' : 'conflict', card, isValidIsraeliId(v) ? {} : { note: 'ספרת ביקורת לא תקינה' });
    }
  }

  // ── כתובת ──
  if (client.address) {
    const a = parseHebrewAddress(client.address);
    const src = `נגזר מהכתובת בכרטיס («${client.address}»)`;
    if (a.street) put('street', a.street, 'derived', src);
    if (a.houseNumber) put('houseNumber', a.houseNumber, 'derived', src);
    if (a.entrance) put('entrance', a.entrance, 'derived', src);
    if (a.apartment) put('apartment', a.apartment, 'derived', src);
    if (!a.confident) hint('houseNumber', 'לא זוהה מספר בית בכתובת שבכרטיס');
  }
  if (client.city) put('city', client.city, 'verified', card);
  if (client.zipCode) put('zip', client.zipCode, 'verified', metaSourceLabel(metaOf(client, 'zipCode'), card), { sourceAt: metaOf(client, 'zipCode')?.syncedAt });

  // ── טלפונים ומייל ──
  const phone = (client.phone || '').trim();
  const landline = (client.landlinePhone || '').trim();
  if (phone && isMobile(phone)) put('mobile', phone, 'verified', card);
  else if (phone) put('landline', phone, 'derived', `${card} · הטלפון אינו נייד`);
  if (landline) put('landline', landline, 'verified', card);
  if (client.email) put('email', client.email.trim(), 'verified', card);

  // ── מען למכתבים ──
  const mail = client.mailingAddress;
  if (mail) {
    const src = metaSourceLabel(metaOf(client, 'mailingAddress'), card);
    if (mail.recipient) put('mailRecipient', mail.recipient, 'verified', src);
    if (mail.street) put('mailStreet', mail.street, 'verified', src);
    if (mail.houseNumber) put('mailHouse', mail.houseNumber, 'verified', src);
    if (mail.entrance) put('mailEntrance', mail.entrance, 'verified', src);
    if (mail.apartment) put('mailApartment', mail.apartment, 'verified', src);
    if (mail.city) put('mailCity', mail.city, 'verified', src);
    if (mail.zip) put('mailZip', mail.zip, 'verified', src);
  }

  // ── חשבון בנק ──
  const accounts = client.bankAccounts ?? [];
  const primary = accounts.find(a => a.isPrimary) ?? (accounts.length === 1 ? accounts[0] : undefined);
  const bankMeta = metaOf(client, 'bankAccounts');
  const bankSrc = metaSourceLabel(bankMeta, accounts.length > 1 && primary?.isPrimary ? `${card} · החשבון הראשי` : card);
  if (primary) {
    if (primary.bankName) put('bankName', primary.bankName, 'verified', bankSrc, { sourceAt: bankMeta?.syncedAt });
    if (primary.branchName) put('bankBranchName', primary.branchName, 'verified', bankSrc, { sourceAt: bankMeta?.syncedAt });
    if (primary.branchNumber) put('bankBranchNumber', primary.branchNumber, 'verified', bankSrc, { sourceAt: bankMeta?.syncedAt });
    if (primary.accountNumber) put('bankAccount', primary.accountNumber, 'verified', bankSrc, { sourceAt: bankMeta?.syncedAt });
    if (primary.accountNumber && primary.accountNumber.replace(/\D/g, '').length < 4) {
      auto.bankAccount!.state = { ...auto.bankAccount!.state, status: 'conflict', note: 'בכרטיס שמורות רק ספרות אחרונות — יש להשלים מספר חשבון מלא' };
    }
  } else if (accounts.length > 1) {
    hint('bankName', `בכרטיס ${accounts.length} חשבונות ואף אחד לא מסומן כראשי — יש לבחור`);
  }

  // ── סעיף 3: עיסוקים בשנתיים האחרונות ──
  const since = iso(new Date(Date.UTC(year - 2, Number(asOf.slice(5, 7)) - 1, Number(asOf.slice(8, 10)))));
  const occs = (client.niOccupations ?? []).filter(o => niOccupationOverlaps(o, since, asOf));
  const occRows: OccupationRow6101[] = occs.map(o => ({
    from: o.fromDate ?? '', to: o.toDate ?? '', occupation: occupationFormLabel(o), nonWorkIncome: '', nonWorkSource: '',
  }));
  const occMeta = metaOf(client, 'niOccupations');

  // ── סעיף 4 ──
  const seOpen = btl.currentSelfEmployed;
  const manualSe = (client.niOccupations ?? []).find(o => o.type === 'self_employed' && o.weeklyHours != null && (!o.toDate || o.toDate >= asOf));
  const business = (client.businesses ?? []).find(b => !b.isClosed) ?? (client.businesses ?? [])[0];
  const profession = (business?.description || client.businessDescription || client.vatPrimaryIndustry || '').trim();
  if (profession) {
    put('profession', profession, business?.description || client.businessDescription ? 'verified' : 'derived',
      business?.description ? `${card} · עסק «${business.name}»` : client.businessDescription ? card : 'ענף עיקרי במע״מ');
  }
  if (client.vatOpeningDate) {
    put('startDate', client.vatOpeningDate, 'derived', 'תאריך פתיחת התיק במע״מ', { note: 'פתיחת תיק במע״מ אינה בהכרח יום תחילת העבודה — לאישור' });
  }
  if (manualSe?.weeklyHours != null) put('hoursBand', bandFromHours(manualSe.weeklyHours), 'derived', `${card} · ${manualSe.weeklyHours} שעות בשבוע`);
  if (seOpen?.from) put('changeFromDate', seOpen.from, 'verified', seOpen.source === 'btl_portal' ? 'ב"ל · רשימת עיסוקים' : card, { sourceAt: occMeta?.syncedAt });
  if (manualSe?.weeklyHours != null) put('hoursBefore', String(manualSe.weeklyHours), 'derived', `${card} · שעות שבועיות שנרשמו`);
  // ‼ מה שב"ל רשם בפירוט העיסוק — רמז בלבד. «שעות לפני» בטופס הוא מספר, וב"ל
  // רושם טווח; «הכנסה להגדרה» אינה בהכרח «ההכנסה החודשית הממוצעת» שבטופס.
  const recorded = seOpen?.btlDetail;
  if (recorded?.hoursBand) {
    const t = `ב"ל רשם (פירוט עיסוק): ${NI_HOURS_BAND_LABELS[recorded.hoursBand]} בשבוע — טווח, לא מספר; לאישור מול הלקוח`;
    hint('hoursBefore', t);
    hint('hoursBand', t);
  }
  if (recorded?.definitionIncome != null) {
    hint('incomeBefore', `ב"ל רשם (פירוט עיסוק): הכנסה להגדרה ${Math.round(recorded.definitionIncome).toLocaleString('en-US')} ₪ — לא מועתק לטופס`);
  }
  if (client.niIncomeBasisMonthly != null) {
    put('incomeBefore', String(client.niIncomeBasisMonthly), 'verified', `ב"ל · ההכנסה המוצהרת${btl.declaredIncomeYear ? ` (${btl.declaredIncomeYear})` : ''}`, { sourceAt: btl.declaredIncomeAt });
  }
  const deductions = (client.taxFiles ?? []).find(t => t.authority === 'deductions' && t.owner !== 'spouse' && t.fileNumber);
  if (deductions?.fileNumber) put('withholdingFile', deductions.fileNumber, 'verified', `${card} · תיק ניכויים`);
  const currentEmployer = (client.employers ?? []).find(e => !e.belongsToSpouse && !e.endDate);
  if (currentEmployer) {
    put('currentOccupation', 'שכיר', 'derived', `${card} · מעסיק «${currentEmployer.name}»`);
    if (currentEmployer.startDate) put('currentOccupationFrom', currentEmployer.startDate, 'derived', `${card} · תחילת העסקה`);
  }
  const bizAddr = business?.address;
  if (bizAddr) {
    const src = `${card} · כתובת העסק «${business?.name ?? ''}»`;
    if (bizAddr.street) put('bizStreet', bizAddr.street, 'verified', src);
    if (bizAddr.houseNumber) put('bizHouse', bizAddr.houseNumber, 'verified', src);
    if (bizAddr.apartment) put('bizApartment', bizAddr.apartment, 'verified', src);
    const cz = [bizAddr.city, bizAddr.zip].filter(Boolean).join(' ');
    if (cz) put('bizCityZip', cz, 'verified', src);
    if (bizAddr.phone) put('bizPhone', bizAddr.phone, 'verified', src);
  }

  // רמזים — מוצגים, לא נכתבים (‼ שנתי אינו חודשי)
  for (const b of client.businesses ?? []) {
    if (b.revenueAnnual != null) hint('monthlyIncome', `בכרטיס: מחזור שנתי בעסק «${b.name}» ${b.revenueAnnual.toLocaleString('en-US')} ₪ — לא מומר לחודשי`);
    if (b.netIncome != null) hint('monthlyIncome', `בכרטיס: רווח שנתי בעסק «${b.name}» ${b.netIncome.toLocaleString('en-US')} ₪ — לא מומר לחודשי`);
  }
  if (client.niIncomeBasisMonthly != null) hint('monthlyIncome', `בב"ל מוצהרת כרגע הכנסה חודשית של ${client.niIncomeBasisMonthly.toLocaleString('en-US')} ₪`);
  if (client.rentalIncomeAnnual) hint('occupations', `בכרטיס: הכנסה משכירות ${client.rentalIncomeAnnual.toLocaleString('en-US')} ₪ לשנה — הכנסה שלא מעבודה (הסכום לתקופה — להזנה)`);
  if (client.capitalGainsAnnual || client.dividendInterestAnnual) hint('occupations', 'בכרטיס: הכנסות הוניות (רווחי הון/ריבית/דיבידנד) — הכנסה שלא מעבודה, להזנה לפי תקופה');
  if (business?.startYear) hint('startDate', `בכרטיס: שנת פתיחת העסק ${business.startYear} (שנה בלבד)`);

  // ── מיזוג: הוזן בהגשה ⇐ נשלף ⇐ ריק ──
  const keys = Object.keys(EMPTY_6101) as (keyof Btl6101Data)[];
  for (const k of keys) {
    if (k === 'occupations') continue;
    const e = entered[k];
    const a = auto[k];
    if (e !== undefined) {
      (data as unknown as Record<string, unknown>)[k] = e;
      const differs = a && String(a.value ?? '') !== String(e ?? '') && String(a.value ?? '') !== '';
      fields[k] = {
        key: k, status: 'entered', sourceLabel: 'הוזן בהגשה', required: false, needsClientConfirmation: false,
        alternatives: differs ? [{ value: String(a!.value), sourceLabel: a!.state.sourceLabel }] : undefined,
        note: differs ? `שונה מהערך ב${a!.state.sourceLabel}` : undefined,
      };
    } else if (a) {
      (data as unknown as Record<string, unknown>)[k] = a.value;
      fields[k] = { key: k, required: false, needsClientConfirmation: false, ...a.state };
    } else {
      fields[k] = { key: k, status: 'missing', sourceLabel: '', required: false, needsClientConfirmation: false };
    }
  }
  data.occupations = entered.occupations ?? occRows;
  fields.occupations = {
    key: 'occupations', required: false, needsClientConfirmation: false,
    status: entered.occupations ? 'entered' : occRows.length ? (daysSince(occMeta?.syncedAt, asOf) > STALE_DAYS_BTL && btl.syncedFromPortal ? 'stale' : 'verified') : 'missing',
    sourceLabel: entered.occupations ? 'הוזן בהגשה' : btl.syncedFromPortal ? 'ב"ל · רשימת עיסוקים' : occRows.length ? card : '',
    sourceAt: entered.occupations ? undefined : occMeta?.syncedAt,
  };

  // תרחיש ⇒ תיבות הסימון של סעיף 4
  data.startSelfEmployed = purposes.includes('start');
  data.changeHours = purposes.includes('change');
  data.endSelfEmployed = purposes.includes('end');
  data.stopEmployees = purposes.includes('stop_employees');
  data.spouseInBusiness = purposes.includes('spouse_in_business');
  if (!flags.contactNotOwn) { data.altContactFirstName = ''; data.altContactLastName = ''; data.altContactIdNumber = ''; }
  if (flags.separateMailing === false) {
    data.mailRecipient = ''; data.mailStreet = ''; data.mailHouse = ''; data.mailEntrance = ''; data.mailApartment = ''; data.mailCity = ''; data.mailZip = '';
  }
  // ‼ תאריך ההצהרה נקבע ביום החתימה — לא בטיוטה.
  data.declarationDate = entered.declarationDate ?? '';

  // ── סטטוס לכל שדה: ישן / לא רלוונטי / חובה / אישור הלקוח ──
  const req = requiredKeys(data, purposes, flags);
  const confirmKeys = CLIENT_DECLARED_KEYS;
  for (const k of Object.keys(fields)) {
    const st = fields[k];
    const section = SECTION_OF[k] ?? 'identity';
    const applicable = sectionApplies(section, purposes) && sectionVisible(section, data, flags);
    if (!applicable) { st.status = 'not_applicable'; st.required = false; continue; }
    st.required = req.has(k);
    if (st.status === 'verified' && st.sourceAt) {
      const limit = st.sourceLabel.startsWith('ב"ל') ? STALE_DAYS_BTL : STALE_DAYS_CARD;
      if (daysSince(st.sourceAt, asOf) > limit) { st.status = 'stale'; st.note = `נקרא לפני ${daysSince(st.sourceAt, asOf)} ימים`; }
    }
    if (confirmKeys.has(k)) {
      const who = confirmed[k];
      st.needsClientConfirmation = !who;
      if (!who && (st.status === 'derived' || st.status === 'verified' || st.status === 'stale' || st.status === 'missing' || st.status === 'entered')) {
        if (st.status !== 'missing') st.note = st.note ?? 'הצהרת הלקוח — לאשר מולו לפני חתימה';
      }
    } else if (st.status === 'derived') {
      st.needsClientConfirmation = !confirmed[k];
    }
    const value = (data as unknown as Record<string, unknown>)[k];
    const empty = k === 'occupations' ? data.occupations.length === 0 : value === '' || value == null;
    if (st.required && empty && st.status !== 'conflict') st.status = 'missing';
  }

  // ── בעיות ──
  for (const [k, st] of Object.entries(fields)) {
    if (st.status === 'missing' && st.required) issues.push({ key: k, severity: 'blocker', code: 'missing', message: `חסר: ${KEY_LABELS[k] ?? k}` });
    if (st.status === 'conflict') issues.push({ key: k, severity: 'blocker', code: 'conflict', message: `${KEY_LABELS[k] ?? k}: ${st.note ?? 'ערכים סותרים'}` });
    if (st.status === 'stale' && st.required) issues.push({ key: k, severity: 'warning', code: 'stale', message: `${KEY_LABELS[k] ?? k}: ${st.note ?? 'הנתון ישן'}` });
  }
  if (data.idNumber && !isValidIsraeliId(data.idNumber)) issues.push({ key: 'idNumber', severity: 'blocker', code: 'bad_id', message: 'ת"ז המבוטח אינה תקינה' });
  if (sectionVisible('spouse', data, flags) && data.spouseIdNumber && !isValidIsraeliId(data.spouseIdNumber)) {
    issues.push({ key: 'spouseIdNumber', severity: 'blocker', code: 'bad_id', message: 'ת"ז בן/בת הזוג אינה תקינה' });
  }
  if (flags.contactNotOwn && data.altContactIdNumber && !isValidIsraeliId(data.altContactIdNumber)) {
    issues.push({ key: 'altContactIdNumber', severity: 'blocker', code: 'bad_id', message: 'ת"ז איש הקשר אינה תקינה' });
  }
  if (data.mobile && !isMobile(data.mobile)) issues.push({ key: 'mobile', severity: 'blocker', code: 'bad_phone', message: 'הטלפון הנייד אינו מספר נייד ישראלי (05X + 7 ספרות)' });
  if (data.landline) {
    const d = data.landline.replace(/\D/g, '').replace(/^972/, '0');
    if (!(d.length === 9 || d.length === 10) || !d.startsWith('0') || isMobile(d)) {
      issues.push({ key: 'landline', severity: isMobile(d) ? 'warning' : 'blocker', code: 'bad_phone',
        message: isMobile(d) ? 'המספר בשדה «טלפון קווי» הוא מספר נייד — להעביר ל«טלפון נייד»?' : 'הטלפון הקווי אינו מספר ישראלי תקין' });
    }
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) issues.push({ key: 'email', severity: 'blocker', code: 'bad_email', message: 'כתובת המייל אינה תקינה' });
  if (data.zip && !/^\d{5}(\d{2})?$/.test(data.zip.replace(/\s/g, ''))) issues.push({ key: 'zip', severity: 'blocker', code: 'bad_zip', message: 'מיקוד: 7 ספרות' });
  if (data.maritalSinceMonth && !/^(0?[1-9]|1[0-2])$/.test(data.maritalSinceMonth)) issues.push({ key: 'maritalSinceMonth', severity: 'blocker', code: 'bad_month', message: 'חודש: 1–12' });
  if (data.maritalSinceYear && (!/^\d{4}$/.test(data.maritalSinceYear) || Number(data.maritalSinceYear) > year)) {
    issues.push({ key: 'maritalSinceYear', severity: 'blocker', code: 'bad_year', message: 'שנה לא תקינה' });
  }

  checkDates(data, purposes, year, asOf, issues, btl);

  if (sectionApplies('occupations', purposes)) {
    if (!btl.syncedFromPortal) issues.push({ key: 'occupations', severity: 'info', code: 'no_btl_sync', message: 'העיסוקים לא נקראו מב"ל — מומלץ להריץ «בדוק מול ב"ל» בתיק המס לפני המילוי' });
    else if (daysSince(btl.syncedAt, asOf) > STALE_DAYS_BTL) issues.push({ key: 'occupations', severity: 'warning', code: 'btl_stale', message: `העיסוקים נקראו מב"ל לפני ${daysSince(btl.syncedAt, asOf)} ימים — מומלץ לרענן` });
    data.occupations.forEach((r, i) => {
      if (!r.from) issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_no_from', message: `עיסוק ${i + 1} («${r.occupation || '—'}»): חסר «מתאריך»` });
      if (!r.occupation.trim()) issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_no_label', message: `עיסוק ${i + 1}: חסר שם העיסוק` });
      if (r.from && r.to && r.to < r.from) issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_order', message: `עיסוק ${i + 1}: «עד תאריך» לפני «מתאריך»` });
      // ‼ «הכנסה ב-₪» — סכום מפורש + פרשנות מפורשת (לחודש / לכל התקופה). לא ממירים ולא מנחשים.
      const amount = (r.nonWorkIncome ?? '').replace(/[,\s₪]/g, '');
      const needsIncome = !!r.nonWorkSource.trim() || /הכנסה שלא מעבודה/.test(r.occupation);
      if (amount && !/^\d+(\.\d+)?$/.test(amount)) {
        issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_income_number', message: `עיסוק ${i + 1}: «הכנסה ב-₪» חייבת להיות סכום במספרים` });
      }
      if (!amount && needsIncome) {
        issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_income_missing', message: `עיסוק ${i + 1}: יש הכנסה שלא מעבודה — חסר הסכום בש"ח (לא ממלאים 0 ולא מנחשים)` });
      }
      if (amount && !r.nonWorkIncomeBasis) {
        issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_income_basis', message: `עיסוק ${i + 1}: יש לציין אם ${amount} ₪ הם לחודש או לכל התקופה (הטופס אינו מגדיר — הפרשנות נכתבת בתא)` });
      }
      if (r.nonWorkIncomeBasis && !amount) {
        issues.push({ key: `occupations.${i}`, severity: 'blocker', code: 'occ_income_missing', message: `עיסוק ${i + 1}: נבחרה פרשנות בלי סכום` });
      }
    });
  }

  for (const [key, label] of [['spouseSharePct', 'חלקו בעסק'], ['hoursBefore', 'שעות לפני'], ['hoursAfter', 'שעות אחרי'], ['spouseWeeklyHours', 'שעות בן/בת הזוג']] as const) {
    const v = data[key];
    if (!v) continue;
    const n = Number(String(v).replace(',', '.'));
    const max = key === 'spouseSharePct' ? 100 : 168;
    if (!Number.isFinite(n) || n < 0 || n > max) issues.push({ key, severity: 'blocker', code: 'bad_number', message: `${label}: מספר בין 0 ל-${max}` });
  }

  // הערכת ההגדרה — מידע לרו"ח בלבד
  let definition: DefinitionVerdict | undefined;
  if (purposes.includes('start')) {
    definition = evaluateSelfEmployedDefinition(Number((data.startDate || asOf).slice(0, 4)), hoursFromBand(data.hoursBand), toNum(data.monthlyIncome));
  } else if (purposes.includes('change')) {
    definition = evaluateSelfEmployedDefinition(Number((data.changeToDate || asOf).slice(0, 4)), toNum(data.hoursAfter), toNum(data.incomeAfter));
  }

  // ‼ התחלה והפסקה באותו טופס — רק באישור מקצועי מפורש עם סיבה.
  if (purposes.includes('start') && purposes.includes('end') && !input.professional?.startAndEnd?.reason?.trim()) {
    issues.push({ key: 'professional', severity: 'blocker', code: 'start_end_confirmation',
      message: '«התחלתי» ו«חדלתי» באותו טופס — נדרש אישור מקצועי מפורש עם סיבה לפני נעילה' });
  }

  const prior = (iso: string) => !!iso && Number(iso.slice(0, 4)) < year;
  const retro = {
    start: purposes.includes('start') && prior(data.startDate),
    change: purposes.includes('change') && prior(data.changeToDate),
    end: purposes.includes('end') && prior(data.endDate),
  };
  return { data, fields, issues, btl, hints, definition, retro, attachments: requiredAttachmentsFor(data, purposes, year) };
}

const toNum = (v: string): number | undefined => {
  const t = v.replace(/[,\s₪]/g, '');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

function checkDates(d: Btl6101Data, purposes: readonly Btl6101Purpose[], year: number, asOf: string, issues: Issue[], btl: CurrentBtlState) {
  const bad = (k: string, v: string) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v) && issues.push({ key: k, severity: 'blocker', code: 'bad_date', message: `${KEY_LABELS[k] ?? k}: תאריך לא תקין` });
  for (const k of ['startDate', 'changeFromDate', 'changeToDate', 'spouseFromDate', 'endDate', 'currentOccupationFrom', 'stopEmployeesDate'] as const) bad(k, d[k]);

  if (purposes.includes('start') && d.startDate) {
    if (btl.currentSelfEmployed?.from && btl.currentSelfEmployed.source === 'btl_portal' && btl.currentSelfEmployed.from <= d.startDate) {
      issues.push({ key: 'startDate', severity: 'warning', code: 'already_se', message: `ב"ל כבר מציג «${btl.currentSelfEmployed.label}» מ-${formDate(btl.currentSelfEmployed.from)} — לוודא שזו אכן פתיחה ולא שינוי` });
    }
    if (Number(d.startDate.slice(0, 4)) < year) {
      issues.push({ key: 'startDate', severity: 'warning', code: 'retro_start',
        message: 'דיווח למפרע: תחילת עבודה בשנה קודמת. אפשר להכין את הטופס, אך אין בכך הבטחה שביטוח לאומי יקבל או יאשר — נדרשת בדיקה מקצועית ואסמכתאות תומכות (חובה לפני הגשה)' });
    }
    if (d.startDate > asOf) issues.push({ key: 'startDate', severity: 'info', code: 'future_start', message: 'תאריך ההתחלה עתידי' });
  }
  if (purposes.includes('change')) {
    if (d.changeToDate && Number(d.changeToDate.slice(0, 4)) < year) {
      issues.push({ key: 'changeToDate', severity: 'warning', code: 'retro_change',
        message: `דיווח למפרע: סעיף השינוי בטופס מנוסח לשינוי «בשנה הנוכחית» (${year}), והשינוי מבוקש מ-${formDate(d.changeToDate)}. אפשר להכין את הטופס, אך אין בכך הבטחה שביטוח לאומי יקבל או יאשר — נדרשת בדיקה מקצועית ואסמכתאות תומכות (חובה לפני הגשה)` });
    } else if (d.changeToDate && Number(d.changeToDate.slice(0, 4)) > year) {
      issues.push({ key: 'changeToDate', severity: 'blocker', code: 'change_future_year',
        message: `סעיף השינוי מתייחס לשנה הנוכחית (${year}) — תאריך בשנה הבאה אינו נכנס אליו` });
    }
    if (d.changeFromDate && d.changeToDate && d.changeToDate <= d.changeFromDate) {
      issues.push({ key: 'changeToDate', severity: 'blocker', code: 'change_order', message: 'תאריך השינוי חייב להיות אחרי «מתאריך» של המצב הקודם' });
    }
  }
  if (purposes.includes('end') && d.endDate) {
    if (Number(d.endDate.slice(0, 4)) < year) {
      issues.push({ key: 'endDate', severity: 'warning', code: 'retro_end_docs',
        message: 'דיווח למפרע: סגירת עיסוק עצמאי מעבר לשנה השוטפת. לפי הטופס יש לצרף אסמכתאות תומכות (חובה לפני הגשה); אין בכך הבטחה שביטוח לאומי יקבל או יאשר' });
    }
    if (d.startDate && purposes.includes('start') && d.endDate < d.startDate) {
      issues.push({ key: 'endDate', severity: 'blocker', code: 'end_before_start', message: 'תאריך ההפסקה לפני תאריך ההתחלה' });
    }
  }
  if (purposes.includes('start') && purposes.includes('end') && !d.endDate) {
    issues.push({ key: 'endDate', severity: 'blocker', code: 'missing', message: 'חסר: תאריך הפסקה' });
  }
}

/**
 * אסמכתאות לפי לשון הטופס והכללים השמרניים: דיווח למפרע (התחלה/שינוי/סגירה
 * בשנה קודמת) ⇒ חובה; תלוש שכר לתקופות כשכיר ⇒ מומלץ («נא לצרף תלוש שכר»).
 * ‼ נשמרות על ההגשה בנעילה, והשרת חוסם «הוגש» כל עוד חובה לא צורפה.
 */
export function requiredAttachmentsFor(d: Btl6101Data, purposes: readonly Btl6101Purpose[], year: number): RequiredAttachment[] {
  const out: RequiredAttachment[] = [];
  const prior = (iso: string) => !!iso && Number(iso.slice(0, 4)) < year;
  if (purposes.includes('start') && prior(d.startDate)) {
    out.push({ key: 'retro_start', label: 'אסמכתאות לתחילת עיסוק למפרע (למשל פתיחת תיק במע״מ / מס הכנסה)', required: true });
  }
  if (purposes.includes('change') && prior(d.changeToDate)) {
    out.push({ key: 'retro_change', label: 'אסמכתאות לשינוי היקף למפרע (שעות/הכנסה בתקופה המבוקשת)', required: true });
  }
  if (purposes.includes('end') && prior(d.endDate)) {
    out.push({ key: 'retro_end', label: 'אסמכתאות תומכות לסגירת עיסוק מעבר לשנה השוטפת', required: true });
  }
  if (purposes.includes('multi_year_report') && d.occupations.some(o => /שכיר/.test(o.occupation))) {
    out.push({ key: 'salary_slip', label: 'תלוש שכר (לתקופות כשכיר — לפי הטופס)', required: false });
  }
  return out;
}

/** מפתח ⇒ המקטע שלו (לגילוי הדרגתי). */
export const SECTION_OF: Record<string, string> = {
  lastName: 'identity', firstName: 'identity', idNumber: 'identity',
  maritalStatus: 'marital', maritalSinceMonth: 'marital', maritalSinceYear: 'marital',
  spouseLastName: 'spouse', spouseFirstName: 'spouse', spouseIdNumber: 'spouse',
  street: 'address', houseNumber: 'address', entrance: 'address', apartment: 'address', city: 'address', zip: 'address',
  landline: 'contact', mobile: 'contact', email: 'contact',
  altContactLastName: 'altContact', altContactFirstName: 'altContact', altContactIdNumber: 'altContact',
  refuseDigital: 'digital',
  mailRecipient: 'mailing', mailStreet: 'mailing', mailHouse: 'mailing', mailEntrance: 'mailing', mailApartment: 'mailing', mailCity: 'mailing', mailZip: 'mailing',
  bankName: 'bank', bankBranchName: 'bank', bankBranchNumber: 'bank', bankAccount: 'bank',
  occupations: 'occupations',
  startSelfEmployed: 'start', startDate: 'start', hoursBand: 'start', monthlyIncome: 'start', profession: 'start',
  changeHours: 'change', changeFromDate: 'change', hoursBefore: 'change', incomeBefore: 'change', changeToDate: 'change', hoursAfter: 'change', incomeAfter: 'change',
  spouseInBusiness: 'spouseBusiness', spouseFromDate: 'spouseBusiness', spouseSharePct: 'spouseBusiness', spouseWeeklyHours: 'spouseBusiness',
  endSelfEmployed: 'end', endDate: 'end', currentOccupation: 'end', currentOccupationFrom: 'end',
  stopEmployees: 'employees', withholdingFile: 'employees', stopEmployeesDate: 'employees',
  bizStreet: 'business', bizHouse: 'business', bizApartment: 'business', bizCityZip: 'business', bizPhone: 'business',
  declarationDate: 'declaration',
};

export const KEY_LABELS: Record<string, string> = {
  lastName: 'שם משפחה', firstName: 'שם פרטי', idNumber: 'מספר זהות',
  maritalStatus: 'מצב משפחתי', maritalSinceMonth: 'מצב משפחתי — חודש', maritalSinceYear: 'מצב משפחתי — שנה',
  spouseLastName: 'שם משפחה של בן/בת הזוג', spouseFirstName: 'שם פרטי של בן/בת הזוג', spouseIdNumber: 'ת"ז בן/בת הזוג',
  street: 'רחוב / תא דואר', houseNumber: "מס' בית", entrance: 'כניסה', apartment: 'דירה', city: 'יישוב', zip: 'מיקוד',
  landline: 'טלפון קווי', mobile: 'טלפון נייד', email: 'דואר אלקטרוני',
  altContactLastName: 'שם משפחה איש קשר', altContactFirstName: 'שם פרטי איש קשר', altContactIdNumber: "ת\"ז איש קשר",
  refuseDigital: 'סירוב להודעות דיגיטליות',
  mailRecipient: 'שם הנמען', mailStreet: 'מען — רחוב', mailHouse: "מען — מס' בית", mailEntrance: 'מען — כניסה', mailApartment: 'מען — דירה', mailCity: 'מען — יישוב', mailZip: 'מען — מיקוד',
  bankName: 'שם הבנק', bankBranchName: 'שם הסניף', bankBranchNumber: "מס' סניף", bankAccount: 'מספר חשבון',
  occupations: 'עיסוקים בשנתיים האחרונות',
  startDate: 'תאריך התחלת העבודה כעצמאי', hoursBand: 'ממוצע שעות עבודה לשבוע', monthlyIncome: 'ממוצע הכנסה חודשית', profession: 'משלח היד / המקצוע',
  changeFromDate: 'מתאריך (לפני השינוי)', hoursBefore: 'שעות בשבוע (לפני)', incomeBefore: 'הכנסה חודשית (לפני)',
  changeToDate: 'תאריך השינוי', hoursAfter: 'שעות בשבוע (אחרי)', incomeAfter: 'הכנסה חודשית (אחרי)',
  spouseFromDate: 'בן/בת הזוג עובד/ת בעסק מתאריך', spouseSharePct: 'חלק בן/בת הזוג בעסק (%)', spouseWeeklyHours: 'שעות שבועיות של בן/בת הזוג',
  endDate: 'תאריך הפסקת העבודה כעצמאי', currentOccupation: 'העיסוק הנוכחי', currentOccupationFrom: 'העיסוק הנוכחי מתאריך',
  withholdingFile: 'מספר תיק הניכויים', stopEmployeesDate: 'הפסקת העסקת עובדים מתאריך',
  bizStreet: 'כתובת העסק — רחוב', bizHouse: "כתובת העסק — מס' בית", bizApartment: 'כתובת העסק — דירה', bizCityZip: 'כתובת העסק — יישוב ומיקוד', bizPhone: 'טלפון העסק',
  declarationDate: 'תאריך ההצהרה',
};

/** מה הלקוח מצהיר (ולא רק מאשר העתקה): דורש אישור מפורש לפני חתימה. */
export const CLIENT_DECLARED_KEYS = new Set<string>([
  'refuseDigital', 'occupations', 'startDate', 'hoursBand', 'monthlyIncome',
  'changeFromDate', 'hoursBefore', 'incomeBefore', 'changeToDate', 'hoursAfter', 'incomeAfter',
  'spouseFromDate', 'spouseSharePct', 'spouseWeeklyHours', 'endDate', 'currentOccupation', 'currentOccupationFrom',
  'altContactLastName', 'altContactFirstName', 'altContactIdNumber',
]);

function sectionVisible(section: string, d: Btl6101Data, flags: Resolve6101Input['flags'] = {}): boolean {
  if (section === 'spouse') return d.maritalStatus === 'married' || d.maritalStatus === 'common_law';
  if (section === 'altContact') return !!flags.contactNotOwn;
  if (section === 'mailing') return flags.separateMailing === true;
  return true;
}

function requiredKeys(d: Btl6101Data, purposes: readonly Btl6101Purpose[], flags: Resolve6101Input['flags'] = {}): Set<string> {
  const r = new Set<string>(['lastName', 'firstName', 'idNumber', 'maritalStatus', 'street', 'city']);
  if (!d.mobile && !d.landline) r.add('mobile');
  if (sectionVisible('spouse', d, flags)) { r.add('spouseFirstName'); r.add('spouseLastName'); r.add('spouseIdNumber'); }
  if (flags.contactNotOwn) { r.add('altContactFirstName'); r.add('altContactLastName'); r.add('altContactIdNumber'); }
  if (flags.separateMailing) { r.add('mailStreet'); r.add('mailCity'); }
  if (purposes.includes('multi_year_report')) r.add('occupations');
  if (purposes.includes('start')) ['startDate', 'hoursBand', 'monthlyIncome', 'profession'].forEach(k => r.add(k));
  if (purposes.includes('change')) ['changeFromDate', 'hoursBefore', 'incomeBefore', 'changeToDate', 'hoursAfter', 'incomeAfter'].forEach(k => r.add(k));
  if (purposes.includes('spouse_in_business')) ['spouseFromDate', 'spouseSharePct', 'spouseWeeklyHours', 'spouseFirstName', 'spouseLastName', 'spouseIdNumber'].forEach(k => r.add(k));
  if (purposes.includes('end')) ['endDate', 'currentOccupation'].forEach(k => r.add(k));
  if (purposes.includes('stop_employees')) ['withholdingFile', 'stopEmployeesDate'].forEach(k => r.add(k));
  if (purposes.some(p => ['start', 'change', 'end', 'stop_employees', 'spouse_in_business'].includes(p))) { r.add('bizStreet'); r.add('bizCityZip'); }
  return r;
}

/** שורות «מה מבוקש» — לתצוגה ולהשוואה מול ב"ל אחרי ההגשה. */
export function requestedSummary(d: Btl6101Data, purposes: readonly Btl6101Purpose[]): string[] {
  const out: string[] = [];
  const band = d.hoursBand === '20_plus' ? '20 שעות ומעלה' : d.hoursBand === '12_19' ? '12–19 שעות' : d.hoursBand === '1_11' ? '1–11 שעות' : '';
  if (purposes.includes('start')) out.push(`התחלת עבודה כעצמאי${d.startDate ? ` מ-${formDate(d.startDate)}` : ''}${band ? ` · ${band} בשבוע` : ''}${d.monthlyIncome ? ` · ${formMoney(d.monthlyIncome)} ₪ לחודש` : ''}`);
  if (purposes.includes('change')) out.push(`שינוי היקף${d.changeToDate ? ` מ-${formDate(d.changeToDate)}` : ''}: ${d.hoursBefore || '?'}→${d.hoursAfter || '?'} שעות · ${d.incomeBefore ? formMoney(d.incomeBefore) : '?'}→${d.incomeAfter ? formMoney(d.incomeAfter) : '?'} ₪`);
  if (purposes.includes('end')) out.push(`הפסקת עבודה כעצמאי${d.endDate ? ` מ-${formDate(d.endDate)}` : ''}${d.currentOccupation ? ` · עיסוק נוכחי: ${d.currentOccupation}` : ''}`);
  if (purposes.includes('spouse_in_business')) out.push(`בן/בת הזוג עובד/ת בעסק${d.spouseFromDate ? ` מ-${formDate(d.spouseFromDate)}` : ''}${d.spouseSharePct ? ` · ${d.spouseSharePct}%` : ''}`);
  if (purposes.includes('stop_employees')) out.push(`הפסקת העסקת עובדים${d.stopEmployeesDate ? ` מ-${formDate(d.stopEmployeesDate)}` : ''}`);
  if (purposes.includes('multi_year_report')) out.push(`דיווח ${d.occupations.length} תקופות עיסוק בשנתיים האחרונות`);
  if (purposes.includes('update_details')) out.push('עדכון פרטים אישיים');
  return out;
}
