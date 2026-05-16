// ─── מסך פלט: Checklist + נספחים + מיפוי 1301 + חישוב מס שקוף ──────────────

import { useMemo, useState } from 'react';
import type { AnnualReportSession, MappedField, QuestionPreviewClient } from './types';
import { buildRequiredDocs, buildRequiredAttachments, mapModelToForm1301, computeTransparentTax } from './engine';
import { SECTION_LABELS } from './form1301Fields';
import { collectMissingClientFields, type MissingClientField } from './tree';

interface Props {
  session: AnnualReportSession;
  clientName: string;
  client?: QuestionPreviewClient | null;
  onBackToQuestionnaire: () => void;
  onOpenAnswersReview: () => void;
  onMarkDone: () => Promise<void>;
  onRestart: () => Promise<void>;
}

export default function AnnualReportOutput({ session, clientName, client, onBackToQuestionnaire, onOpenAnswersReview, onMarkDone, onRestart }: Props) {
  const isFinished = session.currentQuestionId === null;
  const missingClientFields = useMemo(
    () => collectMissingClientFields(client ?? undefined, session.model),
    [client, session.model],
  );
  const docs = useMemo(() => buildRequiredDocs(session.model, client ?? undefined), [session.model, client]);
  const attachments = useMemo(() => buildRequiredAttachments(session.model), [session.model]);
  const mapped = useMemo(() => mapModelToForm1301(session.model), [session.model]);
  const tax = useMemo(() => computeTransparentTax(session.model), [session.model]);

  const grouped = useMemo(() => {
    const m = new Map<MappedField['section'], MappedField[]>();
    for (const f of mapped) {
      if (!m.has(f.section)) m.set(f.section, []);
      m.get(f.section)!.push(f);
    }
    return m;
  }, [mapped]);

  const [activeTab, setActiveTab] = useState<'summary' | 'checklist' | 'mapping' | 'tax'>('summary');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>📋 תוצאות תהליך — {clientName}, שנת {session.taxYear}</h2>
          <p style={{ margin: '.3rem 0 0', color: 'var(--gray-600)', fontSize: '.9rem' }}>
            סטטוס: <strong>{statusLabel(session.status)}</strong> · עודכן: {new Date(session.updatedAt).toLocaleString('he-IL')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-primary" onClick={onOpenAnswersReview}>✏ צפה / ערוך תשובות</button>
          {!isFinished && (
            <button className="btn btn-secondary" onClick={onBackToQuestionnaire}>המשך שאלון</button>
          )}
          <button className="btn btn-ghost" onClick={() => void onRestart()}>התחל מחדש</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'summary' as const, label: '📊 סיכום' },
          { id: 'checklist' as const, label: `📎 דרישות (${docs.length + missingClientFields.length})` },
          { id: 'mapping' as const, label: `🗺 מיפוי שדות 1301 (${mapped.length})` },
          { id: 'tax' as const, label: '💰 חישוב מס שקוף' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <SummaryView session={session} attachments={attachments} docs={docs} mapped={mapped} tax={tax} />
      )}
      {activeTab === 'checklist' && (
        <ChecklistView docs={docs} attachments={attachments} missingClientFields={missingClientFields} />
      )}
      {activeTab === 'mapping' && (
        <MappingView grouped={grouped} />
      )}
      {activeTab === 'tax' && (
        <TaxView tax={tax} />
      )}

      {session.status !== 'mapping_done' && (
        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button className="btn btn-primary btn-lg" onClick={() => void onMarkDone()}>
            ✓ סמן כתהליך מוכן
          </button>
        </div>
      )}
    </div>
  );
}

function statusLabel(s: AnnualReportSession['status']): string {
  switch (s) {
    case 'in_progress': return 'בעבודה';
    case 'review': return 'מוכן לבדיקה';
    case 'mapping_done': return '✓ מוכן להגשה';
    case 'archived': return 'בארכיון';
  }
}

// ─── תצוגות פנימיות ─────────────────────────────────────────────────────────

function SummaryView({ session, attachments, docs, mapped, tax }: {
  session: AnnualReportSession;
  attachments: Array<{ formNumber: string; name: string }>;
  docs: Array<{ name: string }>;
  mapped: MappedField[];
  tax: ReturnType<typeof computeTransparentTax>;
}) {
  const filledFields = mapped.filter((f) => f.value !== null).length;
  const m = session.model;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
      <SummaryCard title="פרופיל הלקוח">
        <ul style={{ margin: 0, paddingRight: '1rem', lineHeight: 1.8 }}>
          {m.identity.maritalStatus && <li>סטטוס: {humanMarital(m.identity.maritalStatus)}</li>}
          {m.identity.hasSpouse && <li>בן/בת זוג: {m.identity.spouseHasIncome ? 'עם הכנסה' : 'ללא הכנסה'}</li>}
          {m.identity.childrenCount !== undefined && <li>ילדים: {m.identity.childrenCount}{m.identity.childrenWithSpecialNeeds ? ' (אחד עם צרכים מיוחדים)' : ''}</li>}
          {m.identity.residencyType && <li>תושבות: {humanResidency(m.identity.residencyType)}</li>}
          {m.identity.livesInQualifyingSettlement && <li>ישוב מזכה ✓</li>}
        </ul>
      </SummaryCard>
      <SummaryCard title="מקורות הכנסה">
        {m.income.sources.length === 0 ? (
          <span style={{ color: 'var(--gray-500)' }}>לא נבחרו מקורות</span>
        ) : (
          <ul style={{ margin: 0, paddingRight: '1rem', lineHeight: 1.8 }}>
            {m.income.sources.map((s) => <li key={s}>{humanIncomeSource(s)}</li>)}
          </ul>
        )}
      </SummaryCard>
      <SummaryCard title="ניכויים שדווחו">
        <ul style={{ margin: 0, paddingRight: '1rem', lineHeight: 1.8 }}>
          {m.deductionsCredits.donationAmount ? <li>תרומות: {m.deductionsCredits.donationAmount.toLocaleString('he-IL')} ₪</li> : null}
          {m.deductionsCredits.lifeInsuranceAnnual ? <li>ביטוח חיים: {m.deductionsCredits.lifeInsuranceAnnual.toLocaleString('he-IL')} ₪</li> : null}
          {m.deductionsCredits.selfPensionDeposits ? <li>פנסיה עצמאית: {m.deductionsCredits.selfPensionDeposits.toLocaleString('he-IL')} ₪</li> : null}
          {!m.deductionsCredits.donationAmount && !m.deductionsCredits.lifeInsuranceAnnual && !m.deductionsCredits.selfPensionDeposits && (
            <span style={{ color: 'var(--gray-500)' }}>לא דווחו ניכויים</span>
          )}
        </ul>
      </SummaryCard>
      <SummaryCard title="מסמכים ונספחים">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--blue)' }}>{docs.length}</div>
        <div style={{ color: 'var(--gray-600)' }}>מסמכים נדרשים</div>
        <div style={{ marginTop: '.5rem', fontSize: '2rem', fontWeight: 700, color: 'var(--green)' }}>{attachments.length}</div>
        <div style={{ color: 'var(--gray-600)' }}>נספחים לטופס 1301</div>
      </SummaryCard>
      <SummaryCard title="שדות במיפוי 1301">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green)' }}>{filledFields} / {mapped.length}</div>
        <div style={{ color: 'var(--gray-600)' }}>שדות מולאו אוטומטית</div>
      </SummaryCard>
      <SummaryCard title="אומדן מס לתשלום">
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-800)' }}>{tax.netTax.toLocaleString('he-IL')} ₪</div>
        <div style={{ color: 'var(--gray-600)', fontSize: '.85rem', marginTop: '.3rem' }}>אומדן בלבד — לפני נתוני 106/867</div>
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-body">
        <div style={{ fontWeight: 600, marginBottom: '.5rem', color: 'var(--gray-700)' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ChecklistView({ docs, attachments, missingClientFields }: {
  docs: Array<{ code: string; name: string; reason: string }>;
  attachments: Array<{ formNumber: string; name: string; reason: string }>;
  missingClientFields: MissingClientField[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {missingClientFields.length > 0 && (
        <div className="card" style={{ borderRight: '4px solid #f59e0b' }}>
          <div className="card-header" style={{ background: '#fef3c7' }}>
            <h3 className="card-title">📇 פרטים להשלים בכרטיס הלקוח ({missingClientFields.length})</h3>
          </div>
          <div className="card-body">
            <p style={{ margin: '0 0 .75rem', fontSize: '.9rem', color: 'var(--gray-700)' }}>
              שדות שלא נמצאו בכרטיס הלקוח כשהוצגה השאלה הראשונה. כדאי להשלים אותם בכרטיס לפני הגשת הדוח.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {missingClientFields.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: '.75rem', padding: '.5rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ flex: '0 0 24px', color: '#f59e0b' }}>☐</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{f.label}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">📎 מסמכים נדרשים</h3></div>
          <div className="card-body">
            {docs.length === 0 ? (
              <p style={{ color: 'var(--gray-500)', margin: 0 }}>לא נדרשים מסמכים נוספים על פי תשובות השאלון.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {docs.map((d) => (
                  <li key={d.code} style={{ display: 'flex', gap: '.75rem', padding: '.6rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ flex: '0 0 24px', color: 'var(--blue)' }}>☐</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      <div style={{ fontSize: '.85rem', color: 'var(--gray-600)' }}>{d.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">📄 נספחים לטופס 1301</h3></div>
          <div className="card-body">
            {attachments.length === 0 ? (
              <p style={{ color: 'var(--gray-500)', margin: 0 }}>אין נספחים חובה — דוח רגיל מספיק.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {attachments.map((a, i) => (
                  <li key={i} style={{ display: 'flex', gap: '.75rem', padding: '.6rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ flex: '0 0 100px', color: 'var(--blue)', fontWeight: 600 }}>{a.formNumber}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: '.85rem', color: 'var(--gray-600)' }}>{a.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MappingView({ grouped }: { grouped: Map<MappedField['section'], MappedField[]> }) {
  const sections = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (sections.length === 0) {
    return <div className="empty-state"><div className="empty-state-title">אין שדות למיפוי עדיין</div></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <p style={{ background: 'var(--gray-50)', padding: '.75rem 1rem', borderRadius: 6, margin: 0, fontSize: '.9rem', color: 'var(--gray-700)' }}>
        כל שורה מציגה שדה מטופס 1301 הרשמי, הערך שיוזן בו, ומאיזה מקור הגיע הערך — לחיצה על "פרטים" תציג שרשרת המקור המלאה.
      </p>
      {sections.map(([section, fields]) => (
        <div className="card" key={section}>
          <div className="card-header">
            <h3 className="card-title">{SECTION_LABELS[section]}</h3>
          </div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                  <th style={{ padding: '.6rem', textAlign: 'right', width: 90 }}>מס' שדה</th>
                  <th style={{ padding: '.6rem', textAlign: 'right' }}>תיאור</th>
                  <th style={{ padding: '.6rem', textAlign: 'right' }}>ערך</th>
                  <th style={{ padding: '.6rem', textAlign: 'right' }}>מקור</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <FieldRow key={f.fieldNumber} field={f} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldRow({ field }: { field: MappedField }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
        <td style={{ padding: '.6rem', fontFamily: 'monospace', color: 'var(--blue)' }}>{field.fieldNumber}</td>
        <td style={{ padding: '.6rem' }}>
          {field.hebrewLabel}
          {field.legalReference && (
            <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{field.legalReference}</div>
          )}
        </td>
        <td style={{ padding: '.6rem', fontWeight: field.value ? 600 : 400 }}>
          {field.value ?? <span style={{ color: 'var(--gray-400)' }}>—</span>}
        </td>
        <td style={{ padding: '.6rem' }}>
          <span style={{
            fontSize: '.75rem',
            padding: '2px 8px',
            borderRadius: 999,
            background: traceBg(field.trace.kind),
            color: traceColor(field.trace.kind),
          }}>
            {traceLabel(field.trace.kind)}
          </span>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{ marginRight: 8, background: 'transparent', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '.85rem' }}
          >
            {open ? 'הסתר' : 'פרטים'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} style={{ padding: '0 .6rem .75rem' }}>
            <div style={{ background: 'var(--gray-50)', borderRight: '3px solid var(--blue)', padding: '.75rem 1rem', fontSize: '.85rem', color: 'var(--gray-700)' }}>
              <strong>{traceLabel(field.trace.kind)}:</strong> {field.trace.detail}
              {field.trace.questionIds && field.trace.questionIds.length > 0 && (
                <div style={{ marginTop: '.4rem', fontSize: '.8rem', color: 'var(--gray-500)' }}>
                  מבוסס על שאלות: {field.trace.questionIds.join(', ')}
                </div>
              )}
              {field.trace.formula && (
                <div style={{ marginTop: '.4rem', fontFamily: 'monospace', fontSize: '.8rem' }}>
                  נוסחה: {field.trace.formula}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TaxView({ tax }: { tax: ReturnType<typeof computeTransparentTax> }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">💰 חישוב מס שקוף — אומדן</h3>
      </div>
      <div className="card-body">
        <p style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '.6rem 1rem', margin: '0 0 1rem', fontSize: '.875rem' }}>
          ⚠ זהו אומדן בלבד המבוסס על תשובות השאלון. החישוב המלא יבוצע במחשבון המס לאחר העלאת טפסי 106/867 בפאזה הבאה.
        </p>

        {tax.warnings.length > 0 && (
          <ul style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '.6rem 1.5rem', margin: '0 0 1rem' }}>
            {tax.warnings.map((w, i) => <li key={i} style={{ color: '#b91c1c' }}>{w}</li>)}
          </ul>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {tax.steps.map((s, i) => {
              const isFinal = i === tax.steps.length - 1;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: isFinal ? 'var(--blue-light)' : 'transparent' }}>
                  <td style={{ padding: '.6rem' }}>{s.description}</td>
                  <td style={{ padding: '.6rem', textAlign: 'left', fontFamily: 'monospace', fontWeight: isFinal ? 700 : 400, fontSize: isFinal ? '1.1rem' : '1rem' }}>
                    {s.value.toLocaleString('he-IL')} ₪
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function humanMarital(s: string): string {
  return ({ single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', separated: 'פרוד/ה' } as Record<string, string>)[s] ?? s;
}
function humanResidency(s: string): string {
  return ({ resident: 'תושב/ת ישראל', new_immigrant: 'עולה חדש/ה', returning_resident: 'תושב/ת חוזר/ת' } as Record<string, string>)[s] ?? s;
}
function humanIncomeSource(s: string): string {
  return ({
    salary: 'שכר מעבודה', business: 'עסק / משלח יד', rental: 'שכר דירה', capital: 'רווחי הון',
    interest: 'ריבית', dividend: 'דיבידנד', pension: 'פנסיה / קצבה', foreign: 'הכנסה מחו"ל',
  } as Record<string, string>)[s] ?? s;
}
function traceLabel(k: string): string {
  return ({ questionnaire: 'מהשאלון', computed: 'חישוב', default: 'בהמתנה לפאזה הבאה', empty: 'ריק' } as Record<string, string>)[k] ?? k;
}
function traceColor(k: string): string {
  return ({ questionnaire: '#1e40af', computed: '#065f46', default: '#92400e', empty: '#6b7280' } as Record<string, string>)[k] ?? '#6b7280';
}
function traceBg(k: string): string {
  return ({ questionnaire: '#dbeafe', computed: '#d1fae5', default: '#fef3c7', empty: '#f3f4f6' } as Record<string, string>)[k] ?? '#f3f4f6';
}
