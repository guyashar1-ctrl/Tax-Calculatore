-- צילום מהייצור 12.10.2026 (אחרי 239) של שתי הפונקציות ש-229 (סעיף 12) מזריקה אליהן — לבדיקת סדר ההחלה בבידוד.
-- ‼ מקוצר: סעיף ה-custom_request הארוך הושמט; השורות סביב העוגנים — כפי שהן בייצור.
CREATE OR REPLACE FUNCTION public._client_announceable_steps(p_client_id text)
 RETURNS TABLE(step_id text, step_type text, version integer, announced_version integer, title text, delivery text, run_id text, run_status text, stage_key text, reminder jsonb, announced_at timestamp with time zone, reminder_count integer, last_reminded_at timestamp with time zone, reminder_backoff_until timestamp with time zone, is_document boolean, sort_key integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.step_type, s.client_content_version, coalesce(ns.announced_version, 0),
         public._client_step_title(s.step_type, s.payload),
         case when s.step_type = 'rep_client_approval' then 'approve'
              else coalesce(nullif(s.payload->>'delivery', ''), 'approve') end,
         s.flow_run_id, r.status, s.flow_stage_key,
         case when s.step_type <> 'rep_client_approval' and jsonb_typeof(s.payload->'reminder') = 'object'
              then s.payload->'reminder' end,
         ns.announced_at, coalesce(ns.reminder_count, 0), ns.last_reminded_at, ns.reminder_backoff_until,
         (s.step_type = 'custom_request' and not (s.payload ? 'shaamIdentity')
           and (nullif(s.payload->>'clientResource', '') is not null
                or jsonb_typeof(s.payload->'clientResources') = 'array')),
         coalesce(s.pending_sort_order, s.sort_order, 0), s.created_at
    from public.onboarding_steps s
    left join public.client_step_notice_state ns on ns.step_id = s.id
    left join public.flow_runs r on r.id = s.flow_run_id
   where s.client_id = p_client_id
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
     and s.published_at is not null
     and public.client_step_gate_open(p_client_id, s.published_at)
     and coalesce(s.pending_cancel, false) = false
     and s.step_type in ('client_documents', 'custom_request', 'paperless_tax_authority',
                         'paperless_invite', 'prev_accountant_details', 'rep_client_approval',
                         -- 239 · ייפוי הכוח — רק כשהלקוח צריך לחתום עליו עכשיו
                         'representation',
                         -- ‼ 220 · פרטי העסק — רק כשהיא אצל הלקוח (לא בבדיקת המשרד).
                         'business_details')
     and (s.step_type <> 'representation' or public._rep_signing_open(s.client_id))
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')
     and (s.step_type <> 'rep_client_approval'
          or (coalesce(s.payload->>'requiredBy', '') = 'shaam'
              and coalesce(s.ball, 'client') = 'client'
              and nullif(s.payload->>'clientDeclaredAt', '') is null))
     and coalesce(s.payload->>'delivery', '') <> 'page';
$function$;

CREATE OR REPLACE FUNCTION public._client_step_portal_key(p_step_id text, p_step_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_step_type
           when 'client_documents' then 'docs'
           when 'custom_request' then 'custom_' || p_step_id
           when 'prev_accountant_details' then 'prev_details'
           when 'paperless_invite' then 'paperless_signup'
           when 'paperless_tax_authority' then 'paperless_tax'
           when 'business_details' then 'business_details'
           when 'rep_client_approval' then 'rep_approval'
           -- 239 · החתימה על ייפוי הכוח — אותו מפתח שהדף נותן לפריט (_portal_rep_item)
           when 'representation' then 'rep_sign'
         end;
$function$;
