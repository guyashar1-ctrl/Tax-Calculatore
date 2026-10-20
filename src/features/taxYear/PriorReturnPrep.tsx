// ─── «לפני השליחה» — הדוח של שנה שעברה כנקודת פתיחה (19.10.2026) ──────────────────────────────────────────────
// ‼ ההמחשה המאושרת: docs/proposals/2026-10-19-simple-annual-questionnaire.html, לשונית 1.
// ‼ מופיע רק בדוח שנתי שעוד לא יצא ממנו כלום ללקוח. הקריאה היא הצעה: המשרד מסמן, מתקן שם ו«של מי», ואז —
//   מה שיש לו מקום בכרטיס נכנס (apply_tax_facts, עם ההיסטוריה), והשאלון יוצא עם האריחים שסומנו מראש. בלי מייל.
// ‼ אין דוח בתיק / הקריאה נכשלה / לא רוצים — «פרסם בלי»: אותו שאלון מהכרטיס בלבד. לעולם לא חוסם.

import { useEffect, useRef, useState } from 'react';
import type { Client } from '../../types';
import { applyTaxFacts } from '../../lib/taxFacts';
import { clientFromDb } from '../../lib/dbMappers';
import { PREP_TITLE, personLabel, priorReturnApply, priorReturnRows, rowEffect, type PrepPerson, type PrepRow, type PriorReading } from './priorReturn';
import { findPriorReturnDocs, readPriorReturnDoc, readPriorReturnFile, type PriorDoc } from './priorReturnApi';
import { publishAnnualAsks, questionnaireBlocker } from './workCreate';
import { QUESTIONNAIRE_OPEN } from './oneQuestionnaire';

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

interface Props {
  client: Client;
  year: number;
  stepId: string;
  busy: boolean;
  run: Run;
  /** «פרסם בלי» — השאלון מהכרטיס בלבד (אותה פעולה כמו «הכן ופרסם בדף»). */
  publishPlain: () => Promise<boolean>;
  onClientPersisted?: (c: Client) => void;
}

export default function PriorReturnPrep({ client, year, stepId, busy, run, publishPlain, onClientPersisted }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const prev = year - 1;
  const [docs, setDocs] = useState<PriorDoc[] | null>(null);
  const [reading, setReading] = useState<{ r: PriorReading; fileName: string } | null>(null);
  const [rows, setRows] = useState<PrepRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    findPriorReturnDocs(client.id, year).then(d => { if (live) setDocs(d); }).catch(() => { if (live) setDocs([]); });
    return () => { live = false; };
  }, [client.id, year]);

  const read = async (go: () => ReturnType<typeof readPriorReturnDoc>, fileName: string) => {
    setLoading(true); setErr(null);
    const res = await go();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setReading({ r: res.reading, fileName });
    setRows(priorReturnRows(client, res.reading));
  };

  const patch = (id: string, p: Partial<PrepRow>) => setRows(rs => rs.map(x => (x.id === id ? { ...x, ...p } : x)));
  const spouseFromReading = reading?.r.spouse?.firstName?.trim().split(/\s+/)[0];
  const chosen = rows.filter(x => x.on && !x.inCard);

  const publish = () => run(async () => {
    if (!reading) return publishPlain();
    // ‼ 263 · יש ללקוח שאלון אחר פתוח ⇒ גם הכרטיס לא מתעדכן מהדוח הקודם — הכול נשאר לכשהשאלון הזה יוכל לצאת
    const blocker = await questionnaireBlocker(client.id, { stepType: 'annual_return', stepId, taxYear: year });
    if (blocker) return { ok: false, error: QUESTIONNAIRE_OPEN, openQuestionnaire: blocker };
    const { proposals, hints } = priorReturnApply(client, rows, reading.r, { year: prev, fileName: reading.fileName });
    let c = client;
    if (proposals.length) {
      const a = await applyTaxFacts(client.id, 'import', `prior-return:${prev}:${reading.fileName}`.slice(0, 200), proposals);
      if (!a.ok) return a;
      if (a.client) { c = clientFromDb(a.client); onClientPersisted?.(c); }
    }
    return publishAnnualAsks(c, year, stepId, hints);
  }, `השאלון פורסם בדף של ${firstName} — עם מה שסימנת מהדוח של ${prev}. בלי מייל.`);

  return (
    <section className="as-prep" data-prior-prep aria-labelledby="as-prep-h">
      <p className="as-h" id="as-prep-h">לפני שהשאלון יוצא</p>

      {!reading && (
        <>
          {docs === null && <p className="as-muted">מחפש במסמכים את הדוח שהוגש ל-{prev}…</p>}
          {docs && docs.length > 0 && (
            <div className="as-prep-docs">
              <p>במסמכים של {firstName} יש את הדוח שהוגש ל-{prev}. אפשר לקרוא ממנו מה היה — ואז {firstName} יראה «בשנה שעברה היה…» במקום להתחיל מאפס.</p>
              {docs.map(d => (
                <div key={d.id} className="as-prep-doc">
                  <span><b>{d.fileName}</b><small> · {d.sizeMb}MB</small></span>
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy || loading} data-prior-read={d.id}
                    onClick={() => void read(() => readPriorReturnDoc(d.id), d.fileName)}>{loading ? 'קורא את הדוח… (עד דקה)' : 'קרא את הדוח'}</button>
                </div>
              ))}
            </div>
          )}
          {docs && docs.length === 0 && <p>אין במסמכים דוח שהוגש ל-{prev}. השאלון יתחיל ממה שיש בכרטיס.</p>}
          {err && <p className="ty-err" role="alert">{err}</p>}
          <div className="as-prep-actions">
            {docs && docs.length === 0 && <button type="button" className="btn btn-sm btn-primary" disabled={busy || loading} data-prior-plain onClick={() => void publishPlain()}>פרסם את השאלון בדף של {firstName}</button>}
            {docs && docs.length > 0 && <button type="button" className="btn btn-sm btn-ghost" disabled={busy || loading} data-prior-plain onClick={() => void publishPlain()}>פרסם בלי הדוח הקודם</button>}
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy || loading} onClick={() => fileRef.current?.click()}>{docs?.length ? 'קרא קובץ אחר מהמחשב' : 'יש לך את הדוח? קרא קובץ מהמחשב'}</button>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(() => readPriorReturnFile(f), f.name); }} />
          </div>
        </>
      )}

      {reading && (
        <>
          <p className="as-muted">נקרא מתוך «{reading.fileName}» · זו הצעה לבדיקתך, לא נתון סופי. השם ו«של מי» ניתנים לתיקון — הקריאה האוטומטית לפעמים מתבלבלת ביניהם.</p>
          {rows.length === 0 && <p>לא נמצא בדוח משהו שהשאלון יכול להיעזר בו. אפשר לפרסם את השאלון מהכרטיס.</p>}
          <ul className="as-prep-list">
            {rows.map(x => (
              <li key={x.id} className={`as-prep-row${x.on && !x.inCard ? '' : ' is-off'}`} data-prior-row={x.kind}>
                {x.inCard ? <span className="as-prep-check" aria-hidden="true">✓</span>
                  : <input type="checkbox" checked={x.on} aria-label={`${PREP_TITLE[x.kind]} ${x.name}`} onChange={e => patch(x.id, { on: e.target.checked })} />}
                <span className="as-prep-what">
                  <b>{x.title}</b>
                  {['disability', 'rental', 'foreign', 'donations'].includes(x.kind) || x.inCard
                    ? <span>{x.name}</span>
                    : <input className="as-prep-name" value={x.name} aria-label={`שם — ${x.title}`} onChange={e => patch(x.id, { name: e.target.value })} disabled={!x.on} />}
                  <small>{rowEffect(x, client, prev)}{x.evidence ? ` · ${x.evidence}` : ''}</small>
                </span>
                {!x.inCard && (
                  <select className="as-prep-who" value={x.person} aria-label={`של מי — ${x.title}`} disabled={!x.on} onChange={e => patch(x.id, { person: e.target.value as PrepPerson })}>
                    <option value="client">{personLabel('client', client)}</option>
                    {(client.familyStatus === 'married' || client.familyStatus === 'widowed' || spouseFromReading) && <option value="spouse">{personLabel('spouse', client, spouseFromReading)}</option>}
                    <option value="joint">משותף</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
          <div className="as-prep-actions">
            <button type="button" className="btn btn-primary" disabled={busy || rows.some(x => x.on && !x.inCard && !x.name.trim() && !['disability', 'rental', 'foreign', 'donations'].includes(x.kind))} data-prior-publish onClick={() => void publish()}>
              פרסם את השאלון בדף של {firstName}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setReading(null); setRows([]); }}>חזרה</button>
          </div>
          <p className="as-muted">{chosen.length ? `${chosen.length} פרטים מסומנים` : 'לא סומן דבר'} · מה שנכנס לכרטיס נשמר עם המקור («מהדוח שהוגש ל-{prev}») וניתן לביטול בתיק המס. בלי מייל.</p>
        </>
      )}
    </section>
  );
}
