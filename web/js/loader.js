// Model yükleyici: FBX (binary/ASCII), glTF/GLB, OBJ+MTL, STL, PLY, DAE, 3MF
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODEL_EXTS = ['fbx', 'glb', 'gltf', 'obj', 'stl', 'ply', 'dae', '3mf'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'tif', 'tiff', 'psd', 'dds'];

const LIB = new URL('../vendor/three/examples/jsm/libs/', import.meta.url).href;
const FORMAT_NAMES = {
  fbx: 'Autodesk FBX', glb: 'glTF Binary (GLB)', gltf: 'glTF', obj: 'Wavefront OBJ', stl: 'STL',
  ply: 'Stanford PLY', dae: 'COLLADA', '3mf': '3D Manufacturing (3MF)',
};
export const formatName = ext => FORMAT_NAMES[ext] || ext.toUpperCase();

const extOf = name => (name.split(/[?#]/)[0].match(/\.([^./\\]+)$/)?.[1] || '').toLowerCase();
const baseName = p => decodeURIComponent(p.split(/[?#]/)[0]).split(/[\\/]/).pop();
// arayüzün güncellenmesine fırsat ver (pencere gizliyse rAF yavaşlar; zaman aşımı ile sınırla)
const nextFrame = () => new Promise(r => {
  let done = false;
  const finish = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(finish, 0));
  setTimeout(finish, 60);
});

/** Python sunucusu üzerinden açılan dosyalar: doku yolları /resolve uç noktasına yönlendirilir. */
export function createServerSource(info) {
  return {
    ...info,
    resourcePath: info.mountPrefix,
    modifyURL(u) {
      if (u === info.url || u.startsWith('data:') || u.startsWith('blob:')) return u;
      if (u.startsWith(info.mountPrefix)) {
        return `${info.resolveBase}?p=${encodeURIComponent(u.slice(info.mountPrefix.length))}`;
      }
      if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/|file:)/.test(u)) return `${info.resolveBase}?p=${encodeURIComponent(u)}`;
      return u;
    },
    dispose() {},
  };
}

/** Tarayıcıya bırakılan dosyalar (yedek yol): dosya adlarına göre blob URL eşlemesi. */
export function createFileMapSource(files) {
  const map = new Map();
  for (const f of files) map.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const main = files.find(f => MODEL_EXTS.includes(extOf(f.name)));
  const urls = new Set(map.values());
  return {
    name: main.name,
    ext: extOf(main.name),
    size: main.size,
    url: map.get(main.name.toLowerCase()),
    resourcePath: '',
    modifyURL(u) {
      if (urls.has(u) || u.startsWith('data:')) return u;
      let name = baseName(u).toLowerCase();
      if (map.has(name)) return map.get(name);
      const stem = name.replace(/\.[^.]+$/, '');
      for (const [k, v] of map) if (k.replace(/\.[^.]+$/, '') === stem && IMAGE_EXTS.includes(extOf(k))) return v;
      return u;
    },
    dispose() { urls.forEach(u => URL.revokeObjectURL(u)); },
  };
}

async function fetchBuffer(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dosya okunamadı (HTTP ${res.status})`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress?.(1);
    return buf;
  }
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, received);
    received += value.length;
    onProgress?.(received / total);
  }
  return out.buffer;
}

export class ModelLoader {
  constructor(renderer) {
    this.renderer = renderer;
    this.draco = new DRACOLoader().setDecoderPath(`${LIB}draco/gltf/`);
    this.ktx2 = new KTX2Loader().setTranscoderPath(`${LIB}basis/`);
    try { this.ktx2.detectSupport(renderer); } catch (e) { /* desteklenmiyor */ }
  }

  _manager(source, warnings) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(u => source.modifyURL(u));
    manager.addHandler(/\.tga$/i, new TGALoader(manager));
    manager.addHandler(/\.(tiff?|psd|dds|bmp|gif)$/i, new THREE.TextureLoader(manager));
    manager.addHandler(/\.ktx2$/i, this.ktx2);
    manager.onError = url => {
      const name = baseName(url.includes('?p=') ? decodeURIComponent(url.split('?p=')[1]) : url);
      if (!warnings.includes(name)) warnings.push(name);
    };
    // bekleyen doku isteklerini say (LoadingManager sayaçları dışarıya açık değil)
    let pending = 0;
    const waiters = [];
    const start = manager.itemStart;
    const end = manager.itemEnd;
    manager.itemStart = u => { pending++; start(u); };
    manager.itemEnd = u => {
      pending = Math.max(0, pending - 1);
      end(u);
      if (!pending) waiters.splice(0).forEach(r => r());
    };
    manager.idle = (timeout = 4000) => (pending ? Promise.race([
      new Promise(r => waiters.push(r)), new Promise(r => setTimeout(r, timeout)),
    ]) : Promise.resolve());
    return manager;
  }

  /**
   * @returns {Promise<{object: THREE.Object3D, animations: THREE.AnimationClip[], warnings: string[], missing: string[]}>}
   */
  async load(source, { onProgress, onStage } = {}) {
    const missing = [];
    const warnings = [];
    const manager = this._manager(source, missing);
    const ext = source.ext;
    onStage?.('Dosya okunuyor…');
    const buffer = await fetchBuffer(source.url, onProgress);
    onStage?.('Ayrıştırılıyor…');
    await nextFrame();

    let object;
    let animations = [];
    switch (ext) {
      case 'fbx': {
        object = new FBXLoader(manager).parse(buffer, source.resourcePath);
        animations = object.animations || [];
        break;
      }
      case 'glb':
      case 'gltf': {
        const loader = new GLTFLoader(manager)
          .setDRACOLoader(this.draco)
          .setKTX2Loader(this.ktx2)
          .setMeshoptDecoder(MeshoptDecoder);
        const gltf = await new Promise((resolve, reject) => loader.parse(buffer, source.resourcePath, resolve, reject));
        object = gltf.scene || gltf.scenes?.[0];
        animations = gltf.animations || [];
        object.userData.flipYTextures = false;
        break;
      }
      case 'obj': {
        object = await this._loadOBJ(buffer, source, manager, warnings);
        break;
      }
      case 'stl': {
        const geometry = new STLLoader().parse(buffer);
        object = this._wrapGeometry(geometry, source.name, true);
        break;
      }
      case 'ply': {
        const geometry = new PLYLoader().parse(buffer);
        object = this._wrapGeometry(geometry, source.name, false);
        break;
      }
      case 'dae': {
        const text = new TextDecoder().decode(buffer);
        const collada = new ColladaLoader(manager).parse(text, source.resourcePath);
        object = collada.scene;
        animations = collada.scene.animations || [];
        break;
      }
      case '3mf': {
        object = new ThreeMFLoader(manager).parse(buffer);
        object.rotation.x = -Math.PI / 2; // 3MF Z-yukarı
        break;
      }
      default:
        throw new Error(`Desteklenmeyen format: .${ext}`);
    }
    if (!object) throw new Error('Dosyada sahne bulunamadı.');
    if (!object.name) object.name = source.name;
    onStage?.('Sahne hazırlanıyor…');
    this._postProcess(object, warnings);
    // dokuların yüklenmesini kısa süre bekle (eksik doku uyarıları için)
    onStage?.('Dokular yükleniyor…');
    await manager.idle();
    return { object, animations, warnings, missing };
  }

  async _loadOBJ(buffer, source, manager, warnings) {
    const text = new TextDecoder().decode(buffer);
    const libs = [...text.matchAll(/^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gm)].map(m => m[1]);
    let creator = null;
    const info = {};
    for (const lib of libs) {
      const candidates = [lib, ...lib.split(/\s+/).filter(n => n !== lib)];
      for (const name of candidates) {
        try {
          const mtlText = await new THREE.FileLoader(manager).loadAsync(source.resourcePath + name);
          const mtl = new MTLLoader(manager);
          const c = mtl.parse(mtlText, source.resourcePath);
          creator = creator || c;
          Object.assign(info, c.materialsInfo);
          break;
        } catch (e) {
          if (name === candidates[candidates.length - 1]) warnings.push(`MTL bulunamadı: ${lib}`);
        }
      }
    }
    const loader = new OBJLoader(manager);
    if (creator) {
      creator.setMaterials(info);
      creator.preload();
      loader.setMaterials(creator);
    }
    return loader.parse(text);
  }

  _wrapGeometry(geometry, name, zUp) {
    if (geometry.index === null && !geometry.attributes.normal && geometry.attributes.position.count % 3 !== 0) {
      const pts = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: !!geometry.attributes.color }));
      const g = new THREE.Group();
      g.add(pts);
      return g;
    }
    const n = geometry.attributes.normal;
    let needNormals = !n;
    if (n) {
      let zero = 0;
      const step = Math.max(1, Math.floor(n.count / 64));
      for (let i = 0; i < n.count; i += step) if (n.getX(i) === 0 && n.getY(i) === 0 && n.getZ(i) === 0) zero++;
      needNormals = zero > 8;
    }
    if (needNormals) geometry.computeVertexNormals();
    const hasColors = !!geometry.attributes.color;
    const material = new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0x9ea4ad, roughness: 0.5, metalness: 0.05, vertexColors: hasColors,
      side: THREE.DoubleSide,
    });
    if (geometry.alpha !== undefined && geometry.alpha < 1) { material.opacity = geometry.alpha; material.transparent = true; }
    material.name = 'Varsayılan';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name.replace(/\.[^.]+$/, '');
    if (zUp) mesh.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.name = name;
    g.add(mesh);
    return g;
  }

  _postProcess(object, warnings) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const lights = [];
    // FBXLoader materyali atanmamış her parça için ayrı bir "__DEFAULT" materyal üretir; bu,
    // materyal sayısını şişirir. Hepsini tek bir paylaşılan "Atanmamış" materyalde birleştir.
    const shared = new Map();
    const unifyDefault = m => {
      if (!m || m.name !== THREE.Loader.DEFAULT_MATERIAL_NAME || !m.isMeshPhongMaterial) return m;
      const key = m.vertexColors ? 'vc' : 'plain';
      if (!shared.has(key)) {
        m.name = 'Atanmamış (varsayılan)';
        shared.set(key, m);
        return m;
      }
      m.dispose();
      return shared.get(key);
    };
    object.traverse(o => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(unifyDefault) : unifyDefault(o.material);
    });
    object.traverse(o => {
      if (o.isLight) { lights.push(o); return; }
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      const g = o.geometry;
      if (g?.attributes.position && !g.attributes.normal) {
        try {
          o.geometry = toCreasedNormals(g, Math.PI / 6);
          o.geometry.name = g.name;
          g.dispose();
        } catch (e) {
          g.computeVertexNormals();
        }
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // FBXLoader, paylaşılan materyalde vertexColors'u açınca renk özniteliği olmayan
      // parçalar (0,0,0) okuyup siyah görünür: bu parçalara beyaz renk özniteliği ekle.
      const pos = o.geometry?.attributes.position;
      if (pos && !o.geometry.attributes.color && mats.some(m => m?.vertexColors)) {
        o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
        o.geometry.userData.syntheticColor = true;
      }
      for (const m of mats) {
        if (!m) continue;
        if (m.transparent && m.opacity === 0) {
          m.opacity = 1;
          m.transparent = false;
          if (!warnings.some(w => w.startsWith('Tamamen saydam'))) warnings.push('Tamamen saydam materyaller opak yapıldı.');
        }
        for (const v of Object.values(m)) if (v && v.isTexture) v.anisotropy = maxAniso;
      }
    });
    for (const l of lights) l.visible = false;
    object.userData.fileLights = lights.length;
  }
}
