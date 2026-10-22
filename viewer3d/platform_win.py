"""Windows'a özgü küçük iyileştirmeler (koyu başlık çubuğu, görev çubuğu kimliği)."""
from __future__ import annotations

import sys


def set_app_user_model_id(app_id: str) -> None:
    """Görev çubuğunda python.exe yerine uygulamanın kendi simgesinin görünmesini sağlar."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
    except Exception:
        pass


def enable_dark_title_bar(win_id: int) -> None:
    """Windows 10 (1809+) ve 11'de pencere başlık çubuğunu koyu yapar."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        from ctypes import wintypes
        hwnd = wintypes.HWND(int(win_id))
        value = ctypes.c_int(1)
        for attr in (20, 19):  # DWMWA_USE_IMMERSIVE_DARK_MODE (yeni / eski build)
            if ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, attr, ctypes.byref(value), ctypes.sizeof(value)) == 0:
                break
    except Exception:
        pass
