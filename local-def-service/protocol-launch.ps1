param(
    [string]$ProtocolUri = ''
)

$ErrorActionPreference = 'SilentlyContinue'

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolboxRoot = Split-Path -Parent $serviceRoot
$activeUrlPath = Join-Path $serviceRoot 'active-service.url'
$toolboxBat = Join-Path $toolboxRoot '启动工程工具箱.bat'

if (Test-Path -LiteralPath $activeUrlPath -PathType Leaf) {
    $activeUrl = [System.IO.File]::ReadAllText($activeUrlPath, [System.Text.Encoding]::UTF8).Trim()
    if ($activeUrl -match '^http://127\.0\.0\.1:\d+/$') {
        try {
            $response = Invoke-WebRequest -Uri $activeUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                Start-Process $activeUrl
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
