// «＋ הוספה לשלב» — מהספרייה, לא מעתיקים: הפריט מצביע על הבקשה/המסמך, והשרת
// קורא את הנוסח בזמן היצירה. שלושה מדפים: בקשות · מסמכים · פעולות מול רשות.
import { useState } from 'react';
import type { ClientDocument } from '../../../lib/clientGuide';
import { buildDocumentRequestPayload } from '../../../lib/clientGuide';
import { refersTo, type RequestTemplate } from '../../../lib/requestTemplates';
import { newKey, systemGate, systemName } from '../../../features/flows/preview';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger } from '../../../features/flows/types';
import { CATALOG_STEP_TYPES, CLIENT_KIND_ORDER, REQUEST_META, type ClientKind } from '../../../types/journeyDefaults';
import { kindsPhrase } from '../../../features/flows/conditions';
import { FlSeg, FlSheet } from './ui';
import { actionRef, freeKindsForSystem } from './model';
import { FLOW_ACTIONS, actionTypeOf } from '../../../features/flows/types';
import { REPEATABLE_STEP_TYPES } from '../../../features/flows/compile';
import { templateEntryOwner } from '../../../utils/templateEntryOwner';
import { matchesQuery, normalizeForSearch } from '../../office/pages/library/libraryModel';

type Shelf = 'requests' | 'documents' | 'actions';

const OWNER_LABEL: Record<string, string> = { client: 'הלקוח', me: 'אתה', external: 'גורם חיצוני' };

/** מתי בקשת מערכת נפתחת — אותו כלל ואותו ניסוח כמו בענפים במפה (systemGate). */
function autoWhen(stepType: string, kinds: ClientKind[]): string {
  const rule = systemGate(stepType, {}).rule;
  const when = rule ? `נפתחת ${rule}` : 'נפתחת לכל לקוח חדש או חוזר';
  return kinds.length === CLIENT_KIND_ORDER.length ? when : `${when} · ${kindsPhrase(kinds)}`;
}

export default function AddSheet({ def, trigger, stage, templates, docs, onAdd, onClose, onOpenLibrary }: {
  def: FlowDefinition;
  trigger: FlowTrigger;
  stage: FlowStage;
  templates: RequestTemplate[];
  docs: ClientDocument[];
  onAdd: (item: FlowItem) => void;
  onClose: () => void;
  onOpenLibrary: () => void;
}) {
  const [shelf, setShelf] = useState<Shelf>('requests');
  const [q, setQ] = useState('');
  // ‼ אותו חיפוש כמו בספרייה: «רו"ח», «רוח» ו«רו״ח» — אותו דבר למי שמקליד.
  const needle = q.trim();
  const hit = (name: string) => !needle || matchesQuery(normalizeForSearch(name), needle);
  const onboarding = trigger === 'quote_approved';
  const allItems = def.stages.flatMap(s => s.items.map(i => ({ i, s })));
  const whereIs = (pred: (i: FlowItem) => boolean) => {
    const hit = allItems.find(x => pred(x.i));
    return hit ? (hit.s.key === stage.key ? 'כבר בשלב' : `כבר ב«${hit.s.name}»`) : null;
  };

  // ‼ בקליטה, בקשה מהספרייה שהיא בעצם בקשת מערכת (למשל «מסמכים מהלקוח») הייתה
  // נוצרת פעמיים — פעם מהמחולל ופעם כבקשה של המשרד. שם מוסיפים אותה כבקשת מערכת.
  // ‼ במסלול שחוזר (שנתי/ידני) כל ריצה יוצרת בקשה חדשה — רק בקשה חופשית ובקשת
  // מסמכים חוזרות. סוג «אחד ללקוח» (שאלון, זיהוי…) היה מדולג בשרת (not_repeatable).
  const libRequests = templates.filter(t => {
    const st = t.entries[0]?.stepType ?? 'custom_request';
    return onboarding ? st === 'custom_request' : REPEATABLE_STEP_TYPES.includes(st);
  });
  const systemFree = onboarding && stage.opens.after === 'start'
    ? CATALOG_STEP_TYPES.map(t => ({ t, kinds: freeKindsForSystem(def, stage, t) })).filter(x => x.kinds.length > 0)
    : [];

  // ‼ רשימה אחת לפי א״ב — בלי «מובנות» מול «של המשרד». מה שנפתח לפי ההצעה מסומן בשקט בשורה.
  const rows: { name: string; sys?: { t: string; kinds: ClientKind[] }; tpl?: RequestTemplate }[] = [
    ...systemFree.map(x => ({ name: systemName(x.t), sys: x })),
    ...libRequests.map(t => ({ name: t.name, tpl: t })),
  ].filter(r => hit(r.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const addTemplate = (t: RequestTemplate) => onAdd({
    key: newKey('i'), ref: { kind: 'template', templateId: t.id },
    ...(t.entries[0]?.requiredForClose === false ? { optional: true } : {}),
    snapshot: { stepType: t.entries[0]?.stepType ?? 'custom_request', title: t.name, payload: t.entries[0]?.payload },
  });
  const addDocument = (d: ClientDocument) => onAdd({
    key: newKey('i'), ref: { kind: 'document', docId: d.id },
    snapshot: { stepType: 'custom_request', title: d.label, payload: buildDocumentRequestPayload(d) },
  });
  const addSystem = (stepType: string, kinds: typeof CLIENT_KIND_ORDER) => {
    const scope = stage.when?.kinds?.length ? stage.when.kinds : CLIENT_KIND_ORDER;
    onAdd({
      key: newKey('i'), ref: { kind: 'system', stepType },
      ...(kinds.length < scope.length ? { when: { kinds } } : {}),
    });
  };

  return (
    <FlSheet title={`הוספה ל«${stage.name}»`} sub="מהספרייה — הפריט מצביע על הבקשה, ושינוי בספרייה חל גם כאן" onClose={onClose}
      foot={<>
        <button type="button" className="fl-link" onClick={onOpenLibrary}>לא מוצאים? ← ספרייה</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-secondary" onClick={onClose}>סגירה</button>
      </>}>
      <FlSeg label="מה מוסיפים" value={shelf} onChange={v => { setShelf(v); setQ(''); }}
        options={[{ value: 'requests', label: 'בקשות' }, { value: 'documents', label: 'מסמכים' }, { value: 'actions', label: 'פעולות מול רשות' }]} />

      {shelf !== 'actions' && (
        <input className="fl-pick-search" type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder={shelf === 'requests' ? 'חיפוש בקשה' : 'חיפוש מסמך'} aria-label={shelf === 'requests' ? 'חיפוש בקשה' : 'חיפוש מסמך'} />
      )}

      {shelf === 'requests' && (
        <>
          {rows.length === 0 ? (
            <p className="fl-empty">{needle ? 'לא נמצאה בקשה בשם הזה.' : 'עוד אין בקשות בספרייה.'}</p>
          ) : (
            <ul className="fl-pick">
              {rows.map(r => r.sys ? (
                <li key={'sys:' + r.sys.t}>
                  <button type="button" className="fl-pick-row" onClick={() => addSystem(r.sys!.t, r.sys!.kinds)}>
                    <span>{r.name}<small className="fl-pick-sub">{REQUEST_META[r.sys.t]?.hint}</small></span>
                    <small>{autoWhen(r.sys.t, r.sys.kinds)}</small>
                  </button>
                </li>
              ) : (() => {
                const t = r.tpl!;
                const here = whereIs(i => i.ref.kind === 'template' && refersTo(t, i.ref.templateId));
                return (
                  <li key={t.id}>
                    <button type="button" className="fl-pick-row" disabled={here === 'כבר בשלב'} onClick={() => addTemplate(t)}>
                      <span>{t.name}</span>
                      {/* ‼ מי יבצע בפועל — אותו כלל כמו בשרת (templateEntryOwner). */}
                      <small>{here ?? OWNER_LABEL[templateEntryOwner(t.entries[0])] ?? 'הלקוח'}</small>
                    </button>
                  </li>
                );
              })())}
            </ul>
          )}
          {onboarding && stage.opens.after !== 'start' && (
            <p className="fl-hint">בקשות שנפתחות לפי ההצעה (פייפרלס, רו״ח קודם…) נוספות רק לשלב שנפתח באישור ההצעה.</p>
          )}
        </>
      )}

      {shelf === 'documents' && (
        docs.length === 0 ? <p className="fl-empty">אין מסמכים בספרייה. מוסיפים קובץ בספרייה ← מסמכים, וחוזרים לכאן.</p> : (
          <ul className="fl-pick">
            {docs.filter(d => hit(d.label)).map(d => {
              const here = whereIs(i => i.ref.kind === 'document' && i.ref.docId === d.id);
              return (
                <li key={d.id}>
                  <button type="button" className="fl-pick-row" disabled={here === 'כבר בשלב'} onClick={() => addDocument(d)}>
                    <span>{d.label}</span><small>{here ?? 'הלקוח קורא ומאשר'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {shelf === 'actions' && (
        <>
          <p className="fl-sub">
            קריאה בלבד — PIVO נכנס לרשות וקורא את התיק; התוצאה מוצגת בתיק המס כהצעה. ברירת המחדל: ממתין ללחיצה שלך.
            הזנת ייפוי כוח והגשה אינן חלק ממסלול — הן במרכז הייצוג.
          </p>
          <ul className="fl-pick">
            {FLOW_ACTIONS.map(a => {
              const inStage = stage.items.some(i => i.ref.kind === 'action' && actionTypeOf(i.ref) === a.type);
              return (
                <li key={a.type}>
                  <button type="button" className="fl-pick-row" disabled={inStage}
                    onClick={() => onAdd({ key: newKey('i'), ref: actionRef(a.type), mode: 'manual' })}>
                    <span>{a.name}</span><small>{inStage ? 'כבר בשלב' : `${a.system} · בלחיצה שלך`}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </FlSheet>
  );
}
