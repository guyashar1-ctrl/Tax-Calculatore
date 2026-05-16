# Claude Session Summary — Annual Report 1301 + Client Completeness

> **תקופה:** 2026-05-15 → 2026-05-16
> **ענף git:** `claude/heuristic-morse-9ffa21`
> **סטטוס:** Wave א+ב מקצה לקצה + השלמת כרטיס הלקוח מוכנים. ממתינים לאישור ויזואלי + Wave ג'.

---

## 1. מה נבנה (מקצה לקצה)

### א. מודול דוח שנתי 1301 (פיצ'ר חדש)

תיקייה חדשה: `src/features/annualReport/` עם 14 קבצים.

**זרימה ב-4 מסכים פנימיים:**
1. **🏠 התחל** ([AnnualReportEntry.tsx](src/features/annualReport/AnnualReportEntry.tsx)) — בחירת לקוח + שנת מס + רשימת תהליכים פעילים עם כפתור "המשך"/"מחק"
2. **📝 שאלון** ([Questionnaire.tsx](src/features/annualReport/Questionnaire.tsx)) — ~35 שאלות triage עם branching, סרגל התקדמות, dataPreview מהכרטיס
3. **✏ ערוך תשובות** ([AnswersReview.tsx](src/features/annualReport/AnswersReview.tsx)) — צפייה ברשימת תשובות + כפתור "ערוך תשובות בעץ" (מאפס ל-root עם prefills)
4. **📋 פלט ומיפוי** ([AnnualReportOutput.tsx](src/features/annualReport/AnnualReportOutput.tsx)) — 4 טאבים: סיכום, דרישות (כולל מסמכים ספציפיים לפי גוף), מיפוי שדות 1301, חישוב מס שקוף
5. **📚 מסד נתוני מס** ([TaxConstantsDashboard.tsx](src/features/annualReport/TaxConstantsDashboard.tsx)) — כרטיסיות עם ערכי הקבועים (2,904 ₪ נק' זיכוי, מדרגות, פטור שכ"ד 5,654 ₪) + ציטוט מהמקור הרשמי

**אבני יסוד טכניות:**
- [types.ts](src/features/annualReport/types.ts) — `TaxpayerModel`, `QuestionNode` (כולל `targetFieldCodes` + `dataPreview`), `Form1301FieldDef`, `CoverageReport`
- [form1301Fields.ts](src/features/annualReport/form1301Fields.ts) — **44 שדות 1301** עם `modelPath` + `sourceQuestionIds` + `requiredDocuments` (מקור אמת יחיד)
- [tree.ts](src/features/annualReport/tree.ts) — עץ ההחלטות, `dataPreview` ל-5 שאלות, `collectMissingClientFields()`
- [engine.ts](src/features/annualReport/engine.ts) — `answerAndAdvance`, `mapModelToForm1301`, `buildRequiredDocs` (מקבל client לפיצול ספציפי), חישוב מס שקוף שמשתמש ב-`taxData.ts` (לא משכפל)
- [coverage.ts](src/features/annualReport/coverage.ts) — `computeCoverage()` ו-`buildDocumentChecklist()` שמתפצל לפי `client.employers/.investmentAccounts/.bankAccounts/.pensionFunds`
- [repository.ts](src/features/annualReport/repository.ts) — CRUD ל-Supabase + `migrateModel` + `deleteSession` + `resetSessionToRoot`

### ב. השלמת כרטיס הלקוח לכיסוי 1301 הרמטי

**4 רשימות חדשות בטאב "פרטים אישיים וקשרים":**
- 📈 **חשבונות השקעה בארץ** (`investmentAccounts[]`) — מיטב דש, IBI, אקסלנס. כל אחד = 867 נפרד בצ'ק-ליסט
- 💼 **מעבידים** (`employers[]`) — שם, ע.מ, תקופה. כל אחד = 106 נפרד
- 🏦 **חשבונות בנק** (`bankAccounts[]`) — עם סימון "🔑 ראשי" לקבלת החזרי מס
- 🛡 **קופות פנסיה וחיסכון** (`pensionFunds[]`) — פנסיה/השתלמות/קופ"ג

**3 סקציות נוספות (Wave Z — completeness):**
- 👨‍🦳 **קרובים תלויים במוסד** (`dependentRelatives[]`) — לסעיף 44ב, זיכוי 35%
- 🏢 **עסקים** (`businesses[]`) — לעצמאי עם 2+ עסקים. כל אחד = נספח א' (1320) נפרד
- 📋 **דיווחי חובה ומצבים מיוחדים** — 5 דגלים: חברה משפחתית, CFC (חברה זרה), 85א (צדדים קשורים), חבר קיבוץ, סעיף 14

**הוספות inline בסקציות קיימות:**
- 🌐 **אזרחויות נוספות** (chips עם הסרה) — בתוך "פרטי נישום". חשוב ל-FATCA/CRS
- **ביטוח אובדן כושר עבודה** — בתוך "פרטים הקשורים למס הכנסה". שדה 112 ב-1301, ניכוי עד 3.5%

### ג. ארכיטקטורת קישור: שאלה ↔ מודל ↔ טופס

**מקור אמת יחיד**: `form1301Fields.ts`. כל שדה מצהיר על `modelPath` + `sourceQuestionIds`. מכאן נגזרים אוטומטית:
- חישוב כיסוי דינמי (% מהשדות שכיוונו ע"י שאלון נענות)
- צ'ק-ליסט מסמכים מורחב לפי גוף ספציפי בכרטיס (למשל "אישור 867 — מיטב דש" במקום "867 כללי")
- בסיס לשכבת איסוף הנתונים העתידית (UI הזנה לפי modelPath)

### ד. תיעוד ויזואלי

- [decision_tree.md](decision_tree.md) — תרשים Mermaid מלא של עץ ההחלטות + Coverage Matrix + ארכיטקטורה
- [1301_coverage_audit.md](1301_coverage_audit.md) — טבלה: כל 44 שדות 1301 → מקור (כרטיס/שאלון) + מסמך נדרש
- [scripts/coverage-report.mjs](scripts/coverage-report.mjs) — CLI שמדפיס דיווח כיסוי ב-3 פרופילים לדוגמה

---

## 2. אינטראקציה עם Supabase

**Migrations שהופעלו (בסדר):**
- `04-annual-report.sql` — 3 טבלאות חדשות עם RLS: `annual_report_sessions`, `annual_report_answers`, `annual_report_model_snapshots`
- `05-client-extensions.sql` — 4 עמודות JSONB ב-clients: `investment_accounts`, `bank_accounts`, `employers`, `pension_funds`
- `06-client-completeness.sql` — `additional_citizenships` (text[]), `dependent_relatives` (jsonb), `businesses` (jsonb), `has_disability_insurance` + `disability_insurance_annual`, 9 שדות flags

**הלקוח של גיא** (be4cb27a-...) זוהה ונאמת ב-DB. אין נתונים ישנים שצריך להגר (`investment_broker_name` היה null).

---

## 3. הסיפור הכרונולוגי של הסשן

| גל | תוצר | סטטוס |
|---|---|---|
| Wave A (פרוסה ראשונה) | Tab + Entry + 20 שאלות + Dashboard + Output | ✅ |
| Wave B (Edit answers) | Per-row edit (הוחלף בהמשך) | ✅ |
| Wave C (Tree edit + Delete) | "ערוך בעץ עם prefills" + מחיקת תהליך | ✅ |
| Wave D (dataPreview + missing-to-checklist) | ידע מהכרטיס בשאלה הראשונה + שדות חסרים → צ'ק-ליסט | ✅ |
| Wave E (Architecture + 44 fields) | form1301Fields.ts + Mermaid + audit doc | ✅ |
| 🐛 Bug fix | White screen ע"י migrateModel + optional chaining | ✅ |
| Wave F (4 client lists) | investments/employers/banks/pensions + מסמכים ספציפיים | ✅ |
| Wave Z (completeness) | dependents/businesses/citizenships/special flags | ✅ |

---

## 4. מה אומת ומה לא

### ✅ אומת
- `tsc --noEmit` עובר נקי בכל סשן עבודה
- HMR של vite מעדכן את כל הקבצים בלי שגיאות runtime
- 3 ה-migrations נכנסו ל-Supabase ב-HTTP 201
- Console נקי משגיאות JS
- מסך התחברות עולה תקין (screenshot+snapshot)
- ה-DB מכיל את הלקוח של גיא בלי נתונים ישנים שדורשים העברה
- חישובי 2025 אומתו מול חוברת "דע את זכויותיך 2025" הרשמית (PDF חולץ לטקסט):
  - נקודת זיכוי: 2,904 ₪ ✓
  - מדרגות: 84,120 / 120,720 / 193,800 / 269,280 / 560,280 / 721,560 ✓
  - מס יסף: 721,560 ₪ ✓
  - פטור שכ"ד: 5,654 ₪/חודש ✓

### ⚠ לא אומת ויזואלית
לא הצלחתי להיכנס ל-Google OAuth, ולכן לא ראיתי בעיניים:
- הטאב "📋 דוח שנתי 1301" בכותרת
- 7 הסקציות החדשות בטאב "פרטים אישיים וקשרים"
- זרימת השאלון רץ מקצה לקצה
- ה-checklist הסופי עם המסמכים הספציפיים ("106 — Wix", "867 — מיטב דש")
- הזרימה החדשה של "ערוך תשובות בעץ"

**עדכון אחרון מהמשתמש:** דווח על מסך לבן → אובחן ותוקן ב-migrateModel + optional chaining. נדרש אישור שהמסך הלבן נפתר.

---

## 5. נושאים פתוחים (TO-DO ידוע)

### 🐛 באג שדרוש תיקון מיידי
- **תקרת 6111** ב-[form1301Fields.ts](src/features/annualReport/form1301Fields.ts) — כיום `bizRevenueBand='2m_plus'`. **הערך הנכון לפי המדריך הרשמי לשנת 2025: 300,000 ₪**, לא 2,086,000. (המספר 2.086M הוא תקרת חובת דיווח נכסי חו"ל — שדה שונה לחלוטין.)

### Wave ג' (per-row UI) — הבא בתור
- פירוט per-child UI (שם, שנת לידה, החזקה, נכות) — נדרש לחישוב נקודות זיכוי לפי גיל
- per-business annex א' (1320) editor — לעצמאי עם 2+ עסקים
- per-employer 106 editor — שדות הברוטו, ניכוי במקור, פנסיה ממעביד
- per-investment-account 867 editor

### Wave ד' (חיבור שדות חדשים → שאלון)
- `dataPreview` למעבידים בשאלה `salary_employer_count` ✓ (כבר נעשה)
- `dataPreview` להשקעות בשאלה `capital_has_securities` ✓ (כבר נעשה)
- `dataPreview` לבנקים בשאלה `has_interest_income` ✓ (כבר נעשה)
- `dataPreview` לפנסיה בשאלה `self_pension` ✓ (כבר נעשה)
- `dataPreview` לחשבונות חו"ל (Interactive Brokers) בשאלת ני"ע — **לא נעשה**
- `dataPreview` לקריפטו מ-`foreignAccounts` type=crypto — **לא נעשה**
- `dataPreview` לקרובים תלויים בשאלת זיכוי 44ב — **לא נעשה**
- `dataPreview` לעסקים מרובים → לפצל את שדה 150 → 170 (בן זוג רשום/לא) — **לא נעשה**

### Wave ה' (תקבולי בט"ל וזיכויים מיוחדים)
- שדות 194/196/250/270 — תקבולי בט"ל (דמי לידה, אבטלה, מילואים, פגיעה בעבודה)
- אזרח ותיק (60+) — מדרגות מס שונות
- הורים בנפרד וכלכלת ילדים (שדה 029/129)
- דמי מזונות התקבלו/שולמו

### Wave ו' (קצוות)
- אופציות עובדים 102 / 3i (שדה 282)
- פדיון מניות חבר באגודה שיתופית
- שותפות נפט
- חברה זרה נשלטת (CFC) — נספח מורכב

---

## 6. קבצים שנוצרו

### Source code
- `src/features/annualReport/` — 14 קבצים (types, tree, engine, coverage, form1301Fields, repository, hook, 8 קומפוננטות)

### SQL Migrations
- `supabase/04-annual-report.sql`
- `supabase/05-client-extensions.sql`
- `supabase/06-client-completeness.sql`

### Scripts (CLI helpers)
- `scripts/extractPdfText.mjs` — חילוץ טקסט מ-PDFים
- `scripts/apply-annual-report.mjs`, `scripts/apply-client-extensions.mjs`, `scripts/apply-client-completeness.mjs`
- `scripts/verify-annual-tables.mjs` — אימות RLS
- `scripts/dump-sessions.mjs` — בדיקת מבנה סשנים ב-DB (שימש לאיתור בעיית המסך הלבן)
- `scripts/migrate-client-data.mjs` — מיגרציית נתוני לקוח
- `scripts/coverage-report.mjs` — דיווח כיסוי טרמינל
- `scripts/gen-mermaid-link.mjs` — יצירת קישור Mermaid Live

### תיעוד
- `decision_tree.md` — תרשים Mermaid + Coverage Matrix + ארכיטקטורה
- `1301_coverage_audit.md` — טבלת כל 44 השדות
- `claude_session_summary.md` — הקובץ הזה

### קבצים שעודכנו
- `src/App.tsx` — Tab + view חדש
- `src/types/index.ts` — 6+ types חדשים, הרחבת `Client`
- `src/lib/dbMappers.ts` — defaults לרשימות החדשות
- `src/components/clientTabs/PersonalContactsTab.tsx` — 7 סקציות חדשות + הוספות inline

---

## 7. כללי עבודה שנלמדו בסשן

- **לא נוגעים בנתוני אמת בלי לבדוק**: `dump-sessions.mjs` רץ לפני כל migration שמשנה data
- **Optional chaining בכל גישה למודל בשדות חדשים**: אחרי תקרית המסך הלבן, כל `conditionalOn` ב-`form1301Fields` הותקן
- **מקור אמת יחיד לסכמת 1301**: `form1301Fields.ts` עם `modelPath` + `sourceQuestionIds`. כל UI/coverage/checklist נגזר אוטומטית
- **הבחנה בין "טריאז'" ל"איסוף נתונים"**: השאלון אומר *אילו* שדות נחוצים, לא *כמה*. הסכומים נכנסים בשלב הבא דרך `modelPath`
- **שדות חסרים בכרטיס → רשימת דרישות, לא לעצור את הזרימה** (סעיף שגיא הדגיש)
- **אימות מול מקור רשמי**: כל ערך מס שנכתב הקובץ tax data אומת מול חוברת "דע את זכויותיך 2025"

---

## 8. הבדיקה הבאה שצריך לבצע (לפני Wave ג')

1. רענון בדפדפן (Ctrl+R) → היכנס דרך Google OAuth
2. פתח לקוח כלשהו → בדוק שטאב "פרטים אישיים וקשרים" מציג את 7 הסקציות החדשות בלי שגיאות
3. הוסף נתונים: לפחות מעביד אחד + חשבון השקעות (למשל "מיטב דש") + קופת פנסיה
4. חזור ללשונית "📋 דוח שנתי 1301" → התחל תהליך חדש לאותו לקוח
5. בשאלות הרלוונטיות → אמור לראות `dataPreview` עם הנתונים שהוזנו
6. סיים את השאלון → ב-Tab "📎 דרישות" אמור לראות "טופס 106 — [שם המעביד]" ו"אישור 867 — מיטב דש" כפריטים נפרדים
7. ודא שהמסך הלבן הקודם לא חוזר

אחרי שזה אומת — מתחילים Wave ג'.
