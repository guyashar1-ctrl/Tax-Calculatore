import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import { OFFICE_HANDBOOK } from '../handbookData';
import { filterHandbook, handbookTsv } from '../model';
import { resolveOfficeLocation } from '../../../components/office/officeModel';
import { parseHash, formatRoute } from '../../../lib/appRoute';
const rows=OFFICE_HANDBOOK.rows;
const byName=(name:string)=>rows.find(r=>r.name===name)!;
export const TESTS=[
  test('המילון לשיתוף שלם: מזהים ייחודיים, 60 הכרעות, בלי חריגי לקוחות',()=>{
    equal(rows.length,60); equal(new Set(rows.map(r=>r.id)).size,rows.length);
    equal(OFFICE_HANDBOOK.containsClientData,false); deepEqual(OFFICE_HANDBOOK.exceptions,[]);
    assert(rows.every(r=>r.when && r.name && r.secondary && r.recognition.text),'אין שורה חסרה');
    assert(rows.every(r => !('clientId' in r) && !('supplierId' in r)), 'נתונים כלליים בלבד');
  }),
  test('תוכנות: אותו ראשי עם שלושה משניים; חיפוש קלוד/אנטרופיק עובד גם בלי שם ספק בעברית',()=>{
    for(const q of ['קלוד','Anthropic','אנטרופיק','chatgpt','3680 חו״ל']){
      const found=filterHandbook(rows,q);assert(found.some(r=>r.id==='office-03'),'נמצאה תוכנת חו״ל: '+q);
    }
    deepEqual(rows.filter(r=>r.name==='תוכנות ושירותים').map(r=>[r.code,r.secondary]),[
      ['3680','תוכנות ישראל'],['3680','תוכנות ושירותים — ישראל ללא מס תשומות'],['3680','תוכנות חו״ל']]);
    equal(filterHandbook(rows,'claude','רכב ונסיעות').length,0);
  }),
  test('שם המיון וסימון הבית קובעים; אותו מספר ראשי אינו אותו כלל הכרה',()=>{
    equal(byName('חשמל').code,byName('חשמל 100%').code);
    equal(byName('חשמל').recognition.homeProfileLinked,true);
    equal(byName('חשמל 100%').recognition.homeProfileLinked,false);
    equal(byName('חשמל').secondary,'ללא');
    equal(byName('אינטרנט יחסי').recognition.homeProfileLinked,true);
    equal(byName('אינטרנט').recognition.homeProfileLinked,false);
    equal(byName('מיסים ואגרות').recognition.mode,'manual_review');
    assert(byName('מיסים ואגרות').note.includes('אין להפחית'),'אגרת עסק לא מקבלת הפחתת בית אוטומטית');
    assert(!rows.some(r=>r.name==='ועד בית 100%'),'לא ממציאים סעיף שלא נצפה');
  }),
  test('משרדיות וציוד קל נשארו נפרדים, 500 הוא מדיניות, אין משני לציוד קל',()=>{
    equal(OFFICE_HANDBOOK.generalLightEquipmentThreshold,500);
    equal(byName('ציוד קל').code,'3536'); equal(byName('ציוד קל').secondary,'ללא');
    equal(byName('משרדיות').code,'3680');
  }),
  test('העתקה לגיליון: שורה אחת להכרעה, שבע עמודות גם עם תווי בקרה',()=>{
    const text=handbookTsv([{...rows[0],note:'א\tב\nג'}]);
    equal(text.split('\n').length,2);assert(text.split('\n').every(r=>r.split('\t').length===7),'מבנה TSV');
    equal(filterHandbook(rows,'לאקיימתחשבונית').length,0);
  }),
  test('מגיעים למילון בקישור ישיר; כתובות אוטומציות ישנות נשמרו',()=>{
    deepEqual(resolveOfficeLocation('bookkeeping'),{page:'bookkeeping'});
    const route={view:'firmProfile' as const,officePage:'bookkeeping'};
    deepEqual(parseHash(String.fromCharCode(35)+formatRoute(route)),route);
    deepEqual(resolveOfficeLocation('reminders'),{page:'automations',focus:'reminders'});
  }),
];
