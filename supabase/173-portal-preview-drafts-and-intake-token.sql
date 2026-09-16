-- ═══════════════════════════════════════════════════════════════════════════
--  173 — התצוגה המקדימה מציגה את הטיוטה; שאלון שפורסם ניתן להגעה
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① JF1 / PF13 — build_client_portal במצב preview קורא את draft_payload ──
--  "אחרי העדכון" הציג את הטקסט הישן בזמן שהבאנר אמר "שינוי אחד שלא פורסם":
--  הבונה מעולם לא קרא draft_payload. הלולאה מקבלת record ולכן אפשר להחליף
--  את payload בשורה אחת מיד אחרי loop — בדיוק כפי ש-157 הזריקה ענף לאותה
--  פונקציה. ההזרקה מאומתת באורך: אם העוגן לא נמצא בדיוק פעם אחת, נופלים.
--  ‼ במצב live לא משתנה דבר — הלקוח רואה רק מה שפורסם.
do $do$
declare
  v_def    text;
  v_anchor text := E'             st.created_at\n  loop\n';
  v_inject text := E'    -- 172: תצוגה מקדימה = הטיוטה מעל הפרסום; live נשאר כפי שהוא.\n'
                || E'    if p_mode = ''preview'' and s.draft_payload is not null then\n'
                || E'      s.payload := public.merge_step_draft(s.payload, s.draft_payload);\n'
                || E'    end if;\n';
  v_new    text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'build_client_portal' and pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception '172: build_client_portal לא נמצאה'; end if;
  if position('172: תצוגה מקדימה' in v_def) > 0 then
    raise notice '172: build_client_portal כבר מכילה את ההזרקה';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '172: העוגן ב-build_client_portal לא נמצא בדיוק פעם אחת';
  end if;
  v_new := replace(v_def, v_anchor, v_anchor || v_inject);
  if length(v_new) <> length(v_def) + length(v_inject) then
    raise exception '172: אורך לא תואם אחרי ההזרקה';
  end if;
  execute v_new;
end
$do$;

--  והצד השני של אותה אמת: הפאנל "מה הלקוח רואה" סופר יתווספו/יוסרו מדגלי
--  draft/removing שהבונה שם על הפריטים — ועריכה על בקשה מפורסמת לא קיבלה דגל,
--  ולכן הפאנל אמר "אין שינויים ממתינים" מתחת לבאנר "שינוי אחד שלא פורסם".
--  הדגל edited מסומן באותו מקום ובאותה צורה כמו draft/removing.
do $do$
declare
  v_def    text;
  v_anchor text := E'    end if;\n  end loop;\n\n  if not v_rep_seen';
  v_inject text := E'    end if;\n'
                || E'    -- 172: נערך — בקשה מפורסמת שיש עליה טיוטה; הפאנל סופר "ישתנו".\n'
                || E'    if p_mode = ''preview'' and s.published_at is not null and s.draft_payload is not null\n'
                || E'       and jsonb_array_length(v_items) > v_before then\n'
                || E'      select coalesce(jsonb_agg(\n'
                || E'               case when ord > v_before then x || jsonb_build_object(''edited'', true) else x end\n'
                || E'               order by ord), ''[]''::jsonb)\n'
                || E'        into v_items\n'
                || E'        from jsonb_array_elements(v_items) with ordinality t(x, ord);\n'
                || E'    end if;\n  end loop;\n\n  if not v_rep_seen';
  v_new    text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'build_client_portal' and pronamespace = 'public'::regnamespace;
  if position('172: נערך' in v_def) > 0 then
    raise notice '172: build_client_portal כבר מכילה את דגל edited';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '172: העוגן השני ב-build_client_portal לא נמצא בדיוק פעם אחת';
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  if length(v_new) <> length(v_def) - length(v_anchor) + length(v_inject) then
    raise exception '172: אורך לא תואם אחרי ההזרקה השנייה';
  end if;
  execute v_new;
end
$do$;

-- הרשאות הבונה כפי שקבעה 164: פנימי בלבד.
revoke execute on function public.build_client_portal(text, text) from public, anon, authenticated;
grant  execute on function public.build_client_portal(text, text) to service_role;

-- ── ② B7 — שאלון קליטה שפורסם מקבל טוקן, גם בלי מייל ─────────────────────────
--  הדף האישי מציג את פריט השאלון רק כשיש clients.intake_token, והטוקן נטבע
--  עד היום רק בפונקציות הקצה ששולחות מייל. פרסום בלי מייל ⇒ הכרטיס במשרד
--  אומר "נשלח" והדף האישי לא מציג כלום. הטוקן נטבע מעכשיו ברגע הפרסום, באותו
--  פורמט שהמייל משתמש בו (uuid בלי מקפים), כך ששני המסלולים מובילים לאותו קישור.
create or replace function public.tg_mint_intake_token_on_publish()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.step_type = 'intake_questionnaire'
     and new.published_at is not null
     and (old.published_at is null or tg_op = 'INSERT') then
    update public.clients
       set intake_token = replace(gen_random_uuid()::text, '-', '')
     where id = new.client_id and intake_token is null;
  end if;
  return new;
end;
$function$;
drop trigger if exists onboarding_steps_mint_intake_token on public.onboarding_steps;
create trigger onboarding_steps_mint_intake_token
  after insert or update of published_at on public.onboarding_steps
  for each row execute function public.tg_mint_intake_token_on_publish();

-- ── ③ JF3 — payload.published אינו נכתב יותר בשאלון; published_at הוא המקור ──
create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select id into v_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'intake_questionnaire'
      and status <> 'cancelled' limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, payload, published_at)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה.
    false,
    -- טיוטה: published_at ריק הוא הסימון היחיד (JF3). אין יותר payload.published.
    '{}'::jsonb,
    null)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;
revoke execute on function public.add_intake_questionnaire_step(text) from public, anon, authenticated;
grant  execute on function public.add_intake_questionnaire_step(text) to service_role;

select public.assert_domain_function_invariants();
