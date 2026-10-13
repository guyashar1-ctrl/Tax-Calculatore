-- ═══════════════════════════════════════════════════════════════════════════
-- 240 · «אשר והוסף לדף הלקוח» — המגש «עוד לא הגיע» מדבר על החתימה בשמה (12.10.2026)
--
-- הכרעת גיא (docs/CLAUDE-APPROVE-REQUEST-AND-CONSOLIDATED-NOTICE-2026-10-12.md): המשרד
-- מאשר את בקשת הייצוג לדף — היא זמינה לחתימה מיד, בלי מייל — ומחליט בנפרד מתי לשלוח
-- את מייל הדף המרוכז. האישור עצמו הוא prepare_request_for_signing הקיים (208/218,
-- אידמפוטנטי); 239 כבר מכניס את החתימה למייל הדף ומסמן «נשלח» רק מראיה. כאן — רק המגש:
--
--   1. כותרת הפריט במגש לשלב הייצוג היא «חתימה על ייפוי הכוח» (אותה כותרת כמו במייל,
--      _client_step_title) — לא שם התהליך הפנימי.
--   2. owner.pageOpen — האם בקשה שתתפרסם עכשיו תיראה בדף (client_step_gate_open):
--      בקליטה שטרם פורסמה הדף סגור, והמסך אומר את זה במקום להבטיח «זמין בדף».
--
-- ‼ הזרקה לגוף החי (_r240_patch), כמו 239. ‼ שום דבר כאן לא שולח ולא מפרסם.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r240_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  if position(p_new in v_def) > 0 then return; end if;
  if v_n <> 1 then
    raise exception '240: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select public._r240_patch('public.client_ready_to_send(text)'::regprocedure,
  $a$'title', coalesce(nullif(s.payload->>'title', ''), nullif(s.payload->>'clientTitle', '')),$a$,
  $b$'title', case when s.step_type = 'representation' then x->>'title'   -- 240 · «חתימה על ייפוי הכוח»
                       else coalesce(nullif(s.payload->>'title', ''), nullif(s.payload->>'clientTitle', '')) end,$b$);

select public._r240_patch('public.client_ready_to_send(text)'::regprocedure,
  $a$'lastSentAt', v_last_sent,$a$,
  $b$'lastSentAt', v_last_sent,
      -- 240 · בקשה שתתפרסם עכשיו — תיראה בדף? (קליטה שטרם פורסמה ⇒ לא)
      'pageOpen', public.client_step_gate_open(c.id, now()),$b$);

-- 3 · «בדף מ־» של החתימה = מתי אושרה לדף (הכניסה ל«ממתין לחתימה», שמעדכנת את השלב),
--     לא מתי שורת הייצוג נוצרה בדף בתחילת הקליטה.
select public._r240_patch('public.client_ready_to_send(text)'::regprocedure,
  $a$'publishedAt', s.published_at,$a$,
  $b$'publishedAt', case when s.step_type = 'representation'
                         then (select st.updated_at from public.onboarding_steps st where st.id = s.id)
                         else s.published_at end,$b$);

drop function public._r240_patch(regprocedure, text, text);
