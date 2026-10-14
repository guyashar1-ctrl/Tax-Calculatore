// ─── מפת כיסוי 1301 — כל שדה ותיבת סימון: מה נקרא ומה יש בתיק ─────────────
// ‼ שני צירים נפרדים: «נקרא/מופה» אינו «קיים בתיק». המסך מציג את שניהם, עם סינון
// למה שחסר — זה מה שהאיסוף בשלב 2 צריך לסגור.

import { useMemo, useState } from 'react';
import {
  coverage1301, coverageSummary, CATALOG_PARTS_1301_2025, CATALOG_UNCERTAIN_NOTES, ANNEX_CATALOG_2025, ANNEX_FILE_LINKS,
  READ_LABEL, FILE_LABEL, type FileState, type ReadState,
  ANNEX_INFO_2025, ANNEX_INFO_GAPS, SOURCE_LABEL_HE, PERIOD_LABEL, DRAFT_FILL_1301,
} from '../taxForms/coverage1301';
import { AVAILABLE, NOT_RELEASED } from './availability';

type Filter = 'all' | FileState | 'uncertainRead';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכול' }, { id: 'missingInFile', label: 'חסר בתיק' }, { id: 'partialInFile', label: 'חלקי בתיק' },
  { id: 'inFile', label: 'בתיק' }, { id: 'office', label: 'ממולא בהגשה' }, { id: 'notChecked', label: 'לא נבדק' }, { id: 'uncertainRead', label: 'קריאה לא ודאית' },
];
const FILE_ORDER: FileState[] = ['inFile', 'partialInFile', 'missingInFile', 'office', 'notChecked'];
const READ_ORDER: ReadState[] = ['mapped', 'catalogued', 'noInstruction', 'uncertain'];
const FILE_CLASS: Record<FileState, string> = { inFile: 'ready', partialInFile: 'verify', missingInFile: 'missing', office: 'notApplicable', notChecked: 'unknownApplicability' };

// ‼ ציר «ממולא בטיוטה» מוצג רק כשהדוח השנתי זמין באתר — אחרת הוא מתאר מסך שאין.
const draftFill = (e: { id: string; codes?: Record<string, string | null> | null }) => !AVAILABLE.annualReturn ? undefined :
  DRAFT_FILL_1301[e.id] ?? Object.values(e.codes ?? {}).map(c => (c ? DRAFT_FILL_1301[c] : undefined)).find(Boolean);

export default function FormCoverage() {
  const rows = useMemo(() => coverage1301(), []);
  const sum = useMemo(() => coverageSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>('missingInFile');
  const shown = rows.filter(r => filter === 'all' ? true : filter === 'uncertainRead' ? r.read === 'uncertain' : r.file === filter);
  const parts = CATALOG_PARTS_1301_2025.filter(p => shown.some(r => r.entry.part === p.part)).map(p => p.part);
  for (const r of shown) if (!parts.includes(r.entry.part)) parts.push(r.entry.part);

  return (
    <section className="kn-page" style={{ gap: 8 }} aria-labelledby="fs-coverage">
      <h2 id="fs-coverage" className="kn-area-title">מפת כיסוי — כל שדות הטופס ({sum.total})</h2>
      <p className="kn-small kn-muted" style={{ margin: 0 }}>
        כל שדה ותיבת סימון שנקראו מהטופס עצמו (גרסה מונגשת ורגילה) ומפרק ד במדריך. שני צירים נפרדים: מה נקרא ומופה — ומה כבר יש בתיק.
        «חלקי בתיק» הוא נקודת התחלה בלבד: מצב עדכני, שנה בלי תאריך או אומדן — צריך אימות לשנה.
      </p>
      <div className="kn-two">
        <div className="kn-box kn-small"><strong>קריאה</strong>{READ_ORDER.map(k => <div key={k}>{READ_LABEL[k]}: <strong>{sum.read[k] ?? 0}</strong></div>)}</div>
        {AVAILABLE.annualReturn
          ? <div className="kn-box kn-small"><strong>ממולא בטיוטת הדוח השנתי</strong><div>{rows.filter(r => draftFill(r.entry)).length} שדות · רק 2025</div><div className="kn-xs kn-muted">טיוטה אינה «מוכן להגשה»: פער פתוח חוסם אישור</div></div>
          : <div className="kn-box kn-small"><strong>מילוי הדוח במערכת</strong><div>{NOT_RELEASED}</div><div className="kn-xs kn-muted">המפה מראה מה נקרא ומה יש בתיק; המילוי — ביד</div></div>}
        <div className="kn-box kn-small"><strong>בתיק</strong>{FILE_ORDER.map(k => <div key={k}><span className={`kn-rd ${FILE_CLASS[k]}`}>{FILE_LABEL[k]}</span> <strong>{sum.file[k] ?? 0}</strong></div>)}</div>
      </div>

      <details className="kn-details">
        <summary>לפי חלק בטופס</summary>
        <div className="kn-tbl-wrap">
          <table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>חלק</th><th>שדות</th>{FILE_ORDER.map(k => <th key={k}>{FILE_LABEL[k]}</th>)}<th>מופה במלואו</th></tr></thead>
            <tbody>{[...new Set(rows.map(r => r.entry.part))].map(p => {
              const pr = rows.filter(r => r.entry.part === p);
              const title = CATALOG_PARTS_1301_2025.find(x => x.part === p)?.title ?? '';
              return <tr key={p}><td><strong>{p}</strong><div className="kn-xs kn-muted">{title}</div></td><td className="n">{pr.length}</td>{FILE_ORDER.map(k => <td key={k} className="n">{pr.filter(r => r.file === k).length || '—'}</td>)}<td className="n">{pr.filter(r => r.read === 'mapped').length || '—'}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </details>

      <label className="kn-field" htmlFor="fs-cov-filter" style={{ maxWidth: 320 }}>להציג
        <select id="fs-cov-filter" value={filter} onChange={e => setFilter(e.target.value as Filter)}>
          {FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <p className="kn-xs kn-muted" style={{ margin: 0 }} aria-live="polite">{shown.length} שדות</p>
      {parts.map(p => {
        const pr = shown.filter(r => r.entry.part === p);
        if (!pr.length) return null;
        return (
          <details key={p} className="kn-details">
            <summary>חלק {p} · {pr.length}</summary>
            <ul className="kn-rd-list">
              {pr.map(r => (
                <li key={r.entry.id}>
                  <span className={`kn-rd ${FILE_CLASS[r.file]}`}>{FILE_LABEL[r.file]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div><strong>{r.entry.label}</strong>{' '}<span className="kn-xs kn-muted" dir="ltr">{[r.entry.codes?.registered, r.entry.codes?.spouse].filter(Boolean).join('/') || (r.entry.section ? `סעיף ${r.entry.section}` : '')}</span></div>
                    {r.entry.instruction && <div className="kn-xs">{r.entry.instruction}</div>}
                    <div className="kn-xs kn-muted">{READ_LABEL[r.read]}{r.fileNote ? ` · ${r.fileNote}` : ''}{r.fileKeys.length ? ` · בכרטיס: ${r.fileKeys.join(', ')}` : ''}</div>
                    {draftFill(r.entry) && <div className="kn-xs">ממולא בטיוטת הדוח השנתי: {draftFill(r.entry)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <details className="kn-details">
        <summary>קריאות לא ודאיות והכרעות ({CATALOG_UNCERTAIN_NOTES.filter(n => n.startsWith('לא ודאי')).length} לא ודאי · {CATALOG_UNCERTAIN_NOTES.filter(n => n.startsWith('הוכרע')).length} הוכרעו)</summary>
        <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18 }}>{CATALOG_UNCERTAIN_NOTES.map(n => <li key={n}>{n}</li>)}</ul>
      </details>

      <h3 className="kn-small" style={{ margin: '6px 0 0' }}>נספחים שנקראו ({ANNEX_CATALOG_2025.length})</h3>
      <p className="kn-xs kn-muted" style={{ margin: 0 }}>שלוש שכבות נפרדות: <strong>קטלוג</strong> — השדות שהנספח שואל; <strong>מיפוי</strong> — המידע שהמשרד צריך לאסוף ולאן בתיק הוא שייך; <strong>יכולת מילוי</strong> — הפקת הנספח בפועל: אין עדיין לאף טופס מס הכנסה (שלב 4).</p>
      <div className="kn-tbl-wrap">
        <table className="kn-tbl kn-tbl-wide">
          <thead><tr><th>נספח</th><th>גרסה</th><th>קטלוג</th><th>מיפוי למידע</th><th>מזין ב-1301</th><th>יכולת מילוי</th></tr></thead>
          <tbody>{ANNEX_CATALOG_2025.map(a => {
            const link = ANNEX_FILE_LINKS[a.formId];
            return (
              <tr key={a.formId}>
                <td><strong>{a.formId}</strong> — {a.title}{a.requiredWhen && <div className="kn-xs kn-muted">כש: {a.requiredWhen}</div>}</td>
                <td className="kn-xs">{a.documentVersion ?? '—'}</td>
                <td className="kn-xs">{a.readStatus === 'read' ? 'נקרא' : a.readStatus === 'partlyRead' ? 'נקרא חלקית' : 'לא נמצא'} · {a.fields.length} שדות</td>
                <td className="kn-xs">{(() => { const info = ANNEX_INFO_2025.find(x => x.formId === a.formId); if (!info) return link ? link.note : '—'; const c = (k: FileState) => info.items.filter(i => i.fileState === k).length; return <>{info.items.length} פריטי מידע · חלקי {c('partialInFile')} · חסר {c('missingInFile')}</>; })()}</td>
                <td className="kn-xs">{(a.linksTo1301 ?? []).map(l => l.goesTo1301Code).join(' · ') || '—'}</td>
                <td className="kn-xs">אין (שלב 4)</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {ANNEX_INFO_2025.map(info => (
        <details key={info.formId} className="kn-details">
          <summary>מה לאסוף לנספח {info.formId} · {info.items.length} פריטים</summary>
          {info.repeatsNote && <p className="kn-xs kn-muted" style={{ margin: '0 0 6px' }}>{info.repeatsNote}</p>}
          <ul className="kn-rd-list">
            {info.items.map(i => (
              <li key={i.key}>
                <span className={`kn-rd ${FILE_CLASS[i.fileState]}`}>{FILE_LABEL[i.fileState]}</span>
                <div style={{ minWidth: 0 }}>
                  <div><strong>{i.label}</strong> <span className="kn-xs kn-muted">· {SOURCE_LABEL_HE[i.source]} · {PERIOD_LABEL[i.period] ?? i.period}</span></div>
                  {i.documents.length > 0 && <div className="kn-xs">מסמכים: {i.documents.join(', ')}</div>}
                  <div className="kn-xs kn-muted">{i.note}{i.fileKeys.length ? ` · בכרטיס: ${i.fileKeys.join(', ')}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <details className="kn-details">
        <summary>פערים בכרטיס לאיסוף הנספחים ({ANNEX_INFO_GAPS.length})</summary>
        <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18 }}>{ANNEX_INFO_GAPS.map(g => <li key={g}>{g}</li>)}</ul>
      </details>
      <p className="kn-xs kn-muted" style={{ margin: 0 }}>מילוי ושידור הדוח והנספחים — בשלב 4. האיסוף עצמו (שאלות ומסמכים לפי פריטי המידע) — בשלב 2.</p>
    </section>
  );
}
