// ─── דוח שנתי: דף הסיכום במשרד (19.10.2026 · 20.10.2026) ──────────────────────────────────────────────
// ‼ 20.10.2026 · ההדמיה המאושרת: docs/proposals/2026-10-20-annual-questionnaire-v2.html («2 · אצלך»). רשימה אחת
//   «מה עליך לעשות» — שורה לכל פעולה, רק כשהיא רלוונטית, וכפתור אחד לכל היותר. התשובות — בקיפול «התשובות»;
//   החישובים, ההכרעות ו«איך עושים ביד» — בקיפול «פירוט מלא» (TaxYearProcess).
// ‼ הכול נגזר ממה שיש: שאלות הבקשה (tax_info_asks), תשובות (tax_year_facts), מסמכים (tax_evidence) ותמונת השנה.
//   אין כאן מצב חדש, וכל כפתור קורא לאותה פעולה שקיימת ב«פירוט מלא» (אישור, «אשר ועדכן בתיק», «להשלים במשרד»).
// ‼ «התקבל» = הלקוח העלה קובץ; «אושר» = המשרד בדק. לא טוענים יותר ממה שקרה. אין מכאן מייל — תזכורת רק מ«בקשות».

import { useState, type ReactNode } from 'react';
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
import { knownFamilyEvent } from './asks';
import { cardUpdateFor, updatesCard } from './recordToCard';
import { isOpenStep } from './taxWork';

type Ask = YearData['asks'][number];
type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
type ApplyCard = (items: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; error?: string }>;

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

/** איזה נושא בדוח כל מסמך מזין — הכותרת של השורה ב«התשובות». */
const TOPIC: Record<string, string> = {
  'salary.form106': 'משכורת', 'family.marriageSpouseDocs': 'משכורת', 'pension.certs': 'קצבה', 'niBenefits.cert': 'ביטוח לאומי',
  'capital.form867': 'ריבית והשקעות', 'savings.fundCerts': 'הפקדה פרטית לפנסיה', 'savings.insuranceCert': 'ביטוח חיים',
  'donations.receipts': 'תרומות', 'special.disabilityCert': 'פטור נכות', 'household.degreeDocs': 'תואר או שחרור',
  'rent.contract': 'שכר דירה', 'rent.otherPropertyDocs': 'הכנסה מרכוש', 'foreign.statements': 'חו״ל', 'sales.docs': 'מכירה',
  'family.deathDocs': 'פטירה', 'family.severanceDocs': 'פיצויים בגלל פטירה', 'family.payoutDocs': 'ביטוח או קופה בגלל פטירה',
  'family.survivorDocs': 'קצבת שאירים', 'family.disabilityInsDocs': 'אובדן כושר עבודה', 'family.divorceDocs': 'גירושין',
};

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

  // ── התשובות: שורה לכל מסמך, לפי נושא; ומה שהלקוח אמר שלא היה ──
  const docRows = files.map(a => ({ a, topic: TOPIC[a.itemKey] ?? ITEM_BY_KEY[a.itemKey]?.label ?? a.itemKey, st: docState(a) }))
    .sort((x, y) => x.topic.localeCompare(y.topic, 'he'));
  const gridAsk = asks.find(a => a.itemKey === 'annual.whatHappened' && a.state === 'answered');
  const notThisYear = gridAsk && gridAsk.prompt.input.kind === 'multi'
    ? gridAsk.prompt.input.options.filter(o => facts.some(f => f.itemKey === o.key && f.answer === 'no')).map(o => o.label) : [];
  const businesses = (client.businesses ?? []).filter(b => !b.isClosed);
  const notSure = asks.filter(a => a.officeNote && !a.noteResolvedAt);

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
    for (const r of cardChosen) {
      const a = await applyCard(r.plan.proposals, `tax_year_fact:${r.f.id}`);
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

  // ‼ החלון נפתח מיד (לפני הקריאה לשרת) — אחרת הדפדפן חוסם אותו כחלון קופץ
  const openAsClient = async () => {
    const w = window.open('about:blank', '_blank');
    const { data } = await supabase.rpc('mint_portal_token', { p_client_id: client.id });
    if (typeof data === 'string' && data && w) w.location.href = `${window.location.origin}/?portal=${data}`;
    else w?.close();
  };

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

  const sent = asks.length > 0;
  const ready = sent && !filling && missingDocs.length === 0 && officeDocsOpen.length === 0 && pendingPortal.length === 0;

  // ── «מה עליך לעשות» — בסדר הקבוע של ההדמיה ──
  const rows: ReactNode[] = [];
  // א. מסמכים שהמשרד מוציא
  for (const s of officeDocs) {
    const k = `od-${s.item.key}|${s.subjectRole}|${s.entityRef ?? ''}`;
    if (s.state === 'known') { rows.push(<Todo key={k} ok title={`${s.item.label} — ${personOf(s)}`} />); continue; }
    const sub = s.state === 'docReceived' ? 'התקבל · לבדיקה' : s.requestableFrom && s.state === 'notYetAvailable' ? `אפשר מ-${heDate(s.requestableFrom)}` : undefined;
    // ‼ אין «סמן שהוצא» נפרד: ההשלמה היא שורת המשרד הקיימת ב«פירוט מלא» (OfficeLine); מסמך שעוד לא זמין — בלי כפתור
    const act = s.state === 'docReceived' ? { label: 'לבדוק', go: goFull }
      : s.state === 'notYetAvailable' || s.state === 'unavailable' ? null : { label: 'להשלים', go: officeTodo?.open ?? goFull };
    rows.push(<Todo key={k} title={`להוציא ${s.item.label} — ${personOf(s)}`} sub={sub} data={{ 'data-as-office-doc': s.item.key }}
      action={act ? <button type="button" className="btn btn-sm btn-ghost" onClick={act.go}>{act.label}</button> : undefined} />);
  }
  // ב. מסמכים מהלקוח
  if (files.length > 0 && !filling) {
    rows.push(missingDocs.length
      ? <Todo key="docs" title={missingDocs.length === 1 ? 'עוד מסמך אחד' : `עוד ${missingDocs.length} מסמכים`} sub={firstTwo(missingDocs.map(docTitle))} data={{ 'data-as-client-docs': '' }}
          action={open ? <button type="button" className="btn btn-sm btn-ghost" onClick={goRemind}>תזכורת מ«בקשות»</button> : undefined}>
          {remindHint && <small role="status">התזכורת יוצאת מ«הדף של {firstName}» בלשונית «בקשות» — עם המייל לפני השליחה.</small>}
        </Todo>
      : <Todo key="docs" ok title={files.length === 1 ? 'המסמך התקבל' : `כל ${files.length} המסמכים התקבלו`} data={{ 'data-as-client-docs': '' }} />);
  }
  // ג. רק אתה יודע
  if (oyk.length > 0) {
    rows.push(oykFilled && !oykEdit
      ? <Todo key="oyk" ok title={oykTitle} sub={oykValues.map(v => `${oyk.length > 1 ? `${v.label}${client.familyStatus === 'married' ? ` · ${v.name}` : ''}: ` : ''}${fmt(v.cur ?? 0)} ₪`).join(' · ')} data={{ 'data-as-carry': '' }}
          action={<button type="button" className="btn btn-sm btn-ghost" onClick={() => setOykEdit(true)}>עריכה</button>} />
      : <Todo key="oyk" title={oykTitle} sub={`רק אתה יודע · נשמר לשנת ${year}, גם בהערכת המס`} data={{ 'data-as-carry': '' }}>
          <OykInputs client={client} year={year} stepId={step.id} fields={oyk} facts={facts} busy={busy} run={run} />
        </Todo>);
  }
  // ד. הכרעות שלך — שנת פטירה
  if (death) {
    for (const d of DEATH_DECISIONS) {
      rows.push(decisionDone(d.key)
        ? <Todo key={d.key} ok title={d.text} sub={`הוכרע · ${d.source}`} />
        : <Todo key={d.key} title={d.text} sub={d.source} data={{ 'data-as-decision': d.key }}
            action={<button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void markDecision(d.key)}>סמן שהוכרע</button>} />);
    }
    if (survivors && kids.length > 0) rows.push(
      <Todo key="orphan" title={`תיאום מס או החזר על קצבת היתומים — ${kids.map(k => k.firstName).filter(Boolean).join(', ') || 'הילדים'}`} sub={orphanDone ?? 'עבודה נוספת, לא בדוח הזה'}
        action={orphanDone ? undefined : <button type="button" className="btn btn-sm btn-ghost" disabled={orphanBusy} onClick={() => void openOrphanRequest()}>＋ פתח בקשה</button>} />);
  }
  // ה. לעדכן בתיק · תשובות לאישור
  if (cardRows.length > 0) {
    rows.push(
      <Todo key="card" title={`לעדכן בתיק — ${many(cardRows.length, 'שינוי אחד', 'שינויים')}`} sub="מהתשובות" data={{ 'data-as-card': '' }}
        action={<button type="button" className="btn btn-sm btn-ghost" aria-expanded={cardOpen} onClick={() => setCardOpen(o => !o)}>{cardOpen ? 'סגירה' : 'צפה ואשר'}</button>}>
        {cardOpen && (
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
        )}
      </Todo>);
  }
  if (simplePending.length > 0) {
    rows.push(
      <Todo key="approve" title={`לאשר ${many(simplePending.length, 'תשובה אחת', 'תשובות')}`} sub={otherPending > 0 ? `ועוד ${otherPending} לבדוק אחת אחת — בפירוט המלא` : 'כן/לא ו«אין שינוי» — נכנסות לחישוב'} data={{ 'data-as-approve': '' }}
        action={<button type="button" className="btn btn-sm btn-ghost" disabled={busy}
          onClick={() => void run(() => api.decideFacts(simplePending.map(f => f.id), 'accept'), `אושרו ${simplePending.length} תשובות`)}>{simplePending.length === 1 ? 'אשר' : 'אשר את כולן'}</button>} />);
  } else if (otherPending > 0) {
    rows.push(<Todo key="approve" title={`לבדוק ${many(otherPending, 'תשובה אחת', 'תשובות')}`} data={{ 'data-as-approve': '' }}
      action={<button type="button" className="btn btn-sm btn-ghost" onClick={goFull}>לבדוק</button>} />);
  }
  // ו. השלמות במשרד
  if (officeTodo && officeRest > 0) {
    rows.push(<Todo key="office" title={`השלמות במשרד — ${officeRest}`} sub="סכומים ממסמכים, מסלולים והחלטות" data={{ 'data-annual-office': '' }}
      action={<button type="button" className="btn btn-sm btn-ghost" onClick={officeTodo.open}>להשלים עכשיו</button>} />);
  }
  // ז. שאלות המשך לפרסום
  if (more && more.count > 0 && sent) {
    rows.push(<Todo key="more" title={`${more.count === 1 ? 'עוד שאלה אחת' : `עוד ${more.count} שאלות`} ל${firstName}`} sub="לפי מה שכבר ענה · בדף, בלי מייל" data={{ 'data-annual-more': '' }}
      action={<button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void more.run()}>הכן ופרסם בדף</button>} />);
  }
  // ח. להכין את הדוח
  if (sent && !filling && open) {
    rows.push(<Todo key="prep" title="להכין את הדוח" sub={ready ? 'הכול כאן' : 'אפשר להתחיל כבר עכשיו, עם מה שהגיע'} data={{ 'data-as-prepare': '' }}
      action={<button type="button" className={`btn btn-sm ${ready ? 'btn-primary' : 'btn-ghost'}`} onClick={goFull}>להכין</button>} />);
  }

  return (
    <section className="as-wrap" data-annual-summary aria-label={`דוח שנתי ${year} — הסיכום`}>
      {/* ‼ 20.10.2026 · לנסות את השאלון על הלקוח עצמו: הדף האמיתי שלו — מה שנענה שם נשמר כאילו הלקוח ענה (למחיקה: ⋯ ← «מחק לגמרי») */}
      {asks.some(a => a.state === 'published' || a.state === 'answered') && (
        <button type="button" className="btn btn-sm btn-ghost as-as-client" data-annual-as-client onClick={() => void openAsClient()}>פתח כמו הלקוח ↗</button>
      )}
      <ol className="as-steps" aria-label="שלבי העבודה">
        <li className={questions.length && qDone === questions.length ? 'is-done' : 'is-now'}>שאלון {questions.length ? `${qDone}/${questions.length}` : ''}{questions.length && qDone === questions.length ? ' ✓' : ''}</li>
        <li className={files.length && fDone === files.length ? 'is-done' : files.length ? 'is-now' : ''}>מסמכים {files.length ? `${fDone}/${files.length}` : ''}</li>
        <li>הכנה</li><li>אישורך</li><li>חתימת הלקוח</li><li className={['completed', 'verified'].includes(step.status) ? 'is-done' : ''}>הוגש</li>
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

      {filling && <p className="as-todo-wait" role="status" data-as-filling>השאלון עוד אצל {firstName}</p>}

      {rows.length > 0 && (
        <div>
          <h3 className="as-todo-h">מה עליך לעשות</h3>
          <ul className="as-todo" data-as-todo>{rows}</ul>
        </div>
      )}

      {(docRows.length > 0 || businesses.length > 0 || notThisYear.length > 0 || notSure.length > 0) && (
        <details className="as-todo-more" data-annual-answers>
          <summary>התשובות</summary>
          <div className="as-rows">
            {docRows.map(({ a, topic, st }) => (
              <div key={a.id} className="as-row" data-doc={a.itemKey}>
                <div className="as-area">{topic}<span>{whoOf(a.subjectRole)}</span></div>
                <div className="as-what">{a.prompt.title}</div>
                <div className="as-src">{(a.prompt.input.kind === 'file' && DOCS[a.prompt.input.docKind]?.label) || ''}</div>
                <span className={`as-pill is-${st.tone}`}>{st.text}</span>
              </div>
            ))}
            {businesses.map(b => (
              <div key={b.id} className="as-row">
                <div className="as-area">עסק<span>{b.belongsToSpouse ? spouseName : firstName}</span></div>
                <div className="as-what">{b.name}</div>
                <div className="as-src">רווח והפסד מהנהלת החשבונות</div>
                <span className="as-pill is-office">אצל המשרד</span>
              </div>
            ))}
            {notThisYear.length > 0 && <p className="as-none">לא היה ב-{year}, לפי {firstName}: {notThisYear.join(' · ')}</p>}
            {notSure.map(a => (
              <div key={a.id} className="as-open">
                <span>{a.prompt.title}<small>«{a.officeNote}» · לבדוק בשיחה</small></span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.resolveNote(a.id), 'סומן שנסגר')}>סגור</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** שורה ב«מה עליך לעשות»: נקודה או ✓, שורה מודגשת אחת, שורה אפורה קצרה, וכפתור אחד לכל היותר. */
function Todo({ ok, title, sub, action, children, data }: { ok?: boolean; title: string; sub?: string; action?: ReactNode; children?: ReactNode; data?: Record<string, string> }) {
  return (
    <li className={`as-todo-row${ok ? ' is-ok' : ''}`} {...data}>
      <span className="as-todo-ic" aria-label={ok ? 'בוצע' : undefined} aria-hidden={ok ? undefined : true}>{ok ? '✓' : ''}</span>
      <div className="as-todo-t"><b>{title}</b>{sub && <small>{sub}</small>}{children}</div>
      {action}
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
