param(
    [string]$ArchivePath = '',
    [int]$TestPort = 62357
)

$ErrorActionPreference = 'Stop'
if ($TestPort -le 0 -or $TestPort -gt 65535 -or $TestPort -eq 62356) {
    throw '测试端口必须介于 1 和 65535 之间，且不得使用真实服务端口 62356。'
}
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
    $ArchivePath = Join-Path $repoRoot 'public\downloads\Pelton-Toolbox-Local-Service-Windows.zip'
}
$archiveFullPath = [System.IO.Path]::GetFullPath($ArchivePath)
if (-not (Test-Path -LiteralPath $archiveFullPath -PathType Leaf)) { throw "未找到服务包：$archiveFullPath" }

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempBase ('PeltonPackageTest-' + [guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $testRoot '中文 路径\解压目录'
$installBase = Join-Path $testRoot '安装 位置'
$registryTestRoot = "HKCU:\Software\PeltonToolbox\PackageTests\$([guid]::NewGuid().ToString('N'))"
$protocolTestRoot = Join-Path $registryTestRoot 'pelton-toolbox'
$process = $null
$legacyProcess = $null
$upgradeProcess = $null
$protocolLegacyProcess = $null

try {
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archiveFullPath -DestinationPath $extractRoot -Force

    $installer = Join-Path $extractRoot 'local-def-service\install-local-service.ps1'
    & $installer -PackageRoot $extractRoot -InstallBase $installBase -SkipRegistration

    $installedRoot = Join-Path $installBase '2.4.0'
    $requiredFiles = @(
        '启动本地服务.bat',
        'installed-version.json',
        'local-def-service\server.ps1',
        'local-def-service\worker.ps1',
        'local-def-service\protocol-launch.ps1',
        'local-def-service\register-web-launcher.ps1'
    )
    foreach ($relative in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $installedRoot $relative) -PathType Leaf)) {
            throw "安装后缺少文件：$relative"
        }
    }
    if (Test-Path -LiteralPath (Join-Path $installedRoot 'dist')) {
        throw '轻量服务安装目录不应包含或依赖 dist。'
    }

    $batTestRoot = Join-Path $testRoot 'BAT 中文 空格路径'
    $batServiceRoot = Join-Path $batTestRoot 'local-def-service'
    $batMarker = Join-Path $batTestRoot 'bat-started.marker'
    New-Item -ItemType Directory -Path $batServiceRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $extractRoot '启动本地服务.bat') -Destination (Join-Path $batTestRoot '启动本地服务.bat')
    [System.IO.File]::WriteAllText((Join-Path $batTestRoot 'installed-version.json'), '{}', (New-Object System.Text.UTF8Encoding($false)))
    $escapedBatMarker = $batMarker.Replace("'", "''")
    $dummyServer = @"
param([switch]`$NoBrowser)
[System.IO.File]::WriteAllText('$escapedBatMarker', 'ok', (New-Object System.Text.UTF8Encoding(`$false)))
exit 0
"@
    [System.IO.File]::WriteAllText(
        (Join-Path $batServiceRoot 'server.ps1'),
        $dummyServer,
        (New-Object System.Text.UTF8Encoding($true))
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $batServiceRoot 'worker.ps1'),
        "# BAT entry test`r`n",
        (New-Object System.Text.UTF8Encoding($true))
    )
    & $env:ComSpec '/d' '/c' 'call' ('"{0}"' -f (Join-Path $batTestRoot '启动本地服务.bat'))
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $batMarker -PathType Leaf)) {
        throw "启动本地服务.bat 未能从中文/空格路径正确执行，退出代码：$LASTEXITCODE"
    }

    $registerScript = Join-Path $installedRoot 'local-def-service\register-web-launcher.ps1'
    & $registerScript -ToolboxRoot $installedRoot -ProtocolRoot $protocolTestRoot
    $protocolCommandKey = Join-Path $protocolTestRoot 'shell\open\command'
    $protocolCommand = [string](Get-Item -LiteralPath $protocolCommandKey).GetValue('')
    $expectedProtocolScript = Join-Path $installedRoot 'local-def-service\protocol-launch.ps1'
    if ($protocolCommand -notlike ('*"{0}"*"%1"*' -f $expectedProtocolScript)) {
        throw "协议命令未正确引用中文/空格路径：$protocolCommand"
    }

    & (Join-Path $installedRoot 'local-def-service\server.ps1') -SelfTest

    $serverPath = Join-Path $installedRoot 'local-def-service\server.ps1'
    $powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

    $upgradePort = if ($TestPort -eq 62355) { 62357 } elseif ($TestPort -lt 65535) { $TestPort + 1 } else { $TestPort - 1 }
    $legacyRoot = Join-Path $testRoot '模拟旧版服务'
    New-Item -ItemType Directory -Path $legacyRoot -Force | Out-Null
    Copy-Item -LiteralPath $serverPath -Destination (Join-Path $legacyRoot 'server.ps1')
    Copy-Item -LiteralPath (Join-Path $installedRoot 'local-def-service\worker.ps1') -Destination (Join-Path $legacyRoot 'worker.ps1')
    $legacyServerPath = Join-Path $legacyRoot 'server.ps1'
    $legacySource = [System.IO.File]::ReadAllText($legacyServerPath, [System.Text.Encoding]::UTF8)
    $legacySource = $legacySource.Replace('$ServiceVersion = ''2.4.0''', '$ServiceVersion = ''2.3''')
    $legacySource = [regex]::Replace($legacySource, "(?m)^\s+mode = 'github-frontend'\r?\n", '')
    $legacySource = [regex]::Replace($legacySource, "(?m)^\s+transport = 'tcp-loopback'\r?\n", '')
    [System.IO.File]::WriteAllText($legacyServerPath, $legacySource, (New-Object System.Text.UTF8Encoding($true)))

    $legacyProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
        '-File', ('"{0}"' -f $legacyServerPath), '-Port', $upgradePort, '-NoBrowser'
    ) -WindowStyle Hidden -PassThru
    $legacyBaseUrl = "http://127.0.0.1:$upgradePort"
    $legacyHealth = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $legacyHealth = Invoke-RestMethod -Uri "$legacyBaseUrl/api/health" -TimeoutSec 1
            break
        } catch {}
    }
    if ($null -eq $legacyHealth -or [string]$legacyHealth.version -ne '2.3' -or
        $legacyHealth.PSObject.Properties.Name -contains 'mode' -or
        $legacyHealth.PSObject.Properties.Name -contains 'transport') {
        throw '旧版服务模拟未正确启动。'
    }

    $upgradeInstallBase = Join-Path $testRoot '模拟升级安装位置'
    $upgradeLaunchMarker = Join-Path $testRoot 'upgrade-launch.marker'
    $upgradeInstaller = Join-Path $legacyRoot 'install-local-service.ps1'
    $upgradeInstallerSource = [System.IO.File]::ReadAllText($installer, [System.Text.Encoding]::UTF8)
    $installerPortLiteral = '$ServicePort = 62356'
    if ([regex]::Matches($upgradeInstallerSource, [regex]::Escape($installerPortLiteral)).Count -ne 1) {
        throw '无法为升级模拟安全改写安装器测试端口。'
    }
    $installerTestPortLiteral = '$ServicePort = ' + $upgradePort
    $upgradeInstallerSource = $upgradeInstallerSource.Replace($installerPortLiteral, $installerTestPortLiteral)
    if ($upgradeInstallerSource.Contains($installerPortLiteral) -or -not $upgradeInstallerSource.Contains($installerTestPortLiteral)) {
        throw '安装器测试端口改写后校验失败。'
    }
    [System.IO.File]::WriteAllText($upgradeInstaller, $upgradeInstallerSource, (New-Object System.Text.UTF8Encoding($true)))
    $upgradeState = @{ Process = $null }
    & {
        function Start-Process {
            param([string]$FilePath, [string]$WorkingDirectory, [switch]$PassThru)
            [System.IO.File]::WriteAllText($upgradeLaunchMarker, $FilePath, (New-Object System.Text.UTF8Encoding($false)))
            $newServerPath = Join-Path $WorkingDirectory 'local-def-service\server.ps1'
            $upgradeState.Process = Microsoft.PowerShell.Management\Start-Process -FilePath $powershellExe -ArgumentList @(
                '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
                '-File', ('"{0}"' -f $newServerPath), '-Port', $upgradePort, '-NoBrowser'
            ) -WindowStyle Hidden -PassThru
            return $upgradeState.Process
        }
        & $upgradeInstaller -PackageRoot $extractRoot -InstallBase $upgradeInstallBase -SkipRegistration -StartAfterInstall
    }
    $upgradeProcess = $upgradeState.Process
    if (-not $legacyProcess.WaitForExit(5000)) { throw '2.3 旧服务未在升级过程中退出。' }
    if (-not (Test-Path -LiteralPath $upgradeLaunchMarker -PathType Leaf)) { throw '升级完成后没有请求启动 2.4 服务。' }
    $upgradeHealth = Invoke-RestMethod -Uri "$legacyBaseUrl/api/health" -TimeoutSec 2
    if ([string]$upgradeHealth.version -ne '2.4.0' -or [string]$upgradeHealth.transport -ne 'tcp-loopback' -or
        @($upgradeHealth.features) -notcontains 'select-result-files' -or
        @($upgradeHealth.features) -notcontains 'def-conversion') {
        throw '升级后的 2.4 服务未通过版本、监听方式或功能检查。'
    }
    $upgradeHeaders = @{ Origin = 'https://ttmmss278-png.github.io' }
    $upgradeSession = Invoke-RestMethod -Uri "$legacyBaseUrl/api/session" -Method Post -Headers $upgradeHeaders -Body '{}' -ContentType 'application/json' -TimeoutSec 2
    $upgradeHeaders['X-Pelton-Session'] = $upgradeSession.token
    Invoke-RestMethod -Uri "$legacyBaseUrl/api/shutdown" -Method Post -Headers $upgradeHeaders -Body '{}' -ContentType 'application/json' -TimeoutSec 2 | Out-Null
    if ($null -eq $upgradeProcess -or -not $upgradeProcess.WaitForExit(5000)) { throw '升级后的 2.4 测试服务未能安全退出。' }

    $protocolUpgradeRoot = Join-Path $testRoot '协议升级 中文路径'
    $protocolUpgradeServiceRoot = Join-Path $protocolUpgradeRoot 'local-def-service'
    New-Item -ItemType Directory -Path $protocolUpgradeServiceRoot -Force | Out-Null
    $protocolUpgradeScript = Join-Path $protocolUpgradeServiceRoot 'protocol-launch.ps1'
    $protocolUpgradeSource = [System.IO.File]::ReadAllText((Join-Path $installedRoot 'local-def-service\protocol-launch.ps1'), [System.Text.Encoding]::UTF8)
    $protocolPortLiteral = '$servicePort = 62356'
    if ([regex]::Matches($protocolUpgradeSource, [regex]::Escape($protocolPortLiteral)).Count -ne 1) {
        throw '无法为协议升级模拟安全改写测试端口。'
    }
    $protocolTestPortLiteral = '$servicePort = ' + $upgradePort
    $protocolUpgradeSource = $protocolUpgradeSource.Replace($protocolPortLiteral, $protocolTestPortLiteral)
    if ($protocolUpgradeSource.Contains($protocolPortLiteral) -or -not $protocolUpgradeSource.Contains($protocolTestPortLiteral)) {
        throw '协议升级测试端口改写后校验失败。'
    }
    [System.IO.File]::WriteAllText($protocolUpgradeScript, $protocolUpgradeSource, (New-Object System.Text.UTF8Encoding($true)))
    $protocolBat = '@echo off' + "`r`n" +
        '>"%~dp0protocol-started.marker" echo ok' + "`r`n" +
        'exit /b 0' + "`r`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $protocolUpgradeRoot '启动本地服务.bat'),
        $protocolBat,
        (New-Object System.Text.ASCIIEncoding)
    )

    $protocolLegacyProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
        '-File', ('"{0}"' -f $legacyServerPath), '-Port', $upgradePort, '-NoBrowser'
    ) -WindowStyle Hidden -PassThru
    $protocolLegacyHealth = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $protocolLegacyHealth = Invoke-RestMethod -Uri "$legacyBaseUrl/api/health" -TimeoutSec 1
            break
        } catch {}
    }
    if ($null -eq $protocolLegacyHealth -or [string]$protocolLegacyHealth.version -ne '2.3') {
        throw '协议升级所需的旧版服务模拟未正确启动。'
    }
    & $powershellExe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $protocolUpgradeScript
    if ($LASTEXITCODE -ne 0) { throw "协议启动脚本升级旧服务失败，退出代码：$LASTEXITCODE" }
    if (-not $protocolLegacyProcess.WaitForExit(5000)) { throw '协议启动脚本未关闭 2.3 旧服务。' }
    $protocolLaunchMarker = Join-Path $protocolUpgradeRoot 'protocol-started.marker'
    for ($attempt = 0; $attempt -lt 20 -and -not (Test-Path -LiteralPath $protocolLaunchMarker -PathType Leaf); $attempt++) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $protocolLaunchMarker -PathType Leaf)) {
        throw '协议启动脚本关闭旧服务后没有启动当前入口。'
    }

    $process = Start-Process -FilePath $powershellExe -ArgumentList @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
        '-File', ('"{0}"' -f $serverPath), '-Port', $TestPort, '-NoBrowser'
    ) -WindowStyle Hidden -PassThru

    $baseUrl = "http://127.0.0.1:$TestPort"
    $health = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 1
            break
        } catch {}
    }
    if ($null -eq $health -or $health.ok -ne $true) { throw '独立安装后的健康检查失败。' }
    if ($health.version -ne '2.4.0') { throw "服务版本不正确：$($health.version)" }
    if ($health.transport -ne 'tcp-loopback') { throw "本地监听方式不正确：$($health.transport)" }
    if ($health.requiresAdministrator -ne $false) { throw '本地服务不应要求管理员权限。' }
    if (@($health.features) -notcontains 'select-result-files') { throw '缺少批量导出的文件选择能力。' }
    if (@($health.features) -notcontains 'def-conversion') { throw '缺少批量转 DEF 能力。' }

    $headers = @{ Origin = 'https://ttmmss278-png.github.io' }
    $preflight = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/session" -Method Options -Headers @{
        Origin = $headers.Origin
        'Access-Control-Request-Method' = 'POST'
        'Access-Control-Request-Private-Network' = 'true'
    } -TimeoutSec 2
    if ([int]$preflight.StatusCode -ne 204 -or
        [string]$preflight.Headers['Access-Control-Allow-Origin'] -ne $headers.Origin -or
        [string]$preflight.Headers['Access-Control-Allow-Private-Network'] -ne 'true') {
        throw '浏览器跨域预检响应不正确。'
    }

    $untrustedStatus = 0
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/session" -Method Post -Headers @{ Origin = 'https://evil.example' } -Body '{}' -ContentType 'application/json' -TimeoutSec 2 | Out-Null
    } catch {
        if ($null -ne $_.Exception.Response) { $untrustedStatus = [int]$_.Exception.Response.StatusCode }
    }
    if ($untrustedStatus -ne 403) { throw '不受信任的网页来源没有被拒绝。' }

    $session = Invoke-RestMethod -Uri "$baseUrl/api/session" -Method Post -Headers $headers -TimeoutSec 2
    $headers['X-Pelton-Session'] = $session.token
    Invoke-RestMethod -Uri "$baseUrl/api/shutdown" -Method Post -Headers $headers -TimeoutSec 2 | Out-Null
    if (-not $process.WaitForExit(5000)) { throw '测试服务未能安全退出。' }

    Write-Host '本地服务包验证通过：' -ForegroundColor Green
    Write-Host "- 中文/空格路径安装：通过"
    Write-Host "- 当前用户协议注册及路径引号：通过"
    Write-Host "- BAT 从中文/空格路径经 cmd.exe 执行：通过"
    Write-Host "- 2.3 会话保护服务安全升级与端口释放：通过"
    Write-Host "- 网页协议启动器接管 2.3 旧服务：通过"
    Write-Host "- 无 dist、Node.js/npm 依赖：通过"
    Write-Host "- 用户态 127.0.0.1 TCP 监听（无 URL ACL）：通过"
    Write-Host "- 浏览器预检与 Origin 白名单：通过"
    Write-Host "- POST 批量导出能力：通过"
    Write-Host "- CFX 批量转 DEF 能力：通过"
    Write-Host "- 会话握手与安全关闭：通过"
} finally {
    if ($null -ne $process) {
        try {
            if (-not $process.HasExited) { $process.Kill() }
        } catch {}
    }
    if ($null -ne $legacyProcess) {
        try {
            if (-not $legacyProcess.HasExited) { $legacyProcess.Kill() }
        } catch {}
    }
    if ($null -ne $upgradeProcess) {
        try {
            if (-not $upgradeProcess.HasExited) { $upgradeProcess.Kill() }
        } catch {}
    }
    if ($null -ne $protocolLegacyProcess) {
        try {
            if (-not $protocolLegacyProcess.HasExited) { $protocolLegacyProcess.Kill() }
        } catch {}
    }

    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    $safePrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    if ($resolvedTestRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTestRoot) -like 'PeltonPackageTest-*' -and
        (Test-Path -LiteralPath $resolvedTestRoot -PathType Container)) {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
    if ($registryTestRoot -like 'HKCU:\Software\PeltonToolbox\PackageTests\*' -and
        (Test-Path -LiteralPath $registryTestRoot)) {
        Remove-Item -LiteralPath $registryTestRoot -Recurse -Force
    }
}
