import { useState } from 'react';
import {
  ExpenseTopic,
  INCOME_TAX_VERDICT_META,
  VAT_VERDICT_META,
  RISK_META,
  CONFIDENCE_META,
} from './types';

interface SectionProps {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ icon, title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem',
          padding: '.75rem 1.1rem', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '1.05rem' }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: '.95rem' }}>{title}</span>
        <span style={{ color: 'var(--gray-400)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: '.8rem' }}>▼</span>
      </div>
      {open && (
        <div className="card-body" style={{ borderTop: '1px solid var(--gray-100)', fontSize: '.875rem', lineHeight: 1.7 }}>
          {children}
        </div>
      )}
    </div>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul style={{ paddingRight: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
    {items.map((s, i) => <li key={i}>{s}</li>)}
  </ul>
);

interface Props {
  topic: ExpenseTopic;
  onBack: () => void;
}

export default function ExpenseDetail({ topic, onBack }: Props) {
  const it = INCOME_TAX_VERDICT_META[topic.incomeTax.verdict];
  const vat = VAT_VERDICT_META[topic.vat.verdict];
  const risk = RISK_META[topic.riskLevel];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
      {/* כותרת */}
      <div className="card" style={{ borderRight: `4px solid ${risk.color}` }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.9rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '2rem' }}>{topic.icon}</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{topic.title}</h2>
                <span style={{ fontSize: '.75rem', fontWeight: 700, color: risk.color }}>
                  {risk.icon} {risk.label}
                </span>
              </div>
              <p style={{ fontSize: '.9rem', color: 'var(--gray-600)', margin: '.35rem 0 0', lineHeight: 1.6 }}>
                {topic.summary}
              </p>
              {topic.riskNote && (
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.3rem' }}>{topic.riskNote}</div>
              )}
              {topic.confidence && (
                <div style={{
                  display: 'inline-block', marginTop: '.45rem', padding: '.25rem .7rem', borderRadius: 8,
                  background: CONFIDENCE_META[topic.confidence.level].bg,
                  color: CONFIDENCE_META[topic.confidence.level].color,
                  fontSize: '.78rem', fontWeight: 600,
                }}>
                  🎯 {CONFIDENCE_META[topic.confidence.level].label}
                  {topic.confidence.level !== 'high' && <> — {topic.confidence.reason}</>}
                </div>
              )}
            </div>
            <button className="btn btn-secondary" onClick={onBack} style={{ whiteSpace: 'nowrap' }}>→ לכל ההוצאות</button>
          </div>

          {/* פס ורדיקטים */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.6rem', marginTop: '.9rem' }}>
            <div style={{ background: it.bg, borderRadius: 8, padding: '.6rem .8rem' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>מס הכנסה</div>
              <div style={{ fontWeight: 800, color: it.color }}>{it.label} · {topic.incomeTax.shortLabel}</div>
            </div>
            <div style={{ background: vat.bg, borderRadius: 8, padding: '.6rem .8rem' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>מע"מ (תשומות)</div>
              <div style={{ fontWeight: 800, color: vat.color }}>{vat.label} · {topic.vat.shortLabel}</div>
            </div>
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '.6rem .8rem' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>מקור מרכזי</div>
              <div style={{ fontWeight: 700, fontSize: '.85rem' }}>{topic.mainSource}</div>
            </div>
          </div>
        </div>
      </div>

      {/* מה להגיד ללקוח — תמיד פתוח וראשון, זה מה ששולפים בשיחה */}
      <div className="card" style={{ border: '2px solid var(--blue-border)' }}>
        <div className="card-header" style={{ background: 'var(--blue-light)' }}>
          <span className="card-title" style={{ color: 'var(--blue-dark)' }}>💬 מה להגיד ללקוח</span>
        </div>
        <div className="card-body" style={{ fontSize: '.95rem', lineHeight: 1.8, fontWeight: 500 }}>
          {topic.clientAnswer}
        </div>
      </div>

      <Section icon="🏛️" title="מס הכנסה — הדין המלא" defaultOpen>
        <Bullets items={topic.incomeTax.detail} />
      </Section>

      <Section icon="🧾" title='מע"מ — קיזוז תשומות' defaultOpen>
        {topic.vat.legalBasis && (
          <div style={{
            background: 'var(--gray-50)', borderRadius: 8, padding: '.45rem .8rem',
            marginBottom: '.6rem', fontSize: '.8rem',
          }}>
            <span style={{ fontWeight: 700 }}>בסיס חוקי: </span>{topic.vat.legalBasis}
          </div>
        )}
        <Bullets items={topic.vat.detail} />
        {(topic.vat.exceptions?.length ?? 0) > 0 && (
          <div style={{ marginTop: '.6rem' }}>
            <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#1d4ed8', marginBottom: '.25rem' }}>↪ חריגים</div>
            <Bullets items={topic.vat.exceptions!} />
          </div>
        )}
        {(topic.vat.mistakes?.length ?? 0) > 0 && (
          <div style={{ marginTop: '.6rem' }}>
            <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#b91c1c', marginBottom: '.25rem' }}>✗ טעויות קיזוז נפוצות</div>
            <Bullets items={topic.vat.mistakes!} />
          </div>
        )}
      </Section>

      {topic.clientQuestions.length > 0 && (
        <Section icon="❓" title="שאלות שלקוחות שואלים" defaultOpen>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {topic.clientQuestions.map((q, i) => (
              <div key={i} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '.5rem .8rem' }}>{q}</div>
            ))}
          </div>
        </Section>
      )}

      {topic.examples.length > 0 && (
        <Section icon="🧮" title="דוגמאות מהחיים">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {topic.examples.map((ex, i) => (
              <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ background: 'var(--gray-50)', padding: '.5rem .8rem', fontWeight: 600 }}>{ex.scenario}</div>
                <div style={{ padding: '.5rem .8rem' }}>{ex.answer}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon="📜" title="מקורות משפטיים">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {topic.legalSources.map((s, i) => (
            <div key={i}>
              <span style={{ fontWeight: 700 }}>{s.name}</span>
              {s.ref && <span style={{ color: 'var(--gray-500)' }}> · {s.ref}</span>}
              <div style={{ fontSize: '.83rem', color: 'var(--gray-600)' }}>{s.gist}</div>
            </div>
          ))}
        </div>
      </Section>

      {topic.caseLaw.length > 0 && (
        <Section icon="⚖️" title="פסיקה שחשוב להכיר">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {topic.caseLaw.map((c, i) => (
              <div key={i} style={{ borderRight: '3px solid #6d28d9', paddingRight: '.75rem' }}>
                <div style={{ fontWeight: 700 }}>{c.name}{c.year ? ` (${c.year})` : ''}</div>
                <div style={{ fontSize: '.83rem', margin: '.25rem 0' }}>{c.summary}</div>
                <div style={{ fontSize: '.8rem' }}>
                  <span style={{ fontWeight: 600, color: '#6d28d9' }}>למה זה חשוב: </span>{c.whyItMatters}
                </div>
                <div style={{ fontSize: '.8rem' }}>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>בפרקטיקה: </span>{c.practicalImplication}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {topic.circulars.length > 0 && (
        <Section icon="📋" title="חוזרים והוראות ביצוע" defaultOpen>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {topic.circulars.map((c, i) => (
              <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ background: 'var(--gray-50)', padding: '.5rem .8rem', display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  {c.number && <span className="badge badge-blue" style={{ fontSize: '.68rem' }}>{c.number}</span>}
                </div>
                <div style={{ padding: '.5rem .8rem', fontSize: '.83rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                  {c.summary && <div>{c.summary}</div>}
                  <div><span style={{ fontWeight: 600, color: '#6d28d9' }}>מה השתנה: </span>{c.whatChanged}</div>
                  {c.whyItMatters && <div><span style={{ fontWeight: 600, color: '#1d4ed8' }}>למה חשוב: </span>{c.whyItMatters}</div>}
                  {c.whenToApply && <div><span style={{ fontWeight: 600, color: '#15803d' }}>מתי מיישמים: </span>{c.whenToApply}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {topic.commonMistakes.length > 0 && (
        <Section icon="🚫" title="טעויות נפוצות">
          <Bullets items={topic.commonMistakes} />
        </Section>
      )}

      {topic.warnings.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>⚠ שים לב</div>
          <Bullets items={topic.warnings} />
        </div>
      )}

      <div style={{ fontSize: '.72rem', color: 'var(--gray-400)' }}>
        מילות חיפוש: {topic.keywords.join(' · ')}
      </div>
    </div>
  );
}
