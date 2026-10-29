import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import { AUTOMATION_ACTIONS } from '../automationCatalog';
import { automationRows, MECHANISM_ROW_IDS, resolveAutomationFocus } from '../automationList';
import { filterActionRows, PLANNED_BOOKKEEPING } from '../actionGuide';
const rows=automationRows({flows:[],expiryOn:false,repOn:0,repTotal:4,firmOn:0,firmTotal:4,officeEmail:'',actions:AUTOMATION_ACTIONS});
export const TESTS=[
  test('הקטלוג הפשוט משמר כל מנגנון וכל פעולה קיימת; לא רק חמש דוגמאות מההמחשה',()=>{
    deepEqual(filterActionRows(rows,'','all').map(r=>r.id),rows.map(r=>r.id));
    for(const id of MECHANISM_ROW_IDS)assert(rows.some(r=>r.id===id),'נשמר מנגנון '+id);
    for(const a of AUTOMATION_ACTIONS.filter(a=>a.actionType))assert(rows.some(r=>r.action?.actionType===a.actionType),'נשמרה '+a.id);
  }),
  test('הסוכן המתוכנן מוצג בנפרד; אין handler או אפשרות להפעלה',()=>{
    equal(PLANNED_BOOKKEEPING.action,undefined);equal(PLANNED_BOOKKEEPING.source.type,'none');
    assert(!AUTOMATION_ACTIONS.some(a=>a.id===PLANNED_BOOKKEEPING.id),'תכנון אינו יכולת ריצה');
    equal(filterActionRows([PLANNED_BOOKKEEPING],'','authorities').length,0);
    equal(filterActionRows([PLANNED_BOOKKEEPING],'הוצאות','bookkeeping').length,1);
  }),
  test('חיפוש וסינון לא מסתירים פעולות פייפרלס או משייכים מיילים לרשויות',()=>{
    const found=filterActionRows(rows,'','bookkeeping');
    assert(found.length>0 && found.every(r=>r.action?.system==='paperless'),'פייפרלס בתחום החשבונאות');
    assert(filterActionRows(rows,'תזכורת','messages').length>0,'חיפוש תזכורת');
    assert(filterActionRows(rows,'','authorities').every(r=>r.action),'רק פעולות רשויות');
  }),
  test('קישורי הגדרות קודמים עדיין נוחתים בתזכורת הנכונה',()=>{
    const known={rowIds:rows.map(r=>r.id),repAudiences:['sign'],notificationKinds:[]};
    deepEqual(resolveAutomationFocus('rem-expiry',known),{row:'expiry'});
    deepEqual(resolveAutomationFocus('rem-sign',known),{row:'rep-reminders',sub:'sign'});
  }),
];
