-- 302 · «הזנתי את הכרטיס» בפייפרלס — מהדף האישי, ואישור של המשרד בלחיצה.
-- (ליאת, 26.10.2026; גיא: «אולי כאן כן ניתן לה לאשר? ככה לוודא שהיא לא פספסה»)
--
-- עד היום: «הזנת כרטיס אשראי בפייפרלס» היה כרטיס מידע («אין מה לאשר כאן»), ולכן ללקוח
-- לא הייתה סיבה להיכנס לפייפרלס עכשיו. מעכשיו:
--   1. הכרטיס בדף הוא declare: שורה אחת («פותחים את אפליקציית פייפרלס — חלון הזנת הכרטיס יקפוץ»)
--      וכפתור «הזנתי את הכרטיס».
--   2. הלחיצה רושמת payload.cardDeclaredAt על שלב התשלום החודשי, שורה ביומן ו-needs_attention.
--      ‼ היא **לא** כותבת cardEnteredAt: אין חיבור לפייפרלס, ו«הוזן» נשאר מה שהמשרד ראה בפועל
--      (הכלל של 2026-08-17). המשרד מאשר בלחיצה אחת — אותה חותמת כמו קודם.
--   3. אחרי ההצהרה הכרטיס יורד מ«מה צריך ממך» ל«בטיפולנו»: «סימנתם שהזנתם — נוודא בפייפרלס».
-- ‼ שלב התשלום עדיין נעול בזמן הזה (הכרטיס הוא הסעיף החמישי בהקמה) — לכן ההפניה בפונקציית
--   השליחה יושבת **לפני** בדיקת locked, ולשלב הזה בלבד.
-- ‼ הוחל כהזרקה לגופים החיים (_r302_patch): כמה החלפות של שורה אחת בגוף אחד, והרצה אחת —
--   כי שתי שורות כאן הן פסוק אחד (ההערה נחתמת בשורה שאחריה).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r302_patch(p_fn regprocedure, p_old text[], p_new text[])
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int;
  i int;
  o text;
  n text;
begin
  for i in 1 .. array_length(p_old, 1) loop
    o := replace(p_old[i], E'\r', '');
    n := replace(p_new[i], E'\r', '');
    if position(n in v_def) > 0 then continue; end if;   -- כבר הוחל
    v_n := (length(v_def) - length(replace(v_def, o, ''))) / greatest(length(o), 1);
    if v_n <> 1 then
      raise exception '302: anchor count % (expected 1) in %: %', v_n, p_fn, left(o, 120);
    end if;
    v_def := replace(v_def, o, n);
  end loop;
  execute v_def;
end;
$$;

-- ── 1 · ההצהרה ─────────────────────────────────────────────────────────────
create or replace function public._portal_paperless_card_declare(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s     public.onboarding_steps;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or s.step_type <> 'retainer_authorization'
     or coalesce(s.payload->>'method', '') = 'manual_arrangement'
     or nullif(s.payload->>'authorizationCreatedAt', '') is null then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;
  if nullif(s.payload->>'cardEnteredAt', '') is not null then
    return jsonb_build_object('ok', true, 'noop', true, 'entered', true);
  end if;
  if nullif(s.payload->>'cardDeclaredAt', '') is not null then
    return jsonb_build_object('ok', true, 'noop', true, 'declared', true);
  end if;

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('cardDeclaredAt', v_now),
         needs_attention = true, updated_at = now()
   where id = s.id;
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'client_declared', 'client',
    'הלקוח סימן «הזנתי את הכרטיס» בפייפרלס — לוודא בפייפרלס ולאשר', jsonb_build_object('what', 'paperless_card'));
  return jsonb_build_object('ok', true, 'declared', true);
end;
$function$;

revoke execute on function public._portal_paperless_card_declare(text) from public, anon, authenticated;

select public._r302_patch('public.portal_submit_step(text,text,jsonb)'::regprocedure,
  array[$o$  if s.status = 'locked' then$o$],
  array[$n$  if s.step_type = 'retainer_authorization' then return public._portal_paperless_card_declare(s.id); end if; -- 302 · «הזנתי את הכרטיס»
  if s.status = 'locked' then$n$]);

-- ── 2 · הדף ─────────────────────────────────────────────────────────────────
-- (א) אחרי ההצהרה: «בטיפולנו», לא «מה צריך ממך».
-- (ב) לפני ההצהרה: declare עם שורה אחת וכפתור. ‼ 'kind' מופיע שוב אחרי 'info' — ב-jsonb הערך האחרון גובר.
-- (ג) ההערה מתקצרת לשורה אחת, ו(ד) השורה «אין מה לאשר כאן» יורדת.
select public._r302_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
  array[
    $o$      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then$o$,
    $o$          'sub','פייפרלס תשלח לכם הודעה להזנת כרטיס אשראי לחיוב החודשי שסיכמנו - או שייפתח לכם חלון להזנת הכרטיס בכניסה הבאה לאפליקציה.',$o$,
    $o$          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ - הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||$o$,
    $o$                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');$o$
  ],
  array[
    $n$      elsif nullif(s.payload->>'cardDeclaredAt','') is not null and nullif(s.payload->>'authorizationCreatedAt','') is not null then
        -- 302 · הלקוח סימן «הזנתי» — המשרד מוודא בפייפרלס.
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_card',
          'label','הזנת כרטיס אשראי בפייפרלס',
          'sub','סימנתם שהזנתם — נוודא בפייפרלס ונעדכן כאן.');
      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then$n$,
    $n$          'sub','פותחים את אפליקציית פייפרלס — חלון הזנת הכרטיס יקפוץ.',
          'kind','declare', 'actionKind','portal', 'actionValue', s.id, 'cta','הזנתי את הכרטיס',$n$,
    $n$          'note','ייתכן חיוב אימות של 1 ₪ — הוא לא החיוב החודשי.');$n$,
    $n$                 -- 302 · השורה «אין מה לאשר כאן» הוסרה — יש כפתור$n$
  ]);

drop function public._r302_patch(regprocedure, text[], text[]);
