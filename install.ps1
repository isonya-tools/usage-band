# UsageBand one-step installer: installs the Claude Code mod and the Windows app.
# Usage (Windows PowerShell):
#   irm https://raw.githubusercontent.com/isonya-tools/usage-band/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'isonya-tools/usage-band'

# ---- [1/3] mod ----
Write-Host '[1/3] Installing the Claude Code mod...'
$claude = $null
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { $claude = $cmd.Source }
if (-not $claude) {
  $p = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path $p) { $claude = $p }
}
if (-not $claude) { throw 'claude command not found. Install the Claude desktop app (Code tab) first.' }

& $claude plugin install usage-band --marketplace $repo
if ($LASTEXITCODE -ne 0) {
  # already installed: update it instead
  & $claude plugin marketplace update usage-band
  & $claude plugin update usage-band@usage-band
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install or update the mod.' }
}

# ---- [2/3] app ----
Write-Host '[2/3] Downloading the Windows app...'
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -like 'UsageBand-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw 'Installer not found in the latest release.' }
$file = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file

Write-Host '[3/3] Installing the Windows app...'
Get-Process UsageBand -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $file -ArgumentList '/S' -Wait
Remove-Item $file -ErrorAction SilentlyContinue

$exe = Join-Path $env:LOCALAPPDATA 'Programs\UsageBand\UsageBand.exe'
if (Test-Path $exe) {
  if (-not (Get-Process UsageBand -ErrorAction SilentlyContinue)) { Start-Process $exe }
} else {
  Write-Host 'Note: UsageBand.exe was not found at the default location. Start it from the Start menu.'
}

Write-Host ''
Write-Host '[DONE] Installed. Close the Claude desktop app, reopen it, and start a new session in the Code tab.'
