@echo off
REM Double-click this file to publish the app for your phone.
REM It starts the backend, FunASR, the public frontend and two Cloudflare tunnels,
REM then prints a https URL you can open on the phone.
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0.tools\go-public.ps1"
echo.
echo ---------------------------------------------------------------
echo  Keep the PC awake while you use the app on the phone.
echo  To stop everything later, run stop-all.cmd.
echo  Press any key to close this window (services keep running).
echo ---------------------------------------------------------------
pause >nul
endlocal
