import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reuse the existing local connection config in place; never copy credentials into a worktree.
const configRoot = process.argv[2] ? resolve(process.argv[2]) : root;
const { writeStaging, assertTriggersEnabled } = await import(pathToFileURL(resolve(configRoot, 'scripts/staging-lib.mjs')));
await assertTriggersEnabled();
const test = readFileSync(resolve(root, 'scripts/sql/291-test-quotation-dealer-default.sql'), 'utf8');
// Same backfill, restricted to this transaction's fixtures. Keep the outer rollback.
const backfill = readFileSync(resolve(root, 'scripts/sql/291-backfill-quotation-dealer-default.sql'), 'utf8')
  .replace(/^begin;$/m, '').replace(/^commit;$/m, '')
  .replace("where nullif(btrim(c.dealer_type),'') is null", "where c.id like 'test291-%' and nullif(btrim(c.dealer_type),'') is null");
const final = `
do $$ begin
  if not exists (select 1 from results_291 where result->>'action'='updated') then raise exception 'backfill did not update fixture'; end if;
  insert into test_291_results values ('backfill fills missing type without requests/messages/jobs',true);
end; $$;
drop table before_291_clients,before_291_counts,results_291;
${backfill}
do $$ begin
  if exists (select 1 from results_291 where result->>'action'='updated') then raise exception 'backfill is not idempotent'; end if;
  insert into test_291_results values ('backfill repeat changes nothing',true);
end; $$;
select * from test_291_results; rollback;`;
const results = await writeStaging(test.replace('select * from test_291_results;\nrollback;', () => backfill + final));
if (!Array.isArray(results) || results.length < 24 || results.some(r => r.ok !== true)) throw new Error(JSON.stringify(results));
console.log(`${results.length} staging checks passed; all fixtures rolled back.`);
for (const r of results) console.log(`PASS ${r.name}`);
