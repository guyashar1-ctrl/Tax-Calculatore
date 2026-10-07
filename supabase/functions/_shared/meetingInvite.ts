// ═══════════════════════════════════════════════════════════════════════════
//  זימון לפגישה ב-Google Meet — מקור האמת לנוסח
// ═══════════════════════════════════════════════════════════════════════════
//  נצרך משתי הסביבות מאותו קובץ ממש:
//    • Frontend (Vite/TS):  התצוגה המקדימה בחלון «פגישה חדשה» ובשינוי מועד
//    • Edge Function (Deno): calendar-meeting — מה שנכתב באמת לאירוע ביומן
//  ולכן הקובץ טהור: בלי React, בלי DOM, בלי Deno API ובלי ייבוא חיצוני.
//  מה שהרו"ח רואה לפני «שלח זימון» הוא מה שיוצא, כי זה אותו קוד ואותם קלטים.
//
//  ‼ (סבב 3, 07.10.2026) הנוסח הוא תבנית שהמשרד עורך בספריית הבקשות ← פגישות;
//  כאן ברירת המחדל וכאן המילוי — ראה «הנוסח» למטה. למה נוסח המערכת כתוב כך —
//  `INVITE_WHY`, מוצג בעורך («למה כתוב כך?»).
//  ההנחות (אושרו בהדמיה, 06.10.2026): הזימון יוצא מהיומן של הרו"ח, בשמו;
//  פנייה בגוף רבים (ניטרלי מגדרית); שיחת היכרות ללא עלות וללא התחייבות.
// ═══════════════════════════════════════════════════════════════════════════

export type MeetingKind = 'intro' | 'work';

export const MEETING_KINDS: readonly MeetingKind[] = ['intro', 'work'];

export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  intro: 'שיחת היכרות',
  work: 'פגישת עבודה',
};

export const MEETING_KIND_HINTS: Record<MeetingKind, string> = {
  intro: 'למי שעוד לא לקוח',
  work: 'עם לקוח, על נושא מסוים',
};

export const MEETING_DEFAULT_MINUTES: Record<MeetingKind, number> = { intro: 30, work: 45 };

export const MEETING_DURATIONS = [20, 30, 45, 60, 90] as const;

/** כל הזמנים במשרד הם שעון ישראל, בלי קשר לשעון המכשיר. */
export const MEETING_TIME_ZONE = 'Asia/Jerusalem';

export interface MeetingGuest {
  email: string;
  name?: string;
}

/** פרטי המשרד שנכנסים לחתימה — מ-profiles, אותם שדות בדפדפן ובשרת. */
export interface InviteOrg {
  fullName?: string;
  firmName?: string;
  representativeType?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
}

export interface InviteInput {
  kind: MeetingKind;
  guests: MeetingGuest[];
  durationMin: number;
  topic?: string;
  prep?: string;
  /** שורה אישית שהרו"ח כותב — מופיעה מיד אחרי הפנייה. */
  note?: string;
}

export type MoveAskedBy = 'office' | 'guest';

export interface InviteMove {
  date: string; // YYYY-MM-DD, שעון ישראל
  time: string; // HH:MM
  note?: string;
}

/** השורה שמוצעת בשינוי מועד — לפי מי ביקש. הרו"ח יכול לערוך. */
export const MOVE_NOTE_DEFAULT: Record<MoveAskedBy, string> = {
  office: 'נאלצתי להזיז את הפגישה, סליחה על השינוי. אם המועד החדש לא מתאים, כתבו לי ונמצא אחר.',
  guest: 'כפי שסיכמנו, קבענו מועד חדש. נתראה!',
};

// ─── תאריכים ושעות בשעון ישראל ─────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function zoneOffsetMinutes(ts: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEETING_TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - ts) / 60000);
}

/** «8.10.2026 10:00 בישראל» → רגע מוחלט (ISO, UTC). עמיד למעבר לשעון חורף. */
export function israelToUtcIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - zoneOffsetMinutes(guess) * 60000;
  const again = zoneOffsetMinutes(ts);
  ts = guess - again * 60000;
  return new Date(ts).toISOString();
}

/** רגע מוחלט → תאריך ושעה בשעון ישראל. */
export function utcToIsrael(iso: string): { date: string; time: string } {
  const ts = new Date(iso).getTime();
  const local = new Date(ts + zoneOffsetMinutes(ts) * 60000);
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

/** «יום חמישי, 8 באוקטובר» */
export function longDay(date: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(noon(date));
}

/** «יום ה׳, 8 באוק׳» */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(noon(date));
}

export function durationText(min: number): string {
  if (min === 60) return 'שעה';
  if (min === 90) return 'שעה וחצי';
  return `${min} דקות`;
}

// ─── מוזמנים: מה שהודבק מהוואטסאפ ──────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function isValidEmail(s: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s.trim());
}

/** כל כתובות המייל בטקסט, באותיות קטנות, בלי כפילויות, לפי סדר ההופעה. */
export function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) ?? []).map(e => e.replace(/\.+$/, '').toLowerCase());
  return [...new Set(found)];
}

/**
 * כשמעתיקים כמה הודעות מוואטסאפ, כל שורה נפתחת ב-«[6.10.2026, 14:03] דני לוי: …».
 * השם הוא איך שאיש הקשר שמור אצל הרו"ח — הצעה בלבד, נערכת בשדה. מספר טלפון אינו שם.
 */
export function suggestNameFromWhatsApp(text: string): string | undefined {
  const m = text.match(/^\s*\[[^\]\n]{4,40}\]\s*([^:\n]{2,40}):/m)
    ?? text.match(/^\s*\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}\s*-\s*([^:\n]{2,40}):/m);
  const name = m?.[1]?.replace(/[‎‏‪-‮~]/g, '').trim();
  if (!name || /^[+\d\s()-]+$/.test(name)) return undefined;
  return name;
}

const firstName = (g: MeetingGuest) => (g.name ?? '').trim().split(/\s+/)[0] ?? '';

function namesPhrase(guests: MeetingGuest[]): string {
  const n = guests.map(g => (g.name ?? '').trim()).filter(Boolean);
  if (n.length === 0) return '';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} ו${n[1]}`;
  return `${n[0]} ועוד ${n.length - 1}`;
}

// ─── הנוסח ─────────────────────────────────────────────────────────────────

const REP_ABBR: Record<string, string> = { 'רואה חשבון': 'רו״ח', 'עורך דין': 'עו״ד', 'יועץ מס': 'יועץ מס' };

/** «גיא ישר, רו״ח» — השם והתואר שבחתימה ובכותרת. */
export function organizerTitle(org: InviteOrg): string {
  const name = (org.fullName ?? '').trim() || (org.firmName ?? '').trim();
  const abbr = REP_ABBR[(org.representativeType ?? '').trim()] ?? (org.representativeType ?? '').trim();
  return name && abbr ? `${name}, ${abbr}` : name;
}

export function greeting(guests: MeetingGuest[]): string {
  const f = guests.map(firstName).filter(Boolean);
  if (f.length === 0) return 'שלום,';
  if (f.length === 1) return `שלום ${f[0]},`;
  if (f.length === 2) return `שלום ${f[0]} ו${f[1]},`;
  return 'שלום לכולם,';
}

// ─── הנוסח: תבנית שנערכת בספריית הבקשות ← פגישות (סבב 3, 07.10.2026) ───────
// ‼ מקור אחד: ברירת המחדל כאן, ונוסח המשרד ב-profiles.settings.commTemplates
//   (meeting_intro / meeting_work) — אותו מבנה כמו נוסחי המיילים, ונערך באותו עורך
//   מהספרייה ומ«מיילים». החלון (תצוגה מקדימה) והשרת (calendar-meeting) ממלאים את
//   אותה תבנית באותה פונקציה — מה שמוצג לפני «שלח זימון» הוא מה שיוצא.
// ‼ שדה שנשאר ריק בשורה משלו (כמו [שורה אישית], [מה להכין]) — הפסקה שלו לא מופיעה.
//   כך «מה כדאי להכין:» לא נשאר בלי רשימה, ובלי שורה אישית אין שורה ריקה.
// ‼ שינוי מועד: שורת העדכון והשורה של «מי ביקש» נוספות בראש — הן אינן חלק מהתבנית.

export type MeetingTemplateKey = 'meeting_intro' | 'meeting_work';

export const MEETING_TEMPLATE_KEY: Record<MeetingKind, MeetingTemplateKey> = {
  intro: 'meeting_intro',
  work: 'meeting_work',
};

/** subject = הכותרת ביומן (וגם שורת הנושא במייל של Google); body = תיאור האירוע. */
export interface MeetingTemplate {
  subject: string;
  body: string;
}

/** השדות שמתמלאים לבד — בעורך הם מוצגים בעברית בסוגריים מרובעים ([פנייה]). */
export const MEETING_TEMPLATE_FIELDS: readonly { token: string; label: string; hint: string }[] = [
  { token: '{{greeting}}', label: 'פנייה', hint: '«שלום דני,» — בשם הפרטי. לשניים: «שלום דני ורותם,»' },
  { token: '{{names}}', label: 'שמות המוזמנים', hint: '«דני לוי ורותם כהן»' },
  { token: '{{kind}}', label: 'סוג הפגישה', hint: '«שיחת היכרות» או «פגישת עבודה»' },
  { token: '{{topic}}', label: 'נושא הפגישה', hint: 'מה שנכתב בחלון ב«נושא הפגישה»' },
  { token: '{{duration}}', label: 'משך', hint: '«30 דקות», «שעה»' },
  { token: '{{note}}', label: 'שורה אישית', hint: 'מה שכתבת בחלון. ריק ⇒ הפסקה לא מופיעה' },
  { token: '{{prepList}}', label: 'מה להכין', hint: 'רשימה מהחלון, שורה לכל פריט. ריק ⇒ הפסקה לא מופיעה' },
  { token: '{{reschedule}}', label: 'איך משנים מועד', hint: 'עם הוואטסאפ שלך מפרטי המשרד; בלי וואטסאפ — רק «השיבו למייל»' },
  { token: '{{whatsapp}}', label: 'הוואטסאפ שלך', hint: 'מפרטי המשרד (או הטלפון)' },
  { token: '{{organizer}}', label: 'השם והתואר שלך', hint: '«גיא ישר, רו״ח»' },
  { token: '{{signature}}', label: 'חתימה', hint: 'שם ותואר, שם המשרד, טלפון ואתר — מפרטי המשרד' },
];

export const MEETING_TEMPLATE_LABELS: Record<string, string> =
  Object.fromEntries(MEETING_TEMPLATE_FIELDS.map(f => [f.token, f.label]));

const JOIN_LINE = 'איך מצטרפים: בשעת הפגישה לוחצים על "הצטרפות ל-Google Meet" בהזמנה הזו. במחשב זה נפתח בדפדפן בלי התקנה, ובטלפון דרך אפליקציית Google Meet.';
const CONFIRM_LINE = 'אשמח שתאשרו בלחיצה על "כן" בהזמנה, כך אדע ששמרתם את הזמן.';

/** נוסח המערכת — מה שיוצא כל עוד המשרד לא ערך. ההסבר לכל משפט: INVITE_WHY. */
export const MEETING_TEMPLATE_DEFAULTS: Record<MeetingKind, MeetingTemplate> = {
  intro: {
    subject: '{{kind}} · {{names}} · {{organizer}}',
    body: [
      '{{greeting}}',
      '{{note}}',
      'קבענו שיחת היכרות בווידאו, {{duration}}, ללא עלות וללא התחייבות.',
      'מה נעשה בשיחה:\n• נכיר את המצב שלכם: עבודה, עסק ומשפחה\n• נעבור על מה שהכי בוער לכם עכשיו\n• אסביר איך אוכל לעזור ומה הצעד הבא',
      'אין צורך להכין דבר. אם נוח, רשמו לעצמכם את השאלה הכי חשובה לכם ונתחיל ממנה.',
      JOIN_LINE,
      CONFIRM_LINE,
      '{{reschedule}}',
      'נתראה,\n{{signature}}',
    ].join('\n\n'),
  },
  work: {
    subject: '{{topic}} · {{names}} · {{organizer}}',
    body: [
      '{{greeting}}',
      '{{note}}',
      'קבענו פגישה בווידאו בנושא {{topic}}. היא תימשך {{duration}}.',
      'מה כדאי להכין:\n{{prepList}}',
      JOIN_LINE,
      CONFIRM_LINE,
      '{{reschedule}}',
      'נתראה,\n{{signature}}',
    ].join('\n\n'),
  },
};

/**
 * התבנית שיוצאת לסוג הפגישה: נוסח המשרד (settings.commTemplates) גובר, ושדה ריק —
 * נוסח המערכת. ‼ אותה פונקציה בדפדפן ובשרת.
 */
export function meetingTemplateFor(kind: MeetingKind, commTemplates?: unknown): MeetingTemplate {
  const base = MEETING_TEMPLATE_DEFAULTS[kind];
  const all = (commTemplates && typeof commTemplates === 'object' ? commTemplates : {}) as Record<string, unknown>;
  const e = (all[MEETING_TEMPLATE_KEY[kind]] ?? {}) as { subject?: unknown; body?: unknown };
  const pick = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d);
  return { subject: pick(e.subject, base.subject), body: pick(e.body, base.body) };
}

/** הערכים של כל השדות לפגישה הזו. */
export function inviteValues(input: InviteInput, org: InviteOrg): Record<string, string> {
  const wa = (org.whatsapp ?? '').trim() || (org.phone ?? '').trim();
  const contact = [(org.phone ?? '').trim(), (org.website ?? '').trim()].filter(Boolean).join(' · ');
  const firm = (org.firmName ?? '').trim();
  const sig = organizerTitle(org);
  return {
    greeting: greeting(input.guests),
    names: namesPhrase(input.guests),
    kind: MEETING_KIND_LABELS[input.kind],
    // ‼ פגישה ישנה בלי נושא — סוג הפגישה; פגישת עבודה חדשה לא נשלחת בלי נושא (החלון).
    topic: (input.topic ?? '').trim() || MEETING_KIND_LABELS[input.kind],
    duration: durationText(input.durationMin),
    note: (input.note ?? '').trim(),
    prepList: (input.prep ?? '').split('\n').map(s => s.trim()).filter(Boolean).map(i => `• ${i}`).join('\n'),
    reschedule: wa
      ? `המועד לא מתאים? כתבו לי בוואטסאפ ${wa} או השיבו למייל הזה, ונמצא זמן אחר.`
      : 'המועד לא מתאים? השיבו למייל הזה ונמצא זמן אחר.',
    whatsapp: wa,
    organizer: sig,
    signature: [sig, firm && firm !== (org.fullName ?? '').trim() ? firm : '', contact].filter(Boolean).join('\n'),
  };
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const ONLY_TOKEN = /^\s*\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\s*$/;

/** גוף ההזמנה מתבנית: פסקה שיש בה שורה שכולה שדה ריק — לא מופיעה. */
export function fillInviteBody(body: string, values: Record<string, string>): string[] {
  const val = (k: string) => (values[k] ?? '').trim();
  return body.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/)
    .filter(par => !par.split('\n').some(line => { const m = line.match(ONLY_TOKEN); return !!m && !val(m[1]); }))
    .map(par => par.replace(TOKEN, (_w, k: string) => values[k] ?? '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').trim())
    .filter(Boolean);
}

/** הכותרת מתבנית: שורה אחת, וחלק ריק בין «·» נעלם (בלי שמות ⇒ בלי «·  ·»). */
export function fillInviteTitle(subject: string, values: Record<string, string>): string {
  return subject.replace(TOKEN, (_w, k: string) => values[k] ?? '').replace(/\s+/g, ' ')
    .split('·').map(x => x.trim()).filter(Boolean).join(' · ').slice(0, 250);
}

export function meetingTitle(input: Pick<InviteInput, 'kind' | 'guests' | 'topic'>, org: InviteOrg, tpl?: MeetingTemplate): string {
  const full: InviteInput = { durationMin: MEETING_DEFAULT_MINUTES[input.kind], ...input };
  const values = inviteValues(full, org);
  return fillInviteTitle((tpl ?? MEETING_TEMPLATE_DEFAULTS[input.kind]).subject, values)
    || fillInviteTitle(MEETING_TEMPLATE_DEFAULTS[input.kind].subject, values);
}

/** הפסקאות של גוף ההזמנה, לפי הסדר. עם `move` — שורת העדכון (ומי ביקש) בראש. */
export function inviteParagraphs(input: InviteInput, org: InviteOrg, move?: InviteMove, tpl?: MeetingTemplate): string[] {
  const out: string[] = [];
  if (move) {
    out.push(`עדכון: הפגישה עברה ל${longDay(move.date)} בשעה ${move.time}.`);
    if ((move.note ?? '').trim()) out.push(move.note!.trim());
  }
  const body = fillInviteBody((tpl ?? MEETING_TEMPLATE_DEFAULTS[input.kind]).body, inviteValues(input, org));
  return [...out, ...(body.length ? body : fillInviteBody(MEETING_TEMPLATE_DEFAULTS[input.kind].body, inviteValues(input, org)))];
}

/** תיאור האירוע ביומן, כפי שהוא נשלח. */
export function inviteDescription(input: InviteInput, org: InviteOrg, move?: InviteMove, tpl?: MeetingTemplate): string {
  return inviteParagraphs(input, org, move, tpl).join('\n\n');
}

/** תזכורת להעתקה לוואטסאפ — למי שעוד לא אישר. לא נשלח מייל. */
export function whatsappReminderText(args: { guest: MeetingGuest; date: string; time: string; today: string; signer?: string }): string {
  const first = firstName(args.guest);
  const diff = Math.round((noon(args.date).getTime() - noon(args.today).getTime()) / 86400000);
  const when = diff === 0 ? 'היום' : diff === 1 ? 'מחר' : `ב${longDay(args.date).split(',')[0]}`;
  const sign = (args.signer ?? '').trim();
  return `היי${first ? ' ' + first : ''}, תזכורת קטנה: נדבר ${when} ב-${args.time} ב-Google Meet. הקישור נמצא בהזמנה ששלחתי במייל. נתראה${sign ? ', ' + sign : '!'}`;
}

/**
 * «שלחתי לך זימון» להעתקה לוואטסאפ, מיד אחרי השליחה. ‼ האדם פנה בוואטסאפ — שם הוא
 * מחכה לתשובה; וזימון ממי שעוד לא מכיר נוחת לפעמים בקידומי מכירות או בספאם.
 */
export function whatsappSentText(args: { guest: MeetingGuest; kind: MeetingKind; date: string; time: string }): string {
  const first = firstName(args.guest);
  const what = args.kind === 'intro' ? 'לשיחת היכרות' : 'לפגישה';
  return `היי${first ? ' ' + first : ''}, שלחתי לך למייל זימון ${what} ב${longDay(args.date)} ב-${args.time}. הקישור ל-Google Meet נמצא בזימון. אם לא הגיע, שווה להציץ בספאם. נתראה!`;
}

/** הודעת ביטול להעתקה לוואטסאפ — גוגל שולח הודעת ביטול רשמית; זו המילה האישית. */
export function whatsappCancelText(args: { guest: MeetingGuest; date: string; time: string }): string {
  const first = firstName(args.guest);
  return `היי${first ? ' ' + first : ''}, נאלצתי לבטל את הפגישה שקבענו ל${longDay(args.date)} ב-${args.time}, סליחה. אחזור אליכם לתיאום מועד חדש.`;
}

/**
 * למה נוסח המערכת כתוב כך — מוצג בעורך הנוסח («למה כתוב כך?»), לפי סדר ההזמנה.
 * ‼ ההסבר הוא על נוסח המערכת; נוסח שהמשרד ערך — שלו.
 */
export const INVITE_WHY: readonly { label: string; why: string }[] = [
  { label: 'הכותרת', why: 'שני השמות בכותרת: ביומן שלהם רואים עם מי נפגשים, ביומן שלך רואים מי מגיע. השם והתואר שלך בונים אמון עוד לפני שפותחים את המייל.' },
  { label: 'פנייה בשם', why: 'פנייה בשם הפרטי הופכת הודעה מיומן להודעה אישית. בלי שם, «שלום,» פשוט ולא «לקוח יקר».' },
  { label: 'השורה האישית', why: 'משפט אחד שאתה כותב מראה שזה לא מייל המוני. זה הפרט הקטן שהכי מעלה את הסיכוי שיגיעו.' },
  { label: 'מה ולכמה זמן', why: 'משך ידוע מראש הוא התחייבות קטנה וברורה, וקל להגיד עליה כן. בשיחת היכרות, «ללא עלות וללא התחייבות» מוריד את הסיכון. בפגישת עבודה — הלקוח יודע למה הוא מגיע וכמה זמן לפנות.' },
  { label: 'מה נעשה בשיחה', why: 'שלוש נקודות מורידות אי-ודאות, ואי-ודאות היא סיבה מרכזית לא להגיע. הנקודה השלישית מבטיחה תוצאה: יוצאים מהשיחה עם צעד הבא.' },
  { label: 'מה להכין', why: 'בשיחת היכרות — בלי שיעורי בית: כל דרישה מעלה את הסיכוי לביטול. בפגישת עבודה — רשימה קצרה חוסכת פגישה שנייה.' },
  { label: 'איך מצטרפים', why: 'חשש טכני הוא סיבה שקטה לא להגיע, בעיקר אצל מבוגרים. משפט אחד עם «בלי התקנה» מוריד אותו.' },
  { label: 'בקשה לאשר', why: 'לחיצה על «כן» היא התחייבות קטנה, ומי שאישר מגיע יותר. ואתה רואה ב-PIVO מי אישר ומי לא ענה.' },
  { label: 'דרך קלה לשנות', why: 'מי שלא יכול להגיע ומתבייש להגיד פשוט לא מגיע. דרך קלה לשנות, בערוץ שהם כבר משתמשים בו, הופכת אי-הגעה לתיאום מחדש.' },
  { label: 'חתימה', why: 'שם, תואר וטלפון מפרטי המשרד, כמו בשאר המיילים. הכול נראה כאילו הגיע מאותו מקום.' },
  { label: 'בשינוי מועד', why: 'שורת העדכון בראש — מי שרק מציץ רואה מיד את המועד החדש. אם אתה הזזת: התנצלות במשפט אחד ודרך קלה לסרב; אם הם ביקשו: «כפי שסיכמנו», בלי להאשים.' },
];
