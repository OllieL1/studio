@echo off
rem Studio - double-click to start on Windows.
title Studio
rem UTF-8, so the launcher's symbols display properly.
chcp 65001 >nul
cd /d "%~dp0studio"
"runtime\win-x64\node.exe" launcher.mjs
rem If Node itself failed to start, keep the error on screen.
if errorlevel 1 pause
