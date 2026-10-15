// ─── פרומפט התחזוקה ─────────────────────────────────────────────────────────
// ‼ ההעתקה אינה אימות. הפרומפט מוביל סבב מלא בענף נפרד: מחקר → השוואה →
// עדכון במרשם → בדיקת השפעה → בדיקות → דוח. הוא נבנה מהמרשם עצמו, כך שהערכים,
// המסמכים והפרסומים הצפויים הם חלק ממנו — Claude לא צריך לנחש מה יש היום.
// ‼ 10.10.2026 (גיא): גם פרסום מאוחר — דוח 2026 ונספחיו מתפרסמים ב-2027. שנת
// המס, מועד הפרסום, התחולה והגרסה נבדלים; ונבדקים גם טפסים, נספחים, הוראות
// ומיפוי שדות, לא רק מספרים.

import { ALL_RULES } from '../taxRules/rules';
import { ALL_SOURCES, EXPECTED_PUBLICATIONS } from '../taxRules/sources';
import { ruleView, formatRuleValue, BASIS_LABEL, RULESET_VERSION } from '../taxRules/registry';
import { CALC_RULES } from '../taxRules/calc';
import { TOPICS, TOPIC_BY_ID, FIELD_MAP_SOURCE } from './topics';
import type { DocKind } from '../taxRules/types';
import { FORM_VERSIONS, FIELDS_BY_VERSION, ANNEXES_BY_VERSION } from '../taxForms/form1301';
import { coverage1301, coverageSummary, ANNEX_INFO_2025, DRAFT_FILL_1301 } from '../taxForms/coverage1301';
import { OPEN_ITEMS, MEANWHILE_LABEL, STATUS_LABEL } from '../taxRules/openItems';
import { AVAILABLE } from './availability';
import { RESEARCH_LEADS, LEAD_STATE_LABEL } from './researchLeads';
import { DICTIONARY, DICTIONARY_TAX_YEAR } from './expenseDictionary';

export interface PromptScope { kind: 'all' }
export type MaintenanceScope = PromptScope | { kind: 'topic'; topicId: string } | { kind: 'newForm'; formId: string; taxYear: number };

/** טפסים שהמערכת מכירה — לפרומפט «טופס לשנה חדשה». */
export const NEW_FORM_TARGETS: { formId: string; label: string; touches: string }[] = [
  { formId: '1301', label: '1301 — הדוח השנתי ליחיד (ונספחיו)', touches: 'taxForms/data/form1301-<שנה>.catalog.json, annexes-<שנה>.catalog.json, annex-info-<שנה>.json, form1301.ts (FORM_VERSIONS, שדות ממופים), coverage1301.ts, sourceDocs.ts (קודים), topics.ts (FIELD_MAP_*), שאלוני שנת המס (features/taxYear/catalog.ts)' },
  { formId: '6111', label: '6111 — דוחות כספיים מקודדים', touches: 'expenseDictionary.ts (קודי 6111 לשנה), Form6111Body.tsx (מבנה וספים), כלל form6111.threshold' },
  { formId: '1320', label: '1320 — נספח א (עסק)', touches: 'expenseDictionary.ts (שורות 1320), annex-info-<שנה>.json' },
  { formId: '1322', label: '1322/1325 — ני״ע ורווח הון', touches: 'sourceDocs.ts (867, ברוקר), annexes-<שנה>.catalog.json' },
  { formId: '1324', label: '1324 — נספח ד (חו״ל)', touches: 'sourceDocs.ts (ברוקר), annexes-<שנה>.catalog.json' },
  { formId: '1219', label: '1219 — הצהרת הון', touches: 'wealthFormGuide.ts (שדות), features/taxYear/wealthCatalog.ts (שאלון), כללי wealth.*' },
  { formId: '106', label: '106 — אישור מעסיק', touches: 'sourceDocs.ts (תיבות ← קודי 1301)' },
];

function buildNewFormPrompt(formId: string, taxYear: number): string {
  const t = NEW_FORM_TARGETS.find(x => x.formId === formId);
  return `משימה: פורסם (או צפוי להתפרסם) טופס ${t?.label ?? formId} לשנת המס ${taxYear}. לקרוא אותו, להשוות לשנה הקודמת, לעדכן את PIVO בפועל ולבדוק השפעה — לא רק דוח המלצות.

גרסת המרשם בעת ההעתקה: ${RULESET_VERSION}

0. התחלה
- קרא CLAUDE.md, docs/MODEL-WORKFLOW-POLICY.md ו-docs/tax-foundation/recurring-knowledge-update-prompt.md. git fetch; ענף חדש knowledge-update/<תאריך>-${formId}-${taxYear} מ-origin/master, בעותק נפרד.
- ‼ שנת המס ≠ שנת הפרסום: טופס ${taxYear} מתפרסם בדרך כלל ב-${taxYear + 1}. רשום לכל מסמך: שנת מס · מועד פרסום · תחולה · גרסה («מעודכן ל…»).

1. איתור — ארבעה מסמכים (בשמות הקבצים אין תבנית קבועה בין שנים; לאתר מהדף)
- הטופס עצמו (גרסה מונגשת לחילוץ טקסט, אם יש) — דף השירות «דיווח ותשלום — דוח מס שנתי ${taxYear}» ב-gov.il.
- דברי ההסבר / «דע זכויותיך וחובותיך ${taxYear}» (פרק ד = הוראות המילוי של 1301).
- מבנה הקובץ לבתי תוכנה — דף «מבני קבצים לדוחות שנתיים» (generalpage/annual-files-form).
- הטופס של השנה הקודמת — להשוואה.
- דפי השירות של gov.il מחזירים 403 לשליפה ישירה; קובצי BlobFolder (PDF) בדרך כלל נשלפים — לחלץ טקסט. מה שלא נפתח — «לא נקרא», לא ממלאים מהזיכרון.

2. השוואה — לפי משמעות, לא לפי מיקום
- קטלוג מלא לשנה החדשה (שדה, תיבת סימון, חלק, סעיף, קודים לרשום/לבן־בת זוג/משותף, סוג, הוראה, עמוד). diffFormVersions / diffAnnexes מול הקודמת: נוסף · הוסר · מספר זז · סוג · משמעות · תנאי · חישוב · אסמכתה.
- קודים: השוואה מכנית של כל המספרים בין השנים (גם בין הטופס למבנה הקובץ — דוגמה: 2570 בטופס מול 5270 בקובץ ב-6111/2025).
- מבנה הרשומה: אורך, מיקומים, ערכים מותרים, שדות חובה, בדיקות סיכום.
- ספים: לרשום את כל הגרסאות (טופס, מבנה, מדריך) ואת השיעור המשתמע (מע״מ). אסור לבחור אחד בשקט — סתירה נרשמת כפריט פתוח.
- נספחים: נוסף, בוטל, אופן צירוף (מקוון / הדפסה).

3. עדכון בפועל — בלי לשכתב
- גרסה חדשה (FORM_VERSIONS עם supersedes); הקודמת והמיפוי שלה נשארים — דוח של השנה הקודמת ממשיך לפיהם.
- רכיבים שנוגעים בטופס הזה: ${t?.touches ?? 'לפי grep על מספר הטופס'}.
- ערכים חדשים: RuleValue לשנה עם basis, sourceId, locator, checkedAt. תיקון לאותה שנה — revisions, לא מחיקה.
- מילון הסיווג (expenseDictionary.ts, היום לשנת ${DICTIONARY_TAX_YEAR}, ${DICTIONARY.length} קטגוריות) — גרסה לשנה; סכומים משתנים (1,380 נייד, 240 מתנות, תקרות לינה, תקרת אכ״ע) נבדקים מחדש.
- אסור: לשנות תשובות לקוח, עובדות שנתיות, הערכות או דוחות שאושרו, נתוני ייצור. שינוי שמשפיע על גרסה מאושרת — «נדרשת בדיקה» (reviewNeeded / changesSinceApproval), לא חישוב מחדש שקט.

4. השפעה — לכל שינוי
- ידע: נושאים, כרטיסי מסמכי מקור, «איתור שדה לפי קוד» (נשען על הקטלוג).
- שאלונים ובקשת מסמכים: שינוי מספר בלבד — עדכון מיפוי בלי פנייה ללקוח; שינוי משמעות — בקשה ממוקדת, התשובה הקיימת נשמרת; שדה חדש שחל — בקשה ממוקדת.
- חישובים ותוצרים: הערכת המס, מחשבונים, (כשיהיה) הכנת הדוח והקובץ.
- טבלה בדוח: שדה · סוג השינוי · רכיבים שעודכנו · מי מהלקוחות עלול להיות מושפע (בלי לשנות אותם).

5. בדיקות ודוח
- npm run test:unit · npm run build; בדיקה ל-diffFormVersions החדש; בדפדפן: «מס › ידע מקצועי › טופס 1301» (גרסה ושינויים), הנושאים שהושפעו — מחשב ו-390.
- דוח: docs/tax-foundation/updates/<YYYY-MM-DD>-${formId}-${taxYear}.md — מה השתנה בעבודת המשרד בעברית פשוטה, מה נבדק, מה לא נקרא. ‼ בלי «הכול אומת» כשהכיסוי חלקי.

גבולות: אין commit ל-master, push, merge, deploy, שינוי במסד או פעולה מול רשות — בלי אישור מפורש של גיא. בשגיאת התחברות — לעצור.
מודל מומלץ: Opus 5.5 · high.`;
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  guide: 'מדריך', form: 'טופס', annex: 'נספח', instructions: 'הוראות מילוי', fieldMap: 'מיפוי שדות',
  servicePage: 'דף שירות', notice: 'הודעה / חוזר', law: 'חוק / תקנות', table: 'טבלת ערכים', other: 'אחר',
};

function rulesTable(ids: string[]): string {
  const lines: string[] = [];
  for (const id of ids) {
    const rule = ALL_RULES.find(r => r.id === id);
    if (!rule) continue;
    for (const v of [...rule.values].sort((a, b) => a.taxYear - b.taxYear)) {
      const view = ruleView(id, v.taxYear);
      const prev = v.revisions?.length ? ` | ${v.revisions.length} גרסאות קודמות` : '';
      lines.push(`- ${id} | שנת מס ${v.taxYear} | ${formatRuleValue(view)} | ${BASIS_LABEL[v.basis]} | מקור: ${v.sourceId}${v.locator ? ` (${v.locator})` : ''} | נבדק ${v.checkedAt}${prev}`);
    }
  }
  return lines.join('\n');
}

function sourcesTable(sourceIds: Set<string> | null): string {
  return ALL_SOURCES.filter(s => !sourceIds || sourceIds.has(s.id)).map(s =>
    `- ${s.id} | ${DOC_KIND_LABEL[s.docKind]} | ${s.kind === 'primary' ? 'רשמי' : s.kind === 'office' ? 'משרד' : 'משני'} | שנת מס: ${s.refersToTaxYear ?? 'לא רלוונטי/לא נרשם'} | פורסם: ${s.publishedAt ?? 'לא נרשם'} | חל מ: ${s.effectiveFrom ?? 'לא נרשם'} | גרסה: ${s.documentVersion ?? 'לא נרשמה'}${s.supersedes ? ` | מחליף את ${s.supersedes}` : ''} | נבדק ${s.checkedAt}`,
  ).join('\n');
}

export function buildMaintenancePrompt(scope: MaintenanceScope): string {
  if (scope.kind === 'newForm') return buildNewFormPrompt(scope.formId, scope.taxYear);
  const topic = scope.kind === 'topic' ? TOPIC_BY_ID[scope.topicId] : undefined;
  const ruleIds = topic ? topic.ruleIds : ALL_RULES.map(r => r.id);
  const usedSources = topic
    ? new Set<string>([...ALL_RULES.filter(r => ruleIds.includes(r.id)).flatMap(r => r.values.map(v => v.sourceId)), FIELD_MAP_SOURCE])
    : null;
  const scopeLine = topic
    ? `נושא: ${topic.title} (${topic.id}) · כללים: ${topic.ruleIds.join(', ')}`
    : `כל הידע המקצועי: ${TOPICS.length} נושאים, ${ALL_RULES.length} כללים במרשם, ועמודי הכלים הקיימים (ראה COVERAGE_AUDIT)`;
  const gaps = topic ? topic.gaps.map(g => `- ${g}`).join('\n') : TOPICS.map(t => `- ${t.title}: ${t.gaps.length} פערים`).join('\n');
  const calcs = Object.entries(CALC_RULES).filter(([, c]) => c.ruleIds.some(id => ruleIds.includes(id))).map(([id, c]) => `${id} (${c.label})`).join(', ') || 'אין';
  const fields = (topic ? [topic] : TOPICS).flatMap(t => t.form1301.map(f => `${t.id}: חלק ${f.part}, סעיף ${f.section}, שדות ${f.fields}`)).join('\n- ');
  const forms = FORM_VERSIONS.map(v => `- ${v.id} | שנת מס ${v.refersToTaxYear} | גרסה ${v.documentVersion ?? 'לא נרשמה'} | ${v.readStatus === 'read' ? 'נקרא' : v.readStatus === 'partlyRead' ? 'נקרא חלקית' : 'לא נקרא'} | שדות ממופים: ${FIELDS_BY_VERSION[v.id]?.length ?? 0} | נספחים: ${ANNEXES_BY_VERSION[v.id]?.length ?? 0}${v.supersedes ? ` | מחליף את ${v.supersedes}` : ''}\n  מה נקרא: ${v.readScope}`).join('\n');
  const cov = coverageSummary(coverage1301());
  const covLine = `1301@2025: ${cov.total} שדות בקטלוג · מופו במלואם ${cov.read.mapped ?? 0} · בתיק ${cov.file.inFile ?? 0} · חלקי ${cov.file.partialInFile ?? 0} · חסר ${cov.file.missingInFile ?? 0} · בהגשה ${cov.file.office ?? 0} · לא נבדק ${cov.file.notChecked ?? 0}. נספחים: ${ANNEX_INFO_2025.length}, ${ANNEX_INFO_2025.reduce((n, a) => n + a.items.length, 0)} פריטי מידע.`;
  const open = OPEN_ITEMS.filter(i => i.status !== 'closed' && (!topic || !i.topicId || i.topicId === topic.id))
    .map(i => `- [${STATUS_LABEL[i.status]}] ${i.title} — חסר: ${i.missing} | נבדק: ${i.checked.map(c => c.source).join('; ') || '—'} | משפיע על: ${i.affects} | בינתיים: ${MEANWHILE_LABEL[i.meanwhile]} — ${i.meanwhileText}`).join('\n') || '- אין';
  const expected = EXPECTED_PUBLICATIONS.map(p => `- ${p.title} | ${DOC_KIND_LABEL[p.docKind]} | מתייחס לשנת מס ${p.refersToTaxYear} | בדרך כלל: ${p.usuallyPublished} | ישפיע על: ${p.affects.join('; ')}`).join('\n');

  return `משימה: עדכון הידע המקצועי ב-PIVO — מחקר, השוואה, עדכון בפועל, בדיקת השפעה ודוח.

היקף: ${scopeLine}
גרסת המרשם בעת ההעתקה: ${RULESET_VERSION}

0. התחלה
- קרא CLAUDE.md, docs/MODEL-WORKFLOW-POLICY.md, docs/TAX-KNOWLEDGE-AND-CLIENT-JOURNEY-PLAN.md ו-docs/tax-foundation/recurring-knowledge-update-prompt.md.
- git fetch; עבוד בענף חדש knowledge-update/<תאריך> מ-origin/master, בעותק נפרד. אל תיגע בשינויים שאינם שלך.
- המרשם: src/features/taxRules/{rules,sources}.ts (כולל EXPECTED_PUBLICATIONS). הנושאים: src/features/taxKnowledge/topics.ts ו-topics/*. השפעה: src/features/taxRules/impact.ts.
- הטפסים: src/features/taxForms/ — types.ts (גרסה, שדה, נספח, תשובה), form1301.ts (גרסאות, שדות ממופים, נספחים), engine.ts (השוואת גרסאות, מוכנות שדה, בקשות ממוקדות), fillVerification.ts (אימות טופס ממולא).

1. מחקר — לא רק מספרים
בדוק לכל שנת מס פתוחה (לא רק השנה הנוכחית — דוח של שנה קודמת מתפרסם בשנה שאחריה):
- ערכים ותקרות; נוסח הדין; טפסים (1301 ועוד) ונספחיהם; הוראות המילוי והמדריכים; מספרי סעיפים ושדות (מיפוי); דפי שירות ומועדים; הודעות למייצגים.
- מקור רשמי קודם: רשות המסים, ביטוח לאומי, רשות שוק ההון, נוסח החוק. דפי השירות של gov.il מחזירים 403 לשליפה ישירה — קרא בדפדפן; קובצי BlobFolder (PDF) בדרך כלל נשלפים ישירות — חלץ טקסט. מה שלא נפתח — «לא נקרא».
- הצלב פרשנות עם לשכת רואי החשבון ולשכת יועצי המס כשיש חומר נגיש; אם אין — כתוב זאת.
- משני = משני. ערך של שנה קודמת אינו ערך של שנה חדשה. טענה בלי מקור = «לא אומת».

פרסומים שעוד לא נמצאו — חפש אותם במיוחד:
${expected}

2. לכל מסמך שנמצא — ארבעה מאפיינים נפרדים
- שנת המס שהמסמך מתאר · מועד הפרסום · מועד התחולה · גרסת המסמך.
- ‼ לא משייכים לשנת מס לפי שנת הפרסום. מדריך שפורסם ב-2027 על דוח 2026 שייך ל-2026. פרק בתוך מסמך יכול לתאר שנה אחרת (מדריך 2025 מתאר את מקדמות 2026) — רשום זאת ב-note של הערך.
- מה שלא כתוב במסמך — נשאר ריק, לא מנוחש.

המסמכים במרשם היום:
${sourcesTable(usedSources)}

3. השוואה — טבלה לכל פריט: מצב נוכחי | ביסוס | מה נמצא | מקור (שנה, פרסום, תחולה, גרסה) | סוג השינוי
סוגים: ללא שינוי · ערך/דין השתנה · שנה חדשה · גרסה חדשה של מסמך · טופס/נספח/הוראות השתנו · מיפוי שדות השתנה · מקור/ניסוח בלבד · סתירה בין מקורות · לא ניתן לבדוק.
הערכים הנוכחיים:
${rulesTable(ruleIds)}

מיפוי 1301 הנוכחי (${FIELD_MAP_SOURCE}):
- ${fields}

4. עדכון בפועל (בענף בלבד) — שומרים כל גרסה קודמת
- שנה חדשה: RuleValue חדש עם taxYear, basis, sourceId, locator, checkedAt. לא נוגעים בשנים אחרות.
- תיקון לאותה שנה (המקור תוקן או פורסם מחדש): הערך הקודם עובר ל-revisions עם replacedAt ו-reason, והחדש נכנס במקומו. לא מוחקים.
- גרסה חדשה של מסמך: Source חדש עם supersedes לקודם. הקודם נשאר.
- טופס שמספרי שדותיו השתנו: מקור מיפוי חדש לשנה שלו (למשל fieldMap1301_2026), עדכון topics.ts לשנה החדשה רק במקום שמציג אותה. המיפוי הקודם נשאר — דוח של השנה הקודמת ממשיך להתמלא לפיו.
- בדיקה חלקית או שנכשלה אינה משדרגת ביסוס. ‼ אי־ודאות אינה נפתרת ב«הכרעת משרד» ולא בבחירה אוטומטית בקצה השמרני: שאלה שנשארה פתוחה — פריט ב-openItems עם המקורות שנבדקו וההשפעה בשקלים; בחישוב — חוסמים או מגבילים רק את התרחיש המושפע, ומציגים את ההפרש. פרסום צפוי שנמצא — הוצא מ-EXPECTED_PUBLICATIONS והוסף כמקור.
- עדכן נושא רק כשהמשמעות השתנתה; פער שנסגר — הסר מ-gaps; פער חדש — הוסף.
- אסור: לשנות תשובות לקוח, עובדות שנתיות, הערכות מאושרות או נתוני ייצור.

4א. טפסים — לומדים את הטופס עצמו, לא רק את הערכים
כל פרסום של טופס, נספח או הוראות (גם לשנת מס קודמת — 1301 לשנת 2026 מתפרסם ב-2027):
- קרא את הטופס ואת הוראות המילוי שלו (ל-1301: פרק ד במדריך; גרסה מונגשת של הטופס לחילוץ טקסט). אם קראת רק חלק — readStatus: 'partlyRead' ו-readScope שאומר בדיוק מה.
- רשום גרסה חדשה ב-FORM_VERSIONS עם supersedes לקודמת; הקודמת והמיפוי שלה נשארים.
- קטלוג מלא לכל גרסה: כל שדה ותיבת סימון (חלק, סעיף, קודים, סוג, אפשרויות, הוראה ועמוד במדריך, מסמכים) — src/features/taxForms/data/form1301-<שנה>.catalog.json, וקטלוג נספחים. סמן uncertain כשהקריאה לא ודאית; אל תמציא שדה.
- עדכן את מפת הכיסוי (coverage1301.ts): לכל שדה — נקרא/מופה, ובתיק: בתיק · חלקי · חסר · בהגשה · לא נבדק, עם השדה בכרטיס שהוא נקודת ההתחלה. מפה במלואו (form1301.ts) כל שדה נפוץ בתיקי המשרד.
- עדכן את המידע לאיסוף בנספחים (data/annex-info-<שנה>.json): פריט מידע לכל קבוצת שדות — מקור (נתון בתיק · מסמך · לקוח · חישוב · משרד), מסמכים, שדות בכרטיס, מצב בתיק, תקופה (לשנה · ליום · לעסקה · לנכס · מצטבר), וחזרה (לעסק · לנכס · לעסקה · למדינה).
${AVAILABLE.annualReturn ? `- שלוש שכבות נפרדות, ולא לערבב: קטלוג השדות · מיפוי למידע בתיק · יכולת מילוי בפועל. היום (2025 בלבד): גיליון עבודה לפי קודים + קובץ לפי «מבנה קובץ 1301 לשנת 2025» (taxForms/data/file1301-2025.spec.json, annualReturn/file1301.ts — נבנה ונקרא בחזרה, לא משודר); ${Object.keys(DRAFT_FILL_1301).length} קודי הכנסה/ניכוי ב-DRAFT_FILL_1301, ובדיקת כיסוי לכל 305 השדות (annualReturn/formFields.ts); נספחים 1320 (מהספרים) ו-1321 (מסלול 10%). ‼ אין PDF רשמי למילוי לאף טופס 2025 — הטופס הרשמי מודפס ממערכת הרשות אחרי שידור.
- מבנה הקובץ לשנה חדשה (דף «מבני קבצים לדוחות מס שנתיים»): לחלץ מחדש לקובץ spec של השנה, לבדוק רציפות מקומות וסכום אורכים, ולהריץ את בדיקות הקובץ. לאמת מול שע״ם את הקידוד (היום הנחה: Windows-1255) ואת סוף הרשומה.` : `- שלוש שכבות נפרדות, ולא לערבב: קטלוג השדות · מיפוי למידע בתיק · יכולת מילוי בפועל. בקוד הזה — קטלוג ומיפוי בלבד; יכולת המילוי (טיוטת הדוח השנתי וקובץ לפי «מבנה קובץ 1301») בפיתוח בענף tax-foundation ואינה באתר — אל תתאר אותה כקיימת. ‼ אין PDF רשמי למילוי לאף טופס 2025 — הטופס הרשמי מודפס ממערכת הרשות אחרי שידור.`}
- ספים שונים בין מקורות רשמיים — לבדוק בכל שנה: מחזור ל-6111 (טופס: 256,410 · מבנה הקובץ: 254,777), «הכנסה העולה על» (טופס: 721,560 · מבנה הקובץ: 811,560).
${AVAILABLE.annualReturn ? `- טופס 1301 לשנה חדשה: מקטלגים, משווים לקודמת, ממפים מחדש את הקודים שהמנוע ממלא — ורק אז מוסיפים את השנה ל-SUPPORTED_FORM_YEARS (engine.ts). עד אז הדוח לשנה הזו הוא «טיוטה פנימית — לא להגשה». הבדיקה annualReturn/__tests__/draftFill.test.ts משווה בין המנוע למפה ולקטלוג.` : `- טופס 1301 לשנה חדשה: מקטלגים, משווים לקודמת וממפים מחדש. חיבור הקודים למנוע הדוח — רק כשהדוח השנתי ישוחרר.`}
מצב הכיסוי היום: ${covLine}
- השווה לגרסה הקודמת לפי משמעות, לא לפי מספר או מיקום: diffFormVersions ו-diffAnnexes. סמן לכל שדה ותיבת סימון: נוסף · הוסר · מספר שדה/סעיף זז · סוג השתנה · משמעות · תנאי מילוי · חישוב · אסמכתה. פרט גם שינויים ברמת הטופס (סימונים חדשים, נספח חדש או שבוטל).
- לכל שדה ממופה: משמעות; מתי רלוונטי (relevance מול התיק — כן/לא/לא ידוע); מקור התשובה (נתון בתיק · מסמך · תשובת לקוח · חישוב · הכרעת משרד); האם הנתון בתיק מתאים לשנה ולתקופה (fact.scope); אסמכתאות; מה ריק/0/«לא»/«לא רלוונטי» אומרים לפי ההוראות (emptyMeaning); ואיך בודקים את המילוי בגרסה הזו (fillCheck).
- ‼ לא ממציאים תשובה. «לא»/0 בכרטיס בלי מקור מתועד = לא ידוע. שדה שמשמעותו לא אומתה — basis: 'unverified', והוא לא ייחשב «מוכן».
- נספחים: לכל נספח — מתי נדרש לפי נסיבות הלקוח (requiredWhen + relevance). ברירת המחדל «לא ידוע», לא «לא נדרש».
- השפעה על איסוף המידע: followUpsForChange לכל סוג תיק — שינוי מספר בלבד = עדכון מיפוי בלי פנייה; שינוי מהותי = בקשה ממוקדת לבדוק את התשובה הקיימת, שנשמרת; שדה שהוסר = התשובה לארכיון; שדה חדש שחל = בקשה ממוקדת. לא מבקשים שוב מידע תקף. עדכן שאלות ללקוח ולמשרד שמושפעות.
- מילוי בפועל (כשיגיע): על בסיס מנגנון הטפסים החכמים (src/features/smartForms — מיפוי שנמדד על קובץ עם טביעת SHA-256, גרסת מיפוי, ציור עברית, תיבות סימון, בדיקת יישור). אחרי הפקה — verifyFilledForm על הקובץ שהופק ושוב על הקובץ אחרי שמירה ופתיחה מחדש (verifyReopened): ערכים, תיבות סימון, עברית, חישובים, נספחים וגרסה.

הטפסים במרשם היום:
${forms}

5. השפעה — ועדכון מה שהושפע
- לכל שינוי: ruleUsage(<id>) ו-grep על המזהה. מושפעים כאן: נושאים, חישובים (${calcs}), שדות 1301, שאלונים ומסכים שמפנים לנושא.
- עדכן כל רכיב שהושפע ובדוק אותו: הסבר, דוגמה, מחשבון, שאלה, מיפוי.
- שאלונים ואיסוף: שינוי בשדה, בנספח או בכלל שמשנה פריט מידע — עדכן את השאלה ללקוח או למשרד ואת רשימת המסמכים; תשובות קיימות נשמרות, ונפתחת בקשה ממוקדת רק למה שהשתנה.
- חישובים: מעבר ל-CALC_RULES, גם חישובי המחשבון והכלים (utils/taxCalculations.ts, utils/creditPoints.ts, utils/rentalTax.ts, features/annualReport/engine.ts, CreditPointsWizard, IncomeTaxPanel) — כל ערך או כלל שנכנס אליהם.
${AVAILABLE.taxEstimate ? `- חישוב אחד במערכת: הערכת המס (features/taxEstimate/engine.ts)${AVAILABLE.annualReturn ? ' והדוח השנתי (features/annualReturn/engine.ts) חולקים מנוע' : ' והמחשבון הכללי חולקים את calculateTax (utils/taxCalculations.ts)'}; בסיס ב״ל לעצמאי — niSelfEmployedBase, ותקרת ההכנסה המזכה לפנסיה (pen.qualifying.nonWork) — משותפים למחשבון ולהערכה. שינוי באחד מהם — בדיקת niBaseFormula.test.ts ו-calc-fixes-regression.
- דוח שנתי או הערכה שאושרו לא משתנים. שינוי בכלל — reviewNeeded; שינוי בתיק אחרי האישור — changesSinceApproval (src/features/taxFile/hub.ts) מציג «לבדיקה».` : `- חישוב אחד במערכת: בסיס ב״ל לעצמאי (niSelfEmployedBase) והפנסיה לעצמאי (selfEmployedPension, pen.qualifying.nonWork) — פונקציה אחת למחשבון ולכל חישוב שייבנה עליה. שינוי באחד מהם — בדיקת niBaseFormula.test.ts ו-calc-fixes-regression.`}
- תוצאה שכבר נשמרה או אושרה לא משתנה. reviewNeeded(<usedRules>) מחזיר «נדרשת בדיקה» עם הסבר (ערך השתנה / יש עכשיו ערך לשנה עצמה / ביסוס או מקור השתנו). ודא שזה מה שיוצג, ושלא נוצר חישוב מחדש שקט.
- רשום בדוח אילו תיקים או סוגי לקוחות עלולים להיות מושפעים ולמה — בלי לשנות אותם.

6. בדיקות
- npm run test:unit · npm run build.
- לכל ערך שהשתנה — בדיקת יחידה עם דוגמה מספרית מהמקור. לכל מיפוי שהשתנה — בדיקה שהנושא מציג את שנת הטופס הנכונה. לכל גרסת טופס חדשה — בדיקה של diffFormVersions מול הקודמת ושל followUpsForChange (בלי פנייה על שינוי מספר; בקשה ממוקדת על שינוי משמעות; התשובה הקודמת נשמרת).
- לכל שינוי בחישוב קיים — תרחישי «לפני ואחרי»: הרץ אותם על הקוד הקודם (git archive של הקומיט הקודם) ועל הנוכחי; טבלה בדוח (מקור, תרחיש שנפגע, לפני, אחרי, מה לא השתנה); בדיקת רגרסיה שנועלת את ערכי «אחרי» ואת מה שלא אמור להשתנות (דוגמה: docs/tax-foundation/calc-fixes-regression-2026-10-10.md). ודא שלא נשמרו תוצאות שישתנו בשקט.
- דפדפן: «מס › ידע מקצועי» › הנושא, «טופס 1301 לשנה» (גרסה, שינויים, מפת כיסוי, מידע לנספחים, מוכנות לקוח) ו«עדכניות ותחזוקה» (פריטים פתוחים), במחשב וב-360/390 — הערך, הביסוס, שנת המסמך והפערים מוצגים; אין גלישה צדדית.

7. דוח — docs/tax-foundation/updates/<YYYY-MM-DD>.md
- בראש: מה השתנה בעבודת המשרד, בעברית פשוטה.
- טבלת ההשוואה; מסמכים חדשים (שנה, פרסום, תחולה, גרסה); שינויים בטפסים ובנספחים (שדה, סוג השינוי, השפעה על השאלות); גרסאות שנשמרו; רכיבים שעודכנו; השפעה על תיקים קיימים («נדרשת בדיקה»); הבדיקות ותוצאותיהן; מה לא נבדק; שאלות עסקיות בלבד.

פריטים פתוחים (src/features/taxRules/openItems.ts) — לכל אחד: מה חסר, מה נבדק, על מה משפיע ומה המערכת עושה בינתיים. אחרי מחקר — סגור עם הכרעה ומקור, או הוסף ל-checked מה נבדק. אל תעתיק רשימה מסבב לסבב בלי מה שנבדק:
${open}

פערים פתוחים בנושאים:
${gaps}

קצות החוט של גיא (R01 עד R14) — מצב נוכחי; לסגור את הפתוחים או לתעד מה נבדק:
${RESEARCH_LEADS.filter(l => !topic || l.state !== 'closed').map(l => `- ${l.id} ${l.title} [${LEAD_STATE_LABEL[l.state]}] — ${l.found}${l.open ? ` | פתוח: ${l.open}` : ''}`).join('\n')}

גבולות: אין commit ל-master, push, merge, deploy, שינוי במסד או פעולה מול רשות — בלי אישור מפורש של גיא בשיחה. בשגיאת התחברות — לעצור ולבקש שחזור ידני.
מודל מומלץ: Opus 5.5 · high (משמעות כספית). Sonnet 5.5 · high מספיק לסבב «מקור בלבד».`;
}
