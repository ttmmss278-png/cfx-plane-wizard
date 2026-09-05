param(
    [Parameter(Mandatory = $true)]
    [string]$ToolboxRoot
)

$ErrorActionPreference = 'Stop'

$rootInput = $ToolboxRoot.Trim().Trim([char]34)
if ([string]::IsNullOrWhiteSpace($rootInput)) {
    throw '工具箱路径不能为空。'
}

try {
    $root = [System.IO.Path]::GetFullPath($rootInput)
} catch {
    throw "工具箱路径无效：$rootInput。$($_.Exception.Message)"
}
$launchScript = Join-Path $root 'local-def-service\protocol-launch.ps1'
$toolboxBat = Join-Path $root '启动工程工具箱.bat'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

if (-not (Test-Path -LiteralPath $launchScript -PathType Leaf)) {
    throw "缺少协议启动脚本：$launchScript"
}
if (-not (Test-Path -LiteralPath $toolboxBat -PathType Leaf)) {
    throw "缺少工具箱启动文件：$toolboxBat"
}
if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) {
    throw "未找到 Windows PowerShell：$powershellExe"
}

$protocolRoot = 'HKCU:\Software\Classes\pelton-toolbox'
$commandKey = Join-Path $protocolRoot 'shell\open\command'
$iconKey = Join-Path $protocolRoot 'DefaultIcon'

New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value 'URL:Pelton Toolbox Local Service'
New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

New-Item -Path $iconKey -Force | Out-Null
Set-Item -Path $iconKey -Value "$powershellExe,0"

New-Item -Path $commandKey -Force | Out-Null
$command = '"{0}" -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $powershellExe, $launchScript
Set-Item -Path $commandKey -Value $command

Write-Host '网页启动器已安装。' -ForegroundColor Green
