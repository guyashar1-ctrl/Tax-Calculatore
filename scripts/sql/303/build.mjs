// בונה את supabase/303-wealth-declaration-complete.sql: שלוש פונקציות החתימה של 298 — כמו שהן, עם הרחבה להצהרת הון
// (מקור אחד: הגוף נלקח מ-298 ולא מועתק ביד), פריטי הסכום החדשים וענף הדף.
//   node scripts/sql/303/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('supabase/298-annual-return-signing.sql', 'utf8').replace(/\r\n/g, '\n');
const cut = (startMark, endMark) => {
  const a = src.indexOf(startMark); const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error(startMark);
  return src.slice(a, b + endMark.length);
};
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('anchor: ' + a.slice(0, 60)); return s.replace(a, () => b); };

let send = cut('create or replace function public.annual_return_send_for_signing', 'end $$;');
let store = cut('create or replace function public.annual_return_store_signed', 'end $$;');
let resolve = cut('create or replace function public._annual_sign_resolve', 'end $$;');
send = rep(send, "if s.id is null or s.step_type <> 'annual_return' then", "if s.id is null or s.step_type not in ('annual_return', 'wealth_declaration') then");
resolve = rep(resolve, "if s.id is null or s.step_type <> 'annual_return' then", "if s.id is null or s.step_type not in ('annual_return', 'wealth_declaration') then");
store = rep(store, 'declare r public.annual_return_signings%rowtype; c public.clients%rowtype; v_label text; v_doc text;',
  'declare r public.annual_return_signings%rowtype; c public.clients%rowtype; v_label text; v_doc text; v_type text; v_asof text; v_name text;');
store = rep(store,
  "  insert into public.document_labels (user_id, name) values (r.user_id, 'טופס 1301') on conflict (user_id, name) do nothing;\n  select id into v_label from public.document_labels where user_id = r.user_id and name = 'טופס 1301';",
  "  select step_type, payload->>'asOfDate' into v_type, v_asof from public.onboarding_steps where id = r.request_id;\n"
  + "  -- 300 · הצהרת הון — תווית משלה; הדוח השנתי — כמו ב-298\n"
  + "  v_name := case when v_type = 'wealth_declaration' then 'הצהרת הון' else 'טופס 1301' end;\n"
  + '  insert into public.document_labels (user_id, name) values (r.user_id, v_name) on conflict (user_id, name) do nothing;\n'
  + '  select id into v_label from public.document_labels where user_id = r.user_id and name = v_name;');
store = rep(store,
  "          'דוח-שנתי-' || r.tax_year || '-' || coalesce(nullif(btrim(c.last_name), ''), 'client') || '-חתום.pdf', 'application/pdf', greatest(coalesce(p_file_size, 0), 0),\n"
  + "          'form_1301', r.tax_year::text, 'הדוח השנתי ' || r.tax_year || ' — חתום בדף האישי', 'SHA-256 ' || p_pdf_sha256, v_label, now());",
  "          case when v_type = 'wealth_declaration' then 'הצהרת-הון-' || coalesce(v_asof, r.tax_year::text) else 'דוח-שנתי-' || r.tax_year end\n"
  + "            || '-' || coalesce(nullif(btrim(c.last_name), ''), 'client') || '-חתום.pdf',\n"
  + "          'application/pdf', greatest(coalesce(p_file_size, 0), 0),\n"
  + "          case when v_type = 'wealth_declaration' then 'other' else 'form_1301' end, r.tax_year::text,\n"
  + "          case when v_type = 'wealth_declaration' then 'הצהרת ההון ליום ' || to_char(v_asof::date, 'DD.MM.YYYY') || ' — חתומה בדף האישי'\n"
  + "               else 'הדוח השנתי ' || r.tax_year || ' — חתום בדף האישי' end,\n"
  + "          'SHA-256 ' || p_pdf_sha256, v_label, now());");

const items = {
  'wealth.realEstateAbroad.total': 'amount', 'wealth.crypto.total': 'amount', 'wealth.loansGiven.total': 'amount', 'wealth.vehicles.total': 'amount',
  'wealth.valuables.total': 'amount', 'wealth.homeContents.total': 'amount', 'wealth.other.total': 'amount', 'wealth.loansReceived.total': 'amount',
  // הערכת מס: «בוצע בפועל» (המשרד מסמן)
  'estimate.applied': 'detail',
};
const q = s => s.replace(/'/g, "''");
const branchLines = [
  "    when 'wealth_declaration' then",
  '      -- 300 · חתימה על הצהרת ההון: «לחתימה» כל עוד חסרה חתימה; «נחתמה» כשכולם חתמו',
  "      v_items := v_items || coalesce((select jsonb_build_array(case when g.state = 'signed'",
  "          then jsonb_build_object('bucket','done','key','annualsign_'||s.id,'label','הצהרת ההון ליום ' || to_char((s.payload->>'asOfDate')::date, 'DD.MM.YYYY') || ' · נחתמה')",
  "          else jsonb_build_object('bucket','action','key','annualsign_'||s.id,'label','הצהרת ההון ליום ' || to_char((s.payload->>'asOfDate')::date, 'DD.MM.YYYY') || ' — לחתימה',",
  "            'sub', case when jsonb_array_length(g.signers) > 1 and g.signatures <> '{}'::jsonb then 'נשארה חתימה אחת' when jsonb_array_length(g.signers) > 1 then 'שניכם חותמים · כל אחד בנפרד' else 'עוברים על ההצהרה וחותמים' end,",
  "            'actionKind','annualSign','actionValue', s.id) end)",
  "        from public.annual_return_signings g where g.request_id = s.id and g.state <> 'superseded' order by g.version desc limit 1), '[]'::jsonb);",
  '',
];
// כל שורה כמחרוזת E'…\n' — אותה תבנית כמו 298
const n1 = branchLines.map(l => `E'${q(l)}\\n'`).join('\n          || ');

const sql = `-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- 303 · הצהרת הון עד הסוף: סכום לכל סעיף ב-1219, וחתימת הלקוח בדף האישי (26.10.2026)
-- ‼ נכתב כ-300 והוחל כך בייצור (26.10); שם הקובץ עבר ל-303 בגלל 300-certificate-message. סימוני «300 · …» בגופים נשארו — «כבר הוחל» נשען עליהם.
-- גיא (26.10): «לבצע ולהשלים עד הסוף את שלושת התהליכים — דוח שנתי, הצהרת הון והערכת מס».
--   1. _tax_year_items: שמונה פריטי סכום חדשים (סעיפי חלק א׳ שלא היה להם סכום) — wealthDeclaration/engine.ts SECTIONS;
--      ובהערכת מס — estimate.applied («בוצע בפועל», המשרד מסמן).
--      ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדשים; פריט קיים לא משתנה.
--   2. החתימה של 298 חלה גם על הצהרת הון (step_type 'wealth_declaration'): שליחה, טוקן הדף, הקובץ החתום (תווית «הצהרת הון»).
--   4. הערכת מס: כותרת בקשת־הבת בדף — «הערכת מס {שנה}».
--   3. הפריט בדף: ענף 'wealth_declaration' — «הצהרת ההון ליום … — לחתימה» / «נחתמה» (לפני הענף של הדוח השנתי).
-- ‼ נוצר ב-scripts/sql/303/build.mjs (גופי החתימה נלקחים מ-298). החזרה: scripts/sql/303/rollback-303.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · פריטי הסכום החדשים ──
do $w300$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '${JSON.stringify(items)}'::jsonb;
begin
  if v_cur @> v_add then raise notice '300: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '300: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$w300$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

-- ── 2 · החתימה — גם להצהרת הון ──
${send}

${store}

${resolve}

-- ── 3 · הפריט בדף: ענף 'wealth_declaration' (לפני 'annual_return') ──
do $p300$
declare
  v_def text;
  v_nl  text;
  a1 text := E'    when ''annual_return'' then\\n';
  n1 text := ${n1};
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  if position('300 · חתימה על הצהרת ההון' in v_def) > 0 then raise notice '300: _portal_step_items — כבר הוחל'; return; end if;
  -- ‼ בייצור הגוף מעורב (חלקו CRLF וחלקו LF) — העוגן בצורה שמופיעה בו בדיוק פעם אחת
  v_nl := case when (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) = 1 then E'\\n' else E'\\r\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '300: עוגן annual_return ב-_portal_step_items לא נמצא פעם אחת'; end if;
  if position('when ''wealth_declaration'' then' in v_def) > 0 then raise exception '300: ענף wealth_declaration כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p300$;

-- ── 4 · הערכת מס: כותרת בקשת־הבת בדף — «הערכת מס 2026», לא «השלמת מידע לשנת 2026» (כמו «הדוח השנתי» ב-262) ──
do $t300$
declare v_def text;
  a1 text := $blk$when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */$blk$;
  n1 text := $blk$when par.step_type = 'tax_estimate' then 'הערכת מס ' || v_year /* 300 · כותרת */ when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */$blk$;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('300 · כותרת' in v_def) > 0 then raise notice '300: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '300: עוגן הכותרת ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$t300$;

-- ── הרשאות (כמו 298) ──
revoke all on function public.annual_return_send_for_signing(text, jsonb, jsonb) from public, anon;
revoke all on function public.annual_return_store_signed(text, text, int, text) from public, anon;
revoke all on function public._annual_sign_resolve(text, text) from public, anon, authenticated;
grant execute on function public.annual_return_send_for_signing(text, jsonb, jsonb) to authenticated;
grant execute on function public.annual_return_store_signed(text, text, int, text) to authenticated;

-- ── אימות ──
do $$
begin
  if not public._tax_year_items() ? 'wealth.loansReceived.total' then raise exception '300: items not updated'; end if;
  if position('300 · כותרת' in pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure)) = 0 then raise exception '300: estimate title missing'; end if;
  if position('300 · חתימה על הצהרת ההון' in pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure)) = 0 then raise exception '300: portal branch missing'; end if;
  if public.assert_domain_function_invariants() <> 'ok' then raise exception '300: invariants'; end if;
end;
$$;
`;
writeFileSync('supabase/303-wealth-declaration-complete.sql', sql);

// ── החזרה: הענף יוצא, שלוש הפונקציות חוזרות לגוף של 298; פריטי הסכום נשארים (תשובות קיימות מצביעות עליהם) ──
const orig = ['create or replace function public.annual_return_send_for_signing', 'create or replace function public.annual_return_store_signed', 'create or replace function public._annual_sign_resolve']
  .map(m => cut(m, 'end $$;')).join('\n\n');
writeFileSync('scripts/sql/303/rollback-303.sql', `-- 300 · חזרה: הענף של הצהרת הון יוצא מהדף, והחתימה חוזרת לדוח השנתי בלבד (גופי 298). פריטי הסכום נשארים ב-_tax_year_items.
-- ‼ נוצר ב-scripts/sql/303/build.mjs
do $rt300$
declare v_def text := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
begin
  if position('300 · כותרת' in v_def) = 0 then return; end if;
  execute replace(v_def, $blk$when par.step_type = 'tax_estimate' then 'הערכת מס ' || v_year /* 300 · כותרת */ $blk$, '');
end
$rt300$;

do $r300$
declare v_def text; v_start int; v_end int;
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  v_start := position('    when ''wealth_declaration'' then' in v_def);
  if v_start = 0 then raise notice '300 rollback: הענף כבר לא קיים'; return; end if;
  v_end := position('    when ''annual_return'' then' in v_def);
  if v_end <= v_start then raise exception '300 rollback: סדר הענפים לא צפוי'; end if;
  execute substr(v_def, 1, v_start - 1) || substr(v_def, v_end);
end
$r300$;

${orig}
`);
console.log('ok', sql.length);
