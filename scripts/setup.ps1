# Installs the Node.js and pnpm versions this repo needs, for Windows.
# macOS/Linux: use scripts/setup.sh.
#
#   scripts\setup.cmd            # install what is missing (works under any execution policy)
#   scripts\setup.cmd -Force     # reinstall Node even if a suitable one exists
#
# Versions come from the repo: Node major from .node-version, pnpm from the
# "packageManager" field in package.json. No admin rights needed:
# - an existing Node that satisfies "engines" (>= 22.12) is kept;
# - otherwise fnm is used when installed;
# - otherwise the official build is downloaded from nodejs.org, its SHA-256 is
#   checked against SHASUMS256.txt, and it is unpacked into
#   %LOCALAPPDATA%\Programs\node, which is added to the user PATH.
# Works in Windows PowerShell 5.1 and PowerShell 7.
[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar in 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$NodeMajor = ((Get-Content (Join-Path $Root '.node-version') -Raw).Trim() -replace '^v', '').Split('.')[0]
$Pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
if ($Pkg.packageManager -notmatch '^pnpm@([0-9.]+)') { throw 'Could not read the pnpm version from package.json "packageManager".' }
$PnpmVersion = $Matches[1]
$NodeHome = Join-Path $env:LOCALAPPDATA 'Programs\node'
$PathChanged = $false

function Info([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "warning: $m" -ForegroundColor Yellow }
function Has([string]$c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function Update-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Add-UserPath([string]$dir) {
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($user) { $parts = $user.Split(';') | Where-Object { $_ -and ($_.TrimEnd('\') -ne $dir.TrimEnd('\')) } }
  [Environment]::SetEnvironmentVariable('Path', (@($dir) + $parts) -join ';', 'User')
  $env:Path = "$dir;$env:Path"
  $script:PathChanged = $true
  Info "Added $dir to the user PATH"
}

function Test-NodeOk {
  if (-not (Has 'node')) { return $false }
  $v = (& node --version) -replace '^v', ''
  $p = $v.Split('.') | ForEach-Object { [int]$_ }
  return ($p[0] -gt 22) -or ($p[0] -eq 22 -and $p[1] -ge 12)
}

function Install-NodeOfficial {
  $arch = $env:PROCESSOR_ARCHITEW6432
  if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
  switch ($arch) {
    'AMD64' { $a = 'x64' }
    'ARM64' { $a = 'arm64' }
    default { throw "Unsupported CPU '$arch'. Install Node $NodeMajor from https://nodejs.org" }
  }

  $base = "https://nodejs.org/dist/latest-v$NodeMajor.x"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("bond-node-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
    $pattern = "\s(node-v[0-9.]+-win-$a\.zip)\s*$"
    $line = $sums -split "`n" | Where-Object { $_ -match $pattern } | Select-Object -First 1
    if (-not $line -or $line -notmatch $pattern) { throw "No Node $NodeMajor build for win-$a on nodejs.org." }
    $file = $Matches[1]
    $expected = ($line -split '\s+')[0].ToLowerInvariant()

    Info "Downloading $file"
    $zip = Join-Path $tmp $file
    Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $zip
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Checksum mismatch for $file; download aborted." }

    Info "Unpacking into $NodeHome"
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    if (Test-Path $NodeHome) { Remove-Item -Recurse -Force $NodeHome }
    New-Item -ItemType Directory -Force -Path (Split-Path $NodeHome) | Out-Null
    Move-Item -Path (Join-Path $tmp ($file -replace '\.zip$', '')) -Destination $NodeHome
  }
  finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
  Add-UserPath $NodeHome
}

# --- Node ------------------------------------------------------------------

if (-not $Force -and (Test-NodeOk)) {
  Info "Node $(node --version) found at $((Get-Command node).Source), keeping it"
  if ((node --version) -notmatch "^v$NodeMajor\.") { Warn "this repo targets Node $NodeMajor (.node-version); CI uses that version" }
}
elseif (Has 'fnm') {
  Info "Installing Node $NodeMajor with fnm"
  & fnm install $NodeMajor
  & fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
  & fnm use $NodeMajor
}
else {
  Info "Installing Node $NodeMajor (official build)"
  Install-NodeOfficial
}

if (-not (Test-NodeOk)) { throw 'Node >= 22.12 is still not on PATH.' }
Info "Node $(node --version), npm $(npm --version)"

# --- pnpm ------------------------------------------------------------------

$current = $null
if (Has 'pnpm') { $current = (& pnpm --version 2>$null) }
if ($current -eq $PnpmVersion) {
  Info "pnpm $PnpmVersion already installed"
}
else {
  Info "Installing pnpm $PnpmVersion"
  # pnpm 12 is a native binary set up by its own install script, which recent npm skips by default.
  & npm install -g "pnpm@$PnpmVersion" --allow-scripts=pnpm
  if ($LASTEXITCODE -ne 0) { throw "npm install -g pnpm@$PnpmVersion failed." }
  $prefix = (& npm config get prefix).Trim()
  if (-not (($env:Path.Split(';') | ForEach-Object { $_.TrimEnd('\') }) -contains $prefix.TrimEnd('\'))) { Add-UserPath $prefix }
}

$current = $null
if (Has 'pnpm') { $current = (& pnpm --version 2>$null) }
if ($current -ne $PnpmVersion) { throw "pnpm $PnpmVersion is not on PATH (found: $current)." }
Info "pnpm $current"

Write-Host ''
Info 'Done. Next: pnpm install --frozen-lockfile'
if ($PathChanged) { Warn 'open a new terminal (restart VS Code for its terminals) so PATH changes apply' }
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq 'Restricted' -or ($policy -eq 'Undefined' -and (Get-ExecutionPolicy) -eq 'Restricted')) {
  Warn "PowerShell's execution policy blocks pnpm.ps1. Use the Command Prompt, or run once: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"
}
