// ─── טופס 1301 · בקרה: לימוד הטופס (FormStudy) וכיסוי לפי חלקים ─────────────────
// ‼ בקרה: מה השתנה מול 2024, מפת הכיסוי ומוכנות לקוח (FormStudy), ונושאים שמחוץ לדוח.

import type { Client } from '../../types';
import { TOPICS } from './topics';
import FormStudy from './FormStudy';
import './knowledge.css';

export default function Map1301({ onOpenTopic, clients = [], contextClientId, onOpenClient }: { onOpenTopic: (id: string) => void; clients?: Client[]; contextClientId?: string | null; onOpenClient?: (id: string) => void }) {
  return (
    <div className="kn-page">
      <FormStudy clients={clients} initialClientId={contextClientId} onOpenClient={onOpenClient} />
      {/* ‼ 16.10: טבלת «כיסוי לפי חלקים» ירדה — הייתה כתובה ביד והתיישנה (גיל 50, עסק זעיר); הכיסוי לכל שדה — במפת הטופס ובמפת הכיסוי (FormStudy). */}
      <div className="kn-box">
        <strong className="kn-small">מחוץ לדוח השנתי</strong>
        <div className="kn-row">
          {TOPICS.filter(t => t.outside1301).map(t => <button key={t.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTopic(t.id)}>{t.title}</button>)}
        </div>
      </div>
    </div>
  );
}
