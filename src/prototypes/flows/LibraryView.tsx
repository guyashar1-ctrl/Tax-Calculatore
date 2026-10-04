// «ספרייה» — מה אפשר לבקש מהלקוח ומה שולחים לו. מוגדר פעם אחת; מסלולים מצביעים לכאן.
import { useMemo, useState } from 'react';
import { Sheet, Seg, Chip, Icon } from './ui';
import {
  LIBRARY, ACTOR_LABELS, conditionChips, registerLibraryEntry, usages,
  type Flow, type LibraryEntry, type LibraryRequest, type Actor,
} from './flowModel';

const ACTOR_ICON: Record<Actor, 'person' | 'office' | 'external'> = { client: 'person', office: 'office', external: 'external' };
const NOTIFY_LABEL: Record<LibraryRequest['notify'], string> = {
  owner: 'במייל המרוכז של הדף האישי',
  subject: 'לאדם עצמו, במייל משלו (בן/בת הזוג)',
  external: 'מייל נפרד לגורם החיצוני',
};

export default function LibraryView({ flows, openFlowAt, version, onLibraryChange }: {
  flows: Flow[];
  openFlowAt: (flowId: string, stageId: string) => void;
  version: number;
  onLibraryChange: () => void;
}) {
  const [shelf, setShelf] = useState<'request' | 'document'>('request');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<LibraryEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => LIBRARY.filter(e => e.shelf === shelf && (!q.trim() || e.name.includes(q.trim()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shelf, q, version]);
  const reqN = LIBRARY.filter(e => e.shelf === 'request').length;
  const docN = LIBRARY.filter(e => e.shelf === 'document').length;

  return (
    <div className="fd-lib">
      <div className="fd-toolbar">
        <Seg label="מדף" value={shelf} onChange={setShelf}
          options={[{ value: 'request', label: 'בקשות', count: reqN }, { value: 'document', label: 'מסמכים', count: docN }]} />
        <input className="fd-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש" aria-label="חיפוש בספרייה" />
        {shelf === 'request' && <button type="button" className="fd-btn is-ghost" onClick={() => setAdding(true)}><Icon name="plus" /> בקשה חדשה</button>}
      </div>
      <p className="fd-sub">{shelf === 'request' ? 'כל מה שאפשר לבקש מלקוח — מה הוא רואה, מי עושה, ומה מסיים.' : 'קבצים שהמשרד שולח ללקוחות. מסלול או «＋ בקשה» אצל לקוח שולחים אותם.'}</p>

      <ul className="fd-rows">
        {list.map(e => {
          const used = usages(flows, e.id);
          return (
            <li key={e.id}>
              <button type="button" className="fd-row" onClick={() => setOpen(e)}>
                <span className={`fd-row-ic is-${e.shelf === 'document' ? 'doc' : (e as LibraryRequest).actor}`}>
                  <Icon name={e.shelf === 'document' ? 'doc' : ACTOR_ICON[(e as LibraryRequest).actor]} />
                </span>
                <span className="fd-row-main">
                  <span className="fd-row-title">{e.name}</span>
                  <span className="fd-row-meta">
                    {e.shelf === 'request'
                      ? <>{ACTOR_LABELS[e.actor]}{e.perPerson ? ' · לכל אדם' : ''}{e.source === 'office' ? ' · של המשרד' : ''}</>
                      : <>{e.fileName} · עודכן {e.updated}</>}
                  </span>
                </span>
                <span className="fd-row-end">{used.length ? `${used.length} ${used.length === 1 ? 'מסלול' : 'מסלולים'}` : 'לא בשימוש'}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="fd-empty">אין תוצאות.</li>}
      </ul>

      {open && <EntrySheet entry={open} flows={flows} onClose={() => setOpen(null)} openFlowAt={(f, s) => { setOpen(null); openFlowAt(f, s); }} />}
      {adding && <AddSheet onClose={() => setAdding(false)} onAdd={e => { registerLibraryEntry(e); setAdding(false); onLibraryChange(); setOpen(e); }} />}
    </div>
  );
}

function EntrySheet({ entry, flows, onClose, openFlowAt }: {
  entry: LibraryEntry; flows: Flow[]; onClose: () => void; openFlowAt: (flowId: string, stageId: string) => void;
}) {
  const used = usages(flows, entry.id);
  if (entry.shelf === 'document') {
    return (
      <Sheet title={entry.name} sub="מסמך לשליחה" onClose={onClose}>
        <dl className="fd-dl">
          <dt>הקובץ</dt><dd>{entry.fileName} · עודכן {entry.updated}</dd>
          <dt>מה הלקוח מקבל</dt><dd>שורה ב«מסמכים מהמשרד» בדף האישי, ובמייל המרוכז — «מסמך חדש».</dd>
        </dl>
        <UsedIn used={used} openFlowAt={openFlowAt} />
      </Sheet>
    );
  }
  return (
    <Sheet title={entry.name} sub={entry.source === 'system' ? 'בקשה של המערכת' : 'בקשה של המשרד'} onClose={onClose}>
      <div className="fd-cap">מה הלקוח רואה</div>
      <div className="fd-mini-card">
        <div className="fd-mini-title">{entry.clientTitle}</div>
        {entry.clientSub && <div className="fd-mini-sub">{entry.clientSub}</div>}
        {entry.checklist && (
          <ul className="fd-mini-list">
            {entry.checklist.map(l => (
              <li key={l.label}>{l.label}{conditionChips(l.when).map(c => <Chip key={c} tone="line">{c}</Chip>)}</li>
            ))}
          </ul>
        )}
      </div>
      <dl className="fd-dl">
        <dt>מי עושה</dt><dd>{ACTOR_LABELS[entry.actor]}{entry.perPerson ? ' — לכל אדם: הלקוח, ובן/בת הזוג כשנשוי/אה' : ''}</dd>
        <dt>מה מסיים</dt><dd>{entry.doneWhen}</dd>
        <dt>ההודעה</dt><dd>{entry.actor === 'office' ? 'אין — זו עבודה שלך' : NOTIFY_LABEL[entry.notify]}</dd>
        {entry.needsPrep && <><dt>לפני שיוצא</dt><dd>{entry.needsPrep} — ממתין לך</dd></>}
        {entry.once && <><dt>חוזרת?</dt><dd>פעם אחת ללקוח. אם כבר הושלמה — לא נפתחת שוב.</dd></>}
        {entry.detail && <><dt>פירוט</dt><dd>{entry.detail}</dd></>}
      </dl>
      <UsedIn used={used} openFlowAt={openFlowAt} />
    </Sheet>
  );
}

function UsedIn({ used, openFlowAt }: { used: ReturnType<typeof usages>; openFlowAt: (flowId: string, stageId: string) => void }) {
  return (
    <>
      <div className="fd-cap">בשימוש ב</div>
      {used.length === 0 ? <p className="fd-sub">עוד לא באף מסלול. אפשר להוסיף אותה ללקוח בודד מ«＋ בקשה».</p> : (
        <ul className="fd-used">
          {used.map(u => (
            <li key={`${u.flow.id}:${u.stage.id}`}>
              <button type="button" className="fd-link" onClick={() => openFlowAt(u.flow.id, u.stage.id)}>
                {u.flow.name} ← {u.stage.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (e: LibraryRequest) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'files' | 'confirm' | 'text'>('files');
  const [perPerson, setPerPerson] = useState(false);
  const DONE: Record<typeof kind, string> = { files: 'הקבצים הועלו', confirm: 'הלקוח אישר', text: 'הלקוח ענה' };
  const ok = name.trim().length > 1;
  return (
    <Sheet title="בקשה חדשה לספרייה" sub="מוגדרת פעם אחת — זמינה לכל המסלולים ולכל לקוח" onClose={onClose}
      foot={<>
        <button type="button" className="fd-btn is-ghost" onClick={onClose}>ביטול</button>
        <button type="button" className="fd-btn" disabled={!ok} onClick={() => onAdd({
          id: `office-${Date.now()}`, shelf: 'request', name: name.trim(), actor: 'client', notify: 'owner', source: 'office',
          realType: 'custom_request', clientTitle: name.trim(), doneWhen: DONE[kind], perPerson,
        })}>הוספה לספרייה</button>
      </>}>
      <label className="fd-field">
        <span>השם — כך הלקוח יראה אותה</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: אישורי ניכוי מס במקור" autoFocus />
      </label>
      <fieldset className="fd-field">
        <legend>מה הלקוח עושה</legend>
        <Seg label="מה הלקוח עושה" value={kind} onChange={setKind}
          options={[{ value: 'files', label: 'מעלה קבצים' }, { value: 'confirm', label: 'מאשר' }, { value: 'text', label: 'עונה' }]} />
      </fieldset>
      <label className="fd-check">
        <input type="checkbox" checked={perPerson} onChange={e => setPerPerson(e.target.checked)} />
        <span>לכל אדם — גם לבן/בת הזוג כשנשוי/אה</span>
      </label>
    </Sheet>
  );
}
