#!/usr/bin/env node
// ─── knowledge-answer + 281 מול staging ──────────────────────────────────────
// ‼ staging בלבד. בודק: בלי התחברות ⇒ 401; שאלה ריקה ⇒ 400; שאלה רגילה ⇒ תשובה מכללים קיימים בלבד,
//   או — כשאין ANTHROPIC_API_KEY בשרת — «לא זמין» והשאלה נרשמה (לא הולכת לאיבוד); RLS: הדפדפן לא כותב תשובה.
//   node scripts/staging-test-knowledge-answer.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnv, writeStaging as sql } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/knowledge-answer`;
const corpus = JSON.parse(readFileSync(resolve(ROOT, 'supabase/functions/knowledge-answer/corpus.json'), 'utf8'));
const ids = new Set(corpus.map(r => r.id));
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) throw error;
const jwt = s.session.access_token;
let bad = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) bad++; };
const call = (body, token = jwt) => fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const r0 = await call({ question: 'קרן השתלמות' }, env.VITE_SUPABASE_ANON_KEY);
ok(r0.status === 401, `בלי משתמש ⇒ ${r0.status}`);
const r1 = await call({ question: ' ' });
ok(r1.status === 400, `שאלה ריקה ⇒ ${r1.status}`);

const q = `האם עוסק זעיר מנכה הפקדה לקרן השתלמות? (בדיקה ${Date.now()})`;
const r2 = await call({ question: q });
const j = await r2.json();
if (j.ok) {
  const a = j.answer;
  ok(a.answerable === true, `נמצאה תשובה · ${a.lines.length} שורות · מעמד ${a.status}`);
  ok(a.rules.every(r => ids.has(r.id)), 'כל הכללים קיימים במאגר');
  ok(a.lines.every(l => l.ruleIds.length > 0), 'לכל שורה יש כלל');
  ok(a.rules.some(r => r.text.includes('17(5א)')), 'נשענת על כלל 17(5א)');
  for (const l of a.lines) console.log(`     ${l.mark} · ${l.title} — ${l.detail}`);
  const off = await (await call({ question: 'מה מזג האוויר בתל אביב מחר?' })).json();
  ok(off.ok && off.answer.answerable === false, 'שאלה מחוץ למאגר ⇒ אין תשובה');
  if (j.usage) console.log('     usage', JSON.stringify(j.usage));
} else {
  ok(j.error === 'ai_unavailable' || j.error === 'ai_failed', `השרת לא ענה: ${j.error}${j.reason ? ` (${j.reason})` : ''}`);
}
ok(!!j.questionId, 'השאלה נרשמה');
const [row] = await sql(`select question, answerable, error from public.knowledge_questions where id = '${j.questionId}'`);
ok(row?.question === q, `השורה ביומן: answerable=${row?.answerable} error=${row?.error ?? '—'}`);

// RLS — הדפדפן לא יכול לרשום «תשובה»
const { error: e1 } = await db.from('knowledge_questions').insert({ question: 'ניסיון', answerable: true });
ok(!!e1, 'הדפדפן לא רושם answerable=true');
const { error: e2 } = await db.from('knowledge_questions').insert({ question: 'שאלה כשהשרת לא זמין' });
ok(!e2, 'הדפדפן רושם שאלה «לא נבדקה»');
const { error: e3 } = await db.from('knowledge_inbox').insert({ title: 'בדיקה', status: 'ingested' });
ok(!!e3, '«מה אני לומד»: הדפדפן לא מסמן «נקלט»');
const { data: ib, error: e4 } = await db.from('knowledge_inbox').insert({ title: 'בדיקה — מיסוי בינלאומי' }).select('id').single();
ok(!e4 && ib?.id, '«מה אני לומד»: הוספה');
const { error: e5 } = await db.from('knowledge_inbox').delete().eq('id', ib.id);
ok(!e5, '«מה אני לומד»: הסרה של פריט ממתין');

await sql(`delete from public.knowledge_questions where question like '%(בדיקה %' or question in ('שאלה כשהשרת לא זמין', 'מה מזג האוויר בתל אביב מחר?')`);
console.log(bad ? `\n${bad} נכשלו` : '\nהכול עבר');
process.exit(bad ? 1 : 0);
