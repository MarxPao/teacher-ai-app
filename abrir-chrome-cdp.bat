@echo off
title Abrindo Chrome CDP (Depuracao Remota)

echo ============================================================
echo   🌐 ABRINDO GOOGLE CHROME PARA AUTOMAÇÃO CDP (PORTA 9222)
echo ============================================================

set CHROME_EXE="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_EXE% (
    set CHROME_EXE="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_EXE% (
    set CHROME_EXE="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

%CHROME_EXE% --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\TeacherAI_ChromeProfile" "http://localhost:3000/sandbox/portal_mock.html"

echo Chrome iniciado com sucesso na porta 9222!
