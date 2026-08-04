-- ─── טבלת ההתראות מקבלת קשרים מוגדרים ────────────────────────────────────────
-- accountant_notifications הייתה הטבלה היחידה שמצביעה על לקוח, הצעה ובקשת ייצוג
-- בלי אף מפתח זר. התוצאה: מחיקת לקוח השאירה בה שורות שמצביעות על כלום — התראה
-- על אדם שכבר לא קיים במערכת. בונה ההתראה מחזיר null כשהיעד חסר, ולכן ההתראה
-- גם לא הייתה יוצאת אף פעם; היא פשוט שקעה בטבלה.
--
-- ‼ CASCADE ולא SET NULL: זו תור עבודה פנימי, לא ארכיון. התראה על ישות שנמחקה
-- אינה ניתנת לשליחה ואין מה לשמר ממנה. יומן המיילים שכן נשלחו יושב ב-
-- email_messages, ושם דווקא SET NULL — כי מייל שיצא הוא עובדה שקרתה.

begin;

-- ניקוי מה שכבר יתום, אחרת הוספת המפתחות תיכשל
delete from accountant_notifications
where (client_id   is not null and client_id   not in (select id from clients))
   or (quotation_id is not null and quotation_id not in (select id from quotations))
   or (request_id   is not null and request_id   not in (select id from representation_requests));

alter table accountant_notifications
  add constraint accountant_notifications_client_id_fkey
  foreign key (client_id) references clients(id) on delete cascade;

alter table accountant_notifications
  add constraint accountant_notifications_quotation_id_fkey
  foreign key (quotation_id) references quotations(id) on delete cascade;

alter table accountant_notifications
  add constraint accountant_notifications_request_id_fkey
  foreign key (request_id) references representation_requests(id) on delete cascade;

commit;
