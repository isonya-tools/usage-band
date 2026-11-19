# UsageBand installer for Windows: the app + the Claude Code mod.
# Usage (Windows PowerShell):
#   irm https://raw.githubusercontent.com/isonya-tools/usage-band/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'isonya-tools/usage-band'

# ---- [1/3] download and install the app ----
Write-Host '[1/3] Downloading and installing UsageBand...'
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -like 'UsageBand-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw 'Installer not found in the latest release.' }
$file = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file

Get-Process UsageBand -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $file -ArgumentList '/S' -Wait
Remove-Item $file -ErrorAction SilentlyContinue

# ---- [2/3] Claude Code mod ----
# While Claude Code is running, the mod hands the usage to the app, so the app does not need to call the usage API.
Write-Host '[2/3] Installing the Claude Code mod...'
$claude = $null
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { $claude = $cmd.Source }
if (-not $claude) {
  $p = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path $p) { $claude = $p }
}
if ($claude) {
  & $claude plugin install usage-band --marketplace $repo
  # if it was already installed, bring it up to date
  & $claude plugin marketplace update usage-band
  & $claude plugin update usage-band@usage-band
} else {
  Write-Host 'Note: claude command not found. Skipping the mod (the app still works through the usage API).'
}

# ---- [3/3] sign-in (first time only) ----
# The usage API needs the Claude sign-in of this PC (~/.claude/.credentials.json).
$cred = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (-not (Test-Path $cred)) {
  Write-Host '[3/3] Sign in to Claude (a browser window opens)...'
  if ($claude) {
    & $claude auth login
  } else {
    Write-Host 'Note: claude command not found. Install Claude Code, then run: claude auth login'
  }
} else {
  Write-Host '[3/3] Already signed in.'
}

# ---- start the app ----
$exe = @('usage-band-app', 'UsageBand') |
  ForEach-Object { Join-Path $env:LOCALAPPDATA "Programs\$_\UsageBand.exe" } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  # Launch through Explorer so the app is not tied to this PowerShell process
  # and keeps running after it closes.
  Start-Process explorer.exe -ArgumentList ('"' + $exe + '"')
} else {
  Write-Host 'Note: UsageBand.exe was not found at the default location. Start it from the Start menu.'
}

Write-Host ''
Write-Host '[DONE] UsageBand is installed and running (see the tray icon at the bottom right).'
Write-Host 'Close the Claude desktop app and reopen it so Claude Code loads the mod.'
