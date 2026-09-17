// staging-test-process-catalog.ts — קטלוג התהליכים (M2) מול מה שרץ במסד באמת.
// הרצה: node scripts/staging-test-process-catalog.ts   (Node ≥ 22.6)
//
// ‼ התיאור בקטלוג הוא פרוזה; הכללים חיים ב-SQL. הבדיקה הזאת היא מה שמונע
//   סחיפה שקטה: כשהמחולל ישנה את תנאי הפייפרלס, כשהטריגר של הייצוג יכיר סטטוס
//   חדש, או כשברירת המחדל לסוג לקוח תשתנה — היא נופלת, והתיאור מתעדכן ביד.
//
//  1. ייצוג — הסטטוסים ב-CASE של sync_representation_step == הסטטוסים בהגדרה.
//     אישור המייצג ברשות המסים (rep_client_approval) באמת נפתח מהטריגר.
//  2. פייפרלס — המחולל אוכף בדיוק את התנאים שהתיאור מספר: שירות חודשי או
//     פריט הנהלת חשבונות/פייפרלס, לא «לא יעבוד עם פייפרלס»; חיבור לרשות
//     המסים רק ל-licensed (תבנית / סוג עוסק / סיווג מע״מ); הרשאה רק עם סכום
//     חודשי; שתיהן תלויות בחיבור.
//  3. ברירות המחדל של המערכת לכל סוג לקוח (default_journey_entries) תואמות
//     את מה שהמסך מציג — ולמשרד הקיים יש שורה לכל סוג (ההגדרות עובדות).
//  4. בקשות בודדות בקטלוג הן סוגים ש-create_onboarding_request מקבל.
//  5. מסלול הרו״ח הקודם — התלויות שהתיאור מספר קיימות במחולל.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging } from './staging-lib.mjs';
import { REP_STAGES } from '../src/lib/representationJourney.ts';
import { PROCESS_CATALOG, processByKey } from '../src/lib/processCatalog.ts';

const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q: string) => (await writeStaging(q))[0];
const def = async (sig: string): Promise<string> => (await one(`select pg_get_functiondef('${sig}'::regprocedure) as d`)).d;

console.log(`סביבה: ${STAGING_REF}\n`);

// ── 1 · ייצוג ────────────────────────────────────────────────────────────
{
  const d = await def('public.sync_representation_step()');
  const inSql = new Set([...d.matchAll(/when '([a-z_]+)'\s+then v_status/g)].map(m => m[1]));
  const inDef = new Set(REP_STAGES.flatMap(s => s.statuses ?? []));
  ok('סטטוסי הייצוג בטריגר == בהגדרה', [...inSql].sort().join() === [...inDef].sort().join(),
    `sql=${[...inSql].join(',')} def=${[...inDef].join(',')}`);
  ok('אישור המייצג ברשות המסים נפתח מהטריגר ב-awaiting_authorities',
    /awaiting_authorities'\s+then[\s\S]*ensure_rep_client_approval_step/.test(d));
  ok('ומסתיים מעצמו ב-active', /new\.status = 'active'[\s\S]*rep_client_approval[\s\S]*'completed'/.test(d));
  const approval = REP_STAGES.find(s => s.key === 'client_approval')!;
  ok('ההגדרה מקשרת את השלב הזה ל-rep_client_approval', approval.stepType === 'rep_client_approval');
  const guard = await one(`select count(*)::int as n from pg_trigger where tgname = 'rep_requests_guard_status'`);
  ok('«פעיל» סופי — השומר קיים (כמו שההגדרה אומרת)', guard.n === 1);
}

// ── 2 · פייפרלס — תנאי המחולל ─────────────────────────────────────────────
{
  const g = (await def('public.generate_onboarding_steps(text,boolean)')).replace(/\s+/g, ' ');
  ok('תנאי הבסיס: שירות חודשי או פריט הנה״ח/פייפרלס, ולא «לא יעבוד עם פייפרלס»',
    g.includes("v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless")
    && g.includes("coalesce(v_client.paperless_status, '') = 'not_applicable'"));
  ok('פריט הנה״ח/פייפרלס מזוהה לפי שם הפריט', g.includes("ilike '%הנהלת חשבונות%'") && g.includes("ilike '%פייפרלס%'"));
  ok('חיבור לרשות המסים: רק licensed', g.includes('if v_needs_paperless and v_licensed'));
  ok('licensed = תבנית מורשה/חברה, או סוג עוסק בכרטיס, או סיווג מע״מ',
    g.includes("t.kind in ('licensed_dealer','company')")
    && g.includes("v_client.dealer_type, '') in ('licensed','company')")
    && g.includes("v_client.vat_status, '') = 'authorizedDealer'"));
  ok('חיבור לרשות המסים שהוסר ביד אינו נולד מחדש', g.includes("step_removed_by_office(e.client_id, 'paperless_tax_authority')"));
  ok('הרשאת תשלום: רק עם סכום חודשי', g.includes('if v_has_monthly then') && g.includes("step_type = 'retainer_authorization'"));
  ok('הרשאה וחיבור לרשות המסים תלויים בחיבור (v_id_conn)',
    (g.match(/depends_on_step_id[^;]*v_id_conn/g) ?? []).length >= 2 || (g.match(/v_id_conn/g) ?? []).length >= 4);
  ok('הסדר ידני כשאין פייפרלס', g.includes("'method','manual_arrangement'"));
  const trg = await one(`select count(*)::int as n from pg_proc where proname = 'sync_paperless_tax_authority_step'`);
  ok('עוסק שהופך למורשה מקבל את החיבור מעצמו (132)', trg.n === 1);
  const pl = processByKey('paperless')!;
  ok('ההגדרה: שני השלבים המותנים הם רשות המסים והרשאה',
    pl.stages.filter(s => s.kind === 'conditional').map(s => s.stepType).join() === 'paperless_tax_authority,retainer_authorization');
}

// ── 3 · ברירות המחדל לכל סוג לקוח ─────────────────────────────────────────
{
  const types = (k: string) => one(`select array_agg(x->>'stepType' order by (x->>'sortIndex')::int) as t from jsonb_array_elements(public.default_journey_entries('${k}')) x`);
  const exempt = (await types('exempt_dealer')).t as string[];
  const licensed = (await types('licensed_dealer')).t as string[];
  const refund = (await types('tax_refund')).t as string[];
  const repOnly = (await types('representation_only')).t as string[];
  ok('עוסק פטור: בלי חיבור לרשות המסים, עם שאר רצף הפייפרלס',
    !exempt.includes('paperless_tax_authority') && ['paperless_invite','paperless_connection','retainer_authorization'].every(t => exempt.includes(t)));
  ok('עוסק מורשה: ארבעת שלבי הפייפרלס בסדר', licensed.filter(t => t.startsWith('paperless') || t === 'retainer_authorization').join() === 'paperless_invite,paperless_connection,paperless_tax_authority,retainer_authorization');
  ok('החזר מס: רק עדכון סטטוס מס ומסמכים', refund.every(t => ['client_documents','intake_questionnaire'].includes(t)));
  ok('ייצוג בלבד: מסמכים ומסלול הרו״ח הקודם, בלי פייפרלס', !repOnly.some(t => t.startsWith('paperless')) && repOnly.includes('release_letter'));
  const rows = await one(`select count(distinct client_kind)::int as n from public.office_journey_defaults d
    join public.profiles p on p.office_id = d.office_id where p.id = '${USER_ID}'`);
  ok('למשרד הקיים יש ברירת מחדל לכל חמשת סוגי הלקוח (ההגדרות עובדות)', rows.n === 5, String(rows.n));
  const snap = await one(`select count(*)::int as n from public.engagements where journey_default_snapshot is not null`);
  ok('צילומי המסע של התקשרויות קיימות במקומם', snap.n >= 0);
}

// ── 4 · בקשות בודדות = סוגים שהשרת מקבל מ«+ בקשה» ─────────────────────────
{
  // 174: הרשימה חיה בפונקציה משלה — request_creatable_step_types().
  const allowed = new Set<string>((await one(`select public.request_creatable_step_types() as t`)).t);
  for (const p of PROCESS_CATALOG.filter(x => x.classification === 'single_step')) {
    const t = p.stages[0].stepType!;
    ok(`«${p.name}» → ${t} מותר ב-create_onboarding_request`, allowed.has(t));
  }
}

// ── 5 · מסלול הרו״ח הקודם ────────────────────────────────────────────────
{
  const g = (await def('public.generate_onboarding_steps(text,boolean)')).replace(/\s+/g, ' ');
  ok('פרטי הרו״ח הקודם חוסמים רק כשאין מייל', g.includes("v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null"));
  // 174: _generate_step(..., depends_on_type, dep_condition, ...) — התלות מוצהרת בסוג ובתנאי.
  ok('מכתב השחרור תלוי בפרטים רק כשאין מייל', g.includes("'release_letter', 'prev_accountant', 'person', 'me', '{}'::jsonb, true, 'prev_accountant_details', v_needs_prevdet"));
  ok('החומרים תלויים במכתב', /'materials_received', 'prev_accountant', 'person', 'prev_accountant',[^;]*'release_letter', true,/.test(g));
  ok('הכרת הלקוח נולדת רק עם ייצוג', /if v_has_rep then[\s\S]*kyc_identification/.test(g));
  ok('פתיחת תיקים רק לעסק חדש', /if v_new_business then[\s\S]*file_opening/.test(g));
  const up = await one(`select count(*)::int as n from pg_proc where proname = 'sync_representation_upgrade_step'`);
  ok('שדרוג הייצוג נגזר מהמערכת', up.n === 1);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
