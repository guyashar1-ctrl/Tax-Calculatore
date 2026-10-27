// ─── הצהרת הון במשרד: המספר האחד והגישור (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-wealth-declaration.html) ──
// ‼ הצהרת המשך: «הפער שלא מוסבר» — הגידול בהון מול הכנסות − מס + מה שנכנס − מה שיצא − הוצאות מחיה (bridge.ts).
//   הצהרה ראשונה: ההון הנטו. כל שורה עם המקור שלה; חסר ≠ 0 — רשימת «חסר» במקום מספר.
// ‼ הכנסה ומס לכל שנה — משע״ם. עד שהקריאה האוטומטית תיבנה (המסך בשע״ם ייבדק חי), המשרד רושם אותם בשורה (wealth.bridge.income).
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { YearFact } from '../taxYear/types';
import { clientForTaxYear } from '../../utils/familyStatusYear';
import { computeBridge, personsFrom, type BridgeResult, type LifeCosts, type MoneyFlow, type YearIncome } from './bridge';
import { MONEY_IN } from '../taxYear/records';
import type { WealthOutputs } from './engine';
import './bridge.css';

export const BRIDGE_INCOME = 'wealth.bridge.income';
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const n0 = (n: number) => Math.round(n).toLocaleString('he-IL');
const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

/** התשובה האחרונה לפריט (ממתינה או מאושרת) — הערך של הרשומה, או null; «לא» ⇒ רשומה ריקה. */
function recordOf(facts: YearFact[], key: string, stepId: string, asOf: string): Record<string, unknown> | null | undefined {
  const f = facts.filter(x => x.itemKey === key && (x.requestId === stepId || x.periodTo === asOf) && (x.status === 'accepted' || x.status === 'pending'))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
  if (!f) return undefined;
  if (f.answer === 'no') return {};
  const item = ((f.value as { items?: unknown[] } | undefined)?.items ?? [])[0] as Record<string, unknown> | undefined;
  return item ?? null;
}

export function bridgeInputs(facts: YearFact[], stepId: string, asOf: string) {
  const life = recordOf(facts, 'wealth.since.living', stepId, asOf);
  const lifeCosts: LifeCosts | null = life && (life.costs || life.rentMonthly || life.mortgageMonthly)
    ? { items: Object.entries((life.costs ?? {}) as Record<string, number>).map(([cat, yearly]) => ({ cat, yearly: Number(yearly) || 0 })),
        rentMonthly: Number(life.rentMonthly) || 0, mortgageMonthly: Number(life.mortgageMonthly) || 0 }
    : null;
  const flows = (key: string): MoneyFlow[] | null => {
    const r = recordOf(facts, key, stepId, asOf);
    if (r === undefined || r === null) return null;
    return ((r.flows ?? []) as MoneyFlow[]).map(f => ({ kind: f.kind, amount: Number(f.amount) || 0, year: Number(f.year) || undefined }));
  };
  return { life: lifeCosts, moneyIn: flows('wealth.since.sources'), moneyOut: flows('wealth.since.uses'), incomes: incomesOf(facts, asOf) };
}

/**
 * ‼ הכנסה ומס לכל השנים — עובדה אחת ליום ההצהרה ({ years: { 2021: { income, tax } … } }): הנתונים של ההצהרה נטענים
 *   לשנה אחת וליום אחד (scopeYearData), ועובדה לכל שנה הייתה נעלמת או דורסת את השנה הקודמת.
 */
export function incomesOf(facts: YearFact[], asOf: string): YearIncome[] {
  const f = facts.filter(x => x.itemKey === BRIDGE_INCOME && x.status === 'accepted' && x.periodTo === asOf)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
  const years = ((f?.value as { years?: Record<string, { income?: number; tax?: number }> } | undefined)?.years) ?? {};
  return Object.entries(years).filter(([, v]) => Number.isFinite(Number(v.income)))
    .map(([y, v]) => ({ year: Number(y), income: Number(v.income), tax: Number(v.tax) || 0 }));
}

export function useBridge(client: Client, facts: YearFact[], stepId: string, asOf: string, out: WealthOutputs, prevAsOf?: string, prevLiabilities?: number | null): BridgeResult | null {
  return useMemo(() => {
    if (!prevAsOf) return null;
    const x = bridgeInputs(facts, stepId, asOf);
    return computeBridge({
      prevAsOf, asOf, prevTotal: out.previous?.total ?? null, nowTotal: out.total, prevLiabilities: prevLiabilities ?? null, nowLiabilities: out.liabilities,
      incomes: x.incomes, life: x.life, moneyIn: x.moneyIn, moneyOut: x.moneyOut,
      personsInYear: personsFrom(y => clientForTaxYear(client, y).familyStatus === 'married', (client.children ?? []).map(k => k.birthYear ?? (k.birthDate ? Number(String(k.birthDate).slice(0, 4)) : undefined))),
    });
  }, [client, facts, stepId, asOf, out, prevAsOf, prevLiabilities]);
}

/** המספר האחד — הפער שלא מוסבר (המשך) או ההון הנטו (ראשונה). */
export function WealthHero({ b, out, firstName }: { b: BridgeResult | null; out: WealthOutputs; firstName: string }) {
  if (!b) {
    return (
      <div className="wb-card wb-hero" data-wb-hero="first">
        <small>הון נטו ליום ההצהרה</small>
        <div className={`wb-big${out.total == null ? ' is-wait' : ''}`}>{out.total == null ? `חסרים ${out.missing.length} סעיפים` : nis(out.total)}</div>
        {out.total != null && <div className="wb-parts"><span>נכסים {nis(out.assets ?? 0)}</span><span>התחייבויות {nis(out.liabilities ?? 0)}</span></div>}
      </div>
    );
  }
  const g = b.gap == null ? null : Math.round(b.gap / 1000) * 1000;
  return (
    <div className="wb-card wb-hero" data-wb-hero="gap">
      <small>הפער שלא מוסבר</small>
      {g == null
        ? <div className="wb-big is-wait" data-wb-gap="">יחושב כשיהיה הכול</div>
        : <div className={`wb-big ${g > 50000 ? 'is-due' : g > 0 ? 'is-warn' : 'is-ok'}`} data-wb-gap={g}>{g > 0 ? `כ-${nis(g)}` : 'הגידול מוסבר'}</div>}
      <div className="wb-parts">
        {g == null ? b.missing.slice(0, 3).map((m, i) => <span key={i}>חסר: {m}</span>) : <>
          <span>הון נטו {nis(out.total ?? 0)}</span><span>גידול: {nis(b.growth ?? 0)}</span><span>מוסבר: {nis(b.explained ?? 0)}</span></>}
        {g == null && b.missing.length > 3 && <span>ועוד {b.missing.length - 3}</span>}
      </div>
      {g == null && b.missing.some(m => m.includes('עוד לא ענה')) && <p className="wb-note">רמת החיים ומה שנכנס — מהשאלון של {firstName}</p>}
    </div>
  );
}

/** הגישור: שני פסים, ושורה לכל רכיב — עם המקור ופירוט לפי שנה. */
export function BridgeCard({ b, prevAsOf, asOf, prevTotal, nowTotal, firstName, busy, onSaveIncome, onAsk, asked }: {
  b: BridgeResult; prevAsOf: string; asOf: string; prevTotal: number | null; nowTotal: number | null; firstName: string; busy: boolean;
  onSaveIncome: (year: number, income: number, tax: number) => Promise<boolean>; onAsk?: () => void; asked?: boolean;
}) {
  const [open, setOpen] = useState<{ inc: boolean; life: boolean }>({ inc: b.incomeNet == null, life: false });
  const [edit, setEdit] = useState<Record<number, { income: string; tax: string }>>({});
  const max = Math.max(b.growth ?? 0, b.explained ?? 0, 1);
  const w = (v: number) => `${Math.max(0, (v / max) * 100).toFixed(1)}%`;
  const show = b.growth != null && b.explained != null;
  const lifeYear = b.years[0] ? b.years[0].life + b.years[0].rent : 0;
  const label = (kinds: readonly { key: string; label: string }[], k: string) => kinds.find(x => x.key === k)?.label ?? k;
  return (
    <div className="wb-card" data-wb-bridge>
      <h3 className="wb-h3">הגישור <small>{he(prevAsOf)} ← {he(asOf)}</small></h3>
      {show && (
        <div className="wb-cmp">
          <span className="lb">הגידול בהון</span><div className="wb-track"><i className="act" style={{ width: w(b.growth!) }} /></div>
          <span className="v"><b>{nis(b.growth!)}</b> · מ-{nis(prevTotal ?? 0)} ל-{nis(nowTotal ?? 0)}</span>
          <span className="lb">מה שמוסבר</span><div className="wb-track"><i className="gap" style={{ width: w(b.growth!) }} /><i className="exp" style={{ width: w(Math.min(b.explained!, b.growth!)) }} /></div>
          <span className="v"><b>{nis(b.explained!)}</b>{b.gap != null && b.gap > 0 ? <> · חסר הסבר ל-<b>{nis(b.gap)}</b></> : null}</span>
        </div>
      )}
      <div className="wb-wf">
        <div className="wb-r"><span className="s" /><span className="t">הון נטו בהצהרה הקודמת <i className="wb-src decl">{he(prevAsOf)}</i></span><b>{prevTotal == null ? 'חסר' : nis(prevTotal)}</b></div>
        <div className="wb-r"><span className="s">+</span><span className="t">הכנסות, אחרי מס <i className="wb-src shaam">משע״ם</i>
          <button type="button" className="wb-lnk" onClick={() => setOpen(o => ({ ...o, inc: !o.inc }))} aria-expanded={open.inc}>{open.inc ? 'סגור' : 'לפי שנה'}</button></span>
          <b>{b.incomeNet == null ? 'חסר' : nis(b.incomeNet)}</b></div>
        {open.inc && (
          <table className="wb-t" data-wb-incomes><thead><tr><th>שנה</th><th>הכנסה</th><th>מס</th><th /></tr></thead><tbody>
            {b.years.map(y => {
              const e = edit[y.year];
              return y.income != null && !e ? (
                <tr key={y.year}><td>{y.year}</td><td>{n0(y.income)}</td><td>{n0(y.tax ?? 0)}</td>
                  <td><button type="button" className="wb-lnk" onClick={() => setEdit(x => ({ ...x, [y.year]: { income: String(y.income), tax: String(y.tax ?? 0) } }))}>תיקון</button></td></tr>
              ) : (
                <tr key={y.year} data-wb-income-row={y.year}><td>{y.year}</td>
                  <td><input inputMode="numeric" aria-label={`הכנסה ${y.year}`} placeholder="הכנסה" value={e?.income ?? ''} onChange={ev => setEdit(x => ({ ...x, [y.year]: { income: ev.target.value, tax: x[y.year]?.tax ?? '' } }))} /></td>
                  <td><input inputMode="numeric" aria-label={`מס ${y.year}`} placeholder="מס" value={e?.tax ?? ''} onChange={ev => setEdit(x => ({ ...x, [y.year]: { income: x[y.year]?.income ?? '', tax: ev.target.value } }))} /></td>
                  <td><button type="button" className="wb-lnk" disabled={busy || !Number(e?.income?.replace(/\D/g, ''))}
                    onClick={() => void onSaveIncome(y.year, Number(e!.income.replace(/\D/g, '')), Number((e!.tax ?? '').replace(/\D/g, '')) || 0).then(ok => { if (ok) setEdit(x => { const n = { ...x }; delete n[y.year]; return n; }); })}>רשום</button></td></tr>
              );
            })}
          </tbody></table>
        )}
        {open.inc && b.years.some(y => y.income == null) && <p className="wb-note">מהשע״ם — ההכנסה החייבת והמס של כל שנה. בקרוב — נקרא לבד.</p>}
        <div className="wb-r"><span className="s">+</span><span className="t">נכנס ולא מהעבודה <i className="wb-src client">{firstName} סימן</i>
          <small>{b.missing.some(m => m.startsWith('מה נכנס')) ? 'עוד לא ענה' : b.moneyIn ? '' : 'לא היה'}</small></span><b>{nis(b.moneyIn)}</b></div>
        {b.moneyOut > 0 && <div className="wb-r"><span className="s">−</span><span className="t">יצא ולא להוצאות הבית <i className="wb-src client">{firstName} סימן</i></span><b>{nis(b.moneyOut)}</b></div>}
        <div className="wb-r"><span className="s">−</span><span className="t">הוצאות מחיה <i className="wb-src table">לוח רשות המסים</i><i className="wb-src client">רמת חיים</i>{(b.interestTotal ?? 0) > 0 && <i className="wb-src decl">ריבית</i>}
          <button type="button" className="wb-lnk" onClick={() => setOpen(o => ({ ...o, life: !o.life }))} aria-expanded={open.life}>{open.life ? 'סגור' : 'לפי שנה'}</button></span>
          <b>{b.living == null ? 'חסר' : nis(b.living)}</b></div>
        {open.life && (
          <>
            <table className="wb-t" data-wb-living><thead><tr><th>שנה</th><th>לפי הלוח</th><th>רמת חיים</th><th>ריבית</th><th>סה״כ</th></tr></thead><tbody>
              {b.years.map(y => (
                <tr key={y.year}><td>{y.year}<small>{y.persons} נפשות{y.table ? ` · קבוצה ${y.table.group}${y.table.exact ? '' : ` · לוח ${y.table.tableYear}`}` : ''}</small></td>
                  <td>{y.table ? n0(y.table.amount) : 'חסר'}</td><td>{lifeYear ? n0(lifeYear) : '—'}</td><td>{y.interest ? n0(y.interest) : '—'}</td><td>{y.living == null ? 'חסר' : n0(y.living)}</td></tr>
              ))}
            </tbody></table>
            <p className="wb-note">לוח 5 של רשות המסים — בלי ריהוט, חשמל ותכשיטים (הם בהצהרה) ובלי פריטי רמת החיים (הם מהלקוח). שנה בלי לוח — הלוח האחרון שפורסם. הנפשות — לפי הילדים בתיק.</p>
          </>
        )}
        {show && <div className="wb-r tot"><span className="s">=</span><span className="t">הון צפוי ליום {he(asOf)}</span><b>{nis((prevTotal ?? 0) + b.explained!)}</b></div>}
        {show && <div className="wb-r"><span className="s" /><span className="t">הון בפועל — מההצהרה</span><b>{nis(nowTotal ?? 0)}</b></div>}
      </div>
      {b.gap != null && b.gap > 0 && (
        <div className="wb-why" data-wb-why>
          <p>מה יכול להסביר {nis(Math.round(b.gap / 1000) * 1000)}?</p>
          <ul>{[...MONEY_IN.filter(k => k.key === 'sale' || k.key === 'gift' || k.key === 'loan')].map(k => <li key={k.key}>{label(MONEY_IN, k.key)} שלא נרשמה</li>)}</ul>
          {onAsk && (asked ? <span className="wb-pill">השאלה בדף של {firstName}</span> : <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onAsk} data-wb-ask>שאל את {firstName}</button>)}
        </div>
      )}
      {b.gap != null && b.gap <= 0 && <p className="wb-ok">הגידול בהון מוסבר — אין פער</p>}
    </div>
  );
}
