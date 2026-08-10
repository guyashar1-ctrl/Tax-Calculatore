-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text
CREATE OR REPLACE FUNCTION public.create_deferred_collection_tasks(p_quotation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotations%rowtype; it jsonb; v_items jsonb;
  v_qty numeric; v_disc numeric; v_total numeric; v_inst int;
  v_per numeric; v_incl numeric; v_balance numeric; v_off numeric;
  v_charge numeric; v_final numeric;
  v_title text; v_trigger text; v_label text; v_created int := 0;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null or q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  for it in select * from jsonb_array_elements(v_items) loop
    continue when coalesce(it->>'prorationMode', '') <> 'deferred';

    v_qty  := coalesce((it->>'quantity')::numeric, 1);
    v_disc := 1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0;
    v_total := round(coalesce((it->>'annualPrice')::numeric, 0) * v_qty * v_disc, 2);
    v_inst  := greatest(1, least(60, coalesce((it->>'installments')::int, 12)));
    v_per   := round(coalesce((it->>'clientPrice')::numeric, 0) * v_qty * v_disc, 2);
    v_incl  := round(v_per * v_inst, 2);
    v_balance := greatest(0, round(v_total - v_incl, 2));

    if (it->>'deferredChargeAmount') is not null then
      v_final := least(greatest(0, (it->>'deferredChargeAmount')::numeric), v_balance);
      v_off   := round(v_balance - v_final, 2);
    else
      v_off   := least(greatest(0, coalesce((it->>'deferredDiscount')::numeric, 0)), v_balance);
      v_final := round(v_balance - v_off, 2);
    end if;

    continue when v_final <= 0;

    v_label := coalesce(nullif(trim(it->>'name'), ''), 'שירות');
    if nullif(it->>'year', '') is not null then v_label := v_label || ' ' || (it->>'year'); end if;
    v_trigger := coalesce(nullif(trim(it->>'deferredTrigger'), ''), 'עם הגשת הדוח השנתי');
    v_title := 'לגבות ' || to_char(v_final, 'FM999,999,990') || ' ₪ — ' || v_label;

    if exists (select 1 from public.tasks t
               where t.user_id = q.user_id and t.client_id = q.client_id and t.title = v_title) then
      continue;
    end if;

    insert into public.tasks (user_id, client_id, category, title, description, ball_with, status, progress, priority)
    values (q.user_id, q.client_id, 'annual_report', v_title,
            'יתרה שנדחתה מהצעה ' || coalesce(q.quotation_number, q.id) || '.' || E'\n' ||
            'ערך השירות: ' || to_char(v_total, 'FM999,999,990') || ' ₪' || E'\n' ||
            'כלול בשכר החודשי: ' || to_char(v_incl, 'FM999,999,990') || ' ₪ (' || v_inst || ' תשלומים)' || E'\n' ||
            'יתרה: ' || to_char(v_balance, 'FM999,999,990') || ' ₪' ||
            case when v_off > 0 then E'\n' || 'הנחה על היתרה: ' || to_char(v_off, 'FM999,999,990') || ' ₪' else '' end || E'\n' ||
            'לגבייה ' || v_trigger || '.',
            'me', 'open', 'new', 'normal');
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'tasksCreated', v_created);
end;
$function$

