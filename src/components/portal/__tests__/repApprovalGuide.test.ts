// ─── בדיקות: אישור הייצוג באזור האישי — מה מסמנים, המדריך והנוסח ─────────────
// ‼ מה נעול כאן:
//   · צעד 5 במדריך נוקב ברשויות שביקשנו (ובשמות כשיש שני אנשים); בלי רשימה מהשרת —
//     הנוסח הכללי. צעד 6 תמיד «את כל הבקשות».
//   · הבלוק בכרטיס: אדם אחד בלי שם; זוג — שורה לכל אחד ומי נכנס לאיפה; רק בן/בת
//     הזוג — עם השם (אחרת בעל הכרטיס היה מחפש באזור האישי שלו).
//   · נוסח הכרטיס: «את כל הבקשות», זהה בשלושת המקומות — repTemplates, types/onboarding
//     ובשרת (ensure_rep_client_approval_step, ההגדרה האחרונה) — עם ירידות שורה אמיתיות.
//     ב-186 המחרוזת נכתבה E'…\\n…' ונשמרו בה התווים «\n» במקום ירידת שורה.
//   · שם השלב במשרד אחד: «אישור הייצוג באזור האישי».

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  REP_APPROVAL_GUIDE_STEPS, REP_APPROVAL_EACH_OWN_AREA, REP_APPROVAL_MARK_ALL, hebrewList, repApprovalCard,
  repApprovalGuideSteps, repApprovalNoteMore, repApprovalPeople, repApprovalSummary, type RepApprovalPerson,
} from '../RepApprovalGuide';
import { REP_PORTAL_CARD_DEFAULTS } from '../../../../supabase/functions/_shared/repTemplates.ts';
import { REP_CLIENT_APPROVAL, STEP_TYPE_LABELS } from '../../../types/onboarding';
import { REP_STAGES } from '../../../lib/representationJourney';

const CLIENT: RepApprovalPerson = { person: 'client', name: 'דוד', systems: ['מע״מ'] };
const SPOUSE: RepApprovalPerson = { person: 'spouse', name: 'רחל', systems: ['מס הכנסה', 'מע״מ'] };
const STEP5_GENERIC = REP_APPROVAL_GUIDE_STEPS[4];

/** הנוסח מהחוזה (r4) — מילה במילה. */
const CONTRACT_YES = 'כן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מסמנים את כל הבקשות שבהן המשרד מופיע כמייצג, ולוחצים «אישור ייצוג». שתי דקות.';

// ── SQL: ההגדרה האחרונה של ensure_rep_client_approval_step ─────────────────
const ROOT = process.cwd();
const SUPA = join(ROOT, 'supabase');
const FN = 'ensure_rep_client_approval_step';

/** קבצי המיגרציות לפי המספר (לא סדר אלפביתי: 99 לפני 131). */
function migrationFiles(): string[] {
  return readdirSync(SUPA)
    .filter(n => /^\d+-.*\.sql$/i.test(n))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}

/** גוף ההגדרה האחרונה (בין תגי ה-$ שאחרי AS). */
function lastDefinitionBody(fn: string = FN): { file: string; body: string } | null {
  let found: { file: string; body: string } | null = null;
  const head = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi');
  for (const name of migrationFiles()) {
    const sql = readFileSync(join(SUPA, name), 'utf8');
    for (const m of sql.matchAll(head)) {
      const rest = sql.slice(m.index ?? 0);
      const open = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
      if (!open) continue;
      const start = open.index + open[0].length;
      const end = rest.indexOf(open[1], start);
      if (end < 0) continue;
      found = { file: name, body: rest.slice(start, end) };
    }
  }
  return found;
}

interface SqlLiteral { raw: string; value: string; escaped: boolean }

/** כל מחרוזות ה-SQL בגוף (רגילות ו-E''), בלי הערות. */
function sqlLiterals(body: string): SqlLiteral[] {
  const out: SqlLiteral[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '-' && body[i + 1] === '-') { const nl = body.indexOf('\n', i); i = nl < 0 ? body.length : nl + 1; continue; }
    const escaped = (ch === 'E' || ch === 'e') && body[i + 1] === "'" && !/[A-Za-z0-9_]/.test(body[i - 1] ?? '');
    if (ch !== "'" && !escaped) { i++; continue; }
    const from = i;
    i += escaped ? 2 : 1;
    let value = '';
    while (i < body.length) {
      const c = body[i];
      if (escaped && c === '\\') {
        const n = body[i + 1];
        value += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
        i += 2; continue;
      }
      if (c === "'") {
        if (body[i + 1] === "'") { value += "'"; i += 2; continue; }
        i++; break;
      }
      value += c; i++;
    }
    out.push({ raw: body.slice(from, i), value, escaped });
  }
  return out;
}

export const TESTS: TestCase[] = [
  test('רשימה בעברית: «א», «א וב», «א, ב וג»', () => {
    equal(hebrewList([]), '');
    equal(hebrewList(['מס הכנסה']), 'מס הכנסה');
    equal(hebrewList(['מס הכנסה', 'מע״מ']), 'מס הכנסה ומע״מ');
    equal(hebrewList(['מס הכנסה', 'מע״מ', 'ניכויים']), 'מס הכנסה, מע״מ וניכויים');
    equal(hebrewList([' מס הכנסה ', '', 'מע״מ']), 'מס הכנסה ומע״מ', 'ריקים ורווחים יורדים');
  }),

  test('אנשים: הלקוח קודם, בלי כפילויות, בלי מי שאין לו מה לסמן, ושום דבר משונה לא מפיל', () => {
    deepEqual(repApprovalPeople([SPOUSE, CLIENT]).map(p => p.person), ['client', 'spouse']);
    deepEqual(repApprovalPeople([CLIENT, { ...CLIENT, systems: ['מס הכנסה'] }]).map(p => p.systems), [['מע״מ']]);
    deepEqual(repApprovalPeople([{ ...SPOUSE, systems: [] }, CLIENT]).map(p => p.person), ['client']);
    deepEqual(repApprovalPeople([{ ...CLIENT, systems: ['מע״מ', 'מע״מ'] }])[0].systems, ['מע״מ']);
    equal(repApprovalPeople(undefined).length, 0);
    equal(repApprovalPeople(null).length, 0);
    equal(repApprovalPeople('x' as unknown as RepApprovalPerson[]).length, 0);
    equal(repApprovalPeople([{ person: 'other', systems: ['מע״מ'] } as unknown as RepApprovalPerson]).length, 0);
  }),

  test('מדריך בלי רשימה מהשרת — צעד 5 בנוסח הכללי, צעד 6 «את כל הבקשות»', () => {
    for (const a of [undefined, null, [] as RepApprovalPerson[]]) {
      const s = repApprovalGuideSteps(a);
      equal(s.length, 7);
      equal(s[4].text, STEP5_GENERIC.text);
      equal(s[4].extra, STEP5_GENERIC.extra);
      assert(s[4].text.includes('את כל הבקשות של המייצג שלנו'), s[4].text);
      equal(s[5].text, 'אחרי שסימנתם את כל הבקשות שלנו, לוחצים «אישור ייצוג» — לא «דחיית בקשה».');
    }
  }),

  test('מדריך, אדם אחד (הלקוח) — צעד 5 נוקב ברשויות, בלי שם', () => {
    const s = repApprovalGuideSteps([{ person: 'client', name: 'דוד', systems: ['מס הכנסה', 'מע״מ'] }]);
    equal(s[4].text, 'במסך «ניהול ייצוג» מסמנים ✓ את כל הבקשות של המייצג שלנו: מס הכנסה ומע״מ.');
    equal(s[4].extra, 'בקשה של מייצג אחר — לא מסמנים.');
    assert(!s[4].text.includes('דוד') && !(s[4].extra ?? '').includes('דוד'), 'בלי שם');
    assert(s[5].text.includes('שסימנתם את כל'), s[5].text);
  }),

  test('מדריך, רק בן/בת הזוג — עם השם, באזור האישי שלו/ה', () => {
    const s = repApprovalGuideSteps([{ person: 'spouse', name: 'רחל', systems: ['מס הכנסה'] }]);
    equal(s[4].text, 'במסך «ניהול ייצוג» מסמנים ✓ את כל הבקשות של המייצג שלנו: מס הכנסה.');
    equal(s[4].extra, 'זה נעשה באזור האישי של רחל. בקשה של מייצג אחר — לא מסמנים.');
  }),

  test('מדריך, שני אנשים — שורה לכל אחד, הלקוח קודם, וכל אחד באזור האישי שלו', () => {
    const s = repApprovalGuideSteps([SPOUSE, CLIENT]);
    equal(s[4].text, STEP5_GENERIC.text);
    equal(s[4].extra, 'דוד: מע״מ\nרחל: מס הכנסה ומע״מ\nכל אחד באזור האישי שלו. בקשה של מייצג אחר — לא מסמנים.');
    equal(s[5].text, 'אחרי שסימנתם את כל הבקשות שלנו, לוחצים «אישור ייצוג» — לא «דחיית בקשה».');
    equal(REP_APPROVAL_GUIDE_STEPS[4].extra, STEP5_GENERIC.extra, 'הקבוע עצמו לא השתנה');
  }),

  test('הבלוק «מה מסמנים» בכרטיס: אחד / רק בן-בת הזוג / זוג / אין', () => {
    deepEqual(repApprovalSummary([CLIENT]), { lines: ['מע״מ'] });
    deepEqual(repApprovalSummary([{ person: 'spouse', name: 'רחל', systems: ['מס הכנסה'] }]),
      { lines: ['רחל: מס הכנסה'], note: 'האישור נעשה באזור האישי של רחל.' });
    deepEqual(repApprovalSummary([SPOUSE, CLIENT]),
      { lines: ['דוד: מע״מ', 'רחל: מס הכנסה ומע״מ'], note: REP_APPROVAL_EACH_OWN_AREA });
    equal(REP_APPROVAL_EACH_OWN_AREA, 'כל אחד נכנס לאזור האישי שלו ומאשר את הבקשות שעל שמו.');
    equal(repApprovalSummary(undefined), null);
    equal(repApprovalSummary([{ ...CLIENT, systems: [] }]), null);
    deepEqual(repApprovalSummary([{ person: 'spouse', systems: ['מע״מ'] }, { person: 'client', systems: ['מע״מ'] }])?.lines,
      ['אתם: מע״מ', 'בן/בת הזוג: מע״מ'], 'בלי שם — לא שורה ריקה');
  }),

  // ── H2.5b · של מי האישור שחסר (awaiting מהשרת) ───────────────────────────────
  test('זוג: ליד מי ששע״ם ממתינה לאישור שלו — «ממתין לאישור» (כולו או חלק)', () => {
    deepEqual(repApprovalSummary([CLIENT, { ...SPOUSE, awaiting: ['מס הכנסה', 'מע״מ'] }])?.lines,
      ['דוד: מע״מ', 'רחל: מס הכנסה ומע״מ · ממתין לאישור']);
    deepEqual(repApprovalSummary([CLIENT, { ...SPOUSE, awaiting: ['מס הכנסה'] }])?.lines,
      ['דוד: מע״מ', 'רחל: מס הכנסה ומע״מ · ממתין לאישור: מס הכנסה']);
    deepEqual(repApprovalSummary([{ ...CLIENT, awaiting: [] }, SPOUSE])?.lines, ['דוד: מע״מ', 'רחל: מס הכנסה ומע״מ'], 'ריק ⇒ בלי סימון');
    deepEqual(repApprovalSummary([{ ...CLIENT, awaiting: ['מע״מ'] }])?.lines, ['מע״מ'], 'אדם אחד — הכותרת כבר אומרת');
  }),

  // ── X-3 / E:X-4 · הכרטיס בדף האישי: משפט אחד, מה מסמנים, והשאר בלחיצה ─────────
  test('ההסבר השמור: «כן» יורד (הכרטיס אומר אותו), «לא -» בלי הקידומת, SMS וההערה שאחרי — לפי דרישה', () => {
    const r = repApprovalNoteMore(REP_PORTAL_CARD_DEFAULTS.note, REP_PORTAL_CARD_DEFAULTS.noteAfter);
    equal(r.recognized, true);
    deepEqual(r.more, [
      'קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.',
      'אם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.',
      REP_PORTAL_CARD_DEFAULTS.noteAfter,
    ]);
    assert(!r.more.join(' ').includes('שתי דקות'), 'משך אחד בכרטיס — זה שבשורת המשנה');
  }),

  test('הנוסח הישן של 186 (ביחיד, «\\n» כתווים) — «מחפשים את הבקשה» לא מוצג מול «את כל הבקשות» (H2.4)', () => {
    const old = 'יש לך כבר משתמש באזור האישי של רשות המסים?\\n\\nכן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מחפשים את הבקשה שבה מופיע שם המשרד כמייצג, ובוחרים אישור. שתי דקות.\\n\\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\\n\\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.';
    const r = repApprovalNoteMore(old, null);
    equal(r.recognized, true);
    equal(r.more.length, 2);
    assert(!r.more.join(' ').includes('את הבקשה שבה'), r.more.join(' | '));
  }),

  test('ניסוח של המשרד שאינו במבנה — כולו נפתח לפי דרישה («עוד הסבר»), כלום לא נבלע', () => {
    const r = repApprovalNoteMore('שלום,\nנא להיכנס לאזור האישי ולאשר את המשרד.', 'תודה!');
    equal(r.recognized, false);
    deepEqual(r.more, ['שלום,', 'נא להיכנס לאזור האישי ולאשר את המשרד.', 'תודה!']);
    equal(repApprovalCard(null, 'שלום', null).moreLabel, 'עוד הסבר');
    deepEqual(repApprovalNoteMore(null, null).more, []);
  }),

  test('הכרטיס: בלי רשימה מהשרת — משפט אחד «את כל הבקשות»; אדם אחד — בלי שם', () => {
    const none = repApprovalCard(null, REP_PORTAL_CARD_DEFAULTS.note, REP_PORTAL_CARD_DEFAULTS.noteAfter);
    equal(none.lead, REP_APPROVAL_MARK_ALL);
    deepEqual(none.lines, []);
    equal(none.moreLabel, 'אין לך משתמש באזור האישי, או שמשהו לא עבד?');
    const one = repApprovalCard([{ person: 'client', name: 'דוד', systems: ['מס הכנסה', 'מע״מ'] }], null, null);
    equal(one.lead, 'באזור האישי מסמנים את כל הבקשות שלנו, ולוחצים «אישור ייצוג»:');
    deepEqual(one.lines, [{ key: 'client', text: 'מס הכנסה ומע״מ' }]);
  }),

  test('הכרטיס: רק בן/בת הזוג — באזור האישי שלו/ה; זוג — שורה לכל אחד, ולמי שע״ם ממתינה', () => {
    const sp = repApprovalCard([{ person: 'spouse', name: 'רחל', systems: ['מס הכנסה'] }], null, null);
    equal(sp.lead, 'באזור האישי של רחל מסמנים את כל הבקשות שלנו, ולוחצים «אישור ייצוג»:');
    deepEqual(sp.lines, [{ key: 'spouse', text: 'מס הכנסה' }]);
    const both = repApprovalCard([{ ...SPOUSE, awaiting: ['מס הכנסה', 'מע״מ'] }, { ...CLIENT, awaiting: [] }], null, null);
    equal(both.lead, 'כל אחד נכנס לאזור האישי שלו, מסמן את כל הבקשות שלנו ולוחץ «אישור ייצוג»:');
    deepEqual(both.lines, [
      { key: 'client', text: 'דוד: מע״מ', awaiting: undefined },
      { key: 'spouse', text: 'רחל: מס הכנסה ומע״מ', awaiting: 'ממתין לאישור' },
    ]);
    equal((both.lead.match(/כל הבקשות/g) ?? []).length, 1, '«כל הבקשות» פעם אחת');
  }),

  test('מדריך, זוג — צעד 7: חוזרים ל«אישרתי» רק אחרי ששניכם אישרתם (H2.5c)', () => {
    const s = repApprovalGuideSteps([SPOUSE, CLIENT]);
    assert((s[6].extra ?? '').startsWith('כשכל אחד מכם אישר באזור האישי שלו'), s[6].extra ?? '');
    assert((s[6].extra ?? '').includes('«אישרתי באזור האישי»'), 'אותו כפתור בדיוק');
    equal(repApprovalGuideSteps([CLIENT])[6].extra, REP_APPROVAL_GUIDE_STEPS[6].extra, 'אדם אחד — בלי שינוי');
    equal(repApprovalGuideSteps(null)[6].extra, REP_APPROVAL_GUIDE_STEPS[6].extra);
  }),

  test('נוסח הכרטיס זהה בשני המקומות בקוד, «את כל הבקשות», וירידות שורה אמיתיות', () => {
    equal(REP_PORTAL_CARD_DEFAULTS.note, REP_CLIENT_APPROVAL.note.join('\n\n'));
    equal(REP_CLIENT_APPROVAL.note[1], CONTRACT_YES);
    assert(REP_PORTAL_CARD_DEFAULTS.note.includes('\n\n'), 'ירידת שורה אמיתית');
    assert(!REP_PORTAL_CARD_DEFAULTS.note.includes('\\'), 'בלי לוכסן הפוך');
    assert(!REP_PORTAL_CARD_DEFAULTS.note.includes('את הבקשה שבה'), 'לא ביחיד');
  }),

  test('תיאור השלב במשרד ושם השלב — ברבים, ושם אחד', () => {
    const st = REP_STAGES.find(s => s.key === 'client_approval');
    assert(!!st, 'יש שלב client_approval');
    assert((st!.what ?? '').includes('את כל הבקשות שבהן המשרד מופיע כמייצג'), st!.what ?? '');
    equal(STEP_TYPE_LABELS.rep_client_approval, 'אישור הייצוג באזור האישי');
  }),

  test('בשרת: ensure_rep_client_approval_step (ההגדרה האחרונה) כותב את אותו נוסח, עם ירידות שורה אמיתיות', () => {
    // ‼ 222: הנוסח עבר מגוף היוצר ל-_rep_client_approval_payload (שגם «צפייה» בבקשה קוראת לה); היוצר קורא לה.
    const creator = lastDefinitionBody();
    assert(!!creator, `לא נמצאה הגדרה של ${FN}`);
    const payloadFn = lastDefinitionBody('_rep_client_approval_payload');
    if (payloadFn) {
      assert(/_rep_client_approval_payload\s*\(/.test(creator!.body), `${creator!.file}: היוצר לא קורא ל-_rep_client_approval_payload`);
      assert(!sqlLiterals(creator!.body).some(l => l.value.startsWith('יש לך כבר משתמש באזור האישי')), `${creator!.file}: הנוסח עדיין מועתק בגוף היוצר`);
    }
    const def = payloadFn ?? creator;
    const lits = sqlLiterals(def!.body);
    const bad = lits.filter(l => l.escaped && /\\\\n/.test(l.raw));
    equal(bad.length, 0, `${def!.file}: E'…\\\\n…' שומר לוכסן ו-n במקום ירידת שורה`);
    const note = lits.find(l => l.value.startsWith('יש לך כבר משתמש באזור האישי'));
    assert(!!note, `${def!.file}: לא נמצא נוסח ברירת המחדל של clientNote`);
    equal(note!.value, REP_PORTAL_CARD_DEFAULTS.note, `${def!.file}: הנוסח בשרת שונה מהנוסח בקוד`);
  }),
];
