@echo off
rem Runs setup.ps1 without changing the machine's PowerShell execution policy.
rem Usage: scripts\setup.cmd [-Force]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%
