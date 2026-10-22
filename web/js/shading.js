// Gölgelendirme modları: Lit, Lit Wireframe, Wireframe, Unlit, Kil/Matcap ve teknik modlar
import * as THREE from 'three';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { MATCAP_PRESETS, makeCheckerTexture, makeMatcapTexture } from './textures.js';

export const MODES = ['lit', 'litwire', 'wire', 'unlit', 'clay', 'normals', 'uv', 'vcolor'];
export const TECHNICAL_MODES = ['normals', 'uv', 'vcolor'];
export const MODE_INFO = {
  lit: { name: 'Işıklı', sub: 'Lit', icon: 'modeLit', key: '1' },
  litwire: { name: 'Işıklı Tel Kafes', sub: 'Lit Wireframe', icon: 'modeLitWire', key: '2' },
  wire: { name: 'Tel Kafes', sub: 'Unlit Wireframe', icon: 'modeWire', key: '3' },
  unlit: { name: 'Işıksız', sub: 'Albedo', icon: 'modeUnlit', key: '4' },
  clay: { name: 'Kil / Matcap', sub: 'Clay', icon: 'modeClay', key: '5' },
  normals: { name: 'Normaller', sub: 'Teknik', icon: 'modeTech', key: '6' },
  uv: { name: 'UV Dama', sub: 'Teknik', icon: 'modeTech', key: '6' },
  vcolor: { name: 'Vertex Rengi', sub: 'Teknik', icon: 'modeTech', key: '6' },
};

// "Dokuları kapat" ile geçici olarak kaldırılan doku yuvaları (alphaMap korunur)
export const MAP_SLOTS = [
  'map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'specularMap',
  'displacementMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap',
  'specularColorMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap',
];

const SNAPSHOT_PROPS = ['shininess', 'roughness', 'metalness', 'opacity', 'transparent', 'emissiveIntensity',
  'bumpScale', 'side', 'flatShading', 'alphaTest', 'depthWrite'];
const SNAPSHOT_COLORS = ['color', 'specular', 'emissive'];

export const materialsOf = m => (Array.isArray(m) ? m : [m]).filter(Boolean);

function attrComponent(attr, i, k) {
  switch (k) {
    case 0: return attr.getX(i);
    case 1: return attr.getY(i);
    case 2: return attr.getZ(i);
    default: return attr.getW(i);
  }
}

function deindex(attr, index) {
  const n = index.count;
  const size = attr.itemSize;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    const j = index.getX(i);
    for (let k = 0; k < size; k++) out[i * size + k] = attrComponent(attr, j, k);
  }
  return new THREE.BufferAttribute(out, size);
}

/** Tel kafes katmanı için yalnızca gerekli öznitelikleri içeren indekssiz geometri (+ barycentric). */
function wireGeometryFor(geometry) {
  if (geometry.userData.wireGeometry) return geometry.userData.wireGeometry;
  const g = new THREE.BufferGeometry();
  const index = geometry.index;
  const names = ['position', 'skinIndex', 'skinWeight'];
  for (const name of names) {
    const a = geometry.attributes[name];
    if (a) g.setAttribute(name, index ? deindex(a, index) : a);
  }
  const morph = geometry.morphAttributes.position;
  if (morph && morph.length) g.morphAttributes.position = index ? morph.map(a => deindex(a, index)) : morph;
  g.morphTargetsRelative = geometry.morphTargetsRelative;
  const count = index ? index.count : geometry.attributes.position.count;
  const bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) bary[i * 3 + (i % 3)] = 1;
  g.setAttribute('barycentric', new THREE.BufferAttribute(bary, 3));
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  g.boundingSphere = geometry.boundingSphere.clone();
  g.boundingBox = geometry.boundingBox.clone();
  geometry.userData.wireGeometry = g;
  return g;
}

function createWireMaterial(uniforms) {
  const mat = new THREE.MeshBasicMaterial({
    color: '#4fc3ff', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = shader => {
    shader.uniforms.wireWidth = uniforms.wireWidth;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 barycentric;\nvarying vec3 vBary;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBary = barycentric;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBary;\nuniform float wireWidth;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec3 bw = max(fwidth(vBary), vec3(1e-6));
        float hw = wireWidth * 0.5;
        vec3 edge = smoothstep(bw * (hw - 0.5), bw * (hw + 0.5), vBary);
        float line = 1.0 - min(min(edge.x, edge.y), edge.z);
        if (line < 0.02) discard;
        gl_FragColor.a *= line;`);
  };
  mat.customProgramCacheKey = () => 'barycentric-wire';
  mat.userData.shared = true;
  return mat;
}

const shared = m => { m.userData.shared = true; return m; };

export class ShadingManager extends EventTarget {
  constructor(viewer) {
    super();
    this.viewer = viewer;
    this.mode = 'lit';
    this.lastTechnical = 'normals';
    this.settings = {
      wireColor: '#4fc3ff',
      wireWidth: 1.2,
      wireOpacity: 0.95,
      wireXray: false,
      clayStyle: 'lit',
      clayColor: '#8e8a84',
      normalsFlat: false,
      normalLines: false,
      normalLength: 1,
      uvRepeat: 4,
      textures: true,
      doubleSided: true,
    };
    this.meshes = [];
    this.root = null;
    this.wireUniforms = { wireWidth: { value: this.settings.wireWidth } };
    this.wireMat = createWireMaterial(this.wireUniforms);
    this.hiddenMat = shared(new THREE.MeshBasicMaterial({ visible: false }));
    this.depthMat = shared(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    this.clayMat = shared(new THREE.MeshStandardMaterial({ color: this.settings.clayColor, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
    this.matcaps = new Map();
    this.matcapMat = shared(new THREE.MeshMatcapMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    this.normalMat = shared(new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }));
    this.checker = makeCheckerTexture();
    this.checker.repeat.set(this.settings.uvRepeat, this.settings.uvRepeat);
    this.uvMat = shared(new THREE.MeshBasicMaterial({ map: this.checker, side: THREE.DoubleSide }));
    this.noUvMat = shared(new THREE.MeshBasicMaterial({ color: '#ff2fd0', side: THREE.DoubleSide }));
    this.vcolorMat = shared(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.noVColorMat = shared(new THREE.MeshBasicMaterial({ color: '#808080', side: THREE.DoubleSide }));
    this.unlitCache = new Map();
    this.normalHelpers = [];
    viewer.addEventListener('placement', () => this.normalHelpers.forEach(hp => hp.update()));
  }

  matcapPreview(id) {
    return this._matcap(id).userData.preview;
  }

  _matcap(id) {
    if (!this.matcaps.has(id)) {
      const preset = MATCAP_PRESETS.find(p => p.id === id) || MATCAP_PRESETS[0];
      this.matcaps.set(id, makeMatcapTexture(preset));
    }
    return this.matcaps.get(id);
  }

  /* ----------------------------------------------------------- model */
  setModel(root) {
    this._clearNormalHelpers();
    this.unlitCache.forEach(m => m.dispose());
    this.unlitCache.clear();
    this.root = root;
    this.meshes = [];
    if (root) {
      root.traverse(o => {
        if ((o.isMesh || o.isSkinnedMesh) && !o.userData.isOverlay) {
          o.userData.origMaterial = o.material;
          for (const m of materialsOf(o.material)) this._snapshot(m);
          this.meshes.push(o);
        }
      });
      if (!this.settings.textures) this._setTextures(false);
    }
    this.apply();
  }

  materials() {
    const set = new Set();
    for (const mesh of this.meshes) materialsOf(mesh.userData.origMaterial).forEach(m => set.add(m));
    return [...set];
  }

  _snapshot(m) {
    if (m.userData.__snapshot) return;
    const snap = { maps: {} };
    for (const p of SNAPSHOT_PROPS) if (m[p] !== undefined) snap[p] = m[p];
    for (const c of SNAPSHOT_COLORS) if (m[c]?.isColor) snap[c] = m[c].clone();
    if (m.normalScale) snap.normalScale = m.normalScale.clone();
    for (const s of [...MAP_SLOTS, 'alphaMap']) if (m[s] !== undefined) snap.maps[s] = m[s];
    m.userData.__snapshot = snap;
  }

  resetMaterial(m) {
    const snap = m.userData.__snapshot;
    if (!snap) return;
    for (const p of SNAPSHOT_PROPS) if (p in snap) m[p] = snap[p];
    for (const c of SNAPSHOT_COLORS) if (snap[c]) m[c].copy(snap[c]);
    if (snap.normalScale) m.normalScale.copy(snap.normalScale);
    const stash = m.userData.__stash;
    for (const [slot, tex] of Object.entries(snap.maps)) {
      if (stash && slot in stash) stash[slot] = tex;
      else m[slot] = tex;
    }
    m.needsUpdate = true;
  }

  resetAll() {
    this.materials().forEach(m => this.resetMaterial(m));
    this.refresh();
  }

  /** Doku yuvasına atama (dokular kapalıysa saklanan kopyayı günceller). */
  setMap(m, slot, tex) {
    const stash = m.userData.__stash;
    if (stash && MAP_SLOTS.includes(slot)) stash[slot] = tex;
    else m[slot] = tex;
    m.needsUpdate = true;
    this.refresh();
  }

  getMap(m, slot) {
    const stash = m.userData.__stash;
    return stash && slot in stash ? stash[slot] : m[slot];
  }

  /* ----------------------------------------------------------- modes */
  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    if (TECHNICAL_MODES.includes(mode)) this.lastTechnical = mode;
    this.apply();
  }

  cycleTechnical() {
    if (TECHNICAL_MODES.includes(this.mode)) {
      const i = TECHNICAL_MODES.indexOf(this.mode);
      this.setMode(TECHNICAL_MODES[(i + 1) % TECHNICAL_MODES.length]);
    } else {
      this.setMode(this.lastTechnical);
    }
  }

  get litMode() {
    return this.mode === 'lit' || this.mode === 'litwire' || (this.mode === 'clay' && this.settings.clayStyle === 'lit');
  }

  set(key, value) {
    this.settings[key] = value;
    if (key === 'textures') this._setTextures(value);
    if (key === 'normalLines' || key === 'normalLength') this._updateNormalHelpers();
    this.apply();
  }

  refresh() {
    this.apply();
  }

  apply() {
    const s = this.settings;
    const mode = this.mode;
    this.wireMat.color.set(s.wireColor);
    this.wireMat.opacity = s.wireOpacity;
    this.wireUniforms.wireWidth.value = s.wireWidth;
    const xray = mode === 'wire' && s.wireXray;
    if (this.wireMat.depthTest === xray) { this.wireMat.depthTest = !xray; }
    const side = s.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    for (const m of [this.clayMat, this.matcapMat, this.normalMat, this.uvMat, this.noUvMat, this.vcolorMat, this.noVColorMat, this.depthMat]) {
      if (m.side !== side) { m.side = side; m.needsUpdate = true; }
    }
    this.clayMat.color.set(s.clayColor);
    if (s.clayStyle !== 'lit') {
      const tex = this._matcap(s.clayStyle);
      if (this.matcapMat.matcap !== tex) { this.matcapMat.matcap = tex; this.matcapMat.needsUpdate = true; }
      this.matcapMat.color.set('#ffffff');
    }
    for (const m of [this.normalMat, this.clayMat, this.matcapMat]) {
      if (m.flatShading !== s.normalsFlat) { m.flatShading = s.normalsFlat; m.needsUpdate = true; }
    }
    this.checker.repeat.set(s.uvRepeat, s.uvRepeat);

    const overlay = mode === 'litwire' || mode === 'wire';
    for (const mesh of this.meshes) {
      const orig = mesh.userData.origMaterial;
      mesh.material = this._materialFor(mesh, orig, mode);
      if (overlay) this._overlayFor(mesh).visible = true;
      else if (mesh.userData.wireOverlay) mesh.userData.wireOverlay.visible = false;
    }
    this.normalHelpers.forEach(hp => { hp.visible = s.normalLines && hp.userData.mesh.visible; });
    this.viewer.needsRender = true;
    this.dispatchEvent(new Event('change'));
  }

  _materialFor(mesh, orig, mode) {
    const map = fn => (Array.isArray(orig) ? orig.map(fn) : fn(orig));
    switch (mode) {
      case 'lit':
      case 'litwire':
        return orig;
      case 'wire':
        return map(() => (this.settings.wireXray ? this.hiddenMat : this.depthMat));
      case 'unlit':
        return map(m => this._unlit(m));
      case 'clay':
        return map(() => (this.settings.clayStyle === 'lit' ? this.clayMat : this.matcapMat));
      case 'normals':
        return map(() => this.normalMat);
      case 'uv':
        return map(() => (mesh.geometry.attributes.uv ? this.uvMat : this.noUvMat));
      case 'vcolor':
        return map(() => (mesh.geometry.attributes.color && !mesh.geometry.userData.syntheticColor ? this.vcolorMat : this.noVColorMat));
      default:
        return orig;
    }
  }

  _unlit(m) {
    let u = this.unlitCache.get(m);
    if (!u) {
      u = new THREE.MeshBasicMaterial();
      u.name = `${m.name || 'material'} (unlit)`;
      this.unlitCache.set(m, u);
    }
    const prevMap = u.map;
    u.color.copy(m.color?.isColor ? m.color : new THREE.Color(1, 1, 1));
    u.map = m.map || null;
    u.alphaMap = m.alphaMap || null;
    u.vertexColors = !!m.vertexColors;
    u.transparent = !!m.transparent;
    u.opacity = m.opacity ?? 1;
    u.alphaTest = m.alphaTest ?? 0;
    u.side = m.side ?? THREE.FrontSide;
    u.depthWrite = m.depthWrite ?? true;
    if (prevMap !== u.map || u.version === 0) u.needsUpdate = true;
    return u;
  }

  _overlayFor(mesh) {
    if (mesh.userData.wireOverlay) return mesh.userData.wireOverlay;
    const geo = wireGeometryFor(mesh.geometry);
    let o;
    if (mesh.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(geo, this.wireMat);
      o.bindMode = mesh.bindMode;
      o.bind(mesh.skeleton, mesh.bindMatrix);
    } else if (mesh.isInstancedMesh) {
      o = new THREE.InstancedMesh(geo, this.wireMat, mesh.count);
      o.instanceMatrix = mesh.instanceMatrix;
    } else {
      o = new THREE.Mesh(geo, this.wireMat);
    }
    if (mesh.morphTargetInfluences) {
      o.morphTargetInfluences = mesh.morphTargetInfluences;
      o.morphTargetDictionary = mesh.morphTargetDictionary;
    }
    o.name = '__wire';
    o.userData.isOverlay = true;
    o.raycast = () => {};
    o.renderOrder = 10;
    o.frustumCulled = mesh.frustumCulled;
    o.castShadow = false;
    o.receiveShadow = false;
    mesh.add(o);
    mesh.userData.wireOverlay = o;
    return o;
  }

  _setTextures(enabled) {
    for (const m of this.materials()) {
      if (!enabled && !m.userData.__stash) {
        const stash = {};
        for (const slot of MAP_SLOTS) {
          if (m[slot]) { stash[slot] = m[slot]; m[slot] = null; }
        }
        m.userData.__stash = stash;
        m.needsUpdate = true;
      } else if (enabled && m.userData.__stash) {
        for (const [slot, tex] of Object.entries(m.userData.__stash)) m[slot] = tex;
        delete m.userData.__stash;
        m.needsUpdate = true;
      }
    }
  }

  /* --------------------------------------------------- normal lines */
  _clearNormalHelpers() {
    for (const hp of this.normalHelpers) {
      hp.removeFromParent();
      hp.geometry.dispose();
      hp.material.dispose();
    }
    this.normalHelpers = [];
  }

  _updateNormalHelpers() {
    this._clearNormalHelpers();
    if (!this.settings.normalLines) return;
    const size = this.viewer.radius * 0.025 * this.settings.normalLength;
    let budget = 2_000_000;
    for (const mesh of this.meshes) {
      const n = mesh.geometry.attributes.normal;
      if (!n || n.count > budget) continue;
      budget -= n.count;
      const hp = new VertexNormalsHelper(mesh, size, 0x67d4ff);
      hp.material.toneMapped = false;
      hp.userData.mesh = mesh;
      hp.raycast = () => {};
      this.viewer.helpers.add(hp);
      this.normalHelpers.push(hp);
    }
    if (budget <= 0) this.dispatchEvent(Object.assign(new Event('warn'), { text: 'Model çok yoğun; normal vektörleri yalnızca bir kısmı için çizildi.' }));
  }

  syncNormalHelpers() {
    this.normalHelpers.forEach(hp => { hp.visible = this.settings.normalLines && hp.userData.mesh.visible; hp.update(); });
  }

  getSettings() { return { mode: this.mode, ...this.settings }; }

  applySettings(s) {
    if (!s) return;
    const { mode, ...rest } = s;
    const texturesChanged = 'textures' in rest && rest.textures !== this.settings.textures;
    const normalsChanged = ('normalLines' in rest && rest.normalLines !== this.settings.normalLines) || ('normalLength' in rest);
    for (const [k, v] of Object.entries(rest)) if (k in this.settings) this.settings[k] = v;
    if (texturesChanged) this._setTextures(this.settings.textures);
    if (normalsChanged) this._updateNormalHelpers();
    if (mode && MODES.includes(mode)) this.mode = mode;
    this.apply();
  }
}
