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
import { useJourneyDefaults } from '../../hooks/useJourneyDefaults';
import './requestDefaults.css';

interface Props { officeId: string | undefined }

/** עבודה פנימית שנוצרת גם כן ואינה מוצגת במשטח הבקשות (סיווג C במלאי). */
const INTERNAL_WORK: Record<ClientKind, string[]> = {
  exempt_dealer:       ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  licensed_dealer:     ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  company:             ['הקמה פנימית', 'הכרת הלקוח', 'ביקורת חודש ראשון'],
  tax_refund:          ['הקמה פנימית', 'הכרת הלקוח'],
  representation_only: ['הקמה פנימית', 'הכרת הלקוח', 'פתיחת תיקים ברשויות · כשזה עסק חדש'],
};

interface Node { entry: DefaultEntry; kids: Node[] }

/** בונה את העץ מהתלות. שורש = בקשה בלי תלות, או שההורה שלה אינו ברשימה. */
function toTree(entries: DefaultEntry[]): Node[] {
  const byType = new Map(entries.map(e => [e.stepType, e]));
  const nodes = new Map<string, Node>(entries.map(e => [e.stepType, { entry: e, kids: [] }]));
  const roots: Node[] = [];
  for (const e of entries) {
    const node = nodes.get(e.stepType)!;
    const parent = e.dependsOn && byType.has(e.dependsOn) ? nodes.get(e.dependsOn) : undefined;
    if (parent) parent.kids.push(node); else roots.push(node);
  }
  return roots;
}

const flatten = (nodes: Node[]): DefaultEntry[] =>
  nodes.flatMap(n => [n.entry, ...flatten(n.kids)]);

export default function RequestDefaultsSection({ officeId }: Props) {
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
  const [drawer, setDrawer] = useState<{ internal: boolean }>({ internal: false });
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
  const isDirty = !!dirty[kind];

  function mutate(next: DefaultEntry[], markDirty = true) {
    setDraft(d => ({ ...d, [kind]: next }));
    if (markDirty) setDirty(d => ({ ...d, [kind]: true }));
  }

  function patch(stepType: string, fn: (e: DefaultEntry) => DefaultEntry) {
    mutate(entries.map(e => (e.stepType === stepType ? fn(e) : e)));
  }

  /** כיבוי ראש שרשרת מכבה גם את מה שתלוי בו — אחרת נבטיח בקשה שלא תוכל להיפתח. */
  function flip(stepType: string) {
    const target = entries.find(e => e.stepType === stepType);
    if (!target) return;
    const on = !target.enabled;
    const affected = new Set<string>([stepType]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of entries) {
        if (e.dependsOn && affected.has(e.dependsOn) && !affected.has(e.stepType)) {
          affected.add(e.stepType); grew = true;
        }
      }
    }
    mutate(entries.map(e => (affected.has(e.stepType) ? { ...e, enabled: on } : e)));
    if (!on && affected.size > 1) setNotice(`«${metaFor(stepType).name}» כובתה — גם מה שתלוי בה`);
  }

  /** סידור מחדש בין שורשים בלבד. בן זז עם ההורה שלו. */
  function moveRoot(stepType: string, delta: number) {
    const rootTypes = tree.map(n => n.entry.stepType);
    const i = rootTypes.indexOf(stepType);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rootTypes.length) return;
    const order = [...rootTypes];
    [order[i], order[j]] = [order[j], order[i]];
    applyRootOrder(order);
  }

  function applyRootOrder(rootTypes: string[]) {
    const byRoot = new Map(tree.map(n => [n.entry.stepType, n]));
    const next = rootTypes.flatMap(t => {
      const n = byRoot.get(t);
      return n ? flatten([n]) : [];
    });
    if (next.length !== entries.length) return;
    mutate(next.map((e, idx) => ({ ...e, sortIndex: (idx + 1) * 10 })));
  }

  // ── גרירה · לכידת המצביע על המכל, כדי שרינדור מחדש לא ינתק אותה ──────────
  function onGripDown(stepType: string, ev: React.PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).focus();
    dragRef.current = stepType;
    listRef.current?.setPointerCapture(ev.pointerId);
  }
  function onListMove(ev: React.PointerEvent) {
    const dragging = dragRef.current;
    if (!dragging || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-root-type]'));
    const order = rows.map(r => r.dataset.rootType!);
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
  function setVariants(stepType: string, vs: DefaultVariant[]) {
    patch(stepType, e => ({ ...e, variants: vs }));
  }
  function addVariant(stepType: string, fact: FactKey) {
    const e = entries.find(x => x.stepType === stepType);
    if (!e) return;
    const vs = variantsOf(e);
    const base = vs[vs.length - 1];
    const next = [...vs];
    next.splice(next.length - 1, 0, {
      key: fact, fact,
      items: base.items ? [...base.items] : [],
      copy: base.copy ? { ...base.copy } : undefined,
    });
    setVariants(stepType, next);
    setVsel(s => ({ ...s, [stepType]: next.length - 2 }));
    setFactsFor(null);
    setNotice(`נוסף מצב «${FACTS.find(f => f.key === fact)?.label}» · מתחיל מהעתק של ברירת המחדל`);
  }
  function dropVariant(stepType: string, idx: number) {
    const e = entries.find(x => x.stepType === stepType);
    if (!e) return;
    const vs = variantsOf(e);
    if (vs[idx]?.fact === null) return;         // הנופל־אחורה אינו נמחק
    setVariants(stepType, vs.filter((_, i) => i !== idx));
    setVsel(s => ({ ...s, [stepType]: 0 }));
    setNotice('המצב הוסר · הבקשה תיווצר לפי ברירת המחדל');
  }
  /** סדר המצבים משנה התנהגות (התאמה ראשונה), ולכן הוא ניתן לשינוי. */
  function moveVariant(stepType: string, idx: number, delta: number) {
    const e = entries.find(x => x.stepType === stepType);
    if (!e) return;
    const vs = [...variantsOf(e)];
    const j = idx + delta;
    if (j < 0 || j >= vs.length - 1 || vs[idx].fact === null) return;  // הנופל־אחורה נשאר אחרון
    [vs[idx], vs[j]] = [vs[j], vs[idx]];
    setVariants(stepType, vs);
    setVsel(s => ({ ...s, [stepType]: j }));
  }
  function editItems(stepType: string, vIdx: number, fn: (items: { key?: string; label: string }[]) => { key?: string; label: string }[]) {
    const e = entries.find(x => x.stepType === stepType);
    if (!e) return;
    const vs = variantsOf(e).map((v, i) => (i === vIdx ? { ...v, items: fn(v.items ?? []) } : v));
    setVariants(stepType, vs);
  }

  // ── קטלוג ────────────────────────────────────────────────────────────────
  function addFromCatalog(stepType: string) {
    const meta = metaFor(stepType);
    mutate([...entries, {
      key: stepType, stepType, enabled: true,
      sortIndex: (entries.length + 1) * 10,
      source: 'office', requiredForClose: null, dueInDays: null, dependsOn: null,
      variants: [],
    }]);
    setCatalogOpen(false);
    setOpen(s => new Set(s).add(stepType));
    setNotice(`«${meta.name}» נוספה לברירת המחדל`);
  }
  function removeEntry(stepType: string) {
    mutate(entries.filter(e => e.stepType !== stepType && e.dependsOn !== stepType));
    setNotice('הוסרה מברירת המחדל');
  }

  async function doSave() {
    setSaveErr(null);
    const err = await save(kind, entries);
    if (err) { setSaveErr(err); return; }
    setDirty(d => ({ ...d, [kind]: false }));
    setNotice(`נשמר · יחול על לקוחות חדשים מסוג «${CLIENT_KIND_LABELS[kind]}»`);
  }

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

        {entries.length === 0 ? (
          <div className="ojd-state">אין בקשות בברירת המחדל לסוג הזה. אפשר להוסיף מהקטלוג.</div>
        ) : (
          <div ref={listRef} onPointerMove={onListMove} onPointerUp={onListUp} onPointerCancel={onListUp}>
            {tree.map((n, i) => (
              <Row key={n.entry.stepType} node={n} depth={0} last={i === tree.length - 1}
                   state={{ open, vsel, addItemFor, whyOpen }}
                   api={{
                     toggleOpen: (t) => setOpen(s => { const n2 = new Set(s); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; }),
                     flip, moveRoot, onGripDown,
                     pickVariant: (t, i2) => setVsel(s => ({ ...s, [t]: i2 })),
                     addVariantOpen: setFactsFor, dropVariant, moveVariant,
                     editItems, setAddItemFor, removeEntry,
                     toggleWhy: (t) => setWhyOpen(s => { const n2 = new Set(s); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; }),
                     variantsOf,
                   }} />
            ))}
          </div>
        )}

        <button type="button" className="ojd-add" onClick={() => setCatalogOpen(true)}>＋ הוסף בקשה</button>

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
          {CATALOG_STEP_TYPES.map(t => {
            const used = entries.some(e => e.stepType === t);
            const meta = metaFor(t);
            return (
              <button key={t} type="button" className="ojd-choice" disabled={used}
                onClick={() => addFromCatalog(t)}>
                <b>{meta.name}</b>
                <span>{used ? 'כבר בברירת המחדל' : meta.hint}</span>
              </button>
            );
          })}
        </Modal>
      )}

      {factsFor && (
        <Modal title="מצב נוסף"
          sub={`הבקשה «${metaFor(factsFor).name}» תיווצר אחרת כשהעובדה נכונה. אלו כל העובדות שהמערכת יודעת על לקוח.`}
          note="המצבים נבדקים לפי הסדר, וברירת המחדל אחרונה. אין ניסוח חופשי - אלו כל העובדות שקיימות."
          onClose={() => setFactsFor(null)}>
          {FACTS.map(f => {
            const e = entries.find(x => x.stepType === factsFor);
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
}
interface RowApi {
  toggleOpen: (t: string) => void;
  flip: (t: string) => void;
  moveRoot: (t: string, d: number) => void;
  onGripDown: (t: string, ev: React.PointerEvent) => void;
  pickVariant: (t: string, i: number) => void;
  addVariantOpen: (t: string) => void;
  dropVariant: (t: string, i: number) => void;
  moveVariant: (t: string, i: number, d: number) => void;
  editItems: (t: string, vi: number, fn: (items: { key?: string; label: string }[]) => { key?: string; label: string }[]) => void;
  setAddItemFor: (t: string | null) => void;
  removeEntry: (t: string) => void;
  toggleWhy: (t: string) => void;
  variantsOf: (e: DefaultEntry) => DefaultVariant[];
}

function Row({ node, depth, last, state, api }:
  { node: Node; depth: number; last: boolean; state: RowState; api: RowApi }) {
  const e = node.entry;
  const meta = metaFor(e.stepType);
  const isOpen = state.open.has(e.stepType);
  const dependent = !!e.dependsOn;

  const metaLine = dependent
    ? <><span>נפתחת אחרי «{metaFor(e.dependsOn!).name}»</span> · {meta.owner}</>
    : <>{meta.cond} · {meta.owner}</>;

  return (
    <div className={`ojd-req${depth ? ' child' : ''}${e.enabled ? '' : ' off'}${isOpen ? ' open' : ''}${last && !node.kids.length ? ' last' : ''}`}
         {...(depth === 0 ? { 'data-root-type': e.stepType } : {})}>
      <span className="ojd-dot" aria-hidden="true" />
      <div>
        <div className="ojd-rowhead" role="button" tabIndex={0}
             aria-expanded={isOpen}
             onClick={() => api.toggleOpen(e.stepType)}
             onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); api.toggleOpen(e.stepType); } }}>
          {depth === 0 ? (
            <span className="ojd-grip" tabIndex={0} role="button" aria-label="שינוי מיקום"
                  title="גרירה משנה את הסדר · אפשר גם בחצים למעלה/למטה"
                  onClick={ev => ev.stopPropagation()}
                  onPointerDown={ev => api.onGripDown(e.stepType, ev)}
                  onKeyDown={ev => {
                    ev.stopPropagation();
                    if (ev.key === 'ArrowUp') { ev.preventDefault(); api.moveRoot(e.stepType, -1); }
                    if (ev.key === 'ArrowDown') { ev.preventDefault(); api.moveRoot(e.stepType, 1); }
                  }}>⠿</span>
          ) : (
            <span className="ojd-grip fixed" title="הסדר נקבע על ידי התלות ולא ניתן לגרירה">↳</span>
          )}
          <div className="ojd-rowmain">
            <div className="ojd-rowtitle">
              {meta.name}
              {e.source === 'office' && <span className="ojd-byoffice">נוסף על ידך</span>}
            </div>
            <div className="ojd-rowmeta">{metaLine}</div>
          </div>
          <div className="ojd-rowaside">
            {!e.enabled && <span className="ojd-offtag">כבוי</span>}
            <button type="button" className="ojd-toggle"
              onClick={ev => { ev.stopPropagation(); api.flip(e.stepType); }}>
              {e.enabled ? 'כבה' : 'הפעל'}
            </button>
            <span className="ojd-chev" aria-hidden="true">⌄</span>
          </div>
        </div>
        {isOpen && <Body entry={e} state={state} api={api} />}
      </div>
      {node.kids.map((k, i) => (
        <Row key={k.entry.stepType} node={k} depth={depth + 1}
             last={last && i === node.kids.length - 1} state={state} api={api} />
      ))}
    </div>
  );
}

function Body({ entry, state, api }: { entry: DefaultEntry; state: RowState; api: RowApi }) {
  const meta = metaFor(entry.stepType);
  const vs = api.variantsOf(entry);
  const sel = Math.min(state.vsel[entry.stepType] ?? 0, vs.length - 1);
  const v = vs[sel];
  const multi = vs.length > 1;
  const items = v.items ?? [];

  // ‼ ב«מסמכים מהלקוח» הכותרת והשורה שמתחתיה נגזרות מהרשימה ואינן נוסח כתוב —
  // כך זה בשרת, וכך זה חייב להיראות כאן.
  const pv = meta.derivedCopy
    ? { t: `להעלות ${items.length} מסמכים`, s: items.map(i => i.label).join(' · '), c: 'להעלאה' }
    : v.copy
      ? { t: v.copy.clientTitle ?? '', s: v.copy.clientSub ?? '', c: v.copy.clientCta ?? '' }
      : null;

  return (
    <div className="ojd-body" onClick={ev => ev.stopPropagation()}>
      {multi && (
        <>
          <div className="ojd-vbar">
            <span className="ojd-vlab">לפי מצב הלקוח</span>
            {vs.map((x, i) => (
              <button key={x.key} type="button" className={`ojd-vchip${i === sel ? ' on' : ''}`}
                onClick={() => api.pickVariant(entry.stepType, i)}>{
                variantLabel(x.key, x.fact)
              }</button>
            ))}
            <button type="button" className="ojd-link mute"
              onClick={() => api.addVariantOpen(entry.stepType)}>＋ מצב</button>
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
                  onClick={() => api.moveVariant(entry.stepType, sel, -1)}>הקדם</button>
                <button type="button" className="ojd-link mute"
                  onClick={() => api.moveVariant(entry.stepType, sel, 1)}>אחר</button>
                <button type="button" className="ojd-link mute"
                  onClick={() => api.dropVariant(entry.stepType, sel)}>הסר מצב</button>
              </div>
            )}
          </div>
        </>
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
            </>
          ) : (
            <div className="ojd-preview">
              <div className="ojd-pv-s">
                {meta.extern
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
              <li key={`${it.key ?? it.label}-${i}`}>
                <span>{it.label}</span>
                <button type="button" className="ojd-idel" title="הסרה"
                  onClick={() => api.editItems(entry.stepType, sel, xs => xs.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
            <li className="ojd-iadd">
              {state.addItemFor === entry.stepType ? (
                <input autoFocus placeholder="שם הפריט" autoComplete="off"
                  onBlur={() => api.setAddItemFor(null)}
                  onKeyDown={ev => {
                    if (ev.key === 'Escape') { (ev.target as HTMLInputElement).blur(); return; }
                    if (ev.key !== 'Enter') return;
                    const el = ev.target as HTMLInputElement;
                    const label = el.value.trim();
                    if (!label) { el.blur(); return; }
                    api.editItems(entry.stepType, sel, xs => [...xs, { label }]);
                    el.value = '';
                  }} />
              ) : (
                <button type="button" className="ojd-link mute"
                  onClick={() => api.setAddItemFor(entry.stepType)}>＋ פריט</button>
              )}
            </li>
          </ul>
        </div>
      </div>

      {entry.dependsOn && (
        <div className="ojd-deprow">
          <span>תלות: נפתחת אחרי «{metaFor(entry.dependsOn).name}»</span>
          <button type="button" className="ojd-link mute"
            onClick={() => api.toggleWhy(entry.stepType)}>למה?</button>
          {state.whyOpen.has(entry.stepType) && <span className="ojd-depwhy">{meta.depWhy}</span>}
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
        {!multi && (
          <button type="button" className="ojd-link"
            onClick={() => api.addVariantOpen(entry.stepType)}>＋ מצב נוסף</button>
        )}
        {entry.source === 'office' && (
          <button type="button" className="ojd-link mute"
            onClick={() => api.removeEntry(entry.stepType)}>הסר מברירת המחדל</button>
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
