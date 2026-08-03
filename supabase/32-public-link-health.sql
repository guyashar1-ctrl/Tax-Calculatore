-- ═══════════════════════════════════════════════════════════════════════════
--  32 — בדיקת בריאות של הקישורים הציבוריים
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ קישור שנשלח ללקוח לפני חודש חייב להמשיך להיפתח גם אחרי כל מיגרציה.
--  ארבעת סוגי הקישורים: הצעת מחיר (?quote=), השלמת פרטי ייצוג (?onboard=),
--  שאלון (?intake=), וחתימה אישית (?sign=).
--
--  מורצת ידנית אחרי כל שינוי סכימה:  select public.public_link_health();
--  allHealthy=false ⇒ עוצרים ומחזירים אחורה לפני שממשיכים.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.public_link_health()
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with quote_links as (
    select (public.get_quotation(q.public_token)->>'quotationNumber') is not null as ok
    from public.quotations q where q.public_token is not null
  ),
  onboard_links as (
    select (select count(*) from public.get_onboarding(r.onboarding_token)) = 1 as ok
    from public.representation_requests r where r.onboarding_token is not null
  ),
  intake_links as (
    select (select count(*) from public.resolve_intake_token(c.intake_token)) >= 1 as ok
    from public.clients c where c.intake_token is not null
  ),
  sign_tokens as (
    select (select count(*) from public.user_id_for_public_token(s->>'signToken')) >= 1 as ok
    from public.representation_requests r,
         lateral jsonb_array_elements(coalesce(r.signers,'[]'::jsonb)) s
    where s->>'signToken' is not null
  )
  select jsonb_build_object(
    'quote',    jsonb_build_object('total',(select count(*) from quote_links),   'ok',(select count(*) from quote_links   where ok)),
    'onboard',  jsonb_build_object('total',(select count(*) from onboard_links), 'ok',(select count(*) from onboard_links where ok)),
    'intake',   jsonb_build_object('total',(select count(*) from intake_links),  'ok',(select count(*) from intake_links  where ok)),
    'sign',     jsonb_build_object('total',(select count(*) from sign_tokens),   'ok',(select count(*) from sign_tokens   where ok)),
    'allHealthy', (select count(*) from quote_links where not ok)
                + (select count(*) from onboard_links where not ok)
                + (select count(*) from intake_links where not ok)
                + (select count(*) from sign_tokens where not ok) = 0
  );
$$;
