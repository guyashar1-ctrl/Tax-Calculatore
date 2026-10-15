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
  | 'send'                 // מוכן לשליחה ללקוח (בלי דף אישי — מייל חתימה)
  | 'approve'              // 240 · מוכן — «אשר והוסף לדף הלקוח» (בלי מייל)
  | 'on_page'              // 240 · זמין בדף לחתימה, טרם נשלחה הודעה
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
  /**
   * ‼ H2.5a · על שם מי ההגשה («רחל לוי»). אצל זוג מס הכנסה יושב אצל בן/בת הזוג
   * הרשום/ה — והאישור שחסר בשע״ם הוא שלו/ה, לא של בעל הכרטיס.
   */
  personName?: string;
  /** מתי נקראה שע״ם בפעם האחרונה להגשה הזו (ISO) — להשוואה לדיווח של הלקוח. */
  checkedAt?: string | null;
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
  /** אזורי החתימה לא סומנו אוטומטית (הטופס שונה מהתבנית), או שחסר בהם מקום/שיוך. */
  formNeedsMarking?: boolean;
  /** מה חסר בטופס הקיים (signatureReadiness) — מוצג בשורת הטופס. */
  formProblems?: string[];
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
  /** הלקוח דיווח בדף האישי שאישר באזור האישי (clientDeclaredAt), והשלב עוד פתוח. */
  clientApprovalDeclaredAt?: string | null;
  /** 245 · הלקוח דיווח «אישרתי», ובדיקה בשע״ם אחרי זה הראתה שהאישור לא הגיע — השלב חזר אליו. */
  clientApprovalNotReceivedAt?: string | null;
  /** 239/240 · לבקשה יש שורה בדף האישי — היא מאושרת לדף ונשלחת עם מייל הדף, לא במייל משלה. */
  pageChannel?: boolean;
  /** 240 · אושרה לדף (ממתין לחתימה): הלקוח יכול לחתום מהדף כבר עכשיו, גם בלי מייל. */
  approvedOnPage?: boolean;
  /** 240 · הדף פתוח ללקוח (client_step_gate_open). חסר ⇒ פתוח. */
  pageOpen?: boolean;
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
  /**
   * אחרי ההגשה, כששע״ם ממתינה לאישור הלקוח באזור האישי:
   * 'needed' — טרם דווח · 'declared' — דווח, ואין עדיין בדיקה בשע״ם אחרי הדיווח ·
   * 'still_waiting' — דווח, ובבדיקה שאחרי הדיווח שע״ם עדיין ממתינה.
   * חסר ⇒ הכותרת אינה עוסקת באישור (גם כשיש כרטיס זירוז פתוח).
   */
  approval?: 'needed' | 'declared' | 'still_waiting' | 'returned';
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

/** «רחל לוי» ⇒ «רחל» — לכותרות, כמו firstName. */
function firstWord(name?: string | null): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** זמן ISO למספר; לא תקין ⇒ NaN (וכל השוואה איתו false). */
const ms = (iso?: string | null): number => (iso ? Date.parse(iso) : NaN);

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
      detail: !input.formReady && input.formProblems?.length ? input.formProblems.join(' ') : undefined,
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
  const prepared = input.sent || !!input.approvedOnPage || (input.formReady && prepareOpen.length === 0);
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

  const plan = (kind: RcKind, ball: RcBall, headline: string, sub: string, approval?: RcPlan['approval']): RcPlan =>
    ({ kind, ball, ballLabel: BALL_LABELS[ball], headline, sub, phases, prepare, ...(approval ? { approval } : {}) });

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
  // ‼ 240 · חתימה שהגיעה מהדף לפני כל מייל — המצב האמיתי (נחתם) גובר על «טרם נשלח».
  if (!input.sent && !input.signed) {
    // ‼ 240 · מאושר לדף: הלקוח יכול לחתום מהדף עכשיו. ההודעה — החלטה נפרדת של המשרד.
    if (input.pageChannel && input.approvedOnPage) {
      return input.pageOpen === false
        ? plan('on_page', 'office', `אושר — הדף של ${first} עוד לא נפתח לו`,
            `הבקשה תופיע בדף ברגע שהקליטה תפורסם ל${first} («פרסם בדף» בבקשות). עד אז היא לא מוצגת לו.`)
        // ‼ אין כאן משימה של המשרד: הלקוח יכול לחתום מהדף, וההודעה היא החלטה של «בקשות».
        : plan('on_page', 'client', `ממתינים ל${first} · הבקשה בדף`,
            `${first} יכול לחתום כבר עכשיו מהדף. הודעה במייל עוד לא נשלחה — את עדכון הדף שולחים מ«בקשות».`);
    }
    if (prepareOpen.length > 0 || !input.formReady) {
      const n = prepareOpen.length || 1;
      if (input.pageChannel) {
        return plan('prepare', 'office',
          n === 1 ? 'נשאר צעד אחד לפני האישור לדף' : `נשארו ${n} צעדים לפני האישור לדף`,
          `כשיושלמו — «אשר והוסף לדף הלקוח», והבקשה תופיע בדף של ${first}.`);
      }
      return plan('prepare', 'office',
        n === 1 ? `נשאר צעד אחד לפני השליחה ${toFirst}` : `נשארו ${n} צעדים לפני השליחה ${toFirst}`,
        `כשיושלמו, יצא ${toFirst} מייל אחד עם כל מה שנדרש.`);
    }
    const hasNi = input.ni.length > 0;
    if (input.pageChannel) {
      return plan('approve', 'office', `מוכן להוסיף לדף של ${first}`,
        `הטופס מוכן${hasNi ? ' והאסמכתא של ביטוח לאומי נשמרה' : ''}. האישור מוסיף את הבקשה לדף של ${first} תחת «נדרש ממך» — בלי מייל.`);
    }
    return plan('send', 'office', `מוכן לשליחה ${toFirst}`,
      `הטופס מוכן${hasNi ? ' והאסמכתא של ביטוח לאומי נשמרה' : ''}. מייל אחד יגיע ${toFirst} עם כל מה שנדרש.`);
  }

  // ── נשלח, טרם נחתם ─────────────────────────────────────────────────────
  if (!input.signed) {
    const asks = ['לחתום על ייפוי הכוח', ...input.clientOpenItems,
      ...(input.ni.some(n => !n.final) ? ['לאשר את הייצוג בביטוח הלאומי'] : [])];
    // ‼ הרשימה עצמה מוצגת מתחת — המשפט אומר רק את ההיקף, לא חוזר עליה. מתי יצא
    // המייל ומה קרה לו — בטור «המייל», ממקור אחד (29.09.2026: הכותרת אמרה «יצא»
    // והשורה של החותם אמרה «טרם נשלח»).
    return plan('waiting_client', 'client', `ממתינים ${toFirst}`,
      `${asks.length === 1 ? 'נשאר דבר אחד' : `נשארו ${asks.length} דברים`} אצל ${first}. אפשר בכל סדר.`);
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
    // ‼ D2-4 · ההגשה היא לחיצה (automationCatalog: «בלחיצה במרכז הייצוג»), לא תהליך אוטומטי.
    return plan('submit', 'office', 'מוכן להגשה לשע״ם',
      'הטופס חתום ומוטבע. «שלח טופס חתום לשע״ם» מגיש אותו דרך מחשב העבודה במשרד.');
  }

  // ── הוגש — ממתינים ─────────────────────────────────────────────────────
  // ‼ H2.5a · של מי האישור: מי שההגשה שלו/ה ממתינה בשע״ם, לא בעל הכרטיס. בלי קריאה
  // לאדם מסוים (רק השלב סומן כחובה) — בעל הכרטיס, כמו קודם.
  const awaitingApproval = input.shaam.filter(s => s.awaitingClientApproval);
  const namesOf = (subs: RcShaamInput[]) => [...new Set(subs.map(s => firstWord(s.personName)).filter(Boolean))];
  if (input.clientApprovalRequiredOpen || awaitingApproval.length > 0) {
    const names = namesOf(awaitingApproval);
    const who = joinNames(names) || first;
    const declaredAt = ms(input.clientApprovalDeclaredAt);
    if (!Number.isNaN(declaredAt)) {
      // ‼ H2:X-4 · הלקוח דיווח בדף. מה קובע — בדיקה בשע״ם **אחרי** הדיווח (PIVO לא בודקת לבד).
      const checkedAfter = (s: RcShaamInput) => ms(s.checkedAt) > declaredAt;
      const still = awaitingApproval.filter(checkedAfter);
      if (still.length > 0) {
        // ‼ לא מבוי סתום: הצעד הבא נוקב בפקדים האמיתיים — המדריך (בכרטיס) והבדיקה.
        return plan('waiting_authorities', 'client', `שע״ם עדיין ממתינה לאישור של ${joinNames(namesOf(still)) || who}`,
          `לפי ${first} האישור כבר ניתן, אבל גם בבדיקה שאחרי הדיווח שע״ם ממתינה. עוברים יחד על המדריך, ואז «בדוק קבלת הייצוג».`,
          'still_waiting');
      }
      if (!input.shaam.some(checkedAfter)) {
        return plan('waiting_authorities', 'office', 'דווח שהאישור ניתן — לבדוק בשע״ם',
          `לפי ${first}, האישור באזור האישי כבר ניתן. «בדוק קבלת הייצוג» יראה אם שע״ם קלטה אותו.`,
          'declared');
      }
      // בדיקה שאחרי הדיווח כבר לא מציגה «ממתין לאישור לקוח» ⇒ ממתינים לקליטה, כמו כל הגשה.
    } else if (!Number.isNaN(ms(input.clientApprovalNotReceivedAt))) {
      // ‼ 245 · ההצהרה לא נקלטה — השרת החזיר את הבקשה לדף, עם המדריך והקישור.
      return plan('waiting_authorities', 'client', `שע״ם עדיין ממתינה לאישור של ${who}`,
        `לפי ${first} האישור כבר ניתן, אבל בבדיקה בשע״ם הוא עוד לא הגיע. הבקשה חזרה לדף האישי עם המדריך והקישור.`,
        'returned');
    } else {
      return plan('waiting_authorities', 'client', `נדרש אישור של ${who} ברשות המסים`,
        names.length > 1
          ? 'רשות המסים ממתינה לאישור הייצוג — כל אחד באזור האישי שלו. בלי האישור הייצוג לא ייקלט.'
          : `רשות המסים ממתינה לאישור הייצוג באזור האישי של ${who}. בלי האישור הייצוג לא ייקלט.`,
        'needed');
    }
  }
  const niOpen = input.ni.filter(n => !n.final);
  if ((active || shaamSettled) && niOpen.length > 0) {
    return plan('waiting_authorities', 'client', `נשאר האישור של ${joinNames(niOpen.map(n => n.name)) || first} בביטוח הלאומי`,
      'הייצוג ברשות המסים נקלט. בביטוח הלאומי הוא ייכנס לתוקף אחרי אישור האסמכתא.');
  }
  // ‼ למה מחכים ועד מתי — בטור «מה עוד פתוח», שורה לכל רשות (לא משפט עם סוגריים).
  // ‼ D2-4 · אין בדיקה חוזרת ברקע (הכרעת גיא, 28.09) — רק אחת מיד אחרי ההגשה. המצב
  // מתעדכן כשלוחצים, ולכן המשפט אומר את זה ולא מבטיח עדכון שלא יגיע.
  return plan('waiting_authorities', 'authority', 'הוגש — ממתינים לקליטה',
    'אין פעולה נדרשת ממך עכשיו. PIVO לא בודקת לבד — «בדוק קבלת הייצוג» מעדכן את המצב.');
}
