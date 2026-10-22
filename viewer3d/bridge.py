"""JavaScript <-> Python köprüsü.

JS -> Python: Arayüz, yerel sunucunun ``/api/<yöntem>`` uç noktasına gizli belirteçle POST eder.
İstek sunucu iş parçacığında gelir; pencereyle ilgili işler Qt sinyaliyle ana iş parçacığına
aktarılır. (QWebChannel, Windows paketinde arayüzle bağlantı kuramadığı için kullanılmıyor.)

Python -> JS: ``QWebEnginePage.runJavaScript`` ile ``viewerApp.command(...)`` çağrılır.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, Qt, Signal, Slot

if TYPE_CHECKING:
    from .main_window import MainWindow

log = logging.getLogger('viewer3d.bridge')
jslog = logging.getLogger('viewer3d.js')

GUI_METHODS = {
    'ready', 'openFileDialog', 'reloadModel', 'saveImage', 'copyImage', 'deliverCapture',
    'exportSettings', 'importSettingsDialog', 'chooseTexture', 'reportState', 'notify',
    'savePreferences', 'toggleFullscreen',
}


def decode_data_url(data_url: str) -> bytes:
    _, _, payload = data_url.partition(',')
    return base64.b64decode(payload)


class Bridge(QObject):
    _invoke = Signal(str, str)

    def __init__(self, window: 'MainWindow'):
        super().__init__(window)
        self._win = window
        # sunucu iş parçacığından okunur; yalnızca ana iş parçacığında değiştirilir
        self.preferences = window.load_preferences()
        self._invoke.connect(self._dispatch, Qt.ConnectionType.QueuedConnection)

    # ------------------------------------------------- sunucu iş parçacığı
    def handle_api(self, method: str, args: list) -> Any:
        if method == 'log':
            level, message = (list(args) + ['info', ''])[:2]
            lvl = level if level in ('debug', 'info', 'warning', 'error') else 'info'
            getattr(jslog, lvl)(str(message))
            return True
        if method == 'loadPreferences':
            return self.preferences
        if method not in GUI_METHODS:
            raise ValueError(f'Bilinmeyen köprü yöntemi: {method}')
        self._invoke.emit(method, json.dumps(args))
        return True

    # ------------------------------------------------- ana (GUI) iş parçacığı
    @Slot(str, str)
    def _dispatch(self, method: str, args_json: str) -> None:
        args = json.loads(args_json)
        arg = lambda i, default=None: args[i] if len(args) > i else default  # noqa: E731
        w = self._win
        try:
            if method == 'ready':
                w.on_js_ready()
            elif method == 'openFileDialog':
                w.open_file_dialog()
            elif method == 'reloadModel':
                w.reload_model()
            elif method == 'saveImage':
                w.save_image(decode_data_url(arg(0, '')), arg(1, 'goruntu.png'))
            elif method == 'copyImage':
                w.copy_image(decode_data_url(arg(0, '')))
            elif method == 'deliverCapture':
                w.finish_capture(decode_data_url(arg(0, '')))
            elif method == 'exportSettings':
                w.export_settings(arg(0, '{}'), arg(1, 'ayarlar.json'))
            elif method == 'importSettingsDialog':
                w.import_settings_dialog()
            elif method == 'chooseTexture':
                w.choose_texture(dict(arg(0) or {}))
            elif method == 'reportState':
                w.apply_js_state(dict(arg(0) or {}))
            elif method == 'notify':
                w.on_js_event(str(arg(0, '')), dict(arg(1) or {}))
            elif method == 'savePreferences':
                self.preferences = str(arg(0, ''))
                w.save_preferences(self.preferences)
            elif method == 'toggleFullscreen':
                w.toggle_fullscreen()
        except Exception:
            log.exception('Köprü çağrısı başarısız: %s', method)
