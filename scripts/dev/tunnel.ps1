<#
  Opens a Cloudflare quick tunnel to the web app and writes its address into
  backend/.env as PUBLIC_APP_URL, so the link in the barangay alert SMS opens on a phone.
  The same link lets a teammate sign in to the whole console: in dev the web app serves
  the API and Socket.io on its own origin (see next.config.mjs), so one tunnel is enough.

  Usage (from the repo root):   pnpm tunnel   (or pnpm share)
                          or:   powershell -ExecutionPolicy Bypass -File scripts/dev/tunnel.ps1 [-Port 3001]

  What it does
    1. Finds cloudflared (PATH, then the winget install folder).
    2. Starts `cloudflared tunnel --url http://localhost:<Port>` and waits for the address.
    3. Sets PUBLIC_APP_URL=<address> in backend/.env.
    4. Keeps running. Press Ctrl+C to stop: it closes the tunnel and blanks PUBLIC_APP_URL.

  After step 3, RESTART THE BACKEND: it reads .env only at startup, and the quick-tunnel
  address is new every run. The web app (pnpm dev in frontend) must already be running.
  The tunnel exposes the whole web app to the internet while it runs (only /b/<token> and
  /v1/public/barangay/* work without a login).
#>
param(
  [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$envFile  = Join-Path $repoRoot 'backend\.env'

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  # A terminal opened before the install does not have it on PATH yet.
  foreach ($dir in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    $candidate = Join-Path $dir 'cloudflared\cloudflared.exe'
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Set-PublicAppUrl([string]$value) {
  if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
  $text = [IO.File]::ReadAllText($envFile)
  $line = "PUBLIC_APP_URL=$value"
  if ($text -match '(?m)^PUBLIC_APP_URL=.*$') {
    $text = [regex]::Replace($text, '(?m)^PUBLIC_APP_URL=.*$', $line)
  } else {
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`r`n" }
    $text += "$line`r`n"
  }
  [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding($false)))
}

$exe = Find-Cloudflared
if (-not $exe) {
  Write-Host 'cloudflared is not installed. Install it with:' -ForegroundColor Yellow
  Write-Host '  winget install --id Cloudflare.cloudflared' -ForegroundColor Yellow
  exit 1
}

try {
  $web = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction SilentlyContinue
} catch { $web = $null }
if (-not $web -and -not (Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  Write-Host "Nothing is listening on port $Port. Start the web app first (cd frontend; pnpm dev)." -ForegroundColor Yellow
  exit 1
}

$log = Join-Path ([IO.Path]::GetTempPath()) 'agap-cloudflared.log'
Remove-Item $log -ErrorAction SilentlyContinue
$proc = $null

try {
  # cloudflared writes its log (and the address) to stderr.
  $proc = Start-Process -FilePath $exe -ArgumentList @('tunnel', '--url', "http://localhost:$Port") `
    -RedirectStandardError $log -RedirectStandardOutput "$log.out" -NoNewWindow -PassThru

  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) { throw "cloudflared exited early. See $log" }
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { throw "No tunnel address after 30 s. See $log" }

  Set-PublicAppUrl $url
  Write-Host ''
  Write-Host "Tunnel:  $url" -ForegroundColor Green
  Write-Host "Wrote PUBLIC_APP_URL to backend\.env"
  Write-Host 'NOW RESTART THE BACKEND so new alert SMS carry this link.' -ForegroundColor Yellow
  Write-Host 'Press Ctrl+C to close the tunnel (PUBLIC_APP_URL is blanked on exit).'
  Write-Host ''

  Wait-Process -Id $proc.Id
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  try { Set-PublicAppUrl '' } catch { }
  Write-Host 'Tunnel closed. PUBLIC_APP_URL cleared; restart the backend to stop sending links.'
}
