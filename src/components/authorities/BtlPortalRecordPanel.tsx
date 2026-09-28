// ─── «מה ביטוח לאומי רושם» — בתוך כרטיס ב"ל, לכל אדם ─────────────────────────
// ‼ סגור: שורה אחת (מתי נקרא, וכמה לבדיקה). פתוח: חמישה מקטעים קצרים — רשום
// בב"ל · בכרטיס · לבדיקה · מסמכים והודעות · מילואים. לא העתק של הפורטל: רק מה
// שנשמר (207), עם «מאז» ו«קודם» כשמשהו השתנה. אין כאן כפתור שמשנה את הכרטיס.

import { useState } from 'react';
import type { BtlRecordView } from '../../features/nationalInsurance/btlPortalRecord';
import { formatBtlMoney } from '../../features/nationalInsurance/btlPortalRecord';
import { niDate } from '../../features/nationalInsurance/niOccupations';
import './btlPortalRecord.css';

const day = (iso?: string) => (iso ? niDate(iso.slice(0, 10)) : '');

export default function BtlPortalRecordPanel({ view }: { view: BtlRecordView }) {
  const [open, setOpen] = useState(false);
  if (view.empty) {
    return <div className="btlr-empty">מה ביטוח לאומי רושם — עוד לא נשמרה קריאה. «עדכן נתונים מביטוח לאומי» ממלא את זה.</div>;
  }
  const n = view.conflicts.length;
  return (
    <div className="btlr">
      <button type="button" className="btlr-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="btlr-title">מה ביטוח לאומי רושם</span>
        <span className="btlr-meta">נקרא {day(view.lastReadAt)}</span>
        {n > 0 && <span className="btlr-flag">{n === 1 ? 'פריט אחד לבדיקה' : `${n} לבדיקה`}</span>}
        <span className={`txf-occ-chev${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="btlr-body">
          {n > 0 && (
            <section className="btlr-sec btlr-conflicts">
              <h5>לבדיקה</h5>
              <ul>{view.conflicts.map(c => <li key={c.key}>{c.text}</li>)}</ul>
              <div className="btlr-note">הכרטיס לא שונה. מתקנים בכרטיס או מול ביטוח לאומי, לפי מה שנכון.</div>
            </section>
          )}

          <section className="btlr-sec">
            <h5>רשום בביטוח לאומי</h5>
            <dl className="btlr-kv">
              {view.recorded.map(l => (
                <div key={l.key}>
                  <dt>{l.label}</dt>
                  <dd>
                    {l.value}
                    <span className="btlr-when">{l.previous
                      ? ` · מאז ${day(l.since)} (קודם: ${l.previous.value}, עד ${day(l.previous.until)})`
                      : ''}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {view.contributions.length > 0 && (
              <ul className="btlr-list">
                {view.contributions.map(c => <li key={c.year}><b dir="ltr">{c.year}</b> · {c.text}</li>)}
              </ul>
            )}
          </section>

          {view.declared.length > 0 && (
            <section className="btlr-sec">
              <h5>בכרטיס / לפי הלקוח</h5>
              <dl className="btlr-kv">
                {view.declared.map(d => (
                  <div key={d.label}><dt>{d.label}</dt><dd>{d.value}<span className="btlr-when"> · {d.source}</span></dd></div>
                ))}
              </dl>
            </section>
          )}

          {(view.documents.length > 0 || view.notices.length > 0 || view.correspondenceCount) && (
            <section className="btlr-sec">
              <h5>מסמכים והודעות אחרונים</h5>
              <ul className="btlr-list">
                {view.documents.map((d, i) => (
                  <li key={`d${i}`}>
                    {d.description} · <span dir="ltr">{niDate(d.date)}</span>{d.pages ? ` · ${d.pages} עמ'` : ''}
                    {d.notInLastRead && <span className="btlr-when"> · לא הופיע בקריאה האחרונה</span>}
                  </li>
                ))}
                {view.notices.map((m, i) => (
                  <li key={`n${i}`}>הודעה: {m.type} · <span dir="ltr">{niDate(m.date)}</span>{m.state ? <span className="btlr-when"> · {m.state}</span> : null}</li>
                ))}
                {view.correspondenceCount ? <li>תכתובות בתיק: {view.correspondenceCount}</li> : null}
              </ul>
              {view.noticesOther > 0 && <div className="btlr-note">עוד {view.noticesOther} הודעות תשלום/תזכורת — לא נשמרו.</div>}
            </section>
          )}

          {view.reserveDuty && (
            <section className="btlr-sec">
              <h5>מילואים</h5>
              <ul className="btlr-list">
                {view.reserveDuty.rows.map((r, i) => (
                  <li key={i}><b dir="ltr">{r.year}</b> · שולם {formatBtlMoney(r.gross)}{r.taxWithheld != null ? ` · נוכה מס ${formatBtlMoney(r.taxWithheld)}` : ''}</li>
                ))}
              </ul>
              <div className="btlr-note">{view.reserveDuty.nextAction}</div>
            </section>
          )}

          <div className="btlr-src">מקור: פורטל המייצגים של ביטוח לאומי · נקרא לאחרונה {day(view.lastReadAt)} · לא משנה את הכרטיס</div>
        </div>
      )}
    </div>
  );
}
