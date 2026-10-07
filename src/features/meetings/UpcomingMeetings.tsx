// ─── «פגישות קרובות» בראש מסך הבית ──────────────────────────────────────────
// ‼ לא יומן שני: רק פגישות שנקבעו מ-PIVO, עם מה ש-PIVO יודע עליהן — מי אישר,
// קישור הצטרפות, שינוי מועד, ביטול ותזכורת בוואטסאפ. היומן המלא נשאר ב-Google.
// ‼ אין פגישות קרובות ⇒ המקטע לא מוצג בכלל (פגישה חדשה — ב«+ חדש»).

import { useState } from 'react';
import {
  utcToIsrael, whatsappReminderText, whatsappCancelText, MEETING_KIND_LABELS,
} from '../../../supabase/functions/_shared/meetingInvite';
import CopyBox from './CopyBox';
import { dayHeading, israelToday, meetingWhen, upcomingMeetings, RSVP_LABELS, RSVP_TONE, type Meeting } from './meetingModel';
import type { MeetingsApi } from './useMeetings';
import './meetings.css';

interface Props {
  api: MeetingsApi;
  signer?: string;
  onMove: (m: Meeting) => void;
  onOpenConnections: () => void;
}

function rowTitle(m: Meeting): string {
  const label = m.kind === 'intro' ? MEETING_KIND_LABELS.intro : (m.topic?.trim() || MEETING_KIND_LABELS.work);
  const names = m.guests.map(g => g.name || g.email);
  return [label, names.length > 2 ? `${names[0]} ועוד ${names.length - 1}` : names.join(' ו')].filter(Boolean).join(' · ');
}

export default function UpcomingMeetings({ api, signer, onMove, onOpenConnections }: Props) {
  const [open, setOpen] = useState<{ id: string; panel: 'remind' | 'cancel' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; tone: 'ok' | 'err' | 'warn'; text: string; cancelText?: string } | null>(null);
  const list = upcomingMeetings(api.meetings);
  if (list.length === 0 && !notice) return null;
  const today = israelToday();

  async function cancel(m: Meeting) {
    setBusyId(m.id);
    const r = await api.send('cancel', { id: m.id });
    setBusyId(null);
    setOpen(null);
    const w = meetingWhen(m);
    setNotice(r.ok
      ? { id: m.id, tone: 'ok', text: `«${rowTitle(m)}» בוטלה. Google שלח למוזמנים הודעת ביטול, והיא נמחקה מהיומן שלך.`,
        cancelText: m.guests[0] ? whatsappCancelText({ guest: m.guests[0], date: w.date, time: w.time }) : undefined }
      : { id: m.id, tone: r.error === 'unknown_outcome' ? 'warn' : 'err', text: r.text });
  }

  async function resend(m: Meeting) {
    setBusyId(m.id);
    const { date, time } = utcToIsrael(m.startsAt);
    const r = await api.send('create', {
      id: m.id, kind: m.kind, date, time, durationMin: m.durationMin, topic: m.topic ?? '', prep: m.prep ?? '', note: m.note ?? '',
      guests: m.guests.map(g => ({ email: g.email, ...(g.name ? { name: g.name } : {}) })), ...(m.clientId ? { clientId: m.clientId } : {}),
    });
    setBusyId(null);
    setNotice(r.ok ? { id: m.id, tone: 'ok', text: 'הזימון ביומן. לא נוצרה פגישה כפולה.' }
      : { id: m.id, tone: r.error === 'unknown_outcome' ? 'warn' : 'err', text: r.text });
  }

  let lastDay = '';
  return (
    <section className="mt-upcoming" aria-label="פגישות קרובות">
      <div className="mt-up-head">
        <h2 className="mt-up-title">פגישות קרובות</h2>
        {api.connection?.lastError === 'reconnect' && (
          <button type="button" className="ui-linkbtn mt-up-warn" onClick={onOpenConnections}>החיבור ליומן Google נותק · לחיבור מחדש</button>
        )}
      </div>
      {notice && (
        <div className={`mt-banner is-${notice.tone}`} role="status">
          {notice.text}
          {notice.cancelText && <CopyBox label="מילה אישית בוואטסאפ (רשות)" text={notice.cancelText} />}
          <button type="button" className="ui-linkbtn" onClick={() => setNotice(null)}>סגירה</button>
        </div>
      )}
      {list.map(m => {
        const w = meetingWhen(m);
        const head = w.date !== lastDay ? dayHeading(w.date, today) : null;
        lastDay = w.date;
        const pending = m.guests.filter(g => (g.rsvp ?? 'none') === 'none');
        const isOpen = (p: 'remind' | 'cancel') => open?.id === m.id && open.panel === p;
        const toggle = (p: 'remind' | 'cancel') => setOpen(isOpen(p) ? null : { id: m.id, panel: p });
        return (
          <div key={m.id}>
            {head && <div className="mt-day">{head}</div>}
            <article className="mt-row">
              <div className="mt-row-time"><span className="ltr-isolate">{w.time}</span><small>{m.durationMin === 60 ? 'שעה' : `${m.durationMin} דק׳`}</small></div>
              <div className="mt-row-main">
                <div className="mt-row-title">{rowTitle(m)}</div>
                <div className="mt-row-guests">
                  {m.guests.map(g => {
                    const r = g.rsvp ?? 'none';
                    return (
                      <span key={g.email} className="mt-row-guest">
                        {g.name || <span className="ltr-isolate">{g.email}</span>}
                        <span className={`mt-pill is-${RSVP_TONE[r]}`}>{RSVP_LABELS[r]}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              {m.status === 'scheduled' && (
                <div className="mt-row-acts">
                  {w.date === today && m.meetLink && (
                    <a className="ui-btn ui-btn-primary mt-join" href={m.meetLink} target="_blank" rel="noreferrer">הצטרפות ל-Meet</a>
                  )}
                  <button type="button" className="ui-btn ui-btn-ghost" onClick={() => onMove(m)}>שינוי מועד</button>
                  {pending.length > 0 && (
                    <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={isOpen('remind')} onClick={() => toggle('remind')}>
                      תזכורת בוואטסאפ
                    </button>
                  )}
                  <button type="button" className="ui-btn ui-btn-ghost mt-danger" aria-expanded={isOpen('cancel')} onClick={() => toggle('cancel')}>ביטול</button>
                </div>
              )}
              <div className="mt-row-more">
                {m.status === 'unknown' && (
                  <div className="mt-banner is-warn">
                    לא ידוע אם הזימון יצא — Google לא החזיר תשובה ברורה. שליחה חוזרת בטוחה: היא לא תיצור פגישה שנייה.
                    <button type="button" className="ui-btn ui-btn-ghost" disabled={busyId === m.id} onClick={() => resend(m)}>
                      {busyId === m.id ? 'שולח…' : 'שלח שוב (אותו זימון)'}
                    </button>
                  </div>
                )}
                {isOpen('remind') && (
                  <div className="mt-inline">
                    {pending.map(g => (
                      <CopyBox key={g.email} label={`להעתיק ולשלוח ל${g.name || g.email} בוואטסאפ`}
                        text={whatsappReminderText({ guest: g, date: w.date, time: w.time, today, signer })} />
                    ))}
                    <span className="mt-hint">לא נשלח מייל. תזכורת בערוץ שבו הם כבר מדברים איתך עובדת טוב יותר.</span>
                  </div>
                )}
                {isOpen('cancel') && (
                  <div className="mt-inline">
                    <p className="mt-confirm">לבטל את הפגישה? Google ישלח לכל המוזמנים הודעת ביטול, והיא תימחק מהיומן שלך.</p>
                    <div className="mt-row-acts">
                      <button type="button" className="ui-btn mt-danger-solid" disabled={busyId === m.id} onClick={() => cancel(m)}>
                        {busyId === m.id ? 'מבטל…' : 'בטל ושלח הודעת ביטול'}
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setOpen(null)}>לא, להשאיר</button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          </div>
        );
      })}
    </section>
  );
}
