// ─── פגישה חדשה / שינוי מועד — זימון מהיומן של הרו"ח ───────────────────────
// הדמיה מאושרת: docs/MEETINGS-GOOGLE-CALENDAR.md (06.10.2026; סבב 3 — 07.10.2026).
// ‼ (סבב 3) «עם מי?» — חיפוש אחד על כל מי שכבר ב-PIVO, ו«+ אדם חדש» עם שם, מייל ו«מי זה?»
//   (peoplePicker.ts). הדבקה מוואטסאפ — כפתור משני (וגם הדבקה ישירה לתיבת החיפוש).
//   סוג הפגישה נבחר לבד לפי האדם הראשון, ו«היום שלך ביומן» מראה את היום מ-Google.
// ‼ מה שבתצוגה הוא מה שנשלח: אותה תבנית (נוסח המשרד מספריית הבקשות ← פגישות, או נוסח
//   המערכת) ואותה פונקציה בדפדפן ובשרת, אותם קלטים.
// ‼ מזהה הפגישה נקבע פעם אחת לחלון — «שלח» פעמיים או שליחה חוזרת אחרי «לא ידוע» לא
//   יוצרים פגישה שנייה (השרת גוזר ממנו את מזהה האירוע ב-Google).

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import type { Client } from '../../types';
import type { Lead } from '../../types/quotations';
import { CONTACT_ROLE_SUGGESTIONS, type Contact } from '../contacts/contactModel';
import {
  COMPANION_RELATIONS, COMPANION_RELATION_LABELS, DEFAULT_COMPANION_RELATION,
  type CalendarEvent, type CompanionRelation, type PeopleOutcome,
} from '../../../supabase/functions/_shared/meetingCore';
import type { FirmProfile } from '../../types/firmProfile';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  extractEmails, isValidEmail, israelToUtcIso, addMinutes, longDay,
  whatsappSentText, meetingTemplateFor, MEETING_KIND_LABELS, MEETING_KIND_HINTS, MEETING_DEFAULT_MINUTES, MEETING_DURATIONS,
  MOVE_NOTE_DEFAULT, type InviteOrg, type MeetingKind, type MoveAskedBy,
} from '../../../supabase/functions/_shared/meetingInvite';
import InvitePreview from './InvitePreview';
import CopyBox from './CopyBox';
import DayStrip, { clashesWith, slotsOfDay } from './DayStrip';
import {
  WHO_OPTIONS, autoKind, buildDirectory, defaultWho, guestsPayload, isCompanion, knownTag, kindWhyLine,
  newPersonFate, peopleFromPaste, peopleProblems, personFromKnown, searchDirectory, type Person, type Who,
} from './peoplePicker';
import { israelToday, meetingWhen, type Meeting } from './meetingModel';
import type { MeetingsApi } from './useMeetings';
import './meetings.css';

export type MeetingDialogMode =
  | { kind: 'new'; clientId?: string; leadId?: string; contactId?: string; date?: string; time?: string }
  | { kind: 'move'; meeting: Meeting };

interface Props {
  mode: MeetingDialogMode;
  clients: Client[];
  leads: Lead[];
  contacts: Contact[];
  profile: FirmProfile | null;
  api: MeetingsApi;
  onClose: () => void;
  onOpenConnections: () => void;
  /** «עריכת הנוסח» — ספריית הבקשות ← פגישות, על הנוסח של סוג הפגישה. */
  onOpenWording?: (kind: MeetingKind) => void;
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
const initials = (name: string, email: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w[1]?.[0] ?? '')) : email.charAt(0).toUpperCase();
};

/** כתובת מייל בתוך טקסט — כדי למצוא את «מה שנכתב אחרי המיילים» בשורה האחרונה. */
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * מה שמקלידים בסוף התיבה, בלי המיילים — לחיפוש לפי שם. ‼ רק השורה האחרונה, ורק כשיש בה
 * אות: הודעת וואטסאפ שהודבקה כולה לא תציף הצעות, ומספר טלפון אינו שם.
 */
export function nameQueryOf(text: string): string {
  const last = (text.split('\n').pop() ?? '').replace(EMAIL_IN_TEXT, ' ').trim();
  return last.length >= 2 && last.length <= 40 && /\p{L}/u.test(last) && !last.includes('@') ? last : '';
}

/**
 * מה קרה לליד — רק מה שהשרת אמר שנשמר (people). ‼ בלי people (שרת ישן) לא טוענים «נוצר»:
 * הפגישה פשוט נרשמה אצל הליד.
 */
export function peopleLine(people: PeopleOutcome | null, leadName: string): string {
  const n = people?.companionsAdded ?? 0;
  const added = n === 1 ? 'ונוסף לפנייה אדם אחד' : n > 1 ? `ונוספו לפנייה ${n} אנשים` : '';
  if (people?.leadCreated) {
    return `נוצר ליד: ${leadName}${n ? `, עם ${n === 1 ? 'אדם נוסף אחד' : `${n} אנשים נוספים`} בפנייה` : ''} — ברשימת הלקוחות.`;
  }
  if (people?.leadReopened) return `הליד ${leadName} נפתח מחדש וחזר לרשימת הלקוחות${added ? `, ${added}` : ''}.`;
  return `נרשם בפנייה של ${leadName}${added ? `, ${added}` : ''}.`;
}

type Phase = 'edit' | 'preview' | 'sending' | 'done';
interface NewCard { name: string; email: string; who: Who; role: string; organization: string }

/** ‼ כל טווח מבודד לחוד: רשימה שלמה בכיוון שמאל-לימין נקראת בעברית מהסוף להתחלה. */
function Ranges({ list }: { list: { start: string; end: string }[] }) {
  return <>{list.map((s, i) => <span key={i}>{i > 0 && ' · '}<span className="ltr-isolate">{s.start}–{s.end}</span></span>)}</>;
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

export default function MeetingDialog({ mode, clients, leads, contacts, profile, api, onClose, onOpenConnections, onOpenWording }: Props) {
  const wide = useMediaQuery('(min-width: 900px)');
  const org = useMemo(() => orgOf(profile), [profile]);
  const today = israelToday();
  const isMove = mode.kind === 'move';
  const moving = mode.kind === 'move' ? mode.meeting : null;
  const movingWhen = moving ? meetingWhen(moving) : null;
  const dir = useMemo(() => buildDirectory(clients, leads, contacts), [clients, leads, contacts]);

  // ── מי בפגישה כשהחלון נפתח: מכרטיס לקוח, מליד (עם כל מי שבפנייה), מאיש קשר ──
  // ‼ פעם אחת בפתיחה — לא מחדש בכל טעינה של הרשימות.
  const [initialPeople] = useState<Person[]>(() => {
    if (moving) return moving.guests.map(g => ({ email: lower(g.email), name: g.name ?? '', known: dir.get(lower(g.email)) }));
    if (mode.kind !== 'new') return [];
    const emails: string[] = [];
    const c = mode.clientId ? clients.find(x => x.id === mode.clientId) : undefined;
    const l = mode.leadId ? leads.find(x => x.id === mode.leadId) : undefined;
    const ct = mode.contactId ? contacts.find(x => x.id === mode.contactId) : undefined;
    if (c?.email) emails.push(c.email);
    if (l) emails.push(...[l.email, ...(l.companions ?? []).map(x => x.email)].filter((e): e is string => !!e));
    if (ct?.email) emails.push(ct.email);
    return [...new Set(emails.map(lower))].map(e => {
      const k = dir.get(e);
      return k ? personFromKnown(e, k) : { email: e, name: '', who: 'none' as Who };
    });
  });
  const presetClient = mode.kind === 'new' && mode.clientId ? clients.find(c => c.id === mode.clientId) : undefined;

  const [id] = useState(() => (moving ? moving.id : crypto.randomUUID()));
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [q, setQ] = useState('');
  const [card, setCard] = useState<NewCard | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [kindManual, setKindManual] = useState<MeetingKind | null>(moving?.kind ?? null);
  const [topic, setTopic] = useState(moving?.topic ?? '');
  const [prep, setPrep] = useState(moving?.prep ?? '');
  const [note, setNote] = useState(moving?.note ?? '');
  const [date, setDate] = useState(movingWhen?.date ?? (mode.kind === 'new' && mode.date ? mode.date : nextWorkday(today)));
  const [time, setTime] = useState(movingWhen?.time ?? (mode.kind === 'new' && mode.time ? mode.time : '10:00'));
  const [durManual, setDurManual] = useState<number | null>(moving?.durationMin ?? null);
  const [askedBy, setAskedBy] = useState<MoveAskedBy>('office');
  const [moveNote, setMoveNote] = useState(MOVE_NOTE_DEFAULT.office);
  const [moveNoteDirty, setMoveNoteDirty] = useState(false);
  const [phase, setPhase] = useState<Phase>('edit');
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [result, setResult] = useState<Meeting | null>(null);
  const [outcome, setOutcome] = useState<PeopleOutcome | null>(null);
  const [day, setDay] = useState<{ date: string; events: CalendarEvent[] | null; failed?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardNameRef = useRef<HTMLInputElement>(null);
  const connected = !!api.connection?.connected;

  const first = people[0];
  const kind: MeetingKind = kindManual ?? autoKind(first);
  const duration = durManual ?? MEETING_DEFAULT_MINUTES[kind];
  const tpl = meetingTemplateFor(kind, profile?.settings?.commTemplates);
  const locked = unknown || phase === 'sending';

  // ── חיפוש ───────────────────────────────────────────────────────────────
  const chosen = useMemo(() => new Set(people.map(p => p.email)), [people]);
  const hits = useMemo(() => (isMove ? [] : searchDirectory(dir, q, chosen)), [dir, q, chosen, isMove]);
  const qEmail = isValidEmail(q.trim()) ? lower(q) : '';
  const qName = !q.includes('@') && q.trim().length >= 2 ? q.trim() : '';

  function addPeople(list: Person[]) {
    if (list.length === 0) return;
    setPeople(ps => [...ps, ...list.filter(p => !ps.some(x => x.email === p.email))]);
    setQ('');
  }
  function openCard(seed: Partial<NewCard> = {}) {
    setCard({ name: '', email: '', who: defaultWho(people), role: '', organization: '', ...seed });
    setPasteOpen(false);
    setQ('');
    requestAnimationFrame(() => cardNameRef.current?.focus());
  }
  /** הדבקה של הודעה שלמה לתיבת החיפוש — כל המיילים שבה נכנסים לפגישה. */
  function onSearchChange(v: string) {
    const found = extractEmails(v);
    if (found.length > 1 || (found.length === 1 && /[\s:]/.test(v.trim()))) {
      addPeople(peopleFromPaste(v, dir, people));
      return;
    }
    setQ(v);
  }
  const cardEmail = lower(card?.email);
  const cardErr = !card ? null
    : !isValidEmail(cardEmail) ? (card.email.trim() ? 'הכתובת לא נראית שלמה.' : null)
      : chosen.has(cardEmail) ? 'האדם הזה כבר בפגישה.'
        : null;
  const cardKnown = card && isValidEmail(cardEmail) ? dir.get(cardEmail) : undefined;
  const cardReady = !!card && isValidEmail(cardEmail) && !chosen.has(cardEmail) && (card.who === 'none' || !!card.name.trim() || !!cardKnown);
  function addCard() {
    if (!card || !cardReady) return;
    addPeople([cardKnown ? personFromKnown(cardEmail, cardKnown) : {
      email: cardEmail, name: card.name.trim(), who: card.who,
      ...(card.who === 'contact' ? { role: card.role.trim(), organization: card.organization.trim() } : {}),
    }]);
    setCard(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }
  function addPasted() {
    const list = peopleFromPaste(pasteText, dir, people);
    addPeople(list);
    if (list.length) { setPasteOpen(false); setPasteText(''); }
  }
  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setPasteText(t); return; }
    } catch { /* הדפדפן לא הרשה — מדביקים ידנית */ }
    setError({ code: 'paste', text: 'הדפדפן לא הרשה הדבקה אוטומטית. לחיצה ארוכה בתיבה ← «הדבק».' });
  }
  const patch = (email: string, p: Partial<Person>) => setPeople(ps => ps.map(x => (x.email === email ? { ...x, ...p } : x)));
  const remove = (email: string) => setPeople(ps => ps.filter(x => x.email !== email));

  // ── «היום שלך ביומן» — מ-Google ────────────────────────────────────────
  useEffect(() => {
    if (!connected || !date || date < today) return;
    let cancelled = false;
    setDay({ date, events: null });
    const t = setTimeout(async () => {
      const r = await api.events(date, nextDay(date));
      if (!cancelled) setDay({ date, events: r.events ?? [], failed: r.events === null });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [date, connected]);

  const start = date && time ? israelToUtcIso(date, time) : '';
  const past = !!start && Date.parse(start) < Date.now() - 5 * 60000;
  const end = addMinutes(time, duration);
  const daySlots = day?.date === date && day.events ? slotsOfDay(day.events, date, moving?.id) : null;
  const clash = daySlots ? clashesWith(daySlots.timed, time, duration) : [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 6 || (weekday === 5 && time >= '13:00');

  const input = {
    kind, durationMin: duration, topic, prep: kind === 'work' ? prep : '', note,
    guests: people.map(p => ({ email: p.email, ...(p.name.trim() ? { name: p.name.trim() } : {}) })),
  };
  const move = isMove && movingWhen
    ? { date, time, note: moveNote, fromDate: movingWhen.date, fromTime: movingWhen.time, fromDuration: moving!.durationMin }
    : undefined;

  const problems: string[] = isMove ? [] : peopleProblems(people);
  if (!isMove && kind === 'work' && !topic.trim()) problems.push('כתבו נושא לפגישה — הוא נכנס לכותרת ולהזמנה.');
  if (card && !isMove) problems.push('סיימו להוסיף את האדם החדש (או «ביטול»).');
  if (past) problems.push('המועד כבר עבר.');
  if (isMove && movingWhen && date === movingWhen.date && time === movingWhen.time && duration === moving!.durationMin) {
    problems.push('בחרו מועד חדש.');
  }
  const canSend = problems.length === 0 && connected && phase !== 'sending';
  // ‼ «לצאת בלי לשמור?» רק כשבאמת הוקלד משהו — לא בכל פתיחה מכרטיס לקוח או לשינוי מועד.
  const edited = isMove
    ? (date !== movingWhen!.date || time !== movingWhen!.time || duration !== moving!.durationMin)
    : (people.length !== initialPeople.length || !!note.trim() || !!topic.trim() || !!card || !!pasteText.trim());

  async function send() {
    setPhase('sending');
    setError(null);
    const r = isMove
      ? await api.send('move', { id, date, time, durationMin: duration, askedBy, note: moveNote })
      : await api.send('create', {
        id, kind, date, time, durationMin: duration, topic, prep: kind === 'work' ? prep : '', note,
        guests: guestsPayload(people, kind),
        ...(presetClient ? { clientId: presetClient.id } : {}),
      });
    if (r.ok) { setResult(r.meeting); setOutcome(r.people ?? null); setPhase('done'); setUnknown(false); return; }
    setUnknown(r.error === 'unknown_outcome');
    setError({ code: r.error, text: r.text });
    setPhase(wide ? 'edit' : 'preview');
  }

  function openWording() {
    if (!onOpenWording) return;
    if (edited && !window.confirm('לעבור לעריכת הנוסח? מה שהוקלד בחלון הזה לא יישמר.')) return;
    onOpenWording(kind);
  }

  // ── מסך «נשלח» ──────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    const w = meetingWhen(result);
    const lead = result.leadId ? leads.find(l => l.id === result.leadId) : undefined;
    const client = result.clientId ? clients.find(c => c.id === result.clientId) : undefined;
    const firstGuest = result.guests[0];
    // ‼ הראשון נעשה «הליד של הפגישה» (newLead) — אלא אם יש לקוח בפגישה; אז כל לקוח פוטנציאלי — ליד משלו.
    const extraNames = people.filter((p, i) => !p.known && p.who === 'lead' && !isCompanion(people, i, kind)
      && !(i === 0 && !result.clientId)).map(p => p.name);
    const extraN = outcome?.extraLeadsCreated ?? 0;
    const contactNames = people.filter(p => !p.known && p.who === 'contact').map(p => p.name);
    const leadNews = !!(outcome?.leadCreated || outcome?.leadReopened || outcome?.companionsAdded);
    return (
      <Modal title={isMove ? 'המועד עודכן' : 'הזימון נשלח'} onClose={onClose} width={560}
        footer={<button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>סגירה</button>}>
        <div className="mt-dialog mt-done">
          <p className="mt-done-line">
            {isMove
              ? <>Google שלח לכל המוזמנים «הזמנה מעודכנת» ל{longDay(w.date)} ב-<span className="ltr-isolate">{w.time}</span>. המועד עודכן גם ביומן שלך.</>
              : <>הזימון יצא מהיומן שלך אל {result.guests.length === 1 ? 'נמען אחד' : `${result.guests.length} נמענים`}, והפגישה נכנסה ליומן שלך ל{longDay(w.date)} ב-<span className="ltr-isolate">{w.time}</span> — היא מופיעה גם בלשונית «יומן».</>}
          </p>
          {!isMove && client && <p className="mt-muted">נרשם בפעילות של {`${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()}.</p>}
          {!isMove && !client && result.leadId && (leadNews || extraN === 0) && (
            <p className="mt-muted">{peopleLine(outcome, lead?.fullName ?? firstGuest?.name ?? '')}</p>
          )}
          {!isMove && extraN > 0 && (
            <p className="mt-muted">
              {extraN === extraNames.length ? `נוצר ליד: ${extraNames.join(', ')}` : `נוצרו ${extraN} לידים`} — ברשימת הלקוחות.
            </p>
          )}
          {!isMove && !!outcome?.contactsSaved && (
            <p className="mt-muted">נשמר באנשי הקשר: {contactNames.join(', ')}.</p>
          )}
          {result.meetLink && (
            <p className="mt-muted">קישור הפגישה: <a href={result.meetLink} target="_blank" rel="noreferrer" className="ltr-isolate">{result.meetLink.replace(/^https:\/\//, '')}</a></p>
          )}
          {!isMove && firstGuest && (
            <CopyBox label="הודעה קצרה לוואטסאפ — שידעו שהזימון במייל"
              text={whatsappSentText({ guest: firstGuest, kind: result.kind, date: w.date, time: w.time })} />
          )}
        </div>
      </Modal>
    );
  }

  // ── «עם מי?» ────────────────────────────────────────────────────────────
  const whoField = isMove ? (
    <div className="mt-field">
      <span className="mt-label">הפגישה</span>
      <div className="mt-static">{moving!.title}</div>
      <span className="mt-hint">היום במועד: {movingWhen!.label}</span>
    </div>
  ) : (
    <div className="mt-field">
      <label className="mt-label" htmlFor="mt-q">עם מי?</label>
      <input id="mt-q" ref={searchRef} className="inp" type="search" autoComplete="off" value={q} disabled={locked}
        placeholder="שם או מייל — לקוח, ליד או איש קשר" onChange={e => onSearchChange(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (hits[0]) addPeople([personFromKnown(hits[0].email, hits[0].k)]);
          else if (qEmail) openCard({ email: qEmail });
        }} />
      {(hits.length > 0 || qEmail || qName) && !locked && (
        <div className="mt-name-hits" role="list" aria-label="נמצאו ב-PIVO">
          {hits.map(({ email, k }) => (
            <button key={email} type="button" role="listitem" className="mt-name-hit" onClick={() => addPeople([personFromKnown(email, k)])}>
              <b>{k.name || email}</b>
              <small>{knownTag(k, kind)} · <span className="ltr-isolate">{email}</span></small>
            </button>
          ))}
          {qEmail && !dir.has(qEmail) && !chosen.has(qEmail) && (
            <button type="button" role="listitem" className="mt-name-hit is-new" onClick={() => openCard({ email: qEmail })}>
              <b>+ אדם חדש</b><small><span className="ltr-isolate">{qEmail}</span> · לא נמצא ב-PIVO</small>
            </button>
          )}
          {qName && hits.length === 0 && (
            <button type="button" role="listitem" className="mt-name-hit is-new" onClick={() => openCard({ name: qName })}>
              <b>+ אדם חדש בשם «{qName}»</b><small>לא נמצא ב-PIVO — נוסיף שם ומייל</small>
            </button>
          )}
        </div>
      )}
      {!card && !pasteOpen && !locked && (
        <div className="mt-add-row">
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => openCard()}>+ אדם חדש</button>
          <button type="button" className="ui-linkbtn" onClick={() => { setPasteOpen(true); setCard(null); }}>הדבקה מוואטסאפ</button>
        </div>
      )}

      {card && (
        <div className="mt-card" role="group" aria-label="אדם חדש">
          <div className="mt-two">
            <label className="mt-field">
              <span className="mt-sublabel">שם מלא</span>
              <input ref={cardNameRef} className="inp" value={card.name} placeholder="למשל: דני לוי"
                onChange={e => setCard({ ...card, name: e.target.value })} />
            </label>
            <label className="mt-field">
              <span className="mt-sublabel">מייל</span>
              <input className="inp" type="email" inputMode="email" dir="ltr" value={card.email} placeholder="name@example.com"
                onChange={e => setCard({ ...card, email: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCard(); } }} />
            </label>
          </div>
          {cardErr && <span className="mt-warn">{cardErr}</span>}
          {cardKnown ? (
            <span className="mt-hint">כבר ב-PIVO: {cardKnown.name} · {knownTag(cardKnown, kind)}. יתווסף מהרשומה הקיימת.</span>
          ) : (
            <div className="mt-field">
              <span className="mt-sublabel" id="mt-who">מי זה?</span>
              <div className="mt-seg mt-seg-3" role="group" aria-labelledby="mt-who">
                {WHO_OPTIONS.map(o => (
                  <button key={o.who} type="button" aria-pressed={card.who === o.who} onClick={() => setCard({ ...card, who: o.who })}>
                    <b>{o.label}</b><small>{o.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!cardKnown && card.who === 'contact' && (
            <div className="mt-two">
              <label className="mt-field">
                <span className="mt-sublabel">תפקיד</span>
                <input className="inp" list="mt-roles" value={card.role} placeholder="למשל: רו״ח" onChange={e => setCard({ ...card, role: e.target.value })} />
              </label>
              <label className="mt-field">
                <span className="mt-sublabel">איפה עובד/ת</span>
                <input className="inp" value={card.organization} placeholder="שם המשרד או החברה" onChange={e => setCard({ ...card, organization: e.target.value })} />
              </label>
            </div>
          )}
          {!cardKnown && card.who !== 'none' && !card.name.trim() && isValidEmail(cardEmail) && (
            <span className="mt-hint">כתבו שם — כך הזימון ייפתח בשמו, והוא יישמר {card.who === 'lead' ? 'כליד' : 'באנשי הקשר'}.</span>
          )}
          <div className="mt-add-row">
            <button type="button" className="ui-btn ui-btn-primary" disabled={!cardReady} onClick={addCard}>הוסף לפגישה</button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setCard(null)}>ביטול</button>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="mt-card" role="group" aria-label="הדבקה מוואטסאפ">
          <label className="mt-field">
            <span className="mt-sublabel">הדביקו את ההודעה מהוואטסאפ</span>
            <textarea className="inp" rows={3} value={pasteText} placeholder="כל כתובת מייל בהודעה תזוהה — גם כמה בהודעה אחת"
              onChange={e => { setPasteText(e.target.value); if (error?.code === 'paste') setError(null); }} />
          </label>
          <span className="mt-hint">
            {(() => {
              const n = extractEmails(pasteText).filter(e => !chosen.has(e)).length;
              return !pasteText.trim() ? 'השם של מי ששלח את ההודעה נלקח ממנה. לכל אדם חדש תבחרו «מי זה?».'
                : n === 0 ? 'לא נמצאה כתובת מייל חדשה בהודעה.' : n === 1 ? 'נמצאה כתובת אחת.' : `נמצאו ${n} כתובות.`;
            })()}
          </span>
          <div className="mt-add-row">
            <button type="button" className="ui-btn ui-btn-primary" disabled={extractEmails(pasteText).every(e => chosen.has(e))} onClick={addPasted}>
              הוסף את מה שנמצא
            </button>
            {typeof navigator !== 'undefined' && !!navigator.clipboard?.readText && (
              <button type="button" className="ui-btn ui-btn-ghost" onClick={pasteFromClipboard}>הדבקה</button>
            )}
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => { setPasteOpen(false); setPasteText(''); }}>ביטול</button>
          </div>
        </div>
      )}

      {presetClient?.spouseEmail && !chosen.has(lower(presetClient.spouseEmail)) && !locked && (
        <button type="button" className="act-chip" onClick={() => {
          const e = lower(presetClient.spouseEmail);
          const k = dir.get(e);
          addPeople([k ? personFromKnown(e, k) : { email: e, name: presetClient.spouseName ?? '', who: 'none' }]);
        }}>
          + גם {presetClient.spouseName || 'בן/בת הזוג'}
        </button>
      )}

      {people.length > 0 && (
        <ul className="mt-people" aria-label="בפגישה">
          {people.map((p, i) => (
            <li key={p.email} className={`mt-person${p.known ? '' : ' is-new'}`}>
              <span className="mt-person-av" aria-hidden="true">{initials(p.name, p.email)}</span>
              <div className="mt-person-id">
                {p.known ? (
                  <div className="mt-person-name"><b>{p.name || p.email}</b><span className="mt-tag is-known">{knownTag(p.known, kind)}</span></div>
                ) : (
                  <div className="mt-person-name">
                    <input className="inp mt-person-input" aria-label={`שם מלא עבור ${p.email}`} placeholder="שם מלא" value={p.name} disabled={locked}
                      onChange={e => patch(p.email, { name: e.target.value })} />
                    <span className="mt-tag is-new">חדש</span>
                  </div>
                )}
                <span className="mt-person-mail ltr-isolate">{p.email}</span>
              </div>
              {!locked && (
                <button type="button" className="ui-icon-btn" aria-label={`הסרת ${p.name || p.email} מהפגישה`} onClick={() => remove(p.email)}>✕</button>
              )}
              {!p.known && (
                <div className="mt-person-extra">
                  <label className="mt-inline-field">
                    <span>מי זה?</span>
                    <select className="inp" value={p.who ?? 'none'} disabled={locked} onChange={e => patch(p.email, { who: e.target.value as Who })}>
                      {WHO_OPTIONS.map(o => <option key={o.who} value={o.who}>{o.label}</option>)}
                    </select>
                  </label>
                  <span className="mt-person-fate">{newPersonFate(people, i, kind)}</span>
                  {p.who === 'contact' && (
                    <div className="mt-two">
                      <input className="inp" list="mt-roles" placeholder="תפקיד (למשל רו״ח)" aria-label={`תפקיד של ${p.email}`}
                        value={p.role ?? ''} disabled={locked} onChange={e => patch(p.email, { role: e.target.value })} />
                      <input className="inp" placeholder="איפה עובד/ת" aria-label={`מקום העבודה של ${p.email}`}
                        value={p.organization ?? ''} disabled={locked} onChange={e => patch(p.email, { organization: e.target.value })} />
                    </div>
                  )}
                  {isCompanion(people, i, kind) && (
                    <label className="mt-inline-field">
                      <span>מה הקשר ל{people[0].name || 'פונה הראשון'}?</span>
                      <select className="inp" value={p.relation ?? DEFAULT_COMPANION_RELATION} disabled={locked}
                        onChange={e => patch(p.email, { relation: e.target.value as CompanionRelation })}>
                        {COMPANION_RELATIONS.map(r => <option key={r} value={r}>{COMPANION_RELATION_LABELS[r]}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <datalist id="mt-roles">{CONTACT_ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}</datalist>
    </div>
  );

  // ── הטופס ───────────────────────────────────────────────────────────────
  const form = (
    <div className="mt-form">
      {whoField}

      {!isMove && (
        <div className="mt-field">
          <span className="mt-label" id="mt-kind">סוג הפגישה</span>
          <div className="mt-seg" role="group" aria-labelledby="mt-kind">
            {(['intro', 'work'] as MeetingKind[]).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} disabled={locked}
                onClick={() => { setKindManual(k); setDurManual(null); }}>
                <b>{MEETING_KIND_LABELS[k]}</b><small>{MEETING_KIND_HINTS[k]} · {MEETING_DEFAULT_MINUTES[k]} דק׳</small>
              </button>
            ))}
          </div>
          {first && kindManual === null && <span className="mt-why-line">{kindWhyLine(first)}</span>}
        </div>
      )}

      {!isMove && kind === 'work' && (
        <>
          <div className="mt-field">
            <label className="mt-label" htmlFor="mt-topic">נושא הפגישה</label>
            <input id="mt-topic" className="inp" value={topic} disabled={locked} placeholder="למשל: סגירת הדוח השנתי 2025"
              onChange={e => setTopic(e.target.value)} />
          </div>
          <div className="mt-field">
            <label className="mt-label" htmlFor="mt-prep">מה כדאי להכין <span className="mt-hint">(שורה לכל פריט, רשות)</span></label>
            <textarea id="mt-prep" className="inp" rows={2} value={prep} disabled={locked} onChange={e => setPrep(e.target.value)} />
          </div>
        </>
      )}

      <div className="mt-when-row">
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-date">{isMove ? 'תאריך חדש' : 'תאריך'}</label>
          <input id="mt-date" type="date" className="inp" value={date} min={today} disabled={locked} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-time">שעה</label>
          <select id="mt-time" className="inp" value={time} disabled={locked} onChange={e => setTime(e.target.value)}>
            {!TIMES.includes(time) && <option value={time}>{time}</option>}
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-field">
          <label className="mt-label" htmlFor="mt-dur">משך</label>
          <select id="mt-dur" className="inp" value={duration} disabled={locked} onChange={e => setDurManual(Number(e.target.value))}>
            {!(MEETING_DURATIONS as readonly number[]).includes(duration) && <option value={duration}>{duration} דקות</option>}
            {MEETING_DURATIONS.map(d => <option key={d} value={d}>{d === 60 ? 'שעה' : d === 90 ? 'שעה וחצי' : `${d} דקות`}</option>)}
          </select>
        </div>
      </div>

      {connected && date && !past && (
        <div className="mt-field">
          <span className="mt-label">היום שלך ביומן <span className="mt-hint">— לחיצה על מקום פנוי בוחרת שעה</span></span>
          {daySlots && <DayStrip slots={daySlots.timed} time={time} durationMin={duration} disabled={locked} onPick={setTime} />}
          {daySlots && daySlots.allDay.length > 0 && <span className="mt-hint">כל היום: {daySlots.allDay.join(' · ')}</span>}
          <div className={`mt-check ${!daySlots ? '' : clash.length ? 'is-warn' : 'is-ok'}`} role="status">
            {day?.failed ? 'לא הצלחנו לקרוא את היומן כרגע. אפשר לשלוח בכל זאת.'
              : !daySlots ? 'בודק ביומן שלך…'
                : clash.length
                  ? <>באותה שעה יש לך ביומן: {clash.map(c => c.title).join(', ')} (<Ranges list={clash} />). אפשר לשלוח בכל זאת.</>
                  : <>פנוי ביומן שלך ב{longDay(date)}, <span className="ltr-isolate">{time}–{end}</span>.</>}
          </div>
        </div>
      )}
      {weekend && <div className="mt-check is-warn">שימו לב: המועד בסוף שבוע.</div>}

      {isMove ? (
        <>
          <div className="mt-field">
            <span className="mt-label" id="mt-asked">מי ביקש את השינוי?</span>
            <div className="mt-seg" role="group" aria-labelledby="mt-asked">
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
          <textarea id="mt-note" className="inp" rows={2} value={note} disabled={locked}
            placeholder="למשל: שמחתי לשמוע ממך. נדבר על פתיחת העסק." onChange={e => setNote(e.target.value)} />
        </div>
      )}
    </div>
  );

  const preview = (
    <InvitePreview input={input} org={org} tpl={tpl} fromEmail={api.connection?.email} date={date} time={time} move={move}
      onEditWording={onOpenWording ? openWording : undefined} />
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
