// ─── לשונית «במייל» — המייל שמפנה לדף, ושאר המיילים של הבקשה ─────────────────────
// ‼ המייל לא מכיל את הבקשה — הוא מפנה לדף. התצוגה היא אותו קוד שהשרת שולח (consolidatedMailSample: הנוסח כולל נוסח המשרד
// מ«מיילים», והמעטפת הממותגת), ב-iframe מבודד (sandbox בלי הרשאות: אין ניווט ואין סגנונות דולפים).
// מיילי ייצוג ומכתב ההעברה: הנוסח נערך ב«מיילים» — כאן רק מה זה ומתי יוצא, והקישור לעורך (אין חיקוי נוסף).

import { useMemo, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { FlSeg } from '../../components/flows/builder/ui';
import { consolidatedMailSample } from '../../components/flows/builder/mailSample';
import { DELIVERY_LABELS } from '../flows/types';
import { MAIL_INFO, type MailKey } from './registry';
import type { PreviewData } from './types';

/** מייל הדף הראשון: «ברוכים הבאים» (קליטה) · «פתחנו לכם דף אישי» (לקוח קיים, פעם ראשונה) · לקוח שכבר יש לו דף. */
type FirstKind = 'welcome' | 'introduce' | 'later';

export default function MailPreview({ mails, data, name, profile, onEditMail }: {
  mails: MailKey[];
  data: PreviewData | null;
  name: string;
  profile: FirmProfile;
  onEditMail?: (focus: string) => void;
}) {
  const [first, setFirst] = useState<FirstKind>('introduce');
  const portal = mails.includes('portalLink') || mails.includes('documentsSent');
  const requests = useMemo(() => {
    const waiting = (data?.items ?? []).filter(i => i.bucket === 'action' && i.kind !== 'message' && !i.resources?.length).map(i => i.label);
    return waiting.length ? waiting : [name];
  }, [data, name]);
  const documents = useMemo(() => (data?.items ?? []).flatMap(i => (i.resources ?? []).map(r => r.label)), [data]);
  const sample = useMemo(() => (portal ? consolidatedMailSample(profile, {
    requests: mails.includes('documentsSent') && !mails.includes('portalLink') ? [] : requests,
    documents: mails.includes('documentsSent') ? documents : [],
    first: first === 'later' ? null : first, clientFirst: 'ישראל', clientLast: 'ישראלי',
  }) : null), [portal, profile, mails, requests, documents, first]);

  return (
    <div className="rp-mail" data-testid="rp-mail">
      {sample && (
        <section className="rp-mail-sec">
          <h3 className="rp-h">המייל שמפנה לדף</h3>
          <p className="rp-lead">
            המייל לא מכיל את הבקשה — הוא מפנה לדף. {DELIVERY_LABELS.approve.mail}. כשכלל הפתיחה מוגדר «לבד»: {DELIVERY_LABELS.auto.mail}.
          </p>
          <FlSeg label="איזה מייל" value={first} onChange={setFirst} small
            options={[{ value: 'introduce', label: 'מייל ראשון מהדף' }, { value: 'welcome', label: 'בקליטה — «ברוכים הבאים»' }, { value: 'later', label: 'לקוח שכבר יש לו דף' }]} />
          <p className="rp-hint">נושא: <b>{sample.subject}</b></p>
          <iframe className="rp-mail-frame" title="תצוגה לדוגמה של המייל" sandbox="" srcDoc={sample.html} />
          <p className="rp-hint">
            הנוסח נערך ב«מיילים ← {sample.templateTitle}».
            {onEditMail && <> <button type="button" className="rp-link" onClick={() => onEditMail(`tpl:${sample.templateKey}`)}>לעריכה ←</button></>}
          </p>
        </section>
      )}
      {mails.filter(m => m !== 'portalLink' && m !== 'documentsSent').map(m => {
        const info = MAIL_INFO[m];
        return (
          <section key={m} className="rp-mail-sec" data-mail={m}>
            <h3 className="rp-h">{info.title}</h3>
            <p className="rp-lead">
              {info.external ? 'נשלח לרו״ח הקודם — לא ללקוח. ' : ''}{info.when}.
            </p>
            {onEditMail && (
              <button type="button" className="rp-link" onClick={() => onEditMail(info.focus)}>
                {info.external ? 'עריכת המכתב ב«מיילים» ←' : 'עריכת הנוסח ב«מיילים» ←'}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
