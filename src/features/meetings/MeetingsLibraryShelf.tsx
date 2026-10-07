// ─── ספריית הבקשות ← «פגישות» — נוסח ההזמנות שיוצאות מהיומן (הדמיה מאושרת, 07.10.2026) ───
// ‼ גיא: «זה חייב להיות שם בשביל שאוכל לערוך את המייל הגנרי שנשלח». שתי שורות — היכרות ועבודה —
//   ושורת מידע על שינוי מועד וביטול. העריכה והצפייה — MeetingTemplateDrawer, אותו חלון שנפתח
//   מ«מיילים ← פגישות»; הנוסח נשמר במקום אחד (settings.commTemplates).

import { useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { MEETING_KINDS, type MeetingKind } from '../../../supabase/functions/_shared/meetingInvite';
import MeetingTemplateDrawer, { MEETING_TEMPLATE_TITLES, MEETING_TEMPLATE_WHEN, isMeetingTemplateCustom } from './MeetingTemplateDrawer';

/** focus ‏'meetings:intro' / 'meetings:work' — פותח את החלון של הנוסח (מקישור «עריכת הנוסח» בחלון הפגישה). */
export function meetingKindFromFocus(focus?: string | null): MeetingKind | null {
  const k = focus?.startsWith('meetings:') ? focus.slice(9) : '';
  return (MEETING_KINDS as readonly string[]).includes(k) ? k as MeetingKind : null;
}

export default function MeetingsLibraryShelf({ draft, saveNow, focusKind, onEmails }: {
  draft: FirmProfile;
  saveNow?: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  focusKind?: MeetingKind | null;
  /** «גם ב«מיילים»» — לאותו נוסח מהעמוד של כל המיילים. */
  onEmails?: () => void;
}) {
  const [open, setOpen] = useState<{ kind: MeetingKind; tab: 'edit' | 'preview' } | null>(
    focusKind ? { kind: focusKind, tab: 'edit' } : null);

  return (
    <>
      <p className="lb-sub">
        מה מקבל מי שמוזמן לפגישה ב-Google Meet. הנוסח נשמר כאן פעם אחת: אותו נוסח מוצג בחלון הפגישה לפני
        «שלח זימון», והוא מה שיוצא מהיומן שלך.
      </p>
      <ul className="lb-list lb-cards">
        {MEETING_KINDS.map(kind => {
          const title = MEETING_TEMPLATE_TITLES[kind];
          const custom = isMeetingTemplateCustom(draft, kind);
          return (
            <li key={kind} id={`lb-meeting-${kind}`} className={`lb-row${focusKind === kind ? ' is-focus' : ''}`}>
              <div className="lb-row-title">
                <button type="button" className="lb-name lb-name-btn" aria-label={`צפייה: ${title}`}
                  onClick={() => setOpen({ kind, tab: 'preview' })}>{title}</button>
                <span className="lb-preset">{custom ? 'הנוסח שלך' : 'נוסח המערכת'}</span>
              </div>
              <div className="lb-acts">
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`צפייה: ${title}`}
                  onClick={() => setOpen({ kind, tab: 'preview' })}>צפייה</button>
                <button type="button" className="btn btn-secondary btn-sm lb-edit" aria-label={`עריכה: ${title}`}
                  disabled={!saveNow} onClick={() => setOpen({ kind, tab: 'edit' })}>עריכה</button>
              </div>
              <div className="lb-row-meta">{MEETING_TEMPLATE_WHEN[kind]}</div>
            </li>
          );
        })}
        <li className="lb-row">
          <div className="lb-row-title">
            <span className="lb-name">שינוי מועד וביטול</span>
            <span className="lb-preset">Google שולח</span>
          </div>
          <div className="lb-row-meta">
            Google שולח עדכון או הודעת ביטול לכל המוזמנים. בשינוי מועד ההזמנה יוצאת בנוסח שכאן, ובראשה שורת
            העדכון והשורה שכתבת בחלון «שינוי מועד».
          </div>
        </li>
      </ul>
      {onEmails && (
        <p className="of-muted">
          אותו נוסח נפתח גם מ<button type="button" className="of-link" onClick={onEmails}>«מיילים» ←</button>
        </p>
      )}
      {open && (saveNow || open.tab === 'preview') && (
        <MeetingTemplateDrawer key={`${open.kind}-${open.tab}`} kind={open.kind} draft={draft}
          saveNow={saveNow ?? (async () => 'אין הרשאה לשמור כאן')} initialTab={open.tab} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
