param(
    [int]$Port = 62356,
    [switch]$NoBrowser,
    [switch]$SelfTest,
    [switch]$AllowDevelopmentOrigins
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
$OnlineFrontendUrl = 'https://ttmmss278-png.github.io/cfx-plane-wizard/'
$ServiceVersion = '2.4.0'
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
    $messageText = [string]$Message
    if ($messageText.Length -gt 8192) { $messageText = $messageText.Substring(0, 8192) + ' …[truncated]' }
    $entry = "[$stamp] $messageText`r`n"
    if (Test-Path -LiteralPath $ErrorLog -PathType Leaf) {
        $existingLength = (Get-Item -LiteralPath $ErrorLog).Length
        if ($existingLength + ([System.Text.Encoding]::UTF8.GetByteCount($entry)) -gt 2MB) { return }
    }
    [System.IO.File]::AppendAllText($ErrorLog, $entry, (New-Object System.Text.UTF8Encoding($false)))
}

function Throw-HttpProtocolError {
    param(
        [int]$StatusCode,
        [string]$Message
    )
    $exception = New-Object System.Exception -ArgumentList $Message
    $exception.Data['HttpStatusCode'] = $StatusCode
    throw $exception
}

function New-TcpHttpResponse {
    return [pscustomobject]@{
        StatusCode = 200
        ContentType = 'application/octet-stream'
        ContentLength64 = [int64]0
        Headers = (New-Object System.Collections.Specialized.NameValueCollection)
        OutputStream = (New-Object System.IO.MemoryStream)
        RedirectLocation = ''
    }
}

function Read-TcpHttpContext {
    param([System.Net.Sockets.TcpClient]$Client)

    $maxHeaderBytes = 64KB
    $maxBodyBytes = 16MB
    $headerTimeoutMs = 10000
    $bodyTimeoutMs = 30000
    $Client.ReceiveTimeout = $headerTimeoutMs
    $Client.SendTimeout = 10000
    $stream = $Client.GetStream()
    $headerBuffer = New-Object System.IO.MemoryStream
    $delimiter = @(13, 10, 13, 10)
    $delimiterIndex = 0
    $headerWatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        while ($delimiterIndex -lt $delimiter.Count) {
            $remaining = $headerTimeoutMs - [int]$headerWatch.ElapsedMilliseconds
            if ($remaining -le 0) { Throw-HttpProtocolError -StatusCode 408 -Message 'HTTP 请求头读取超时。' }
            $stream.ReadTimeout = [Math]::Max(1, $remaining)
            try {
                $value = $stream.ReadByte()
            } catch [System.IO.IOException] {
                Throw-HttpProtocolError -StatusCode 408 -Message 'HTTP 请求头读取超时。'
            }
            if ($value -lt 0) { Throw-HttpProtocolError -StatusCode 400 -Message '连接在 HTTP 请求头完成前已关闭。' }
            $headerBuffer.WriteByte([byte]$value)
            if ($headerBuffer.Length -gt $maxHeaderBytes) { Throw-HttpProtocolError -StatusCode 431 -Message 'HTTP 请求头超过 64 KB 限制。' }

            if ($value -eq $delimiter[$delimiterIndex]) {
                $delimiterIndex++
            } elseif ($value -eq $delimiter[0]) {
                $delimiterIndex = 1
            } else {
                $delimiterIndex = 0
            }
        }

        $headerBytes = $headerBuffer.ToArray()
    } finally {
        $headerWatch.Stop()
        $headerBuffer.Dispose()
    }

    $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes, 0, $headerBytes.Length - 4)
    $headerLines = @($headerText -split "`r`n")
    if ($headerLines.Count -lt 1 -or $headerLines[0] -notmatch '^([A-Z]+)\s+(\S+)\s+HTTP/1\.[01]$') {
        Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求行无效。'
    }
    $method = $matches[1].ToUpperInvariant()
    $requestTarget = $matches[2]

    $headers = New-Object System.Collections.Specialized.NameValueCollection
    for ($index = 1; $index -lt $headerLines.Count; $index++) {
        $line = $headerLines[$index]
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.StartsWith(' ') -or $line.StartsWith("`t")) { Throw-HttpProtocolError -StatusCode 400 -Message '不支持折叠 HTTP 请求头。' }
        $separator = $line.IndexOf(':')
        if ($separator -le 0) { Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求头格式无效。' }
        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($name -notmatch '^[A-Za-z0-9-]+$') { Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求头名称无效。' }
        if ($value -match '[^\x09\x20-\x7e]') { Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求头值包含非法控制字符。' }
        if ($null -ne $headers[$name]) {
            if ($name -ieq 'Content-Length' -and $headers[$name] -ne $value) {
                Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求包含冲突的 Content-Length。'
            }
            if ($name -ieq 'Content-Length') { continue }
            $headers[$name] = $headers[$name] + ', ' + $value
        } else {
            $headers[$name] = $value
        }
    }

    if (-not [string]::IsNullOrWhiteSpace([string]$headers['Transfer-Encoding'])) {
        Throw-HttpProtocolError -StatusCode 501 -Message '不支持 Transfer-Encoding 请求。'
    }
    [long]$contentLength = 0
    if (-not [string]::IsNullOrWhiteSpace([string]$headers['Content-Length'])) {
        if ([string]$headers['Content-Length'] -notmatch '^[0-9]+$' -or
            -not [long]::TryParse([string]$headers['Content-Length'], [ref]$contentLength)) {
            Throw-HttpProtocolError -StatusCode 400 -Message 'Content-Length 无效。'
        }
    }
    if ($contentLength -gt $maxBodyBytes) { Throw-HttpProtocolError -StatusCode 413 -Message 'HTTP 请求正文超过 16 MB 限制。' }

    if (-not $requestTarget.StartsWith('/')) { Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP 请求目标必须使用本机相对路径。' }
    $expectedHosts = @("127.0.0.1:$Port", "localhost:$Port")
    if ([string]::IsNullOrWhiteSpace([string]$headers['Host']) -or $expectedHosts -notcontains [string]$headers['Host']) {
        Throw-HttpProtocolError -StatusCode 400 -Message 'HTTP Host 与本地服务地址不匹配。'
    }
    $requestUri = [System.Uri]("http://127.0.0.1:$Port$requestTarget")

    $bodyBytes = New-Object byte[] ([int]$contentLength)
    $offset = 0
    $bodyWatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($offset -lt $bodyBytes.Length) {
        $remaining = $bodyTimeoutMs - [int]$bodyWatch.ElapsedMilliseconds
        if ($remaining -le 0) { Throw-HttpProtocolError -StatusCode 408 -Message 'HTTP 请求正文读取超时。' }
        $stream.ReadTimeout = [Math]::Max(1, $remaining)
        try {
            $read = $stream.Read($bodyBytes, $offset, $bodyBytes.Length - $offset)
        } catch [System.IO.IOException] {
            Throw-HttpProtocolError -StatusCode 408 -Message 'HTTP 请求正文读取超时。'
        }
        if ($read -le 0) { Throw-HttpProtocolError -StatusCode 400 -Message '连接在 HTTP 请求正文完成前已关闭。' }
        $offset += $read
    }
    $bodyWatch.Stop()
    $inputStream = New-Object System.IO.MemoryStream
    if ($bodyBytes.Length -gt 0) { $inputStream.Write($bodyBytes, 0, $bodyBytes.Length) }
    $inputStream.Position = 0

    $request = [pscustomobject]@{
        HttpMethod = $method
        Url = $requestUri
        Headers = $headers
        ContentEncoding = [System.Text.Encoding]::UTF8
        InputStream = $inputStream
    }
    return [pscustomobject]@{
        Request = $request
        Response = (New-TcpHttpResponse)
    }
}

function Get-HttpReasonPhrase {
    param([int]$StatusCode)
    switch ($StatusCode) {
        200 { return 'OK' }
        204 { return 'No Content' }
        302 { return 'Found' }
        400 { return 'Bad Request' }
        401 { return 'Unauthorized' }
        403 { return 'Forbidden' }
        404 { return 'Not Found' }
        405 { return 'Method Not Allowed' }
        408 { return 'Request Timeout' }
        413 { return 'Payload Too Large' }
        431 { return 'Request Header Fields Too Large' }
        500 { return 'Internal Server Error' }
        501 { return 'Not Implemented' }
        default { return 'OK' }
    }
}

function Write-TcpHttpResponse {
    param(
        [System.Net.Sockets.TcpClient]$Client,
        $Response
    )

    $bodyBytes = $Response.OutputStream.ToArray()
    if ([int]$Response.StatusCode -eq 204) { $bodyBytes = New-Object byte[] 0 }
    $Response.ContentLength64 = [int64]$bodyBytes.Length

    $builder = New-Object System.Text.StringBuilder
    $reason = Get-HttpReasonPhrase -StatusCode ([int]$Response.StatusCode)
    [void]$builder.Append("HTTP/1.1 $($Response.StatusCode) $reason`r`n")
    if (-not [string]::IsNullOrWhiteSpace([string]$Response.RedirectLocation)) {
        $Response.Headers['Location'] = [string]$Response.RedirectLocation
    }
    if ([int]$Response.StatusCode -ne 204 -and -not [string]::IsNullOrWhiteSpace([string]$Response.ContentType)) {
        [void]$builder.Append("Content-Type: $($Response.ContentType)`r`n")
    }
    foreach ($key in $Response.Headers.AllKeys) {
        $value = [string]$Response.Headers[$key]
        if ($key -notin @('Content-Length', 'Content-Type', 'Connection', 'Date', 'X-Content-Type-Options') -and
            $key -match '^[A-Za-z0-9-]+$' -and $value -notmatch '[\r\n]') {
            [void]$builder.Append("$key`: $value`r`n")
        }
    }
    [void]$builder.Append("Date: $([DateTime]::UtcNow.ToString('R'))`r`n")
    [void]$builder.Append("X-Content-Type-Options: nosniff`r`n")
    [void]$builder.Append("Content-Length: $($bodyBytes.Length)`r`n")
    [void]$builder.Append("Connection: close`r`n`r`n")

    $stream = $Client.GetStream()
    $responseHead = [System.Text.Encoding]::ASCII.GetBytes($builder.ToString())
    $stream.Write($responseHead, 0, $responseHead.Length)
    if ($bodyBytes.Length -gt 0) { $stream.Write($bodyBytes, 0, $bodyBytes.Length) }
    $stream.Flush()
}

function Write-TcpProtocolError {
    param(
        [System.Net.Sockets.TcpClient]$Client,
        [string]$Message,
        [int]$StatusCode = 400
    )
    $response = New-TcpHttpResponse
    try {
        Send-Json -Response $response -Object @{ ok = $false; error = $Message } -StatusCode $StatusCode
        Write-TcpHttpResponse -Client $Client -Response $response
    } finally {
        try { $response.OutputStream.Dispose() } catch {}
    }
}

function Send-Bytes {
    param(
        $Response,
        [byte[]]$Bytes,
        [string]$ContentType,
        [int]$StatusCode = 200
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.Headers['Cache-Control'] = 'no-store'
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

function Resolve-CorsOrigin {
    param([string]$Origin)
    $origin = ([string]$Origin).Trim()
    if ([string]::IsNullOrWhiteSpace($origin)) { return '' }
    if ($origin -eq $AllowedWebOrigin) { return $origin }
    if ($origin -in @("http://127.0.0.1:$Port", "http://localhost:$Port")) { return $origin }
    if ($AllowDevelopmentOrigins -and $origin -match '^https?://(127\.0\.0\.1|localhost)(:\d+)?$') { return $origin }
    return $null
}

function Get-CorsOrigin {
    param($Request)
    return Resolve-CorsOrigin -Origin ([string]$Request.Headers['Origin'])
}

function Set-CorsHeaders {
    param(
        $Response,
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
        $Response,
        [string]$Text,
        [string]$ContentType = 'text/plain; charset=utf-8',
        [int]$StatusCode = 200
    )
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Bytes -Response $Response -Bytes $bytes -ContentType $ContentType -StatusCode $StatusCode
}

function Send-Json {
    param(
        $Response,
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
        $Response,
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
    param($Request)
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
    if ([System.IO.Path]::GetFileName($dialog.FileName) -ine 'cfx5pre.exe') {
        throw '只能选择 ANSYS CFX-Pre 的 cfx5pre.exe。'
    }
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
    if ([System.IO.Path]::GetFileName([string]$Payload.cfxPath) -ine 'cfx5pre.exe') { throw '只允许调用 cfx5pre.exe。' }
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
    param($Request)
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
    if ((Resolve-CorsOrigin -Origin "http://127.0.0.1:$Port") -ne "http://127.0.0.1:$Port") { $failures.Add('本地同源界面未被允许') }
    if ($AllowDevelopmentOrigins) {
        if ((Resolve-CorsOrigin -Origin 'http://127.0.0.1:5173') -ne 'http://127.0.0.1:5173') { $failures.Add('显式启用的本机开发来源未被允许') }
    } elseif ($null -ne (Resolve-CorsOrigin -Origin 'http://127.0.0.1:5173')) {
        $failures.Add('未显式启用的本机开发来源被错误允许')
    }
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
    param($Context)
    $request = $Context.Request
    $response = $Context.Response
    $path = $request.Url.AbsolutePath

    if ($path -notlike '/api/*') {
        if (Test-Path -LiteralPath $IndexPath -PathType Leaf) {
            Send-StaticFile -Response $response -RequestPath $path
        } else {
            $response.StatusCode = 302
            $response.RedirectLocation = $OnlineFrontendUrl
            $response.ContentLength64 = 0
        }
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
                version = $ServiceVersion
                mode = 'github-frontend'
                transport = 'tcp-loopback'
                requiresAdministrator = $false
                pid = $PID
                sessionRequired = $true
                features = @('select-files', 'select-result-files', 'def-conversion', 'session-handshake')
            }
        }
        '/api/session' {
            Send-Json -Response $response -Object @{
                ok = $true
                token = $script:SessionToken
                version = $ServiceVersion
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
    if (-not (Test-Path -LiteralPath $WorkerPath -PathType Leaf)) { throw "缺少转换脚本：$WorkerPath" }

    if (-not (Test-Path -LiteralPath $IndexPath -PathType Leaf) -and -not $NoBrowser) {
        Write-Host '未包含离线网页，将使用 GitHub Pages 最新界面。' -ForegroundColor Cyan
        $NoBrowser = $true
    }

    if ($Port -le 0) { $Port = 62356 }
    $script:SessionToken = New-SessionToken
    $prefix = "http://127.0.0.1:$Port/"
    $script:Listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, $Port)
    $script:Listener.Start()
    $script:ActivePrefix = $prefix
    [System.IO.File]::WriteAllText($ActiveUrlPath, $prefix, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "本地服务已启动：$prefix" -ForegroundColor Green
    Write-Host '仅监听 127.0.0.1，无需管理员权限或 HTTP URL 预留。' -ForegroundColor DarkCyan
    Write-Host '浏览器 API 已启用来源校验与本次启动会话保护。' -ForegroundColor Cyan
    Write-Host '请保持此窗口开启。网页中点击“退出工具”可安全关闭。' -ForegroundColor Yellow
    if (-not $NoBrowser) { Start-Process $prefix }

    while ($script:KeepRunning) {
        $client = $null
        $context = $null
        try {
            $client = $script:Listener.AcceptTcpClient()
            $context = Read-TcpHttpContext -Client $client
            try {
                Handle-Request -Context $context
            } catch {
                Write-ServerError $_.Exception.ToString()
                try { Send-Json -Response $context.Response -Object @{ ok = $false; error = $_.Exception.Message } -StatusCode 500 } catch {}
            }
            Write-TcpHttpResponse -Client $client -Response $context.Response
        } catch {
            if ($null -eq $client) { throw }
            if ($null -eq $context) {
                $protocolStatus = 400
                if ($null -ne $_.Exception.Data['HttpStatusCode']) {
                    $protocolStatus = [int]$_.Exception.Data['HttpStatusCode']
                }
                try {
                    Write-TcpProtocolError -Client $client -Message $_.Exception.Message -StatusCode $protocolStatus
                } catch {}
            } else {
                Write-ServerError $_.Exception.ToString()
            }
        } finally {
            try { if ($null -ne $context) { $context.Request.InputStream.Dispose() } } catch {}
            try { if ($null -ne $context) { $context.Response.OutputStream.Dispose() } } catch {}
            try { if ($null -ne $client) { $client.Close() } } catch {}
        }
    }
} catch {
    Write-ServerError $_.Exception.ToString()
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    try { Stop-Worker } catch {}
    try { if ($null -ne $script:Listener) { $script:Listener.Stop() } } catch {}
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
