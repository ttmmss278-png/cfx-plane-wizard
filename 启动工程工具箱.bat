@echo off
setlocal
cd /d "%~dp0"

title Pelton Engineering Toolbox

if not exist "dist\index.html" (
  echo ============================================================
  echo  First launch: building the engineering toolbox
  echo ============================================================
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js and npm were not found.
    echo Install Node.js 20 or later, then try again.
    pause
    exit /b 1
  )
  if not exist "node_modules" (
    call npm install
    if errorlevel 1 goto :build_failed
  )
  call npm run build
  if errorlevel 1 goto :build_failed
)

set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL%" (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-def-service\register-web-launcher.ps1" -ToolboxRoot "%~dp0" >nul 2>nul

echo ============================================================
echo  Pelton Engineering Toolbox
echo ============================================================
echo  The local service is running. Keep this window open.
echo  You may close this window after closing the web page.
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0local-def-service\server.ps1" -NoBrowser
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [ERROR] PowerShell returned code: %ERR%
  echo See local-def-service\server-error.log for details.
  pause
)

endlocal
exit /b %ERR%

:build_failed
echo.
echo [ERROR] Build failed. Review the npm error above.
pause
endlocal
exit /b 1
