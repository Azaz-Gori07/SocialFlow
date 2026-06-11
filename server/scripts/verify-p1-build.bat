@echo off
cd /d D:\Git-Projects\SocialFlow\server
call npm run build 1>nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo BUILD_OK
) else (
  echo BUILD_FAIL
  call npm run build
)
