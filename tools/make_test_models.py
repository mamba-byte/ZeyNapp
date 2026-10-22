"""Görüntüleyiciyi denemek için küçük örnek modeller üretir (yalnızca standart kütüphane).

Kullanım:  python tools/make_test_models.py [çıktı_klasörü]

Üretilenler:
  torus_knot.stl            Binary STL (Z-yukarı)
  crate/crate.obj (+ .mtl)  İki materyalli OBJ; dokular textures/ alt klasöründe,
                            biri ters eğik çizgili göreli yol, biri var olmayan mutlak
                            Windows yolu (.tga) ile referanslanır -> akıllı doku arama testi
  animated.glb              Vertex renkli, iki animasyonlu glTF (Döndür / Zıpla)
"""
import json
import math
import os
import struct
import sys
import zlib


def write_png(path, w, h, pixel):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def write_tga(path, w, h, pixel):
    header = struct.pack('<BBBHHBHHHHBB', 0, 0, 2, 0, 0, 0, 0, 0, w, h, 24, 0)
    data = bytearray()
    for y in range(h - 1, -1, -1):  # alttan üste
        for x in range(w):
            r, g, b = pixel(x, y)
            data.extend((b, g, r))
    with open(path, 'wb') as f:
        f.write(header + bytes(data))


def make_stl(path):
    tris = []
    P, Q, R, r = 2, 3, 1.0, 0.32
    seg, sides = 240, 20
    def knot(t):
        q = Q * t
        x = (R + 0.4 * math.cos(q)) * math.cos(P * t)
        y = (R + 0.4 * math.cos(q)) * math.sin(P * t)
        z = 0.4 * math.sin(q)
        return (x, y, z)
    def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
    def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    def norm(a):
        l = math.sqrt(sum(c * c for c in a)) or 1
        return (a[0] / l, a[1] / l, a[2] / l)
    rings = []
    for i in range(seg):
        t = i / seg * 2 * math.pi
        p0, p1 = knot(t), knot(t + 0.01)
        T = norm(sub(p1, p0))
        N = norm(cross(T, (0, 0, 1)))
        B = cross(T, N)
        ring = []
        for j in range(sides):
            a = j / sides * 2 * math.pi
            ring.append(tuple(p0[k] + r * (math.cos(a) * N[k] + math.sin(a) * B[k]) + (1.0 if k == 2 else 0) for k in range(3)))
        rings.append(ring)
    for i in range(seg):
        for j in range(sides):
            a, b = rings[i][j], rings[(i + 1) % seg][j]
            c, d = rings[(i + 1) % seg][(j + 1) % sides], rings[i][(j + 1) % sides]
            for tri in ((a, b, c), (a, c, d)):
                n = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])))
                tris.append((n, tri))
    with open(path, 'wb') as f:
        f.write(b'Test torus knot'.ljust(80, b' '))
        f.write(struct.pack('<I', len(tris)))
        for n, (a, b, c) in tris:
            f.write(struct.pack('<12fH', *n, *a, *b, *c, 0))


CUBE_FACES = [  # normal, 4 köşe
    ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ((1, 0, 0), [(1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1)]),
    ((-1, 0, 0), [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)]),
    ((0, 1, 0), [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
    ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),
]
UVS = [(0, 0), (1, 0), (1, 1), (0, 1)]


def make_obj(folder):
    os.makedirs(os.path.join(folder, 'textures'), exist_ok=True)
    write_png(os.path.join(folder, 'textures', 'checker.png'), 256, 256,
              lambda x, y: (235, 120, 40) if ((x // 32) + (y // 32)) % 2 else (40, 44, 52))
    write_tga(os.path.join(folder, 'textures', 'wood.tga'), 128, 128,
              lambda x, y: (int(150 + 50 * math.sin(x * 0.35 + math.sin(y * 0.05) * 3)), 95, 45))
    with open(os.path.join(folder, 'crate.mtl'), 'w', encoding='utf-8') as f:
        f.write('newmtl Checker\nKd 1 1 1\nKs 0.3 0.3 0.3\nNs 40\nmap_Kd textures\\checker.png\n\n')
        f.write('newmtl Wood\nKd 1 1 1\nKs 0.1 0.1 0.1\nNs 10\nmap_Kd C:\\Users\\artist\\Desktop\\eski\\wood.tga\n')
    lines = ['mtllib crate.mtl']
    vi = 1
    for name, mat, offset, scale in (('Kutu_Dama', 'Checker', (-1.3, 1, 0), 1), ('Kutu_Ahsap', 'Wood', (1.3, 0.7, 0), 0.7)):
        lines += [f'o {name}', f'usemtl {mat}']
        for n, quad in CUBE_FACES:
            for (x, y, z), (u, v) in zip(quad, UVS):
                lines.append(f'v {x * scale + offset[0]} {y * scale + offset[1]} {z * scale + offset[2]}')
                lines.append(f'vt {u} {v}')
            lines.append(f'vn {n[0]} {n[1]} {n[2]}')
        nidx = (vi + 3) // 4
        for fi in range(6):
            a = vi + fi * 4
            n = nidx + fi
            lines.append(f'f {a}/{a}/{n} {a + 1}/{a + 1}/{n} {a + 2}/{a + 2}/{n} {a + 3}/{a + 3}/{n}')
        vi += 24
    with open(os.path.join(folder, 'crate.obj'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def make_glb(path):
    pos, nrm, col, idx = [], [], [], []
    colors = [(0.95, 0.3, 0.3), (0.3, 0.8, 0.4), (0.3, 0.5, 0.95), (0.95, 0.8, 0.3), (0.8, 0.4, 0.9), (0.3, 0.85, 0.9)]
    for fi, (n, quad) in enumerate(CUBE_FACES):
        base = len(pos)
        for i, p in enumerate(quad):
            pos.append(tuple(c * 0.5 for c in p))
            nrm.append(n)
            k = 0.75 + 0.25 * (i % 2)
            col.append(tuple(c * k for c in colors[fi]))
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    plane = [(-1.5, 0, -1.5), (1.5, 0, -1.5), (1.5, 0, 1.5), (-1.5, 0, 1.5)]
    plane_idx = [0, 2, 1, 0, 3, 2]
    t_rot = [0, 1, 2]
    q = lambda a: (0, math.sin(a / 2), 0, math.cos(a / 2))
    rot_vals = [q(0), q(math.pi), q(2 * math.pi - 1e-4)]
    t_jump = [0, 0.4, 0.8]
    jump_vals = [(0, 0.5, 0), (0, 1.6, 0), (0, 0.5, 0)]

    blobs, views, accessors = [], [], []
    def add(data, target=None):
        off = sum(len(b) for b in blobs)
        blobs.append(data + b'\x00' * (-len(data) % 4))
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        views.append(v)
        return len(views) - 1
    def acc(values, comp, typ, fmt, target=None, minmax=False):
        flat = [c for v in values for c in (v if isinstance(v, tuple) else (v,))]
        view = add(struct.pack(f'<{len(flat)}{fmt}', *flat), target)
        a = {'bufferView': view, 'componentType': comp, 'count': len(values), 'type': typ}
        if minmax:
            dims = len(values[0]) if isinstance(values[0], tuple) else 1
            cols = [[v[d] if isinstance(v, tuple) else v for v in values] for d in range(dims)]
            a['min'] = [min(c) for c in cols]
            a['max'] = [max(c) for c in cols]
        accessors.append(a)
        return len(accessors) - 1
    F, U16 = 5126, 5123
    a_pos = acc(pos, F, 'VEC3', 'f', 34962, True)
    a_nrm = acc(nrm, F, 'VEC3', 'f', 34962)
    a_col = acc(col, F, 'VEC3', 'f', 34962)
    a_idx = acc(idx, U16, 'SCALAR', 'H', 34963)
    a_ppos = acc(plane, F, 'VEC3', 'f', 34962, True)
    a_pnrm = acc([(0, 1, 0)] * 4, F, 'VEC3', 'f', 34962)
    a_pidx = acc(plane_idx, U16, 'SCALAR', 'H', 34963)
    a_tr = acc(t_rot, F, 'SCALAR', 'f', None, True)
    a_rv = acc(rot_vals, F, 'VEC4', 'f')
    a_tj = acc(t_jump, F, 'SCALAR', 'f', None, True)
    a_jv = acc(jump_vals, F, 'VEC3', 'f')
    gltf = {
        'asset': {'version': '2.0', 'generator': 'make_test_models.py'},
        'scene': 0,
        'scenes': [{'name': 'Sahne', 'nodes': [0, 1]}],
        'nodes': [{'name': 'Renkli_Kutu', 'mesh': 0, 'translation': [0, 0.5, 0]}, {'name': 'Zemin_Plakasi', 'mesh': 1}],
        'meshes': [
            {'name': 'Kutu', 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'COLOR_0': a_col}, 'indices': a_idx, 'material': 0}]},
            {'name': 'Plaka', 'primitives': [{'attributes': {'POSITION': a_ppos, 'NORMAL': a_pnrm}, 'indices': a_pidx, 'material': 1}]},
        ],
        'materials': [
            {'name': 'VertexRenkli', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.45}},
            {'name': 'Metal_Plaka', 'pbrMetallicRoughness': {'baseColorFactor': [0.6, 0.62, 0.66, 1], 'metallicFactor': 0.9, 'roughnessFactor': 0.3}},
        ],
        'animations': [
            {'name': 'Döndür', 'samplers': [{'input': a_tr, 'output': a_rv, 'interpolation': 'LINEAR'}],
             'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'rotation'}}]},
            {'name': 'Zıpla', 'samplers': [{'input': a_tj, 'output': a_jv, 'interpolation': 'LINEAR'}],
             'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'translation'}}]},
        ],
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': sum(len(b) for b in blobs)}],
    }
    js = json.dumps(gltf, ensure_ascii=False).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    binary = b''.join(blobs)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(binary), 0x004E4942) + binary)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'samples')
    os.makedirs(out, exist_ok=True)
    make_stl(os.path.join(out, 'torus_knot.stl'))
    make_obj(os.path.join(out, 'crate'))
    make_glb(os.path.join(out, 'animated.glb'))
    print('Örnek modeller oluşturuldu:', os.path.abspath(out))


if __name__ == '__main__':
    main()
