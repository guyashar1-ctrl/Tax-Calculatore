// «איך ייראה» — המייל המרוכז של רגע אחד במסלול, ללקוח לדוגמה.
// ‼ תצוגה לדוגמה: שם לקוח בדוי, קישור לא פעיל, ושום דבר לא נשלח. הנוסח
// והמעטפת — אותו קוד שהשרת שולח (mailSample.ts).
import { useMemo, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import { CLIENT_KIND_LABELS } from '../../../types/journeyDefaults';
import { LENS_KINDS, SAMPLE_FACTS, type Lens } from '../../../features/flows/preview';
import { FlSeg, FlSheet } from './ui';
import { consolidatedMailSample } from './mailSample';
import type { FirstPageEmail } from '../../../../supabase/functions/_shared/stepTemplates.ts';
import { firstLensWithMail, lensValue, noMailText, type MailEntry, type MomentMail } from './model';

type Which = 'tray' | 'auto';

const parseLens = (v: string): Lens => v.startsWith('k:') ? { t: 'kind', kind: v.slice(2) as never } : { t: 'sample', i: Number(v.slice(1)) || 0 };

type PageHistory = 'had' | 'none';

export default function MailSheet({ profile, momentLabel, first, onboarding, initialLens, mailFor, onClose, onOpenTemplate }: {
  profile: FirmProfile;
  momentLabel: string;
  /** הרגע הראשון במסלול הקליטה — המייל הראשון ללקוח («ברוכים הבאים»). */
  first: boolean;
  /**
   * מסלול קליטה? false (דוח שנתי, מסלול ידני) — לקוח שעוד לא קיבל מייל מהדף מקבל
   * «פתחנו לכם דף אישי» ושורה שמציגה את הדף (firstPageEmailKind 'introduce'), ולכן אפשר
   * לראות את שני המיילים. undefined — לא ידוע, ומוצג רק מייל ההמשך.
   */
  onboarding?: boolean;
  initialLens: Lens;
  mailFor: (lens: Lens) => MomentMail;
  onClose: () => void;
  /** «מיילים» פתוח על הנוסח הזה (EmailsPage: ‎focus='tpl:<מפתח>'‎). */
  onOpenTemplate?: (templateKey: string) => void;
}) {
  const [start] = useState(() => firstLensWithMail(initialLens, mailFor));
  const [lens, setLens] = useState<Lens>(start.lens);
  const mail = mailFor(lens);
  const tray = [...mail.approve, ...mail.hold];
  const hasBoth = tray.length > 0 && mail.auto.length > 0;
  const [which, setWhich] = useState<Which>(mail.auto.length > 0 && tray.length === 0 ? 'auto' : 'tray');
  const entries: MailEntry[] = hasBoth ? (which === 'auto' ? mail.auto : tray) : tray.length ? tray : mail.auto;
  const depends = entries.some(e => e.depends);
  // ‼ אותו כלל כמו השולח (firstPageEmailKind): «ברוכים הבאים» רק בקליטה; מחוץ לקליטה — מייל
  // הדף הראשון הוא «פתחנו לכם דף אישי». מראים אותו במקום להסביר אותו.
  const canIntroduce = !first && onboarding === false;
  const [history, setHistory] = useState<PageHistory>('had');
  const firstKind: FirstPageEmail = first ? 'welcome' : canIntroduce && history === 'none' ? 'introduce' : null;
  const sample = useMemo(() => consolidatedMailSample(profile, {
    requests: entries.filter(e => !e.isDocument).map(e => e.title),
    documents: entries.filter(e => e.isDocument).map(e => e.title),
    first: firstKind, clientFirst: 'דנה', clientLast: 'לוי',
  }), [profile, entries, firstKind]);

  const how = entries === mail.auto
    ? 'יוצא לבד תוך כמה דקות אחרי שהשלב נפתח — עד אז אפשר ללחוץ «אל תשלח לבד» בכרטיס הלקוח.'
    : mail.hold.length && !mail.approve.length
      ? 'רק אחרי שתפרסם בדף, ואם תבחר לשלוח מייל.'
      : 'יוצא כשתלחץ «שלח מייל…» בכרטיס הלקוח — ורואים אותו לפני.';

  return (
    <FlSheet title="איך ייראה המייל" sub={momentLabel} onClose={onClose} wide
      foot={<><span className="fl-spacer" /><button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button></>}>
      <p className="fl-demo-tag">תצוגה לדוגמה · לקוחה בדויה · שום דבר לא נשלח</p>
      <label className="fl-field">
        <span>ללקוח לדוגמה</span>
        <select value={lensValue(lens)} onChange={e => setLens(parseLens(e.target.value))}>
          {SAMPLE_FACTS.map((s, i) => <option key={s.label} value={`s${i}`}>{s.label}</option>)}
          {LENS_KINDS.map(k => <option key={k} value={`k:${k}`}>{CLIENT_KIND_LABELS[k]} — רק הסוג ידוע</option>)}
        </select>
      </label>
      {hasBoth && (
        <FlSeg label="איזה מייל" value={which} onChange={setWhich}
          options={[{ value: 'tray', label: `באישורך (${tray.length})` }, { value: 'auto', label: `שיוצא לבד (${mail.auto.length})`, auto: true }]} />
      )}
      {canIntroduce && entries.length > 0 && sample.event === 'process_open' && (
        <FlSeg label="מייל מהדף האישי" value={history} onChange={setHistory}
          options={[{ value: 'had', label: 'כבר קיבל מייל מהדף' }, { value: 'none', label: 'מייל ראשון מהדף' }]} />
      )}
      {start.picked && lensValue(lens) === lensValue(start.lens) && (
        <p className="fl-hint">מוצג ללקוח הראשון לדוגמה שמקבל מייל ברגע הזה. אפשר לבחור אחר.</p>
      )}
      {entries.length === 0 ? (
        <p className="fl-note">{noMailText(mail)}</p>
      ) : (
        <>
          <p className="fl-hint">
            {how}{depends ? ' כולל פריטים שנפתחים רק לחלק מהלקוחות מהסוג הזה — לפי מה שידוע עליהם.' : ''}
            {' '}נושא: <b>{sample.subject}</b>
          </p>
          <iframe className="fl-mail-frame" title="תצוגה לדוגמה של המייל" sandbox="" srcDoc={sample.html} />
          <p className="fl-hint">
            {onOpenTemplate
              ? <>הנוסח נערך ב<button type="button" className="fl-link" onClick={() => onOpenTemplate(sample.templateKey)}>«מיילים ← {sample.templateTitle}»</button>. </>
              : <>הנוסח נערך ב«מיילים ← {sample.templateTitle}». </>}
            השמות בדף ובמייל של לקוח אמיתי נלקחים מהבקשות עצמן.
          </p>
        </>
      )}
    </FlSheet>
  );
}
