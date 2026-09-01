' start-worker.vbs — starts the PIVO automation worker with no console window.
'
' Why a .vbs and not a .bat: a .bat launched from the Startup folder leaves a
' black console window open on the accountant's desktop for the whole workday.
' WScript.Shell with intWindowStyle=0 runs the same command hidden.
'
' Logs go to worker\worker.log so there is still somewhere to look when the
' connection light stays grey.

Option Explicit
Dim shell, fso, here, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = here
cmd = "cmd /c node ""src\index.mjs"" >> ""worker.log"" 2>&1"
shell.Run cmd, 0, False
