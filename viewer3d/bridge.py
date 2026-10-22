"""JavaScript <-> Python köprüsü (QWebChannel üzerinden ``bridge`` nesnesi)."""
from __future__ import annotations

import base64
import json
import logging
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Slot

if TYPE_CHECKING:
    from .main_window import MainWindow

log = logging.getLogger('viewer3d.js')


def decode_data_url(data_url: str) -> bytes:
    _, _, payload = data_url.partition(',')
    return base64.b64decode(payload)


class Bridge(QObject):
    """Web arayüzünün çağırdığı yuvalar; işi ana pencereye devreder."""

    def __init__(self, window: 'MainWindow'):
        super().__init__(window)
        self._win = window

    @Slot()
    def ready(self) -> None:
        self._win.on_js_ready()

    @Slot()
    def openFileDialog(self) -> None:
        self._win.open_file_dialog()

    @Slot()
    def reloadModel(self) -> None:
        self._win.reload_model()

    @Slot(str, str)
    def saveImage(self, data_url: str, suggested_name: str) -> None:
        self._win.save_image(decode_data_url(data_url), suggested_name)

    @Slot(str)
    def copyImage(self, data_url: str) -> None:
        self._win.copy_image(decode_data_url(data_url))

    @Slot(str)
    def deliverCapture(self, data_url: str) -> None:
        self._win.finish_capture(decode_data_url(data_url))

    @Slot(str, str)
    def exportSettings(self, content: str, suggested_name: str) -> None:
        self._win.export_settings(content, suggested_name)

    @Slot()
    def importSettingsDialog(self) -> None:
        self._win.import_settings_dialog()

    @Slot(str)
    def chooseTexture(self, payload: str) -> None:
        self._win.choose_texture(json.loads(payload or '{}'))

    @Slot(str)
    def reportState(self, payload: str) -> None:
        self._win.apply_js_state(json.loads(payload or '{}'))

    @Slot(str, str)
    def notify(self, kind: str, payload: str) -> None:
        self._win.on_js_event(kind, json.loads(payload or '{}'))

    @Slot(str)
    def savePreferences(self, payload: str) -> None:
        self._win.save_preferences(payload)

    @Slot(result=str)
    def loadPreferences(self) -> str:
        return self._win.load_preferences()

    @Slot()
    def toggleFullscreen(self) -> None:
        self._win.toggle_fullscreen()

    @Slot(str, str)
    def log(self, level: str, message: str) -> None:
        getattr(log, level if level in ('debug', 'info', 'warning', 'error') else 'info')(message)
