// ─── מה ביטוח לאומי רושם — נקרא בפורטל המייצגים ונשמר בשרת (207) ───────────
// ‼ שלושה עולמות שלא מתערבבים: «רשום בב"ל» (מכאן), «בכרטיס / לפי הלקוח»
// (הכרטיס עצמו), ו«לבדיקה» — סתירה שמוצגת, לעולם לא נדרסת אוטומטית.

import { supabase } from '../../lib/supabase';
import type { Client, FamilyStatus, PersonRole } from '../../types';
import { FAMILY_STATUS_LABELS } from '../../types';
import { FIELD_SOURCE_LABELS, type FieldMeta } from '../../types/clientWorkspace';
import { niDate } from './niOccupations';

export type BtlFactKey =
  | 'familyStatus' | 'residency' | 'paymentObligation' | 'coverage' | 'enforcement' | 'paymentArrangement'
  | 'collectionAudit' | 'withholdingFile' | 'representation' | 'debitMethod' | 'notices' | 'reserveDuty'
  | 'annualContributions' | 'correspondence' | 'benefitDebt' | 'documentsRead';

export interface BtlPortalFact<T = Record<string, unknown>> {
  value: T;
  /** מתי הערך הזה נראה לראשונה. */
  since: string;
  /** הקריאה האחרונה שאישרה אותו. */
  lastSeen: string;
  screen: string;
  jobId?: string;
  history: { value: T; since: string; until: string }[];
}

export interface BtlPortalDocument {
  id: string; description: string; docDate: string; pages?: number | null; firstSeenAt: string; lastSeenAt: string;
}

export interface BtlPortalPerson {
  facts: Partial<Record<BtlFactKey, BtlPortalFact>>;
  documents: BtlPortalDocument[];
}

export type BtlPortalRecord = Partial<Record<PersonRole, BtlPortalPerson>>;

export async function loadBtlPortalRecord(clientId: string): Promise<BtlPortalRecord | null> {
  const { data, error } = await supabase.rpc('get_btl_portal_record', { p_client_id: clientId });
  if (error || !data?.ok) return null;
  return data.persons as BtlPortalRecord;
}

// ─── תצוגה ──────────────────────────────────────────────────────────────────

export const BTL_FAMILY_CODE_LABELS: Record<string, string> = {
  single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', separated: 'פרוד/ה', common_law: 'ידוע/ה בציבור',
};

/**
 * האם מצב משפחתי בכרטיס מתיישב עם מה שב"ל רושם. ‼ «הורה יחיד» בכרטיס הוא
 * מושג של מס הכנסה — מתיישב עם רווק/גרוש/אלמן/פרוד. נוסח שלא זוהה ⇒ null
 * («לא ניתן להשוות»), לא «סתירה».
 */
export function familyStatusAgrees(pivo: FamilyStatus | undefined, btlCode: string | undefined | null): boolean | null {
  if (!pivo || !btlCode) return null;
  if (pivo === btlCode) return true;
  if (pivo === 'singleParent') return ['single', 'divorced', 'widowed', 'separated'].includes(btlCode);
  return false;
}

export interface RecordedLine {
  key: BtlFactKey;
  label: string;
  value: string;
  since: string;
  lastSeen: string;
  /** הערך הקודם, כשהערך השתנה בין קריאות. */
  previous?: { value: string; until: string };
}

export interface BtlRecordView {
  /** אין עדיין שום קריאה שנשמרה לאדם הזה. */
  empty: boolean;
  lastReadAt?: string;
  recorded: RecordedLine[];
  declared: { label: string; value: string; source: string }[];
  conflicts: { key: string; text: string }[];
  contributions: { year: number; text: string }[];
  documents: { description: string; date: string; pages?: number | null; notInLastRead: boolean }[];
  notices: { date: string; type: string; state?: string }[];
  noticesOther: number;
  /** רק כשהקריאה האחרונה מצאה תכתובות (הכמות — אין מיפוי תוכן). */
  correspondenceCount?: number;
  reserveDuty?: { rows: { year: number; gross: number | null; taxWithheld: number | null }[]; lastSeen: string; nextAction: string };
}

const raw = (f?: BtlPortalFact) => (f?.value as { raw?: string | null } | undefined)?.raw ?? null;
const money = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')} ₪`);

function representationText(v: Record<string, unknown> | undefined): string {
  if (!v) return '';
  const parts = ['ברשימת המיוצגים'];
  if (typeof v.receivedDate === 'string') parts[0] += ` מ-${niDate(v.receivedDate)}`;
  if (typeof v.status === 'string') parts.push(`סטטוס: ${v.status}`);
  if (typeof v.pendingAction === 'string') parts.push(v.pendingAction);
  if (typeof v.benefitsAuthorization === 'string') parts.push(`הרשאה לגמלאות: ${v.benefitsAuthorization}`);
  return parts.join(' · ');
}

function line(key: BtlFactKey, label: string, f: BtlPortalFact | undefined, text: (v: Record<string, unknown>) => string | null): RecordedLine | null {
  if (!f) return null;
  const value = text(f.value);
  if (!value) return null;
  const prev = f.history[0];
  const prevText = prev ? text(prev.value as Record<string, unknown>) : null;
  return { key, label, value, since: f.since, lastSeen: f.lastSeen, ...(prevText && prevText !== value ? { previous: { value: prevText, until: prev.until } } : {}) };
}

/**
 * ‼ «אכיפה», «הסדר תשלומים», «ביקורת גבייה», «תיק ניכויים» — מוצגים רק כשיש
 * בהם משהו (ריק = אין, ואין צורך בשורה שאומרת «אין»). מצב משפחתי, חובת
 * תשלום וכיסוי — תמיד כשנקראו.
 */
export function buildBtlRecordView(
  person: BtlPortalPerson | undefined,
  ctx: { client: Client; role: PersonRole; pivoRepresentation?: { text: string; active: boolean } },
): BtlRecordView {
  const f = person?.facts ?? {};
  const seen = Object.values(f).map(x => x?.lastSeen).filter((x): x is string => !!x).sort();
  const view: BtlRecordView = {
    empty: seen.length === 0, lastReadAt: seen[seen.length - 1],
    recorded: [], declared: [], conflicts: [], contributions: [], documents: [], notices: [], noticesOther: 0,
  };
  if (view.empty) return view;

  const txt = (label?: string) => (v: Record<string, unknown>) => {
    const r = (v as { raw?: string | null }).raw;
    return r ? (label ? `${label}${r}` : r) : null;
  };
  const push = (l: RecordedLine | null) => { if (l) view.recorded.push(l); };
  push(line('familyStatus', 'מצב משפחתי', f.familyStatus, v => {
    const code = (v as { code?: string }).code;
    const r = (v as { raw?: string | null }).raw;
    return code ? BTL_FAMILY_CODE_LABELS[code] ?? r ?? null : r ?? null;
  }));
  push(line('paymentObligation', 'חובת תשלום', f.paymentObligation, txt()));
  push(line('coverage', 'כיסוי ביטוחי', f.coverage, txt()));
  push(line('residency', 'תושבות', f.residency, v => ((v as { raw?: string }).raw === 'כן' ? 'תושב/ת' : (v as { raw?: string }).raw ?? null)));
  push(line('representation', 'ייצוג', f.representation, v => representationText(v) || null));
  push(line('debitMethod', 'אמצעי חיוב', f.debitMethod, txt()));
  push(line('enforcement', 'אכיפה', f.enforcement, txt()));
  push(line('paymentArrangement', 'הסדר תשלומים', f.paymentArrangement, txt()));
  push(line('collectionAudit', 'ביקורת גבייה', f.collectionAudit, txt()));
  push(line('withholdingFile', 'תיק ניכויים', f.withholdingFile, txt()));
  const debt = (f.benefitDebt?.value as { count?: number } | undefined)?.count;
  if (debt) push({ key: 'benefitDebt', label: 'חוב גמלה', value: `${debt} רשומות`, since: f.benefitDebt!.since, lastSeen: f.benefitDebt!.lastSeen });

  // ── בכרטיס / לפי הלקוח ──
  const { client, role, pivoRepresentation } = ctx;
  const meta = (client.fieldMeta as Record<string, FieldMeta> | undefined)?.familyStatus;
  if (client.familyStatus) {
    view.declared.push({
      label: 'מצב משפחתי', value: FAMILY_STATUS_LABELS[client.familyStatus] ?? client.familyStatus,
      source: meta?.source ? FIELD_SOURCE_LABELS[meta.source] ?? meta.source : 'כרטיס הלקוח',
    });
  }
  if (pivoRepresentation?.text) view.declared.push({ label: 'ייצוג', value: pivoRepresentation.text, source: 'PIVO' });

  // ── לבדיקה ──
  const btlCode = (f.familyStatus?.value as { code?: string } | undefined)?.code;
  const agrees = familyStatusAgrees(client.familyStatus, btlCode);
  const pivoFamily = client.familyStatus ? FAMILY_STATUS_LABELS[client.familyStatus] : '';
  if (agrees === false) {
    view.conflicts.push({ key: 'familyStatus', text: `מצב משפחתי: בב"ל ${BTL_FAMILY_CODE_LABELS[btlCode!] ?? raw(f.familyStatus)}, בכרטיס ${pivoFamily}${role === 'spouse' ? ' (של התא המשפחתי)' : ''}` });
  } else if (agrees === null && raw(f.familyStatus) && client.familyStatus) {
    view.conflicts.push({ key: 'familyStatus', text: `מצב משפחתי בב"ל («${raw(f.familyStatus)}») לא זוהה — לא ניתן להשוות לכרטיס` });
  }
  const repStatus = (f.representation?.value as { status?: string } | undefined)?.status;
  if (pivoRepresentation?.active && repStatus && /ממתין/.test(repStatus)) {
    view.conflicts.push({ key: 'representation', text: `ייצוג: בכרטיס פעיל, בב"ל «${repStatus}»` });
  } else if (pivoRepresentation && !pivoRepresentation.active && f.representation && !(repStatus && /ממתין/.test(repStatus))) {
    // ‼ ב"ל כבר מציג את המבוטח ברשימת המיוצגים בלי הערת המתנה, והכרטיס לא יודע.
    view.conflicts.push({ key: 'representation', text: `ייצוג: בב"ל ברשימת המיוצגים, בכרטיס «${pivoRepresentation.text}»` });
  }

  // ── דמי ביטוח שנתיים ──
  const years = ((f.annualContributions?.value as { years?: { year: number; byAssessment: boolean | null; total: number | null; classes: { classification: string; charge: string | null; annualBase: number | null; annualContribution: number | null }[] }[] } | undefined)?.years ?? []);
  for (const y of years.slice(0, 3)) {
    const cls = y.classes.map(c => [c.classification, c.charge, c.annualBase != null ? `בסיס ${money(c.annualBase)}` : null].filter(Boolean).join(' '));
    const text = [cls.join(' · ') || null, y.total != null ? `סה"כ ${money(y.total)}` : null,
      y.byAssessment === true ? 'לפי שומה' : y.byAssessment === false ? 'טרם שומה סופית' : null].filter(Boolean).join(' · ');
    if (text) view.contributions.push({ year: y.year, text });
  }

  // ── מסמכים והודעות ──
  const docsRead = f.documentsRead?.lastSeen;
  view.documents = (person?.documents ?? []).slice(0, 6).map(d => ({
    description: d.description, date: d.docDate, pages: d.pages,
    notInLastRead: !!docsRead && d.lastSeenAt < docsRead,
  }));
  const nv = f.notices?.value as { items?: { date: string; type: string; state?: string }[]; otherCount?: number } | undefined;
  view.notices = (nv?.items ?? []).slice(0, 5).map(n => ({ date: n.date, type: n.type, ...(n.state ? { state: n.state } : {}) }));
  view.noticesOther = nv?.otherCount ?? 0;
  const corr = (f.correspondence?.value as { count?: number } | undefined)?.count;
  if (corr) view.correspondenceCount = corr;

  // ── מילואים ──
  const rd = f.reserveDuty?.value as { rows?: { year: number; gross: number | null; taxWithheld: number | null }[] } | undefined;
  if (rd?.rows?.length) {
    view.reserveDuty = {
      rows: rd.rows.map(r => ({ year: r.year, gross: r.gross, taxWithheld: r.taxWithheld })),
      lastSeen: f.reserveDuty!.lastSeen,
      nextAction: 'הסכומים ששולמו והמס שנוכה — לדוח השנתי של אותה שנה. תביעה או בירור על מילואים נעשים באזור האישי של המבוטח; בפורטל המייצגים אין פעולה כזו.',
    };
  }
  return view;
}

export const formatBtlMoney = money;
