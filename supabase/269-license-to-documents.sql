-- ═══════════════════════════════════════════════════════════════════════════
-- 269 · רישיון נהיגה של עסק חדש עובר מבקשת הייצוג ל«מסמכים מהלקוח» (21.10.2026)
--
-- המקרה: ליאת ברנשטיין — עסק חדש שהמשרד פותח. בקשת הייצוג (234/235) ביקשה ממנה
-- ת.ז. וגם רישיון; היא העלתה ת.ז. ובחרה «אעלה מאוחר יותר» על הרישיון, ומכאן «חסר
-- צילום תעודה: ליאת - רישיון נהיגה» בכרטיס — כאילו הייצוג תקוע. הכרעות גיא:
--   · בקשת הייצוג מבקשת רק תעודה מזהה לכל אדם — מה שהרשות צריכה.
--   · עסק חדש שהמשרד פותח ⇒ «צילום רישיון נהיגה» נכנס לבד לבקשת «מסמכים מהלקוח».
--   · רישיון שכבר הגיע (בייצוג או בכל דרך) ⇒ הפריט נסגר כ«התקבל» ולא מתבקש שוב —
--     sync_identity_docs_to_client_documents כבר עושה את זה לפי המפתח drivers_license.
--   · ללקוח שאין לו רישיון — המשרד מסיר את הפריט מהבקשה (⋯), כמו כל פריט.
--
-- ‼ לקוחות קיימים: שום פריט קיים לא משתנה (ליאת — הפריט נשאר, באישור גיא). השינוי חל על
--   בקשות מסמכים שייווצרו מעכשיו, ועל «אעלה מאוחר יותר» מעכשיו (רק פריט תעודה מזהה).
-- ‼ שום דבר כאן לא שולח מייל ולא מפרסם לדף של לקוח.
-- ‼ עוגן יחיד (pg_get_functiondef + replace) עם כשל קולני — כמו 234. להריץ דרך execute_sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · כלי הטלאי (זמני — נמחק בסוף הקובץ) ──────────────────────────────────
create or replace function public._r269_patch(p_fn regprocedure, p_old text, p_new text, p_expected int default 1)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  -- כבר הוחל (הרצה חוזרת): הטקסט החדש כבר בגוף, או שהעוגן שנמחק כבר לא שם.
  if (p_new <> '' and position(p_new in v_def) > 0) or (p_new = '' and v_n = 0) then
    return;
  end if;
  if v_n <> p_expected then
    raise exception '269: anchor count % (expected %) in %: %', v_n, p_expected, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · «אעלה מאוחר יותר» בייצוג פותח רק פריט תעודה מזהה — גם בעסק חדש ─────
-- (הענף של 235 שפתח לבעל עסק חדש ת.ז. *וגם* רישיון — יורד.)
select public._r269_patch('public.ensure_identity_document_requests(text,text[])'::regprocedure,
$o$    -- ‼ 235: עסק חדש שהמשרד פותח — מבעל העסק ת.ז. וגם רישיון (234), כל אחד כפריט משלו.
    v_kit := v_person = 'client' and public._client_is_new_business(c.id);
    if v_kit then
      if not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'docKind' = 'idCard') then
        v_items := v_items || jsonb_build_object('key', public.identity_doc_item_key_for(v_person, 'idCard'),
          'label', 'צילום תעודת זהות (שני הצדדים)', 'docKind', 'idCard', 'done', false,
          'source', 'representation_onboarding');
      end if;
      if coalesce((r.identification->'noDriverLicense'->>v_person)::boolean, false) is false
         and not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'docKind' = 'driverLicense') then
        v_items := v_items || jsonb_build_object('key', public.identity_doc_item_key_for(v_person, 'driverLicense'),
          'label', 'צילום רישיון נהיגה', 'docKind', 'driverLicense', 'done', false,
          'source', 'representation_onboarding');
      end if;
      continue;
    end if;
$o$, '');

-- ── 2 · המחולל: עסק חדש ⇒ «צילום רישיון נהיגה» ברשימת המסמכים ───────────────
-- ‼ אחרי שהרשימה נבחרה (של המשרד או המובנית) — כמו כלל הת.ז. של 234 שאחריו. רשימה
--   שכבר כוללת רישיון (המשרד הוסיף בעצמו) — לא נוסף שני.
select public._r269_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$    -- ‼ 234: בקשת הייצוג אוספת את צילום התעודה (מ"ה/מע"מ/ניכויים) — ושם «אעלה מאוחר
$o$, $n$    -- ‼ 269 (גיא, 21.10.2026): עסק חדש שהמשרד פותח ⇒ גם צילום רישיון נהיגה — כאן, לא בבקשת
    -- הייצוג. רישיון שכבר הגיע סוגר את הפריט מעצמו (sync_identity_docs_to_client_documents).
    if v_new_business and not exists (select 1 from jsonb_array_elements(v_docs) d
                                       where d->>'key' = 'drivers_license' or d->>'docKind' = 'driverLicense') then
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'key', 'drivers_license', 'label', 'צילום רישיון נהיגה', 'docKind', 'driverLicense', 'done', false));
    end if;
    -- ‼ 234: בקשת הייצוג אוספת את צילום התעודה (מ"ה/מע"מ/ניכויים) — ושם «אעלה מאוחר
$n$);

-- ── 3 · אימות ────────────────────────────────────────────────────────────────
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.ensure_identity_document_requests(text,text[])'::regprocedure);
  if position('_client_is_new_business' in v_def) > 0 then
    raise exception '269: ensure_identity_document_requests still has the new-business kit';
  end if;
  v_def := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  if position('''key'', ''drivers_license'', ''label'', ''צילום רישיון נהיגה''' in v_def) = 0 then
    raise exception '269: generate_onboarding_steps is missing the license item';
  end if;
end;
$$;

drop function public._r269_patch(regprocedure, text, text, int);
