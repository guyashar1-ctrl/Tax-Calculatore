// ─── מרכז הייצוג: «מה עכשיו» — החלטה אחת למסך כולו ───────────────────────────
// ‼ 28.09.2026 · המסך הקודם הציג שני טורים של 7 ו-4 שלבים, את כולם תמיד, והפעולה
// הבאה ישבה בתחתית העמוד. גיא: «עמוס, מבולגן, קשה להבנה». כאן נגזר — ממקום אחד —
// איפה התהליך עומד (ארבעה שלבים), אצל מי הכדור, מה הכותרת, ומה הפעולה היחידה
// שנדרשת עכשיו. הפירוט המלא לכל רשות נשאר, אבל נפתח רק לפי דרישה.
// ‼ טהור: אין כאן JSX ואין גישה לנתונים. המרכז מחשב את הקלט מאותן נגזרות שהוא
// כבר מחזיק (סטטוס, מעקב שע״ם, מסלולי ב״ל), והבדיקות עוברות על כל המעברים.

export type RcPhaseKey = 'prepare' | 'client' | 'submit' | 'accept';
export type RcBall = 'office' | 'client' | 'authority' | 'none';
export type RcKind =
  | 'prepare'              // לפני השליחה: בקשה בשע״ם, טופס, אסמכתא בב״ל
  | 'replacement'          // רשות הוסרה אחרי שהבקשה נפתחה בשע״ם ⇒ לבטל שם
  | 'send'                 // מוכן לשליחה ללקוח
  | 'waiting_client'       // נשלח — ממתינים לחתימה (ולשאר מה שביקשנו)
  | 'stamp'                // הלקוח חתם — חתימה וחותמת של המשרד
  | 'waiting_docs'         // חתום ומוטבע — מסמך ששע״ם דורשת עוד לא אושר/הגיע
  | 'blocked'              // חתום ומוטבע — השידור נעצר ונדרשת פעולה של המשרד
  | 'submit'               // מוכן להגשה לשע״ם
  | 'waiting_authorities'  // הוגש — ממתינים לרשויות (או לאישור הלקוח שם)
  | 'active';              // הכול נקלט

export interface RcShaamInput {
  key: string;
  /** «מס הכנסה, מע"מ, ניכויים» */
  label: string;
  /** יש ראיה או סימון שהבקשה קיימת בשע״ם. */
  entered: boolean;
  /** רשות הוסרה ובקשה בשע״ם עדיין כוללת אותה. */
  replacementRequestNumber?: string | null;
  replacementRemoved?: string[];
  /** נגזר ב-shaamClientDocumentsPending — מה הלקוח עוד לא אישר/העלה. */
  clientDocumentsPending?: string | null;
  /** עצירת מסמכים של השידור (204) — סיבה, ואם התיקון בידי המשרד. */
  documentsBlockedReason?: string | null;
  documentsBlockedOfficeFix?: boolean;
  /** שע״ם אמרה שהכול נקלט (או «פעיל לפי רשות»). */
  settled?: boolean;
  /** שע״ם: «ממתין לאישור לקוח». */
  awaitingClientApproval?: boolean;
  /** שורת מצב אחרי ההגשה, בלשון של שע״ם («השהיה עד 3.10»). */
  submittedStatus?: string | null;
}

export interface RcNiInput {
  role: 'client' | 'spouse';
  name: string;
  prereqMissing: boolean;
  entered: boolean;
  hasRef: boolean;
  /** ההוראות יצאו (עם מייל החתימה או בנפרד). */
  delivered: boolean;
  final: boolean;
}

export interface RcInput {
  status: string;
  /** שם פרטי לכותרות («מוכן לשליחה לעידן»). ריק ⇒ «הלקוח». */
  firstName: string;
  formReady: boolean;
  /** אזורי החתימה לא סומנו אוטומטית (הטופס שונה מהתבנית). */
  formNeedsMarking?: boolean;
  sent: boolean;
  sentAt?: string | null;
  signed: boolean;
  stamped: boolean;
  submitted: boolean;
  shaam: RcShaamInput[];
  ni: RcNiInput[];
  /** מה הלקוח עוד צריך לעשות מלבד החתימה (אישור צילום וכד'). */
  clientOpenItems: string[];
  /** אישור המייצג באזור האישי: נדרש (201) ועדיין פתוח. */
  clientApprovalRequiredOpen?: boolean;
  /** אחרי ההגשה: למה מחכים, כל פריט כבר עם «ל» («לשע״ם (צפי …)», «לאישור של גל בביטוח הלאומי (עד …)»). */
  waitingOn?: string[];
}

export interface RcPrepareItem {
  key: string;
  label: string;
  detail?: string;
  done: boolean;
}

export interface RcPhase {
  key: RcPhaseKey;
  label: string;
  state: 'done' | 'current' | 'todo';
}

export interface RcPlan {
  kind: RcKind;
  ball: RcBall;
  /** מה כתוב מעל הכותרת — אצל מי הכדור, במילים. */
  ballLabel: string;
  headline: string;
  sub: string;
  phases: RcPhase[];
  prepare: RcPrepareItem[];
}

const PHASE_LABELS: Record<RcPhaseKey, string> = {
  prepare: 'הכנה',
  client: 'חתימת הלקוח',
  submit: 'הגשה',
  accept: 'קליטה ברשויות',
};

const BALL_LABELS: Record<RcBall, string> = {
  office: 'הכדור אצלך',
  client: 'ממתינים ללקוח',
  authority: 'ממתינים לרשויות',
  none: 'הושלם',
};

/** «עידן ו-מיכל» / «עידן» */
function joinNames(names: string[]): string {
  const n = [...new Set(names.filter(Boolean))];
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} ו${n[n.length - 1]}`;
}

function listSentence(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} ו${p[p.length - 1]}`;
}

/** מה נשאר לעשות לפני שאפשר לשלוח ללקוח. סדר = סדר העבודה. */
export function rcPrepareItems(input: RcInput): RcPrepareItem[] {
  const items: RcPrepareItem[] = [];
  const many = input.shaam.length > 1;
  for (const s of input.shaam) {
    items.push({
      key: `shaam:${s.key}`,
      label: s.entered ? 'הבקשה נפתחה בשע״ם' : 'לפתוח בקשת ייצוג בשע״ם',
      detail: many ? s.label : undefined,
      done: s.entered,
    });
  }
  if (input.shaam.length > 0) {
    items.push({
      key: 'form',
      label: input.formReady ? 'טופס ייפוי הכוח מוכן לחתימה'
        : input.formNeedsMarking ? 'לסמן את אזורי החתימה בטופס' : 'טופס ייפוי הכוח לחתימה',
      done: input.formReady,
    });
  }
  const manyNi = input.ni.length > 1;
  for (const n of input.ni) {
    const who = manyNi ? n.name : undefined;
    if (n.prereqMissing) {
      items.push({ key: `ni-prereq:${n.role}`, label: 'להשלים פרטים לביטוח לאומי', detail: who, done: false });
      continue;
    }
    items.push({ key: `ni-enter:${n.role}`, label: n.entered ? 'ייפוי הכוח הוזן בביטוח לאומי' : 'להזין ייפוי כוח בביטוח לאומי', detail: who, done: n.entered });
    items.push({ key: `ni-ref:${n.role}`, label: n.hasRef ? 'אסמכתא של ביטוח לאומי נשמרה' : 'לשמור את מספר האסמכתא מביטוח לאומי', detail: who, done: n.hasRef });
  }
  return items;
}

export function repCenterPlan(input: RcInput): RcPlan {
  const first = input.firstName.trim() || 'הלקוח';
  // ‼ «ל» + שם ⇒ «לעידן»; בלי שם ⇒ «ללקוח» (לא «להלקוח»).
  const toFirst = input.firstName.trim() ? `ל${input.firstName.trim()}` : 'ללקוח';
  const prepare = rcPrepareItems(input);
  const prepareOpen = prepare.filter(i => !i.done);
  const niAllFinal = input.ni.every(n => n.final);
  const active = input.status === 'active';
  const shaamSettled = input.shaam.length > 0 && input.shaam.every(s => s.settled);

  // ── שלבים ─────────────────────────────────────────────────────────────
  const prepared = input.sent || (input.formReady && prepareOpen.length === 0);
  const clientDone = input.signed;
  const submitDone = input.submitted;
  const acceptDone = (active || shaamSettled || input.shaam.length === 0) && niAllFinal && submitDone;
  const doneFlags: Record<RcPhaseKey, boolean> = {
    prepare: prepared, client: clientDone, submit: submitDone, accept: acceptDone,
  };
  const order: RcPhaseKey[] = ['prepare', 'client', 'submit', 'accept'];
  const currentIdx = order.findIndex(k => !doneFlags[k]);
  const phases: RcPhase[] = order.map((k, i) => ({
    key: k, label: PHASE_LABELS[k],
    state: doneFlags[k] && (currentIdx === -1 || i < currentIdx) ? 'done' : i === currentIdx ? 'current' : doneFlags[k] ? 'done' : 'todo',
  }));

  const plan = (kind: RcKind, ball: RcBall, headline: string, sub: string): RcPlan =>
    ({ kind, ball, ballLabel: BALL_LABELS[ball], headline, sub, phases, prepare });

  // ── סופי גובר ──────────────────────────────────────────────────────────
  if (acceptDone) {
    return plan('active', 'none', 'הייצוג פעיל', 'הייצוג נקלט בכל הרשויות שהתבקשו.');
  }

  // ── רשות הוסרה אחרי שהבקשה נפתחה בשע״ם ⇒ ביטול שם לפני כל דבר אחר ────────
  const repl = input.shaam.find(s => !!s.replacementRequestNumber);
  if (repl && !input.submitted) {
    const removed = listSentence(repl.replacementRemoved ?? []);
    return plan('replacement', 'office', `צריך לבטל בשע״ם את בקשה ${repl.replacementRequestNumber}`,
      `${removed || 'רשות'} הוסר מהבקשה, אבל הבקשה שכבר נפתחה בשע״ם עדיין כוללת אותו. אחרי הביטול תיפתח בקשה חדשה רק למה שנשאר.`);
  }

  // ── לפני השליחה ─────────────────────────────────────────────────────────
  if (!input.sent) {
    if (prepareOpen.length > 0 || !input.formReady) {
      const n = prepareOpen.length || 1;
      return plan('prepare', 'office',
        n === 1 ? `נשאר צעד אחד לפני השליחה ${toFirst}` : `נשארו ${n} צעדים לפני השליחה ${toFirst}`,
        `כשיושלמו, יצא ${toFirst} מייל אחד עם כל מה שנדרש.`);
    }
    const hasNi = input.ni.length > 0;
    return plan('send', 'office', `מוכן לשליחה ${toFirst}`,
      `הטופס מוכן${hasNi ? ' והאסמכתא של ביטוח לאומי נשמרה' : ''}. מייל אחד יגיע ${toFirst} עם כל מה שנדרש.`);
  }

  // ── נשלח, טרם נחתם ─────────────────────────────────────────────────────
  if (!input.signed) {
    const asks = ['לחתום על ייפוי הכוח', ...input.clientOpenItems,
      ...(input.ni.some(n => !n.final) ? ['לאשר את הייצוג בביטוח הלאומי'] : [])];
    // ‼ הרשימה עצמה מוצגת מתחת — המשפט אומר רק מתי יצא ומה ההיקף, לא חוזר עליה.
    const when = input.sentAt ? `המייל יצא ב-${new Date(input.sentAt).toLocaleDateString('he-IL')}. ` : '';
    return plan('waiting_client', 'client', `ממתינים ${toFirst}`,
      `${when}${asks.length === 1 ? 'נשאר דבר אחד' : `נשארו ${asks.length} דברים`} אצל ${first}:`);
  }

  // ── נחתם, טרם הוטבעה חותמת ─────────────────────────────────────────────
  if (!input.stamped) {
    return plan('stamp', 'office', `החתימה של ${first} התקבלה — נשארו החתימה והחותמת שלך`,
      'אחרי החתימה והחותמת הטופס מוכן להגשה לשע״ם.');
  }

  // ── חתום ומוטבע, טרם הוגש ──────────────────────────────────────────────
  if (!input.submitted) {
    const office = input.shaam.find(s => s.documentsBlockedReason && s.documentsBlockedOfficeFix);
    if (office) {
      return plan('blocked', 'office', 'השידור לשע״ם נעצר', office.documentsBlockedReason ?? '');
    }
    const waitingDocs = input.shaam.find(s => s.clientDocumentsPending || (s.documentsBlockedReason && !s.documentsBlockedOfficeFix));
    if (waitingDocs) {
      return plan('waiting_docs', 'client', `ממתינים לצילום התעודה של ${first}`,
        'הטופס חתום ומוכן. ההגשה לשע״ם תיפתח אחרי אישור הצילום שבתיק, או העלאת צילום אחר.');
    }
    return plan('submit', 'office', 'מוכן להגשה לשע״ם', 'הטופס חתום ומוטבע. ההגשה נעשית אוטומטית מול שע״ם.');
  }

  // ── הוגש — ממתינים ─────────────────────────────────────────────────────
  if (input.clientApprovalRequiredOpen || input.shaam.some(s => s.awaitingClientApproval)) {
    return plan('waiting_authorities', 'client', `נדרש אישור של ${first} ברשות המסים`,
      `רשות המסים ממתינה לאישור הייצוג באזור האישי של ${first}. בלי האישור הייצוג לא ייקלט.`);
  }
  const niOpen = input.ni.filter(n => !n.final);
  if ((active || shaamSettled) && niOpen.length > 0) {
    return plan('waiting_authorities', 'client', `נשאר האישור של ${joinNames(niOpen.map(n => n.name)) || first} בביטוח הלאומי`,
      'הייצוג ברשות המסים נקלט. בביטוח הלאומי הוא ייכנס לתוקף אחרי אישור האסמכתא.');
  }
  const waits = (input.waitingOn ?? []).filter(Boolean);
  return plan('waiting_authorities', 'authority', 'הוגש — ממתינים לקליטה',
    waits.length ? `ממתינים ${listSentence(waits)}. בינתיים אין פעולה נדרשת ממך.` : 'הטופס הוגש לשע״ם. בינתיים אין פעולה נדרשת ממך.');
}
