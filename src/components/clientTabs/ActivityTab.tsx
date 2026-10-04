// ─── פעילות — ציר זמן שקט של מה שקרה בתיק ──────────────────────────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-log). לא יומן טכני — אירועים משמעותיים בלבד, מצטברים בזמן שאילתה
// ממקורות קיימים (ראה hooks/useClientActivity.ts). «צפייה במייל» פותחת את אותו
// SentEmailViewer שכבר קיים. כותרת של מייל — לפי המצב שלו ביומן, לא «נשלח» לכל שורה.
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
  /** פותח את תיק המס — שם מתקנים כתובת מייל שחזרה («פרטי נישום»). חסר ⇒ רק ההסבר. */
  onOpenTaxFile?: () => void;
}

// ‼ שמות המוצר, לא מילים פנימיות: «הסכם ותשלומים» כמו הלשונית, ו«בקשות ומשימות» — לא «תהליך».
const FILTERS: { key: ActivityCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'mail', label: 'מיילים' },
  { key: 'tax', label: 'תיק מס' },
  { key: 'docs', label: 'מסמכים' },
  { key: 'commercial', label: 'הסכם ותשלומים' },
  { key: 'process', label: 'בקשות ומשימות' },
];

const DOT_COLOR: Record<ActivityCategory, string> = {
  mail: 'var(--accent)', tax: '#e3a53a', docs: 'var(--accent)', commercial: 'var(--ok, #187a53)', process: 'var(--ok, #187a53)',
};

/** מייל שלא יצא כרגיל — הכותרת, הנקודה וההסבר בצבע המצב. */
const TONE_COLOR = { unknown: 'var(--warn)', failed: 'var(--err)' } as const;

/**
 * תג קטן ליד הכותרת — אותה שפה כמו במקור (#v-log · .mailtag) ואותם שמות כמו הסינון.
 * ‼ בבקשות ובמשימות הכותרת עצמה אומרת מה זה («משימה חדשה», «הערה») — בלי תג.
 */
const CAT_TAG: Record<ActivityCategory, string> = {
  mail: 'מייל', tax: 'תיק מס', docs: 'מסמך', commercial: 'הסכם ותשלומים', process: '',
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

export default function ActivityTab({ client, clientSteps, events, quotations, charges, onOpenTaxFile }: Props) {
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
                {g.items.map(e => {
                  const toneColor = e.tone && e.tone !== 'normal' ? TONE_COLOR[e.tone] : undefined;
                  return (
                    <div key={e.id} className="act-event">
                      <span className="act-dot" style={{ background: toneColor ?? DOT_COLOR[e.cat] }} />
                      <div className="act-body">
                        <div className="act-title" style={toneColor ? { color: toneColor } : undefined}>
                          {e.title}{CAT_TAG[e.cat] && <span className="act-tag">{CAT_TAG[e.cat]}</span>}
                        </div>
                        {e.meta && <div className="act-meta">{e.meta}</div>}
                        {e.hint && <div className="act-meta" style={{ color: toneColor }}>{e.hint}</div>}
                        {e.email && (
                          <>
                            {/* ‼ הנושא כבר בשורה שמעל — כאן רק לאן. */}
                            <div className="act-mailmeta">
                              <b>אל:</b> <bdi dir="ltr">{e.email.toEmail}</bdi>
                            </div>
                            {/* ‼ «צפייה במייל» ולא «…שנשלח» — גם כשלא ידוע אם יצא, או שלא יצא. */}
                            <button type="button" className="act-link" onClick={() => setViewingEmail(e.email!)}>
                              צפייה במייל
                            </button>
                            {e.fixAddress && onOpenTaxFile && (
                              <>
                                {' · '}
                                <button type="button" className="act-link" onClick={onOpenTaxFile}>לתיקון הכתובת בתיק המס</button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      <span className="act-time" title={formatDate(e.at, 'form')}>{clockLabel(e.at)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingEmail && <SentEmailViewer message={viewingEmail} onClose={() => setViewingEmail(null)} />}
    </div>
  );
}
