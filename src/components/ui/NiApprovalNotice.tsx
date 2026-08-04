// ─── אישור ייפוי הכוח בביטוח לאומי — הפעולה שנשארה ────────────────────────
// מוצג ברגע שאחרי החתימה. עד עכשיו המסך הזה אמר "קיבלנו, אפשר לסגור את
// החלון", והלקוח סגר — גם כשאישור הב"ל עוד המתין לו. זהו הרגע האחרון שבו
// הוא עוד פועל, ולכן כאן מופיעה האסמכתא עצמה ולא הפניה למייל.

import { NI_APPROVAL_PHONE, NI_APPROVAL_SITE, NI_APPROVAL_SITE_LABEL } from '../../types';

interface Props {
  referenceNumber: string;
  /** המועד האחרון לאישור (YYYY-MM-DD). אחריו האסמכתא פגה. */
  deadline?: string | null;
}

export default function NiApprovalNotice({ referenceNumber, deadline }: Props) {
  const deadlineText = deadline
    ? new Date(deadline).toLocaleDateString('he-IL')
    : '';

  return (
    <div className="nia">
      <div className="nia-lead">
        הזנו עבורכם את ייפוי הכוח בביטוח הלאומי, אבל הביטוח הלאומי דורש שאתם
        תאשרו אותו בעצמכם. <strong>בלי האישור הזה הייצוג בביטוח הלאומי אינו בתוקף.</strong>
      </div>

      <div className="nia-ref">
        <div className="nia-ref-label">מספר האסמכתא שלכם</div>
        <div className="nia-ref-num" dir="ltr">{referenceNumber}</div>
        {deadlineText && <div className="nia-deadline">⏳ יש לאשר עד {deadlineText}</div>}
      </div>

      <div className="nia-opt-title"><span>א.</span> באתר הביטוח הלאומי</div>
      <div className="nia-opt-body">
        מקלידים את מספר תעודת הזהות ואת מספר האסמכתא שלמעלה, מזדהים בכרטיס אשראי
        על שמכם או בטלפון/מייל המעודכנים בביטוח הלאומי, ומאשרים במסך.{' '}
        <strong>הייצוג נכנס לתוקף מיד.</strong>
      </div>
      <a className="btn btn-primary nia-cta" href={NI_APPROVAL_SITE} target="_blank" rel="noopener noreferrer">
        ל{NI_APPROVAL_SITE_LABEL} ←
      </a>

      <div className="nia-opt-title"><span>ב.</span> בטלפון</div>
      <div className="nia-opt-body">
        מתקשרים ל־<a className="nia-tel" dir="ltr" href={`tel:${NI_APPROVAL_PHONE.replace(/-/g, '')}`}>{NI_APPROVAL_PHONE}</a>{' '}
        (מענה קולי) ומאשרים באמצעות מספר האסמכתא ובאמצעות קוד בן 6 ספרות שהביטוח
        הלאומי ישלח אליכם בדואר או במייל. מתאים למי שאין לו כרטיס אשראי או מייל
        מאומת בביטוח הלאומי.
      </div>
    </div>
  );
}
