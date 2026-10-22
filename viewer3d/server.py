"""Yerel HTTP sunucusu.

Web arayüzünü (web/ klasörü) ve açılan modellerin klasörlerini yalnızca
127.0.0.1 üzerinden sunar. Model dosyalarının içindeki doku yolları
(mutlak Windows yolları, ``..\\textures\\x.png`` gibi göreli yollar,
yanlış uzantılar) ``/resolve`` uç noktasında akıllı bir aramayla çözülür;
tarayıcının çözemediği formatlar (TIF, PSD, DDS) Pillow ile PNG'ye çevrilir.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import secrets
import shutil
import threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlsplit

log = logging.getLogger(__name__)

# Windows kayıt defteri .js için "text/plain" döndürebildiğinden (ES modülleri
# bu durumda yüklenmez) içerik türleri burada sabitlenir.
CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.ktx2': 'image/ktx2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.txt': 'text/plain; charset=utf-8',
    '.mtl': 'text/plain; charset=utf-8',
    '.obj': 'text/plain; charset=utf-8',
}

BROWSER_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.ico', '.svg'}
CONVERTIBLE_EXTS = {'.tga', '.tif', '.tiff', '.psd', '.dds'}
IMAGE_EXTS = BROWSER_IMAGE_EXTS | CONVERTIBLE_EXTS | {'.ktx2', '.exr', '.hdr'}

_ABS_WIN = re.compile(r'^[A-Za-z]:/')
_INDEX_FILE_BUDGET = 20000


def _is_within(path: str, root: str) -> bool:
    try:
        common = os.path.commonpath([os.path.realpath(path), root])
        return os.path.normcase(common) == os.path.normcase(root)
    except ValueError:  # farklı sürücüler
        return False


def convert_image(path: str, fmt: str) -> bytes:
    """Görseli Pillow ile PNG veya TGA baytlarına çevirir."""
    from PIL import Image  # isteğe bağlı bağımlılık

    with Image.open(path) as im:
        im.load()
        if im.mode in ('I;16', 'I;16B', 'I;16L', 'I'):
            im = im.point(lambda v: v / 256).convert('L')
        if im.mode not in ('RGB', 'RGBA'):
            has_alpha = 'A' in im.getbands() or 'transparency' in im.info
            im = im.convert('RGBA' if has_alpha else 'RGB')
        buf = io.BytesIO()
        if fmt == 'PNG':
            im.save(buf, 'PNG', compress_level=1)
        else:
            im.save(buf, fmt)
        return buf.getvalue()


class AssetServer:
    """Arayüzü ve model klasörlerini sunan iş parçacıklı HTTP sunucusu."""

    def __init__(self, web_root: str, port: int = 0):
        self.web_root = os.path.realpath(web_root)
        self._mounts: dict[str, str] = {}
        self._indexes: dict[str, dict] = {}
        self._converted: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        # JS -> Python köprüsü: /api/<yöntem> POST istekleri bu belirteçle doğrulanır.
        # api_handler(yöntem, argümanlar) sunucu iş parçacığında çağrılır.
        self.token = secrets.token_hex(16)
        self.api_handler = None
        self.httpd = ThreadingHTTPServer(('127.0.0.1', port), _Handler)
        self.httpd.daemon_threads = True
        self.httpd.app = self  # type: ignore[attr-defined]
        self.port = self.httpd.server_address[1]
        self._thread = threading.Thread(target=self.httpd.serve_forever, name='asset-server', daemon=True)

    @property
    def base_url(self) -> str:
        return f'http://127.0.0.1:{self.port}'

    def start(self) -> None:
        self._thread.start()
        log.info('Varlık sunucusu: %s', self.base_url)

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

    # ------------------------------------------------------------------ mounts
    def mount(self, directory: str) -> str:
        directory = os.path.realpath(directory)
        with self._lock:
            for mid, d in self._mounts.items():
                if d == directory:
                    self._indexes.pop(d, None)  # klasör değişmiş olabilir
                    return mid
            mid = secrets.token_hex(8)
            self._mounts[mid] = directory
            return mid

    def describe_file(self, path: str) -> dict:
        """JS tarafının dosyayı yüklemek için ihtiyaç duyduğu URL bilgilerini üretir."""
        path = os.path.realpath(path)
        mid = self.mount(os.path.dirname(path))
        name = os.path.basename(path)
        prefix = f'{self.base_url}/files/{mid}/'
        return {
            'url': prefix + quote(name, safe=''),
            'name': name,
            'ext': os.path.splitext(name)[1].lower().lstrip('.'),
            'size': os.path.getsize(path),
            'path': path,
            'mountPrefix': prefix,
            'resolveBase': f'{self.base_url}/resolve/{mid}',
        }

    # --------------------------------------------------------------- resolving
    def _index(self, base: str) -> dict:
        with self._lock:
            cached = self._indexes.get(base)
        if cached is not None:
            return cached
        files: dict[str, str] = {}
        stems: dict[str, list[str]] = {}
        budget = _INDEX_FILE_BUDGET
        roots = [(base, 4)]
        parent = os.path.dirname(base)
        if parent and parent != base:
            roots.append((parent, 2))
        for root, max_depth in roots:
            for dirpath, dirnames, filenames in os.walk(root):
                depth = dirpath[len(root):].count(os.sep)
                if depth >= max_depth:
                    dirnames[:] = []
                dirnames[:] = [d for d in dirnames if not d.startswith('.')]
                for fn in filenames:
                    low = fn.lower()
                    full = os.path.join(dirpath, fn)
                    files.setdefault(low, full)
                    stem, ext = os.path.splitext(low)
                    if ext in IMAGE_EXTS:
                        stems.setdefault(stem, []).append(full)
                budget -= len(filenames)
                if budget <= 0:
                    break
        index = {'files': files, 'stems': stems}
        with self._lock:
            self._indexes[base] = index
        return index

    def resolve(self, mount_id: str, raw: str) -> str | None:
        base = self._mounts.get(mount_id)
        if not base or not raw:
            return None
        variants: list[str] = []
        for v in (raw, unquote(raw)):
            v = v.strip().strip('"').replace('\\', '/')
            if v.lower().startswith('file:'):
                v = re.sub(r'^file:/*', '', v, flags=re.I)
                if not _ABS_WIN.match(v):
                    v = '/' + v
            while v.startswith('./'):
                v = v[2:]
            if v and v not in variants:
                variants.append(v)
        if not variants:
            return None
        req_ext = os.path.splitext(variants[0])[1].lower()
        parent = os.path.dirname(base)

        for v in variants:
            if _ABS_WIN.match(v) or v.startswith('/'):
                cand = os.path.normpath(v)
                if os.path.isfile(cand) and (req_ext in IMAGE_EXTS or _is_within(cand, base)):
                    return cand
            else:
                cand = os.path.normpath(os.path.join(base, v))
                if os.path.isfile(cand) and (
                    req_ext in IMAGE_EXTS or _is_within(cand, base) or _is_within(cand, parent)
                ):
                    return cand

        index = self._index(base)
        names = []
        for v in variants:
            name = v.rstrip('/').rsplit('/', 1)[-1]
            if name and name not in names:
                names.append(name)
        for name in names:
            hit = index['files'].get(name.lower())
            if hit:
                return hit
        if req_ext in IMAGE_EXTS:
            for name in names:
                cands = index['stems'].get(os.path.splitext(name)[0].lower(), [])
                cands = sorted(cands, key=lambda p: os.path.splitext(p)[1].lower() not in BROWSER_IMAGE_EXTS)
                if cands:
                    return cands[0]
        return None

    def mounted_file(self, mount_id: str, rel: str) -> str | None:
        base = self._mounts.get(mount_id)
        if not base:
            return None
        cand = os.path.normpath(os.path.join(base, rel))
        if _is_within(cand, base) and os.path.isfile(cand):
            return cand
        return None

    def converted_bytes(self, path: str, fmt: str) -> bytes | None:
        key = (path, os.path.getmtime(path), fmt)
        with self._lock:
            data = self._converted.get(key)
            if data is not None:
                self._converted.move_to_end(key)
                return data
        try:
            data = convert_image(path, fmt)
        except Exception as exc:  # Pillow yok veya format desteklenmiyor
            log.warning('Doku dönüştürülemedi (%s): %s', path, exc)
            return None
        with self._lock:
            self._converted[key] = data
            while len(self._converted) > 48:
                self._converted.popitem(last=False)
        return data

    def static_file(self, rel: str) -> str | None:
        cand = os.path.normpath(os.path.join(self.web_root, rel.lstrip('/')))
        if _is_within(cand, self.web_root) and os.path.isfile(cand):
            return cand
        return None


class _Handler(BaseHTTPRequestHandler):
    server_version = 'ModelViewer3D'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):  # sessiz
        pass

    def do_GET(self):
        self._handle(send_body=True)

    def do_HEAD(self):
        self._handle(send_body=False)

    def do_POST(self):
        app: AssetServer = self.server.app  # type: ignore[attr-defined]
        path = urlsplit(self.path).path
        try:
            if not path.startswith('/api/') or app.api_handler is None:
                self._send_error(404)
                return
            if not secrets.compare_digest(self.headers.get('X-MV-Token', ''), app.token):
                self._send_error(403)
                return
            length = int(self.headers.get('Content-Length') or 0)
            args = json.loads(self.rfile.read(length).decode('utf-8') or '[]') if length else []
            if not isinstance(args, list):
                args = [args]
            result = app.api_handler(path[len('/api/'):], args)
            self._send_bytes(json.dumps({'result': result}).encode('utf-8'), 'application/json; charset=utf-8', True)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception:
            log.exception('API isteği başarısız: %s', path)
            self._send_error(500)

    def _handle(self, send_body: bool) -> None:
        app: AssetServer = self.server.app  # type: ignore[attr-defined]
        parts = urlsplit(self.path)
        path = unquote(parts.path)
        try:
            if path.startswith('/files/'):
                segs = path.split('/', 3)
                found = app.mounted_file(segs[2], segs[3]) if len(segs) == 4 else None
                self._send_path(found, send_body)
            elif path.startswith('/resolve/'):
                mid = path[len('/resolve/'):].strip('/')
                raw = parse_qs(parts.query).get('p', [''])[0]
                found = app.resolve(mid, raw)
                self._send_resolved(app, found, raw, send_body)
            else:
                if path in ('', '/'):
                    path = '/index.html'
                self._send_path(app.static_file(path), send_body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def _send_resolved(self, app: AssetServer, found: str | None, raw: str, send_body: bool) -> None:
        if not found:
            self._send_error(404)
            return
        req_ext = os.path.splitext(unquote(raw).replace('\\', '/'))[1].lower()
        ext = os.path.splitext(found)[1].lower()
        if req_ext in IMAGE_EXTS or ext in IMAGE_EXTS:
            want_tga = req_ext == '.tga'
            raw_ok = (ext == '.tga') if want_tga else (ext in BROWSER_IMAGE_EXTS or ext not in CONVERTIBLE_EXTS)
            if not raw_ok:
                data = app.converted_bytes(found, 'TGA' if want_tga else 'PNG')
                if data is None:
                    self._send_error(415)
                    return
                self._send_bytes(data, 'application/octet-stream' if want_tga else 'image/png', send_body)
                return
        self._send_path(found, send_body)

    def _send_error(self, code: int) -> None:
        body = f'{code}'.encode()
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, data: bytes, ctype: str, send_body: bool) -> None:
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def _send_path(self, path: str | None, send_body: bool) -> None:
        if not path:
            self._send_error(404)
            return
        ext = os.path.splitext(path)[1].lower()
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header('Content-Type', CONTENT_TYPES.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(size))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if send_body:
            with open(path, 'rb') as f:
                shutil.copyfileobj(f, self.wfile, 1024 * 1024)
