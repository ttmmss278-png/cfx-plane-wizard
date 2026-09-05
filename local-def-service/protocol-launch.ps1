param(
    [string]$ProtocolUri = ''
)

$ErrorActionPreference = 'SilentlyContinue'

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolboxRoot = Split-Path -Parent $serviceRoot
$activeUrlPath = Join-Path $serviceRoot 'active-service.url'
$serviceBat = Join-Path $toolboxRoot '启动本地服务.bat'
$legacyToolboxBat = Join-Path $toolboxRoot '启动工程工具箱.bat'
$toolboxBat = if (Test-Path -LiteralPath $serviceBat -PathType Leaf) { $serviceBat } else { $legacyToolboxBat }
$servicePort = 62356
$fixedUrl = "http://127.0.0.1:$servicePort/"
$serviceVersion = '2.4.0'
$allowedWebOrigin = 'https://ttmmss278-png.github.io'

function Get-ServiceHealth {
    param([string]$Url)
    try {
        return Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/api/health') -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-CurrentService {
    param($Health)
    if ($null -eq $Health) { return $false }
    $features = @($Health.features)
    return $Health.ok -eq $true -and
        [string]$Health.version -eq $serviceVersion -and
        [string]$Health.transport -eq 'tcp-loopback' -and
        $features -contains 'select-result-files' -and
        $features -contains 'def-conversion'
}

function Test-PeltonService {
    param($Health)
    if ($null -eq $Health -or $Health.ok -ne $true) { return $false }
    $features = @($Health.features)
    return [string]$Health.version -match '^2(?:\.|$)' -and
        ($features -contains 'select-result-files' -or $features -contains 'def-conversion')
}

function Test-ServicePortAvailable {
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, $servicePort)
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
    if (-not (Test-PeltonService -Health $Health)) {
        throw "端口 $servicePort 已被其他程序占用，无法安全接管。"
    }

    $headers = @{ Origin = $allowedWebOrigin }
    $shutdownError = $null
    try {
        $features = @($Health.features)
        if ($Health.sessionRequired -eq $true -or $features -contains 'session-handshake') {
            $session = Invoke-RestMethod -Uri ($fixedUrl + 'api/session') -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 2 -ErrorAction Stop
            if ([string]::IsNullOrWhiteSpace([string]$session.token)) { throw '旧服务没有返回有效的会话令牌。' }
            $headers['X-Pelton-Session'] = [string]$session.token
        }
        Invoke-RestMethod -Uri ($fixedUrl + 'api/shutdown') -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' -TimeoutSec 2 -ErrorAction Stop | Out-Null
    } catch {
        $shutdownError = $_.Exception.Message
    }

    if (Wait-ServicePortAvailable) { return }
    if ([string]::IsNullOrWhiteSpace([string]$shutdownError)) { $shutdownError = '旧服务未在限定时间内退出。' }
    throw "无法关闭旧版 Pelton 本地服务，端口 $servicePort 仍被占用：$shutdownError"
}

function Show-LauncherError {
    param([string]$Message)
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        '冲击式水轮机工程工具箱',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

$runningHealth = Get-ServiceHealth -Url $fixedUrl
if (Test-CurrentService -Health $runningHealth) { exit 0 }

if ($null -ne $runningHealth) {
    try {
        Stop-RunningPeltonService -Health $runningHealth
    } catch {
        Show-LauncherError -Message ($_.Exception.Message + "`r`n`r`n请关闭旧服务窗口后再点击「启动本地服务」。")
        exit 1
    }
} elseif (-not (Wait-ServicePortAvailable -TimeoutMilliseconds 500)) {
    Show-LauncherError -Message "端口 $servicePort 已被其他程序占用。请关闭占用程序后再点击「启动本地服务」。"
    exit 1
}

if (Test-Path -LiteralPath $activeUrlPath -PathType Leaf) {
    $activeUrl = [System.IO.File]::ReadAllText($activeUrlPath, [System.Text.Encoding]::UTF8).Trim()
    if ($activeUrl -match '^http://127\.0\.0\.1:\d+/$') {
        try {
            $activeHealth = Get-ServiceHealth -Url $activeUrl
            if (Test-CurrentService -Health $activeHealth) {
                exit 0
            }
        } catch {}
    }
    Remove-Item -LiteralPath $activeUrlPath -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $toolboxBat -PathType Leaf)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "未找到本地服务启动文件。请重新下载并完整解压本地服务包。`r`n`r`n已检查：`r`n$serviceBat`r`n$legacyToolboxBat",
        '冲击式水轮机工程工具箱',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

Start-Process -FilePath $toolboxBat -WorkingDirectory $toolboxRoot
exit 0
