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

set USER_DATA_DIR="%LOCALAPPDATA%\Google\Chrome\User Data"

echo Perfil Alvo: "Profile 1" (Rafaela ELT)
echo Diretorio de Dados: %USER_DATA_DIR%
echo Porta CDP: 9222
echo.
echo [AVISO] Se o Chrome ja estiver aberto sem porta CDP (9222), feche todas as janelas do Chrome antes de executar.
echo.

start "" %CHROME_EXE% --remote-debugging-port=9222 --user-data-dir=%USER_DATA_DIR% --profile-directory="Profile 1" --restore-last-session

echo Chrome iniciado com sucesso na porta 9222 com perfil Rafaela ELT!
