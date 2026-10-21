' Hidden DSH port discovery launcher. Keep this file ASCII-only.
Option Explicit
On Error Resume Next

Dim fso, sh, scriptDir, ps1, outPath, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

If WScript.Arguments.Count < 1 Then WScript.Quit 2

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(scriptDir, "dsh-port-scan.ps1")
outPath = WScript.Arguments(0)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " _
  & Chr(34) & ps1 & Chr(34) & " " & Chr(34) & outPath & Chr(34)

sh.Run cmd, 0, True

If Err.Number <> 0 Then WScript.Quit Err.Number
WScript.Quit 0
