-- ─── 11: רו"ח קודם על הליד ──────────────────────────────────────────────────
-- שחרור מרו"ח קודם רלוונטי רק אם הליד עובר מרו"ח אחר (החלטת גיא, 2026-07-15).
-- נרשם על הליד. אחרי אישור והמרה ללקוח — מכינים מכתב שחרור, שולחים,
-- והמייל נשמר במסמכי הלקוח (ראה זרימת השחרור בקוד).

alter table public.leads add column if not exists has_previous_accountant boolean not null default false;
alter table public.leads add column if not exists prev_accountant_name  text;
alter table public.leads add column if not exists prev_accountant_email text;
alter table public.leads add column if not exists prev_accountant_phone text;
