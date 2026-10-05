// ─── מסד מדומה · «תביעת מילואים בביטוח לאומי» (05.10.2026) ────────────────────
// ‼ פיתוח בלבד (office-app). כדי לבדוק את כל המסלול בלי מסד: הנוסח המוכן בספרייה, הכרטיס כפי
// שהשרת שולח אותו לדף (build_client_portal, 220 + 221), והתשובה (portal_submit_step, 208).
// ‼ הנוסח כאן זהה לנוסח ב-supabase/221-reserve-duty-claim.sql — בדיקת יחידה משווה את השניים.
// כל הכתיבות בזיכרון בלבד.

type Row = Record<string, unknown>;

export const RESERVE_DUTY_SEED_KEY = 'reserve_duty_claim';

/**
 * ה-payload של הנוסח המוכן — מילה במילה כמו בשרת (221). ‼ בלי פסיקים בתשובות: הקומפוזר מפצל לפי פסיק.
 * ‼ פונקציה ולא קבוע: קבוע ברמת המודול נשאר בחבילת הייצוג (המודול מיובא מקוד שרץ שם, ואף אחד לא קורא לו) —
 * ופונקציה שאין מי שקורא לה יורדת בבנייה. ההדגמה קוראת לה רק תחת FAKE_ACTIVE.
 */
export function reserveDutyPayload() {
  return {
    title: 'תביעת מילואים בביטוח לאומי',
    clientTitle: 'תביעת מילואים בביטוח לאומי',
    clientSub: 'בודקים שכל תקופות המילואים שולמו - ומגישים תביעה על מה שחסר',
    clientNote: 'ביטוח לאומי משלם לעצמאים תגמול מילואים לפי הדיווח של צה״ל, בדרך כלל בלי שצריך להגיש תביעה. כדאי לוודא באזור האישי שכל תקופה ששירתם מופיעה ושולמה - ואם תקופה חסרה, להגיש עליה תביעה. אם המערכת לא מאפשרת להגיש - פונים דרך «צור קשר». המדריך המצולם מראה כל לחיצה.',
    clientNoteAfter: 'עבדתם גם כשכירים? ההגשה אצלכם בטופס 502 המקוון - הפרטים והקישור בצעד האחרון של המדריך.',
    clientPhotoGuide: 'reserve_duty_claim',
    requirements: [{
      key: 'outcome', kind: 'select', label: 'מה מצאתם באזור האישי?', done: false,
      options: [
        'כל תקופות המילואים מופיעות - לא היה צריך להגיש',
        'חסרה תקופה - הגשתי עליה תביעה',
        'המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»',
        'עבדתי גם כשכיר/ה - הגשתי בטופס 502',
      ],
    }],
  };
}

/** שורת journey_templates המובנית (office_id = null) — כמו ה-insert ב-221. */
export function reserveDutyTemplateRow(): Row {
  return {
    id: 'jt6', name: 'תביעת מילואים בביטוח לאומי',
    description: 'הלקוח בודק באזור האישי בביטוח לאומי שכל תקופות המילואים שולמו, ומגיש תביעה על תקופה חסרה - עם מדריך מצולם',
    kind: 'request', office_id: null, seed_key: RESERVE_DUTY_SEED_KEY,
    entries: [{ key: 'e1', stepType: 'custom_request', owner: 'client', requiredForClose: false, payload: reserveDutyPayload() }],
  };
}

type Req = { key?: unknown; kind?: unknown; label?: unknown; done?: unknown; required?: unknown; options?: unknown; value?: unknown };
const CLOSED = ['completed', 'verified', 'skipped', 'cancelled'];

/**
 * בקשה חופשית של לקוח ההדגמה שיש בה דרישות — כפי ש-build_client_portal שולח אותה לדף (ענף custom_request).
 * פתוחה ⇒ כרטיס פעולה (kind 'custom'); הושלמה ⇒ «הושלם». null ⇒ לא בקשה כזו (נשארת כמו היום).
 */
export function reserveDutyPortalItem(step: Row, label: string): Row | null {
  const p = (step.payload ?? {}) as Row;
  const reqs = Array.isArray(p.requirements) ? (p.requirements as Req[]) : [];
  if (step.step_type !== 'custom_request' || reqs.length === 0) return null;
  if (CLOSED.includes(String(step.status))) return { bucket: 'done', key: `custom_${step.id}`, label };
  const required = reqs.filter(r => r.required !== false);
  const done = required.filter(r => r.done === true).length;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  // ‼ כמו jsonb_strip_nulls בשרת: שדה בלי ערך אינו קיים בפריט.
  return stripUndefined({
    bucket: 'action', key: `custom_${step.id}`, label,
    sub: required.length > 1 ? `${done} מתוך ${required.length} הושלמו` : str(p.clientSub),
    actionKind: 'portal', actionValue: String(step.id), kind: 'custom', cta: str(p.clientCta),
    note: str(p.clientNote), noteAfter: str(p.clientNoteAfter),
    // ‼ 221 · המפתח בלבד — כמו בשרת. מפתח ריק ⇒ אין שדה.
    photoGuide: str(p.clientPhotoGuide),
    requirements: reqs.map(r => ({
      key: r.key, kind: r.kind, label: r.label, done: r.done === true, required: r.required !== false,
      ...(Array.isArray(r.options) ? { options: r.options } : {}), ...(str(r.value) ? { value: r.value } : {}),
    })),
  });
}

function stripUndefined(o: Row): Row {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * portal_submit_step לבקשה חופשית — כמו 208: דרישה מסוג בחירה עם ערך מהאפשרויות ⇒ done + value;
 * ערך אחר ⇒ bad_choice; אין דרישות חובה פתוחות ⇒ completed, ball 'me', completed_at.
 * ‼ הפתיחה של המדריך או של הקישור אינה קריאה לכאן — רק תשובה של הלקוח.
 */
export function reserveDutySubmit(step: Row, data: Row): Row {
  const reqs = (((step.payload ?? {}) as Row).requirements ?? []) as Req[];
  const key = String(data.key ?? '').trim();
  if (!key) return { ok: false, error: 'missing_key' };
  if (CLOSED.includes(String(step.status))) return { ok: true, noop: true };
  const req = reqs.find(r => r.key === key);
  if (!req) return { ok: false, error: 'requirement_not_found' };
  const value = String(data.value ?? '').trim();
  if (req.kind !== 'confirm' && !value) return { ok: false, error: 'missing_value' };
  if (req.kind === 'select' && !(Array.isArray(req.options) && (req.options as unknown[]).includes(value))) {
    return { ok: false, error: 'bad_choice' };
  }
  const t = new Date().toISOString();
  const next = reqs.map(r => (r.key === key ? { ...r, done: true, ...(value ? { value } : {}), doneAt: t } : r));
  const open = next.filter(r => r.required !== false && r.done !== true).length;
  Object.assign(step, {
    payload: { ...(step.payload as Row), requirements: next },
    status: open === 0 ? 'completed' : 'waiting_client', ball: open === 0 ? 'me' : 'client',
    completed_at: open === 0 ? t : step.completed_at, updated_at: t,
  });
  return { ok: true, remaining: open, completed: open === 0 };
}
