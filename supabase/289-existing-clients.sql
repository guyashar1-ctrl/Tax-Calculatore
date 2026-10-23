-- ═══════════════════════════════════════════════════════════════════════════
-- 289 · לקוחות קיימים — פייפרלס ראשון וגם בעסק חדש (23.10.2026, באישור גיא)
--
-- ‼ גיא, 23.10.2026: «תעשה את זה גם ללקוחות קיימים», ואישר במפורש את הרשימה:
--   1 · ליאת — ההרשמה לפייפרלס (נעולה על פתיחת התיקים לפי 234) נפתחת עכשיו. שורה ביומן.
--   2 · קבוצת הפייפרלס ראשונה בדף — אמיר, אילן, רותי, ליאת, ושני הכרטיסים «מייל» ו«ממתין».
--      (הרשמה · פרטי העסק · חיבור · חיבור לרשות המסים · הרשאת התשלום — כמו בלקוח חדש.)
-- ‼ לא שולח מייל ולא מפרסם: published_at לא נוגע. sort_order ו-locked→pending לא מעלים את
--   client_content_version (onboarding_step_content_version_trg). פתיחה של בקשה שכבר בדף
--   מופיעה במגש של המשרד כהצעה בלבד — גיא שולח בעצמו.
-- ‼ גיבוי לפני: backup_r289b_20261023 (onboarding_steps, onboarding_step_dependencies).
-- ‼ מזהים קבועים של הייצור: ב-staging לא משנה דבר (בדיקת תחביר בלבד).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · ליאת: ההרשמה לפייפרלס לא מחכה לפתיחת התיקים ──────────────────────────
with target as (
  select s.* from public.onboarding_steps s
   where s.client_id = 'dae71e10d41e4d1c9d611eb64912d1ba'
     and s.step_type = 'paperless_invite' and s.status = 'locked'
     and not exists (select 1 from public.onboarding_step_dependencies d
                       join public.onboarding_steps p on p.id = d.depends_on_step_id
                      where d.step_id = s.id and p.step_type <> 'file_opening'
                        and not public.step_satisfies_dependency(p.status, p.payload))
), del as (
  delete from public.onboarding_step_dependencies d
   using target t, public.onboarding_steps p
   where d.step_id = t.id and p.id = d.depends_on_step_id and p.step_type = 'file_opening'
  returning d.step_id
), upd as (
  update public.onboarding_steps s set status = 'pending', updated_at = now()
    from target t where s.id = t.id
  returning s.*
)
select count(*) as opened,
       count(public.log_onboarding_event(u.user_id, u.id, u.engagement_id, 'status_changed', 'system',
         'נפתח: ההרשמה לפייפרלס כבר לא מחכה לפתיחת התיקים (הגבייה עוברת בפייפרלס)',
         jsonb_build_object('from', 'locked', 'to', 'pending', 'migration', 289))) as logged
  from upd u;

-- ── 2 · קבוצת הפייפרלס ראשונה בדף ─────────────────────────────────────────────
update public.onboarding_steps s
   set sort_order = case s.step_type
         when 'paperless_invite' then 1 when 'business_details' then 2 when 'paperless_connection' then 3
         when 'paperless_tax_authority' then 4 when 'retainer_authorization' then 5 end,
       pending_sort_order = case when s.pending_sort_order is null then null else case s.step_type
         when 'paperless_invite' then 1 when 'business_details' then 2 when 'paperless_connection' then 3
         when 'paperless_tax_authority' then 4 when 'retainer_authorization' then 5 end end
 where s.status <> 'cancelled'
   and s.step_type in ('paperless_invite', 'business_details', 'paperless_connection', 'paperless_tax_authority', 'retainer_authorization')
   and s.client_id in ('dae71e10d41e4d1c9d611eb64912d1ba',          -- ליאת
                       '4d95c72da7494d24956d71fc36dfc8ab',          -- אמיר
                       'c0837a0b55dc493ab47a5492987040e9',          -- אילן
                       'c5ead721-f54a-4683-8366-8405ea24c72a',      -- רותי
                       '01fd713d-9823-49ed-b8e7-4e86ec58082d',      -- «מייל»
                       '6852c0e7-fc0b-44f1-95da-bd8ccea4e735');     -- «ממתין»
