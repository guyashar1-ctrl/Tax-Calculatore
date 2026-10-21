// ─── הסרת עבודת מס שנפתחה בטעות או שאינה נחוצה — כללי ההחלטה (14.10.2026) ─────────────────────────
// ‼ גיא: «מחזור חיים ברור לפי מצב העבודה … אל תמחק בשקט מידע מאושר בתיק, מסמכים משותפים או היסטוריה».
//   שלוש תוצאות, לפי מה שכבר יצא מהמשרד:
//   · מחיקה — כלום לא יצא: שאלון לא פורסם, אין תשובה, מסמך, מייל או הערכה מאושרת. העבודה וטיוטת השאלות נעלמות.
//   · ביטול — משהו כבר יצא או התקבל. העבודה יורדת מהרשימה הפעילה, מ«בקשות» ומהדף האישי; שאלות פתוחות נסגרות
//     (הלקוח לא יכול לענות עליהן). תשובות, מסמכים, עובדות שאושרו וגרסאות מאושרות נשארים — ואפשר לבטל את הביטול.
//   · לא ניתן — עבודה שהושלמה היא היסטוריה (יסודות הבקשות §8).
// ‼ אותם כללים בשרת (supabase/242-tax-work-removal.sql) ובהדגמה (__fakeTaxYear). השרת קובע; המסך רק מסביר.

export type RemovalMode = 'delete' | 'cancel' | 'none';

export interface RemovalFacts {
  status: string;
  /** השאלון פורסם בדף האישי (לפחות פעם אחת). */
  infoPublished: boolean;
  asksDraft: number;
  /** שאלות שהלקוח רואה ועוד לא ענה — ייסגרו בביטול. */
  asksOpen: number;
  asksAnswered: number;
  factsAccepted: number;
  factsPending: number;
  documents: number;
  emails: number;
  estimatesApproved: number;
  estimatesPublished: number;
  estimatesDraft: number;
  /** הודעות שנמסרו ללקוח על העבודה (214). */
  notices?: number;
  /** הערות של המשרד, או ביטול/החזרה קודמים — היסטוריה שמחיקה הייתה מוחקת. */
  notes?: number;
}

const DONE = ['completed', 'verified', 'skipped'];

export function removalMode(f: RemovalFacts): RemovalMode {
  if (DONE.includes(f.status) || f.status === 'cancelled') return 'none';
  const leftTheOffice = f.infoPublished || f.asksAnswered > 0 || f.factsAccepted + f.factsPending > 0 || f.documents > 0
    || f.emails > 0 || f.estimatesApproved > 0 || f.estimatesPublished > 0 || (f.notices ?? 0) > 0 || (f.notes ?? 0) > 0;
  return leftTheOffice ? 'cancel' : 'delete';
}

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k} ${many}`);

/** מה יקרה — במילים, לחלון האישור. ‼ כל פריט שנשאר כתוב במפורש, כדי שאיש לא יחשוב שנמחק. */
/** as — כשהמשתמש בוחר לבטל עבודה שאפשר היה למחוק (לשמור היסטוריה). */
export function removalExplain(f: RemovalFacts, as?: 'delete' | 'cancel'): { title: string; goes: string[]; stays: string[]; why?: string } {
  const natural = removalMode(f);
  const mode = natural === 'none' ? 'none' : as === 'cancel' ? 'cancel' : natural;
  if (mode === 'none') {
    return f.status === 'cancelled'
      ? { title: 'העבודה כבר בוטלה', goes: [], stays: [], why: 'אפשר להחזיר אותה לרשימה הפעילה.' }
      : { title: 'עבודה שהושלמה נשארת בהיסטוריה', goes: [], stays: [], why: 'עבודה שהושלמה לא נמחקת ולא מבוטלת. אם צריך עוד עבודה לאותה תקופה — פותחים עבודה חדשה.' };
  }
  if (mode === 'delete') {
    return {
      title: 'מחיקת העבודה',
      goes: ['העבודה עצמה', ...(f.asksDraft ? [`${n(f.asksDraft, 'שאלה אחת בטיוטה', 'שאלות בטיוטה')} (לא פורסמו)`] : []), ...(f.estimatesDraft ? ['טיוטת ההערכה (לא אושרה)'] : [])],
      stays: ['הכרטיס ותיק המס של הלקוח — לא משתנים'],
      why: 'דבר לא יצא מהמשרד: השאלון לא פורסם, ואין תשובה, מסמך, מייל, הודעה ללקוח, הערה או הערכה מאושרת.',
    };
  }
  const stays: string[] = [];
  if (f.asksAnswered) stays.push(n(f.asksAnswered, 'תשובה אחת של הלקוח', 'תשובות של הלקוח'));
  if (f.factsAccepted) stays.push(`${n(f.factsAccepted, 'פרט אחד שאושר', 'פרטים שאושרו')} בתיק המס`);
  // ‼ פרט שממתין נבדק בתוך דף העבודה — אחרי ביטול הוא נשמר, ונבדק אם מחזירים את העבודה (לא ב«תיק מס»)
  if (f.factsPending) stays.push(`${n(f.factsPending, 'פרט אחד שממתין', 'פרטים שממתינים')} לבדיקה — ${f.factsPending === 1 ? 'נשמר; בודקים אותו' : 'נשמרים; בודקים אותם'} אם מחזירים את העבודה`);
  if (f.documents) stays.push(`${n(f.documents, 'מסמך אחד', 'מסמכים')} — ב«מסמכים» של הלקוח`);
  if (f.estimatesApproved) stays.push(n(f.estimatesApproved, 'גרסת הערכה מאושרת', 'גרסאות הערכה מאושרות') + ' — כהיסטוריה');
  if (f.emails) stays.push(`${n(f.emails, 'מייל אחד שנשלח', 'מיילים שנשלחו')} — ביומן`);
  if (f.notices) stays.push(`${n(f.notices, 'הודעה אחת שנמסרה ללקוח', 'הודעות שנמסרו ללקוח')} — ביומן`);
  if (f.notes) stays.push('הערות המשרד על העבודה');
  stays.push('היסטוריית העבודה — כולל הביטול והסיבה');
  return {
    title: 'ביטול העבודה',
    goes: [
      'העבודה יורדת מהרשימה הפעילה, מ«בקשות» ומהדף האישי של הלקוח',
      ...(f.asksOpen ? [`${n(f.asksOpen, 'שאלה פתוחה אחת נסגרת', 'שאלות פתוחות נסגרות')} — הלקוח כבר לא יוכל לענות עליהן`] : []),
      ...(f.asksDraft ? [`${n(f.asksDraft, 'שאלה בטיוטה נסגרת', 'שאלות בטיוטה נסגרות')}`] : []),
      ...(f.estimatesPublished ? ['ההערכה יורדת מהדף האישי'] : []),
    ],
    stays,
    why: natural === 'delete' ? 'העבודה תישמר ב«היסטוריה», עם הסיבה, ואפשר להחזיר אותה.' : 'משהו כבר יצא מהמשרד או התקבל מהלקוח, ולכן העבודה מבוטלת ולא נמחקת. אפשר להחזיר אותה.',
  };
}
