-- 79 — שלבי-על בתיק הלקוח (CASE → STAGE → TASK)
--
-- מודל "מרכז התיק" מציג את המסע כהיררכיה: תיק ← שלב-על ← בקשות/משימות ←
-- דרישות. עד היום הקיבוץ היחיד היה track (נגזר מסוג השלב, לא ניתן לעריכה).
-- הטבלה החדשה נותנת לגיא שלבים בעלי שם וסדר ("קליטת הלקוח", "חומרים מהרו"ח
-- הקודם", "עבודה שוטפת"), וכל בקשה יכולה להשתייך לשלב.
--
-- עקרונות:
-- 1. לשלב-על אין עמודת סטטוס — מצבו (פעיל / הושלם / עתידי) נגזר תמיד ממצב
--    הבקשות שבתוכו. אין מה שיסתנכרן לא נכון.
-- 2. stage_id הוא רשות. בקשה בלי שלב מוצגת תחת שלב ברירת-מחדל שנגזר
--    מה-track שלה בצד התצוגה — כל הנתונים הקיימים ממשיכים לעבוד בלי backfill.
-- 3. מחיקת שלב אינה מוחקת בקשות — stage_id שלהן מתאפס והן חוזרות לשלב
--    ברירת-המחדל (on delete set null).
-- 4. ניהול השלבים עצמם (יצירה/שינוי שם/סדר/מחיקה) — ישירות דרך RLS, כמו
--    journey_templates. שיוך בקשה לשלב — דרך RPC בלבד, כי onboarding_steps
--    מנוהלת לפי המוסכמה "אין UPDATE ישיר מהאפליקציה".

-- ── 1. הטבלה ─────────────────────────────────────────────────────────────────

create table if not exists public.journey_stages (
  id          text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   text not null references public.clients(id) on delete cascade,
  engagement_id text references public.engagements(id) on delete set null,
  title       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists journey_stages_client_idx
  on public.journey_stages (client_id, sort_order);

alter table public.journey_stages enable row level security;

drop policy if exists journey_stages_own on public.journey_stages;
create policy journey_stages_own on public.journey_stages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists journey_stages_require_authorized on public.journey_stages;
create policy journey_stages_require_authorized on public.journey_stages
  as restrictive for all
  using (public.is_authorized()) with check (public.is_authorized());

drop trigger if exists trg_journey_stages_touch on public.journey_stages;
create trigger trg_journey_stages_touch
  before update on public.journey_stages
  for each row execute function public.set_updated_at();

-- ── 2. שיוך בקשה לשלב ────────────────────────────────────────────────────────

alter table public.onboarding_steps
  add column if not exists stage_id text references public.journey_stages(id) on delete set null;

create index if not exists onboarding_steps_stage_idx
  on public.onboarding_steps (stage_id);

comment on column public.onboarding_steps.stage_id is
  'שלב-העל בתיק (journey_stages). null = מוצג תחת שלב ברירת-מחדל שנגזר מה-track בצד התצוגה.';

create or replace function public.set_onboarding_step_stage(
  p_step_id text,
  p_stage_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s  public.onboarding_steps%rowtype;
  st public.journey_stages%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_stage_id is not null then
    select * into st from public.journey_stages where id = p_stage_id;
    if st.id is null or st.client_id <> s.client_id then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  update public.onboarding_steps set stage_id = p_stage_id where id = s.id;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.set_onboarding_step_stage(text, text) from public, anon;
grant execute on function public.set_onboarding_step_stage(text, text) to authenticated;
