// singleInstance.mjs — עובד אחד לכל worker id במחשב, בלי קובץ נעילה.
//
// ‼ 24.09.2026 · העובד הקבוע נפל בשקט: סשן Claude הפעיל אותו מחדש מתוך
// הטרמינל שלו, העובד נהיה צאצא של האפליקציה, ונסגר איתה כשהמחשב נכנס
// לשינה. התיקון: Task Scheduler מפעיל את start-worker.vbs כל כמה דקות
// (install-autostart.bat). כדי שזה יהיה בטוח, הפעלה שנייה חייבת לצאת מיד —
// שני עובדים עם אותו id היו תופסים משימות במקביל ומתחרים על חלון Chrome.
//
// ‼ למה פורט ולא קובץ: הפורט משתחרר מעצמו כשהתהליך מת (גם בקריסה, גם
// ב-Stop-Process), וקובץ נעילה היה נשאר ומשאיר את המחשב בלי עובד.

import { createServer } from 'node:net';

/** פורט יציב לכל worker id, בטווח 47000–47999. טהורה. */
export function lockPortFor(workerId) {
  let h = 0;
  for (const ch of String(workerId ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 47000 + (h % 1000);
}

/**
 * תופס את הנעילה. `true` ⇒ העובד הזה הוא היחיד; `false` ⇒ כבר רץ עובד
 * אחר עם אותו id, ויש לצאת. השרת נשאר פתוח לכל חיי התהליך (unref — לא
 * מחזיק את התהליך בחיים לבדו).
 */
export function acquireSingleInstance(workerId, { port = lockPortFor(workerId), host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', (e) => {
      if (e?.code === 'EADDRINUSE') resolve({ ok: false, port });
      else reject(e);
    });
    server.listen(port, host, () => {
      server.unref();
      resolve({ ok: true, port, release: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
