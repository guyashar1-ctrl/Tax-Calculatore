-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 254 · היכרות שנשלחת לבד — פתיחת הקליטה מוסיפה את השאלות ומפרסמת אותן בדף הלקוח, בפעולה אחת
-- 17.10.2026 · docs/PLAN-ONE-REQUEST-TAX-FILE-2026-10-16.md — שלב 1 («שורה אחת, והיכרות שנשלחת לבד»)
--
--   עד עכשיו המשרד פתח קליטה (236), ואז בשורה: «הוסף שאלות» ← «פרסם את השאלות בדף». שתי לחיצות שלא אומרות
--   למשרד כלום (השאלות נגזרות מהכרטיס — picture.ts / asks.ts). גיא: «כשנפתחת היכרות — השאלון כבר אצל הלקוח».
--
--   ensure_tax_file_intake(p_client_id, p_asks) — אותה פתיחה של 236 (אידמפוטנטית, נעילה, בקשה פתוחה אחת ללקוח),
--   ואחריה, באותה טרנזקציה: add_tax_info_asks (229/230/236/241 — פריט פתוח לא נוסף פעמיים, פריט לא מוכר נדחה)
--   ואז publish_tax_info (229 — טיוטה ⇒ מפורסם; שאלות חדשות לשאלון שכבר פורסם מעלות את גרסת התוכן).
--   הקריאה חוזרת? מוסיפה רק מה שחסר ומפרסמת רק מה שבטיוטה. בלי שאלות (p_asks ריק) — כמו 236, ובנוסף טיוטה
--   שכבר קיימת מתפרסמת.
--
-- ‼ השאלות עצמן (נוסח, סוג קלט, «של מי») נבנות בדפדפן מהמנוע הקיים (buildAskPlan) — השרת אינו מנוע שני;
--   הוא מאמת (פריט מוכר, תכלית קליטה, סוג קלט) ושומר. ‼ אין כאן מייל: הפריט מופיע ב«הדף של X» כמו כל בקשה;
--   השליחה היא «פרסם את הדף» הקיים (כלל «דף אחד ללקוח»). ‼ אין שינוי בטבלאות ובנתונים קיימים.
-- ‼ ensure_tax_file_intake(text) של 236 נשארת כמות שהיא (קריאה בלי שאלות — למשל מתיק המס) — overload בשם
--   הפרמטרים (PostgREST בוחר לפי שמות הארגומנטים). כשל בהוספת השאלות ⇒ exception ⇒ גם הפתיחה מתגלגלת אחורה.
-- בידוד: scripts/sql/254/test-254.pglite.mjs · staging: scripts/sql/254/apply-staging.mjs · חזרה: scripts/sql/254/rollback-254.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $pre254$
begin
  if to_regprocedure('public.ensure_tax_file_intake(text)') is null then raise exception '254: 236 לא הוחלה (ensure_tax_file_intake חסרה)'; end if;
  if to_regprocedure('public.add_tax_info_asks(text, jsonb)') is null or to_regprocedure('public.publish_tax_info(text)') is null then
    raise exception '254: 229 לא הוחלה (add_tax_info_asks / publish_tax_info חסרות)';
  end if;
  if pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) not like '%236 · קליטה%' then
    raise exception '254: add_tax_info_asks בלי ההזרקה של 236 — להחיל 236 לפני 254';
  end if;
end
$pre254$;

create or replace function public.ensure_tax_file_intake(p_client_id text, p_asks jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r        jsonb;
  a        jsonb;
  pub      jsonb;
  v_info   text;
  v_added  int := 0;
  v_pub    int := 0;
  v_asks   jsonb := case when p_asks is not null and jsonb_typeof(p_asks) = 'array' then p_asks else '[]'::jsonb end;
  v_skipped int := 0;
begin
  r := public.ensure_tax_file_intake(p_client_id);
  if coalesce(r->>'ok', 'false') <> 'true' then return r; end if;

  select id into v_info from public.onboarding_steps
   where client_id = p_client_id and step_type = 'info_collection' and payload->>'parentStepId' = r->>'stepId'
     and status <> all (array['completed','verified','skipped','cancelled','failed'])
   limit 1;

  -- ‼ פתיחה אינה תיקון: שאלה שהלקוח כבר ענה עליה בשאלון הזה לא נשאלת שוב מכאן (האינדקס הייחודי של 229 חוסם רק
  --   שאלה פתוחה כפולה). «החזר ללקוח לתיקון» ממשיך דרך add_tax_info_asks ישירות, עם מה שצריך לתקן.
  if v_info is not null and jsonb_array_length(v_asks) > 0 then
    select coalesce(jsonb_agg(z), '[]'::jsonb) into v_asks
      from jsonb_array_elements(v_asks) z
     where not exists (select 1 from public.tax_info_asks x
                        where x.step_id = v_info and x.state = 'answered'
                          and x.item_key = z->>'itemKey' and x.subject_role = coalesce(z->>'subjectRole', '')
                          and coalesce(x.entity_ref, '') = coalesce(z->>'entityRef', ''));
    v_skipped := jsonb_array_length(coalesce(p_asks, '[]'::jsonb)) - jsonb_array_length(v_asks);
  end if;

  if jsonb_array_length(v_asks) > 0 then
    a := public.add_tax_info_asks(r->>'stepId', v_asks);
    -- ‼ הכול או כלום: פתיחה בלי השאלות הייתה משאירה «היכרות» ריקה שאף אחד לא רואה
    if coalesce(a->>'ok', 'false') <> 'true' then
      raise exception '%', coalesce(a->>'error', 'asks_failed') using errcode = 'P0001', detail = coalesce(a->>'itemKey', '');
    end if;
    v_info := a->>'infoStepId';
    v_added := coalesce((a->>'added')::int, 0);
  end if;

  if v_info is not null then
    pub := public.publish_tax_info(v_info);
    -- nothing_to_publish = אין טיוטה ואין מפורסם (שאלון ריק) — לא שגיאה: אין מה להראות ללקוח
    if coalesce(pub->>'ok', 'false') = 'true' then v_pub := coalesce((pub->>'published')::int, 0);
    elsif coalesce(pub->>'error', '') <> 'nothing_to_publish' then
      raise exception '%', coalesce(pub->>'error', 'publish_failed') using errcode = 'P0001';
    end if;
  end if;

  if v_added > 0 or v_pub > 0 then
    update public.onboarding_steps
       set payload = jsonb_set(payload, '{history}', coalesce(payload->'history', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'questions_published', 'added', v_added, 'published', v_pub))),
           updated_at = now()
     where id = r->>'stepId';
  end if;

  return r || jsonb_strip_nulls(jsonb_build_object('infoStepId', v_info, 'asked', v_added, 'published', v_pub, 'alreadyAnswered', nullif(v_skipped, 0)));
end $$;

revoke all on function public.ensure_tax_file_intake(text, jsonb) from public, anon;
grant execute on function public.ensure_tax_file_intake(text, jsonb) to authenticated;
