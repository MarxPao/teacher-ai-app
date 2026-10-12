@echo off
REM [DEPRECATED] @deprecated Native Host Python legado. O host canônico de produção v2 é
REM dist-desktop/shim.bat (compilado de desktop/native-host/shim.ts). Consulte docs/desktop/INSTALL.md.

set PYTHON_CMD="C:\Users\rafae\AppData\Local\Python\pythoncore-3.14-64\python.exe"
if not exist %PYTHON_CMD% (
    set PYTHON_CMD=python
)

%PYTHON_CMD% "%~dp0teacherai_native_host.py" %*
