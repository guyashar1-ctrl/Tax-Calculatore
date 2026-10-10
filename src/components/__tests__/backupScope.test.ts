// ─── הגיבוי השבועי: כל טבלה במערכת נשמרת, או מוחרגת בכוונה עם סיבה ────────────
// ‼ עד 10.10.2026 רשימת הטבלאות נכתבה ביד ונעצרה ב-23.09: בקשות, הסכמים, הספרייה,
// המסלולים והפגישות לא נשמרו, והמייל השבועי עדיין אמר «הושלם». הבדיקה הזו נופלת
// על כל `create table` ב-supabase/*.sql שלא מופיעה ב-TABLE_SCOPES או ב-EXCLUDED.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { TABLE_SCOPES, TABLES, EXCLUDED, backupObjectName, rowKey } from '../../../supabase/functions/weekly-backup/scope';
import type { TableScope } from '../../../supabase/functions/weekly-backup/scope';

const SQL_DIR = join(process.cwd(), 'supabase');
// רק הקבצים שמוחלים על המסד; supabase/staging-only לעולם לא מגיע לייצור
const createdTables = (): string[] => {
  const out = new Set<string>();
  for (const f of readdirSync(SQL_DIR).filter(n => n.endsWith('.sql'))) {
    const sql = readFileSync(join(SQL_DIR, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) out.add(m[1].toLowerCase());
  }
  return [...out].sort();
};
// נוצרה ידנית בלוח הבקרה לפני שהמיגרציות נשמרו בריפו; קיימת בייצור (נבדק 10.10.2026)
const CREATED_OUTSIDE_REPO = ['email_messages'];
const parentsOf = (s: TableScope): string[] => s.kind === 'via' ? [s.parent] : s.kind === 'any' ? s.of.flatMap(parentsOf) : [];

export const TESTS: TestCase[] = [
  test('כל טבלה במערכת נמצאת בגיבוי או מוחרגת בכוונה', () => {
    const missing = createdTables().filter(t => !(t in TABLE_SCOPES) && !(t in EXCLUDED));
    equal(missing.join(', '), '', 'טבלאות חדשות שלא בגיבוי — להוסיף ל-TABLE_SCOPES או ל-EXCLUDED עם סיבה');
  }),

  test('אין שמות שגויים: כל טבלה בגיבוי קיימת במערכת', () => {
    const all = new Set([...createdTables(), ...CREATED_OUTSIDE_REPO]);
    const unknown = [...TABLES, ...Object.keys(EXCLUDED)].filter(t => !all.has(t));
    equal(unknown.join(', '), '');
  }),

  test('טבלה לא גם נשמרת וגם מוחרגת, ולכל החרגה יש סיבה', () => {
    equal(Object.keys(EXCLUDED).filter(t => t in TABLE_SCOPES).join(', '), '');
    assert(Object.values(EXCLUDED).every(r => r.trim().length > 10), 'סיבה ריקה');
  }),

  test('טבלת הורה נאספת לפני הילדים שלה (via קורא ממה שכבר נאסף)', () => {
    TABLES.forEach((t, i) => parentsOf(TABLE_SCOPES[t]).forEach(p => {
      const at = TABLES.indexOf(p);
      assert(at >= 0 && at < i, `${t} תלויה ב-${p} שמופיעה אחריה`);
    }));
  }),

  test('הבקשות, ההסכמים, הספרייה והמסלולים בגיבוי', () => {
    for (const t of ['onboarding_steps', 'engagements', 'journey_templates', 'office_flows', 'office_flow_versions', 'meetings', 'contacts', 'vision_docs']) assert(t in TABLE_SCOPES, t);
  }),

  test('סודות לא נכנסים לקובץ: חיבור היומן ומחשב העבודה מוחרגים', () => {
    assert('google_calendar_connections' in EXCLUDED && 'automation_workers' in EXCLUDED, 'חסרה החרגה');
  }),

  test('שם הקובץ בתיקיית המשתמש, ומזהה פסול נדחה', () => {
    const id = '5fb1ff2b-0ba3-4120-9f06-ed0cb0801938';
    equal(backupObjectName(id, '2026-10-11'), `${id}/backup-2026-10-11.json`);
    let threw = false; try { backupObjectName('../x', '2026-10-11'); } catch { threw = true; }
    assert(threw, 'מזהה פסול התקבל');
  }),

  test('איחוד בלי כפילויות לפי id', () => {
    equal(rowKey({ id: 7, a: 1 }), rowKey({ id: 7, a: 2 }));
    assert(rowKey({ a: 1 }) !== rowKey({ a: 2 }), 'שורות בלי id התמזגו');
  }),
];
