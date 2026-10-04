// «לאן הכפתור מוביל» — בעורכי ההודעות ובתצוגה המקדימה (2.10.2026).
// ‼ יעד קבוע: שם + אתר + «פתיחה»/«העתקה», לקריאה בלבד — לא שדה עריכה.
// ‼ קישור אישי: דוגמה מסומנת (‎…/?portal=••••••‎) — הכתובת האמיתית נוצרת בשליחה
// לכל לקוח בנפרד, ולכן כאן אין טוקן, לא אמיתי ולא של לקוח אחר.
import { useState } from 'react';
import {
  linkHost, personalExample, type LinkDestination,
} from '../../features/links/linkDestinations';
import './linkDestination.css';

function CopyButton({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('ok');
    } catch {
      setState('fail');
    }
    window.setTimeout(() => setState('idle'), 1800);
  }
  return (
    <button type="button" className="ld-act" onClick={() => void copy()} aria-live="polite">
      {state === 'ok' ? 'הועתק ✓' : state === 'fail' ? 'ההעתקה נחסמה' : 'העתקה'}
    </button>
  );
}

export function LinkDestinationView({ dests, title = 'לאן הכפתור מוביל', compact }: {
  dests: LinkDestination[];
  title?: string;
  /** בתוך תצוגה מקדימה — שורה מוקטנת מתחת לכפתור. */
  compact?: boolean;
}) {
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return (
    <div className={`ld${compact ? ' is-compact' : ''}`} role="group" aria-label={title}>
      {!compact && <div className="ld-title">{title}</div>}
      {dests.map((d, i) => (
        <div className="ld-item" key={i}>
          {d.kind === 'none' ? (
            <div className="ld-access">{d.text}</div>
          ) : (
            <>
              {d.kind === 'personal' && d.when && <div className="ld-when">{d.when}:</div>}
              <div className="ld-name">{d.name}</div>
              {d.kind === 'fixed' ? (
                <div className="ld-line">
                  <span className="ld-host" dir="ltr" title={d.url}>{linkHost(d.url)}</span>
                  {!compact && (
                    <>
                      <a className="ld-act" href={d.url} target="_blank" rel="noopener noreferrer"
                        aria-label={`פתיחת ${d.name} בלשונית חדשה`}>פתיחה ↗</a>
                      <CopyButton url={d.url} />
                    </>
                  )}
                </div>
              ) : (
                <div className="ld-line">
                  <code className="ld-host is-example" dir="ltr">{personalExample(host, d.param)}<span className="ld-mask">••••••</span></code>
                  <span className="ld-tag">דוגמה · נוצר בשליחה</span>
                </div>
              )}
              <div className="ld-access">{d.access}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
