' Hidden launcher for SnowLuma. Keep this file ASCII-only.
Option Explicit
On Error Resume Next

Dim fso, sh, base, nodeExe, appScript, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

If WScript.Arguments.Count > 0 Then
  base = WScript.Arguments(0)
Else
  base = sh.CurrentDirectory
End If

nodeExe = fso.BuildPath(base, "node.exe")
appScript = fso.BuildPath(base, "index.mjs")
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & appScript & Chr(34)

sh.CurrentDirectory = base
sh.Run cmd, 0, False
WScript.Quit 0
