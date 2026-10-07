// ─── לשונית «יומן» — היומן שלך ב-Google, כמו Google Calendar (הדמיה מאושרת 07.10.2026) ───
// ‼ גיא: «הייתי שמח לראות יומן עם הפגישות — גם כשאני קובע וגם כשאני רוצה לראות מה נקבע».
//   לשונית חדשה בסרגל העליון (לא בתוך «משימות», שעוד משתנה).
// ‼ מקור האמת: היומן ב-Google (calendar-meeting ← events), לקריאה בלבד. פגישה שנקבעה מ-PIVO
//   — בכחול, עם מי אישר, ועם הפעולות שלה (הצטרפות, שינוי מועד, תזכורת, ביטול). כל אירוע אחר
//   ביומן — באפור, לקריאה; עורכים אותו ב-Google.
// ‼ לחיצה על שעה פנויה ⇒ «פגישה חדשה» באותה שעה. בטלפון: יום אחד, עם פס ימים.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  whatsappReminderText, whatsappCancelText, longDay, utcToIsrael,
} from '../../../supabase/functions/_shared/meetingInvite';
import type { CalendarEvent } from '../../../supabase/functions/_shared/meetingCore';
import CopyBox from './CopyBox';
import {
  addDays, dayLetter, dayNumber, eventRange, eventsByDay, hourRange, israelNow, rangeLabel, timeAtY, toTime,
  visibleDays, weekStart, type Placed,
} from './calendarModel';
import { israelToday, meetingErrorText, RSVP_LABELS, RSVP_TONE, type Meeting } from './meetingModel';
import type { MeetingsApi } from './useMeetings';
import './calendar.css';

const HOUR_PX = 48;

interface Props {
  api: MeetingsApi;
  signer?: string;
  onNewMeeting: (date: string, time: string) => void;
  onMove: (m: Meeting) => void;
  /** פתיחת הלקוח / הליד בתצוגה המהירה. */
  onOpenPerson: (id: string) => void;
  onOpenConnections: () => void;
}

type Load = { key: string; events: CalendarEvent[] | null; error?: string };

/** מתי לטעון מחדש: כשפגישה ב-PIVO נוצרה, זזה או בוטלה. */
const meetingsSignature = (list: Meeting[]) => list.map(m => `${m.id}:${m.status}:${m.startsAt}:${m.durationMin}`).join('|');

export default function CalendarPage({ api, signer, onNewMeeting, onMove, onOpenPerson, onOpenConnections }: Props) {
  const wide = useMediaQuery('(min-width: 900px)');
  const today = israelToday();
  const [anchor, setAnchor] = useState(today);
  const [dayMode, setDayMode] = useState(false);
  const [load, setLoad] = useState<Load | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [now, setNow] = useState(() => israelNow());
  const bodyRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const connected = !!api.connection?.connected;
  const single = dayMode || !wide;

  const start = weekStart(anchor);
  const key = start;
  const sig = meetingsSignature(api.meetings);

  const fetchWeek = useCallback(async () => {
    setLoad(l => (l?.key === key ? { ...l } : { key, events: null }));
    const r = await api.events(start, addDays(start, 7));
    setLoad({ key, events: r.events, ...(r.events === null ? { error: r.error } : {}) });
  }, [api, start, key]);

  useEffect(() => { if (connected) void fetchWeek(); }, [connected, key, sig]);
  useEffect(() => {
    const t = setInterval(() => setNow(israelNow()), 60000);
    return () => clearInterval(t);
  }, []);

  const events = load?.key === key ? load.events : null;
  const days = useMemo(() => visibleDays(start, events ?? []), [start, events]);
  const shownDays = single ? [days.includes(anchor) ? anchor : days[0]] : days;
  const byDay = useMemo(() => eventsByDay(events ?? [], days), [events, days]);
  const { from, to } = hourRange(byDay);
  const meetingById = useMemo(() => new Map(api.meetings.map(m => [m.id, m])), [api.meetings]);
  const selected = (events ?? []).find(e => e.id === sel) ?? null;

  // ‼ פעם אחת בכל שבוע: גוללים לשעה 08:00 (או לשעה הנוכחית היום), כמו Google.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !events) return;
    const focusHour = shownDays.includes(now.date) ? Math.max(from, Math.floor(now.minutes / 60) - 1) : 8;
    el.scrollTop = Math.max(0, (focusHour - from) * HOUR_PX);
  }, [key, events === null, single]);

  function pick(e: CalendarEvent) {
    setSel(e.id);
    if (!wide) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (api.connection && !connected) {
    return (
      <div className="cal-page">
        <CalHead label="יומן" />
        <div className="cal-empty">
          <h2>היומן שלך ב-Google עוד לא מחובר</h2>
          <p>מחברים פעם אחת, ואז רואים כאן את כל היומן — הפגישות שנקבעו מ-PIVO וכל השאר — וקובעים פגישה בלחיצה על שעה פנויה.</p>
          <button type="button" className="ui-btn ui-btn-primary" onClick={onOpenConnections}>לחיבור היומן</button>
        </div>
      </div>
    );
  }

  const label = rangeLabel(shownDays);
  const go = (n: number) => { setAnchor(a => addDays(a, n * (single ? 1 : 7))); setSel(null); };

  return (
    <div className="cal-page">
      <div className="cal-head">
        <h1 className="cal-title">יומן <span className="cal-range">{label}</span></h1>
        <div className="cal-tools">
          {wide && (
            <div className="cal-seg" role="group" aria-label="תצוגה">
              <button type="button" aria-pressed={!dayMode} onClick={() => setDayMode(false)}>שבוע</button>
              <button type="button" aria-pressed={dayMode} onClick={() => setDayMode(true)}>יום</button>
            </div>
          )}
          <div className="cal-nav" role="group" aria-label="מעבר בין תאריכים">
            <button type="button" className="ui-btn ui-btn-ghost" aria-label={single ? 'היום הקודם' : 'השבוע הקודם'} onClick={() => go(-1)}>›</button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => { setAnchor(today); setSel(null); }}>היום</button>
            <button type="button" className="ui-btn ui-btn-ghost" aria-label={single ? 'היום הבא' : 'השבוע הבא'} onClick={() => go(1)}>‹</button>
          </div>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => onNewMeeting(anchor >= today ? anchor : today, '10:00')}>+ פגישה חדשה</button>
        </div>
      </div>
      <div className="cal-legend">
        <span><i className="cal-key is-pivo" />פגישה מ-PIVO</span>
        <span><i className="cal-key" />אירוע אחר ביומן Google</span>
        <span><i className="cal-dot is-ok" />אישרו</span>
        <span><i className="cal-dot is-muted" />עוד לא ענו</span>
        <span><i className="cal-dot is-warn" />אולי</span>
        <span><i className="cal-dot is-err" />לא יגיעו</span>
      </div>
      {api.connection?.lastError === 'reconnect' && (
        <div className="mt-banner is-warn" role="alert">
          החיבור ליומן Google נותק — מה שמוצג אולי לא עדכני.
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onOpenConnections}>לחיבור מחדש</button>
        </div>
      )}
      {load?.key === key && load.error && (
        <div className="mt-banner is-err" role="alert">
          לא הצלחנו לקרוא את היומן מ-Google. {load.error === 'google_reconnect' || load.error === 'google_not_connected'
            ? meetingErrorText({ error: load.error }) : 'נסו שוב בעוד רגע.'}
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void fetchWeek()}>נסו שוב</button>
        </div>
      )}

      <div className={`cal-wrap${wide ? '' : ' is-narrow'}`}>
        <div className="cal">
          {single && (
            <div className="cal-strip" role="group" aria-label="ימים בשבוע">
              {days.map(d => (
                <button key={d} type="button" aria-pressed={d === shownDays[0]} className={d === today ? 'is-today' : ''}
                  onClick={() => { setAnchor(d); setSel(null); }}>
                  {dayLetter(d)}<b>{dayNumber(d)}</b>
                </button>
              ))}
            </div>
          )}
          <div className="cal-cols cal-dayheads" style={{ ['--days' as string]: shownDays.length }}>
            <div />
            {shownDays.map(d => (
              <div key={d} className={`cal-dayhead${d === today ? ' is-today' : ''}`}>
                {dayLetter(d)}<b>{dayNumber(d)}</b>
              </div>
            ))}
          </div>
          {shownDays.some(d => byDay.get(d)?.allDay.length) && (
            <div className="cal-cols cal-allday" style={{ ['--days' as string]: shownDays.length }}>
              <div className="cal-allday-lbl">כל היום</div>
              {shownDays.map(d => (
                <div key={d} className="cal-allday-cell">
                  {byDay.get(d)?.allDay.map(e => (
                    <button key={e.id} type="button" className={`cal-chip${sel === e.id ? ' is-sel' : ''}`} onClick={() => pick(e)}>{e.title}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="cal-body" ref={bodyRef} aria-busy={events === null}>
            <div className="cal-cols" style={{ ['--days' as string]: shownDays.length, ['--hh' as string]: `${HOUR_PX}px` }}>
              <div className="cal-hours" aria-hidden="true">
                {Array.from({ length: to - from }, (_, i) => <div key={i} className="cal-hour">{toTime((from + i) * 60)}</div>)}
              </div>
              {shownDays.map(d => (
                <DayColumn key={d} date={d} placed={byDay.get(d)?.timed ?? []} from={from} to={to}
                  today={today} now={now} sel={sel} meetingById={meetingById}
                  onPick={pick} onSlot={t => onNewMeeting(d, t)} />
              ))}
            </div>
            {events === null && !load?.error && <div className="cal-loading" role="status">טוען את היומן מ-Google…</div>}
          </div>
        </div>

        <aside className="cal-side" ref={detailRef} aria-label="פרטים">
          {selected
            ? <Detail key={selected.id} e={selected} meeting={selected.meetingId ? meetingById.get(selected.meetingId) : undefined}
                api={api} signer={signer} today={today} onMove={onMove} onOpenPerson={onOpenPerson} onClose={() => setSel(null)} />
            : <div className="cal-panel cal-hint">לחיצה על פגישה מראה עם מי, מי אישר ומה אפשר לעשות. לחיצה על שעה פנויה פותחת פגישה חדשה באותה שעה.</div>}
          <TodayList events={events} today={today} meetingById={meetingById} onPick={pick} />
        </aside>
      </div>
    </div>
  );
}

function CalHead({ label }: { label: string }) {
  return <div className="cal-head"><h1 className="cal-title">{label}</h1></div>;
}

function DayColumn({ date, placed, from, to, today, now, sel, meetingById, onPick, onSlot }: {
  date: string;
  placed: Placed[];
  from: number;
  to: number;
  today: string;
  now: { date: string; minutes: number };
  sel: string | null;
  meetingById: Map<string, Meeting>;
  onPick: (e: CalendarEvent) => void;
  onSlot: (time: string) => void;
}) {
  const past = date < today;
  return (
    <div className={`cal-col${past ? ' is-past' : ''}`}
      title={past ? undefined : 'לחיצה על שעה פנויה — פגישה חדשה'}
      onClick={e => {
        if (past) return;
        const t = timeAtY(e.clientY - e.currentTarget.getBoundingClientRect().top, HOUR_PX, from, to);
        // ‼ שעה שכבר עברה היום — לא פותחים זימון לעבר.
        if (date === now.date && Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) < now.minutes - 5) return;
        onSlot(t);
      }}>
      {Array.from({ length: to - from }, (_, i) => <div key={i} className="cal-slot" />)}
      {placed.map(p => {
        const m = p.ev.meetingId ? meetingById.get(p.ev.meetingId) : undefined;
        const top = ((p.start - from * 60) / 60) * HOUR_PX;
        const height = Math.max(22, ((p.end - p.start) / 60) * HOUR_PX - 2);
        const names = m ? m.guests.map(g => g.name || g.email).join(' ו') : '';
        return (
          <button key={`${p.ev.id}-${date}`} type="button"
            className={`cal-ev${p.ev.meetingId ? ' is-pivo' : ''}${p.ev.busy ? '' : ' is-free'}${sel === p.ev.id ? ' is-sel' : ''}`}
            style={{ top, height, insetInlineStart: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)` }}
            aria-label={`${p.ev.title} · ${eventRange(p.ev)}`}
            onClick={e => { e.stopPropagation(); onPick(p.ev); }}>
            <span className="cal-ev-t">
              {m?.guests.map(g => <i key={g.email} className={`cal-dot is-${RSVP_TONE[g.rsvp ?? 'none']}`} aria-hidden="true" />)}
              {m ? `${names} · ${m.kind === 'intro' ? 'שיחת היכרות' : (m.topic || 'פגישת עבודה')}` : p.ev.title}
            </span>
            {height > 30 && <span className="cal-ev-time ltr-isolate">{eventRange(p.ev)}</span>}
          </button>
        );
      })}
      {date === now.date && now.minutes >= from * 60 && now.minutes <= to * 60 && (
        <div className="cal-now" style={{ top: ((now.minutes - from * 60) / 60) * HOUR_PX }} aria-hidden="true" />
      )}
    </div>
  );
}

function TodayList({ events, today, meetingById, onPick }: {
  events: CalendarEvent[] | null;
  today: string;
  meetingById: Map<string, Meeting>;
  onPick: (e: CalendarEvent) => void;
}) {
  const list = (events ?? [])
    .filter(e => (e.allDay ? !!e.startDate && e.startDate <= today && today < (e.endDate ?? '') : !!e.startsAt && utcToIsrael(e.startsAt).date === today))
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  if (events === null) return null;
  return (
    <div className="cal-panel">
      <h2 className="cal-panel-title">היום · {longDay(today)}</h2>
      {list.length === 0 ? <p className="cal-muted">אין אירועים ביומן היום.</p> : (
        <ul className="cal-today">
          {list.map(e => {
            const m = e.meetingId ? meetingById.get(e.meetingId) : undefined;
            return (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e)}>
                  <span className="ltr-isolate cal-today-time">{e.allDay ? 'כל היום' : utcToIsrael(e.startsAt!).time}</span>
                  {m ? <b>{e.title}</b> : <span className="cal-muted">{e.title}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** פרטי אירוע: פגישה של PIVO — עם מי, מי אישר, ופעולות; אירוע אחר — לקריאה בלבד. */
function Detail({ e, meeting, api, signer, today, onMove, onOpenPerson, onClose }: {
  e: CalendarEvent;
  meeting?: Meeting;
  api: MeetingsApi;
  signer?: string;
  today: string;
  onMove: (m: Meeting) => void;
  onOpenPerson: (id: string) => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<'remind' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string; cancelText?: string } | null>(null);
  const date = e.allDay ? e.startDate! : utcToIsrael(e.startsAt!).date;
  const when = <>{longDay(date)} · <span className="ltr-isolate">{eventRange(e)}</span></>;

  if (!meeting) {
    return (
      <div className="cal-panel">
        <div className="cal-panel-head">
          <h2 className="cal-panel-title">{e.title}</h2>
          <button type="button" className="ui-icon-btn" aria-label="סגירת הפרטים" onClick={onClose}>✕</button>
        </div>
        <span className="cal-muted">{when}</span>
        <span className="cal-tag">אירוע ביומן Google</span>
        <p className="cal-muted">{e.meetingId ? 'פגישה מ-PIVO שכבר לא ברשימה (נקבעה לפני יותר מ-45 יום).' : 'לא נקבע מ-PIVO, ולכן מוצג לקריאה בלבד. עורכים אותו ב-Google.'}</p>
        {e.htmlLink && <a className="ui-linkbtn" href={e.htmlLink} target="_blank" rel="noreferrer">פתיחה ביומן Google ↗</a>}
      </div>
    );
  }

  const pending = meeting.guests.filter(g => (g.rsvp ?? 'none') === 'none');
  const scheduled = meeting.status === 'scheduled';
  const personId = meeting.clientId ?? meeting.leadId;

  async function cancel() {
    setBusy(true);
    const r = await api.send('cancel', { id: meeting!.id });
    setBusy(false);
    setPanel(null);
    setNotice(r.ok
      ? { tone: 'ok', text: 'הפגישה בוטלה. Google שלח למוזמנים הודעת ביטול, והיא נמחקה מהיומן שלך.',
        cancelText: meeting!.guests[0] ? whatsappCancelText({ guest: meeting!.guests[0], date, time: utcToIsrael(meeting!.startsAt).time }) : undefined }
      : { tone: r.error === 'unknown_outcome' ? 'warn' : 'err', text: r.text });
  }

  return (
    <div className="cal-panel">
      <div className="cal-panel-head">
        <h2 className="cal-panel-title">{meeting.title}</h2>
        <button type="button" className="ui-icon-btn" aria-label="סגירת הפרטים" onClick={onClose}>✕</button>
      </div>
      <span className="cal-muted">{when}</span>
      <ul className="cal-guests">
        {meeting.guests.map(g => {
          const r = g.rsvp ?? 'none';
          return (
            <li key={g.email}>
              <b>{g.name || <span className="ltr-isolate">{g.email}</span>}</b>
              <span className={`mt-pill is-${RSVP_TONE[r]}`}>{RSVP_LABELS[r]}</span>
            </li>
          );
        })}
      </ul>
      {notice && (
        <div className={`mt-banner is-${notice.tone}`} role="status">
          {notice.text}
          {notice.cancelText && <CopyBox label="מילה אישית בוואטסאפ (רשות)" text={notice.cancelText} />}
        </div>
      )}
      {scheduled && (
        <div className="cal-acts">
          {date === today && meeting.meetLink && (
            <a className="ui-btn ui-btn-primary" href={meeting.meetLink} target="_blank" rel="noreferrer">הצטרפות ל-Meet</a>
          )}
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => onMove(meeting)}>שינוי מועד</button>
          {pending.length > 0 && (
            <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={panel === 'remind'}
              onClick={() => setPanel(p => (p === 'remind' ? null : 'remind'))}>תזכורת בוואטסאפ</button>
          )}
          <button type="button" className="ui-btn ui-btn-ghost mt-danger" aria-expanded={panel === 'cancel'}
            onClick={() => setPanel(p => (p === 'cancel' ? null : 'cancel'))}>ביטול</button>
        </div>
      )}
      {panel === 'remind' && (
        <div className="mt-inline">
          {pending.map(g => (
            <CopyBox key={g.email} label={`להעתיק ולשלוח ל${g.name || g.email} בוואטסאפ`}
              text={whatsappReminderText({ guest: g, date, time: utcToIsrael(meeting.startsAt).time, today, signer })} />
          ))}
          <span className="mt-hint">לא נשלח מייל. תזכורת בערוץ שבו הם כבר מדברים איתך עובדת טוב יותר.</span>
        </div>
      )}
      {panel === 'cancel' && (
        <div className="mt-inline">
          <p className="mt-confirm">לבטל את הפגישה? Google ישלח לכל המוזמנים הודעת ביטול, והיא תימחק מהיומן שלך.</p>
          <div className="cal-acts">
            <button type="button" className="ui-btn mt-danger-solid" disabled={busy} onClick={() => void cancel()}>
              {busy ? 'מבטל…' : 'בטל ושלח הודעת ביטול'}
            </button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setPanel(null)}>לא, להשאיר</button>
          </div>
        </div>
      )}
      {personId && (
        <button type="button" className="ui-linkbtn" onClick={() => onOpenPerson(personId)}>
          {meeting.clientId ? 'לכרטיס הלקוח ←' : 'לליד ←'}
        </button>
      )}
    </div>
  );
}

