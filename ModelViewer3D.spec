# -*- mode: python ; coding: utf-8 -*-
# PyInstaller yapılandırması — 3B Model Görüntüleyici
#
#   Tek dosya (varsayılan):   pyinstaller --noconfirm --clean ModelViewer3D.spec
#   Klasör (hızlı açılış):    MV3D_ONEDIR=1 pyinstaller --noconfirm --clean ModelViewer3D.spec
import os
import sys

ONEDIR = os.environ.get('MV3D_ONEDIR', '0') == '1'
IS_WIN = sys.platform == 'win32'
ICON = 'assets/app.ico' if IS_WIN else None

# Pillow eklentileri Image.open ile tembel yüklendiği için açıkça ekleniyor
PIL_PLUGINS = ['PIL.' + n for n in (
    'PngImagePlugin', 'JpegImagePlugin', 'TiffImagePlugin', 'PsdImagePlugin', 'DdsImagePlugin',
    'TgaImagePlugin', 'BmpImagePlugin', 'GifImagePlugin', 'WebPImagePlugin',
)]

# Görüntüleyicinin kullanmadığı Qt modülleri (paket boyutunu küçültür)
QT_EXCLUDES = ['PySide6.' + n for n in (
    'Qt3DCore', 'Qt3DRender', 'Qt3DInput', 'Qt3DLogic', 'Qt3DAnimation', 'Qt3DExtras',
    'QtCharts', 'QtDataVisualization', 'QtGraphs', 'QtGraphsWidgets', 'QtMultimedia',
    'QtMultimediaWidgets', 'QtSpatialAudio', 'QtBluetooth', 'QtNfc', 'QtSerialPort', 'QtSerialBus',
    'QtSensors', 'QtSql', 'QtTest', 'QtTextToSpeech', 'QtRemoteObjects', 'QtScxml', 'QtStateMachine',
    'QtHttpServer', 'QtQuick3D', 'QtDesigner', 'QtUiTools', 'QtHelp', 'QtAxContainer',
)]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('web', 'web'), ('assets', 'assets')],
    hiddenimports=[
        'PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets', 'PySide6.QtWebChannel',
        'PySide6.QtNetwork', 'PySide6.QtPrintSupport', *PIL_PLUGINS,
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pydoc_data', 'test', *QT_EXCLUDES],
    noarchive=False,
)
# QtWebEngine bağımlılık analizi QML eklentilerini ve onların çektiği büyük Qt
# kütüphanelerini (3D, Charts, Quick3D, Multimedia...) de toplar; widget tabanlı
# görüntüleyici bunları kullanmaz. Ayrıca Chromium dil paketlerinden yalnızca
# Türkçe ve İngilizce tutulur.
import re

_UNUSED_QT = re.compile(
    r'(^|[\\/])Qt6?(3D|Charts|DataVisualization|Graphs|Quick3D|Multimedia|SpatialAudio|Location|Sensors|'
    r'VirtualKeyboard|QuickControls2|QuickDialogs2|QuickTemplates2|QuickTimeline|QuickVectorImage|Labs|'
    r'Scxml|StateMachine|RemoteObjects|TextToSpeech|ShaderTools|QuickParticles)', re.I)
_LOCALES = re.compile(r'qtwebengine_locales[\\/](?!(tr|en-US)\.pak$)[^\\/]+\.pak$', re.I)


def _keep(entry):
    dest = entry[0].replace('\\', '/')
    if '/qml/' in dest or _UNUSED_QT.search(dest) or _LOCALES.search(dest):
        return False
    return True


a.binaries = [e for e in a.binaries if _keep(e)]
a.datas = [e for e in a.datas if _keep(e)]

pyz = PYZ(a.pure)

exe_options = dict(
    name='ModelViewer3D',
    debug=False,
    strip=False,
    upx=False,            # UPX, QtWebEngine ikili dosyalarını bozabildiği için kapalı
    console=False,        # pencereli uygulama (konsol açılmaz)
    icon=ICON,
    version='version_info.txt' if IS_WIN else None,
)

if ONEDIR:
    exe = EXE(pyz, a.scripts, [], exclude_binaries=True, **exe_options)
    coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='ModelViewer3D')
else:
    exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], runtime_tmpdir=None, **exe_options)
