#!/usr/bin/env node
// ─── «מה אני לומד» ושאלות פתוחות — לסבב «עדכן עכשיו» (281) ─────────────────────
// ‼ רץ מתוך סבב עדכון הידע ב-Claude Code. כותב רק: סימון «נקלט» לפריט, וסגירה של שאלה. לא נוגע בשום דבר אחר.
// ‼ היעד נקבע מ-.env.local (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — ומודפס בכל הרצה. --staging ⇒ .env.staging.
//
//   node scripts/knowledge-inbox.mjs list
//   node scripts/knowledge-inbox.mjs download <תיקייה>        ← הקבצים של הפריטים הממתינים
//   node scripts/knowledge-inbox.mjs done <id> "<מה נעשה>"
//   node scripts/knowledge-inbox.mjs resolve <questionId> "<איפה נוספה התשובה, או למה אין>"
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './staging-lib.mjs';

const args = process.argv.slice(2).filter(a => a !== '--staging');
const env = loadEnv(process.argv.includes('--staging') ? '.env.staging' : '.env.local');
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('✋ חסר VITE_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
console.log(`יעד: ${URL}`);
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = async (path, init = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, Prefer: 'return=representation', ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};
const [cmd, a, b] = args;

if (cmd === 'list') {
  const inbox = await rest('knowledge_inbox?status=eq.waiting&order=created_at.asc');
  const qs = await rest('knowledge_questions?resolved_at=is.null&or=(answerable.is.null,answerable.eq.false)&order=created_at.asc&select=id,question,answerable,created_at');
  console.log(`\n«מה אני לומד» — ${inbox.length} ממתינים`);
  for (const i of inbox) console.log(`- [${i.id}] ${i.title}${i.note ? ` — ${i.note}` : ''} · ${i.files.length} קבצים`);
  console.log(`\nשאלות פתוחות — ${qs.length}`);
  for (const q of qs) console.log(`- [${q.id}] ${q.question}${q.answerable === null ? ' (לא נבדקה)' : ''}`);
} else if (cmd === 'download') {
  if (!a) { console.error('שימוש: download <תיקייה>'); process.exit(1); }
  const inbox = await rest('knowledge_inbox?status=eq.waiting&order=created_at.asc');
  for (const i of inbox) for (const f of i.files) {
    const r = await fetch(`${URL}/storage/v1/object/knowledge-inbox/${f.path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`✗ ${f.name}: ${r.status}`); continue; }
    const dir = join(a, i.id); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, f.name.replace(/[\\/:*?"<>|]/g, '_')), Buffer.from(await r.arrayBuffer()));
    console.log(`✓ ${i.title} · ${f.name}`);
  }
} else if (cmd === 'done' && a && b) {
  const rows = await rest(`knowledge_inbox?id=eq.${encodeURIComponent(a)}`, { method: 'PATCH', body: JSON.stringify({ status: 'ingested', result: b, ingested_at: new Date().toISOString() }) });
  console.log(rows.length ? `✓ נקלט: ${rows[0].title}` : '✗ לא נמצא');
} else if (cmd === 'resolve' && a && b) {
  const rows = await rest(`knowledge_questions?id=eq.${encodeURIComponent(a)}`, { method: 'PATCH', body: JSON.stringify({ resolved_at: new Date().toISOString(), resolved_note: b }) });
  console.log(rows.length ? `✓ נסגרה: ${rows[0].question}` : '✗ לא נמצאה');
} else {
  console.error('שימוש: list | download <תיקייה> | done <id> "<מה נעשה>" | resolve <id> "<הערה>"  [--staging]');
  process.exit(1);
}
