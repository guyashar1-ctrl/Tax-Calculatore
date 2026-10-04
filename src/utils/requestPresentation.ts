// ─── איך בקשה נראית ברשימה הסגורה (1.10.2026, סבב פישוט שני) ───────────────
// גיא: «לזהות מיד מה הבקשות, בלי לקרוא פסקאות». לכן לכל בקשה ברשימה יש בדיוק:
//   · שם קצר — שורה אחת. הניסוח המלא (מה מבקשים בדיוק) עובר לפתיחה.
//   · מצב אחד — עד שלוש מילים, שעונה על «אצל מי זה עכשיו». בלי תאריכים,
//     בלי ספירות, בלי שלבים עתידיים — כל אלה בפתיחה.
// הכול כאן טהור (בלי React) כדי שאפשר יהיה לבדוק בבדיקות יחידה.

/** אורך שמעבר לו שם מתפצל ל«שם» + «פירוט», גם בלי מפריד מפורש. */
export const NAME_MAX = 38;

/**
 * מפצל כותרת שהרו"ח כתב לשם קצר ולפירוט.
 * «מסמכים לפתיחת התיק — אישורי בנק, דוחות…» ⇒ שם «מסמכים לפתיחת התיק».
 * ‼ שום מילה לא נזרקת: מה שלא נכנס לשם מוחזר כ-detail ומוצג בפתיחה.
 */
export function splitRequestTitle(title: string): { name: string; detail?: string } {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { name: '' };
  // כותרת שנכנסת בשורה — נשארת שלמה (גם אם יש בה מקף).
  if (t.length <= NAME_MAX) return { name: t };
  // מפריד מפורש: מקף ארוך/בינוני מוקף רווחים, או נקודתיים.
  const m = /^(.{3,}?)\s+[—–-]\s+(.+)$/.exec(t) ?? /^([^:]{3,}?):\s+(.+)$/.exec(t);
  if (m && m[1].length <= NAME_MAX + 12) return { name: m[1].trim(), detail: m[2].trim() };
  if (t.length <= NAME_MAX) return { name: t };
  // בלי מפריד: חותכים בגבול מילה לפני הפסיק/הרווח האחרון שנכנס, והשאר לפירוט.
  const comma = t.lastIndexOf(',', NAME_MAX);
  const cutAt = comma >= 12 ? comma : t.lastIndexOf(' ', NAME_MAX);
  if (cutAt < 12) return { name: `${t.slice(0, NAME_MAX).trim()}…`, detail: t };
  return { name: `${t.slice(0, cutAt).trim()}…`, detail: t };
}

export type RowTone = 'red' | 'blue' | 'amber' | 'gray';

export interface RowState {
  text: string;
  tone: RowTone;
}

/** המצב הכללי של «התור שלך». ‼ ליד כפתור שאומר מה לעשות הוא מיותר — ולכן מוסתר שם. */
export const MINE_STATE_TEXT = 'לטיפולך';

/**
 * «ל» + שם: «לשרון», «לבן/בת הזוג». בלי שם — «ללקוח», ולא «להלקוח» (הלמ״ד בולעת את
 * ה׳ הידיעה). ‼ כל מקום שמדביק «ל» לשם שאולי חסר — דרך כאן.
 */
export function lamed(name?: string | null): string {
  const n = String(name ?? '').trim();
  if (!n || n === 'הלקוח' || n === 'לקוח') return 'ללקוח';
  if (n === 'הלקוח/ה') return 'ללקוח/ה';
  return `ל${n}`;
}

/** מי מחזיק את הבקשה כשהיא ממתינה — מילה אחת או שתיים. */
export type WaitingOnKey = 'client' | 'spouse' | 'paperless' | 'authority' | 'prev_accountant' | 'external' | 'pivo' | 'locked';

export interface RowStateInput {
  /** 'internal' — משימה פנימית של המשרד (לא בקשה מאדם אחר). */
  kind: 'mine' | 'waiting' | 'done' | 'internal';
  tone: 'blue' | 'red' | 'gray';
  waitingOn?: WaitingOnKey;
  status: string;
  /** טיוטה — הלקוח עוד לא רואה אותה בדף. */
  draft?: boolean;
  /** בדף, אבל הלקוח עוד לא קיבל עליה הודעה. */
  unsent?: boolean;
  needsAttention?: boolean;
  clientFirstName?: string;
  spouseFirstName?: string;
}

/**
 * המצב שמוצג בשורה הסגורה. ‼ מילים ספורות בלבד; הפירוט — בפתיחה.
 * סדר ההכרעה: בעיה › נעול › טיוטה › בדף בלי מייל › אצלי › אצל מי.
 * ‼ (סבב 3) «טרם נשלח» נקרא כאילו הלקוח לא רואה — אבל הבקשה כבר בדף; רק המייל לא יצא.
 */
export function rowStateFor(i: RowStateInput): RowState {
  if (i.kind === 'done') return { text: 'הושלם', tone: 'gray' };
  if (i.tone === 'red') {
    if (i.status === 'blocked') return { text: 'חסום', tone: 'red' };
    if (i.status === 'failed') return { text: 'נכשל', tone: 'red' };
    return { text: 'דורש טיפול', tone: 'red' };
  }
  if (i.status === 'locked' || i.waitingOn === 'locked') return { text: 'בהמשך', tone: 'gray' };
  // ‼ משימה פנימית לעולם אינה «ממתין ל{שם}»: היא לא בדף, ואף אחד מחוץ למשרד לא רואה
  // אותה. המשרד שם אותה בהמתנה — זה מה שנאמר, בלי לרמוז שהלקוח התבקש למשהו.
  if (i.kind === 'internal') return i.waitingOn ? { text: 'בהמתנה', tone: 'gray' } : { text: 'פתוחה', tone: 'gray' };
  if (i.draft) return { text: 'טיוטה', tone: 'amber' };
  if (i.unsent) return { text: 'בדף, בלי מייל', tone: 'amber' };
  if (i.kind === 'mine') return { text: MINE_STATE_TEXT, tone: 'blue' };
  if (i.waitingOn === 'pivo') return { text: 'PIVO עובד', tone: 'gray' };
  return { text: `ממתין ${toWho(i.waitingOn ?? 'client', { client: i.clientFirstName, spouse: i.spouseFirstName })}`, tone: 'gray' };
}

/** אצל מי — עם ה«ל»: «לשרון», «לרשות», «ללקוח». */
function toWho(w: WaitingOnKey, names: { client?: string; spouse?: string }): string {
  switch (w) {
    case 'spouse': return lamed(names.spouse || 'בן/בת הזוג');
    case 'paperless': return 'לפייפרלס';
    case 'authority': return 'לרשות';
    case 'prev_accountant': return 'לרו״ח הקודם';
    case 'external': return 'לגורם חיצוני';
    case 'pivo': return 'ל-PIVO';
    default: return lamed(names.client);
  }
}

/**
 * מצב של שורה שמקבצת כמה חלקים, כשאף חלק לא דורש אותך עכשיו (סבב 4):
 * «ממתין להדסה» · «ממתין להדסה ולרותם» · «ממתין ל-3 גורמים» · הכול נעול ⇒ «בהמשך».
 * ‼ עד שלוש-ארבע מילים, כמו כל מצב בשורה הסגורה; מי בדיוק — בפתיחה.
 */
export function groupWaitingState(
  waitingOn: WaitingOnKey[], allLocked: boolean, names: { client?: string; spouse?: string },
): RowState {
  const who = waitingOn.filter(w => w !== 'locked');
  if (who.length === 0) return { text: allLocked ? 'בהמשך' : 'ממתין', tone: 'gray' };
  if (who.length === 1 && who[0] === 'pivo') return { text: 'PIVO עובד', tone: 'gray' };
  if (who.length === 1) return { text: `ממתין ${toWho(who[0], names)}`, tone: 'gray' };
  if (who.length === 2) return { text: `ממתין ${toWho(who[0], names)} ו${toWho(who[1], names)}`, tone: 'gray' };
  return { text: `ממתין ל-${who.length} גורמים`, tone: 'gray' };
}

/** «· ועוד 1 לטיפולך» — חלקים נוספים בשורה שדורשים אותך, מעבר למה שבכפתור. */
export function moreMineText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? 'ועוד 1 לטיפולך' : `ועוד ${n} לטיפולך`;
}

/**
 * החלקים הנוספים שדורשים אותך — בשמם, כשיש אחד: «ועוד: ביטוח לאומי · לקוח12 — חסרים פרטים».
 * ‼ «ועוד 1 לטיפולך» לא אמר מה. מצב כללי («לטיפולך») לא נוסף — השם מספיק. יותר מאחד —
 * מספר (הפירוט בפתיחה).
 */
export function moreMineLabel(parts: { label: string; state?: string | null }[]): string | null {
  if (parts.length === 0) return null;
  if (parts.length > 1) return moreMineText(parts.length);
  const { label, state } = parts[0];
  return `ועוד: ${label}${state && state !== MINE_STATE_TEXT ? ` — ${state}` : ''}`;
}

/**
 * מה צריך לעשות בבקשת הייצוג — במילים ספורות, לשורה הסגורה ליד «למרכז הייצוג» (כפתור
 * שרק מנווט). null ⇒ הבקשה לא אצלך. ‼ הנוסח המלא — representationAction, בפתיחה.
 */
export function repShortAction(status: string | null | undefined, phase?: string | null): string | null {
  if (status === 'pending_signature' && phase === 'unsent') return 'לשלוח ללקוח לחתימה';
  if (status === 'awaiting_accountant') return 'להזין ולהפיק טופס';
  if (status === 'awaiting_stamp') return 'לחתום ולהוסיף חותמת';
  return null;
}
