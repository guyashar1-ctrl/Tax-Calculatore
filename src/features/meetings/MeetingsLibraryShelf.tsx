// ─── ספריית הבקשות ← «פגישות» — נוסח ההזמנות שיוצאות מהיומן (הדמיה מאושרת, 07.10.2026) ───
// ‼ גיא: «זה חייב להיות שם בשביל שאוכל לערוך את המייל הגנרי שנשלח». שתי שורות — היכרות ועבודה —
//   ושורת מידע על שינוי מועד וביטול. העריכה והצפייה — MeetingTemplateDrawer, אותו חלון שנפתח
//   מ«מיילים ← פגישות»; הנוסח נשמר במקום אחד (settings.commTemplates).

import { useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { MEETING_KINDS, type MeetingKind } from '../../../supabase/functions/_shared/meetingInvite';
import { LibRow, useOneOpen } from '../../components/office/pages/library/LibRow';
import PreviewButton from '../requestPreview/PreviewButton';
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
  const [openKey, toggleOpen] = useOneOpen(focusKind ? `lb-meeting-${focusKind}` : null);

  return (
    <>
      <p className="lb-sub">
        מה מקבל מי שמוזמן לפגישה ב-Google Meet. הנוסח נשמר כאן פעם אחת: אותו נוסח מוצג בחלון הפגישה לפני
        «שלח זימון», והוא מה שיוצא מהיומן שלך.
      </p>
      {/* ‼ 30.10.2026: בשפה של «בקשות» (LibRow) — שם ו«צפייה» בשורה; מתי יוצא ו«עריכה» בלחיצה. */}
      <ul className="lr-list">
        {MEETING_KINDS.map(kind => {
          const title = MEETING_TEMPLATE_TITLES[kind];
          const custom = isMeetingTemplateCustom(draft, kind);
          const rowId = `lb-meeting-${kind}`;
          return (
            <LibRow key={kind} id={rowId} marker="meet" name={title} highlight={focusKind === kind}
              open={openKey === rowId} onToggle={() => toggleOpen(rowId)}
              side={<PreviewButton name={title} onClick={() => setOpen({ kind, tab: 'preview' })} />}>
              <p>{MEETING_TEMPLATE_WHEN[kind]}</p>
              <p className="lr-k">{custom ? 'הנוסח שלך.' : 'נוסח המערכת — עדיין לא שינית אותו.'}</p>
              <div className="lr-acts">
                <button type="button" className="btn btn-secondary btn-sm" aria-label={`עריכה: ${title}`}
                  disabled={!saveNow} onClick={() => setOpen({ kind, tab: 'edit' })}>עריכה</button>
              </div>
            </LibRow>
          );
        })}
        <LibRow id="lb-meeting-move" marker="meet" name="שינוי מועד וביטול" side={<span className="lr-quiet">Google שולח</span>}
          open={openKey === 'lb-meeting-move'} onToggle={() => toggleOpen('lb-meeting-move')}>
          <p>Google שולח עדכון או הודעת ביטול לכל המוזמנים. בשינוי מועד ההזמנה יוצאת בנוסח שכאן, ובראשה שורת
            העדכון והשורה שכתבת בחלון «שינוי מועד».</p>
        </LibRow>
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
