// ─── «עדכן עכשיו» — פרומט אחד שבודק את כל הידע ומוסיף את מה שגיא לומד ─────────────────
// ‼ 21.10.2026 (גיא): «פרומט ככלי שאפשר להריץ לבדוק את הכל», ו«מה אני לומד בתואר — Claude יבדוק גם אותם ויוסיף,
//   או יפתח חלונות חדשים». הבסיס הוא פרומט התחזוקה הקיים (maintenancePrompt.ts, «כל הידע») — לא כפילות.
//   מעליו: הפריטים מ«מה אני לומד», השאלות שלא נענו, בניית מאגר הכללים, וסיום בשחרור (גיא הריץ ⇒ אישר את הסבב הזה).
// ‼ חומר מהתואר הוא קצה חוט, לא עובדה (WORKING-AGREEMENT §2): כל טענה נבדקת מול מקור ומסומנת מאומת/פרשנות/פתוח.

import { buildMaintenancePrompt } from '../maintenancePrompt';
import type { InboxItem, OpenQuestion } from './askApi';

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

export function buildUpdatePrompt({ inbox, questions, ruleCount }: { inbox: InboxItem[]; questions: OpenQuestion[]; ruleCount: number }): string {
  const base = buildMaintenancePrompt({ kind: 'all' });
  // הגבול הכללי של פרומט התחזוקה מוחלף כאן בגבול של הסבב הזה
  const body = base.split('\nגבולות:')[0];
  const waiting = inbox.filter(i => i.status === 'waiting');
  const items = waiting.length
    ? waiting.map(i => `- [${i.id}] ${i.title}${i.note ? ` — ${i.note}` : ''} · נוסף ${dmy(i.createdAt)}${i.files.length ? `\n  קבצים: ${i.files.map(f => `${f.name} (${f.path})`).join(' · ')}` : ''}`).join('\n')
    : '- אין פריטים ממתינים.';
  const qs = questions.length
    ? questions.map(q => `- [${q.id}] «${q.question}» · ${dmy(q.createdAt)}${q.answerable === null ? ' · לא נבדקה (השרת לא היה זמין)' : ''}`).join('\n')
    : '- אין שאלות פתוחות.';

  return `${body}

8. «מה אני לומד» — חומר מהתואר של גיא (קצה חוט, לא עובדה)
${items}
- הורדת הקבצים: node scripts/knowledge-inbox.mjs download <תיקייה זמנית מחוץ לריפו>.
- לכל פריט: לקרוא את החומר, לחלץ טענות, ולאמת כל אחת מול חוק, תקנות או פרסום רשמי — שנת מס, תחולה, גרסה. טענה שאומתה ⇒ מאומת; הסבר שלנו או מקור משני ⇒ פרשנות; לא נמצא מקור ⇒ פתוח.
- נושא שכבר קיים — להוסיף לו (סעיף, כלל, מושג, טעות נפוצה, תרגול). נושא שאין לו בית ⇒ נושא חדש בתחום המתאים (areaModel.ts DOMAINS, topics.ts, topics/<Name>Body.tsx, TopicPage), באותו מבנה ובאותם כללי ניסוח. מה שעוד לא נכתב — PlannedItem עם «טרם נכתב».
- כל מספר דרך המרשם (rules.ts), לא בטקסט. כל טענה עם <ClaimTag>.
- בסיום כל פריט: node scripts/knowledge-inbox.mjs done <id> "<מה נעשה: נושא/סעיף, כמה כללים, מה נשאר פתוח>".

9. שאלות שנשאלו ב«ידע מקצועי» ולא נמצאה להן תשובה מכלל מאומת
${qs}
- לכל שאלה: למצוא את התשובה במקור רשמי ולהוסיף אותה כטענה בנושא המתאים (עם ClaimTag ומקור). אין מקור ⇒ פריט פתוח, וזה ייאמר.
- בסיום: node scripts/knowledge-inbox.mjs resolve <id> "<איפה נוספה התשובה, או למה אין>".

10. מאגר הכללים — מה ש«שאל» עונה ממנו
- אחרי כל שינוי בידע: node scripts/knowledge-corpus.mjs (בונה מחדש את corpus.json לדפדפן ולפונקציה knowledge-answer). היום: ${ruleCount} כללים.
- npm run test:unit · npm run build · node scripts/knowledge-corpus.mjs --check.
- לבדוק בדפדפן ש«שאל» מוצא את מה שנוסף: לשאול שאלה אחת לכל פריט שנקלט ולכל שאלה שנסגרה.

גבולות הסבב הזה (גיא הריץ את «עדכן עכשיו» ⇒ אישר אותו):
- מותר: שינויי ידע בלבד (topics, rules, sources, areaModel, corpus), commit בענף ומיזוג ל-master ודחיפה — אחרי שכל הבדיקות עברו. הפונקציה knowledge-answer מתעדכנת עם הדחיפה; לאמת שהגוף בשרת כולל את המאגר החדש.
- מותר במסד: רק סימון «נקלט» ו«נסגרה» דרך scripts/knowledge-inbox.mjs.
- אסור: שינוי בחישובי מס, בתשובות לקוחות, בהערכות מאושרות, בנתוני לקוחות או פעולה מול רשות. שינוי שנוגע בהם — לעצור ולשאול את גיא.
- בסיום: סיכום קצר לגיא בעברית — מה השתנה, מה נוסף מהתואר, אילו שאלות נענו, מה נשאר פתוח, והאם זמין באתר.
מודל מומלץ: Opus 5.5 · high (משמעות כספית).`;
}
