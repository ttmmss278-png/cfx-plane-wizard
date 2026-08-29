param(
    [string]$ProtocolUri = ''
)

$ErrorActionPreference = 'SilentlyContinue'

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolboxRoot = Split-Path -Parent $serviceRoot
$activeUrlPath = Join-Path $serviceRoot 'active-service.url'
$toolboxBat = Join-Path $toolboxRoot '启动工程工具箱.bat'
$fixedUrl = 'http://127.0.0.1:62356/'

function Test-CurrentService {
    param([string]$Url)
    try {
        $health = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/api/health') -TimeoutSec 2
        return $health.ok -eq $true -and @($health.features) -contains 'select-result-files'
    } catch {
        return $false
    }
}

if (Test-CurrentService -Url $fixedUrl) {
    exit 0
}

# Older launcher packages used the same fixed port but did not expose the
# result-file picker. Shut down only a positively identified Pelton service so
# the current backend can take over the port.
try {
    $legacyHealth = Invoke-RestMethod -Uri ($fixedUrl + 'api/health') -TimeoutSec 2
    if ($legacyHealth.ok -eq $true -and $legacyHealth.mode -eq 'github-frontend') {
        Invoke-RestMethod -Uri ($fixedUrl + 'api/shutdown') -Method Post -TimeoutSec 2 | Out-Null
        Start-Sleep -Milliseconds 500
    }
} catch {}

if (Test-Path -LiteralPath $activeUrlPath -PathType Leaf) {
    $activeUrl = [System.IO.File]::ReadAllText($activeUrlPath, [System.Text.Encoding]::UTF8).Trim()
    if ($activeUrl -match '^http://127\.0\.0\.1:\d+/$') {
        try {
            if (Test-CurrentService -Url $activeUrl) {
                exit 0
            }
        } catch {}
    }
    Remove-Item -LiteralPath $activeUrlPath -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $toolboxBat -PathType Leaf)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "未找到工具箱启动文件：`r`n$toolboxBat",
        '冲击式水轮机工程工具箱',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

Start-Process -FilePath $toolboxBat -WorkingDirectory $toolboxRoot
exit 0
