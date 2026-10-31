// dispatcher.mjs — מרשם ה-handlers. אוטומציה #2 נכנסת כאן בשתי שורות:
// import + הוספה למערך. שום דבר אחר בעובד לא צריך להשתנות.
import * as devTestAutomation from './handlers/devTestAutomation.mjs';
import * as shaamDetect from './handlers/shaamDetect.mjs';
import * as shaamCheckAuth from './handlers/shaamCheckAuth.mjs';
import * as shaamConnect from './handlers/shaamConnect.mjs';
import * as shaamEnsureCapability from './handlers/shaamEnsureCapability.mjs';
import * as shaamDisconnect from './handlers/shaamDisconnect.mjs';
import * as shaamOpenIncomeTax from './handlers/shaamOpenIncomeTax.mjs';
import * as shaamOpenClientFile from './handlers/shaamOpenClientFile.mjs';
import * as shaamSyncIncomeTaxFile from './handlers/shaamSyncIncomeTaxFile.mjs';
import * as shaamSyncVatFile from './handlers/shaamSyncVatFile.mjs';
import * as shaamIssueCertificates from './handlers/shaamIssueCertificates.mjs';
import * as shaamCreateRepresentation from './handlers/shaamCreateRepresentation.mjs';
import * as shaamSubmitPoa from './handlers/shaamSubmitPoa.mjs';
import * as shaamCheckRepresentation from './handlers/shaamCheckRepresentation.mjs';
import * as btlConnect from './handlers/btlConnect.mjs';
import * as btlDisconnect from './handlers/btlDisconnect.mjs';
import * as btlCreateRepresentation from './handlers/btlCreateRepresentation.mjs';
import * as btlCheckRepresentation from './handlers/btlCheckRepresentation.mjs';
import * as btlSyncFile from './handlers/btlSyncFile.mjs';
import * as paperlessSetupClient from './handlers/paperlessSetupClient.mjs';
import * as paperlessCheckCard from './handlers/paperlessCheckCard.mjs';
import * as paperlessConnect from './handlers/paperlessConnect.mjs';
import * as paperlessDisconnect from './handlers/paperlessDisconnect.mjs';
import * as paperlessReadRetainer from './handlers/paperlessReadRetainer.mjs';
import * as paperlessReadPending from './handlers/paperlessReadPending.mjs';

const HANDLERS = [
  devTestAutomation, shaamDetect, shaamCheckAuth,
  shaamConnect, shaamEnsureCapability, shaamDisconnect, shaamOpenIncomeTax, shaamOpenClientFile,
  shaamSyncIncomeTaxFile,
  // קריאת «פרטי עוסק» במערכת הגבייה של מע״מ — קריאה בלבד.
  shaamSyncVatFile,
  // 413 — הנפקת אישור ניכוי מס במקור + ניהול ספרים. משנה מצב ברשות: רק בלחיצה.
  shaamIssueCertificates,
  // מחזור חיי בקשת הייצוג בשע״ם (194): יצירה+הבאת טופס · שידור חתום · בדיקת מצב.
  shaamCreateRepresentation, shaamSubmitPoa, shaamCheckRepresentation,
  btlConnect, btlDisconnect, btlCreateRepresentation, btlCheckRepresentation,
  // קריאת תיק המבוטח (עיסוקים, מקדמה, הכנסה, הרשאה, יתרה) — קריאה בלבד.
  btlSyncFile,
  // פייפרלס (304): הקמה + ריטיינר לפי ההסכם — לבד, ניסיון אחד (הכרעת גיא 26.10.2026);
  // בדיקת כרטיס/חיוב — קריאה בלבד.
  paperlessSetupClient, paperlessCheckCard,
  // 306 · «פייפרלס» בכותרת: פתיחת החלון להתחברות / סגירתו.
  paperlessConnect, paperlessDisconnect,
  // 316 · קריאה בלבד: כל הריטיינר (גבייה) וטבלת הממתינים של המשרד (הנהלת חשבונות).
  paperlessReadRetainer, paperlessReadPending,
];

const byActionType = new Map(HANDLERS.map((h) => [h.actionType, h]));

export function handlerFor(actionType) {
  return byActionType.get(actionType);
}

export function supportedActionTypes() {
  return [...byActionType.keys()];
}
