param(
  [int]$Seconds = 18,
  [ValidateSet('qq', 'guard', 'both')]
  [string]$Mode = 'qq'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$probe = Join-Path $PSScriptRoot 'probe-dsh-discovery-loop.mjs'
$node = Get-Command node.exe -ErrorAction Stop

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class UtaWindowProbe {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    public static string[] Visible() {
        var rows = new List<string>();
        EnumWindows((hWnd, lp) => {
            if (!IsWindowVisible(hWnd)) return true;
            var title = new StringBuilder(512);
            GetWindowText(hWnd, title, title.Capacity);
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            rows.Add(hWnd.ToInt64().ToString() + "|" + pid + "|" + title.ToString());
            return true;
        }, IntPtr.Zero);
        return rows.ToArray();
    }
}
'@

$baseline = @{}
foreach ($row in [UtaWindowProbe]::Visible()) {
  $baseline[$row.Split('|', 2)[0]] = $row
}

$stdout = Join-Path $env:TEMP ("uta-window-probe-{0}.out" -f $PID)
$stderr = Join-Path $env:TEMP ("uta-window-probe-{0}.err" -f $PID)
$children = @()
if ($Mode -in @('qq', 'both')) {
  $children += Start-Process -FilePath $node.Source -ArgumentList @($probe) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}
if ($Mode -in @('guard', 'both')) {
  $guard = 'C:\Users\Clark\uta_laap_guard.ps1'
  if (-not (Test-Path -LiteralPath $guard)) {
    throw "guard script missing: $guard"
  }
  $children += Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $guard, '-WslProbe') `
    -WindowStyle Hidden -PassThru
}

$events = New-Object System.Collections.Generic.List[object]
$deadline = (Get-Date).AddSeconds($Seconds)
try {
  while ((Get-Date) -lt $deadline) {
    foreach ($row in [UtaWindowProbe]::Visible()) {
      $parts = $row.Split('|', 3)
      $handle = $parts[0]
      if ($baseline.ContainsKey($handle)) { continue }
      if ($parts[2] -eq '') { continue }
      $events.Add([pscustomobject]@{
        ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
        handle = $handle
        pid = [int]$parts[1]
        title = $parts[2]
      })
      $baseline[$handle] = $row
    }
    Start-Sleep -Milliseconds 15
  }
} finally {
  foreach ($child in $children) {
    if (-not $child.HasExited) {
      Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($events.Count -eq 0) {
  Write-Output '[]'
} else {
  $events | ConvertTo-Json -Compress
}
foreach ($child in $children) {
  if ($child.HasExited) {
    Write-Output ("child_exit={0}" -f $child.ExitCode)
  } else {
    Write-Output 'child_stopped_after_probe'
  }
}
if (Test-Path -LiteralPath $stderr) {
  Get-Content -LiteralPath $stderr -Raw
}
Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
