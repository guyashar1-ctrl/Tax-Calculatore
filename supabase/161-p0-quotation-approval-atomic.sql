-- ═══════════════════════════════════════════════════════════════════════════
--  161 — P0-B · אישור הצעת מחיר: הצלחה אחת, או כלום
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא בגוף הפונקציה שרצה היום בפרודקשן:
--
--        begin
--          perform public.create_engagement_for_quotation(q.id, false);
--        exception when others then
--          null;                      ← הכישלון נבלע
--        end;
--
--  שני בלוקים כאלה, ואחריהם `return 'approved'` ללא תנאי. יש כאן **שני**
--  ערוצי כשל נפרדים, ורק אחד מהם מטופל אפילו חלקית:
--
--   ① כשל רך: create_engagement_for_quotation מחזירה {ok:false,error:...}
--     כערך מוחזר — לא כחריגה. `perform` זורק את הערך לפח, בלוק החריגות אפילו
--     לא מופעל, והפונקציה ממשיכה לדווח "אושר". זה המסלול של no_client.
--
--   ② כשל קשה: חריגה אמיתית בתוך היצירה (למשל מפתח כפול בשלבי הקליטה).
--     בלוק ה-exception תופס אותה, PostgreSQL מגלגל אחורה עד נקודת השמירה
--     שנפתחה ב-begin — כלומר **כל** עבודת ההתקשרות והחיובים מתבטלת — אבל
--     ה-UPDATE שסימן "אושר" בוצע לפני הבלוק ולכן שורד.
--
--  התוצאה בשני המקרים זהה: הצעה מסומנת "אושרה", בלי התקשרות, בלי חיובים,
--  ובלי מסלול קליטה. הלקוח רואה "אושר", והמשרד לא רואה כלום — QuotationsPipeline
--  קובע "הומרה" לפי בקשת הייצוג, שכן נוצרה, ולכן אין אפילו סימן אזהרה.
--
--  ── מה הפונקציה הזו קובעת ─────────────────────────────────────────────────
--  אישור הוא מעבר עסקי אחד עם גבול הצלחה אחד. או שההצעה אושרה **וגם** נוצרו
--  ההתקשרות, החיובים והבקשות שנפתחות באישור — או ששום דבר לא קרה וההצעה
--  נשארת ניתנת לאישור. אין מצב ביניים.
--
--  ‼ החלטה מודעת: כשל הופך את המסך של הלקוח להודעת שגיאה במקום ל"אושר".
--  זה פחות נעים מ"אושר" שקרי, והרבה יותר בטוח: הלקוח לוחץ שוב, והפעם או
--  שזה עובד או שהרו"ח רואה שיש בעיה. אישור שקרי לא מתגלה לאף אחד.
--
--  ‼ למה ניסיון חוזר בטוח (אידמפוטנטיות מלאה):
--    · ההצעה כבר 'approved' ⇒ נכנסים לענף השני, בקשת הייצוג הקיימת ממוחזרת
--      ולא נוצרת חדשה (open_quotation_representation מחזירה את הקיימת).
--    · engagements: on conflict (quotation_id) do nothing, ואז select הקיים.
--    · additional_charges: on conflict (source_quotation_id, source_item_id).
--    · השלבים: generate_onboarding_steps בודקת קיום לפני יצירה.
--    לכן לחיצה שנייה משלימה בדיוק את מה שחסר, ולא מכפילה דבר.
--
--  ‼ for update: שתי לחיצות במקביל (או לחיצה + טעינה מחדש) נכנסו עד היום
--  שתיהן במקביל לאותו ענף. הנעילה על שורת ההצעה מסדרת אותן בתור.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_quotation(
  p_token text,
  p_signature text default null,
  p_signer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q         public.quotations%rowtype;
  v_req_id  text;
  v_token   text;
  v_needs   boolean := false;
  v_reused  boolean := false;
  v_eng     jsonb;
  v_rel     jsonb;
  v_eng_id  text;
  v_client  text;
begin
  -- ‼ for update — מסדר בתור שתי לחיצות מקבילות על אותו קישור.
  select * into q from public.quotations where public_token = p_token limit 1 for update;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    -- ניסיון חוזר, או לחיצה שנייה. לא מאשרים מחדש — משלימים את מה שחסר.
    v_reused := q.representation_request_id is not null;
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
  elsif q.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  elsif q.expires_at is not null and q.expires_at < now() then
    update public.quotations
       set status = 'expired',
           events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
     where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  elsif q.status not in ('sent','viewed') then
    return jsonb_build_object('status', q.status);
  else
    update public.quotations
       set status = 'approved',
           approved_at = now(),
           approval_signature = coalesce(p_signature, approval_signature),
           approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
           events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'type', 'approved',
             'at', now(),
             'note', case when nullif(trim(p_signer_name), '') is not null
                          then 'נחתם על ידי ' || trim(p_signer_name) end
           ))
     where id = q.id;

    v_req_id := public.open_quotation_representation(q.id);
    select (r.created_at < now() - interval '10 seconds') into v_reused
      from public.representation_requests r where r.id = v_req_id;
  end if;

  -- ‼ open_quotation_representation היא שיוצרת/מקשרת את כרטיס הלקוח ומעדכנת
  -- את quotations.client_id. העותק המקומי q נקרא לפניה ולכן מיושן — קוראים
  -- מחדש. בלי זה השחרור למטה היה מקבל client_id ריק על הצעה תקינה לחלוטין.
  select client_id into v_client from public.quotations where id = q.id;

  -- ── ההתקשרות, החיובים ומסלול הקליטה — חלק מהאישור, לא תופעת לוואי ────────
  -- ‼ הערך המוחזר נבדק. זה בדיוק מה שלא נעשה עד היום: הכשל הרך היה מחזיר
  -- {ok:false} ואיש לא הסתכל.
  v_eng := public.create_engagement_for_quotation(q.id, false);
  if coalesce(v_eng->>'ok', 'false') <> 'true' then
    raise exception 'approval_incomplete: engagement (%) עבור הצעה %',
      coalesce(v_eng->>'error', 'unknown'), coalesce(q.quotation_number, q.id)
      using errcode = 'data_exception';
  end if;

  -- ‼ בדיקת-על: הפונקציה טענה שיצרה התקשרות — מוודאים שהשורה באמת שם.
  -- chargesOnly (הצעת one_time על התקשרות קיימת) אינה יוצרת התקשרות, ולכן
  -- אינה נבדקת. זו ההבחנה שמונעת גם "false negative" וגם "false positive".
  v_eng_id := v_eng->>'engagementId';
  if v_eng_id is not null
     and not exists (select 1 from public.engagements e where e.id = v_eng_id) then
    raise exception 'approval_incomplete: engagement % נעלמה אחרי היצירה', v_eng_id
      using errcode = 'data_exception';
  end if;

  -- ── בקשות שהוחזקו עד האישור נפתחות עכשיו ─────────────────────────────────
  -- ‼ גם כאן הערך נבדק. בקשה שנשארה מוחזקת אחרי אישור היא בדיוק אותה סתירה:
  -- הלקוח אושר, והמשרד רואה בקשות שלא נפתחו לו.
  if v_client is not null then
    v_rel := public.release_requests_held_until_approval(v_client);
    if coalesce(v_rel->>'ok', 'false') <> 'true' then
      raise exception 'approval_incomplete: release (%) עבור לקוח %',
        coalesce(v_rel->>'error', 'unknown'), v_client
        using errcode = 'data_exception';
    end if;
  end if;

  select r.onboarding_token, coalesce(r.onboarding_status, 'pending') = 'pending'
    into v_token, v_needs
    from public.representation_requests r where r.id = v_req_id;

  return jsonb_build_object(
    'status', 'approved',
    'onboardingToken', case when coalesce(v_needs, false) then v_token end,
    'repReused', coalesce(v_reused, false)
  );
end;
$function$;

comment on function public.approve_quotation(text, text, text) is
  'אישור הצעה מקישור ציבורי. גבול הצלחה אחד: ההצעה מסומנת "אושרה" רק אם נוצרו גם ההתקשרות, החיובים ומסלול הקליטה, והבקשות שהוחזקו נפתחו. כישלון בכל אחד מהם מגלגל את הכל אחורה ומחזיר שגיאה — ראה מיגרציה 161. אידמפוטנטית: לחיצה חוזרת משלימה את החסר ולא מכפילה.';

-- ‼ ההרשאה נשמרת בדיוק כפי שהייתה — הדף הציבורי חייב להריץ אותה.
-- (מיגרציה 160 מחזיקה את הרשימה הסגורה של מה שמותר ל-anon; approve_quotation בה.)
grant execute on function public.approve_quotation(text, text, text) to anon, authenticated;
