// ─── קטלוג התהליכים — «ממה מורכב כל תהליך במערכת» ─────────────────────────────
// הרשימה שמסך «ניהול המשרד → תהליכים» מציג (M2). לכל תהליך משמעותי: מה מתחיל
// אותו, מאילו שלבים הוא מורכב, מי פועל, מה מותנה ובמה, מה נדרש, מה אפשר לדחות,
// ומה פירוש «הושלם».
//
// ‼ סיווג לפני תיאור. תהליך רב-שלבי מקבל שלבים; בקשה בודדת מקבלת «מה מבקשים,
//   מי פועל, מה זה הושלם» — ולא ציר זמן מומצא; תת-תהליך מוצג תחת האב; עבודה
//   פנימית מוצגת בקצרה בלי שלבי לקוח. פרטי מימוש (טיוטה/פורסם, תלות במסד,
//   סטטוסים טכניים) אינם שלבים.
//
// ‼ מקורות האמת נשארים במקומם: המחולל (generate_onboarding_steps) והתלויות
//   שלו — לרצף הפייפרלס ולמסלול הרו״ח הקודם; ברירות המחדל של המשרד
//   (office_journey_defaults) — לאילו בקשות נולדות ובאיזה סדר לכל סוג לקוח;
//   מצב בקשת הייצוג ומעקב הביצוע — לייצוג; הקטלוג ב«+ בקשה» — לבקשות
//   בודדות. מה שכתוב כאן הוא ההסבר — והבדיקות (scripts/test-process-catalog.ts,
//   scripts/staging-test-process-catalog.ts) נופלות כשהוא מפסיק להתאים.
//
// ‼ טהור: בלי React, בלי supabase, בלי utils שגוררים את הדוח השנתי.

import type { ProcessDefinition } from './processDefinition';
import { REPRESENTATION_PROCESS } from './representationJourney.ts';
import { STEP_TYPE_LABELS } from '../types/onboarding.ts';

// ── קליטה: הצעת מחיר ⇒ מסלול בקשות ⇒ סגירת הקליטה ────────────────────────
const INTAKE: ProcessDefinition = {
  key: 'intake',
  name: 'קליטת לקוח — מהצעת מחיר לתיק פעיל',
  group: 'journey',
  classification: 'multi_stage',
  purpose: 'לקוח חדש עובר מהצעת מחיר לתיק מנוהל: ההצעה מאושרת, המסלול נולד מברירות המחדל של המשרד, הבקשות מתבצעות בדף האישי, והקליטה נסגרת.',
  trigger: 'הצעת מחיר נשלחת ללקוח (מליד שנוצר בקישור «מילוי פרטים» של המשרד, או ביד).',
  completion: 'המשרד סוגר את הקליטה כשכל הבקשות שסומנו «נדרש לסגירה» הושלמו; ההתקשרות הופכת פעילה.',
  source: 'מצב ההצעה, ההתקשרות, ושלבי המסלול של הלקוח.',
  stages: [
    {
      key: 'lead', title: 'ליד ופרטים ראשונים', actor: 'client',
      what: 'הלקוח ממלא את קישור «מילוי פרטים» הקבוע של המשרד (או שהמשרד מזין אותו ביד). נרשם גם אם יש רו״ח קודם — זה קובע חלק מהמסלול.',
      done: 'קיים ליד עם שם ודרך התקשרות.',
    },
    {
      key: 'quote', title: 'הצעת מחיר', actor: 'office',
      what: 'המשרד בונה את ההצעה (שירותים, מחירים, ייצוג, שירותים עתידיים) ושולח. ברגע השליחה נולדים כרטיס לקוח ודף אישי קבוע.',
      requires: ['שירותים ומחירים', 'האם כולל ייצוג ובאיזה היקף'],
      done: 'ההצעה נשלחה; נצפתה כשהלקוח פתח אותה.',
      configureIn: 'quotations',
    },
    {
      key: 'approve', title: 'אישור ההצעה', actor: 'client',
      what: 'הלקוח קורא ומאשר בחתימה בעמוד ההצעה. אם ההצעה כוללת ייצוג — הוא עובר מיד לטופס הייצוג.',
      done: 'ההצעה «אושרה». ליד מומר ללקוח; המערכת פותחת התקשרות.',
    },
    {
      key: 'journey', title: 'המסלול נולד מברירת המחדל', actor: 'system',
      what: 'לפי סוג הלקוח (עוסק פטור / מורשה / חברה / החזר מס / ייצוג בלבד) והעובדות מההצעה והכרטיס, המערכת יוצרת את הבקשות: מסמכים מהלקוח, מסלול הרו״ח הקודם, רצף הפייפרלס, הרשאת תשלום, עדכון סטטוס מס, ועבודה פנימית. ההגדרה מצולמת להתקשרות — שינוי ברירת המחדל אחר כך אינו נוגע במסע שכבר נולד.',
      done: 'הבקשות קיימות בכרטיס כטיוטה.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'publish', title: 'פתיחת הדף האישי ללקוח', actor: 'office',
      what: 'המשרד עובר על הבקשות, מוסיף/מסיר/מסדר, ולוחץ «עדכן את דף הלקוח». עד אז הלקוח רואה רק את ייפוי הכוח.',
      done: 'הבקשות מפורסמות; הלקוח מקבל דף אחד עם כל מה שצריך ממנו.',
    },
    {
      key: 'requests', title: 'הבקשות מתבצעות', actor: 'client',
      what: 'הלקוח מעלה, ממלא, נרשם ומאשר בדף האישי; המשרד משלים את החלקים שלו (חיבור פייפרלס, מכתב לרו״ח הקודם, יישור קו). כל בקשה היא תהליך משלה — ראו את שאר הרשימה.',
      done: 'כל הבקשות שסומנו «נדרש לסגירה» הושלמו או דולגו במפורש.',
    },
    {
      key: 'close', title: 'סגירת הקליטה', actor: 'office',
      what: 'המערכת מאירה שהקליטה מוכנה לסגירה; רק לחיצה של המשרד סוגרת (אפשר גם לכפות עם סיבה ביומן). מכתב שחרור שחלון ההתייחסות שלו עבר בלי התנגדות נחשב מסופק — כלל עבודה של המשרד.',
      done: 'ההתקשרות פעילה. בקשות שנשארו פתוחות (ביקורת חודש ראשון, שדרוג ייצוג) ממשיכות ברקע.',
    },
  ],
  configurable: { text: 'אילו בקשות נולדות לכל סוג לקוח, סדרן והניסוח שלהן — ב«בקשות מסמכים».', section: 'requestDefaults' },
};

// ── פייפרלס ───────────────────────────────────────────────────────────────
const PAPERLESS: ProcessDefinition = {
  key: 'paperless',
  name: 'פייפרלס — הרשמה, חיבור ותשלום',
  group: 'journey',
  classification: 'multi_stage',
  purpose: 'הלקוח עובר לעבוד בפייפרלס, המשרד מחובר לחשבונו כמייצג, ותשלום הריטיינר החודשי נגבה דרכו.',
  trigger: 'נולד עם הקליטה כשההצעה כוללת שירות חודשי או הנהלת חשבונות/פייפרלס — אלא אם סומן בכרטיס שהלקוח לא יעבוד עם פייפרלס. אפשר גם להוסיף ביד מ«+ בקשה חדשה» («רצף פייפרלס»).',
  when: 'ההצעה כוללת שירות חודשי, או פריט הנהלת חשבונות / פייפרלס.',
  completion: 'החיבור הושלם והכרטיס הוזן — הריטיינר נגבה דרך פייפרלס. חיבור לרשות המסים (כשקיים) בוצע.',
  source: 'ארבע בקשות בכרטיס הלקוח; ההרשמה והחיבור לרשות המסים הן של הלקוח, החיבור וההרשאה של המשרד. סדרן וקיומן — מברירת המחדל של המשרד לכל סוג לקוח.',
  stages: [
    {
      key: 'invite', title: STEP_TYPE_LABELS.paperless_invite, actor: 'client', stepType: 'paperless_invite',
      kind: 'configurable',
      what: 'הלקוח נרשם לפייפרלס דרך קישור ההזמנה של המשרד (מ«פייפרלס ותקשורת») ומאשר בדף האישי «נרשמתי».',
      done: 'הלקוח דיווח שנרשם. זו הצהרה — אין אימות מול פייפרלס.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'connection', title: STEP_TYPE_LABELS.paperless_connection, actor: 'office', stepType: 'paperless_connection',
      kind: 'configurable',
      what: 'אחרי ההרשמה המשרד נכנס לחשבון ומשלים את ההקמה — חמישה סעיפים בסדר קבוע: מספר זהות, שם העסק, משיכת עוסקים, עדכון הריטיינר לכרטיס אשראי, והכרטיס שהלקוח הזין. הסעיף הרביעי הוא שגורם לפייפרלס לבקש מהלקוח כרטיס; החמישי סוגר.',
      requires: ['הלקוח נרשם (השלב נעול עד אז)'],
      blocks: 'בלי הרשמה אין חשבון להיכנס אליו.',
      done: 'חמשת הסעיפים סומנו. הסעיף החמישי נגזר גם מחותמת «הכרטיס הוזן» שבבקשת התשלום.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'tax_authority', title: STEP_TYPE_LABELS.paperless_tax_authority, actor: 'client', stepType: 'paperless_tax_authority',
      kind: 'conditional',
      when: 'רק למי שמוציא חשבונית מס וצריך מספר הקצאה: נולד כשתבנית ההצעה היא «עוסק מורשה» או «חברה», או כשעל הכרטיס רשום עוסק מורשה/חברה או סיווג מע״מ «עוסק מורשה». עוסק פטור אינו מקבל אותו — ואם יהפוך למורשה, הבקשה נולדת מעצמה. בקשה שהוסרה ביד אינה חוזרת.',
      what: 'הלקוח מחבר את פייפרלס לרשות המסים — ההזדהות היא בתעודת הזהות ובקוד הקבוע שלו, ולכן זה שלו ולא שלנו. תלוי בחיבור (צריך שם עסק ומשיכת עוסקים בחשבון).',
      done: 'הלקוח דיווח «ביצעתי את החיבור». החיבור תקף לשלושה חודשים; החידוש עדיין ידני.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'retainer', title: STEP_TYPE_LABELS.retainer_authorization, actor: 'office', stepType: 'retainer_authorization',
      kind: 'conditional',
      when: 'מופיע כשיש סכום חודשי בהצעה. הסכום מגיע מההצעה שאושרה ואינו נערך כאן. כשהלקוח לא עובד עם פייפרלס — נפתח כהסדר גבייה ידני, בלי תלות בחיבור.',
      what: 'המשרד מקים בפייפרלס הרשאה קבועה על הסכום שסוכם; הלקוח מזין כרטיס אשראי כשפייפרלס מבקש; המשרד מסמן שהריטיינר חויב. שלוש חותמות — כולן הצהרות של המשרד, אין אינטגרציה.',
      requires: ['החיבור לפייפרלס הושלם (השלב נעול עד אז)'],
      done: 'ההרשאה נוצרה, הכרטיס הוזן, הריטיינר חויב.',
      configureIn: 'requestDefaults',
    },
  ],
  configurable: { text: 'קישור ההזמנה ונוסח המיילים — ב«פייפרלס ותקשורת»; אילו מארבע הבקשות נולדות לכל סוג לקוח וסדרן — ב«בקשות מסמכים».', section: 'requestDefaults' },
};

// ── מעבר מרו״ח קודם ────────────────────────────────────────────────────────
const PREV_ACCOUNTANT: ProcessDefinition = {
  key: 'prev_accountant',
  name: 'חומרים מרו״ח קודם',
  group: 'journey',
  classification: 'multi_stage',
  purpose: 'הטיפול עובר מרואה החשבון הקודם למשרד: פרטיו נאספים, נשלח לו מכתב העברת טיפול, והחומרים מגיעים לתיק הלקוח.',
  trigger: 'נולד עם הקליטה כשרשום רו״ח קודם; אפשר גם להוסיף ביד מ«+ בקשה חדשה» בכל שלב.',
  when: 'רשום רו״ח קודם על הכרטיס או על הליד.',
  completion: 'החומרים המבוקשים התקבלו (הרו״ח הקודם הצהיר או המשרד סימן). מכתב ללא התנגדות בתוך חלון ההתייחסות נחשב מסופק.',
  source: 'שלוש בקשות תלויות זו בזו בכרטיס הלקוח, מוצגות ככרטיס אחד ב«בקשות».',
  stages: [
    {
      key: 'details', title: STEP_TYPE_LABELS.prev_accountant_details, actor: 'client', stepType: 'prev_accountant_details',
      kind: 'configurable',
      what: 'הלקוח ממלא בדף האישי שם, מייל וטלפון של הרו״ח הקודם — או רק מאשר אותם כשכבר רשומים בכרטיס.',
      blocks: 'בלי מייל אין למי לשלוח את המכתב — ולכן המכתב נעול עד שיש כתובת. כשהכתובת כבר בכרטיס השאלה היא אישור בלבד ואינה חוסמת.',
      done: 'הפרטים נכנסו לכרטיס.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'release', title: STEP_TYPE_LABELS.release_letter, actor: 'office', stepType: 'release_letter',
      kind: 'configurable',
      what: 'המשרד עורך את מכתב העברת הטיפול (תבנית המשרד + ארבעה סעיפים שנגזרים מההצעה: גבול הטיפול השוטף, עבודות שנשארו אצל הקודם, רשימת החומרים) ושולח אותו במייל עם קישור לדף משלו. הלקוח מכותב ואינו חותם.',
      requires: ['מייל של הרו״ח הקודם', 'תקופת הדיווח האחרונה בטיפולו'],
      done: 'המכתב נשלח. הרו״ח הקודם משיב, מסתייג או שותק — שתיקה עד תום חלון ההתייחסות היא הסכמה (כלל עבודה פנימי).',
      configureIn: 'paperless',
    },
    {
      key: 'materials', title: STEP_TYPE_LABELS.materials_received, actor: 'external', stepType: 'materials_received',
      kind: 'configurable',
      what: 'הרו״ח הקודם מעלה את החומרים בדף שלו — לפי פריט, או במרוכז ואז מצהיר מה כלל המשלוח. הכול מתויק בתיקייה אחת בתיק הלקוח, והמשרד מקבל סימן בכותרת.',
      done: 'כל הפריטים המבוקשים סומנו כהתקבלו. «חומר נוסף לפי שיקול דעתך» אינו נספר.',
      configureIn: 'requestDefaults',
    },
    {
      key: 'upgrade', title: STEP_TYPE_LABELS.representation_upgrade, actor: 'system', stepType: 'representation_upgrade',
      kind: 'conditional', parallel: true,
      when: 'מופיע כשהרו״ח הקודם נשאר המייצג הראשי — כי דוח שנתי או הצהרת הון עוד פתוחים אצלו. עד שיוגשו, המשרד רשום כמייצג משני.',
      what: 'כשהמשרד מסמן שהעבודה הוגשה, השלב מסמן «מוכן לשדרוג»; שינוי רמת הייצוג בכרטיס ל«ראשי» סוגר אותו מעצמו. אינו חוסם סגירת קליטה.',
      done: 'המשרד רשום כמייצג ראשי בכל הרשויות.',
    },
  ],
  configurable: { text: 'נוסח המכתב — ב«פייפרלס ותקשורת»; רשימת החומרים המבוקשים — בכרטיס הלקוח לפני השליחה.', section: 'paperless' },
};

// ── ייצוג בביטוח לאומי לאדם (תת-תהליך, וגם עצמאי) ──────────────────────────
const NI_PER_PERSON: ProcessDefinition = {
  key: 'ni_person',
  name: 'ייצוג בביטוח לאומי — לאדם',
  group: 'journey',
  classification: 'sub_process',
  parentKey: 'representation',
  purpose: 'ייפוי כוח מבוטח בביטוח לאומי לאדם אחד — הלקוח או בן/בת הזוג. בביטוח הלאומי לכל מבוטח תיק משלו, ולכן זה מסלול לכל אדם.',
  trigger: 'חלק מבקשת הייצוג כשביטוח לאומי כלול; או בקשה עצמאית מתיק המס («בקש ייצוג» לבן/בת הזוג) ומ«+ בקשה חדשה».',
  completion: 'המבוטח אישר את האסמכתא והמשרד סימן — הייצוג בביטוח לאומי פעיל לאדם הזה.',
  source: 'מסלול הביצוע במרכז הייצוג; בקשה «ייצוג ברשות» ב«בקשות» היא מראה שלו.',
  stages: [
    {
      key: 'prereq', title: 'פרטים שהפורטל דורש', actor: 'office', kind: 'conditional',
      when: 'מופיע רק כשחסר בכרטיס אחד מארבעת השדות: ת.ז., שנת לידה, שם פרטי, שם משפחה.',
      what: 'הבקשה אינה מציעה הזנה לפני שיש מה להזין: המשרד ממלא עכשיו, או שולח לאדם קישור קצר להשלמת הפרטים (עם תפוגה). שני הנתיבים כותבים לאותו מקום בכרטיס, עם היסטוריה.',
      done: 'ארבעת השדות מלאים.',
    },
    {
      key: 'enter', title: 'הזנה באתר ביטוח לאומי', actor: 'office',
      what: 'המשרד מזין את ייפוי הכוח במסך «הוספת ייפוי כוח מבוטח» (או שהאוטומציה עושה זאת) ומקבל מספר אסמכתא ומועד אחרון לאישור.',
      done: 'אסמכתא ומועד נרשמו על הבקשה.',
    },
    {
      key: 'instructions', title: 'ההוראות מגיעות למבוטח', actor: 'system',
      what: 'כשהמבוטח הוא הלקוח — ההוראות יוצאות יחד עם מייל החתימה (או במייל נפרד אם האסמכתא הגיעה אחר כך). כשהמבוטח הוא בן/בת הזוג בלי כרטיס משלו/ה — מייל ייעודי מהבקשה, לכתובת שבכרטיס; הלקוח יכול גם להעביר את ההוראות בעצמו.',
      done: 'נרשם מייל ביומן אחרי שליחה מוצלחת. היעדר כתובת אינו מייצר התקדמות.',
      configureIn: 'representation',
    },
    {
      key: 'confirm', title: 'המבוטח מאשר', actor: 'client',
      what: 'באתר ביטוח לאומי או בטלפון, עם מספר האסמכתא, לפני המועד האחרון. המשרד מסמן «אושר» כשבדק שהאישור נקלט.',
      blocks: 'אחרי המועד האחרון האסמכתא פגה ומזינים מחדש.',
      done: 'סומן «אושר». ייצוג הלקוח במס הכנסה אינו ממתין לזה.',
      stepType: 'authority_representation',
    },
  ],
};

// ── בקשות בודדות ───────────────────────────────────────────────────────────
const CLIENT_DOCUMENTS: ProcessDefinition = {
  key: 'client_documents',
  name: STEP_TYPE_LABELS.client_documents,
  group: 'requests',
  classification: 'single_step',
  purpose: 'רשימת מסמכים שהלקוח מעלה בדף האישי — לפי סוג הלקוח: תעודות פתיחה לעסק חדש, מה שיש ביד למי שעובר מרו״ח אחר.',
  trigger: 'נולדת עם הקליטה (תמיד), או מ«+ בקשה חדשה». צילום תעודה שנדחה בטופס הייצוג מצטרף אליה כפריט.',
  completion: 'כל הפריטים הועלו — הכדור חוזר למשרד, וההחלטה אם «מאומת» היא שלו. צילום תעודה שמגיע כאן נרשם גם על בקשת הייצוג.',
  source: 'רשימת הפריטים על הבקשה; הקבצים בתיק המסמכים של הלקוח.',
  stages: [{
    key: 'upload', title: 'הלקוח מעלה כל פריט', actor: 'client', stepType: 'client_documents', kind: 'configurable',
    what: 'לכל פריט כפתור העלאה בדף האישי (גם מהטלפון). המשרד יכול לסמן פריט ביד כשהמסמך הגיע בדרך אחרת. ההעלאה מתויקת בתיק המסמכים עם תווית.',
    done: 'כל הפריטים סומנו.',
    configureIn: 'requestDefaults',
  }],
  configurable: { text: 'רשימת המסמכים לכל סוג לקוח — ב«בקשות מסמכים»; לכל לקוח — בעריכת הבקשה בכרטיס.', section: 'requestDefaults' },
};

const INTAKE_QUESTIONNAIRE: ProcessDefinition = {
  key: 'intake_questionnaire',
  name: STEP_TYPE_LABELS.intake_questionnaire,
  group: 'requests',
  classification: 'single_step',
  purpose: 'שאלון קצר שממנו נגזר תיק המס: מצב משפחתי, ילדים, מקורות הכנסה, נכסים — ומה חסר.',
  trigger: 'נולד עם הקליטה כטיוטה; הלקוח רואה אותו רק כשפותחים אותו במפורש. אפשר גם לשלוח מתיק המס («שלח שאלון עדכון») ומ«+ בקשה חדשה».',
  completion: 'הלקוח ענה על השאלה האחרונה — הבקשה נסגרת מעצמה; המשרד עובר על העובדות ומאשר אותן לתיק המס.',
  source: 'התשובות והשאלה הנוכחית נשמרות בשרת אחרי כל תשובה.',
  stages: [{
    key: 'answer', title: 'הלקוח עונה שאלה-שאלה', actor: 'client', stepType: 'intake_questionnaire', kind: 'configurable',
    what: 'שאלה אחת בכל מסך, בדף האישי או בקישור נפרד. «לא בטוח/ה» מסמן את השאלה לבירור עם המשרד. אפשר לעצור ולחזור — השאלון נפתח באותה שאלה.',
    deferrable: 'הכול: השאלון ניתן להמשך בכל זמן.',
    done: 'השאלון הוגש.',
    configureIn: 'requestDefaults',
  }],
};

const CUSTOM_REQUEST: ProcessDefinition = {
  key: 'custom_request',
  name: STEP_TYPE_LABELS.custom_request,
  group: 'requests',
  classification: 'single_step',
  purpose: 'בקשה שהמשרד מרכיב בעצמו: דרישות מסוגים שונים בבקשה אחת — לקרוא ולאשר, לענות בטקסט, להעלות קובץ או כמה קבצים, מספר, תאריך, בחירה.',
  trigger: '«+ בקשה חדשה» בכרטיס, תבנית מסע, או ברירת מחדל של המשרד (אישור תנאי שכר טרחה, פרטי רכב, ועוד).',
  completion: 'כל דרישות החובה הושלמו; דרישת רשות אינה חוסמת לעולם.',
  source: 'רשימת הדרישות על הבקשה.',
  stages: [{
    key: 'fulfil', title: 'הלקוח משלים את הדרישות', actor: 'client', stepType: 'custom_request', kind: 'configurable',
    what: 'כל דרישה והפעולה שלה בדף האישי. בקשה עם הכדור אצל המשרד היא משימה פנימית ואינה מוצגת ללקוח.',
    done: 'דרישות החובה סומנו.',
    configureIn: 'requestDefaults',
  }],
  configurable: { text: 'ארבע בקשות מוכנות של המשרד — ב«בקשות מסמכים».', section: 'requestDefaults' },
};

const BANK_DEBIT: ProcessDefinition = {
  key: 'bank_debit',
  name: 'הקמת הרשאה לחיוב חשבון במוסדות',
  group: 'requests',
  classification: 'single_step',
  purpose: 'הלקוח פותח בבנק הרשאה לחיוב חשבון לטובת הרשויות שנבחרו (מס הכנסה 2760, מע״מ 2761, ביטוח לאומי 28900) ומעלה אסמכתה לכל אחת.',
  trigger: '«+ בקשה חדשה → הרשאה בבנק», או ברירת מחדל של המשרד. המשרד בוחר לכל לקוח אילו רשויות.',
  completion: 'אסמכתה הועלתה לכל רשות שנבחרה.',
  source: 'בקשה חופשית עם דרישת קובץ לכל רשות — תבנית, לא סוג בקשה נפרד.',
  stages: [{
    key: 'authorize', title: 'הלקוח מקים את ההרשאה ומעלה אסמכתה', actor: 'client', stepType: 'custom_request', kind: 'configurable',
    what: 'ההוראות וקודי המוסד מוצגים בדף האישי; לכל רשות כפתור העלאה משלה.',
    done: 'כל האסמכתאות הועלו.',
    configureIn: 'requestDefaults',
  }],
};

const SEND_DOCUMENT: ProcessDefinition = {
  key: 'send_document',
  name: 'שליחת מסמך ללקוח',
  group: 'requests',
  classification: 'single_step',
  purpose: 'המשרד מוסר ללקוח קובץ — מדריך מספריית המשרד, מסמך מתיקיית הלקוח, או מהמחשב — ומבקש שיעבור עליו.',
  trigger: '«+ בקשה חדשה → שליחת מסמך», או ברירת מחדל של המשרד. אפשר לצרף הודעה.',
  completion: 'הלקוח סימן «עברתי על המסמך». פתיחה בלבד אינה סוגרת.',
  source: 'בקשה חופשית עם דרישת אישור; קובץ פרטי נפדה בקישור חתום.',
  stages: [{
    key: 'review', title: 'הלקוח פותח ומאשר', actor: 'client', stepType: 'custom_request', kind: 'configurable',
    what: 'כפתור פתיחה אחד בדף האישי, ואחריו אישור. המשרד יכול לפתוח את הבקשה מחדש.',
    done: 'סומן «עברתי על המסמך».',
    configureIn: 'clientDocs',
  }],
  configurable: { text: 'ספריית המסמכים של המשרד — ב«מסמכים ללקוחות».', section: 'clientDocs' },
};

// ── עבודה פנימית ───────────────────────────────────────────────────────────
const INSTITUTION_ALIGNMENT: ProcessDefinition = {
  key: 'institution_alignment',
  name: 'יישור קו מול הרשויות',
  group: 'internal',
  classification: 'internal',
  purpose: 'המשרד נכנס לשלושת המוסדות, מעתיק את מה שרשום שם לתיק המס, ומסמן חריגים — כדי שהתיק ישקף את המציאות ברשויות.',
  trigger: 'נולד עם הקליטה (תמיד); אפשר להריץ מחדש ללקוח פעיל. אינו מוצג ללקוח.',
  completion: 'שלוש הבדיקות בוצעו; מה שנאסף לבירור עובר לשיחת הפתיחה.',
  source: 'שלוש בקשות פנימיות + שיחת פתיחה, ב«העבודה שלי».',
  stages: [
    { key: 'btl', title: STEP_TYPE_LABELS.institution_alignment_btl, actor: 'office', stepType: 'institution_alignment_btl', what: 'סטטוס מבוטח, מקדמות, חובות.', done: 'נבדק ונרשם.' },
    { key: 'vat', title: STEP_TYPE_LABELS.institution_alignment_vat, actor: 'office', stepType: 'institution_alignment_vat', what: 'סיווג, תדירות דיווח, פתוחים.', done: 'נבדק ונרשם.' },
    { key: 'income', title: STEP_TYPE_LABELS.institution_alignment_income, actor: 'office', stepType: 'institution_alignment_income', what: 'סוג תיק, מקדמות, שנים פתוחות.', done: 'נבדק ונרשם.' },
    { key: 'call', title: STEP_TYPE_LABELS.opening_call, actor: 'office', stepType: 'opening_call', kind: 'conditional',
      when: 'לקליטה חדשה בלבד; תלוי בשלוש הבדיקות.',
      what: 'שיחה עם הלקוח על מה שהצטבר לבירור.', done: 'השיחה התקיימה.' },
  ],
};

const OFFICE_INTERNAL: ProcessDefinition = {
  key: 'office_internal',
  name: 'הקמה פנימית של התיק',
  group: 'internal',
  classification: 'internal',
  purpose: 'עבודה שהמערכת פותחת למשרד עם כל קליטה ואינה מוצגת ללקוח ואינה חוסמת סגירה.',
  trigger: 'נולדת עם הקליטה.',
  completion: 'כל פריט נסגר בנפרד; לא נספר בשער הסגירה.',
  source: 'בקשות פנימיות בכרטיס, מחוץ למשטח «בקשות».',
  stages: [
    { key: 'setup', title: STEP_TYPE_LABELS.internal_setup, actor: 'office', stepType: 'internal_setup', what: 'מספרי תיקים בכרטיס, שיוך מטפל, תדירויות דיווח — חלקם נסגרים לבד ממה שכבר ידוע.', done: 'הרשימה סומנה.' },
    { key: 'kyc', title: STEP_TYPE_LABELS.kyc_identification, actor: 'office', stepType: 'kyc_identification', kind: 'conditional', when: 'כשיש ייצוג.', what: 'הכרת הלקוח — חתימה רגולטורית שנשארת ידנית.', done: 'סומן.' },
    { key: 'files', title: STEP_TYPE_LABELS.file_opening, actor: 'office', stepType: 'file_opening', kind: 'conditional', when: 'לעסק חדש (נרשם במפורש שאין רו״ח קודם או שאין העברת עסק).', what: 'פתיחת תיקים במע״מ, מס הכנסה וביטוח לאומי.', done: 'שלושת התיקים סומנו.' },
    { key: 'review', title: STEP_TYPE_LABELS.first_month_review, actor: 'office', stepType: 'first_month_review', kind: 'optional', when: 'תזכורת ל-30 יום אחרי האישור; ממשיכה אחרי סגירת הקליטה.', what: 'ביקורת חודש ראשון.', done: 'סומן.' },
  ],
};

export const PROCESS_CATALOG: ProcessDefinition[] = [
  INTAKE,
  REPRESENTATION_PROCESS,
  NI_PER_PERSON,
  PAPERLESS,
  PREV_ACCOUNTANT,
  CLIENT_DOCUMENTS,
  INTAKE_QUESTIONNAIRE,
  CUSTOM_REQUEST,
  BANK_DEBIT,
  SEND_DOCUMENT,
  INSTITUTION_ALIGNMENT,
  OFFICE_INTERNAL,
];

export const processByKey = (key: string): ProcessDefinition | undefined =>
  PROCESS_CATALOG.find(p => p.key === key);

/**
 * מה בכוונה אינו תהליך בקטלוג — כדי שהרשימה תהיה שלמה ולא רק מה שנוח להציג.
 * (מוצג בתחתית המסך כהערה קצרה, ונבדק בבדיקת הקבועים מול סוגי השלב.)
 */
export const NOT_A_PROCESS: { what: string; why: string }[] = [
  { what: 'מסמכים ובקשות בטיוטה / «עדכן את דף הלקוח»', why: 'מנגנון פרסום — חלק משלב «פתיחת הדף האישי» בקליטה, לא תהליך.' },
  { what: 'ייבוא היסטוריה ואימות נתונים בפייפרלס', why: 'שלבים פנימיים שנפתחים רק כשהמשרד קובע מסלול נתונים; אינם מוצגים ללקוח.' },
  { what: 'חידוש/סיום התקשרות', why: 'אירוע במחזור חיי ההסכם, לא תהליך מול הלקוח.' },
  { what: 'הדוח השנתי (שאלון המשרד)', why: 'כלי עבודה של המשרד; הצד של הלקוח הוא «עדכון סטטוס מס».' },
  { what: 'חיבור המשרד לשע״ם / ביטוח לאומי (אוטומציה)', why: 'תשתית של המשרד, לא תהליך של לקוח — מקטע «חיבור לשע״ם».' },
];
