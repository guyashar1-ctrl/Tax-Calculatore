// ─── «אנשי קשר» — לשונית בתוך «לקוחות» (226, החלטת גיא 07.10.2026) ────────────
// רו״ח אחר, עו״ד, יועץ… שם, תפקיד, איפה עובד/ת. המטרה: «קבע פגישה» מהר בפעם הבאה.
// ‼ אותה שפה כמו רשימת האנשים (pd-*): חיפוש, שורות, מגירה בדסקטופ / יריעה בטלפון.
// ‼ הבחירה חיה בכתובת (‎#/clients/p/{id}‎, כמו לקוח/ליד) — «אחורה» בטלפון סוגר.
// ‼ אין כאן «בעלים» אחרים: איש קשר נערך רק כאן (ובזימון — «שמור כאיש קשר»).

import { useMemo, useState } from 'react';
import Sheet from '../../components/ui/Sheet';
import { useToast } from '../../components/ui/Toast';
import type { Client } from '../../types';
import type { Lead } from '../../types/quotations';
import { normalizeEmail } from '../../utils/identity';
import { isValidEmail } from '../../../supabase/functions/_shared/meetingInvite';
import { meetingWhen, meetingsWithEmail, cueEmailKey, type Meeting } from '../meetings/meetingModel';
import {
  searchContacts, contactSubtitle, contactInitials, duplicateContact, CONTACT_ROLE_SUGGESTIONS, NEW_CONTACT_ID, type Contact,
} from './contactModel';
import type { ContactsApi } from './useContacts';
import './contacts.css';

interface Props {
  api: ContactsApi;
  clients: Client[];
  leads: Lead[];
  meetings: Meeting[];
  meetingCues: Map<string, string>;
  /** איש הקשר שהמגירה שלו פתוחה (NEW_CONTACT_ID = חדש) — מהכתובת. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onNewMeeting: (contactId: string) => void;
  query: string;
}

type Draft = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>;
const EMPTY: Draft = { fullName: '', role: '', organization: '', email: '', phone: '', notes: '' };

export default function ContactsPanel({ api, clients, leads, meetings, meetingCues, openId, onOpen, onNewMeeting, query }: Props) {
  const visible = useMemo(() => searchContacts(api.contacts, query), [api.contacts, query]);
  const selected = openId && openId !== NEW_CONTACT_ID ? api.contacts.find(c => c.id === openId) ?? null : null;

  return (
    <>
      <div className="pd-listhead">
        כל אנשי הקשר <span className="pd-count">({visible.length})</span>
      </div>
      <div>
        {visible.map(c => {
          const sub = contactSubtitle(c);
          return (
            <div key={c.id} className="pd-row ct-row" role="button" tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c.id); } }}>
              <div className="pd-person">
                <div className="pd-av">{contactInitials(c.fullName)}</div>
                <div>
                  <div className="pd-nm">{c.fullName}</div>
                  <div className="pd-meta">{sub || <span className="pd-ltr">{c.email || c.phone || '-'}</span>}</div>
                </div>
              </div>
              <div className="pd-contact">
                <span className="num pd-ltr">{c.phone || '-'}</span><br />
                <span className="pd-ltr">{c.email || '-'}</span>
              </div>
              <div className="pd-cue">{c.email ? meetingCues.get(cueEmailKey(c.email)) ?? '' : ''}</div>
              <div className="pd-arrow" aria-hidden="true">‹</div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="pd-empty">
          {api.contacts.length === 0 ? (
            <>
              <h3>עוד אין אנשי קשר</h3>
              <p>רו״ח אחר, עו״ד, יועץ — מי שאינו לקוח. שומרים פעם אחת, ובפעם הבאה קובעים איתו פגישה בלחיצה.</p>
              <p>אפשר גם לסמן «שמור כאיש קשר» בזימון לפגישת עבודה.</p>
            </>
          ) : (
            <>
              <h3>לא מצאנו איש קשר מתאים</h3>
              <p>אפשר לחפש לפי שם, תפקיד, מקום עבודה, מייל או טלפון.</p>
            </>
          )}
        </div>
      )}

      {(openId === NEW_CONTACT_ID || selected) && (
        <Sheet onClose={() => onOpen(null)} ariaLabel={selected ? `איש קשר: ${selected.fullName}` : 'איש קשר חדש'}>
          <ContactSheet key={selected?.id ?? 'new'} contact={selected} api={api} clients={clients} leads={leads}
            meetings={meetings} onClose={() => onOpen(null)} onSaved={id => onOpen(id)} onNewMeeting={onNewMeeting} />
        </Sheet>
      )}
    </>
  );
}

function ContactSheet({ contact, api, clients, leads, meetings, onClose, onSaved, onNewMeeting }: {
  contact: Contact | null;
  api: ContactsApi;
  clients: Client[];
  leads: Lead[];
  meetings: Meeting[];
  onClose: () => void;
  onSaved: (id: string) => void;
  onNewMeeting: (contactId: string) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(!contact);
  const [draft, setDraft] = useState<Draft>(() => (contact ? { ...EMPTY, ...contact } : EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch })); setError(null); };

  /** ‼ אדם אחד = רשומה אחת: מייל של לקוח/ליד אינו נשמר שוב כאיש קשר. */
  const emailOwner = useMemo(() => {
    const e = normalizeEmail(draft.email);
    if (!e) return null;
    const c = clients.find(x => normalizeEmail(x.email) === e || normalizeEmail(x.spouseEmail) === e);
    if (c) return `הלקוח ${`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}`;
    const l = leads.find(x => !x.convertedClientId && (normalizeEmail(x.email) === e || (x.companions ?? []).some(p => normalizeEmail(p.email) === e)));
    if (l) return `הפנייה של ${l.fullName}`;
    const dup = duplicateContact(api.contacts, e, contact?.id);
    return dup ? `איש הקשר ${dup.fullName}` : null;
  }, [draft.email, clients, leads, api.contacts, contact?.id]);

  const emailBad = !!draft.email?.trim() && !isValidEmail(draft.email.trim());
  const problem = !draft.fullName.trim() ? 'כתבו שם.'
    : emailBad ? 'כתובת המייל לא נראית שלמה.'
      : emailOwner ? `המייל הזה כבר שמור אצל ${emailOwner}.` : null;

  async function save() {
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const row = contact ? await api.update({ id: contact.id, ...draft }) : await api.add(draft);
      showToast(contact ? 'איש הקשר עודכן' : 'איש הקשר נשמר');
      setEditing(false);
      if (!contact) onSaved(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contact) return;
    if (!window.confirm(`למחוק את ${contact.fullName} מאנשי הקשר? פגישות שכבר נקבעו איתו לא יבוטלו.`)) return;
    try {
      await api.remove(contact.id);
      showToast('איש הקשר נמחק');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'המחיקה נכשלה. נסו שוב.');
    }
  }

  const name = contact?.fullName || draft.fullName || 'איש קשר חדש';
  const mine = meetingsWithEmail(meetings, contact?.email);

  return (
    <>
      <div className="pd-qv-head">
        <div className="pd-av pd-av-lg">{contactInitials(name)}</div>
        <div>
          <div className="pd-qv-name">{name}</div>
          <div className="pd-qv-state">{contact ? contactSubtitle(contact) || 'איש קשר' : 'איש קשר חדש'}</div>
        </div>
        <button type="button" className="pd-x" onClick={onClose} aria-label="סגירה" data-autofocus={contact ? true : undefined}>×</button>
      </div>
      <div className="pd-qv-body">
        {editing ? (
          <form className="ct-form" onSubmit={e => { e.preventDefault(); void save(); }}>
            <label className="ct-field">
              <span>שם מלא</span>
              <input className="inp" value={draft.fullName} onChange={e => set({ fullName: e.target.value })} data-autofocus={!contact ? true : undefined} />
            </label>
            <div className="ct-two">
              <label className="ct-field">
                <span>תפקיד</span>
                <input className="inp" list="ct-roles" value={draft.role ?? ''} placeholder="למשל רו״ח" onChange={e => set({ role: e.target.value })} />
              </label>
              <label className="ct-field">
                <span>איפה עובד/ת</span>
                <input className="inp" value={draft.organization ?? ''} placeholder="שם המשרד / החברה" onChange={e => set({ organization: e.target.value })} />
              </label>
            </div>
            <datalist id="ct-roles">{CONTACT_ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}</datalist>
            <div className="ct-two">
              <label className="ct-field">
                <span>מייל</span>
                <input className="inp pd-ltr" type="email" inputMode="email" dir="ltr" value={draft.email ?? ''} onChange={e => set({ email: e.target.value })} />
              </label>
              <label className="ct-field">
                <span>טלפון</span>
                <input className="inp pd-ltr" type="tel" inputMode="tel" dir="ltr" value={draft.phone ?? ''} onChange={e => set({ phone: e.target.value })} />
              </label>
            </div>
            <label className="ct-field">
              <span>הערות <small>(רשות)</small></span>
              <textarea className="inp" rows={2} value={draft.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
            </label>
            {(error || (emailOwner && draft.email)) && (
              <div className="ct-error" role="alert">{error ?? `המייל הזה כבר שמור אצל ${emailOwner}.`}</div>
            )}
            <div className="pd-qv-actions">
              <button type="button" className="pd-act" disabled={saving}
                onClick={() => (contact ? (setEditing(false), setDraft({ ...EMPTY, ...contact }), setError(null)) : onClose())}>ביטול</button>
              <button type="submit" className="pd-act pd-act-main" disabled={saving}>{saving ? 'שומר…' : 'שמירה'}</button>
            </div>
          </form>
        ) : contact && (
          <>
            <div className="pd-info">
              <div className="pd-cell">
                <div className="pd-lab">איפה עובד/ת</div>
                <div className="pd-val">{contact.organization || '-'}</div>
              </div>
              <div className="pd-cell">
                <div className="pd-lab">טלפון</div>
                <div className="pd-val num pd-ltr">{contact.phone || '-'}</div>
              </div>
              <div className="pd-cell">
                <div className="pd-lab">אימייל</div>
                <div className="pd-val pd-ltr">{contact.email || '-'}</div>
              </div>
            </div>
            {contact.notes && <div className="pd-regline">{contact.notes}</div>}

            <div className="pd-section">
              <div className="pd-st">פגישות</div>
              {!contact.email ? (
                <div className="pd-small">כדי לקבוע פגישה צריך מייל — הוסיפו אותו בעריכה.</div>
              ) : mine.upcoming.length + mine.past.length === 0 ? (
                <div className="pd-small">עוד לא נקבעה פגישה.</div>
              ) : (
                <div className="ct-meetings">
                  {mine.upcoming.map(m => (
                    <div key={m.id} className="ct-meeting is-next">
                      <b>{meetingWhen(m).label}</b>
                      <span>{m.title}</span>
                    </div>
                  ))}
                  {mine.past.slice(0, 3).map(m => (
                    <div key={m.id} className="ct-meeting">
                      <b>{meetingWhen(m).label}</b>
                      <span>{m.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pd-qv-actions">
              <button type="button" className="pd-act" onClick={() => setEditing(true)}>עריכה</button>
              <button type="button" className="pd-act pd-act-main" disabled={!contact.email}
                onClick={() => onNewMeeting(contact.id)}>קבע פגישה</button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className="ui-linkbtn" style={{ color: 'var(--danger)' }} onClick={remove}>
                מחיקת איש הקשר
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
