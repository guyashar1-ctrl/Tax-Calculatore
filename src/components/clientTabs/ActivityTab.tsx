// ─── פעילות — ציר זמן שקט של מה שקרה בתיק ──────────────────────────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-log). לא יומן טכני — אירועים משמעותיים בלבד, מצטברים בזמן שאילתה
// ממקורות קיימים (ראה hooks/useClientActivity.ts). "צפייה במייל שנשלח" פותחת
// את אותו SentEmailViewer שכבר קיים.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import type { Quotation } from '../../types/quotations';
import type { AdditionalCharge } from '../../types/charges';
import { useClientActivity, type ActivityCategory } from '../../hooks/useClientActivity';
import { relativeTime } from '../../utils/clientDerived';
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
  mail: 'var(--accent)', tax: '#e3a53a', docs: 'var(--accent)', commercial: 'var(--ok, #17845b)', process: 'var(--ok, #17845b)',
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'היום';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
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
    <div className="cw-tab">
      <div className="cw-section">
        <div className="cw-section-head">
          <span>מה קרה בתיק</span>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="cw-empty">טוען…</div>
        ) : grouped.length === 0 ? (
          <div className="cw-empty">אין אירועים בסינון הזה.</div>
        ) : (
          grouped.map(g => (
            <div key={g.day}>
              <div style={{ fontSize: 'var(--fs-11,11px)', fontWeight: 700, color: 'var(--ink-4)', padding: '.6rem 0 .2rem' }}>{g.day}</div>
              {g.items.map(e => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: '.6rem', padding: '.5rem 0', borderTop: '1px solid var(--hairline-2)', alignItems: 'start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT_COLOR[e.cat], marginTop: 5 }} />
                  <div>
                    <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{e.title}</div>
                    {e.meta && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{e.meta}</div>}
                    {e.email && (
                      <>
                        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 4 }}>
                          <b>אל:</b> <span dir="ltr">{e.email.toEmail}</span>
                        </div>
                        <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '2px 0' }} onClick={() => setViewingEmail(e.email!)}>
                          צפייה במייל שנשלח
                        </button>
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 'var(--fs-11,11px)', color: 'var(--ink-4)', whiteSpace: 'nowrap' }} title={formatDate(e.at, 'form')}>
                    {relativeTime(e.at)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {viewingEmail && <SentEmailViewer message={viewingEmail} onClose={() => setViewingEmail(null)} />}
    </div>
  );
}
