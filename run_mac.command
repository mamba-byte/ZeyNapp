#!/bin/bash
# 3B Model Görüntüleyici — macOS'ta çalıştırma (Finder'da çift tıklanabilir).
# İlk açılışta .venv sanal ortamını kurar (PySide6 ~400 MB, birkaç dakika), sonra doğrudan açılır.
# Terminalden:  ./run_mac.command [model.fbx] [--render-mode software] ...
cd "$(dirname "$0")" || exit 1

pause_exit() {
    read -n1 -r -p "Kapatmak için bir tuşa basın..."
    exit 1
}

if [ ! -x .venv/bin/python ]; then
    # PySide6 6.9 → Python 3.10–3.13 (Homebrew'un varsayılan python3'ü daha yeni olabilir)
    PY=""
    for v in 3.13 3.12 3.11 3.10; do
        for c in "python$v" "/opt/homebrew/bin/python$v" "/usr/local/bin/python$v" \
                 "/Library/Frameworks/Python.framework/Versions/$v/bin/python$v"; do
            if command -v "$c" >/dev/null 2>&1; then PY="$c"; break 2; fi
        done
    done
    if [ -z "$PY" ]; then
        echo "Python 3.10 – 3.13 bulunamadı. Kurmak için:  brew install python@3.13"
        pause_exit
    fi
    echo "İlk kurulum: sanal ortam oluşturuluyor ($PY)..."
    "$PY" -m venv .venv || pause_exit
    .venv/bin/python -m pip install --disable-pip-version-check -q --upgrade pip
    echo "Bağımlılıklar kuruluyor (birkaç dakika sürebilir)..."
    .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || pause_exit
fi

exec .venv/bin/python main.py "$@"
