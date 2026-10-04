// «מסלולים» — בונים מסלול משלבים. בלי גרירה ובלי תחביר: כל שלב אומר מתי הוא
// נפתח, מה יש בו (במקביל), ואיך זה מגיע ללקוח. «בדיקה לפי לקוח» מראה מה יקרה.
import { useEffect, useMemo, useState } from 'react';
import { Sheet, Seg, Chip, Icon } from './ui';
import {
  LIBRARY, ACTIONS, DEMO_CLIENTS, TRIGGERS, CLIENT_KINDS, CLIENT_KIND_LABELS, FACT_KEYS, FACT_LABELS,
  DELIVERIES, DELIVERY_LABELS, conditionChips, itemName, itemActor, startLabel, parallelWith,
  type Flow, type Stage, type StageItem, type Condition, type ItemRef, type TriggerId, type StageStart, type Delivery, type FactKey,
} from './flowModel';
import { previewPlan, type PlanStage } from './flowEngine';

type ActorKey = ReturnType<typeof itemActor>;
const ACTOR_UI: Record<ActorKey, { icon: 'person' | 'office' | 'external' | 'doc' | 'bolt'; label: string }> = {
  client: { icon: 'person', label: 'הלקוח' },
  office: { icon: 'office', label: 'אתה' },
  external: { icon: 'external', label: 'גורם חיצוני' },
  document: { icon: 'doc', label: 'מסמך' },
  action: { icon: 'bolt', label: 'פעולה · בלחיצה שלך' },
};

const startKey = (s: StageStart) => s.kind === 'flow_start' ? 'start' : s.kind === 'after_stage' ? `stage:${s.stageId}` : `item:${s.itemUid}`;
const parseStart = (k: string): StageStart => k === 'start' ? { kind: 'flow_start' }
  : k.startsWith('stage:') ? { kind: 'after_stage', stageId: k.slice(6) } : { kind: 'after_item', itemUid: k.slice(5) };
const hasClientItems = (s: Stage) => s.items.some(i => ['client', 'document'].includes(String(itemActor(i.ref))));

export default function FlowBuilder({ flows, onSave, focus, onRunAt }: {
  flows: Flow[];
  onSave: (f: Flow) => void;
  focus: { flowId: string; stageId?: string } | null;
  onRunAt: (flowId: string, clientId: string) => void;
}) {
  const [flowId, setFlowId] = useState(focus?.flowId ?? flows[0].id);
  const saved = flows.find(f => f.id === flowId) ?? flows[0];
  const [draft, setDraft] = useState<Flow>(() => structuredClone(saved));
  const [pClient, setPClient] = useState<string>('c-cohen');
  const [itemSheet, setItemSheet] = useState<{ stageId: string; uid: string } | null>(null);
  const [stageSheet, setStageSheet] = useState<string | null>(null);
  const [addSheet, setAddSheet] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => { if (focus?.flowId) setFlowId(focus.flowId); }, [focus?.flowId]);
  useEffect(() => { setDraft(structuredClone(saved)); setSavedMsg(null); /* החלפת מסלול */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);
  useEffect(() => {
    if (!focus?.stageId) return;
    const el = document.querySelector(`[data-stage="${focus.stageId}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.classList.add('is-flash');
    const t = window.setTimeout(() => el?.classList.remove('is-flash'), 1600);
    return () => window.clearTimeout(t);
  }, [focus]);

  const client = DEMO_CLIENTS.find(c => c.id === pClient) ?? null;
  const plan = useMemo(() => client ? previewPlan(draft, client) : null, [draft, client]);

  const patchStage = (id: string, fn: (s: Stage) => Stage) => setDraft(d => ({ ...d, stages: d.stages.map(s => s.id === id ? fn(s) : s) }));
  const patchItem = (stageId: string, uid: string, fn: (i: StageItem) => StageItem | null) =>
    patchStage(stageId, s => ({ ...s, items: s.items.map(i => i.uid === uid ? fn(i) : i).filter(Boolean) as StageItem[] }));

  function addStage() {
    const id = `st-${Date.now().toString(36)}`;
    const last = draft.stages[draft.stages.length - 1];
    setDraft(d => ({ ...d, stages: [...d.stages, {
      id, name: 'שלב חדש', start: last ? { kind: 'after_stage', stageId: last.id } : { kind: 'flow_start' },
      items: [], delivery: 'publish_then_me', reminderDays: null, notifyOfficeOnDone: false,
    }] }));
    setStageSheet(id);
  }

  function save() {
    const next = { ...draft, version: saved.version + 1 };
    onSave(next);
    setDraft(structuredClone(next));
    setSavedMsg(`נשמר כגרסה ${next.version}. לקוחות חדשים יקבלו אותה; מי שכבר באמצע — יקבל הצעה לעדכן.`);
  }

  return (
    <div className="fd-builder">
      <div className="fd-toolbar">
        <Seg label="מסלול" value={flowId} onChange={setFlowId} options={flows.map(f => ({ value: f.id, label: f.name }))} />
      </div>

      <div className="fd-b-grid">
        <div className="fd-b-main">
          <div className="fd-flowhead">
            <label className="fd-inline">
              <span className="fd-cap">שם</span>
              <input className="fd-flowname" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} aria-label="שם המסלול" />
            </label>
            <label className="fd-inline">
              <span className="fd-cap">מתחיל כש</span>
              <select value={draft.trigger} onChange={e => setDraft(d => ({ ...d, trigger: e.target.value as TriggerId }))}>
                {(Object.keys(TRIGGERS) as TriggerId[]).map(t => <option key={t} value={t}>{TRIGGERS[t].label}</option>)}
              </select>
            </label>
            <span className="fd-ver">גרסה {saved.version}{dirty ? ' · יש שינויים' : ''}</span>
          </div>

          <div className="fd-legend" aria-label="איך קוראים מסלול">
            <span><b>שלב</b> — מה שבתוכו מתקדם במקביל</span>
            <span><b>«נפתח»</b> — תלות: מתי השלב מתחיל</span>
            <span><b>הסדר ברשימה</b> — רק סדר הצגה</span>
          </div>

          <div className="fd-test" role="group" aria-label="בדיקה לפי לקוח">
            <span className="fd-cap">בדיקה לפי לקוח</span>
            <Seg small label="בדיקה לפי לקוח" value={pClient} onChange={setPClient}
              options={[...DEMO_CLIENTS.map(c => ({ value: c.id, label: c.name })), { value: 'all', label: 'בלי' }]} />
          </div>

          <ol className="fd-stages">
            {draft.stages.map((s, idx) => {
              const ps = plan?.find(p => p.stage.id === s.id);
              const par = parallelWith(s, draft);
              return (
                <li key={s.id} className={`fd-stage${ps && !ps.applies ? ' is-off' : ''}`} data-stage={s.id}>
                  <header className="fd-stage-head">
                    <span className="fd-stage-n" aria-hidden="true">{idx + 1}</span>
                    <h3 className="fd-stage-name">{s.name}</h3>
                    {conditionChips(s.when).map(c => <Chip key={c} tone="line">{c}</Chip>)}
                    <button type="button" className="fd-icbtn" onClick={() => setStageSheet(s.id)} aria-label={`הגדרות השלב «${s.name}»`}><Icon name="dots" /></button>
                  </header>
                  <div className="fd-stage-start">
                    <Icon name="branch" size={14} />
                    <label>
                      <span className="fd-sr">נפתח</span>
                      <select value={startKey(s.start)} onChange={e => patchStage(s.id, x => ({ ...x, start: parseStart(e.target.value) }))}
                        aria-label={`מתי «${s.name}» נפתח`}>
                        <option value="start">מיד כשהמסלול מתחיל</option>
                        {draft.stages.filter(o => o.id !== s.id).map(o => <option key={o.id} value={`stage:${o.id}`}>אחרי ש«{o.name}» הושלם</option>)}
                        {draft.stages.filter(o => o.id !== s.id).flatMap(o => o.items.filter(i => i.ref.kind !== 'task').map(i => (
                          <option key={i.uid} value={`item:${i.uid}`}>אחרי ש«{itemName(i.ref)}» הושלמה</option>
                        )))}
                      </select>
                    </label>
                    {par.length > 0 && <Chip tone="blue">במקביל ל«{par.join('», «')}»</Chip>}
                  </div>
                  {ps && !ps.applies && <div className="fd-why">לא אצל {client?.name}: {ps.why}</div>}

                  <ul className="fd-items" aria-label={`הפריטים ב«${s.name}» — במקביל`}>
                    {s.items.map(i => {
                      const pi = ps?.items.find(x => x.uid === i.uid);
                      const a = ACTOR_UI[itemActor(i.ref)];
                      return (
                        <li key={i.uid} className={`fd-item${pi && !pi.applies ? ' is-off' : ''}`}>
                          <span className={`fd-item-ic is-${itemActor(i.ref)}`} title={a.label}><Icon name={a.icon} size={15} /></span>
                          <span className="fd-item-main">
                            <span className="fd-item-name">{itemName(i.ref)}</span>
                            <span className="fd-item-tags">
                              <span className="fd-item-who">{a.label}</span>
                              {conditionChips(i.when).map(c => <Chip key={c} tone="line">{c}</Chip>)}
                              {pi?.persons && pi.persons.length > 1 && <Chip tone="gray">{pi.persons.join(' + ')}</Chip>}
                              {i.optional && <Chip tone="gray">רשות</Chip>}
                              {pi && !pi.applies && pi.why && <span className="fd-why-inline">לא אצל {client?.firstName}: {pi.why}</span>}
                            </span>
                          </span>
                          <button type="button" className="fd-icbtn" onClick={() => setItemSheet({ stageId: s.id, uid: i.uid })}
                            aria-label={`הגדרות «${itemName(i.ref)}»`}><Icon name="dots" /></button>
                        </li>
                      );
                    })}
                    {s.items.length === 0 && <li className="fd-empty">עוד אין כאן פריטים.</li>}
                  </ul>
                  <button type="button" className="fd-add" onClick={() => setAddSheet(s.id)}><Icon name="plus" size={14} /> הוספה לשלב</button>

                  {hasClientItems(s) ? (
                    <div className="fd-stage-delivery">
                      <label>
                        <span className="fd-cap">איך זה מגיע ללקוח</span>
                        <select value={s.delivery} onChange={e => patchStage(s.id, x => ({ ...x, delivery: e.target.value as Delivery }))}>
                          {DELIVERIES.map(d => <option key={d} value={d}>{DELIVERY_LABELS[d].long}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="fd-cap">תזכורת ללקוח</span>
                        <select value={s.reminderDays ?? 0} onChange={e => patchStage(s.id, x => ({ ...x, reminderDays: Number(e.target.value) || null }))}>
                          <option value={0}>בלי</option>
                          {[3, 5, 7, 14].map(n => <option key={n} value={n}>אחרי {n} ימים, על מה שפתוח</option>)}
                        </select>
                      </label>
                      <label className="fd-check">
                        <input type="checkbox" checked={s.notifyOfficeOnDone} onChange={e => patchStage(s.id, x => ({ ...x, notifyOfficeOnDone: e.target.checked }))} />
                        <span>הודעה אליך כשהשלב הושלם</span>
                      </label>
                    </div>
                  ) : (
                    <div className="fd-stage-delivery is-quiet">
                      <span>אין כאן פריטים ללקוח — רק עבודה שלך.</span>
                      <label className="fd-check">
                        <input type="checkbox" checked={s.notifyOfficeOnDone} onChange={e => patchStage(s.id, x => ({ ...x, notifyOfficeOnDone: e.target.checked }))} />
                        <span>הודעה אליך כשהשלב הושלם</span>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <button type="button" className="fd-btn is-ghost fd-addstage" onClick={addStage}><Icon name="plus" /> שלב חדש</button>

          <div className={`fd-savebar${dirty || savedMsg ? ' is-on' : ''}`} role="status">
            {dirty ? (
              <>
                <span>שינויים במסלול — חלים על לקוחות חדשים בלבד.</span>
                <button type="button" className="fd-btn is-ghost" onClick={() => setDraft(structuredClone(saved))}>ביטול</button>
                <button type="button" className="fd-btn" onClick={save}>שמירה</button>
              </>
            ) : savedMsg ? <span>✓ {savedMsg}</span> : null}
          </div>
        </div>

        <aside className="fd-b-side" aria-label="מה יקרה">
          <h3 className="fd-plan-title">מה יקרה{client ? ` אצל ${client.name}` : ''}</h3>
          <button type="button" className="fd-plan-toggle" aria-expanded={planOpen} onClick={() => setPlanOpen(v => !v)}>
            <Icon name="eye" /> מה יקרה{client ? ` אצל ${client.name}` : ''}
          </button>
          <div className={`fd-plan-wrap${planOpen ? ' is-open' : ''}`}>
            {client && plan ? <Plan plan={plan} flow={draft} clientName={client.firstName} spouse={client.facts.married ? client.spouseName : undefined} /> : (
              <p className="fd-sub">בחרו לקוח ב«בדיקה לפי לקוח» כדי לראות מה ייפתח אצלו, מה יישלח, ומה יחכה לך.</p>
            )}
            {client && (
              <button type="button" className="fd-btn is-wide" onClick={() => onRunAt(draft.id, client.id)} disabled={dirty}
                title={dirty ? 'קודם שומרים' : undefined}>
                להפעיל אצל {client.name} (הדגמה) ←
              </button>
            )}
          </div>
        </aside>
      </div>

      {itemSheet && (() => {
        const s = draft.stages.find(x => x.id === itemSheet.stageId);
        const it = s?.items.find(x => x.uid === itemSheet.uid);
        if (!s || !it) return null;
        const idx = s.items.indexOf(it);
        return (
          <Sheet title={itemName(it.ref)} sub={`בשלב «${s.name}»`} onClose={() => setItemSheet(null)}
            foot={<>
              <button type="button" className="fd-btn is-danger" onClick={() => { patchItem(s.id, it.uid, () => null); setItemSheet(null); }}>הסרה מהמסלול</button>
              <span className="fd-spacer" />
              <button type="button" className="fd-btn" onClick={() => setItemSheet(null)}>סיום</button>
            </>}>
            <div className="fd-cap">למי זה חל</div>
            <ConditionEditor value={it.when} onChange={w => patchItem(s.id, it.uid, x => ({ ...x, when: w }))} />
            <label className="fd-check">
              <input type="checkbox" checked={!it.optional} onChange={e => patchItem(s.id, it.uid, x => ({ ...x, optional: !e.target.checked }))} />
              <span>חובה כדי שהשלב יושלם</span>
            </label>
            <div className="fd-cap">מיקום</div>
            <div className="fd-row-btns">
              <button type="button" className="fd-btn is-ghost" disabled={idx === 0}
                onClick={() => patchStage(s.id, x => { const a = [...x.items]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return { ...x, items: a }; })}>↑ למעלה</button>
              <button type="button" className="fd-btn is-ghost" disabled={idx === s.items.length - 1}
                onClick={() => patchStage(s.id, x => { const a = [...x.items]; [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]]; return { ...x, items: a }; })}>↓ למטה</button>
              <label className="fd-inline">
                <span className="fd-sr">העברה לשלב</span>
                <select value={s.id} onChange={e => {
                  const to = e.target.value;
                  setDraft(d => ({ ...d, stages: d.stages.map(x => x.id === s.id ? { ...x, items: x.items.filter(i => i.uid !== it.uid) } : x.id === to ? { ...x, items: [...x.items, it] } : x) }));
                  setItemSheet({ stageId: to, uid: it.uid });
                }} aria-label="העברה לשלב">
                  {draft.stages.map(x => <option key={x.id} value={x.id}>{x.id === s.id ? `בשלב «${x.name}»` : `העברה ל«${x.name}»`}</option>)}
                </select>
              </label>
            </div>
            <p className="fd-sub">הסדר כאן הוא רק סדר ההצגה בדף. מה שבאותו שלב מתקדם במקביל.</p>
          </Sheet>
        );
      })()}

      {stageSheet && (() => {
        const s = draft.stages.find(x => x.id === stageSheet);
        if (!s) return null;
        const idx = draft.stages.indexOf(s);
        const dependents = draft.stages.filter(x => (x.start.kind === 'after_stage' && x.start.stageId === s.id)
          || (x.start.kind === 'after_item' && s.items.some(i => i.uid === (x.start as { itemUid: string }).itemUid)));
        return (
          <Sheet title={`שלב «${s.name}»`} onClose={() => setStageSheet(null)}
            foot={<>
              <button type="button" className="fd-btn is-danger" disabled={dependents.length > 0}
                title={dependents.length ? `«${dependents.map(d => d.name).join('», «')}» נפתח אחריו` : undefined}
                onClick={() => { setDraft(d => ({ ...d, stages: d.stages.filter(x => x.id !== s.id) })); setStageSheet(null); }}>הסרת השלב</button>
              <span className="fd-spacer" />
              <button type="button" className="fd-btn" onClick={() => setStageSheet(null)}>סיום</button>
            </>}>
            <label className="fd-field">
              <span>שם השלב</span>
              <input value={s.name} onChange={e => patchStage(s.id, x => ({ ...x, name: e.target.value }))} autoFocus />
            </label>
            <div className="fd-cap">השלב כולו חל רק כש…</div>
            <ConditionEditor value={s.when} onChange={w => patchStage(s.id, x => ({ ...x, when: w }))} />
            <div className="fd-cap">סדר השלבים ברשימה</div>
            <div className="fd-row-btns">
              <button type="button" className="fd-btn is-ghost" disabled={idx === 0}
                onClick={() => setDraft(d => { const a = [...d.stages]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return { ...d, stages: a }; })}>↑ למעלה</button>
              <button type="button" className="fd-btn is-ghost" disabled={idx === draft.stages.length - 1}
                onClick={() => setDraft(d => { const a = [...d.stages]; [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]]; return { ...d, stages: a }; })}>↓ למטה</button>
            </div>
            <p className="fd-sub">מתי השלב נפתח נקבע ב«נפתח» — לא במיקום ברשימה.</p>
            {dependents.length > 0 && <p className="fd-sub">אי אפשר להסיר: «{dependents.map(d => d.name).join('», «')}» נפתח אחריו.</p>}
          </Sheet>
        );
      })()}

      {addSheet && <AddToStageSheet stage={draft.stages.find(s => s.id === addSheet)!} onClose={() => setAddSheet(null)}
        onAdd={ref => { patchStage(addSheet, s => ({ ...s, items: [...s.items, { uid: `u-${Date.now().toString(36)}`, ref }] })); setAddSheet(null); }} />}
    </div>
  );
}

function Plan({ plan, flow, clientName, spouse }: { plan: PlanStage[]; flow: Flow; clientName: string; spouse?: string }) {
  // שלבים שנפתחים יחד, עם פריטים ללקוח — יוצאים במייל אחד.
  const together = new Map<string, string[]>();
  for (const p of plan) {
    if (!p.applies || p.pageCount === 0 || p.stage.delivery === 'page_only') continue;
    const k = JSON.stringify(p.stage.start);
    together.set(k, [...(together.get(k) ?? []), p.stage.name]);
  }
  return (
    <ol className="fd-plan">
      {plan.map(p => {
        const mates = (together.get(JSON.stringify(p.stage.start)) ?? []).filter(n => n !== p.stage.name);
        const toSpouse = p.items.some(i => i.applies && i.persons && i.persons.length > 1 && i.actor === 'client');
        return (
          <li key={p.stage.id} className={p.applies ? '' : 'is-off'}>
            <div className="fd-plan-when">{startLabel(p.stage.start, flow)}</div>
            <div className="fd-plan-name">{p.stage.name}</div>
            {!p.applies ? <div className="fd-plan-line">לא חל — {p.why}</div> : (
              <ul className="fd-plan-lines">
                {p.pageCount > 0 && <li><Icon name="person" size={14} /> {p.pageCount} {p.pageCount === 1 ? 'פריט' : 'פריטים'} בדף של {clientName}</li>}
                {p.meCount > 0 && <li><Icon name="office" size={14} /> {p.meCount} ממתינים לך{p.externalCount ? ` (כולל מייל נפרד לגורם חיצוני)` : ''}</li>}
                {p.pageCount > 0 && (
                  <li className={p.stage.delivery === 'auto' ? 'is-auto' : ''}>
                    <Icon name="mail" size={14} /> {DELIVERY_LABELS[p.stage.delivery].long}
                    {toSpouse && spouse && p.stage.delivery !== 'page_only' ? ` · ול${spouse} מייל משלה` : ''}
                    {mates.length > 0 ? ` · באותו מייל עם «${mates.join('», «')}»` : ''}
                  </li>
                )}
                {p.stage.reminderDays && p.pageCount > 0 && <li><Icon name="clock" size={14} /> תזכורת אחרי {p.stage.reminderDays} ימים, רק על מה שפתוח</li>}
                {p.stage.notifyOfficeOnDone && <li><Icon name="check" size={14} /> הודעה אליך כשהושלם</li>}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ConditionEditor({ value, onChange }: { value?: Condition; onChange: (c?: Condition) => void }) {
  const kinds = value?.kinds ?? [];
  const facts = value?.facts ?? [];
  const set = (next: Condition) => onChange(!next.kinds?.length && !next.facts?.length ? undefined : next);
  const factVal = (k: FactKey): 'any' | 'yes' | 'no' => { const f = facts.find(x => x.key === k); return !f ? 'any' : f.is ? 'yes' : 'no'; };
  return (
    <div className="fd-cond">
      <div className="fd-cond-kinds" role="group" aria-label="סוג לקוח">
        <span className="fd-cond-l">סוג לקוח</span>
        <div className="fd-chiprow">
          {CLIENT_KINDS.map(k => {
            const on = kinds.includes(k);
            return (
              <button key={k} type="button" className={`fd-toggle${on ? ' is-on' : ''}`} aria-pressed={on}
                onClick={() => set({ ...value, kinds: on ? kinds.filter(x => x !== k) : [...kinds, k] })}>{CLIENT_KIND_LABELS[k]}</button>
            );
          })}
        </div>
        <span className="fd-cond-hint">{kinds.length ? '' : 'אף אחד מסומן = כל הסוגים'}</span>
      </div>
      <ul className="fd-cond-facts">
        {FACT_KEYS.map(k => (
          <li key={k}>
            <span>{FACT_LABELS[k].yes}</span>
            <select value={factVal(k)} aria-label={FACT_LABELS[k].yes} onChange={e => {
              const v = e.target.value;
              const rest = facts.filter(x => x.key !== k);
              set({ ...value, facts: v === 'any' ? rest : [...rest, { key: k, is: v === 'yes' }] });
            }}>
              <option value="any">לא משנה</option>
              <option value="yes">רק כן</option>
              <option value="no">רק לא</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddToStageSheet({ stage, onClose, onAdd }: { stage: Stage; onClose: () => void; onAdd: (ref: ItemRef) => void }) {
  const [tab, setTab] = useState<'request' | 'document' | 'action' | 'task'>('request');
  const [task, setTask] = useState('');
  const inStage = new Set(stage.items.map(i => i.ref.kind === 'library' || i.ref.kind === 'action' ? `${i.ref.kind}:${i.ref.id}` : ''));
  return (
    <Sheet title={`הוספה ל«${stage.name}»`} sub="מהספרייה — לא מעתיקים, מצביעים" onClose={onClose}>
      <Seg label="מה מוסיפים" value={tab} onChange={setTab}
        options={[{ value: 'request', label: 'בקשה' }, { value: 'document', label: 'מסמך' }, { value: 'action', label: 'פעולה מול רשות' }, { value: 'task', label: 'עבודה שלך' }]} />
      {(tab === 'request' || tab === 'document') && (
        <ul className="fd-pick">
          {LIBRARY.filter(e => e.shelf === tab).map(e => {
            const has = inStage.has(`library:${e.id}`);
            return (
              <li key={e.id}>
                <button type="button" className="fd-pick-row" disabled={has} onClick={() => onAdd({ kind: 'library', id: e.id })}>
                  <span>{e.name}</span><small>{has ? 'כבר בשלב' : e.shelf === 'request' ? (e.actor === 'client' ? 'הלקוח' : e.actor === 'office' ? 'אתה' : 'גורם חיצוני') : e.fileName}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'action' && (
        <>
          <p className="fd-sub">פעולות שקיימות ב«אוטומציות». במסלול הן תמיד ממתינות ללחיצה שלך — לא רצות לבד.</p>
          <ul className="fd-pick">
            {ACTIONS.map(a => {
              const has = inStage.has(`action:${a.id}`);
              return (
                <li key={a.id}>
                  <button type="button" className="fd-pick-row" disabled={has} onClick={() => onAdd({ kind: 'action', id: a.id })}>
                    <span>{a.name}</span><small>{has ? 'כבר בשלב' : `${a.system}${a.perPerson ? ' · לכל אדם' : ''}`}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {tab === 'task' && (
        <div className="fd-task">
          <label className="fd-field">
            <span>מה צריך לעשות</span>
            <input value={task} onChange={e => setTask(e.target.value)} placeholder="למשל: פתיחת תיק במע״מ" />
          </label>
          <button type="button" className="fd-btn" disabled={task.trim().length < 2} onClick={() => onAdd({ kind: 'task', title: task.trim() })}>הוספה</button>
        </div>
      )}
    </Sheet>
  );
}
