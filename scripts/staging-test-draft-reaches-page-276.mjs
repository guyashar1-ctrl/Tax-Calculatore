#!/usr/bin/env node
/**
 * staging-test-draft-reaches-page-276.mjs — «טיוטה» במשרד = פריט בדף אחרי «פרסם בדף» (INV-REQ-01, 276).
 *
 * לכל סוג שהמשרד מסמן עליו «טיוטה» (portalShowsStep — PORTAL_STEP_TYPES בלי המקופלים), במצב שבו
 * הוא נולד (pending, ולסוגים שבשרשרת — גם locked):
 *   D1  «איך זה ייראה» (build_client_portal 'preview') מציג פריט מסומן draft.
 *   D2  אחרי publish_case_changes — הדף האמיתי ('live') מציג פריט.
 * ובנוסף לשאלון «עדכון סטטוס מס»:
 *   Q1  אחרי פרסום — «ממתין ללקוח», הכדור אצל הלקוח, ויש קישור לשאלון בדף.
 *   Q2  שאלון שפורסם ונפתח מחדש ל-pending (נתיב אחר) — חוזר ל«ממתין ללקוח».
 *
 * ‼ למה (22.10.2026): השאלון של ליאת סומן «טיוטה» ונספר ב«N בקשות עוד לא בדף», אבל הדף הציג אותו
 *   רק במצב waiting_client — והפרסום לא העביר אותו לשם. אצל לקוח אחר הוא נשאר מוסתר עשרה ימים.
 *   הבדיקה עוברת על כל הסוגים, כדי שסוג חדש עם אותו פער ייפול כאן ולא אצל לקוח.
 * ‼ הכול בטרנזקציה אחת שנגמרת ב-raise — staging חוזר בדיוק למה שהיה. נתוני דמה בלבד.
 * הרצה:  node scripts/staging-test-draft-reaches-page-276.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

// [סוג, מצב הלידה, הכדור, payload] — המצב שבו היוצר (מחולל / מסלול / קטלוג) כותב אותו כטיוטה.
const CASES = [
  ['client_documents', 'pending', 'client', { requirements: [{ key: 'id_card', label: 'צילום תעודת זהות', kind: 'file', required: true, done: false }] }],
  ['custom_request', 'pending', 'client', { title: 'בקשת בדיקה', requirements: [{ key: 'q', label: 'פרט אחד', kind: 'file', required: true, done: false }] }],
  ['prev_accountant_details', 'pending', 'client', {}],
  ['paperless_invite', 'pending', 'client', {}],
  ['paperless_connection', 'locked', 'me', {}],
  ['paperless_tax_authority', 'locked', 'client', {}],
  ['retainer_authorization', 'locked', 'me', {}],
  ['business_details', 'pending', 'client', {}],
  ['intake_questionnaire', 'pending', 'me', {}],
  ['intake_questionnaire', 'locked', 'me', {}],
  ['file_opening', 'pending', 'me', {}],
];

const cases = CASES.map(([t, st, ball, p], i) =>
  `(${i + 1}, '${t}', '${st}', '${ball}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`).join(',\n    ');

const SCRIPT = `
do $t$
declare
  v_out text := '';
  k record; v_c text; v_s text; v_prev jsonb; v_live jsonb; v_pub jsonb; v_base int; st record; v_tok text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${USER_ID}', 'role', 'authenticated')::text, true);
  for k in select * from (values
    ${cases}
  ) as x(n, t, st, ball, p) loop
    v_c := 'qa276c-' || k.n || '-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (id, user_id, first_name, last_name, email, id_number, lifecycle_stage)
    values (v_c, '${USER_ID}', 'ישראלה', 'QA276', 'qa276@example.invalid', '000000018', 'active');
    v_base := jsonb_array_length(coalesce(public.build_client_portal(v_c, 'live') -> 'items', '[]'::jsonb));
    v_s := replace(gen_random_uuid()::text, '-', '');
    insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
    values (v_s, '${USER_ID}', v_c, k.t, 'custom', 'person', k.st, k.ball, k.p, null, 10);

    v_prev := public.build_client_portal(v_c, 'preview');
    v_out := v_out || format('D1 %s/%s preview_shows_draft=%s|', k.t, k.st,
      exists (select 1 from jsonb_array_elements(coalesce(v_prev -> 'items', '[]'::jsonb)) i where (i ->> 'draft')::boolean));

    v_pub := public.publish_case_changes(v_c);
    v_live := public.build_client_portal(v_c, 'live');
    v_out := v_out || format('D2 %s/%s publish_ok=%s|D2 %s/%s live_shows=%s|', k.t, k.st,
      case when (v_pub ->> 'ok')::boolean then 'true' else coalesce(v_pub ->> 'error', v_pub::text) end, k.t, k.st,
      jsonb_array_length(coalesce(v_live -> 'items', '[]'::jsonb)) > v_base);

    if k.t = 'intake_questionnaire' and k.st = 'pending' then
      select * into st from public.onboarding_steps where id = v_s;
      select intake_token into v_tok from public.clients where id = v_c;
      v_out := v_out || format('Q1 waiting_client=%s|Q1 ball_client=%s|Q1 link_on_page=%s|',
        st.status = 'waiting_client', st.ball = 'client',
        exists (select 1 from jsonb_array_elements(v_live -> 'items') i
                 where i ->> 'actionKind' = 'intake' and i ->> 'actionValue' = v_tok));
      update public.onboarding_steps set status = 'pending', ball = 'me' where id = v_s;
      select * into st from public.onboarding_steps where id = v_s;
      v_out := v_out || format('Q2 reopened_stays_with_client=%s|', st.status = 'waiting_client' and st.ball = 'client');
    end if;
  end loop;
  raise exception 'RESULTS:%', v_out;
end;
$t$;`;

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SCRIPT }),
});
const text = await r.text();
const m = /RESULTS:([^"\\]*)/.exec(text);
if (!m) { console.error('✗ לא התקבלו תוצאות:', text.slice(0, 800)); process.exit(1); }
let pass = 0, fail = 0;
for (const part of m[1].split('|').filter(Boolean)) {
  const [name, val] = part.split('=');
  if (val === 'true' || val === 't') { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} (${val})`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו  (${STAGING_REF})`);
process.exitCode = fail ? 1 : 0;
