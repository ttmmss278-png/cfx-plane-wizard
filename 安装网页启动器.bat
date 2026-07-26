@echo off
setlocal
cd /d "%~dp0"

title Install Pelton Toolbox Web Launcher

set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL%" (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

echo ============================================================
echo  Install Pelton Toolbox Web Launcher
echo ============================================================
echo  This installs the pelton-toolbox URL protocol for this user.
echo  Administrator permission is not required.
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-def-service\register-web-launcher.ps1" -ToolboxRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo [ERROR] Installation failed. Check that all toolbox files exist.
  pause
  exit /b 1
)

echo.
echo [OK] The web launcher is installed.
echo Your browser may ask for confirmation the first time it opens.
pause

endlocal
exit /b 0
