// ─── עריכת נוסח ההזמנה לפגישה — ספריית הבקשות ← פגישות, וגם «מיילים ← פגישות» ───
// הדמיה מאושרת (07.10.2026): «הזמנה לשיחת היכרות» / «הזמנה לפגישת עבודה».
// ‼ מקור אחד: settings.commTemplates.meeting_intro / meeting_work. אותו עורך (TemplateEditor)
//   ואותן שלוש מדרגות כמו נוסחי המיילים; התצוגה המקדימה — InvitePreview, אותו רכיב שבחלון
//   הפגישה, ואותה פונקציה שהשרת שולח ממנה (meetingInvite.ts). מה שרואים כאן הוא מה שיוצא.
// ‼ «שמירה» שומרת מיד (saveNow) — כמו חלון העריכה של כל מייל.

import { useEffect, useMemo, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { TemplateEditor, type CommTemplate, type EditorSpec } from '../../components/office/pages/TemplateEditor';
import {
  MEETING_DEFAULT_MINUTES, MEETING_KIND_LABELS, MEETING_TEMPLATE_DEFAULTS, MEETING_TEMPLATE_FIELDS,
  MEETING_TEMPLATE_KEY, MEETING_TEMPLATE_LABELS, INVITE_WHY, type MeetingKind,
} from '../../../supabase/functions/_shared/meetingInvite';
import InvitePreview from './InvitePreview';
import { orgOf, nextWorkday } from './MeetingDialog';
import { israelToday } from './meetingModel';
import '../../components/office/representationSettings.css';
import './meetings.css';

/** השם של כל נוסח — אותו שם בספרייה, ב«מיילים» ובחלון הפגישה. */
export const MEETING_TEMPLATE_TITLES: Record<MeetingKind, string> = {
  intro: 'הזמנה לשיחת היכרות',
  work: 'הזמנה לפגישת עבודה',
};

/** שורת ההסבר ברשימה — למי ומתי. */
export const MEETING_TEMPLATE_WHEN: Record<MeetingKind, string> = {
  intro: `למי שעוד לא לקוח · ${MEETING_DEFAULT_MINUTES.intro} דקות · יוצא מהיומן שלך ב-Google`,
  work: `עם לקוח או איש מקצוע, על נושא · ${MEETING_DEFAULT_MINUTES.work} דקות · יוצא מהיומן שלך ב-Google`,
};

/** בשיחת היכרות אין «נושא» ו«מה להכין» בחלון — לא מציעים אותם כשדות. */
const FIELDS_BY_KIND: Record<MeetingKind, string[]> = {
  intro: MEETING_TEMPLATE_FIELDS.map(f => f.token).filter(t => t !== '{{topic}}' && t !== '{{prepList}}'),
  work: MEETING_TEMPLATE_FIELDS.map(f => f.token),
};

export function meetingEditorSpec(kind: MeetingKind): EditorSpec {
  return {
    key: MEETING_TEMPLATE_KEY[kind],
    base: MEETING_TEMPLATE_DEFAULTS[kind],
    vars: MEETING_TEMPLATE_FIELDS.filter(f => FIELDS_BY_KIND[kind].includes(f.token)).map(f => ({ label: f.token, hint: f.hint })),
    fieldLabels: MEETING_TEMPLATE_LABELS,
    subjectLabel: 'הכותרת ביומן',
    bodyLabel: 'גוף ההזמנה',
    rows: 16,
  };
}

function entryOf(p: FirmProfile, kind: MeetingKind): CommTemplate {
  const all = ((p.settings ?? {}).commTemplates as Record<string, CommTemplate> | undefined) ?? {};
  return all[MEETING_TEMPLATE_KEY[kind]] ?? {};
}

/** הנוסח שלך (נערך) — לתג ברשימה. */
export function isMeetingTemplateCustom(p: FirmProfile, kind: MeetingKind): boolean {
  const e = entryOf(p, kind);
  return e.subject !== undefined || e.body !== undefined;
}

/** נתוני דוגמה מסומנים (CLAUDE.md §12.6) — לא לקוח אמיתי. */
function sampleInput(kind: MeetingKind) {
  return {
    kind,
    durationMin: MEETING_DEFAULT_MINUTES[kind],
    guests: [{ email: 'israel@example.com', name: 'ישראל ישראלי' }],
    topic: kind === 'work' ? 'סגירת הדוח השנתי' : '',
    prep: kind === 'work' ? 'טופס 106\nאישורי ניכוי מס' : '',
    note: 'שמחתי לשמוע ממך — נדבר על פתיחת העסק.',
  };
}

export default function MeetingTemplateDrawer({ kind, draft, saveNow, onClose, initialTab = 'edit', fromEmail }: {
  kind: MeetingKind;
  draft: FirmProfile;
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  onClose: () => void;
  initialTab?: 'edit' | 'preview';
  /** המייל שחובר ליומן — לשורת «מאת» בתצוגה. */
  fromEmail?: string;
}) {
  const spec = useMemo(() => meetingEditorSpec(kind), [kind]);
  const savedEntry = entryOf(draft, kind);
  const [entry, setEntry] = useState<CommTemplate>(savedEntry);
  const [tab, setTab] = useState<'edit' | 'preview'>(initialTab);
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(entry) !== JSON.stringify(savedEntry);
  const title = MEETING_TEMPLATE_TITLES[kind];

  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm('לסגור בלי לשמור את השינויים בנוסח?')) return;
    onClose();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const cur = { subject: entry.subject ?? spec.base.subject, body: entry.body ?? spec.base.body };
  const org = orgOf(draft);
  const noWhatsapp = !(org.whatsapp ?? '').trim() && !(org.phone ?? '').trim();
  const usesWhatsapp = /\{\{\s*whatsapp\s*\}\}/.test(cur.body);
  const emptyBody = !cur.body.trim();

  async function save() {
    if (emptyBody) { setError('גוף ההזמנה ריק'); return; }
    setBusy(true);
    setError(null);
    const err = await saveNow(prev => {
      const prevSettings = prev.settings ?? {};
      const all = { ...(prevSettings.commTemplates as Record<string, CommTemplate> | undefined) };
      const empty = entry.subject === undefined && entry.body === undefined && !entry.firmDefault;
      if (empty) delete all[spec.key]; else all[spec.key] = entry;
      return { ...prev, settings: { ...prevSettings, commTemplates: all } };
    });
    setBusy(false);
    if (err) { setError(err); return; }
    onClose();
  }

  const isSystem = entry.subject === undefined && entry.body === undefined;
  const firm = entry.firmDefault;
  const sameAsFirm = !!firm && firm.subject === cur.subject && firm.body === cur.body;
  const stateLabel = isSystem ? 'נוסח המערכת' : sameAsFirm ? 'הנוסח הקבוע שלך' : firm ? 'שונה מהנוסח הקבוע שלך' : 'הנוסח שלך';
  const today = israelToday();

  return (
    <>
      <div className="rs-scrim" onClick={requestClose} />
      <aside className="rs-drawer" role="dialog" aria-modal="true" aria-label={`עריכה · ${title}`}>
        <div className="rs-dr-head">
          <div>
            <div className="rs-dr-title">{title}</div>
            <div className="rs-dr-sub">{MEETING_TEMPLATE_WHEN[kind]}</div>
          </div>
          <button type="button" className="rs-dr-close" onClick={requestClose} aria-label="סגירה">✕</button>
        </div>
        <div className="rs-dr-tabs">
          <button type="button" className={`rs-dr-tab ${tab === 'edit' ? 'is-active' : ''}`} onClick={() => setTab('edit')}>עריכה</button>
          <button type="button" className={`rs-dr-tab ${tab === 'preview' ? 'is-active' : ''}`} onClick={() => setTab('preview')}>תצוגה מקדימה</button>
        </div>
        <div className="rs-dr-body">
          {tab === 'edit' ? (
            <>
              <TemplateEditor spec={spec} entry={entry} onReplace={update => setEntry(prev => update(prev))} />
              <p className="of-muted" style={{ marginTop: 10 }}>
                שדה שנשאר ריק בשורה משלו (כמו [שורה אישית]{kind === 'work' ? ' או [מה להכין]' : ''}) — הפסקה שלו לא מופיעה בהזמנה.
                בשינוי מועד נוספות בראש ההזמנה שורת העדכון והשורה שכתבת בחלון.
              </p>
              {usesWhatsapp && noWhatsapp && (
                <div className="of-field-hint is-warn" role="status">
                  בפרטי המשרד אין וואטסאפ ואין טלפון — [הוואטסאפ שלך] יישאר ריק. מוסיפים ב«המשרד ← פרטי המשרד».
                </div>
              )}
              {emptyBody && <div className="of-field-hint is-warn" role="alert">גוף ההזמנה ריק — כתבו נוסח, או «חזרה לנוסח המערכת».</div>}
              <button type="button" className="ui-linkbtn" style={{ marginTop: 12 }} aria-expanded={why} onClick={() => setWhy(w => !w)}>
                {why ? 'הסתרת ההסבר' : 'למה נוסח המערכת כתוב כך?'}
              </button>
              {why && (
                <ul className="mt-why" style={{ marginTop: 8 }}>
                  {INVITE_WHY.map(w => <li key={w.label}><b>{w.label}</b>{w.why}</li>)}
                </ul>
              )}
            </>
          ) : (
            <InvitePreview sample input={sampleInput(kind)} org={org} tpl={cur} fromEmail={fromEmail}
              date={nextWorkday(today)} time="10:00" />
          )}
        </div>
        {error && <div className="rs-dr-error" role="alert">השמירה נכשלה: {error}. הנוסח עדיין כאן — אפשר לנסות שוב.</div>}
        <div className="rs-dr-foot">
          <span className="rs-dr-state">{stateLabel} · {MEETING_KIND_LABELS[kind]}</span>
          <span className="rs-spacer" />
          <button type="button" className="btn btn-sm" onClick={requestClose} disabled={busy}>ביטול</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy || emptyBody} onClick={() => void save()}>
            {busy ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </aside>
    </>
  );
}
