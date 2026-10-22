-- ─── 280 · «הדוחות שלך» בדף האישי — חובות ההגשה מרשימות שע״ם, כפי שהלקוח רואה אותן — 21.10.2026 ──────────
-- ההדמיה המאושרת: docs/proposals/2026-10-21-tax-area-reimagined.html (#portal). המשרד קולט רשימות שע״ם (250);
-- כאן הלקוח רואה בדף שלו, לכל שנה: מה (דוח שנתי / הצהרת הון), של מי (שם פרטי), עד מתי, ומה המצב.
--
-- ‼ מקור אחד: _portal_filings(client) — גם הדף החי (portal_filings, לפי טוקן) וגם התצוגה במשרד
--   (portal_filings_preview, למשרד הבעלים בלבד). המצב נגזר כאן, לא בדפדפן:
--     filed        — שע״ם רשמה הגשה (state history / filed_per_shaam)
--     client       — הבקשה המקושרת (או בקשת-בת שלה, payload.parentStepId) אצל הלקוח: ball='client', פורסמה,
--                    ועוברת את שער הדף (client_step_gate_open) — אותו כלל כמו הדף עצמו. stepId = הבקשה שבדף.
--     office       — יש בקשה מקושרת פתוחה, והיא אצל המשרד
--     none         — אין בקשה מקושרת (או שהיא נסגרה/בוטלה): רק המועד, בלי תג
--     not_required — שע״ם: אין חובת הגשה («ח» לא מסומן, required = false)
-- ‼ לא נחשף ללקוח: מספר תיק, קנס/קבוצת קנס, מקור/עמוד/שורה, שורות לבדיקה (needs_review), «לא שלנו»
--   (dismissed) ושורות הקשר שאינן «אין חובה» מפורש (context בלי required = false).
-- ‼ בן/בת הזוג — בשם הפרטי מהכרטיס. כשהמצב המשפחתי ידוע ואינו «נשוי» — שורות בן/בת הזוג לא מוצגות (כמו 237).
-- ‼ anon: רק portal_filings, ורק עם טוקן תקף (_portal_client — אותה בדיקה כמו get_client_portal, כולל תפוגה).
--   נוספה לרשימת v_anon_ok ב-assert_domain_function_invariants (הזרקה בעוגן אחד, כמו 247)
--   ול-PUBLIC_SURFACE ב-scripts/staging-test-p0-security.mjs.
-- ‼ קריאה בלבד: שום כתיבה, שום מייל, שום פנייה לרשות.
-- החזרה: scripts/sql/280/rollback-280.sql · החלה ואימות: scripts/sql/280/apply.mjs ·
-- בדיקה ב-staging: scripts/staging-test-280-portal-filings.mjs

-- ── 1 · הבונה (פנימי) ─────────────────────────────────────────────────────────────────────────────
create or replace function public._portal_filings(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  c         public.clients%rowtype;
  v_self    text;
  v_spouse  text;
  v_spouse_ok boolean;
  v_years   jsonb;
  v_src     date;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  v_self   := nullif(split_part(btrim(coalesce(c.first_name, '')), ' ', 1), '');
  v_spouse := coalesce(nullif(split_part(btrim(coalesce(c.spouse_first_name, '')), ' ', 1), ''),
                       nullif(split_part(btrim(coalesce(c.spouse_name, '')), ' ', 1), ''));
  -- ריק = לא ידוע ⇒ מציגים; ידוע ואינו נשוי ⇒ לא מציגים את בן/בת הזוג
  v_spouse_ok := coalesce(nullif(btrim(coalesce(c.family_status, '')), ''), 'married') = 'married';

  with ob as (
    select coalesce(o.tax_year, case when o.year_shown ~ '^[0-9]{4}$' then o.year_shown::int end) as yr,
           o.kind, coalesce(o.subject_role, 'client') as role, o.required, o.legal_due, o.filed_on,
           case
             when o.state in ('history', 'filed_per_shaam') then 'filed'
             when o.state = 'context' then 'not_required'
             when st.id is null or st.status in ('completed', 'verified', 'skipped', 'cancelled', 'failed') then 'none'
             when cs.id is not null then 'client'
             else 'office'
           end as status,
           cs.id as client_step
      from public.shaam_filing_obligations o
      left join public.onboarding_steps st on st.id = o.step_id and st.client_id = o.client_id
      left join lateral (
        select x.id from public.onboarding_steps x
         where st.id is not null and x.client_id = o.client_id
           and (x.id = st.id or x.payload->>'parentStepId' = st.id)
           and x.ball = 'client'
           and x.status not in ('locked', 'completed', 'verified', 'skipped', 'cancelled', 'failed')
           and x.published_at is not null
           and public.client_step_gate_open(o.client_id, x.published_at)
         order by (x.id = st.id), x.created_at
         limit 1) cs on true
     where o.client_id = c.id and o.user_id = c.user_id
       and (o.state in ('open', 'history', 'filed_per_shaam') or (o.state = 'context' and o.required is false))
       and (coalesce(o.subject_role, 'client') = 'client' or v_spouse_ok)
  )
  select coalesce(jsonb_agg(jsonb_build_object('year', g.yr, 'items', g.items) order by g.yr desc), '[]'::jsonb)
    into v_years
    from (select r.yr, jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'kind', r.kind, 'role', r.role,
                   'person', case when r.role = 'spouse' then v_spouse else v_self end,
                   'required', r.required, 'legalDue', r.legal_due, 'filedOn', r.filed_on, 'status', r.status,
                   'stepId', case when r.status = 'client' then r.client_step end))
                   order by (r.role = 'spouse'), (r.kind = 'wealth'), r.legal_due nulls last) as items
            from ob r where r.yr is not null group by r.yr) g;

  if jsonb_array_length(v_years) > 0 then
    select max(coalesce(s.produced_on, s.uploaded_at::date)) into v_src
      from public.shaam_filing_sources s where s.user_id = c.user_id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'sourceDate', v_src, 'years', v_years));
end $$;

-- ── 2 · הדף החי — לפי הטוקן של הדף ────────────────────────────────────────────────────────────────
create or replace function public.portal_filings(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  return public._portal_filings(c.id);
end $$;

-- ── 3 · התצוגה במשרד («מה הלקוח רואה») — אותה תוצאה, רק למשרד שהכרטיס שלו ────────────────────────
create or replace function public.portal_filings_preview(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public._tax_year_client(p_client_id);   -- ‼ forbidden אם הכרטיס אינו של המשרד המחובר
  return public._portal_filings(p_client_id);
end $$;

-- ── 4 · הרשאות ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._portal_filings(text) from public, anon, authenticated;
revoke all on function public.portal_filings(text) from public;
revoke all on function public.portal_filings_preview(text) from public, anon;
grant execute on function public.portal_filings(text) to anon, authenticated;
grant execute on function public.portal_filings_preview(text) to authenticated;

-- ── 5 · רשימת anon המותרת — הזרקה בעוגן אחד (סוף המערך) ─────────────────────────────────────────
-- ‼ כמו 247: לא משכתבים את כל assert_domain_function_invariants (הגוף החי כבר הורכב מכמה מיגרציות).
--   עוגן = סוף המערך («\n  ];\nbegin») — חייב להופיע פעם אחת, אחרת נכשל. כבר הוחל ⇒ לא נוגעים.
do $patch$
declare
  v_inv text;
  v_nl  text := E'\r\n';
  a_inv text := E'\n  ];\nbegin';
  n_inv text := E',\n    -- 280 · «הדוחות שלך» בדף האישי — טוקן הדף בלבד (_portal_client), קריאה בלבד\n    ''portal_filings''\n  ];\nbegin';
  cnt   int;
begin
  select pg_get_functiondef(p.oid) into v_inv from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assert_domain_function_invariants';
  if v_inv is null then raise notice '280: assert_domain_function_invariants לא קיימת — אין רשימה לעדכן'; return; end if;
  if position('''portal_filings''' in v_inv) > 0 then raise notice '280: assert_domain_function_invariants — כבר הוחל'; return; end if;
  if position(replace(a_inv, E'\n', v_nl) in v_inv) > 0 then a_inv := replace(a_inv, E'\n', v_nl); n_inv := replace(n_inv, E'\n', v_nl); end if;
  cnt := (length(v_inv) - length(replace(v_inv, a_inv, ''))) / length(a_inv);
  if cnt <> 1 then raise exception '280: עוגן assert_domain_function_invariants נמצא % פעמים', cnt; end if;
  execute replace(v_inv, a_inv, n_inv);
end
$patch$;
