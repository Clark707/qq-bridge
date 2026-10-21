' Hidden launcher for the QQ stack guard.
' Keep this file ASCII-only: Windows Script Host may parse legacy encodings
' differently and garble non-ASCII paths before the command is launched.
Option Explicit
On Error Resume Next

Dim fso, sh, scriptDir, bridgeDir, toolDir, nodeExe, guardScript, cmd, logFile, f
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
bridgeDir = fso.GetParentFolderName(scriptDir)
toolDir = fso.GetParentFolderName(bridgeDir)
nodeExe = fso.BuildPath(fso.BuildPath(toolDir, "nodejs"), "node.exe")
guardScript = fso.BuildPath(scriptDir, "qq-stack-guard.mjs")
logFile = fso.BuildPath(fso.BuildPath(toolDir, "qq-bridge\state"), "guard-launcher.log")

If Err.Number <> 0 Then
  WScript.Quit 1
End If

cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & guardScript & Chr(34)
sh.Run cmd, 0, False

If Err.Number <> 0 Then
  On Error Resume Next
  Set f = fso.OpenTextFile(logFile, 8, True)
  If Err.Number = 0 Then
    f.WriteLine Now & " launch failed: " & Err.Number & " " & Err.Description
    f.Close
  End If
  WScript.Quit 1
End If
