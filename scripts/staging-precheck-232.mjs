// בדיקה מקדימה לפני 232 — קריאה בלבד.
import { STAGING_REF, api, writeStaging } from './staging-lib.mjs';
const q = async (s) => (await writeStaging(s)) ?? [];
const p = await api(`/projects/${STAGING_REF}`);
console.log('פרויקט:', p.name, p.ref, p.status);
console.log('231:', await q(`select proname, pg_get_function_identity_arguments(oid) a from pg_proc where proname in ('save_tax_estimate','approve_tax_estimate','_tax_estimate_immutable') order by 1`));
console.log('עמודות פרסום קיימות?', await q(`select column_name from information_schema.columns where table_name='tax_estimates' and column_name in ('published_at','published_by','revision')`));
console.log('שורות tax_estimates:', await q(`select count(*)::int n from public.tax_estimates`));
const cnt = async (fn, sig, needle) => (await q(`select (length(d) - length(replace(d, ${"$n$" + needle + "$n$"}, ''))) / length(${"$n$" + needle + "$n$"}) as n from (select pg_get_functiondef('public.${fn}(${sig})'::regprocedure) d) x`))[0]?.n;
console.log('עוגן _portal_step_items (צריך 1):', await cnt('_portal_step_items', 'public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb', "    else\n      exit step_body;\n    end case;"));
console.log('ענף 232 כבר קיים?', await q(`select prosrc like '%232 · הערכת מס%' x from pg_proc where proname='_portal_step_items'`));
console.log('עוגן announceable (צריך 1):', await cnt('_client_announceable_steps', 'text', "'info_collection')\n     and (s.step_type <> 'business_details'"));
console.log('עוגן portal_key (צריך 1):', await cnt('_client_step_portal_key', 'text, text', "when 'info_collection' then 'taxinfo_' || p_step_id"));
console.log('תלויות:', await q(`select proname from pg_proc where proname in ('_tax_year_client','_portal_client','is_authorized') order by 1`));
console.log('בקשות tax_estimate פתוחות:', await q(`select count(*)::int n from public.onboarding_steps where step_type='tax_estimate'`));
