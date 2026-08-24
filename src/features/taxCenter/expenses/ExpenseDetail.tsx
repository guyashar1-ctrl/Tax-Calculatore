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
    <div className="ed-section">
      <button className="ed-section-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ed-section-icon">{icon}</span>
        <span className="ed-section-title">{title}</span>
        <span className={`ed-section-caret ${open ? 'is-open' : ''}`}>▾</span>
      </button>
      {open && <div className="ed-section-body">{children}</div>}
    </div>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="ed-bullets">
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
  const conf = topic.confidence ? CONFIDENCE_META[topic.confidence.level] : null;

  return (
    <div className="ed-page">
      {/* ── זהות הנושא ─────────────────────────────────────────────────────── */}
      <header className="ed-head">
        <div className="ed-head-main">
          <div className="ed-title-row">
            <span className="ed-emoji">{topic.icon}</span>
            <h2 className="ed-title">{topic.title}</h2>
            <span className={`ed-risk tone-${risk.tone}`}>{risk.label}</span>
          </div>
          <p className="ed-summary">{topic.summary}</p>
          {topic.riskNote && <div className="ed-meta">{topic.riskNote}</div>}
          {conf && (
            <div className={`ed-meta tone-${conf.tone}`}>
              {conf.label}
              {topic.confidence!.level !== 'high' && <> - {topic.confidence!.reason}</>}
            </div>
          )}
        </div>
        <button className="btn btn-secondary" onClick={onBack}>→ לכל ההוצאות</button>
      </header>

      {/* ── שלושת הפסקים: המידע שנשלף בשיחה עם לקוח ────────────────────────── */}
      <div className="ed-verdicts">
        <div className="ed-verdict">
          <div className="ed-verdict-label">מס הכנסה</div>
          <div className={`ed-verdict-value tone-${it.tone}`}>{it.label}</div>
          <div className="ed-verdict-note">{topic.incomeTax.shortLabel}</div>
        </div>
        <div className="ed-verdict">
          <div className="ed-verdict-label">מע"מ (תשומות)</div>
          <div className={`ed-verdict-value tone-${vat.tone}`}>{vat.label}</div>
          <div className="ed-verdict-note">{topic.vat.shortLabel}</div>
        </div>
        <div className="ed-verdict">
          <div className="ed-verdict-label">מקור מרכזי</div>
          <div className="ed-verdict-value tone-na">{topic.mainSource}</div>
        </div>
      </div>

      {/* מה להגיד ללקוח — הדבר היחיד שנשלף באמצע שיחה, ולכן הוא הבולט במסך */}
      <section className="ed-say">
        <div className="ed-say-label">מה להגיד ללקוח</div>
        <p className="ed-say-text">{topic.clientAnswer}</p>
      </section>

      <Section icon="🏛️" title="מס הכנסה - הדין המלא" defaultOpen>
        <Bullets items={topic.incomeTax.detail} />
      </Section>

      <Section icon="🧾" title='מע"מ - קיזוז תשומות' defaultOpen>
        {topic.vat.legalBasis && (
          <div className="ed-basis"><span className="ed-lead">בסיס חוקי: </span>{topic.vat.legalBasis}</div>
        )}
        <Bullets items={topic.vat.detail} />
        {(topic.vat.exceptions?.length ?? 0) > 0 && (
          <div className="ed-sub">
            <div className="ed-sub-title">↪ חריגים</div>
            <Bullets items={topic.vat.exceptions!} />
          </div>
        )}
        {(topic.vat.mistakes?.length ?? 0) > 0 && (
          <div className="ed-sub">
            <div className="ed-sub-title is-danger">טעויות קיזוז נפוצות</div>
            <Bullets items={topic.vat.mistakes!} />
          </div>
        )}
      </Section>

      {topic.clientQuestions.length > 0 && (
        <Section icon="❓" title="שאלות שלקוחות שואלים" defaultOpen>
          <ul className="ed-questions">
            {topic.clientQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </Section>
      )}

      {topic.examples.length > 0 && (
        <Section icon="🧮" title="דוגמאות מהחיים">
          <div className="ed-list">
            {topic.examples.map((ex, i) => (
              <div key={i} className="ed-item">
                <div className="ed-item-head">{ex.scenario}</div>
                <div className="ed-item-body">{ex.answer}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon="📜" title="מקורות משפטיים">
        <div className="ed-list">
          {topic.legalSources.map((s, i) => (
            <div key={i} className="ed-item">
              <div className="ed-item-head">
                {s.name}{s.ref && <span className="ed-ref"> · {s.ref}</span>}
              </div>
              <div className="ed-item-body">{s.gist}</div>
            </div>
          ))}
        </div>
      </Section>

      {topic.caseLaw.length > 0 && (
        <Section icon="⚖️" title="פסיקה שחשוב להכיר">
          <div className="ed-list">
            {topic.caseLaw.map((c, i) => (
              <div key={i} className="ed-item">
                <div className="ed-item-head">{c.name}{c.year ? ` (${c.year})` : ''}</div>
                <div className="ed-item-body">{c.summary}</div>
                <div className="ed-item-body"><span className="ed-lead">למה זה חשוב: </span>{c.whyItMatters}</div>
                <div className="ed-item-body"><span className="ed-lead">בפרקטיקה: </span>{c.practicalImplication}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {topic.circulars.length > 0 && (
        <Section icon="📋" title="חוזרים והוראות ביצוע" defaultOpen>
          <div className="ed-list">
            {topic.circulars.map((c, i) => (
              <div key={i} className="ed-item">
                <div className="ed-item-head">
                  {c.name}{c.number && <span className="ed-ref"> · {c.number}</span>}
                </div>
                {c.summary && <div className="ed-item-body">{c.summary}</div>}
                <div className="ed-item-body"><span className="ed-lead">מה השתנה: </span>{c.whatChanged}</div>
                {c.whyItMatters && <div className="ed-item-body"><span className="ed-lead">למה חשוב: </span>{c.whyItMatters}</div>}
                {c.whenToApply && <div className="ed-item-body"><span className="ed-lead">מתי מיישמים: </span>{c.whenToApply}</div>}
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
        <div className="alert alert-warning">
          <div className="ed-warn-title">שים לב</div>
          <Bullets items={topic.warnings} />
        </div>
      )}

      <div className="ed-keywords">מילות חיפוש: {topic.keywords.join(' · ')}</div>
    </div>
  );
}
