// attach-cycle.mjs — מוכיח את ההשערה שעליה כל אסטרטגיית הדפדפן נשענת:
// אפשר להתחבר ולהתנתק מחלון Chrome חי שוב ושוב, בלי לסגור אותו ובלי
// להפיל את הסשן המאומת שהרו"ח בנה ידנית.
//
// ‼ הבדיקה **לא** סוגרת ולא משגרת Chrome. היא רק מתחברת, בודקת, מתנתקת.
// זו כל הנקודה — סגירה/שיגור מחדש היו מבלבלים בדיוק את מה שנבדק כאן.
//
// הרצה:  node test/attach-cycle.mjs [מספר-סבבים]
import { attach, detach, detectShaam, classifyShaamAuth } from '../src/browserSession.mjs';
import { execSync } from 'node:child_process';

const ROUNDS = Number(process.argv[2] || 3);

/** ה-PID של תהליך Chrome שמאזין על פורט הניפוי — עוגן ה"לא נסגר". */
function debugChromePids() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*remote-debugging-port*\' } | Select-Object -ExpandProperty ProcessId"',
      { encoding: 'utf8' },
    );
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort().join(',');
  } catch {
    return '(pid lookup failed)';
  }
}

const before = debugChromePids();
console.log(`Chrome debug PIDs before: ${before || '(none)'}`);
if (!before) {
  console.log('\n✋ אין חלון Chrome עם פורט ניפוי. הריצו קודם את launch-shaam-chrome.bat.');
  process.exit(1);
}

let allOk = true;
for (let i = 1; i <= ROUNDS; i++) {
  console.log(`\n─── סבב ${i}/${ROUNDS} ───`);
  const conn = await attach();
  console.log('attach:', conn.ok ? 'ok' : `failed — ${conn.detail}`);
  if (!conn.ok) { allOk = false; continue; }

  console.log('  current url:', conn.page.url());
  const probe = await detectShaam(conn.page);
  console.log('  detectShaam:', JSON.stringify(probe));
  const auth = await classifyShaamAuth(conn.page);
  console.log('  classifyShaamAuth:', JSON.stringify(auth));

  await detach(conn.browser);
  console.log('  detached');

  const now = debugChromePids();
  const survived = now === before;
  console.log(`  Chrome PIDs after detach: ${now || '(none)'} → ${survived ? '✓ תהליך שרד ללא שינוי' : '✗ התהליך השתנה/נסגר'}`);
  if (!survived) allOk = false;
}

const after = debugChromePids();
console.log(`\n─── סיכום ───`);
console.log(`PIDs before : ${before}`);
console.log(`PIDs after  : ${after}`);
console.log(allOk && after === before
  ? '✓ עבר: התחברות/ניתוק חוזרים מול אותו תהליך Chrome, בלי סגירה ובלי שיגור מחדש.'
  : '✗ נכשל: ראו פירוט למעלה.');
process.exit(allOk && after === before ? 0 : 1);
