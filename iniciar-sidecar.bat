@echo off
title Teacher AI — Sidecar Desktop
cd /d "%~dp0\sidecar"

echo ============================================================
echo   🦉 INICIANDO TEACHER AI SIDECAR DESKTOP
echo ============================================================

set PYTHON_EXE="%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
if exist %PYTHON_EXE% (
    %PYTHON_EXE% main.py
) else (
    python main.py
)

pause
