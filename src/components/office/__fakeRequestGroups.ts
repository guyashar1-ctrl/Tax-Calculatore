// ─── מסד מדומה · קבוצות קבועות, פרטי העסק ועבודה מהבית (05.10.2026) ─────────
// ‼ פיתוח בלבד (office-app). לקוח הדגמה אחד — יוסי אברהם (sample-3) — במצב שנמצא אצל
// לקוח אמיתי (אנונימי): ההרשמה לפייפרלס סומנה בידי המשרד, ההקמה 1 מתוך 5, אין שם עסק,
// «פרטי העסק» אצל הלקוח, העברת טיפול מרו״ח קודם שהחומרים בה עוד בדרך, ומסמכים שהושלמו —
// בלי מסלול מקושר (קליטה ישנה). כל הכתיבות בזיכרון בלבד; אותם כללים כמו 220 בשרת.
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { enrichClientsWithWorkspace } from '../../data/sampleClientWorkspace';
import { clientToDb } from '../../lib/dbMappers';
import { validateHomeOffice, roomRatioPercent, HOME_OFFICE_CAP_PERCENT } from '../../features/requests/homeOffice';

type Row = Record<string, unknown>;

export const RG_CLIENT = 'sample-3';
export const RG_TOKEN = 'demo3';
const ENG = 'eng-yossi';
const DAY = 60 * 24;
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

/** שדות כרטיס שנכתבו בהדגמה (snake_case) — מעל נתוני הדוגמה. */
const clientPatch: Record<string, Row> = {};
let clientUpdatedAt: Record<string, string> = {};

export function seedRequestGroupsDemo(tables: Record<string, Row[]>, firmId: string) {
  const st = (id: string, step_type: string, status: string, ball: string, extra: Row = {}): Row => ({
    id, user_id: firmId, engagement_id: ENG, client_id: RG_CLIENT, step_type, status, ball,
    track: 'tools', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false,
    payload: {}, completion_method: 'manual', completed_at: null, verified_at: null,
    published_at: iso(DAY * 60), sort_order: null, created_at: iso(DAY * 60), updated_at: iso(DAY * 5), ...extra,
  });
  (tables.engagements ??= []).push({
    id: ENG, user_id: firmId, client_id: RG_CLIENT, quotation_id: null, status: 'onboarding',
    monthly_total: 350, billing_start_month: '2026-09', approved_at: iso(DAY * 61), process_published_at: iso(DAY * 60),
    created_at: iso(DAY * 61), updated_at: iso(DAY * 61),
  });
  (tables.onboarding_steps ??= []).push(
    st('y-pl1', 'paperless_invite', 'completed', 'client', { sort_order: 10, completion_method: 'manual', completed_at: iso(90),
      payload: { paperlessStatus: 'none', dataSource: 'none', clientTitle: 'הרשמה לפייפרלס' } }),
    st('y-bd', 'business_details', 'pending', 'client', { sort_order: 11, created_at: iso(DAY * 60 - 1),
      payload: { clientTitle: 'פרטי העסק', clientSub: 'שם העסק ושאלה קצרה על עבודה מהבית', openedWith: 'paperless_invite' } }),
    st('y-pl2', 'paperless_connection', 'pending', 'me', { sort_order: 12, depends_on_step_id: 'y-pl1', updated_at: iso(60),
      payload: { paperlessStatus: 'none', dataSource: 'none', checklist: [
        { key: 'id_number', label: 'הזנת מספר הזהות של הלקוח בפייפרלס', done: true },
        { key: 'business_name', label: 'הזנת שם העסק ולחיצה על שמור', done: false },
        { key: 'pull_dealers', label: 'ביצוע משיכת עוסקים', done: false },
        { key: 'retainer_card', label: 'עדכון הריטיינר שסוכם לתשלום בכרטיס אשראי', done: false },
        { key: 'card_entered', label: 'הלקוח הזין כרטיס אשראי בפייפרלס', done: false },
      ] } }),
    st('y-pl3', 'retainer_authorization', 'locked', 'me', { sort_order: 13, track: 'payment', scope: 'engagement',
      depends_on_step_id: 'y-pl2', payload: { amount: 350, billingStartMonth: '2026-09' } }),
    st('y-prev', 'prev_accountant_details', 'completed', 'client', { sort_order: 20, track: 'prev_accountant', completed_at: iso(DAY * 50) }),
    st('y-rel', 'release_letter', 'completed', 'me', { sort_order: 21, track: 'prev_accountant', depends_on_step_id: 'y-prev',
      completed_at: iso(DAY * 40), payload: { sentAt: iso(DAY * 45) } }),
    st('y-mat', 'materials_received', 'waiting_client', 'prev_accountant', { sort_order: 22, track: 'prev_accountant',
      depends_on_step_id: 'y-rel', payload: { checklist: [
        { key: 'last_return', label: 'דוח שנתי אחרון', done: true },
        { key: 'ledger', label: 'כרטסת הנהלת חשבונות', done: false },
      ] } }),
    // סבב 2 · ייצוג: הבקשה הושלמה (היסטוריה), ובקשת ב"ל לבת הזוג נפתחה אחריה — אותה קבוצה.
    st('y-rep', 'representation', 'completed', 'me', { sort_order: 40, track: 'authorities', completed_at: iso(DAY * 35),
      payload: { representationRequestId: 'rr-yossi' } }),
    st('y-ni-sp', 'authority_representation', 'waiting_client', 'client', { sort_order: 41, track: 'authorities',
      created_at: iso(DAY * 3), updated_at: iso(DAY * 3),
      payload: { authority: 'national_insurance', subjectRole: 'spouse', subjectName: 'שרה', title: 'ייצוג בביטוח לאומי - שרה' } }),
    st('y-docs', 'client_documents', 'completed', 'client', { sort_order: 30, completed_at: iso(DAY * 30), payload: {
      checklist: [{ key: 'id_card', label: 'צילום תעודת זהות', done: true }, { key: 'bank', label: 'אישור ניהול חשבון בנק', done: true }] } }),
  );
  tables.client_home_office_answers ??= [];
  tables.client_home_office_approvals ??= [];
}

const sampleRow = (id: string): Row | null => {
  const c = enrichClientsWithWorkspace(SAMPLE_CLIENTS).find(x => x.id === id);
  return c ? { ...clientToDb(c), id } : null;
};
const clientRow = (id: string): Row | null => {
  const base = sampleRow(id);
  return base ? { ...base, ...clientPatch[id], updated_at: clientUpdatedAt[id] ?? base.updated_at } : null;
};
const businessNameOf = (id: string): string | null => {
  const v = (clientRow(id) ?? {}).business_name;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

let seq = 0;
const state = (tables: Record<string, Row[]>, clientId: string) => ({
  answers: tables.client_home_office_answers.filter(a => a.client_id === clientId).sort((a, b) => Number(b.seq) - Number(a.seq)),
  approvals: tables.client_home_office_approvals.filter(a => a.client_id === clientId).sort((a, b) => Number(b.seq) - Number(a.seq)),
});
const openBd = (tables: Record<string, Row[]>, clientId: string) => tables.onboarding_steps
  .filter(s => s.client_id === clientId && s.step_type === 'business_details' && !['completed', 'verified', 'skipped', 'cancelled'].includes(String(s.status)))
  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

/** אותו כלל כמו _settle_business_details_step (220). */
function settle(tables: Record<string, Row[]>, clientId: string, actor: 'client' | 'accountant'): string | null {
  const s = openBd(tables, clientId);
  if (!s) return null;
  const { answers, approvals } = state(tables, clientId);
  const a = answers[0];
  if (!a) return 'unanswered';
  const appr = approvals.some(x => x.answers_id === a.id);
  const t = new Date().toISOString();
  if (businessNameOf(clientId) && (a.has_dedicated_room === false || appr)) {
    Object.assign(s, { status: 'completed', ball: 'me', completed_at: t, updated_at: t,
      completion_method: actor === 'client' ? 'system' : 'manual' });
    return 'completed';
  }
  Object.assign(s, { status: 'in_progress', ball: 'me', updated_at: t,
    payload: { ...(s.payload as Row), answersAt: a.created_at, answersSource: a.source } });
  return 'in_progress';
}

function insertAnswers(tables: Record<string, Row[]>, clientId: string, source: 'client' | 'office', data: Row): string | null {
  const v = validateHomeOffice({
    hasDedicatedRoom: typeof data.hasDedicatedRoom === 'boolean' ? data.hasDedicatedRoom : null,
    totalRooms: (data.totalRooms ?? null) as number | null, businessRooms: (data.businessRooms ?? null) as number | null, note: (data.note ?? null) as string | null,
  });
  if (!v.ok) return v.error;
  const id = `hoa-${++seq}`;
  tables.client_home_office_answers.push({
    id, seq, client_id: clientId, step_id: openBd(tables, clientId)?.id ?? null, source,
    has_dedicated_room: v.value.hasDedicatedRoom, total_rooms: v.value.totalRooms, business_rooms: v.value.businessRooms,
    ratio_percent: roomRatioPercent(v.value.totalRooms, v.value.businessRooms), note: v.value.note,
    created_at: new Date().toISOString(),
  });
  return null;
}

/** הדף האישי של יוסי — אותם מפתחות וסדר כמו build_client_portal (216 + 220). */
export function rgPortal(tables: Record<string, Row[]>, firmName: string): Row {
  const steps = tables.onboarding_steps.filter(s => s.client_id === RG_CLIENT && s.status !== 'cancelled');
  const by = (t: string) => steps.find(s => s.step_type === t);
  const items: Row[] = [];
  const inv = by('paperless_invite');
  if (inv) items.push(inv.status === 'completed' ? { bucket: 'done', key: 'paperless_signup', label: 'הרשמה לפייפרלס' }
    : { bucket: 'action', key: 'paperless_signup', label: 'הרשמה לפייפרלס', kind: 'paperless_signup', actionKind: 'portal', actionValue: inv.id,
      needsBusinessName: true, businessName: businessNameOf(RG_CLIENT), cta: 'נרשמתי לפייפרלס' });
  const bd = openBd(tables, RG_CLIENT) ?? steps.filter(s => s.step_type === 'business_details').slice(-1)[0];
  if (bd) {
    const a = state(tables, RG_CLIENT).answers[0];
    const ho = a ? { hasDedicatedRoom: a.has_dedicated_room, totalRooms: a.total_rooms, businessRooms: a.business_rooms, note: a.note } : undefined;
    if (bd.status === 'completed') items.push({ bucket: 'done', key: 'business_details', label: 'פרטי העסק' });
    else if (bd.ball !== 'client') items.push({ bucket: 'office', key: 'business_details', label: 'פרטי העסק',
      sub: 'קיבלנו את הפרטים ואנחנו בודקים אותם. אין צורך לעשות דבר כרגע.' });
    else items.push({ bucket: 'action', key: 'business_details', label: 'פרטי העסק',
      sub: businessNameOf(RG_CLIENT) && !a ? 'נשאר להשלים מידע על עבודה מהבית' : 'שם העסק ושאלה קצרה על עבודה מהבית',
      actionKind: 'portal', actionValue: bd.id, kind: 'business_details', businessName: businessNameOf(RG_CLIENT) ?? undefined,
      homeOffice: ho, cta: 'העברה למשרד' });
  }
  const conn = by('paperless_connection');
  if (conn) items.push(conn.status === 'completed' ? { bucket: 'done', key: 'paperless', label: 'חיבור לפייפרלס' }
    : conn.status === 'locked' ? { bucket: 'future', key: 'paperless_connect', label: 'חיבור לפייפרלס', sub: 'ייפתח אחרי: הרשמה לפייפרלס' }
    : { bucket: 'office', key: 'paperless_connect', label: 'חיבור לפייפרלס', sub: 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.' });
  const ret = by('retainer_authorization');
  if (ret) items.push(ret.status === 'locked'
    ? { bucket: 'future', key: 'retainer_future', label: 'הרשאת התשלום החודשי', sub: 'ייפתח אחרי: חיבור לפייפרלס' }
    : { bucket: 'office', key: 'retainer_info', label: 'החיוב החודשי', sub: 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו.' });
  items.push({ bucket: 'office', key: 'prev_accountant', label: 'קבלת החומרים מרואה החשבון הקודם',
    sub: 'שלחנו לרואה החשבון הקודם מכתב העברה. אין צורך לעשות דבר כרגע.' });
  items.push({ bucket: 'done', key: 'rep_done', label: 'ייצוג מול הרשויות', sub: 'פעיל' });
  items.push({ bucket: 'office', key: 'authrep_y-ni-sp', label: 'ייצוג בביטוח לאומי - שרה',
    sub: 'שלחנו לשרה הוראות לאישור הייצוג באתר ביטוח לאומי.' });
  items.push({ bucket: 'done', key: 'docs', label: 'מסמכים שביקשנו' });
  return { ok: true, clientFirstName: 'יוסי', firmName, branding: {}, done: items.filter(i => i.bucket === 'done').length,
    total: items.filter(i => i.bucket !== 'future').length, journeyStage: 'onboarding', items };
}

/** ה-RPC של 220 + update_client_fields לשם העסק. null ⇒ לא מטופל כאן. */
export function rgRpc(tables: Record<string, Row[]>, name: string, args: Row, firmName: string,
  logWrite: (what: string, detail?: unknown) => void): { data: unknown; error: null } | null {
  const ok = (data: unknown) => ({ data, error: null as null });
  const cid = String(args.p_client_id ?? '');
  if (name === 'get_home_office') return ok({ ok: true, ...state(tables, cid) });
  // ‼ אותו כלל כמו _paperless_setup_guard (220): ההקמה לא «הושלמה» לפני פרטי העסק / «הוזן בפייפרלס».
  if (name === 'advance_onboarding_step' && ['complete', 'verify'].includes(String(args.p_action))) {
    const st0 = tables.onboarding_steps.find(r => r.id === args.p_step_id);
    if (st0 && st0.step_type === 'paperless_connection' && !['completed', 'verified'].includes(String(st0.status))) {
      const c0 = String(st0.client_id);
      const bdOpen = tables.onboarding_steps.some(r => r.client_id === c0 && r.step_type === 'business_details'
        && !['completed', 'verified', 'skipped', 'cancelled'].includes(String(r.status)));
      const s0 = state(tables, c0);
      const notEntered = !!s0.approvals[0] && s0.approvals[0].answers_id === s0.answers[0]?.id && !s0.approvals[0].paperless_entered_at;
      if (bdOpen || notEntered) {
        logWrite('rpc.advance_onboarding_step BLOCKED', { stepId: st0.id });
        return { data: null, error: { message: bdOpen
          ? 'ההקמה בפייפרלס תסומן כהושלמה אחרי «פרטי העסק» — שם העסק ותשובה על עבודה מהבית (ואישור האחוז כשיש חדר). אפשר להמשיך בסעיפי ההקמה בינתיים.'
          : 'אחוז המשרד הביתי שאושר עוד לא סומן כמוזן בפייפרלס. מסמנים «הוזן בפייפרלס» ואז מסיימים את ההקמה.' } } as never;
      }
    }
    return null;
  }
  if (name === 'save_home_office_answers') {
    const err = insertAnswers(tables, cid, 'office', (args.p_data ?? {}) as Row);
    logWrite('rpc.save_home_office_answers', { clientId: cid, data: args.p_data, error: err });
    if (err) return ok({ ok: false, error: err });
    const step = settle(tables, cid, 'accountant');
    return ok({ ok: true, step, ...state(tables, cid) });
  }
  if (name === 'approve_home_office') {
    const s = state(tables, cid);
    const a = s.answers.find(x => x.id === args.p_answers_id);
    const pct = Number(args.p_percent);
    const res = (() => {
      if (!a) return { ok: false, error: 'answers_not_found' };
      if (s.answers[0]?.id !== a.id) return { ok: false, error: 'answers_changed', ...s };
      if (a.has_dedicated_room === false && pct !== 0) return { ok: false, error: 'no_room_percent' };
      if (!Number.isFinite(pct) || pct < 0) return { ok: false, error: 'percent_invalid' };
      if (pct > HOME_OFFICE_CAP_PERCENT) return { ok: false, error: 'percent_above_cap' };
      if (Math.round(pct * 10) !== pct * 10) return { ok: false, error: 'percent_precision' };
      if (!args.p_effective_from) return { ok: false, error: 'missing_effective_from' };
      tables.client_home_office_approvals.push({
        id: `hop-${++seq}`, seq, client_id: cid, answers_id: a.id, approved_percent: pct, effective_from: args.p_effective_from,
        note: args.p_note ?? null, approved_at: new Date().toISOString(), approved_by: 'test-firm', paperless_entered_at: null,
      });
      return { ok: true, step: settle(tables, cid, 'accountant'), ...state(tables, cid) };
    })();
    logWrite('rpc.approve_home_office', { clientId: cid, percent: pct, result: res.ok ? 'ok' : res.error });
    return ok(res);
  }
  if (name === 'confirm_home_office_in_paperless') {
    const x = tables.client_home_office_approvals.find(r => r.id === args.p_approval_id);
    if (!x) return ok({ ok: false, error: 'approval_not_found' });
    const s = state(tables, String(x.client_id));
    if (s.answers[0]?.id !== x.answers_id || s.approvals[0]?.id !== x.id) return ok({ ok: false, error: 'approval_not_current', ...s });
    if (!x.paperless_entered_at) x.paperless_entered_at = new Date().toISOString();
    logWrite('rpc.confirm_home_office_in_paperless', { approvalId: x.id });
    return ok({ ok: true, ...state(tables, String(x.client_id)) });
  }
  if (name === 'portal_submit_business_details') {
    if (args.p_token !== RG_TOKEN) return ok({ ok: false, error: 'invalid' });
    const s = tables.onboarding_steps.find(r => r.id === args.p_step_id && r.client_id === RG_CLIENT);
    if (!s || s.step_type !== 'business_details') return ok({ ok: false, error: 'step_not_found' });
    if (['completed', 'verified', 'skipped', 'cancelled'].includes(String(s.status))) return ok({ ok: true, noop: true });
    const d = (args.p_data ?? {}) as Row;
    const ho = (d.homeOffice ?? {}) as Row;
    const v = validateHomeOffice({ hasDedicatedRoom: typeof ho.hasDedicatedRoom === 'boolean' ? ho.hasDedicatedRoom : null,
      totalRooms: (ho.totalRooms ?? null) as number | null, businessRooms: (ho.businessRooms ?? null) as number | null });
    if (!v.ok) return ok({ ok: false, error: v.error });
    const biz = String(d.businessName ?? '').trim() || null;
    const cur = businessNameOf(RG_CLIENT);
    const expected = String(d.expectedBusinessName ?? '').trim() || null;
    if (!biz && !cur) return ok({ ok: false, error: 'missing_business_name' });
    if (biz && biz !== cur && expected !== cur) return ok({ ok: false, error: 'stale', businessName: cur });
    if (biz && biz !== cur) { clientPatch[RG_CLIENT] = { ...clientPatch[RG_CLIENT], business_name: biz }; clientUpdatedAt[RG_CLIENT] = new Date().toISOString(); }
    insertAnswers(tables, RG_CLIENT, 'client', ho);
    const step = settle(tables, RG_CLIENT, 'client');
    logWrite('rpc.portal_submit_business_details', { stepId: s.id, step });
    return ok({ ok: true, step });
  }
  if (name === 'get_client_portal' && args.p_token === RG_TOKEN) return ok(rgPortal(tables, firmName));
  if (name === 'get_client_portal_preview' && args.p_client_id === RG_CLIENT) return ok(rgPortal(tables, firmName));
  if (name === 'update_client_fields' && sampleRow(cid)) {
    const patch = (args.p_patch ?? {}) as Row;
    const nameChanged = 'business_name' in patch && patch.business_name !== (clientRow(cid) ?? {}).business_name;
    clientPatch[cid] = { ...clientPatch[cid], ...patch };
    clientUpdatedAt[cid] = new Date().toISOString();
    // ‼ כמו _clients_business_name_changed (220): שם שנוסף בתיק סוגר בקשה שחיכתה רק לו.
    if (nameChanged && businessNameOf(cid)) settle(tables, cid, 'accountant');
    logWrite('rpc.update_client_fields', { clientId: cid, patch, nameChanged });
    return ok({ ok: true, client: clientRow(cid) });
  }
  return null;
}

/** בדיקות בדפדפן: «המשרד שינה את השם בינתיים» (stale) — בלי לגעת בדף הפתוח. */
export function rgSetBusinessNameBehindPortal(name: string) {
  clientPatch[RG_CLIENT] = { ...clientPatch[RG_CLIENT], business_name: name };
  clientUpdatedAt = { ...clientUpdatedAt, [RG_CLIENT]: new Date().toISOString() };
}
