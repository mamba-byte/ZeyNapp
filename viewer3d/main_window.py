"""Ana pencere: üst menü çubuğu, QWebEngineView içinde Three.js görüntüleyici."""
from __future__ import annotations

import json
import logging
import os
import sys
from functools import partial
from urllib.parse import quote

from PySide6.QtCore import QEvent, QObject, QPoint, QProcess, QSettings, Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QActionGroup, QDesktopServices, QImage, QKeySequence
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow, QMessageBox, QWidget

from . import APP_NAME, APP_VERSION, platform_win
from .app import RENDER_MODES
from .bridge import Bridge
from .server import AssetServer

log = logging.getLogger('viewer3d')
jslog = logging.getLogger('viewer3d.js')

MODEL_EXTS = ('.fbx', '.glb', '.gltf', '.obj', '.stl', '.ply', '.dae', '.3mf')
IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.tga', '.bmp', '.tif', '.tiff', '.psd', '.webp', '.dds', '.gif')
MODEL_FILTER = ('3B Modeller (*.fbx *.glb *.gltf *.obj *.stl *.ply *.dae *.3mf);;'
                'FBX (*.fbx);;glTF (*.glb *.gltf);;Wavefront OBJ (*.obj);;STL (*.stl);;Tüm dosyalar (*)')
IMAGE_FILTER = 'Görseller (*.png *.jpg *.jpeg *.tga *.bmp *.tif *.tiff *.psd *.webp *.dds);;Tüm dosyalar (*)'

SHADING_MODES = [
    ('lit', 'Işıklı (Lit)', '1'),
    ('litwire', 'Işıklı Tel Kafes (Lit Wireframe)', '2'),
    ('wire', 'Tel Kafes (Unlit Wireframe)', '3'),
    ('unlit', 'Işıksız / Albedo (Unlit)', '4'),
    ('clay', 'Kil / Matcap', '5'),
]
TECHNICAL_MODES = [
    ('normals', 'Normal Haritası'),
    ('uv', 'UV Dama Testi (Checkerboard)'),
    ('vcolor', 'Vertex Renkleri'),
]
THEMES = [
    ('default', 'Varsayılan'), ('sunset', 'Gün Batımı / Sıcak'), ('cool', 'Soğuk / Siyan'),
    ('neon', 'Neon Yeşil'), ('neutral', 'Nötr Gri'), ('purple', 'Yumuşak Mor'),
    ('contrast', 'Yüksek Kontrast Siyah'), ('studio', 'Parlak Beyaz Stüdyo'), ('multicolor', 'Çok Renkli Kontrast'),
]
MAX_RECENT = 10
RENDER_MODE_LABELS = {
    'auto': 'Otomatik (GPU / Direct3D)',
    'compat': 'GPU – uyumluluk modu',
    'software': 'Yazılımsal (SwiftShader)',
    'nogpu': 'GPU kapalı (en uyumlu)',
}
JS_READY_TIMEOUT_MS = 20000


class ViewerPage(QWebEnginePage):
    """JS konsol mesajlarını günlüğe aktarır, dış bağlantıları sistem tarayıcısında açar."""

    def __init__(self, base_url: str, parent=None):
        super().__init__(parent)
        self._base = base_url

    def javaScriptConsoleMessage(self, level, message, line, source):
        lvl = {
            QWebEnginePage.JavaScriptConsoleMessageLevel.InfoMessageLevel: logging.INFO,
            QWebEnginePage.JavaScriptConsoleMessageLevel.WarningMessageLevel: logging.WARNING,
            QWebEnginePage.JavaScriptConsoleMessageLevel.ErrorMessageLevel: logging.ERROR,
        }.get(level, logging.INFO)
        jslog.log(lvl, '%s  (%s:%s)', message, source.rsplit('/', 1)[-1], line)

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        if url.toString().startswith(self._base) or url.scheme() in ('data', 'blob', 'about'):
            return True
        if url.scheme() in ('http', 'https'):
            QDesktopServices.openUrl(url)
        return False


class DropFilter(QObject):
    """Dosya sürükle-bırakını web motoruna ulaşmadan yakalar (tam dosya yolunu almak için).

    Not: Filtre QApplication geneline değil, yalnızca QWebEngineView ve onun iç
    widget'ına kurulur; uygulama geneli Python filtresi QtWebEngine ile çöküyor.
    """

    def __init__(self, window: 'MainWindow'):
        super().__init__(window)
        self._win = window
        self._watched: set[int] = set()

    def attach(self, widget: QWidget) -> None:
        if id(widget) in self._watched:
            return
        self._watched.add(id(widget))
        widget.installEventFilter(self)
        for child in widget.findChildren(QWidget):
            self.attach(child)

    def eventFilter(self, obj, ev):
        t = ev.type()
        if t == QEvent.Type.ChildAdded:
            child = ev.child()
            if child is not None and child.isWidgetType():
                QTimer.singleShot(0, partial(self.attach, child))
            return False
        if t not in (QEvent.Type.DragEnter, QEvent.Type.DragMove, QEvent.Type.Drop):
            return False
        md = ev.mimeData()
        if not md.hasUrls():
            return False
        paths = [u.toLocalFile() for u in md.urls() if u.isLocalFile()]
        if not paths:
            return False
        ev.setDropAction(Qt.DropAction.CopyAction)
        ev.accept()
        if t == QEvent.Type.Drop:
            global_pos = obj.mapToGlobal(ev.position().toPoint())
            self._win.handle_drop(paths, self._win.view.mapFromGlobal(global_pos))
        return True


class MainWindow(QMainWindow):
    def __init__(self, server: AssetServer, initial_file: str | None = None, capture_path: str | None = None,
                 initial_shading: str | None = None, debug: bool = False, log_path: str | None = None,
                 render_mode: str = 'auto'):
        super().__init__()
        self.server = server
        self.settings = QSettings()
        self.current_file: str | None = None
        self.capture_path = capture_path
        self.initial_file = initial_file
        self.initial_shading = initial_shading
        self.log_path = log_path
        self._js_ready = False
        self._pending_js: list[str] = []
        self._state: dict = {}
        self._state_actions: dict[str, QAction] = {}
        self._model_actions: list[QAction] = []
        self._devtools = None
        self.render_mode = render_mode
        self._boot_seen = False
        self._failure_handled = False
        self._crashes = 0
        # Arayüz belirli sürede "hazır" demezse (WebGL/GPU takılması) kurtarma akışını başlat
        self._watchdog = QTimer(self)
        self._watchdog.setSingleShot(True)
        self._watchdog.timeout.connect(self._on_watchdog)

        self.setWindowTitle(APP_NAME)
        self.setMinimumSize(960, 600)
        self.setAcceptDrops(True)

        self.view = QWebEngineView(self)
        self.view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.page = ViewerPage(server.base_url, self.view)
        s = self.page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, False)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.FocusOnNavigationEnabled, True)
        self.page.setBackgroundColor(Qt.GlobalColor.black)
        self.page.renderProcessTerminated.connect(self._on_render_process_terminated)
        self.page.profile().downloadRequested.connect(self._on_download_requested)

        self.bridge = Bridge(self)
        server.api_handler = self.bridge.handle_api

        self.view.setPage(self.page)
        self.setCentralWidget(self.view)
        self._drop_filter = DropFilter(self)
        self._drop_filter.attach(self.view)
        self.page.loadFinished.connect(lambda _ok: self._drop_filter.attach(self.view))
        self.page.loadFinished.connect(self._on_load_finished)

        self._build_menus()
        self._update_model_actions(False)
        self._restore_geometry()
        if debug:
            QTimer.singleShot(1500, self.open_devtools)

        # belirteç, arayüzün /api köprüsünü kullanabilmesi için adreste taşınır
        self.view.load(QUrl(f'{server.base_url}/index.html?t={server.token}'))

    # --------------------------------------------------------------- web setup
    def showEvent(self, ev):
        super().showEvent(ev)
        platform_win.enable_dark_title_bar(int(self.winId()))

    def js(self, command: str, payload=None) -> None:
        code = (f'window.viewerApp && window.viewerApp.command('
                f'{json.dumps(command)}, {json.dumps(payload)});')
        if self._js_ready:
            self.page.runJavaScript(code)
        else:
            self._pending_js.append(code)

    def on_js_ready(self) -> None:
        self._js_ready = True
        self._watchdog.stop()
        log.info('Arayüz hazır.')
        pending, self._pending_js = self._pending_js, []
        for code in pending:
            self.page.runJavaScript(code)
        if self.initial_shading:
            self.js('setShading', self.initial_shading)
        if self.initial_file:
            path, self.initial_file = self.initial_file, None
            self.open_model(path)

    # ------------------------------------------------------------------- menus
    def _action(self, menu, text, slot=None, shortcut=None, hint=None, state_key=None,
                needs_model=False, group=None, data=None) -> QAction:
        act = QAction(text + (f'\t{hint}' if hint else ''), self)
        if shortcut:
            act.setShortcut(QKeySequence(shortcut))
            act.setShortcutContext(Qt.ShortcutContext.WindowShortcut)
        if state_key or group is not None:
            act.setCheckable(True)
        if state_key:
            self._state_actions[state_key] = act
        if group is not None:
            group.addAction(act)
        if data is not None:
            act.setData(data)
        if slot is not None:
            act.triggered.connect(lambda _checked=False, s=slot: s())
        if needs_model:
            self._model_actions.append(act)
        menu.addAction(act)
        return act

    def _build_menus(self) -> None:
        mb = self.menuBar()
        js = self.js

        m = mb.addMenu('&Dosya')
        self._action(m, 'Aç…', self.open_file_dialog, 'Ctrl+O')
        self.recent_menu = m.addMenu('Son Açılanlar')
        self._rebuild_recent_menu()
        self._action(m, 'Yeniden Yükle', self.reload_model, 'F5', needs_model=True)
        self._action(m, 'Modeli Kapat', partial(js, 'closeModel'), 'Ctrl+W', needs_model=True)
        m.addSeparator()
        self._action(m, 'Ekran Görüntüsü Al…', partial(js, 'screenshot', {'transparent': False}), 'Ctrl+Shift+S')
        self._action(m, 'Ekran Görüntüsü (Şeffaf Arka Plan)…', partial(js, 'screenshot', {'transparent': True}))
        self._action(m, 'Görüntüyü Panoya Kopyala', partial(js, 'screenshot', {'clipboard': True}), 'Ctrl+Shift+C')
        m.addSeparator()
        self._action(m, 'Ayarları Kaydet…', partial(js, 'exportSettings'))
        self._action(m, 'Ayarları Yükle…', self.import_settings_dialog)
        m.addSeparator()
        self._action(m, 'Çıkış', self.close, 'Ctrl+Q')

        m = mb.addMenu('Dü&zenle')
        self._action(m, 'Seçili Parçaya Doku Ata…', partial(js, 'requestTexture'), needs_model=True)
        self._action(m, 'Tüm Materyalleri Sıfırla', partial(js, 'resetMaterials'), needs_model=True)
        m.addSeparator()
        self._action(m, 'Seçimi Temizle', partial(js, 'clearSelection'), hint='Esc', needs_model=True)
        self._action(m, 'Seçili Parçayı Gizle', partial(js, 'hideSelected'), hint='H', needs_model=True)
        self._action(m, 'Seçili Parçayı Yalıt', partial(js, 'isolateSelected'), hint='I', needs_model=True)
        self._action(m, 'Tüm Parçaları Göster', partial(js, 'showAll'), hint='U', needs_model=True)

        m = mb.addMenu('&Görüntüle')
        self.shading_group = QActionGroup(self)
        self.shading_group.setExclusive(True)
        for mode, label, key in SHADING_MODES:
            self._action(m, label, partial(js, 'setShading', mode), hint=key, group=self.shading_group, data=mode)
        tech = m.addMenu('Teknik İnceleme Modları')
        for mode, label in TECHNICAL_MODES:
            self._action(tech, label, partial(js, 'setShading', mode), hint='6', group=self.shading_group, data=mode)
        m.addSeparator()
        self._action(m, 'Zemin Izgarası', partial(js, 'toggle', 'grid'), hint='G', state_key='grid')
        self._action(m, 'Gölge Yakalayıcı Zemin', partial(js, 'toggle', 'shadowCatcher'), state_key='shadowCatcher')
        self._action(m, 'Eksen Göstergesi', partial(js, 'toggle', 'axes'), hint='X', state_key='axes')
        self._action(m, 'Sınır Kutusu', partial(js, 'toggle', 'bbox'), hint='B', state_key='bbox')
        self._action(m, 'Normal Vektörleri', partial(js, 'toggle', 'normalLines'), state_key='normalLines')
        m.addSeparator()
        self._action(m, 'Kamerayı Sıfırla / Ekrana Sığdır', partial(js, 'resetCamera'), hint='F / Home')
        self._action(m, 'Seçili Parçaya Odakla', partial(js, 'focusSelection'), hint='.', needs_model=True)
        views = m.addMenu('Standart Görünümler')
        for key, label in (('front', 'Ön'), ('back', 'Arka'), ('left', 'Sol'), ('right', 'Sağ'),
                           ('top', 'Üst'), ('bottom', 'Alt'), ('iso', 'İzometrik')):
            self._action(views, label, partial(js, 'view', key))
        self._action(m, 'Ortografik Kamera', partial(js, 'toggle', 'ortho'), hint='P', state_key='ortho')
        m.addSeparator()
        self._action(m, 'Sağ Panel', partial(js, 'toggle', 'panel'), hint='N', state_key='panel')
        self._action(m, 'Animasyon Çubuğu', partial(js, 'toggle', 'animBar'), state_key='animBar')
        self.fullscreen_action = self._action(m, 'Tam Ekran', self.toggle_fullscreen, 'F11')
        self.fullscreen_action.setCheckable(True)

        m = mb.addMenu('&Araçlar')
        rot = m.addMenu('Modeli Döndür')
        for axis, deg, label in (('x', 90, 'X ekseninde +90°'), ('x', -90, 'X ekseninde −90°'),
                                 ('y', 90, 'Y ekseninde +90°'), ('z', 90, 'Z ekseninde +90°')):
            self._action(rot, label, partial(js, 'rotateModel', {'axis': axis, 'deg': deg}), needs_model=True)
        rot.addSeparator()
        self._action(rot, 'Döndürmeyi Sıfırla', partial(js, 'rotateModel', {'reset': True}), needs_model=True)
        self._action(m, 'Otomatik Döndür (Turntable)', partial(js, 'toggle', 'autoRotate'), hint='R',
                     state_key='autoRotate')
        self._action(m, 'Dokuları Göster', partial(js, 'toggle', 'textures'), hint='T', state_key='textures')
        themes = m.addMenu('Ortam Temaları')
        self.theme_group = QActionGroup(self)
        for tid, label in THEMES:
            self._action(themes, label, partial(js, 'theme', tid), group=self.theme_group, data=tid)
        m.addSeparator()
        engine = m.addMenu('Görüntüleme Motoru')
        self.render_group = QActionGroup(self)
        for mode in RENDER_MODES:
            act = self._action(engine, RENDER_MODE_LABELS[mode], partial(self._choose_render_mode, mode),
                               group=self.render_group, data=mode)
            act.setChecked(mode == self.render_mode)
        self._action(m, 'Geliştirici Araçları', self.open_devtools, 'Ctrl+Shift+I')

        m = mb.addMenu('&Yardım')
        self._action(m, 'Klavye Kısayolları', partial(js, 'showHelp', {'topic': 'shortcuts'}), 'F1')
        self._action(m, 'Desteklenen Formatlar', partial(js, 'showHelp', {'topic': 'formats'}))
        self._action(m, 'Günlük Klasörünü Aç', self.open_log_folder)
        m.addSeparator()
        self._action(m, 'Hakkında', self.show_about)

    def _update_model_actions(self, has_model: bool) -> None:
        for act in self._model_actions:
            act.setEnabled(has_model)

    def apply_js_state(self, state: dict) -> None:
        self._state.update(state)
        for key, act in self._state_actions.items():
            if key in state:
                act.blockSignals(True)
                act.setChecked(bool(state[key]))
                act.blockSignals(False)
        if 'shading' in state:
            for act in self.shading_group.actions():
                act.setChecked(act.data() == state['shading'])
        if 'theme' in state:
            for act in self.theme_group.actions():
                act.setChecked(act.data() == state['theme'])
        if 'hasModel' in state:
            self._update_model_actions(bool(state['hasModel']))
            name = state.get('modelName') if state['hasModel'] else None
            self.setWindowTitle(f'{name} — {APP_NAME}' if name else APP_NAME)

    # ------------------------------------------------------------- recent files
    def _recent(self) -> list[str]:
        value = self.settings.value('recentFiles', [])
        if isinstance(value, str):
            value = [value]
        return [p for p in (value or []) if isinstance(p, str)]

    def _add_recent(self, path: str) -> None:
        items = [p for p in self._recent() if os.path.normcase(p) != os.path.normcase(path)]
        items.insert(0, path)
        self.settings.setValue('recentFiles', items[:MAX_RECENT])
        self._rebuild_recent_menu()

    def _rebuild_recent_menu(self) -> None:
        self.recent_menu.clear()
        items = self._recent()
        for i, path in enumerate(items):
            act = self.recent_menu.addAction(f'&{(i + 1) % 10}  {os.path.basename(path)}')
            act.setToolTip(path)
            act.setStatusTip(path)
            act.triggered.connect(partial(self.open_model, path))
        if items:
            self.recent_menu.addSeparator()
            self.recent_menu.addAction('Listeyi Temizle', self._clear_recent)
        else:
            self.recent_menu.addAction('(boş)').setEnabled(False)

    def _clear_recent(self) -> None:
        self.settings.setValue('recentFiles', [])
        self._rebuild_recent_menu()

    def _last_dir(self) -> str:
        return str(self.settings.value('lastDir', os.path.expanduser('~')))

    # ----------------------------------------------------------------- loading
    def open_file_dialog(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, '3B Model Aç', self._last_dir(), MODEL_FILTER)
        if path:
            self.open_model(path)

    def open_model(self, path: str) -> None:
        if not os.path.isfile(path):
            QMessageBox.warning(self, APP_NAME, f'Dosya bulunamadı:\n{path}')
            return
        ext = os.path.splitext(path)[1].lower()
        if ext not in MODEL_EXTS:
            QMessageBox.warning(self, APP_NAME, f'Desteklenmeyen dosya türü: {ext or "(uzantısız)"}')
            return
        self.settings.setValue('lastDir', os.path.dirname(path))
        self.current_file = path
        self._add_recent(path)
        log.info('Model açılıyor: %s', path)
        self.js('openModel', self.server.describe_file(path))

    def reload_model(self) -> None:
        if self.current_file:
            self.open_model(self.current_file)

    def _texture_payload(self, path: str) -> dict:
        info = self.server.describe_file(path)
        info['url'] = f"{info['resolveBase']}?p={quote(info['name'], safe='')}"
        return info

    def handle_drop(self, paths: list[str], pos: QPoint) -> None:
        models = [p for p in paths if os.path.splitext(p)[1].lower() in MODEL_EXTS]
        images = [p for p in paths if os.path.splitext(p)[1].lower() in IMAGE_EXTS]
        configs = [p for p in paths if p.lower().endswith('.json')]
        if models:
            self.open_model(models[0])
        elif images:
            payload = self._texture_payload(images[0])
            payload.update({'slot': 'map', 'x': pos.x(), 'y': pos.y()})
            self.js('assignTexture', payload)
        elif configs:
            self._import_settings_file(configs[0])
        else:
            self.js('toast', {'text': 'Desteklenmeyen dosya türü.', 'kind': 'error'})

    def choose_texture(self, payload: dict) -> None:
        path, _ = QFileDialog.getOpenFileName(self, 'Doku Seç', self._last_dir(), IMAGE_FILTER)
        if path:
            payload.update(self._texture_payload(path))
            self.js('assignTexture', payload)

    # ----------------------------------------------------------------- saving
    def save_image(self, data: bytes, suggested: str) -> None:
        start = os.path.join(str(self.settings.value('shotDir', os.path.expanduser('~'))), suggested)
        path, flt = QFileDialog.getSaveFileName(self, 'Ekran Görüntüsünü Kaydet', start,
                                                'PNG görüntüsü (*.png);;JPEG görüntüsü (*.jpg *.jpeg)')
        if not path:
            return
        self.settings.setValue('shotDir', os.path.dirname(path))
        try:
            if path.lower().endswith(('.jpg', '.jpeg')):
                img = QImage.fromData(data, 'PNG')
                flat = QImage(img.size(), QImage.Format.Format_RGB32)
                flat.fill(Qt.GlobalColor.white)
                from PySide6.QtGui import QPainter
                painter = QPainter(flat)
                painter.drawImage(0, 0, img)
                painter.end()
                if not flat.save(path, 'JPG', 95):
                    raise OSError('JPEG kaydedilemedi')
            else:
                if not path.lower().endswith('.png'):
                    path += '.png'
                with open(path, 'wb') as f:
                    f.write(data)
        except OSError as exc:
            QMessageBox.critical(self, APP_NAME, f'Görüntü kaydedilemedi:\n{exc}')
            return
        self.js('toast', {'text': f'Kaydedildi: {os.path.basename(path)}', 'kind': 'success'})

    def copy_image(self, data: bytes) -> None:
        img = QImage.fromData(data, 'PNG')
        QApplication.clipboard().setImage(img)
        self.js('toast', {'text': 'Görüntü panoya kopyalandı.', 'kind': 'success'})

    def export_settings(self, content: str, suggested: str) -> None:
        start = os.path.join(self._last_dir(), suggested)
        path, _ = QFileDialog.getSaveFileName(self, 'Ayarları Kaydet', start, 'Ayar dosyası (*.json)')
        if not path:
            return
        if not path.lower().endswith('.json'):
            path += '.json'
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
        except OSError as exc:
            QMessageBox.critical(self, APP_NAME, f'Ayarlar kaydedilemedi:\n{exc}')
            return
        self.js('toast', {'text': f'Ayarlar kaydedildi: {os.path.basename(path)}', 'kind': 'success'})

    def import_settings_dialog(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, 'Ayarları Yükle', self._last_dir(), 'Ayar dosyası (*.json)')
        if path:
            self._import_settings_file(path)

    def _import_settings_file(self, path: str) -> None:
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except (OSError, ValueError) as exc:
            QMessageBox.critical(self, APP_NAME, f'Ayar dosyası okunamadı:\n{exc}')
            return
        self.js('applySettings', data)

    def save_preferences(self, payload: str) -> None:
        self.settings.setValue('viewer/preferences', payload)

    def load_preferences(self) -> str:
        return str(self.settings.value('viewer/preferences', '') or '')

    # ------------------------------------------------------------- JS events
    def on_js_event(self, kind: str, data: dict) -> None:
        if kind == 'loaded':
            log.info('Yüklendi: %s', json.dumps(data, ensure_ascii=False))
            if self.capture_path:
                QTimer.singleShot(1200, partial(self.js, 'capture'))
        elif kind == 'loadError':
            log.error('Yükleme hatası: %s', data.get('message'))
            if self.capture_path:
                QApplication.instance().exit(2)
        elif kind == 'boot':
            self._boot_seen = True
            log.info('Arayüz betikleri çalışıyor: %s', data.get('userAgent', ''))
        elif kind == 'ready':
            log.info('WebGL hazır: %s', data.get('gl', '?'))
        elif kind == 'fatal':
            log.error('Görüntüleme başlatılamadı: %s', data.get('message'))
            self._render_failure('WebGL başlatılamadı: ' + str(data.get('error') or data.get('message') or ''))

    def finish_capture(self, data: bytes) -> None:
        if not self.capture_path:
            return
        with open(self.capture_path, 'wb') as f:
            f.write(data)
        log.info('Ekran görüntüsü yazıldı: %s', self.capture_path)
        QTimer.singleShot(50, QApplication.instance().quit)

    # ------------------------------------------------------------------ misc
    def toggle_fullscreen(self) -> None:
        if self.isFullScreen():
            self.showMaximized() if self.settings.value('wasMaximized', False, type=bool) else self.showNormal()
        else:
            self.settings.setValue('wasMaximized', self.isMaximized())
            self.showFullScreen()
        self.fullscreen_action.setChecked(self.isFullScreen())

    def open_devtools(self) -> None:
        if self._devtools is None:
            self._devtools = QWebEngineView()
            self._devtools.setWindowTitle('Geliştirici Araçları')
            self._devtools.resize(1100, 700)
            self.page.setDevToolsPage(self._devtools.page())
        self._devtools.show()
        self._devtools.raise_()

    def open_log_folder(self) -> None:
        if self.log_path:
            QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.dirname(self.log_path)))

    def show_about(self) -> None:
        from PySide6 import __version__ as pyside_version
        from PySide6.QtCore import qVersion
        self.js('showHelp', {'topic': 'about', 'info': {
            'version': APP_VERSION,
            'python': sys.version.split()[0],
            'qt': qVersion(),
            'pyside': pyside_version,
            'log': self.log_path or '',
        }})

    def _on_download_requested(self, download) -> None:
        # Köprü yoksa (yedek yol) web tarafı indirme bağlantısı kullanır.
        path, _ = QFileDialog.getSaveFileName(self, 'Kaydet', os.path.join(self._last_dir(),
                                                                            download.downloadFileName()))
        if not path:
            download.cancel()
            return
        download.setDownloadDirectory(os.path.dirname(path))
        download.setDownloadFileName(os.path.basename(path))
        download.accept()

    def _on_render_process_terminated(self, status, code) -> None:
        log.error('Web işlemi sonlandı (durum=%s, kod=%s)', status, code)
        self._js_ready = False
        self._crashes += 1
        if self._crashes >= 2:
            self._render_failure(f'Görüntüleme işlemi tekrar tekrar çöktü (kod {code}).')
            return
        QMessageBox.warning(self, APP_NAME, 'Görüntüleme motoru beklenmedik şekilde kapandı ve yeniden başlatılacak.')
        if self.current_file:
            self.initial_file = self.current_file
        self.view.reload()

    # ------------------------------------------------------ render recovery
    def _on_load_finished(self, ok: bool) -> None:
        log.info('Arayüz sayfası yüklendi: %s', 'başarılı' if ok else 'BAŞARISIZ')
        if not ok:
            log.error('Arayüz sayfası yüklenemedi (%s/index.html)', self.server.base_url)
        if not self._js_ready:
            self._watchdog.start(JS_READY_TIMEOUT_MS)

    def _on_watchdog(self) -> None:
        if self._js_ready:
            return
        if self._boot_seen:
            reason = 'Arayüz başladı ancak 3B motor (WebGL) zamanında açılamadı; GPU veya sürücü takılıyor olabilir.'
        else:
            reason = 'Arayüz betikleri hiç çalışmadı.'
        log.error('Bekçi zaman aşımı: %s', reason)
        self._render_failure(reason)

    def _next_render_mode(self) -> str | None:
        idx = RENDER_MODES.index(self.render_mode) if self.render_mode in RENDER_MODES else -1
        return RENDER_MODES[idx + 1] if idx + 1 < len(RENDER_MODES) else None

    def _render_failure(self, reason: str) -> None:
        if self.capture_path:
            QApplication.instance().exit(3)
            return
        if self._failure_handled:
            return
        self._failure_handled = True
        nxt = self._next_render_mode()
        log_hint = f'\n\nGünlük dosyası:\n{self.log_path}' if self.log_path else ''
        if nxt is None:
            QMessageBox.critical(self, APP_NAME,
                                 f'3B görüntüleme motoru hiçbir modda başlatılamadı.\n\n{reason}{log_hint}')
            return
        answer = QMessageBox.question(
            self, APP_NAME,
            f'3B görüntüleme motoru başlatılamadı.\n\n{reason}\n\n'
            f'Şu anki mod: {RENDER_MODE_LABELS.get(self.render_mode, self.render_mode)}\n'
            f'Uygulama "{RENDER_MODE_LABELS[nxt]}" moduyla yeniden başlatılsın mı?{log_hint}',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No, QMessageBox.StandardButton.Yes)
        if answer == QMessageBox.StandardButton.Yes:
            self.restart_with_render_mode(nxt)

    def _choose_render_mode(self, mode: str) -> None:
        if mode == self.render_mode:
            return
        answer = QMessageBox.question(
            self, APP_NAME,
            f'Görüntüleme motoru "{RENDER_MODE_LABELS[mode]}" olarak değiştirilecek.\n'
            'Değişikliğin uygulanması için uygulama yeniden başlatılsın mı?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No, QMessageBox.StandardButton.Yes)
        if answer == QMessageBox.StandardButton.Yes:
            self.restart_with_render_mode(mode)
        else:
            for act in self.render_group.actions():
                act.setChecked(act.data() == self.render_mode)

    def restart_with_render_mode(self, mode: str) -> None:
        self.settings.setValue('render/mode', mode)
        self.settings.sync()
        # komut satırındaki mod seçimini çıkar (yoksa kaydedilen modu ezer)
        args, skip = [], False
        for a in sys.argv[1:]:
            if skip:
                skip = False
            elif a == '--render-mode':
                skip = True
            elif a != '--software-gl' and not a.startswith('--render-mode='):
                args.append(a)
        reopen = self.current_file or self.initial_file
        if reopen:
            args = [a for a in args if a.startswith('-') or not os.path.isfile(a)]
            args.insert(0, reopen)
        if getattr(sys, 'frozen', False):
            program, program_args = sys.executable, args
        else:
            program, program_args = sys.executable, [os.path.abspath(sys.argv[0]), *args]
        log.info('Yeniden başlatılıyor (mod=%s): %s %s', mode, program, program_args)
        started = QProcess.startDetached(program, program_args)
        ok = started[0] if isinstance(started, tuple) else bool(started)
        if not ok:
            QMessageBox.warning(self, APP_NAME, 'Uygulama otomatik olarak yeniden başlatılamadı. Lütfen elle tekrar açın; '
                                                'seçilen görüntüleme modu kaydedildi.')
        QTimer.singleShot(0, QApplication.instance().quit)

    def _restore_geometry(self) -> None:
        geo = self.settings.value('window/geometry')
        if geo is not None:
            self.restoreGeometry(geo)
        else:
            screen = QApplication.primaryScreen().availableGeometry()
            self.resize(min(1480, int(screen.width() * 0.85)), min(920, int(screen.height() * 0.85)))

    def closeEvent(self, ev):
        self.settings.setValue('window/geometry', self.saveGeometry())
        if self._devtools is not None:
            self._devtools.close()
        super().closeEvent(ev)
