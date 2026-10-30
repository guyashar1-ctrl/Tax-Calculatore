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
// ‼ (5.10.2026) «צפייה» — כל שורה (בקשה, בקשת מערכת, קבוצה וכל בקשה בתוכה, מסמך) פותחת מגירה שמראה בדיוק מה שהלקוח מקבל, על נתוני
// דוגמה מסומנים (features/requestPreview). היא לא שולחת, לא שומרת ולא חותמת; הפעולה הקיימת בשורה נשארת.
//
// focus: 'requests' | 'documents' | 'request:<templateId>' (נוחת על השורה; גם מזהה
// של מובנית שהמשרד ערך) | 'auto' | 'auto:<stepType>' (פותח את קטע הקליטה).
// viewFocus: 'view:<יעד>[@<בחירה>]' — מה שפתוח במגירה (בכתובת, כדי שרענון ו«אחורה» יעבדו).
//
// ‼ (16.10.2026, «פחות עומס») עמוד אחד במקום שלוש לשוניות: «בקשות», «מסמכים» ו«פגישות» הם מקטעים
//   מקופלים באותו עמוד (בקשות — פתוח). קבוצות מקופלות. בשורה פעולה אחת גלויה (עריכה / «מתי נפתחת?»);
//   לחיצה על השם = «צפייה». תוויות שחזרו בכל שורה («בקשה אחת», «נוסח קבוע של המערכת») ירדו.
//
// ‼ (30.10.2026, הדמיה מאושרת docs/proposals/2026-10-30-library-simple.html) בשפה של «בקשות»:
//   בקשות בודדות למעלה, «קבוצות» מתחת (הקבועות + מה שהמשרד בנה אצל לקוח — כלל work_group).
//   בשורה נקודה, שם ומילה אחת («צפייה» / «חסר»); כל השאר בלחיצה (LibRow). קבוצה = נקודה אחרי
//   נקודה. בלי אינדקס אותיות ובלי תגיות. אותה שורה גם ב«מסמכים» וב«פגישות».
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import type { AssetRef, OfficePageId } from '../officeModel';
import ClientDocumentsSection from '../ClientDocumentsSection';
import { loadRequestTemplates, templateForRef, type RequestTemplate } from '../../../lib/requestTemplates';
import { documentLibrary } from '../../../lib/clientGuide';
import { CATALOG_STEP_TYPES } from '../../../types/journeyDefaults';
import { loadOfficeFlows } from '../../../features/flows/api';
import { FLOW_ACTION_TYPES, STEP_ACTION_NAMES, actionTypeOf, type OfficeFlow } from '../../../features/flows/types';
import {
  actorText, autoLabel, autoWhenText, canBeInFlow, editsInIntake, gapsLineText, gapText,
  isPreset, matchesQuery, normalizeForSearch, searchTextOf, seesText, sortByName, systemTypeOf,
} from './library/libraryModel';
import {
  UsedIn, byDoc, byLibraryRow, bySystem, flowItemFocus, flowStageFocus, libraryUses, type LibraryUse,
} from './library/usedIn';
import RequestEditor from './library/RequestEditor';
import type { AutoRow } from './library/AutoSection';
import { LibGroup, LibRow, useOneOpen, type ChainKid } from './library/LibRow';
import PreviewButton from '../../../features/requestPreview/PreviewButton';
import { GROUP_ACTOR_LABEL, GROUP_ORDER, REQUEST_GROUPS, type GroupActor, type RequestGroupKey } from '../../../features/requests/requestGroups';
import RequestPreviewSheet from '../../../features/requestPreview/RequestPreviewSheet';
import type { EditHint } from '../../../features/requestPreview/registry';
import { parseViewFocus, resolveFocus, targetKey, targetOfTemplate, targetToFocus, type PreviewTarget, type Selection } from '../../../features/requestPreview/targets';
import MeetingsLibraryShelf, { meetingKindFromFocus } from '../../../features/meetings/MeetingsLibraryShelf';
import { MEETING_KINDS } from '../../../../supabase/functions/_shared/meetingInvite';
import './library.css';
import '../../../features/requests/requestGroups.css';

export { libraryUses, type LibraryUse } from './library/usedIn';

/** המסמכים שבקשת «מסמכים» מבקשת — לפי הסדר. ריק = לא בקשת מסמכים. */
function docListOf(t: RequestTemplate): string[] {
  const e = t.entries?.[0];
  if (!e || e.stepType !== 'client_documents') return [];
  const list = (e.payload as { checklist?: { label?: unknown }[] } | undefined)?.checklist ?? [];
  return list.map(x => String(x.label ?? '').trim()).filter(Boolean);
}

/** בקשה בתוך קבוצה קבועה — מה היא, מי עושה, והפעולה שלה (עריכה / «מתי נפתחת?»). */
interface GroupChildModel {
  key: string;
  title: string;
  hint: string;
  actor: GroupActor;
  when?: string | null;
  action?: { label: string; onClick: () => void; aria?: string } | null;
  onPreview?: () => void;
}

// ‼ (07.10.2026, הדמיה מאושרת) «פגישות» — נוסח ההזמנות שיוצאות מהיומן (features/meetings).
type Shelf = 'requests' | 'documents' | 'meetings';

interface Props {
  draft: FirmProfile;
  saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  /** חלונות עריכה ששומרים מיד (useOfficeDraft.saveNow) — נוסח ההזמנה לפגישה. */
  saveNow?: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  noteUpload: (r: AssetRef) => void;
  /** «שליחה ללקוח» ממסמך — הקונסולה פותחת בחירת לקוח. */
  onSendToClient?: (doc: { id: string; label: string; fileName?: string }) => void;
  /** ראה למעלה — המדף, השורה או קטע הקליטה שנפתחים. */
  focus?: string | null;
  /** «צפייה» שפתוחה — מהכתובת. */
  viewFocus?: string | null;
  /** מדווחת לכתובת מה פתוח (replace = שינוי בחירה בלבד, בלי צעד חדש בהיסטוריה). בלי — המגירה מקומית. */
  onViewFocusChange?: (focus: string | null, replace?: boolean) => void;
  go: (page: OfficePageId | null, focus?: string) => void;
}

/** הבקשות שהמערכת יוצרת במסלול הקליטה — מוצגות, לא נערכות כאן. */
const SYSTEM_ROWS = ['representation', ...CATALOG_STEP_TYPES];

export default function LibraryPage({ draft, saved, setDraft, saveNow, noteUpload, onSendToClient, focus, viewFocus, onViewFocusChange, go }: Props) {
  const firstShelf: Shelf = focus === 'documents' ? 'documents' : focus === 'meetings' || meetingKindFromFocus(focus) ? 'meetings' : 'requests';
  const [openShelves, setOpenShelves] = useState<Set<Shelf>>(() => new Set<Shelf>(['requests', firstShelf]));
  const toggleShelf = (sh: Shelf) => setOpenShelves(cur => { const n = new Set(cur); if (n.has(sh)) n.delete(sh); else n.add(sh); return n; });
  /** פותח מקטע וגולל אליו (במקום «מעבר ללשונית»). */
  const showShelf = useCallback((sh: Shelf) => {
    setOpenShelves(cur => (cur.has(sh) ? cur : new Set([...cur, sh])));
    window.setTimeout(() => document.getElementById(`lb-shelf-${sh}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }, []);
  useEffect(() => { if (firstShelf !== 'requests') showShelf(firstShelf); }, [firstShelf, showShelf]);
  const [templates, setTemplates] = useState<RequestTemplate[] | null>(null);
  const [flows, setFlows] = useState<OfficeFlow[] | null>(null);
  const [flowsError, setFlowsError] = useState(false);
  const [q, setQ] = useState('');
  const term = useDeferredValue(q.trim());
  const [editing, setEditing] = useState<{ template: RequestTemplate | null; name?: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  // ── «צפייה» ──
  const [view, setView] = useState<{ target: PreviewTarget; sel: Selection } | null>(null);
  const [viewMissing, setViewMissing] = useState(false);
  const urlBacked = !!onViewFocusChange;
  /** נפתחה בצעד חדש בהיסטוריה — סגירה היא «אחורה», כך שהכפתור «אחורה» והסגירה זהים. */
  const pushedRef = useRef(false);
  const openView = useCallback((target: PreviewTarget, sel: Selection = {}) => {
    setViewMissing(false);
    setView({ target, sel });
    const f = targetToFocus(target, sel);
    if (f && onViewFocusChange) { pushedRef.current = true; onViewFocusChange(f); }
  }, [onViewFocusChange]);
  const closeView = useCallback(() => {
    if (urlBacked && pushedRef.current) { pushedRef.current = false; window.history.back(); return; }
    setView(null);
    onViewFocusChange?.(null);
  }, [urlBacked, onViewFocusChange]);

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

  // ‼ מהכתובת: רענון או «אחורה». נסגר כשהכתובת נקייה; נפתח כשיש בה יעד שקיים בספרייה (נמחק ⇒ משפט, לא מגירה ריקה).
  useEffect(() => {
    const parsed = parseViewFocus(viewFocus);
    if (!parsed) { if (urlBacked) setView(v => (v ? null : v)); return; }
    if (!templates) return;
    const t = resolveFocus(parsed, {
      templates, docs: docs.map(d => ({ id: d.id, label: d.label })), systemName: autoLabel,
      groupTitle: g => REQUEST_GROUPS[g].title, catalogName: c => c,
    });
    if (!t) { setViewMissing(true); onViewFocusChange?.(null, true); return; }
    setView(v => (v && targetKey(v.target) === targetKey(t) ? v : { target: t, sel: parsed.selection }));
  }, [viewFocus, templates, docs, urlBacked, onViewFocusChange]);

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
  // ‼ 30.10.2026: בקשות בודדות למעלה, קבוצות מתחת (כמו «בקשות» של הלקוח).
  // ‼ 30.10 (גיא): בקשת מסמכים עם כמה מסמכים («מסמכים מהלקוח») מוצגת מסמך אחרי מסמך — בין הקבוצות.
  const isDocBundle = (e: Entry) => e.kind === 'template' && docListOf(e.t).length >= 2;
  const singles = useMemo(() => shownEntries.filter(e => e.kind !== 'group' && !isDocBundle(e)), [shownEntries]);
  const docBundles = useMemo(() => shownEntries.filter(isDocBundle), [shownEntries]);
  const groupEntries = useMemo(() => shownEntries.filter(e => e.kind === 'group'), [shownEntries]);
  const [openKey, toggleOpen, setOpenKey] = useOneOpen();

  /** (312) קבוצה שהמשרד בנה אצל לקוח — כלל ידני עם seed_key 'work_group'. */
  const officeGroups = useMemo(() => flowList.filter(f => f.status === 'active' && f.trigger === 'manual' && f.seedKey === 'work_group'), [flowList]);
  const officeKids = useCallback((f: OfficeFlow): ChainKid[] => (f.definition?.stages ?? []).flatMap(st => st.items).map(it => {
    const ref = it.ref;
    if (ref.kind === 'template') {
      const t = templates ? templateForRef(templates, ref.templateId) : null;
      return { key: it.key, title: t?.name ?? it.snapshot?.title ?? 'בקשה שנמחקה מהספרייה', who: t ? actorText(t) : '',
        onPreview: t ? () => openView(targetOfTemplate(t)) : undefined };
    }
    if (ref.kind === 'action') {
      const type = actionTypeOf(ref);
      return { key: it.key, title: STEP_ACTION_NAMES[type] ?? 'פעולה מול רשות',
        who: (FLOW_ACTION_TYPES as readonly string[]).includes(type) ? 'PIVO — לבד' : 'בלחיצה שלך' };
    }
    if (ref.kind === 'document') return { key: it.key, title: docs.find(d => d.id === ref.docId)?.label ?? it.snapshot?.title ?? 'מסמך', who: 'הלקוח פותח' };
    return { key: it.key, title: autoLabel(ref.stepType), who: '' };
  }), [templates, docs, openView]);
  const shownOfficeGroups = useMemo(() => (term
    ? officeGroups.filter(f => matchesQuery(normalizeForSearch([f.name, ...officeKids(f).map(k => k.title)].join(' ')), term))
    : officeGroups), [officeGroups, officeKids, term]);

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
    // ‼ G4 · כרטיס «אישור הייצוג באזור האישי»: השורה, ההסבר, משפט הסיום ותווית הקישור נערכים ב«מיילים» — לא «נוסח קבוע».
    const inEmails = m.stepType === 'rep_client_approval';
    return {
      key: m.stepType, title: m.title, actor: m.actor, when,
      hint: inEmails ? `${m.hint} · הנוסח נערך ב«מיילים»` : tRow ? m.hint : `${m.hint} · נוסח קבוע של המערכת`,
      action: inEmails ? { label: 'עריכת הנוסח ב«מיילים» ←', onClick: () => go('emails', 'rep:portal'), aria: `עריכת הנוסח ב«מיילים»: ${m.title}` } : action,
      onPreview: () => openView({ kind: 'system', stepType: m.stepType, name: m.title }),
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
      setOpenKey(key);
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

  /** מה «עריכה» שבתחתית המגירה עושה — אותה פעולה כמו הכפתור בשורה, באותו מקום שבו עורכים. */
  const onPreviewEdit = (hint: EditHint) => {
    const t = view?.target;
    if (hint.kind === 'editor' && t?.kind === 'template') {
      const row = all.find(r => r.t.id === t.templateId);
      if (!row) return;
      const route = intakeRoute(row.t, row.uses);
      setView(null); pushedRef.current = false;
      if (route) { onViewFocusChange?.(null); go('flows', route); } else { onViewFocusChange?.(null); setEditing({ template: row.t }); }
      return;
    }
    setView(null); pushedRef.current = false; onViewFocusChange?.(null);
    if (hint.kind === 'emails') go('emails', hint.focus || undefined);
    else if (hint.kind === 'docsShelf') showShelf('documents');
    else if (hint.kind === 'rules') {
      if (t?.kind === 'group') go('flows', t.group === 'representation' ? 'representation' : 'onboarding');
      else if (t?.kind === 'system') go('flows', autoByType.get(t.stepType)?.focus ?? addFocus);
      else go('flows', addFocus);
    }
  };

  return (
    <div className="lb">
      <ShelfHead id="requests" title="בקשות" count={templates ? entries.length : null} open={openShelves.has('requests')} onToggle={toggleShelf}>
        {openShelves.has('requests') && (
          <>
            <input className="of-search lb-search" type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש בקשה" aria-label="חיפוש בקשה בספרייה" />
            {/* ‼ לא «＋ בקשה חדשה» — כך נקרא הכפתור בכרטיס הלקוח, ששולח בקשה ללקוח. כאן מוסיפים לספרייה. */}
            <button type="button" className="btn btn-secondary btn-sm lb-new" onClick={() => setEditing({ template: null })}>＋ בקשה לספרייה</button>
          </>
        )}
      </ShelfHead>

      {flowsError && <p className="lb-sub is-warn">לא הצלחתי לטעון את המסלולים — «בשימוש ב» לא מוצג כרגע.</p>}
      {flash && <p className="lb-flash" role="status">✓ {flash}</p>}
      {viewMissing && <p className="lb-sub is-warn" role="status">הבקשה הזאת כבר לא בספרייה — אין מה להציג.</p>}

      {openShelves.has('requests') && (
        templates === null ? <div className="of-empty">טוען את הספרייה…</div> : (
          <>
            {term ? (
              <p className="lb-results" role="status">
                {shownEntries.length > 0 ? (
                  <>
                    {shownEntries.length === 1 ? 'תוצאה אחת' : `${shownEntries.length} תוצאות`}
                    {docMatches > 0 && <> · יש גם מסמך בשם הזה <button type="button" className="of-link" onClick={() => showShelf('documents')}>← מסמכים</button></>}
                  </>
                ) : docMatches > 0 ? (
                  <>
                    אין בקשה כזו — יש מסמך בשם הזה.{' '}
                    <button type="button" className="of-link" onClick={() => showShelf('documents')}>← מסמכים</button>
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
            {/* ‼ 30.10.2026 (גיא): בקשות בודדות למעלה, קבוצות מתחת — כמו «בקשות» של הלקוח. בשורה נקודה,
                שם ומילה אחת; כל השאר בלחיצה. בלי אינדקס אותיות (יש חיפוש). */}
            {singles.length > 0 && (
              <ul className="lr-list">
                {singles.map(e => {
                  if (e.kind === 'system') {
                    const r = e.row;
                    const rowId = `lb-auto-${r.stepType}`;
                    const off = autoKnown && !r.inFlow;
                    const preview = () => openView({ kind: 'system', stepType: r.stepType, name: r.label });
                    return (
                      <LibRow key={rowId} id={rowId} name={r.label} open={openKey === rowId} onToggle={() => toggleOpen(rowId)}
                        highlight={highlight === rowId} side={<PreviewButton name={r.label} onClick={preview} />}>
                        <p>{off ? 'לא בכלל הקליטה — נפתחת רק ידנית מכרטיס הלקוח' : r.when}</p>
                        <p className="lr-k">בקשה של המערכת — הנוסח קבוע.</p>
                        <div className="lr-acts">
                          <button type="button" className="btn btn-secondary btn-sm" aria-label={`מתי נפתחת: ${r.label}`}
                            onClick={() => go('flows', r.focus ?? addFocus)}>מתי נפתחת?</button>
                        </div>
                      </LibRow>
                    );
                  }
                  if (e.kind !== 'template') return null;
                  const { t, uses } = e;
                  const gap = gapText(t);
                  const route = intakeRoute(t, uses);
                  // ‼ הנוסח שבשורה לא מגיע לאף לקוח — לא מציגים אותו (ולא «נוסח מוכן») כאילו הוא מה שהלקוח רואה.
                  const sees = route ? null : seesText(t);
                  const rowId = `lb-req-${t.id}`;
                  const preview = () => openView(targetOfTemplate(t));
                  return (
                    <LibRow key={t.id} id={rowId} name={t.name} open={openKey === rowId} onToggle={() => toggleOpen(rowId)}
                      highlight={highlight === rowId}
                      side={gap ? <span className="lr-warn">חסר</span> : <PreviewButton name={t.name} onClick={preview} />}>
                      {sees && <p>{sees}</p>}
                      <p>{actorText(t)}</p>
                      {!usesUnknown && (
                        <p><UsedIn uses={uses} go={go} loading={false}
                          none={route ? 'לא במסלול הקליטה — לא נפתחת לבד' : canBeInFlow(t) ? undefined : 'רק מכרטיס הלקוח'} /></p>
                      )}
                      {!route && isPreset(t) && <p className="lr-k">נוסח מוכן של PIVO — אפשר לערוך אותו למשרד.</p>}
                      {gap && <div className="lr-gap">{gap}</div>}
                      <div className="lr-acts">
                        <PreviewButton name={t.name} onClick={preview} />
                        {route ? (
                          <button type="button" className="btn btn-secondary btn-sm"
                            aria-label={`עריכה במסלול הקליטה: ${t.name}`} onClick={() => go('flows', route)}>עריכה ←</button>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm"
                            aria-label={`עריכה: ${t.name}`} onClick={() => setEditing({ template: t })}>עריכה</button>
                        )}
                      </div>
                    </LibRow>
                  );
                })}
              </ul>
            )}

            {(groupEntries.length > 0 || shownOfficeGroups.length > 0 || docBundles.length > 0) && (
              <>
                <h2 className="lr-section">קבוצות <span className="lr-n">{groupEntries.length + shownOfficeGroups.length + docBundles.length}</span></h2>
                <ul className="lr-list">
                  {docBundles.map(e => {
                    if (e.kind !== 'template') return null;
                    const { t, uses } = e;
                    const rowId = `lb-req-${t.id}`;
                    const route = intakeRoute(t, uses);
                    return (
                      <LibGroup key={rowId} id={rowId} name={t.name} highlight={highlight === rowId}
                        kids={docListOf(t).map((label, i) => ({ key: `d${i}`, title: label, who: 'הלקוח מעלה' }))}
                        open={openKey === rowId || !!term} onToggle={() => toggleOpen(rowId)}
                        side={<PreviewButton name={t.name} onClick={() => openView(targetOfTemplate(t))} />}
                        foot={<>
                          {!usesUnknown && <UsedIn uses={uses} go={go} loading={false} />}
                          {route
                            ? <button type="button" className="of-link" onClick={() => go('flows', route)}>עריכה ←</button>
                            : <button type="button" className="of-link" onClick={() => setEditing({ template: t })}>עריכה</button>}
                        </>} />
                    );
                  })}
                  {shownOfficeGroups.map(f => {
                    const rowId = `lb-flow-${f.id}`;
                    return (
                      <LibGroup key={rowId} id={rowId} name={f.name} kids={officeKids(f)}
                        open={openKey === rowId} onToggle={() => toggleOpen(rowId)}
                        foot={<button type="button" className="of-link"
                          onClick={() => go('flows', flowStageFocus({ flowId: f.id, stageKey: f.definition.stages[0]?.key ?? '' }))}>
                          מתי נפתחת ← כללי פתיחה</button>} />
                    );
                  })}
                  {groupEntries.map(e => {
                    if (e.kind !== 'group') return null;
                    const rowId = `lb-group-${e.key}`;
                    const title = REQUEST_GROUPS[e.key].title;
                    return (
                      <LibGroup key={rowId} id={rowId} name={title} highlight={highlight === rowId}
                        // ‼ «מתי נפתחת?» נאמר פעם אחת בתחתית הקבוצה — לא בכל נקודה.
                        kids={kidsOf(e.key).map(k => ({ key: k.key, title: k.title, who: GROUP_ACTOR_LABEL[k.actor], onPreview: k.onPreview,
                          action: k.action?.label === 'מתי נפתחת?' ? null : k.action }))}
                        open={openKey === rowId || !!term} onToggle={() => toggleOpen(rowId)}
                        side={<PreviewButton name={title} onClick={() => openView({ kind: 'group', group: e.key, name: title })} />}
                        foot={<button type="button" className="of-link"
                          onClick={() => go('flows', e.key === 'representation' ? 'representation' : 'onboarding')}>מתי נפתחת ←</button>} />
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )
      )}

      <ShelfHead id="documents" title="מסמכים" count={docs.length} open={openShelves.has('documents')} onToggle={toggleShelf} />
      {openShelves.has('documents') && (
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
            noteUpload={noteUpload} usesOf={usesOfDoc} go={go} onSendToClient={onSendToClient}
            onPreview={d => openView({ kind: 'doc', docId: d.id, name: d.label })} />
        </>
      )}

      <ShelfHead id="meetings" title="פגישות" count={MEETING_KINDS.length} open={openShelves.has('meetings')} onToggle={toggleShelf} />
      {openShelves.has('meetings') && (
        <MeetingsLibraryShelf draft={draft} saveNow={saveNow} focusKind={meetingKindFromFocus(focus)}
          onEmails={() => go('emails', 'meetings')} />
      )}

      {view && (
        <RequestPreviewSheet key={targetKey(view.target)} target={view.target} selection={view.sel} profile={saved}
          onClose={closeView}
          onSelectionChange={sel => {
            setView(v => (v ? { ...v, sel } : v));
            const f = targetToFocus(view.target, sel);
            if (f) onViewFocusChange?.(f, true);
          }}
          onEdit={onPreviewEdit} />
      )}

      {editing && (
        <RequestEditor template={editing.template} initialName={editing.name} profile={saved} go={go}
          uses={editingUses}
          onClose={() => setEditing(null)}
          onSaved={nm => { setEditing(null); setFlash(`נשמר · ${nm}`); void reloadTemplates().then(() => setLandOn(nm)); }}
          onDeleted={nm => { setEditing(null); setFlash(`נמחק מהספרייה · ${nm}`); void reloadTemplates(); }}
          onReverted={nm => { setEditing(null); setFlash(`חזר לנוסח המוכן · ${nm}`); void reloadTemplates().then(() => setLandOn(nm)); }} />
      )}
    </div>
  );
}

/** כותרת מקטע בעמוד הספרייה — נפתח ונסגר; המונה אומר כמה יש בו. */
function ShelfHead({ id, title, count, open, onToggle, children }: {
  id: Shelf; title: string; count: number | null; open: boolean; onToggle: (id: Shelf) => void; children?: React.ReactNode;
}) {
  return (
    <div className="lb-shelf-head" id={`lb-shelf-${id}`} data-shelf={id}>
      <button type="button" className="lb-shelf-btn" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className="lb-shelf-title">{title}</span>
        {count !== null && <span className="lb-shelf-n">{count}</span>}
        <svg className="lb-shelf-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {children}
    </div>
  );
}

