# restart-worker.ps1 — הפעלה מחדש בטוחה של העובד הקבוע (למשל אחרי עדכון גרסה).
#
# ‼ לעולם לא להפעיל את העובד ישירות מטרמינל של סשן Claude/IDE (Start-Process,
# wscript, node): הוא נהיה צאצא של אותה אפליקציה ומת איתה — כך בדיוק הוא
# נפל ב-24.09.2026. כאן העובד נעצר, והפעלתו החדשה נעשית ע"י Task Scheduler
# (schtasks /run), שאינו קשור לתהליך שהריץ את הסקריפט.
#
# ‼ לפני הרצה: לוודא שאין משימת אוטומציה רצה (automation_jobs.status='running').
# עצירה באמצע פעולה מול רשות משאירה אותה «לא ידוע אם נקלט».
#
#   powershell -NoProfile -File worker\restart-worker.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$name = 'PIVO Automation Worker Watchdog'
if (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) {
  throw "The watchdog task is not installed. Run install-autostart.bat first."
}

# ‼ start-worker.vbs מריץ `node "src\index.mjs"` בנתיב יחסי, ולכן אי אפשר לזהות
# מהשורה מאיזו תיקייה הוא רץ — נעצר כל עובד PIVO במחשב. עובד פיתוח שרץ
# במקביל יעצור גם הוא; ממילא שניים עם אותו id לא יכולים לרוץ יחד.
$workers = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'src\\index\.mjs' }
foreach ($p in $workers) { Stop-Process -Id $p.ProcessId -Force; Write-Output "stopped $($p.ProcessId)" }
Start-Sleep -Seconds 2
schtasks /run /tn $name | Out-Null
Start-Sleep -Seconds 6
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'src\\index\.mjs' } |
  ForEach-Object { Write-Output "running $($_.ProcessId)" }
