param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

$configRaw = [System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8)
$config = $configRaw | ConvertFrom-Json
$jobDir = [string]$config.jobDir
$progressPath = Join-Path $jobDir 'progress.json'
$logPath = Join-Path $jobDir 'worker.log'

$script:Progress = $null

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    [System.IO.File]::AppendAllText($logPath, $line + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Save-Progress {
    $script:Progress.updatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $json = $script:Progress | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($progressPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-VersionString {
    param([string]$CfxPath)
    $m = [regex]::Match($CfxPath, '[\\/]v(\d{3,4})[\\/]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $m.Success) { return '25.1' }
    $raw = $m.Groups[1].Value
    if ($raw.Length -eq 3) { return ([int]$raw.Substring(0, 2)).ToString() + '.' + $raw.Substring(2, 1) }
    if ($raw.Length -eq 4) { return ([int]$raw.Substring(0, 3)).ToString() + '.' + $raw.Substring(3, 1) }
    return '25.1'
}

function To-CfxPath {
    param([string]$Path)
    return $Path.Replace('\', '/')
}

function Resolve-Target {
    param([string]$SourceName)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($SourceName)
    $target = Join-Path ([string]$config.outputDir) ($base + '.def')
    $mode = [string]$config.conflictMode
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { return [pscustomobject]@{ path = $target; skip = $false } }
    if ($mode -eq 'skip') { return [pscustomobject]@{ path = $target; skip = $true } }
    if ($mode -eq 'overwrite') {
        Remove-Item -LiteralPath $target -Force -ErrorAction Stop
        return [pscustomobject]@{ path = $target; skip = $false }
    }
    $n = 1
    while (Test-Path -LiteralPath $target -PathType Leaf) {
        $target = Join-Path ([string]$config.outputDir) ("$base ($n).def")
        $n++
    }
    return [pscustomobject]@{ path = $target; skip = $false }
}

function New-SessionFile {
    param(
        [string]$Path,
        [string]$InputPath,
        [string]$OutputPath,
        [string]$Operation
    )
    $version = Get-VersionString -CfxPath ([string]$config.cfxPath)
    $content = @(
        'COMMAND FILE:'
        "CFX Pre Version = $version"
        'END'
        ('>load filename=' + (To-CfxPath $InputPath) + ', mode=cfx, overwrite=yes')
        '> update'
        ('>writeCaseFile filename=' + (To-CfxPath $OutputPath) + ', operation=' + $Operation + ', summary=off')
        '> update'
        '> update'
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($Path, $content + "`r`n", [System.Text.Encoding]::ASCII)
}

function Run-CfxPre {
    param(
        [string]$SessionPath,
        [string]$StdoutPath,
        [string]$StderrPath
    )
    $args = "-batch `"$SessionPath`" -verbose"
    $process = Start-Process -FilePath ([string]$config.cfxPath) -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    $process.WaitForExit()
    return $process.ExitCode
}

function Read-CombinedLog {
    param([string]$StdoutPath, [string]$StderrPath)
    $parts = @()
    if (Test-Path -LiteralPath $StdoutPath -PathType Leaf) {
        try { $parts += [System.IO.File]::ReadAllText($StdoutPath, [System.Text.Encoding]::Default) } catch {}
    }
    if (Test-Path -LiteralPath $StderrPath -PathType Leaf) {
        try { $parts += [System.IO.File]::ReadAllText($StderrPath, [System.Text.Encoding]::Default) } catch {}
    }
    $text = $parts -join "`r`n"
    if ($text.Length -gt 160000) { $text = $text.Substring($text.Length - 160000) }
    return $text
}

$items = @()
foreach ($source in @($config.files)) {
    $fi = Get-Item -LiteralPath ([string]$source)
    $items += [pscustomobject]@{
        path = $fi.FullName
        name = $fi.Name
        size = [int64]$fi.Length
        status = 'waiting'
        message = '等待转换'
        output = ''
        attempt = 0
        cfxLog = ''
    }
}

$script:Progress = [pscustomobject]@{
    running = $true
    phase = 'running'
    message = '批量转换已开始'
    total = $items.Count
    completed = 0
    success = 0
    failed = 0
    skipped = 0
    currentIndex = -1
    startedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    updatedAt = ''
    items = $items
}

Save-Progress
Write-Log "开始批量转换，共 $($items.Count) 个文件。"
Write-Log "CFX-Pre：$($config.cfxPath)"
Write-Log "输出目录：$($config.outputDir)"

try {
    $publicRoot = Join-Path $env:PUBLIC 'CFXDefConverterTemp'
    if (-not (Test-Path -LiteralPath $publicRoot -PathType Container)) { New-Item -ItemType Directory -Path $publicRoot -Force | Out-Null }

    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $script:Progress.currentIndex = $i
        $targetInfo = Resolve-Target -SourceName $item.name
        if ($targetInfo.skip) {
            $item.status = 'skipped'
            $item.message = '目标文件已存在，已跳过'
            $item.output = $targetInfo.path
            $script:Progress.skipped++
            $script:Progress.completed++
            Write-Log "跳过：$($item.name)，目标文件已存在。" 'WARN'
            Save-Progress
            continue
        }

        $item.status = 'running'
        $item.message = '正在准备临时文件'
        $item.output = $targetInfo.path
        Save-Progress

        $taskDir = Join-Path $publicRoot ('job_' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $taskDir -Force | Out-Null
        $inputTemp = Join-Path $taskDir 'input.cfx'
        $outputTemp = Join-Path $taskDir 'output.def'

        try {
            Copy-Item -LiteralPath $item.path -Destination $inputTemp -Force
            $success = $false
            $lastExitCode = -1
            $combinedLog = ''
            $operations = @('write solver file', 'write def file')

            for ($attempt = 0; $attempt -lt $operations.Count; $attempt++) {
                $item.attempt = $attempt + 1
                $operation = $operations[$attempt]
                $item.message = if ($attempt -eq 0) { 'CFX-Pre 正在生成 DEF' } else { '使用兼容写出命令重试' }
                Save-Progress
                Write-Log "转换：$($item.name)，命令模式：$operation"

                $sessionPath = Join-Path $taskDir ("convert_$($attempt + 1).pre")
                $stdoutPath = Join-Path $taskDir ("stdout_$($attempt + 1).log")
                $stderrPath = Join-Path $taskDir ("stderr_$($attempt + 1).log")
                if (Test-Path -LiteralPath $outputTemp -PathType Leaf) { Remove-Item -LiteralPath $outputTemp -Force }
                New-SessionFile -Path $sessionPath -InputPath $inputTemp -OutputPath $outputTemp -Operation $operation
                $lastExitCode = Run-CfxPre -SessionPath $sessionPath -StdoutPath $stdoutPath -StderrPath $stderrPath
                $combinedLog = Read-CombinedLog -StdoutPath $stdoutPath -StderrPath $stderrPath
                $item.cfxLog = $combinedLog

                if ((Test-Path -LiteralPath $outputTemp -PathType Leaf) -and ((Get-Item -LiteralPath $outputTemp).Length -gt 0)) {
                    $success = $true
                    break
                }
                Write-Log "未生成有效 DEF，退出代码 $lastExitCode。" 'WARN'
            }

            if ($success) {
                Copy-Item -LiteralPath $outputTemp -Destination $targetInfo.path -Force
                $item.status = 'success'
                $item.message = '转换成功'
                $item.output = $targetInfo.path
                $script:Progress.success++
                Write-Log "成功：$($item.name) -> $($targetInfo.path)" 'OK'
            } else {
                $item.status = 'failed'
                $item.message = "CFX-Pre 未生成有效 DEF（退出代码 $lastExitCode）"
                $script:Progress.failed++
                Write-Log "失败：$($item.name)，$($item.message)" 'ERROR'
            }
        } catch {
            $item.status = 'failed'
            $item.message = $_.Exception.Message
            $script:Progress.failed++
            Write-Log "失败：$($item.name)，$($_.Exception.Message)" 'ERROR'
        } finally {
            $script:Progress.completed++
            Save-Progress
            if (-not [bool]$config.keepTemp) {
                try { Remove-Item -LiteralPath $taskDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
            } else {
                Write-Log "保留临时目录：$taskDir"
            }
        }

        if ($item.status -eq 'failed' -and -not [bool]$config.continueOnError) {
            $script:Progress.phase = 'failed'
            $script:Progress.message = '任务因错误而终止'
            break
        }
    }

    if ($script:Progress.phase -eq 'running') {
        $script:Progress.phase = 'complete'
        $script:Progress.message = '批量转换完成'
    }
} catch {
    $script:Progress.phase = 'failed'
    $script:Progress.message = $_.Exception.Message
    Write-Log $_.Exception.ToString() 'ERROR'
} finally {
    $script:Progress.running = $false
    Save-Progress
    Write-Log $script:Progress.message
}
