-- ═══════════════════════════════════════════════════════════════════════════
--  177 — הסכום החוזי: בסיס לפני מע״מ, שיעור מע״מ בחתימה, וההקפאה שהלקוח ראה
-- ═══════════════════════════════════════════════════════════════════════════
--  הכרעת מוצר C6 (ספר הפערים, 09.09.2026):
--   · הבסיס החוזי הסמכותי הוא הסכום **לפני מע"מ**. engagements.monthly_total
--     כבר היה זה — אבל מחושב בלי עיגול (סכימת ה-numeric הגולמי), בעוד כל
--     שאר המערכת (quotationCalc.ts) מעגלת כל שורה לאגורות לפני החיבור.
--     תיקון: אותו כלל עיגול — round(x, 2) לכל שורה, ואז סכימה.
--   · שיעור המע"מ בחתימה נשמר על ההתקשרות עצמה (vat_rate_at_signing) —
--     נגזר בשעת היצירה מ-quotations.vat_rate ולעולם אינו נכתב מחדש. שינוי
--     שיעור המע"מ הארצי בעתיד, או עריכת ההצעה אחרי אישור (אין דרך לכך היום,
--     אבל למקרה שתיפתח) — לא ישנו את מה שכבר סוכם.
--   · הקפאה של הסכום כולל-מע"מ (monthly_total_with_vat) נכתבת פעם אחת, באותו
--     רגע, מאותם שני מספרים — ולא מחושבת מחדש בשום קריאה עתידית. זו התשובה
--     ל"מה הלקוח ראה וחתם עליו" בכל רגע נתון, גם אם נוסחת המע"מ תשתנה.
--   · הצעה: quotations.snapshot (מוקפא כבר בשליחה) מקבל מפתח חדש
--     frozenTotals — פלט calcTotals() המלא, מוקפא באותו רגע שהפריטים
--     וה-vatRate מוקפאים. שדה jsonb קיים, אין צורך בעמודה.
--     נכתב מהצד הלקוח (App.tsx) בעדכון הזה, לא כאן.
--   · הצעות שאושרו/פורסמו **לפני** המיגרציה הזאת אין להן את השדות החדשים —
--     אין די ראיה לשחזור מדויק של מה שנחתם, ואסור להמציא אותו. נשארות ריקות
--     (null) ומדווחות בנפרד (ראה scripts/report-vat-snapshot-coverage.mjs).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.engagements
  add column if not exists vat_rate_at_signing numeric,
  add column if not exists monthly_total_with_vat numeric;

comment on column public.engagements.vat_rate_at_signing is
  'שיעור המע"מ בזמן אישור ההצעה שיצרה את ההתקשרות — הקפאה חד-פעמית (177). null בהתקשרויות שנוצרו לפני המיגרציה.';
comment on column public.engagements.monthly_total_with_vat is
  'monthly_total כולל מע"מ, מחושב פעם אחת מ-monthly_total ו-vat_rate_at_signing (177). לעולם אינו נכתב מחדש — זה מה שהלקוח ראה וחתם עליו.';

create or replace function public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean DEFAULT false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q          public.quotations%rowtype;
  v_items    jsonb;
  v_monthly  numeric;
  v_vat_rate numeric;
  v_monthly_with_vat numeric;
  v_start    text;
  v_eng_id   text;
  v_existing text;
  v_steps    jsonb;
  v_kind     text;
  v_current  text;
  v_eff      date;
  it         jsonb;
  v_qty      numeric; v_disc numeric; v_total numeric; v_inst int;
  v_per      numeric; v_incl numeric; v_balance numeric; v_off numeric; v_final numeric;
  v_label    text; v_trigger text;
  v_sub      jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);
  v_kind  := coalesce(nullif(q.kind, ''), 'engagement');
  v_current := public.current_engagement_id(q.client_id);

  if v_kind = 'one_time' and v_current is null then
    v_kind := 'engagement';
  end if;

  if not p_dry_run then
    -- ‼ העשרת נתונים בלבד — מחוץ לגבול ההצלחה במכוון (ראה כותרת 159).
    perform public.copy_lead_facts_to_client(q.id);

    insert into public.additional_charges (
      user_id, client_id, description, amount, status,
      source_type, source_quotation_id, source_item_id
    )
    select
      q.user_id, q.client_id,
      coalesce(nullif(it2->>'name', ''), 'חיוב מהצעת מחיר'),
      (coalesce((it2->>'clientPrice')::numeric, 0))
        * (coalesce((it2->>'quantity')::numeric, 1))
        * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0),
      'pending', 'quotation', q.id, it2->>'id'
    from jsonb_array_elements(v_items) it2
    where coalesce(it2->>'category', '') = 'one_time'
      and it2->>'id' is not null
      and (coalesce((it2->>'clientPrice')::numeric, 0))
            * (coalesce((it2->>'quantity')::numeric, 1))
            * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0) > 0
    on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
    do nothing;

    for it in select * from jsonb_array_elements(v_items) loop
      continue when coalesce(it->>'prorationMode', '') <> 'deferred';
      continue when it->>'id' is null;

      v_qty   := coalesce((it->>'quantity')::numeric, 1);
      v_disc  := 1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0;
      v_total := round(coalesce((it->>'annualPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_inst  := greatest(1, least(60, coalesce((it->>'installments')::int, 12)));
      v_per   := round(coalesce((it->>'clientPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_incl  := round(v_per * v_inst, 2);
      v_balance := greatest(0, round(v_total - v_incl, 2));

      if (it->>'deferredChargeAmount') is not null then
        v_final := least(greatest(0, (it->>'deferredChargeAmount')::numeric), v_balance);
      else
        v_off   := least(greatest(0, coalesce((it->>'deferredDiscount')::numeric, 0)), v_balance);
        v_final := round(v_balance - v_off, 2);
      end if;

      continue when v_final <= 0;

      v_label := coalesce(nullif(trim(it->>'name'), ''), 'שירות');
      if nullif(it->>'year', '') is not null then v_label := v_label || ' ' || (it->>'year'); end if;
      v_trigger := coalesce(nullif(trim(it->>'deferredTrigger'), ''), 'עם הגשת הדוח השנתי');

      insert into public.additional_charges (
        user_id, client_id, description, amount, status,
        source_type, source_quotation_id, source_item_id, due_trigger
      )
      values (q.user_id, q.client_id, 'השלמה ל' || v_label, v_final, 'pending',
              'quotation', q.id, it->>'id', v_trigger)
      on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
      do nothing;
    end loop;
  end if;

  if v_kind = 'one_time' then
    return jsonb_build_object('ok', true, 'kind', 'one_time',
      'engagementId', null, 'chargesOnly', true);
  end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    if (select status from public.engagements where id = v_existing) = 'onboarding' then
      v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
      if not p_dry_run then
        v_sub := public.add_intake_questionnaire_step(v_existing);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
        v_sub := public.ensure_institution_alignment_steps(q.client_id, v_existing, true);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
      end if;
    end if;
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true, 'steps', v_steps);
  end if;

  -- 177: כל שורה מעוגלת לאגורות לפני החיבור — אותו כלל בדיוק כמו
  -- quotationCalc.ts (round2 לכל שורה, ורק אז סכום). לפני התיקון הסכום
  -- הגולמי (numeric ללא עיגול) יכול היה לסטות במאיות אגורה מהמסך.
  select
    sum( round( (coalesce((it2->>'clientPrice')::numeric, 0))
       * (coalesce((it2->>'quantity')::numeric, 1))
       * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0), 2) ),
    min(nullif(it2->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it2
  where coalesce(it2->>'category','') = 'monthly';

  v_monthly := coalesce(v_monthly, 0);
  v_vat_rate := coalesce(q.vat_rate, 0);
  v_monthly_with_vat := round(v_monthly * (1 + v_vat_rate / 100.0), 2);

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start,
      'kind', v_kind, 'isRenewal', v_current is not null);
  end if;

  v_eff := coalesce(q.effective_from, (nullif(v_start, '') || '-01')::date, current_date);

  if v_current is null then
    insert into public.engagements (user_id, client_id, quotation_id, status,
                                    monthly_total, vat_rate_at_signing, monthly_total_with_vat,
                                    billing_start_month, approved_at, effective_from)
    values (q.user_id, q.client_id, q.id, 'onboarding',
            v_monthly, v_vat_rate, v_monthly_with_vat, v_start, coalesce(q.approved_at, now()), v_eff)
    on conflict (quotation_id) do nothing
    returning id into v_eng_id;

    if v_eng_id is null then
      select id into v_eng_id from public.engagements where quotation_id = q.id;
      v_steps := public.generate_onboarding_steps(v_eng_id, false);
      v_sub := public.add_intake_questionnaire_step(v_eng_id);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
    end if;

    perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
      'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
      jsonb_build_object('quotationId', q.id));

    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    v_sub := public.add_intake_questionnaire_step(v_eng_id);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;
    v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;

    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
  end if;

  update public.engagements
     set status = 'cancelled', updated_at = now()
   where client_id = q.client_id and status = 'scheduled';

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, vat_rate_at_signing, monthly_total_with_vat,
                                  billing_start_month, approved_at,
                                  effective_from, supersedes_engagement_id)
  values (q.user_id, q.client_id, q.id, 'scheduled',
          v_monthly, v_vat_rate, v_monthly_with_vat, v_start, coalesce(q.approved_at, now()), v_eff, v_current)
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'renewal', true);
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'עדכון התקשרות אושר מהצעה ' || coalesce(q.quotation_number, q.id) ||
    ' - בתוקף מ-' || to_char(v_eff, 'MM/YYYY'),
    jsonb_build_object('quotationId', q.id, 'supersedes', v_current));

  perform public.apply_due_engagement_transitions();

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false,
    'renewal', true, 'effectiveFrom', v_eff);
end;
$function$;

revoke execute on function public.create_engagement_for_quotation(text, boolean) from public, anon, authenticated;
grant  execute on function public.create_engagement_for_quotation(text, boolean) to service_role;

select public.assert_domain_function_invariants();
