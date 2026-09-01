// ─── בדיקות — הרתך פיתוח לאוטומציה דטרמיניסטית (flags.checksTab) ────────────
// זהו משטח פיתוח, לא יכולת מוצר. כל כפתור כאן בודק **יכולת אחת** בלבד.
// אחרי שרצף מוכח — נרכיב אותו לפעולת מוצר אמיתית ונעביר אותה למקום הנכון
// ב-PIVO. עד אז: הרבה כפתורים קטנים, כל אחד עם תוצאה דטרמיניסטית משלו.
//
// ‼ אין AI בזמן ריצה. לא כאן ולא בעובד המקומי — סלקטורים קבועים, כתובות
// קבועות, חתימות DOM קבועות. Claude עוזר לגלות את הרצף בזמן פיתוח בלבד.
//
// ‼ אימות מול רשות ממשלתית תמיד בידי אדם. שום primitive כאן לא נוגע
// בבחירת אישור, PIN, OTP או דיאלוג אימות של הדפדפן.

import type { Client } from '../../types';
import {
  DEV_STUB_ACTION_TYPE,
  SHAAM_DETECT_ACTION_TYPE,
  SHAAM_CHECK_AUTH_ACTION_TYPE,
  SHAAM_OPEN_INCOME_TAX_ACTION_TYPE,
  SHAAM_OPEN_CLIENT_FILE_ACTION_TYPE,
} from '../../types/automation';
import AutomationCheckCard from './checks/AutomationCheckCard';

interface Props {
  client: Client;
}

export default function ChecksTab({ client }: Props) {
  // ‼ מספר התיק במס הכנסה = ת.ז. של בן/בת הזוג הרשום/ה, ומקורו היחיד הוא
  // TaxFileInfo.fileNumber שבכרטיס. נשלח מפורשות ל-input של המשימה — העובד
  // לא קורא את טבלת הלקוחות ולא גוזר מזהה בעצמו.
  const incomeTaxFile = (client.taxFiles ?? []).find((f) => f.authority === 'income_tax');
  const fileNumber = (incomeTaxFile?.fileNumber ?? '').replace(/\D/g, '');

  return (
    <div className="cw-tabpanel checks-tab">
      <div className="checks-tab-intro">
        <h2 className="card-title">בדיקות</h2>
        <p>
          משטח פיתוח לבניית אוטומציה דטרמיניסטית, צעד אחר צעד. כל כפתור בודק
          יכולת אחת בלבד. הלשונית מוצגת רק אצלך ואינה חלק מהמוצר.
        </p>
      </div>

      <section className="checks-section">
        <h3 className="checks-section-title">תשתית</h3>
        <AutomationCheckCard
          client={client}
          actionType={DEV_STUB_ACTION_TYPE}
          title="בדיקת צנרת"
          devBadge
          description={
            'מוודא שהשרשרת כולה עובדת: יצירת משימה ב-PIVO, תפיסתה על-ידי העובד ' +
            'המקומי, וחזרת התוצאה לכאן. לא נוגע בשום רשות.'
          }
          runLabel="הרץ בדיקת צנרת"
          extraActions={[
            {
              label: 'בדיקת נתיב כישלון',
              input: { forceFail: true },
              title: 'יוצר משימה שנועדה להיכשל בכוונה — לבדיקת נתיב השגיאה',
            },
          ]}
          renderSuccess={(r) => (typeof r?.message === 'string' ? r.message : 'הצנרת הושלמה בהצלחה')}
        />
      </section>

      <section className="checks-section">
        <h3 className="checks-section-title">בדיקות אוטומציה — שע״ם</h3>
        <p className="checks-section-note">
          העובד מתחבר לחלון Chrome ייעודי שנפתח דרך <code>worker/launch-shaam-chrome.bat</code>.
          יש להתחבר לשע״ם באותו חלון ידנית (אישור דיגיטלי + PIN) ולהשאיר אותו פתוח —
          האוטומציה לעולם לא מבצעת את ההתחברות בעצמה.
        </p>

        <AutomationCheckCard
          client={client}
          actionType={SHAAM_DETECT_ACTION_TYPE}
          title="1 · מצא את שע״ם"
          devBadge
          description="מתחבר לחלון Chrome הייעודי ובודק ששע״ם מגיב. לא בודק התחברות ולא מנווט פנימה."
          runLabel="מצא את שע״ם"
          renderSuccess={(r) =>
            r?.shaamDetected ? 'נמצא חלון Chrome פעיל, ושע״ם מגיב.' : 'הסתיים.'
          }
        />

        <AutomationCheckCard
          client={client}
          actionType={SHAAM_CHECK_AUTH_ACTION_TYPE}
          title="2 · בדוק התחברות לשע״ם"
          devBadge
          description={
            'מזהה באופן דטרמיניסטי אם הסשן בחלון מאומת. לא מאומת ⇒ המשימה עוברת ' +
            'ל«דרוש אישור» עם הסבר מה לעשות — בלי לגעת באישור, ב-PIN או בקוד חד-פעמי.'
          }
          runLabel="בדוק התחברות"
          renderSuccess={(r) =>
            r?.authenticated ? 'הסשן בחלון Chrome הייעודי מאומת מול שע״ם.' : 'הסתיים.'
          }
        />

        <AutomationCheckCard
          client={client}
          actionType={SHAAM_OPEN_INCOME_TAX_ACTION_TYPE}
          title="3 · פתח מס הכנסה"
          devBadge
          description={
            'מנווט מהסשן המאומת אל מערכת גביית מס הכנסה. ‼ למערכת הזאת יש התחברות ' +
            'משלה (שם משתמש וסיסמה) שאינה הכרטיס החכם — אם היא נדרשת, המשימה עוברת ' +
            'ל«דרוש אישור» ואתם מזינים אותה בחלון. האוטומציה לא מזינה סיסמאות.'
          }
          runLabel="פתח מס הכנסה"
          renderSuccess={() => 'נפתח אזור מס הכנסה בשע״ם'}
        />

        <AutomationCheckCard
          client={client}
          actionType={SHAAM_OPEN_CLIENT_FILE_ACTION_TYPE}
          title="4 · פתח פרטי תיק"
          devBadge
          description={
            fileNumber
              ? 'פותח את שאילתה 181 («פרטי תיק») במערכת גביית מס הכנסה, עבור מספר ' +
                'התיק של הלקוח הזה. רק פותח — עדיין לא קורא נתונים מהמסך.'
              : '‼ ללקוח הזה אין מספר תיק במס הכנסה בכרטיס, ולכן אין מה לפתוח. ' +
                'יש להשלים אותו בתיק המס (מספר התיק = ת.ז. של בן/בת הזוג הרשום/ה).'
          }
          runLabel="פתח פרטי תיק"
          runInput={{ fileNumber }}
          renderSuccess={() => 'נפתח מסך פרטי התיק של הלקוח בשע״ם'}
        />
      </section>

      <section className="checks-section">
        <h3 className="checks-section-title">בהמשך</h3>
        <p className="checks-section-note">
          «מצא מסך פרטי תיק» ו«פתח פרטי תיק» ייבנו רק אחרי שנראה את המסכים
          האמיתיים — לא על סמך ניחוש של מבנה הניווט בשע״ם.
        </p>
      </section>
    </div>
  );
}
