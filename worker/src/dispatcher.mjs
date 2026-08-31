// dispatcher.mjs — מרשם ה-handlers. אוטומציה #2 נכנסת כאן בשתי שורות:
// import + הוספה למערך. שום דבר אחר בעובד לא צריך להשתנות.
import * as devTestAutomation from './handlers/devTestAutomation.mjs';

const HANDLERS = [devTestAutomation];

const byActionType = new Map(HANDLERS.map((h) => [h.actionType, h]));

export function handlerFor(actionType) {
  return byActionType.get(actionType);
}

export function supportedActionTypes() {
  return [...byActionType.keys()];
}
