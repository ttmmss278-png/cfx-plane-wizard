@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title Install Pelton Toolbox Local Service

set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "PACKAGE_ROOT=%~dp0."
if not exist "%POWERSHELL%" (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

if not exist "%~dp0local-def-service\install-local-service.ps1" (
  echo [ERROR] The installer script is missing.
  echo Please extract the complete ZIP before running this BAT file.
  pause
  exit /b 1
)

echo ============================================================
echo  Install Pelton Toolbox Local Service
echo ============================================================
echo  No administrator permission, Node.js, or npm is required.
echo  The service will be installed for the current Windows user.
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-def-service\install-local-service.ps1" -PackageRoot "%PACKAGE_ROOT%" -StartAfterInstall
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [ERROR] Installation failed with code: %ERR%
  pause
  exit /b %ERR%
)

echo.
echo [OK] Installation completed. The local service window is starting.
echo Return to the web page; it will reconnect automatically.
pause

endlocal
exit /b 0
