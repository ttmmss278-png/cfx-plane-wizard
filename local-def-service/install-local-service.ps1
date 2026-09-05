param(
    [Parameter(Mandatory = $true)]
    [string]$PackageRoot,
    [string]$InstallBase = '',
    [switch]$StartAfterInstall,
    [switch]$SkipRegistration
)

$ErrorActionPreference = 'Stop'
$ServiceVersion = '2.4.0'
$ServicePort = 62356
$ServiceBaseUrl = "http://127.0.0.1:$ServicePort"
$AllowedWebOrigin = 'https://ttmmss278-png.github.io'

function Get-RunningServiceHealth {
    try {
        return Invoke-RestMethod -Uri "$ServiceBaseUrl/api/health" -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-CurrentServiceHealth {
    param($Health)
    if ($null -eq $Health) { return $false }
    $features = @($Health.features)
    return $Health.ok -eq $true -and
        [string]$Health.version -eq $ServiceVersion -and
        [string]$Health.transport -eq 'tcp-loopback' -and
        $features -contains 'select-result-files' -and
        $features -contains 'def-conversion'
}

function Test-PeltonServiceHealth {
    param($Health)
    if ($null -eq $Health -or $Health.ok -ne $true) { return $false }
    $features = @($Health.features)
    return [string]$Health.version -match '^2(?:\.|$)' -and
        ($features -contains 'select-result-files' -or $features -contains 'def-conversion')
}

function Test-ServicePortAvailable {
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, $ServicePort)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        try { if ($null -ne $listener) { $listener.Stop() } } catch {}
    }
}

function Wait-ServicePortAvailable {
    param([int]$TimeoutMilliseconds = 6000)
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        while ($watch.ElapsedMilliseconds -lt $TimeoutMilliseconds) {
            if (Test-ServicePortAvailable) { return $true }
            Start-Sleep -Milliseconds 100
        }
        return (Test-ServicePortAvailable)
    } finally {
        $watch.Stop()
    }
}

function Stop-RunningPeltonService {
    param($Health)
    if (-not (Test-PeltonServiceHealth -Health $Health)) {
        throw "端口 $ServicePort 已被其他程序占用，无法安全接管。请关闭占用程序后重试。"
    }

    $headers = @{ Origin = $AllowedWebOrigin }
    $shutdownError = $null
    try {
        $features = @($Health.features)
        if ($Health.sessionRequired -eq $true -or $features -contains 'session-handshake') {
            $session = Invoke-RestMethod -Uri "$ServiceBaseUrl/api/session" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 2 -ErrorAction Stop
            if ([string]::IsNullOrWhiteSpace([string]$session.token)) {
                throw '旧服务没有返回有效的会话令牌。'
            }
            $headers['X-Pelton-Session'] = [string]$session.token
        }
        Invoke-RestMethod -Uri "$ServiceBaseUrl/api/shutdown" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 2 -ErrorAction Stop | Out-Null
    } catch {
        $shutdownError = $_.Exception.Message
    }

    if (Wait-ServicePortAvailable) { return }
    if ([string]::IsNullOrWhiteSpace([string]$shutdownError)) { $shutdownError = '旧服务未在限定时间内退出。' }
    throw "无法关闭旧版 Pelton 本地服务，端口 $ServicePort 仍被占用：$shutdownError"
}

$packageInput = $PackageRoot.Trim().Trim([char]34)
if ([string]::IsNullOrWhiteSpace($packageInput)) { throw '安装包路径不能为空。' }
$sourceRoot = [System.IO.Path]::GetFullPath($packageInput)
$sourceServiceRoot = Join-Path $sourceRoot 'local-def-service'

if ([string]::IsNullOrWhiteSpace($InstallBase)) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw '未找到当前用户的 LOCALAPPDATA 目录。' }
    $InstallBase = Join-Path $env:LOCALAPPDATA 'PeltonToolbox\LocalService'
}
$installBaseFull = [System.IO.Path]::GetFullPath($InstallBase.Trim().Trim([char]34))
$installRoot = Join-Path $installBaseFull $ServiceVersion
$installServiceRoot = Join-Path $installRoot 'local-def-service'

$rootFiles = @('启动本地服务.bat')
$serviceFiles = @(
    'server.ps1',
    'worker.ps1',
    'protocol-launch.ps1',
    'register-web-launcher.ps1',
    '使用说明.txt'
)

foreach ($name in $rootFiles) {
    $path = Join-Path $sourceRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "安装包缺少文件：$name" }
}
foreach ($name in $serviceFiles) {
    $path = Join-Path $sourceServiceRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "安装包缺少文件：local-def-service\$name" }
}

New-Item -ItemType Directory -Path $installServiceRoot -Force | Out-Null
foreach ($name in $rootFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $installRoot $name) -Force
}
foreach ($name in $serviceFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceServiceRoot $name) -Destination (Join-Path $installServiceRoot $name) -Force
}

$versionInfo = [ordered]@{
    version = $ServiceVersion
    installedAt = (Get-Date).ToString('o')
    installRoot = $installRoot
    features = @('select-result-files', 'def-conversion')
}
[System.IO.File]::WriteAllText(
    (Join-Path $installRoot 'installed-version.json'),
    ($versionInfo | ConvertTo-Json -Depth 4),
    (New-Object System.Text.UTF8Encoding($false))
)

if (-not $SkipRegistration) {
    & (Join-Path $installServiceRoot 'register-web-launcher.ps1') -ToolboxRoot $installRoot
}

if ($StartAfterInstall) {
    $runningHealth = Get-RunningServiceHealth
    $alreadyRunning = Test-CurrentServiceHealth -Health $runningHealth

    if ($alreadyRunning) {
        Write-Host '检测到本地服务已经运行，无需重复启动。' -ForegroundColor Cyan
    } else {
        if ($null -ne $runningHealth) {
            Write-Host "检测到旧版 Pelton 本地服务 v$($runningHealth.version)，正在安全关闭并升级。" -ForegroundColor Cyan
            Stop-RunningPeltonService -Health $runningHealth
        } elseif (-not (Wait-ServicePortAvailable -TimeoutMilliseconds 500)) {
            throw "端口 $ServicePort 已被其他程序占用，无法启动本地服务。请关闭占用程序后重试。"
        }
        $startedProcess = Start-Process -FilePath (Join-Path $installRoot '启动本地服务.bat') -WorkingDirectory $installRoot -PassThru
        $startedHealth = $null
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            $startedHealth = Get-RunningServiceHealth
            if (Test-CurrentServiceHealth -Health $startedHealth) { break }
            try {
                if ($null -ne $startedProcess -and $startedProcess.HasExited) { break }
            } catch {}
        }
        if (-not (Test-CurrentServiceHealth -Health $startedHealth)) {
            $exitDetail = ''
            try {
                if ($null -ne $startedProcess -and $startedProcess.HasExited) {
                    $exitDetail = "，启动进程退出代码为 $($startedProcess.ExitCode)"
                }
            } catch {}
            throw "本地服务未能在端口 $ServicePort 上启动并通过版本/功能检查$exitDetail。请查看安装目录下的 local-def-service\server-error.log。"
        }
    }
}

Write-Host "本地服务 $ServiceVersion 已安装到：$installRoot" -ForegroundColor Green
