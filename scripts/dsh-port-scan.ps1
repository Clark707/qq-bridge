param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$OutputPath
)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$ids = @(
  Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Id }
)

if ($ids.Count -eq 0) {
  $procs = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match '@deepseek-ai[\\/]dsh-(?:desktop-host|host|web)'
  }
  $ids = @($procs.ProcessId | Where-Object { $_ })
}

if ($ids.Count -eq 0) {
  '[]' | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  exit 0
}

$ports = @()
foreach ($line in (& netstat.exe -ano -p tcp)) {
  if ($line -notmatch '^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
    continue
  }
  $local = $Matches[1]
  $owner = [int]$Matches[2]
  if ($ids -notcontains $owner) {
    continue
  }
  $port = [int]$local.Substring($local.LastIndexOf(':') + 1)
  $ports += $port
}

(@($ports | Sort-Object -Unique) | ConvertTo-Json -Compress) |
  Set-Content -LiteralPath $OutputPath -Encoding UTF8
