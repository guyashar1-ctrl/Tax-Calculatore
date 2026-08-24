// ─── מסך בדיקה למסכי הסיום שאחרי החתימה ─────────────────────────────────────
// ‼ למה זה קיים: המסך שאחרי החתימה מופיע רק בסוף הליך חתימה אמיתי — קישור
// אישי, PDF, וחתימה שנשמרת במסד. אי אפשר להגיע אליו בלי לייצר נתוני אמת.
// כאן מרכיבים את שלושת המצבים זה מתחת לזה, כדי לראות מה הלקוח באמת רואה.
//
// פתיחה:  http://localhost:5173/?test-signdone   (DEV בלבד)
//
// המצבים:
//   1. חתם עכשיו ויש אישור ב"ל ממתין  → חייב לצעוק שנשאר צעד, לא "סיימת"
//   2. חתם ואין ב"ל בכלל              → המסך הישן, סיום נקי
//   3. נכנס שוב לקישור אחרי שחתם      → אסור שיאמר "אין צורך בפעולה נוספת"

import ClientPageState from './ClientPageState';
import NiApprovalNotice from './NiApprovalNotice';

const NI = { referenceNumber: '12345678', deadline: '2027-01-10' };

export default function TestSignDone() {
  return (
    <div className="pivo-light public-page-shell">
      <ClientPageState
        wide
        mark="✓"
        title="החתימה התקבלה - נשאר צעד אחד"
        body={<>
          <div>תודה, ישראל ישראלי! משרד גיא ישר יגיש עכשיו את בקשת הייצוג לרשויות. הפעולה האחרונה שנשארה היא שלכם:</div>
          <NiApprovalNotice referenceNumber={NI.referenceNumber} deadline={NI.deadline} />
        </>}
      />
      <ClientPageState
        mark="🎉"
        title="החתימה נשלחה בהצלחה"
        body="תודה, ישראל ישראלי! משרד גיא ישר יגיש עכשיו את בקשת הייצוג לרשויות ויעדכן אתכם."
      />
      <ClientPageState
        wide
        mark="✓"
        title="החתימה כבר התקבלה"
        body={<>
          <div>תודה, ישראל ישראלי! נשאר צעד אחד - אישור בביטוח הלאומי.</div>
          <NiApprovalNotice referenceNumber={NI.referenceNumber} deadline={NI.deadline} />
        </>}
      />
    </div>
  );
}
