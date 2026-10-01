(function () {
  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = "pelton-case-queue-draft-v1";
  const SCHEMES_KEY = "pelton-case-queue-schemes-v1";
  const SCHEMA_VERSION = 1;
  let isDirty = false;
  let restoring = false;

  const fields = [
    "cfxSolve",
    "defDir",
    "outRoot",
    "caseList",
    "cores",
    "waitSeconds",
    "pauseOnError",
    "batName",
    "runMode",
    "autoOpenPre",
    "preWaitSeconds",
    "inputFormat",
    "topologyFactor",
  ];

  function safeStorageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      toast("浏览器未允许本地保存，请下载方案 JSON");
      return false;
    }
  }

  function notifyDirty(dirty) {
    isDirty = Boolean(dirty);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "pelton-toolbox-dirty", dirty: isDirty }, window.location.origin);
    }
  }

  function currentScheme(name = "") {
    return {
      schema: "pelton-case-queue",
      version: SCHEMA_VERSION,
      name,
      savedAt: new Date().toISOString(),
      values: Object.fromEntries(fields.map((id) => [id, $(id).value])),
    };
  }

  function validateScheme(data) {
    if (!data || data.schema !== "pelton-case-queue" || data.version !== SCHEMA_VERSION || !data.values) {
      throw new Error("不是兼容的连跑算例方案 JSON");
    }
    return data;
  }

  function applyScheme(data) {
    const scheme = validateScheme(data);
    restoring = true;
    $("autoOpenPre").value = "yes";
    $("preWaitSeconds").value = "60";
    $("inputFormat").value = "def";
    $("topologyFactor").value = "";
    fields.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(scheme.values, id)) $(id).value = String(scheme.values[id] ?? "");
    });
    restoring = false;
    generate();
    safeStorageSet(DRAFT_KEY, currentScheme("当前草稿"));
    notifyDirty(false);
  }

  function loadSchemes() {
    const value = safeStorageGet(SCHEMES_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function renderSchemeOptions(selected = "") {
    const schemes = loadSchemes();
    $("schemeSelect").innerHTML = '<option value="">方案：当前草稿</option>';
    Object.keys(schemes).sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = `方案：${name}`;
      $("schemeSelect").appendChild(option);
    });
    $("schemeSelect").value = selected && schemes[selected] ? selected : "";
  }

  function persistDraft() {
    if (restoring) return;
    safeStorageSet(DRAFT_KEY, currentScheme("当前草稿"));
    notifyDirty(true);
  }

  function downloadText(name, text, type) {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function cleanPath(value) {
    return String(value || "").trim().replace(/^"+|"+$/g, "");
  }

  function cleanCaseName(value) {
    return String(value || "")
      .trim()
      .replace(/^"+|"+$/g, "")
      .replace(/\.(def|cfx)$/i, "");
  }

  function parseCases() {
    return $("caseList")
      .value.split(/[\s,;，；]+/)
      .map(cleanCaseName)
      .filter(Boolean);
  }

  function unique(values) {
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
    });
    return result;
  }

  function normalizeCases() {
    $("caseList").value = unique(parseCases()).join("\n");
    generate();
    persistDraft();
  }

  function safeBatName(name) {
    const trimmed = String(name || "run_cfx_queue_generated.bat").trim();
    const base = trimmed || "run_cfx_queue_generated.bat";
    return /\.bat$/i.test(base) ? base : `${base}.bat`;
  }

  function pauseLine() {
    return $("pauseOnError").value === "yes" ? "pause" : "rem pause disabled";
  }

  function conversionScript() {
    // Same session commands and compatible operations as local-def-service/worker.ps1.
    return String.raw`
# CFX_QUEUE_CONVERT_PS
$ErrorActionPreference = 'Stop'
try {
  $root = Join-Path $env:CASE_DIR '_cfx_generated'
  $work = Join-Path $root ('export_' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
  $versionMatch = [regex]::Match($env:CFX_PRE, '[\\/]v(\d{3})[\\/]', 'IgnoreCase')
  $version = if ($versionMatch.Success) { $v = $versionMatch.Groups[1].Value; ([int]$v.Substring(0,2)).ToString() + '.' + $v.Substring(2,1) } else { $null }
  $operations = @('write solver file', 'write def file')
  $ok = $false
  for ($attempt = 0; $attempt -lt $operations.Count; $attempt++) {
    $attemptDir = Join-Path $work ('attempt_' + ($attempt + 1))
    New-Item -ItemType Directory -Path $attemptDir -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath $env:SOURCE_FILE -Destination (Join-Path $attemptDir 'input.cfx') -ErrorAction Stop
    $session = @()
    if ($version) { $session += @('COMMAND FILE:', ('CFX Pre Version = ' + $version), 'END') }
    $session += @('>load filename=input.cfx, mode=cfx, overwrite=yes', '> update', ('>writeCaseFile filename=output.def, operation=' + $operations[$attempt] + ', summary=off'), '> update', '> update')
    [IO.File]::WriteAllText((Join-Path $attemptDir 'convert.pre'), ($session -join [Environment]::NewLine) + [Environment]::NewLine, [Text.Encoding]::ASCII)
    $stdout = Join-Path $attemptDir 'stdout.log'
    $stderr = Join-Path $attemptDir 'stderr.log'
    $argsText = '-batch convert.pre -verbose'
    if ([IO.Path]::GetExtension($env:CFX_PRE) -ieq '.bat') {
      $cmdArgs = '/d /c ' + [char]34 + [char]34 + $env:CFX_PRE + [char]34 + ' ' + $argsText + [char]34
      $p = Start-Process -FilePath $env:ComSpec -ArgumentList $cmdArgs -WorkingDirectory $attemptDir -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -ErrorAction Stop
    } else {
      $p = Start-Process -FilePath $env:CFX_PRE -ArgumentList $argsText -WorkingDirectory $attemptDir -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -ErrorAction Stop
    }
    $exitCode = $p.ExitCode
    $log = @($stdout, $stderr | ForEach-Object { if (Test-Path -LiteralPath $_) { Get-Content -LiteralPath $_ -Raw } }) -join [Environment]::NewLine
    $output = Join-Path $attemptDir 'output.def'
    $fatal = $log -match 'ERROR #\d+|Floating point exception|License checkout failed'
    if ($exitCode -eq 0 -and -not $fatal -and (Test-Path -LiteralPath $output -PathType Leaf) -and (Get-Item -LiteralPath $output).Length -gt 0) {
      Copy-Item -LiteralPath $output -Destination $env:DEF_FILE -Force -ErrorAction Stop
      $ok = $true
      break
    }
    Write-Host ('CFX-Pre export attempt failed. Exit code: ' + $exitCode + '. Logs: ' + $attemptDir)
    if ($log) { Write-Host $log }
    if ($fatal) { break }
  }
  if (-not $ok) { throw ('No valid DEF was exported. Conversion records: ' + $work) }
  Write-Host ('DEF exported: ' + $env:DEF_FILE)
  exit 0
} catch {
  Write-Host ('ERROR: CFX to DEF conversion failed: ' + $_.Exception.Message)
  exit 1
}
`;
  }

  function buildBat() {
    const cfxSolve = cleanPath($("cfxSolve").value);
    const defDir = cleanPath($("defDir").value) || "%~dp0";
    const outRoot = cleanPath($("outRoot").value) || "%~dp0";
    const cases = unique(parseCases());
    const cores = Math.max(1, Number.parseInt($("cores").value || "1", 10));
    const waitSeconds = Math.max(1, Number.parseInt($("waitSeconds").value || "600", 10));
    const strictWait = $("runMode").value === "strict";
    const autoOpenPre = $("autoOpenPre").value === "yes";
    const preWaitSeconds = Math.max(1, Number.parseInt($("preWaitSeconds").value || "60", 10));
    const inputFormat = $("inputFormat").value === "cfx" ? "cfx" : "def";
    const topologyFactor = ["1.1", "1.2"].includes($("topologyFactor").value) ? $("topologyFactor").value : "";
    const caseList = cases.join(" ");
    const maybeInitialWait = strictWait
      ? "rem Active CFX calculation is checked immediately before every case."
      : "rem Strict wait disabled before queue start";
    const maybeRunWait = strictWait
      ? "call :WaitForCfx"
      : "rem Strict wait disabled before case start";

    const bat = `@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
rem CFX queue runner V2 - double precision, optional CFX-Pre startup

set "CFX_SOLVE=${cfxSolve}"
set "DEF_DIR=${defDir}"
set "OUT_ROOT=${outRoot}"
set "CASE_LIST=${caseList}"
set "CORES=${cores}"
set "WAIT_SECONDS=${waitSeconds}"
set "AUTO_OPEN_PRE=${autoOpenPre ? "yes" : "no"}"
set "PRE_WAIT_SECONDS=${preWaitSeconds}"
set "PRE_STARTED="
set "CFX_PRE="
set "INPUT_FORMAT=${inputFormat}"
set "TOPOLOGY_FACTOR=${topologyFactor}"
set "QUEUE_BAT=%~f0"
set "QUEUE_LOG=%OUT_ROOT%\\cfx_queue.log"

if "%CFX_SOLVE%"=="" call :FindCfxSolve

if not exist "%CFX_SOLVE%" (
  echo ERROR: CFX solver launcher was not found.
  echo %CFX_SOLVE%
  echo.
  echo Check CFX_SOLVE in this bat file.
  ${pauseLine()}
  exit /b 1
)

if not exist "%DEF_DIR%" (
  echo ERROR: DEF_DIR was not found.
  echo %DEF_DIR%
  ${pauseLine()}
  exit /b 1
)

if not exist "%OUT_ROOT%" (
  mkdir "%OUT_ROOT%"
  if errorlevel 1 (
    echo ERROR: OUT_ROOT could not be created.
    echo %OUT_ROOT%
    ${pauseLine()}
    exit /b 1
  )
)

if "%CASE_LIST%"=="" (
  echo ERROR: CASE_LIST is empty.
  ${pauseLine()}
  exit /b 1
)

if defined NUMBER_OF_PROCESSORS (
  if %CORES% GTR %NUMBER_OF_PROCESSORS% (
    echo WARNING: Requested %CORES% partitions, but this computer has only %NUMBER_OF_PROCESSORS% logical processors.
    echo CORES has been reduced automatically to %NUMBER_OF_PROCESSORS%.
    set "CORES=%NUMBER_OF_PROCESSORS%"
  )
)

echo.
echo CFX queue runner started.
echo RUNNER_VERSION: 2
echo PRECISION: Double
echo CFX_SOLVE: %CFX_SOLVE%
echo DEF_DIR: %DEF_DIR%
echo OUT_ROOT: %OUT_ROOT%
echo CASE_LIST: %CASE_LIST%
echo CORES: %CORES%
echo LOGICAL_PROCESSORS: %NUMBER_OF_PROCESSORS%
echo WAIT_SECONDS: %WAIT_SECONDS%
echo AUTO_OPEN_PRE: %AUTO_OPEN_PRE%
echo PRE_WAIT_SECONDS: %PRE_WAIT_SECONDS%
echo INPUT_FORMAT: %INPUT_FORMAT%
if defined TOPOLOGY_FACTOR echo TOPOLOGY_ESTIMATE_FACTOR: %TOPOLOGY_FACTOR%
echo.

>>"%QUEUE_LOG%" echo [%DATE% %TIME%] Queue started. Cases: %CASE_LIST%

${maybeInitialWait}

for %%N in (%CASE_LIST%) do (
  call :RunOne "%%~N"
  if errorlevel 1 exit /b 1
)

echo.
echo All cases finished.
if defined PRE_STARTED echo The queue is finished. You may now close the CFX-Pre window opened by this BAT.
pause
exit /b 0

:RunOne
set "CASE_NAME=%~1"
set "DEF_FILE=%DEF_DIR%\\%CASE_NAME%.def"
set "SOURCE_FILE=%DEF_DIR%\\%CASE_NAME%.%INPUT_FORMAT%"
set "PRE_INPUT_FILE=%SOURCE_FILE%"
set "PRE_INPUT_OPTION=-def"
if /i "%INPUT_FORMAT%"=="cfx" set "PRE_INPUT_OPTION=-cfx"
set "CASE_DIR=%OUT_ROOT%\\%CASE_NAME%"
set "DONE_FILE=%CASE_DIR%\\.cfx_queue_completed"

if exist "%CASE_DIR%" (
  call :IsCaseComplete
  if not errorlevel 1 (
    echo.
    echo SKIP: Case %CASE_NAME% is already complete.
    >>"%QUEUE_LOG%" echo [%DATE% %TIME%] SKIP %CASE_NAME% - already complete.
    exit /b 0
  )
)

${maybeRunWait}

if not exist "%SOURCE_FILE%" (
  echo.
  echo ERROR: Input file was not found.
  echo %SOURCE_FILE%
  ${pauseLine()}
  exit /b 1
)

if not exist "%CASE_DIR%" (
  mkdir "%CASE_DIR%"
  if errorlevel 1 (
    echo ERROR: Case output folder could not be created.
    echo %CASE_DIR%
    ${pauseLine()}
    exit /b 1
  )
)

call :EnsureCfxPre
if errorlevel 1 (
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - CFX-Pre startup failed.
  ${pauseLine()}
  exit /b 1
)

if /i "%INPUT_FORMAT%"=="cfx" (
  call :ConvertCfx
  if errorlevel 1 (
    >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - CFX to DEF conversion failed.
    ${pauseLine()}
    exit /b 1
  )
)

echo.
echo ============================================================
echo Starting case %CASE_NAME%
echo DEF: %DEF_FILE%
echo OUT: %CASE_DIR%
echo CORES: %CORES%
echo ============================================================
echo.

call :PrepareTopologyOverride
if errorlevel 1 (
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - topology CCL preparation failed.
  ${pauseLine()}
  exit /b 1
)

pushd "%CASE_DIR%"
if errorlevel 1 (
  echo ERROR: Cannot enter the case output folder.
  ${pauseLine()}
  exit /b 1
)
call "%CFX_SOLVE%" -batch -def "%DEF_FILE%" -double -par-local -partition %CORES% %TOPOLOGY_CCL_ARGS%
set "SOLVE_EXIT=%ERRORLEVEL%"
popd

if not "%SOLVE_EXIT%"=="0" (
  echo.
  echo ERROR: Case %CASE_NAME% failed with exit code %SOLVE_EXIT%.
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - solver exit %SOLVE_EXIT%.
  call :ShowLatestOutTail
  ${pauseLine()}
  exit /b %SOLVE_EXIT%
)

call :IsCaseComplete
if errorlevel 1 (
  echo.
  echo ERROR: Case %CASE_NAME% has no matching successful OUT and RES files.
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - incomplete output.
  call :ShowLatestOutTail
  ${pauseLine()}
  exit /b 1
)

>"%DONE_FILE%" (
  echo RunnerVersion=2
  echo Precision=Double
  echo Case=%CASE_NAME%
  echo Finished=%DATE% %TIME%
  echo SolverExitCode=%SOLVE_EXIT%
)

echo.
echo Case %CASE_NAME% finished.
>>"%QUEUE_LOG%" echo [%DATE% %TIME%] DONE %CASE_NAME% - solver exit %SOLVE_EXIT%.
exit /b 0

:PrepareTopologyOverride
set "TOPOLOGY_CCL_ARGS="
set "TOPOLOGY_CCL="
if not defined TOPOLOGY_FACTOR exit /b 0
if not "%TOPOLOGY_FACTOR%"=="1.1" if not "%TOPOLOGY_FACTOR%"=="1.2" (
  echo ERROR: Unsupported TOPOLOGY_FACTOR. Use blank, 1.1 or 1.2.
  exit /b 1
)
set "TOPOLOGY_CCL=%CASE_DIR%\\_cfx_queue\\topology.ccl"
powershell.exe -NoProfile -Command "try { $dir = [IO.Path]::GetDirectoryName($env:TOPOLOGY_CCL); [IO.Directory]::CreateDirectory($dir) | Out-Null; $lines = @('FLOW:', '  EXPERT PARAMETERS:', ('    topology estimate factor = ' + $env:TOPOLOGY_FACTOR), '  END', 'END'); [IO.File]::WriteAllText($env:TOPOLOGY_CCL, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.Encoding]::ASCII); exit 0 } catch { Write-Host ('ERROR: Cannot write topology CCL: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1
set TOPOLOGY_CCL_ARGS=-ccl "%TOPOLOGY_CCL%"
echo Applying topology estimate factor = %TOPOLOGY_FACTOR%
echo CCL: %TOPOLOGY_CCL%
>>"%QUEUE_LOG%" echo [%DATE% %TIME%] %CASE_NAME% topology estimate factor = %TOPOLOGY_FACTOR%.
exit /b 0

:EnsureCfxPre
if /i not "%AUTO_OPEN_PRE%"=="yes" exit /b 0
if defined PRE_STARTED exit /b 0
call :FindCfxPre
if errorlevel 1 exit /b 1
echo.
echo Opening CFX-Pre with the first pending input: %PRE_INPUT_FILE%
echo CFX_PRE: %CFX_PRE%
echo Waiting %PRE_WAIT_SECONDS% seconds for startup and mesh loading.
echo Keep this CFX-Pre window open until the whole queue finishes.
powershell.exe -NoProfile -Command "try { $argsText = $env:PRE_INPUT_OPTION + ' ' + [char]34 + $env:PRE_INPUT_FILE + [char]34; if ([IO.Path]::GetExtension($env:CFX_PRE) -ieq '.bat') { $cmdArgs = '/d /c ' + [char]34 + [char]34 + $env:CFX_PRE + [char]34 + ' ' + $argsText + [char]34; Start-Process -FilePath $env:ComSpec -ArgumentList $cmdArgs -WorkingDirectory $env:DEF_DIR -WindowStyle Normal -ErrorAction Stop | Out-Null } else { Start-Process -FilePath $env:CFX_PRE -ArgumentList $argsText -WorkingDirectory $env:DEF_DIR -WindowStyle Normal -ErrorAction Stop | Out-Null }; Start-Sleep -Seconds ([int]$env:PRE_WAIT_SECONDS); exit 0 } catch { Write-Host ('ERROR: Cannot start CFX-Pre: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1
set "PRE_STARTED=1"
>>"%QUEUE_LOG%" echo [%DATE% %TIME%] CFX-Pre launched. Input: %PRE_INPUT_FILE%. Startup delay: %PRE_WAIT_SECONDS% seconds.
echo Startup delay elapsed. This delay does not verify that input loading or licensing succeeded.
exit /b 0

:FindCfxPre
if defined CFX_PRE exit /b 0
for %%P in ("%CFX_SOLVE%") do set "CFX_BIN=%%~dpP"
if exist "%CFX_BIN%cfx5pre.exe" set "CFX_PRE=%CFX_BIN%cfx5pre.exe"
if not defined CFX_PRE if exist "%CFX_BIN%cfx5pre.bat" set "CFX_PRE=%CFX_BIN%cfx5pre.bat"
if not defined CFX_PRE (
  echo ERROR: CFX-Pre was not found next to the selected solver.
  echo Expected: %CFX_BIN%cfx5pre.exe
  echo Check the selected CFX installation. CFX input always requires CFX-Pre.
  exit /b 1
)
exit /b 0

:ConvertCfx
call :FindCfxPre
if errorlevel 1 exit /b 1
set "DEF_FILE=%CASE_DIR%\\_cfx_generated\\input.def"
echo Converting CFX to DEF: %SOURCE_FILE%
powershell.exe -NoProfile -Command "try { $t = [IO.File]::ReadAllText($env:QUEUE_BAT, [Text.Encoding]::UTF8); $marker = '# CFX_QUEUE_' + 'CONVERT_PS'; $i = $t.LastIndexOf($marker); if ($i -lt 0) { throw 'Embedded conversion script missing' }; & ([scriptblock]::Create($t.Substring($i))) } catch { Write-Host ('ERROR: ' + $_.Exception.Message); exit 1 }"
exit /b %ERRORLEVEL%

:ShowLatestOutTail
powershell.exe -NoProfile -Command "$f = Get-ChildItem -LiteralPath $env:CASE_DIR -Filter '*.out' -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($null -eq $f) { Write-Host 'No CFX OUT file was found. The failure happened before the solver created an OUT file.'; exit 0 }; Write-Host ('--- Latest CFX OUT: ' + $f.FullName + ' ---'); Get-Content -LiteralPath $f.FullName -Tail 120"
exit /b 0

:IsCaseComplete
powershell.exe -NoProfile -Command "try { $f = Get-ChildItem -LiteralPath $env:CASE_DIR -Filter '*.out' -ErrorAction Stop | Where-Object { -not $_.PSIsContainer } | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($null -eq $f) { exit 1 }; $r = Get-Item -LiteralPath ([IO.Path]::ChangeExtension($f.FullName, '.res')) -ErrorAction Stop; if ($r.PSIsContainer -or $r.Length -eq 0) { exit 1 }; $t = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop; if ($t -notmatch 'This run of the ANSYS CFX Solver has finished\\.' -or $t -match 'ERROR #\\d+|Floating point exception|solver exited with return code|No results file has been created|License checkout failed') { exit 1 }; exit 0 } catch { exit 1 }"
exit /b %ERRORLEVEL%

:WaitForCfx
call :DetectActiveCfxSolve
if not errorlevel 1 (
  echo Active CFX calculation detected. Waiting %WAIT_SECONDS% seconds...
  call :ShowActiveCfxSolve
  echo.
  timeout /t %WAIT_SECONDS% /nobreak >nul
  goto WaitForCfx
)
exit /b 0

:DetectActiveCfxSolve
powershell.exe -NoProfile -Command "$active = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'solver-mpi.exe' -or ($_.Name -ieq 'cfx5solve.exe' -and $_.CommandLine -match '(?i)-batch' -and $_.CommandLine -match '(?i)-def') }; if ($active) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%

:ShowActiveCfxSolve
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'solver-mpi.exe' -or ($_.Name -ieq 'cfx5solve.exe' -and $_.CommandLine -match '(?i)-batch' -and $_.CommandLine -match '(?i)-def') } | Select-Object ProcessId, Name, CreationDate | Format-Table -AutoSize"
exit /b 0

:FindCfxSolve
for /f "tokens=1,* delims==" %%A in ('set AWP_ROOT 2^>nul') do (
  if exist "%%B\\CFX\\bin\\cfx5solve.bat" (
    set "CFX_SOLVE=%%B\\CFX\\bin\\cfx5solve.bat"
    exit /b 0
  )
  if exist "%%B\\CFX\\bin\\cfx5solve.exe" (
    set "CFX_SOLVE=%%B\\CFX\\bin\\cfx5solve.exe"
    exit /b 0
  )
)

for %%R in ("%ProgramFiles%\\ANSYS Inc" "%ProgramFiles(x86)%\\ANSYS Inc" "D:\\Program Files\\ANSYS Inc" "D:\\ANSYS Inc" "C:\\ANSYS Inc") do (
  for %%V in (v202 v201 v203 v211 v212 v221 v222 v231 v232 v241 v242 v251 v252) do (
    if exist "%%~R\\%%V\\CFX\\bin\\cfx5solve.bat" (
      set "CFX_SOLVE=%%~R\\%%V\\CFX\\bin\\cfx5solve.bat"
      exit /b 0
    )
    if exist "%%~R\\%%V\\CFX\\bin\\cfx5solve.exe" (
      set "CFX_SOLVE=%%~R\\%%V\\CFX\\bin\\cfx5solve.exe"
      exit /b 0
    )
  )
)

for /f "delims=" %%P in ('where cfx5solve.bat 2^>nul') do (
  set "CFX_SOLVE=%%P"
  exit /b 0
)
for /f "delims=" %%P in ('where cfx5solve.exe 2^>nul') do (
  set "CFX_SOLVE=%%P"
  exit /b 0
)

exit /b 1
${inputFormat === "cfx" ? conversionScript() : ""}
`;
    return bat.replace(/\r?\n/g, "\r\n");
  }

  function generate() {
    const cases = unique(parseCases());
    const isCfx = $("inputFormat").value === "cfx";
    $("inputDirectoryLabel").textContent = isCfx ? "CFX 文件目录" : "DEF 文件目录";
    $("inputImportLabel").textContent = `导入 ${isCfx ? "CFX" : "DEF"} 文件提取算例名`;
    $("defFiles").accept = isCfx ? ".cfx" : ".def";
    $("batOutput").value = buildBat();
    $("summary").textContent = `优化版 V2 · ${isCfx ? "CFX 自动转 DEF · " : ""}双精度 · ${$("topologyFactor").value ? `拓扑预留 ${$("topologyFactor").value} · ` : ""}${$("autoOpenPre").value === "yes" ? "自动打开 CFX-Pre · " : ""}${cases.length} 个算例，${$("cores").value || 1} 核，等待 ${$("waitSeconds").value || 600} 秒`;
  }

  function toast(message) {
    const toastEl = $("toast");
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastEl.timer);
    toastEl.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function downloadBat() {
    const blob = new Blob([$("batOutput").value.replace(/\r?\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = safeBatName($("batName").value);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    notifyDirty(false);
  }

  fields.forEach((id) => {
    const el = $(id);
    const eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, () => {
      generate();
      persistDraft();
    });
  });

  $("defFiles").addEventListener("change", (event) => {
    const extension = $("inputFormat").value === "cfx" ? ".cfx" : ".def";
    const imported = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith(extension)).map((file) => cleanCaseName(file.name));
    const merged = unique([...parseCases(), ...imported]);
    $("caseList").value = merged.join("\n");
    generate();
    persistDraft();
  });

  $("normalizeCases").addEventListener("click", normalizeCases);

  $("clearCases").addEventListener("click", () => {
    $("caseList").value = "";
    generate();
    persistDraft();
  });

  document.querySelectorAll("[data-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      const pairs = button.dataset.fill.split(";");
      pairs.forEach((pair) => {
        const [id, value = ""] = pair.split(":");
        if ($(id)) $(id).value = value;
      });
      generate();
      persistDraft();
    });
  });

  $("schemeSelect").addEventListener("change", () => {
    const name = $("schemeSelect").value;
    if (!name) {
      const draft = safeStorageGet(DRAFT_KEY, null);
      if (draft) applyScheme(draft);
      return;
    }
    const scheme = loadSchemes()[name];
    if (scheme) {
      applyScheme(scheme);
      toast(`已载入方案：${name}`);
    }
  });

  $("saveScheme").addEventListener("click", () => {
    const proposed = $("schemeSelect").value || `连跑方案 ${new Date().toLocaleDateString("zh-CN")}`;
    const name = window.prompt("方案名称", proposed)?.trim();
    if (!name) return;
    const schemes = loadSchemes();
    schemes[name] = currentScheme(name);
    if (safeStorageSet(SCHEMES_KEY, schemes)) {
      safeStorageSet(DRAFT_KEY, currentScheme("当前草稿"));
      renderSchemeOptions(name);
      notifyDirty(false);
      toast(`方案“${name}”已保存`);
    }
  });

  $("exportScheme").addEventListener("click", () => {
    const name = $("schemeSelect").value || "连跑算例方案";
    downloadText(`${name.replace(/[\\/:*?"<>|]/g, "_")}.json`, JSON.stringify(currentScheme(name), null, 2), "application/json;charset=utf-8");
    notifyDirty(false);
    toast("方案 JSON 已下载");
  });

  $("importScheme").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const scheme = validateScheme(JSON.parse(await file.text()));
      applyScheme(scheme);
      const name = String(scheme.name || file.name.replace(/\.json$/i, "") || "导入方案").trim();
      const schemes = loadSchemes();
      schemes[name] = { ...scheme, name };
      safeStorageSet(SCHEMES_KEY, schemes);
      renderSchemeOptions(name);
      toast(`已导入方案：${name}`);
    } catch (error) {
      toast(error.message || "方案导入失败");
    }
  });

  $("copyBat").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("batOutput").value.replace(/\r?\n/g, "\r\n"));
      toast("BAT 代码已复制");
    } catch (error) {
      $("batOutput").select();
      document.execCommand("copy");
      toast("BAT 代码已选中并复制");
    }
  });

  $("downloadBat").addEventListener("click", downloadBat);

  const savedDraft = safeStorageGet(DRAFT_KEY, null);
  renderSchemeOptions();
  if (savedDraft) {
    try { applyScheme(savedDraft); } catch (_) { generate(); }
  } else {
    generate();
  }
  window.addEventListener("beforeunload", (event) => {
    if (!isDirty || window.parent !== window) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();
