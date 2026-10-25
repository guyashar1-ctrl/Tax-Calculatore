// ─── אבני בניין קטנות לנושאי הידע ───────────────────────────────────────────
// RV — ערך מהמרשם בתוך הטקסט, עם סימון כשהביסוס אינו רשמי או שהערך משנה אחרת.

import { useState } from 'react';
import { ruleView, formatRuleValue, BASIS_LABEL, describeProblem } from '../taxRules/registry';
import { SOURCES } from '../taxRules/sources';
import type { Basis, GateProblem } from '../taxRules/types';
import { buildMaintenancePrompt, type MaintenanceScope } from './maintenancePrompt';

const GLYPH: Record<Basis, string> = { primary: '●', derived: '◇', secondary: '◐', unverified: '○' };

export function BasisTag({ basis, label }: { basis: Basis; label?: string }) {
  return (
    <span className={`kn-basis ${basis}`} title={BASIS_LABEL[basis]}>
      <span aria-hidden="true">{GLYPH[basis]}</span>{label ?? BASIS_LABEL[basis]}
    </span>
  );
}

/** ערך מהמרשם. ‼ כשהערך אינו רשמי לשנה המבוקשת — מוצג סימון לידו. */
export function RV({ id, year }: { id: string; year: number }) {
  const v = ruleView(id, year);
  if (!v?.entry) return <span className="kn-basis unverified">אין ערך</span>;
  if (!v.exactYear) return <span className="kn-rv kn-rv-prior" title={`ערך לשנת ${v.entry.taxYear} — טרם נקבע ערך ל-${year}`}>{typeof v.entry.value === 'number' ? <strong>{formatRuleValue({...v,exactYear:true})}</strong> : formatRuleValue({...v,exactYear:true})}{String(formatRuleValue({...v,exactYear:true})).includes('₪')&&<span className="kn-year-chip"> (ערך {v.entry.taxYear})</span>}</span>;
  const weak = v.entry.basis !== 'primary' || !v.exactYear;
  const why = !v.exactYear ? `ערך לשנת ${v.entry.taxYear} — אין ערך ל-${year}` : BASIS_LABEL[v.entry.basis];
  return (
    <span className="kn-rv" title={why}>
      {typeof v.entry.value === 'number' ? <strong>{formatRuleValue(v)}</strong> : formatRuleValue(v)}
      {v.exactYear && /מוקפא/.test(String((v.entry as any).note || '')) && <span className="kn-year-chip"> (מוקפא)</span>}{weak && <span className={`kn-basis ${v.exactYear ? v.entry.basis : 'secondary'}`} aria-label={why}> {GLYPH[v.exactYear ? v.entry.basis : 'secondary']}</span>}
    </span>
  );
}

export function Problems({ problems, soft }: { problems: GateProblem[]; soft?: boolean }) {
  if (!problems.length) return null;
  return soft
    ? <p className="kn-soft">{problems.map(describeProblem).join(' · ')} — המחשה בלבד, לא בסיס לחישוב בתיק.</p>
    : <div className="kn-blocked" role="status"><strong>אין תוצאה: </strong>{problems.map(describeProblem).join(' · ')}</div>;
}

export function SourcesTable({ ruleIds, year }: { ruleIds: string[]; year: number }) {
  return (
    <div className="kn-tbl-wrap">
      <table className="kn-tbl kn-tbl-wide">
        <thead><tr><th>כלל</th><th>ערך</th><th>שנה</th><th>ביסוס</th><th>מקור</th></tr></thead>
        <tbody>
          {ruleIds.map(id => {
            const v = ruleView(id, year);
            if (!v?.entry) return null;
            const src = SOURCES[v.entry.sourceId];
            return (
              <tr key={id}>
                <td>{v.rule.label}{v.rule.law ? <div className="kn-xs kn-muted">{v.rule.law}</div> : null}</td>
                <td style={{ minWidth: 160 }}>{formatRuleValue(v)}{v.entry.note ? <div className="kn-xs kn-muted">{v.entry.note}</div> : null}</td>
                <td className="n">{v.exactYear ? v.entry.taxYear : `${v.entry.taxYear} (אין ל-${year})`}</td>
                <td><BasisTag basis={v.entry.basis} /></td>
                <td className="kn-xs">
                  {src?.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a> : src?.label}
                  {v.entry.locator ? <div className="kn-muted">{v.entry.locator}</div> : null}
                  {src?.refersToTaxYear && src.refersToTaxYear !== v.entry.taxYear ? <div className="kn-muted">המסמך הוא של שנת {src.refersToTaxYear}; הערך מתייחס ל-{v.entry.taxYear}</div> : null}
                  {v.entry.revisions?.length ? <div className="kn-muted">{v.entry.revisions.length} גרסאות קודמות נשמרו</div> : null}
                  <div className="kn-muted">נבדק {v.entry.checkedAt}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** העתקת פרומפט התחזוקה. ‼ ההעתקה אינה אימות — הכיתוב אומר זאת במפורש. */
export function CopyPrompt({ scope, label }: { scope: MaintenanceScope; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [text, setText] = useState('');
  async function copy() {
    const t = buildMaintenancePrompt(scope);
    setText(t);
    try { await navigator.clipboard.writeText(t); setState('copied'); }
    catch { setState('manual'); }
  }
  return (
    <div className="kn-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{label}</button>
      {state === 'copied' && <span className="kn-copy-note" role="status">הועתק. ההעתקה אינה אימות — רק סבב שהושלם עם דוח משנה ביסוס של כלל.</span>}
      {state === 'manual' && (
        <>
          <span className="kn-copy-note" role="status">הדפדפן לא איפשר העתקה אוטומטית. סמנו את הטקסט והעתיקו:</span>
          <textarea readOnly value={text} rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} onFocus={e => e.currentTarget.select()} aria-label="פרומפט התחזוקה" />
        </>
      )}
    </div>
  );
}

export const fmtNis = (n: number) => Math.round(n).toLocaleString('he-IL') + ' ₪';
