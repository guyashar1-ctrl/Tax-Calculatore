# install-watchdog.ps1 — משימה מתוזמנת שמוודאת שהעובד רץ, כל 5 דקות.
#
# ‼ למה (24.09.2026): העובד הקבוע נפל ב-07:24 ולא חזר עד שמישהו שם לב. הוא
# הופעל מחדש בלילה מתוך טרמינל של סשן Claude, ולכן היה צאצא של האפליקציה —
# וכשהמחשב נכנס לשינה והאפליקציה סגרה את התהליכים שלה, הוא נסגר איתה. קיצור
# ה-Startup מפעיל אותו רק בכניסה למחשב, ולכן אחרי נפילה כזאת הוא נשאר כבוי.
#
# ‼ מה זה עושה: Task Scheduler מפעיל את start-worker.vbs כל 5 דקות (וגם
# כשהמחשב חוזר משינה ומפספס הפעלה). העובד עצמו יוצא מיד אם כבר רץ עובד
# (src/singleInstance.mjs), כך שזה לא מוליד שני עובדים. תהליך שהופעל
# מ-Task Scheduler אינו צאצא של שום טרמינל או אפליקציה — כלום לא "לוקח
# אותו איתו".
#
# ‼ בלי הרשאות מנהל: משימה של המשתמש הנוכחי, בסשן שלו (חלון Chrome גלוי).
# ‼ מחשב נייד: ברירת המחדל של Windows לא מפעילה משימות על סוללה — כאן כן.
#
# ביטול:  Unregister-ScheduledTask -TaskName 'PIVO Automation Worker Watchdog' -Confirm:$false

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $here 'start-worker.vbs'
if (-not (Test-Path $vbs)) { throw "start-worker.vbs not found next to this script" }
# ‼ תחת AppData, קבצים שנוצרו מתוך אפליקציית Claude (MSIX) קיימים רק בתוכה —
# Task Scheduler ו-Startup לא רואים אותם, והעובד לא יעלה לעולם. ראה README.
if ($here -match '\\AppData\\') {
  throw "The permanent worker must not live under AppData ($here). Use C:\Users\<user>\PIVO\worker-production — see worker\README.md."
}

$name = 'PIVO Automation Worker Watchdog'
# ‼ בלי -WorkingDirectory: איתו Task Scheduler נכשל ב-0x8007010B («שם תיקייה
# לא חוקי») והעובד לא עלה (נצפה 24.09.2026). start-worker.vbs קובע את
# התיקייה בעצמו (shell.CurrentDirectory).
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description 'Keeps the PIVO automation worker running (exits at once if one already runs).' -Force | Out-Null
Write-Output "[v] $name installed: every 5 minutes -> $vbs"
