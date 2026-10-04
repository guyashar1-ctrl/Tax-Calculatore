// ─── בונה מסלול ──────────────────────────────────────────────────────────────
// המסלול מוצג כמפת ביצוע: רגעים לפי הסדר האמיתי («באישור ההצעה», «אחרי ש«X»
// הושלם»), שלבים שנפתחים יחד זה לצד זה, וענפים לפי תנאי. «מה מקבל» בראש המפה
// מעמעם את מה שלא ייפתח לסוג לקוח — זה ה«מה יקרה», בתוך המפה עצמה.
//
// ‼ לטיוטה של המסלול יש שמירה משלה (save_office_flow = גרסה חדשה), נפרדת
// מהטיוטה של רשומת המשרד. לכן היא מדווחת «יש שינויים» למעלה (onDirtyChange),
// והקונסולה שומרת ממנה ביציאה.
// ‼ מסלול הקליטה נשמר יחד עם חמש הרשימות שהמחולל קורא (compileOnboarding) —
// בלי זה, מה שמוצג כאן ומה שקורה באישור הצעה היו נפרדים.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import type { OfficePageId } from '../office/officeModel';
import { documentLibrary } from '../../lib/clientGuide';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { compileOnboarding, validateFlow } from '../../features/flows/compile';
import { saveOfficeFlow, serverErrorText, type OfficeFlowsResult } from '../../features/flows/api';
import {
  defaultOpensForNewStage, flowMoments, itemVerdict, lensFacts, newKey, stageVerdict, type Lens, type Moment,
} from '../../features/flows/preview';
import type { ClientKind, FlowDefinition, FlowStage, FlowTrigger, Opens } from '../../features/flows/types';
import StageSheet from './builder/StageSheet';
import ItemSheet from './builder/ItemSheet';
import AddSheet from './builder/AddSheet';
import SaveSheet from './builder/SaveSheet';
import MailSheet from './builder/MailSheet';
import FlowMap, { LensBar } from './builder/FlowMap';
import { FlIcon } from './builder/ui';
import {
  allIssues, buildLibraryLookup, libraryIssues, itemActor, momentMail, normalizeDefinition, personalConfirmOf, titleFor,
} from './builder/model';
import './flows.css';

export type OfficeFlowRow = OfficeFlowsResult['flows'][number];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

/** מתי המסלול מתחיל — שורה אחת במקום טריגר וגרסה. */
const START_LINE: Record<FlowTrigger, string> = {
  quote_approved: 'מתחיל לבד כשלקוח מאשר הצעת מחיר — אצל לקוח חדש, ואצל לקוח שחוזר אחרי שההתקשרות הקודמת הסתיימה. עדכון הסכם ללקוח פעיל אינו פותח קליטה.',
  manual: 'מתחיל כשמפעילים אותו בכרטיס הלקוח (או כאן, לכמה לקוחות יחד). אצל אותו לקוח אפשר להפעיל שוב רק אחרי שהמסלול הקודם אצלו הסתיים או בוטל.',
  annual: 'מתחיל לשנת מס, כשמפעילים אותו בכרטיס הלקוח (או כאן, לכמה לקוחות יחד). כל שנה — הפעלה נפרדת.',
};

export default function FlowBuilder({ flow, templates, profile, focusStage, focusItem, extra, onSaved, onReload, onBack,
  onDirtyChange, onStartForClients, onArchive, onOpenLibrary, onOpenPage }: {
  flow: OfficeFlowRow;
  templates: RequestTemplate[];
  /** הטיוטה של המשרד — לספריית המסמכים ולמייל לדוגמה. */
  profile: FirmProfile;
  focusStage?: string;
  /**
   * פריט שנפתח מיד (קישור מהספרייה: ‎flow:<id>:<stage>:<item>‎) — בבקשת מערכת בקליטה
   * גם עם «מה הלקוח מקבל, לפי מצב» פתוח.
   */
  focusItem?: string;
  /** מתחת למפה: במסלול הקליטה — מה מסומן מראש בבקשת ייצוג. */
  extra?: ReactNode;
  onSaved: (version: number) => void;
  onReload: () => void;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onStartForClients?: () => void;
  onArchive?: () => void;
  /** «ספרייה» — ובלי focus המדף «בקשות»; ‎'request:<id>'‎ נוחת על השורה. */
  onOpenLibrary: (focus?: string) => void;
  /** עמוד אחר במשרד («מיילים», «אוטומציות») — מפריט או מהמייל לדוגמה. */
  onOpenPage?: (page: OfficePageId, focus?: string) => void;
}) {
  const onboarding = flow.trigger === 'quote_approved';
  // ‼ מנורמל פעם אחת — גם הטיוטה וגם ההשוואה ל«נשמר», אחרת כל פתיחה הייתה «יש שינויים».
  const savedDef = useMemo(() => normalizeDefinition(flow.definition), [flow.definition]);
  const [def, setDef] = useState<FlowDefinition>(() => clone(savedDef));
  const [name, setName] = useState(flow.name);
  const [lens, setLens] = useState<Lens>({ t: 'all' });
  const [stageSheet, setStageSheet] = useState<string | null>(null);
  // ‼ קישור לפריט — נפתח מיד, ופעם אחת: «סיום» סוגר אותו כרגיל.
  const [itemSheet, setItemSheet] = useState<string | null>(() =>
    focusItem && savedDef.stages.some(s => s.items.some(i => i.key === focusItem)) ? focusItem : null);
  const [listOpenFor, setListOpenFor] = useState<string | null>(focusItem ?? null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [mailMoment, setMailMoment] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [flash, setFlash] = useState<string | null>(focusStage ?? null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const savedJson = useMemo(() => JSON.stringify(savedDef), [savedDef]);
  const dirty = JSON.stringify(def) !== savedJson || name.trim() !== flow.name.trim();
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // קישור «עריכה במסלול» מהספרייה/מהאוטומציות נוחת על השלב עצמו.
  useEffect(() => {
    if (!focusStage) return;
    const el = mapRef.current?.querySelector(`[data-stage="${CSS.escape(focusStage)}"]`);
    el?.scrollIntoView({ block: 'center' });
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [focusStage]);

  // ‼ הקונסולה משאירה בונה עם שינויים מורכב (מוסתר) כשעוברים לעמוד אחר — יריעה
  // פתוחה הייתה נשארת מעל העמוד החדש, נועלת את הגלילה ומוסיפה לטיוטה בלי שרואים.
  function closeSheets() {
    setStageSheet(null); setItemSheet(null); setAddTo(null); setMailMoment(null);
    if (!saving) setSaveOpen(false);
  }
  const closeRef = useRef(closeSheets);
  closeRef.current = closeSheets;
  useEffect(() => {
    const h = () => closeRef.current();
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const leaveTo = (go: () => void) => () => { closeSheets(); go(); };

  function jumpTo(stageKey: string) {
    const el = mapRef.current?.querySelector(`[data-stage="${CSS.escape(stageKey)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(stageKey);
    window.setTimeout(() => setFlash(f => (f === stageKey ? null : f)), 1600);
  }

  const docs = useMemo(() => documentLibrary(profile), [profile]);
  const lib = useMemo(() => buildLibraryLookup(templates, docs), [templates, docs]);
  const title = useMemo(() => titleFor(lib), [lib]);
  const itemsByKey = useMemo(() => new Map(def.stages.flatMap(s => s.items.map(i => [i.key, i] as const))), [def]);
  const titleOf = (k: string) => { const it = itemsByKey.get(k); return it ? title(it) : 'פריט שהוסר'; };
  const moments = useMemo(() => flowMoments(def, { onboarding, title }), [def, onboarding, title]);
  const issues = useMemo(() => allIssues(def, flow.trigger, validateFlow, lib), [def, flow.trigger, lib]);
  const libIssues = useMemo(() => libraryIssues(def, lib, flow.trigger), [def, lib, flow.trigger]);
  const shownIssues = showIssues ? issues : libIssues;
  const notCreated = useMemo(() => new Map(libIssues.filter(x => x.itemKey && x.notCreated).map(x => [x.itemKey!, x.notCreated!])), [libIssues]);
  const nameMissing = !onboarding && !name.trim();

  const lf = useMemo(() => lensFacts(lens), [lens]);
  const lensActive = lens.t !== 'all';
  const mailOf = (m: Moment, l: Lens = lens) => {
    const f = lensFacts(l);
    return momentMail(def, m.stageKeys, lib, templates, title, (s, i) => itemVerdict(s, i, onboarding, f), new Set(notCreated.keys()));
  };

  // «מה מקבל»: כמה נפתח לסוג/ללקוח הזה, כמה לא, וכמה תלוי במה שעוד לא ידוע עליו.
  const lensSummary = useMemo(() => {
    if (!lensActive) return 'בחרו סוג לקוח — ומה שלא ייפתח לו יעומעם, עם הסיבה.';
    let on = 0, off = 0, dep = 0;
    for (const s of def.stages) for (const i of s.items) {
      const v = notCreated.has(i.key) ? 'off' : itemVerdict(s, i, onboarding, lf).state;
      if (v === 'on') on++; else if (v === 'off') off++; else dep++;
    }
    const who = lens.t === 'sample' ? 'ללקוח הזה' : `ל${lf.label}`;
    return `${who}: ${on === 1 ? 'נפתח פריט אחד' : `נפתחים ${on} פריטים`}`
      + (off ? ` · ${off === 1 ? 'אחד לא נפתח' : `${off} לא נפתחים`} (מעומעם, עם הסיבה)` : '')
      + (dep ? ` · ${dep === 1 ? 'אחד תלוי' : `${dep} תלויים`} בפרטי הלקוח (כמו ייצוג בהצעה או מצב משפחתי)` : '');
  }, [def, lens, lf, lensActive, notCreated, onboarding]);

  const oldRuns = Object.entries(flow.runsByVersion ?? {})
    .filter(([v]) => Number(v) !== flow.currentVersion).reduce((a, [, k]) => a + k, 0);
  const savedAt = flow.versions?.find(v => v.version === flow.currentVersion)?.createdAt ?? flow.updatedAt;

  const endOpens = defaultOpensForNewStage(def);
  const endName = endOpens.after === 'stage' ? def.stages.find(s => s.key === endOpens.stage)?.name : undefined;

  function addStage(opens?: Opens) {
    const stage: FlowStage = {
      key: newKey('s'), name: 'שלב חדש', opens: opens ?? defaultOpensForNewStage(def),
      delivery: 'approve', reminder: null, notifyOffice: false, items: [],
    };
    setDef(d => ({ ...d, stages: [...d.stages, stage] }));
    setStageSheet(stage.key);
  }

  function trySave() {
    setShowIssues(true);
    if (issues.length > 0 || nameMissing) {
      const first = issues[0];
      // ‼ פריט עם בעיה פותח את ה«עוד» של השלב שלו (StageCard) — אז אפשר לגלול אליו.
      window.setTimeout(() => {
        const sel = first?.itemKey
          ? mapRef.current?.querySelector('.fl-item.has-issue')
          : first?.stageKey ? mapRef.current?.querySelector(`[data-stage="${CSS.escape(first.stageKey)}"]`) : null;
        sel?.scrollIntoView({ block: 'center' });
      }, 0);
      return;
    }
    setSaveErr(null);
    setSaveOpen(true);
  }

  async function confirmSave(note: string) {
    setSaving(true);
    setSaveErr(null);
    const compiled = onboarding ? compileOnboarding(def, lib) as Record<ClientKind, unknown[]> : undefined;
    const r = await saveOfficeFlow(flow.id, flow.currentVersion, def, {
      name: onboarding ? undefined : name.trim(), note: note.trim() || undefined, compiled,
    });
    setSaving(false);
    if (r.ok === false || r.error || !r.version) {
      if (r.error === 'version_conflict') setConflict(true);
      setSaveErr(serverErrorText(r.error ?? 'save_failed'));
      return;
    }
    setSaveOpen(false);
    onSaved(r.version);
  }

  const openStage = def.stages.find(s => s.key === stageSheet);
  const itemStage = itemSheet ? def.stages.find(s => s.items.some(i => i.key === itemSheet)) : undefined;
  const openItem = itemStage?.items.find(i => i.key === itemSheet);
  const addStageObj = def.stages.find(s => s.key === addTo);
  const mailM = moments.find(m => m.key === mailMoment);

  return (
    <div className="fl-builder">
      <button type="button" className="of-link fl-back" onClick={leaveTo(onBack)}>→ כל המסלולים</button>

      <div className="fl-flowhead">
        {onboarding ? (
          <h2 className="fl-flowname-static">{flow.name}</h2>
        ) : (
          <label className="fl-flowname-wrap">
            <span className="fl-sr">שם המסלול</span>
            <input className={`fl-flowname${nameMissing && showIssues ? ' is-error' : ''}`} value={name}
              onChange={e => setName(e.target.value)} aria-label="שם המסלול" placeholder="שם המסלול" />
          </label>
        )}
        <p className="fl-startline">{START_LINE[flow.trigger]}</p>
        <div className="fl-headrow">
          {!onboarding && onStartForClients && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={onStartForClients} disabled={dirty}
              title={dirty ? 'קודם שומרים — ההפעלה היא על הגרסה השמורה' : undefined}>הפעלה ללקוחות…</button>
          )}
          <span className="fl-ver">
            גרסה {flow.currentVersion}{savedAt ? ` · נשמרה ${fmtDate(savedAt)}` : ''}
            {oldRuns > 0 && <> · {oldRuns === 1 ? 'לקוח אחד ממשיך בגרסה קודמת' : `${oldRuns} לקוחות ממשיכים בגרסה קודמת`}</>}
            {dirty && <span className="fl-dirty"> · יש שינויים שלא נשמרו</span>}
          </span>
        </div>
      </div>

      <LensBar lens={lens} onLens={setLens} summary={lensSummary} />

      <FlowMap def={def} trigger={flow.trigger} moments={moments} title={title} titleOf={titleOf} templates={templates}
        verdict={(s, i) => itemVerdict(s, i, onboarding, lf)} stageVerdict={s => stageVerdict(s, lf)}
        lensActive={lensActive} lensLabel={lens.t === 'sample' ? 'לקוח הזה' : lf.label}
        notCreated={notCreated} issues={shownIssues} flash={flash} mailOf={m => mailOf(m)} personalConfirm={i => personalConfirmOf(i, lib)}
        onJump={jumpTo} onOpenItem={setItemSheet} onOpenStage={setStageSheet} onAdd={setAddTo}
        onAddStage={addStage} onPreview={m => setMailMoment(m.key)} mapRef={mapRef} />

      <button type="button" className="btn btn-secondary fl-addstage" onClick={() => addStage()}>
        <FlIcon name="plus" /> {endName ? <>שלב חדש אחרי «{endName}»</> : 'שלב חדש'}
      </button>

      {extra}

      {!onboarding && onArchive && (
        <div className="fl-archive">
          <button type="button" className="of-link fl-quiet-link" onClick={onArchive}>העברת המסלול לארכיון</button>
        </div>
      )}

      <div className={`fl-savebar${dirty ? ' is-on' : ''}`} role="status">
        {dirty && (
          <>
            <span>
              {showIssues && (issues.length > 0 || nameMissing)
                ? (issues.length + (nameMissing ? 1 : 0) === 1 ? 'יש דבר אחד לתקן לפני שמירה — מסומן באדום'
                  : `יש ${issues.length + (nameMissing ? 1 : 0)} דברים לתקן לפני שמירה — מסומנים באדום`)
                : 'שינויים במסלול — יחולו על לקוחות חדשים בלבד.'}
            </span>
            <button type="button" className="btn btn-sm fl-savebar-ghost" onClick={() => {
              setDef(clone(savedDef)); setName(flow.name); setShowIssues(false);
            }}>ביטול השינויים</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={trySave}>שמירה…</button>
          </>
        )}
      </div>
      {showIssues && nameMissing && <p className="fl-issue-inline">למסלול אין שם.</p>}

      {openStage && (
        <StageSheet def={def} trigger={flow.trigger} stage={openStage} title={title} templates={templates}
          onChange={setDef} onClose={() => setStageSheet(null)} />
      )}
      {openItem && itemStage && (
        <ItemSheet def={def} trigger={flow.trigger} stage={itemStage} item={openItem} title={title}
          actor={itemActor(openItem, templates)} issues={shownIssues.filter(x => x.itemKey === openItem.key)}
          personalConfirm={personalConfirmOf(openItem, lib)} openList={listOpenFor === openItem.key}
          inLibrary={openItem.ref.kind === 'template' ? !!lib.template(openItem.ref.templateId)
            : openItem.ref.kind === 'document' ? !!lib.document(openItem.ref.docId) : false}
          onOpen={(page, f) => leaveTo(() => (page === 'library' ? onOpenLibrary(f) : onOpenPage?.(page, f)))()}
          onChange={setDef} onClose={() => { setItemSheet(null); setListOpenFor(null); }} />
      )}
      {addStageObj && (
        <AddSheet def={def} trigger={flow.trigger} stage={addStageObj} templates={templates} docs={docs}
          onAdd={item => { setDef(d => ({ ...d, stages: d.stages.map(s => s.key === addStageObj.key ? { ...s, items: [...s.items, item] } : s) })); setAddTo(null); }}
          onClose={() => setAddTo(null)} onOpenLibrary={leaveTo(() => onOpenLibrary())} />
      )}
      {mailM && (
        <MailSheet profile={profile} momentLabel={mailM.label} first={onboarding && mailM.opens.after === 'start'}
          onboarding={onboarding} initialLens={lens} mailFor={l => mailOf(mailM, l)} onClose={() => setMailMoment(null)}
          onOpenTemplate={onOpenPage ? key => leaveTo(() => onOpenPage('emails', `tpl:${key}`))() : undefined} />
      )}
      {saveOpen && (
        <SaveSheet saved={savedDef} draft={def} savedName={flow.name} draftName={name} title={title}
          runsByVersion={flow.runsByVersion} currentVersion={flow.currentVersion} onboarding={onboarding}
          saving={saving} error={saveErr} onConfirm={confirmSave}
          onReload={conflict ? () => { setSaveOpen(false); setConflict(false); onReload(); } : undefined}
          onClose={() => { if (!saving) setSaveOpen(false); }} />
      )}
    </div>
  );
}
