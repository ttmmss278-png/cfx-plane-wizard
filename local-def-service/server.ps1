param(
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Root) 'dist'))
$IndexPath = Join-Path $WebRoot 'index.html'
$WorkerPath = Join-Path $Root 'worker.ps1'
$ErrorLog = Join-Path $Root 'server-error.log'
$ActiveUrlPath = Join-Path $Root 'active-service.url'
$Token = [Guid]::NewGuid().ToString('N')

$script:Listener = $null
$script:WorkerProcess = $null
$script:CurrentJobDir = $null
$script:LastOutputDir = ''
$script:KeepRunning = $true
$script:ActivePrefix = ''

function Write-ServerError {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    [System.IO.File]::AppendAllText($ErrorLog, "[$stamp] $Message`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Get-FreePort {
    $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $probe.Start()
    $p = ([System.Net.IPEndPoint]$probe.LocalEndpoint).Port
    $probe.Stop()
    return $p
}

function Send-Bytes {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [byte[]]$Bytes,
        [string]$ContentType,
        [int]$StatusCode = 200
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.Headers['Cache-Control'] = 'no-store'
    try { $Response.OutputStream.Write($Bytes, 0, $Bytes.Length) } finally { $Response.OutputStream.Close() }
}

function Send-Text {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Text,
        [string]$ContentType = 'text/plain; charset=utf-8',
        [int]$StatusCode = 200
    )
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Bytes -Response $Response -Bytes $bytes -ContentType $ContentType -StatusCode $StatusCode
}

function Send-Json {
    param(
        [System.Net.HttpListenerResponse]$Response,
        $Object,
        [int]$StatusCode = 200
    )
    $json = $Object | ConvertTo-Json -Depth 12 -Compress
    Send-Text -Response $Response -Text $json -ContentType 'application/json; charset=utf-8' -StatusCode $StatusCode
}

function Get-ContentType {
    param([string]$Path)
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.js' { return 'text/javascript; charset=utf-8' }
        '.mjs' { return 'text/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.txt' { return 'text/plain; charset=utf-8' }
        '.xml' { return 'application/xml; charset=utf-8' }
        '.svg' { return 'image/svg+xml' }
        '.png' { return 'image/png' }
        '.jpg' { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif' { return 'image/gif' }
        '.webp' { return 'image/webp' }
        '.ico' { return 'image/x-icon' }
        '.woff' { return 'font/woff' }
        '.woff2' { return 'font/woff2' }
        '.map' { return 'application/json; charset=utf-8' }
        default { return 'application/octet-stream' }
    }
}

function Send-StaticFile {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$RequestPath
    )

    $relative = [System.Uri]::UnescapeDataString($RequestPath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $relative))
    $rootPrefix = $WebRoot.TrimEnd('\') + '\'
    if ($candidate -ne $WebRoot -and -not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Json -Response $Response -Object @{ ok = $false; error = 'Forbidden path' } -StatusCode 403
        return
    }
    if (Test-Path -LiteralPath $candidate -PathType Container) {
        $candidate = Join-Path $candidate 'index.html'
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        Send-Json -Response $Response -Object @{ ok = $false; error = 'Not found' } -StatusCode 404
        return
    }

    $contentType = Get-ContentType -Path $candidate
    if ($candidate.EndsWith('.html', [System.StringComparison]::OrdinalIgnoreCase)) {
        $html = [System.IO.File]::ReadAllText($candidate, [System.Text.Encoding]::UTF8)
        if ($candidate -like '*\modules\def-converter\index.html') {
            $html = $html.Replace('__CFX_TOKEN__', $Token)
        }
        Send-Text -Response $Response -Text $html -ContentType $contentType
        return
    }
    Send-Bytes -Response $Response -Bytes ([System.IO.File]::ReadAllBytes($candidate)) -ContentType $contentType
}

function Read-JsonBody {
    param([System.Net.HttpListenerRequest]$Request)
    $encoding = $Request.ContentEncoding
    if ($null -eq $encoding) { $encoding = [System.Text.Encoding]::UTF8 }
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $encoding)
    try { $body = $reader.ReadToEnd() } finally { $reader.Close() }
    if ([string]::IsNullOrWhiteSpace($body)) { return $null }
    return ($body | ConvertFrom-Json)
}

function Test-ApiToken {
    param([System.Net.HttpListenerRequest]$Request)
    return ($Request.Headers['X-CFX-Token'] -eq $Token)
}

function Select-FilesDialog {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = 'CFX Case (*.cfx)|*.cfx|All files (*.*)|*.*'
    $dialog.Multiselect = $true
    $dialog.Title = '选择需要转换的 CFX 文件'
    $dialog.RestoreDirectory = $true
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { return @() }
    $items = @()
    foreach ($path in $dialog.FileNames) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $fi = Get-Item -LiteralPath $path
            $items += [pscustomobject]@{
                path = $fi.FullName
                name = $fi.Name
                size = [int64]$fi.Length
            }
        }
    }
    return $items
}

function Select-FolderDialog {
    param([string]$Description)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $true
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { return '' }
    return $dialog.SelectedPath
}

function Select-CfxExeDialog {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = 'CFX-Pre executable (cfx5pre.exe)|cfx5pre.exe|Executable (*.exe)|*.exe'
    $dialog.Multiselect = $false
    $dialog.Title = '选择 cfx5pre.exe'
    $dialog.RestoreDirectory = $true
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { return '' }
    return $dialog.FileName
}

function Get-CfxVersionNumber {
    param([string]$Path)
    $m = [regex]::Match($Path, '[\\/]v(\d{3,4})[\\/]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $m.Success) { return 0 }
    return [int]$m.Groups[1].Value
}

function Find-CfxExecutables {
    $found = New-Object System.Collections.Generic.List[string]

    foreach ($envItem in Get-ChildItem Env:AWP_ROOT* -ErrorAction SilentlyContinue) {
        $candidate = Join-Path $envItem.Value 'CFX\bin\cfx5pre.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $found.Add((Get-Item -LiteralPath $candidate).FullName) }
    }

    $drives = @('C','D','E','F','G')
    $bases = @('Program Files\ANSYS Inc','ANSYS Inc','Ansys\ANSYS Inc','Ansys Inc')
    foreach ($drive in $drives) {
        foreach ($baseSuffix in $bases) {
            $base = "$drive`:\$baseSuffix"
            if (-not (Test-Path -LiteralPath $base -PathType Container)) { continue }
            Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^v\d+$' } | ForEach-Object {
                $candidate = Join-Path $_.FullName 'CFX\bin\cfx5pre.exe'
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $found.Add((Get-Item -LiteralPath $candidate).FullName) }
            }
        }
    }

    $unique = $found | Sort-Object -Unique
    $result = @()
    foreach ($path in $unique) {
        $result += [pscustomobject]@{
            path = $path
            version = (Get-CfxVersionNumber -Path $path)
        }
    }
    return @($result | Sort-Object version -Descending)
}

function Read-Progress {
    if ([string]::IsNullOrWhiteSpace($script:CurrentJobDir)) {
        return [pscustomobject]@{ running = $false; phase = 'idle'; items = @(); logTail = ''; workerAlive = $false }
    }

    $progressPath = Join-Path $script:CurrentJobDir 'progress.json'
    $progress = $null
    if (Test-Path -LiteralPath $progressPath -PathType Leaf) {
        for ($i = 0; $i -lt 3; $i++) {
            try {
                $raw = [System.IO.File]::ReadAllText($progressPath, [System.Text.Encoding]::UTF8)
                if (-not [string]::IsNullOrWhiteSpace($raw)) { $progress = $raw | ConvertFrom-Json }
                break
            } catch {
                Start-Sleep -Milliseconds 50
            }
        }
    }

    if ($null -eq $progress) {
        $progress = [pscustomobject]@{ running = $true; phase = 'starting'; message = '正在启动转换进程'; items = @() }
    }

    $alive = $false
    if ($null -ne $script:WorkerProcess) {
        try { $alive = -not $script:WorkerProcess.HasExited } catch { $alive = $false }
    }
    $progress | Add-Member -NotePropertyName workerAlive -NotePropertyValue $alive -Force

    $logPath = Join-Path $script:CurrentJobDir 'worker.log'
    $tail = ''
    if (Test-Path -LiteralPath $logPath -PathType Leaf) {
        try { $tail = (Get-Content -LiteralPath $logPath -Tail 250 -ErrorAction Stop) -join "`r`n" } catch { $tail = '' }
    }
    $progress | Add-Member -NotePropertyName logTail -NotePropertyValue $tail -Force
    return $progress
}

function Mark-ProgressStopped {
    if ([string]::IsNullOrWhiteSpace($script:CurrentJobDir)) { return }
    $path = Join-Path $script:CurrentJobDir 'progress.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }
    try {
        $obj = ([System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
        $obj.running = $false
        $obj.phase = 'stopped'
        $obj.message = '任务已由用户停止'
        foreach ($item in @($obj.items)) {
            if ($item.status -eq 'running') {
                $item.status = 'stopped'
                $item.message = '已停止'
            }
        }
        $json = $obj | ConvertTo-Json -Depth 12
        [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
    } catch {}
}

function Stop-Worker {
    if ($null -eq $script:WorkerProcess) { return }
    try {
        if (-not $script:WorkerProcess.HasExited) {
            & taskkill.exe /PID $script:WorkerProcess.Id /T /F | Out-Null
            $script:WorkerProcess.WaitForExit(5000) | Out-Null
        }
    } catch {}
    Mark-ProgressStopped
}

function Start-Worker {
    param($Payload)

    if ($null -ne $script:WorkerProcess) {
        try {
            if (-not $script:WorkerProcess.HasExited) { throw '当前已有转换任务正在运行。' }
        } catch [System.InvalidOperationException] {}
    }

    if ($null -eq $Payload) { throw '请求参数为空。' }
    if (-not (Test-Path -LiteralPath $Payload.cfxPath -PathType Leaf)) { throw 'cfx5pre.exe 路径无效。' }
    if (-not (Test-Path -LiteralPath $Payload.outputDir -PathType Container)) { throw '输出目录无效。' }

    $validFiles = @()
    foreach ($path in @($Payload.files)) {
        if ((Test-Path -LiteralPath $path -PathType Leaf) -and ([System.IO.Path]::GetExtension($path) -ieq '.cfx')) {
            $validFiles += (Get-Item -LiteralPath $path).FullName
        }
    }
    if ($validFiles.Count -eq 0) { throw '没有有效的 .cfx 文件。' }

    $jobRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'CFXDefWebJobs'
    if (-not (Test-Path -LiteralPath $jobRoot -PathType Container)) { New-Item -ItemType Directory -Path $jobRoot -Force | Out-Null }
    $jobDir = Join-Path $jobRoot (Get-Date -Format 'yyyyMMdd_HHmmss_fff')
    New-Item -ItemType Directory -Path $jobDir -Force | Out-Null

    $config = [ordered]@{
        files = $validFiles
        outputDir = (Get-Item -LiteralPath $Payload.outputDir).FullName
        cfxPath = (Get-Item -LiteralPath $Payload.cfxPath).FullName
        conflictMode = [string]$Payload.conflictMode
        continueOnError = [bool]$Payload.continueOnError
        keepTemp = [bool]$Payload.keepTemp
        jobDir = $jobDir
    }
    $configPath = Join-Path $jobDir 'config.json'
    $configJson = $config | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($configPath, $configJson, (New-Object System.Text.UTF8Encoding($false)))

    $psExe = Join-Path $PSHOME 'powershell.exe'
    $argLine = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$WorkerPath`" -ConfigPath `"$configPath`""
    $script:WorkerProcess = Start-Process -FilePath $psExe -ArgumentList $argLine -WindowStyle Hidden -PassThru
    $script:CurrentJobDir = $jobDir
    $script:LastOutputDir = $config.outputDir

    return [pscustomobject]@{ ok = $true; jobDir = $jobDir; pid = $script:WorkerProcess.Id }
}

function Handle-Request {
    param([System.Net.HttpListenerContext]$Context)
    $request = $Context.Request
    $response = $Context.Response
    $path = $request.Url.AbsolutePath

    if ($path -notlike '/api/*') {
        Send-StaticFile -Response $response -RequestPath $path
        return
    }
    if (-not (Test-ApiToken -Request $request)) {
        Send-Json -Response $response -Object @{ ok = $false; error = 'Forbidden' } -StatusCode 403
        return
    }

    switch ($path) {
        '/api/health' {
            Send-Json -Response $response -Object @{ ok = $true; version = '2.0'; pid = $PID }
        }
        '/api/select-files' {
            $items = Select-FilesDialog
            Send-Json -Response $response -Object @{ ok = $true; items = @($items) }
        }
        '/api/select-input-folder' {
            $folder = Select-FolderDialog -Description '选择需要递归扫描的 CFX 文件夹'
            $items = @()
            if (-not [string]::IsNullOrWhiteSpace($folder)) {
                Get-ChildItem -LiteralPath $folder -Filter '*.cfx' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                    $items += [pscustomobject]@{ path = $_.FullName; name = $_.Name; size = [int64]$_.Length }
                }
            }
            Send-Json -Response $response -Object @{ ok = $true; folder = $folder; items = @($items) }
        }
        '/api/select-output-folder' {
            $folder = Select-FolderDialog -Description '选择 DEF 文件输出目录'
            Send-Json -Response $response -Object @{ ok = $true; path = $folder }
        }
        '/api/select-cfx' {
            $pathValue = Select-CfxExeDialog
            Send-Json -Response $response -Object @{ ok = $true; path = $pathValue }
        }
        '/api/detect-cfx' {
            $items = Find-CfxExecutables
            Send-Json -Response $response -Object @{ ok = $true; items = @($items) }
        }
        '/api/start' {
            $payload = Read-JsonBody -Request $request
            $result = Start-Worker -Payload $payload
            Send-Json -Response $response -Object $result
        }
        '/api/status' {
            $status = Read-Progress
            Send-Json -Response $response -Object $status
        }
        '/api/stop' {
            Stop-Worker
            Send-Json -Response $response -Object @{ ok = $true }
        }
        '/api/open-output' {
            $payload = Read-JsonBody -Request $request
            $folder = ''
            if ($null -ne $payload -and -not [string]::IsNullOrWhiteSpace([string]$payload.path)) { $folder = [string]$payload.path }
            if ([string]::IsNullOrWhiteSpace($folder)) { $folder = $script:LastOutputDir }
            if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw '输出目录无效。' }
            Start-Process explorer.exe -ArgumentList ('"' + $folder + '"')
            Send-Json -Response $response -Object @{ ok = $true }
        }
        '/api/shutdown' {
            Stop-Worker
            Send-Json -Response $response -Object @{ ok = $true }
            $script:KeepRunning = $false
        }
        default {
            Send-Json -Response $response -Object @{ ok = $false; error = 'Unknown API' } -StatusCode 404
        }
    }
}

try {
    if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf)) { throw "缺少网页文件：$IndexPath" }
    if (-not (Test-Path -LiteralPath $WorkerPath -PathType Leaf)) { throw "缺少转换脚本：$WorkerPath" }

    if ($Port -le 0) { $Port = Get-FreePort }
    $prefix = "http://127.0.0.1:$Port/"
    $script:Listener = New-Object System.Net.HttpListener
    $script:Listener.Prefixes.Add($prefix)
    $script:Listener.Start()
    $script:ActivePrefix = $prefix
    [System.IO.File]::WriteAllText($ActiveUrlPath, $prefix, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "本地网页服务已启动：$prefix" -ForegroundColor Green
    Write-Host '请保持此窗口开启。网页中点击“退出工具”可安全关闭。' -ForegroundColor Yellow
    Start-Process $prefix

    while ($script:KeepRunning -and $script:Listener.IsListening) {
        try {
            $context = $script:Listener.GetContext()
            try {
                Handle-Request -Context $context
            } catch {
                Write-ServerError $_.Exception.ToString()
                try { Send-Json -Response $context.Response -Object @{ ok = $false; error = $_.Exception.Message } -StatusCode 500 } catch {}
            }
        } catch {
            if ($script:KeepRunning) { throw }
        }
    }
} catch {
    Write-ServerError $_.Exception.ToString()
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    try { Stop-Worker } catch {}
    try { if ($null -ne $script:Listener -and $script:Listener.IsListening) { $script:Listener.Stop() } } catch {}
    try { if ($null -ne $script:Listener) { $script:Listener.Close() } } catch {}
    try {
        if (Test-Path -LiteralPath $ActiveUrlPath -PathType Leaf) {
            $recordedPrefix = [System.IO.File]::ReadAllText($ActiveUrlPath, [System.Text.Encoding]::UTF8).Trim()
            if ($recordedPrefix -eq $script:ActivePrefix) {
                Remove-Item -LiteralPath $ActiveUrlPath -Force
            }
        }
    } catch {}
}

exit 0
