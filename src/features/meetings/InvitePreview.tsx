// ─── «כך זה יגיע» — ההזמנה כפי שהמוזמן יקבל אותה ─────────────────────────────
// ‼ הכותרת והטקסט נבנים מ-_shared/meetingInvite.ts — אותה פונקציה שהשרת שולח ממנה,
// עם אותם קלטים. המסגרת (שורת הנושא, כפתור ההצטרפות, כן/לא/אולי) היא של Google,
// ומצוירת כאן בקירוב בלבד, וכך גם כתוב מעליה.

import { useState } from 'react';
import {
  inviteBlocks, meetingTitle, organizerTitle, shortDay, addMinutes, INVITE_WHY,
  type InviteInput, type InviteMove, type InviteOrg,
} from '../../../supabase/functions/_shared/meetingInvite';

interface Props {
  input: InviteInput;
  org: InviteOrg;
  /** מאיפה ההזמנה יוצאת — המייל שחובר ב«חיבורים». */
  fromEmail?: string;
  date: string;
  time: string;
  /** שינוי מועד: המועד הקודם מוצג מחוק, ושורת העדכון בראש הטקסט. */
  move?: InviteMove & { fromDate: string; fromTime: string; fromDuration: number };
  meetLink?: string;
}

export default function InvitePreview({ input, org, fromEmail, date, time, move, meetLink }: Props) {
  const [why, setWhy] = useState(false);
  const title = meetingTitle(input, org);
  const blocks = inviteBlocks(input, org, move);
  // ‼ רק טווח השעות מבודד משמאל-לימין; יום ותאריך זורמים בעברית. בידוד של כל המחרוזת
  // הפך את סדר הקריאה («12:30–12:00, 8 באוק׳») — נמצא בבדיקה בדפדפן.
  const range = (t: string, d: number) => <span className="ltr-isolate">{t}–{addMinutes(t, d)}</span>;
  const when = <>{shortDay(date)}, {range(time, input.durationMin)}</>;
  const old = move ? <>{shortDay(move.fromDate)}, {range(move.fromTime, move.fromDuration)}</> : null;
  const to = input.guests.map(g => g.email).join(', ');
  const sender = organizerTitle(org) || 'המשרד';

  return (
    <div className={`mt-preview ${why ? 'is-why' : ''}`}>
      <p className="mt-preview-note">
        המסגרת (שורת הנושא, כפתור ההצטרפות, כן/לא/אולי) היא של יומן Google. הכותרת והטקסט — בדיוק כפי שיישלחו.
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
          <div className="mt-frame-title">{why && <span className="mt-mark">1</span>}{title}</div>
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
          {blocks.map((b, i) => (
            <p key={b.key} className="mt-blk">{why && <span className="mt-mark">{i + 2}</span>}{b.text}</p>
          ))}
        </div>
      </div>
      <button type="button" className="ui-linkbtn mt-why-toggle" aria-expanded={why} onClick={() => setWhy(w => !w)}>
        {why ? 'הסתרת ההסברים' : 'למה כתוב כך?'}
      </button>
      {why && (
        <ol className="mt-why">
          {(['title', ...blocks.map(b => b.key)] as (keyof typeof INVITE_WHY)[]).map((k, i) => (
            <li key={k}><span className="mt-mark">{i + 1}</span><span><b>{INVITE_WHY[k].label}</b> {INVITE_WHY[k].why}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}
