// ─── טופס 1301 — לימוד הטופס עצמו (בקרה) ───────────────────────────────────
// ‼ ארבע שאלות, לפי הסדר: איזו גרסה ומה נקרא ממנה; מה השתנה מול הגרסה הקודמת;
// מה כל שדה ממופה אומר ומאיפה תבוא התשובה; ומה מצב לקוח מסוים מול השדות והנספחים.
// אין כאן מילוי טופס ואין כתיבה לתיק — רק תמונת מצב. התשובות השנתיות ייאספו
// בשלב 2, ולכן היום כל ערך מהכרטיס מסומן «לאמת לשנה».

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { FORM_VERSIONS, FIELDS_1301_2025, FIELDS_1301_2024, ANNEXES_1301_2025, FORM_NOTES_2025 } from '../taxForms/form1301';
import { diffFormVersions, fieldReadiness, annexReadiness, CHANGE_LABEL } from '../taxForms/engine';
import type { AnswerSource, FieldContext, ReadinessStatus, Tri } from '../taxForms/types';
import { SOURCES } from '../taxRules/sources';
import { BasisTag } from './RuleBits';
import FormCoverage from './FormCoverage';

const SOURCE_LABEL: Record<AnswerSource, string> = { fileFact: 'נתון בתיק', document: 'מסמך', client: 'תשובת הלקוח', calculation: 'חישוב', office: 'הכרעת המשרד' };
const KIND_LABEL = { amount: 'סכום', checkbox: 'תיבת סימון', text: 'טקסט', date: 'תאריך', count: 'מספר', choice: 'בחירה' } as const;
const STATUS_LABEL: Record<ReadinessStatus, string> = { ready: 'מוכן', verify: 'לאמת', missing: 'חסר', notApplicable: 'לא חל', unknownApplicability: 'לא ידוע אם חל' };
const WHO_LABEL = { client: 'מהלקוח', office: 'במשרד', document: 'מסמך' } as const;
const TRI_LABEL: Record<Tri, string> = { yes: 'נדרש', no: 'לא נדרש', unknown: 'לא ידוע' };

function contextOf(c: Client, taxYear: number): FieldContext {
  return { facts: c as unknown as Record<string, unknown>, fieldMeta: c.fieldMeta as FieldContext['fieldMeta'], taxYear };
}

export default function FormStudy({ clients, initialClientId, onOpenClient }: { clients: Client[]; initialClientId?: string | null; onOpenClient?: (id: string) => void }) {
  const v2025 = FORM_VERSIONS.find(v => v.id === '1301@2025')!;
  const changes = useMemo(() => diffFormVersions(FIELDS_1301_2024, FIELDS_1301_2025), []);
  const onlyNumbering = changes.length > 0 && changes.every(c => c.kind === 'sectionChanged' || c.kind === 'codeChanged');
  const [clientId, setClientId] = useState<string>(initialClientId ?? '');
  const client = clients.find(c => c.id === clientId);
  const ctx = client ? contextOf(client, 2025) : null;
  const rows = ctx ? FIELDS_1301_2025.map(f => ({ f, r: fieldReadiness(f, ctx, []) })) : [];
  const annexes = ctx ? annexReadiness(ANNEXES_1301_2025, ctx) : [];
  const counts = rows.reduce((a, { r }) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {} as Partial<Record<ReadinessStatus, number>>);

  return (
    <div className="kn-page">
      <section className="kn-box" aria-labelledby="fs-version">
        <h2 id="fs-version" className="kn-area-title" style={{ margin: 0 }}>{v2025.title}</h2>
        <div className="kn-meta-row kn-small">
          <span>שנת המס בדוח: <strong>{v2025.refersToTaxYear}</strong></span>
          <span>גרסה: {v2025.documentVersion}</span>
          <span>מחליף: {FORM_VERSIONS.find(v => v.id === v2025.supersedes)?.title ?? '—'} (נשמר)</span>
          <span className={`kn-read ${v2025.readStatus}`}>{v2025.readStatus === 'read' ? 'נקרא במלואו' : v2025.readStatus === 'partlyRead' ? 'נקרא חלקית' : 'לא נקרא'}</span>
        </div>
        <p className="kn-small" style={{ margin: 0 }}>{v2025.readScope}</p>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>
          שנת המס, מועד הפרסום, מועד התחולה והגרסה נרשמים בנפרד. הטופס לשנת 2026 יתפרסם ב-2027 וישויך ל-2026 — הוא ברשימת «פרסומים שעוד לא נמצאו» בדף התחזוקה.
        </p>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="fs-changes">
        <h2 id="fs-changes" className="kn-area-title">מה השתנה מול 2024</h2>
        <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FORM_NOTES_2025.map(n => <li key={n.text}>{n.text} <BasisTag basis={n.basis} /></li>)}
        </ul>
        <div className="kn-box kn-small">
          <strong>בשדות הממופים: </strong>
          {onlyNumbering
            ? <>{changes.length} שינויים — כולם מספור בלבד ({[...new Set(changes.map(c => CHANGE_LABEL[c.kind]))].join(', ')}). המשמעות והקודים זהים: מעדכנים מיפוי, לא פונים ללקוחות ולא מבקשים שוב תשובות.</>
            : <>{changes.length} שינויים, מהם מהותיים — כל תיק שענה על השדה יקבל בקשה ממוקדת לבדיקה, והתשובה הקודמת תישמר.</>}
          <details className="kn-details" style={{ marginTop: 6 }}>
            <summary>הפירוט</summary>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{changes.map(c => <li key={c.fieldKey + c.kind}>{c.label}: {CHANGE_LABEL[c.kind]} — {c.before} ← {c.after}</li>)}</ul>
          </details>
        </div>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="fs-fields">
        <h2 id="fs-fields" className="kn-area-title">שדות שמופו במלואם ({FIELDS_1301_2025.length})</h2>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>לכל שדה: מה הוא אומר, מתי הוא חל (תנאי מול התיק), מאיפה תבוא התשובה ואיך בודקים את המילוי — ומהם נגזרת «מוכנות לקוח» למטה. שאר השדות נמצאים במפת הכיסוי, עם ההוראה מהמדריך ונקודת ההתחלה בתיק.</p>
        <details className="kn-details">
          <summary>כל השדות הממופים</summary>
          <div className="kn-tbl-wrap">
            <table className="kn-tbl kn-tbl-wide">
              <thead><tr><th>סעיף</th><th>קוד</th><th>שדה</th><th>משמעות ומתי חל</th><th>מקור התשובה</th><th>בדיקת המילוי</th><th>ביסוס</th></tr></thead>
              <tbody>{FIELDS_1301_2025.map(f => (
                <tr key={f.key}>
                  <td className="n">{f.section}</td>
                  <td className="n" dir="ltr">{[f.codes.registered, f.codes.spouse].filter(Boolean).join(' / ')}</td>
                  <td>{f.label}<div className="kn-xs kn-muted">{KIND_LABEL[f.kind]}</div></td>
                  <td className="kn-small">{f.meaning}<div className="kn-xs kn-muted">חל כש: {f.relevantWhen}</div>{f.emptyMeaning && <div className="kn-xs" style={{ color: 'var(--warn)' }}>{f.emptyMeaning}</div>}</td>
                  <td className="kn-small">{f.sources.map(s => SOURCE_LABEL[s]).join(' · ')}{f.evidence?.length ? <div className="kn-xs kn-muted">{f.evidence.join(' · ')}</div> : null}{f.fact && <div className="kn-xs kn-muted">בתיק: {f.fact.label} ({f.fact.scope === 'current' ? 'מצב עדכני' : 'לפי שנה'})</div>}</td>
                  <td className="kn-small">{f.fillCheck}</td>
                  <td><BasisTag basis={f.basis} /><div className="kn-xs kn-muted">{SOURCES[f.sourceId]?.label}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </section>

      <FormCoverage />

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="fs-client">
        <h2 id="fs-client" className="kn-area-title">מוכנות לקוח לדוח 2025</h2>
        <label className="kn-field" htmlFor="fs-client-pick" style={{ maxWidth: 360 }}>לקוח
          <select id="fs-client-pick" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">בחרו לקוח…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.id}</option>)}
          </select>
        </label>
        {!client && <p className="kn-small kn-muted" style={{ margin: 0 }}>בחרו לקוח כדי לראות, לכל שדה ממופה ולכל נספח, מה כבר ידוע בתיק, מה צריך לאמת ומה לבקש — בלי לנחש תשובות.</p>}
        {client && (
          <>
            <div className="kn-row kn-small" aria-live="polite">
              {(Object.keys(STATUS_LABEL) as ReadinessStatus[]).filter(s => counts[s]).map(s => <span key={s} className={`kn-rd ${s}`}>{STATUS_LABEL[s]}: {counts[s]}</span>)}
              {onOpenClient && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenClient(client.id)}>לתיק המס</button>}
            </div>
            <p className="kn-xs kn-muted" style={{ margin: 0 }}>הכרטיס מחזיק מצב עדכני, לא תשובות לשנת 2025 — לכן ערך מהכרטיס מסומן «לאמת». «לא»/0 בלי מקור מתועד נחשבים «לא ידוע». תשובות שנתיות ייאספו בשלב 2.</p>
            <ul className="kn-rd-list">
              {rows.map(({ f, r }) => (
                <li key={f.key}>
                  <span className={`kn-rd ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div><strong>{f.label}</strong> <span className="kn-xs kn-muted" dir="ltr">{[f.codes.registered, f.codes.spouse].filter(Boolean).join('/')}</span></div>
                    <div className="kn-small">{r.reason}</div>
                    {r.ask && r.status !== 'ready' && r.status !== 'notApplicable' && <div className="kn-xs kn-muted">לבקש {WHO_LABEL[r.ask.who]}: {r.ask.what}</div>}
                  </div>
                </li>
              ))}
            </ul>
            <h3 className="kn-small" style={{ margin: '6px 0 0' }}>נספחים</h3>
            <ul className="kn-rd-list">
              {annexes.map(({ rule, required }) => (
                <li key={rule.formId}>
                  <span className={`kn-rd ${required === 'yes' ? 'missing' : required === 'no' ? 'notApplicable' : 'unknownApplicability'}`}>{TRI_LABEL[required]}</span>
                  <div style={{ minWidth: 0 }}><strong>{rule.formId}</strong> — {rule.title}<div className="kn-xs kn-muted">כש: {rule.requiredWhen}</div></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
