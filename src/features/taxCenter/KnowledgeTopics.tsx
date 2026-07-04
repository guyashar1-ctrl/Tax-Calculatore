import { useState } from 'react';
import { KNOWLEDGE_TOPICS } from '../../data/taxKnowledge';

interface Props {
  year: number;
}

export default function KnowledgeTopics({ year }: Props) {
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
      <div className="alert alert-info" style={{ marginBottom: 0, fontSize: '.85rem' }}>
        ערכי עזר מקצועיים לפי נושא, עם מקור לכל ערך. תג <span className="badge badge-gray">🧊 מוקפא</span> = הוקפא במסגרת הקפאת ההצמדה 2025–2027 ·
        תג <span className="badge badge-orange">⚠ לאימות</span> = לא אומת מול מסמך רשמי ראשוני.
      </div>

      {KNOWLEDGE_TOPICS.map(topic => {
        const open = openTopic === topic.id;
        return (
          <div key={topic.id} className="card">
            <div
              onClick={() => setOpenTopic(open ? null : topic.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.9rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: '1.4rem' }}>{topic.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{topic.title}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>{topic.subtitle}</div>
              </div>
              <span style={{ color: 'var(--gray-400)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▼</span>
            </div>
            {open && (
              <div className="card-body" style={{ borderTop: '1px solid var(--gray-100)' }}>
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                        <th style={{ padding: '.5rem .8rem', textAlign: 'right' }}>פריט</th>
                        <th style={{ padding: '.5rem .8rem', textAlign: 'right', color: year === 2025 ? 'var(--blue-dark)' : undefined }}>2025</th>
                        <th style={{ padding: '.5rem .8rem', textAlign: 'right', color: year === 2026 ? 'var(--blue-dark)' : undefined }}>2026</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topic.values.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '.45rem .8rem' }}>
                            <div style={{ fontWeight: 600 }}>
                              {v.label}
                              {v.frozen && <span className="badge badge-gray" style={{ fontSize: '.62rem', marginRight: '.35rem' }}>🧊 מוקפא</span>}
                              {v.needsReview && <span className="badge badge-orange" style={{ fontSize: '.62rem', marginRight: '.35rem' }}>⚠ לאימות</span>}
                            </div>
                            {(v.note || v.legalBasis) && (
                              <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>
                                {v.legalBasis}{v.legalBasis && v.note ? ' · ' : ''}{v.note}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '.45rem .8rem', fontWeight: year === 2025 ? 700 : 400 }}>{v.value2025}</td>
                          <td style={{ padding: '.45rem .8rem', fontWeight: year === 2026 ? 700 : 400 }}>{v.value2026}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {topic.insights && topic.insights.length > 0 && (
                  <div style={{ marginTop: '.75rem', background: 'var(--blue-light)', borderRadius: 8, padding: '.6rem .9rem', fontSize: '.8rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '.3rem' }}>💡 תובנות עבודה</div>
                    <ul style={{ paddingRight: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                      {topic.insights.map((ins, i) => <li key={i}>{ins}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ marginTop: '.6rem', fontSize: '.72rem', color: 'var(--gray-500)' }}>
                  מקורות: {topic.sources.map((s, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{s.label}</a>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
