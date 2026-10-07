// ─── פגישה חדשה / שינוי מועד — זימון מהיומן של הרו"ח ───────────────────────
// הדמיה מאושרת: docs/MEETINGS-GOOGLE-CALENDAR.md (06.10.2026).
// ‼ המסלול המהיר מהטלפון: הלקוח שלח מייל בוואטסאפ ⇒ «הדבקה» ⇒ שם ⇒ מועד ⇒ תצוגה ⇒ שליחה.
// ‼ מה שבתצוגה הוא מה שנשלח: אותו inviteBlocks בדפדפן ובשרת, אותם קלטים.
// ‼ מזהה הפגישה נקבע פעם אחת לחלון — «שלח» פעמיים או שליחה חוזרת אחרי «לא ידוע» לא
//   יוצרים פגישה שנייה (השרת גוזר ממנו את מזהה האירוע ב-Google).

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import type { Client } from '../../types';
import type { Lead } from '../../types/quotations';
import type { FirmProfile } from '../../types/firmProfile';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  extractEmails, suggestNameFromWhatsApp, isValidEmail, israelToUtcIso, addMinutes, longDay,
  whatsappSentText, MEETING_KIND_LABELS, MEETING_KIND_HINTS, MEETING_DEFAULT_MINUTES, MEETING_DURATIONS, MOVE_NOTE_DEFAULT,
  type InviteOrg, type MeetingKind, type MoveAskedBy,
} from '../../../supabase/functions/_shared/meetingInvite';
import InvitePreview from './InvitePreview';
import CopyBox from './CopyBox';
import { israelToday, meetingWhen, type Meeting } from './meetingModel';
import type { MeetingsApi } from './useMeetings';
import './meetings.css';

export type MeetingDialogMode =
  | { kind: 'new'; clientId?: string }
  | { kind: 'move'; meeting: Meeting };

interface Props {
  mode: MeetingDialogMode;
  clients: Client[];
  leads: Lead[];
  profile: FirmProfile | null;
  api: MeetingsApi;
  onClose: () => void;
  onOpenConnections: () => void;
}

export function orgOf(p: FirmProfile | null): InviteOrg {
  return {
    fullName: p?.fullName, firmName: p?.firmName, representativeType: p?.representativeType,
    phone: p?.phone, whatsapp: p?.communication?.whatsapp, website: p?.website,
  };
}

const TIMES: string[] = (() => {
  const out: string[] = [];
  for (let t = 7 * 60; t <= 21 * 60 + 45; t += 15) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return out;
})();

/** יום העבודה הבא (א׳–ה׳) אחרי היום — ברירת המחדל לפגישה חדשה. */
export function nextWorkday(today: string): string {
  let d = new Date(`${today}T12:00:00Z`);
  do d = new Date(d.getTime() + 86400000); while (d.getUTCDay() === 5 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

const lower = (s?: string | null) => (s ?? '').trim().toLowerCase();
const clientName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();

type Phase = 'edit' | 'preview' | 'sending' | 'done';

/** ‼ כל טווח מבודד לחוד: רשימה שלמה בכיוון שמאל-לימין נקראת בעברית מהסוף להתחלה. */
function Ranges({ list }: { list: { start: string; end: string }[] }) {
  return <>{list.map((s, i) => <span key={i}>{i > 0 && ' · '}<span className="ltr-isolate">{s.start}–{s.end}</span></span>)}</>;
}

export default function MeetingDialog({ mode, clients, leads, profile, api, onClose, onOpenConnections }: Props) {
  const wide = useMediaQuery('(min-width: 900px)');
  const org = useMemo(() => orgOf(profile), [profile]);
  const today = israelToday();
  const isMove = mode.kind === 'move';
  const presetClient = mode.kind === 'new' && mode.clientId ? clients.find(c => c.id === mode.clientId) : undefined;
  const moving = mode.kind === 'move' ? mode.meeting : null;
  const movingWhen = moving ? meetingWhen(moving) : null;

  const [id] = useState(() => (moving ? moving.id : crypto.randomUUID()));
  const [text, setText] = useState(() => presetClient?.email ?? '');
  const [names, setNames] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<MeetingKind>(moving?.kind ?? (presetClient ? 'work' : 'intro'));
  const [topic, setTopic] = useState(moving?.topic ?? '');
  const [prep, setPrep] = useState(moving?.prep ?? '');
  const [note, setNote] = useState(moving?.note ?? '');
  const [date, setDate] = useState(movingWhen?.date ?? nextWorkday(today));
  const [time, setTime] = useState(movingWhen?.time ?? '10:00');
  const [duration, setDuration] = useState(moving?.durationMin ?? MEETING_DEFAULT_MINUTES[presetClient ? 'work' : 'intro']);
  const [askedBy, setAskedBy] = useState<MoveAskedBy>('office');
  const [moveNote, setMoveNote] = useState(MOVE_NOTE_DEFAULT.office);
  const [moveNoteDirty, setMoveNoteDirty] = useState(false);
  const [phase, setPhase] = useState<Phase>('edit');
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [result, setResult] = useState<Meeting | null>(null);
  const [busy, setBusy] = useState<{ date: string; slots: { start: string; end: string }[] | null } | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const connected = !!api.connection?.connected;

  // ── מי המוזמנים, ומי הם ב-PIVO ──────────────────────────────────────────
  const known = useMemo(() => {
    const m = new Map<string, { label: string; name: string; clientId?: string; leadId?: string }>();
    for (const c of clients) {
      if (c.email) m.set(lower(c.email), { label: `לקוח: ${clientName(c)}`, name: clientName(c), clientId: c.id });
      if (c.spouseEmail && !m.has(lower(c.spouseEmail))) {
        m.set(lower(c.spouseEmail), { label: `בן/בת הזוג של ${clientName(c)}`, name: c.spouseName ?? '', clientId: c.id });
      }
    }
    for (const l of leads) {
      if (l.email && !l.convertedClientId && !m.has(lower(l.email))) m.set(lower(l.email), { label: `ליד: ${l.fullName}`, name: l.fullName, leadId: l.id });
    }
    return m;
  }, [clients, leads]);

  const suggested = useMemo(() => suggestNameFromWhatsApp(text), [text]);
  const guests = useMemo(() => {
    const list = isMove ? moving!.guests.map(g => g.email) : extractEmails(text).filter(e => !removed.has(e));
    return list.map((email, i) => {
      const k = known.get(email);
      const typed = names[email];
      const name = typed ?? (isMove ? moving!.guests.find(g => g.email === email)?.name : undefined)
        ?? (k?.name || (i === 0 ? suggested : undefined)) ?? '';
      return { email, name: name.trim(), known: k };
    });
  }, [text, removed, names, known, suggested, isMove, moving]);

  const firstIsNew = !!guests[0] && !guests[0].known;
  const needsName = !isMove && kind === 'intro' && firstIsNew && !guests[0].name;

  // ── «פנוי?» מול היומן ───────────────────────────────────────────────────
  useEffect(() => {
    if (!connected || !date || date < today) return;
    let cancelled = false;
    setBusy({ date, slots: null });
    const t = setTimeout(async () => {
      const slots = await api.freebusy(date);
      if (!cancelled) setBusy({ date, slots: slots ?? [] });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [date, connected]);

  const start = date && time ? israelToUtcIso(date, time) : '';
  const past = !!start && Date.parse(start) < Date.now() - 5 * 60000;
  const end = addMinutes(time, duration);
  // ‼ הפגישה עצמה (בשינוי מועד) תפוסה בשעה הישנה — לא «התנגשות» ולא «תפוס».
  const otherBusy = busy?.date === date && busy.slots
    ? busy.slots.filter(s => !(moving && movingWhen && date === movingWhen.date && s.start === movingWhen.time))
    : [];
  const clash = otherBusy.filter(s => s.start < end && time < s.end);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 6 || (weekday === 5 && time >= '13:00');

  const input = {
    kind, durationMin: duration, topic, prep, note,
    guests: guests.map(g => ({ email: g.email, ...(g.name ? { name: g.name } : {}) })),
  };
  const move = isMove && movingWhen
    ? { date, time, note: moveNote, fromDate: movingWhen.date, fromTime: movingWhen.time, fromDuration: moving!.durationMin }
    : undefined;

  const problems: string[] = [];
  if (!isMove && guests.length === 0) problems.push('הדביקו או כתבו לפחות כתובת מייל אחת.');
  if (needsName) problems.push('כתבו שם לאדם החדש — כך הזימון ייפתח בשמו, והוא יישמר כליד.');
  if (past) problems.push('המועד כבר עבר.');
  if (isMove && movingWhen && date === movingWhen.date && time === movingWhen.time && duration === moving!.durationMin) {
    problems.push('בחרו מועד חדש.');
  }
  const canSend = problems.length === 0 && connected && phase !== 'sending';
  // ‼ «לצאת בלי לשמור?» רק כשבאמת הוקלד משהו — לא בכל פתיחה מכרטיס לקוח או לשינוי מועד.
  const edited = isMove
    ? (date !== movingWhen!.date || time !== movingWhen!.time || duration !== moving!.durationMin)
    : (text.trim() !== (presetClient?.email ?? '') || !!note.trim() || !!topic.trim());

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setText(prev => (prev.trim() ? `${prev.trim()}\n${t}` : t)); return; }
    } catch { /* הדפדפן לא הרשה — מדביקים ידנית */ }
    pasteRef.current?.focus();
    setError({ code: 'paste', text: 'הדפדפן לא הרשה הדבקה אוטומטית. לחיצה ארוכה בתיבה ← «הדבק».' });
  }

  async function send() {
    setPhase('sending');
    setError(null);
    const r = isMove
      ? await api.send('move', { id, date, time, durationMin: duration, askedBy, note: moveNote })
      : await api.send('create', {
        id, kind, date, time, durationMin: duration, topic, prep, note,
        guests: input.guests, ...(presetClient ? { clientId: presetClient.id } : {}),
      });
    if (r.ok) { setResult(r.meeting); setPhase('done'); setUnknown(false); return; }
    setUnknown(r.error === 'unknown_outcome');
    setError({ code: r.error, text: r.text });
    setPhase(wide ? 'edit' : 'preview');
  }

  // ── מסך «נשלח» ──────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    const w = meetingWhen(result);
    const lead = result.leadId ? leads.find(l => l.id === result.leadId) : undefined;
    const client = result.clientId ? clients.find(c => c.id === result.clientId) : undefined;
    const first = result.guests[0];
    return (
      <Modal title={isMove ? 'המועד עודכן' : 'הזימון נשלח'} onClose={onClose} width={560}
        footer={<button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>סגירה</button>}>
        <div className="mt-dialog mt-done">
          <p className="mt-done-line">
            {isMove
              ? <>Google שלח לכל המוזמנים «הזמנה מעודכנת» ל{longDay(w.date)} ב-<span className="ltr-isolate">{w.time}</span>. המועד עודכן גם ביומן שלך.</>
              : <>הזימון יצא מהיומן שלך אל {result.guests.length === 1 ? 'נמען אחד' : `${result.guests.length} נמענים`}, והפגישה נכנסה ליומן שלך ל{longDay(w.date)} ב-<span className="ltr-isolate">{w.time}</span>.</>}
          </p>
          {!isMove && client && <p className="mt-muted">נרשם בפעילות של {clientName(client)}.</p>}
          {!isMove && !client && result.leadId && <p className="mt-muted">נוצר ליד: {lead?.fullName ?? first?.name} — ברשימת הלקוחות.</p>}
          {result.meetLink && (
            <p className="mt-muted">קישור הפגישה: <a href={result.meetLink} target="_blank" rel="noreferrer" className="ltr-isolate">{result.meetLink.replace(/^https:\/\//, '')}</a></p>
          )}
          {!isMove && first && (
            <CopyBox label="הודעה קצרה לוואטסאפ — שידעו שהזימון במייל"
              text={whatsappSentText({ guest: first, kind: result.kind, date: w.date, time: w.time })} />
          )}
        </div>
      </Modal>
    );
  }

  // ── הטופס ───────────────────────────────────────────────────────────────
  const form = (
    <div className="mt-form">
      {isMove ? (
        <div className="mt-field">
          <span className="mt-label">הפגישה</span>
          <div className="mt-static">{moving!.title}</div>
          <span className="mt-hint">היום במועד: {movingWhen!.label}</span>
        </div>
      ) : (
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-paste">עם מי?</label>
          <div className="mt-paste-row">
            <textarea id="mt-paste" ref={pasteRef} className="inp" rows={3} value={text} disabled={unknown}
              placeholder="הדביקו כאן את ההודעה מהוואטסאפ, או כתבו כתובת מייל"
              onChange={e => { setText(e.target.value); if (error?.code === 'paste') setError(null); }} />
            {!unknown && typeof navigator !== 'undefined' && !!navigator.clipboard?.readText && (
              <button type="button" className="ui-btn ui-btn-ghost mt-paste-btn" onClick={pasteFromClipboard}>הדבקה</button>
            )}
          </div>
          <span className="mt-hint">
            {guests.length === 0 ? 'כל כתובת מייל בטקסט תזוהה לבד — גם כמה בהודעה אחת.'
              : guests.length === 1 ? 'נמצאה כתובת אחת.' : `נמצאו ${guests.length} כתובות.`}
          </span>
          {presetClient?.spouseEmail && !guests.some(g => g.email === lower(presetClient.spouseEmail)) && !unknown && (
            <button type="button" className="act-chip" onClick={() => setText(t => `${t.trim()}\n${presetClient.spouseEmail}`)}>
              + גם {presetClient.spouseName || 'בן/בת הזוג'}
            </button>
          )}
          {guests.length > 0 && (
            <ul className="mt-guests">
              {guests.map((g, i) => (
                <li key={g.email} className="mt-guest">
                  <div className="mt-guest-id">
                    <span className="mt-guest-mail ltr-isolate">{g.email}</span>
                    <span className={`mt-guest-who ${g.known ? 'is-known' : ''}`}>
                      {g.known ? g.known.label
                        : kind === 'intro' && i === 0 ? (g.name ? 'חדש · יישמר כליד' : 'חדש · כתבו שם כדי לשמור כליד') : 'חדש'}
                    </span>
                  </div>
                  <input className="inp" aria-label={`שם עבור ${g.email}`} placeholder="שם לפנייה" value={names[g.email] ?? g.name}
                    disabled={unknown} data-autofocus={i === 0 && needsName ? true : undefined}
                    onChange={e => setNames(n => ({ ...n, [g.email]: e.target.value }))} />
                  {!unknown && (
                    <button type="button" className="ui-icon-btn" aria-label={`הסרת ${g.email}`}
                      onClick={() => setRemoved(s => new Set(s).add(g.email))}>✕</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isValidEmail(text.trim()) && text.includes('@') && guests.length === 0 && (
            <span className="mt-warn">הכתובת לא נראית שלמה.</span>
          )}
        </div>
      )}

      {!isMove && (
        <div className="mt-field">
          <span className="mt-label" id="mt-kind">סוג הפגישה</span>
          <div className="mt-seg" role="group" aria-labelledby="mt-kind">
            {(['intro', 'work'] as MeetingKind[]).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} disabled={unknown}
                onClick={() => { setKind(k); setDuration(MEETING_DEFAULT_MINUTES[k]); }}>
                <b>{MEETING_KIND_LABELS[k]}</b><small>{MEETING_KIND_HINTS[k]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isMove && kind === 'work' && (
        <>
          <div className="mt-field">
            <label className="mt-label" htmlFor="mt-topic">נושא הפגישה</label>
            <input id="mt-topic" className="inp" value={topic} disabled={unknown} placeholder="למשל: סגירת הדוח השנתי 2025"
              onChange={e => setTopic(e.target.value)} />
          </div>
          <div className="mt-field">
            <label className="mt-label" htmlFor="mt-prep">מה כדאי להכין <span className="mt-hint">(שורה לכל פריט, רשות)</span></label>
            <textarea id="mt-prep" className="inp" rows={2} value={prep} disabled={unknown} onChange={e => setPrep(e.target.value)} />
          </div>
        </>
      )}

      <div className="mt-when-row">
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-date">{isMove ? 'תאריך חדש' : 'תאריך'}</label>
          <input id="mt-date" type="date" className="inp" value={date} min={today} disabled={unknown} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-time">שעה</label>
          <select id="mt-time" className="inp" value={time} disabled={unknown} onChange={e => setTime(e.target.value)}>
            {!TIMES.includes(time) && <option value={time}>{time}</option>}
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-dur">משך</label>
          <select id="mt-dur" className="inp" value={duration} disabled={unknown} onChange={e => setDuration(Number(e.target.value))}>
            {!(MEETING_DURATIONS as readonly number[]).includes(duration) && <option value={duration}>{duration} דקות</option>}
            {MEETING_DURATIONS.map(d => <option key={d} value={d}>{d === 60 ? 'שעה' : d === 90 ? 'שעה וחצי' : `${d} דקות`}</option>)}
          </select>
        </div>
      </div>
      {connected && date && !past && (
        <div className={`mt-check ${busy?.slots == null ? '' : clash.length ? 'is-warn' : 'is-ok'}`} role="status">
          {busy?.slots == null ? 'בודק ביומן שלך…'
            : clash.length
              ? <>באותה שעה יש לך ביומן אירוע (<Ranges list={clash} />). אפשר לשלוח בכל זאת.</>
              : <>פנוי ביומן שלך ב{longDay(date)}, <span className="ltr-isolate">{time}–{end}</span>.</>}
          {otherBusy.length > 0 && !clash.length && (
            <div className="mt-busy">תפוס באותו יום: <Ranges list={otherBusy} /></div>
          )}
        </div>
      )}
      {weekend && <div className="mt-check is-warn">שימו לב: המועד בסוף שבוע.</div>}

      {isMove ? (
        <>
          <div className="mt-field">
            <span className="mt-label" id="mt-who">מי ביקש את השינוי?</span>
            <div className="mt-seg" role="group" aria-labelledby="mt-who">
              {([['office', 'אני', 'מתנצלים במשפט אחד'], ['guest', 'המוזמנים', '«כפי שסיכמנו»']] as const).map(([k, l, h]) => (
                <button key={k} type="button" aria-pressed={askedBy === k}
                  onClick={() => { setAskedBy(k); if (!moveNoteDirty) setMoveNote(MOVE_NOTE_DEFAULT[k]); }}>
                  <b>{l}</b><small>{h}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-field">
            <label className="mt-label" htmlFor="mt-move-note">השורה שתופיע בעדכון</label>
            <textarea id="mt-move-note" className="inp" rows={2} value={moveNote}
              onChange={e => { setMoveNote(e.target.value); setMoveNoteDirty(true); }} />
          </div>
        </>
      ) : (
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-note">שורה אישית <span className="mt-hint">(רשות, מיד אחרי הפנייה)</span></label>
          <textarea id="mt-note" className="inp" rows={2} value={note} disabled={unknown}
            placeholder="למשל: שמחתי לשמוע ממך. נדבר על פתיחת העסק." onChange={e => setNote(e.target.value)} />
        </div>
      )}
    </div>
  );

  const preview = (
    <InvitePreview input={input} org={org} fromEmail={api.connection?.email} date={date} time={time} move={move} />
  );

  const banner = !connected && api.connection ? (
    <div className="mt-banner" role="alert">
      יומן Google עוד לא מחובר, ולכן אי אפשר לשלוח. מחברים פעם אחת, וזה נשאר.
      <button type="button" className="ui-btn ui-btn-ghost" onClick={onOpenConnections}>לחיבור היומן</button>
    </div>
  ) : null;

  const errorBox = error && error.code !== 'paste' ? (
    <div className={`mt-banner ${unknown ? 'is-warn' : 'is-err'}`} role="alert">
      {error.text}
      {(error.code === 'google_not_connected' || error.code === 'google_reconnect') && (
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onOpenConnections}>לחיבור היומן</button>
      )}
    </div>
  ) : error?.code === 'paste' ? <div className="mt-hint" role="status">{error.text}</div> : null;

  const sendLabel = phase === 'sending' ? 'שולח…'
    : unknown ? 'שלח שוב (אותו זימון)'
      : isMove ? 'שלח עדכון מועד' : 'שלח זימון';

  const footer = !wide && phase === 'edit' ? (
    <>
      {problems[0] && <span className="mt-foot-why">{problems[0]}</span>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={problems.length > 0}
        onClick={() => setPhase('preview')}>{isMove ? 'לתצוגה ולעדכון' : 'לתצוגה ולשליחה'}</button>
    </>
  ) : (
    <>
      {!wide && <button type="button" className="ui-btn ui-btn-ghost ui-foot-start" disabled={phase === 'sending'} onClick={() => setPhase('edit')}>חזרה לעריכה</button>}
      {wide && problems[0] && <span className="mt-foot-why">{problems[0]}</span>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={!canSend} onClick={send}>{sendLabel}</button>
    </>
  );

  return (
    <Modal title={isMove ? 'שינוי מועד' : 'פגישה חדשה ב-Google Meet'} onClose={onClose} width={wide ? 1060 : 560}
      dirty={phase === 'sending' || edited} onGuardedClose={phase === 'sending' ? () => undefined : undefined}
      footer={footer}>
      <div className={`mt-dialog ${wide ? 'is-wide' : ''}`}>
        {connected && api.connection?.email && (
          <div className="mt-conn"><span className="mt-dot" aria-hidden="true" />הזימון יוצא מהיומן שלך: <span className="ltr-isolate">{api.connection.email}</span></div>
        )}
        {banner}
        {errorBox}
        {wide ? (
          <div className="mt-cols">
            {form}
            <aside className="mt-side" aria-label="כך זה יגיע">{preview}</aside>
          </div>
        ) : phase === 'edit' ? form : preview}
      </div>
    </Modal>
  );
}
