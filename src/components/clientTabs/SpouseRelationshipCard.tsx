// ─── כרטיס יחסי בן/בת זוג — נוכחות אחת קבועה בתיק המס (158) ─────────────────
//
// עד עכשיו הדרך היחידה לגלות שיש כניסה לבן/בת זוג ("פתיחת כרטיס לקוח",
// "פתיחת הכרטיס הקיים") הייתה למצוא אותה בתוך "התיק" (עריכה מלאה) —
// לא במקום שבו הרו"ח נוחת קודם (תיק מס). הכרטיס הזה חוזר על אותה שאלה
// בדיוק שכבר קיימת שם, רק כתקציר-מבט-אחד למעלה: מי בן/בת הזוג, לקוח/ה
// שלנו או לא, יש עסק חיצוני, ומה הפעולה המתבקשת.
//
// ‼ לא מנגנון שני: זה תצוגה בלבד מעל אותם handlers/שדות קיימים
// (spouseClientId, spouseRepresentedElsewhere, onCreateSpouseClient,
// onOpenSpouseClient, resolveIncomeTaxHousehold) — שום לוגיקה חדשה.
//
// ‼ בלי ניחוש מגדר: אין שדה spouseGender על הכרטיס, ולכן הניסוח נשאר
// ניטרלי ("בן/בת זוג", "לקוח/ה") — בדיוק כמו בכל שאר המסך הזה.

import { useState } from 'react';
import type { Client } from '../../types';
import { spouseDisplayName, registeredFileInfo } from '../../features/annualReport/profile';
import { resolveIncomeTaxHousehold } from '../../utils/personRepresentation';

interface Props {
  client: Client;
  /** הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150). */
  spouseClient?: Client;
  onCreateSpouseClient?: () => Promise<void> | void;
  onOpenSpouseClient?: (clientId: string) => void;
}

export default function SpouseRelationshipCard({ client, spouseClient, onCreateSpouseClient, onOpenSpouseClient }: Props) {
  const [creating, setCreating] = useState(false);

  if (client.familyStatus !== 'married') return null;

  const name = spouseDisplayName(client);
  const linked = !!client.spouseClientId;
  const elsewhere = !linked && !!client.spouseRepresentedElsewhere;

  async function handleCreate() {
    if (!onCreateSpouseClient || creating) return;
    setCreating(true);
    try {
      await onCreateSpouseClient();
    } finally {
      setCreating(false);
    }
  }

  // ‼ (159) תיק מס הכנסה אחד לזוג (150) — נקרא תמיד, לא רק כשיש spouseClientId.
  // אצל לקוח ותיק בן/בת הזוג לרוב אינם כרטיס נפרד בכלל, והתיק המשותף רשום
  // דרך taxFiles[income_tax].owner==='spouse' על הכרטיס הזה עצמו (בעלות
  // legacy) — לא על spouseClient. תלייה ב-linked כאן השאירה את השורה
  // הזאת ריקה בדיוק ללקוחות הוותיקים ביותר, ההפך הגמור מהכוונה.
  const household = resolveIncomeTaxHousehold(client, spouseClient);
  const registeredWith = household.represented && household.holderClient
    ? registeredFileInfo(household.holderClient)
    : null;

  const status = linked
    ? 'בן/בת זוג · לקוח/ה'
    : elsewhere
    ? 'בן/בת זוג · יש עסק · מיוצג/ת אצל רו״ח אחר'
    : 'בן/בת זוג · לא לקוח/ה נפרד/ת';

  return (
    <div className="txf-spouse">
      <div className="txf-spouse-id">
        <span className="txf-spouse-name">{name}</span>
        <span className={'txf-spouse-status' + (linked ? ' is-linked' : elsewhere ? ' is-elsewhere' : '')}>
          {status}
        </span>
        {household.represented && (
          <span className="txf-spouse-note">
            מס הכנסה משותף{registeredWith?.name ? ` · התיק רשום על ${registeredWith.name}` : ''}
          </span>
        )}
      </div>
      <div className="txf-spouse-action">
        {linked ? (
          onOpenSpouseClient && (
            <button type="button" className="ui-linkbtn"
              onClick={() => onOpenSpouseClient(client.spouseClientId!)}>
              {'→'} פתיחת כרטיס הלקוח של {name}
            </button>
          )
        ) : elsewhere ? (
          onCreateSpouseClient && (
            <button type="button" className="ui-linkbtn" disabled={creating}
              style={{ color: 'var(--ink-4)', fontWeight: 400 }}
              onClick={() => void handleCreate()}>
              {creating ? 'יוצר/ת…' : `בכל זאת, פתיחת כרטיס לקוח ל${name}`}
            </button>
          )
        ) : (
          onCreateSpouseClient && (
            <button type="button" className="ui-linkbtn" disabled={creating}
              style={{ color: 'var(--accent)', fontWeight: 600 }}
              onClick={() => void handleCreate()}>
              {creating ? 'יוצר/ת…' : `פתיחת כרטיס לקוח ל${name}`}
            </button>
          )
        )}
      </div>
    </div>
  );
}
