// ─── אב-טיפוס: הרצת מסלול אצל לקוח (בזיכרון בלבד) ────────────────────────────
// ‼ אין כאן רשת, מסד או מייל. כל "מייל" הוא שורה ב-outbox של ההדגמה.
//
// הכללים שהמנוע מדגים (ונבדקים ב-__tests__/flowEngine.test.ts):
//   1. פריטים באותו שלב מתקדמים במקביל. שלב נפתח לפי «מיד» / «אחרי שלב» /
//      «אחרי פריט» — תלות מפורשת, לא סדר תצוגה.
//   2. מייל ללקוח הוא מרוכז: מייל אחד לכל נמען, עם כל מה שחדש עבורו באותו רגע —
//      גם כששני שלבים נפתחים יחד. מייל מפרט רק פריטים שלא נמסרו עליהם עדיין.
//   3. פריט שנוסף אחרי שהשלב כבר נמסר הוא «נוסף אחרי המייל». בשלב «לבד» הוא
//      נאסף לעדכון אחד בסוף היום; בשלב «באישורך» הוא מחכה במגש.
//   4. שליחה חוזרת בלי חדש לא מייצרת מייל (אין כפילות). תזכורת היא מעשה נפרד.
//   5. אירוע חוזר (ההצעה אושרה שוב) לא פותח מסלול שני.
//   6. פעולה מול רשות לעולם לא רצה לבד — היא «ממתין לך». גם גורם חיצוני.
//   7. בלי כתובת מייל — «לא נשלח», הפריטים נשארים בדף, ושום דבר לא נחשב כנמסר.
//   8. עצירה מקפיאה את מה שקורה לבד; חידוש משלים אותו במייל מרוכז אחד.
//   9. שינוי במסלול חל על ריצות חדשות; ריצה קיימת מתעדכנת רק בבחירה מפורשת.
//  10. שינוי בנתוני הלקוח באמצע (נישואים) לא מוסיף בקשות לבד — הוא מציע.

import {
  type Flow, type Stage, type StageItem, type ItemRef, type DemoClient, type Actor,
  libraryEntry, actionRef, itemName, itemActor, isPerPerson, persons, matches, whyNot,
  checklistFor, DELIVERY_LABELS,
} from './flowModel';

export type ItemState = 'open' | 'waiting_office' | 'done' | 'skipped' | 'cancelled';
export type Recipient = 'owner' | 'spouse' | 'external' | 'none';

export interface ItemInst {
  key: string;
  stageId: string;
  uid: string;
  ref: ItemRef;
  title: string;
  person?: 'client' | 'spouse';
  personName?: string;
  actor: Actor | 'document' | 'action';
  state: ItemState;
  /** מופיע בדף האישי של הלקוח. */
  published: boolean;
  /** מזהה המייל שמסר עליו לנמען. null — עוד לא נמסר. */
  announced: string | null;
  recipient: Recipient;
  /** נוסף אחרי שהשלב כבר נמסר ללקוח. */
  late: boolean;
  optional: boolean;
  /** צורף לבקשה שכבר הייתה פתוחה, או נלקח מבקשה שהושלמה בעבר. */
  reused?: 'attached' | 'done_before';
  /** דורש הכנה שלך לפני שיוצא (מכתב לרו״ח הקודם). */
  needsPrep?: boolean;
  checklist?: string[];
  createdAt: number;
  doneAt?: number;
  /** תוצאה אחרונה של פעולה (מדומה) — «נעצרה», «לא ידוע אם נקלט». */
  note?: string;
  /** נוסף ללקוח הזה בלבד, לא מהמסלול. */
  perClient?: boolean;
}

export type StageState = 'waiting' | 'open' | 'done' | 'not_applicable';

export interface StageInst {
  stageId: string;
  state: StageState;
  openedAt?: number;
  doneAt?: number;
  /** מתי נמסר לאחרונה ללקוח על השלב — לתזכורות. */
  lastNoticeAt?: number;
  remindersSent: number;
  why?: string;
}

export interface OutEmail {
  id: string;
  at: number;
  to: 'owner' | 'spouse' | 'external' | 'office';
  toLabel: string;
  address: string | null;
  kind: 'open' | 'update' | 'reminder' | 'external' | 'office';
  subject: string;
  /** מפתחות הפריטים שהמייל מפרט. */
  items: string[];
  status: 'sent' | 'failed';
  note?: string;
  /** נשלח לבד או בלחיצה שלך. */
  by: 'auto' | 'me';
}

export interface LogEntry { at: number; text: string; tone: 'auto' | 'me' | 'client' | 'warn' | 'info' }

export interface ExistingRequest { libId: string; state: 'open' | 'done'; title: string; when: string }

export type RunStatus = 'idle' | 'active' | 'paused' | 'cancelled' | 'done';

export interface Run {
  flow: Flow;
  client: DemoClient;
  status: RunStatus;
  /** דקות מתחילת ההדגמה; יום 1 מתחיל ב-09:00. */
  clock: number;
  startedBy?: string;
  stages: Record<string, StageInst>;
  items: ItemInst[];
  outbox: OutEmail[];
  log: LogEntry[];
  existing: ExistingRequest[];
  /** פריטים שהוספת ללקוח הזה לשלב שעוד לא נפתח. */
  extras: { stageId: string; ref: ItemRef }[];
  /** עדכון «לבד» שמחכה לסוף היום: מאז מתי. */
  heldSince?: number;
  seq: number;
}

export const DAY = 24 * 60;
const START_CLOCK = 9 * 60;
const END_OF_DAY = 17 * 60;
const MAX_REMINDERS = 2;

export function clockLabel(t: number): string {
  const day = Math.floor(t / DAY) + 1;
  const m = t % DAY;
  return `יום ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function clone(run: Run): Run {
  return {
    ...run,
    stages: Object.fromEntries(Object.entries(run.stages).map(([k, v]) => [k, { ...v }])),
    items: run.items.map(i => ({ ...i })),
    outbox: [...run.outbox],
    log: [...run.log],
    extras: [...run.extras],
    existing: [...run.existing],
    client: { ...run.client, facts: { ...run.client.facts } },
  };
}

function log(run: Run, text: string, tone: LogEntry['tone']) {
  run.log.push({ at: run.clock, text, tone });
}

export function createRun(flow: Flow, client: DemoClient, existing: ExistingRequest[] = []): Run {
  return {
    flow, client, status: 'idle', clock: START_CLOCK,
    stages: Object.fromEntries(flow.stages.map(s => [s.id, { stageId: s.id, state: 'waiting', remindersSent: 0 } as StageInst])),
    items: [], outbox: [], log: [], existing, extras: [], seq: 0,
  };
}

// ─── יצירת פריטים ────────────────────────────────────────────────────────────

function recipientFor(ref: ItemRef, person: 'client' | 'spouse' | undefined): Recipient {
  if (ref.kind !== 'library') return 'none';
  const e = libraryEntry(ref.id);
  if (!e) return 'none';
  if (e.shelf === 'document') return 'owner';
  if (e.actor === 'office') return 'none';
  if (e.notify === 'external') return 'external';
  // ‼ «הנושא» (ב״ל): ההוראות הולכות לאדם עצמו — לבן/בת הזוג במייל משלו/ה.
  if (e.notify === 'subject' && person === 'spouse') return 'spouse';
  return 'owner';
}

function makeItems(run: Run, stage: Stage, si: { uid: string; ref: ItemRef; optional?: boolean }, opts: { late: boolean; perClient?: boolean; only?: 'client' | 'spouse' }): ItemInst[] {
  const per = isPerPerson(si.ref);
  const people = per ? persons(run.client) : [undefined];
  const out: ItemInst[] = [];
  for (const p of people) {
    if (opts.only && p?.role !== opts.only) continue;
    const role = p?.role;
    const key = `${stage.id}:${si.uid}${role ? `:${role}` : ''}`;
    if (run.items.some(i => i.key === key)) continue;
    const actor = itemActor(si.ref);
    const base = itemName(si.ref);
    const title = per && p ? `${base} — ${p.name}` : base;
    const entry = si.ref.kind === 'library' ? libraryEntry(si.ref.id) : undefined;
    const req = entry?.shelf === 'request' ? entry : undefined;
    const delivery = stage.delivery;
    const pageItem = actor === 'client' || actor === 'document';
    const item: ItemInst = {
      key, stageId: stage.id, uid: si.uid, ref: si.ref, title, actor,
      person: role, personName: p?.name,
      state: actor === 'client' || actor === 'document' ? 'open' : 'waiting_office',
      published: pageItem && delivery !== 'me_first',
      announced: null,
      recipient: recipientFor(si.ref, role),
      late: opts.late,
      optional: !!si.optional,
      needsPrep: !!req?.needsPrep,
      checklist: req?.checklist ? checklistFor(req, run.client) : undefined,
      createdAt: run.clock,
      perClient: opts.perClient,
    };
    // ‼ זהות העבודה (§11 ביסודות): בקשה פתוחה מאותו סוג ללקוח — מצרפים, לא פותחים שנייה.
    const prev = si.ref.kind === 'library' && !per ? run.existing.find(x => x.libId === (si.ref as { id: string }).id) : undefined;
    if (prev?.state === 'open') {
      item.reused = 'attached';
      item.published = true;
      item.announced = 'existing';
      log(run, `«${title}» כבר הייתה פתוחה אצל הלקוח — צורפה לשלב, לא נפתחה שנייה`, 'info');
    } else if (prev?.state === 'done' && req?.once) {
      item.reused = 'done_before';
      item.state = 'done';
      item.doneAt = run.clock;
      item.published = false;
      log(run, `«${title}» הושלמה כבר (${prev.when}) — לא נפתחת שוב`, 'info');
    }
    // דוגמה: «מסמך» הוא שליחה — נחשב הושלם כשיצא, והלקוח רק פותח.
    if (actor === 'document' && item.state === 'open') item.state = 'done';
    out.push(item);
  }
  return out;
}

function stageFor(run: Run, stageId: string): Stage {
  return run.flow.stages.find(s => s.id === stageId)!;
}

function startSatisfied(run: Run, stage: Stage): boolean {
  const st = stage.start;
  if (st.kind === 'flow_start') return true;
  if (st.kind === 'after_stage') {
    const s = run.stages[st.stageId];
    return !!s && (s.state === 'done' || s.state === 'not_applicable');
  }
  const owner = run.flow.stages.find(s => s.items.some(i => i.uid === st.itemUid));
  if (!owner) return true;
  const os = run.stages[owner.id];
  if (os.state === 'not_applicable') return true;
  if (os.state === 'waiting') return false;
  const insts = run.items.filter(i => i.uid === st.itemUid);
  const def = owner.items.find(i => i.uid === st.itemUid)!;
  if (insts.length === 0) return !matches(def.when, run.client);
  return insts.every(i => i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled');
}

function isClosed(i: ItemInst) { return i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled'; }

function openStage(run: Run, stage: Stage) {
  const s = run.stages[stage.id];
  s.state = 'open';
  s.openedAt = run.clock;
  const created: ItemInst[] = [];
  for (const si of stage.items) {
    if (!matches(si.when, run.client)) continue;
    created.push(...makeItems(run, stage, si, { late: false }));
  }
  for (const x of run.extras.filter(e => e.stageId === stage.id)) {
    created.push(...makeItems(run, stage, { uid: `x-${run.seq++}`, ref: x.ref }, { late: false, perClient: true }));
  }
  run.extras = run.extras.filter(e => e.stageId !== stage.id);
  run.items.push(...created);
  const waitingMe = created.filter(i => i.state === 'waiting_office').length;
  log(run, `שלב «${stage.name}» נפתח — ${created.length} ${created.length === 1 ? 'פריט' : 'פריטים'}${waitingMe ? ` · ${waitingMe} ממתינים לך` : ''}`, 'auto');
  if (stage.delivery === 'me_first' && created.some(i => !i.published && (i.actor === 'client' || i.actor === 'document'))) {
    log(run, `«${stage.name}»: מחכה שתאשר לפני שזה מופיע בדף`, 'me');
  }
}

// ─── התקדמות ─────────────────────────────────────────────────────────────────

/** מריץ את מה שקורה לבד עד שאין שינוי. בעצירה — כלום. */
function settle(run: Run) {
  if (run.status !== 'active') return;
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const stage of run.flow.stages) {
      const s = run.stages[stage.id];
      if (s.state === 'waiting' && startSatisfied(run, stage)) {
        if (!matches(stage.when, run.client)) {
          s.state = 'not_applicable';
          s.why = whyNot(stage.when, run.client) ?? undefined;
        } else {
          openStage(run, stage);
        }
        changed = true;
      }
      if (s.state === 'open') {
        const mine = run.items.filter(i => i.stageId === stage.id);
        const blocking = mine.filter(i => !i.optional);
        if (blocking.every(isClosed) && mine.length > 0) {
          s.state = 'done';
          s.doneAt = run.clock;
          log(run, `שלב «${stage.name}» הושלם`, 'auto');
          if (stage.notifyOfficeOnDone) {
            run.outbox.push({
              id: `m${++run.seq}`, at: run.clock, to: 'office', toLabel: 'אליך', address: 'office@example-cpa.co.il',
              kind: 'office', subject: `«${stage.name}» הושלם אצל ${run.client.name}`, items: [], status: 'sent', by: 'auto',
            });
          }
          changed = true;
        } else if (mine.length === 0 && blocking.length === 0) {
          s.state = 'done';
          s.doneAt = run.clock;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  autoDeliver(run);
  const all = run.flow.stages.every(st => ['done', 'not_applicable'].includes(run.stages[st.id].state));
  if (all && run.status === 'active') {
    run.status = 'done';
    log(run, `המסלול «${run.flow.name}» הושלם`, 'auto');
  }
}

/** פריטים שמחכים להיאמר לנמען: מופיעים בדף, עוד לא נמסרו, ופתוחים. */
function undelivered(run: Run, filter?: (i: ItemInst) => boolean): ItemInst[] {
  return run.items.filter(i => i.published && !i.announced
    && (i.recipient === 'owner' || i.recipient === 'spouse')
    && i.state !== 'cancelled' && i.state !== 'skipped'
    // בקשה שהלקוח כבר השלים לא נשלחת אליו כ«מחכה»; מסמך — כן (זה חדש בשבילו).
    && (i.state !== 'done' || i.actor === 'document')
    && (!filter || filter(i)));
}

function addressOf(run: Run, to: 'owner' | 'spouse'): { label: string; address: string | null } {
  return to === 'owner'
    ? { label: run.client.firstName, address: run.client.email }
    : { label: run.client.spouseName ?? 'בן/בת הזוג', address: run.client.spouseEmail ?? null };
}

function subjectFor(kind: OutEmail['kind'], n: number, to: 'owner' | 'spouse', run: Run): string {
  if (to === 'spouse') return kind === 'reminder' ? 'תזכורת: לאשר את ייפוי הכוח בביטוח לאומי' : 'לאשר את ייפוי הכוח בביטוח לאומי';
  if (kind === 'reminder') return `תזכורת: ${n === 1 ? 'דבר אחד מחכה' : `${n} דברים מחכים`} בדף האישי`;
  if (kind === 'update') return n === 1 ? 'נוסף דבר אחד בדף האישי שלך' : `נוספו ${n} דברים בדף האישי שלך`;
  return `${run.client.firstName}, ${n === 1 ? 'דבר אחד מחכה' : `${n} דברים מחכים`} לך בדף האישי`;
}

/** מייל אחד לכל נמען. מחזיר את המיילים שיצאו (או נכשלו). */
function deliver(run: Run, items: ItemInst[], kind: 'open' | 'update', by: 'auto' | 'me'): OutEmail[] {
  const out: OutEmail[] = [];
  for (const to of ['owner', 'spouse'] as const) {
    const mine = items.filter(i => i.recipient === to);
    if (mine.length === 0) continue;
    const { label, address } = addressOf(run, to);
    const mail: OutEmail = {
      id: `m${++run.seq}`, at: run.clock, to, toLabel: label, address,
      kind, subject: subjectFor(kind, mine.length, to, run), items: mine.map(i => i.key),
      status: address ? 'sent' : 'failed', by,
      note: address ? undefined : `אין מייל ${to === 'owner' ? 'בכרטיס' : `של ${label}`} — לא נשלח. הפריטים בדף, ושום דבר לא נחשב כנמסר.`,
    };
    run.outbox.push(mail);
    out.push(mail);
    if (address) {
      for (const i of mine) i.announced = mail.id;
      const stageIds = new Set(mine.map(i => i.stageId));
      for (const sid of stageIds) run.stages[sid].lastNoticeAt = run.clock;
      log(run, `${by === 'auto' ? 'נשלח לבד' : 'שלחת'} מייל ${kind === 'update' ? 'עדכון ' : ''}אחד ל${label} — ${mine.length} ${mine.length === 1 ? 'פריט' : 'פריטים'}`, by === 'auto' ? 'auto' : 'me');
    } else {
      log(run, `המייל ל${label} לא נשלח — אין כתובת. לא סומן כנמסר.`, 'warn');
    }
  }
  return out;
}

/** «לבד»: פריטים חדשים בשלבים אוטומטיים. ראשון — מיד; תוספת מאוחרת — בסוף היום. */
function autoDeliver(run: Run) {
  if (run.status !== 'active') return;
  const auto = undelivered(run, i => stageFor(run, i.stageId).delivery === 'auto');
  if (auto.length === 0) return;
  const fresh = auto.filter(i => !i.late && !run.outbox.some(m => m.status === 'failed' && m.items.includes(i.key)));
  const late = auto.filter(i => i.late);
  if (fresh.length) deliver(run, fresh, 'open', 'auto');
  if (late.length && run.heldSince === undefined) {
    run.heldSince = run.clock;
    log(run, `${late.length === 1 ? 'פריט נוסף' : `${late.length} פריטים נוספו`} אחרי המייל — יישלח עדכון מרוכז אחד בסוף היום`, 'auto');
  }
}

function endOfDay(t: number): number {
  const day = Math.floor(t / DAY);
  const eod = day * DAY + END_OF_DAY;
  return t <= eod ? eod : eod + DAY;
}

// ─── מה שהמשתמש/הלקוח עושים ───────────────────────────────────────────────────

/** האירוע שמפעיל את המסלול. אירוע חוזר עם אותו מפתח — לא פותח שוב. */
export function fire(prev: Run, eventKey: string, label: string): Run {
  const run = clone(prev);
  if (run.status === 'idle') {
    run.status = 'active';
    run.startedBy = eventKey;
    log(run, `${label} — המסלול «${run.flow.name}» התחיל (גרסה ${run.flow.version})`, 'client');
    settle(run);
  } else if (run.startedBy === eventKey) {
    log(run, `${label} שוב — המסלול כבר ${run.status === 'done' ? 'הושלם' : 'רץ'} אצל הלקוח, לא נפתח שוב`, 'info');
  } else if (run.status === 'done' || run.status === 'cancelled') {
    log(run, `${label} — המסלול הקודם ${run.status === 'done' ? 'הושלם' : 'בוטל'}; אירוע חדש פותח ריצה חדשה (היסטוריה נשארת)`, 'info');
  } else {
    log(run, `${label} — כבר יש מסלול «${run.flow.name}» פעיל אצל הלקוח. האירוע נרשם בלבד`, 'info');
  }
  return run;
}

export function completeItem(prev: Run, key: string, by: 'client' | 'me' = 'client'): Run {
  const run = clone(prev);
  const it = run.items.find(i => i.key === key);
  if (!it || isClosed(it)) return prev;
  it.state = 'done';
  it.doneAt = run.clock;
  it.note = undefined;
  log(run, by === 'client' ? `${it.personName && it.recipient === 'spouse' ? it.personName : run.client.firstName} השלים/ה: «${it.title}»` : `סימנת שהושלם: «${it.title}»`, by === 'client' ? 'client' : 'me');
  settle(run);
  return run;
}

/** פעולה מול רשות / עבודה שלך — תוצאה מדומה. */
export function officeAction(prev: Run, key: string, outcome: 'ok' | 'stopped' | 'unknown'): Run {
  const run = clone(prev);
  const it = run.items.find(i => i.key === key);
  if (!it || it.state !== 'waiting_office') return prev;
  if (it.actor === 'external') {
    // מכתב לגורם חיצוני: מייל נפרד, משלו. אינו חלק מהמייל המרוכז ללקוח.
    run.outbox.push({
      id: `m${++run.seq}`, at: run.clock, to: 'external', toLabel: run.client.prevAccountant ?? 'הרו״ח הקודם',
      address: 'prev@example.com', kind: 'external', subject: `העברת טיפול — ${run.client.name}`, items: [it.key], status: 'sent', by: 'me',
    });
    it.state = 'open';
    it.needsPrep = false;
    it.note = 'נשלח — ממתינים לחומרים מהרו״ח הקודם';
    log(run, `שלחת את «${it.title}» ל${run.client.prevAccountant ?? 'רו״ח הקודם'} (מייל נפרד)`, 'me');
    settle(run);
    return run;
  }
  if (outcome === 'ok') {
    it.state = 'done';
    it.doneAt = run.clock;
    it.note = it.actor === 'action' ? 'הסתיימה (מדומה)' : undefined;
    log(run, `${it.actor === 'action' ? 'הפעלת' : 'סיימת'}: «${it.title}»`, 'me');
  } else if (outcome === 'stopped') {
    it.note = 'נעצרה — צריך אותך';
    log(run, `«${it.title}» נעצרה — הבקשה נשארת אצלך, שום דבר לא נחשב כבוצע`, 'warn');
  } else {
    it.note = 'לא ידוע אם נקלט — קודם בודקים, לא שולחים שוב';
    log(run, `«${it.title}»: לא ידוע אם נקלט. השלב לא מתקדם עד שהבדיקה תכריע`, 'warn');
  }
  settle(run);
  return run;
}

/** «שלח» במגש: מייל מרוכז לכל נמען, רק על מה שעוד לא נמסר. */
export function sendNow(prev: Run): Run {
  const run = clone(prev);
  const items = undelivered(run);
  if (items.length === 0) {
    log(run, 'אין חדש לשלוח — לא נשלח מייל נוסף', 'info');
    return run;
  }
  const late = items.some(i => i.late) && items.every(i => i.late);
  deliver(run, items, late ? 'update' : 'open', 'me');
  if (undelivered(run, i => i.late).length === 0) run.heldSince = undefined;
  return run;
}

/** אישור «הכול באישורך»: מה שמחכה לפרסום מופיע בדף. */
export function publishPending(prev: Run): Run {
  const run = clone(prev);
  const pend = run.items.filter(i => !i.published && !i.reused
    && ((i.actor === 'client' && !isClosed(i)) || (i.actor === 'document' && i.state !== 'cancelled' && i.state !== 'skipped')));
  if (pend.length === 0) return prev;
  for (const i of pend) i.published = true;
  log(run, `אישרת — ${pend.length} ${pend.length === 1 ? 'פריט מופיע' : 'פריטים מופיעים'} עכשיו בדף`, 'me');
  return run;
}

export function skipItem(prev: Run, key: string): Run {
  const run = clone(prev);
  const it = run.items.find(i => i.key === key);
  if (!it || isClosed(it)) return prev;
  it.state = 'skipped';
  const wasVisible = it.published;
  it.published = false;
  log(run, `«${it.title}» — לא נדרש אצל הלקוח הזה${wasVisible ? ' (יורד מהדף)' : ''}. המסלול עצמו לא השתנה`, 'me');
  settle(run);
  return run;
}

/** הוספה ללקוח הזה בלבד — לשלב פתוח (מיד) או לשלב שעוד לא נפתח (כשייפתח). */
export function addToStage(prev: Run, stageId: string, ref: ItemRef): Run {
  const run = clone(prev);
  const stage = stageFor(run, stageId);
  const s = run.stages[stageId];
  if (s.state === 'waiting') {
    run.extras.push({ stageId, ref });
    log(run, `הוספת «${itemName(ref)}» ללקוח הזה — ייפתח עם «${stage.name}»`, 'me');
    return run;
  }
  if (s.state !== 'open') return prev;
  const announced = run.items.some(i => i.stageId === stageId && i.announced && i.announced !== 'existing');
  const created = makeItems(run, stage, { uid: `x-${run.seq++}`, ref }, { late: announced, perClient: true });
  run.items.push(...created);
  log(run, `הוספת «${itemName(ref)}» ל«${stage.name}» — ללקוח הזה בלבד${announced ? ' · אחרי שהשלב כבר נמסר' : ''}`, 'me');
  settle(run);
  return run;
}

/** פריט מהמסלול שהתאים רק אחרי שינוי בנתונים — נוסף רק בבחירה מפורשת. */
export function addSuggested(prev: Run, stageId: string, uid: string, only?: 'client' | 'spouse'): Run {
  const run = clone(prev);
  const stage = stageFor(run, stageId);
  const si = stage.items.find(i => i.uid === uid);
  if (!si) return prev;
  const announced = run.items.some(i => i.stageId === stageId && i.announced && i.announced !== 'existing');
  const created = makeItems(run, stage, si, { late: announced, only });
  if (created.length === 0) return prev;
  run.items.push(...created);
  if (run.stages[stageId].state === 'done') run.stages[stageId].state = 'open';
  log(run, `הוספת לפי הנתונים החדשים: ${created.map(c => `«${c.title}»`).join(', ')}`, 'me');
  settle(run);
  return run;
}

/** מה מתאים עכשיו בשלבים פתוחים ולא נוצר — הצעה, לא פעולה. */
export function suggestions(run: Run): { stageId: string; uid: string; only?: 'client' | 'spouse'; title: string }[] {
  if (run.status !== 'active' && run.status !== 'paused') return [];
  const out: { stageId: string; uid: string; only?: 'client' | 'spouse'; title: string }[] = [];
  for (const stage of run.flow.stages) {
    const st = run.stages[stage.id].state;
    if (st !== 'open' && st !== 'done') continue;
    for (const si of stage.items) {
      if (!matches(si.when, run.client)) continue;
      const people = isPerPerson(si.ref) ? persons(run.client) : [undefined];
      for (const p of people) {
        const key = `${stage.id}:${si.uid}${p ? `:${p.role}` : ''}`;
        if (run.items.some(i => i.key === key)) continue;
        out.push({ stageId: stage.id, uid: si.uid, only: p?.role, title: p && isPerPerson(si.ref) ? `${itemName(si.ref)} — ${p.name}` : itemName(si.ref) });
      }
    }
  }
  return out;
}

/** הזמן עובר: עדכון מרוכז בסוף היום, ותזכורת מרוכזת אחת לנמען. */
export function advance(prev: Run, minutes: number): Run {
  const run = clone(prev);
  const target = run.clock + minutes;
  // התחנות: סוף היום (עדכון שמחכה), ונקודות תזכורת.
  for (let guard = 0; guard < 40 && run.clock < target; guard++) {
    const stops: number[] = [target];
    if (run.heldSince !== undefined) stops.push(endOfDay(run.heldSince));
    for (const st of run.flow.stages) {
      const si = run.stages[st.id];
      if (st.reminderDays && si.state === 'open' && si.lastNoticeAt !== undefined && si.remindersSent < MAX_REMINDERS) {
        stops.push(si.lastNoticeAt + st.reminderDays * DAY);
      }
    }
    const next = Math.max(run.clock, Math.min(...stops.filter(s => s > run.clock || s === target)));
    run.clock = Math.min(next, target);
    if (run.status !== 'active') continue;
    if (run.heldSince !== undefined && run.clock >= endOfDay(run.heldSince)) {
      const late = undelivered(run, i => i.late && stageFor(run, i.stageId).delivery === 'auto');
      run.heldSince = undefined;
      if (late.length) deliver(run, late, 'update', 'auto');
    }
    // תזכורת: אחת לנמען, מכל השלבים שהגיע זמנם.
    const due = run.flow.stages.filter(st => {
      const si = run.stages[st.id];
      return st.reminderDays && si.state === 'open' && si.lastNoticeAt !== undefined
        && si.remindersSent < MAX_REMINDERS && run.clock >= si.lastNoticeAt + st.reminderDays * DAY;
    });
    if (due.length) {
      const dueIds = new Set(due.map(d => d.id));
      const open = run.items.filter(i => dueIds.has(i.stageId) && i.state === 'open' && i.published && (i.recipient === 'owner' || i.recipient === 'spouse'));
      for (const to of ['owner', 'spouse'] as const) {
        const mine = open.filter(i => i.recipient === to);
        if (!mine.length) continue;
        const { label, address } = addressOf(run, to);
        run.outbox.push({
          id: `m${++run.seq}`, at: run.clock, to, toLabel: label, address, kind: 'reminder',
          subject: subjectFor('reminder', mine.length, to, run), items: mine.map(i => i.key),
          status: address ? 'sent' : 'failed', by: 'auto', note: address ? undefined : 'אין כתובת — התזכורת לא נשלחה',
        });
        log(run, address ? `תזכורת אחת ל${label} — ${mine.length} ${mine.length === 1 ? 'פריט פתוח' : 'פריטים פתוחים'}` : `התזכורת ל${label} לא נשלחה — אין כתובת`, address ? 'auto' : 'warn');
      }
      for (const d of due) { run.stages[d.id].remindersSent += 1; run.stages[d.id].lastNoticeAt = run.clock; }
    }
  }
  run.clock = target;
  return run;
}

export function pause(prev: Run): Run {
  if (prev.status !== 'active') return prev;
  const run = clone(prev);
  run.status = 'paused';
  log(run, 'עצרת את המסלול — לא ייפתח שום שלב ולא ייצא שום מייל לבד. מה שכבר בדף נשאר', 'me');
  return run;
}

export function resume(prev: Run): Run {
  if (prev.status !== 'paused') return prev;
  const run = clone(prev);
  run.status = 'active';
  log(run, 'חידשת את המסלול — מה שהתעכב קורה עכשיו, במייל מרוכז אחד', 'me');
  // מה שהצטבר בעצירה — כולו «חדש» למייל אחד, גם אם היה מאוחר.
  for (const i of run.items) if (i.late) i.late = false;
  settle(run);
  return run;
}

export function cancel(prev: Run): Run {
  if (prev.status === 'cancelled' || prev.status === 'done' || prev.status === 'idle') return prev;
  const run = clone(prev);
  let removed = 0;
  for (const i of run.items) {
    if (!isClosed(i)) {
      i.state = 'cancelled';
      if (i.published) removed++;
      i.published = false;
    }
  }
  run.status = 'cancelled';
  log(run, `ביטלת את המסלול — ${removed} ${removed === 1 ? 'פריט יורד' : 'פריטים יורדים'} מהדף. מה שהושלם נשאר בהיסטוריה`, 'me');
  return run;
}

/** עדכון ריצה קיימת לגרסה חדשה של המסלול — רק בבחירה מפורשת. */
export function applyFlowUpdate(prev: Run, next: Flow): { run: Run; added: string[]; dropped: string[] } {
  const run = clone(prev);
  const oldUids = new Set(run.flow.stages.flatMap(s => s.items.map(i => i.uid)));
  const newUids = new Set(next.stages.flatMap(s => s.items.map(i => i.uid)));
  const added: string[] = [];
  const dropped = run.flow.stages.flatMap(s => s.items).filter(i => !newUids.has(i.uid)).map(i => itemName(i.ref));
  run.flow = next;
  for (const s of next.stages) if (!run.stages[s.id]) run.stages[s.id] = { stageId: s.id, state: 'waiting', remindersSent: 0 };
  for (const stage of next.stages) {
    if (run.stages[stage.id].state !== 'open') continue;
    const announced = run.items.some(i => i.stageId === stage.id && i.announced && i.announced !== 'existing');
    for (const si of stage.items) {
      if (oldUids.has(si.uid) || !matches(si.when, run.client)) continue;
      const created = makeItems(run, stage, si, { late: announced });
      run.items.push(...created);
      added.push(...created.map(c => c.title));
    }
  }
  log(run, `עדכנת את הלקוח לגרסה ${next.version} של המסלול${added.length ? ` — נוספו: ${added.join(', ')}` : ''}${dropped.length ? ` · ${dropped.length} פריטים שהוסרו מהמסלול נשארו אצל הלקוח` : ''}`, 'me');
  settle(run);
  return { run, added, dropped };
}

export type ClientPatch = Omit<Partial<DemoClient>, 'facts'> & { facts?: Partial<DemoClient['facts']> };

/** שינוי בנתוני הלקוח בהדגמה (סוג, נישואים, מייל). לא מוסיף ולא מבטל בקשות קיימות. */
export function setClient(prev: Run, patch: ClientPatch): Run {
  const run = clone(prev);
  run.client = { ...run.client, ...patch, facts: { ...run.client.facts, ...(patch.facts ?? {}) } };
  return run;
}

// ─── קריאות לתצוגה ───────────────────────────────────────────────────────────

/** מה ממתין, ולמי — הסיכום של «מה ממתין» בכרטיס. */
export function waitingSummary(run: Run): { me: ItemInst[]; client: ItemInst[]; spouse: ItemInst[]; external: ItemInst[]; unsent: ItemInst[]; unpublished: ItemInst[] } {
  const open = run.items.filter(i => !isClosed(i));
  return {
    me: open.filter(i => i.state === 'waiting_office'),
    client: open.filter(i => i.state === 'open' && i.recipient === 'owner'),
    spouse: open.filter(i => i.state === 'open' && i.recipient === 'spouse'),
    external: open.filter(i => i.state === 'open' && i.recipient === 'external'),
    unsent: run.status === 'cancelled' ? [] : undelivered(run),
    unpublished: run.items.filter(i => !i.published && !isClosed(i) && (i.actor === 'client' || i.actor === 'document')),
  };
}

/** מה הלקוח רואה בדף האישי שלו עכשיו. */
export function portalView(run: Run): { action: ItemInst[]; office: string[]; documents: ItemInst[]; done: ItemInst[]; future: string[] } {
  const visible = run.items.filter(i => i.published);
  // ‼ לפני שהמסלול התחיל הלקוח לא רואה כלום — גם לא «בהמשך».
  const future = run.status === 'idle' ? [] : run.flow.stages
    .filter(s => run.stages[s.id].state === 'waiting' && matches(s.when, run.client))
    .filter(s => s.items.some(i => matches(i.when, run.client) && ['client', 'document'].includes(String(itemActor(i.ref)))))
    .map(s => s.name);
  return {
    // ‼ הבעלים רואה גם בקשות שהנושא שלהן הוא בן/בת הזוג — עם השם בכותרת (יסודות §13).
    action: visible.filter(i => i.state === 'open' && i.actor === 'client'),
    office: run.items.filter(i => i.state === 'waiting_office' && i.actor !== 'external').map(i => i.title),
    documents: visible.filter(i => i.actor === 'document'),
    done: visible.filter(i => i.state === 'done' && i.actor === 'client'),
    future,
  };
}

export function deliveryLong(stage: Stage): string { return DELIVERY_LABELS[stage.delivery].long; }

// ─── תצוגה מקדימה: מה יקרה, לפני שמפעילים ─────────────────────────────────────

export interface PlanItem { uid: string; title: string; applies: boolean; why?: string; actor: ReturnType<typeof itemActor>; persons?: string[]; optional?: boolean }
export interface PlanStage { stage: Stage; applies: boolean; why?: string; items: PlanItem[]; pageCount: number; meCount: number; externalCount: number }

export function previewPlan(flow: Flow, client: DemoClient): PlanStage[] {
  return flow.stages.map(stage => {
    const applies = matches(stage.when, client);
    const items: PlanItem[] = stage.items.map((si: StageItem) => {
      const ok = applies && matches(si.when, client);
      const per = isPerPerson(si.ref);
      return {
        uid: si.uid, title: itemName(si.ref), applies: ok,
        why: !applies ? undefined : whyNot(si.when, client) ?? undefined,
        actor: itemActor(si.ref),
        persons: per && ok ? persons(client).map(p => p.name) : undefined,
        optional: si.optional,
      };
    });
    const live = items.filter(i => i.applies);
    const count = (pred: (i: PlanItem) => boolean) => live.filter(pred).reduce((n, i) => n + (i.persons?.length ?? 1), 0);
    return {
      stage, applies, why: applies ? undefined : whyNot(stage.when, client) ?? undefined, items,
      pageCount: count(i => i.actor === 'client' || i.actor === 'document'),
      meCount: count(i => i.actor === 'office' || i.actor === 'action' || i.actor === 'external'),
      externalCount: count(i => i.actor === 'external'),
    };
  });
}

export { actionRef, libraryEntry };
