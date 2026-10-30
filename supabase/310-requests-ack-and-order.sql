-- ════════════════════════════════════════════════════════════════════════════
-- 310 · «בקשות» — ירוק עד «סימון שהושלם», וסדר שנקבע בגרירה
-- ════════════════════════════════════════════════════════════════════════════
-- הדמיה שאושרה: docs/proposals/2026-10-29-requests-dots-v2.html
-- תוכנית: docs/plans/2026-10-29-work-tab-dots-groups-flows.md (שלב 1)
--
-- 1. office_ack_at — «המשרד ראה». בקשה שהלקוח (או PIVO) השלים נשארת ברשימה,
--    ירוקה, עד שהמשרד לוחץ «סימון שהושלם». מה שהמשרד עצמו סגר — נחשב נראה מיד.
--    ‼ השחרור של הבקשה הבאה לא מחכה לסימון: unlock_dependent_steps לא נגעה.
-- 2. ack_onboarding_steps — «סימון שהושלם» (שורה אחת או קבוצה).
-- 3. set_onboarding_steps_order — גרירה: הסדר החי, מיד. הדף של הלקוח ממוין
--    לפיו (build_client_portal), ולכן הסדר במשרד = הסדר אצל הלקוח.
--    ‼ מנקה pending_sort_order, אחרת סידור ישן שממתין לפרסום היה גובר על הגרירה.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.onboarding_steps add column if not exists office_ack_at timestamptz;

comment on column public.onboarding_steps.office_ack_at is
  '310: מתי המשרד ראה שהבקשה הושלמה. null על בקשה שהושלמה = ירוק במשרד, עד «סימון שהושלם».';

-- ── מי סגר ⇒ האם צריך עין של המשרד ─────────────────────────────────────────
-- ‼ auth.uid() קיים = משתמש המשרד עשה את הפעולה (גם כשטריגר אחר סגר בעקבותיה).
--   ריק = הדף של הלקוח (טוקן), העובד או פונקציית שרת — מישהו אחר סיים ⇒ ירוק.
create or replace function public._onboarding_step_office_ack()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_was_done boolean := tg_op = 'UPDATE' and old.status in ('completed', 'verified');
begin
  if new.status in ('completed', 'verified') then
    if not v_was_done then
      new.office_ack_at := case when auth.uid() is not null then now() else null end;
    elsif auth.uid() is not null and new.status is distinct from old.status then
      -- המשרד אימת (completed ⇒ verified) — זה גם «ראיתי».
      new.office_ack_at := coalesce(new.office_ack_at, now());
    end if;
  elsif new.status in ('skipped', 'cancelled') then
    -- דילוג וביטול הם החלטה של המשרד — אין מה לסמן.
    new.office_ack_at := coalesce(new.office_ack_at, now());
  else
    -- נפתחה מחדש ⇒ כשתושלם שוב, תהיה ירוקה שוב.
    new.office_ack_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists onboarding_steps_office_ack on public.onboarding_steps;
create trigger onboarding_steps_office_ack
  before insert or update of status on public.onboarding_steps
  for each row execute function public._onboarding_step_office_ack();

-- ── מה שכבר קיים ביום השחרור ────────────────────────────────────────────────
-- ‼ הכרעת גיא (29.10): מה שהושלם שלא בידי המשרד ב-14 הימים האחרונים — ירוק.
--   כל השאר — נחשב נראה, כדי שהמסך לא יתמלא בירוק ישן.
--   completed_by מתמלא ב-auth.uid() רק כשהמשרד סגר (advance_onboarding_step); הלקוח,
--   העובד ופונקציות השרת משאירים אותו ריק.
update public.onboarding_steps
   set office_ack_at = coalesce(completed_at, updated_at, now())
 where office_ack_at is null
   and (
     status in ('skipped', 'cancelled')
     or (status in ('completed', 'verified')
         and (completed_by is not null
              or coalesce(completed_at, updated_at) < now() - interval '14 days'))
   );

-- ── «סימון שהושלם» ──────────────────────────────────────────────────────────
create or replace function public.ack_onboarding_steps(p_step_ids text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n   int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps
     set office_ack_at = now()
   where id = any(p_step_ids)
     and user_id = v_uid
     and status in ('completed', 'verified')
     and office_ack_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'acked', v_n);
end;
$function$;

revoke all on function public.ack_onboarding_steps(text[]) from public, anon;
grant execute on function public.ack_onboarding_steps(text[]) to authenticated;

-- ── גרירה: הסדר החי ─────────────────────────────────────────────────────────
create or replace function public.set_onboarding_steps_order(p_client_id text, p_ids text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c     public.clients%rowtype;
  v_uid uuid := auth.uid();
  v_n   int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps s
     set sort_order = t.ord * 10,
         pending_sort_order = null
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) t
   where s.id = t.id and s.client_id = c.id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$function$;

revoke all on function public.set_onboarding_steps_order(text, text[]) from public, anon;
grant execute on function public.set_onboarding_steps_order(text, text[]) to authenticated;
