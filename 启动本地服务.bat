@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title Pelton Toolbox Local Service

if exist "%~dp0installed-version.json" goto :installed_copy
if not exist "%~dp0安装并启动本地服务.bat" goto :installed_copy
echo [INFO] This copy has not been installed yet.
echo Running the installer so the web launcher uses a stable local path...
echo.
call "%~dp0安装并启动本地服务.bat"
exit /b %ERRORLEVEL%

:installed_copy

set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL%" (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

if not exist "%~dp0local-def-service\server.ps1" (
  echo [ERROR] local-def-service\server.ps1 was not found.
  echo Please extract the complete local service package before running it.
  pause
  exit /b 1
)

if not exist "%~dp0local-def-service\worker.ps1" (
  echo [ERROR] local-def-service\worker.ps1 was not found.
  echo Please extract the complete local service package before running it.
  pause
  exit /b 1
)

if exist "%~dp0local-def-service\register-web-launcher.ps1" (
  "%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-def-service\register-web-launcher.ps1" -ToolboxRoot "%~dp0." >nul 2>nul
)

echo ============================================================
echo  Pelton Toolbox - Unified Local Service
echo ============================================================
echo  Used by CFX-Post batch export and CFX batch-to-DEF.
echo  Keep this window open while using local features.
echo  The web interface remains on GitHub Pages.
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0local-def-service\server.ps1" -NoBrowser
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  echo.
  echo [ERROR] Local service returned code: %ERR%
  echo See local-def-service\server-error.log for details.
  pause
)

endlocal
exit /b %ERR%
