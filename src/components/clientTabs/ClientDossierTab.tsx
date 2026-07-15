// ─── לשונית "התיק" — כל העובדות על הלקוח, בתצוגה המפורטת ────────────────────
// מבנה (לפי משוב גיא 15.07): התיקים ברשויות פעם אחת למעלה (העוגן), ואחריהם
// הטפסים המפורטים במלואם — פרטים אישיים/משפחה/נכסים/חשבונות/זיכויים ואז
// מיסוי וב"ל. תמונת ה-5 שניות היא תפקיד מרכז השליטה; "התיק" הוא מסך העומק.
// מודולריות: תחום חדש בעתיד = קטע חדש כאן + אות במרכז השליטה, לא לשונית.

import { useState } from 'react';
import type { Client } from '../../types';
import type { Employee } from '../../types/clientWorkspace';
import type { AnnualReportSession } from '../../features/annualReport/types';
import { registeredFileInfo } from '../../features/annualReport/profile';
import TaxFilesSection from './TaxFilesSection';
import PersonalContactsTab from './PersonalContactsTab';
import TaxNITab from './TaxNITab';

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
  patch: (partial: Partial<Client>) => void;
  patchAndSave: (partial: Partial<Client>) => Promise<void>;
  employees: Employee[];
  sessions: AnnualReportSession[];
  isNew?: boolean;
}

/** קבוצת תוכן מתקפלת — כותרת דביקה שמאפשרת דילוג מהיר בין שני חלקי התיק. */
function DossierGroup({
  icon, title, hint, defaultOpen, children,
}: {
  icon: string;
  title: string;
  hint: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', width: '100%',
          background: 'var(--gray-50)', border: 'none', cursor: 'pointer', textAlign: 'right',
          padding: '.75rem 1rem', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <b style={{ fontSize: '1rem' }}>{title}</b>
        <span style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>{hint}</span>
        <span style={{ marginRight: 'auto', color: 'var(--gray-400)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && <div style={{ padding: '.4rem .8rem .8rem' }}>{children}</div>}
    </div>
  );
}

export default function ClientDossierTab({ client, update, patch, employees, isNew }: Props) {
  const regFile = registeredFileInfo(client);

  return (
    <div className="cw-tab" style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
      {/* ── העוגן: תיקים ברשויות — פעם אחת, תמיד למעלה ── */}
      <div style={{ border: '1.5px solid #e5d9b2', borderRadius: 12, background: '#fffdf6', padding: '.6rem .9rem' }}>
        <TaxFilesSection client={client} update={update} />
        {regFile && client.familyStatus === 'married' && (
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: regFile.owner === 'spouse' ? '#b45309' : 'var(--gray-600)', marginTop: '.35rem' }}>
            {regFile.owner === 'spouse' ? '⚠' : '🗄️'} בן/בת הזוג הרשום/ה: {regFile.name}
            {regFile.idNumber ? ` · ת.ז. ${regFile.idNumber}` : ''} — כל ההתנהלות מול מ"ה בת.ז. הזו
          </div>
        )}
      </div>

      {/* ── התצוגה המפורטת — כל השדות, עריכה ישירה ── */}
      <DossierGroup
        icon="👤"
        title="פרטים אישיים, משפחה ונכסים"
        hint="זהות · בן/בת זוג · ילדים · נקודות זיכוי · מעבידים · עסקים · נדל&quot;ן · בנקים · פנסיה"
        defaultOpen
      >
        <PersonalContactsTab client={client} update={update} patch={patch} employees={employees} />
      </DossierGroup>

      <DossierGroup
        icon="🏛️"
        title="מיסוי, ביטוח לאומי ושע&quot;ם"
        hint="סיווגים · מקדמות · מע&quot;מ · ניכויים · ב&quot;ל · הצהרת הון"
        defaultOpen={!isNew}
      >
        <TaxNITab client={client} update={update} hideFiles />
      </DossierGroup>
    </div>
  );
}
