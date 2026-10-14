// ─── טופס 1301 · בקרה: לימוד הטופס (FormStudy) וכיסוי לפי חלקים ─────────────────
// ‼ בקרה והעמקה, לא ניווט: לכל חלק בדוח — אילו נושאים מסבירים אותו, ומה הפער.

import type { Client } from '../../types';
import { TOPICS } from './topics';
import FormStudy from './FormStudy';
import './knowledge.css';

const PARTS: { part: string; title: string; covered: string; gap?: string }[] = [
  { part: 'א', title: 'פרטים כלליים והצהרות פתיחה', covered: 'שאלון שנתי: חישוב נפרד, נכסים בחו״ל, מטבע וירטואלי', gap: 'עסק זעיר — נושא מחקר; לא בשאלון השנתי' },
  { part: 'ג', title: 'הכנסות מיגיעה אישית', covered: 'עסק, משכורת, תקבולי ב״ל, מענקים וקצבאות' },
  { part: 'ה', title: 'הכנסות בשיעורים מיוחדים', covered: 'ריבית, דיבידנד, שכ״ד 10%', gap: 'משיכות שלא כדין מקופות (35%) — חסר' },
  { part: 'ח', title: 'רווח הון ושבח', covered: 'ני״ע, מקרקעין' },
  { part: 'ט', title: 'הכנסות חו״ל', covered: 'לפי מדינה ומס זר' },
  { part: 'יא', title: 'פרטים נוספים ויתרות להעברה', covered: 'הפסדים, משיכות בעלי שליטה, 62א' },
  { part: 'יב', title: 'ניכויים אישיים', covered: 'קרן השתלמות (51, 52), פנסיה כעמית עצמאי (53), אכ״ע, ב״ל (54)', gap: 'גיל 50 עם משכורת, ועמית מוטב שבוחר מסלול א׳ — מוסברים, לא מחושבים' },
  { part: 'יג', title: 'נקודות זיכוי', covered: 'ילדים, תואר, חייל משוחרר, יישוב מזכה' },
  { part: 'יד', title: 'זיכויים אישיים', covered: 'ביטוח חיים, קצבה כעמית שכיר/עצמאי (75, 76), תרומות' },
  { part: 'טו', title: 'מחזור למקדמות, ניכויים, שבח', covered: 'מקדמות מ-134 (ראש תיק)', gap: 'טבלת התקופות ב-134 ו-ESNA — לא נקראות עדיין' },
];

export default function Map1301({ onOpenTopic, clients = [], contextClientId, onOpenClient }: { onOpenTopic: (id: string) => void; clients?: Client[]; contextClientId?: string | null; onOpenClient?: (id: string) => void }) {
  return (
    <div className="kn-page">
      <FormStudy clients={clients} initialClientId={contextClientId} onOpenClient={onOpenClient} />
      <h2 className="kn-area-title" style={{ marginTop: 8 }}>כיסוי לפי חלקים בדוח</h2>
      <p className="kn-lead">לכל חלק ב-1301 לשנת 2025 — אילו נושאים מסבירים אותו ומה הפער. הניווט הרגיל הוא דרך הנושאים.</p>
      <div className="kn-tbl-wrap">
        <table className="kn-tbl kn-tbl-wide">
          <thead><tr><th>חלק</th><th>נושא בדוח</th><th>מה מכוסה</th><th>פער</th><th>להעמקה</th></tr></thead>
          <tbody>
            {PARTS.map(p => {
              const topics = TOPICS.filter(t => t.form1301.some(f => f.part === p.part));
              return (
                <tr key={p.part}>
                  <td style={{ fontWeight: 700, color: 'var(--br)' }}>{p.part}</td>
                  <td>{p.title}</td>
                  <td className="kn-small">{p.covered}</td>
                  <td className="kn-small" style={{ color: p.gap ? 'var(--warn)' : undefined }}>{p.gap ?? '—'}</td>
                  <td>{topics.map(t => <button key={t.id} type="button" className="btn btn-secondary btn-sm" style={{ margin: 2 }} onClick={() => onOpenTopic(t.id)}>{t.title}</button>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="kn-box">
        <strong className="kn-small">מחוץ לדוח השנתי</strong>
        <div className="kn-row">
          {TOPICS.filter(t => t.outside1301).map(t => <button key={t.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTopic(t.id)}>{t.title}</button>)}
        </div>
      </div>
    </div>
  );
}
