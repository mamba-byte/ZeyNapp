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
    p.add_argument('--debug', action='store_true', help='Ayrıntılı günlük ve geliştirici araçları')
    p.add_argument('--serve-only', action='store_true', help='Yalnızca web sunucusunu başlat (tarayıcıda geliştirme için)')
    p.add_argument('--port', type=int, default=0, help='--serve-only için port')
    args, _unknown = p.parse_known_args(argv)
    return args


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
    except OSError:
        pass
    logging.basicConfig(level=level, format='%(asctime)s %(levelname)s %(name)s: %(message)s', handlers=handlers)
    return log_path


def _chromium_flags(software_gl: bool) -> None:
    flags = os.environ.get('QTWEBENGINE_CHROMIUM_FLAGS', '').split()
    wanted = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding']
    if software_gl:
        wanted += ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    for f in wanted:
        if f not in flags:
            flags.append(f)
    os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = ' '.join(flags)


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

    _chromium_flags(args.software_gl)

    from PySide6.QtCore import QCoreApplication, Qt
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import QApplication

    from . import platform_win, theme
    from .main_window import MainWindow

    platform_win.set_app_user_model_id(APP_ID)
    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv[:1])
    app.setApplicationName(f'{APP_NAME} ({args.profile})' if args.profile else APP_NAME)
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
                     initial_shading=args.shading, debug=args.debug, log_path=log_path)
    win.show()
    code = app.exec()
    server.stop()
    return code
