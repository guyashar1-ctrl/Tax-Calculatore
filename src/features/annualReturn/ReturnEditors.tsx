// ─── הדוח השנתי: עורכי המשרד לכל מה שבדיקת הכיסוי מבקשת ──────────────────────────────
// ‼ מקור אחד: הצהרות, פרטים שהכרטיס עוד לא מחזיק, חשבון להחזר ושאלות פתיחה — נשמרים כעובדות שנת המס (תיק המס),
//   לא בטיוטת הדוח. ספרי 1320 — בטיוטת הדוח (נתוני הדוח עצמו, לכל עסק).
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { YearFact } from '../taxYear/types';
import * as tyApi from '../taxYear/api';
import { parsePnl, parseTable } from '../taxEstimate/importers';
import { nis } from '../taxEstimate/parts';
import { BOOK_QUESTIONS, booksFromPnl, compute1320, LINES_1320 } from './annex1320';
import { buildFile1301, encodeCp1255, verifyFile1301 } from './file1301';
import { IDENTITY_LABEL, RETURN_SCREENERS, screener } from './formFields';
import type { CoverageRow } from './formFields';
import type { Books1320, ReturnDraft, ReturnOutputs } from './types';

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
const latestObj = (facts: YearFact[], key: string, year: number): Record<string, unknown> => {
  const f = facts.filter(x => x.itemKey === key && x.taxYear === year && x.status === 'accepted').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return f?.value && typeof f.value === 'object' && !Array.isArray(f.value) ? (f.value as Record<string, unknown>) : {};
};
const recordObj = (client: Client, year: number, itemKey: string, value: unknown, requestId?: string) => tyApi.recordFact(client.id, {
  taxYear: year, itemKey, subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`, answer: 'value', value, basis: 'declared', requestId,
} as never);

/** קודי «פנקסים לפי תוספת» — ממבנה הקובץ 2025 (שדה 72). */
const BOOK_ADDENDA: [string, string][] = [['10', 'א׳ יצרנים'], ['15', 'ב׳ סיטונאים'], ['20', 'ג׳ קמעונאים'], ['25', 'ד׳ קבלנים'], ['30', 'ה׳ מקצועות חופשיים'], ['35', 'ו׳ רופאים'],
  ['40', 'ז׳ בתי ספר לנהיגה'], ['45', 'ח׳ בעלי בתי ספר'], ['50', 'ט׳ סוחרי/מתווכי מקרקעין'], ['55', 'י׳ סוחרי/מתווכי רכב'], ['60', 'יא׳ נותני שירותים ואחרים'], ['65', 'יב׳ חקלאים'],
  ['70', 'יד׳ תחנות דלק'], ['75', 'טו׳ סוכני ביטוח'], ['80', 'טז׳ יהלומנים']];
const DEGREE_CODES: [string, string][] = [['1', 'תואר ראשון'], ['2', 'תואר שני'], ['3', 'שלישי ברפואה / שיניים'], ['4', 'שלישי במסלול ישיר'], ['5', 'תעודת מקצוע'], ['12', 'ראשון ושני באותה שנה']];

/** הצהרות בהגשה: כן/לא לכל שורה שחסרה, וערכים מקודדים לניהול ספרים. */
export function DeclarationsEditor({ client, year, facts, rows, run, requestId }: { client: Client; year: number; facts: YearFact[]; rows: CoverageRow[]; run: Run; requestId?: string }) {
  const saved = latestObj(facts, 'filing.declarations', year);
  const [v, setV] = useState<Record<string, unknown>>({});
  const missing = rows.filter(r => r.fix === 'declaration' && r.state === 'missing');
  if (!missing.length && !Object.keys(saved).length) return null;
  const val = (id: string) => (id in v ? v[id] : saved[id]);
  const save = (extra: Record<string, unknown> = {}) => run(() => recordObj(client, year, 'filing.declarations', { ...saved, ...v, ...extra }, requestId), 'ההצהרות נשמרו בשנת המס');
  const restNo = Object.fromEntries(missing.filter(r => r.kind === 'checkbox' || r.kind === 'yesno').filter(r => val(r.id) === undefined).map(r => [r.id, false]));
  return (
    <div className="ar-editor" aria-label="הצהרות בהגשה">
      <p className="ty-label">הצהרות בהגשה · {missing.length ? `${missing.length} לסמן` : 'הושלמו'}</p>
      {missing.map(r => (
        <div key={r.id} className="ar-decl">
          <span>{r.label}</span>
          {r.id === 'F048' ? <select aria-label={r.label} value={String(val(r.id) ?? '')} onChange={e => setV({ ...v, [r.id]: e.target.value })}><option value="">— תוספת —</option>{BOOK_ADDENDA.map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}</select>
            : r.id === 'F049' ? <input aria-label={r.label} value={String(val(r.id) ?? '')} onChange={e => setV({ ...v, [r.id]: e.target.value })} placeholder="סעיף" />
            : r.id === 'F051' ? <select aria-label={r.label} value={String(val(r.id) ?? '')} onChange={e => setV({ ...v, [r.id]: e.target.value })}><option value="">—</option><option value="כפולה">כפולה</option><option value="חד צידית">חד צידית</option></select>
            : r.id === 'F053' ? <select aria-label={r.label} value={String(val(r.id) ?? '')} onChange={e => setV({ ...v, [r.id]: e.target.value })}><option value="">—</option><option value="computer">ממוחשב</option><option value="manual">ידני</option></select>
            : <span className="ar-yn">{[true, false].map(b => <label key={String(b)} className="te-radio"><input type="radio" name={`d-${r.id}`} checked={val(r.id) === b} onChange={() => setV({ ...v, [r.id]: b })} /> {b ? 'כן' : 'לא'}</label>)}</span>}
        </div>
      ))}
      <div className="ty-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={!Object.keys(v).length} onClick={() => void save()}>שמור הצהרות</button>
        {Object.keys(restNo).length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void save(restNo)} title="הצהרת המשרד — כל כן/לא שלא סומן נשמר «לא»">סמן «לא» בכל מה שלא סומן ({Object.keys(restNo).length})</button>}
      </div>
    </div>
  );
}

const ID_FOR_ROW: Record<string, (r: CoverageRow) => keyof typeof IDENTITY_LABEL> = {
  F060: () => 'fatherName', F065: () => 'spouseFatherName', F069: () => 'zip', F238: r => (r.person === 'spouse' ? 'spouseReleaseDate' : 'releaseDate'), F239: r => (r.person === 'spouse' ? 'spouseServiceMonths' : 'serviceMonths'),
  F240: r => (r.person === 'spouse' ? 'spouseDegreeCode' : 'degreeCode'), F013: () => 'aliyahDate', F235: () => 'aliyahDate', F014: () => 'spouseAliyahDate', F236: () => 'spouseAliyahDate', F237: () => 'returningDate',
};
/** פרטים שהכרטיס עוד לא מחזיק (פער כרטיס מתועד) — נשמרים לשנת המס. */
export function IdentityEditor({ client, year, facts, rows, run, requestId }: { client: Client; year: number; facts: YearFact[]; rows: CoverageRow[]; run: Run; requestId?: string }) {
  const saved = latestObj(facts, 'filing.identity', year);
  const keys = [...new Set(rows.filter(r => r.fix === 'identity' && r.state === 'missing').map(r => ID_FOR_ROW[r.id]?.(r)).filter(Boolean))] as (keyof typeof IDENTITY_LABEL)[];
  const [v, setV] = useState<Record<string, string>>({});
  if (!keys.length) return null;
  return (
    <div className="ar-editor" aria-label="פרטים שהכרטיס לא מחזיק">
      <p className="ty-label">פרטים שהכרטיס לא מחזיק · נשמרים לשנת המס</p>
      <div className="te-grid">{keys.map(k => (
        <label key={k} className="te-field">{IDENTITY_LABEL[k]}
          {/degreeCode/i.test(k) ? <select value={v[k] ?? String(saved[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })}><option value="">—</option>{DEGREE_CODES.map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}</select>
            : <input value={v[k] ?? String(saved[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })} inputMode={/zip|Months|Date/.test(k) ? 'numeric' : undefined} placeholder={/releaseDate|ReleaseDate/.test(k) ? 'MMYYYY' : /Date/.test(k) ? 'DD/MM/YYYY' : ''} />}
        </label>
      ))}</div>
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-primary" disabled={!Object.values(v).some(x => x.trim())} onClick={() => void run(() => recordObj(client, year, 'filing.identity', { ...saved, ...v }, requestId), 'הפרטים נשמרו בשנת המס')}>שמור</button>
        <span className="ty-note">הכרטיס עוד לא מחזיק את השדות האלה — פער מתועד; כשיתווספו, יעברו לכרטיס.</span></div>
    </div>
  );
}

/** חשבון בנק להחזר — על שם בן הזוג הרשום. */
export function RefundEditor({ client, year, facts, rows, run, requestId }: { client: Client; year: number; facts: YearFact[]; rows: CoverageRow[]; run: Run; requestId?: string }) {
  const saved = latestObj(facts, 'filing.refundAccount', year);
  const need = rows.some(r => r.fix === 'refund' && r.state === 'missing');
  const [v, setV] = useState<Record<string, string>>({});
  if (!need) return null;
  const f = (k: string, label: string, ph?: string) => <label className="te-field">{label}<input inputMode={k === 'holder' ? undefined : 'numeric'} value={v[k] ?? String(saved[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })} placeholder={ph} /></label>;
  const all = ['bank', 'branch', 'account', 'holder'].every(k => (v[k] ?? String(saved[k] ?? '')).trim());
  return (
    <div className="ar-editor" aria-label="חשבון להחזר">
      <p className="ty-label">חשבון בנק להחזר · על שם בן הזוג הרשום</p>
      <div className="te-grid">{f('bank', 'מספר בנק', '12')}{f('branch', 'סניף', '345')}{f('account', 'מספר חשבון')}{f('holder', 'שם בעל החשבון')}</div>
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-primary" disabled={!all} onClick={() => void run(() => recordObj(client, year, 'filing.refundAccount', { ...saved, ...v }, requestId), 'החשבון להחזר נשמר בשנת המס')}>שמור</button></div>
    </div>
  );
}

/** שאלות פתיחה שלא נענו לשנה — «לא ידוע» אינו «אין». המשרד עונה כאן או שולח ללקוח. */
export function ScreenerAnswers({ client, year, facts, run, requestId }: { client: Client; year: number; facts: YearFact[]; run: Run; requestId?: string }) {
  const unknown = RETURN_SCREENERS.filter(s => screener({ facts, year }, s.key) === 'unknown');
  const settlementPending = !!client.qualifyingSettlementId && !facts.some(f => f.itemKey === 'household.settlement' && f.taxYear === year && f.status === 'accepted');
  if (!unknown.length && !settlementPending) return null;
  const rec = (key: string, yes: boolean) => run(() => tyApi.recordFact(client.id, { taxYear: year, itemKey: key, subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
    answer: yes ? 'value' : 'no', value: yes ? true : undefined, basis: 'declared', requestId } as never), yes ? 'סומן «כן» — חלק מזה עשוי להיות לא נתמך' : 'סומן «לא»');
  return (
    <div className="ar-editor" aria-label="שאלות פתיחה שלא נענו">
      <p className="ty-label">שאלות פתיחה שלא נענו לשנה · {unknown.length + (settlementPending ? 1 : 0)}</p>
      {unknown.map(s => (
        <div key={s.key} className="ar-decl"><span>{s.label}</span>
          <span className="ar-yn"><button type="button" className="btn btn-sm btn-ghost" onClick={() => void rec(s.key, false)}>אין</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => void rec(s.key, true)}>יש</button></span></div>
      ))}
      {settlementPending && <div className="ar-decl"><span>מגורים ביישוב מזכה כל השנה</span><span className="ar-yn"><button type="button" className="btn btn-sm btn-ghost" onClick={() => void rec('household.settlement', true)}>כל השנה</button></span></div>}
      <p className="ty-note">אפשר גם לשאול את הלקוח — מ«שאלות ללקוח» למעלה.</p>
    </div>
  );
}

/** נספח 1320 לעסק: קליטת רו״ה, הקצאת שורות, שורות ידניות, ניהול ספרים ופרטים לשורות 7, 11, 20. */
export function Books1320Editor({ label, books, profitFact, onChange }: { label: string; books?: Books1320; profitFact?: number; onChange: (b: Books1320) => void }) {
  const [paste, setPaste] = useState('');
  const b: Books1320 = books ?? { lines: {}, answers: {} };
  const c = useMemo(() => compute1320(b, { profitFact, label }), [b, profitFact, label]);
  const preview = useMemo(() => { if (!paste.trim()) return null; try { return parsePnl(parseTable(paste)); } catch { return null; } }, [paste]);
  const set = (patch: Partial<Books1320>) => onChange({ ...b, ...patch });
  return (
    <div className="ar-editor" aria-label={`נספח 1320 — ${label}`}>
      <p className="ty-label">נספח 1320 — {label} · {c.complete ? 'מלא' : 'חלקי'}</p>
      <label className="te-field">בסיס הדיווח<select value={b.basis ?? ''} onChange={e => set({ basis: (e.target.value || undefined) as Books1320['basis'] })}><option value="">—</option><option value="cash">מזומן</option><option value="accrual">מצטבר</option></select></label>
      <details className="ty-details"><summary><b>קליטת רו״ה</b><span>{b.imported?.length ? `${b.imported.length} שורות נקלטו` : 'הדבקה מ-Excel / CSV'}</span></summary>
        <div className="ty-details-body">
          <textarea aria-label="רו״ה להדבקה" rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder="הדביקו את דוח הרווח וההפסד השנתי (טבלה עם חודשים וסכומים)" />
          {preview && <p className="ty-note">זוהו הכנסות {nis(preview.months.reduce((a, m) => a + (m.income ?? 0), 0))} ו-{preview.expenseCategories.length} קטגוריות הוצאה{preview.warnings.length ? ` · ${preview.warnings.join(' · ')}` : ''}</p>}
          <button type="button" className="btn btn-sm btn-primary" disabled={!preview} onClick={() => { if (preview) { onChange(booksFromPnl(preview, b)); setPaste(''); } }}>קלוט לנספח</button>
        </div>
      </details>
      {(b.imported ?? []).length > 0 && (
        <div className="ar-table-wrap"><table className="ar-table"><thead><tr><th>שורה ברו״ה</th><th>סכום</th><th>שורה בנספח</th></tr></thead><tbody>
          {(b.imported ?? []).map((x, i) => (
            <tr key={x.label + i}><td>{x.label}</td><td className="ar-num">{nis(x.total)}</td><td>
              <select aria-label={`שורה בנספח ל${x.label}`} value={x.line ?? ''} onChange={e => set({ imported: (b.imported ?? []).map((y, j) => (j === i ? { ...y, line: e.target.value || undefined } : y)) })}>
                <option value="">— לבחור —</option>{LINES_1320.filter(l => !l.derived && l.key !== '1' && !l.count).map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select></td></tr>
          ))}
        </tbody></table></div>
      )}
      <div className="te-grid">{LINES_1320.filter(l => !l.derived).map(l => {
        const fromImport = (b.imported ?? []).some(x => x.line === l.key);
        return <label key={l.key} className="te-field">{l.label}<input inputMode="numeric" disabled={fromImport} value={fromImport ? String(c.lines[l.key] ?? '') : String(b.lines[l.key] ?? '')}
          onChange={e => { const n = e.target.value.replace(/[^\d]/g, ''); const lines = { ...b.lines }; if (n === '') delete lines[l.key]; else lines[l.key] = Number(n); set({ lines }); }} />{fromImport ? <small>מרו״ה</small> : null}</label>;
      })}</div>
      <p className="ty-note">מחושב: 2ד {nis(c.lines['2d'])} · 18 {nis(c.lines['18'])} · 19 {nis(c.lines['19'])} · 22 {nis(c.lines['22'])}{profitFact != null ? ` · רווח בשנת המס ${nis(profitFact)}` : ''}</p>
      {(c.lines['7'] ?? 0) > 0 && <div className="te-grid"><label className="te-field">שורה 7 — החלק המותר לפי תקנות הרכב<input inputMode="numeric" value={String(b.carAllowed ?? '')} onChange={e => set({ carAllowed: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined })} /></label><label className="te-field">פרטי הרכב (סעיף ג׳)<input value={b.carDetails ?? ''} onChange={e => set({ carDetails: e.target.value })} placeholder="תיאור, מספר רישוי, חודשי שימוש" /></label></div>}
      {(c.lines['11'] ?? 0) > 0 && <label className="te-field">פרטי המשכיר (סעיף ד׳)<input value={b.landlord ?? ''} onChange={e => set({ landlord: e.target.value })} /></label>}
      {(c.lines['20'] ?? 0) > 0 && <label className="te-field">פירוט ההוצאות שאינן מותרות (סעיף ה׳)<input value={b.addBackNote ?? ''} onChange={e => set({ addBackNote: e.target.value })} /></label>}
      <fieldset className="te-fc-side"><legend>ניהול ספרים (סעיף א׳)</legend>
        <div className="te-grid">{BOOK_QUESTIONS.map(q => q.kind === 'yesno'
          ? <div key={q.key} className="ar-decl"><span>{q.label}</span><span className="ar-yn">{[true, false].map(v => <label key={String(v)} className="te-radio"><input type="radio" name={`bq-${label}-${q.key}`} checked={b.answers[q.key] === v} onChange={() => set({ answers: { ...b.answers, [q.key]: v } })} /> {v ? 'כן' : 'לא'}</label>)}</span></div>
          : <label key={q.key} className="te-field">{q.label}<input value={String(b.answers[q.key] ?? '')} onChange={e => set({ answers: { ...b.answers, [q.key]: e.target.value } })} /></label>)}</div>
      </fieldset>
      {c.problems.length > 0 && <ul className="te-blockers">{c.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    </div>
  );
}

const STATE_HE: Record<CoverageRow['state'], string> = { filled: 'מולא', missing: 'חסר', notSupported: 'לא מופק', notRelevant: 'לא חל', office: 'למשרד השומה / בחתימה', empty: 'ריק (רשות)' };
/** מטריצת הכיסוי — כל שדה בטופס ללקוח הזה, לפי חלק. */
export function CoverageMatrix({ out }: { out: ReturnOutputs }) {
  const [filter, setFilter] = useState<'problems' | 'relevant' | 'all'>('problems');
  const cov = out.formCoverage;
  const rows = cov.rows.filter(r => filter === 'all' ? true : filter === 'relevant' ? (r.need === 'required' || r.need === 'applies') : (r.state === 'missing' || r.state === 'notSupported'));
  const parts = [...new Set(rows.map(r => r.part))];
  return (
    <div>
      <p className="ty-note">{cov.counts.relevant} שדות רלוונטיים · {cov.counts.filled} מולאו · {cov.counts.missing} חסרים · {cov.counts.notSupported} לא מופקים (כולל נספחים) · {cov.counts.office} למשרד השומה / בחתימה</p>
      <label className="te-field" style={{ maxWidth: 260 }}>להציג<select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="problems">רק חסר / לא מופק</option><option value="relevant">כל הרלוונטיים</option><option value="all">כל 305 השדות</option></select></label>
      {parts.map(p => (
        <div key={p} className="ar-part"><p className="ty-label">חלק {p}</p>
          <div className="ar-table-wrap"><table className="ar-table"><thead><tr><th>שדה</th><th>מצב</th><th>ערך / מקור</th></tr></thead><tbody>
            {rows.filter(r => r.part === p).map((r, i) => <tr key={r.id + i}><td><b className="ar-code">{r.code ?? r.id}</b> {r.label}</td><td className={r.state === 'missing' || r.state === 'notSupported' ? 'ty-err' : ''}>{STATE_HE[r.state]}</td>
              <td className="ar-src">{r.value !== undefined ? <b>{typeof r.value === 'boolean' ? (r.value ? 'כן' : 'לא') : String(r.value)} · </b> : null}{r.source}</td></tr>)}
          </tbody></table></div></div>
      ))}
      <p className="ty-label">נספחים</p>
      <ul className="wd-list">{cov.annexes.map((a, i) => <li key={a.formId + i}><b>{a.formId}</b> — {a.reason} · {a.need === 'notRelevant' ? 'לא נדרש' : a.produced === 'full' ? 'מופק' : a.produced === 'partial' ? 'חלקי' : a.produced === 'notNeeded' ? 'לא נדרש' : 'לא מופק'}{a.note ? <small> — {a.note}</small> : null}</li>)}
        {cov.annexes.length === 0 && <li>לא נדרשים נספחים</li>}</ul>
    </div>
  );
}

/** התוצרים: גיליון עבודה (תמיד), טופס רשמי (אין — הסבר), וקובץ לפי מבנה רשות המסים — הפקה ובדיקה מקומית. */
export function ProductsSection({ out, client, draft, onDownloadSheet }: { out: ReturnOutputs; client: Client; draft: ReturnDraft; onDownloadSheet: () => void }) {
  const [file, setFile] = useState<{ issues: string[]; assumptions: string[]; notInFile: string[]; codes: number; text: string } | null>(null);
  const build = () => {
    const f = buildFile1301(out, { client, draft, savedOn: new Date().toISOString().slice(0, 10) });
    setFile({ issues: verifyFile1301(f), assumptions: f.assumptions, notInFile: f.notInFile, codes: f.codes.length, text: f.text });
  };
  const download = () => {
    if (!file) return;
    const blob = new Blob([encodeCp1255(file.text) as BlobPart], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `1301-${out.taxYear}-${(client.idNumber || client.id).replace(/\D/g, '') || 'client'}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="ar-products">
      <div className="ar-product"><b>1. גיליון עבודה (HTML)</b><span>להקלדה במערכת המקוונת של רשות המסים — לפי קודי הטופס, עם מקור לכל שורה ובדיקת כיסוי.</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDownloadSheet}>הורד גיליון</button></div>
      <div className="ar-product"><b>2. טופס רשמי</b><span>לא מופק כאן: טופסי 2025 של רשות המסים אינם PDF למילוי, ומי שחייב בדוח מקוון (שכר / עסק) מגיש בשידור. הטופס הרשמי החתום מודפס ממערכת הרשות אחרי השידור.</span></div>
      <div className="ar-product"><b>3. קובץ לפי «מבנה קובץ 1301 לשנת 2025»</b><span>המבנה שמשמש לשידור (OPCN) ולהעלאה כמייצג מזוהה. כאן רק מפיקים ובודקים מקומית — אין שידור ואין העלאה.</span>
        <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={build}>הפק ובדוק</button>{file && file.issues.length === 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={download}>הורד קובץ</button>}</div>
        {file && (
          <div className={file.issues.length ? 'ty-err' : 'ty-ok'} role="status">
            {file.issues.length ? <>נמצאו {file.issues.length} בעיות: <ul>{file.issues.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}</ul></> : <>נבדק: רשומות 1000 ו-9999 באורך המפרט, {file.codes} קודים, כל שדה נקרא בחזרה זהה.</>}
            {out.status !== 'completeWorksheet' && <p>‼ הגיליון אינו מלא — הקובץ משקף טיוטה ואינו מוכן להגשה.</p>}
            <small>הנחות: {file.assumptions.join(' · ')}{file.notInFile.length ? ` · בגיליון ולא בקובץ: ${file.notInFile.join(', ')}` : ''}</small>
          </div>
        )}
      </div>
    </div>
  );
}

/** נספח 1321, סעיף 3 — שכירות למגורים במסלול 10%: «דירה יחידה», שכר דירה ששולם למגורים, ופרטי הדירות. */
export function Rent1321Editor({ out, value, onChange }: { out: ReturnOutputs; value?: ReturnDraft['rent1321']; onChange: (v: NonNullable<ReturnDraft['rent1321']>) => void }) {
  const a = out.annex1321;
  if (!a) return null;
  const v = value ?? {};
  const setProp = (id: string, k: string, x: string) => onChange({ ...v, props: { ...(v.props ?? {}), [id]: { ...(v.props?.[id] ?? {}), [k]: x } } });
  return (
    <div className="ar-editor" aria-label="נספח 1321 — שכירות 10%">
      <p className="ty-label">נספח 1321 — שכירות למגורים 10% · {a.complete ? 'מלא' : 'חלקי'}</p>
      <p className="ty-note">הכנסה {nis(a.gross)} · ניכוי שכר דירה למגורים {nis(a.ownHousingRent)} · לשדה 284: {nis(a.net)}</p>
      <div className="ar-decl"><span>הנני מחזיק «דירה יחידה»</span><span className="ar-yn">{[true, false].map(b => <label key={String(b)} className="te-radio"><input type="radio" name="r1321-single" checked={v.singleApartment === b} onChange={() => onChange({ ...v, singleApartment: b })} /> {b ? 'כן' : 'לא'}</label>)}</span></div>
      <label className="te-field">שכר דירה ששולם למגורי המשכיר / בית אבות (עד 90,000)<input inputMode="numeric" value={String(v.ownHousingRent ?? '')} onChange={e => onChange({ ...v, ownHousingRent: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined })} placeholder="0" /></label>
      {a.props.map(p => (
        <div key={p.id} className="te-grid" aria-label={`פרטי דירה ${p.address}`}>
          <span className="te-field"><b>{p.address || 'דירה'}</b></span>
          {(['block', 'parcel', 'area', 'floor'] as const).map(k => <label key={k} className="te-field">{k === 'block' ? 'גוש' : k === 'parcel' ? 'חלקה' : k === 'area' ? 'שטח ברוטו (רשות)' : 'קומה (רשות)'}<input value={v.props?.[p.id]?.[k] ?? ''} onChange={e => setProp(p.id, k, e.target.value)} /></label>)}
        </div>
      ))}
      {a.problems.length > 0 && <ul className="te-blockers">{a.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>
  );
}
