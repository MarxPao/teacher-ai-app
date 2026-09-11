@echo off
title Teacher AI — Servidor Sidecar Manual
echo.
echo  =====================================================
echo   Teacher AI — Iniciando Sidecar de Homologacao Manual
echo  =====================================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERRO] Python nao encontrado no PATH.
    pause
    exit /b 1
)

echo  Abrindo painel web em http://localhost:8765...
start http://localhost:8765

echo  Iniciando servidor HTTP e conector CDP...
python sidecar\manual_runner.py
pause
