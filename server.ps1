#requires -Version 5.1

# Server Management Script (Windows)

$WebsiteServiceName = "website"
$CloudflareServiceName = "cloudflared"
$ScriptRoot = Split-Path -Parent $PSCommandPath

if ([string]::IsNullOrWhiteSpace($ScriptRoot)) {
    $ScriptRoot = (Get-Location).Path
}

# Optional log file paths. If files do not exist, the script falls back to service events.
$WebsiteLogPath = Join-Path $ScriptRoot "logs\website.log"
$CloudflareLogPath = Join-Path $ScriptRoot "logs\cloudflared.log"
$CloudflareSettingsPath = Join-Path $ScriptRoot "cloudflare-settings.json"
$WebsiteRunnerScriptPath = Join-Path $ScriptRoot "website-service-runner.ps1"
$WebsitePidPath = Join-Path $ScriptRoot "website.pid"
$CloudflarePidPath = Join-Path $ScriptRoot "cloudflared.pid"

function Show-Menu {
    $settings = Get-CloudflareSettings
    $displayDomain = if (-not [string]::IsNullOrWhiteSpace($settings.hostname)) { $settings.hostname } else { "not-configured" }

    Write-Host ""
    Write-Host "========================================="
    Write-Host "   Server Management - $displayDomain"
    Write-Host "========================================="
    Write-Host ""
    Write-Host "1. Start Server"
    Write-Host "2. Stop Server"
    Write-Host "3. Status"
    Write-Host "4. Install Cloudflare"
    Write-Host "5. Configure Cloudflare"
    Write-Host "6. Logout Cloudflare"
    Write-Host "0. Exit"
    Write-Host ""
}

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-CloudflaredCommand {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $commonPaths = @(
        "C:\\Program Files\\Cloudflare\\Cloudflared\\cloudflared.exe",
        "C:\\Program Files\\cloudflared\\cloudflared.exe",
        "C:\\Program Files (x86)\\Cloudflare\\Cloudflared\\cloudflared.exe",
        "C:\\ProgramData\\chocolatey\\bin\\cloudflared.exe"
    )

    foreach ($path in $commonPaths) {
        if (Test-Path -Path $path) {
            return $path
        }
    }

    $searchRoots = @(
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\Users\\$env:USERNAME\\AppData\\Local"
    )

    foreach ($root in $searchRoots) {
        if (-not (Test-Path -Path $root)) {
            continue
        }

        $found = Get-ChildItem -Path $root -Filter "cloudflared.exe" -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    return $null
}

function Get-CloudflareSettings {
    if (-not (Test-Path -Path $CloudflareSettingsPath)) {
        return [ordered]@{
            hostname = ""
            ns1 = ""
            ns2 = ""
            localUrl = "http://localhost:8080"
        }
    }

    try {
        $raw = Get-Content -Path $CloudflareSettingsPath -Raw -ErrorAction Stop
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
        return [ordered]@{
            hostname = [string]$parsed.hostname
            ns1 = [string]$parsed.ns1
            ns2 = [string]$parsed.ns2
            localUrl = if ([string]::IsNullOrWhiteSpace($parsed.localUrl)) { "http://localhost:8080" } else { [string]$parsed.localUrl }
        }
    }
    catch {
        Write-Host "File config Cloudflare rusak, gunakan default."
        return [ordered]@{
            hostname = ""
            ns1 = ""
            ns2 = ""
            localUrl = "http://localhost:8080"
        }
    }
}

function Save-CloudflareSettings {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary]$Settings
    )

    $payload = [ordered]@{
        hostname = [string]$Settings.hostname
        ns1 = [string]$Settings.ns1
        ns2 = [string]$Settings.ns2
        localUrl = [string]$Settings.localUrl
        updatedAt = (Get-Date).ToString("s")
    }

    $payload | ConvertTo-Json -Depth 3 | Set-Content -Path $CloudflareSettingsPath -Encoding UTF8
}

function Configure-CloudflareUnified {
    Write-Host "Cloudflare Auto Configuration"
    Write-Host "-----------------------------------------"

    $cloudflaredPath = Get-CloudflaredCommand
    if (-not $cloudflaredPath) {
        Write-Host "cloudflared belum ditemukan. Jalankan menu 4 dulu."
        return
    }

    Write-Host "Login Cloudflare dulu..."
    $loginOutput = (& $cloudflaredPath tunnel login 2>&1 | Out-String)
    $certPath = Join-Path $env:USERPROFILE ".cloudflared\\cert.pem"
    if ($LASTEXITCODE -ne 0 -and -not (Test-Path $certPath)) {
        Write-Host "Login Cloudflare gagal. Cek browser/auth lalu coba lagi."
        Write-Host $loginOutput
        return
    }

    # Reset local Cloudflare runtime/config state before new auto setup.
    Stop-CloudflareFallbackProcess
    Remove-Item -Path $CloudflareSettingsPath -ErrorAction SilentlyContinue
    Remove-Item -Path $CloudflareLogPath -ErrorAction SilentlyContinue
    Remove-Item -Path ($CloudflareLogPath + ".err") -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path "$env:USERPROFILE\.cloudflared" "config.yml") -ErrorAction SilentlyContinue

    $domain = (Read-Host "1. Domain").Trim().ToLower()
    $ns1 = (Read-Host "2. Nameserver 1").Trim().ToLower()
    $ns2 = (Read-Host "3. Nameserver 2").Trim().ToLower()

    if ([string]::IsNullOrWhiteSpace($domain) -or [string]::IsNullOrWhiteSpace($ns1) -or [string]::IsNullOrWhiteSpace($ns2)) {
        Write-Host "Input domain dan nameserver wajib diisi."
        return
    }

    $settings = [ordered]@{
        hostname = $domain
        ns1 = $ns1
        ns2 = $ns2
        localUrl = "http://localhost:8080"
    }
    Save-CloudflareSettings -Settings $settings

    $tunnelName = $domain -replace '\.', '-'
    $cloudflaredHome = Join-Path $env:USERPROFILE ".cloudflared"
    if (-not (Test-Path -Path $cloudflaredHome)) {
        New-Item -Path $cloudflaredHome -ItemType Directory -Force | Out-Null
    }

    $createOutput = (& $cloudflaredPath tunnel create $tunnelName 2>&1 | Out-String)
    $tunnelId = $null

    if ($createOutput -match 'with id\s+([a-f0-9\-]{36})') {
        $tunnelId = $matches[1]
    }
    elseif ($createOutput -match '([a-f0-9\-]{36})\.json') {
        $tunnelId = $matches[1]
    }
    else {
        $listOutput = (& $cloudflaredPath tunnel list 2>&1 | Out-String)
        if ($listOutput -match '([a-f0-9\-]{36})\s+' + [regex]::Escape($tunnelName)) {
            $tunnelId = $matches[1]
        }
    }

    if (-not $tunnelId) {
        Write-Host "Gagal menentukan Tunnel ID."
        return
    }

    $credentialsFile = Join-Path $cloudflaredHome "$tunnelId.json"
    if (-not (Test-Path -Path $credentialsFile)) {
        & $cloudflaredPath tunnel token --cred-file $credentialsFile $tunnelName | Out-Null

        if (-not (Test-Path -Path $credentialsFile)) {
            Write-Host "Gagal generate credentials: $credentialsFile"
            Write-Host "Jalankan manual: cloudflared tunnel token --cred-file $credentialsFile $tunnelName"
            return
        }
    }

    $configPath = Join-Path $cloudflaredHome "config.yml"
    $configContent = @"
tunnel: $tunnelId
credentials-file: $credentialsFile

ingress:
  - hostname: $domain
    service: http://localhost:8080
  - hostname: www.$domain
    service: http://localhost:8080
  - service: http_status:404
"@
    Set-Content -Path $configPath -Value $configContent -Encoding UTF8

    & $cloudflaredPath tunnel route dns --overwrite-dns $tunnelName $domain
    & $cloudflaredPath tunnel route dns --overwrite-dns $tunnelName "www.$domain"

    Stop-CloudflareFallbackProcess
    Start-CloudflareFallbackProcess | Out-Null

    Write-Host "Cloudflare auto setup selesai."
    Write-Host "Domain: $domain"
    Write-Host "Nameserver 1: $ns1"
    Write-Host "Nameserver 2: $ns2"

    Write-Host "Menjalankan start server otomatis..."
    Start-ManagedServer
}

function Get-RunningProcessByPidFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PidFile
    )

    if (-not (Test-Path -Path $PidFile)) {
        return $null
    }

    try {
        $targetPid = [int](Get-Content -Path $PidFile -Raw -ErrorAction Stop).Trim()
        return Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    }
    catch {
        return $null
    }
}

function Test-LocalUrl {
    param([string]$Url)

    try {
        $r = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

function Start-WebsiteFallbackProcess {
    $settings = Get-CloudflareSettings
    $localUrl = if ([string]::IsNullOrWhiteSpace($settings.localUrl)) { "http://localhost:8080" } else { [string]$settings.localUrl }

    $existing = Get-RunningProcessByPidFile -PidFile $WebsitePidPath
    if ($existing) {
        Write-Host "Website process fallback sudah berjalan (PID: $($existing.Id))."
        return $true
    }

    if (Test-LocalUrl -Url $localUrl) {
        # Origin is already up (possibly started outside this script). Capture owner PID so status/stop remain consistent.
        try {
            $listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction Stop |
                Select-Object -First 1
            if ($listener -and $listener.OwningProcess -gt 0) {
                Set-Content -Path $WebsitePidPath -Value $listener.OwningProcess -Encoding ASCII
                Write-Host "Website origin sudah responsif (PID: $($listener.OwningProcess))."
            }
            else {
                Write-Host "Website origin sudah responsif."
            }
        }
        catch {
            Write-Host "Website origin sudah responsif."
        }
        return $true
    }

    $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
    $pythonArgs = @("-3", "-m", "http.server", "8080", "--bind", "0.0.0.0")
    if (-not $pythonCmd) {
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
        $pythonArgs = @("-m", "http.server", "8080", "--bind", "0.0.0.0")
    }

    if (-not $pythonCmd) {
        Write-Host "Python tidak ditemukan, fallback website process tidak bisa dijalankan."
        return $false
    }

    if (-not (Test-Path (Split-Path -Parent $WebsiteLogPath))) {
        New-Item -Path (Split-Path -Parent $WebsiteLogPath) -ItemType Directory -Force | Out-Null
    }

    $proc = Start-Process -FilePath $pythonCmd.Source `
        -ArgumentList $pythonArgs `
        -WorkingDirectory $ScriptRoot `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $WebsiteLogPath `
        -RedirectStandardError ($WebsiteLogPath + ".err")

    Set-Content -Path $WebsitePidPath -Value $proc.Id -Encoding ASCII
    Start-Sleep -Seconds 2

    if (Test-LocalUrl -Url $localUrl) {
        Write-Host "Website fallback process started (PID: $($proc.Id))."
        return $true
    }

    Write-Host "Website fallback process gagal start."
    return $false
}

function Stop-WebsiteFallbackProcess {
    $proc = Get-RunningProcessByPidFile -PidFile $WebsitePidPath
    if ($proc) {
        Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
        Write-Host "Website fallback process dihentikan."
    }
    Remove-Item -Path $WebsitePidPath -ErrorAction SilentlyContinue
}

function Get-TunnelRunTarget {
    $configPath = Join-Path "$env:USERPROFILE\.cloudflared" "config.yml"
    if (-not (Test-Path -Path $configPath)) {
        return $null
    }

    try {
        $raw = Get-Content -Path $configPath -Raw -ErrorAction Stop
        $m = [regex]::Match($raw, 'tunnel:\s*([^\r\n]+)')
        if ($m.Success) {
            return [pscustomobject]@{ ConfigPath = $configPath; Tunnel = $m.Groups[1].Value.Trim() }
        }
    }
    catch {
    }

    return $null
}

function Start-CloudflareFallbackProcess {
    $existing = Get-RunningProcessByPidFile -PidFile $CloudflarePidPath
    if ($existing) {
        Write-Host "Cloudflare fallback process sudah berjalan (PID: $($existing.Id))."
        return $true
    }

    $cloudflaredPath = Get-CloudflaredCommand
    if (-not $cloudflaredPath) {
        Write-Host "cloudflared belum terinstall."
        return $false
    }

    $target = Get-TunnelRunTarget
    if (-not $target) {
        Write-Host "Config tunnel tidak ditemukan. Jalankan menu 5 dulu."
        return $false
    }

    if (-not (Test-Path (Split-Path -Parent $CloudflareLogPath))) {
        New-Item -Path (Split-Path -Parent $CloudflareLogPath) -ItemType Directory -Force | Out-Null
    }

    $proc = Start-Process -FilePath $cloudflaredPath `
        -ArgumentList @("tunnel", "--config", $target.ConfigPath, "run", $target.Tunnel) `
        -WorkingDirectory $ScriptRoot `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $CloudflareLogPath `
        -RedirectStandardError ($CloudflareLogPath + ".err")

    Set-Content -Path $CloudflarePidPath -Value $proc.Id -Encoding ASCII
    Start-Sleep -Seconds 2

    if (-not $proc.HasExited) {
        Write-Host "Cloudflare fallback process started (PID: $($proc.Id))."
        return $true
    }

    Write-Host "Cloudflare fallback process gagal start."
    return $false
}

function Stop-CloudflareFallbackProcess {
    $proc = Get-RunningProcessByPidFile -PidFile $CloudflarePidPath
    if ($proc) {
        Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
        Write-Host "Cloudflare fallback process dihentikan."
    }
    Remove-Item -Path $CloudflarePidPath -ErrorAction SilentlyContinue
}

function Logout-CloudflareUser {
    Write-Host "Logout Cloudflare user..."

    Stop-CloudflareFallbackProcess

    Get-Process -Name cloudflared -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue

    $svc = Get-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Stop-Service -Name $CloudflareServiceName -Force -ErrorAction SilentlyContinue
    }

    $userCloudflaredPath = Join-Path $env:USERPROFILE ".cloudflared"
    if (Test-Path -Path $userCloudflaredPath) {
        Remove-Item -Path $userCloudflaredPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    Remove-Item -Path $CloudflareSettingsPath -ErrorAction SilentlyContinue
    Remove-Item -Path $CloudflareLogPath -ErrorAction SilentlyContinue
    Remove-Item -Path ($CloudflareLogPath + ".err") -ErrorAction SilentlyContinue

    Write-Host "Logout Cloudflare user selesai."
}

function Ensure-WebsiteRunnerScript {
    $runnerScript = @'
param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath

function Get-ContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8"; break }
        ".css" { "text/css; charset=utf-8"; break }
        ".js" { "application/javascript; charset=utf-8"; break }
        ".json" { "application/json; charset=utf-8"; break }
        ".png" { "image/png"; break }
        ".jpg" { "image/jpeg"; break }
        ".jpeg" { "image/jpeg"; break }
        ".svg" { "image/svg+xml"; break }
        ".ico" { "image/x-icon"; break }
        ".txt" { "text/plain; charset=utf-8"; break }
        default { "application/octet-stream"; break }
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add(("http://+:{0}/" -f $Port))
$listener.Start()

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "index.html"
    }

    $safePath = $requestPath.Replace('/', '\\')
    $filePath = Join-Path $root $safePath
    $resolvedRoot = [System.IO.Path]::GetFullPath($root)
    $resolvedFile = [System.IO.Path]::GetFullPath($filePath)

    if (-not $resolvedFile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        $context.Response.Close()
        continue
    }

    if (-not (Test-Path -Path $resolvedFile -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $context.Response.Close()
        continue
    }

    try {
        $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
        $context.Response.ContentType = Get-ContentType -Path $resolvedFile
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $context.Response.OutputStream.Close()
    }
    catch {
        $context.Response.StatusCode = 500
        $context.Response.Close()
    }
}
'@

    Set-Content -Path $WebsiteRunnerScriptPath -Value $runnerScript -Encoding UTF8
}

function Ensure-WebsiteService {
    if (-not (Test-IsAdministrator)) {
        Write-Host "Butuh Run as Administrator untuk setup service website."
        return $false
    }

    $existingSvc = Get-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    if ($existingSvc) {
        return $true
    }

    Ensure-WebsiteRunnerScript

    $psExe = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    $binPath = '"{0}" -NoProfile -ExecutionPolicy Bypass -File "{1}" -Port 8080' -f $psExe, $WebsiteRunnerScriptPath

    sc.exe create $WebsiteServiceName binPath= $binPath start= auto DisplayName= "Website Static Server" | Out-Null
    sc.exe description $WebsiteServiceName "Static website service for local origin on port 8080" | Out-Null

    $createdSvc = Get-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    if (-not $createdSvc) {
        Write-Host "Gagal membuat service '$WebsiteServiceName'."
        return $false
    }

    Write-Host "Service website berhasil dibuat."
    return $true
}

function Ensure-CloudflareService {
    return $false
}

function Refresh-ProcessPathFromMachineAndUser {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = ($machinePath, $userPath -join ";")
}

function Add-PathEntryIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathEntry,

        [ValidateSet("Machine", "User")]
        [string]$Target = "Machine"
    )

    if (-not (Test-Path -Path $PathEntry)) {
        return $false
    }

    $current = [System.Environment]::GetEnvironmentVariable("Path", $Target)
    if ([string]::IsNullOrWhiteSpace($current)) {
        [System.Environment]::SetEnvironmentVariable("Path", $PathEntry, $Target)
        return $true
    }

    $entries = $current.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    if ($entries -contains $PathEntry) {
        return $false
    }

    $newPath = ($entries + $PathEntry) -join ';'
    [System.Environment]::SetEnvironmentVariable("Path", $newPath, $Target)
    return $true
}

function Install-CloudflaredDirect {
    if (-not (Test-IsAdministrator)) {
        Write-Host "Butuh Run as Administrator untuk direct install cloudflared."
        return $false
    }

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    }
    catch {
    }

    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    $installDir = "C:\Program Files\Cloudflare\Cloudflared"
    $targetExe = Join-Path $installDir "cloudflared.exe"
    $tempExe = Join-Path $env:TEMP "cloudflared-windows-amd64.exe"

    try {
        if (-not (Test-Path -Path $installDir)) {
            New-Item -Path $installDir -ItemType Directory -Force | Out-Null
        }

        Write-Host "Mengunduh cloudflared terbaru..."
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempExe -UseBasicParsing -ErrorAction Stop

        Copy-Item -Path $tempExe -Destination $targetExe -Force
        Remove-Item -Path $tempExe -ErrorAction SilentlyContinue

        Add-PathEntryIfMissing -PathEntry $installDir -Target "Machine" | Out-Null
        Refresh-ProcessPathFromMachineAndUser

        if (Test-Path -Path $targetExe) {
            Write-Host "cloudflared berhasil di-install manual ke: $targetExe"
            return $true
        }
    }
    catch {
        Write-Host "Direct install cloudflared gagal: $($_.Exception.Message)"
    }

    return $false
}

function Ensure-WingetAvailable {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        return $true
    }

    Write-Host "winget tidak ditemukan. Mencoba install App Installer (winget)..."

    try {
        $tempFile = Join-Path $env:TEMP "Microsoft.DesktopAppInstaller.msixbundle"
        Invoke-WebRequest -Uri "https://aka.ms/getwinget" -OutFile $tempFile -UseBasicParsing -ErrorAction Stop
        Add-AppxPackage -Path $tempFile -ErrorAction Stop
        Remove-Item -Path $tempFile -ErrorAction SilentlyContinue

        Refresh-ProcessPathFromMachineAndUser
        return [bool](Get-Command winget -ErrorAction SilentlyContinue)
    }
    catch {
        Write-Host "Gagal install winget otomatis: $($_.Exception.Message)"
        return $false
    }
}

function Ensure-ChocoAvailable {
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        return $true
    }

    Write-Host "chocolatey tidak ditemukan. Mencoba install chocolatey..."

    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

        Refresh-ProcessPathFromMachineAndUser
        return [bool](Get-Command choco -ErrorAction SilentlyContinue)
    }
    catch {
        Write-Host "Gagal install chocolatey otomatis: $($_.Exception.Message)"
        return $false
    }
}

function Get-PreferredPackageManager {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        return "winget"
    }

    if (Get-Command choco -ErrorAction SilentlyContinue) {
        return "choco"
    }

    if (Ensure-WingetAvailable) {
        return "winget"
    }

    if (Ensure-ChocoAvailable) {
        return "choco"
    }

    return $null
}

function Install-Cloudflare {
    Write-Host "Installing and configuring cloudflared..."

    if (-not (Test-IsAdministrator)) {
        Write-Host "Please run PowerShell as Administrator for install/setup service cloudflared."
        return
    }

    $cloudflaredPath = Get-CloudflaredCommand
    if (-not $cloudflaredPath) {
        $packageManager = Get-PreferredPackageManager
        if ($packageManager -eq "winget") {
            Write-Host "Installing cloudflared using winget..."
            winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements --silent
        }
        elseif ($packageManager -eq "choco") {
            Write-Host "Installing cloudflared using chocolatey..."
            choco install cloudflared -y
        }
        else {
            Write-Host "winget/choco tidak tersedia. Lanjut direct install cloudflared..."
        }

        Refresh-ProcessPathFromMachineAndUser
        $cloudflaredPath = Get-CloudflaredCommand

        if (-not $cloudflaredPath -and -not (Install-CloudflaredDirect)) {
            Write-Host "cloudflared gagal terinstall."
            Write-Host "Coba jalankan lagi script sebagai Administrator dan pastikan internet aktif."
            return
        }

        $cloudflaredPath = Get-CloudflaredCommand
        if (-not $cloudflaredPath) {
            Write-Host "cloudflared belum terdeteksi setelah proses install."
            Write-Host "Silakan restart terminal PowerShell lalu jalankan menu install lagi."
            return
        }
    }
    else {
        Write-Host "cloudflared sudah terpasang, skip install ulang."
    }

    Write-Host "cloudflared ditemukan di: $cloudflaredPath"
    try {
        $versionOutput = (& $cloudflaredPath --version 2>&1 | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($versionOutput)) {
            Write-Host "Versi: $versionOutput"
        }
    }
    catch {
        Write-Host "Tidak bisa membaca versi cloudflared, tapi binary terdeteksi."
    }

    Write-Host "cloudflared setup complete."
    Write-Host "Token/login manual tidak digunakan."
    Write-Host "Gunakan menu 5 untuk auto setup domain + nameserver."
}

function Get-ServiceSafe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    try {
        return Get-Service -Name $Name -ErrorAction Stop
    }
    catch {
        Write-Host "Service '$Name' tidak ditemukan. Pastikan service sudah dibuat di Windows."
        return $null
    }
}

function Start-ManagedServer {
    Write-Host "Starting server..."

    if (-not (Ensure-WebsiteService)) {
        return
    }

    $website = Get-ServiceSafe -Name $WebsiteServiceName
    if (-not $website) {
        return
    }

    Start-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    Write-Host "Website service start requested."

    $websiteSvcState = Get-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    if (-not $websiteSvcState -or $websiteSvcState.Status -ne 'Running') {
        Start-WebsiteFallbackProcess | Out-Null
    }

    $cloudflare = Get-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue

    if ($cloudflare) {
        Start-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue
        Write-Host "Cloudflare service start requested."
    }
    else {
        if (-not (Start-CloudflareFallbackProcess)) {
            Write-Host "Cloudflare tunnel service/process belum berjalan. Website lokal tetap bisa diakses."
        }
    }

    Start-Sleep -Seconds 2

    Write-Host "Server start sequence completed"
    Show-Status
}

function Stop-ManagedServer {
    Write-Host "Stopping server..."

    $website = Get-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    if ($website) {
        Stop-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
        Write-Host "Website service stop requested."
    }
    else {
        Write-Host "Service '$WebsiteServiceName' tidak ditemukan, skip."
    }

    $cloudflare = Get-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue
    if ($cloudflare) {
        Stop-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue
        Write-Host "Cloudflare service stop requested."
    }
    else {
        Write-Host "Service '$CloudflareServiceName' tidak ditemukan, skip."
    }

    Stop-WebsiteFallbackProcess
    Stop-CloudflareFallbackProcess

    Start-Sleep -Seconds 1

    Write-Host "Server stop sequence completed"
}

function Show-ServiceBrief {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServiceName
    )

    $svc = Get-ServiceSafe -Name $ServiceName
    if (-not $svc) { return }

    $servicePid = "-"
    $wmi = Get-CimInstance -ClassName Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
    if ($wmi -and $wmi.ProcessId -gt 0) {
        $servicePid = $wmi.ProcessId
    }

    Write-Host ("  Name    : {0}" -f $svc.Name)
    Write-Host ("  Status  : {0}" -f $svc.Status)
    Write-Host ("  StartType: {0}" -f $svc.StartType)
    Write-Host ("  PID     : {0}" -f $servicePid)
}

function Show-Status {
    $settings = Get-CloudflareSettings
    $publicUrl = if (-not [string]::IsNullOrWhiteSpace($settings.hostname)) { "https://{0}" -f $settings.hostname } else { "(belum dikonfigurasi)" }

    $localUrl = "http://localhost:8080"
    if (-not [string]::IsNullOrWhiteSpace($settings.localUrl)) {
        $localUrl = $settings.localUrl
    }

    Write-Host ""
    Write-Host "Server Status:"
    Write-Host "-----------------------------------------"
    Show-ServiceBrief -ServiceName $WebsiteServiceName
    $websiteProc = Get-RunningProcessByPidFile -PidFile $WebsitePidPath
    if ($websiteProc) {
        Write-Host ("  Website Process Fallback PID: {0}" -f $websiteProc.Id)
    }
    Write-Host ""
    Show-ServiceBrief -ServiceName $CloudflareServiceName
    $cloudflareProc = Get-RunningProcessByPidFile -PidFile $CloudflarePidPath
    if ($cloudflareProc) {
        Write-Host ("  Cloudflare Process Fallback PID: {0}" -f $cloudflareProc.Id)
    }
    Write-Host ""
    Write-Host "Access:"
    Write-Host ("  Local : {0}" -f $localUrl)
    Write-Host ("  Public: {0}" -f $publicUrl)
    Write-Host ""
}

function Show-RecentServiceEvents {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServiceName
    )

    # Service state changes are usually recorded by Service Control Manager in System log.
    $events = Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager' } -MaxEvents 300 -ErrorAction SilentlyContinue |
        Where-Object { $_.Message -match [regex]::Escape($ServiceName) } |
        Select-Object -First 20

    if (-not $events) {
        Write-Host "Tidak ada event service terbaru untuk '$ServiceName'."
        return
    }

    $events |
        Select-Object TimeCreated, Id, LevelDisplayName, Message |
        Format-Table -Wrap -AutoSize
}

function View-WebsiteLogs {
    Write-Host "Website Logs (last 20 lines):"
    Write-Host "-----------------------------------------"

    if (Test-Path -Path $WebsiteLogPath) {
        Get-Content -Path $WebsiteLogPath -Tail 20
    }
    else {
        Show-RecentServiceEvents -ServiceName $WebsiteServiceName
    }

    Write-Host ""
}

function View-CloudflareLogs {
    Write-Host "Cloudflare Tunnel Logs (last 20 lines):"
    Write-Host "-----------------------------------------"

    if (Test-Path -Path $CloudflareLogPath) {
        Get-Content -Path $CloudflareLogPath -Tail 20
    }
    else {
        Show-RecentServiceEvents -ServiceName $CloudflareServiceName
    }

    Write-Host ""
}

function Restart-ManagedServer {
    Write-Host "Restarting server..."

    $website = Get-Service -Name $WebsiteServiceName -ErrorAction SilentlyContinue
    if ($website) {
        Restart-Service -Name $WebsiteServiceName -Force -ErrorAction SilentlyContinue
        Write-Host "Website service restart requested."
    }
    else {
        Write-Host "Service '$WebsiteServiceName' tidak ditemukan, skip."
    }

    $cloudflare = Get-Service -Name $CloudflareServiceName -ErrorAction SilentlyContinue
    if ($cloudflare) {
        Restart-Service -Name $CloudflareServiceName -Force -ErrorAction SilentlyContinue
        Write-Host "Cloudflare service restart requested."
    }
    else {
        Write-Host "Service '$CloudflareServiceName' tidak ditemukan, skip."
    }

    Stop-WebsiteFallbackProcess
    Stop-CloudflareFallbackProcess
    Start-WebsiteFallbackProcess | Out-Null
    Start-CloudflareFallbackProcess | Out-Null

    Start-Sleep -Seconds 2

    Write-Host "Server restart sequence completed"
    Show-Status
}

function Setup-WebsiteService {
    Write-Host "Setup website service..."
    $ok = Ensure-WebsiteService
    if ($ok) {
        Show-ServiceBrief -ServiceName $WebsiteServiceName
    }
}

while ($true) {
    Show-Menu
    $choice = Read-Host "Choose an option"

    switch ($choice) {
        "1" { Start-ManagedServer }
        "2" { Stop-ManagedServer }
        "3" { Show-Status }
        "4" { Install-Cloudflare }
        "5" { Configure-CloudflareUnified }
        "6" { Logout-CloudflareUser }
        "0" {
            Write-Host "Goodbye!"
            return
        }
        default {
            Write-Host "Invalid option. Please try again."
        }
    }
}
