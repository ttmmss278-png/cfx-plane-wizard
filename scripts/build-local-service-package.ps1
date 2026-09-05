param(
    [string]$Version = '2.4.0'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$downloadsRoot = Join-Path $repoRoot 'public\downloads'
$archiveName = 'Pelton-Toolbox-Local-Service-Windows.zip'
$archivePath = Join-Path $downloadsRoot $archiveName
$manifestPath = Join-Path $downloadsRoot 'local-service-manifest.json'
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$tempRoot = Join-Path $tempBase ('PeltonLocalServicePackage-' + [guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $tempRoot 'package'
$packageServiceRoot = Join-Path $packageRoot 'local-def-service'

$rootFiles = @(
    '安装并启动本地服务.bat',
    '启动本地服务.bat'
)
$serviceFiles = @(
    'install-local-service.ps1',
    'register-web-launcher.ps1',
    'protocol-launch.ps1',
    'server.ps1',
    'worker.ps1',
    '使用说明.txt'
)

function Assert-EmbeddedVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$VariableName
    )

    $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $match = [regex]::Match(
        $content,
        ('(?m)^\${0}\s*=\s*''([^'']+)''' -f [regex]::Escape($VariableName))
    )
    if (-not $match.Success) { throw "无法从 $Path 读取 $VariableName。" }
    if ($match.Groups[1].Value -ne $Version) {
        throw "版本不一致：$Path 中为 $($match.Groups[1].Value)，打包版本为 $Version。"
    }
}

try {
    Assert-EmbeddedVersion -Path (Join-Path $repoRoot 'local-def-service\server.ps1') -VariableName 'ServiceVersion'
    Assert-EmbeddedVersion -Path (Join-Path $repoRoot 'local-def-service\install-local-service.ps1') -VariableName 'ServiceVersion'
    Assert-EmbeddedVersion -Path (Join-Path $repoRoot 'local-def-service\protocol-launch.ps1') -VariableName 'serviceVersion'

    $appSourcePath = Join-Path $repoRoot 'src\App.tsx'
    $appSource = [System.IO.File]::ReadAllText($appSourcePath, [System.Text.Encoding]::UTF8)
    $downloadVersionMatch = [regex]::Match(
        $appSource,
        'Pelton-Toolbox-Local-Service-Windows\.zip\?v=([0-9]+\.[0-9]+\.[0-9]+)'
    )
    if (-not $downloadVersionMatch.Success) {
        throw "无法从 $appSourcePath 读取本地服务下载链接版本。"
    }
    if ($downloadVersionMatch.Groups[1].Value -ne $Version) {
        throw "版本不一致：$appSourcePath 下载链接为 $($downloadVersionMatch.Groups[1].Value)，打包版本为 $Version。"
    }

    New-Item -ItemType Directory -Path $downloadsRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $packageServiceRoot -Force | Out-Null

    foreach ($name in $rootFiles) {
        $source = Join-Path $repoRoot $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "缺少打包文件：$source" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $packageRoot $name)
    }
    foreach ($name in $serviceFiles) {
        $source = Join-Path (Join-Path $repoRoot 'local-def-service') $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "缺少打包文件：$source" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $packageServiceRoot $name)
    }

    $packageInfo = [ordered]@{
        name = 'Pelton Toolbox Local Service for Windows'
        version = $Version
        requiredOs = 'Windows 10/11'
        requiresAdministrator = $false
        requiresNode = $false
        features = @('select-result-files', 'def-conversion')
        entry = '安装并启动本地服务.bat'
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $packageRoot '版本.json'),
        ($packageInfo | ConvertTo-Json -Depth 4),
        (New-Object System.Text.UTF8Encoding($false))
    )

    $hashLines = Get-ChildItem -LiteralPath $packageRoot -File -Recurse |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
            '{0} *{1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
        }
    [System.IO.File]::WriteAllLines(
        (Join-Path $packageRoot 'SHA256SUMS.txt'),
        $hashLines,
        (New-Object System.Text.UTF8Encoding($false))
    )

    if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal

    $archive = Get-Item -LiteralPath $archivePath
    $manifest = [ordered]@{
        name = 'Pelton Toolbox Local Service for Windows'
        version = $Version
        downloadPath = "downloads/$archiveName"
        fileName = $archiveName
        size = [int64]$archive.Length
        sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
        features = @('select-result-files', 'def-conversion')
    }
    [System.IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 4),
        (New-Object System.Text.UTF8Encoding($false))
    )

    Write-Host "本地服务包已生成：$archivePath" -ForegroundColor Green
    Write-Host "SHA256：$($manifest.sha256)" -ForegroundColor Cyan
} finally {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $safePrefix = $tempBase + [System.IO.Path]::DirectorySeparatorChar
    if ($resolvedTempRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTempRoot) -like 'PeltonLocalServicePackage-*' -and
        (Test-Path -LiteralPath $resolvedTempRoot -PathType Container)) {
        Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
}
