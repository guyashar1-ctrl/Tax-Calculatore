// ─── מפת הטופס — עמודי הטופס הרשמי, סימון על כל שדה, והסבר ליד השדה (16.10.2026) ─────────────────────
// ‼ גיא (16.10): «כמו טופס 6101 החכם» — הטופס עצמו, לא רשימה. לחיצה על שדה: מה ממלאים, מאיפה המידע מגיע, למי,
//   הסבר קצר וקישור ללמוד לעומק. «אתר שדה לפי קוד» מציג את כל ההתאמות — לא בוחר אחת בשקט.
// ‼ תצוגה בלבד: אין כאן מילוי, אין כתיבה לתיק. מצב לקוח (model.clientStateOf): «אושר במשרד» / «התקבלה תשובה מהלקוח» מתשובות
//   השאלון לשנה (tax_year_facts, קריאה בלבד דרך loadYearData), ואחרת מהכרטיס — «לאישור» כשמגיע מהכרטיס.
// ‼ טלפון: הטופס בתוך חלון גלילה, עם הגדלה בכפתורים (ובצביטה של הדפדפן) — גוררים באצבע; ההסבר נפתח כגיליון מלמטה.
// ‼ 26.10.2026 (ההמחשה שאושרה, docs/proposals/2026-10-24-knowledge-codex): רשימה אחת של סעיפי הטופס ליד הטופס — בעמוד /
//   כל הסעיפים / בלי סימון, לפי חלק, והחיפוש בתוכה (כולל טפסים אחרים). הסעיף שנבחר — בכתובת (onSelectField). 6111 — עמודים בלבד.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import { factFromRow, loadYearData } from '../../taxYear/api';
import { supabase } from '../../../lib/supabase';
import {
  CLIENT_STATE_LABEL, LAYOUTS, MAP_FORM_BY_SLUG, ROLE_LABEL, ROLE_SHORT, UNPLACED_LABEL,
  clientStateOf, clientSummary, explainOf, fieldsOf, findByCode, findFields, relatedFormsOf, formsOfDomain, learnTopicsOf, markersOf, sourcesOf, unplacedOf,
  type ClientFieldState, type CodeHit, type FormSlug, type MapField, type Marker, type Role, type UnplacedWhy,
} from './model';
import { CATALOG_PARTS_1301_2025 } from '../../taxForms/coverage1301';
import { PRINTED_6111 } from './printed';
import { ClaimTag } from '../claim';
import { loadReturnRequests, loadReturns } from '../../annualReturn/api';
import { computeReturn, emptyDraft } from '../../annualReturn/engine';
import { Breakdown } from '../../annualReturn/SourceEntry';
import type { ReturnField, ReturnOutputs } from '../../annualReturn/types';
import { nis } from '../../taxEstimate/parts';
import FIELD_PRACTICE from './fieldPractice.json';
import './formMap.css';

/** «חשוב לזכור» לסעיף — הערת פרקטיקה עם מקור (נבדקה 25.10.2026, לשנת המס 2025). replace — מחליפה את «טעות נפוצה» שבמודל. */
interface FieldPractice { slug: string; key: string; mistake?: string; tip?: string; replace?: boolean; source?: { label: string; url?: string; locator?: string } }
const practiceOf = (slug: string, key: string) => (FIELD_PRACTICE as FieldPractice[]).find(p => p.slug === slug && p.key === key);
// ‼ נוסח השאלון נכתב לדף הלקוח («{name}», «{entity}») — בדף הסעיף של המשרד הוא נקרא בנוסח ניטרלי, לא «…»
const NEUTRAL: Record<string, string> = { name: 'הלקוח', entity: 'המשלם', spouse: 'בן/בת הזוג', prevYear: 'השנה הקודמת', since: 'הפעם הקודמת', year: 'שנת המס', period: 'התקופה' };
const neutral = (s: string | undefined) => (s ?? '').replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => NEUTRAL[k] ?? 'הלקוח');
/** סעיף ← הכלי שמחשב אותו. היישובים, נקודות הזיכוי וב״ל — הסעיפים שנבדקו מול הכלים (25.10.2026). */
const FIELD_TOOLS: Record<string, Record<string, string[]>> = {
  '1301': { settlements: ['F254', 'F255', 'F256', 'F257', 'F285', 'F286'], wizard: ['F194', 'F208', 'F209', 'F210', 'F211', 'F212', 'F213', 'F234', 'F283'], ni: ['F186', 'F304'] },
};
const TOOL_LINK: Record<string, string> = { settlements: 'לבדיקת היישוב ושיעור ההטבה', wizard: 'למחשבון נקודות הזיכוי', ni: 'לחישוב דמי הביטוח הלאומי' };
const toolOf = (field: MapField) => {
  const m = FIELD_TOOLS[field.slug] ?? {};
  return Object.keys(m).find(k => m[k].includes(field.key)) ?? (/יישוב/.test(field.label) ? 'settlements' : '');
};
/** סעיף ← ההסבר בתחום אחר: שכירות למגורים וב״ל (1301 סעיף 8, 1321 נכס בית) — מההמחשה שאושרה. */
const FIELD_DOMAIN: Record<string, { domain: string; label: string }> = {
  '1301/F117': { domain: 'rent', label: 'להסבר שכירות וביטוח לאומי' },
  '1321/1321.2': { domain: 'rent', label: 'להסבר שכירות וביטוח לאומי' },
  '1321/1321.11': { domain: 'rent', label: 'להסבר שכירות וביטוח לאומי' },
};
/** «חשוב לזכור» מההמחשה שאושרה (25.10.2026), עם הנושא שמפרט את הבדיקה. */
const FIELD_NOTE: Record<string, { text: string; topic: string; link: string }> = {
  '1301/F185': { text: 'רושמים כאן הפקדה כעמית עצמאי. אין להעתיק את כל הפקדות העובד והמעסיק שבאישור: אלה נכללות ב־106. סכום שמוקצה לזיכוי בסעיף 76 אינו נרשם שוב לניכוי.', topic: 'annualReturn', link: 'לבדיקות הדוח והמקור לטעות' },
};
/** שם המקור לפי הכתובת — בבדיקת הסעיף (FULL_FIELD_AUDIT ב-model). */
const sourceName = (url: string) => (/00_0103/.test(url) ? 'פקודת מס הכנסה' : /da-2025|Misim%20Book2025/.test(url) ? 'דע זכויותיך וחובותיך · 2025' : /inst-08-2026/.test(url) ? 'הוראת ניתוב דוחות 2025' : /capitax/.test(url) ? 'צילום מסמך הרשות בעותק נגיש' : 'המקור וההוראות');
interface AuditSource { url: string; locator?: string; readMethod?: string }
interface Audit { auditSources?: AuditSource[]; auditReviewedOn?: string; reviewedOn?: string; sourceURL?: string; locator?: string }

const PART_TITLE: Record<string, string> = Object.fromEntries(CATALOG_PARTS_1301_2025.map(p => [p.part, p.title]));
/** החלק בטופס — 1301 לפי האות, נספח לפי הסעיף. */
const groupOf = (f: MapField) => f.part || f.section || 'פרטים';
const groupName = (f: MapField | string, slug: FormSlug) => {
  const g = typeof f === 'string' ? f : groupOf(f);
  return slug === '1301' && PART_TITLE[g] ? `חלק ${g} · ${PART_TITLE[g]}` : g;
};
const UNPLACED_ORDER: UnplacedWhy[] = ['noCode', 'noText', 'notPrinted', 'ambiguous'];
const LIST_FIRST = 12;
const LIST_MORE = 20;

interface Props {
  domain: 'annual' | 'wealth';
  clients?: Client[];
  /** לקוח שנכנסו ממנו (תיק המס / הבקשה) — המפה מראה את מצב השדות אצלו. */
  contextClient?: Client | null;
  onBackToClient?: () => void;
  /** נושא שאפשר לפתוח, או undefined כשאין לו בית בתחום (ואז לא מציגים קישור). */
  canLearn: (topicId: string) => boolean;
  onLearn: (topicId: string) => void;
  /** קוד שנפתח מבחוץ (למשל ‎…/map1301?code=158‎). */
  initialCode?: string;
  /** פתיחת כלי עבודה מתוך סעיף (יישובים, נקודות זיכוי, ב״ל). בלי — אין קישור לכלי. */
  onOpenTool?: (toolId: string) => void;
  /** שנת המס שנבחרה באזור — כשאין עדיין טופס לשנה הזו, אומרים שמוצג הטופס של השנה שפורסמה. */
  year?: number;
  /** הטופס, הסעיף והקוד מהכתובת (‎…/f/<טופס>/<סעיף>/<קוד>‎) — «אחורה» ורענון חוזרים אליהם. */
  initialForm?: string;
  initialField?: string;
  initialMark?: string;
  /** בחירה ביד של טופס או סעיף — לכתובת. {} = הטופס הראשי בלי סעיף. בלי — הבחירה נשארת במסך. */
  onSelectField?: (s: { form?: string; field?: string; mark?: string }) => void;
  /** פתיחת תחום אחר מתוך סעיף (שכירות למגורים). בלי — אין קישור. */
  onOpenDomain?: (domainId: string) => void;
  /** «＋ שאלה או חומר על הסעיף» — ‼ עדיין אין דרך לפתוח את «מה אני לומד» מכאן בלי מסך חדש; בלי — אין כפתור. */
  onAddMaterial?: (seed: string) => void;
}

type Sel = { slug: FormSlug; markerId?: string; fieldKey?: string } | null;
/** ערכי הדוח של הלקוח (17.10.2026): מהבקשה «דוח שנתי» הפתוחה — אותו מנוע, אותן שורות מקור; קריאה בלבד. */
export interface ReturnCtx { stepId: string; year: number; outputs: ReturnOutputs; version?: number }
const MAP_FOCUS_KEY = 'pivo.formMapFocus';
const readFocus = (): { clientId: string; stepId: string; year: number; code: string | null } | null => {
  try {
    const r = sessionStorage.getItem(MAP_FOCUS_KEY); if (!r) return null;
    const x = JSON.parse(r) as { clientId: string; stepId: string; year: number; code: string | null; at: number };
    return Date.now() - x.at < 3_600_000 ? x : null;
  } catch { return null; }
};
const returnPerson = (role: Role | undefined): ReturnField['person'] | undefined => (role === 'registered' ? 'client' : role === 'spouse' ? 'spouse' : role === 'joint' ? 'joint' : undefined);
/** השדה בדוח לקוד ולטור (רשום / בן זוג / משותף); בלי טור — ההתאמה הראשונה. */
export const returnFieldOf = (ret: ReturnCtx | null, code: string, role?: Role): ReturnField | undefined => {
  if (!ret || !code) return undefined;
  const p = returnPerson(role);
  return ret.outputs.fields.find(f => f.code === code && f.kind === 'amount' && (!p || f.person === p)) ?? ret.outputs.fields.find(f => f.code === code && f.kind === 'amount');
};
const ZOOMS = [1, 1.5, 2, 3];
const nameOf = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';
const isSlug = (s: string | undefined): s is FormSlug => !!s && s in LAYOUTS;
/** הסעיף על הטופס: הסימון (לפי הקוד, כשניתן) או «בלי סימון». */
function locate(slug: FormSlug, key?: string, code?: string): { page: number; sel: Sel; code?: string } {
  if (!key) return { page: 1, sel: null };
  const ms = markersOf(slug);
  const has = (m: Marker) => m.fields.some(x => x.field.key === key);
  const m = ms.find(x => has(x) && (!code || x.code === code)) ?? ms.find(has);
  if (m) return { page: m.page, sel: { slug, markerId: m.id }, code: m.code };
  return fieldsOf(slug).some(f => f.key === key) ? { page: 1, sel: { slug, fieldKey: key } } : { page: 1, sel: null };
}
const scrollToMarker = (stage: HTMLElement | null, markerId: string) => requestAnimationFrame(() => {
  stage?.querySelector<HTMLElement>(`[data-marker="${markerId}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
});

export default function FormMap({ domain, clients = [], contextClient = null, onBackToClient, canLearn, onLearn, initialCode, onOpenTool, year, initialForm, initialField, initialMark, onSelectField, onOpenDomain, onAddMaterial }: Props) {
  const forms = formsOfDomain(domain);
  const canPrint = domain === 'annual';
  const [start] = useState(() => {
    const s = isSlug(initialForm) ? initialForm : forms[0].slug;
    return { printed: canPrint && initialForm === PRINTED_6111.slug, slug: s, ...locate(s, isSlug(initialForm) ? initialField : undefined, initialMark) };
  });
  const [printed, setPrinted] = useState(start.printed);
  const [slug, setSlug] = useState<FormSlug>(start.slug);
  const [page, setPage] = useState(start.page);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<Sel>(start.sel);
  const focus = useMemo(() => (domain === 'annual' && contextClient ? readFocus() : null), [domain, contextClient]);
  const [q, setQ] = useState(initialCode ?? (focus && focus.clientId === contextClient?.id ? focus.code ?? '' : ''));
  const [clientId, setClientId] = useState<string>(contextClient?.id ?? '');
  useEffect(() => { setClientId(contextClient?.id ?? ''); }, [contextClient]);
  // The 1301 map reads 2025 facts. A work opened for another year must not silently use them.
  const otherClientYear = year != null && (domain === 'annual' ? year !== 2025 : ![2025, 2026].includes(year));
  const client = otherClientYear ? null : clients.find(c => c.id === clientId) ?? (contextClient?.id === clientId ? contextClient : null);
  const L = LAYOUTS[slug];
  const pages = printed ? PRINTED_6111.pages : L.pages;
  const markers = useMemo(() => (printed ? [] : markersOf(slug)), [slug, printed]);
  const onPage = markers.filter(m => m.page === page);
  const unplaced = useMemo(() => (printed ? [] : unplacedOf(slug)), [slug, printed]);
  const hits = useMemo(() => findFields(q, 200), [q]);
  const stageRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // ‼ הגדלה שומרת על מה שבמרכז החלון — בלי זה ההגדלה קופצת לקצה השמאלי של הטופס (העמוד LTR בגאומטריה).
  //   כשנבחר שדה בעמוד — ההגדלה מתמרכזת עליו, כדי שהשדה שקוראים עליו לא יברח מהחלון.
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  const selMarker = sel?.markerId ? markers.find(m => m.id === sel.markerId) : undefined;
  const setZoomKeep = (next: number) => {
    const st = stageRef.current;
    if (st) centerRef.current = selMarker && selMarker.page === page
      ? { x: selMarker.box[0] + selMarker.box[2] / 2, y: selMarker.box[1] + selMarker.box[3] / 2 }
      : { x: (st.scrollLeft + st.clientWidth / 2) / st.scrollWidth, y: (st.scrollTop + st.clientHeight / 2) / st.scrollHeight };
    setZoom(next);
  };
  useLayoutEffect(() => {
    const st = stageRef.current; const c = centerRef.current;
    if (!st || !c) return;
    st.scrollLeft = c.x * st.scrollWidth - st.clientWidth / 2; st.scrollTop = c.y * st.scrollHeight - st.clientHeight / 2;
    centerRef.current = null;
  }, [zoom]);
  const selFields: { field: MapField; role?: Role }[] = selMarker ? selMarker.fields
    : sel?.fieldKey ? fieldsOf(slug).filter(f => f.key === sel.fieldKey).map(f => ({ field: f })) : [];
  // תשובות השאלון של הלקוח (קריאה בלבד) — 1301 לשנת 2025; הצהרת הון — כל השנים (ההצהרה ליום מסוים)
  const [facts, setFacts] = useState<{ clientId: string; facts: YearFact[]; err?: string } | null>(null);
  useEffect(() => {
    if (!client) { setFacts(null); return; }
    let alive = true;
    const years = domain === 'wealth' ? [2025, 2026] : [2025];
    // ‼ פרטי הקליטה (חשבון בנק, משפחה, כתובת, עסק) — עובדות «נכון ליום», בלי קשר לשנת המס: נטענים בנפרד
    const intake = (async () => {
      try {
        const r = await supabase.from('tax_year_facts').select('*').eq('client_id', client.id).like('item_key', 'intake.%');
        return r.error ? [] : ((r.data ?? []) as Record<string, unknown>[]).map(factFromRow);
      } catch { return []; } // ‼ מסד ההדגמה בלי like — בלי פרטי קליטה, לא שגיאה
    })();
    Promise.all([...years.map(y => loadYearData(client.id, y).then(r => r.facts)), intake])
      .then(rs => { if (alive) setFacts({ clientId: client.id, facts: [...new Map(rs.flat().map(f => [f.id, f])).values()] }); })
      .catch(e => { if (alive) setFacts({ clientId: client.id, facts: [], err: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [client, domain]);
  const yearFacts = facts && client && facts.clientId === client.id ? facts.facts : [];
  // ‼ ערכי הדוח של הלקוח — מהבקשה «דוח שנתי» (233): הטיוטה האחרונה (או ריקה) + העובדות המאושרות ⇒ אותו computeReturn כמו בשורת הבקשה
  const [ret, setRet] = useState<{ clientId: string; ctx: ReturnCtx | null; err?: string } | null>(null);
  useEffect(() => {
    if (!client || domain !== 'annual') { setRet(null); return; }
    let alive = true;
    (async () => {
      try {
        const reqs = await loadReturnRequests(client.id);
        // The map is for 2025: an open request from another year is not a fallback.
        const pick = reqs.find(r => r.open && r.taxYear === 2025) ?? reqs.find(r => r.taxYear === 2025);
        if (!pick) { if (alive) setRet({ clientId: client.id, ctx: null }); return; }
        const [vs, data] = await Promise.all([loadReturns(pick.stepId).catch(() => []), loadYearData(client.id, pick.taxYear)]);
        const cur = vs.find(v => v.status === 'draft') ?? [...vs].reverse().find(v => v.status === 'approved');
        const draft = cur?.draft ?? emptyDraft(client, pick.taxYear, new Date().toISOString().slice(0, 10));
        const outputs = computeReturn({ client, draft, facts: data.facts, evidence: data.evidence });
        if (alive) setRet({ clientId: client.id, ctx: { stepId: pick.stepId, year: pick.taxYear, outputs, version: cur?.version } });
      } catch (e) { if (alive) setRet({ clientId: client.id, ctx: null, err: e instanceof Error ? e.message : String(e) }); }
    })();
    return () => { alive = false; };
  }, [client, domain]);
  const retCtx = ret && client && ret.clientId === client.id ? ret.ctx : null;
  const valueOfMarker = (m: Marker) => (slug === '1301' && m.fields[0] ? returnFieldOf(retCtx, m.code, m.fields[0].role) : undefined);
  const stateOfMarker = (m: Marker): ClientFieldState | undefined => (client && m.fields[0] ? clientStateOf(m.fields[0].field, client, yearFacts, 2025, m.fields[0].role).state : undefined);
  const summary = !printed && client && (slug === '1301' || slug === '1219') ? clientSummary(slug, client, yearFacts) : null;

  // ── הכתובת: בחירה ביד נכתבת (emit); כתובת שהשתנתה מבחוץ («אחורה», קישור ממסמך) — נפתחת. מה שכתבנו בעצמנו לא נפתח שוב ──
  const urlKey = `${initialForm ?? ''}|${initialField ?? ''}|${initialMark ?? ''}`;
  const emitted = useRef(urlKey);
  const emit = (s: FormSlug | '6111', key?: string, code?: string) => {
    if (!onSelectField) return;
    const mark = key && code && /^\d{1,4}$/.test(code) ? code : undefined;
    const v = s === forms[0].slug && !key ? {} : { form: s, ...(key ? { field: key } : {}), ...(mark ? { mark } : {}) };
    emitted.current = `${'form' in v ? v.form : ''}|${key ?? ''}|${mark ?? ''}`;
    onSelectField(v);
  };
  const open = (s: FormSlug, p?: number, markerId?: string, fieldKey?: string) => {
    setPrinted(false); setSlug(s); if (p) setPage(p); setSel(markerId || fieldKey ? { slug: s, markerId, fieldKey } : null);
    if (markerId) scrollToMarker(stageRef.current, markerId);
  };
  const pickField = (f: MapField) => {
    const at = locate(f.slug, f.key);
    open(f.slug, at.page, at.sel?.markerId, at.sel?.markerId ? undefined : f.key);
    emit(f.slug, f.key, at.code);
  };
  const openHit = (h: CodeHit) => { open(h.slug, h.page, h.markerId, h.markerId ? undefined : h.field.key); emit(h.slug, h.field.key, h.markerId ? h.code : undefined); };
  const selectMarker = (m: Marker) => { setSel({ slug, markerId: m.id }); emit(slug, m.fields[0]?.field.key, m.code); };
  const setForm = (s: FormSlug) => { setPrinted(false); setSlug(s); setPage(1); setSel(null); emit(s); };
  const openPrinted = () => { setPrinted(true); setPage(1); setSel(null); emit(PRINTED_6111.slug); };
  const closeSel = () => { setSel(null); emit(slug); };
  const setPageUser = (n: number) => { setPage(n); if (sel) { setSel(null); emit(slug); } };
  useEffect(() => {
    if (emitted.current === urlKey) return;
    emitted.current = urlKey;
    if (initialCode) return; // ‼ ‎c/<קוד>‎ — נפתח לפי הקוד (למטה)
    if (canPrint && initialForm === PRINTED_6111.slug) { setPrinted(true); setPage(1); setSel(null); return; }
    const s = isSlug(initialForm) ? initialForm : forms[0].slug;
    const at = locate(s, isSlug(initialForm) ? initialField : undefined, initialMark);
    open(s, at.page, at.sel?.markerId, at.sel?.fieldKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);
  // סעיף מהכתובת בפתיחה — הסימון מובא לעין
  useEffect(() => {
    if (start.sel?.markerId) scrollToMarker(stageRef.current, start.sel.markerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // קוד שנפתח מבחוץ — פותחים את ההתאמה היחידה; כמה התאמות — נשארות ברשימה
  const codeSeen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialCode) { codeSeen.current = undefined; return; }
    if (codeSeen.current !== undefined && codeSeen.current !== initialCode) setQ(initialCode);
    codeSeen.current = initialCode;
    const h = findByCode(initialCode).filter(x => formsOfDomain(domain).some(f => f.slug === x.slug));
    if (h.length === 1) open(h[0].slug, h[0].page, h[0].markerId, h[0].markerId ? undefined : h[0].field.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, domain]);
  // בטלפון: ההסבר יושב מתחת לטופס — מביאים אותו לעין אחרי בחירה
  // ‼ בטלפון ההסבר הוא גיליון שמכסה את חצי המסך התחתון — השדה שנבחר עולה לרבע העליון, כדי שיישאר גלוי מעליו
  // המיקוד עובר לכותרת הסעיף שנבחר — קורא מסך מתחיל מהשם, והמקלדת ממשיכה מההסבר
  useEffect(() => {
    if (!sel) return;
    requestAnimationFrame(() => (detailRef.current?.querySelector<HTMLElement>('.fm-card-t') ?? detailRef.current)?.focus({ preventScroll: true }));
  }, [sel]);
  useEffect(() => {
    if (!sel || !window.matchMedia?.('(max-width: 900px)').matches) return;
    const el = sel.markerId ? stageRef.current?.querySelector<HTMLElement>(`[data-marker="${sel.markerId}"]`) : null;
    if (!el) return;
    const stage = stageRef.current!;
    const er = el.getBoundingClientRect(); const sr = stage.getBoundingClientRect();
    stage.scrollTop += er.top - sr.top - Math.min(80, stage.clientHeight / 4);
    const top = el.getBoundingClientRect().top;
    window.scrollBy({ top: top - window.innerHeight * 0.22 });
  }, [sel]);

  // ── רשימת הסעיפים — אחת: בעמוד / כל הסעיפים / בלי סימון, לפי חלק; עם חיפוש — בטופס הזה ובטפסים אחרים ──
  const [scope, setScope] = useState<'page' | 'all' | 'unplaced'>(() => (markers.length ? 'page' : 'all'));
  const [part, setPart] = useState('');
  const [limit, setLimit] = useState(LIST_FIRST);
  const listKey = `${slug}|${printed}`;
  const listSeen = useRef(listKey);
  useEffect(() => {
    if (listSeen.current === listKey) return;
    listSeen.current = listKey;
    setScope(markers.length ? 'page' : 'all'); setPart(''); setLimit(LIST_FIRST);
  }, [listKey, markers.length]);
  const all = fieldsOf(slug);
  const groups = useMemo(() => [...new Set(fieldsOf(slug).map(groupOf))], [slug]);
  const pageKeys = new Set(onPage.flatMap(m => m.fields.map(x => x.field.key)));
  const whyOf = new Map(unplaced.map(u => [u.field.key, u.why]));
  const inPart = (f: MapField) => !part || groupOf(f) === part;
  const browse = scope === 'unplaced'
    ? UNPLACED_ORDER.flatMap(w => unplaced.filter(u => u.why === w && inPart(u.field)).map(u => u.field))
    : all.filter(f => inPart(f) && (scope === 'all' || pageKeys.has(f.key)));
  const searching = !!q.trim();
  const inForm = searching ? hits.filter(h => h.slug === slug) : [];
  const others = searching ? hits.filter(h => h.slug !== slug) : [];
  const curKey = selFields[0]?.field.key;
  const setList = (next: () => void) => { next(); setLimit(LIST_FIRST); };
  const hitMeta = (h: CodeHit) => `${ROLE_SHORT[h.role] ? `${ROLE_SHORT[h.role]} · ` : ''}${h.page ? `עמ׳ ${h.page}` : 'בלי סימון בטופס'}`;
  const hitValue = (h: CodeHit) => (h.slug === '1301' ? returnFieldOf(retCtx, h.code, h.role) : undefined);

  // הסעיף הקודם והבא — באותו חלק בטופס
  const base = selFields[0]?.field;
  const neighbors = base ? all.filter(f => groupOf(f) === groupOf(base)) : [];
  const pos = base ? neighbors.findIndex(f => f.key === base.key) : -1;

  const formTitle = printed ? `טופס ${PRINTED_6111.formId}` : MAP_FORM_BY_SLUG[slug].formId === '1219' ? 'טופס 1219 — הצהרת הון' : /^d/.test(L.title) ? `טופס ${L.title}` : L.title;
  const taxYear = printed ? PRINTED_6111.taxYear : L.taxYear;
  // ‼ אין שימוש שקט בטופס של שנה אחרת: נבחרה 2026 והטופס ל-2026 טרם פורסם ⇒ אומרים את זה ליד הכותרת
  const otherYear = year && taxYear && year !== taxYear && slug !== '1219' && (printed || slug !== '116d') ? year : null;
  const curPage = pages[page - 1] ?? pages[0];

  return (
    <section className="fm" data-form-map={printed ? PRINTED_6111.slug : slug} aria-label={`מפת ${formTitle}`}>
      <header className="fm-head">
        <div className="fm-title-row">
          <h3 className="fm-title">{formTitle}{taxYear && (printed || slug !== '1219') ? ` · שנת המס ${taxYear}` : ''}</h3>
          {otherYear && <span className="fm-year-note" data-fm-year-note>נבחרה {otherYear}: מוצג טופס {taxYear}; הטופס לשנה שנבחרה אינו במאגר הזה</span>}
          {printed
            ? <a className="fm-src" href={PRINTED_6111.pdf} target="_blank" rel="noreferrer">הטופס (עותק נגיש, PDF)</a>
            : <a className="fm-src" href={L.source.pdf} target="_blank" rel="noreferrer">הטופס הרשמי (PDF)</a>}
        </div>
        <p className="fm-lead">
          {printed ? `הטופס לשנת ${PRINTED_6111.taxYear}, ${PRINTED_6111.edition}: עשרה עמודי נתונים כספיים. עמודים בלבד — בלי סימון שדות.`
            : slug === '1219'
              ? 'הטופס הרשמי של רשות המסים. כל שורת סיכום מסומנת — לחצו עליה: מה רושמים, מאיזה מסמך, מה בודקים ואיפה טועים.'
              : 'הטופס הרשמי של רשות המסים. כל שדה עם קוד מסומן — לחצו עליו: מה ממלאים, מאיפה המידע מגיע (מסמך, שאלה בשאלון, נתון בתיק) ולמי מבני הזוג.'}
        </p>
        {(forms.length > 1 || canPrint) && (
          <div className="fm-forms" role="group" aria-label="טופס או נספח">
            {/* ‼ נספח עם קודים מודפסים — כפתור; נספח בלי קודים (רק העמודים והרשימה) ו-6111 — בבחירה, כדי לא להעמיס */}
            {forms.filter(f => LAYOUTS[f.slug].anchors.length > 0).map(f => (
              <button key={f.slug} type="button" className={`fm-chip${!printed && f.slug === slug ? ' is-on' : ''}`} aria-pressed={!printed && f.slug === slug}
                onClick={() => setForm(f.slug)} data-fm-form={f.slug}>
                {f.short}
              </button>
            ))}
            {(forms.some(f => LAYOUTS[f.slug].anchors.length === 0) || canPrint) && (
              <label className={`fm-more${printed || LAYOUTS[slug].anchors.length === 0 ? ' is-on' : ''}`}>
                <span className="fm-sr">נספחים נוספים (בלי קודים מודפסים)</span>
                <select value={printed ? PRINTED_6111.slug : LAYOUTS[slug].anchors.length === 0 ? slug : ''} onChange={e => { const v = e.target.value; if (v === PRINTED_6111.slug) openPrinted(); else if (isSlug(v)) setForm(v); }} data-fm-more>
                  <option value="">נספחים נוספים…</option>
                  {forms.filter(f => LAYOUTS[f.slug].anchors.length === 0).map(f => <option key={f.slug} value={f.slug}>{f.short}</option>)}
                  {canPrint && <option value={PRINTED_6111.slug}>{PRINTED_6111.short} (עמודים)</option>}
                </select>
              </label>
            )}
          </div>
        )}
        {!printed && (
          <div className="fm-tools">
            <label className="fm-find" htmlFor={`fm-q-${domain}`}>
              <span>אתר שדה — קוד או שם</span>
              <input id={`fm-q-${domain}`} type="search" value={q} onChange={e => { setQ(e.target.value); setLimit(LIST_FIRST); }} placeholder="158 או «תרומות»" data-fm-find />
            </label>
            {(clients.length > 0 || contextClient) && (
              <label className="fm-client" htmlFor={`fm-c-${domain}`}>
                <span>מצב השדות אצל לקוח</span>
                <select id={`fm-c-${domain}`} value={clientId} onChange={e => setClientId(e.target.value)} disabled={!!contextClient} title={contextClient ? 'הלקוח נקבע לפי התיק שממנו נפתח הידע. אפשר לצאת מההקשר בראש העמוד.' : undefined} data-fm-client>
                  <option value="">בלי לקוח</option>
                  {contextClient && !clients.some(c => c.id === contextClient.id) && <option value={contextClient.id}>{nameOf(contextClient)}</option>}
                  {clients.map(c => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {otherClientYear && clientId && <p className="fm-year-note" data-fm-client-year-note>נתוני הלקוח לשנה אחרת אינם מוצגים על הטופס הזה. המפה זמינה לעיון בלבד.</p>}
        {contextClient && onBackToClient && (
          <p className="fm-ctx">מוצג מול התיק של <b>{nameOf(contextClient)}</b>{retCtx ? <> · ערכי הדוח לשנת {retCtx.year} ({retCtx.version ? `גרסה ${retCtx.version}` : 'טיוטה שטרם נשמרה'}, {retCtx.outputs.fields.filter(f => f.kind === 'amount').length} סכומים) על הטופס</> : ret && !ret.ctx && !ret.err ? ' · אין לו בקשת «דוח שנתי» — המפה מראה את מצב הכרטיס בלבד' : ''} · <button type="button" className="kn-link" onClick={onBackToClient}>חזרה לתיק</button></p>
        )}
      </header>

      {summary && (
        <p className="fm-summary" data-fm-summary>
          {(['approved', 'answered', 'known', 'verify', 'missing', 'office', 'unknown', 'na'] as ClientFieldState[]).filter(s => summary[s]).map(s => (
            <span key={s} className={`fm-st is-${s}`}>{CLIENT_STATE_LABEL[s]}: {summary[s]}</span>
          ))}
          <span className="kn-xs kn-muted">«אושר במשרד» ו«התקבלה תשובה» — מהשאלון לשנה; «לאישור» — מהכרטיס (מצב עדכני, לא לשנת המס).{facts?.err ? ` לא נטענו תשובות השאלון: ${facts.err}` : ''}</span>
        </p>
      )}

      <div className={`fm-body${sel ? ' has-sel' : ''}`}>
        <div className="fm-stage-wrap">
          <div className="fm-bar">
            {printed ? (
              <div className="fm-pages" role="group" aria-label="עמוד בטופס">
                <button type="button" className="fm-pg" onClick={() => setPageUser(page - 1)} disabled={page === 1} aria-label="עמוד קודם" data-fm-page-prev>→</button>
                <span className="fm-zv" aria-live="polite">עמ׳ {page} מתוך {pages.length}</span>
                <button type="button" className="fm-pg" onClick={() => setPageUser(page + 1)} disabled={page === pages.length} aria-label="עמוד הבא" data-fm-page-next>←</button>
              </div>
            ) : (
              <div className="fm-pages" role="group" aria-label="עמוד בטופס">
                {pages.map(pg => (
                  <button key={pg.n} type="button" className={`fm-pg${pg.n === page ? ' is-on' : ''}`} aria-pressed={pg.n === page} onClick={() => setPageUser(pg.n)} data-fm-page={pg.n}>
                    עמ׳ {pg.n}<span className="fm-pg-n">{markers.filter(m => m.page === pg.n).length || ''}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="fm-zoom" role="group" aria-label="הגדלה">
              <button type="button" className="fm-zb" onClick={() => setZoomKeep(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} aria-label="הקטנה" data-fm-zoom="out">−</button>
              <span className="fm-zv" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" className="fm-zb" onClick={() => setZoomKeep(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="הגדלה" data-fm-zoom="in">+</button>
            </div>
          </div>
          <div className="fm-stage" ref={stageRef} data-fm-stage tabIndex={0} aria-label={`עמוד ${page} מתוך ${pages.length} — גוררים כדי לזוז`}>
            <div className="fm-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${curPage.w} / ${curPage.h}` }}>
              <img key={curPage.img} src={curPage.img} alt={`${formTitle} — עמוד ${page}`} draggable={false} loading="eager" />
              {onPage.map(m => {
                const st = stateOfMarker(m);
                const rv = valueOfMarker(m);
                const f = m.fields[0];
                const name = f ? `${f.field.label}${f.role && ROLE_SHORT[f.role] ? ` — ${ROLE_SHORT[f.role]}` : ''}` : 'בלי הסבר במאגר';
                return (
                  <button key={m.id} type="button" data-marker={m.id} data-code={m.code}
                    className={`fm-mk is-${m.fields[0]?.role ?? 'none'}${m.byLabel ? ' by-label' : ''}${st ? ` st-${st}` : ''}${rv ? ' has-val' : ''}${sel?.markerId === m.id ? ' is-sel' : ''}${m.fields.length ? '' : ' is-empty'}`}
                    style={{ left: `${m.box[0] * 100}%`, top: `${m.box[1] * 100}%`, width: `${m.box[2] * 100}%`, height: `${m.box[3] * 100}%` }}
                    onClick={() => selectMarker(m)} title={`${m.code || 'בלי קוד'} · ${name}${rv ? ` · בדוח: ${nis(rv.amount)}` : ''}`} aria-label={`${m.code ? `קוד ${m.code}` : 'שדה בלי קוד'}: ${name}${st ? ` · ${CLIENT_STATE_LABEL[st]}` : ''}${rv ? ` · בדוח ${nis(rv.amount)}` : ''}`} data-value={rv?.amount} aria-pressed={sel?.markerId === m.id} />
                );
              })}
            </div>
          </div>
          <p className="fm-legend kn-xs">
            {printed ? <>צילום פרסום רשות המסים בעותק נגיש. לא הומצאו סימוני שדות על הצילום.</>
              : client ? (<><i className="fm-sw st-approved" /> אושר במשרד <i className="fm-sw st-answered" /> התקבלה תשובה <i className="fm-sw st-verify" /> לאישור (מהכרטיס) <i className="fm-sw st-missing" /> חסר <i className="fm-sw st-office" /> בהגשה{retCtx ? <> <i className="fm-sw has-val" /> יש סכום בדוח</> : null}</>)
                : slug === '1301' ? (<><i className="fm-sw is-registered" /> בן הזוג הרשום <i className="fm-sw is-spouse" /> בן/בת הזוג <i className="fm-sw is-joint" /> שניהם יחד <i className="fm-sw by-label" /> בלי קוד — לפי התווית</>)
                  : markers.length ? <>{markers.length} סימונים — {L.anchors.length ? 'לפי הקוד המודפס בטופס' : 'בטופס הזה אין קודים, ולכן לפי התווית שליד כל שדה'}{L.anchors.length && markers.some(m => m.byLabel) ? '; מקווקו — לפי התווית' : ''}.</>
                    : L.pages.every(pg => !pg.textLayer) ? <>הטופס הרשמי סרוק (בלי שכבת טקסט) — אי אפשר לאתר בו שדות; השדות ברשימה ליד הטופס.</> : <>לא נמצאו שדות בטופס באופן חד-משמעי — השדות ברשימה ליד הטופס.</>}
          </p>
        </div>

        <div className={`fm-side${searching && !printed ? ' has-q' : ''}`}>
          <aside className={`fm-detail${sel ? ' is-open' : ''}`} ref={detailRef} tabIndex={-1} aria-live="polite" data-fm-detail>
            {sel && (
              <>
                <div className="fm-detail-top">
                  <span className="fm-code" dir="ltr">{selMarker?.code || selFields[0]?.field.codes.map(c => c.code).join(' / ') || 'בלי קוד'}</span>
                  <button type="button" className="fm-x" onClick={closeSel} aria-label="סגור את ההסבר">✕</button>
                </div>
                {selFields.length === 0 && <p className="kn-small">קוד {selMarker?.code} מודפס בטופס, אבל אין לו עדיין הסבר במאגר. אין להסיק מהכותרת לבדה איך למלא.</p>}
                {sel.fieldKey && !sel.markerId && <p className="kn-xs kn-muted" data-fm-no-marker>אין לסעיף סימון מאומת בתמונה — ההסבר מלא גם בלי הסימון.</p>}
                {selFields.map(({ field, role }) => (
                  <FieldCard key={field.key} field={field} role={role} client={client} facts={yearFacts} canLearn={canLearn} onLearn={onLearn} onOpenTool={onOpenTool} onOpenForm={setForm}
                    onOpenDomain={onOpenDomain} onAddMaterial={onAddMaterial} formUrl={LAYOUTS[field.slug].source.url}
                    ret={retCtx} spouseName={client?.spouseFirstName || client?.spouse?.firstName || 'בן/בת הזוג'} clientName={client?.firstName || 'הלקוח'} />
                ))}
                {neighbors.length > 1 && pos >= 0 && (
                  <nav className="fm-nav" aria-label="סעיפים באותו חלק" data-fm-nav>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={pos <= 0} onClick={() => pickField(neighbors[pos - 1])} data-fm-prev>→ סעיף קודם</button>
                    <span className="kn-xs kn-muted">{pos + 1} מתוך {neighbors.length}</span>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={pos >= neighbors.length - 1} onClick={() => pickField(neighbors[pos + 1])} data-fm-next>סעיף הבא ←</button>
                  </nav>
                )}
              </>
            )}
          </aside>

          {printed ? (
            <div className="fm-list fm-printed" data-fm-printed>
              <p className="kn-small">הסיווג לקודים — במילון, לא על הצילום.</p>
              {canLearn(PRINTED_6111.topic) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLearn(PRINTED_6111.topic)} data-fm-learn={PRINTED_6111.topic}>למילון סיווג ההוצאות ←</button>}
              <p className="kn-xs"><a className="kn-link" href={PRINTED_6111.clarification} target="_blank" rel="noreferrer">דברי ההסבר הרשמיים ל־6111/2025 ↗</a></p>
            </div>
          ) : (
            <section className="fm-list" aria-label="סעיפי הטופס" data-fm-list>
              {!sel && !searching && <p className="kn-small fm-list-lead">לחצו על סימון בטופס או על סעיף ברשימה.</p>}
              {searching ? (
                <>
                  <p className="kn-xs kn-muted" role="status" data-fm-hits={hits.length}>
                    {hits.length === 0 ? 'לא נמצא שדה בטפסים במפה (1301, הנספחים ו-1219). קוד — עם או בלי אפס; שם — כל המילים.'
                      : `${inForm.length ? `${inForm.length} בטופס הזה` : 'לא נמצא בטופס הזה'}${others.length ? ` · ${others.length} בטפסים אחרים` : ''}${/^\d+$/.test(q.trim()) && hits.length > 1 ? ' — כל אחד בטופס או לאדם אחר' : ''}`}
                  </p>
                  {inForm.length > 0 && (
                    <ul className="fm-rows">
                      {inForm.slice(0, limit).map(h => (
                        <li key={`${h.field.key}.${h.code}.${h.role}`}>
                          <button type="button" className="fm-row" aria-current={curKey === h.field.key ? 'true' : undefined} onClick={() => openHit(h)} data-fm-hit={`${h.slug}:${h.code || h.field.key}`}>
                            <span className="fm-code" dir="ltr">{h.code || '—'}</span>
                            <span className="fm-row-t">{h.field.label}</span>
                            <span className="fm-row-p">{hitMeta(h)}{hitValue(h) ? <b className="fm-hit-v" data-fm-hit-value> · בדוח: {nis(hitValue(h)!.amount)}</b> : null}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {others.length > 0 && (
                    <ul className="fm-rows is-other" aria-label="בטפסים אחרים">
                      {others.slice(0, limit).map(h => (
                        <li key={`${h.slug}.${h.field.key}.${h.code}.${h.role}`}>
                          <button type="button" className="fm-row" onClick={() => openHit(h)} data-fm-hit={`${h.slug}:${h.code || h.field.key}`}>
                            <span className="fm-code" dir="ltr">{h.code || '—'}</span>
                            <span className="fm-row-t">נמצא בטופס {h.formId}: {h.field.label} ←</span>
                            <span className="fm-row-p">{hitMeta(h)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(inForm.length > limit || others.length > limit) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit(limit + LIST_MORE)} data-fm-more-rows>להציג עוד סעיפים</button>}
                </>
              ) : (
                <>
                  <div className="fm-scope" role="group" aria-label="אילו סעיפים">
                    {markers.length > 0 && <button type="button" className="fm-chip" aria-pressed={scope === 'page'} onClick={() => setList(() => setScope('page'))} data-fm-scope="page">בעמוד הזה</button>}
                    <button type="button" className="fm-chip" aria-pressed={scope === 'all'} onClick={() => setList(() => setScope('all'))} data-fm-scope="all">כל הסעיפים</button>
                    {unplaced.length > 0 && <button type="button" className="fm-chip" aria-pressed={scope === 'unplaced'} onClick={() => setList(() => setScope('unplaced'))} data-fm-scope="unplaced" data-fm-unplaced={unplaced.length}>בלי סימון ({unplaced.length})</button>}
                  </div>
                  {groups.length > 1 && (
                    <label className="fm-part">
                      <span className="fm-sr">חלק בטופס</span>
                      <select value={part} onChange={e => setList(() => setPart(e.target.value))} data-fm-part>
                        <option value="">כל חלקי הטופס</option>
                        {groups.map(g => <option key={g} value={g}>{groupName(g, slug)}</option>)}
                      </select>
                    </label>
                  )}
                  <p className="kn-xs kn-muted" role="status" data-fm-count={browse.length}>
                    {browse.length} סעיפים {scope === 'page' ? 'בעמוד הזה' : scope === 'unplaced' ? 'בלי סימון בטופס' : 'בטופס'}{part ? ` · ${groupName(part, slug)}` : ''}
                  </p>
                  {browse.length > 0 ? (
                    <ul className="fm-rows">
                      {browse.slice(0, limit).map((f, n, shown) => {
                        const why = scope === 'unplaced' ? whyOf.get(f.key) : undefined;
                        return (
                          <li key={f.key}>
                            {why && (n === 0 || whyOf.get(shown[n - 1].key) !== why) && <p className="kn-xs kn-muted fm-rows-h">{UNPLACED_LABEL[why]}</p>}
                            <button type="button" className="fm-row" aria-current={curKey === f.key ? 'true' : undefined} onClick={() => pickField(f)} data-fm-row={f.key} data-fm-unplaced-item={why ? f.key : undefined}>
                              <span className="fm-code" dir="ltr">{f.codes.map(c => c.code).join(' / ') || '—'}</span>
                              <span className="fm-row-t">{f.label}</span>
                              <span className="fm-row-p">{slug === '1301' && f.part ? `חלק ${f.part}` : f.section ?? ''}{whyOf.has(f.key) && scope !== 'unplaced' ? ' · בלי סימון' : ''}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : scope === 'page' ? (
                    <p className="kn-small">בעמוד הזה אין סעיפים מסומנים. <button type="button" className="kn-link" onClick={() => setList(() => setScope('all'))}>לכל הסעיפים בטופס ←</button></p>
                  ) : <p className="kn-small kn-muted">אין סעיפים בחלק הזה.</p>}
                  {browse.length > limit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit(limit + LIST_MORE)} data-fm-more-rows>להציג עוד סעיפים</button>}
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {domain === 'annual' && !printed && (
        <p className="fm-foot kn-xs kn-muted">
          המקור: הקבצים הרשמיים מאתר רשות המסים, הורדו ב-{L.source.fetchedOn.split('-').reverse().join('.')}. הסימון לפי הקוד המודפס בכל שדה — לא לפי ניחוש.
          {' '}שדה בלי קוד מודפס — מסומן לפי התווית שלידו, רק כשההתאמה חד-משמעית. 116ד הרגיל סרוק — עמוד ורשימה.
        </p>
      )}
    </section>
  );
}

function FieldCard({ field, role, client, facts, canLearn, onLearn, onOpenForm, onOpenTool, onOpenDomain, onAddMaterial, formUrl, ret, spouseName, clientName }: { field: MapField; role?: Role; client: Client | null; facts: YearFact[]; canLearn: (id: string) => boolean; onLearn: (id: string) => void; onOpenForm: (slug: FormSlug) => void; onOpenTool?: (toolId: string) => void; onOpenDomain?: (id: string) => void; onAddMaterial?: (seed: string) => void; formUrl: string; ret: ReturnCtx | null; spouseName: string; clientName: string }) {
  const ex = explainOf(field);
  const audit = ex as typeof ex & Audit;
  const code = role && role !== 'form' ? field.codes.find(c => c.role === role)?.code : field.codes[0]?.code;
  const rv = field.slug === '1301' && code ? returnFieldOf(ret, code, role) : undefined;
  const src = sourcesOf(field);
  // ‼ «ללמוד» — רק נושא שהסעיף באמת מדבר עליו (קוד, או מילה משם הנושא בסעיף); אחרת — המחברת של הטופס עצמו
  const hay = `${field.label} ${field.instruction ?? ''} ${ex.what ?? ''}`;
  const speaks = (title: string) => title.split(/\s+/).some(w => w.length > 2 && hay.includes(w.replace(/^ה/, '')));
  const all = learnTopicsOf(field).filter(t => canLearn(t.id));
  const relevant = all.filter(t => t.how === 'code' || speaks(t.title));
  const home = field.slug === '1219' ? 'wealth' : 'annualReturn';
  const topics = relevant.length ? relevant : all.filter(t => t.id === home).concat(all.some(t => t.id === home) || !canLearn(home) ? [] : [{ id: home, title: field.slug === '1219' ? 'הצהרת הון' : 'הכנת הדוח: מהמסמך לשדה', how: 'default' as const }]);
  const st = client ? clientStateOf(field, client, facts, 2025, role) : null;
  const practice = practiceOf(field.slug, field.key);
  const modelMistake = ex.mistake && ex.mistake !== '—' && !practice?.replace ? ex.mistake : undefined;
  const note = FIELD_NOTE[`${field.slug}/${field.key}`];
  const ctx = onOpenDomain ? FIELD_DOMAIN[`${field.slug}/${field.key}`] : undefined;
  const tool = onOpenTool ? toolOf(field) : '';
  const strongQ = src.questions.filter(x => x.strong);
  const moreQ = src.questions.filter(x => !x.strong);
  const [allQ, setAllQ] = useState(false);
  const fromFile = !!(src.file || src.annexInfo?.length || src.draft);
  const sources = audit.auditSources ?? [];
  return (
    <article className="fm-card" data-fm-field={field.key}>
      <h4 className="fm-card-t" tabIndex={-1}>{field.label}{field.wealth?.isNew ? <span className="fm-new"> · סעיף חדש בטופס 12.2024</span> : null}</h4>
      <p className="fm-card-meta">
        טופס {field.formId}{field.slug === '1219' ? '' : ' · 2025'}
        {field.part && field.slug === '1301' ? ` · חלק ${field.part}` : ''}{field.section && field.slug !== '1219' ? ` · ${field.slug === '1301' ? 'סעיף ' : ''}${field.section}` : ''}
      </p>
      {field.codes.length > 0 && field.slug === '1301' && (
        <p className="fm-roles">
          {field.codes.map(c => (
            <span key={c.code + c.role} className={`fm-role is-${c.role}${role === c.role ? ' is-this' : ''}`}><b dir="ltr">{c.code}</b> {ROLE_SHORT[c.role]}</span>
          ))}
        </p>
      )}
      {role && role !== 'form' && field.codes.length > 1 && <p className="kn-xs kn-muted">השדה שבחרתם: {ROLE_LABEL[role]}.</p>}
      {st && <p className={`fm-st is-${st.state}`} data-fm-client-state={st.state}><b>{CLIENT_STATE_LABEL[st.state]}</b> · {st.reason}</p>}
      {rv && (
        <section className="fm-ret" data-fm-return-value={rv.amount} aria-label="ערך בדוח וממה הוא מורכב">
          <h5 className="fm-h">בדוח {ret?.year}: <b dir="ltr">{nis(rv.amount)}</b>{rv.source.kind === 'manual' ? ' · # ערך ידני' : ''}</h5>
          <p className="kn-xs kn-muted">ממה זה מורכב — השורות שמרכיבות את הסכום (סכום · מסמך · של מי · השאלה · השנה):</p>
          <Breakdown source={rv.source} spouseName={spouseName} clientName={clientName} compact />
        </section>
      )}
      {ret && !rv && field.slug === '1301' && field.kind === 'amount' && <p className="kn-xs kn-muted" data-fm-return-empty>אין סכום בשדה הזה בדוח {ret.year} (אין שורות מקור שמובילות אליו).</p>}

      <h5 className="fm-h">מה ממלאים</h5>
      <p className="fm-p">{ex.what ?? ex.meaning ?? <span className="fm-gap">הסבר מפורט עדיין חסר במאגר. אין להסיק מהכותרת לבדה איך למלא.</span>}{ex.what && ex.status && !field.wealth ? <> <ClaimTag status={ex.status} /></> : null}</p>

      {(modelMistake || note || practice?.mistake || practice?.tip) && (
        <section className="fm-practice" data-fm-practice={practice ? field.key : undefined}>
          {(modelMistake || note || (practice?.mistake && (practice.replace || !modelMistake))) && <h5 className="fm-h">חשוב לזכור</h5>}
          {note && <p className="fm-p" data-fm-note>{note.text}{canLearn(note.topic) ? <> <button type="button" className="kn-link" onClick={() => onLearn(note.topic)}>{note.link} ←</button></> : null}</p>}
          {modelMistake && <p className="fm-p">{modelMistake}</p>}
          {practice?.mistake && (practice.replace || !modelMistake) && <p className="fm-p">{practice.mistake}</p>}
          {practice?.tip && <><h5 className="fm-h">טריק מעשי</h5><p className="fm-p">{practice.tip}</p></>}
          {practice?.source && (
            <p className="kn-xs kn-muted">מקור: {practice.source.url ? <a href={practice.source.url} target="_blank" rel="noreferrer">{practice.source.label}</a> : practice.source.label}{practice.source.locator ? ` · ${practice.source.locator}` : ''}</p>
          )}
        </section>
      )}

      {ex.check && <><h5 className="fm-h">לפני שמסיימים</h5><p className="fm-p">{ex.check}</p></>}
      {field.uncertain && <p className="fm-p fm-warn">הקריאה של השדה הזה מהטופס לא ודאית — לבדוק מול הטופס.</p>}

      {fromFile && (
        <>
          <h5 className="fm-h">מאיפה המידע מגיע</h5>
          <ul className="fm-src-list">
            {src.file && <li><span className="fm-src-k">בתיק</span>{src.file.label}{src.file.note ? ` — ${src.file.note}` : ''}</li>}
            {src.annexInfo?.map(a => <li key={a.label}><span className="fm-src-k">{a.source}</span>{a.label}{a.note ? ` — ${a.note}` : ''}</li>)}
            {src.draft && <li><span className="fm-src-k">בטיוטת הדוח</span>{src.draft}</li>}
          </ul>
        </>
      )}

      <details className="fm-asks" data-fm-asks>
        <summary>מה לבקש מהלקוח{src.documents.length || strongQ.length ? ` · ${[src.documents.length ? (src.documents.length === 1 ? 'מסמך אחד' : `${src.documents.length} מסמכים`) : '', strongQ.length ? (strongQ.length === 1 ? 'שאלה אחת' : `${strongQ.length} שאלות`) : ''].filter(Boolean).join(', ')}` : ''}</summary>
        {src.documents.length > 0 && <><h6 className="fm-h6">מסמכים</h6><ul className="fm-q">{src.documents.map(d => <li key={d.label}>{neutral(d.label)}</li>)}</ul></>}
        {strongQ.length > 0 && <><h6 className="fm-h6">שאלות</h6><ul className="fm-q">{strongQ.map(x => <li key={x.item.key}>{neutral(x.item.question ?? x.item.label)}</li>)}</ul></>}
        {moreQ.length > 0 && (allQ
          ? <><h6 className="fm-h6">שאלות נוספות {field.slug === '1301' ? 'באותו חלק בדוח' : 'בתחום'}</h6><ul className="fm-q">{moreQ.map(x => <li key={x.item.key}>{neutral(x.item.question ?? x.item.label)}<span className="kn-muted"> · {x.area}</span></li>)}</ul></>
          : <button type="button" className="kn-link kn-xs" onClick={() => setAllQ(true)}>עוד {moreQ.length === 1 ? 'שאלה אחת' : `${moreQ.length} שאלות`} {field.slug === '1301' ? 'באותו חלק בדוח' : 'בתחום'}</button>)}
        {!src.documents.length && !src.questions.length && <p className="kn-xs kn-muted">לא קושרו לסעיף מסמך או שאלה במאגר.</p>}
      </details>

      {ctx && <p className="fm-related" data-fm-context={ctx.domain}><button type="button" className="kn-link" onClick={() => onOpenDomain!(ctx.domain)}>{ctx.label} ←</button></p>}
      {tool && <p className="fm-related" data-fm-tool={tool}><button type="button" className="kn-link" onClick={() => onOpenTool!(tool)}>{TOOL_LINK[tool]} ←</button></p>}

      {relatedFormsOf(field).map(r => (
        <p key={r.slug} className="fm-related" data-fm-related={r.slug}>
          <span className="kn-xs kn-muted">טופס קשור · {r.why}:</span>{' '}
          <button type="button" className="kn-link" onClick={() => onOpenForm(r.slug)}>{r.label} ←</button>
        </p>
      ))}
      <div className="fm-learn">
        {topics.map(t => (
          <button key={t.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onLearn(t.id)} data-fm-learn={t.id}>
            ללמוד: {t.title} ←
          </button>
        ))}
      </div>

      {/* מאיפה ההסבר — מקופל: מתי נבדק ומול מה (FULL_FIELD_AUDIT), עמוד בחוברת והטופס הרשמי */}
      <details className="fm-prov" data-fm-provenance>
        <summary>המקור והיקף הבדיקה</summary>
        {(audit.auditReviewedOn || audit.reviewedOn) && <p className="kn-xs">תפקיד השדה וההסבר נבדקו ב־{audit.auditReviewedOn || audit.reviewedOn}. הזכאות והסכום נקבעים לפי שנת הדוח, האישורים ונסיבות התיק.</p>}
        {sources.length ? (
          <ul className="fm-prov-list">
            {sources.map((s, n) => (
              <li key={`${s.url}${n}`}>
                {s.locator && <span className="kn-xs">{s.locator}</span>}
                {/prior_primary/.test(s.readMethod ?? '') && <span className="kn-xs kn-muted"> המקור נקרא במחקר הקודם. הקישור נחסם בבדיקת הגישה החוזרת; אין כאן טענה לקריאה מחודשת.</span>}
                {' '}<a className="kn-xs" href={s.url} target="_blank" rel="noreferrer">{sourceName(s.url)} ↗</a>
              </li>
            ))}
          </ul>
        ) : audit.sourceURL ? <p className="kn-xs">{audit.locator} <a href={audit.sourceURL} target="_blank" rel="noreferrer">למקור ההסבר ↗</a></p> : null}
        {field.guidePage ? <p className="kn-xs kn-muted">בחוברת «דע זכויותיך וחובותיך» 2025: עמ׳ {field.guidePage - 2}</p> : null}
        <p className="kn-xs"><a href={formUrl} target="_blank" rel="noreferrer">הטופס הרשמי ↗</a></p>
      </details>
      {onAddMaterial && <p className="fm-related"><button type="button" className="kn-link" onClick={() => onAddMaterial(`${field.formId}${code ? ` · ${code}` : ''} · ${field.label}`)} data-fm-add>＋ שאלה או חומר על הסעיף</button></p>}
    </article>
  );
}
