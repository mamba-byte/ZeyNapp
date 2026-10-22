"""Uygulama girişi: komut satırı, Chromium bayrakları, Qt uygulaması ve sunucu."""
from __future__ import annotations

import argparse
import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from . import APP_ID, APP_NAME, APP_VERSION
from .paths import ASSETS_DIR, WEB_DIR
from .server import AssetServer

log = logging.getLogger('viewer3d')


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog=APP_ID, description=APP_NAME)
    p.add_argument('file', nargs='?', help='Açılacak model dosyası')
    p.add_argument('--capture', metavar='PNG', help='Modeli yükle, ekran görüntüsünü kaydet ve çık')
    p.add_argument('--shading', metavar='MOD', help='Başlangıç gölgelendirme modu (lit, litwire, wire, unlit, clay, normals, uv, vcolor)')
    p.add_argument('--profile', metavar='AD', help='Ayrı bir ayar profili kullan (ör. test veya sunum için)')
    p.add_argument('--software-gl', action='store_true', help='GPU sorunlarında yazılımsal (SwiftShader) WebGL kullan')
    p.add_argument('--render-mode', choices=RENDER_MODES, help='Görüntüleme motoru: auto (GPU) veya software (yazılımsal)')
    p.add_argument('--debug', action='store_true', help='Ayrıntılı günlük ve geliştirici araçları')
    p.add_argument('--serve-only', action='store_true', help='Yalnızca web sunucusunu başlat (tarayıcıda geliştirme için)')
    p.add_argument('--port', type=int, default=0, help='--serve-only için port')
    args, _unknown = p.parse_known_args(argv)
    return args


_crash_file = None


def _enable_crash_log(path: str) -> None:
    """Yerel kodda çökme (erişim ihlali vb.) olursa Python yığınını crash.log'a yazar."""
    import faulthandler

    global _crash_file
    if os.path.exists(path) and os.path.getsize(path) > 512_000:
        os.remove(path)
    _crash_file = open(path, 'a', encoding='utf-8')
    faulthandler.enable(_crash_file, all_threads=True)


def _setup_logging(debug: bool) -> str | None:
    level = logging.DEBUG if debug else logging.INFO
    handlers: list[logging.Handler] = []
    if sys.stderr is not None:
        handlers.append(logging.StreamHandler())
    log_path = None
    try:
        base = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), '.local', 'share')
        log_dir = os.path.join(base, APP_ID)
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, 'viewer.log')
        handlers.append(RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=2, encoding='utf-8'))
        _enable_crash_log(os.path.join(log_dir, 'crash.log'))
    except OSError:
        pass
    logging.basicConfig(level=level, format='%(asctime)s %(levelname)s %(name)s: %(message)s', handlers=handlers)
    return log_path


# Görüntüleme motoru modları (Windows CI testleriyle doğrulandı):
#  auto     — Chromium varsayılanı, Windows'ta GPU üzerinde Direct3D 11.
#  software — WebGL yazılımsal (SwiftShader), sayfa birleştirme yazılımsal. GPU yoksa, GPU kara
#             listedeyse (ör. sanal makine / "Microsoft Basic Render Driver") veya sürücü sorunluysa.
# Not: Qt WebEngine Windows'ta sayfayı yalnızca Direct3D 11 paylaşımlı dokularıyla aktarabilir;
# SwiftShader kullanırken birleştirme yazılımsal yapılmazsa süreç çöker. "--disable-gpu" ise
# bu Chromium sürümünde WebGL'i tamamen kapattığı için 3B görüntüleyicide kullanılamaz.
RENDER_MODES = ('auto', 'software')
RENDER_FLAGS = {
    'auto': ['--enable-unsafe-swiftshader'],
    'software': ['--disable-gpu-compositing', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}


def settings_app_name(profile: str | None) -> str:
    return f'{APP_NAME} ({profile})' if profile else APP_NAME


def _resolve_render_mode(args: argparse.Namespace) -> str:
    if args.render_mode:
        return args.render_mode
    if args.software_gl:
        return 'software'
    try:
        from PySide6.QtCore import QSettings
        mode = str(QSettings(APP_ID, settings_app_name(args.profile)).value('render/mode', 'auto'))
    except Exception:
        mode = 'auto'
    return mode if mode in RENDER_MODES else 'auto'


def _chromium_flags(mode: str) -> None:
    flags = os.environ.get('QTWEBENGINE_CHROMIUM_FLAGS', '').split()
    for f in ['--disable-renderer-backgrounding', *RENDER_FLAGS[mode]]:
        if f not in flags:
            flags.append(f)
    os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = ' '.join(flags)
    log.info('Görüntüleme modu: %s  (Chromium bayrakları: %s)', mode, os.environ['QTWEBENGINE_CHROMIUM_FLAGS'])


def _install_qt_message_handler() -> None:
    """Qt ve QtWebEngine uyarılarını (pencereli exe'de görünmezler) günlük dosyasına yönlendirir."""
    from PySide6.QtCore import QtMsgType, qInstallMessageHandler

    qt_log = logging.getLogger('viewer3d.qt')
    levels = {
        QtMsgType.QtDebugMsg: logging.DEBUG,
        QtMsgType.QtInfoMsg: logging.INFO,
        QtMsgType.QtWarningMsg: logging.WARNING,
        QtMsgType.QtCriticalMsg: logging.ERROR,
        QtMsgType.QtFatalMsg: logging.CRITICAL,
    }

    def handler(msg_type, _context, message):
        qt_log.log(levels.get(msg_type, logging.INFO), message)

    qInstallMessageHandler(handler)


def _serve_only(port: int, file: str | None) -> int:
    import json
    from urllib.parse import quote

    server = AssetServer(WEB_DIR, port)
    url = f'{server.base_url}/index.html'
    if file:
        url += '?open=' + quote(json.dumps(server.describe_file(os.path.abspath(file))))
    print(f'Web arayüzü: {url}  (Ctrl+C ile durdurun)', flush=True)
    try:
        server.httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def run(argv: list[str]) -> int:
    args = _parse_args(argv[1:])
    log_path = _setup_logging(args.debug)
    log.info('%s %s başlatılıyor (Python %s)', APP_NAME, APP_VERSION, sys.version.split()[0])
    if args.serve_only:
        return _serve_only(args.port, args.file)

    render_mode = _resolve_render_mode(args)
    _chromium_flags(render_mode)
    _install_qt_message_handler()

    from PySide6.QtCore import QCoreApplication, Qt
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import QApplication

    from . import platform_win, theme
    from .main_window import MainWindow

    platform_win.set_app_user_model_id(APP_ID)
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv[:1])
    app.setApplicationName(settings_app_name(args.profile))
    app.setOrganizationName(APP_ID)
    app.setApplicationVersion(APP_VERSION)
    theme.apply_dark_theme(app)
    for icon_name in ('app.ico', 'app.png'):
        icon_path = os.path.join(ASSETS_DIR, icon_name)
        if os.path.exists(icon_path):
            app.setWindowIcon(QIcon(icon_path))
            break

    server = AssetServer(WEB_DIR)
    server.start()
    initial = os.path.abspath(args.file) if args.file else None
    win = MainWindow(server, initial_file=initial, capture_path=args.capture,
                     initial_shading=args.shading, debug=args.debug, log_path=log_path,
                     render_mode=render_mode)
    win.show()
    code = app.exec()
    server.stop()
    return code
