// ─── מפת הטופס — עמודי הטופס הרשמי, סימון על כל שדה, והסבר ליד השדה (16.10.2026) ─────────────────────
// ‼ גיא (16.10): «כמו טופס 6101 החכם» — הטופס עצמו, לא רשימה. לחיצה על שדה: מה ממלאים, מאיפה המידע מגיע, למי,
//   הסבר קצר וקישור ללמוד לעומק. «אתר שדה לפי קוד» מציג את כל ההתאמות — לא בוחר אחת בשקט.
// ‼ תצוגה בלבד: אין כאן מילוי, אין כתיבה לתיק. מצב לקוח (model.clientStateOf): «אושר במשרד» / «התקבלה תשובה מהלקוח» מתשובות
//   השאלון לשנה (tax_year_facts, קריאה בלבד דרך loadYearData), ואחרת מהכרטיס — «לאישור» כשמגיע מהכרטיס.
// ‼ טלפון: הטופס בתוך חלון גלילה, עם הגדלה בכפתורים (ובצביטה של הדפדפן) — גוררים באצבע; ההסבר נפתח כגיליון מלמטה.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import { factFromRow, loadYearData } from '../../taxYear/api';
import { supabase } from '../../../lib/supabase';
import {
  CLIENT_STATE_LABEL, LAYOUTS, MAP_FORM_BY_SLUG, ROLE_LABEL, ROLE_SHORT, UNPLACED_LABEL,
  clientStateOf, clientSummary, explainOf, findByCode, findFields, relatedFormsOf, formsOfDomain, learnTopicsOf, markersOf, sourcesOf, unplacedOf,
  type ClientFieldState, type FormSlug, type MapField, type Marker, type Role,
} from './model';
import { ClaimTag } from '../claim';
import { loadReturnRequests, loadReturns } from '../../annualReturn/api';
import { computeReturn, emptyDraft } from '../../annualReturn/engine';
import { Breakdown } from '../../annualReturn/SourceEntry';
import type { ReturnField, ReturnOutputs } from '../../annualReturn/types';
import { nis } from '../../taxEstimate/parts';
import './formMap.css';

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

export default function FormMap({ domain, clients = [], contextClient = null, onBackToClient, canLearn, onLearn, initialCode }: Props) {
  const forms = formsOfDomain(domain);
  const [slug, setSlug] = useState<FormSlug>(forms[0].slug);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<Sel>(null);
  const focus = useMemo(() => (domain === 'annual' && contextClient ? readFocus() : null), [domain, contextClient]);
  const [q, setQ] = useState(initialCode ?? (focus && focus.clientId === contextClient?.id ? focus.code ?? '' : ''));
  const [clientId, setClientId] = useState<string>(contextClient?.id ?? '');
  useEffect(() => { if (contextClient) setClientId(contextClient.id); }, [contextClient]);
  const client = clients.find(c => c.id === clientId) ?? (contextClient?.id === clientId ? contextClient : null);
  const L = LAYOUTS[slug];
  const markers = useMemo(() => markersOf(slug), [slug]);
  const onPage = markers.filter(m => m.page === page);
  const unplaced = useMemo(() => unplacedOf(slug), [slug]);
  const hits = useMemo(() => findFields(q), [q]);
  const stageRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // ‼ הגדלה שומרת על מה שבמרכז החלון — בלי זה ההגדלה קופצת לקצה השמאלי של הטופס (העמוד LTR בגאומטריה)
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  const setZoomKeep = (next: number) => {
    const st = stageRef.current;
    if (st) centerRef.current = { x: (st.scrollLeft + st.clientWidth / 2) / st.scrollWidth, y: (st.scrollTop + st.clientHeight / 2) / st.scrollHeight };
    setZoom(next);
  };
  useLayoutEffect(() => {
    const st = stageRef.current; const c = centerRef.current;
    if (!st || !c) return;
    st.scrollLeft = c.x * st.scrollWidth - st.clientWidth / 2; st.scrollTop = c.y * st.scrollHeight - st.clientHeight / 2;
    centerRef.current = null;
  }, [zoom]);
  const selMarker = sel?.markerId ? markers.find(m => m.id === sel.markerId) : undefined;
  const selFields: { field: MapField; role?: Role }[] = selMarker ? selMarker.fields
    : sel?.fieldKey ? unplaced.filter(u => u.field.key === sel.fieldKey).map(u => ({ field: u.field })) : [];
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
        const pick = reqs.find(r => r.open && r.taxYear === 2025) ?? reqs.find(r => r.open) ?? reqs.find(r => r.taxYear === 2025);
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
  const summary = client && (slug === '1301' || slug === '1219') ? clientSummary(slug, client, yearFacts) : null;

  const open = (s: FormSlug, p?: number, markerId?: string, fieldKey?: string) => {
    setSlug(s); if (p) setPage(p); setSel(markerId || fieldKey ? { slug: s, markerId, fieldKey } : null);
    if (markerId) requestAnimationFrame(() => {
      const el = stageRef.current?.querySelector<HTMLElement>(`[data-marker="${markerId}"]`);
      el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  };
  // קוד שנפתח מבחוץ — פותחים את ההתאמה היחידה; כמה התאמות — נשארות ברשימה
  useEffect(() => {
    if (!initialCode) return;
    const h = findByCode(initialCode).filter(x => formsOfDomain(domain).some(f => f.slug === x.slug));
    if (h.length === 1) open(h[0].slug, h[0].page, h[0].markerId, h[0].markerId ? undefined : h[0].field.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, domain]);
  // בטלפון: ההסבר יושב מתחת לטופס — מביאים אותו לעין אחרי בחירה
  // ‼ בטלפון ההסבר הוא גיליון שמכסה את חצי המסך התחתון — השדה שנבחר עולה לרבע העליון, כדי שיישאר גלוי מעליו
  useEffect(() => {
    if (!sel || !window.matchMedia?.('(max-width: 900px)').matches) return;
    detailRef.current?.focus({ preventScroll: true });
    const el = sel.markerId ? stageRef.current?.querySelector<HTMLElement>(`[data-marker="${sel.markerId}"]`) : null;
    if (!el) return;
    const stage = stageRef.current!;
    const er = el.getBoundingClientRect(); const sr = stage.getBoundingClientRect();
    stage.scrollTop += er.top - sr.top - Math.min(80, stage.clientHeight / 4);
    const top = el.getBoundingClientRect().top;
    window.scrollBy({ top: top - window.innerHeight * 0.22 });
  }, [sel]);

  const formTitle = MAP_FORM_BY_SLUG[slug].formId === '1219' ? 'טופס 1219 — הצהרת הון' : L.title;

  return (
    <section className="fm" data-form-map={slug} aria-label={`מפת ${formTitle}`}>
      <header className="fm-head">
        <div className="fm-title-row">
          <h3 className="fm-title">{formTitle}{L.taxYear && slug !== '1219' ? ` · שנת המס ${L.taxYear}` : ''}</h3>
          <a className="fm-src" href={L.source.pdf} target="_blank" rel="noreferrer">הטופס הרשמי (PDF)</a>
        </div>
        <p className="fm-lead">
          {slug === '1219'
            ? 'הטופס הרשמי של רשות המסים. כל שורת סיכום מסומנת — לחצו עליה: מה רושמים, מאיזה מסמך, מה בודקים ואיפה טועים.'
            : 'הטופס הרשמי של רשות המסים. כל שדה עם קוד מסומן — לחצו עליו: מה ממלאים, מאיפה המידע מגיע (מסמך, שאלה בשאלון, נתון בתיק) ולמי מבני הזוג.'}
        </p>
        {forms.length > 1 && (
          <div className="fm-forms" role="group" aria-label="טופס או נספח">
            {/* ‼ נספח עם קודים מודפסים — כפתור; נספח בלי קודים (רק העמודים והרשימה) — בבחירה, כדי לא להעמיס */}
            {forms.filter(f => LAYOUTS[f.slug].anchors.length > 0).map(f => (
              <button key={f.slug} type="button" className={`fm-chip${f.slug === slug ? ' is-on' : ''}`} aria-pressed={f.slug === slug}
                onClick={() => { setSlug(f.slug); setPage(1); setSel(null); }} data-fm-form={f.slug}>
                {f.short}
              </button>
            ))}
            {forms.some(f => LAYOUTS[f.slug].anchors.length === 0) && (
              <label className={`fm-more${LAYOUTS[slug].anchors.length === 0 ? ' is-on' : ''}`}>
                <span className="fm-sr">נספחים נוספים (בלי קודים מודפסים)</span>
                <select value={LAYOUTS[slug].anchors.length === 0 ? slug : ''} onChange={e => { if (e.target.value) { setSlug(e.target.value as FormSlug); setPage(1); setSel(null); } }} data-fm-more>
                  <option value="">נספחים נוספים…</option>
                  {forms.filter(f => LAYOUTS[f.slug].anchors.length === 0).map(f => <option key={f.slug} value={f.slug}>{f.short}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="fm-tools">
          <label className="fm-find" htmlFor={`fm-q-${domain}`}>
            <span>אתר שדה — קוד או שם</span>
            <input id={`fm-q-${domain}`} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="158 או «תרומות»" data-fm-find />
          </label>
          {(clients.length > 0 || contextClient) && (
            <label className="fm-client" htmlFor={`fm-c-${domain}`}>
              <span>מצב השדות אצל לקוח</span>
              <select id={`fm-c-${domain}`} value={clientId} onChange={e => setClientId(e.target.value)} data-fm-client>
                <option value="">בלי לקוח</option>
                {contextClient && !clients.some(c => c.id === contextClient.id) && <option value={contextClient.id}>{nameOf(contextClient)}</option>}
                {clients.map(c => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}
              </select>
            </label>
          )}
        </div>
        {contextClient && onBackToClient && (
          <p className="fm-ctx">מוצג מול התיק של <b>{nameOf(contextClient)}</b>{retCtx ? <> · ערכי הדוח לשנת {retCtx.year} ({retCtx.version ? `גרסה ${retCtx.version}` : 'טיוטה שטרם נשמרה'}, {retCtx.outputs.fields.filter(f => f.kind === 'amount').length} סכומים) על הטופס</> : ret && !ret.ctx && !ret.err ? ' · אין לו בקשת «דוח שנתי» — המפה מראה את מצב הכרטיס בלבד' : ''} · <button type="button" className="kn-link" onClick={onBackToClient}>חזרה לתיק</button></p>
        )}
        {q.trim() && (
          <div className="fm-hits" role="status" data-fm-hits={hits.length}>
            {hits.length === 0 ? <p className="kn-small kn-muted">לא נמצא שדה בטפסים במפה (1301, הנספחים ו-1219). קוד — עם או בלי אפס; שם — כל המילים.</p> : (
              <>
                {hits.length > 1 && <p className="kn-small">{hits.length} שדות{/^\d+$/.test(q.trim()) ? ' עם הקוד הזה — כל אחד בטופס או לאדם אחר' : ''}:</p>}
                <ul className="fm-hit-list">
                  {hits.map(h => (
                    <li key={`${h.slug}.${h.field.key}.${h.code}.${h.role}`}>
                      <button type="button" className="fm-hit" onClick={() => open(h.slug, h.page, h.markerId, h.markerId ? undefined : h.field.key)} data-fm-hit={`${h.slug}:${h.code || h.field.key}`}>
                        <span className="fm-code" dir="ltr">{h.code || '—'}</span>
                        <span className="fm-hit-t">{h.field.label}</span>
                        <span className="fm-hit-p">טופס {h.formId}{h.taxYear ? ` · ${h.taxYear}` : ''}{ROLE_SHORT[h.role] ? ` · ${ROLE_SHORT[h.role]}` : ''}{h.page ? ` · עמ׳ ${h.page}` : ' · לא מסומן בטופס'}{h.slug === '1301' && returnFieldOf(retCtx, h.code, h.role) ? <b className="fm-hit-v" data-fm-hit-value> · בדוח: {nis(returnFieldOf(retCtx, h.code, h.role)!.amount)}</b> : null}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
            <div className="fm-pages" role="group" aria-label="עמוד בטופס">
              {L.pages.map(pg => (
                <button key={pg.n} type="button" className={`fm-pg${pg.n === page ? ' is-on' : ''}`} aria-pressed={pg.n === page} onClick={() => { setPage(pg.n); setSel(null); }} data-fm-page={pg.n}>
                  עמ׳ {pg.n}<span className="fm-pg-n">{markers.filter(m => m.page === pg.n).length || ''}</span>
                </button>
              ))}
            </div>
            <div className="fm-zoom" role="group" aria-label="הגדלה">
              <button type="button" className="fm-zb" onClick={() => setZoomKeep(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} aria-label="הקטנה" data-fm-zoom="out">−</button>
              <span className="fm-zv" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" className="fm-zb" onClick={() => setZoomKeep(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="הגדלה" data-fm-zoom="in">+</button>
            </div>
          </div>
          <div className="fm-stage" ref={stageRef} data-fm-stage tabIndex={0} aria-label={`עמוד ${page} מתוך ${L.pages.length} — גוררים כדי לזוז`}>
            <div className="fm-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${L.pages[page - 1].w} / ${L.pages[page - 1].h}` }}>
              <img src={L.pages[page - 1].img} alt={`${formTitle} — עמוד ${page}`} draggable={false} loading="eager" />
              {onPage.map(m => {
                const st = stateOfMarker(m);
                const rv = valueOfMarker(m);
                const f = m.fields[0];
                const name = f ? `${f.field.label}${f.role && ROLE_SHORT[f.role] ? ` — ${ROLE_SHORT[f.role]}` : ''}` : 'טרם נכתב';
                return (
                  <button key={m.id} type="button" data-marker={m.id} data-code={m.code}
                    className={`fm-mk is-${m.fields[0]?.role ?? 'none'}${m.byLabel ? ' by-label' : ''}${st ? ` st-${st}` : ''}${rv ? ' has-val' : ''}${sel?.markerId === m.id ? ' is-sel' : ''}${m.fields.length ? '' : ' is-empty'}`}
                    style={{ left: `${m.box[0] * 100}%`, top: `${m.box[1] * 100}%`, width: `${m.box[2] * 100}%`, height: `${m.box[3] * 100}%` }}
                    onClick={() => setSel({ slug, markerId: m.id })} title={`${m.code || 'בלי קוד'} · ${name}${rv ? ` · בדוח: ${nis(rv.amount)}` : ''}`} aria-label={`${m.code ? `קוד ${m.code}` : 'שדה בלי קוד'}: ${name}${st ? ` · ${CLIENT_STATE_LABEL[st]}` : ''}${rv ? ` · בדוח ${nis(rv.amount)}` : ''}`} data-value={rv?.amount} aria-pressed={sel?.markerId === m.id} />
                );
              })}
            </div>
          </div>
          <p className="fm-legend kn-xs">
            {client ? (<><i className="fm-sw st-approved" /> אושר במשרד <i className="fm-sw st-answered" /> התקבלה תשובה <i className="fm-sw st-verify" /> לאישור (מהכרטיס) <i className="fm-sw st-missing" /> חסר <i className="fm-sw st-office" /> בהגשה{retCtx ? <> <i className="fm-sw has-val" /> יש סכום בדוח</> : null}</>)
              : slug === '1301' ? (<><i className="fm-sw is-registered" /> בן הזוג הרשום <i className="fm-sw is-spouse" /> בן/בת הזוג <i className="fm-sw is-joint" /> שניהם יחד <i className="fm-sw by-label" /> בלי קוד — לפי התווית</>)
                : markers.length ? <>{markers.length} סימונים — {L.anchors.length ? 'לפי הקוד המודפס בטופס' : 'בטופס הזה אין קודים, ולכן לפי התווית שליד כל שדה'}{L.anchors.length && markers.some(m => m.byLabel) ? '; מקווקו — לפי התווית' : ''}.</>
                  : L.pages.every(pg => !pg.textLayer) ? <>הטופס הרשמי סרוק (בלי שכבת טקסט) — אי אפשר לאתר בו שדות; השדות ברשימה למטה.</> : <>לא נמצאו שדות בטופס באופן חד-משמעי — השדות ברשימה למטה.</>}
          </p>
        </div>

        <aside className={`fm-detail${sel ? ' is-open' : ''}`} ref={detailRef} tabIndex={-1} aria-live="polite" data-fm-detail>
          {!sel && <Hint markers={markers.length} unplaced={unplaced.length} />}
          {sel && (
            <>
              <div className="fm-detail-top">
                <span className="fm-code" dir="ltr">{selMarker?.code || selFields[0]?.field.codes.map(c => c.code).join(' / ') || 'בלי קוד'}</span>
                <button type="button" className="fm-x" onClick={() => setSel(null)} aria-label="סגור את ההסבר">✕</button>
              </div>
              {selFields.length === 0 && <p className="kn-small">קוד {selMarker?.code} מודפס בטופס, אבל אין לו עדיין הסבר במערכת — <b>טרם נכתב</b>.</p>}
              {selFields.map(({ field, role }) => (
                <FieldCard key={field.key} field={field} role={role} client={client} facts={yearFacts} canLearn={canLearn} onLearn={onLearn} onOpenForm={s2 => { setSlug(s2); setPage(1); setSel(null); }}
                  ret={retCtx} spouseName={client?.spouseFirstName || client?.spouse?.firstName || 'בן/בת הזוג'} clientName={client?.firstName || 'הלקוח'} />
              ))}
            </>
          )}
        </aside>
      </div>

      {unplaced.length > 0 && (
        <details className="fm-unplaced" data-fm-unplaced={unplaced.length}>
          <summary>בלי סימון בטופס ({unplaced.length}) — תיבות סימון, פרטים אישיים ושדות בלי קוד מודפס</summary>
          {(['noCode', 'noText', 'notPrinted', 'ambiguous'] as const).map(why => {
            const rows = unplaced.filter(u => u.why === why);
            return rows.length ? (
              <div key={why} className="fm-un-group">
                <p className="kn-xs kn-muted">{UNPLACED_LABEL[why]}</p>
                <ul>
                  {rows.map(u => (
                    <li key={u.field.key}>
                      <button type="button" className="kn-link" onClick={() => setSel({ slug, fieldKey: u.field.key })} data-fm-unplaced-item={u.field.key}>
                        {u.field.section ? `${u.field.part ? `${u.field.part} · ` : ''}${u.field.section} · ` : ''}{u.field.label}
                      </button>
                      {u.field.codes.length > 0 && <span className="kn-xs kn-muted" dir="ltr"> {u.field.codes.map(c => c.code).join('/')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </details>
      )}
      {domain === 'annual' && (
        <p className="fm-foot kn-xs kn-muted">
          המקור: הקבצים הרשמיים מאתר רשות המסים, הורדו ב-{L.source.fetchedOn.split('-').reverse().join('.')}. הסימון לפי הקוד המודפס בכל שדה — לא לפי ניחוש.
          {' '}שדה בלי קוד מודפס — מסומן לפי התווית שלידו, רק כשההתאמה חד-משמעית. 116ד הרגיל סרוק — עמוד ורשימה.
        </p>
      )}
    </section>
  );
}

function Hint({ markers, unplaced }: { markers: number; unplaced: number }) {
  return (
    <div className="fm-hint">
      <p className="kn-small"><b>לחצו על שדה מסומן</b> — וההסבר יופיע כאן.</p>
      <p className="kn-xs kn-muted">בטופס הזה: {markers} שדות מסומנים{unplaced ? `, ועוד ${unplaced} בלי סימון (ברשימה מתחת לטופס)` : ''}. בטלפון: גוררים באצבע, ו«+» מגדיל.</p>
    </div>
  );
}

function FieldCard({ field, role, client, facts, canLearn, onLearn, onOpenForm, ret, spouseName, clientName }: { field: MapField; role?: Role; client: Client | null; facts: YearFact[]; canLearn: (id: string) => boolean; onLearn: (id: string) => void; onOpenForm: (slug: FormSlug) => void; ret: ReturnCtx | null; spouseName: string; clientName: string }) {
  const ex = explainOf(field);
  const code = role && role !== 'form' ? field.codes.find(c => c.role === role)?.code : field.codes[0]?.code;
  const rv = field.slug === '1301' && code ? returnFieldOf(ret, code, role) : undefined;
  const src = sourcesOf(field);
  const topics = learnTopicsOf(field).filter(t => canLearn(t.id));
  const st = client ? clientStateOf(field, client, facts, 2025, role) : null;
  const [allQ, setAllQ] = useState(false);
  const qs = allQ ? src.questions : src.questions.slice(0, 3);
  return (
    <article className="fm-card" data-fm-field={field.key}>
      <h4 className="fm-card-t">{field.label}{field.wealth?.isNew ? <span className="fm-new"> · סעיף חדש בטופס 12.2024</span> : null}</h4>
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
      <p className="fm-p">{ex.what ?? <span className="fm-gap">טרם נכתב</span>}{ex.what && ex.status && !field.wealth ? <> <ClaimTag status={ex.status} /></> : null}</p>
      {ex.meaning && !ex.what && <><h5 className="fm-h">מה זה אומר</h5><p className="fm-p">{ex.meaning}</p></>}

      <h5 className="fm-h">מאיפה המידע מגיע</h5>
      <ul className="fm-src-list">
        <li><span className="fm-src-k">מסמך</span>{src.documents.length ? src.documents.map(d => d.label).join(' · ') : <span className="kn-muted">אין מסמך שנקבע לשדה</span>}</li>
        {src.questions.length > 0 && (
          <li><span className="fm-src-k">{field.slug === '1301' && !src.questions.some(x => x.strong) ? 'בשאלון — באותו חלק בדוח' : 'בשאלון'}</span>
            <ul className="fm-q">{qs.map(x => <li key={x.item.key} title={x.item.question?.replace(/{[a-z]+}/g, '…')}>{x.item.label}<span className="kn-muted"> · {x.area}</span></li>)}</ul>
            {src.questions.length > 3 && <button type="button" className="kn-link kn-xs" onClick={() => setAllQ(v => !v)}>{allQ ? 'פחות' : `ועוד ${src.questions.length - 3}`}</button>}
          </li>
        )}
        {src.file && <li><span className="fm-src-k">בתיק</span>{src.file.label}{src.file.note ? ` — ${src.file.note}` : ''}</li>}
        {src.annexInfo?.map(a => <li key={a.label}><span className="fm-src-k">{a.source}</span>{a.label}{a.note ? ` — ${a.note}` : ''}</li>)}
        {src.draft && <li><span className="fm-src-k">בטיוטת הדוח</span>{src.draft}</li>}
      </ul>

      {(ex.check || ex.mistake) && (
        <>
          <h5 className="fm-h">לבדוק</h5>
          {ex.check && <p className="fm-p">{ex.check}</p>}
          {ex.mistake && <p className="fm-p fm-warn">טעות נפוצה: {ex.mistake}</p>}
        </>
      )}
      {field.uncertain && <p className="fm-p fm-warn">הקריאה של השדה הזה מהטופס לא ודאית — לבדוק מול הטופס.</p>}

      {relatedFormsOf(field).map(r => (
        <p key={r.slug} className="fm-related" data-fm-related={r.slug}>
          <span className="kn-xs kn-muted">טופס קשור · {r.why}:</span>{' '}
          <button type="button" className="kn-link" onClick={() => onOpenForm(r.slug)}>{r.label} ←</button>
        </p>
      ))}
      <div className="fm-learn">
        {topics.map(t => (
          <button key={t.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onLearn(t.id)} data-fm-learn={t.id}>
            ללמוד לעומק: {t.title} ←
          </button>
        ))}
        {field.guidePage ? <span className="kn-xs kn-muted">בחוברת «דע זכויותיך וחובותיך» 2025: עמ׳ {field.guidePage - 2}</span> : null}
      </div>
    </article>
  );
}
