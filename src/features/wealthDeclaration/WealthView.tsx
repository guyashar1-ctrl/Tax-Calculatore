// ─── הצהרת הון: הסיכום והטופס עצמו — אותו רכיב במשרד ובדף האישי (26.10.2026) ─────────────────────────────────
// ‼ הלקוח רואה וחותם בדיוק על מה שהמשרד ראה (הצילום מהשרת); במשרד — מהחישוב החי.
import { useState } from 'react';
import { pagesOf } from '../annualReturn/formPages';
import { wealthValuesOnPage, type WealthFigures } from './engine';
import '../annualReturn/workspace.css';

const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export interface WealthViewData extends WealthFigures {
  sections: { code: string; label: string; kind: string; amount: number | null; none: boolean }[];
  previous?: { asOf?: string; total: number | null };
  change: number | null;
}

/** הון נטו ושינוי מול ההצהרה הקודמת — שורה אחת לראש המסך. */
export function wealthHeadline(d: WealthViewData): { net: string; change: string } {
  const net = d.total === null ? 'חסרים סכומים' : nis(d.total);
  const change = d.change === null ? '' : `${d.change >= 0 ? 'עלייה' : 'ירידה'} של ${nis(Math.abs(d.change))} מאז ${d.previous?.asOf ? `ההצהרה מ-${he(d.previous.asOf)}` : 'ההצהרה הקודמת'}`;
  return { net, change };
}

export function WealthSummary({ d }: { d: WealthViewData }) {
  const row = (code: string, label: string, v: number | null | undefined, opts: { strong?: boolean; none?: boolean } = {}) => (
    <div key={code + label} className={`aw-line${opts.strong ? ' is-total' : ''}`} data-wd-code={code}>
      <span className="l">{label}</span>
      <span className="c">{/^\d+$/.test(code) ? code : ''}</span>
      <span className="v">{v === null || v === undefined ? <em className="wd-miss">חסר</em> : opts.none ? 'אין' : nis(v)}</span>
    </div>
  );
  const assets = d.sections.filter(s => s.kind === 'asset');
  const liab = d.sections.filter(s => s.kind === 'liability');
  const biz = d.sections.filter(s => s.kind === 'business');
  return (
    <div className="aw-sum wd-sum">
      <div className="aw-sum-h">רכוש</div>
      {assets.map(s => row(s.code, s.label, s.amount, { none: s.none }))}
      {row('200', 'סה״כ רכוש', d.assets, { strong: true })}
      <div className="aw-sum-h">התחייבויות</div>
      {liab.map(s => row(s.code, s.label, s.amount, { none: s.none }))}
      {row('210', 'סה״כ התחייבויות', d.liabilities, { strong: true })}
      {row('220', 'רכוש פחות התחייבויות', d.netPrivate, { strong: true })}
      {biz.map(s => row(s.code, s.label, s.amount, { none: s.none }))}
      {row('800', 'הון נטו', d.total, { strong: true })}
      {d.previous && row('prev', `בהצהרה הקודמת${d.previous.asOf ? ` (${he(d.previous.asOf)})` : ''}`, d.previous.total)}
      {d.change !== null && row('chg', 'שינוי', d.change, { strong: true })}
    </div>
  );
}

/** עמודי 1219 הרשמיים עם הסכומים בשדות הסיכום של כל סעיף. */
export function WealthFormView({ d }: { d: WealthViewData }) {
  const pages = pagesOf('1219');
  const [page, setPage] = useState(1);
  const pg = pages.find(p => p.n === page) ?? pages[0];
  const vals = pg ? wealthValuesOnPage(pg.n, d) : [];
  return (
    <div className="aw-form" data-wd-form>
      {pages.length > 1 && (
        <div className="aw-pages" role="group" aria-label="עמודים">
          {pages.map(p => <button key={p.n} type="button" aria-pressed={p.n === page} onClick={() => setPage(p.n)}>עמ׳ {p.n}</button>)}
        </div>
      )}
      {pg && (
        <div className="aw-paper" style={{ aspectRatio: `${pg.w} / ${pg.h}` }}>
          <img src={pg.img} alt={`1219 — עמוד ${pg.n}`} draggable={false} />
          {vals.map(v => (
            <span key={v.key} className="aw-val" data-wd-val={v.code}
              style={{ left: `${v.box[0] * 100}%`, top: `${v.box[1] * 100}%`, width: `${v.box[2] * 100}%`, height: `${v.box[3] * 100}%` }}>{v.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}
