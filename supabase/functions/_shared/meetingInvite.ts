// ═══════════════════════════════════════════════════════════════════════════
//  זימון לפגישה ב-Google Meet — מקור האמת לנוסח
// ═══════════════════════════════════════════════════════════════════════════
//  נצרך משתי הסביבות מאותו קובץ ממש:
//    • Frontend (Vite/TS):  התצוגה המקדימה בחלון «פגישה חדשה» ובשינוי מועד
//    • Edge Function (Deno): calendar-meeting — מה שנכתב באמת לאירוע ביומן
//  ולכן הקובץ טהור: בלי React, בלי DOM, בלי Deno API ובלי ייבוא חיצוני.
//  מה שהרו"ח רואה לפני «שלח זימון» הוא מה שיוצא, כי זה אותו קוד ואותם קלטים.
//
//  ‼ למה כל משפט כתוב כך — `INVITE_WHY` למטה, והוא מוצג במסך («למה כתוב כך?»).
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

export function meetingTitle(input: Pick<InviteInput, 'kind' | 'guests' | 'topic'>, org: InviteOrg): string {
  const label = input.kind === 'intro' ? MEETING_KIND_LABELS.intro : ((input.topic ?? '').trim() || MEETING_KIND_LABELS.work);
  return [label, namesPhrase(input.guests), organizerTitle(org)].filter(Boolean).join(' · ');
}

export function greeting(guests: MeetingGuest[]): string {
  const f = guests.map(firstName).filter(Boolean);
  if (f.length === 0) return 'שלום,';
  if (f.length === 1) return `שלום ${f[0]},`;
  if (f.length === 2) return `שלום ${f[0]} ו${f[1]},`;
  return 'שלום לכולם,';
}

export type InviteBlockKey =
  | 'update' | 'moveNote' | 'greet' | 'note' | 'what' | 'whatWork' | 'agenda'
  | 'prepIntro' | 'prepWork' | 'join' | 'confirm' | 'reschedule' | 'sign';

export interface InviteBlock {
  key: InviteBlockKey;
  /** טקסט נקי; שורות נפרדות ב-\n. כך הוא נכתב לתיאור האירוע ביומן. */
  text: string;
}

/** הפסקאות של גוף ההזמנה, לפי הסדר. עם `move` — שורת העדכון בראש. */
export function inviteBlocks(input: InviteInput, org: InviteOrg, move?: InviteMove): InviteBlock[] {
  const b: InviteBlock[] = [];
  if (move) {
    b.push({ key: 'update', text: `עדכון: הפגישה עברה ל${longDay(move.date)} בשעה ${move.time}.` });
    if ((move.note ?? '').trim()) b.push({ key: 'moveNote', text: move.note!.trim() });
  }
  b.push({ key: 'greet', text: greeting(input.guests) });
  if ((input.note ?? '').trim()) b.push({ key: 'note', text: input.note!.trim() });
  const dur = durationText(input.durationMin);
  if (input.kind === 'intro') {
    b.push({ key: 'what', text: `קבענו שיחת היכרות בווידאו, ${dur}, ללא עלות וללא התחייבות.` });
    b.push({ key: 'agenda', text: [
      'מה נעשה בשיחה:',
      '• נכיר את המצב שלכם: עבודה, עסק ומשפחה',
      '• נעבור על מה שהכי בוער לכם עכשיו',
      '• אסביר איך אוכל לעזור ומה הצעד הבא',
    ].join('\n') });
    b.push({ key: 'prepIntro', text: 'אין צורך להכין דבר. אם נוח, רשמו לעצמכם את השאלה הכי חשובה לכם ונתחיל ממנה.' });
  } else {
    const topic = (input.topic ?? '').trim();
    b.push({ key: 'whatWork', text: topic
      ? `קבענו פגישה בווידאו בנושא ${topic}. היא תימשך ${dur}.`
      : `קבענו פגישת עבודה בווידאו, ${dur}.` });
    const items = (input.prep ?? '').split('\n').map(s => s.trim()).filter(Boolean);
    if (items.length) b.push({ key: 'prepWork', text: ['מה כדאי להכין:', ...items.map(i => `• ${i}`)].join('\n') });
  }
  b.push({ key: 'join', text: 'איך מצטרפים: בשעת הפגישה לוחצים על "הצטרפות ל-Google Meet" בהזמנה הזו. במחשב זה נפתח בדפדפן בלי התקנה, ובטלפון דרך אפליקציית Google Meet.' });
  b.push({ key: 'confirm', text: 'אשמח שתאשרו בלחיצה על "כן" בהזמנה, כך אדע ששמרתם את הזמן.' });
  const wa = (org.whatsapp ?? '').trim() || (org.phone ?? '').trim();
  b.push({ key: 'reschedule', text: wa
    ? `המועד לא מתאים? כתבו לי בוואטסאפ ${wa} או השיבו למייל הזה, ונמצא זמן אחר.`
    : 'המועד לא מתאים? השיבו למייל הזה ונמצא זמן אחר.' });
  const contact = [(org.phone ?? '').trim(), (org.website ?? '').trim()].filter(Boolean).join(' · ');
  const firm = (org.firmName ?? '').trim();
  const sig = organizerTitle(org);
  b.push({ key: 'sign', text: ['נתראה,', sig, firm && firm !== (org.fullName ?? '').trim() ? firm : '', contact].filter(Boolean).join('\n') });
  return b;
}

/** תיאור האירוע ביומן, כפי שהוא נשלח. */
export function inviteDescription(input: InviteInput, org: InviteOrg, move?: InviteMove): string {
  return inviteBlocks(input, org, move).map(x => x.text).join('\n\n');
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

/** למה כל פסקה כתובה כך — מוצג בחלון תחת «למה כתוב כך?». */
export const INVITE_WHY: Record<InviteBlockKey | 'title', { label: string; why: string }> = {
  title: { label: 'הכותרת', why: 'שני השמות בכותרת: ביומן שלהם רואים עם מי נפגשים, ביומן שלך רואים מי מגיע. השם והתואר שלך בונים אמון עוד לפני שפותחים את המייל.' },
  update: { label: 'שורת העדכון', why: 'מי שרק מציץ במייל רואה מיד את המועד החדש, עוד לפני הפרטים.' },
  moveNote: { label: 'מי ביקש', why: 'אם אתה הזזת: התנצלות במשפט אחד ודרך קלה לסרב. אם הם ביקשו: «כפי שסיכמנו», בלי התנצלות מיותרת ובלי לרמוז שהם אשמים.' },
  greet: { label: 'פנייה בשם', why: 'פנייה בשם הפרטי הופכת הודעה מיומן להודעה אישית. בלי שם, «שלום,» פשוט ולא «לקוח יקר».' },
  note: { label: 'השורה האישית', why: 'משפט אחד שאתה כותב מראה שזה לא מייל המוני. זה הפרט הקטן שהכי מעלה את הסיכוי שיגיעו.' },
  what: { label: 'מה ולכמה זמן', why: 'משך ידוע מראש הוא התחייבות קטנה וברורה, וקל להגיד עליה כן. «ללא עלות וללא התחייבות» מוריד את הסיכון.' },
  whatWork: { label: 'נושא ומשך', why: 'הלקוח יודע למה הוא מגיע וכמה זמן לפנות. אין הפתעות.' },
  agenda: { label: 'מה נעשה בשיחה', why: 'שלוש נקודות מורידות אי-ודאות, ואי-ודאות היא סיבה מרכזית לא להגיע. הנקודה השלישית מבטיחה תוצאה: יוצאים מהשיחה עם צעד הבא.' },
  prepIntro: { label: 'בלי שיעורי בית', why: 'בשיחת היכרות כל דרישה מעלה את הסיכוי לביטול. «השאלה הכי חשובה לכם» גורמת להם לחשוב על השיחה מראש, בלי מאמץ.' },
  prepWork: { label: 'מה להכין', why: 'רשימה קצרה חוסכת פגישה שנייה. מעט פריטים, בשפה שלהם.' },
  join: { label: 'איך מצטרפים', why: 'חשש טכני הוא סיבה שקטה לא להגיע, בעיקר אצל מבוגרים. משפט אחד עם «בלי התקנה» מוריד אותו.' },
  confirm: { label: 'בקשה לאשר', why: 'לחיצה על «כן» היא התחייבות קטנה, ומי שאישר מגיע יותר. ואתה רואה ב-PIVO מי אישר ומי לא ענה.' },
  reschedule: { label: 'דרך קלה לשנות', why: 'מי שלא יכול להגיע ומתבייש להגיד פשוט לא מגיע. דרך קלה לשנות, בערוץ שהם כבר משתמשים בו, הופכת אי-הגעה לתיאום מחדש.' },
  sign: { label: 'חתימה', why: 'שם, תואר וטלפון מפרטי המשרד, כמו בשאר המיילים. הכול נראה כאילו הגיע מאותו מקום.' },
};
