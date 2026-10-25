// ─── «הדוח» לתצוגה: הסיכום והטופס עצמו — אותו רכיב במשרד ובדף האישי (חתימה, 297) ─────────────────────────────────
// ‼ הלקוח חותם על מה שהמשרד ראה: אותם רכיבים, מאותו ReturnOutputs (בדף — מהצילום ששמור בשרת).
import { useEffect, useState } from "react";
import type { ReturnOutputs } from "./types";
import { summaryRows } from "./workspace";
import { annexValues, pagesOf, slugOfForm, valuesOnPage } from "./formPages";
import type { FormSlug } from "../taxKnowledge/formMap/model";
import "./workspace.css";

const nis = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

export function Ring({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 27;
  return (
    <div className="aw-ring" role="img" aria-label={`${pct}% מהדוח מלא`} data-aw-pct={pct}>
      <svg viewBox="0 0 64 64"><circle className="bg" cx="32" cy="32" r="27" /><circle className="fg" cx="32" cy="32" r="27" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg>
      <span>{pct}%</span>
    </div>
  );
}

/** הסיכום: מה שיש בו סכום, לפי אדם — שורה לכל שדה, עם הקוד ומאיפה הגיע. */
export function Summary({ out, lit, firstName, spouseName, married }: { out: ReturnOutputs; lit: Set<string>; firstName: string; spouseName: string; married: boolean }) {
  const rows = summaryRows(out);
  const people: { p: 'client' | 'spouse' | 'joint'; name: string }[] = [{ p: 'client', name: firstName }, ...(married ? [{ p: 'spouse' as const, name: spouseName }] : []), { p: 'joint', name: married ? 'משותף' : 'כללי' }];
  if (!rows.length) return <p className="aw-empty">עוד אין סכומים בדוח — הם נכנסים עם התשובות והמסמכים.</p>;
  return (
    <div className="aw-sum">
      {people.map(({ p, name }) => {
        const mine = rows.filter(r => r.person === p);
        if (!mine.length) return null;
        return (
          <div key={p} className="aw-sec" data-person={p}>
            <div className="aw-sec-h"><i aria-hidden="true" />{name}</div>
            {mine.map(r => (
              <div key={`${r.code}-${r.label}`} className="aw-line" data-aw-code={r.code}>
                <span className="l">{r.label}</span><span className="s">{r.from}</span><span className="c">{r.code}</span>
                <span className={`v${lit.has(r.code) ? ' is-lit' : ''}`}>{nis(r.amount)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** הטופס עצמו: עמוד אחרי עמוד, עם הערכים בשדות (1301); בנספח — גם רשימת הערכים. */
export function FormView({ slug, out, lit }: { slug: FormSlug; out: ReturnOutputs; lit: Set<string> }) {
  const pages = pagesOf(slug);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [slug]);
  const pg = pages[page - 1];
  const vals = pg ? valuesOnPage(slug, pg.n, out) : [];
  const formId = slug === '1301' ? '1301' : out.formCoverage.annexes.find(a => slugOfForm(a.formId) === slug)?.formId ?? slug;
  const list = slug === '1301' ? [] : annexValues(formId, out);
  return (
    <div className="aw-form" data-aw-form={slug}>
      {list.length > 0 && <div className="aw-annex-vals">{list.map((v, i) => <div key={i} className="aw-line"><span className="l">{v.label}</span><span className="v">{v.text}</span></div>)}</div>}
      {pages.length > 1 && (
        <div className="aw-pages" role="group" aria-label="עמודים">
          {pages.map(p => <button key={p.n} type="button" aria-pressed={p.n === page} onClick={() => setPage(p.n)}>עמ׳ {p.n}</button>)}
        </div>
      )}
      {pg && (
        <div className="aw-paper" style={{ aspectRatio: `${pg.w} / ${pg.h}` }}>
          <img src={pg.img} alt={`${formId} — עמוד ${pg.n}`} draggable={false} />
          {vals.map(v => (
            <span key={v.key} className={`aw-val${lit.has(v.code) ? ' is-lit' : ''}`} data-aw-val={v.code}
              style={{ left: `${v.box[0] * 100}%`, top: `${v.box[1] * 100}%`, width: `${v.box[2] * 100}%`, height: `${v.box[3] * 100}%` }}>{v.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}

