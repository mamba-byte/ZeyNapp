@echo off
rem ============================================================
rem  3B Model Goruntuleyici - Windows .exe derleme betigi
rem
rem  Kullanim:
rem     build_exe.bat            -> tek dosya:  dist\ModelViewer3D.exe
rem     build_exe.bat onedir     -> klasor:     dist\ModelViewer3D\ModelViewer3D.exe
rem                                 (daha hizli acilir, dagitim icin klasoru zipleyin)
rem ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title 3B Model Goruntuleyici - EXE derleme

set "MODE=onefile"
if /i "%~1"=="onedir" set "MODE=onedir"

rem --- 1) Uygun Python surumunu bul (PySide6 6.9: Python 3.10 - 3.13) -------
set "PY="
for %%V in (3.13 3.12 3.11 3.10) do (
    if not defined PY (
        py -%%V -c "pass" >nul 2>nul && set "PY=py -%%V"
    )
)
if not defined PY (
    python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)" >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo [HATA] Python 3.10 - 3.13 bulunamadi.
    echo        https://www.python.org/downloads/windows/ adresinden Python 3.13 kurun
    echo        ^(kurulumda "Add python.exe to PATH" secenegini isaretleyin^).
    exit /b 1
)
echo Kullanilan Python: %PY%

rem --- 2) Sanal ortam ------------------------------------------------------
if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Sanal ortam olusturuluyor ^(.venv^)...
    %PY% -m venv .venv || goto :fail
)
set "VPY=.venv\Scripts\python.exe"

rem --- 3) Bagimliliklar ----------------------------------------------------
echo [2/4] Bagimliliklar kuruluyor ^(ilk seferde birkac dakika surebilir^)...
"%VPY%" -m pip install --disable-pip-version-check -q --upgrade pip || goto :fail
"%VPY%" -m pip install --disable-pip-version-check -q -r requirements.txt -r requirements-build.txt || goto :fail

rem --- 4) Ikon -------------------------------------------------------------
echo [3/4] Ikon kontrol ediliyor...
if not exist "assets\app.ico" (
    "%VPY%" tools\make_icon.py || goto :fail
)

rem --- 5) PyInstaller ------------------------------------------------------
echo [4/4] PyInstaller ile derleniyor ^(%MODE%^)...
if /i "%MODE%"=="onedir" (set "MV3D_ONEDIR=1") else (set "MV3D_ONEDIR=0")
"%VPY%" -m PyInstaller --noconfirm --clean ModelViewer3D.spec || goto :fail

echo.
echo ============================================================
if /i "%MODE%"=="onedir" (
    echo  Tamamlandi:  dist\ModelViewer3D\ModelViewer3D.exe
) else (
    echo  Tamamlandi:  dist\ModelViewer3D.exe
)
echo ============================================================
exit /b 0

:fail
echo.
echo [HATA] Derleme basarisiz oldu. Yukaridaki mesajlari kontrol edin.
exit /b 1
