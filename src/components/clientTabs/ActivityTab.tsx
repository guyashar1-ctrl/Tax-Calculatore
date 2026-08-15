// ─── פעילות — ציר זמן שקט של מה שקרה בתיק ──────────────────────────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-log). לא יומן טכני — אירועים משמעותיים בלבד, מצטברים בזמן שאילתה
// ממקורות קיימים (ראה hooks/useClientActivity.ts). "צפייה במייל שנשלח" פותחת
// את אותו SentEmailViewer שכבר קיים.
//
// ‼ cw-tabpanel ולא cw-tab: cw-tab היא גם מחלקת כפתור הטאב (display:flex
// שורה) — עטיפת השורש בה דחסה את הסרגל וציר הזמן זה לצד זה באותה שורה
// אופקית, בדיוק "זרם צר צף בשטח ריק" שדווח. tabpanel = flex column+gap.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import type { Quotation } from '../../types/quotations';
import type { AdditionalCharge } from '../../types/charges';
import { useClientActivity, type ActivityCategory } from '../../hooks/useClientActivity';
import { formatDate } from '../../utils/dateFormat';
import SentEmailViewer from '../EmailActivity/SentEmailViewer';
import type { EmailMessage } from '../../types/emailActivity';

interface Props {
  client: Client;
  clientSteps: OnboardingStep[];
  events: OnboardingEvent[];
  quotations: Quotation[];
  charges: AdditionalCharge[];
}

const FILTERS: { key: ActivityCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'mail', label: 'מיילים' },
  { key: 'tax', label: 'תיק מס' },
  { key: 'docs', label: 'מסמכים' },
  { key: 'commercial', label: 'מסחרי' },
  { key: 'process', label: 'תהליך' },
];

const DOT_COLOR: Record<ActivityCategory, string> = {
  mail: 'var(--accent)', tax: '#e3a53a', docs: 'var(--accent)', commercial: 'var(--ok, #187a53)', process: 'var(--ok, #187a53)',
};

/** תג קטן ליד הכותרת — אותה שפה כמו במקור (#v-log · .mailtag). */
const CAT_TAG: Record<ActivityCategory, string> = {
  mail: 'מייל', tax: 'תיק מס', docs: 'מסמך', commercial: 'מסחרי', process: 'תהליך',
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'היום';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** ‼ בתוך קיבוץ לפי יום, "לפני 5 ימים" חוזר על מה שהכותרת כבר אמרה. המקור
 *  מציג שעה, וזה מה שבאמת מוסיף מידע בשורה. */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityTab({ client, clientSteps, events, quotations, charges }: Props) {
  const { items, loading } = useClientActivity({ client, clientSteps, events, quotations, charges });
  const [filter, setFilter] = useState<ActivityCategory | 'all'>('all');
  const [viewingEmail, setViewingEmail] = useState<EmailMessage | null>(null);

  const shown = useMemo(() => items.filter(e => filter === 'all' || e.cat === filter), [items, filter]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: typeof shown }[] = [];
    for (const e of shown) {
      const label = dayLabel(e.at);
      const last = groups[groups.length - 1];
      if (last && last.day === label) last.items.push(e);
      else groups.push({ day: label, items: [e] });
    }
    return groups;
  }, [shown]);

  return (
    <div className="cw-tabpanel">
      <div className="cw-section act-bar">
        <div>
          <div className="cw-section-head" style={{ border: 0, padding: 0, margin: 0 }}><span>מה קרה בתיק</span></div>
          <div className="act-sub">אירועים משמעותיים ותקשורת עם הלקוח.</div>
        </div>
        <div className="act-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`act-chip ${filter === f.key ? 'is-on' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cw-section">
        {loading ? (
          <div className="cw-empty">טוען…</div>
        ) : grouped.length === 0 ? (
          <div className="cw-empty">אין אירועים בסינון הזה.</div>
        ) : (
          <div className="act-timeline">
            {grouped.map(g => (
              <div key={g.day}>
                <div className="act-day">{g.day}</div>
                {g.items.map(e => (
                  <div key={e.id} className="act-event">
                    <span className="act-dot" style={{ background: DOT_COLOR[e.cat] }} />
                    <div>
                      <div className="act-title">
                        {e.title}<span className="act-tag">{CAT_TAG[e.cat]}</span>
                      </div>
                      {e.meta && <div className="act-meta">{e.meta}</div>}
                      {e.email && (
                        <>
                          <div className="act-mailmeta">
                            <b>אל:</b> <span dir="ltr">{e.email.toEmail}</span>
                            {e.email.subject && <> · <b>נושא:</b> {e.email.subject}</>}
                          </div>
                          <button type="button" className="act-link" onClick={() => setViewingEmail(e.email!)}>
                            צפה במייל שנשלח
                          </button>
                        </>
                      )}
                    </div>
                    <span className="act-time" title={formatDate(e.at, 'form')}>{clockLabel(e.at)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingEmail && <SentEmailViewer message={viewingEmail} onClose={() => setViewingEmail(null)} />}
    </div>
  );
}
