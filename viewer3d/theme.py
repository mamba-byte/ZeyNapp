"""Qt tarafı (menü çubuğu, iletişim kutuları) için koyu tema."""
from PySide6.QtGui import QColor, QFont, QPalette
from PySide6.QtWidgets import QApplication

ACCENT = '#3d8bfd'

QSS = f"""
QMainWindow {{ background: #16181c; }}
QMenuBar {{
    background: #1c1e23; color: #d6dae1; border-bottom: 1px solid #2a2d34;
    padding: 2px 6px; font-size: 9.5pt;
}}
QMenuBar::item {{ background: transparent; padding: 5px 11px; border-radius: 5px; }}
QMenuBar::item:selected {{ background: #2c3038; }}
QMenuBar::item:pressed {{ background: #333844; }}
QMenu {{
    background: #22252b; color: #d6dae1; border: 1px solid #343842;
    padding: 6px 0px; font-size: 9.5pt;
}}
QMenu::item {{ padding: 6px 34px 6px 28px; border-radius: 4px; margin: 0px 5px; }}
QMenu::item:selected {{ background: {ACCENT}; color: #ffffff; }}
QMenu::item:disabled {{ color: #666c77; }}
QMenu::separator {{ height: 1px; background: #343842; margin: 5px 10px; }}
QMenu::indicator {{ width: 14px; height: 14px; left: 8px; }}
QToolTip {{ background: #2a2e36; color: #e6e9ee; border: 1px solid #3a3f4a; padding: 4px 6px; }}
QMessageBox, QDialog {{ background: #22252b; }}
QMessageBox QLabel {{ color: #d6dae1; }}
QPushButton {{
    background: #2f333b; color: #e6e9ee; border: 1px solid #3c414c;
    border-radius: 6px; padding: 6px 16px; min-width: 72px;
}}
QPushButton:hover {{ background: #383d47; }}
QPushButton:default {{ background: {ACCENT}; border-color: {ACCENT}; color: white; }}
"""


def apply_dark_theme(app: QApplication) -> None:
    app.setStyle('Fusion')
    pal = QPalette()
    roles = {
        QPalette.ColorRole.Window: '#1c1e23',
        QPalette.ColorRole.WindowText: '#d6dae1',
        QPalette.ColorRole.Base: '#16181c',
        QPalette.ColorRole.AlternateBase: '#22252b',
        QPalette.ColorRole.ToolTipBase: '#2a2e36',
        QPalette.ColorRole.ToolTipText: '#e6e9ee',
        QPalette.ColorRole.Text: '#d6dae1',
        QPalette.ColorRole.Button: '#2a2d34',
        QPalette.ColorRole.ButtonText: '#e6e9ee',
        QPalette.ColorRole.BrightText: '#ffffff',
        QPalette.ColorRole.Highlight: ACCENT,
        QPalette.ColorRole.HighlightedText: '#ffffff',
        QPalette.ColorRole.Link: ACCENT,
        QPalette.ColorRole.PlaceholderText: '#7a808b',
    }
    for role, color in roles.items():
        pal.setColor(role, QColor(color))
    pal.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text, QColor('#666c77'))
    pal.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.WindowText, QColor('#666c77'))
    pal.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.ButtonText, QColor('#666c77'))
    app.setPalette(pal)
    font = QFont('Segoe UI', 9)
    font.setStyleHint(QFont.StyleHint.SansSerif)
    app.setFont(font)
    app.setStyleSheet(QSS)
