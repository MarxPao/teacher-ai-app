@echo off
title Teacher AI - Gravador de Habilidades
cd /d "%~dp0\sidecar"

echo ============================================================
echo   TEACHER AI - RECEPTOR DE GRAVACOES (LOTE 2)
echo ============================================================
echo.
echo Servidor de gravacao iniciado na porta 7779.
echo (Dica: se o Teacher AI estiver aberto no navegador em localhost:3000,
echo  voce nem precisa deste arquivo aberto!)
echo.

python skill_recorder.py --port 7779
pause
