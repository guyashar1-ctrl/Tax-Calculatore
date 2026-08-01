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
    /* קבוצה = קו וכותרת. התיק הוא רשימה ארוכה של שדות, ושמונה קופסאות
       זו על גבי זו הופכות אותו לערימה — קו אחד לכל קבוצה מספיק להפריד. */
    <div className="dg">
      <button type="button" onClick={() => setOpen((o) => !o)} className="dg-head" aria-expanded={open}>
        <span className="dg-icon">{icon}</span>
        <span className="dg-title">{title}</span>
        <span className="dg-hint">{hint}</span>
        <span className={`dg-caret ${open ? 'is-open' : ''}`}>▾</span>
      </button>
      {open && <div className="dg-body">{children}</div>}
    </div>
  );
}

export default function ClientDossierTab({ client, update, patch, employees, isNew }: Props) {
  const regFile = registeredFileInfo(client);

  return (
    <div className="cw-tab" style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
      {/* ── העוגן: תיקים ברשויות — פעם אחת, תמיד למעלה ── */}
      {/* העוגן של התיק. הוא ראשון ובלתי-מתקפל, ולכן מיקומו כבר אומר
          שהוא העיקר — אין צורך במלבן ענברי מסביבו. */}
      <div className="dossier-anchor">
        <TaxFilesSection client={client} update={update} />
        {regFile && client.familyStatus === 'married' && (
          <div className="dossier-spouse-note" style={{ color: regFile.owner === 'spouse' ? 'var(--warn)' : 'var(--ink-3)' }}>
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
