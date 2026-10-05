#!/usr/bin/env node
/**
 * verify-222-body.mjs — מיגרציה 222: הפונקציות שנגזרות מגוף שכבר בייצור נגזרות בסקריפט, לא בעין.
 *
 * ‼ למה: 222 מוציאה את ענפי הסוגים של build_client_portal (המקור של הדף של כל לקוח) לפונקציה משותפת,
 *   ומוציאה את הנוסחים שהלקוח רואה מהיוצרים (אישור הייצוג, המחולל) לפונקציות payload. עותק ידני שהחמיץ
 *   שורה אחת היה משנה בשקט מה שלקוחות רואים. כאן כל קטע גנרי נגזר מהמקור שהוחל (221, 216, 217) בשינויים
 *   מכניים וסופרים, והקובץ 222 חייב להכיל בדיוק את מה שנגזר. ההוכחה ההתנהגותית — scripts/qa-222-identity.mjs.
 *
 * שימוש:
 *   node scripts/verify-222-body.mjs           בודק שהאזורים שבין סימוני GENERATED ב-222 == מה שנגזר מהמקורות
 *   node scripts/verify-222-body.mjs --write   כותב את האזורים (אחרי שינוי בגזירה)
 *   node scripts/verify-222-body.mjs --live staging|prod   מוודא שהגוף החי של הפונקציות שנוגעים בהן == המקור שנגזר ממנו
 *                                              (לפני ההחלה: ששום סטייה לא נוספה מאז; ‼ ייצור — קריאה בלבד)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_222 = 'supabase/222-request-preview.sql';
export const SOURCES = {
  portal: 'supabase/221-reserve-duty-claim.sql',
  generator: 'supabase/216-flows-onboarding-integration.sql',
  approval: 'supabase/217-requests-integrity.sql',
};
const norm = (s) => s.replace(/\r\n/g, '\n');
const read = (f) => norm(readFileSync(resolve(ROOT, f), 'utf8'));

/** ההגדרה המלאה של פונקציה בקובץ: {head, body, tag, start, end} — head עד ‏AS $tag$ כולל, body בין התגים. */
export function fnDef(text, name) {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'gi');
  const heads = [...text.matchAll(re)];
  if (heads.length !== 1) throw new Error(`נמצאו ${heads.length} הגדרות של ${name} (מצופה: 1)`);
  const start = heads[0].index;
  const m = /\bas\s+(\$[A-Za-z_]*\$)\n/i.exec(text.slice(start));
  if (!m) throw new Error(`AS $tag$ של ${name} לא נמצא`);
  const tag = m[1];
  const bodyStart = start + m.index + m[0].length;
  const bodyEnd = text.indexOf(tag, bodyStart);
  if (bodyEnd < 0) throw new Error(`סוף הפונקציה ${name} לא נמצא`);
  return { head: text.slice(start, bodyStart), body: text.slice(bodyStart, bodyEnd), tag, start, end: bodyEnd + tag.length };
}

/** החלפה מדויקת: הקטע חייב להופיע פעם אחת בדיוק (אחרת — השינוי לא מתאים למקור ועוצרים). */
function replaceOnce(text, from, to, label) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: הקטע נמצא ${n} פעמים (מצופה: 1)`);
  return text.replace(from, () => to);
}
function replaceAll(text, from, to, expected, label) {
  const n = text.split(from).length - 1;
  if (n !== expected) throw new Error(`${label}: הקטע נמצא ${n} פעמים (מצופה: ${expected})`);
  return text.split(from).join(to);
}
/** הקטע בין שני סימנים (כולל הראשון, בלי השני). */
function between(text, a, b, label) {
  const i = text.indexOf(a);
  if (i < 0 || text.indexOf(a, i + 1) >= 0) throw new Error(`${label}: סימן ההתחלה לא ייחודי`);
  const j = text.indexOf(b, i);
  if (j < 0) throw new Error(`${label}: סימן הסיום לא נמצא`);
  return { text: text.slice(i, j), i, j };
}

// ─── build_client_portal → _portal_rep_item + _portal_step_items + build_client_portal ──────────

const STEP_ITEMS_DECLARE = `declare
  v_items      jsonb := '[]'::jsonb;
  v_rep_item   jsonb := p_rep_item;
  v_rep_seen   boolean := false;
  v_prev_open  boolean := false;
  v_prev_done  boolean := false;
  -- ‼ 222 · התוצאה אינה נושאת את דגלי draft/removing/edited של התצוגה המקדימה (הקוד הקודם דילג עליהם ב-continue).
  v_skip_flags boolean := false;
  v_invite_url text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url    text;
  v_res_key    text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list   jsonb;
  v_res_out    jsonb;
  v_ck_done    int;
  v_ck_total   int;
  v_label      text;
  v_sub        text;
  v_reqs       jsonb;
  v_rq_done    int;
  v_rq_total   int;
  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה
  v_rep_approvals jsonb;
  v_rep_req_sub text;
  -- 220 · פרטי העסק
  v_ho         jsonb;
`;

/** מהגוף של build_client_portal (221) לשלוש הפונקציות. מחזיר {repItem, stepItems, build} — טקסט SQL מלא לכל אחת. */
export function derivePortal(src221) {
  const fn = fnDef(src221, 'build_client_portal');
  const body = fn.body;

  // ── בלוק הייצוג ─────────────────────────────────────────────────────────
  const repStart = '  if req.id is not null then\n    if req.status = \'pending_fill\' then\n';
  const repEnd = '\n  end if;\n\n  for s in\n';
  const rep = between(body, repStart, repEnd, 'בלוק הייצוג');
  const repBlock = rep.text; // כולל «  if req.id is not null then … ‏    end if;»

  // ── ענפי הסוגים ─────────────────────────────────────────────────────────
  const caseStart = '    case s.step_type\n';
  const caseEnd = '\n    end case;\n';
  const cs = between(body, caseStart, caseEnd, 'ענפי הסוגים');
  let caseBlock = cs.text + '\n    end case;\n';

  // תפר 1: «התחבר מחדש ב-continue» — כל continue הופך ליציאה מהבלוק; בענף identity נוסף דגל «בלי דגלי תצוגה».
  const identityTail = '        end if;\n        continue;\n      end if;\n      v_reqs := coalesce(s.payload->\'requirements\', \'[]\'::jsonb);\n';
  caseBlock = replaceOnce(caseBlock, identityTail,
    '        end if;\n        v_skip_flags := true;\n        exit step_body;\n      end if;\n      v_reqs := coalesce(s.payload->\'requirements\', \'[]\'::jsonb);\n',
    'continue של identity');
  caseBlock = replaceAll(caseBlock, 'continue;', 'exit step_body;', 6, 'continue');

  // תפר 2: סיבת הנעילה — עוברת דרך ההקשר כשהוא נושא אותה (בצפייה: «ייפתח אחרי …» לדוגמה).
  caseBlock = replaceAll(caseBlock, 'coalesce(public.portal_lock_reason(s.id), ',
    'coalesce(p_ctx->>\'lockReason\', public.portal_lock_reason(s.id), ', 5, 'portal_lock_reason בתוך coalesce');
  caseBlock = replaceAll(caseBlock, '\'sub\', public.portal_lock_reason(s.id)',
    '\'sub\', coalesce(p_ctx->>\'lockReason\', public.portal_lock_reason(s.id))', 6, 'portal_lock_reason ישיר');
  if (/public\.portal_lock_reason\(s\.id\)/.test(caseBlock.replace(/p_ctx->>'lockReason', public\.portal_lock_reason\(s\.id\)/g, ''))) {
    throw new Error('נשארה קריאה ל-portal_lock_reason בלי ההקשר');
  }

  // תפר 3: «מי מאשר ואת מה» — מההקשר כשהוא נושא אותו.
  caseBlock = replaceOnce(caseBlock,
    '          v_rep_approvals := nullif(public._rep_approval_people(c.id), \'[]\'::jsonb);\n',
    '          v_rep_approvals := nullif(case when p_ctx ? \'approvals\' then p_ctx->\'approvals\'\n                                         else public._rep_approval_people(c.id) end, \'[]\'::jsonb);\n',
    'approvals');

  // תפר 4: התשובות על עבודה מהבית — מההקשר כשהוא נושא אותן.
  const hoOrig = `      select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,
               'totalRooms', a.total_rooms, 'businessRooms', a.business_rooms, 'note', a.note)
        into v_ho
        from public.client_home_office_answers a where a.client_id = c.id
       order by a.seq desc limit 1;
`;
  const hoNew = `      if p_ctx ? 'homeOffice' then
        v_ho := p_ctx->'homeOffice';
      else
        select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,
                 'totalRooms', a.total_rooms, 'businessRooms', a.business_rooms, 'note', a.note)
          into v_ho
          from public.client_home_office_answers a where a.client_id = c.id
         order by a.seq desc limit 1;
      end if;
`;
  caseBlock = replaceOnce(caseBlock, hoOrig, hoNew, 'עבודה מהבית');

  // ── אימות: כל משתנה v_ בענפים מוצהר, ואין התייחסות למשתנים של build_client_portal ──
  const declared = new Set([...STEP_ITEMS_DECLARE.matchAll(/^\s+(v_\w+)\s/gm)].map((m) => m[1]));
  const used = new Set([...caseBlock.matchAll(/\bv_\w+\b/g)].map((m) => m[0]));
  const missing = [...used].filter((v) => !declared.has(v));
  if (missing.length) throw new Error(`משתנים בענפים שלא הוצהרו ב-_portal_step_items: ${missing.join(', ')}`);
  for (const bad of ['p_mode', 'v_cur', 'v_first', 'v_has_eng', 'v_published', 'v_quote_open', 'v_returning_intake', 'v_before', 'v_stage', 'v_done', 'v_total']) {
    if (new RegExp(`\\b${bad}\\b`).test(caseBlock)) throw new Error(`הענפים מתייחסים ל-${bad}, שאינו זמין ב-_portal_step_items`);
  }

  // ── _portal_rep_item ────────────────────────────────────────────────────
  const repItem = `create or replace function public._portal_rep_item(req public.representation_requests)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rep_item jsonb := null;
  v_sign_token text;
  v_spouse_pending boolean := false;
begin
${repBlock}
  end if;
  return v_rep_item;
end;
$function$;`;

  // ── _portal_step_items ──────────────────────────────────────────────────
  const stepItems = `create or replace function public._portal_step_items(
  s public.onboarding_steps, c public.clients, p public.profiles, req public.representation_requests,
  p_rep_item jsonb, p_ctx jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
${STEP_ITEMS_DECLARE}begin
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  <<step_body>>
  begin
${caseBlock}  end step_body;
  return jsonb_build_object('items', v_items, 'repSeen', v_rep_seen, 'prevOpen', v_prev_open,
                            'prevDone', v_prev_done, 'skipFlags', v_skip_flags);
end;
$function$;`;

  // ── build_client_portal החדשה ───────────────────────────────────────────
  let nb = body;
  // הצהרות: s נהיה שורה מוקלדת (כדי לעבור לפונקציה), נוסף v_r, ויוצאים משתנים שעברו.
  nb = replaceOnce(nb, '  s        record;\n', '  s        public.onboarding_steps%rowtype;\n  v_r      jsonb;\n', 's record');
  for (const drop of [
    '  v_sign_token text;\n', '  v_spouse_pending boolean := false;\n', '  v_invite_url text;\n',
    '  v_res_key   text;\n', '  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.\n  v_res_url   text;\n',
    '  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.\n  v_res_list  jsonb;\n  v_res_out   jsonb;\n',
    '  v_ck_done int;\n  v_ck_total int;\n', '  v_label  text;\n  v_sub    text;\n',
    '  v_reqs   jsonb;\n  v_rq_done int;\n  v_rq_total int;\n',
    '  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה\n  v_rep_approvals jsonb;\n  v_rep_req_sub text;\n',
    '  -- 220 · פרטי העסק\n  v_ho     jsonb;\n',
  ]) nb = replaceOnce(nb, drop, '', `הצהרה: ${drop.trim().slice(0, 30)}`);
  // v_invite_url עבר ל-_portal_step_items.
  nb = replaceOnce(nb, `  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.
`, '', 'v_invite_url');
  // הייצוג.
  nb = replaceOnce(nb, repBlock + '\n  end if;\n', '  v_rep_item := public._portal_rep_item(req);\n', 'בלוק הייצוג');
  // «קבלת החומרים מרואה החשבון הקודם» — אותו נוסח בדף ובצפייה: פונקציה אחת.
  const prevBlock = `  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;
`;
  nb = replaceOnce(nb, prevBlock, '  v_items := v_items || public._portal_prev_items(v_prev_open, v_prev_done);\n', 'בלוק רו"ח קודם');
  // הענפים.
  const call = `    v_r := public._portal_step_items(s, c, p, req, v_rep_item, '{}'::jsonb);
    v_items := v_items || (v_r->'items');
    v_rep_seen := v_rep_seen or coalesce((v_r->>'repSeen')::boolean, false);
    v_prev_open := v_prev_open or coalesce((v_r->>'prevOpen')::boolean, false);
    v_prev_done := v_prev_done or coalesce((v_r->>'prevDone')::boolean, false);
    -- ‼ 222 · בענף צילום התעודה (identity) הקוד הקודם דילג על דגלי draft/removing/edited — נשמר כך.
    if coalesce((v_r->>'skipFlags')::boolean, false) then
      continue;
    end if;
`;
  nb = replaceOnce(nb, cs.text + '\n    end case;\n', call.replace(/\n$/, '') + '\n', 'ענפי הסוגים');

  const build = `${fn.head}${nb}${fn.tag};`;
  const prevItems = `create or replace function public._portal_prev_items(p_open boolean, p_done boolean)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_items jsonb := '[]'::jsonb;
  v_prev_open boolean := coalesce(p_open, false);
  v_prev_done boolean := coalesce(p_done, false);
begin
${prevBlock}  return v_items;
end;
$function$;`;
  return { repItem, stepItems, build, prevItems };
}

// ─── יוצרים → פונקציות payload ─────────────────────────────────────────────

const APPROVAL_TPL_SELECT = `  -- 186: נוסח המשרד ל"הסבר"/שורת-משנה/קישור, אם קיים. title/cta/linkUrl
  -- קבועים למטה ואינם נקראים מכאן — system-owned.
  select settings -> 'representation' -> 'templates' -> 'portalCard' into v_tpl
    from public.profiles where id = c.user_id;

`;

/** מ-217: ensure_rep_client_approval_step / shaam_require_client_approval → שתי פונקציות payload + היוצרים החדשים. */
export function deriveApproval(src217) {
  const ens = fnDef(src217, 'ensure_rep_client_approval_step');
  const payloadStart = '     jsonb_build_object(\n       \'clientTitle\', \'זירוז אישור הייצוג באזור האישי\',';
  const payloadEnd = '\'clientLinkLabel\', coalesce(nullif(v_tpl ->> \'linkLabel\', \'\'), \'לכניסה לאזור האישי\'))';
  const pi = ens.body.indexOf(payloadStart);
  const pj = ens.body.indexOf(payloadEnd);
  if (pi < 0 || pj < 0 || ens.body.indexOf(payloadStart, pi + 1) >= 0) throw new Error('payload של ensure_rep_client_approval_step לא נמצא כמצופה');
  const payloadExpr = ens.body.slice(pi + 5, pj + payloadEnd.length); // בלי 5 רווחי ההזחה הראשונים — מתחיל ב-jsonb_build_object(
  let ensBody = ens.body;
  ensBody = replaceOnce(ensBody, APPROVAL_TPL_SELECT, '', 'v_tpl בבחירה');
  ensBody = replaceOnce(ensBody, '  v_tpl  jsonb;\n', '', 'v_tpl הצהרה');
  ensBody = replaceOnce(ensBody, ens.body.slice(pi, pj + payloadEnd.length), '     public._rep_client_approval_payload(c.user_id)', 'payload ב-insert');

  const approvalPayload = `create or replace function public._rep_client_approval_payload(p_user_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tpl  jsonb;
begin
${APPROVAL_TPL_SELECT.replace('c.user_id', 'p_user_id')}  return ${payloadExpr};
end;
$function$;`;

  const req = fnDef(src217, 'shaam_require_client_approval');
  const patchStart = '         payload = payload || jsonb_build_object(\n           \'requiredBy\', \'shaam\',';
  const patchEnd = '\'בלי האישור הזה רשות המסים לא תקלוט את הייצוג, והטיפול מולה לא יוכל להתקדם.\'),\n         updated_at = now()';
  const qi = req.body.indexOf(patchStart);
  const qj = req.body.indexOf(patchEnd);
  if (qi < 0 || qj < 0 || req.body.indexOf(patchStart, qi + 1) >= 0) throw new Error('הטלאי של shaam_require_client_approval לא נמצא כמצופה');
  const patchExpr = req.body.slice(qi + '         payload = '.length, qj + patchEnd.length - '),\n         updated_at = now()'.length) + ')';
  let patchFn = patchExpr;
  patchFn = replaceAll(patchFn, 'payload -> ', 'p_payload -> ', 3, 'payload ->');
  patchFn = replaceOnce(patchFn, 'public._rep_approval_people(p_client_id)', 'p_people', 'people');
  patchFn = replaceOnce(patchFn, 'payload || jsonb_build_object(', 'p_payload || jsonb_build_object(', 'payload ||');
  const requiredPayload = `create or replace function public._rep_client_approval_required_payload(p_payload jsonb, p_people jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  return ${patchFn};
end;
$function$;`;
  const reqBody = replaceOnce(req.body, req.body.slice(qi, qj + patchEnd.length - '\n         updated_at = now()'.length),
    '         payload = public._rep_client_approval_required_payload(payload, public._rep_approval_people(p_client_id)),', 'טלאי ב-update');

  return {
    approvalPayload, requiredPayload,
    ensure: `${ens.head}${ensBody}${ens.tag};`,
    require: `${req.head}${reqBody}${req.tag};`,
  };
}

/** מ-216: המחולל קורא לפונקציית payload אחת לשישה סוגים; הנוסחים יושבים בה. */
export function deriveGenerator(src216) {
  const g = fnDef(src216, 'generate_onboarding_steps');
  let body = g.body;
  const blocks = {};
  const take = (label, from, to) => {
    const n = body.split(from).length - 1;
    if (n !== 1) throw new Error(`המחולל — ${label}: הקטע נמצא ${n} פעמים (מצופה: 1)`);
    blocks[label] = from;
    body = body.replace(from, () => to);
  };

  take('client_documents', `             jsonb_build_object(
               'checklist', v_docs,
               'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
               'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
               'clientCta', 'להעלאה'),
`, `             public._onboarding_system_payload('client_documents', jsonb_build_object('checklist', v_docs)),
`);
  take('prev_accountant_details', `                 case when v_needs_prevdet then jsonb_build_object(
                   'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                   'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                   'clientCta', 'למילוי')
                 else jsonb_build_object(
                   'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                   'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                   'clientCta', 'לאישור') end)
`, `                 public._onboarding_system_payload('prev_accountant_details', jsonb_build_object('needsDetails', v_needs_prevdet)))
`);
  take('paperless_invite', `               jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                  'dataSource','unknown',
                                  'clientTitle','הרשמה לפייפרלס',
                                  'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                  'clientCta','נרשמתי לפייפרלס'),
`, `               public._onboarding_system_payload('paperless_invite', jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'))),
`);
  take('paperless_connection', `               jsonb_build_object(
                 'clientTitle', 'חיבור לפייפרלס',
                 'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'),
`, `               public._onboarding_system_payload('paperless_connection'),
`);
  const taStart = `             jsonb_build_object(
               'clientTitle', 'חיבור פייפרלס לרשות המסים',`;
  const ti = body.indexOf(taStart);
  const taEndMark = `'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'),\n`;
  const tj = body.indexOf(taEndMark, ti);
  if (ti < 0 || tj < 0) throw new Error('המחולל — paperless_tax_authority לא נמצא כמצופה');
  take('paperless_tax_authority', body.slice(ti, tj + taEndMark.length),
    `             public._onboarding_system_payload('paperless_tax_authority'),\n`);
  take('retainer_authorization', `               jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month,
                                  'clientTitle', 'להזין אמצעי תשלום',
                                  'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                  'clientCta', 'להזנה')
`, `               public._onboarding_system_payload('retainer_authorization', jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month))
`);

  // הפונקציה החדשה — הנוסחים נגזרים מהבלוקים המקוריים (העתקה מכנית, לא הקלדה).
  const lit = (label) => blocks[label].replace(/^\s+/, '').replace(/,\n$/, '').replace(/\n$/, '');
  const prevBlock = blocks.prev_accountant_details.replace(/\) end\)\n$/, ')').replace(/^\s*case when v_needs_prevdet then /, '');
  const [prevYes, prevNo] = prevBlock.split(/\n\s*else /);
  const fnText = `create or replace function public._onboarding_system_payload(p_step_type text, p_inputs jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_docs jsonb := coalesce(p_inputs->'checklist', '[]'::jsonb);
begin
  case p_step_type
    when 'client_documents' then
      return ${lit('client_documents')};
    when 'prev_accountant_details' then
      return case when coalesce((p_inputs->>'needsDetails')::boolean, false) then ${prevYes.trim()}
                  else ${prevNo.trim()} end;
    when 'paperless_invite' then
      return ${lit('paperless_invite').replace(`coalesce(v_client.paperless_status,'unknown')`, `coalesce(p_inputs->>'paperlessStatus','unknown')`)};
    when 'paperless_connection' then
      return ${lit('paperless_connection')};
    when 'paperless_tax_authority' then
      return ${lit('paperless_tax_authority')};
    when 'retainer_authorization' then
      return ${lit('retainer_authorization').replace(`'amount', e.monthly_total, 'billingStartMonth', e.billing_start_month`, `'amount', p_inputs->'amount', 'billingStartMonth', p_inputs->'billingStartMonth'`)};
    else
      return null;
  end case;
end;
$function$;`;
  // הביטויים המקוריים כפי שהיו בתוך המחולל — scripts/qa-222-identity.mjs מריץ אותם מול הפונקציה החדשה.
  const exprs = {
    client_documents: lit('client_documents'),
    prev_accountant_details: `case when v_needs_prevdet then ${prevYes.trim()} else ${prevNo.trim()} end`,
    paperless_invite: lit('paperless_invite'),
    paperless_connection: lit('paperless_connection'),
    paperless_tax_authority: lit('paperless_tax_authority'),
    retainer_authorization: lit('retainer_authorization'),
  };
  return { systemPayload: fnText, generator: `${g.head}${body}${g.tag};`, exprs };
}

// ─── הרכבת האזורים ב-222 ───────────────────────────────────────────────────

/** הביטויים המקוריים של המחולל (216) — לבדיקת השוויון מול _onboarding_system_payload. */
export const originalGeneratorExprs = () => deriveGenerator(read(SOURCES.generator)).exprs;

export function deriveAll() {
  const portal = derivePortal(read(SOURCES.portal));
  const approval = deriveApproval(read(SOURCES.approval));
  const gen = deriveGenerator(read(SOURCES.generator));
  return {
    portal_rep_item: portal.repItem,
    portal_step_items: portal.stepItems,
    portal_prev_items: portal.prevItems,
    build_client_portal: portal.build,
    rep_client_approval_payload: approval.approvalPayload,
    rep_client_approval_required_payload: approval.requiredPayload,
    ensure_rep_client_approval_step: approval.ensure,
    shaam_require_client_approval: approval.require,
    onboarding_system_payload: gen.systemPayload,
    generate_onboarding_steps: gen.generator,
  };
}

const open = (k) => `-- >>> GENERATED:${k} (scripts/verify-222-body.mjs — לא לערוך ידנית)\n`;
const close = (k) => `\n-- <<< GENERATED:${k}\n`;

function regionOf(text, k) {
  const a = text.indexOf(open(k));
  const b = text.indexOf(close(k));
  if (a < 0 || b < 0 || b < a) return null;
  return { from: a + open(k).length, to: b, text: text.slice(a + open(k).length, b) };
}

/** הגוף החי (prosrc) של פונקציה בסביבה. ייצור — readProd (קריאה בלבד). */
async function liveBodies(target, names) {
  const lib = await import('./staging-lib.mjs');
  const list = names.map((n) => `'${n}'`).join(',');
  const q = `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in (${list})`;
  const rows = target === 'prod' ? await lib.readProd(q) : await lib.writeStaging(q);
  return new Map(rows.map((r) => [r.proname, r.prosrc]));
}

/** --live <staging|prod>: לפני ההחלה — הגוף החי של הפונקציות שנוגעים בהן == המקור שממנו נגזרנו (אין סטייה).
 *  --live <…> --after: אחרי ההחלה — הגוף החי של כל הפונקציות == מה שנגזר ל-222. */
async function checkLive(target, after) {
  const derived = deriveAll();
  const fnNames = {
    portal_rep_item: '_portal_rep_item', portal_step_items: '_portal_step_items', portal_prev_items: '_portal_prev_items',
    build_client_portal: 'build_client_portal', rep_client_approval_payload: '_rep_client_approval_payload',
    rep_client_approval_required_payload: '_rep_client_approval_required_payload',
    ensure_rep_client_approval_step: 'ensure_rep_client_approval_step', shaam_require_client_approval: 'shaam_require_client_approval',
    onboarding_system_payload: '_onboarding_system_payload', generate_onboarding_steps: 'generate_onboarding_steps',
  };
  const touched = ['build_client_portal', 'ensure_rep_client_approval_step', 'shaam_require_client_approval', 'generate_onboarding_steps'];
  const names = after ? Object.values(fnNames) : touched;
  const live = await liveBodies(target, names);
  const problems = [];
  const srcOf = { build_client_portal: SOURCES.portal, generate_onboarding_steps: SOURCES.generator,
    ensure_rep_client_approval_step: SOURCES.approval, shaam_require_client_approval: SOURCES.approval };
  for (const [k, fn] of Object.entries(fnNames)) {
    if (!names.includes(fn)) continue;
    const got = live.get(fn);
    if (typeof got !== 'string') { problems.push(`${fn}: לא נמצאה ב-${target}`); continue; }
    // ‼ prosrc מתחיל בשורה החדשה שאחרי AS $function$ — ב-fnDef היא חלק מה-head.
    const want = '\n' + (after
      ? fnDef(derived[k] + '\n', fn).body
      : fnDef(read(srcOf[fn]), fn).body);
    if (norm(got) !== want) {
      let i = 0;
      while (i < Math.min(got.length, want.length) && got[i] === want[i]) i++;
      problems.push(`${fn}: הגוף החי ב-${target} שונה מ-${after ? '222' : srcOf[fn]} (מהתו ${i}; חי ${got.length}, מצופה ${want.length}): «${got.slice(i, i + 70).replace(/\n/g, '⏎')}» ↔ «${want.slice(i, i + 70).replace(/\n/g, '⏎')}»`);
    }
  }
  if (problems.length) { console.error('✗ ' + problems.join('\n✗ ')); process.exit(1); }
  console.log(`✓ ${names.length} פונקציות ב-${target}: הגוף החי == ${after ? 'מה שנגזר ל-222' : 'המקור (אין סטייה לפני ההחלה)'}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const li = argv.indexOf('--live');
  if (li >= 0) return checkLive(argv[li + 1], argv.includes('--after'));
  const derived = deriveAll();
  const file = norm(readFileSync(resolve(ROOT, SQL_222), 'utf8'));
  let out = file;
  const problems = [];
  for (const [k, sql] of Object.entries(derived)) {
    const r = regionOf(out, k);
    if (!r) { problems.push(`${k}: אין אזור GENERATED בקובץ`); continue; }
    if (argv.includes('--write')) out = out.slice(0, r.from) + sql + out.slice(r.to);
    else if (r.text !== sql) {
      let i = 0;
      while (i < Math.min(r.text.length, sql.length) && r.text[i] === sql[i]) i++;
      problems.push(`${k}: האזור בקובץ שונה ממה שנגזר (מהתו ${i}): «${r.text.slice(i, i + 80).replace(/\n/g, '⏎')}» ↔ «${sql.slice(i, i + 80).replace(/\n/g, '⏎')}»`);
    }
  }
  if (argv.includes('--write')) {
    writeFileSync(resolve(ROOT, SQL_222), out);
    console.log(`נכתבו ${Object.keys(derived).length} אזורים ל-${SQL_222}`);
  }
  if (problems.length) { console.error('✗ ' + problems.join('\n✗ ')); process.exit(1); }
  console.log(`✓ ${Object.keys(derived).length} אזורים נגזרים תואמים ל-${SQL_222}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
