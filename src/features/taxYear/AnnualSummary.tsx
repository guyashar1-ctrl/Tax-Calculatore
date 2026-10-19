// ─── דוח שנתי: דף הסיכום במשרד (19.10.2026) ────────────────────────────────────────────────────────
// ‼ ההדמיה המאושרת: docs/proposals/2026-10-19-simple-annual-questionnaire.html («דף הסיכום»). אחרי שהלקוח ענה —
//   מה למלא בדוח · מסמכים · רק אתה יודע · הכרעות שלך (שנת פטירה) · מה עוד פתוח · עבודה נוספת. כל השאר (השאלון המלא,
//   החישובים, «איך עושים ביד») — מתחת, בקיפול «פירוט מלא» (TaxYearProcess).
// ‼ הכול נגזר ממה שיש: שאלות הבקשה (tax_info_asks), תשובות (tax_year_facts) ומסמכים (tax_evidence). אין כאן מצב חדש,
//   חוץ משתי כתיבות שהמשרד עושה: «רק אתה יודע» (עובדת משרד לשנה — אותו פריט שהערכת המס קוראת) ו«סמן שהוכרע».
// ‼ «התקבל» = הלקוח העלה קובץ; «אושר» = המשרד בדק. לא טוענים יותר ממה שקרה.

import { useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { SubjectRole, YearFact } from './types';
import type { YearData } from './api';
import * as api from './api';
import { ITEM_BY_KEY } from './catalog';
import { DOCS } from './documents';
import { supabase } from '../../lib/supabase';
import PriorReturnPrep from './PriorReturnPrep';
import { knownFamilyEvent } from './asks';

type Ask = YearData['asks'][number];
type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

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
}

/** איזה נושא בדוח כל מסמך מזין — הכותרת של השורה ב«מה למלא בדוח». */
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

export default function AnnualSummary({ client, step, year, data, busy, run, more, officeTodo, onClientPersisted }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const spouseName = client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג';
  const whoOf = (r: SubjectRole) => (r === 'spouse' ? spouseName : r === 'couple' ? (client.familyStatus === 'married' ? 'שניכם' : firstName) : firstName);
  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const facts = data.facts.filter(f => f.taxYear === year);
  const factFor = (key: string, role?: SubjectRole) => facts.filter(f => f.itemKey === key && (!role || f.subjectRole === role) && yes(f));
  const isYes = (key: string) => factFor(key).length > 0;

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

  // ── מה למלא בדוח: שורה לכל מסמך, לפי נושא; ומה שהלקוח אמר שלא היה ──
  const docRows = files.map(a => ({ a, topic: TOPIC[a.itemKey] ?? ITEM_BY_KEY[a.itemKey]?.label ?? a.itemKey, st: docState(a) }))
    .sort((x, y) => x.topic.localeCompare(y.topic, 'he'));
  const gridAsk = asks.find(a => a.itemKey === 'annual.whatHappened' && a.state === 'answered');
  const notThisYear = gridAsk && gridAsk.prompt.input.kind === 'multi'
    ? gridAsk.prompt.input.options.filter(o => facts.some(f => f.itemKey === o.key && f.answer === 'no')).map(o => o.label) : [];
  const businesses = (client.businesses ?? []).filter(b => !b.isClosed);

  // ── שנת פטירה ──
  // ‼ אלמן/ה מ-{שנה} בכרטיס — הענף נפתח ישר מהרשת (asks.ts › knownFamilyEvent), בלי עובדת «נפטר/ה»
  const death = isYes('family.eventDeath') || knownFamilyEvent(client, year) === 'death';
  const deathRec = factFor('family.death')[0]?.value as { date?: string } | undefined;
  const decisionDone = (key: string) => facts.some(f => f.itemKey === 'annual.officeDecision' && yes(f) && (f.value as { decision?: string } | undefined)?.decision === key);
  const survivors = ['family.survivorFromFund', 'family.survivorFromState', 'family.survivorFromBtl'].some(isYes);
  const kids = (client.children ?? []).filter(ch => !ch.birthYear || year - Number(ch.birthYear) < 21);

  // ── תשובות שמחכות לאישור: הפשוטות (כן/לא, «נכון», פרטי הענף) — באישור אחד; שינוי בתיק — בפירוט המלא ──
  const pendingPortal = facts.filter(f => f.requestId === step.id && f.status === 'pending' && f.source === 'portal');
  const simplePending = pendingPortal.filter(f => f.clientAssertion !== 'changed'
    && (f.answer === 'no' || f.clientAssertion === 'unchanged' || ITEM_BY_KEY[f.itemKey]?.kind === 'screener' || f.itemKey.startsWith('family.')));
  const otherPending = pendingPortal.length - simplePending.length;

  // ── מה עוד פתוח: «לא בטוח/ה» ושאלות שעוד מחכות ──
  const notSure = asks.filter(a => a.officeNote && !a.noteResolvedAt);
  const waiting = questions.filter(a => a.state === 'published');

  const markDecision = (key: string) => run(() => api.recordFact(client.id, {
    taxYear: year, itemKey: 'annual.officeDecision', subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
    answer: 'value', value: { decision: key, done: true, at: new Date().toISOString().slice(0, 10) }, basis: 'actual', requestId: step.id,
  } as never), 'סומן שהוכרע — נשמר מי ומתי');

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

  return (
    <section className="as-wrap" data-annual-summary aria-label={`דוח שנתי ${year} — הסיכום`}>
      <ol className="as-steps" aria-label="שלבי העבודה">
        <li className={questions.length && qDone === questions.length ? 'is-done' : 'is-now'}>שאלון {questions.length ? `${qDone}/${questions.length}` : ''}{questions.length && qDone === questions.length ? ' ✓' : ''}</li>
        <li className={files.length && fDone === files.length ? 'is-done' : files.length ? 'is-now' : ''}>מסמכים {files.length ? `${fDone}/${files.length}` : ''}</li>
        <li>הכנה</li><li>אישורך</li><li>חתימת הלקוח</li><li className={['completed', 'verified'].includes(step.status) ? 'is-done' : ''}>הוגש</li>
      </ol>

      {death && (
        <p className="as-note" role="note">
          <b>{spouseName} נפטר/ה{deathRec?.date ? ` ב-${deathRec.date.split('-').reverse().join('.')}` : ''}.</b> {client.familyStatus === 'married' ? `${firstName} ${client.gender === 'female' ? 'היא בת הזוג הרשומה' : client.gender === 'male' ? 'הוא בן הזוג הרשום' : 'הוא/היא בן/בת הזוג הרשום/ה'} — הדוח מוגש בתיק הזה.` : ''}
        </p>
      )}

      {/* ‼ 19.10.2026 · עוד לא יצא כלום ללקוח — «לפני השליחה»: הדוח של שנה שעברה כנקודת פתיחה (או פרסום מהכרטיס) */}
      {more && asks.length === 0 && (
        <PriorReturnPrep client={client} year={year} stepId={step.id} busy={busy} run={run} publishPlain={more.run} onClientPersisted={onClientPersisted} />
      )}
      {more && more.count > 0 && asks.length > 0 && (
        <div className="as-approve" role="note" data-annual-more>
          <span>{more.count === 1 ? 'עוד שאלה אחת' : `עוד ${more.count} שאלות`} ל{firstName} — לפי מה שכבר ענה או לפי מה שבתיק.<small>מתפרסמות בדף של {firstName}, בלי מייל.</small></span>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void more.run()}>הכן ופרסם בדף</button>
        </div>
      )}

      {pendingPortal.length > 0 && (
        <div className="as-approve" role="note">
          <span>{pendingPortal.length === 1 ? 'תשובה אחת' : `${pendingPortal.length} תשובות`} של {firstName} מחכות לאישורך — אחרי האישור הן נכנסות לחישוב.
            {otherPending > 0 && <small>{otherPending === 1 ? 'אחת מהן משנה' : `${otherPending} מהן משנות`} את מה שבתיק — לעבור עליהן ב«פירוט מלא» למטה.</small>}</span>
          {simplePending.length > 0 && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busy}
              onClick={() => void run(() => api.decideFacts(simplePending.map(f => f.id), 'accept'), `אושרו ${simplePending.length} תשובות`)}>
              אשר {simplePending.length === pendingPortal.length ? 'את כולן' : `${simplePending.length} פשוטות`}
            </button>
          )}
        </div>
      )}

      <div className="as-sec">
        <h3>מה למלא בדוח <span>לפי תשובות {firstName}</span></h3>
        {waiting.length > 0 && <p className="as-hint">{firstName} עוד לא {client.gender === 'male' ? 'סיים' : client.gender === 'female' ? 'סיימה' : 'סיים/ה'} לענות ({waiting.length} {waiting.length === 1 ? 'שאלה פתוחה' : 'שאלות פתוחות'}) — הרשימה תתעדכן.</p>}
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
          {!docRows.length && !businesses.length && <p className="as-hint">עוד אין מה להציג — מחכים לתשובות של {firstName}.</p>}
          {notThisYear.length > 0 && <p className="as-none">לא היה ב-{year}, לפי {firstName}: {notThisYear.join(' · ')}</p>}
        </div>
      </div>

      {files.length > 0 && (
        <div className="as-sec">
          <h3>מסמכים <span>{fDone} מתוך {files.length} התקבלו</span></h3>
          {files.filter(a => ['miss', 'later'].includes(docState(a).tone)).length === 0
            ? <p className="as-hint">כל המסמכים שביקשנו התקבלו. בדיקה ואישור של כל מסמך — ב«פירוט מלא» למטה.</p>
            : fDone === 0 ? <p className="as-hint">עוד לא הגיע אף מסמך — כולם ברשימה למעלה, ומופיעים בדף של {firstName}.</p>
            : (
              <div className="as-rows">
                {files.filter(a => ['miss', 'later'].includes(docState(a).tone)).map(a => (
                  <div key={a.id} className="as-open"><span>{a.prompt.title} · {whoOf(a.subjectRole)}<small>{docState(a).text}</small></span></div>
                ))}
              </div>
            )}
        </div>
      )}

      <OnlyYouKnow client={client} year={year} stepId={step.id} facts={facts} busy={busy} run={run} businesses={businesses.map(b => (b.belongsToSpouse ? 'spouse' : 'client'))} />

      {death && (
        <div className="as-sec">
          <h3>הכרעות שלך <span>שנת פטירה · המערכת מציגה ולא מחליטה</span></h3>
          <div className="as-rows">
            {DEATH_DECISIONS.map(d => (
              <div key={d.key} className={`as-open${decisionDone(d.key) ? ' is-done' : ''}`}>
                <span>{d.text}<small>{d.source}</small></span>
                {decisionDone(d.key) ? <span className="as-pill is-ok">הוכרע</span>
                  : <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void markDecision(d.key)}>סמן שהוכרע</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {officeTodo && (
        <div className="as-sec" data-annual-office>
          <h3>השלמות במשרד <span>{officeTodo.count}</span></h3>
          <div className="as-open">
            <span>סכומים ממסמכים שהגיעו, מסלולים והחלטות — כל אחד בשורה שלו, עם ההסבר<small>נפתח ב«פירוט מלא»</small></span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={officeTodo.open}>להשלים עכשיו</button>
          </div>
        </div>
      )}

      {notSure.length > 0 && (
        <div className="as-sec">
          <h3>מה עוד פתוח <span>{notSure.length}</span></h3>
          <div className="as-rows">
            {notSure.map(a => (
              <div key={a.id} className="as-open">
                <span>{a.prompt.title}<small>{a.officeNote} · לבדוק בשיחה</small></span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.resolveNote(a.id), 'סומן שנסגר')}>סגור</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {death && survivors && kids.length > 0 && (
        <div className="as-sec">
          <h3>עבודה נוספת שעלתה <span>לא בדוח הזה</span></h3>
          <div className="as-rows">
            <div className="as-open">
              <span>תיאום מס או החזר מס על קצבת היתומים — {kids.map(k => k.firstName).filter(Boolean).join(', ') || 'הילדים'}<small>לכל ילד תיק משלו; כמה משלמים ⇒ תיאום לכל שאיר</small></span>
              {orphanDone ? <span className="as-hint">{orphanDone}</span>
                : <button type="button" className="btn btn-sm btn-ghost" disabled={orphanBusy} onClick={() => void openOrphanRequest()}>＋ פתח בקשה</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * «רק אתה יודע» — מה שהלקוח לא יודע לענות: מקדמות, ניכוי במקור, ביטוח לאומי כעצמאי, הפסדים מועברים.
 * ‼ נשמר כעובדת משרד לשנה (record_tax_year_fact) — אותו פריט שהערכת המס של אותה שנה קוראת. ריק = לא ידוע (לא 0).
 */
function OnlyYouKnow({ client, year, stepId, facts, busy, run, businesses }: {
  client: Client; year: number; stepId: string; facts: YearFact[]; busy: boolean; run: Run; businesses: ('client' | 'spouse')[];
}) {
  const people: { role: 'client' | 'spouse'; name: string; business: boolean }[] = [
    { role: 'client', name: client.firstName || 'הלקוח', business: businesses.includes('client') },
    ...(client.familyStatus === 'married' ? [{ role: 'spouse' as const, name: client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג', business: businesses.includes('spouse') }] : []),
  ];
  const current = (key: string, role: string) => {
    const f = facts.filter(x => x.itemKey === key && x.subjectRole === role && x.status === 'accepted' && x.source !== 'portal')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return f ? (f.answer === 'zero' ? 0 : typeof f.value === 'number' ? f.value : null) : null;
  };
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = (key: string, role: string, raw: string) => {
    const t = raw.replace(/[^\d.]/g, '');
    if (t === '') return;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n === current(key, role)) return;
    void run(() => api.recordFact(client.id, {
      taxYear: year, itemKey: key, subjectRole: role as SubjectRole, periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
      answer: n === 0 ? 'zero' : 'value', value: n === 0 ? undefined : n, basis: 'final', requestId: stepId,
    } as never), `נשמר לשנת ${year} — גם הערכת המס של ${year} קוראת אותו`);
  };
  return (
    <div className="as-sec">
      <h3>רק אתה יודע <span>נשמר פעם אחת לשנת {year}, ומופיע גם בהערכת המס של {year}</span></h3>
      <div className="as-only">
        {people.map(p => {
          const items = PAYMENT_ITEMS.filter(i => !i.businessOnly || p.business).filter(i => i.key !== 'carryForward.balances' || p.role === 'client' || p.business);
          return (
            <div key={p.role} className="as-only-person">
              <b>{p.name}{p.business ? ' · עסק' : ''}</b>
              {!p.business && <small>{p.role === 'spouse' ? 'בלי עסק — אין מקדמות לרשום.' : 'בלי עסק — מקדמות וניכוי במקור לא רלוונטיים.'}</small>}
              <div className="as-only-grid">
                {items.map(i => {
                  const id = `oyk-${p.role}-${i.key}`;
                  const cur = current(i.key, p.role);
                  return (
                    <label key={i.key} htmlFor={id}>
                      <span>{i.label}</span>
                      <span className="as-money"><span>₪</span>
                        <input id={id} inputMode="numeric" dir="ltr" disabled={busy} placeholder={cur === null ? 'לא ידוע' : ''}
                          value={draft[id] ?? (cur === null ? '' : fmt(cur))}
                          onChange={e => setDraft(d => ({ ...d, [id]: e.target.value }))}
                          onBlur={e => save(i.key, p.role, e.target.value)} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
