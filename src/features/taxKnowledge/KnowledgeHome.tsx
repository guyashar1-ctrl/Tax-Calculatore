// ─── בית הנושאים ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { TOPICS, AREA_LABEL, type TopicArea } from './topics';
import { weakestBasis } from '../taxRules/registry';
import { BasisTag } from './RuleBits';
import './knowledge.css';

const AREAS: TopicArea[] = ['reports', 'savings', 'ni', 'advances', 'wealth', 'business'];

export default function KnowledgeHome({ year, onOpenTopic }: { year: number; onOpenTopic: (id: string) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    return TOPICS.filter(t => !words.length || words.some(w => (t.title + ' ' + t.lead + ' ' + AREA_LABEL[t.area]).includes(w)));
  }, [q]);
  return (
    <div className="kn-page">
      <p className="kn-lead">נושא נלמד בשכבות: בשורה אחת, איך זה עובד, המחשה, דוגמה, המקרה המשולב, חריגים ומה עושים בתיק. בראש כל נושא — מה עוד לא סגור בו.</p>
      <label className="kn-field" htmlFor="kn-q">חיפוש בנושאים
        <input id="kn-q" className="kn-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="למשל: קרן השתלמות שכיר" />
      </label>
      {AREAS.map(a => {
        const list = shown.filter(t => t.area === a);
        if (!list.length) return null;
        return (
          <section key={a} className="kn-area" aria-label={AREA_LABEL[a]}>
            <h2 className="kn-area-title">{AREA_LABEL[a]}</h2>
            <div className="kn-cards">
              {list.map(t => (
                <button key={t.id} type="button" className="kn-card" onClick={() => onOpenTopic(t.id)}>
                  <span className="kn-row" style={{ justifyContent: 'space-between' }}>
                    <span className={`kn-status ${t.status}`}>{t.status === 'usable' ? 'שמיש · עם פערים' : 'מחקר פתוח'}</span>
                    <BasisTag basis={weakestBasis(t.ruleIds, year)} />
                  </span>
                  <span className="kn-card-title">{t.title}</span>
                  <span className="kn-small kn-muted">{t.lead}</span>
                  <span className="kn-xs kn-muted">{t.gaps.length} פערים פתוחים</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!shown.length && <p className="kn-muted">לא נמצא נושא. נסו מילה אחרת, או חפשו בכלים (הוצאות מוכרות, ניהול ספרים).</p>}
      <p className="kn-xs kn-muted">התג מראה את הביסוס החלש ביותר בין כללי הנושא לשנת {year}. אין תג «אומת» לכל המאגר.</p>
    </div>
  );
}
