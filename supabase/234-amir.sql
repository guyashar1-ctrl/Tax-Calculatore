-- ═══════════════════════════════════════════════════════════════════════════
-- 234-amir · החלת כלל «עסק חדש שהמשרד פותח» (234) על אמיר ויסמרק — ייצור בלבד, חד-פעמי
--
-- באישור גיא (12.10.2026: «תתקן את זה גם אצל אמיר»). אחרי 234. אידמפוטנטי ושומר:
-- כל שינוי רק אם המצב עדיין כפי שנבדק ב-12.10 (שום פריט לא הועלה, ההרשמה לא בוצעה).
--   1. הכרטיס: business_transfer=false — הליד לא סומן, אבל המשרד מקים לו עסק (פתיחת תיקים פתוחה).
--   2. «מסמכים מהלקוח»: בלי «תעודת עוסק» (תוצר הפתיחה) ובלי «צילום תעודת זהות» (נאסף בייפוי
--      הכוח) — כעריכה ממתינה (draft_payload): הלקוח רואה אותה רק אחרי «עדכן את דף הלקוח».
--   3. «הרשמה לפייפרלס»: נעולה על «פתיחת התיקים ברשויות» (כמו כל עסק חדש מעכשיו). ‼ שינוי מצב
--      ולא נוסח — חל מיד: בדף שלו ההרשמה עוברת ל«בהמשך». החיבור והרשאת התשלום כבר ממתינים לה.
-- ‼ לא נשלח מייל ולא מתפרסם כלום מעבר לכך.
-- ═══════════════════════════════════════════════════════════════════════════
do $amir$
declare
  v_client constant text := '4d95c72da7494d24956d71fc36dfc8ab';
  v_docs_step constant text := '0a82bfcd52cc4656a5267e77616a0b30';
  v_invite constant text := 'b1019b4b0ebf4d2ba2926389f4b91a49';
  v_fo constant text := '5c7ac69b8a1a4ec7b17a5b12c729b28d';
  s public.onboarding_steps%rowtype;
  v_docs jsonb;
begin
  if not exists (select 1 from public.clients where id = v_client and last_name = 'ויסמרק') then
    raise exception '234-amir: הלקוח לא נמצא';
  end if;

  update public.clients set business_transfer = false, updated_at = now()
   where id = v_client and business_transfer is null;

  select * into s from public.onboarding_steps
   where id = v_docs_step and client_id = v_client and status = 'pending' and draft_payload is null;
  if s.id is not null
     and not exists (select 1 from jsonb_array_elements(s.payload->'checklist') d where coalesce((d->>'done')::boolean, false)) then
    select jsonb_agg(d order by o) into v_docs
      from jsonb_array_elements(s.payload->'checklist') with ordinality x(d, o)
     where d->>'key' not in ('vat_cert', 'id_card');
    if v_docs is not null and jsonb_array_length(v_docs) > 0 then
      update public.onboarding_steps
         set draft_payload = jsonb_build_object(
               'checklist', v_docs,
               'clientTitle', public._documents_title(jsonb_array_length(v_docs)),
               'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d)),
             updated_at = now()
       where id = s.id;
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
        'עסק חדש שהמשרד פותח (234): הוסרו «תעודת עוסק» (תוצר הפתיחה) ו«צילום תעודת זהות» (נאסף בייפוי הכוח). ממתין ל«עדכן את דף הלקוח».',
        jsonb_build_object('rule', '234', 'removed', jsonb_build_array('vat_cert', 'id_card')));
    end if;
  end if;

  select * into s from public.onboarding_steps
   where id = v_invite and client_id = v_client and status = 'pending';
  if s.id is not null and exists (select 1 from public.onboarding_steps f
                                   where f.id = v_fo and f.client_id = v_client
                                     and not public.step_satisfies_dependency(f.status, f.payload)) then
    update public.onboarding_steps
       set status = 'locked', depends_on_step_id = v_fo, updated_at = now()
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'עסק חדש שהמשרד פותח (234): ההרשמה לפייפרלס תיפתח אחרי פתיחת התיקים ברשויות',
      jsonb_build_object('rule', '234', 'from', 'pending', 'to', 'locked'));
  end if;

end;
$amir$;

select s.step_type, s.status, s.depends_on_step_id, s.draft_payload->>'clientTitle' as draft_title
  from public.onboarding_steps s
 where s.client_id = '4d95c72da7494d24956d71fc36dfc8ab'
   and s.step_type in ('client_documents', 'paperless_invite', 'business_details', 'file_opening')
 order by s.step_type;
