@echo off
title Teacher AI — Conectar Navegador

echo.
echo  =====================================================
echo   Teacher AI — Preparando Navegador Dedicado
echo  =====================================================
echo.

REM Encontra Python no PATH ou em locais comuns
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON=python
) else (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set PYTHON="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set PYTHON="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    ) else (
        echo  [ERRO] Python nao encontrado. Instale Python 3.11+ em https://python.org
        pause
        exit /b 1
    )
)

REM Caminho do launcher (relativo a este .bat que fica na raiz do projeto)
set SCRIPT=%~dp0sidecar\chrome_launcher.py

if not exist "%SCRIPT%" (
    echo  [ERRO] chrome_launcher.py nao encontrado em: %SCRIPT%
    pause
    exit /b 1
)

echo  Abrindo Chrome com perfil dedicado do Teacher AI...
echo  (Suas abas e perfil pessoal do Chrome nao serao afetados)
echo.

%PYTHON% "%SCRIPT%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  Navegador pronto! Pode fechar esta janela.
) else (
    echo.
    echo  Algo deu errado. Veja as mensagens acima.
    pause
)
