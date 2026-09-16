-- ═══════════════════════════════════════════════════════════════════════════
--  180 — שאריות הנדסיות T6/H7 (ספר הפערים, 09.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--  T6 · כפתור האוטומציה — הכרטיס (checks) ותיק המס כבר משתמשים באותו jobIsLive
--  ("‼ (170) הכפתור נחסם רק כשמישהו באמת מחזיק את המשימה") — תוקן קודם,
--  לפני הסבב הזה. שלושת הקידודים ל"לא ידוע" במצב ספרים — ראה §③ למטה.
--  מה שנשאר לתקן כאן: הצעה חדשה שדורסת בשקט מקור/ערך-ישן של הצעה מתחרה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① T6 · הצעה מתחרה מוחלפת בשקט (propose_tax_facts) ──────────────────────
--  ‼ מה נמצא: ON CONFLICT (client_id, field_key) WHERE status='pending' עשה
--  DO UPDATE שדרס old_value/source/source_ref/note — גם כשההצעה השנייה
--  מציעה ערך *אחר* לגמרי מהראשונה. מי שבודק מאוחר יותר רואה רק את ההצעה
--  השנייה; הראשונה (ומי הציע אותה ולמה) נעלמת בלי עקבות. עדכון חוזר מאותו
--  מקור (למשל אוטומציה שרצה שוב ומציעה את אותו ערך) ממשיך להתמזג במקום —
--  זה לא כפילות, זו אותה הצעה בדיוק.
--  התיקון: ON CONFLICT מתמזג בשקט רק כש-new_value זהה להצעה הקיימת. new_value
--  שונה מסמן את הישנה 'superseded' (superseded_by מצביע לחדשה) ומכניס שורה
--  חדשה — היסטוריה מלאה, כמו superseded_by על annual_report_sessions (174).
alter table public.tax_fact_changes
  add column if not exists superseded_by text references public.tax_fact_changes(id);

alter table public.tax_fact_changes drop constraint if exists tax_fact_changes_status_check;
alter table public.tax_fact_changes add constraint tax_fact_changes_status_check
  check (status = any (array['pending', 'accepted', 'rejected', 'superseded']));

create or replace function public.propose_tax_facts(p_client_id text, p_source text, p_source_ref text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  it jsonb;
  v_count int := 0;
  v_id text;
  v_rows jsonb := '[]'::jsonb;
  v_existing public.tax_fact_changes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_source not in ('questionnaire', 'institution_alignment', 'import', 'automation') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if coalesce(it->>'field_key', '') = '' then continue; end if;

    select * into v_existing from public.tax_fact_changes
     where client_id = p_client_id and field_key = it->>'field_key' and status = 'pending'
     for update;

    -- 180: הצעה מתחרה (ערך חדש שונה) מסמנת את הקודמת superseded ולא דורסת
    -- אותה — מי שיבדוק מאוחר יותר רואה את שתיהן, לא רק את האחרונה.
    if v_existing.id is not null and v_existing.new_value is distinct from it->'new_value' then
      update public.tax_fact_changes
         set status = 'superseded', decided_at = now()
       where id = v_existing.id;
      v_existing := null;
    end if;

    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, source_ref, note)
    values
      (v_uid, p_client_id, it->>'field_key', coalesce(it->>'label', it->>'field_key'),
       it->'old_value', it->'new_value', p_source, p_source_ref, it->>'note')
    on conflict (client_id, field_key) where status = 'pending'
    do update set
      new_value  = excluded.new_value,
      old_value  = excluded.old_value,
      label      = excluded.label,
      source     = excluded.source,
      source_ref = excluded.source_ref,
      note       = excluded.note,
      created_at = now()
    returning id into v_id;

    if v_existing.id is not null then
      update public.tax_fact_changes set superseded_by = v_id where id = v_existing.id;
    end if;

    v_rows := v_rows || jsonb_build_object('id', v_id, 'fieldKey', it->>'field_key');
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'proposed', v_count,
    'changes', v_rows,
    'change', case when jsonb_array_length(v_rows) = 1 then v_rows->0 end
  );
end;
$function$;

revoke execute on function public.propose_tax_facts(text, text, text, jsonb) from public, anon;
grant  execute on function public.propose_tax_facts(text, text, text, jsonb) to authenticated, service_role;

select public.assert_domain_function_invariants();
