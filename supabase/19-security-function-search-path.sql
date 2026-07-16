-- ═══════════════════════════════════════════════════════════════════════════
--  19 — נעילת search_path בפונקציות מספור ההצעות  ·  שלב 1 באבטחה
-- ═══════════════════════════════════════════════════════════════════════════
--  אזהרת הסורק (function_search_path_mutable): פונקציה ללא search_path קבוע
--  יכולה להיות מושפעת מ-search_path של הקורא. מקבעים ל-public (שאר הפונקציות
--  שלנו כבר עושות זאת). תיקון היגייני, לא משנה התנהגות.
-- ═══════════════════════════════════════════════════════════════════════════

alter function public.next_quotation_number(uuid) set search_path = public;
alter function public.assign_quotation_number() set search_path = public;
