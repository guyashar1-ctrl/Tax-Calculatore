// «ספרייה» — מה מבקשים מהלקוח ומה שולחים לו. כל אחד מוגדר כאן פעם אחת;
// מסלולים מצביעים לכאן, ו«＋ בקשה חדשה» בכרטיס הלקוח בוחר מכאן (2.10.2026).
// ‼ הכפתור כאן נקרא «＋ בקשה לספרייה» — לא בשם של הכפתור בכרטיס, ששולח ללקוח.
//
// ‼ (3.10.2026, סבב 3 §4) רשימה אחת, מקור אחד:
//   · «בקשות» — רשימה אחת לפי א״ב: בקשות של המשרד ונוסחים מוכנים יחד. נוסח מוכן
//     שלא נערך מסומן בשקט; «עריכה» שומרת את נוסח המשרד (upsert_library_request —
//     המובנית עצמה לא נכתבת), ו«חזרה לנוסח המוכן» בתוך העורך.
//   · «נפתחות אוטומטית בקליטה» — בקשות המערכת שהמחולל פותח ושאין להן שורה ברשימה
//     (ייצוג, מכתב לרו״ח הקודם, פייפרלס…). מקופל, לקריאה בלבד, עם קישור לפריט במסלול.
//   · «מסמכים» — settings.client_documents, דרך ClientDocumentsSection; «בשימוש ב» בשורה.
// ‼ (4.10.2026) כל בקשה פעם אחת: נוסח מוכן מסוג קבוע («מסמכים מהלקוח», «פרטי הרו״ח
// הקודם») הוא השורה של בקשת המערכת — «בשימוש ב» סופר גם את הפריט מאותו סוג בקליטה, והקישור
// נוחת על הפריט (שם מוגדר מה לקוח חדש מקבל). שורה שהנוסח שלה כאן לא מגיע לאף לקוח
// (editsInIntake) — «עריכה ←» נוחתת על הפריט בקליטה, לא על עורך שלא משנה כלום.
// ‼ «בשימוש ב» נגזר מהגרסה הנוכחית של כל מסלול פעיל — אותו מקור שהשרת בודק
// כשמוחקים (delete_library_request), כדי שהמסך והסירוב יגידו אותו דבר.
//
// focus: 'requests' | 'documents' | 'request:<templateId>' (נוחת על השורה; גם מזהה
// של מובנית שהמשרד ערך) | 'auto' | 'auto:<stepType>' (פותח את קטע הקליטה).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import type { AssetRef, OfficePageId } from '../officeModel';
import ClientDocumentsSection from '../ClientDocumentsSection';
import { loadRequestTemplates, templateForRef, type RequestTemplate } from '../../../lib/requestTemplates';
import { documentLibrary } from '../../../lib/clientGuide';
import { CATALOG_STEP_TYPES } from '../../../types/journeyDefaults';
import { loadOfficeFlows } from '../../../features/flows/api';
import type { OfficeFlow } from '../../../features/flows/types';
import {
  actorText, autoLabel, autoResultText, autoWhenText, canBeInFlow, editsInIntake, gapsLineText, gapText, groupByLetter,
  GROUP_FROM, isPreset, matchesQuery, normalizeForSearch, searchTextOf, seesText, sortByName, systemTypeOf,
} from './library/libraryModel';
import {
  UsedIn, byDoc, byLibraryRow, bySystem, flowItemFocus, flowStageFocus, libraryUses, type LibraryUse,
} from './library/usedIn';
import RequestEditor from './library/RequestEditor';
import AutoSection, { type AutoRow } from './library/AutoSection';
import './library.css';

export { libraryUses, type LibraryUse } from './library/usedIn';

type Shelf = 'requests' | 'documents';

interface Props {
  draft: FirmProfile;
  saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  noteUpload: (r: AssetRef) => void;
  /** «שליחה ללקוח» ממסמך — הקונסולה פותחת בחירת לקוח. */
  onSendToClient?: (doc: { id: string; label: string; fileName?: string }) => void;
  /** ראה למעלה — המדף, השורה או קטע הקליטה שנפתחים. */
  focus?: string | null;
  go: (page: OfficePageId | null, focus?: string) => void;
}

/** הבקשות שהמערכת יוצרת במסלול הקליטה — מוצגות, לא נערכות כאן. */
const SYSTEM_ROWS = ['representation', ...CATALOG_STEP_TYPES];

export default function LibraryPage({ draft, saved, setDraft, noteUpload, onSendToClient, focus, go }: Props) {
  const [shelf, setShelf] = useState<Shelf>(focus === 'documents' ? 'documents' : 'requests');
  const [templates, setTemplates] = useState<RequestTemplate[] | null>(null);
  const [flows, setFlows] = useState<OfficeFlow[] | null>(null);
  const [flowsError, setFlowsError] = useState(false);
  const [q, setQ] = useState('');
  const term = useDeferredValue(q.trim());
  const [editing, setEditing] = useState<{ template: RequestTemplate | null; name?: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(!!focus && focus.startsWith('auto'));
  const [highlight, setHighlight] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);

  const reloadTemplates = useCallback(async () => {
    const l = await loadRequestTemplates();
    setTemplates(l);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRequestTemplates().then(l => { if (!cancelled) setTemplates(l); });
    void loadOfficeFlows().then(r => {
      if (cancelled) return;
      setFlows(r.flows);
      setFlowsError(!r.ok);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  const flowList = useMemo(() => flows ?? [], [flows]);
  const usesUnknown = flows === null || flowsError;
  const docs = useMemo(() => documentLibrary(draft), [draft]);
  // השם של קובץ שהוסר רק בטיוטה — מהשמור (לפריט במסלול אין תמיד עותק של השם).
  const savedDocLabels = useMemo(() => new Map(documentLibrary(saved).map(d => [d.id, d.label])), [saved]);
  const onboarding = flowList.find(f => f.trigger === 'quote_approved') ?? null;

  // ── הרשימה האחת ──
  const all = useMemo(() => sortByName((templates ?? []).map(t => ({
    t, name: t.name, hay: searchTextOf(t), uses: libraryUses(flowList, byLibraryRow(t)),
  }))), [templates, flowList]);
  // ‼ בקשה שלא תיפתח כמו שהיא (gapText) — בספרייה גדולה נמצאת רק בגלילה; שורה למעלה מסננת אליהן.
  const gapRows = useMemo(() => all.filter(r => gapText(r.t)), [all]);
  const gapsOn = onlyGaps && gapRows.length > 0;
  const shown = useMemo(() => (term ? all.filter(r => matchesQuery(r.hay, term)) : gapsOn ? gapRows : all), [all, term, gapsOn, gapRows]);
  // ריק — בלי רשימה בכלל (אחרת נשארים שני קווי שערה ריקים מעל קטע הקליטה).
  const groups = useMemo(() => (shown.length >= GROUP_FROM ? groupByLetter(shown)
    : shown.length ? [{ letter: '', items: shown }] : []), [shown]);

  // ── נפתחות אוטומטית בקליטה ──
  const stages = useMemo(() => onboarding?.definition?.stages ?? [], [onboarding]);
  // השלב שנפתח מיד — רק בו אפשר להוסיף בקשת מערכת (AddSheet), ו«איך מגיע» שלו הוא של רובן.
  const startStage = stages.find(s => s.opens.after === 'start') ?? stages[0] ?? null;
  const addFocus = onboarding && startStage ? flowStageFocus({ flowId: onboarding.id, stageKey: startStage.key }) : 'onboarding';
  const autoKnown = !usesUnknown && !!onboarding;
  // ‼ סוג שיש לו שורה ברשימה (נוסח מוכן מסוג קבוע) — לא מופיע שוב בקטע הקליטה.
  const owned = useMemo(() => new Set(all.map(r => systemTypeOf(r.t)).filter((x): x is string => !!x)), [all]);
  const autoRows = useMemo<AutoRow[]>(() => SYSTEM_ROWS.filter(st => !owned.has(st)).map(st => {
    const uses = onboarding ? libraryUses([onboarding], bySystem(st)) : [];
    const kinds = uses.length ? [...new Set(uses.flatMap(u => u.kinds))] : null;
    const rep = st === 'representation';
    // ייצוג: מה מסומן מראש מוגדר בחלק «ייצוג מההצעה» של מסלול הקליטה (FlowsPage: focus=representation).
    const focus = rep ? 'representation' : uses[0] ? flowItemFocus(uses[0]) : null;
    const stage = uses[0] ? stages.find(s => s.key === uses[0].stageKey) : rep ? startStage : null;
    return {
      stepType: st, label: autoLabel(st), when: autoWhenText(st, kinds), focus,
      // ייצוג נוצר מההצעה עצמה — נפתח גם כשהפריט לא מוצג במסלול.
      inFlow: rep || uses.length > 0, delivery: stage?.delivery ?? null,
    };
  }), [owned, onboarding, stages, startStage]);
  const autoShown = term ? autoRows.filter(r => matchesQuery(normalizeForSearch(`${r.label} ${r.when}`), term)) : autoRows;
  // בחיפוש — הקטע נפתח כשיש בו תוצאה, כדי שלא «ייעלם» מה שמחפשים.
  const forcedOpen = !!term && autoShown.length > 0;
  const autoIsOpen = autoOpen || forcedOpen;
  // ‼ פתיחה שהחיפוש כפה אינה בחירה של המשתמש — אחרי שמנקים את החיפוש הקטע חוזר להיות מקופל.
  const onAutoToggle = (o: boolean) => { if (!forcedOpen) setAutoOpen(o); };
  // ‼ חיפוש שמוצא מסמך ולא בקשה — אומרים איפה הוא, במקום להציע ליצור בקשה באותו שם.
  const docMatches = term ? docs.filter(d => matchesQuery(normalizeForSearch(d.label), term)).length : 0;

  /**
   * ‼ שורה שהנוסח שלה כאן לא מגיע לאף לקוח (editsInIntake) — «עריכה» נוחתת על הפריט
   * במסלול הקליטה. אין מסלול קליטה / המסלולים לא נטענו — העורך כאן, כמו קודם.
   */
  const intakeRoute = (t: RequestTemplate, uses: LibraryUse[]): string | null => {
    if (!editsInIntake(t) || !autoKnown) return null;
    const u = uses.find(x => x.onboarding && x.system);
    return u ? flowItemFocus(u) : addFocus;
  };

  // ── נחיתה: מקישור (שורה בספרייה או בקשה בקטע הקליטה), או על מה שנשמר עכשיו ──
  // ‼ בספרייה של מאה בקשות, בקשה שנשמרה עלולה לנחות רחוק מהמקום שבו הייתה.
  const [landOn, setLandOn] = useState<string | null>(null);
  const landedFocus = useRef(false);
  useEffect(() => {
    if (!templates) return;
    let id: string | null = null;
    if (landOn) {
      const t = templates.find(x => x.name.trim() === landOn);
      if (t) id = `lb-req-${t.id}`;
      setLandOn(null);
    } else if (focus && !landedFocus.current) {
      landedFocus.current = true;
      if (focus.startsWith('request:')) {
        const t = templateForRef(templates, focus.slice('request:'.length));
        if (t) id = `lb-req-${t.id}`;
      } else if (focus.startsWith('auto:')) {
        id = `lb-auto-${focus.slice('auto:'.length)}`;
      }
    }
    if (!id) return;
    const key = id;
    requestAnimationFrame(() => {
      const el = document.getElementById(key);
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      setHighlight(key);
    });
  }, [focus, templates, landOn]);
  useEffect(() => {
    if (!highlight) return;
    const tm = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(tm);
  }, [highlight]);

  const usesOfDoc = useCallback((id: string) => (usesUnknown ? [] : libraryUses(flowList, byDoc(id))), [flowList, usesUnknown]);
  // ‼ מסלול שעדיין מצביע על קובץ שהוסר (או יוסר בשמירה) — שורה אדומה עד שמתקנים. השרת לא
  // יוצר אותו (_flow_item_spec: library_item_missing), ואצל כל לקוח נפתחת שורה «לא נוצרה».
  const orphanDocs = useMemo(() => {
    if (usesUnknown) return [];
    const have = new Set(docs.map(d => d.id));
    const out: { docId: string; title: string; pending: boolean; uses: LibraryUse[] }[] = [];
    for (const f of flowList) for (const s of f.definition?.stages ?? []) for (const i of s.items) {
      if (i.ref.kind !== 'document' || have.has(i.ref.docId) || out.some(x => x.docId === (i.ref as { docId: string }).docId)) continue;
      const docId = i.ref.docId;
      out.push({
        docId, title: savedDocLabels.get(docId) ?? i.snapshot?.title?.trim() ?? '',
        pending: savedDocLabels.has(docId), uses: libraryUses(flowList, byDoc(docId)),
      });
    }
    return out;
  }, [flowList, usesUnknown, docs, savedDocLabels]);
  const editingUses = editing?.template && !usesUnknown ? libraryUses(flowList, byLibraryRow(editing.template)) : null;
  const autoOpenMatches = autoShown.filter(r => !autoKnown || r.inFlow).length;
  const autoOffMatches = autoShown.length - autoOpenMatches;

  return (
    <div className="lb">
      <div className="lb-toolbar">
        <div className="of-seg" role="group" aria-label="מדף">
          <button type="button" aria-pressed={shelf === 'requests'} onClick={() => setShelf('requests')}>
            בקשות{templates ? ` · ${all.length}` : ''}
          </button>
          <button type="button" aria-pressed={shelf === 'documents'} onClick={() => setShelf('documents')}>
            מסמכים · {docs.length}
          </button>
        </div>
        {shelf === 'requests' && (
          <>
            <input className="of-search lb-search" type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש בקשה" aria-label="חיפוש בקשה בספרייה" />
            {/* ‼ לא «＋ בקשה חדשה» — כך נקרא הכפתור בכרטיס הלקוח, ששולח בקשה ללקוח. כאן מוסיפים לספרייה. */}
            <button type="button" className="btn btn-secondary btn-sm lb-new" onClick={() => setEditing({ template: null })}>＋ בקשה לספרייה</button>
          </>
        )}
      </div>

      {flowsError && <p className="lb-sub is-warn">לא הצלחתי לטעון את המסלולים — «בשימוש ב» לא מוצג כרגע.</p>}
      {flash && <p className="lb-flash" role="status">✓ {flash}</p>}

      {shelf === 'requests' && (
        templates === null ? <div className="of-empty">טוען את הספרייה…</div> : (
          <>
            {term ? (
              <p className="lb-results" role="status">
                {shown.length > 0 ? (
                  <>
                    {shown.length === 1 ? 'בקשה אחת' : `${shown.length} בקשות`}
                    {docMatches > 0 && <> · יש גם מסמך בשם הזה <button type="button" className="of-link" onClick={() => setShelf('documents')}>← מסמכים</button></>}
                  </>
                  // ‼ מה שהמערכת פותחת לבד אינו «אין» — אחרת המשתמש יוצר עותק כפול של בקשת מערכת.
                ) : autoShown.length > 0 ? (
                  <>
                    {autoResultText(autoOpenMatches, autoOffMatches)}{' '}
                    <button type="button" className="of-link"
                      onClick={() => document.getElementById('lb-auto')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>למטה ↓</button>
                  </>
                ) : docMatches > 0 ? (
                  <>
                    אין בקשה כזו — יש מסמך בשם הזה.{' '}
                    <button type="button" className="of-link" onClick={() => setShelf('documents')}>← מסמכים</button>
                  </>
                ) : (
                  <>
                    אין בקשה כזו בספרייה.{' '}
                    <button type="button" className="of-link" onClick={() => setEditing({ template: null, name: q.trim() })}>＋ בקשה לספרייה בשם «{q.trim()}»</button>
                  </>
                )}
              </p>
            ) : gapRows.length > 0 && (
              <p className="lb-results lb-gap" role="status">
                {gapsOn ? <>מוצגות רק בקשות שלא ייפתחו כמו שהן.{' '}
                  <button type="button" className="of-link" onClick={() => setOnlyGaps(false)}>הצגת הכול</button></>
                  : <>{gapsLineText(gapRows.length)} —{' '}
                    <button type="button" className="of-link" onClick={() => setOnlyGaps(true)}>הצגה</button></>}
              </p>
            )}
            {!term && all.length === 0 && (
              <p className="lb-empty">
                עוד אין בקשות בספרייה. «בקשה לספרייה» — והיא תופיע כאן, ל<button type="button" className="of-link" onClick={() => go('flows')}>מסלולים</button> ול<span className="lb-nowrap">«בקשה חדשה»</span> בכרטיס הלקוח.
              </p>
            )}
            {/* ‼ ספרייה גדולה: אינדקס אותיות במקום גלילה על מאה שורות. נשאר צמוד למעלה עד סוף
                הרשימה — אחרי קפיצה לאות, האות הבאה במרחק נגיעה. */}
            <div className="lb-az">
            {groups.length > 1 && (
              <nav className="lb-index" aria-label="קפיצה לפי אות">
                {groups.map(g => (
                  <button key={g.letter} type="button" className="lb-index-btn"
                    aria-label={`${g.letter} — ${g.items.length === 1 ? 'בקשה אחת' : `${g.items.length} בקשות`}`}
                    onClick={() => document.getElementById(`lb-letter-${g.letter}`)?.scrollIntoView({ block: 'start' })}>
                    {g.letter}
                  </button>
                ))}
              </nav>
            )}
            {groups.map(g => (
              <section key={g.letter || 'all'} className="lb-letter-group" aria-label={g.letter ? `אות ${g.letter}` : 'בקשות'}>
                {g.letter && <h2 className="lb-letter" id={`lb-letter-${g.letter}`}>{g.letter}</h2>}
                <ul className="lb-list">
                  {g.items.map(({ t, uses }) => {
                    const gap = gapText(t);
                    const route = intakeRoute(t, uses);
                    // ‼ הנוסח שבשורה לא מגיע לאף לקוח — לא מציגים אותו (ולא «נוסח מוכן») כאילו הוא מה שהלקוח רואה.
                    const sees = route ? null : seesText(t);
                    const actor = actorText(t);
                    const rowId = `lb-req-${t.id}`;
                    return (
                      <li key={t.id} id={rowId} className={`lb-row${highlight === rowId ? ' is-focus' : ''}`}>
                        <div className="lb-row-title">
                          <span className="lb-name">{t.name}</span>
                          {!route && isPreset(t) && <span className="lb-preset">נוסח מוכן</span>}
                        </div>
                        {route ? (
                          <button type="button" className="btn btn-secondary btn-sm lb-edit"
                            aria-label={`עריכה במסלול הקליטה: ${t.name}`} onClick={() => go('flows', route)}>עריכה ←</button>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm lb-edit"
                            aria-label={`עריכה: ${t.name}`} onClick={() => setEditing({ template: t })}>עריכה</button>
                        )}
                        <div className="lb-row-meta lb-segs">
                          {sees && <span className="lb-seg lb-sees">{sees}</span>}
                          <span className="lb-seg lb-actor">{actor}</span>
                          {!usesUnknown && (
                            <span className="lb-seg lb-row-used">
                              <UsedIn uses={uses} go={go} loading={false}
                                none={route ? 'לא במסלול הקליטה — לא נפתחת לבד' : canBeInFlow(t) ? undefined : 'רק מכרטיס הלקוח'} />
                            </span>
                          )}
                        </div>
                        {gap && <div className="lb-row-meta lb-gap">{gap}</div>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            </div>

            <AutoSection rows={autoShown} total={autoRows.length} inFlowTotal={autoRows.filter(r => r.inFlow).length}
              searching={!!term} open={autoIsOpen} onToggle={onAutoToggle}
              go={go} highlight={highlight?.startsWith('lb-auto-') ? highlight.slice('lb-auto-'.length) : null}
              known={autoKnown} delivery={startStage?.delivery ?? null} addFocus={addFocus} />
          </>
        )
      )}

      {shelf === 'documents' && (
        <>
          {orphanDocs.map(o => (
            <p key={o.docId} className="lb-error lb-segs" role="alert">
              <span className="lb-seg">
                {o.pending ? `«${o.title}» יוסר בשמירה, ועדיין במסלול — אחרי השמירה הוא לא ייווצר אצל אף לקוח.`
                  : o.title ? `«${o.title}» הוסר מהספרייה, ועדיין במסלול — הוא לא ייווצר אצל אף לקוח.`
                  : 'מסמך שהוסר מהספרייה עדיין במסלול — הוא לא ייווצר אצל אף לקוח.'}
              </span>
              <span className="lb-seg"><UsedIn uses={o.uses} go={go} loading={false} /></span>
            </p>
          ))}
          <ClientDocumentsSection profile={draft} saved={saved} setDraft={setDraft}
            noteUpload={noteUpload} usesOf={usesOfDoc} go={go} onSendToClient={onSendToClient} />
        </>
      )}

      {editing && (
        <RequestEditor template={editing.template} initialName={editing.name} go={go}
          uses={editingUses}
          onClose={() => setEditing(null)}
          onSaved={nm => { setEditing(null); setFlash(`נשמר · ${nm}`); void reloadTemplates().then(() => setLandOn(nm)); }}
          onDeleted={nm => { setEditing(null); setFlash(`נמחק מהספרייה · ${nm}`); void reloadTemplates(); }}
          onReverted={nm => { setEditing(null); setFlash(`חזר לנוסח המוכן · ${nm}`); void reloadTemplates().then(() => setLandOn(nm)); }} />
      )}
    </div>
  );
}
