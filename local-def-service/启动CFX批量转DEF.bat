@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title CFX批量转DEF - 本地网页服务
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL%" (
  echo [启动失败] 未找到 Windows PowerShell。
  echo 路径：%POWERSHELL%
  pause
  exit /b 1
)

if not exist "%~dp0server.ps1" (
  echo [启动失败] 未找到 server.ps1，请完整解压工具包后再运行。
  pause
  exit /b 1
)

echo ============================================================
echo  CFX 批量转 DEF - 本地网页服务
echo ============================================================
echo  正在启动，请勿关闭此窗口。
echo  网页关闭后，可在网页中点击“退出工具”，或直接关闭本窗口。
echo.

"%POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0server.ps1"
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  echo.
  echo [启动失败] PowerShell 返回代码：%ERR%
  echo 请查看同目录下的 server-error.log。
  pause
)

endlocal
exit /b %ERR%
