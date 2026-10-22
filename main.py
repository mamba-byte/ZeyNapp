"""3B Model Görüntüleyici — giriş noktası.

Kullanım:
    python main.py [model_dosyası] [--capture cikti.png] [--shading wire] [--software-gl] [--debug]
"""
import sys

from viewer3d.app import run

if __name__ == '__main__':
    sys.exit(run(sys.argv))
