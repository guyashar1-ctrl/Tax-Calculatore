// dispatcher.mjs — מרשם ה-handlers. אוטומציה #2 נכנסת כאן בשתי שורות:
// import + הוספה למערך. שום דבר אחר בעובד לא צריך להשתנות.
import * as devTestAutomation from './handlers/devTestAutomation.mjs';
import * as shaamDetect from './handlers/shaamDetect.mjs';
import * as shaamCheckAuth from './handlers/shaamCheckAuth.mjs';
import * as shaamConnect from './handlers/shaamConnect.mjs';
import * as shaamDisconnect from './handlers/shaamDisconnect.mjs';

const HANDLERS = [devTestAutomation, shaamDetect, shaamCheckAuth, shaamConnect, shaamDisconnect];

const byActionType = new Map(HANDLERS.map((h) => [h.actionType, h]));

export function handlerFor(actionType) {
  return byActionType.get(actionType);
}

export function supportedActionTypes() {
  return [...byActionType.keys()];
}
