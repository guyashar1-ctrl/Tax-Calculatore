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
// ‼ (5.10.2026, הדמיה מאושרת) קטלוג אחד: בקשות המשרד ובקשות המערכת באותה רשימה, ובקשה מורכבת
// (פייפרלס, העברת טיפול, ייצוג) — קבוצה קבועה עם הבקשות שבה. אין יותר רשימה נפרדת «נפתחות
// אוטומטית»: בקשת מערכת היא שורה רגילה, עם «מתי נפתחת?» אל כלל הפתיחה ועם הגבלות העריכה שלה.
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
  actorText, autoLabel, autoWhenText, canBeInFlow, editsInIntake, gapsLineText, gapText, groupByLetter,
  GROUP_FROM, isPreset, matchesQuery, normalizeForSearch, searchTextOf, seesText, sortByName, systemTypeOf,
} from './library/libraryModel';
import {
  UsedIn, byDoc, byLibraryRow, bySystem, flowItemFocus, flowStageFocus, libraryUses, type LibraryUse,
} from './library/usedIn';
import RequestEditor from './library/RequestEditor';
import type { AutoRow } from './library/AutoSection';
import GroupEntry, { type GroupChildModel } from './library/GroupEntry';
import { GROUP_ORDER, REQUEST_GROUPS, type RequestGroupKey } from '../../../features/requests/requestGroups';
import './library.css';
import '../../../features/requests/requestGroups.css';

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
  // ‼ בקשה שלא תיפתח כמו שהיא (gapText) — בספרייה גדולה נמצאת רק בגלילה; שורה למעלה מסננת אליהן
  // (gapEntries, למטה — על הקטלוג המאוחד).
  const gapsOn = onlyGaps;

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

  /* ── 05.10 · קטלוג אחד ────────────────────────────────────────────────────
     ‼ שורה בודדת: בקשה של המשרד, נוסח מוכן, או בקשת מערכת שאינה חלק מקבוצה. קבוצה: כל
     הבקשות שלה בפנים — כולל נוסח מוכן מסוג שבקבוצה («פרטי הרו״ח הקודם»), שלא מופיע פעמיים. */
  const memberTypes = useMemo(() => new Map<string, RequestGroupKey>(GROUP_ORDER.flatMap(g =>
    REQUEST_GROUPS[g].members.map(m => [m.stepType, g] as [string, RequestGroupKey]))), []);
  const autoByType = useMemo(() => new Map(autoRows.map(r => [r.stepType, r])), [autoRows]);
  const templateOfType = useMemo(() => new Map(all.map(r => [systemTypeOf(r.t), r] as const).filter(([k]) => !!k) as [string, typeof all[number]][]), [all]);
  type Entry =
    | { kind: 'template'; name: string; hay: string; t: RequestTemplate; uses: LibraryUse[] }
    | { kind: 'system'; name: string; hay: string; row: AutoRow }
    | { kind: 'group'; name: string; hay: string; key: RequestGroupKey };
  const entries = useMemo<Entry[]>(() => sortByName([
    ...all.filter(r => !memberTypes.has(systemTypeOf(r.t) ?? '')).map(r => ({ kind: 'template' as const, name: r.name, hay: r.hay, t: r.t, uses: r.uses })),
    ...autoRows.filter(r => !memberTypes.has(r.stepType)).map(r => ({ kind: 'system' as const, name: r.label, hay: normalizeForSearch(`${r.label} ${r.when}`), row: r })),
    ...GROUP_ORDER.map(g => ({
      kind: 'group' as const, name: REQUEST_GROUPS[g].title, key: g,
      hay: normalizeForSearch([REQUEST_GROUPS[g].title, REQUEST_GROUPS[g].summary, ...REQUEST_GROUPS[g].members.map(m => m.title)].join(' ')),
    })),
  ]), [all, autoRows, memberTypes]);
  const gapEntries = useMemo(() => entries.filter(e => e.kind === 'template' && gapText(e.t)), [entries]);
  const shownEntries = useMemo(() => (term ? entries.filter(e => matchesQuery(e.hay, term)) : onlyGaps && gapEntries.length > 0 ? gapEntries : entries),
    [entries, term, onlyGaps, gapEntries]);
  const entryGroups = useMemo(() => (shownEntries.length >= GROUP_FROM ? groupByLetter(shownEntries)
    : shownEntries.length ? [{ letter: '', items: shownEntries }] : []), [shownEntries]);

  /** הבקשות שבקבוצה — כל אחת עם הפעולה שמתאימה לה. */
  const kidsOf = (g: RequestGroupKey): GroupChildModel[] => REQUEST_GROUPS[g].members.map(m => {
    const tRow = templateOfType.get(m.stepType);
    const auto = autoByType.get(m.stepType);
    const when = m.stepType === 'business_details' ? 'נפתחת יחד עם ההרשמה לפייפרלס'
      : m.stepType === 'authority_representation' ? 'נפתחת מבקשת הייצוג או מתיק המס, לכל רשות ואדם'
      : m.stepType === 'rep_client_approval' || m.stepType === 'representation_upgrade' ? 'נפתחת לבד מתוך בקשת הייצוג'
      : auto ? (autoKnown && !auto.inFlow ? 'לא בכלל הקליטה — רק ידנית' : auto.when) : (m.when ?? null);
    let action: GroupChildModel['action'] = null;
    if (tRow) {
      const route = intakeRoute(tRow.t, tRow.uses);
      action = route ? { label: 'עריכה ←', onClick: () => go('flows', route), aria: `עריכה בכלל הקליטה: ${m.title}` }
        : { label: 'עריכה', onClick: () => setEditing({ template: tRow.t }) };
    } else if (auto && autoKnown && !auto.inFlow && m.stepType !== 'representation') {
      action = { label: 'הוספה לכלל ←', onClick: () => go('flows', addFocus), aria: `הוספה לכלל הקליטה: ${m.title}` };
    } else if (auto?.focus) {
      action = { label: 'מתי נפתחת?', onClick: () => go('flows', auto.focus ?? 'onboarding') };
    }
    return {
      key: m.stepType, title: m.title, actor: m.actor, when,
      hint: tRow ? m.hint : `${m.hint} · נוסח קבוע של המערכת`,
      action,
    };
  });
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

  return (
    <div className="lb">
      <div className="lb-toolbar">
        <div className="of-seg" role="group" aria-label="מדף">
          <button type="button" aria-pressed={shelf === 'requests'} onClick={() => setShelf('requests')}>
            בקשות{templates ? ` · ${entries.length}` : ''}
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
                {shownEntries.length > 0 ? (
                  <>
                    {shownEntries.length === 1 ? 'תוצאה אחת' : `${shownEntries.length} תוצאות`}
                    {docMatches > 0 && <> · יש גם מסמך בשם הזה <button type="button" className="of-link" onClick={() => setShelf('documents')}>← מסמכים</button></>}
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
            ) : gapEntries.length > 0 && (
              <p className="lb-results lb-gap" role="status">
                {gapsOn ? <>מוצגות רק בקשות שלא ייפתחו כמו שהן.{' '}
                  <button type="button" className="of-link" onClick={() => setOnlyGaps(false)}>הצגת הכול</button></>
                  : <>{gapsLineText(gapEntries.length)} —{' '}
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
            {entryGroups.length > 1 && (
              <nav className="lb-index" aria-label="קפיצה לפי אות">
                {entryGroups.map(g => (
                  <button key={g.letter} type="button" className="lb-index-btn"
                    aria-label={`${g.letter} — ${g.items.length === 1 ? 'בקשה אחת' : `${g.items.length} בקשות`}`}
                    onClick={() => document.getElementById(`lb-letter-${g.letter}`)?.scrollIntoView({ block: 'start' })}>
                    {g.letter}
                  </button>
                ))}
              </nav>
            )}
            {entryGroups.map(g => (
              <section key={g.letter || 'all'} className="lb-letter-group" aria-label={g.letter ? `אות ${g.letter}` : 'בקשות'}>
                {g.letter && <h2 className="lb-letter" id={`lb-letter-${g.letter}`}>{g.letter}</h2>}
                <ul className="lb-list lb-cards">
                  {g.items.map(e => {
                    if (e.kind === 'group') {
                      const rowId = `lb-group-${e.key}`;
                      return (
                        <li key={rowId} className="lb-group-li">
                          <GroupEntry groupKey={e.key} kids={kidsOf(e.key)} rowId={rowId} highlight={highlight === rowId}
                            defaultOpen={e.key === 'paperless' || !!term}
                            onRules={() => go('flows', e.key === 'representation' ? 'representation' : 'onboarding')} />
                        </li>
                      );
                    }
                    if (e.kind === 'system') {
                      const r = e.row;
                      const rowId = `lb-auto-${r.stepType}`;
                      const off = autoKnown && !r.inFlow;
                      return (
                        <li key={rowId} id={rowId} className={`lb-row${highlight === rowId ? ' is-focus' : ''}`}>
                          <div className="lb-row-title">
                            <span className="lb-name">{r.label}</span>
                            <span className="lb-preset">בקשה אחת · של המערכת</span>
                          </div>
                          <button type="button" className="btn btn-secondary btn-sm lb-edit"
                            aria-label={`מתי נפתחת: ${r.label}`} onClick={() => go('flows', r.focus ?? addFocus)}>מתי נפתחת?</button>
                          <div className="lb-row-meta lb-segs">
                            <span className="lb-seg">{off ? 'לא בכלל הקליטה — נפתחת רק ידנית מכרטיס הלקוח' : r.when}</span>
                            <span className="lb-seg">נוסח קבוע של המערכת</span>
                          </div>
                        </li>
                      );
                    }
                    const { t, uses } = e;
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
                          <span className="lb-preset">{!route && isPreset(t) ? 'בקשה אחת · נוסח מוכן' : 'בקשה אחת'}</span>
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
