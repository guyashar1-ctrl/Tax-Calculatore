#!/usr/bin/env node
/**
 * qa-222-identity.mjs — P.1 + P.6 של 222: «אפס הבדלים» בדף של כל לקוח, והיוצרים לא השתנו.
 *
 *   node scripts/qa-222-identity.mjs                    staging: לקוחות אמיתיים + לקוחות סינתטיים (בטרנזקציה שמתבטלת)
 *   node scripts/qa-222-identity.mjs --target prod      ייצור: רק לקוחות אמיתיים, קריאה בלבד בפועל (שום הוספה; הכול מתבטל)
 *
 * ‼ איך: בבקשה אחת (טרנזקציה אחת) — גוף 221 של build_client_portal נשמר בשם _bcp_old, אחריו קובץ 222 כמו שהוא,
 *   ואז כל לקוח נבנה פעמיים (_bcp_old מול build_client_portal החדשה), בשני המצבים (live, preview), ומושווה כ-jsonb.
 *   הבקשה מסתיימת ב-raise — שום דבר לא נשמר. בייצור הבדיקה היא על הלקוחות האמיתיים בלבד (בלי INSERT).
 *   במקביל (staging): לכל אחד משישה נוסחי המחולל — הביטוי המקורי מ-216 מורץ כמו שהוא מול _onboarding_system_payload.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, PROD_REF, STAGING_REF, loadEnv } from './staging-lib.mjs';
import { fnDef, SOURCES, originalGeneratorExprs } from './verify-222-body.mjs';

const prod = process.argv.includes('--target') && process.argv[process.argv.indexOf('--target') + 1] === 'prod';
const REF = prod ? PROD_REF : STAGING_REF;
const norm = (s) => s.replace(/\r\n/g, '\n');
const read = (f) => norm(readFileSync(resolve(ROOT, f), 'utf8'));

// ── הגוף הישן (221) בשם אחר ─────────────────────────────────────────────────
const old221 = (() => {
  const fn = fnDef(read(SOURCES.portal), 'build_client_portal');
  return `${fn.head.replace(/public\.build_client_portal\s*\(/i, 'public._bcp_old(')}${fn.body}${fn.tag};`;
})();
// --negative-control: משנים מילה אחת בנוסח כדי להוכיח שהבדיקה באמת רואה הבדל (לא רצה ריקה).
const migration222 = process.argv.includes('--negative-control')
  ? read('supabase/222-request-preview.sql').replace("'ביקשנו את התיק - בתהליך'", "'ביקשנו את התיק - בתהליך!'").replace("'בטיפול המשרד — הזנת הייצוג בביטוח לאומי'", "'בטיפול המשרד — הזנת הייצוג בביטוח לאומי!'")
  : read('supabase/222-request-preview.sql');

// ── לקוחות סינתטיים: סוג × מצב × מצב-תצוגה ───────────────────────────────────
const doc = (label, done = false, extra = {}) => ({ key: label, label, done, ...extra });
const req = (key, kind, extra = {}) => ({ key, kind, label: `דרישה ${key}`, done: false, required: true, ...extra });
const V = [];
const add = (t, type, status, payload = {}, o = {}) => V.push({ t, type, status, payload, ...o });

add('מסמכים · ממתין', 'client_documents', 'pending', { checklist: [doc('א', true), doc('ב'), doc('ג', false, { requiredBy: 'shaam' })], clientTitle: 'להעלות 3 מסמכים', clientSub: 'א · ב · ג' });
add('מסמכים · בלי רשימה', 'client_documents', 'pending', { clientTitle: 'מסמכים', clientSub: 'תיאור' });
add('מסמכים · נעול', 'client_documents', 'locked', { checklist: [doc('א')], clientSub: 'תיאור' });
add('מסמכים · הושלם', 'client_documents', 'completed', { checklist: [doc('א', true)] });
add('מסמכים · טיוטה', 'client_documents', 'pending', { checklist: [doc('א')] }, { published: false });
add('מסמכים · יוסר', 'client_documents', 'pending', { checklist: [doc('א')] }, { pendingCancel: true });
add('מסמכים · נערך', 'client_documents', 'pending', { checklist: [doc('א')] }, { draft: { clientTitle: 'כותרת מהטיוטה' } });

add('חופשית · הסבר ומספרים', 'custom_request', 'pending', { clientTitle: 'חופשית', clientSub: 'שורה', clientNote: 'הסבר\nבשתי שורות', clientRefs: [{ label: 'קוד', value: '123' }], clientNoteAfter: 'אחרי', clientCta: 'המשך', requirements: [req('a', 'confirm'), req('b', 'text', { required: false })] });
add('חופשית · בחירה + מדריך מצולם', 'custom_request', 'pending', { clientTitle: 'מילואים', clientPhotoGuide: 'reserve_duty_claim', requirements: [req('outcome', 'select', { options: ['א', 'ב', 'ג', 'ד'] })] });
add('חופשית · קבצים', 'custom_request', 'pending', { clientTitle: 'קבצים', requirements: [req('f', 'file'), req('g', 'files', { maxFiles: 3 })] });
add('חופשית · שתי דרישות חובה', 'custom_request', 'pending', { clientTitle: 'שתיים', clientSub: 'שורת משנה', requirements: [req('a', 'confirm', { done: true }), req('b', 'email')] });
add('חופשית · חומר עזר (קישור)', 'custom_request', 'pending', { clientTitle: 'מדריך', clientLinkUrl: 'https://example.test/guide', requirements: [req('opened', 'confirm', { required: false }), req('reviewed', 'confirm')] });
add('חופשית · חומר עזר שהושלם', 'custom_request', 'completed', { clientTitle: 'מדריך', clientLinkUrl: 'https://example.test/guide' });
add('חופשית · כמה קבצים שנשלחו', 'custom_request', 'pending', { clientTitle: 'מסמכים מהמשרד', message: 'הערה', clientResources: [{ key: 'r1', label: 'קובץ', source: 'office', officeId: 'nope' }, { key: 'r2', label: 'פרטי', source: 'client', documentId: 'doc1', fileName: 'x.pdf' }], requirements: [req('r1', 'confirm'), req('r2', 'confirm', { done: true })] });
add('חופשית · קבצים שנשלחו · הושלם', 'custom_request', 'completed', { clientTitle: 'מסמכים מהמשרד', message: 'הערה', clientResources: [{ key: 'r1', label: 'קובץ', source: 'office', officeId: 'nope' }] });
add('חופשית · קבצים שנשלחו · נעול', 'custom_request', 'locked', { clientTitle: 'מסמכים מהמשרד', clientSub: 'נעול', clientResources: [{ key: 'r1', label: 'קובץ', source: 'office', officeId: 'nope' }] });
add('חופשית · הודעה', 'custom_request', 'pending', { clientTitle: 'הודעה מהמשרד', messageOnly: true, message: 'שלום' });
add('חופשית · הודעה שהושלמה', 'custom_request', 'completed', { messageOnly: true, message: 'שלום' });
add('חופשית · משימה פנימית', 'custom_request', 'pending', { clientTitle: 'פנימית', internalTask: true });
add('חופשית · אישור אישי', 'custom_request', 'pending', { clientTitle: 'אישי', personalConfirmFor: 'e1' });
add('חופשית · נעולה', 'custom_request', 'locked', { clientTitle: 'נעולה', clientSub: 'תיאור' });
add('חופשית · הושלמה', 'custom_request', 'completed', { clientTitle: 'הושלמה' });
add('חופשית · צילום תעודה', 'custom_request', 'pending', { shaamIdentity: { person: 'client' }, clientTitle: 'צילום תעודה', clientSub: 'שורה', clientNote: 'הערה', clientResources: [{ key: 'i1', label: 'צילום', source: 'client', documentId: 'doc1', fileName: 'id.pdf' }] });
add('חופשית · צילום תעודה · טיוטה (דגלים לא נישאים)', 'custom_request', 'pending', { shaamIdentity: { person: 'client' }, clientTitle: 'צילום תעודה' }, { published: false });
add('חופשית · צילום תעודה · הושלם', 'custom_request', 'completed', { shaamIdentity: { person: 'client' } });
add('חופשית · צילום תעודה · נעול', 'custom_request', 'locked', { shaamIdentity: { person: 'client' } });
add('חופשית · צילום תעודה · בן/בת זוג', 'custom_request', 'pending', { shaamIdentity: { person: 'spouse' } });

add('רו״ח קודם · ממתין', 'prev_accountant_details', 'pending', { clientTitle: 'פרטי רו״ח', clientSub: 'שורה' });
add('רו״ח קודם · שואלים מחדש', 'prev_accountant_details', 'pending', { askAgain: true });
add('רו״ח קודם · נעול', 'prev_accountant_details', 'locked', { clientTitle: 'פרטי רו״ח' });
add('רו״ח קודם · הושלם', 'prev_accountant_details', 'completed', {});
for (const st of ['unknown', 'self', 'other_rep', 'not_applicable']) {
  for (const status of ['pending', 'locked', 'completed']) add(`פייפרלס הרשמה · ${st} · ${status}`, 'paperless_invite', status, { paperlessStatus: st, clientTitle: 'הרשמה', clientCta: 'נרשמתי' });
}
add('פייפרלס הרשמה · דולג כבר מחובר', 'paperless_invite', 'skipped', { paperlessStatus: 'self', skipReason: 'already_connected' });
add('פייפרלס הרשמה · דולג אחר', 'paperless_invite', 'skipped', { paperlessStatus: 'unknown', skipReason: 'x' });
for (const st of ['unknown', 'other_rep', 'not_applicable']) {
  for (const status of ['pending', 'locked', 'completed']) add(`פייפרלס חיבור · ${st} · ${status}`, 'paperless_connection', status, { paperlessStatus: st, clientTitle: 'חיבור' }, { ball: 'me' });
}
add('פייפרלס חיבור · דולג הועבר', 'paperless_connection', 'skipped', { skipReason: 'transferred_rep' }, { ball: 'me' });
add('אישור ייצוג · ממתין', 'rep_client_approval', 'pending', { clientTitle: 'זירוז אישור הייצוג באזור האישי', clientSub: 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות', clientNote: 'א\\nב', clientNoteAfter: 'אחרי', clientCta: 'אישרתי', clientLinkUrl: 'https://www.gov.il/x', clientLinkLabel: 'לכניסה' });
add('אישור ייצוג · הצהיר', 'rep_client_approval', 'pending', { clientDeclaredAt: '2026-10-01T00:00:00Z' });
add('אישור ייצוג · נעול', 'rep_client_approval', 'locked', {});
add('אישור ייצוג · הושלם', 'rep_client_approval', 'completed', {});
add('אישור ייצוג · חובה', 'rep_client_approval', 'pending', { requiredBy: 'shaam', clientTitle: 'אישור הייצוג באזור האישי', clientSub: 'נדרש' }, { rep: { status: 'awaiting_authorities', scope: { vat: { status: 'in_process' } } }, married: true });
add('חיבור לרשות · ממתין', 'paperless_tax_authority', 'pending', { clientTitle: 'חיבור', clientNote: 'א', clientNoteAfter: 'ב', clientLinkUrl: 'https://example.test' });
add('חיבור לרשות · נעול', 'paperless_tax_authority', 'locked', {});
add('חיבור לרשות · הושלם', 'paperless_tax_authority', 'completed', {});
add('הרשאה · לפני', 'retainer_authorization', 'pending', { clientTitle: 'להזין אמצעי תשלום' }, { ball: 'me' });
add('הרשאה · נוצרה', 'retainer_authorization', 'pending', { authorizationCreatedAt: '2026-10-01' }, { ball: 'me' });
add('הרשאה · כרטיס הוזן', 'retainer_authorization', 'pending', { cardEnteredAt: '2026-10-01' }, { ball: 'me' });
add('הרשאה · נעול', 'retainer_authorization', 'locked', {}, { ball: 'me' });
add('הרשאה · הושלם', 'retainer_authorization', 'completed', {}, { ball: 'me' });
add('הרשאה · ידני', 'retainer_authorization', 'pending', { method: 'manual_arrangement' }, { ball: 'me' });
add('פרטי עסק · ממתין', 'business_details', 'pending', { clientTitle: 'פרטי העסק' }, { business: 'מספרת דנה' });
add('פרטי עסק · ממתין בלי שם', 'business_details', 'pending', {});
add('פרטי עסק · אצל המשרד', 'business_details', 'in_progress', {}, { ball: 'me' });
add('פרטי עסק · נעול', 'business_details', 'locked', {});
add('פרטי עסק · הושלם', 'business_details', 'completed', {});
add('פרטי עסק · דולג', 'business_details', 'skipped', {});
add('שאלון · ממתין', 'intake_questionnaire', 'waiting_client', {}, { intake: true });
add('שאלון · בלי טוקן', 'intake_questionnaire', 'waiting_client', {});
add('שאלון · נעול', 'intake_questionnaire', 'locked', {});
add('שאלון · הושלם', 'intake_questionnaire', 'completed', {});
add('מכתב שחרור · פתוח', 'release_letter', 'pending', {}, { ball: 'me' });
add('מכתב שחרור · הושלם', 'release_letter', 'completed', {}, { ball: 'me' });
add('חומרים · פתוח', 'materials_received', 'pending', {}, { ball: 'me' });
add('חומרים · הושלם', 'materials_received', 'completed', {}, { ball: 'me' });
add('פתיחת תיקים · פתוח', 'file_opening', 'pending', {}, { ball: 'me' });
add('פתיחת תיקים · הושלם', 'file_opening', 'completed', {}, { ball: 'me' });
add('פתיחת תיקים · דולג', 'file_opening', 'skipped', {}, { ball: 'me' });
add('ייצוג רשות · בטיפולנו', 'authority_representation', 'pending', { title: 'ייצוג בביטוח לאומי' }, { ball: 'me' });
add('ייצוג רשות · בטיפולנו עם אסמכתה', 'authority_representation', 'in_progress', { title: 'ייצוג בביטוח לאומי' }, { ball: 'me', rep: { status: 'awaiting_authorities', execution: { nationalInsurance: { referenceNumber: 'X1' } } } });
add('ייצוג רשות · ממתין ללקוח', 'authority_representation', 'waiting_client', { title: 'ייצוג בביטוח לאומי', subjectRole: 'spouse' }, { rep: { status: 'awaiting_authorities', execution: { nationalInsuranceSpouse: { referenceNumber: 'X2', deadline: '2026-12-01' } } } });
add('ייצוג רשות · פג', 'authority_representation', 'blocked', { title: 'ייצוג' });
add('ייצוג רשות · אושר', 'authority_representation', 'completed', { title: 'ייצוג' });
for (const status of ['pending_fill', 'awaiting_accountant', 'awaiting_stamp', 'awaiting_authorities', 'active']) {
  add(`ייצוג · ${status}`, 'representation', 'pending', {}, { rep: { status, signers: [{ role: 'client', signToken: 't1', signStatus: status === 'awaiting_accountant' ? 'signed' : 'pending' }] } });
  add(`ייצוג · ${status} · בלי שלב בקליטה`, null, null, {}, { rep: { status, signers: [{ role: 'client', signToken: 't1', signStatus: 'pending' }] } });
}
add('ייצוג · ממתין לחתימה', 'representation', 'pending', {}, { rep: { status: 'pending_signature', signers: [{ role: 'client', signToken: 't1', signStatus: 'pending' }] } });
add('ייצוג · ממתין לחתימת בן/בת זוג', 'representation', 'pending', {}, { rep: { status: 'pending_signature', signers: [{ role: 'client', signToken: 't1', signStatus: 'signed' }, { role: 'spouse', signToken: 't2', signStatus: 'pending' }] } });
add('סוג לא מוכר', 'data_import', 'pending', {}, { ball: 'me' });

const variantsJson = JSON.stringify(V);

// ── השוואת הביטויים המקוריים של המחולל ───────────────────────────────────────
const E = originalGeneratorExprs();
const genParity = prod ? '' : `
do $gen$
declare
  v_docs jsonb; ps text; amt numeric; v_needs_prevdet boolean;
  v_client public.clients%rowtype; e public.engagements%rowtype;
  old_v jsonb; new_v jsonb; out jsonb := '[]'::jsonb; ok boolean; k int := 0;
begin
  foreach v_docs in array array['[{"key":"a","label":"אישור","done":false}]'::jsonb,
      '[{"key":"a","label":"אישור","done":false},{"key":"b","label":"דוח","done":false},{"key":"c","label":"טופס 106","done":false}]'::jsonb, '[]'::jsonb] loop
    old_v := ${E.client_documents};
    new_v := public._onboarding_system_payload('client_documents', jsonb_build_object('checklist', v_docs));
    k := k + 1; out := out || jsonb_build_object('t', 'מחולל · client_documents #' || k, 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  end loop;
  foreach v_needs_prevdet in array array[true, false] loop
    old_v := ${E.prev_accountant_details};
    new_v := public._onboarding_system_payload('prev_accountant_details', jsonb_build_object('needsDetails', v_needs_prevdet));
    out := out || jsonb_build_object('t', 'מחולל · prev_accountant_details ' || v_needs_prevdet, 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  end loop;
  foreach ps in array array['unknown', 'self', 'other_rep', 'not_applicable', null] loop
    v_client.paperless_status := ps;
    old_v := ${E.paperless_invite};
    new_v := public._onboarding_system_payload('paperless_invite', jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown')));
    out := out || jsonb_build_object('t', 'מחולל · paperless_invite ' || coalesce(v_client.paperless_status, 'null'), 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  end loop;
  old_v := ${E.paperless_connection};
  new_v := public._onboarding_system_payload('paperless_connection');
  out := out || jsonb_build_object('t', 'מחולל · paperless_connection', 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  old_v := ${E.paperless_tax_authority};
  new_v := public._onboarding_system_payload('paperless_tax_authority');
  out := out || jsonb_build_object('t', 'מחולל · paperless_tax_authority', 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  foreach amt in array array[1234.5, 0, null]::numeric[] loop
    e.monthly_total := amt;
    old_v := ${E.retainer_authorization};
    new_v := public._onboarding_system_payload('retainer_authorization', jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month));
    out := out || jsonb_build_object('t', 'מחולל · retainer ' || coalesce(e.monthly_total::text, 'null'), 'pass', old_v is not distinct from new_v, 'got', jsonb_build_array(old_v, new_v));
  end loop;
  raise exception 'RESULTS:%', out::text;
end;
$gen$;
`;

const identityBlock = (uid) => `
do $idn$
declare
  uid uuid := ${uid ? `'${uid}'` : 'null'};
  r record; m text; a jsonb; b jsonb;
  n_real int := 0; d_real int := 0; ex jsonb := '[]'::jsonb;
  n_syn int := 0; d_syn int := 0; exs jsonb := '[]'::jsonb;
  vars jsonb := $vars$${variantsJson}$vars$::jsonb;
  v jsonb; cid text; eid text; sid text; rid text; i int := 0;
  rep jsonb; out jsonb := '[]'::jsonb;
begin
  -- 1 · לקוחות אמיתיים
  for r in select id from public.clients order by id loop
    foreach m in array array['live', 'preview'] loop
      a := public._bcp_old(r.id, m);
      b := public.build_client_portal(r.id, m);
      n_real := n_real + 1;
      if a is distinct from b then
        d_real := d_real + 1;
        if jsonb_array_length(ex) < 3 then ex := ex || jsonb_build_object('client', r.id, 'mode', m, 'old', left(a::text, 400), 'new', left(b::text, 400)); end if;
      end if;
    end loop;
  end loop;
  out := out || jsonb_build_object('t', 'P.1 · לקוחות אמיתיים: ' || n_real || ' דפים (לקוחות × שני מצבים) — ' || d_real || ' הבדלים', 'pass', d_real = 0 and n_real > 0, 'got', ex);

  ${prod ? '' : `
  -- 2 · לקוחות סינתטיים — כל סוג × מצב
  for v in select value from jsonb_array_elements(vars) loop
    i := i + 1;
    cid := 'qa222c' || i || substr(md5(random()::text), 1, 8);
    eid := 'qa222e' || i || substr(md5(random()::text), 1, 8);
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, intake_token, business_name,
        prev_accountant_name, prev_accountant_email, prev_accountant_phone, spouse_first_name, portal_token)
    values (cid, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding',
        case when coalesce((v->>'married')::boolean, false) then 'married' else 'single' end,
        case when (v->>'intake')::boolean then 'tok' || cid end, v->>'business',
        'דן', 'dan@example.test', '050', case when coalesce((v->>'married')::boolean, false) then 'רחל' end, md5(cid));
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eid, uid, cid, 'onboarding', now());
    if v->'rep' is not null then
      rid := 'qa222r' || i || substr(md5(random()::text), 1, 8);
      insert into public.representation_requests (id, user_id, status, linked_client_id, signers, execution, scope, onboarding_token)
      values (rid, uid, v->'rep'->>'status', cid, coalesce(v->'rep'->'signers', '[]'::jsonb), coalesce(v->'rep'->'execution', '{}'::jsonb),
              v->'rep'->'scope', md5(rid));
    end if;
    -- ‼ טריגר יוצר שלב «ייצוג» לבקשת ייצוג חדשה: וריאנט «בלי שלב» מוחק אותו, וריאנט «ייצוג» משתמש בו כמו שהוא.
    if v->>'type' is null then
      delete from public.onboarding_steps where client_id = cid and step_type = 'representation';
    elsif v->>'type' <> 'representation' then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
          published_at, sort_order, pending_cancel, draft_payload)
      values (uid, eid, cid, v->>'type', 'tools', 'person', v->>'status', coalesce(v->>'ball', 'client'), coalesce(v->'payload', '{}'::jsonb),
          case when coalesce((v->>'published')::boolean, true) then now() end, 1,
          coalesce((v->>'pendingCancel')::boolean, false), v->'draft')
      returning id into sid;
    end if;
    foreach m in array array['live', 'preview'] loop
      a := public._bcp_old(cid, m);
      b := public.build_client_portal(cid, m);
      n_syn := n_syn + 1;
      if a is distinct from b then
        d_syn := d_syn + 1;
        if jsonb_array_length(exs) < 4 then exs := exs || jsonb_build_object('t', v->>'t', 'mode', m, 'old', left(a::text, 500), 'new', left(b::text, 500)); end if;
      end if;
    end loop;
  end loop;
  out := out || jsonb_build_object('t', 'P.1 · סינתטי: ' || jsonb_array_length(vars) || ' וריאנטים (' || n_syn || ' דפים) — ' || d_syn || ' הבדלים', 'pass', d_syn = 0, 'got', exs);
  `}
  raise exception 'RESULTS:%', out::text;
end;
$idn$;
`;

const TOKEN = loadEnv('.env.local').SUPABASE_ACCESS_TOKEN;
async function run(tail, label) {
  const query = `${old221}\n;\n${migration222}\n;\n${tail}`;
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  const body = await r.text();
  if (r.ok) { console.error(`✋ ${label}: הסתיים בלי raise — ייתכן שנשמר!`); return 1; }
  let msg = body; try { msg = JSON.parse(body).message ?? body; } catch { /* טקסט */ }
  const m = msg.match(/RESULTS:(\[.*\])/s);
  if (!m) { console.log(`✗ ${label}:\n` + msg.slice(0, 2500)); return 1; }
  const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
  let fail = 0;
  for (const x of results) {
    console.log(`${x.pass ? '✓' : '✗'} ${x.t}`);
    if (!x.pass) { fail++; console.log('   ', JSON.stringify(x.got).slice(0, 900)); }
  }
  return fail ? 1 : 0;
}

console.log(`יעד: ${prod ? 'ייצור (קריאה בלבד בפועל — מתבטל)' : 'staging'} ${REF}`);
let uid = null;
if (!prod) uid = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
let failed = await run(identityBlock(uid), 'זהות הדף');
if (!prod) failed += await run(genParity, 'שוויון הנוסחים של המחולל');
console.log(failed ? '✗ יש כשלים' : '✓ כל הבדיקות עברו (הכול מתבטל — raise בסוף)');
process.exitCode = failed ? 1 : 0;
