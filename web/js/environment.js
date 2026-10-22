// Ortam ve aydınlatma: temalar, arka plan, ışık düzeni, ortam haritası, gölgeler
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { THEMES, themeById } from './themes.js';
import { buildEnvScene, disposeScene, makeGradientTexture } from './textures.js';

export const TONE_MAPPINGS = {
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  none: THREE.NoToneMapping,
};

const FILL_OFFSET = -115;
const RIM_OFFSET = 165;
const clone = o => JSON.parse(JSON.stringify(o));

function stateFromTheme(t, prev = null) {
  return {
    theme: t.id,
    background: { mode: 'gradient', type: 'radial', angle: 180, blur: 0.35, ...clone(t.background) },
    key: clone(t.key),
    fill: clone(t.fill),
    rim: clone(t.rim),
    ambient: clone(t.ambient),
    hemi: clone(t.hemi),
    envIntensity: t.env.intensity ?? 1,
    exposure: t.exposure ?? 1,
    toneMapping: prev?.toneMapping ?? 'neutral',
    rotateRig: prev?.rotateRig ?? true,
    followCamera: prev?.followCamera ?? false,
    shadows: prev?.shadows ? clone(prev.shadows) : { enabled: true, opacity: 0.38, softness: 2, selfShadow: true },
  };
}

function placeLight(light, center, azDeg, elDeg, dist) {
  const a = THREE.MathUtils.degToRad(azDeg);
  const e = THREE.MathUtils.degToRad(elDeg);
  light.position.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).multiplyScalar(dist).add(center);
  light.target.position.copy(center);
  light.target.updateMatrixWorld();
}

function makeLights() {
  const ambient = new THREE.AmbientLight();
  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight();
  const rim = new THREE.DirectionalLight();
  return { ambient, hemi, key, fill, rim };
}

function applyLightState(L, s) {
  L.ambient.color.set(s.ambient.color);
  L.ambient.intensity = s.ambient.intensity;
  L.hemi.color.set(s.hemi.sky);
  L.hemi.groundColor.set(s.hemi.ground);
  L.hemi.intensity = s.hemi.intensity;
  L.key.color.set(s.key.color);
  L.key.intensity = s.key.intensity;
  L.fill.color.set(s.fill.color);
  L.fill.intensity = s.fill.intensity;
  L.rim.color.set(s.rim.color);
  L.rim.intensity = s.rim.intensity;
}

function envTextureFor(pmrem, theme) {
  if (theme.env.preset === 'room') {
    const room = new RoomEnvironment();
    const tex = pmrem.fromScene(room, 0.04).texture;
    disposeScene(room);
    return tex;
  }
  const scene = buildEnvScene(theme.env);
  const tex = pmrem.fromScene(scene, 0.035).texture;
  disposeScene(scene);
  return tex;
}

export class EnvironmentManager extends EventTarget {
  constructor(viewer) {
    super();
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.pmrem = new THREE.PMREMGenerator(viewer.renderer);
    this.envCache = new Map();
    this.lights = makeLights();
    const L = this.lights;
    this.scene.add(L.ambient, L.hemi, L.key, L.key.target, L.fill, L.fill.target, L.rim, L.rim.target);
    this.shadowsAllowed = true;
    this.model = null;
    this.state = stateFromTheme(THEMES[0]);
    this._bgTex = null;
    this._bgTimer = 0;
    viewer.addEventListener('bounds', () => this.updateLights());
    viewer.addEventListener('beforerender', () => { if (this.state.followCamera) this.updateLights(); });
    viewer.addEventListener('resize', () => {
      if (this.state.background.mode !== 'gradient') return;
      clearTimeout(this._bgTimer);
      this._bgTimer = setTimeout(() => this.applyBackground(), 120);
    });
    this.applyAll();
  }

  get theme() { return themeById(this.state.theme); }

  setModel(root) {
    this.model = root;
    this.applyShadows();
  }

  /* ------------------------------------------------------------ public */
  applyTheme(id) {
    this.state = stateFromTheme(themeById(id), this.state);
    this.applyAll();
  }

  update(path, value) {
    const keys = path.split('.');
    let o = this.state;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    const root = keys[0];
    if (root === 'background') this.applyBackground();
    else if (root === 'shadows') this.applyShadows();
    else if (root === 'envIntensity' || root === 'exposure' || root === 'toneMapping') this.applyRenderer();
    else this.applyLightsAll();
    this._changed();
  }

  getState() { return clone(this.state); }

  setState(s) {
    if (!s || typeof s !== 'object') return;
    const base = stateFromTheme(themeById(s.theme), this.state);
    const merged = { ...base, ...s };
    for (const k of ['background', 'key', 'fill', 'rim', 'ambient', 'hemi', 'shadows']) merged[k] = { ...base[k], ...(s[k] || {}) };
    this.state = merged;
    this.applyAll();
  }

  setShadowsAllowed(on) {
    this.shadowsAllowed = on;
    this.applyShadows();
  }

  /* ------------------------------------------------------------ apply */
  applyAll() {
    this.applyEnvironment();
    this.applyBackground();
    this.applyLightsAll();
    this.applyRenderer();
    this.applyShadows();
    this._changed();
  }

  applyEnvironment() {
    const t = this.theme;
    if (!this.envCache.has(t.id)) this.envCache.set(t.id, envTextureFor(this.pmrem, t));
    this.envTexture = this.envCache.get(t.id);
    this.scene.environment = this.envTexture;
  }

  applyRenderer() {
    const r = this.viewer.renderer;
    r.toneMapping = TONE_MAPPINGS[this.state.toneMapping] ?? THREE.NeutralToneMapping;
    r.toneMappingExposure = this.state.exposure;
    this.scene.environmentIntensity = this.state.envIntensity;
    if (this.state.background.mode === 'environment') this.scene.backgroundIntensity = this.state.envIntensity;
    this.viewer.needsRender = true;
  }

  applyBackground() {
    const b = this.state.background;
    const scene = this.scene;
    if (this._bgTex) { this._bgTex.dispose(); this._bgTex = null; }
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = 1;
    let lum;
    if (b.mode === 'solid') {
      scene.background = new THREE.Color(b.color1);
      lum = this._lum(b.color1);
    } else if (b.mode === 'environment') {
      scene.background = this.envTexture;
      scene.backgroundBlurriness = b.blur ?? 0.35;
      scene.backgroundIntensity = this.state.envIntensity;
      lum = this._lum(this.theme.env.horizon || '#808080');
    } else {
      this._bgTex = makeGradientTexture(b, this.viewer.width / this.viewer.height);
      scene.background = this._bgTex;
      lum = (this._lum(b.color1) + this._lum(b.color2)) / 2;
    }
    // ızgara çizgilerini arka plan parlaklığına göre ayarla
    const avg = b.mode === 'environment' ? new THREE.Color('#40444c')
      : new THREE.Color(b.color1).lerp(new THREE.Color(b.mode === 'solid' ? b.color1 : b.color2), 0.5);
    const toward = new THREE.Color(lum > 0.45 ? '#000000' : '#ffffff');
    const minor = avg.clone().lerp(toward, lum > 0.45 ? 0.16 : 0.13);
    const major = avg.clone().lerp(toward, lum > 0.45 ? 0.32 : 0.26);
    this.viewer.setGridColors(minor, major, 0.9);
    this.bgLuminance = lum;
    this.viewer.needsRender = true;
  }

  applyLightsAll() {
    applyLightState(this.lights, this.state);
    this.updateLights();
  }

  updateLights() {
    const s = this.state;
    const v = this.viewer;
    const R = v.radius;
    const c = v.center;
    const camAz = s.followCamera ? THREE.MathUtils.radToDeg(v.getCameraAzimuth()) : 0;
    const az = s.key.azimuth + camAz;
    const baseAz = this.theme.key.azimuth + camAz;
    const rigAz = s.rotateRig ? az : baseAz;
    const L = this.lights;
    placeLight(L.key, c, az, s.key.elevation, R * 4);
    placeLight(L.fill, c, rigAz + FILL_OFFSET, 22, R * 4);
    placeLight(L.rim, c, rigAz + RIM_OFFSET, 38, R * 4);
    const sc = L.key.shadow.camera;
    const ext = R * 1.8;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.near = R * 0.5;
    sc.far = R * 9;
    sc.updateProjectionMatrix();
    L.key.shadow.normalBias = R * 0.0035;
    const envRot = s.rotateRig ? THREE.MathUtils.degToRad(az - this.theme.key.azimuth) : THREE.MathUtils.degToRad(camAz);
    this.scene.environmentRotation.y = envRot;
    this.scene.backgroundRotation.y = envRot;
    v.needsRender = true;
  }

  applyShadows() {
    const sh = this.state.shadows;
    const on = sh.enabled && this.shadowsAllowed;
    const L = this.lights;
    if (L.key.castShadow !== on) L.key.castShadow = on;
    L.key.shadow.radius = sh.softness;
    this.viewer.shadowCatcher.material.opacity = sh.opacity;
    this.viewer.shadowCatcher.visible = this.viewer.flags.shadowCatcher && on;
    if (this.model) {
      this.model.traverse(o => {
        if (o.isMesh && !o.userData.isOverlay) {
          o.castShadow = true;
          o.receiveShadow = !!sh.selfShadow;
        }
      });
    }
    this.viewer.needsRender = true;
  }

  _lum(hex) {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }

  _changed() {
    this.dispatchEvent(new Event('change'));
  }
}

/** Her tema için küçük bir küre önizlemesi üretir (ayrı, geçici bir WebGL bağlamında). */
export async function renderThemeThumbnails(size = 112) {
  const out = new Map();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.55, 3.3);
  camera.lookAt(0, 0.05, 0);
  const sphereGeo = new THREE.SphereGeometry(0.62, 48, 32);
  const knotGeo = new THREE.TorusKnotGeometry(0.17, 0.06, 80, 12);
  for (const t of THEMES) {
    const scene = new THREE.Scene();
    const L = makeLights();
    L.key.castShadow = false;
    const s = stateFromTheme(t);
    applyLightState(L, s);
    scene.add(L.ambient, L.hemi, L.key, L.key.target, L.fill, L.fill.target, L.rim, L.rim.target);
    const c = new THREE.Vector3();
    placeLight(L.key, c, s.key.azimuth, s.key.elevation, 4);
    placeLight(L.fill, c, s.key.azimuth + FILL_OFFSET, 22, 4);
    placeLight(L.rim, c, s.key.azimuth + RIM_OFFSET, 38, 4);
    const env = envTextureFor(pmrem, t);
    scene.environment = env;
    scene.environmentIntensity = s.envIntensity;
    const bgTex = s.background.mode === 'solid' ? null : makeGradientTexture(s.background, 1);
    scene.background = bgTex || new THREE.Color(s.background.color1);
    const mat = new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.32, metalness: 0.05 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.set(-0.08, 0.02, 0);
    const knot = new THREE.Mesh(knotGeo, new THREE.MeshStandardMaterial({ color: '#c9a36a', roughness: 0.25, metalness: 0.9 }));
    knot.position.set(0.62, -0.42, 0.45);
    scene.add(sphere, knot);
    renderer.toneMappingExposure = s.exposure;
    renderer.render(scene, camera);
    out.set(t.id, renderer.domElement.toDataURL('image/png'));
    env.dispose();
    bgTex?.dispose();
    mat.dispose();
    knot.material.dispose();
    await new Promise(r => setTimeout(r, 0));
  }
  sphereGeo.dispose();
  knotGeo.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
