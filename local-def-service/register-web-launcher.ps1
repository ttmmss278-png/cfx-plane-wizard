param(
    [Parameter(Mandatory = $true)]
    [string]$ToolboxRoot,
    [string]$ProtocolRoot = 'HKCU:\Software\Classes\pelton-toolbox'
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
$serviceBat = Join-Path $root '启动本地服务.bat'
$legacyToolboxBat = Join-Path $root '启动工程工具箱.bat'
$toolboxBat = if (Test-Path -LiteralPath $serviceBat -PathType Leaf) { $serviceBat } else { $legacyToolboxBat }
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

if (-not (Test-Path -LiteralPath $launchScript -PathType Leaf)) {
    throw "缺少协议启动脚本：$launchScript"
}
if (-not (Test-Path -LiteralPath $toolboxBat -PathType Leaf)) {
    throw "缺少本地服务启动文件。已检查：$serviceBat；$legacyToolboxBat"
}
if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) {
    throw "未找到 Windows PowerShell：$powershellExe"
}

$protocolRegistryRoot = $ProtocolRoot.Trim()
if ([string]::IsNullOrWhiteSpace($protocolRegistryRoot) -or $protocolRegistryRoot -notlike 'HKCU:\Software\*') {
    throw '协议注册位置必须位于当前用户的 HKCU:\Software 下。'
}
$commandKey = Join-Path $protocolRegistryRoot 'shell\open\command'
$iconKey = Join-Path $protocolRegistryRoot 'DefaultIcon'

New-Item -Path $protocolRegistryRoot -Force | Out-Null
Set-Item -Path $protocolRegistryRoot -Value 'URL:Pelton Toolbox Local Service'
New-ItemProperty -Path $protocolRegistryRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

New-Item -Path $iconKey -Force | Out-Null
Set-Item -Path $iconKey -Value "$powershellExe,0"

New-Item -Path $commandKey -Force | Out-Null
$command = '"{0}" -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $powershellExe, $launchScript
Set-Item -Path $commandKey -Value $command

Write-Host '网页启动器已安装。' -ForegroundColor Green
