"""Kaynak klasörlerinin konumu (kaynak koddan ve PyInstaller paketinden çalışırken)."""
import os
import sys


def base_dir() -> str:
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


WEB_DIR = os.path.join(base_dir(), 'web')
ASSETS_DIR = os.path.join(base_dir(), 'assets')
