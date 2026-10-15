-- ════════════════════════════════════════════════════════════════════════════
-- 244 · ביטול 243 — «PIVO השבוע» עבר למפת הדרך — 15.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- גיא, 15.10: «PIVO השבוע» שייך לכרטיס השבוע במפת הדרך (public/vision/index.html), לא לעמוד
-- ב«המשרד». הטקסט נשמר עכשיו עם השבוע עצמו ב-vision_docs (live[שבוע].pivo / weeks[שבוע].pivo).
-- ‼ שומר על תוכן: אם נכתבה שורה אחת לפחות — עוצרים ולא מוחקים (ב-15.10 הטבלה ריקה בייצור וב-staging).
-- ‼ להחיל אחרי שפונקציית weekly-backup נפרסה בלי הטבלה (scope.ts), אחרת גיבוי שרץ ביניהם מסומן «חלקי».
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.pivo_weekly_notes') is null then return; end if;
  if exists (select 1 from public.pivo_weekly_notes) then
    raise exception 'pivo_weekly_notes is not empty — move its rows to vision_docs before dropping';
  end if;
  drop table public.pivo_weekly_notes;
  drop function if exists public._pivo_weekly_notes_touch();
end $$;
