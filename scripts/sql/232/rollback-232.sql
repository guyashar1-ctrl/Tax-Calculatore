-- התאוששות מ-232 (פרסום הערכת מס בדף האישי). מחזיר את 231 כמו שהיא: טריגר הקיפאון, בלי פרסום.
-- ‼ ההזרקות מוסרות בדיוק לפי הטקסט שהוזרק; אם הטקסט לא נמצא — נעצר (לא מנחש).
begin;
-- בקשות «הערכת מס» שפורסמו דרך 232 — מסירים רק את סימון הגרסה; published_at של הבקשה נשאר כפי שנוצר (229)
update public.onboarding_steps set payload = payload - 'publishedEstimateId' - 'clientSub'
 where step_type = 'tax_estimate' and payload ? 'publishedEstimateId';

do $r232$
declare
  v_def text;
  v_branch text := E'    when ''tax_estimate'' then\n'
    || E'      -- 232 · הערכת מס שפורסמה: נקראת מהגרסה המאושרת עצמה (לא עותק)\n'
    || E'      v_items := v_items || coalesce((select jsonb_build_array(jsonb_build_object(''bucket'',''action'',''key'',''taxest_''||s.id,\n'
    || E'          ''label'', ''הערכת המס לשנת '' || e.tax_year,\n'
    || E'          ''sub'', ''גרסה '' || e.version || '' · המלצת המשרד למקדמות · לקריאה'',\n'
    || E'          ''actionKind'',''taxEstimate'',''actionValue'', s.id))\n'
    || E'        from public.tax_estimates e where e.request_id = s.id and e.status = ''approved'' and e.published_at is not null\n'
    || E'        order by e.version desc limit 1), ''[]''::jsonb);\n\n';
  v_a1 text := E'''info_collection'')\n     and (s.step_type <> ''business_details''';
  v_n1 text := E'''info_collection'',\n                         -- 232 · הערכת מס — רק כשיש גרסה מאושרת ומפורסמת (הבקשה עצמה פנימית ו«מפורסמת» מיצירתה, 229)\n                         ''tax_estimate'')\n     and (s.step_type <> ''tax_estimate'' or exists (select 1 from public.tax_estimates e where e.request_id = s.id and e.status = ''approved'' and e.published_at is not null))\n     and (s.step_type <> ''business_details''';
  v_a2 text := E'when ''info_collection'' then ''taxinfo_'' || p_step_id';
  v_n2 text := E'when ''tax_estimate'' then ''taxest_'' || p_step_id\n           when ''info_collection'' then ''taxinfo_'' || p_step_id';
begin
  v_def := pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure);
  if position(v_branch in v_def) > 0 then execute replace(v_def, v_branch, '');
  elsif v_def like '%232 · הערכת מס%' then raise exception 'rollback 232: הענף ב-_portal_step_items שונה — לא מסיר בניחוש';
  end if;
  if to_regprocedure('public._client_announceable_steps(text)') is not null then
    v_def := pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure);
    if position(v_n1 in v_def) > 0 then execute replace(v_def, v_n1, v_a1);
    elsif v_def like '%232 · הערכת מס%' then raise exception 'rollback 232: _client_announceable_steps שונתה — לא מסיר בניחוש';
    end if;
  end if;
  if to_regprocedure('public._client_step_portal_key(text, text)') is not null then
    v_def := pg_get_functiondef('public._client_step_portal_key(text, text)'::regprocedure);
    if position(v_n2 in v_def) > 0 then execute replace(v_def, v_n2, v_a2); end if;
  end if;
end
$r232$;

drop function if exists public.portal_tax_estimate(text, text);
drop function if exists public.portal_tax_estimate_preview(text, text);
drop function if exists public._tax_estimate_client_view(text, text, boolean);
drop function if exists public.publish_tax_estimate(text, boolean);
drop index if exists public.tax_estimates_one_published_idx;

-- טריגר הקיפאון — הטקסט של 231 בדיוק (גם העיצוב), כדי שההחזרה תהיה זהה לבייט
create or replace function public._tax_estimate_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'superseded' then
    raise exception 'tax_estimate_superseded: גרסה שהוחלפה אינה נערכת';
  end if;
  if old.status = 'approved' then
    -- המעבר היחיד המותר: «הוחלפה», בלי לגעת בשום שדה אחר
    if new.status = 'superseded'
       and new.draft = old.draft and new.outputs is not distinct from old.outputs and new.input_facts = old.input_facts
       and new.version = old.version and new.revision = old.revision and new.cutoff_month = old.cutoff_month and new.approved_at is not distinct from old.approved_at then
      return new;
    end if;
    raise exception 'tax_estimate_approved: גרסה מאושרת אינה נערכת — חישוב מחדש יוצר גרסה חדשה';
  end if;
  return new;
end $$;
revoke all on function public._tax_estimate_immutable() from public, anon, authenticated;

-- עמודות הפרסום (העמודה published_at בגרסה מאושרת: הטריגר של 231 לא מתיר עדכון — מורידים את העמודה)
alter table public.tax_estimates drop column if exists published_by;
alter table public.tax_estimates drop column if exists published_at;
commit;
