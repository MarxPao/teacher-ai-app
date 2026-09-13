@echo off
REM Chrome Native Messaging Host Launcher for Teacher AI
REM Passes stdin/stdout directly to the Python host script

set PYTHON_CMD="C:\Users\rafae\AppData\Local\Python\pythoncore-3.14-64\python.exe"
if not exist %PYTHON_CMD% (
    set PYTHON_CMD=python
)

%PYTHON_CMD% "%~dp0teacherai_native_host.py" %*
