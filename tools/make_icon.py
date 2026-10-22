"""Uygulama ikonunu (assets/app.png ve assets/app.ico) QPainter ile çizer.

Kullanım:  python tools/make_icon.py
"""
import os
import sys

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QGuiApplication, QImage, QLinearGradient, QPainter, QPainterPath, QPen, QPolygonF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')


def draw(size: int) -> QImage:
    img = QImage(size, size, QImage.Format.Format_ARGB32)
    img.fill(Qt.GlobalColor.transparent)
    p = QPainter(img)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    s = size / 256.0
    bg = QLinearGradient(0, 0, 0, size)
    bg.setColorAt(0, QColor('#25324d'))
    bg.setColorAt(1, QColor('#10141d'))
    path = QPainterPath()
    path.addRoundedRect(QRectF(8 * s, 8 * s, 240 * s, 240 * s), 52 * s, 52 * s)
    p.fillPath(path, QBrush(bg))
    p.setPen(QPen(QColor(255, 255, 255, 28), 2 * s))
    p.drawPath(path)

    c = QPointF(128 * s, 134 * s)
    r = 78 * s
    top = QPointF(c.x(), c.y() - r)
    left = QPointF(c.x() - r * 0.866, c.y() - r * 0.5)
    right = QPointF(c.x() + r * 0.866, c.y() - r * 0.5)
    bl = QPointF(c.x() - r * 0.866, c.y() + r * 0.5)
    br = QPointF(c.x() + r * 0.866, c.y() + r * 0.5)
    bottom = QPointF(c.x(), c.y() + r)
    faces = [
        ([top, right, c, left], '#7db4ff'),
        ([left, c, bottom, bl], '#3d8bfd'),
        ([c, right, br, bottom], '#2459b8'),
    ]
    p.setPen(Qt.PenStyle.NoPen)
    for pts, color in faces:
        p.setBrush(QColor(color))
        p.drawPolygon(QPolygonF(pts))
    pen = QPen(QColor(230, 242, 255, 230), 5 * s)
    pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
    p.setPen(pen)
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawPolygon(QPolygonF([top, right, br, bottom, bl, left]))
    p.drawLine(c, left)
    p.drawLine(c, right)
    p.drawLine(c, bottom)
    thin = QPen(QColor(230, 242, 255, 110), 2.2 * s)
    p.setPen(thin)
    p.drawLine(QPointF((left.x() + top.x()) / 2, (left.y() + top.y()) / 2), QPointF((c.x() + right.x()) / 2, (c.y() + right.y()) / 2))
    p.drawLine(QPointF((top.x() + right.x()) / 2, (top.y() + right.y()) / 2), QPointF((left.x() + c.x()) / 2, (left.y() + c.y()) / 2))
    p.end()
    return img


def main() -> None:
    QGuiApplication.instance() or QGuiApplication(sys.argv[:1])
    os.makedirs(OUT, exist_ok=True)
    draw(256).save(os.path.join(OUT, 'app.png'))
    ico_path = os.path.join(OUT, 'app.ico')
    try:  # Windows için çok boyutlu ICO (Pillow)
        from PIL import Image
        Image.open(os.path.join(OUT, 'app.png')).save(
            ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    except ImportError:
        draw(256).save(ico_path, 'ICO')
    print('İkon yazıldı:', ico_path)


if __name__ == '__main__':
    main()
