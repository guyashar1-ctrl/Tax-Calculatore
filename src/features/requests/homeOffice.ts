// ─── עבודה מהבית: תשובות, יחס, תקרת המשרד, אישור ועדכון בפייפרלס (220) ────
// ‼ אותם כללים כמו בשרת (_home_office_answers_error, approve_home_office) — השרת
// הוא האוכף; כאן הם כדי שהטופס יגיד מה לא תקין לפני השליחה.
// ‼ «אין תשובה», «אין חדר בלעדי», «המשרד אישר 0%» ו«הוזן בפייפרלס» — ארבעה מצבים
// שונים. אף אחד מהם אינו נגזר מאחר, ושום «חסר» לא הופך לאפס.

/** כלל המשרד (גיא, 05.10.2026): אחוז מאושר מרבי. ‼ דרישת המשרד — לא קביעה משפטית. */
export const HOME_OFFICE_CAP_PERCENT = 25;

/** ההסבר על ספירת החדרים — אחד לכל המסכים (מהשאלון המאושר). ‼ מוסכמת ניסוח, לא הלכה. */
export const ROOM_COUNT_HELP = 'מספר החדרים הכולל כולל גם את חדרי העסק. לא כולל מטבח, חדרי רחצה ושירותים.';
export const ROOM_NOTE_HELP = 'חדרים בגדלים שונים מאוד, או חדר שמשמש גם למטרה אחרת? כתבו כאן — המשרד יבדוק.';

export interface HomeOfficeInput {
  hasDedicatedRoom: boolean | null;
  totalRooms: number | string | null;
  businessRooms: number | string | null;
  note?: string | null;
}

export type HomeOfficeError =
  | 'missing_has_room' | 'missing_rooms' | 'rooms_not_numeric' | 'rooms_not_positive'
  | 'rooms_too_many' | 'rooms_precision' | 'business_rooms_exceed_total';

export const HOME_OFFICE_ERROR_TEXT: Record<HomeOfficeError, string> = {
  missing_has_room: 'צריך לבחור אם יש חדר שמשמש רק לעסק.',
  missing_rooms: 'צריך למלא את שני מספרי החדרים.',
  rooms_not_numeric: 'מספר החדרים צריך להיות מספר.',
  rooms_not_positive: 'מספר החדרים צריך להיות גדול מאפס.',
  rooms_too_many: 'מספר החדרים נראה גבוה מדי — אפשר לבדוק שוב?',
  rooms_precision: 'אפשר לכתוב חדרים שלמים או חצי חדר (למשל 3.5).',
  business_rooms_exceed_total: 'מספר חדרי העסק אינו יכול להיות גדול ממספר החדרים הכולל.',
};

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const isHalfStep = (n: number) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;

export interface ValidHomeOffice { hasDedicatedRoom: boolean; totalRooms: number | null; businessRooms: number | null; note: string | null }

export function validateHomeOffice(input: HomeOfficeInput):
  { ok: true; value: ValidHomeOffice } | { ok: false; error: HomeOfficeError } {
  if (input.hasDedicatedRoom === null || input.hasDedicatedRoom === undefined) return { ok: false, error: 'missing_has_room' };
  const note = (input.note ?? '').trim().slice(0, 1000) || null;
  if (!input.hasDedicatedRoom) return { ok: true, value: { hasDedicatedRoom: false, totalRooms: null, businessRooms: null, note } };
  const total = toNum(input.totalRooms);
  const biz = toNum(input.businessRooms);
  if (total === null || biz === null) return { ok: false, error: 'missing_rooms' };
  if (Number.isNaN(total) || Number.isNaN(biz)) return { ok: false, error: 'rooms_not_numeric' };
  if (total <= 0 || biz <= 0) return { ok: false, error: 'rooms_not_positive' };
  if (total > 50) return { ok: false, error: 'rooms_too_many' };
  if (!isHalfStep(total) || !isHalfStep(biz)) return { ok: false, error: 'rooms_precision' };
  if (biz > total) return { ok: false, error: 'business_rooms_exceed_total' };
  return { ok: true, value: { hasDedicatedRoom: true, totalRooms: total, businessRooms: biz, note } };
}

/** היחס לפי מספר החדרים, בעשירית אחוז. null כשאין חדר בלעדי או שהקלט חלקי. */
export function roomRatioPercent(totalRooms: number | null, businessRooms: number | null): number | null {
  if (!totalRooms || !businessRooms || totalRooms <= 0 || businessRooms <= 0 || businessRooms > totalRooms) return null;
  return Math.round((businessRooms / totalRooms) * 1000) / 10;
}

/** ההצעה למשרד: היחס, עד התקרה. ‼ הצעה בלבד — האחוז נקבע באישור. */
export function proposedPercent(ratio: number | null): number | null {
  return ratio === null ? null : Math.min(ratio, HOME_OFFICE_CAP_PERCENT);
}

export const formatPercent = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

// ─── ההיסטוריה מהשרת ───────────────────────────────────────────────────────

export interface HomeOfficeAnswersRow {
  id: string;
  source: 'client' | 'office';
  has_dedicated_room: boolean;
  total_rooms: number | null;
  business_rooms: number | null;
  ratio_percent: number | null;
  note: string | null;
  created_at: string;
  step_id?: string | null;
}

export interface HomeOfficeApprovalRow {
  id: string;
  answers_id: string;
  approved_percent: number;
  effective_from: string;
  note: string | null;
  approved_at: string;
  approved_by?: string | null;
  paperless_entered_at: string | null;
}

export interface HomeOfficeHistory { answers: HomeOfficeAnswersRow[]; approvals: HomeOfficeApprovalRow[] }

export type HomeOfficePhase =
  /** אין תשובה בכלל. */
  | 'unanswered'
  /** הלקוח (או המשרד) השיבו שאין חדר שמשמש רק לעסק. ‼ אינו אישור משרד. */
  | 'noRoom'
  /** יש תשובות עם חדר — ממתינות לאישור המשרד. */
  | 'awaitingApproval'
  /** האחוז אושר לתשובות האחרונות. */
  | 'approved'
  /** אושר בעבר, והתשובות השתנו מאז — האישור לבדיקה, לא עדכני. */
  | 'stale';

export interface HomeOfficeState {
  phase: HomeOfficePhase;
  latest: HomeOfficeAnswersRow | null;
  /** האישור של התשובות האחרונות (אם יש). */
  current: HomeOfficeApprovalRow | null;
  /** האישור האחרון — גם כשהוא לתשובות קודמות. */
  lastApproval: HomeOfficeApprovalRow | null;
  ratio: number | null;
  proposed: number | null;
  aboveCap: boolean;
  /** «הוזן בפייפרלס» — רק לאישור העדכני. אישור ישן שהוזן ⇒ 'stale'. */
  paperless: 'none' | 'pending' | 'entered' | 'stale';
}

/** ‼ השרת מחזיר בסדר יורד (seq) — הראשון הוא האחרון. */
export function deriveHomeOffice(h: HomeOfficeHistory | null | undefined): HomeOfficeState {
  const latest = h?.answers?.[0] ?? null;
  const lastApproval = h?.approvals?.[0] ?? null;
  const current = latest && lastApproval && lastApproval.answers_id === latest.id ? lastApproval : null;
  const ratio = latest?.has_dedicated_room ? (latest.ratio_percent ?? roomRatioPercent(latest.total_rooms, latest.business_rooms)) : null;
  const proposed = proposedPercent(ratio);
  let phase: HomeOfficePhase;
  if (!latest) phase = 'unanswered';
  else if (current) phase = 'approved';
  else if (lastApproval) phase = 'stale';
  else if (!latest.has_dedicated_room) phase = 'noRoom';
  else phase = 'awaitingApproval';
  const paperless: HomeOfficeState['paperless'] = current
    ? (current.paperless_entered_at ? 'entered' : 'pending')
    : lastApproval?.paperless_entered_at ? 'stale' : 'none';
  return { phase, latest, current, lastApproval, ratio, proposed, aboveCap: ratio !== null && ratio > HOME_OFFICE_CAP_PERCENT, paperless };
}

/** שורה אחת למשרד — מה המצב עכשיו. */
export function homeOfficeLine(st: HomeOfficeState): string {
  switch (st.phase) {
    case 'unanswered': return 'טרם נמסר מידע על עבודה מהבית';
    case 'noRoom': return st.lastApproval ? 'אין חדר שמשמש רק לעסק' : 'אין חדר שמשמש רק לעסק · אין אחוז לאישור';
    case 'awaitingApproval': return `יחס לפי חדרים ${formatPercent(st.ratio)}${st.aboveCap ? ` · מעל התקרה (${HOME_OFFICE_CAP_PERCENT}%)` : ''} · ממתין לאישורך`;
    case 'approved': return `אושר ${formatPercent(st.current?.approved_percent)}${st.paperless === 'entered' ? ' · הוזן בפייפרלס' : ' · טרם סומן שהוזן בפייפרלס'}`;
    case 'stale': return `התשובות השתנו מאז שאושר ${formatPercent(st.lastApproval?.approved_percent)} — נדרשת בדיקה`;
  }
}

export const answersSourceText = (a: Pick<HomeOfficeAnswersRow, 'source'>): string =>
  a.source === 'client' ? 'הלקוח מסר בדף האישי' : 'המשרד עדכן';

export const APPROVE_ERROR_TEXT: Record<string, string> = {
  percent_above_cap: `האחוז המאושר לא יעלה על ${HOME_OFFICE_CAP_PERCENT}% (כלל המשרד).`,
  percent_precision: 'אפשר עד ספרה אחת אחרי הנקודה.',
  percent_invalid: 'צריך אחוז בין 0 ל-25.',
  missing_effective_from: 'צריך תאריך שממנו האחוז חל.',
  answers_changed: 'התשובות השתנו בינתיים — הוצגו מחדש. בדקו ואשרו שוב.',
  no_room_percent: 'אין חדר שמשמש רק לעסק — אפשר לאשר 0% בלבד.',
  approval_not_current: 'האישור הזה כבר לא עדכני — התשובות השתנו.',
  forbidden: 'אין הרשאה ללקוח הזה.',
};
