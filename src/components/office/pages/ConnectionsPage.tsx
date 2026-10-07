// «חיבורים» — כל מערכת חיצונית בשורה אחת: מה המצב, מה זה מאפשר, ומה עושים
// כשזה לא זמין (סבב 3, 1.10.2026). אוחדו לכאן: «שע״ם וביטוח לאומי», «פייפרלס»,
// ו«פעולות שרצות במחשב העבודה» מ«מה רץ אוטומטית».
//
// ‼ המצב נקרא מאותו מקור כמו הכפתורים בכותרת (useShaamReadiness), ו«התחברות»
// כאן לוחץ על אותו כפתור בכותרת (requestAuthorityConnect) — אין מסלול חיבור שני.
// ‼ «מה נספר בכפתור שע״ם» הוא העדפת תצוגה בלבד: התחברות מכינה את מערכת הגבייה
// (worker/src/handlers/shaamConnect.mjs), ומערכת אחרת נפתחת כשפעולה צריכה אותה.
// הסימון קובע רק את «N/M מוכנות» בכותרת — ולכן הוא מנוסח ומוצג כתצוגה, לא כהפעלה.
// ‼ פייפרלס: קישור שמור, לא חיבור. אסור להציג «מחובר».
import { useEffect, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import { SHAAM_WARMUP_CAPABILITIES, SHAAM_WARMUP_CAPABILITY_LABELS, type ShaamWarmupCapability } from '../../../types/automation';
import { useShaamReadiness, layerNeverChecked, freshLayer } from '../../../hooks/shaamReadiness';
import { requestAuthorityConnect } from '../../AuthorityConnectionButtons';
import WorkstationPairingDialog from '../../WorkstationPairingDialog';
import PaperlessLinkField, { paperlessInviteUrl, withPaperlessInviteUrl } from './PaperlessLinkField';
import { GoTo } from '../officeUi';
import type { OfficePageId } from '../officeModel';
import GoogleCalendarCard from '../../../features/meetings/GoogleCalendarCard';
import '../../../features/meetings/meetings.css';

type LayerState = { ready: boolean; checkedAt?: string } | undefined;
type Tone = 'on' | 'off' | 'warn';

// ‼ אותם שמות פעולה כמו ב«אוטומציות» ובמסלולים (automationCatalog / FLOW_ACTIONS), בלי
// שם הרשות שכבר בכותרת הכרטיס. היה כאן «עדכון נתונים…» — שם שלישי לאותה קריאה.
const SHAAM_ENABLES = 'קריאת תיק מס הכנסה, הזנת ייפוי כוח, שליחת הטופס החתום ובדיקת קבלת הייצוג';
const BTL_ENABLES = 'קריאת התיק, הזנת ייפוי כוח ובדיקת קבלת הייצוג';

function selected(profile: FirmProfile): ShaamWarmupCapability[] {
  const configured = ((profile.settings ?? {}).shaamWarmup as { capabilities?: unknown } | undefined)?.capabilities;
  return Array.isArray(configured) && configured.length
    ? (configured as ShaamWarmupCapability[])
    : [...SHAAM_WARMUP_CAPABILITIES];
}

function layerWord(layer: LayerState): { text: string; tone: Tone } {
  if (!layer || layerNeverChecked(layer)) return { text: 'ייפתח כשצריך', tone: 'off' };
  if (freshLayer(layer)) return { text: 'מוכן', tone: 'on' };
  return { text: 'לא מוכן', tone: 'warn' };
}

function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`of-conn-state is-${tone}`}><span className="of-conn-dot" aria-hidden="true" />{children}</span>;
}

export default function ConnectionsPage({ draft, setDraft, focus, go }: {
  draft: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  focus?: string | null;
  go?: (p: OfficePageId, focus?: string) => void;
}) {
  const r = useShaamReadiness();
  const st = r.status as Record<string, LayerState & { connected?: boolean }>;
  const workerOn = !r.workerOffline || !r.btlWorkerOffline;
  const shaamOn = !r.workerOffline && !!st.shaam?.connected;
  const btlOn = !r.btlWorkerOffline && !!st.btl?.connected;
  const sel = selected(draft);
  const [pairing, setPairing] = useState(false);
  // ‼ «התחברות» כאן לוחץ על הכפתור שבכותרת; בלי משוב מקומי הלחיצה נראתה
  // כאילו לא קרה כלום. מה שקורה בפועל (חלון, קוד, «מחובר») — בכפתור למעלה.
  const [requested, setRequested] = useState<{ shaam?: boolean; btl?: boolean }>({});
  const connect = (a: 'shaam' | 'btl') => { requestAuthorityConnect(a); setRequested(r => ({ ...r, [a]: true })); };
  // ‼ ‎'login:<חיבור>'‎ — מ«אוטומציות», כשריצה ממתינה להתחברות: נוחתים על החיבור עצמו,
  // בלי לפתוח את טבלת «מה מוכן» (זו נפתחת רק מהכתובת הישנה ‎#/firm/shaamWarmup‎ = 'shaam').
  const target = focus?.startsWith('login:') ? focus.slice(6) : focus;
  const focusOf = (id: string) => (target === id ? 'true' : undefined);
  useEffect(() => {
    if (!focus) return;
    document.querySelector('.of-conn[data-focus="true"]')?.scrollIntoView({ block: 'start' });
  }, [focus]);
  const [showCount, setShowCount] = useState(focus === 'shaam');
  const invite = paperlessInviteUrl(draft).trim();

  function toggleCount(c: ShaamWarmupCapability) {
    const next = sel.includes(c) ? sel.filter(x => x !== c) : [...sel, c];
    setDraft(prev => ({ ...prev, settings: { ...(prev.settings ?? {}), shaamWarmup: { capabilities: next } } }));
  }

  return (
    <>
      <ul className="of-conns">
        {/* פגישות ב-Google Meet (223) — הזימון יוצא מהיומן הזה. */}
        <GoogleCalendarCard />

        <li className="of-conn" data-focus={focusOf('worker')}>
          <div className="of-conn-head">
            <h2 className="of-conn-name">מחשב העבודה</h2>
            <Status tone={workerOn ? 'on' : 'warn'}>{workerOn ? 'פעיל' : 'לא פעיל'}</Status>
          </div>
          <p className="of-conn-what">מריץ את העבודה מול שע״ם וביטוח לאומי.</p>
          {!workerOn && (
            <p className="of-conn-todo">
              <b>מה לעשות:</b> להדליק את מחשב העבודה ולוודא ש-PIVO פתוח בו. עד אז אי אפשר להתחבר לרשויות.
            </p>
          )}
          <div className="of-conn-acts">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPairing(true)}>הוספת מחשב עבודה חדש</button>
          </div>
        </li>

        <li className="of-conn" data-focus={focusOf('shaam')}>
          <div className="of-conn-head">
            <h2 className="of-conn-name">שע״ם</h2>
            {r.workerOffline ? <Status tone="warn">לא זמין</Status>
              : shaamOn ? <Status tone="on">מחובר</Status> : requested.shaam ? <Status tone="warn">מתחבר…</Status> : <Status tone="off">לא מחובר</Status>}
          </div>
          <p className="of-conn-what">{shaamOn ? 'מאפשר: ' : 'בלי חיבור אין: '}{SHAAM_ENABLES}.</p>
          {r.workerOffline ? (
            <p className="of-conn-todo">צריך קודם מחשב עבודה פעיל.</p>
          ) : !shaamOn && (requested.shaam ? (
            <p className="of-conn-todo" role="status">
              <b>מתחבר.</b> בחלון שע״ם במחשב העבודה: בוחרים אישור דיגיטלי ומזינים PIN. ההתקדמות — בכפתור «שע״ם» למעלה.
            </p>
          ) : (
            <div className="of-conn-acts">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => connect('shaam')}>התחברות לשע״ם</button>
              <span className="of-muted">נפתח חלון במחשב העבודה — שם בוחרים אישור דיגיטלי ומזינים PIN.</span>
            </div>
          ))}
          <button type="button" className="of-link of-conn-more" aria-expanded={showCount} onClick={() => setShowCount(v => !v)}>
            {showCount ? 'הסתרה' : 'מה מוכן בכל מערכת בשע״ם'}
          </button>
          {showCount && (
            <table className="of-conn-table">
              <thead>
                <tr><th scope="col">מערכת</th><th scope="col">עכשיו</th><th scope="col">נספר בכפתור שבכותרת</th></tr>
              </thead>
              <tbody>
                {SHAAM_WARMUP_CAPABILITIES.map(c => {
                  const w = layerWord(st[c] as LayerState);
                  return (
                    <tr key={c}>
                      <th scope="row">{SHAAM_WARMUP_CAPABILITY_LABELS[c]}</th>
                      <td><Status tone={r.workerOffline ? 'off' : w.tone}>{r.workerOffline ? '—' : w.text}</Status></td>
                      <td>
                        <label className="of-conn-count">
                          <input type="checkbox" checked={sel.includes(c)} onChange={() => toggleCount(c)}
                            aria-label={`לספור את ${SHAAM_WARMUP_CAPABILITY_LABELS[c]} בכפתור שבכותרת`} />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <caption>הסימון משנה רק את הספירה בכפתור שע״ם שבכותרת. מערכת נפתחת מעצמה כשפעולה צריכה אותה.</caption>
            </table>
          )}
        </li>

        <li className="of-conn" data-focus={focusOf('btl')}>
          <div className="of-conn-head">
            <h2 className="of-conn-name">ביטוח לאומי</h2>
            {r.btlWorkerOffline ? <Status tone="warn">לא זמין</Status>
              : btlOn ? <Status tone="on">מחובר</Status> : requested.btl ? <Status tone="warn">מתחבר…</Status> : <Status tone="off">לא מחובר</Status>}
          </div>
          <p className="of-conn-what">{btlOn ? 'מאפשר: ' : 'בלי חיבור אין: '}{BTL_ENABLES}.</p>
          {r.btlWorkerOffline ? (
            <p className="of-conn-todo">צריך קודם מחשב עבודה פעיל.</p>
          ) : !btlOn && (requested.btl ? (
            <p className="of-conn-todo" role="status">
              <b>מתחבר.</b> בחלון ביטוח לאומי במחשב העבודה: קוד משתמש, סיסמה והקוד מהנייד. ההתקדמות — בכפתור «ביטוח לאומי» למעלה.
            </p>
          ) : (
            <div className="of-conn-acts">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => connect('btl')}>התחברות לביטוח לאומי</button>
              <span className="of-muted">נפתח חלון במחשב העבודה — שם מזינים קוד משתמש, סיסמה וקוד מהנייד.</span>
            </div>
          ))}
        </li>

        <li className="of-conn" data-focus={focusOf('paperless')}>
          <div className="of-conn-head">
            <h2 className="of-conn-name">פייפרלס</h2>
            <Status tone={invite ? 'off' : 'warn'}>{invite ? 'קישור הזמנה בלבד' : 'חסר קישור הזמנה'}</Status>
          </div>
          <p className="of-conn-what">
            אין חיבור לחשבון שלך שם. PIVO שולח ללקוח את קישור ההזמנה שלך, ואת ההתקדמות מסמנים בבקשות של הלקוח.
          </p>
          <PaperlessLinkField value={paperlessInviteUrl(draft)} onChange={v => setDraft(d => withPaperlessInviteUrl(d, v))} />
        </li>
      </ul>

      {go && (
        <p className="of-muted" style={{ marginTop: 18 }}>
          חיבור הוא רק כניסה. מה PIVO מריץ על החיבורים האלה, ומה קרה בפעם האחרונה — <GoTo onClick={() => go('automations', 'authority')}>ב«אוטומציות» ←</GoTo>
        </p>
      )}

      {pairing && <WorkstationPairingDialog onClose={() => setPairing(false)} />}
    </>
  );
}
