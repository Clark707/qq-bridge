' Hidden self-relaunch after /api/restart. Keep this file ASCII-only.
Option Explicit
On Error Resume Next

Dim fso, sh, scriptDir, bridgeDir, toolDir, nodeExe, bridgeScript, cmd, logFile, f
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
bridgeDir = fso.GetParentFolderName(scriptDir)
toolDir = fso.GetParentFolderName(bridgeDir)
nodeExe = fso.BuildPath(fso.BuildPath(toolDir, "nodejs"), "node.exe")
bridgeScript = fso.BuildPath(fso.BuildPath(bridgeDir, "src"), "bridge.js")
logFile = fso.BuildPath(fso.BuildPath(bridgeDir, "state"), "bridge-relaunch.log")

' The old process needs time to close the lock and console port. The scheduled
' guard remains the fallback if this hidden launch ever fails.
WScript.Sleep 1600
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & bridgeScript & Chr(34)
sh.Run cmd, 0, False

If Err.Number <> 0 Then
  On Error Resume Next
  Set f = fso.OpenTextFile(logFile, 8, True)
  If Err.Number = 0 Then
    f.WriteLine Now & " relaunch failed: " & Err.Number & " " & Err.Description
    f.Close
  End If
End If
WScript.Quit 0
