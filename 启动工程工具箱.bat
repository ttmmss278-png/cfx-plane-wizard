@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title 冲击式水轮机工程工具箱

if not exist "dist\index.html" (
  echo ============================================================
  echo  首次启动：正在构建工程工具箱
  echo ============================================================
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [启动失败] 未找到 Node.js / npm。
    echo 请安装 Node.js 20 或更高版本后重试。
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
  echo [启动失败] 未找到 Windows PowerShell。
  pause
  exit /b 1
)

echo ============================================================
echo  冲击式水轮机工程工具箱
echo ============================================================
echo  本地服务正在启动，请保持此窗口开启。
echo  关闭网页后，可直接关闭本窗口。
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0local-def-service\server.ps1"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [启动失败] PowerShell 返回代码：%ERR%
  echo 请查看 local-def-service\server-error.log。
  pause
)

endlocal
exit /b %ERR%

:build_failed
echo.
echo [构建失败] 请检查上方 npm 错误信息。
pause
endlocal
exit /b 1
