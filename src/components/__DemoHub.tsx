// ─── דף הדגמה מקומי — נקודת כניסה אחת לשתי המשימות (DEV בלבד) ──────────────
// ‼ אין כאן מסד ואין שליחה: כל הקישורים פותחים מסכים על נתונים מדומים
// (office-app / test-requests / test-exec). ‎?demo‎ בשרת הפיתוח.
// ‼ בלי תופעות לוואי ברמת המודול — App מייבא אותו סטטית.

const LINKS: { group: string; items: { title: string; sub: string; href: string }[] }[] = [
  {
    group: 'בקשות, מסמכים ומסלולים (אב-טיפוס, 2.10)',
    items: [
      { title: 'המבנה הכולל', sub: 'ספרייה ← מסלולים ← אצל הלקוח; המשרד לפני ואחרי; איפה מגדירים ואיפה רואים', href: '?flows-demo#map' },
      { title: 'ספרייה', sub: 'בקשות ומסמכים — כל אחד מוגדר פעם אחת, ו«בשימוש ב…»', href: '?flows-demo#library' },
      { title: 'בונה המסלולים', sub: 'שלבים, «נפתח אחרי», תנאים לפי סוג לקוח ובן/בת זוג, ומה יקרה אצל כל לקוח', href: '?flows-demo#flows' },
      { title: 'אצל הלקוח', sub: 'מפעילים, מקדמים את הלקוח, ורואים מייל מרוכז אחד, עדכון מאוחר, עצירה וביטול', href: '?flows-demo#client' },
    ],
  },
  {
    group: 'האפליקציה המלאה (נתונים מדומים)',
    items: [
      { title: 'המשרד', sub: 'שמונה יעדים: איפה מגדירים (ספרייה, מסלולים), איפה רואים מה קרה לבד (אוטומציות)', href: '?office-app#/firm' },
      { title: 'ספרייה', sub: 'בקשות ומסמכים — כל אחד מוגדר פעם אחת; «בשימוש ב» מוביל למסלול ולשלב', href: '?office-app#/firm/library' },
      { title: 'מסלולים', sub: 'מסלול הקליטה ומסלול שנתי — שלבים, «נפתח אחרי», איך מגיע ללקוח ומה יקרה', href: '?office-app#/firm/flows' },
      { title: 'אוטומציות', sub: 'כל מה שקורה לבד: מיילים ללקוחות, תזכורות, הודעות אליך ופעולות מול הרשויות — ומה קרה', href: '?office-app#/firm/automations' },
      { title: 'עורך «אישור באזור האישי»', sub: 'היעד הקבוע (gov.il) עם פתיחה/העתקה, והמדריך המצולם — גם בתצוגה המקדימה', href: '?office-app#/firm/portalCard' },
      { title: 'הכרטיס שהלקוח רואה', sub: 'הדף האישי של דוד (דמו) — «מדריך מצולם», לאן הקישור מוביל, ו«אישרתי»', href: '?portal=demo&office-app' },
      { title: 'תביעת מילואים — מה הלקוח רואה', sub: 'אותו דף של דוד: «תביעת מילואים בביטוח לאומי» ← «המשך» ← הסבר, «מדריך מצולם · 7 צעדים», קישור לאתר, והשאלה «מה מצאתם?»', href: '?portal=demo&office-app' },
      { title: 'לשנות את החתימה', sub: '«פרטי המשרד» ← «חתימה וחותמת למסמכים» ← «שינוי»', href: '?office-app#/firm/profile' },
      { title: 'לשלוח מסמך מהספרייה', sub: '«ספרייה» ← «מסמכים» ← «שליחה ללקוח» ← דוד כהן ← «הוספה לדף ושליחת מייל…»', href: '?office-app#/firm/library' },
      { title: 'מה יוצא לבד', sub: '«אוטומציות» — מה יוצא ללקוחות לבד, תזכורות ו«נשלחו» באותה שורה', href: '?office-app#/firm/automations' },
      { title: 'חיבור שאינו זמין', sub: 'מחשב העבודה כבוי — מה עושים', href: '?office-app&offline#/firm/connections' },
      { title: 'בקשות של דוד כהן', sub: 'לקוחות ← דוד כהן ← פתח ← לשונית «בקשות»: מסלול הקליטה בגרסה ישנה, פרסום ושליחה — בזיכרון בלבד', href: '?office-app#/clients' },
    ],
  },
  {
    group: 'מסך הבקשות — מצבים',
    items: [
      { title: 'הרבה בקשות, שמות ארוכים', sub: '14 בקשות בכל המצבים', href: '?test-requests&sc=many' },
      { title: 'מעט בקשות', sub: 'שלוש בקשות', href: '?test-requests&sc=few' },
      { title: 'אין בקשות פתוחות', sub: 'מצב ריק', href: '?test-requests&sc=empty' },
      { title: 'מצב כהה', sub: 'הרבה בקשות', href: '?test-requests&sc=many&theme=dark' },
    ],
  },
  {
    group: 'ביטול בקשת ייצוג בביטוח לאומי',
    items: [
      { title: 'לפני שליחה / אחרי שליחה', sub: 'שרון — «מחיקת הבקשה»; רותם — «ביטול הבקשה» עם אזהרה', href: '?test-requests&sc=ni' },
      { title: 'נשלח בינתיים בלשונית אחרת', sub: 'השרת דורש אישור — החלון עובר לאזהרה', href: '?test-requests&sc=ni&cancel=race' },
      { title: 'PIVO עובדת מול ב״ל ברגע זה', sub: 'הביטול נדחה, ההודעה נשארת בחלון', href: '?test-requests&sc=ni&cancel=running' },
      { title: 'כבר אושר', sub: 'אין פעולת ביטול; בהושלמו', href: '?test-requests&sc=approved' },
      { title: 'שגיאת רשת', sub: 'אין «הצלחה» מזויפת', href: '?test-requests&sc=ni&cancel=error' },
      { title: 'במרכז הייצוג', sub: 'הפעולה בשורת ביטוח לאומי', href: '?test-exec=1&linked=1&scenario=btl-pending' },
    ],
  },
];

export default function DemoHub() {
  return (
    <div dir="rtl" style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px 60px', fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 'var(--fs-24)', margin: '0 0 6px' }}>PIVO — הדגמה מקומית</h1>
      <p style={{ color: 'var(--ink-3)', margin: '0 0 22px', fontSize: 'var(--fs-14)' }}>
        אזור «המשרד» (ספרייה · מסלולים · אוטומציות) ומסך «בקשות» אחרי הפישוט. הכול על נתונים מדומים — אין מסד, אין מייל, אין פנייה לרשות.
      </p>
      {LINKS.map(g => (
        <section key={g.group} style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', fontWeight: 700, margin: '0 0 6px' }}>{g.group}</h2>
          <div style={{ borderTop: '1px solid var(--hairline-1)' }}>
            {g.items.map(i => (
              <a key={`${i.title}|${i.href}`} href={i.href}
                style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '12px 2px', borderBottom: '1px solid var(--hairline-1)', textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: 'var(--ink-1)', flex: '0 0 auto' }}>{i.title}</span>
                <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', flex: 1, minWidth: 0 }}>{i.sub}</span>
                <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>←</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
