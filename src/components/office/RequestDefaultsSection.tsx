// ─── «בקשות מסמכים» · ברירת המחדל של מסע הבקשות ─────────────────────────────
// המימוש נאמן לאב-הטיפוס המאושר: docs/prototypes/office-default-requests-v1.html
//
// שלוש רמות חשיפה, וזה כל המסך:
//   1. רשימה מסודרת אחת. במנוחה אין שום תצורה גלויה.
//   2. פתיחת בקשה — מה הלקוח רואה, מה נדרש, ומתי היא נוצרת.
//   3. רק כשמבקשים — מצבים (ווריאציות) מתוך אוצר מילים סגור של שבע עובדות.
//
// ‼ מה שהמסך הזה **אינו** עושה: הוא אינו מחולל בקשות ואינו מחליט תנאים.
// הוא עורך שורה בטבלה; השרת (מיגרציה 136) הוא זה שקורא אותה בלידת המסע.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClientKind, DefaultEntry, DefaultVariant, FactKey,
} from '../../types/journeyDefaults';
import {
  CATALOG_STEP_TYPES, CLIENT_KIND_LABELS, CLIENT_KIND_ORDER, FACTS,
  factWhen, metaFor, variantLabel,
} from '../../types/journeyDefaults';
import {
  DEBIT_AUTHORITIES, OFFICE_REQUEST_KINDS, officeEntryPayload, officeEntryReady,
  officeEntrySummary, officeKindSpec,
} from '../../lib/officeDefaultRequests';
import { documentLibrary } from '../../lib/clientGuide';
import type { FirmProfile } from '../../types/firmProfile';
import type { InstitutionKey } from '../../types/onboarding';
import { INSTITUTION_DEBIT_CODES } from '../../types/onboarding';
import { useJourneyDefaults } from '../../hooks/useJourneyDefaults';
import './requestDefaults.css';

interface Props { profile: FirmProfile }

/**
 * שם, תנאי ובעלים — לבקשת מערכת מ-REQUEST_META, לבקשה של המשרד מהמפרט שלה.
 * ‼ לפי `key` ולא לפי `stepType`: ארבע הבקשות של המשרד הן כולן custom_request.
 */
function entryMeta(e: DefaultEntry) {
  if (e.source === 'office') {
    const spec = officeKindSpec(e.key);
    return {
      name: spec?.name ?? e.key,
      cond: 'תמיד',
      owner: spec?.owner ?? 'הלקוח',
      note: spec?.note,
      extern: false,
      derivedCopy: false,
      depWhy: undefined as string | undefined,
    };
  }
  const m = metaFor(e.stepType);
  return { ...m, depWhy: m.depWhy };
}

/** עבודה פנימית שנוצרת גם כן ואינה מוצגת במשטח הבקשות (סיווג C במלאי). */
const INTERNAL_WORK: Record<ClientKind, string[]> = {
  exempt_dealer:       ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  licensed_dealer:     ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  company:             ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  tax_refund:          ['הקמה פנימית', 'הכרת הלקוח'],
  representation_only: ['הקמה פנימית', 'הכרת הלקוח', 'פתיחת תיקים ברשויות · כשזה עסק חדש'],
};

interface Node { entry: DefaultEntry; kids: Node[] }

/**
 * בונה את העץ מהתלות. שורש = בקשה בלי תלות, או שההורה שלה אינו ברשימה.
 * ‼ התלות מוצהרת בין סוגי שלב (כך היא נאכפת בשרת), ולכן המיפוי הוא
 * stepType→node — אבל הזהות של רשומה היא ה-key שלה.
 */
function toTree(entries: DefaultEntry[]): Node[] {
  const nodes = new Map<string, Node>(entries.map(e => [e.key, { entry: e, kids: [] }]));
  const byType = new Map<string, Node>();
  for (const e of entries) if (!byType.has(e.stepType)) byType.set(e.stepType, nodes.get(e.key)!);
  const roots: Node[] = [];
  for (const e of entries) {
    const node = nodes.get(e.key)!;
    const parent = e.dependsOn ? byType.get(e.dependsOn) : undefined;
    if (parent && parent !== node) parent.kids.push(node); else roots.push(node);
  }
  return roots;
}

const flatten = (nodes: Node[]): DefaultEntry[] =>
  nodes.flatMap(n => [n.entry, ...flatten(n.kids)]);

/**
 * מפריד פעילות מכבויות **בכל עומק** — «הרשאה לתשלום חודשי» היא בת של «חיבור
 * לפייפרלס», ולכן סינון ברמת השורש בלבד היה משאיר אותה ברשימה.
 * ‼ ענף שכובה נודד שלם: כיבוי הורה מכבה גם את מה שתלוי בו, וכך הם נשארים יחד.
 */
function splitTree(nodes: Node[]): { live: Node[]; off: Node[] } {
  const live: Node[] = [];
  const off: Node[] = [];
  for (const n of nodes) {
    if (!n.entry.enabled) { off.push(n); continue; }
    const sub = splitTree(n.kids);
    live.push({ entry: n.entry, kids: sub.live });
    off.push(...sub.off);
  }
  return { live, off };
}

export default function RequestDefaultsSection({ profile }: Props) {
  const officeId = profile.id;
  const { byKind, loading, error, saving, save } = useJourneyDefaults(officeId);
  const [kind, setKind] = useState<ClientKind>('licensed_dealer');
  const [draft, setDraft] = useState<Partial<Record<ClientKind, DefaultEntry[]>>>({});
  const [dirty, setDirty] = useState<Partial<Record<ClientKind, boolean>>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [vsel, setVsel] = useState<Record<string, number>>({});
  const [addItemFor, setAddItemFor] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [factsFor, setFactsFor] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ internal: boolean; off: boolean }>({ internal: false, off: false });
  const [notice, setNotice] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => { setDraft(byKind); }, [byKind]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const entries = draft[kind] ?? [];
  const tree = useMemo(() => toTree(entries), [entries]);
  /* ‼ בקשה כבויה יורדת מהרשימה למגירה, אבל **נשארת ברשומות**: רשומה שחסרה
     מברירת המחדל גורמת לשרת ליפול להתנהגות הקוד — כלומר הבקשה הייתה חוזרת.
     כיבוי הוא המחיקה; המגירה היא רק איפה שהיא יושבת. */
  const split = useMemo(() => splitTree(tree), [tree]);
  const liveTree = split.live;
  const offTree = split.off;
  const isDirty = !!dirty[kind];

  function mutate(next: DefaultEntry[], markDirty = true) {
    setDraft(d => ({ ...d, [kind]: next }));
    if (markDirty) setDirty(d => ({ ...d, [kind]: true }));
  }

  function patch(key: string, fn: (e: DefaultEntry) => DefaultEntry) {
    mutate(entries.map(e => (e.key === key ? fn(e) : e)));
  }

  /** כיבוי ראש שרשרת מכבה גם את מה שתלוי בו — אחרת נבטיח בקשה שלא תוכל להיפתח. */
  function flip(key: string) {
    const target = entries.find(e => e.key === key);
    if (!target) return;
    const on = !target.enabled;
    // התלות מוצהרת בין סוגי שלב, ולכן ההתפשטות עוברת דרך stepType
    const affectedTypes = new Set<string>([target.stepType]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of entries) {
        if (e.dependsOn && affectedTypes.has(e.dependsOn) && !affectedTypes.has(e.stepType)) {
          affectedTypes.add(e.stepType); grew = true;
        }
      }
    }
    const affected = new Set(entries.filter(e => e.key === key || affectedTypes.has(e.stepType)).map(e => e.key));
    mutate(entries.map(e => (affected.has(e.key) ? { ...e, enabled: on } : e)));
    if (!on && affected.size > 1) setNotice(`«${entryMeta(target).name}» כובתה — גם מה שתלוי בה`);
  }

  /** סידור מחדש בין שורשים בלבד. בן זז עם ההורה שלו. */
  function moveRoot(key: string, delta: number) {
    const keys = tree.map(n => n.entry.key);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const order = [...keys];
    [order[i], order[j]] = [order[j], order[i]];
    applyRootOrder(order);
  }

  function applyRootOrder(rootKeys: string[]) {
    const byRoot = new Map(tree.map(n => [n.entry.key, n]));
    const next = rootKeys.flatMap(k => {
      const n = byRoot.get(k);
      return n ? flatten([n]) : [];
    });
    if (next.length !== entries.length) return;
    mutate(next.map((e, idx) => ({ ...e, sortIndex: (idx + 1) * 10 })));
  }

  // ── גרירה · לכידת המצביע על המכל, כדי שרינדור מחדש לא ינתק אותה ──────────
  function onGripDown(key: string, ev: React.PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).focus();
    dragRef.current = key;
    listRef.current?.setPointerCapture(ev.pointerId);
  }
  function onListMove(ev: React.PointerEvent) {
    const dragging = dragRef.current;
    if (!dragging || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-root-key]'));
    const order = rows.map(r => r.dataset.rootKey!);
    const from = order.indexOf(dragging);
    if (from < 0) return;
    for (let i = 0; i < rows.length; i++) {
      if (i === from) continue;
      const b = rows[i].getBoundingClientRect();
      if (ev.clientY < b.top || ev.clientY > b.bottom) continue;
      const to = ev.clientY > b.top + b.height / 2 ? i : i;
      if (to === from) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, dragging);
      applyRootOrder(next);
      return;
    }
  }
  function onListUp(ev: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { listRef.current?.releasePointerCapture(ev.pointerId); } catch { /* כבר שוחרר */ }
  }

  // ── ווריאציות ────────────────────────────────────────────────────────────
  function variantsOf(e: DefaultEntry): DefaultVariant[] {
    if (e.variants.length) return e.variants;
    return [{ key: 'default', fact: null, items: [] }];
  }
  function setVariants(key: string, vs: DefaultVariant[]) {
    patch(key, e => ({ ...e, variants: vs }));
  }
  function addVariant(key: string, fact: FactKey) {
    const e = entries.find(x => x.key === key);
    if (!e) return;
    const vs = variantsOf(e);
    const base = vs[vs.length - 1];
    const next = [...vs];
    next.splice(next.length - 1, 0, {
      key: fact, fact,
      items: base.items ? [...base.items] : [],
      copy: base.copy ? { ...base.copy } : undefined,
    });
    setVariants(key, next);
    setVsel(s => ({ ...s, [key]: next.length - 2 }));
    setFactsFor(null);
    setNotice(`נוסף מצב «${FACTS.find(f => f.key === fact)?.label}» · מתחיל מהעתק של ברירת המחדל`);
  }
  function dropVariant(key: string, idx: number) {
    const e = entries.find(x => x.key === key);
    if (!e) return;
    const vs = variantsOf(e);
    if (vs[idx]?.fact === null) return;         // הנופל־אחורה אינו נמחק
    setVariants(key, vs.filter((_, i) => i !== idx));
    setVsel(s => ({ ...s, [key]: 0 }));
    setNotice('המצב הוסר · הבקשה תיווצר לפי ברירת המחדל');
  }
  /** סדר המצבים משנה התנהגות (התאמה ראשונה), ולכן הוא ניתן לשינוי. */
  function moveVariant(key: string, idx: number, delta: number) {
    const e = entries.find(x => x.key === key);
    if (!e) return;
    const vs = [...variantsOf(e)];
    const j = idx + delta;
    if (j < 0 || j >= vs.length - 1 || vs[idx].fact === null) return;  // הנופל־אחורה נשאר אחרון
    [vs[idx], vs[j]] = [vs[j], vs[idx]];
    setVariants(key, vs);
    setVsel(s => ({ ...s, [key]: j }));
  }
  function editItems(key: string, vIdx: number, fn: (items: { key?: string; label: string }[]) => { key?: string; label: string }[]) {
    const e = entries.find(x => x.key === key);
    if (!e) return;
    const vs = variantsOf(e).map((v, i) => (i === vIdx ? { ...v, items: fn(v.items ?? []) } : v));
    setVariants(key, vs);
  }

  // ── קטלוג ────────────────────────────────────────────────────────────────
  /** בקשת מערכת שהוחזרה לברירת המחדל. */
  function addSystemFromCatalog(stepType: string) {
    const meta = metaFor(stepType);
    mutate([...entries, {
      key: stepType, stepType, enabled: true,
      sortIndex: (entries.length + 1) * 10,
      source: 'system', requiredForClose: null, dueInDays: null, dependsOn: null,
      variants: [],
    }]);
    setCatalogOpen(false);
    setOpen(s => new Set(s).add(stepType));
    setNotice(`«${meta.name}» נוספה לברירת המחדל`);
  }

  /** בקשה חופשית של המשרד — נולדת מהמפרט, ונשמרת כ-custom_request. */
  function addOfficeFromCatalog(kindKey: string) {
    const spec = officeKindSpec(kindKey);
    if (!spec) return;
    mutate([...entries, {
      key: spec.key, stepType: 'custom_request', enabled: true,
      sortIndex: (entries.length + 1) * 10,
      source: 'office', requiredForClose: null, dueInDays: null, dependsOn: null,
      variants: [{ key: 'default', fact: null, items: [...spec.items], copy: { ...spec.copy } }],
      authorities: spec.config === 'authorities' ? [] : undefined,
      documentId: undefined,
    }]);
    setCatalogOpen(false);
    setOpen(s => new Set(s).add(spec.key));
    setNotice(`«${spec.name}» נוספה לברירת המחדל`);
  }
  /** ‼ הרשויות נשמרות ברשומה; ה-payload נבנה מהן ברגע השמירה. */
  function setAuthorities(key: string, a: InstitutionKey[]) {
    patch(key, e => ({ ...e, authorities: a }));
  }
  function setDocument(key: string, id: string) {
    patch(key, e => ({ ...e, documentId: id || undefined }));
  }

  function removeEntry(key: string) {
    const gone = entries.find(e => e.key === key);
    mutate(entries.filter(e => e.key !== key && !(gone && e.dependsOn === gone.stepType)));
    setNotice('הוסרה מברירת המחדל');
  }

  async function doSave() {
    setSaveErr(null);
    const err = await save(kind, entries, profile);
    if (err) { setSaveErr(err); return; }
    setDirty(d => ({ ...d, [kind]: false }));
    setNotice(`נשמר · יחול על לקוחות חדשים מסוג «${CLIENT_KIND_LABELS[kind]}»`);
  }

  /* אותו אוסף פעולות לשתי הרשימות — הפעילה והמגירה של הכבויות. */
  const rowApi: RowApi = {
    toggleOpen: (t) => setOpen(s2 => { const n2 = new Set(s2); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; }),
    flip, moveRoot, onGripDown,
    pickVariant: (t, i2) => setVsel(s2 => ({ ...s2, [t]: i2 })),
    addVariantOpen: setFactsFor, dropVariant, moveVariant,
    editItems, setAddItemFor, removeEntry, setAuthorities, setDocument,
    toggleWhy: (t) => setWhyOpen(s2 => { const n2 = new Set(s2); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; }),
    variantsOf,
  };

  if (loading) return <div className="ojd-state">טוען את ברירת המחדל…</div>;
  if (error) return <div className="alert alert-warning">טעינת ברירת המחדל נכשלה: {error}</div>;

  const hasMilestone = kind !== 'tax_refund';

  return (
    <div className="ojd">
      <div className="ojd-top">
        <div className="ojd-types">
          {CLIENT_KIND_ORDER.map(k => (
            <button key={k} type="button"
              className={`ojd-chip${k === kind ? ' on' : ''}`}
              aria-pressed={k === kind}
              onClick={() => { setKind(k); setOpen(new Set()); setAddItemFor(null); }}>
              {CLIENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {/* ‼ כפתור נפרד ומופיע-רק-כשצריך: הכפתור שבראש המסך שומר את פרופיל
            המשרד, וברירת המחדל יושבת בטבלה אחרת. שני כפתורים זהים במנוחה
            נקראו כשכפול; כאן הוא מופיע רק כשיש מה לשמור, ואומר מה הוא שומר. */}
        {isDirty && (
          <div className="ojd-save">
            <span className="ojd-dirty">יש שינויים שלא נשמרו</span>
            <button className="btn btn-primary" disabled={saving} onClick={() => void doSave()}>
              {saving ? 'שומר…' : 'שמור ברירת מחדל'}
            </button>
          </div>
        )}
      </div>

      {saveErr && <div className="alert alert-warning" style={{ marginTop: 10 }}>השמירה נכשלה: {saveErr}</div>}

      <div className="ojd-head">
        <h2>ברירת המחדל — {CLIENT_KIND_LABELS[kind]}</h2>
        <div className="ojd-lead">
          אלו הבקשות שייכנסו אוטומטית למסע של לקוח חדש מסוג זה.
          הסוג נקבע מתבנית ההצעה, ובהיעדר הצעה - מסוג העוסק שעל כרטיס הלקוח.
        </div>
        <div className="ojd-life">
          מסע שכבר נפתח ממשיך לפי ברירת המחדל שהייתה בפתיחתו · שינוי כאן אינו חוזר אחורה
        </div>
      </div>

      <div className="ojd-flow">
        {hasMilestone && (
          <div className="ojd-milestone">
            <div className="ojd-ms-t"><span className="ojd-ms-mark">אבן דרך</span>ייצוג מול הרשויות</div>
            <div className="ojd-ms-m">
              כשההצעה כוללת ייצוג · מוצגת מעל הבקשות ולא כבקשה, ולכן אינה נכבית מכאן
            </div>
          </div>
        )}

        {liveTree.length === 0 ? (
          <div className="ojd-state">אין בקשות פעילות בברירת המחדל לסוג הזה. אפשר להוסיף מהקטלוג.</div>
        ) : (
          <div ref={listRef} onPointerMove={onListMove} onPointerUp={onListUp} onPointerCancel={onListUp}>
            {liveTree.map((n, i) => (
              <Row key={n.entry.key} node={n} depth={0} last={i === liveTree.length - 1}
                   state={{ open, vsel, addItemFor, whyOpen, profile }}
                   api={rowApi} />
            ))}
          </div>
        )}

        <button type="button" className="ojd-add" onClick={() => setCatalogOpen(true)}>＋ הוסף בקשה</button>

        {offTree.length > 0 && (
          <div className={`ojd-drawer${drawer.off ? ' open' : ''}`}>
            <button type="button" className="ojd-drawer-h"
              aria-expanded={drawer.off}
              onClick={() => setDrawer(d => ({ ...d, off: !d.off }))}>
              <span>כבויות - לא ייווצרו ללקוח חדש</span>
              <span className="cnt">{offTree.length}</span>
              <span className="caret" aria-hidden="true">⌄</span>
            </button>
            {drawer.off && (
              <div className="ojd-drawer-b">
                {offTree.map((n, i) => (
                  <Row key={n.entry.key} node={n} depth={0} last={i === offTree.length - 1}
                       state={{ open, vsel, addItemFor, whyOpen, profile }}
                       api={rowApi} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`ojd-drawer${drawer.internal ? ' open' : ''}`}>
          <button type="button" className="ojd-drawer-h"
            aria-expanded={drawer.internal}
            onClick={() => setDrawer(d => ({ ...d, internal: !d.internal }))}>
            <span>עבודה פנימית שנוצרת גם כן</span>
            <span className="cnt">{INTERNAL_WORK[kind].length}</span>
            <span className="caret" aria-hidden="true">⌄</span>
          </button>
          {drawer.internal && (
            <div className="ojd-drawer-b">
              <div className="ojd-quiet">{INTERNAL_WORK[kind].map(x => <div key={x}>{x}</div>)}</div>
              <div className="ojd-note" style={{ border: 0, padding: 0, marginTop: 10 }}>
                נוצרת אוטומטית ואינה מופיעה בדף האישי של הלקוח. מנוהלת ממסך הלקוח, לא מכאן.
              </div>
            </div>
          )}
        </div>
      </div>

      {catalogOpen && (
        <Modal title="הוספת בקשה לברירת המחדל"
          sub={`הבקשה תיווצר לכל לקוח חדש מסוג «${CLIENT_KIND_LABELS[kind]}». לקוחות שכבר במסע לא יושפעו.`}
          note="בקשה חד־פעמית ללקוח מסוים מוסיפים ממסך הלקוח, לא כאן."
          onClose={() => setCatalogOpen(false)}>
          {/* ‼ שתי משפחות באותו קטלוג: בקשות שהמערכת יוצרת מתנאי, ובקשות
              שהמשרד מוסיף בעצמו. ההפרדה היא בכותרת, לא בלשונית. */}
          <div className="ojd-cat-group">בקשות של המערכת</div>
          {CATALOG_STEP_TYPES.map(t => {
            const used = entries.some(e => e.stepType === t && e.source === 'system');
            const meta = metaFor(t);
            return (
              <button key={t} type="button" className="ojd-choice" disabled={used}
                onClick={() => addSystemFromCatalog(t)}>
                <b>{meta.name}</b>
                <span>{used ? 'כבר בברירת המחדל' : meta.hint}</span>
              </button>
            );
          })}
          <div className="ojd-cat-group">בקשות שהמשרד מוסיף</div>
          {OFFICE_REQUEST_KINDS.map(spec => {
            const used = entries.some(e => e.key === spec.key);
            return (
              <button key={spec.key} type="button" className="ojd-choice" disabled={used}
                onClick={() => addOfficeFromCatalog(spec.key)}>
                <b>{spec.name}</b>
                <span>{used ? 'כבר בברירת המחדל' : spec.hint}</span>
              </button>
            );
          })}
        </Modal>
      )}

      {factsFor && (
        <Modal title="מצב נוסף"
          sub={`הבקשה «${entries.find(x => x.key === factsFor) ? entryMeta(entries.find(x => x.key === factsFor)!).name : factsFor}» תיווצר אחרת כשהעובדה נכונה. אלו כל העובדות שהמערכת יודעת על לקוח.`}
          note="המצבים נבדקים לפי הסדר, וברירת המחדל אחרונה. אין ניסוח חופשי - אלו כל העובדות שקיימות."
          onClose={() => setFactsFor(null)}>
          {FACTS.map(f => {
            const e = entries.find(x => x.key === factsFor);
            const used = !!e && variantsOf(e).some(v => v.fact === f.key);
            return (
              <button key={f.key} type="button" className="ojd-choice" disabled={used}
                onClick={() => addVariant(factsFor, f.key)}>
                <b>{f.label}</b>
                <span>{used ? 'כבר מוגדר לבקשה הזאת' : f.when}</span>
              </button>
            );
          })}
        </Modal>
      )}

      {notice && <div className="ojd-toast" role="status">{notice}</div>}
    </div>
  );
}

// ─── שורה ───────────────────────────────────────────────────────────────────

interface RowState {
  open: Set<string>;
  vsel: Record<string, number>;
  addItemFor: string | null;
  whyOpen: Set<string>;
  profile: FirmProfile;
}
interface RowApi {
  toggleOpen: (k: string) => void;
  flip: (k: string) => void;
  moveRoot: (k: string, d: number) => void;
  onGripDown: (k: string, ev: React.PointerEvent) => void;
  pickVariant: (k: string, i: number) => void;
  addVariantOpen: (k: string) => void;
  dropVariant: (k: string, i: number) => void;
  moveVariant: (k: string, i: number, d: number) => void;
  editItems: (k: string, vi: number, fn: (items: { key?: string; label: string }[]) => { key?: string; label: string }[]) => void;
  setAddItemFor: (k: string | null) => void;
  removeEntry: (k: string) => void;
  setAuthorities: (k: string, a: InstitutionKey[]) => void;
  setDocument: (k: string, id: string) => void;
  toggleWhy: (k: string) => void;
  variantsOf: (e: DefaultEntry) => DefaultVariant[];
}

function Row({ node, depth, last, state, api }:
  { node: Node; depth: number; last: boolean; state: RowState; api: RowApi }) {
  const e = node.entry;
  const meta = entryMeta(e);
  const isOpen = state.open.has(e.key);
  const dependent = !!e.dependsOn;
  const summary = e.source === 'office' ? officeEntrySummary(e, state.profile) : null;
  // ‼ בקשה של המשרד שהתצורה שלה חסרה לא תיווצר — נאמר את זה בשורה עצמה,
  // ולא נחכה שהמשרד יגלה את זה כשלקוח לא יקבל אותה.
  const incomplete = e.source === 'office' && e.enabled && !officeEntryReady(e, state.profile);

  const metaLine = dependent
    ? <><span>נפתחת אחרי «{metaFor(e.dependsOn!).name}»</span> · {meta.owner}</>
    : <>{meta.cond} · {meta.owner}{summary ? <> · {summary}</> : null}</>;

  return (
    <div className={`ojd-req${depth ? ' child' : ''}${e.enabled ? '' : ' off'}${isOpen ? ' open' : ''}${last && !node.kids.length ? ' last' : ''}`}
         {...(depth === 0 ? { 'data-root-key': e.key } : {})}>
      <span className="ojd-dot" aria-hidden="true" />
      <div>
        <div className="ojd-rowhead" role="button" tabIndex={0}
             aria-expanded={isOpen}
             onClick={() => api.toggleOpen(e.key)}
             onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); api.toggleOpen(e.key); } }}>
          {depth === 0 ? (
            <span className="ojd-grip" tabIndex={0} role="button" aria-label="שינוי מיקום"
                  title="גרירה משנה את הסדר · אפשר גם בחצים למעלה/למטה"
                  onClick={ev => ev.stopPropagation()}
                  onPointerDown={ev => api.onGripDown(e.key, ev)}
                  onKeyDown={ev => {
                    ev.stopPropagation();
                    if (ev.key === 'ArrowUp') { ev.preventDefault(); api.moveRoot(e.key, -1); }
                    if (ev.key === 'ArrowDown') { ev.preventDefault(); api.moveRoot(e.key, 1); }
                  }}>⠿</span>
          ) : (
            <span className="ojd-grip fixed" title="הסדר נקבע על ידי התלות ולא ניתן לגרירה">↳</span>
          )}
          <div className="ojd-rowmain">
            <div className="ojd-rowtitle">
              {meta.name}
              {e.source === 'office' && <span className="ojd-byoffice">נוסף על ידך</span>}
              {incomplete && <span className="ojd-incomplete">חסרה תצורה</span>}
            </div>
            <div className="ojd-rowmeta">{metaLine}</div>
          </div>
          <div className="ojd-rowaside">
            {!e.enabled && <span className="ojd-offtag">כבוי</span>}
            <button type="button" className="ojd-toggle"
              onClick={ev => { ev.stopPropagation(); api.flip(e.key); }}>
              {e.enabled ? 'כבה' : 'הפעל'}
            </button>
            <span className="ojd-chev" aria-hidden="true">⌄</span>
          </div>
        </div>
        {isOpen && <Body entry={e} state={state} api={api} />}
      </div>
      {node.kids.map((k, i) => (
        <Row key={k.entry.key} node={k} depth={depth + 1}
             last={last && i === node.kids.length - 1} state={state} api={api} />
      ))}
    </div>
  );
}

function Body({ entry, state, api }: { entry: DefaultEntry; state: RowState; api: RowApi }) {
  const meta = entryMeta(entry);
  const spec = entry.source === 'office' ? officeKindSpec(entry.key) : undefined;
  const vs = api.variantsOf(entry);
  const sel = Math.min(state.vsel[entry.key] ?? 0, vs.length - 1);
  const v = vs[sel];
  const multi = vs.length > 1;

  /* ‼ בקשה של המשרד עם תצורה משלה (רשויות / מסמך) — התצוגה והפריטים נגזרים
     מה-payload שייווצר בפועל, ולא מרשימה שנערכת ביד. כך «מה שאתה רואה» הוא
     בדיוק מה שהלקוח יקבל, ואי אפשר לערוך פריט שהבונה יידרוס. */
  const built = spec?.config ? officeEntryPayload(entry, state.profile) : null;
  const derivedItems = built
    ? ((built.requirements as { label: string }[] | undefined) ?? []).map(r => ({ label: r.label }))
    : null;
  const items = derivedItems ?? v.items ?? [];
  const editableItems = !spec?.config;

  const pv = built
    ? { t: String(built.clientTitle ?? ''), s: String(built.clientSub ?? ''), c: String(built.clientCta ?? '') }
    : meta.derivedCopy
      ? { t: `להעלות ${items.length} מסמכים`, s: items.map(i => i.label).join(' · '), c: 'להעלאה' }
      : v.copy
        ? { t: v.copy.clientTitle ?? '', s: v.copy.clientSub ?? '', c: v.copy.clientCta ?? '' }
        : null;

  const docs = spec?.config === 'document' ? documentLibrary(state.profile) : [];

  return (
    <div className="ojd-body" onClick={ev => ev.stopPropagation()}>
      {multi && (
        <>
          <div className="ojd-vbar">
            <span className="ojd-vlab">לפי מצב הלקוח</span>
            {vs.map((x, i) => (
              <button key={x.key} type="button" className={`ojd-vchip${i === sel ? ' on' : ''}`}
                onClick={() => api.pickVariant(entry.key, i)}>{
                variantLabel(x.key, x.fact)
              }</button>
            ))}
            <button type="button" className="ojd-link mute"
              onClick={() => api.addVariantOpen(entry.key)}>＋ מצב</button>
          </div>
          <div className="ojd-vcond">
            <div>
              <b>{variantLabel(v.key, v.fact)}</b>
              {' — '}{v.fact === null ? 'כל השאר' : factWhen(v.fact)}
              {v.fact !== null && ' · נבדק לפני ברירת המחדל'}
            </div>
            {v.fact !== null && (
              <div className="ojd-vacts">
                <button type="button" className="ojd-link mute"
                  onClick={() => api.moveVariant(entry.key, sel, -1)}>הקדם</button>
                <button type="button" className="ojd-link mute"
                  onClick={() => api.moveVariant(entry.key, sel, 1)}>אחר</button>
                <button type="button" className="ojd-link mute"
                  onClick={() => api.dropVariant(entry.key, sel)}>הסר מצב</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── תצורת «הקמת הרשאות לחיוב לרשויות» ─────────────────────────────
          ‼ אין סימון מראש. הרו״ח בוחר לאילו רשויות הלקוח באמת צריך הרשאה,
          וקוד המוסד מוצג כאן כדי שיהיה אפשר לוודא מולו. */}
      {spec?.config === 'authorities' && (
        <div className="ojd-config">
          <div className="ojd-lab">לאילו רשויות</div>
          <div className="ojd-auth">
            {DEBIT_AUTHORITIES.map(a => {
              const on = (entry.authorities ?? []).includes(a.key);
              return (
                <label key={a.key} className={`ojd-authrow${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on}
                    onChange={() => api.setAuthorities(entry.key,
                      on ? (entry.authorities ?? []).filter(x => x !== a.key)
                         : [...(entry.authorities ?? []), a.key])} />
                  <span className="ojd-authname">{a.label}</span>
                  <span className="ojd-authcode">קוד מוסד {INSTITUTION_DEBIT_CODES[a.key]}</span>
                </label>
              );
            })}
          </div>
          {(entry.authorities ?? []).length === 0 && (
            <div className="ojd-warn">בלי רשות אחת לפחות הבקשה לא תיווצר ללקוח.</div>
          )}
        </div>
      )}

      {/* ── תצורת «שליחת מסמך ללקוח» ─────────────────────────────────────── */}
      {spec?.config === 'document' && (
        <div className="ojd-config">
          <div className="ojd-lab">איזה מסמך</div>
          {docs.length === 0 ? (
            <div className="ojd-warn">
              ספריית המסמכים ריקה. מוסיפים מסמכים ב«מסמכים ללקוחות», ואז חוזרים לכאן.
            </div>
          ) : (
            <select value={entry.documentId ?? ''} className="ojd-select"
              onChange={ev => api.setDocument(entry.key, ev.target.value)}>
              <option value="">בחירת מסמך…</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
          {docs.length > 0 && !entry.documentId && (
            <div className="ojd-warn">בלי מסמך נבחר הבקשה לא תיווצר ללקוח.</div>
          )}
        </div>
      )}

      <div className="ojd-grid">
        <div>
          <div className="ojd-lab">מה הלקוח רואה</div>
          {pv ? (
            <>
              <div className="ojd-preview">
                <div className="ojd-pv-t">{pv.t}</div>
                <div className="ojd-pv-s">{pv.s}</div>
                <div className="ojd-pv-c">{pv.c}</div>
              </div>
              {meta.derivedCopy && (
                <div className="ojd-pv-derived">הכותרת והשורה שמתחתיה נגזרות מהרשימה</div>
              )}
              {spec?.config && (
                <div className="ojd-pv-derived">הנוסח נבנה מהתצורה שלמעלה</div>
              )}
            </>
          ) : (
            <div className="ojd-preview">
              <div className="ojd-pv-s">
                {spec?.config === 'authorities' ? 'בחר רשות אחת לפחות כדי לראות מה הלקוח יקבל.'
                  : spec?.config === 'document' ? 'בחר מסמך כדי לראות מה הלקוח יקבל.'
                  : meta.extern
                    ? 'לא מופיע בדף האישי — הפנייה יוצאת לגורם חיצוני.'
                    : 'לא מופיע כפעולה — הלקוח רואה «בטיפול המשרד».'}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="ojd-lab">{meta.extern ? 'מה מבקשים' : 'מה נדרש'}</div>
          <ul className="ojd-items">
            {items.map((it, i) => (
              <li key={`${(it as { key?: string }).key ?? it.label}-${i}`}>
                <span>{it.label}</span>
                {editableItems && (
                  <button type="button" className="ojd-idel" title="הסרה"
                    onClick={() => api.editItems(entry.key, sel, xs => xs.filter((_, j) => j !== i))}>×</button>
                )}
              </li>
            ))}
            {editableItems && (
              <li className="ojd-iadd">
                {state.addItemFor === entry.key ? (
                  <input autoFocus placeholder="שם הפריט" autoComplete="off"
                    onBlur={() => api.setAddItemFor(null)}
                    onKeyDown={ev => {
                      if (ev.key === 'Escape') { (ev.target as HTMLInputElement).blur(); return; }
                      if (ev.key !== 'Enter') return;
                      const el = ev.target as HTMLInputElement;
                      const label = el.value.trim();
                      if (!label) { el.blur(); return; }
                      api.editItems(entry.key, sel, xs => [...xs, { label }]);
                      el.value = '';
                    }} />
                ) : (
                  <button type="button" className="ojd-link mute"
                    onClick={() => api.setAddItemFor(entry.key)}>＋ פריט</button>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>

      {entry.dependsOn && (
        <div className="ojd-deprow">
          <span>תלות: נפתחת אחרי «{metaFor(entry.dependsOn).name}»</span>
          <button type="button" className="ojd-link mute"
            onClick={() => api.toggleWhy(entry.key)}>למה?</button>
          {state.whyOpen.has(entry.key) && <span className="ojd-depwhy">{meta.depWhy}</span>}
        </div>
      )}

      <div className="ojd-note">
        {!entry.enabled && (
          <>כבויה — לא תיווצר ללקוח חדש, ולכן גם לא תיחשב כדרישה שחוסמת את סגירת הקליטה.<br /></>
        )}
        {entry.source === 'system'
          ? <>נוצרת על ידי המערכת — <b style={{ fontWeight: 500 }}>{meta.cond}</b>. את התנאי אי אפשר לשנות מכאן; אפשר לכבות את הבקשה, לשנות את מקומה ולערוך את מה שהיא מבקשת.</>
          : <>בקשה שהמשרד הוסיף — אין לה תנאי מערכת, והיא תיווצר לכל לקוח חדש מסוג זה.</>}
        {entry.enabled && entry.source === 'system' && meta.cond !== 'תמיד' && (
          <><br />אם התנאי יתקיים רק בהמשך, הבקשה תיוולד אז - במקום הזה במסלול של הלקוח ולא בסופו.</>
        )}
        {meta.note && <><br />{meta.note}</>}
      </div>

      <div className="ojd-acts">
        {!multi && entry.source === 'system' && (
          <button type="button" className="ojd-link"
            onClick={() => api.addVariantOpen(entry.key)}>＋ מצב נוסף</button>
        )}
        {entry.source === 'office' && (
          <button type="button" className="ojd-link mute"
            onClick={() => api.removeEntry(entry.key)}>הסר מברירת המחדל</button>
        )}
      </div>
    </div>
  );
}

function Modal({ title, sub, note, children, onClose }: {
  title: string; sub: string; note: string;
  children: React.ReactNode; onClose: () => void;
}) {
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="ojd-ov" role="dialog" aria-modal="true" aria-label={title}
         onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="ojd-modal">
        <h3>{title}</h3>
        <div className="ojd-msub">{sub}</div>
        <div className="ojd-choices">{children}</div>
        <div className="ojd-mfoot">
          <span className="ojd-note" style={{ border: 0, padding: 0 }}>{note}</span>
          <button className="btn btn-ghost" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}
