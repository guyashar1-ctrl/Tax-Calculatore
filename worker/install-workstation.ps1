# install-workstation.ps1 — הופך את המחשב הזה למחשב עבודה של PIVO (203).
#
# הצעד האנושי היחיד: ב-PIVO, תפריט החשבון ← «חיבור מחשב עבודה» ← להעתיק את
# הקוד (תקף 15 דקות). ואז, מתוך worker\ של עותק PIVO במחשב הזה:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File worker\install-workstation.ps1 -Code ABCD234XYZ
#
# מה זה עושה, בסדר הזה:
#   1. בודק מיקום: ‼ לא תחת AppData (אפליקציית Claude מסתירה משם קבצים מ-Windows).
#   2. מתקין תלויות (npm ci --omit=dev) אם חסרות.
#   3. רושם את המחשב (src\register.mjs) ⇒ זהות + אסימון ב-worker\.env, רק כאן.
#   4. הפעלה אוטומטית: קיצור ב-Startup + משימת watchdog (install-autostart.bat).
# פרופילי ה-Chrome של שע״ם/ב״ל נוצרים מקומית בהתחברות הראשונה במחשב הזה —
# אין העתקה של פרופיל, סיסמה או סשן ממחשב אחר.

param(
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$Label = $env:COMPUTERNAME,
  [string]$ExistingWorkerId = ''
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($here -match '\\AppData\\') {
  throw "Install the worker outside AppData (e.g. C:\Users\$env:USERNAME\PIVO\worker-production\worker). See README."
}
Set-Location $here
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 18+ is required (node not on PATH).' }
if (-not (Test-Path (Join-Path $here 'node_modules\playwright-core'))) {
  Write-Output '[..] Installing dependencies (npm ci --omit=dev)'
  npm ci --omit=dev
}
$reg = @('src\register.mjs', '--code', $Code, '--label', $Label)
if ($ExistingWorkerId) { $reg += @('--existing-worker-id', $ExistingWorkerId) }
node @reg
if ($LASTEXITCODE -ne 0) { throw 'Registration failed (see message above).' }
cmd /c (Join-Path $here 'install-autostart.bat')
