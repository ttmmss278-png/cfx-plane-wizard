(function () {
  const $ = (id) => document.getElementById(id);

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
  ];

  function cleanPath(value) {
    return String(value || "").trim().replace(/^"+|"+$/g, "");
  }

  function cleanCaseName(value) {
    return String(value || "")
      .trim()
      .replace(/^"+|"+$/g, "")
      .replace(/\.def$/i, "");
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
  }

  function safeBatName(name) {
    const trimmed = String(name || "run_cfx_queue_generated.bat").trim();
    const base = trimmed || "run_cfx_queue_generated.bat";
    return /\.bat$/i.test(base) ? base : `${base}.bat`;
  }

  function pauseLine() {
    return $("pauseOnError").value === "yes" ? "pause" : "rem pause disabled";
  }

  function buildBat() {
    const cfxSolve = cleanPath($("cfxSolve").value);
    const defDir = cleanPath($("defDir").value) || "%~dp0";
    const outRoot = cleanPath($("outRoot").value) || "%~dp0";
    const cases = unique(parseCases());
    const cores = Math.max(1, Number.parseInt($("cores").value || "1", 10));
    const waitSeconds = Math.max(1, Number.parseInt($("waitSeconds").value || "600", 10));
    const strictWait = $("runMode").value === "strict";
    const caseList = cases.join(" ");
    const maybeInitialWait = strictWait
      ? "rem Active CFX calculation is checked immediately before every case."
      : "rem Strict wait disabled before queue start";
    const maybeRunWait = strictWait
      ? "call :WaitForCfx"
      : "rem Strict wait disabled before case start";

    const bat = `@echo off
setlocal EnableExtensions

set "CFX_SOLVE=${cfxSolve}"
set "DEF_DIR=${defDir}"
set "OUT_ROOT=${outRoot}"
set "CASE_LIST=${caseList}"
set "CORES=${cores}"
set "WAIT_SECONDS=${waitSeconds}"
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
echo DEF_DIR: %DEF_DIR%
echo OUT_ROOT: %OUT_ROOT%
echo CASE_LIST: %CASE_LIST%
echo CORES: %CORES%
echo LOGICAL_PROCESSORS: %NUMBER_OF_PROCESSORS%
echo WAIT_SECONDS: %WAIT_SECONDS%
echo.

>>"%QUEUE_LOG%" echo [%DATE% %TIME%] Queue started. Cases: %CASE_LIST%

${maybeInitialWait}

for %%N in (%CASE_LIST%) do (
  call :RunOne "%%~N"
  if errorlevel 1 exit /b 1
)

echo.
echo All cases finished.
pause
exit /b 0

:RunOne
set "CASE_NAME=%~1"
set "DEF_FILE=%DEF_DIR%\\%CASE_NAME%.def"
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

if not exist "%DEF_FILE%" (
  echo.
  echo ERROR: DEF file was not found.
  echo %DEF_FILE%
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

echo.
echo ============================================================
echo Starting case %CASE_NAME%
echo DEF: %DEF_FILE%
echo OUT: %CASE_DIR%
echo CORES: %CORES%
echo ============================================================
echo.

pushd "%CASE_DIR%"
call "%CFX_SOLVE%" -batch -def "%DEF_FILE%" -par-local -partition %CORES%
set "SOLVE_EXIT=%ERRORLEVEL%"
popd

call :IsCaseComplete
if not errorlevel 1 (
  if not "%SOLVE_EXIT%"=="0" (
    echo.
    echo WARNING: CFX returned exit code %SOLVE_EXIT%, but a finished OUT file and RES file were found.
    echo Treating case %CASE_NAME% as complete and continuing the queue.
  )
  echo.
  echo Case %CASE_NAME% finished.
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] DONE %CASE_NAME% - solver exit %SOLVE_EXIT%.
  exit /b 0
)

if not "%SOLVE_EXIT%"=="0" (
  echo.
  echo ERROR: Case %CASE_NAME% failed with exit code %SOLVE_EXIT%.
  >>"%QUEUE_LOG%" echo [%DATE% %TIME%] FAILED %CASE_NAME% - solver exit %SOLVE_EXIT%.
  call :ShowLatestOutTail
  ${pauseLine()}
  exit /b %SOLVE_EXIT%
)

>"%DONE_FILE%" (
  echo Case=%CASE_NAME%
  echo Finished=%DATE% %TIME%
  echo SolverExitCode=%SOLVE_EXIT%
)

echo.
echo Case %CASE_NAME% finished.
>>"%QUEUE_LOG%" echo [%DATE% %TIME%] DONE %CASE_NAME% - solver exit %SOLVE_EXIT%.
exit /b 0

:ShowLatestOutTail
powershell.exe -NoProfile -Command "$f = Get-ChildItem -LiteralPath $env:CASE_DIR -Filter '*.out' -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($null -eq $f) { Write-Host 'No CFX OUT file was found. The failure happened before the solver created an OUT file.'; exit 0 }; Write-Host ('--- Latest CFX OUT: ' + $f.FullName + ' ---'); Get-Content -LiteralPath $f.FullName -Tail 120"
exit /b 0

:IsCaseComplete
if exist "%DONE_FILE%" exit /b 0
if not exist "%CASE_DIR%\\*.res" exit /b 1
if not exist "%CASE_DIR%\\*.out" exit /b 1
findstr /I /L /C:"This run of the ANSYS CFX Solver has finished." "%CASE_DIR%\\*.out" >nul 2>nul
if errorlevel 1 exit /b 1

>"%DONE_FILE%" (
  echo Case=%CASE_NAME%
  echo Finished=%DATE% %TIME%
  echo DetectedFromExistingOutput=yes
)
exit /b 0

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
`;
    return bat.replace(/\n/g, "\r\n");
  }

  function generate() {
    const cases = unique(parseCases());
    $("batOutput").value = buildBat();
    $("summary").textContent = `${cases.length} 个算例，${$("cores").value || 1} 核，等待 ${$("waitSeconds").value || 600} 秒`;
  }

  function toast(message) {
    const toastEl = $("toast");
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastEl.timer);
    toastEl.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function downloadBat() {
    const blob = new Blob([$("batOutput").value.replace(/\r?\n/g, "\r\n")], { type: "text/plain;charset=ansi" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = safeBatName($("batName").value);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  fields.forEach((id) => {
    const el = $(id);
    const eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, generate);
  });

  $("defFiles").addEventListener("change", (event) => {
    const imported = Array.from(event.target.files || []).map((file) => cleanCaseName(file.name));
    const merged = unique([...parseCases(), ...imported]);
    $("caseList").value = merged.join("\n");
    generate();
  });

  $("normalizeCases").addEventListener("click", normalizeCases);

  $("clearCases").addEventListener("click", () => {
    $("caseList").value = "";
    generate();
  });

  document.querySelectorAll("[data-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      const pairs = button.dataset.fill.split(";");
      pairs.forEach((pair) => {
        const [id, value = ""] = pair.split(":");
        if ($(id)) $(id).value = value;
      });
      generate();
    });
  });

  $("copyBat").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("batOutput").value);
      toast("BAT 代码已复制");
    } catch (error) {
      $("batOutput").select();
      document.execCommand("copy");
      toast("BAT 代码已选中并复制");
    }
  });

  $("downloadBat").addEventListener("click", downloadBat);

  generate();
})();
