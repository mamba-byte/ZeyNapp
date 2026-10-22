@echo off
rem Gelistirme: uygulamayi kaynak koddan calistirir (once build_exe.bat veya
rem "python -m venv .venv && .venv\Scripts\pip install -r requirements.txt" gerekir).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Once sanal ortami kurun:  build_exe.bat   veya   py -3.13 -m venv .venv
    exit /b 1
)
".venv\Scripts\python.exe" main.py %*
