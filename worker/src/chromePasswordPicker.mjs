// chromePasswordPicker.mjs — בוחר את הסיסמה ש-Chrome שמר, מתוך חלונית ההצעה של
// Chrome עצמו. זו הדרך שבה «הסיסמה השנייה» של שע״ם (מערכת גביית מס הכנסה)
// משמשת בלי אדם — החלטת מוצר של גיא, 27.09.2026: אחרי כרטיס+PIN הסיסמה השנייה
// נשמרת ב-Chrome, ועד שהפורטל דורש שוב כרטיס+PIN משתמשים בה אוטומטית.
//
// ‼ מה נבדק בפועל (27.09.2026, פרופיל Chrome זמני, סיסמה מזויפת, דף מקומי
// שמחקה את מסך הכניסה של GMF — שדה סיסמה יחיד, שם משתמש כטקסט):
//   · מקשים דרך CDP (ArrowDown / Tab / Enter) **לא** מגיעים לחלונית של Chrome.
//     Enter שלח את הטופס עם סיסמה ריקה. ולכן: אסור לשלוח מקש כלשהו לשדה הזה.
//   · החלונית חשופה ל-UI Automation של Windows: כל שורה היא PopupRowView עם
//     InvokePattern, ושם השורה הוא «הסיסמה של D…» (שם המשתמש, בלי הסיסמה).
//     Invoke על השורה ממלא את השדה בדיוק כמו בחירה בעכבר — value מלא,
//     ‎:-webkit-autofill‎ דולק.
//
// ‼ PIVO לא קוראת, לא מקלידה ולא שומרת את הסיסמה. Chrome ממלא אותה. העובד
// רואה רק את שמות השורות, ומפעיל שורה **אחת** — זו שמכילה את שם המשתמש
// שמוצג במסך הכניסה. אפס שורות כאלה או יותר מאחת ⇒ לא נוגעים.
//
// ‼ Chrome פותח את החלונית רק כשהחלון שלו בפוקוס (נצפה ב-16.09.2026). לכן
// bringChromeToForeground קיים — הוא נקרא רק כשהדף מדווח שאין לו פוקוס.

import { execFile } from 'node:child_process';

/** סימן הפרופיל הייעודי בשורת הפקודה של Chrome (browserSession.PROFILE_DIR). */
export const SHAAM_PROFILE_MARKER = 'shaam-chrome-profile';

const PICK_PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$marker = $env:PIVO_PICK_MARKER
$user = $env:PIVO_PICK_USER
$waitMs = [int]$env:PIVO_PICK_WAIT_MS
$chromePids = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*$marker*" -and $_.CommandLine -notlike '*--type=*' } |
  ForEach-Object { [int]$_.ProcessId })
if ($chromePids.Count -eq 0) { '{"status":"no_window"}'; exit }
$A = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$rowCond = New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'PopupRowView')
$deadline = (Get-Date).AddMilliseconds($waitMs)
do {
  $rows = @()
  foreach ($w in $A::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($chromePids -notcontains $w.Current.ProcessId) { continue }
    # ‼ שורה מחלונית שכבר נסגרה נשארת בעץ כ-offscreen; Invoke עליה לא עושה כלום.
    $rows += @($w.FindAll($scope::Descendants, $rowCond) | Where-Object { -not $_.Current.IsOffscreen })
  }
  if ($rows.Count -gt 0) { break }
  Start-Sleep -Milliseconds 150
} while ((Get-Date) -lt $deadline)
if ($rows.Count -eq 0) { '{"status":"no_popup"}'; exit }
$hits = @($rows | Where-Object { $_.Current.Name -and $_.Current.Name.IndexOf($user, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
if ($hits.Count -eq 0) { '{"status":"no_matching_credential","rows":' + $rows.Count + '}'; exit }
if ($hits.Count -gt 1) { '{"status":"ambiguous","matches":' + $hits.Count + '}'; exit }
$hits[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
'{"status":"invoked","rows":' + $rows.Count + '}'
`;

// ‼ Windows לא מרשה לתהליך ברקע לגנוב פוקוס (SetForegroundWindow נכשל ומהבהב
// בשורת המשימות). ההצמדה לתור הקלט של החלון שבחזית (AttachThreadInput) היא
// הדרך המקובלת לעקוף את זה בלי להקיש מקשים מדומים.
const FOREGROUND_PS = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class PivoFg {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  public static bool Bring(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    IntPtr fg = GetForegroundWindow();
    if (fg == h) return true;
    uint me = GetCurrentThreadId();
    uint other = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, IntPtr.Zero);
    bool attached = other != 0 && other != me && AttachThreadInput(me, other, true);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, other, false);
    return GetForegroundWindow() == h;
  }
}
'@
$marker = $env:PIVO_PICK_MARKER
$browser = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*$marker*" -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1
if (-not $browser) { 'no_window'; exit }
$h = (Get-Process -Id $browser.ProcessId).MainWindowHandle
if ($h -eq [IntPtr]::Zero) { 'no_window'; exit }
if ([PivoFg]::Bring($h)) { 'foreground' } else { 'refused' }
`;

function runPowerShell(script, env, timeoutMs) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, out: '', err: 'not_windows' });
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, env: { ...process.env, ...env } },
      (err, stdout, stderr) => resolve({
        ok: !err,
        out: String(stdout ?? '').trim(),
        err: err ? String(stderr || err.message).slice(0, 200) : null,
      }));
  });
}

/** שם משתמש שמותר להעביר לחיפוש — אותיות וספרות בלבד (GMF: onlylettersnumbers). */
export function isPickableUsername(u) {
  return typeof u === 'string' && /^[A-Za-z0-9]{3,20}$/.test(u);
}

/** פענוח שורת התוצאה האחרונה של סקריפט הבחירה. כל דבר לא צפוי ⇒ error. */
export function parsePickOutput(out) {
  const last = String(out ?? '').trim().split(/\r?\n/).pop() ?? '';
  try {
    const r = JSON.parse(last);
    if (r && typeof r.status === 'string') return r;
  } catch { /* נופל למטה */ }
  return { status: 'error', detail: last.slice(0, 120) };
}

/**
 * מחפש את חלונית ההצעה של Chrome (עד waitMs) ומפעיל את שורת הסיסמה של
 * `username` — רק אם היא יחידה. הקורא אחראי שהשדה כבר בפוקוס (לחיצה אמיתית),
 * כי זה מה שפותח את החלונית.
 *
 * @returns {Promise<{status: 'invoked'|'no_window'|'no_popup'|'no_matching_credential'|'ambiguous'|'error', rows?: number, matches?: number, detail?: string}>}
 */
export async function pickSavedPassword({ username, profileMarker = SHAAM_PROFILE_MARKER, waitMs = 2500 } = {}) {
  if (!isPickableUsername(username)) return { status: 'error', detail: 'invalid_username' };
  const r = await runPowerShell(PICK_PS, {
    PIVO_PICK_MARKER: profileMarker, PIVO_PICK_USER: username, PIVO_PICK_WAIT_MS: String(waitMs),
  }, waitMs + 15_000);
  if (!r.ok) return { status: 'error', detail: r.err ?? 'powershell_failed' };
  return parsePickOutput(r.out);
}

/** מביא את חלון Chrome הייעודי לחזית ברמת Windows. 'foreground' | 'refused' | 'no_window' | 'error'. */
export async function bringChromeToForeground({ profileMarker = SHAAM_PROFILE_MARKER } = {}) {
  const r = await runPowerShell(FOREGROUND_PS, { PIVO_PICK_MARKER: profileMarker }, 15_000);
  if (!r.ok) return 'error';
  const last = r.out.split(/\r?\n/).pop();
  return ['foreground', 'refused', 'no_window'].includes(last) ? last : 'error';
}
