# תוכנית ביצוע: בקשת «תביעת מילואים בביטוח לאומי» (05.10.2026)

> **למי:** סוכן ביצוע (Sonnet) בצ'אט נפרד. התכנון, ההכרעות והתמונות כבר נעשו — **אל תפתח
> אותם מחדש ואל תסרוק את הארכיטקטורה מחדש**. קרא רק את הקבצים שאתה עורך.
> **בסיס הקוד:** `origin/master` (‏`7d73d96` בזמן הכתיבה). מספרי השורות כאן משם ומשוערים.
> **חובה לפני שמתחילים:** `CLAUDE.md` (במיוחד §0, §1 QA, §9). הדיווח לגיא — בעברית, בלי ז'רגון.

---

## 0 · מה גיא יראה בסוף

1. **ספרייה ← בקשות:** שורה «תביעת מילואים בביטוח לאומי» (נוסח מוכן). בעורך — שורה
   «מצורף ללקוח: מדריך מצולם · 6 צעדים» עם כפתור להצגה.
2. **כרטיס לקוח ← בקשות ← ＋ בקשה חדשה ← מהספרייה:** בוחרים אותה, נפתח העותק לעריכה
   (כמו כל בקשה מהספרייה) עם אותה שורת «מצורף», שומרים, ומפרסמים בדף הלקוח כרגיל.
3. **בדף האישי של הלקוח:** כרטיס «תביעת מילואים בביטוח לאומי» ← «המשך» ← הסבר קצר,
   כפתור «מדריך מצולם · 6 צעדים», כפתור «לאזור האישי בביטוח לאומי ↗», ושאלה אחת:
   «מה מצאתם באזור האישי?» עם שלוש תשובות. שליחה ⇒ הבקשה הושלמה, והמשרד רואה את התשובה
   בשורה שלה (וההתראה הרגילה «הלקוח השלים בקשה»).
4. **המדריך:** 6 צעדים בטלפון ובמחשב — 5 צילומים מאתר ביטוח לאומי עם חצים וטבעות, ופרטים
   אישיים מטושטשים; הצעד האחרון — טופס 502 למי שעבד גם כשכיר.

---

## 1 · הכרעות (סגורות)

| נושא | ההכרעה | למה |
|---|---|---|
| איפה זה חי | **נוסח מוכן בספרייה** (שורה מובנית ב-`journey_templates`, ‏`office_id=null`, ‏`seed_key='reserve_duty_claim'`) של `custom_request` — לא סוג בקשה חדש ולא מסמך ב«מסמכים». | זו עבודה עם מחזור (הלקוח פועל במקום אחר ומדווח מה מצא) ⇒ בקשה (CLAUDE.md §9). מסמך ב«מסמכים» הוא חומר קריאה שנסגר בפתיחה — לא נותן תשובה ולא מעקב. סוג חדש = החלפת 4–5 פונקציות ענק בשרת בלי תועלת. |
| מה הלקוח עונה | דרישה אחת מסוג `select`, חובה. **בלי** העלאת קובץ. | בקשה חופשית נסגרת ברגע שכל דרישות החובה נענו; שדה רשות שנשאר — אי אפשר כבר למלא (מלכודת). וביטוח לאומי עצמו כותב שאין צורך בטופס 3010. |
| המדריך | רישום מדריכים מצולמים **בקוד** (`photoGuides.ts`) + רכיב תצוגה גנרי שמחולץ מ-`RepApprovalGuide`. הבקשה נושאת רק מפתח: `payload.clientPhotoGuide = 'reserve_duty_claim'`. | מקור אחד; המשרד לא יכול "לשבור" תמונות; הקישור לאתר קבוע עם המדריך (כמו `REP_PORTAL_CARD_FIXED.linkUrl`). |
| הקישור לאזור האישי | חלק מהגדרת המדריך בקוד — **לא** `clientLinkUrl`. | ‼ ב-`build_client_portal` (220, ענף `custom_request`) בקשה עם `clientLinkUrl` הופכת ל-`kind:'guide'` — פתיחת הקישור **סוגרת** אותה. אסור להשתמש בו כאן. |
| שם המפתח | `clientPhotoGuide` (בבקשה) / `photoGuide` (בפריט של הדף). | `guideKey` כבר תפוס במשמעות אחרת (מזהה בקשת מערכת, `types/onboarding.ts`). |
| שם הבקשה | «תביעת מילואים בביטוח לאומי» — אותו שם בספרייה, במשרד ובדף. | שם עקבי; החיפוש «מילואים» מוצא. לא תמיד מגישים (אולי הכול שולם) ולכן לא «הגשת…». |
| מיילים | אין מייל חדש. הבקשה נכנסת להודעה המרוכזת הקיימת כשמפרסמים את הדף. | «דף אחד ללקוח, לא מייל לכל בקשה». |
| תיקון אגב | העותק מהספרייה ב-`InlineComposer` מעביר הלאה `clientNote`, `clientNoteAfter`, `clientRefs`, `clientPhotoGuide` (היום הם נזרקים). | בלי זה הבקשה מגיעה ללקוח בלי הסבר ובלי מדריך. מתקן גם את «הקמת הרשאה לחיוב חשבון» בייצור, שההסבר שלה נזרק היום. |
| סדר שחרור | **אתר קודם, מסד אחר כך.** | אתר בלי 221 = שום דבר חדש לא נראה. מסד בלי אתר = בקשות שנוצרות בדקות הביניים בלי מדריך. |

---

## 2 · נכסים מוכנים — אל תיצור מחדש

- **הצילומים המנוקים:** `C:/Users/guyas/PIVO/guide-assets/reserve-duty-claim/step-1..5.webp`
  (נבדקו בעין: השם, תאריכי השירות, תאריכי התביעות ותאריך תחילת הביטוח מכוסים בטשטוש סינתטי
  שאין בו אף פיקסל מהמקור; חיתוך שמסיר את חלון ההתראות של Windows מצילום 4).
  התסריט שהפיק אותם: `_process.mjs` באותה תיקייה (קואורדינטות במקור).
- ‼ **המקור** (`C:\Users\guyas\Desktop\הגשת תביעת מילואים.docx` והתמונות שבו) **אסור להכניס
  לפרויקט**. רק חמשת קבצי ה-webp נכנסים, ל-`public/guides/reserve-duty-claim/`.
- מידות ומרכז ההגדלה (פיקסלים בתמונה):

| קובץ | w×h | focus |
|---|---|---|
| step-1.webp | 854×478 | [604, 235] |
| step-2.webp | 850×440 | [550, 256] |
| step-3.webp | 1128×595 | [780, 560] |
| step-4.webp | 912×317 | [380, 95] |
| step-5.webp | 900×472 | [537, 180] |

---

## 3 · הכנת סביבה

‼ העץ הראשי (`Desktop/code Projects/Tax Calculator`) מאחורי origin ומלא בשינויים של סשנים
אחרים — **לא עובדים בו, לא `git add` שם, לא `git stash` בשום מקום.**

```bash
cd "C:/Users/guyas/Desktop/code Projects/Tax Calculator"
git fetch origin
git worktree add -b feature/reserve-duty-claim C:/Users/guyas/pivo-wt/reserve-duty-claim origin/master
```

1. `node_modules`: junction ל-`C:\Users\guyas\pivo-wt\shaam-integration\node_modules`
   (`cmd //c mklink /J node_modules C:\\Users\\guyas\\pivo-wt\\shaam-integration\\node_modules`).
2. קבצי env (לא בגיט): להעתיק מ-`C:/Users/guyas/pivo-wt/request-groups/` את `.env.local`,
   `.env.staging`, `.env.development.local`, `.env.officeux.local` (רק מה ש-`git ls-files` לא מכיר).
3. vite: `C:/Users/guyas/pivo-wt/_viteconf/vite.reserve-duty.config.mjs` — העתק של
   `vite.request-groups.config.mjs` עם הנתיבים של ה-worktree החדש ו-cacheDir משלו.
4. `.claude/launch.json` בעץ הראשי — להוסיף שתי רשומות (באותה תבנית כמו `request-groups`):
   `reserve-duty` (‏`--mode officeux`, פורט **5211**) ו-`reserve-duty-staging` (‏`--mode staging`, **5212**).
5. **מספר מיגרציה:** לוודא ש-221 פנוי — `git ls-tree --name-only origin/master supabase/ | grep 221`,
   ו-`ls C:/Users/guyas/pivo-wt/*/supabase/221*`. תפוס ⇒ המספר הפנוי הבא, ולעדכן בכל מקום.
6. להעתיק את הקובץ הזה ל-`docs/PLAN-RESERVE-DUTY-CLAIM.md` ב-worktree (ייכנס לקומיט).

---

## 4 · מימוש

### 4.1 מסד — `supabase/221-reserve-duty-claim.sql`

כותרת בסגנון 220 (מה, למה, ‼ מה לא נוגעים). שלושה חלקים:

**(1) הנוסח המוכן** — אידמפוטנטי:

```sql
insert into public.journey_templates (user_id, office_id, kind, seed_key, name, description, entries)
select null, null, 'request', 'reserve_duty_claim', 'תביעת מילואים בביטוח לאומי',
       'הלקוח בודק באזור האישי בביטוח לאומי שכל תקופות המילואים שולמו, ומגיש תביעה על תקופה חסרה - עם מדריך מצולם',
       jsonb_build_array(jsonb_build_object(
         'key','e1', 'stepType','custom_request', 'owner','client', 'requiredForClose', false,
         'payload', jsonb_build_object(
           'title',       'תביעת מילואים בביטוח לאומי',
           'clientTitle', 'תביעת מילואים בביטוח לאומי',
           'clientSub',   'בודקים שכל תקופות המילואים שולמו - ומגישים תביעה על מה שחסר',
           'clientNote',  'ביטוח לאומי משלם לעצמאים תגמול מילואים לפי הדיווח של צה״ל, בדרך כלל בלי שצריך להגיש תביעה. כדאי לוודא באזור האישי שכל תקופה ששירתם מופיעה ושולמה - ואם תקופה חסרה, להגיש עליה תביעה. המדריך המצולם מראה כל לחיצה.',
           'clientNoteAfter', 'עבדתם גם כשכירים ערב השירות? מגישים בטופס 502 המקוון - הקישור בצעד האחרון של המדריך.',
           'clientPhotoGuide', 'reserve_duty_claim',
           'requirements', jsonb_build_array(jsonb_build_object(
             'key','outcome', 'kind','select', 'label','מה מצאתם באזור האישי?', 'done', false,
             'options', jsonb_build_array(
               'כל תקופות המילואים מופיעות - לא היה צריך להגיש',
               'חסרה תקופה - הגשתי עליה תביעה',
               'עבדתי גם כשכיר/ה - הגשתי בטופס 502'))))))
where not exists (select 1 from public.journey_templates
                   where seed_key = 'reserve_duty_claim' and office_id is null);
```

‼ **אין פסיקים בתשובות** — הקומפוזר מפצל אפשרויות לפי פסיק (`optionsText.split(',')`).
‼ אין `clientCta` (ברירת המחדל «המשך»/«סגירה») ואין `clientLinkUrl` (ראה §1).

**(2) `build_client_portal`** — **גוף 220 תו-בתו + שורה אחת.** להעתיק את כל ההצהרה
`CREATE OR REPLACE FUNCTION public.build_client_portal(p_client_id text, p_mode text)` עד
`$function$;` מ-`supabase/220-business-details-home-office.sql` (סעיף 9, ~שורות 676–1434),
ולהוסיף בענף `custom_request`, בפריט ה-`action` האחרון (זה עם
`'kind', case when v_res_url is not null then 'guide' else 'custom' end`, ~שורה 1029), אחרי `'noteAfter', …`:

```sql
          -- ‼ 221 · מדריך מצולם — המפתח בלבד. התמונות, הצעדים והקישור לאתר קבועים בקוד
          -- (src/components/portal/photoGuides.ts); מפתח לא מוכר ⇒ הדף פשוט לא מציג מדריך.
          'photoGuide', nullif(s.payload->>'clientPhotoGuide',''),
```

אחרי ההגדרה: `revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;`

**(3)** בסוף הקובץ: `select public.assert_domain_function_invariants();`

**אימות הגוף (חובה, בסקריפט ולא בעין):** `scripts/verify-221-body.mjs` — מחלץ מ-220 ומ-221 את
הטקסט בין `AS $function$` ל-`$function$;` של `build_client_portal`, מנרמל CRLF→LF, ומוודא
שההבדל היחיד הוא 3 השורות שנוספו. אותו סקריפט ישמש גם להשוואה מול `prosrc` החי (§7).

‼ לא נוגעים ב-`portal_submit_step`, במחולל, ב-`create_onboarding_request` או בכללי הסגירה —
`select` כבר נתמך מקצה לקצה (208: `v_kind='select'` + בדיקת אפשרויות, וסגירה כשאין דרישות חובה פתוחות).

### 4.2 הצילומים

להעתיק את 5 קבצי ה-webp מ-§2 ל-`public/guides/reserve-duty-claim/`. שום דבר אחר.

### 4.3 רכיב מדריך גנרי — `src/components/portal/PhotoGuide.tsx` (חדש)

לחלץ את גוף ה-dialog מ-`RepApprovalGuide.tsx` (ה-default export, ~שורות 261–415) לרכיב גנרי.
**ה-markup וה-classes (`rag-*`, `repApprovalGuide.css`) נשארים זהים** — זה חילוץ, לא עיצוב חדש.

```ts
export interface PhotoGuideStep {
  title: string;
  text: string;
  /** שורת משנה; יכולה לכלול \n. */
  extra?: string;
  /** בלי תמונה ⇒ צעד טקסט בלבד (בלי figure). */
  image?: { alt: string; w: number; h: number; focus: [number, number] };
  /** קישור בתוך הצעד (טופס 502). מוצג כמו קישור הכניסה; אינרטי בתצוגה במשרד. */
  link?: { url: string; label: string; host: string };
}
props: {
  onClose; accent?; kicker: string; steps: PhotoGuideStep[];
  imageUrl: (i: number) => string;
  entry?: { url: string; label: string; host: string; note: string };  // מוצג בצעד הראשון
  entryInert?: boolean; fine: string; scopeNote?: string;
}
```

- `RepApprovalGuide` (default export) הופך לעטיפה דקה: ממפה את `repApprovalGuideSteps(approvals)` ל-
  `PhotoGuideStep` (‏`image: {alt,w,h,focus}`), kicker «מדריך מצולם · אישור הייצוג באזור האישי»,
  entry `{label:'לכניסה לאזור האישי ↗', host:'gov.il', note:'נדרשות כניסה והזדהות.'}`, fine — הנוסח
  הקיים. **כל ה-exports וה-props שלו נשארים בדיוק** (5 מקומות משתמשים בו: PublicPortalPage,
  OnboardingTab, EmailsPage, RepresentationSettingsSection, RepresentationExecutionCenter).
- להעביר גם כפתור גנרי: `PhotoGuideButton({ steps: number, onClick, accent, className })` —
  אותו SVG ונוסח «מדריך מצולם · N צעדים»; `RepApprovalGuideButton` משתמש בו.
- טעינה מראש של הצעד הבא והגדלה ממוקדת — רק לצעדים עם תמונה.

### 4.4 רישום המדריכים — `src/components/portal/photoGuides.ts` (חדש)

```ts
export interface PhotoGuideDef {
  key: 'reserve_duty_claim';
  kicker: string; dir: string; fine: string;
  entry: { url: string; label: string; host: string; note: string };
  /** הכפתור בכרטיס הלקוח שמוביל לאתר. */
  siteLabel: string;
  steps: PhotoGuideStep[];
}
export const PHOTO_GUIDES: Record<string, PhotoGuideDef>;
export function photoGuideFor(key: unknown): PhotoGuideDef | null;   // לא מוכר ⇒ null
export const photoGuideImageUrl = (g: PhotoGuideDef, i: number) => `${import.meta.env.BASE_URL}guides/${g.dir}/step-${i + 1}.webp`;
```
‼ `step-N` לפי אינדקס הצילום, לא אינדקס הצעד (הצעד השישי אין לו תמונה) — לכן הצעדים עם תמונה הם 1–5 ברצף.

**התוכן (סופי — להעתיק כמו שהוא):**

- `kicker`: «מדריך מצולם · תביעת מילואים בביטוח לאומי» · `dir`: `reserve-duty-claim`
- `fine`: «הצילומים להמחשה, ופרטים אישיים הוסתרו בהם. המסכים באתר ביטוח לאומי עשויים להשתנות.»
- `entry`: `{ url: 'https://ps.btl.gov.il/#/Mevutach/Berur/', label: 'לכניסה לאזור האישי ↗', host: 'ps.btl.gov.il', note: 'נדרשות כניסה והזדהות.' }`
- `siteLabel`: «לאזור האישי בביטוח לאומי»

| # | title | text | extra | image (alt · w×h · focus) |
|---|---|---|---|---|
| 1 | נכנסים ובודקים שאתם רשומים כעצמאים | באזור האישי בביטוח לאומי בוחרים בתפריט שבצד «נתוני ביטוח» ← «בירור נתוני ביטוח». בלשונית «כללי» בודקים שמופיע «עצמאי». | מופיע גם «שכיר»? קראו את הצעד האחרון לפני שמגישים. | «המסך "נתוני ביטוח" באזור האישי. בתפריט בצד ימין "בירור נתוני ביטוח" מוקף. במרכז, ברשימת העיסוקים, "שכיר" ו"עצמאי" מוקפים ומסומנים בחץ. השם ותאריך תחילת הביטוח מוסתרים.» · 854×478 · [604,235] |
| 2 | בודקים אילו תקופות שולמו | בתפריט: «מילואים» ← «בירור מילואים», ובלשונית «תביעות אישיות». לוחצים על תאריך של תביעה כדי לפתוח אותה - רואים את תקופת השירות ואת הפיצוי לעצמאי (מינימום 2,548 ₪). | יש תקופה ששירתם והיא לא מופיעה כאן? מגישים עליה תביעה - בצעדים הבאים. כל התקופות מופיעות? אין מה להגיש - חוזרים לדף ובוחרים «כל תקופות המילואים מופיעות». | «המסך "מילואים": הלשונית "תביעות אישיות" ו"בירור מילואים" בתפריט מוקפים. חץ מצביע על שורת תביעה פתוחה, ומתחתיה טבלה מוקפת: תקופת שירות, מספר ימים ופיצוי לעצמאי. התאריכים מוסתרים.» · 850×440 · [550,256] |
| 3 | פותחים הגשת תביעה | בתפריט: «מילואים» ← «הגשת תביעה למילואים». גוללים לסוף העמוד ולוחצים «המשך להגשת תביעה». | ביטוח לאומי משלם לעצמאים לפי המידע שמגיע מצה״ל. אם עברו שבועיים מסוף השירות והתשלום לא הגיע - מגישים כאן. | «העמוד "תביעה למילואים". בתפריט "הגשת תביעה למילואים" מוקף; בתחתית ההסבר הקישור "המשך להגשת תביעה" מוקף ומסומן בחץ.» · 1128×595 · [780,560] |
| 4 | ממלאים את התקופה לפי טופס 3010 | סוג שירות: «רגיל». «שירות מתאריך» ו«עד תאריך» - בדיוק כמו באישור על שירות המילואים (טופס 3010). במעמד לפני השירות בוחרים «עצמאי», ולוחצים «הוסף תקופה». | חשוב לדייק בתאריכים - הם צריכים להתאים לאישור של צה״ל. | «טופס הוספת תקופה. שדות התאריכים מוקפים ומסומנים בחץ (התאריכים מוסתרים), האפשרות "עצמאי" מוקפת, והכפתור הירוק "הוסף תקופה" מוקף ומסומן בחץ.» · 912×317 · [380,95] |
| 5 | מאשרים ושולחים | התקופה נכנסת לטבלה עם סימן ✓. חסרה עוד תקופה? «הזנת תקופה נוספת» וממלאים שוב. בסוף מסמנים את ההצהרה שליד הכוכבית ולוחצים «שלח תביעה». | «לקזז את חובי בדמי הביטוח» - מסמנים רק אם יש חוב לביטוח לאומי ורוצים שיקוזז מהתגמול; לא בטוחים - שאלו אותנו. את טופס 3010 לא צריך לצרף. התשלום מגיע בדרך כלל תוך כ-10 ימים. | «התקופה שנוספה בטבלה עם סימן תקין (התאריכים מוסתרים). "הזנת תקופה נוספת" מוקף ומסומן בחץ; שתי תיבות ההצהרה מוקפות; "שלח תביעה" מוקף ומסומן בחץ.» · 900×472 · [537,180] |
| 6 | עבדתם גם כשכירים? | את ההצהרה בצעד הקודם («לא עבדתי כשכיר ערב השירות») אפשר לאשר רק אם לא עבדתם כשכירים. אם עבדתם גם כשכירים וגם כעצמאים - מגישים את התביעה בטופס 502 המקוון של ביטוח לאומי. | בסוף חוזרים לכאן ובוחרים מה מצאתם - כדי שנדע. | **בלי תמונה.** `link: { url: 'https://govforms.gov.il/mw/forms/T502@btl.gov.il?gbxid=0', label: 'לטופס 502 המקוון ↗', host: 'govforms.gov.il' }` |

(ב-alt השתמש במירכאות «» אם זה נוח ב-TS; התוכן הוא מה שחשוב.)

### 4.5 הדף האישי — `src/components/PublicPortalPage.tsx`

1. `PortalItem` (~שורה 60): `photoGuide?: string;` עם הערת ‼ קצרה (מפתח בלבד, 221).
2. `ActionItem` (~שורה 515), בבלוק `open && inPage && item.kind === 'custom'`: אחרי
   `<RequestGuide …/>` ולפני `<CustomRequestBlock …/>` — רכיב קטן `PhotoGuideRow` (באותו קובץ),
   שמוצג רק כש-`photoGuideFor(item.photoGuide)` מחזיר הגדרה:
   - `PhotoGuideButton` (‏`steps.length`) שפותח `PhotoGuide` עם `entry`, `entryInert={previewMode}`,
     `accent`. ‼ המדריך נפתח **גם** בתצוגה המקדימה במשרד (קריאה בלבד) — כמו ב-rep_approval.
   - קישור «{siteLabel} ↗» כ**כפתור משני** (מסגרת, לא מילוי — הכפתור המלא הוא «שליחה» של התשובה),
     `target=_blank rel=noopener noreferrer`; בתצוגה המקדימה — `span` אינרטי באותו מראה.
   - `LinkHostNote` עם `extra='נדרשות כניסה והזדהות'`.
   - שורה אחת עם `flexWrap` — בטלפון נשבר לשתי שורות בלי גלילה אופקית.

### 4.6 המשרד — העותק מהספרייה והעורך

1. **`src/lib/requestTemplates.ts`**: פונקציה טהורה
   ```ts
   /** מה שהנוסח בספרייה נושא ללקוח מעבר למה שהקומפוזר עורך — עובר הלאה כמו שהוא. */
   export const TEMPLATE_CARRY_KEYS = ['clientNote', 'clientNoteAfter', 'clientRefs', 'clientPhotoGuide'] as const;
   export function templateCarryOver(content: Record<string, unknown> | null | undefined): Record<string, unknown>
   ```
   (רק מפתחות קיימים ולא ריקים).
2. **`src/components/clientTabs/InlineComposer.tsx`** — `buildPayload` (~שורה 320): כשאין `edit`
   (יצירה) ו-`owner === 'client'`, למזג `...templateCarryOver(initialContent)` לתוך ה-payload.
   בעריכה אין שינוי (המיזוג הקיים כבר שומר מפתחות). ‼ משימה פנימית / גורם חיצוני — לא מעבירים.
   **ובמסך:** כשיש מה להעביר — שורה שקטה ליד השדות שהלקוח רואה:
   «מצורף ללקוח מהספרייה: הסבר · מדריך מצולם (6 צעדים)» (כל חלק רק אם קיים), וכשיש מדריך —
   כפתור «הצגה» שפותח `PhotoGuide` עם `entryInert`. בלי זה המשרד שולח דבר שהוא לא רואה.
3. **`src/components/office/pages/library/RequestEditor.tsx`** — ה-payload כבר נשמר (`{ ...orig }`,
   ~שורה 144). להוסיף את אותה שורה «מצורף ללקוח…» + «הצגה» כש-`orig.clientPhotoGuide` מוכר.
   לא לאפשר עריכה של המפתח.
4. **`src/types/onboarding.ts`** (~שורה 757, ליד `clientLinkUrl`): `clientPhotoGuide?: string;` עם הערה
   (מפתח ל-`photoGuides.ts`; ‼ לא `clientLinkUrl`, שהופך בקשה לחומר עזר שנסגר בפתיחה).

### 4.7 שרת ההדגמה — `src/components/office/__fakeBackend.ts`

כדי לבדוק את כל המסלול בלי מסד:
1. `journey_templates` (~שורה 153): רשומה `jt6` מובנית (`office_id: null`, `seed_key: 'reserve_duty_claim'`)
   עם **אותו** payload כמו ב-221.
2. `demoPortal()` (~שורה 385): בקשות `custom_request` של `DEMO_CLIENT` שפורסמו — לפלוט בצורה של
   השרת (220 + 221): `bucket` action/done, `kind:'custom'`, `sub`, `note`, `noteAfter`, `photoGuide`,
   `requirements` (key/kind/label/done/required/options/value), `actionKind:'portal'`, `actionValue: id`.
   ‼ שאר הפריטים — כמו היום (בדיקות אחרות סופרות אותם).
3. `portal_submit_step` (~שורה 864): גם לבקשות האלה — `select` עם ערך מהאפשרויות ⇒ הדרישה `done`
   עם `value`; אין דרישות חובה פתוחות ⇒ `status:'completed'`, `ball:'me'`, `completed_at`. ערך לא
   באפשרויות ⇒ `{ ok:false, error:'bad_choice' }`.
4. `src/components/__DemoHub.tsx`: שורה «תביעת מילואים — מה הלקוח רואה» ← `?portal=demo&office-app`.

### 4.8 תיעוד

- `docs/PLAN-RESERVE-DUTY-CLAIM.md` (הקובץ הזה) + בסופו פסקת «מה בוצע» קצרה בסיום.
- הערת ראש ב-`photoGuides.ts`: איך מוסיפים מדריך (תמונות מנוקות בלבד ב-`public/guides/<dir>`, המקור
  לעולם לא בפרויקט, מפתח בבקשה, שורה אחת בשרת כבר קיימת).

---

## 5 · בדיקות אוטומטיות

1. **בדיקות יחידה חדשות** (באותו מבנה כמו `src/features/requests/__tests__/*.test.ts`):
   - `photoGuides`: ל-`reserve_duty_claim` יש 6 צעדים; 5 עם תמונה, השישי בלי ועם `link`; לכל צעד עם
     תמונה קיים קובץ `public/guides/reserve-duty-claim/step-N.webp`; `focus` בתוך `w×h`;
     `photoGuideFor('nope')`/`photoGuideFor(undefined)` ⇒ `null`.
   - `templateCarryOver`: מעביר רק את 4 המפתחות, מדלג על ריקים, `null` ⇒ `{}`.
   - אם `portalView.test.ts` מרנדר כרטיסים — מקרה: פריט `custom` עם `photoGuide` מציג את הכפתור
     «מדריך מצולם · 6 צעדים» ואת «לאזור האישי בביטוח לאומי»; בלי `photoGuide` — לא.
2. `npx tsc --noEmit` · `npm run test:unit` (כולן, כולל הקיימות של rep-approval) · `npx vite build`.
3. **SQL** — `scripts/sql/test-221-reserve-duty-claim.sql` בתבנית של `test-220-business-details.sql`
   (‏`__USER__`, הכול בבלוק אחד שמתבטל):
   - הנוסח המוכן קיים פעם אחת; הרצה חוזרת של ה-insert לא מוסיפה שנייה.
   - `public.validate_requirements(<requirements של הנוסח>)` ⇒ תקין.
   - לקוח בדיקה + `custom_request` מפורסם עם ה-payload של הנוסח ⇒ `build_client_portal(cid,'live')` (וגם `'preview'`):
     פריט `kind='custom'`, `photoGuide='reserve_duty_claim'`, `note`/`noteAfter` קיימים, **אין** `linkUrl`
     ו-`kind<>'guide'`.
   - בקשה חופשית **בלי** `clientPhotoGuide` ⇒ אין `photoGuide` (פלט זהה לקודם).
   - `portal_submit_step(tok, step, {"key":"outcome","value":"חסרה תקופה - הגשתי עליה תביעה"})` ⇒
     `ok`, `completed=true`; השלב `completed`, `ball='me'`, `value` נשמר. ערך אחר ⇒ `bad_choice`.
   - `assert_domain_function_invariants()` עובר.
   הרצה: `node scripts/staging-dryrun-flows.mjs --only` ואז
   `node scripts/staging-dryrun-flows.mjs --tests-only scripts/sql/test-221-reserve-duty-claim.sql`.
4. `node scripts/verify-221-body.mjs` — ההבדל היחיד מ-220 הוא השורה שנוספה.

---

## 6 · QA בדפדפן (CLAUDE.md §1 — חובה, עם צילומים)

כלי: `playwright-core` דרך `createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')`
+ `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })`.
סקריפטים וצילומים — ב-scratchpad, לא בפרויקט. ‼ לא להוסיף תלויות.

**א · מקומי, מסד מדומה** (`preview_start` בשם `reserve-duty`, פורט 5211, `?office-app`):
1. ספרייה ← בקשות ← חיפוש «מילואים»: השורה קיימת, «נוסח מוכן»; עורך ⇒ «מצורף ללקוח…» ⇒ «הצגה»
   ⇒ 6 צעדים, 5 תמונות נטענות, לחיצה על תמונה מגדילה וממוקדת על החץ, הצעד השישי עם קישור 502.
2. כרטיס דוד ← בקשות ← ＋ בקשה חדשה ← מהספרייה ← הבקשה: הקומפוזר מציג שם, תת-כותרת, שאלה עם 3
   תשובות ושורת «מצורף»; שמירה ⇒ שורה בבקשות; פרסום בדף הלקוח בדרך הרגילה.
3. התצוגה המקדימה של דף הלקוח (בלשונית הבקשות): הכרטיס, «המשך», המדריך נפתח, הקישור אינרטי.
4. `?portal=demo&office-app`: הכרטיס ← «המשך» ← הסבר, מדריך, קישור (לבדוק `href` ו-`target`, לא חובה
   לטעון את האתר), השאלה ← בחירה ← «שליחה» ⇒ הבקשה עוברת להושלמו; במשרד השורה «הושלם · {התשובה}».
5. מקרי קצה: «שליחה» כבויה בלי בחירה; **רגרסיה** — מדריך אישור הייצוג (כרטיס דוד באותו דף, ומהמשרד)
   נפתח עם 7 הצעדים והתמונות כמו קודם; בקשה מהספרייה **בלי** מדריך — אין שורת «מצורף».
6. רוחבים: 1280, 390, 375 (במובייל `deviceScaleFactor: 2`); בהיר וכהה במשרד; אפס גלילה אופקית
   (`scrollWidth <= clientWidth`); הכפתורים בכרטיס נשברים לשורות; המדריך בטלפון — התמונה ברוחב
   המסך, ההגדלה עובדת.
7. קונסול: אפס שגיאות.

**ב · staging** (‏`evdfxjqrkgugssfrdoxd`) — אחרי §5:
1. `node scripts/staging-apply-migration.mjs supabase/221-reserve-duty-claim.sql` (גיא אישר את התוכנית ⇒
   staging מותר). לאמת `prosrc` מול הקובץ.
2. `preview_start` בשם `reserve-duty-staging` (5212) ← «כניסה כמשתמש בדיקה» (staging@pivo.test).
   לקוח בדיקה: QAFLOW (`node scripts/staging-seed-flows-demo.mjs`; בסוף `--clean`).
3. מסלול מלא: הוספה מהספרייה ← פרסום ← `?portal=<token של הלקוח>` ב-390 ← מדריך ← תשובה ← רענון
   אמיתי (F5) ⇒ הבקשה נשארת «הושלם» עם התשובה גם במשרד.
4. בהודעה המרוכזת ללקוח (ספק המייל המדומה — `test_captured_emails`) הבקשה מופיעה בשמה, אם נשלחה.
5. ניקוי: `--clean`; לוודא שלא נשאר לקוח/בקשת QA.

---

## 7 · שחרור לייצור — ‼ רק אחרי «כן» מגיא

לפני השחרור: לשלוח לגיא סיכום קצר + צילומים (ספרייה, קומפוזר, כרטיס בטלפון, צעד מהמדריך, שורת
«הושלם» במשרד) ולשאול שאלה אחת: «לשחרר לייצור?». בלי «כן» מפורש — עוצרים כאן.

**1 · האתר** (קודם — ראה §1):
- `git status --short` ב-worktree — לקמט **רק** את הקבצים של הסבב (לא `git add -A` עיוור).
- `git fetch` ⇒ אם `origin/master` זז: `git rebase origin/master`, ושוב tsc + unit + build.
- לוודא שוב שאין 221 ב-`origin/master` (אחרת לשנות מספר בכל מקום, ולהריץ שוב §5.3–5.4).
- `git push origin feature/reserve-duty-claim` ואז `git push origin HEAD:master` (fast-forward בלבד).
- Vercel (MCP): `list_deployments` / `get_deployment` ⇒ `READY`, `aliasError: null`, ‏crm.yasharcpa.co.il
  ב-alias. ‼ לא לדגום את הדומיין בלולאה (חוסם ב-Security Checkpoint). ‼ לא להשוות hash של החבילה.

**2 · המסד:**
- גיבוי: `pg_get_functiondef('public.build_client_portal(text,text)'::regprocedure)` מהייצור ⇒
  `C:/Users/guyas/PIVO/backups/r6-221-<תאריך>/build_client_portal.sql` + README עם השחזור
  (הרצת הקובץ + `delete from public.journey_templates where seed_key='reserve_duty_claim' and office_id is null`).
- **סטייה:** `prosrc` החי בייצור == הגוף ב-220? (‏`verify-221-body.mjs` מול הייצור). לא שווה ⇒ **עוצרים** ומדווחים.
- `node scripts/prod-apply-migration.mjs supabase/221-reserve-duty-claim.sql`.
- אימות: `prosrc` == 221; הנוסח המוכן קיים פעם אחת; `select public.assert_domain_function_invariants()` עובר;
  `node scripts/staging-test-single-source.mjs` (staging == ייצור).
- ‼ אין פונקציות Edge, אין cron, אין שינוי בנתוני לקוחות. **לא** ליצור בקשה על לקוח אמיתי בייצור.

**3 · אימות אחרון:** לבקש מגיא לפתוח ספרייה ← «מילואים» ולראות את השורה (או, אם הכרום שלו מחובר —
קריאת DOM בלבד דרך claude-in-chrome, בלי לחיצות שכותבות).

---

## 8 · הדיווח לגיא (בעברית, בלי ז'רגון)

מה נוסף ואיפה מוצאים אותו; מה נבדק בפועל (מחשב + טלפון, הדגמה + staging, עם רענון); צילומים;
מה **לא** נבדק (מכשיר אמיתי, משתמש חדש אמיתי); ומה נשאר (§9). אם משהו לא עבד — להגיד במפורש.

---

## 9 · מחוץ לסבב (לא לבנות)

- בקשה **בשם בן/בת הזוג** (מי ששירת הוא בן/בת הזוג) — אין היום בחירת נושא בקומפוזר מהספרייה;
  לא לעקוף בשם בכותרת (יסודות §5, §10).
- מעקב «התשלום הגיע?» אחרי הגשה — המשרד יכול לפתוח משימה ידנית.
- מדריך מצולם לבקשות `declare` אחרות — הרכיב הגנרי מאפשר, לא בסבב הזה.

## 10 · מלכודות ידועות

- `clientLinkUrl` בבקשה חופשית = «חומר עזר» שנסגר בפתיחה (220). לא להשתמש.
- פסיק באפשרויות `select` = פיצול שגוי בקומפוזר.
- החלה חוזרת של מיגרציה נמוכה על staging דורסת גופים של גבוהה — אחרי כל החלה, לאמת `prosrc`.
- שרת vite שהורץ ידנית בלי `--mode` טוען את הייצור — רק דרך `launch.json`.
- `git stash` אסור; העץ הראשי — לא נוגעים.
- StrictMode: לא לשנות ref בתוך פונקציית עדכון של setState (ברכיב המדריך).

---

## 11 · מה בוצע (05.10.2026)

**נוסף:** נוסח מוכן בספרייה «תביעת מילואים בביטוח לאומי» (מיגרציה 221, מובנית, פעם אחת) · כרטיס בדף האישי עם
ההסבר, «מדריך מצולם · 7 צעדים», «לאזור האישי בביטוח לאומי» ושאלה «מה מצאתם באזור האישי?» בארבע תשובות ·
רכיב מדריך גנרי (`PhotoGuide`, ואישור הייצוג נשען עליו בלי שינוי במראה) · רישום המדריכים (`photoGuides.ts`) ·
«מצורף ללקוח: הסבר · מדריך מצולם» בעורך הספרייה ובקומפוזר · «הושלמו» במשרד מציג את התשובה של הלקוח.

**סטיות מהתוכנית, ולמה:**
1. פורטים 5213/5214 (5211/5212 היו תפוסים).
2. **תוכן מקצועי — אומת מול ביטוח לאומי ו-gov.il ותוקן:** ירד «התשלום מגיע תוך 10 ימים» (אין לו בסיס); 2,548 ₪ מסומן
   «דוגמה בלבד» (תביעה אחת של 31 ימים), לא מינימום; מי שעבד גם כשכיר וגם כעצמאי מגיש בטופס 502 המקוון עם אישור צה״ל
   (3010), ובהגשה באזור האישי אין צורך ב-3010; מי שהכנסתו נמוכה מתגמול המינימום — מגיש אחרי שהמעסיק קיבל את התגמול.
3. **צעד «צור קשר» (גיא, 05.10):** צעד 6 במדריך — «המערכת לא מאפשרת להגיש תביעה?» — פונים לפקיד דרך «צור קשר», עם נוסח
   להעתקה (החודשים כמקום-שמור) ותשובה רביעית «המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»». ‼ מנוסח כתנאי — את החסימה
   עצמה לא מצאנו במקור כתוב של ביטוח לאומי. **הצילום (step-6)** הוא הצילום של גיא: נחתך לדף בלבד, השם והדואר האלקטרוני
   מכוסים בכיסוי סינתטי (בלי פיקסל מהמקור), חצים על «צור קשר» בתפריט ועל תיבת «תוכן הפניה». המקור לא נכנס לפרויקט.
   לכן 7 צעדים (שישה עם צילום), לא 6.
4. בצעד עם צילום **ונוסח** — הצילום קודם (איפה לוחצים), ואחריו הנוסח להעתקה.
5. שאלה עם 2–5 תשובות מוצגת כרשימת בחירה (ב-360 ה-select נחתך); בכרטיס עם דרישה אחת מוצגת שורת ההסבר (לא «0 מתוך 1»).
6. בתצוגה במשרד («איך זה ייראה», «הדף של X») כרטיס בקשה חופשית נפתח לקריאה — הפקדים כבויים, הקישור אינרטי.
7. **תיקון באג קיים:** הקומפוזר השמיט הסבר (`clientNote`/`clientNoteAfter`/`clientRefs`) ומדריך כשנפתח מהספרייה —
   עכשיו הם עוברים (`templateCarryOver`), רק ביצירה ורק בבקשה ללקוח.
8. Esc במדריך נתפס בשלב הלכידה של ה-window — אחרת הוא סגר את החלון שמתחתיו (העורך).
9. שרת ההדגמה: נתוני המילואים רק ב-`?portal=demo`, כפונקציות עצלות (לא נכנסים לחבילת הייצור — נבדק בגרפ על `dist`),
   ו«אחרי עדכון» כולל טיוטות.

**נבדק:** tsc נקי · בדיקות יחידה 1100/1100 (29 חדשות) · SQL 32/32 (בלוק שמתבטל) · `verify-221-body` — 221 = 220 + 3 שורות ·
דפדפן, הדמיה — הדף האישי ב-1280/390/375/360 והמשרד ב-1280/390 (מגע מדומה פעיל), בהיר וכהה, אפס שגיאות קונסול ·
**staging על מסד אמיתי** — ספרייה ← בקשה חדשה ← טיוטה ← «איך זה ייראה» ← פרסום (בלי מייל) ← קישור לדף ← טלפון 390 ←
מדריך (בלי קריאה לשרת) ← תשובה ← F5 בשני הצדדים ← «הושלמו» עם התשובה; בקשה חוזרת נוצרת כשורה חדשה והישנה נשארת;
360 על נתונים אמיתיים · רגרסיית מדריך אישור הייצוג: 80 עברו, 6 נכשלו — אותן שש שהיו כבר לפני הסבב (שתי ציפיות ישנות ×3 רוחבים).

**לא נבדק:** מכשיר אמיתי (רק דפדפן עם מגע מדומה) · משתמש חדש אמיתי שמוצא ומבין לבד · טעינת אתר ביטוח לאומי עצמו
(נחסם בבדיקות; נבדקו `href`/`target`/`rel`) · «שבועיים» בצעד 3 לעומת ניסוח אחר בדף אחר של ביטוח לאומי (לא הוכרע).
