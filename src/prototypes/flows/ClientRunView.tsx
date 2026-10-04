// «אצל הלקוח» — המסלול רץ אצל לקוח לדוגמה. משמאל (במחשב) מה הלקוח רואה, המיילים
// ומה קרה; מימין הכרטיס במשרד. כל לחיצה כאן מדומה — שום דבר לא נשלח.
import { useMemo, useState } from 'react';
import { Sheet, Seg, Chip, Icon } from './ui';
import {
  CLIENT_KINDS, CLIENT_KIND_LABELS, FACT_KEYS, FACT_LABELS, DELIVERY_LABELS, LIBRARY, TRIGGERS, startLabel,
  type Flow, type DemoClient, type ClientKind, type FactKey,
} from './flowModel';
import {
  fire, completeItem, officeAction, sendNow, publishPending, skipItem, addToStage, addSuggested, suggestions,
  advance, pause, resume, cancel, applyFlowUpdate, setClient, waitingSummary, portalView, clockLabel, previewPlan,
  DAY, type Run, type ItemInst, type OutEmail, type ClientPatch,
} from './flowEngine';

type Panel = 'card' | 'portal' | 'mail' | 'log';

export default function ClientRunView({ flows, clients, run, setRun, clientId, flowId, onPick, openBuilder }: {
  flows: Flow[];
  clients: DemoClient[];
  run: Run;
  setRun: (r: Run) => void;
  clientId: string;
  flowId: string;
  onPick: (clientId: string, flowId: string) => void;
  openBuilder: (flowId: string, stageId?: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>('card');
  const [mailOpen, setMailOpen] = useState<OutEmail | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [trayPreview, setTrayPreview] = useState(false);
  const [edge, setEdge] = useState(false);
  const flow = run.flow;
  const latest = flows.find(f => f.id === flowId)!;
  const w = waitingSummary(run);
  const sug = suggestions(run);
  const client = run.client;
  const idle = run.status === 'idle';
  const lastFailed = [...run.outbox].reverse().find(m => m.to !== 'office' && m.to !== 'external');
  const eventLabel = TRIGGERS[flow.trigger].label;
  const mailsToClient = run.outbox.filter(m => m.to === 'owner' || m.to === 'spouse');

  const Item = ({ i, children }: { i: ItemInst; children?: React.ReactNode }) => (
    <li className={`fd-ci${i.late ? ' is-late' : ''}`}>
      <div className="fd-ci-main">
        <span className="fd-ci-title">{i.title}</span>
        <span className="fd-ci-meta">
          {flow.stages.find(s => s.id === i.stageId)?.name}
          {i.reused === 'attached' && ' · הייתה פתוחה, צורפה'}
          {i.perClient && ' · ללקוח הזה בלבד'}
          {i.late && !i.announced && ' · נוסף אחרי המייל'}
          {!i.published && (i.actor === 'client' || i.actor === 'document') && ' · עוד לא בדף'}
          {i.published && i.announced && i.announced !== 'existing' && ' · נמסר במייל'}
          {i.published && !i.announced && (i.actor === 'client' || i.actor === 'document') && ' · בדף, בלי מייל'}
        </span>
        {i.note && <span className={`fd-ci-note${/נעצרה|לא ידוע/.test(i.note) ? ' is-warn' : ''}`}>{i.note}</span>}
      </div>
      <div className="fd-ci-acts">{children}</div>
    </li>
  );

  return (
    <div className="fd-client">
      <div className="fd-toolbar is-wrap">
        <Seg label="לקוח" value={clientId} onChange={c => onPick(c, flowId)} options={clients.map(c => ({ value: c.id, label: c.name }))} />
        <Seg small label="מסלול" value={flowId} onChange={f => onPick(clientId, f)} options={flows.map(f => ({ value: f.id, label: f.name }))} />
        <button type="button" className="fd-btn is-ghost" onClick={() => setDataOpen(true)}>נתוני הלקוח</button>
      </div>

      <div className="fd-clockbar" role="group" aria-label="שעון ההדגמה">
        <span className="fd-clock"><Icon name="clock" size={14} /> {clockLabel(run.clock)}</span>
        <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(advance(run, 60))}>+שעה</button>
        <button type="button" className="fd-btn is-ghost is-sm" onClick={() => {
          let eod = Math.floor(run.clock / DAY) * DAY + 17 * 60;
          if (eod <= run.clock) eod += DAY;
          setRun(advance(run, eod - run.clock));
        }}>לסוף היום</button>
        <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(advance(run, 5 * DAY))}>+5 ימים</button>
        <span className="fd-spacer" />
        {!idle && <button type="button" className="fd-link fd-edge-toggle" aria-expanded={edge} onClick={() => setEdge(v => !v)}>מקרי קצה</button>}
        {!idle && edge && (
          <div className="fd-edge">
            <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(fire(run, run.startedBy ?? 'x', eventLabel))}>האירוע חוזר</button>
            <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(sendNow(sendNow(run)))}>לחיצה כפולה על «שלח»</button>
            <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(setClient(run, { email: run.client.email ? null : `${run.client.firstName}@example.com` }))}>{run.client.email ? 'למחוק את המייל מהכרטיס' : 'להחזיר את המייל לכרטיס'}</button>
          </div>
        )}
      </div>

      {!idle && latest.version > flow.version && run.status !== 'cancelled' && (
        <div className="fd-banner">
          <span>המסלול עודכן לגרסה {latest.version}. {client.firstName} באמצע גרסה {flow.version} — שום דבר לא השתנה אצלו לבד.</span>
          <button type="button" className="fd-btn is-sm" onClick={() => setRun(applyFlowUpdate(run, latest).run)}>לעדכן את {client.firstName}</button>
        </div>
      )}
      {sug.length > 0 && (
        <div className="fd-banner is-amber">
          <span>הנתונים של {client.firstName} השתנו. מתאים עכשיו: {sug.map(s => `«${s.title}»`).join(', ')}. שום דבר לא נוסף לבד.</span>
          {sug.map(s => (
            <button key={`${s.stageId}:${s.uid}:${s.only ?? ''}`} type="button" className="fd-btn is-sm"
              onClick={() => setRun(addSuggested(run, s.stageId, s.uid, s.only))}>להוסיף «{s.title}»</button>
          ))}
        </div>
      )}

      <Seg label="תצוגה" value={panel} onChange={setPanel} small
        options={[{ value: 'card', label: 'בכרטיס' }, { value: 'portal', label: `הדף של ${client.firstName}` }, { value: 'mail', label: 'מיילים', count: run.outbox.length }, { value: 'log', label: 'מה קרה' }]} />

      <div className={`fd-c-grid is-${panel}`}>
        <section className="fd-c-card" aria-label={`הכרטיס של ${client.name}`}>
          <div className="fd-c-head">
            <div>
              <div className="fd-c-name">{client.name}</div>
              <div className="fd-c-sub">{CLIENT_KIND_LABELS[client.kind]}{client.facts.married && client.spouseName ? ` · נשוי/אה ל${client.spouseName}` : ''} · לשונית «בקשות»</div>
            </div>
          </div>

          {idle ? <StartCard run={run} onStart={() => setRun(fire(run, 'event:1', eventLabel))} openBuilder={() => openBuilder(flow.id)} /> : (
            <>
              <FlowStrip run={run} onPause={() => setRun(pause(run))} onResume={() => setRun(resume(run))} onCancel={() => setRun(cancel(run))} openBuilder={openBuilder} />

              {(w.unsent.length > 0 || w.unpublished.length > 0 || run.heldSince !== undefined || lastFailed?.status === 'failed') && run.status !== 'cancelled' && (
                <div className="fd-tray" role="region" aria-label="מוכן לשליחה">
                  {w.unpublished.length > 0 && (
                    <div className="fd-tray-row">
                      <span><b>{w.unpublished.length}</b> {w.unpublished.length === 1 ? 'פריט מחכה' : 'פריטים מחכים'} לאישורך לפני שיופיעו בדף</span>
                      <button type="button" className="fd-btn is-sm" onClick={() => setRun(publishPending(run))}>להציג בדף</button>
                    </div>
                  )}
                  {w.unsent.length > 0 && (
                    <div className="fd-tray-row">
                      <span>
                        מוכן לשליחה: {recipientsLine(w.unsent, client)}
                        {w.unsent.some(i => i.late) && <Chip tone="amber">נוסף אחרי המייל</Chip>}
                      </span>
                      <button type="button" className="fd-link" onClick={() => setTrayPreview(true)}>מה ייצא</button>
                      <button type="button" className="fd-btn is-sm" onClick={() => setRun(sendNow(run))}>
                        <Icon name="mail" size={14} /> {mailCount(w.unsent) === 1 ? 'שליחת מייל אחד' : `שליחת ${mailCount(w.unsent)} מיילים`}
                      </button>
                    </div>
                  )}
                  {run.heldSince !== undefined && (
                    <div className="fd-tray-row is-auto"><Icon name="clock" size={14} /> עדכון מרוכז ייצא לבד בסוף היום (17:00), עם כל מה שיתווסף עד אז.</div>
                  )}
                  {lastFailed?.status === 'failed' && (
                    <div className="fd-tray-row is-warn">המייל האחרון ל{lastFailed.toLabel} לא נשלח — {lastFailed.note}</div>
                  )}
                </div>
              )}

              <Group title="ממתין לך" empty="אין כרגע.">
                {w.me.map(i => (
                  <Item key={i.key} i={i}>
                    {i.actor === 'action' ? (
                      <>
                        <button type="button" className="fd-btn is-sm is-auto" onClick={() => setRun(officeAction(run, i.key, 'ok'))}>הופעלה ✓</button>
                        <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(officeAction(run, i.key, 'stopped'))}>נעצרה</button>
                        <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(officeAction(run, i.key, 'unknown'))}>לא ידוע</button>
                      </>
                    ) : i.actor === 'external' ? (
                      <button type="button" className="fd-btn is-sm" onClick={() => setRun(officeAction(run, i.key, 'ok'))}>לעבור ולשלוח</button>
                    ) : (
                      <button type="button" className="fd-btn is-sm" onClick={() => setRun(officeAction(run, i.key, 'ok'))}>סיימתי</button>
                    )}
                  </Item>
                ))}
              </Group>

              <Group title={`אצל ${client.firstName}${client.facts.married && client.spouseName ? ` ו${client.spouseName}` : ''}`} empty="אין כרגע.">
                {[...w.client, ...w.spouse].map(i => (
                  <Item key={i.key} i={i}>
                    <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(completeItem(run, i.key))}>{i.recipient === 'spouse' ? `${i.personName} השלימה` : 'הלקוח השלים'} (הדגמה)</button>
                    <button type="button" className="fd-icbtn" onClick={() => setRun(skipItem(run, i.key))} title="אין צורך אצל הלקוח הזה" aria-label={`אין צורך ב«${i.title}» אצל הלקוח הזה`}>✕</button>
                  </Item>
                ))}
              </Group>

              {w.external.length > 0 && (
                <Group title="אצל גורם חיצוני" empty="">
                  {w.external.map(i => (
                    <Item key={i.key} i={i}>
                      <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setRun(completeItem(run, i.key, 'me'))}>החומרים הגיעו</button>
                    </Item>
                  ))}
                </Group>
              )}

              {run.status !== 'cancelled' && run.status !== 'done' && (
                <button type="button" className="fd-add" onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> בקשה ללקוח הזה</button>
              )}

              <DoneFold run={run} />
            </>
          )}
        </section>

        <section className={`fd-c-side is-${panel === 'card' ? 'portal' : panel}`} aria-label="מה הלקוח רואה, מיילים ומה קרה">
          {(panel === 'card' || panel === 'portal') && <Portal run={run} />}
          {panel === 'mail' && (
            <div className="fd-mails">
              {run.outbox.length === 0 && <p className="fd-empty">עוד לא יצא שום מייל.</p>}
              <ul className="fd-rows">
                {[...run.outbox].reverse().map(m => (
                  <li key={m.id}>
                    <button type="button" className={`fd-row fd-mail is-${m.status}`} onClick={() => setMailOpen(m)}>
                      <span className={`fd-row-ic is-mail-${m.to}`}><Icon name={m.to === 'office' ? 'office' : m.to === 'external' ? 'external' : 'mail'} /></span>
                      <span className="fd-row-main">
                        <span className="fd-row-title">{m.subject}</span>
                        <span className="fd-row-meta">
                          אל {m.toLabel} · {clockLabel(m.at)} · {m.by === 'auto' ? 'לבד' : 'בלחיצה'}
                          {m.items.length > 0 && ` · ${m.items.length} ${m.items.length === 1 ? 'פריט' : 'פריטים'}`}
                          {m.status === 'failed' && ' · לא נשלח'}
                        </span>
                      </span>
                      <span className="fd-row-end">{kindLabel(m.kind)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {mailsToClient.length > 0 && (
                <p className="fd-sub">ללקוח יצאו {mailsToClient.filter(m => m.status === 'sent').length} מיילים — על {new Set(mailsToClient.flatMap(m => m.items)).size} פריטים. כל מייל מפרט רק מה שחדש לנמען שלו.</p>
              )}
            </div>
          )}
          {panel === 'log' && (
            <ol className="fd-log">
              {[...run.log].reverse().map((l, k) => (
                <li key={k} className={`is-${l.tone}`}><span className="fd-log-t">{clockLabel(l.at)}</span><span>{l.text}</span></li>
              ))}
              {run.log.length === 0 && <li className="fd-empty">עוד לא קרה כלום.</li>}
            </ol>
          )}
        </section>
      </div>

      {mailOpen && <MailSheet mail={mailOpen} run={run} onClose={() => setMailOpen(null)} />}
      {trayPreview && (
        <Sheet title="מה ייצא" sub="מייל אחד לכל נמען — רק מה שחדש לו" onClose={() => setTrayPreview(false)}
          foot={<button type="button" className="fd-btn" onClick={() => { setRun(sendNow(run)); setTrayPreview(false); }}>שליחה</button>}>
          {(['owner', 'spouse'] as const).map(to => {
            const mine = w.unsent.filter(i => i.recipient === to);
            if (!mine.length) return null;
            const label = to === 'owner' ? client.firstName : client.spouseName;
            const addr = to === 'owner' ? client.email : client.spouseEmail;
            return (
              <div key={to} className="fd-mailprev">
                <div className="fd-cap">אל {label} · {addr ?? 'אין כתובת — לא יישלח'}</div>
                <ul>{mine.map(i => <li key={i.key}>{i.title}{i.late ? ' · חדש' : ''}</li>)}</ul>
                <div className="fd-mailprev-cta">לדף האישי שלך ←</div>
              </div>
            );
          })}
        </Sheet>
      )}
      {dataOpen && <ClientDataSheet client={client} onClose={() => setDataOpen(false)} onChange={patch => setRun(setClient(run, patch))} />}
      {addOpen && <AddForClientSheet run={run} onClose={() => setAddOpen(false)} onAdd={(stageId, libId) => { setRun(addToStage(run, stageId, { kind: 'library', id: libId })); setAddOpen(false); }} />}
    </div>
  );
}

function mailCount(items: ItemInst[]) { return new Set(items.map(i => i.recipient)).size; }
function recipientsLine(items: ItemInst[], c: DemoClient): string {
  const own = items.filter(i => i.recipient === 'owner').length;
  const sp = items.filter(i => i.recipient === 'spouse').length;
  return [own ? `ל${c.firstName} ${own} ${own === 1 ? 'פריט' : 'פריטים'}` : '', sp ? `ל${c.spouseName} ${sp}` : ''].filter(Boolean).join(' · ');
}
function kindLabel(k: OutEmail['kind']) {
  return { open: 'חדש', update: 'עדכון', reminder: 'תזכורת', external: 'גורם חיצוני', office: 'אליך' }[k];
}

function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="fd-group">
      <div className="fd-group-title">{title}{arr.length > 0 && <span className="fd-group-n">{arr.length}</span>}</div>
      {arr.length ? <ul className="fd-cis">{children}</ul> : empty ? <div className="fd-empty is-small">{empty}</div> : null}
    </div>
  );
}

function StartCard({ run, onStart, openBuilder }: { run: Run; onStart: () => void; openBuilder: () => void }) {
  const plan = previewPlan(run.flow, run.client);
  const first = plan.filter(p => p.applies && p.stage.start.kind === 'flow_start');
  const page = first.reduce((n, p) => n + p.pageCount, 0);
  const me = first.reduce((n, p) => n + p.meCount, 0);
  return (
    <div className="fd-startcard">
      <div className="fd-startcard-title">«{run.flow.name}» עוד לא התחיל אצל {run.client.firstName}</div>
      <p className="fd-sub">מתחיל כש: {TRIGGERS[run.flow.trigger].label}. ברגע הזה: {page} {page === 1 ? 'פריט' : 'פריטים'} בדף של {run.client.firstName}{me ? ` · ${me} ממתינים לך` : ''}. {first.map(p => DELIVERY_LABELS[p.stage.delivery].short).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}.</p>
      <div className="fd-row-btns">
        <button type="button" className="fd-btn" onClick={onStart}>{run.flow.trigger === 'manual' ? 'הפעלה ללקוח הזה' : `${TRIGGERS[run.flow.trigger].label} (הדגמה)`}</button>
        <button type="button" className="fd-link" onClick={openBuilder}>מה יקרה בכל שלב ←</button>
      </div>
    </div>
  );
}

function FlowStrip({ run, onPause, onResume, onCancel, openBuilder }: {
  run: Run; onPause: () => void; onResume: () => void; onCancel: () => void; openBuilder: (flowId: string, stageId?: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const label: Record<string, string> = { active: 'פעיל', paused: 'עצור', cancelled: 'בוטל', done: 'הושלם', idle: '' };
  return (
    <div className={`fd-strip is-${run.status}`}>
      <div className="fd-strip-head">
        <span className="fd-strip-name"><Icon name="flow" size={15} /> {run.flow.name}</span>
        <Chip tone={run.status === 'active' ? 'blue' : run.status === 'done' ? 'green' : run.status === 'paused' ? 'amber' : 'gray'}>{label[run.status]}</Chip>
        <span className="fd-spacer" />
        {run.status === 'active' && <button type="button" className="fd-btn is-ghost is-sm" onClick={onPause}><Icon name="pause" size={14} /> עצירה</button>}
        {run.status === 'paused' && <button type="button" className="fd-btn is-sm" onClick={onResume}><Icon name="play" size={14} /> חידוש</button>}
        {(run.status === 'active' || run.status === 'paused') && <button type="button" className="fd-btn is-ghost is-sm" onClick={() => setConfirm(true)}>ביטול</button>}
      </div>
      <ol className="fd-strip-stages">
        {run.flow.stages.map(s => {
          const st = run.stages[s.id];
          return (
            <li key={s.id} className={`is-${st.state}`}>
              <button type="button" onClick={() => openBuilder(run.flow.id, s.id)} title={st.state === 'waiting' ? startLabel(s.start, run.flow) : st.state === 'not_applicable' ? `לא חל — ${st.why ?? ''}` : undefined}>
                <span className="fd-dot" aria-hidden="true">{st.state === 'done' ? '✓' : ''}</span>
                {s.name}
                <span className="fd-sr"> — {st.state === 'done' ? 'הושלם' : st.state === 'open' ? 'פתוח' : st.state === 'waiting' ? 'ממתין' : 'לא חל'}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {run.status === 'paused' && <p className="fd-sub">בעצירה: שום שלב לא נפתח ושום מייל לא יוצא לבד. מה שכבר בדף — נשאר.</p>}
      {confirm && (
        <Sheet title={`ביטול «${run.flow.name}» אצל ${run.client.firstName}`} onClose={() => setConfirm(false)}
          foot={<>
            <button type="button" className="fd-btn is-ghost" onClick={() => setConfirm(false)}>חזרה</button>
            <button type="button" className="fd-btn is-danger" onClick={() => { onCancel(); setConfirm(false); }}>ביטול המסלול</button>
          </>}>
          <p>מה שפתוח יורד מהדף של {run.client.firstName}. מה שכבר הושלם נשאר בהיסטוריה. לא יוצא מייל.</p>
          <p className="fd-sub">רוצים רק להקפיא? «עצירה» משאירה הכול במקום.</p>
        </Sheet>
      )}
    </div>
  );
}

function DoneFold({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const done = run.items.filter(i => i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled');
  if (!done.length) return null;
  return (
    <div className="fd-group">
      <button type="button" className="fd-disclose" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? '−' : '+'} הושלמו ונסגרו · {done.length}</button>
      {open && (
        <ul className="fd-cis is-done">
          {done.map(i => (
            <li key={i.key} className="fd-ci">
              <div className="fd-ci-main">
                <span className="fd-ci-title">{i.title}</span>
                <span className="fd-ci-meta">{i.state === 'done' ? (i.reused === 'done_before' ? 'הושלמה בעבר — לא נפתחה שוב' : i.actor === 'document' ? 'נשלח' : 'הושלם') : i.state === 'skipped' ? 'אין צורך אצל הלקוח הזה' : 'בוטל'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Portal({ run }: { run: Run }) {
  const p = portalView(run);
  const c = run.client;
  return (
    <div className="fd-phone" aria-label={`הדף האישי של ${c.firstName}`}>
      <div className="fd-phone-bar">הדף האישי</div>
      <div className="fd-phone-body">
        <div className="fd-phone-firm">גיא ישר · רואה חשבון</div>
        <div className="fd-phone-hi">שלום {c.firstName},</div>
        {run.status === 'idle' && <p className="fd-phone-empty">עוד אין כאן כלום — המסלול לא התחיל.</p>}
        {p.action.length > 0 && <div className="fd-phone-sec">מה צריך ממך</div>}
        {p.action.map(i => (
          <div key={i.key} className="fd-phone-card">
            <div className="fd-phone-t">{i.title}</div>
            {i.checklist && i.checklist.length > 0 && <ul className="fd-phone-list">{i.checklist.map(l => <li key={l}>{l}</li>)}</ul>}
            <span className="fd-phone-btn">{i.recipient === 'spouse' ? `ההוראות נשלחו ל${i.personName}` : 'להמשך'}</span>
          </div>
        ))}
        {p.documents.length > 0 && <div className="fd-phone-sec">מסמכים מהמשרד</div>}
        {p.documents.map(i => <div key={i.key} className="fd-phone-row"><Icon name="doc" size={14} /> {i.title}</div>)}
        {p.office.length > 0 && <div className="fd-phone-sec">בטיפול המשרד</div>}
        {p.office.map(t => <div key={t} className="fd-phone-row is-muted">{t}</div>)}
        {p.future.length > 0 && <div className="fd-phone-sec">בהמשך</div>}
        {p.future.map(t => <div key={t} className="fd-phone-row is-muted">🔒 {t}</div>)}
        {p.done.length > 0 && <div className="fd-phone-done">✓ {p.done.length} {p.done.length === 1 ? 'דבר הושלם' : 'דברים הושלמו'}</div>}
      </div>
    </div>
  );
}

function MailSheet({ mail, run, onClose }: { mail: OutEmail; run: Run; onClose: () => void }) {
  const items = mail.items.map(k => run.items.find(i => i.key === k)).filter(Boolean) as ItemInst[];
  return (
    <Sheet title={mail.subject} sub={`אל ${mail.toLabel}${mail.address ? ` · ${mail.address}` : ''} · ${clockLabel(mail.at)} · ${mail.by === 'auto' ? 'נשלח לבד' : 'נשלח בלחיצה'}`} onClose={onClose}>
      {mail.status === 'failed' && <div className="fd-banner is-amber">{mail.note}</div>}
      {mail.to === 'office' ? <p>הודעה אליך: {mail.subject}.</p> : mail.to === 'external' ? (
        <p>מכתב לגורם חיצוני — מייל נפרד משלו, לא חלק מהמייל של הלקוח.</p>
      ) : (
        <div className="fd-mailprev">
          <p>{mail.kind === 'reminder' ? 'רק להזכיר — אלה עוד מחכים:' : mail.kind === 'update' ? 'נוסף בדף האישי שלך:' : 'בדף האישי שלך מחכים:'}</p>
          <ul>{items.map(i => <li key={i.key}>{i.title}</li>)}</ul>
          <div className="fd-mailprev-cta">לדף האישי שלך ←</div>
        </div>
      )}
      <p className="fd-sub">הדגמה — המייל לא נשלח באמת.</p>
    </Sheet>
  );
}

function ClientDataSheet({ client, onClose, onChange }: { client: DemoClient; onClose: () => void; onChange: (p: ClientPatch) => void }) {
  return (
    <Sheet title={`נתוני ${client.name}`} sub="משנים כדי לראות איך התנאים מתנהגים" onClose={onClose}>
      <label className="fd-field">
        <span>סוג לקוח</span>
        <select value={client.kind} onChange={e => onChange({ kind: e.target.value as ClientKind })}>
          {CLIENT_KINDS.map(k => <option key={k} value={k}>{CLIENT_KIND_LABELS[k]}</option>)}
        </select>
      </label>
      {FACT_KEYS.map((k: FactKey) => (
        <label key={k} className="fd-check">
          <input type="checkbox" checked={client.facts[k]} onChange={e => onChange({
            facts: { [k]: e.target.checked },
            ...(k === 'married' && e.target.checked && !client.spouseName ? { spouseName: 'אבי', spouseEmail: 'avi@example.com' } : {}),
          })} />
          <span>{FACT_LABELS[k].yes}{k === 'married' && client.facts.married && client.spouseName ? ` (${client.spouseName})` : ''}</span>
        </label>
      ))}
      <label className="fd-check">
        <input type="checkbox" checked={!!client.email} onChange={e => onChange({ email: e.target.checked ? `${client.firstName}@example.com` : null })} />
        <span>יש מייל בכרטיס</span>
      </label>
      <p className="fd-sub">שינוי באמצע מסלול לא מוסיף ולא מבטל בקשות לבד — הוא רק מציע.</p>
    </Sheet>
  );
}

function AddForClientSheet({ run, onClose, onAdd }: { run: Run; onClose: () => void; onAdd: (stageId: string, libId: string) => void }) {
  const stages = run.flow.stages.filter(s => ['open', 'waiting'].includes(run.stages[s.id].state));
  const [stageId, setStageId] = useState(stages.find(s => run.stages[s.id].state === 'open')?.id ?? stages[0]?.id);
  const list = useMemo(() => LIBRARY, []);
  return (
    <Sheet title={`בקשה ל${run.client.firstName} בלבד`} sub="מהספרייה. לא משנה את המסלול" onClose={onClose}>
      <label className="fd-field">
        <span>לאיזה שלב</span>
        <select value={stageId} onChange={e => setStageId(e.target.value)}>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name} · {run.stages[s.id].state === 'open' ? 'פתוח עכשיו' : 'ייפתח בהמשך'}</option>)}
        </select>
      </label>
      <ul className="fd-pick">
        {list.map(e => (
          <li key={e.id}>
            <button type="button" className="fd-pick-row" disabled={!stageId} onClick={() => onAdd(stageId!, e.id)}>
              <span>{e.name}</span><small>{e.shelf === 'document' ? 'מסמך' : e.actor === 'client' ? 'הלקוח' : e.actor === 'office' ? 'אתה' : 'גורם חיצוני'}</small>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
