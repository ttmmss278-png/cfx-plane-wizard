param(
    [int]$Port = 62356,
    [switch]$NoBrowser,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Root) 'dist'))
$IndexPath = Join-Path $WebRoot 'index.html'
$WorkerPath = Join-Path $Root 'worker.ps1'
$ErrorLog = Join-Path $Root 'server-error.log'
$ActiveUrlPath = Join-Path $Root 'active-service.url'
$AllowedWebOrigin = 'https://ttmmss278-png.github.io'
$ApiMethodMap = @{
    '/api/health' = @('GET')
    '/api/session' = @('POST')
    '/api/select-files' = @('POST')
    '/api/select-result-files' = @('POST')
    '/api/select-input-folder' = @('POST')
    '/api/select-output-folder' = @('POST')
    '/api/select-cfx' = @('POST')
    '/api/detect-cfx' = @('GET')
    '/api/start' = @('POST')
    '/api/status' = @('GET')
    '/api/stop' = @('POST')
    '/api/open-output' = @('POST')
    '/api/shutdown' = @('POST')
}

$script:Listener = $null
$script:WorkerProcess = $null
$script:CurrentJobDir = $null
$script:LastOutputDir = ''
$script:KeepRunning = $true
$script:ActivePrefix = ''
$script:SessionToken = ''

function New-SessionToken {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Test-SecureToken {
    param(
        [string]$Actual,
        [string]$Expected
    )
    if ([string]::IsNullOrWhiteSpace($Actual) -or [string]::IsNullOrWhiteSpace($Expected)) { return $false }
    $actualBytes = [System.Text.Encoding]::UTF8.GetBytes($Actual)
    $expectedBytes = [System.Text.Encoding]::UTF8.GetBytes($Expected)
    if ($actualBytes.Length -ne $expectedBytes.Length) { return $false }
    $difference = 0
    for ($i = 0; $i -lt $actualBytes.Length; $i++) {
        $difference = $difference -bor ($actualBytes[$i] -bxor $expectedBytes[$i])
    }
    return $difference -eq 0
}

function Write-ServerError {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    [System.IO.File]::AppendAllText($ErrorLog, "[$stamp] $Message`r`n", (New-Object System.Text.UTF8Encoding($false)))
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

function Resolve-CorsOrigin {
    param([string]$Origin)
    $origin = ([string]$Origin).Trim()
    if ([string]::IsNullOrWhiteSpace($origin)) { return '' }
    if ($origin -eq $AllowedWebOrigin) { return $origin }
    if ($origin -match '^https?://(127\.0\.0\.1|localhost)(:\d+)?$') { return $origin }
    return $null
}

function Get-CorsOrigin {
    param([System.Net.HttpListenerRequest]$Request)
    return Resolve-CorsOrigin -Origin ([string]$Request.Headers['Origin'])
}

function Set-CorsHeaders {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Origin,
        [string[]]$Methods = @('GET', 'POST')
    )
    if (-not [string]::IsNullOrWhiteSpace($Origin)) {
        $Response.Headers['Access-Control-Allow-Origin'] = $Origin
        $Response.Headers['Vary'] = 'Origin'
    }
    $Response.Headers['Access-Control-Allow-Methods'] = (($Methods + 'OPTIONS' | Select-Object -Unique) -join ', ')
    $Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Pelton-Session'
    $Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
    $Response.Headers['Access-Control-Max-Age'] = '600'
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

function Select-ResultFilesDialog {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = 'CFX results (*.res;*.trn;*.def;*.cst;*.bak)|*.res;*.trn;*.def;*.cst;*.bak|All files (*.*)|*.*'
    $dialog.Multiselect = $true
    $dialog.Title = '选择需要批量导出的 CFX 结果文件'
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

function Get-AllowedApiMethods {
    param([string]$Path)
    if (-not $ApiMethodMap.ContainsKey($Path)) { return @() }
    return @($ApiMethodMap[$Path])
}

function Test-ApiSession {
    param([System.Net.HttpListenerRequest]$Request)
    return Test-SecureToken -Actual ([string]$Request.Headers['X-Pelton-Session']) -Expected $script:SessionToken
}

function Invoke-SecuritySelfTest {
    $failures = New-Object System.Collections.Generic.List[string]
    $tokenA = New-SessionToken
    $tokenB = New-SessionToken

    if ($tokenA -notmatch '^[a-f0-9]{64}$') { $failures.Add('会话令牌格式不正确') }
    if ($tokenA -eq $tokenB) { $failures.Add('会话令牌没有随机变化') }
    if (-not (Test-SecureToken -Actual $tokenA -Expected $tokenA)) { $failures.Add('相同令牌校验失败') }
    if (Test-SecureToken -Actual $tokenA -Expected $tokenB) { $failures.Add('不同令牌被错误接受') }
    if ((Resolve-CorsOrigin -Origin $AllowedWebOrigin) -ne $AllowedWebOrigin) { $failures.Add('GitHub Pages 来源未被允许') }
    if ((Resolve-CorsOrigin -Origin 'http://127.0.0.1:5173') -ne 'http://127.0.0.1:5173') { $failures.Add('本机开发来源未被允许') }
    if ($null -ne (Resolve-CorsOrigin -Origin 'https://evil.example')) { $failures.Add('不受信任来源被错误接受') }

    foreach ($dialogPath in @('/api/select-files', '/api/select-result-files', '/api/select-input-folder', '/api/select-output-folder', '/api/select-cfx')) {
        $methods = @(Get-AllowedApiMethods -Path $dialogPath)
        if ($methods.Count -ne 1 -or $methods[0] -ne 'POST') { $failures.Add("文件对话框路由方法不安全：$dialogPath") }
    }
    foreach ($mutationPath in @('/api/start', '/api/stop', '/api/open-output', '/api/shutdown')) {
        $methods = @(Get-AllowedApiMethods -Path $mutationPath)
        if ($methods.Count -ne 1 -or $methods[0] -ne 'POST') { $failures.Add("状态变更路由方法不安全：$mutationPath") }
    }
    if ((@(Get-AllowedApiMethods -Path '/api/health'))[0] -ne 'GET') { $failures.Add('health 路由不再兼容 GET') }
    if ((@(Get-AllowedApiMethods -Path '/api/status'))[0] -ne 'GET') { $failures.Add('status 路由不再兼容 GET') }
    if ((@(Get-AllowedApiMethods -Path '/api/session'))[0] -ne 'POST') { $failures.Add('session 握手必须使用 POST') }

    if ($failures.Count -gt 0) { throw ('本地服务安全自测失败：' + ($failures -join '；')) }
    Write-Host '本地服务安全自测通过：Origin 白名单、路由方法白名单、随机会话令牌均正常。' -ForegroundColor Green
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

    $allowedMethods = @(Get-AllowedApiMethods -Path $path)
    if ($allowedMethods.Count -eq 0) {
        Send-Json -Response $response -Object @{ ok = $false; error = 'Unknown API' } -StatusCode 404
        return
    }

    $originHeader = [string]$request.Headers['Origin']
    $corsOrigin = Get-CorsOrigin -Request $request
    if ($null -eq $corsOrigin) {
        Send-Json -Response $response -Object @{ ok = $false; error = 'Origin not allowed' } -StatusCode 403
        return
    }
    if ([string]::IsNullOrWhiteSpace($originHeader) -and $path -ne '/api/health') {
        Send-Json -Response $response -Object @{ ok = $false; error = 'Origin header required' } -StatusCode 403
        return
    }
    Set-CorsHeaders -Response $response -Origin $corsOrigin -Methods $allowedMethods

    if ($request.HttpMethod -eq 'OPTIONS') {
        $requestedMethod = ([string]$request.Headers['Access-Control-Request-Method']).ToUpperInvariant()
        if ([string]::IsNullOrWhiteSpace($originHeader) -or $allowedMethods -notcontains $requestedMethod) {
            $response.Headers['Allow'] = ($allowedMethods -join ', ')
            Send-Json -Response $response -Object @{ ok = $false; error = 'Preflight method not allowed' } -StatusCode 405
            return
        }
        $response.StatusCode = 204
        $response.ContentLength64 = 0
        $response.OutputStream.Close()
        return
    }

    $method = $request.HttpMethod.ToUpperInvariant()
    if ($allowedMethods -notcontains $method) {
        $response.Headers['Allow'] = ($allowedMethods -join ', ')
        Send-Json -Response $response -Object @{ ok = $false; error = 'Method not allowed' } -StatusCode 405
        return
    }

    if ($path -notin @('/api/health', '/api/session') -and -not (Test-ApiSession -Request $request)) {
        Send-Json -Response $response -Object @{ ok = $false; error = 'Invalid or missing local session' } -StatusCode 401
        return
    }

    switch ($path) {
        '/api/health' {
            Send-Json -Response $response -Object @{
                ok = $true
                version = '2.3'
                pid = $PID
                sessionRequired = $true
                features = @('select-files', 'select-result-files', 'def-conversion', 'session-handshake')
            }
        }
        '/api/session' {
            Send-Json -Response $response -Object @{
                ok = $true
                token = $script:SessionToken
                version = '2.3'
            }
        }
        '/api/select-files' {
            $items = Select-FilesDialog
            Send-Json -Response $response -Object @{ ok = $true; items = @($items) }
        }
        '/api/select-result-files' {
            $items = Select-ResultFilesDialog
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
    }
}

try {
    if ($SelfTest) {
        Invoke-SecuritySelfTest
        exit 0
    }
    if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf)) { throw "缺少网页文件：$IndexPath" }
    if (-not (Test-Path -LiteralPath $WorkerPath -PathType Leaf)) { throw "缺少转换脚本：$WorkerPath" }

    if ($Port -le 0) { $Port = 62356 }
    $script:SessionToken = New-SessionToken
    $prefix = "http://127.0.0.1:$Port/"
    $script:Listener = New-Object System.Net.HttpListener
    $script:Listener.Prefixes.Add($prefix)
    $script:Listener.Start()
    $script:ActivePrefix = $prefix
    [System.IO.File]::WriteAllText($ActiveUrlPath, $prefix, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "本地网页服务已启动：$prefix" -ForegroundColor Green
    Write-Host '浏览器 API 已启用来源校验与本次启动会话保护。' -ForegroundColor Cyan
    Write-Host '请保持此窗口开启。网页中点击“退出工具”可安全关闭。' -ForegroundColor Yellow
    if (-not $NoBrowser) { Start-Process $prefix }

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
