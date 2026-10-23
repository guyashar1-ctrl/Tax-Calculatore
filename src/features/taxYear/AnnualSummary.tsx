// ─── דוח שנתי: דף הסיכום במשרד (19.10.2026 · 20.10.2026) ──────────────────────────────────────────────
// ‼ 20.10.2026 · ההדמיה המאושרת: docs/proposals/2026-10-20-annual-questionnaire-v2.html («2 · אצלך»). רשימה אחת
//   «מה עליך לעשות» — שורה לכל פעולה, רק כשהיא רלוונטית, וכפתור אחד לכל היותר. התשובות — בקיפול «התשובות»;
//   החישובים, ההכרעות ו«איך עושים ביד» — בקיפול «פירוט מלא» (TaxYearProcess).
// ‼ הכול נגזר ממה שיש: שאלות הבקשה (tax_info_asks), תשובות (tax_year_facts), מסמכים (tax_evidence) ותמונת השנה.
//   אין כאן מצב חדש, וכל כפתור קורא לאותה פעולה שקיימת ב«פירוט מלא» (אישור, «אשר ועדכן בתיק», «להשלים במשרד»).
// ‼ «התקבל» = הלקוח העלה קובץ; «אושר» = המשרד בדק. לא טוענים יותר ממה שקרה. אין מכאן מייל — תזכורת רק מ«בקשות».
// ‼ 21.10.2026 · ההדמיה המאושרת docs/proposals/2026-10-21-office-request-and-tax-file.html («1 · כרטיס הבקשה»):
//   מצב אחד — פס השלבים (annualStage.ts). «מה עליך לעשות» — עד 4 שורות, כפתור ראשי אחד, השאר ב«ועוד N».
//   «לעדכן בתיק» — רק בשלב «אישורך». בזמן שהלקוח ממלא — שורה שקטה אחת. «פירוט ▾» אחד במקום שני קיפולים;
//   «פתח כמו הלקוח» עבר ל-⋯ של «הדף של {שם}» (NoticeTray).

import { useEffect, useState, type ReactNode } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { ProposedFact } from '../../types/taxFacts';
import type { SubjectRole, YearFact } from './types';
import type { YearData } from './api';
import type { ItemStatus } from './picture';
import * as api from './api';
import { ITEM_BY_KEY } from './catalog';
import { DOCS } from './documents';
import { supabase } from '../../lib/supabase';
import PriorReturnPrep from './PriorReturnPrep';
import { knownFamilyEvent, ANNUAL_GRIDS } from './asks';
import { genderOf } from './gender';
import { cardUpdateFor, updatesCard } from './recordToCard';
import { isOpenStep } from './taxWork';
import { ANNUAL_STAGES, STAGE, annualStage } from './annualStage';
import { RETURNS_EVENT, type ReturnsEventDetail } from '../annualReturn/api';
import { niEmployersInYear, niEmployersText } from '../nationalInsurance/niOccupations';

/** כמה שורות «מה עליך לעשות» גלויות; השאר — «ועוד N». */
const TODO_VISIBLE = 4;

type Ask = YearData['asks'][number];
type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
type ApplyCard = (items: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; error?: string; client?: Client }>;

interface Props {
  client: Client;
  step: OnboardingStep;
  year: number;
  data: YearData;
  busy: boolean;
  run: Run;
  /** שאלות נוספות לפי התשובות, או טיוטות — «הכן ופרסם» (TaxYearProcess). */
  more?: { count: number; run: () => Promise<boolean> };
  /** פריטים שהמשרד משלים (סכומים ממסמכים, מסלולים, פריסת דמי לידה…) — פותח את «פירוט מלא» עליהם. */
  officeTodo?: { count: number; open: () => void };
  onClientPersisted?: (c: Client) => void;
  /** 20.10.2026 · הבקשה נפתחה בגרסה הקודמת של השאלון — לא מוסיפים לה שאלות; «סגור ופתח מחדש». */
  legacy?: { reopen: () => Promise<boolean> };
  /** 20.10.2026 · תמונת השנה — למסמכים שהמשרד מוציא בעצמו (who: 'office'). */
  statuses?: ItemStatus[];
  /** 20.10.2026 · פותח את «פירוט מלא» בסדר המומלץ (בדיקת תשובות, הכנת הדוח). */
  openFull?: () => void;
  /** 20.10.2026 · עדכון הכרטיס מתשובה (apply_tax_facts) — אותה פונקציה של «אשר ועדכן בתיק» בפירוט המלא. */
  applyCard?: ApplyCard;
}

/** ‼ שנת פטירה: הכרעות מקצועיות שהמערכת מציגה ולא מחליטה (המחקר: docs/tax-foundation/research/spouse-death-year-2026-10-19.md). */
const DEATH_DECISIONS: { key: string; text: string; source: string }[] = [
  { key: 'death.split', text: 'חיתוך ההכנסות לפי יום הפטירה: עד היום — בדוח כבן/בת הזוג; מה שהתקבל אחרי ובגללו — הכנסת היורשים (258/272)', source: 'פקודה 120, 125א' },
  { key: 'death.severance', text: 'פיצויים בגלל הפטירה: לשאירים (פטור כפול, החייב עד 40%) או לנפטר/ת (פטור רגיל) — ובאיזו שנה שולמו', source: '9(7א)(ב)(1) · 161 ו-161ב' },
  { key: 'death.disability', text: 'פטור הנכות על השכר והקצבה עד הפטירה — לחלק השנה', source: '9(5)' },
  { key: 'death.credits', text: 'נקודות זיכוי: «ילד להורה אחד» לכל ילד עד 19 ונקודה נוספת להורה יחיד; לכל השנה או מהפטירה', source: '40(ב)(3), 40(ב)(1ב) · שדה 026' },
  { key: 'death.retro', text: 'קצבת שאירים רטרואקטיבית ששולמה בשנה הבאה — לאיזו שנה היא שייכת', source: 'שאלה פתוחה במחקר' },
];

const PAYMENT_ITEMS: { key: string; label: string; businessOnly: boolean }[] = [
  { key: 'payments.advances', label: 'מקדמות מס הכנסה ששולמו', businessOnly: true },
  { key: 'payments.withholding', label: 'ניכוי במקור מלקוחות', businessOnly: true },
  { key: 'payments.niPaid', label: 'ביטוח לאומי ששולם כעצמאי', businessOnly: true },
  { key: 'carryForward.balances', label: 'הפסדים מועברים משנים קודמות', businessOnly: false },
];

const yes = (f: YearFact) => f.answer === 'value' && f.status !== 'rejected' && f.status !== 'superseded';
const fmt = (n: number) => n.toLocaleString('he-IL');
const heDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
const many = (n: number, one: string, plural: string) => (n === 1 ? one : `${n} ${plural}`);
/** שתי כותרות ראשונות + «ועוד K». */
const firstTwo = (list: string[]) => list.slice(0, 2).join(' · ') + (list.length > 2 ? ` ועוד ${list.length - 2}` : '');

/** «רק אתה יודע»: אילו שדות לכל אדם — מקדמות וניכוי במקור רק לבעל עסק; הפסדים מועברים ללקוח (ולבן/בת זוג עם עסק). */
interface OykField { id: string; role: 'client' | 'spouse'; name: string; key: string; label: string }
function oykFields(client: Client, businesses: ('client' | 'spouse')[]): OykField[] {
  const people: { role: 'client' | 'spouse'; name: string; business: boolean }[] = [
    { role: 'client', name: client.firstName || 'הלקוח', business: businesses.includes('client') },
    ...(client.familyStatus === 'married' ? [{ role: 'spouse' as const, name: client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג', business: businesses.includes('spouse') }] : []),
  ];
  return people.flatMap(p => PAYMENT_ITEMS
    .filter(i => !i.businessOnly || p.business)
    .filter(i => i.key !== 'carryForward.balances' || p.role === 'client' || p.business)
    .map(i => ({ id: `oyk-${p.role}-${i.key}`, role: p.role, name: p.name, key: i.key, label: i.label })));
}
/** הערך שהמשרד רשם לשנה (לא תשובת לקוח). ‼ ריק = לא ידוע — לא 0. */
function oykCurrent(facts: YearFact[], key: string, role: string): number | null {
  const f = facts.filter(x => x.itemKey === key && x.subjectRole === role && x.status === 'accepted' && x.source !== 'portal')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return f ? (f.answer === 'zero' ? 0 : typeof f.value === 'number' ? f.value : null) : null;
}

export default function AnnualSummary({ client, step, year, data, busy, run, more, officeTodo, onClientPersisted, legacy, statuses, openFull, applyCard }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const spouseName = client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג';
  const whoOf = (r: SubjectRole) => (r === 'spouse' ? spouseName : r === 'couple' ? (client.familyStatus === 'married' ? 'שניכם' : firstName) : firstName);
  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const facts = data.facts.filter(f => f.taxYear === year);
  const factFor = (key: string, role?: SubjectRole) => facts.filter(f => f.itemKey === key && (!role || f.subjectRole === role) && yes(f));
  const isYes = (key: string) => factFor(key).length > 0;
  const open = isOpenStep(step);
  const goFull = () => (openFull ?? officeTodo?.open)?.();

  // ── שלבים ──
  const questions = asks.filter(a => a.prompt.input.kind !== 'file');
  const files = asks.filter(a => a.prompt.input.kind === 'file');
  const evidenceOf = (a: Ask) => data.evidence.filter(e => e.askId === a.id);
  const docState = (a: Ask): { tone: 'ok' | 'miss' | 'later' | 'review'; text: string } => {
    const ev = evidenceOf(a);
    if (ev.some(e => e.review === 'accepted')) return { tone: 'ok', text: 'אושר' };
    if (ev.length || a.state === 'answered') return { tone: 'review', text: 'התקבל · לבדיקה' };
    if (a.state === 'unavailable') return { tone: 'later', text: a.unavailable?.reason ?? 'אשלח אחר כך' };
    return { tone: 'miss', text: 'חסר' };
  };
  const qDone = questions.filter(a => a.state === 'answered').length;
  const fDone = files.filter(a => docState(a).tone === 'ok' || docState(a).tone === 'review').length;
  const docTitle = (a: Ask) => (a.prompt.input.kind === 'file' && DOCS[a.prompt.input.docKind]?.label) || a.prompt.title;
  const missingDocs = files.filter(a => ['miss', 'later'].includes(docState(a).tone));
  // ‼ הלקוח עוד באמצע השאלון: שאלות (לא קבצים) שעדיין בדף ולא נענו. המסמכים מגיעים איתו — תזכורת עליהם רק אחרי שסיים.
  const waiting = questions.filter(a => a.state === 'published');
  const filling = waiting.length > 0;

  // ── הפירוט: מה הלקוח אמר שהיה ושלא היה ──
  // ‼ 21.10.2026 · סבב 2: מסכי ריבועים לכל אדם (כסף שנכנס · מה מוריד מס) — כל ריבוע עם שם האדם כשיש שניים
  const gridAsks = asks.filter(a => ANNUAL_GRIDS.includes(a.itemKey) && a.state === 'answered');
  const twoPeople = new Set(gridAsks.map(a => a.subjectRole)).size > 1;
  const gridLabels = (pick: (f: (typeof facts)[number]) => boolean) => gridAsks.flatMap(g => g.prompt.input.kind === 'multi'
    ? g.prompt.input.options.filter(o => facts.some(f => f.itemKey === o.key && f.subjectRole === o.role && f.askId === g.id && pick(f)))
      .map(o => (twoPeople && g.prompt.subjectName ? `${o.label} (${g.prompt.subjectName})` : o.label)) : []);
  const notThisYear = gridLabels(f => f.answer === 'no');
  const businesses = (client.businesses ?? []).filter(b => !b.isClosed);
  const notSure = asks.filter(a => a.officeNote && !a.noteResolvedAt);
  /** איפה הלקוח כתב את ההערה — «משהו אחר?» במסך הכסף, אחרת השאלה עצמה. */
  const noteWhere = (a: (typeof asks)[number]) => (ANNUAL_GRIDS.includes(a.itemKey) ? `משהו אחר${a.prompt.subjectName ? ` · ${a.prompt.subjectName}` : ''}` : a.prompt.title);
  const yesThisYear = gridLabels(yes);

  // ── שנת פטירה ──
  // ‼ אלמן/ה מ-{שנה} בכרטיס — הענף נפתח ישר מהרשת (asks.ts › knownFamilyEvent), בלי עובדת «נפטר/ה»
  const death = isYes('family.eventDeath') || knownFamilyEvent(client, year) === 'death';
  const deathRec = factFor('family.death')[0]?.value as { date?: string } | undefined;
  const decisionDone = (key: string) => facts.some(f => f.itemKey === 'annual.officeDecision' && yes(f) && (f.value as { decision?: string } | undefined)?.decision === key);
  const survivors = ['family.survivorFromFund', 'family.survivorFromState', 'family.survivorFromBtl'].some(isYes);
  const kids = (client.children ?? []).filter(ch => !ch.birthYear || year - Number(ch.birthYear) < 21);

  // ── תשובות שמחכות לאישור ──
  const pendingPortal = facts.filter(f => f.requestId === step.id && f.status === 'pending' && f.source === 'portal');
  // ‼ 20.10.2026 · תשובה שמשנה את הכרטיס (ילדים, בנק, כתובת, מעסיק, שנת אירוע) — אותה הצעה של «אשר ועדכן בתיק» (ReviewLine):
  //   apply_tax_facts ואז אישור התשובה. מה שדורש הכרעה על פריט שלא הופיע בתשובה — רק בפירוט המלא, אחד אחד.
  const cardRows = pendingPortal.flatMap(f => {
    if (!updatesCard(f.itemKey)) return [];
    const plan = cardUpdateFor(client, f.itemKey, f.value, { factId: f.id, itemKey: f.itemKey, year: f.taxYear }, f.subjectRole);
    if (!plan || (!plan.proposals.length && !plan.omitted.length)) return [];
    return [{ f, plan, ready: plan.omitted.length === 0 }];
  });
  const cardIds = new Set(cardRows.map(r => r.f.id));
  const simplePending = pendingPortal.filter(f => !cardIds.has(f.id) && f.clientAssertion !== 'changed'
    && (f.answer === 'no' || f.clientAssertion === 'unchanged' || ITEM_BY_KEY[f.itemKey]?.kind === 'screener' || f.itemKey.startsWith('family.')));
  const otherPending = pendingPortal.length - simplePending.length - cardRows.length;
  const [cardOpen, setCardOpen] = useState(false);
  const [cardOff, setCardOff] = useState<Set<string>>(() => new Set());
  const cardChosen = cardRows.filter(r => r.ready && !cardOff.has(r.f.id));
  const applyChosen = () => applyCard && void run(async () => {
    // ‼ 290 · כמה תשובות שממזגות לתוך פרטי בן/בת הזוג (מין, מזונות, עלייה, לימודים): כל הצעה נבנית מחדש על הכרטיס שאחרי
    //   הקודמת — אחרת השנייה נראית «הכרטיס השתנה בינתיים» ונעצרת
    let cur = client;
    for (const r of cardChosen) {
      const plan = cur === client ? r.plan : cardUpdateFor(cur, r.f.itemKey, r.f.value, { factId: r.f.id, itemKey: r.f.itemKey, year: r.f.taxYear }, r.f.subjectRole) ?? r.plan;
      const a = plan.proposals.length ? await applyCard(plan.proposals, `tax_year_fact:${r.f.id}`) : { ok: true as const, client: undefined };
      if (a.client) cur = a.client;
      const d = await api.decideFacts([r.f.id], 'accept') as { ok?: boolean; error?: string };
      if (d && d.ok === false) return d;
      if (!a.ok) return a;
    }
    return { ok: true };
  }, `עודכן בתיק — ${many(cardChosen.length, 'שינוי אחד', 'שינויים')}. הערך הקודם נשמר בהיסטוריה`).then(ok => { if (ok) setCardOpen(false); });

  // ── מסמכים שהמשרד מוציא בעצמו (who: 'office') ──
  const personOf = (s: ItemStatus) => s.entityLabel || whoOf(s.subjectRole);
  const officeDocs = (statuses ?? []).filter(s => s.item.who === 'office' && s.item.kind === 'document' && s.state !== 'notApplicable');
  // ‼ אותו כלל של picture.officeTodo למסמך — כדי לא לספור אותו פעמיים בשורת «השלמות במשרד»
  const officeDocsInTodo = officeDocs.filter(s => ['missing', 'partial', 'fromCard'].includes(s.state) || !!s.officeAction).length;
  const officeRest = (officeTodo?.count ?? 0) - officeDocsInTodo;
  const officeDocsOpen = officeDocs.filter(s => s.state !== 'known');

  // ── רק אתה יודע ──
  const oyk = oykFields(client, businesses.map(b => (b.belongsToSpouse ? 'spouse' : 'client')));
  const oykValues = oyk.map(fl => ({ ...fl, cur: oykCurrent(facts, fl.key, fl.role) }));
  const oykFilled = oykValues.length > 0 && oykValues.every(v => v.cur !== null);
  const [oykEdit, setOykEdit] = useState(false);
  const oykTitle = oyk.length === 1 ? oyk[0].label : 'הפסדים מועברים ותשלומים על חשבון';

  const markDecision = (key: string) => run(() => api.recordFact(client.id, {
    taxYear: year, itemKey: 'annual.officeDecision', subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
    answer: 'value', value: { decision: key, done: true, at: new Date().toISOString().slice(0, 10) }, basis: 'actual', requestId: step.id,
  } as never), 'סומן שהוכרע — נשמר מי ומתי');

  // ‼ 20.10.2026 · תזכורת על מסמכים — לעולם לא מכאן: מובילים ל«הדף של {שם}» ב«בקשות» (NoticeTray, data-testid="rl-page"),
  //   שם רואים את המייל לפני שהוא יוצא. בלי לחיצה על «שלח» — רק גלילה ומיקוד. מחוץ ל«בקשות» — אומרים איפה.
  const [remindHint, setRemindHint] = useState(false);
  const goRemind = () => {
    const page = document.querySelector<HTMLElement>('[data-testid="rl-page"]');
    if (!page) { setRemindHint(true); return; }
    page.scrollIntoView({ behavior: 'smooth', block: 'start' });
    page.querySelector<HTMLElement>('[data-testid="rl-page-send"]')?.focus({ preventScroll: true });
  };

  const [orphanBusy, setOrphanBusy] = useState(false);
  const [orphanDone, setOrphanDone] = useState<string | null>(null);
  const openOrphanRequest = async () => {
    setOrphanBusy(true);
    const flagKey = `orphanPensionTax-${year}`;
    const { data: ex } = await supabase.from('onboarding_steps').select('id').eq('client_id', client.id).eq('payload->>flagKey', flagKey).neq('status', 'cancelled').limit(1);
    if (ex?.length) { setOrphanBusy(false); setOrphanDone('כבר פתוחה בקשה — ב«בקשות»'); return; }
    const { error } = await supabase.rpc('create_onboarding_request', {
      p_client_id: client.id, p_step_type: 'custom_request',
      // ‼ משימה של המשרד (internalTask) — בלי תוכן ללקוח; לא מופיעה בדף האישי
      p_payload: { title: `תיאום מס והחזר על קצבת היתומים (${year})`, flagKey, internalTask: true,
        note: 'לכל ילד שמקבל קצבת שאירים — תיאום מס (כמה משלמים), ובדיקה אם נוכה מס שמגיע להחזר. מהדוח השנתי.' },
      p_due_date: null, p_depends_on: null, p_published: false, p_required_for_close: false, p_owner: 'me', p_stage_id: null,
    });
    setOrphanBusy(false);
    setOrphanDone(error ? `הפתיחה נכשלה (${error.message})` : 'נפתחה משימה פנימית — ב«בקשות», «עבודה פנימית»');
  };

  // ── השלב (פס השלבים) — מקור אחד גם לשורות שתלויות בו ──
  // ‼ גרסאות הדוח: מה שפאנל הדוח (AnnualReturnPanel, ב«פירוט מלא») כבר טען ושמר — announceReturns, בלי קריאה שנייה
  const [returns, setReturns] = useState<ReturnsEventDetail['versions']>([]);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<ReturnsEventDetail>).detail; if (d?.requestId === step.id) setReturns(d.versions); };
    window.addEventListener(RETURNS_EVENT, on);
    return () => window.removeEventListener(RETURNS_EVENT, on);
  }, [step.id]);
  const stage = annualStage({
    questions: questions.length, questionsDone: qDone, filling, files: files.length, filesDone: fDone,
    closed: ['completed', 'verified'].includes(step.status), returns,
  });

  const sent = asks.length > 0;
  // ‼ תשובות שמשנות את הכרטיס מחכות ל«אישורך» (החלטה 2, 21.10.2026) — הן לא מעכבות את ההכנה
  const ready = sent && !filling && missingDocs.length === 0 && officeDocsOpen.length === 0 && pendingPortal.length - cardRows.length === 0;

  // ── «מה עליך לעשות» — שורה לכל פעולה; כפתור ראשי אחד בלבד ──
  const rows: TodoRow[] = [];
  const btn = (label: string, go: () => void, extra?: Partial<TodoAct>): TodoAct => ({ label, go, ...extra });
  // א. מסמכים שהמשרד מוציא
  for (const s of officeDocs) {
    const k = `od-${s.item.key}|${s.subjectRole}|${s.entityRef ?? ''}`;
    if (s.state === 'known') { rows.push({ key: k, ok: true, title: `${s.item.label} — ${personOf(s)}` }); continue; }
    const sub = s.state === 'docReceived' ? 'התקבל · לבדיקה' : s.requestableFrom && s.state === 'notYetAvailable' ? `אפשר מ-${heDate(s.requestableFrom)}` : undefined;
    // ‼ אין «סמן שהוצא» נפרד: ההשלמה היא שורת המשרד הקיימת ב«פירוט מלא» (OfficeLine); מסמך שעוד לא זמין — בלי כפתור
    const act = s.state === 'docReceived' ? btn('לבדוק', goFull)
      : s.state === 'notYetAvailable' || s.state === 'unavailable' ? undefined : btn('להשלים', officeTodo?.open ?? goFull);
    rows.push({ key: k, title: `להוציא ${s.item.label} — ${personOf(s)}`, sub, data: { 'data-as-office-doc': s.item.key }, act });
  }
  // ב. מסמכים מהלקוח
  if (files.length > 0) {
    rows.push(missingDocs.length
      ? { key: 'docs', title: missingDocs.length === 1 ? 'עוד מסמך אחד' : `עוד ${missingDocs.length} מסמכים`, sub: firstTwo(missingDocs.map(docTitle)), data: { 'data-as-client-docs': '' },
          act: open ? btn('תזכורת', goRemind) : undefined,
          children: remindHint ? <small role="status">התזכורת יוצאת מ«הדף של {firstName}» בלשונית «בקשות».</small> : undefined }
      : { key: 'docs', ok: true, title: files.length === 1 ? 'המסמך התקבל' : `כל ${files.length} המסמכים התקבלו`, data: { 'data-as-client-docs': '' } });
  }
  // ב2. ‼ 21.10.2026 · סבב 2: מה שהלקוח כתב («משהו אחר?» במסך הכסף, «לא בטוח») — גלוי כאן, לפני האישורים (לא רק בפירוט)
  if (notSure.length > 0) {
    const one = notSure[0];
    rows.push({ key: 'notes', title: notSure.length === 1 ? `«${one.officeNote}»` : `${notSure.length} הערות מ${firstName}`,
      sub: notSure.length === 1 ? noteWhere(one) : notSure.map(a => `«${a.officeNote}»`).join(' · '), data: { 'data-as-notes': '' },
      act: btn(notSure.length === 1 ? 'סגור' : 'סגור הכול', () => void run(async () => { for (const a of notSure) { const r = await api.resolveNote(a.id); if (!r.ok) return r; } return { ok: true }; }, 'סומן שנסגר'), { disabled: busy }) });
  }
  // ב3. ‼ 22.10.2026 · «הכנסה אחרת ← משהו אחר» (במקום טקסט חופשי) — המשרד מתקשר לברר
  for (const f of facts.filter(x => x.itemKey === 'income.unlisted' && yes(x) && x.value !== false)) {
    const k = `unlisted-${f.subjectRole}`;
    rows.push(decisionDone(k)
      ? { key: k, ok: true, title: `בורר: הכנסה אחרת — ${whoOf(f.subjectRole)}` }
      : { key: k, title: `לברר עם ${whoOf(f.subjectRole)}: הכנסה אחרת שלא ברשימה`, sub: ITEM_BY_KEY['income.unlisted']?.officeNext, data: { 'data-as-unlisted': f.subjectRole },
          act: btn('סמן שבורר', () => void markDecision(k), { disabled: busy }) });
  }
  // ג. תשובות לאישור
  if (simplePending.length > 0) {
    rows.push({ key: 'approve', title: `${many(simplePending.length, 'תשובה אחת', 'תשובות')} לאישור`, sub: otherPending > 0 ? `ועוד ${otherPending} לבדוק בפירוט` : undefined, data: { 'data-as-approve': '' },
      act: btn(simplePending.length === 1 ? 'אשר' : 'אשר הכול', () => void run(() => api.decideFacts(simplePending.map(f => f.id), 'accept'), `אושרו ${simplePending.length} תשובות`), { disabled: busy }) });
  } else if (otherPending > 0) {
    rows.push({ key: 'approve', title: `לבדוק ${many(otherPending, 'תשובה אחת', 'תשובות')}`, data: { 'data-as-approve': '' }, act: btn('לבדוק', goFull) });
  }
  // ד. לעדכן בתיק — ‼ רק בשלב «אישורך» (אחרי ההכנה, לפני החתימה): עדכון התיק בסוף הדוח, לא באמצע האיסוף
  if (stage === STAGE.approve && cardRows.length > 0) {
    rows.push({ key: 'card', title: `לעדכן בתיק — ${many(cardRows.length, 'שינוי אחד', 'שינויים')}`,
      sub: firstTwo(cardRows.map(r => `${whoOf(r.f.subjectRole)}: ${r.plan.lines[0] || ITEM_BY_KEY[r.f.itemKey]?.label || ''}`)), data: { 'data-as-card': '' },
      act: btn(cardOpen ? 'סגירה' : 'צפה ואשר', () => setCardOpen(o => !o), { expanded: cardOpen }),
      children: cardOpen ? (
        <div className="as-todo-sub">
          {cardRows.map(r => {
            const text = `${whoOf(r.f.subjectRole)} — ${r.plan.lines.join(' · ') || ITEM_BY_KEY[r.f.itemKey]?.label || ''}`;
            return r.ready ? (
              <label key={r.f.id}>
                <input type="checkbox" checked={!cardOff.has(r.f.id)} disabled={busy}
                  onChange={e => setCardOff(o => { const n = new Set(o); if (e.target.checked) n.delete(r.f.id); else n.add(r.f.id); return n; })} />
                <span>{text}</span>
              </label>
            ) : (
              <p key={r.f.id} className="as-todo-skip">{ITEM_BY_KEY[r.f.itemKey]?.label ?? text} · {whoOf(r.f.subjectRole)} — יש בתיק פריט שלא הופיע בתשובה; מכריעים <button type="button" className="as-todo-link" onClick={goFull}>בפירוט המלא</button></p>
            );
          })}
          {cardRows.some(r => r.ready) && (
            <div><button type="button" className="btn btn-sm btn-primary" disabled={busy || !cardChosen.length || !applyCard} data-as-card-apply onClick={applyChosen}>עדכן בתיק</button></div>
          )}
        </div>
      ) : undefined });
  }
  // ה. רק אתה יודע
  if (oyk.length > 0) {
    rows.push(oykFilled && !oykEdit
      ? { key: 'oyk', ok: true, title: oykTitle, sub: oykValues.map(v => `${oyk.length > 1 ? `${v.label}${client.familyStatus === 'married' ? ` · ${v.name}` : ''}: ` : ''}${fmt(v.cur ?? 0)} ₪`).join(' · '), data: { 'data-as-carry': '' },
          act: btn('עריכה', () => setOykEdit(true)) }
      : { key: 'oyk', title: oykTitle, sub: `רק אתה יודע · נשמר לשנת ${year}`, data: { 'data-as-carry': '' },
          children: <OykInputs client={client} year={year} stepId={step.id} fields={oyk} facts={facts} busy={busy} run={run} /> });
  }
  // ו. שאלות המשך לפרסום
  if (more && more.count > 0 && sent) {
    rows.push({ key: 'more', title: `${more.count === 1 ? 'עוד שאלה אחת' : `עוד ${more.count} שאלות`} ל${firstName}`, sub: 'בדף, בלי מייל', data: { 'data-annual-more': '' },
      act: btn('הכן ופרסם בדף', () => void more.run(), { disabled: busy }) });
  }
  // ז. הכרעות שלך — שנת פטירה
  if (death) {
    for (const d of DEATH_DECISIONS) {
      rows.push(decisionDone(d.key)
        ? { key: d.key, ok: true, title: d.text, sub: `הוכרע · ${d.source}` }
        : { key: d.key, title: d.text, sub: d.source, data: { 'data-as-decision': d.key }, act: btn('סמן שהוכרע', () => void markDecision(d.key), { disabled: busy }) });
    }
    if (survivors && kids.length > 0) rows.push({ key: 'orphan', title: `תיאום מס או החזר על קצבת היתומים — ${kids.map(k => k.firstName).filter(Boolean).join(', ') || 'הילדים'}`, sub: orphanDone ?? 'עבודה נוספת, לא בדוח הזה',
      act: orphanDone ? undefined : btn('＋ פתח בקשה', () => void openOrphanRequest(), { disabled: orphanBusy }) });
  }
  // ח. הדוח — לפי השלב. ‼ «השלמות במשרד» הן חלק מההכנה: שורה אחת, והכפתור פותח את «פירוט מלא» עליהן
  if (sent && !filling && open) {
    if (stage <= STAGE.prepare) {
      rows.push({ key: 'prep', title: 'להכין את הדוח', sub: officeRest > 0 ? `${officeRest} השלמות` : ready ? 'הכול כאן' : undefined,
        data: { 'data-as-prepare': '', ...(officeRest > 0 ? { 'data-annual-office': '' } : {}) },
        act: btn('להכין', officeRest > 0 && officeTodo ? officeTodo.open : goFull) });
    } else if (stage === STAGE.approve) {
      rows.push({ key: 'prep', title: 'הדוח מוכן לבדיקתך', data: { 'data-as-prepare': '' }, act: btn('לבדוק', goFull) });
    } else if (stage === STAGE.sign) {
      rows.push({ key: 'prep', title: `הדוח אושר — לחתימת ${firstName}`, data: { 'data-as-prepare': '' }, act: btn('פתח', goFull) });
    }
  }
  // ‼ הכפתור הראשי: שאלות לפרסום, אחרת הדוח, אחרת הפעולה הראשונה. הוא תמיד בין השורות הגלויות.
  // ‼ סוג אחד לא ממלא את ארבע השורות: מסמך משרד ראשון, ואחריו המסמכים מהלקוח והתשובות; שאר מסמכי המשרד — ב«ועוד»
  const od = rows.filter(r => r.key.startsWith('od-') && !r.ok);
  const ordered = [...od.slice(0, 1), ...rows.filter(r => !od.includes(r)), ...od.slice(1)];
  const todo = [...ordered.filter(r => !r.ok), ...ordered.filter(r => r.ok)];
  const primaryKey = (todo.find(r => r.key === 'more' && r.act) ?? todo.find(r => r.key === 'prep' && r.act) ?? todo.find(r => !r.ok && r.act))?.key;
  const [allTodo, setAllTodo] = useState(false);
  let shown = todo.slice(0, TODO_VISIBLE);
  if (primaryKey && !shown.some(r => r.key === primaryKey)) shown = [...todo.slice(0, TODO_VISIBLE - 1), todo.find(r => r.key === primaryKey)!];
  const hidden = todo.filter(r => !shown.includes(r));
  const visible = allTodo ? [...shown, ...hidden] : shown;

  // ── פירוט: מה היה ומה לא, לפי הלקוח; «לא בטוח»; והדרך לחישוב המלא ──
  const [detail, setDetail] = useState(false);
  const btlEmployers = ([['', client.niOccupations], [client.familyStatus === 'married' ? (client.spouseFirstName || 'בן/בת הזוג') : '', client.spouseNiOccupations]] as const)
    .filter(([who, list], i) => (i === 0 || !!who) && !!list?.length)
    .map(([who, list]) => ({ who, text: niEmployersText(niEmployersInYear(list ?? [], year)) }))
    .filter(e => !!e.text);

  return (
    <section className="as-wrap" data-annual-summary aria-label={`דוח שנתי ${year} — הסיכום`}>
      <ol className="as-steps" aria-label="שלבי העבודה" data-as-stage={stage}>
        {ANNUAL_STAGES.map((label, i) => {
          const done = i < stage || (i === STAGE.filed && stage === STAGE.filed);
          const n = i === STAGE.questions && questions.length ? ` ${qDone}/${questions.length}` : i === STAGE.docs && files.length ? ` ${fDone}/${files.length}` : '';
          return <li key={label} className={done ? 'is-done' : i === stage ? 'is-now' : ''} aria-current={i === stage ? 'step' : undefined}>{label}{n}{done ? ' ✓' : ''}</li>;
        })}
      </ol>

      {death && (
        <p className="as-note" role="note">
          <b>{spouseName} נפטר/ה{deathRec?.date ? ` ב-${heDate(deathRec.date)}` : ''}.</b> {client.familyStatus === 'married' ? `${firstName} ${client.gender === 'female' ? 'היא בת הזוג הרשומה' : client.gender === 'male' ? 'הוא בן הזוג הרשום' : 'הוא/היא בן/בת הזוג הרשום/ה'} — הדוח מוגש בתיק הזה.` : ''}
        </p>
      )}

      {legacy && (
        <div className="as-approve" role="note" data-annual-legacy>
          <span>השאלון הזה נפתח בגרסה הקודמת — שאלה נפרדת לכל נושא. כדי שלא יתערבבו אצל {firstName} שני שאלונים, לא מוסיפים לו שאלות.
            <small>«סגור ופתח מחדש» שומר את הבקשה הזו בהיסטוריה ופותח שאלון אחד בגרסה החדשה. מה ש{firstName} כבר ענה — נשמר ולא נשאל שוב. בלי מייל.</small></span>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} data-annual-reopen onClick={() => void legacy.reopen()}>סגור ופתח מחדש</button>
        </div>
      )}
      {/* ‼ 19.10.2026 · עוד לא יצא כלום ללקוח — «לפני השליחה»: הדוח של שנה שעברה כנקודת פתיחה (או פרסום מהכרטיס) */}
      {more && !sent && (
        <PriorReturnPrep client={client} year={year} stepId={step.id} busy={busy} run={run} publishPlain={more.run} onClientPersisted={onClientPersisted} />
      )}

      {/* ‼ הלקוח עוד ממלא: שורה שקטה אחת, בלי שורות פעולה — התשובות נשמרות אצלו כטיוטה עד «שליחה» */}
      {filling ? (
        <p className="as-todo-wait" role="status" data-as-filling><span className="as-dot" aria-hidden="true" />השאלון אצל {firstName} · נשמר כטיוטה עד {genderOf(client, 'client') === 'f' ? 'שתשלח' : genderOf(client, 'client') === 'm' ? 'שישלח' : 'השליחה'}</p>
      ) : visible.length > 0 && (
        <div>
          <h3 className="as-todo-h">מה עליך לעשות</h3>
          <ul className="as-todo" data-as-todo>
            {visible.map(r => <Todo key={r.key} row={r} primary={r.key === primaryKey} />)}
          </ul>
          {hidden.length > 0 && (
            <button type="button" className="as-todo-link as-todo-toggle" aria-expanded={allTodo} data-as-todo-more onClick={() => setAllTodo(v => !v)}>
              {allTodo ? 'פחות' : `ועוד ${hidden.length}`}
            </button>
          )}
        </div>
      )}

      <div className="as-detail" data-annual-answers>
        <button type="button" className="as-todo-link as-detail-toggle" aria-expanded={detail} onClick={() => setDetail(v => !v)}>פירוט {detail ? '▴' : '▾'}</button>
        {detail && (
          <dl className="as-kv">
            {yesThisYear.length > 0 && <div><dt>היה ב-{year}</dt><dd>{yesThisYear.join(' · ')}</dd></div>}
            {/* ‼ 21.10.2026 · תזכורת: מעסיקים שב״ל רושם בשנה — לכל אחד 106. לא נכתב מכאן דבר. */}
            {btlEmployers.map(e => <div key={e.who} data-annual-btl-employers><dt>מעסיקים לפי ב״ל{e.who ? ` · ${e.who}` : ''}</dt><dd>{e.text}</dd></div>)}
            {notThisYear.length > 0 && <div><dt>לא היה ב-{year}</dt><dd>{many(notThisYear.length, 'נושא אחד', 'נושאים')}</dd></div>}
            {notSure.map(a => (
              <div key={a.id} className="as-kv-open">
                <dt>הערה</dt>
                <dd><span>{noteWhere(a)} · «{a.officeNote}»</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.resolveNote(a.id), 'סומן שנסגר')}>סגור</button></dd>
              </div>
            ))}
            <div><dt>החישוב ואיך עושים ביד</dt><dd><button type="button" className="as-todo-link" data-annual-full-open onClick={goFull}>פתח</button></dd></div>
          </dl>
        )}
      </div>
    </section>
  );
}

interface TodoAct { label: string; go: () => void; disabled?: boolean; expanded?: boolean }
interface TodoRow { key: string; ok?: boolean; title: string; sub?: string; act?: TodoAct; children?: ReactNode; data?: Record<string, string> }

/** שורה ב«מה עליך לעשות»: נקודה או ✓, שורה מודגשת אחת, שורה אפורה קצרה, וכפתור אחד לכל היותר. */
function Todo({ row, primary }: { row: TodoRow; primary: boolean }) {
  const { ok, title, sub, act, children, data } = row;
  return (
    <li className={`as-todo-row${ok ? ' is-ok' : ''}`} {...data}>
      <span className="as-todo-ic" aria-label={ok ? 'בוצע' : undefined} aria-hidden={ok ? undefined : true}>{ok ? '✓' : ''}</span>
      <div className="as-todo-t"><b>{title}</b>{sub && <small>{sub}</small>}{children}</div>
      {act && (
        <button type="button" className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'}`} disabled={act.disabled}
          aria-expanded={act.expanded} onClick={act.go}>{act.label}</button>
      )}
    </li>
  );
}

/**
 * «רק אתה יודע» — מה שהלקוח לא יודע לענות: מקדמות, ניכוי במקור, ביטוח לאומי כעצמאי, הפסדים מועברים.
 * ‼ נשמר כעובדת משרד לשנה (record_tax_year_fact) — אותו פריט שהערכת המס של אותה שנה קוראת. ריק = לא ידוע (לא 0).
 */
function OykInputs({ client, year, stepId, fields, facts, busy, run }: {
  client: Client; year: number; stepId: string; fields: OykField[]; facts: YearFact[]; busy: boolean; run: Run;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = (key: string, role: string, raw: string) => {
    const t = raw.replace(/[^\d.]/g, '');
    if (t === '') return;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n === oykCurrent(facts, key, role)) return;
    void run(() => api.recordFact(client.id, {
      taxYear: year, itemKey: key, subjectRole: role as SubjectRole, periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
      answer: n === 0 ? 'zero' : 'value', value: n === 0 ? undefined : n, basis: 'final', requestId: stepId,
    } as never), `נשמר לשנת ${year} — גם הערכת המס של ${year} קוראת אותו`);
  };
  const named = new Set(fields.map(f => f.role)).size > 1;
  return (
    <div className="as-only-grid">
      {fields.map(f => {
        const cur = oykCurrent(facts, f.key, f.role);
        return (
          <label key={f.id} htmlFor={f.id}>
            <span>{f.label}{named ? ` · ${f.name}` : ''}</span>
            <span className="as-money"><span>₪</span>
              <input id={f.id} inputMode="numeric" dir="ltr" disabled={busy} placeholder={cur === null ? 'לא ידוע' : ''}
                value={draft[f.id] ?? (cur === null ? '' : fmt(cur))}
                onChange={e => setDraft(d => ({ ...d, [f.id]: e.target.value }))}
                onBlur={e => save(f.key, f.role, e.target.value)} />
            </span>
          </label>
        );
      })}
    </div>
  );
}
