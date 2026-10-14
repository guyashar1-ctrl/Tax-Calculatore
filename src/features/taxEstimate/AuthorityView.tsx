// ─── הערכת מס: מול כל רשות, ו«מה בדקנו» ──────────────────────────────────────
// ‼ לכל רשות ולכל אדם — החבות שהמקדמה צריכה לכסות, מה שולם, מה נשאר, מקדמה היום מול המלצה, השלמה לעבר
//   מול תשלומים עתידיים עם מועדים, ההשפעה על התזרים ומה עדיין לא ודאי. הכול נגזר מהמנוע — אין כאן חישוב מס.
// ‼ «הלקוח מסר» אינו יישור מול רשות; המצב מוצג ליד כל רשות. המלצה אינה ביצוע שינוי ברשות.
import { useState } from 'react';
import type { AuthorityAdvance, AuthorityAlignment, CashflowItem, ChargeLine, EstimateOutputs, OptimizationCheck, Person } from './types';
import { isNum } from './types';
import { nearTerm, ALIGNMENT_STATE_HE } from './cashflow';
import { AmountView, he, nis, PERSON } from './parts';
import { useKnowledgeLink } from '../taxKnowledge/knowledgeLink';

const AUTH: Record<'it' | 'ni', string> = { it: 'מס הכנסה', ni: 'ביטוח לאומי' };
const STATE_TONE: Record<AuthorityAlignment['state'], string> = { readFromAuthority: 'green', officeEntered: 'green', clientStated: 'amber', notRead: 'amber' };
const CHARGE_KIND_HE: Record<ChargeLine['kind'], string> = { difference: 'הפרש', linkage: 'הצמדה', interest: 'ריבית', fine: 'קנס' };
const CHARGE_STATUS_HE: Record<ChargeLine['status'], string> = { computed: 'מחושב', estimate: 'אומדן', expected: 'צפוי — לא אושר ברשות', explain: 'הסבר בלבד' };
const fmtAdv = (a: AuthorityAdvance, v?: number) => (v == null ? '—' : a.unit === '%' ? `${v}% מהמחזור` : a.unit === '₪ לחודש' ? `${nis(v)} לחודש` : `${nis(v)} לתקופה`);
const amt = (a: AuthorityAdvance['annualDue']) => (isNum(a) ? a.value : undefined);
const bal = (v?: number) => (v == null ? '—' : v > 0 ? `חוב ${nis(v)}` : v < 0 ? `זכות ${nis(-v)}` : 'מאוזן');

export function AuthorityOverview({ out, preparedOn, multi }: { out: EstimateOutputs; preparedOn: string; multi: boolean }) {
  const cash = out.cashflow ?? [];
  if (!out.advances.length) return null;
  const nt = nearTerm(cash, preparedOn, 60);
  return (
    <div className="te-auth" aria-label="מול הרשויות">
      <div className="te-auth-cash" role="note">
        <b>תזרים ב-60 הימים הקרובים (עד {he(nt.until)})</b>
        <span>במקדמות של היום: {nis(nt.current)} · לפי ההמלצה: {nis(nt.recommended)}{nt.catchUp ? <> · ועוד השלמה לתקופות שעברו: {nis(nt.catchUp)} (במועד שהרשות קובעת)</> : null}</span>
      </div>
      {out.advances.map(a => (
        <AuthorityCard key={a.authority + a.person} a={a} who={multi || a.person === 'spouse' ? PERSON[a.person] : ''}
          align={(out.alignment ?? []).find(x => x.authority === a.authority && x.person === a.person)}
          items={cash.filter(c => c.authority === a.authority && c.person === a.person)} household={out.household} />
      ))}
      {(out.alignment ?? []).filter(x => x.authority === 'vat').map(v => (
        <p key="vat" className="te-auth-vat"><span className={`ty-chip ${STATE_TONE[v.state]}`}>{ALIGNMENT_STATE_HE[v.state]}</span> {v.text}</p>
      ))}
    </div>
  );
}

function AuthorityCard({ a, who, align, items, household }: { a: AuthorityAdvance; who: string; align?: AuthorityAlignment; items: CashflowItem[]; household?: EstimateOutputs['household'] }) {
  const [open, setOpen] = useState(false);
  const adv = items.filter(i => i.kind === 'advance');
  const next = adv[0];
  const due = amt(a.annualDue);
  const paid = a.paidPast + a.paidFuture;
  const unsure = [
    ...(isNum(a.interestLinkage) ? [] : [`ריבית והצמדה: ${a.interestLinkage.why}`]),
    ...(isNum(a.fine) ? [] : [`קנס: ${a.fine.why}`]),
    ...(a.authority === 'it' && a.recommended != null && a.current != null && a.recommended < a.current ? ['הקטנת מקדמה (180(א)): אם בדוח יתברר שההקטנה לא הייתה מוצדקת — הצמדה וריבית על ההפרש מאמצע השנה (190(א)(2)). הקטנה היא דחיית תשלום, לא חיסכון במס'] : []),
    ...(a.authority === 'ni' && a.recommended != null && a.current != null && a.recommended < a.current ? ['הקטנת מקדמת ב״ל — ייתכנו השלכות על זכאות וגובה גמלאות (672)'] : []),
    ...(align?.gaps ?? []),
  ];
  return (
    <section className="te-auth-card" aria-label={`${AUTH[a.authority]}${who ? ` · ${who}` : ''}`}>
      <div className="te-auth-head">
        <b>{AUTH[a.authority]}{who ? ` · ${who}` : ''}</b>
        {align && <span className={`ty-chip ${STATE_TONE[align.state]}`} title={align.text}>{ALIGNMENT_STATE_HE[align.state]}{align.readOn && (align.state === 'readFromAuthority' || align.state === 'officeEntered') ? ` · ${he(align.readOn)}` : ''}</span>}
      </div>
      <div className="te-auth-figs">
        <div><span>{a.authority === 'it' ? 'המס שנובע מהעסק (לכיסוי במקדמות)' : 'דמי ביטוח לשנה'}</span><b><AmountView a={a.annualDue} /></b></div>
        <div><span>{a.authority === 'it' ? 'מקדמות ששולמו' : 'שולם'}</span><b>{nis(paid)}</b></div>
        <div><span>{a.authority === 'it' ? 'נשאר על העסק — במקדמה של היום' : 'נשאר — במקדמה של היום'}</span><b className={isNum(a.balanceAtCurrent) && a.balanceAtCurrent.value > 0 ? 'te-due' : ''}>{isNum(a.balanceAtCurrent) ? bal(a.balanceAtCurrent.value) : 'לא מחושב'}</b></div>
        <div><span>{a.authority === 'it' ? 'נשאר על העסק — לפי ההמלצה' : 'נשאר — לפי ההמלצה'}</span><b>{isNum(a.balanceAtRecommended) ? bal(a.balanceAtRecommended.value) : 'לא מחושב'}</b></div>
      </div>
      {a.authority === 'it' && household && <p className="te-auth-line te-auth-hh">מס הכנסה של משק הבית כולו (גם המשכורות והניכוי מהן): {bal(household.balanceAtCurrent)} במקדמה של היום — זו היתרה שתתברר בדוח השנתי.</p>}
      <p className="te-auth-line">מקדמה: היום <b>{fmtAdv(a, a.current)}</b> · מומלץ <b>{a.recommended == null ? 'ללא המלצה' : fmtAdv(a, a.recommended)}</b>{a.belowChangeThreshold ? ' — שינוי קטן מ-10%, אין עילה לתיקון' : ''}</p>
      <p className="te-auth-line">
        {isNum(a.catchUp) && a.catchUp.value > 0
          ? <>השלמה לתקופות שעברו: <b>{nis(a.catchUp.value)}</b> — {a.authority === 'it' ? 'לפי דרישת פקיד השומה או כתשלום מרצון' : '«הגדלת מקדמות», במועד שב״ל קובע'}. </>
          : <>השלמה לתקופות שעברו: {isNum(a.catchUp) ? 'אין' : 'לא נרשמה'}. </>}
        {next ? <>מכאן — {adv.length} תשלומים; הקרוב עד <b>{he(next.date)}</b>: {nis(next.current)} היום{next.recommended !== next.current ? <>, {nis(next.recommended)} לפי ההמלצה</> : null}.</> : 'אין תשלומים מתוכננים עד סוף השנה.'}
      </p>
      {a.changeCharges && a.changeCharges.length > 0 && (
        <div className="te-charges" role="group" aria-label="אם משנים את המקדמה — מה עוד יחול">
          <p className="ty-label">אם משנים את המקדמה — מה עוד יחול (כל שורה בנפרד)</p>
          <ul className="te-charges-list">
            {a.changeCharges.map(c => (
              <li key={c.kind}>
                <span className="te-charge-k">{CHARGE_KIND_HE[c.kind]}</span>
                <b className="te-charge-v">{c.status === 'computed' && c.amount != null ? (c.amount === 0 ? '0' : nis(Math.abs(c.amount)) + (c.amount < 0 ? ' לזכות' : '')) : '—'}</b>
                <span className={`ty-chip ${c.status === 'computed' ? '' : 'amber'}`}>{CHARGE_STATUS_HE[c.status]}</span>
                <small>{c.text}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn btn-sm btn-ghost te-auth-more" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'הסתר את הפירוט' : 'לוח תשלומים, איך חושב ומה לא ודאי'}</button>
      {open && (
        <div className="te-auth-body">
          {adv.length > 0 && (
            <div className="te-table-wrap"><table className="te-table"><thead><tr><th>עד</th><th>תקופה</th><th>היום</th><th>לפי ההמלצה</th></tr></thead>
              <tbody>{adv.map(i => <tr key={i.period}><td>{he(i.date)}</td><td>{i.period?.slice(5)}/{i.period?.slice(0, 4)}</td><td>{nis(i.current)}</td><td>{nis(i.recommended)}</td></tr>)}</tbody></table></div>
          )}
          {adv[0]?.note && <p className="ty-note">{adv[0].note}. מועד שחל ביום מנוחה נדחה — לא מחושב כאן.</p>}
          {a.explain.length > 0 && <><p className="ty-label">איך חושב</p><ul className="wd-list">{a.explain.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
          {due != null && <p className="ty-note">חבות היא אומדן משרדי — לא חיוב של הרשות. אחרי שינוי מורשה ברשות קוראים שוב את היתרות ושומרים אסמכתה.</p>}
          {unsure.length > 0 && <><p className="ty-label">מה עדיין לא ודאי</p><ul className="wd-list">{unsure.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
        </div>
      )}
    </section>
  );
}

const CHECK_HE: Record<OptimizationCheck['status'], { label: string; tone: string }> = {
  saving: { label: 'נמצא חיסכון', tone: 'green' },
  noSaving: { label: 'נבדק — אין חיסכון נוסף', tone: '' },
  notApplicable: { label: 'לא רלוונטי', tone: '' },
  missingData: { label: 'חסר מידע — לא נבדק', tone: 'amber' },
  notSupported: { label: 'לבדיקה ידנית', tone: 'amber' },
  notCompared: { label: 'ההשוואה טרם בוצעה', tone: 'amber' },
  compared: { label: 'הושווה במספרים', tone: '' },
  undecided: { label: 'לא הוכרע', tone: 'amber' },
};

export function ChecksList({ checks, stepId }: { checks: OptimizationCheck[]; stepId?: string }) {
  const kl = useKnowledgeLink();
  if (!checks.length) return <p className="ty-note">אין עדיין מה לבדוק — חסרים נתוני הכנסה.</p>;
  const order: OptimizationCheck['status'][] = ['saving', 'undecided', 'notCompared', 'missingData', 'notSupported', 'compared', 'noSaving', 'notApplicable'];
  const sorted = [...checks].sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status));
  return (
    <ul className="te-checks">
      {sorted.map(c => (
        <li key={c.id} className="te-check">
          <div className="te-check-head"><b>{c.title}</b><span className={`ty-chip ${CHECK_HE[c.status].tone}`}>{CHECK_HE[c.status].label}{c.saving ? ` · כ-${nis(c.saving)}` : ''}</span></div>
          <span className="te-check-detail">{c.detail}</span>
          {c.action && <span className="te-check-action">המלצה: {c.action}</span>}
          {c.topicId && kl && c.status !== 'notApplicable' && <button type="button" className="btn btn-sm btn-ghost te-check-learn" onClick={() => kl.open(c.topicId!, stepId)}>ללמוד את הנושא ›</button>}
        </li>
      ))}
    </ul>
  );
}

export const personLabel = (p: Person) => PERSON[p];
