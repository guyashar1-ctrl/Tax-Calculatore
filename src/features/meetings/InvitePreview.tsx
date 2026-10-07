// ─── «כך זה יגיע» — ההזמנה כפי שהמוזמן יקבל אותה ─────────────────────────────
// ‼ הכותרת והטקסט נבנים מ-_shared/meetingInvite.ts — אותה פונקציה שהשרת שולח ממנה,
// עם אותם קלטים ואותה תבנית (נוסח המשרד מספריית הבקשות ← פגישות, או נוסח המערכת).
// המסגרת (שורת הנושא, כפתור ההצטרפות, כן/לא/אולי) היא של Google, ומצוירת כאן בקירוב
// בלבד, וכך גם כתוב מעליה. משמש את חלון הפגישה ואת «צפייה» בספרייה (נתוני דוגמה).

import {
  inviteParagraphs, meetingTitle, organizerTitle, shortDay, addMinutes,
  type InviteInput, type InviteMove, type InviteOrg, type MeetingTemplate,
} from '../../../supabase/functions/_shared/meetingInvite';

interface Props {
  input: InviteInput;
  org: InviteOrg;
  /** הנוסח שיוצא — meetingTemplateFor(kind, settings.commTemplates). */
  tpl: MeetingTemplate;
  /** מאיפה ההזמנה יוצאת — המייל שחובר ב«חיבורים». */
  fromEmail?: string;
  date: string;
  time: string;
  /** שינוי מועד: המועד הקודם מוצג מחוק, ושורת העדכון בראש הטקסט. */
  move?: InviteMove & { fromDate: string; fromTime: string; fromDuration: number };
  meetLink?: string;
  /** «עריכת הנוסח» — לספריית הבקשות ← פגישות. בלי — אין קישור (למשל בתוך הספרייה עצמה). */
  onEditWording?: () => void;
  /** «נתוני דוגמה» — בצפייה בספרייה. */
  sample?: boolean;
}

/** ‼ מספר טלפון בשורה עברית נשבר במקף לשתי שורות («‎-052‎») — נמצא בהדמיה. כאן הוא נשאר יחד. */
function Phones({ text }: { text: string }) {
  const parts = text.split(/(\+?\d[\d-]{6,}\d)/);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="ltr-isolate mt-nowrap">{p}</span> : p))}</>;
}

export default function InvitePreview({ input, org, tpl, fromEmail, date, time, move, meetLink, onEditWording, sample }: Props) {
  const title = meetingTitle(input, org, tpl);
  const paragraphs = inviteParagraphs(input, org, move, tpl);
  // ‼ רק טווח השעות מבודד משמאל-לימין; יום ותאריך זורמים בעברית. בידוד של כל המחרוזת
  // הפך את סדר הקריאה («12:30–12:00, 8 באוק׳») — נמצא בבדיקה בדפדפן.
  const range = (t: string, d: number) => <span className="ltr-isolate">{t}–{addMinutes(t, d)}</span>;
  const when = <>{shortDay(date)}, {range(time, input.durationMin)}</>;
  const old = move ? <>{shortDay(move.fromDate)}, {range(move.fromTime, move.fromDuration)}</> : null;
  const to = input.guests.map(g => g.email).join(', ');
  const sender = organizerTitle(org) || 'המשרד';

  return (
    <div className="mt-preview">
      <p className="mt-preview-note">
        {sample
          ? <>דוגמה — לא לקוח אמיתי. המסגרת (שורת הנושא, כפתור ההצטרפות, כן/לא/אולי) היא של יומן Google; הכותרת והטקסט — בנוסח שיוצא.</>
          : <>המסגרת (שורת הנושא, כפתור ההצטרפות, כן/לא/אולי) היא של יומן Google. הכותרת והטקסט — בדיוק כפי שיישלחו.</>}
        {onEditWording && <> <button type="button" className="ui-linkbtn" onClick={onEditWording}>עריכת הנוסח ←</button></>}
      </p>
      <div className="mt-mail">
        <div className="mt-mail-head">
          <div className="mt-subject">{move ? 'הזמנה מעודכנת: ' : 'הזמנה: '}{title} @ {when}</div>
          <div className="mt-from">
            <span className="mt-av" aria-hidden="true">{sender.charAt(0)}</span>
            <div className="mt-from-meta">
              <b>{sender}</b>
              {fromEmail && <span className="ltr-isolate">{fromEmail}</span>}
              <span>נשלח באמצעות יומן Google</span>
              <span>אל: <span className="ltr-isolate">{to || '—'}</span></span>
            </div>
          </div>
        </div>
        <div className="mt-frame">
          <div className="mt-frame-title">{title}</div>
          <div className="mt-when">
            {move && <span className="mt-changed">השתנה</span>} {when} (שעון ישראל)
            {move && <div><s>{old}</s></div>}
          </div>
          <div className="mt-meet">
            <span className="mt-meet-btn">הצטרפות ל-Google Meet</span>
            <span className="mt-meet-link ltr-isolate">{meetLink ?? 'הקישור נוצר בשליחה'}</span>
          </div>
          <div className="mt-ppl">משתתפים: {[`${sender} (מארגן)`, ...input.guests.map(g => g.name || g.email)].join(' · ')}</div>
          <div className="mt-rsvp">להגיע? <span>כן</span><span>אולי</span><span>לא</span></div>
        </div>
        <div className="mt-body">
          {paragraphs.map((t, i) => <p key={i} className="mt-blk"><Phones text={t} /></p>)}
        </div>
      </div>
    </div>
  );
}
