-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 264 · «סבב אחד» — תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (20.10.2026)
-- ‼ למה: בדיקת השלמות (docs/plans/2026-10-20-simplicity-roadmap.md §5) — השאלון של הדוח השנתי לא נגמר בסבב אחד:
--   «כן» לכספים מביטוח לאומי ⇒ «דמי לידה?» רק בסבב הבא; «עדיין יש ביטוח חיים» ⇒ האישור השנתי בסבב הבא; «החשבון היה
--   קיים ב-2025» ⇒ ה-867 בסבב הבא. המשרד היה צריך ללחוץ «הכן ופרסם» שוב ושוב.
-- ‼ מה: המשרד מכין מראש, בתוך כל שאלה, מה שתשובה חיובית בה פותחת (prompt.onYes — src/features/taxYear/oneRound.ts).
--   כאן השרת פותח את זה כשהלקוח עונה: «כן» · «זה עדיין נכון» · «מי מכם?» שאינו «אף אחד» (רק לתפקיד שנבחר, ומה שלשניכם)
--   · תחולה «כל השנה / חלק». צילום שנשמר בזמן ההכנה — כמו followUps של 262 (לא נוסח מהדפדפן); פריט לא מוכר — מדולג;
--   פעם אחת לזהות (האינדקס של 229). אותו כלל בדפדפן: asks.ts › onYesFor.
-- ‼ החלפת גוף בלבד, בלי סכמה ובלי נתונים. עוגן: שורת הערה אחת, פעם אחת בגוף (נבדק 20.10 ב-staging ובייצור, md5 f2d84536…).
-- חזרה: scripts/sql/264/rollback-264.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$  -- כשאין עוד שאלות פתוחות — הכדור חוזר למשרד (לבדיקה). מסמך «אין עדיין» אינו חוסם.
$blk$;
  n1 text := $blk$  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.
  if jsonb_typeof(a.prompt->'onYes') = 'array' and (
       v_kind in ('yes', 'unchanged')
       or (v_kind = 'who' and coalesce(p_answer->>'value', '') in ('client', 'spouse', 'both'))
       or (v_kind = 'record' and coalesce(p_answer->>'assertion', '') <> 'changed'
           and jsonb_typeof(p_answer->'value') = 'object' and coalesce(p_answer->'value'->>'inPeriod', '') in ('all', 'part'))) then
    for v_fu in select value from jsonb_array_elements(a.prompt->'onYes') loop
      if jsonb_typeof(v_fu) = 'object' and (v_items ? (v_fu->>'itemKey')) and coalesce(v_fu->>'subjectRole', '') in ('client', 'spouse', 'couple')
         and jsonb_typeof(v_fu->'prompt') = 'object' and nullif(v_fu->'prompt'->>'title', '') is not null
         and (v_kind <> 'who' or v_fu->>'subjectRole' = 'couple' or p_answer->>'value' = 'both' or v_fu->>'subjectRole' = p_answer->>'value') then
        insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
        values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_fu->>'itemKey', v_items->>(v_fu->>'itemKey'),
                v_fu->>'subjectRole', nullif(v_fu->>'entityKind', ''), nullif(v_fu->>'entityRef', ''), v_fu->'prompt', 'published')
        on conflict do nothing;
      end if;
    end loop;
  end if;
  -- כשאין עוד שאלות פתוחות — הכדור חוזר למשרד (לבדיקה). מסמך «אין עדיין» אינו חוסם.
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('264 · «סבב אחד»' in v_def) > 0 then raise notice '264: portal_submit_tax_info — כבר הוחל'; return; end if;
  if position('262 · כמה שאלות המשך' in v_def) = 0 then raise exception '264: 262 לא הוחלה — להחיל 262 לפני 264'; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '264: העוגן (הערת «כשאין עוד שאלות פתוחות») לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%264 · «סבב אחד»%' from pg_proc where proname = 'portal_submit_tax_info';
