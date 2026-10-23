// Sahne, kamera, kontroller, zemin ızgarası, seçim ve çizim döngüsü
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AxisGizmo } from './gizmo.js';

export const VIEW_DIRS = {
  home: [0.55, 0.42, 1],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 1e-4],
  bottom: [0, -1, 1e-4],
  iso: [1, 0.82, 1],
};

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function createGridMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uMinor: { value: new THREE.Color('#5a606c') },
      uMajor: { value: new THREE.Color('#8a909c') },
      uCell: { value: 0.1 },
      uFade: { value: 10 },
      uOpacity: { value: 0.8 },
      uCenter: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uMinor;
      uniform vec3 uMajor;
      uniform float uCell;
      uniform float uFade;
      uniform float uOpacity;
      uniform vec3 uCenter;
      varying vec3 vWorld;
      float lineMask(vec2 coord) {
        vec2 d = max(fwidth(coord), vec2(1e-6));
        vec2 g = abs(fract(coord - 0.5) - 0.5) / d;
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 dm = fwidth(p / uCell);
        float density = clamp(1.6 - max(dm.x, dm.y) * 3.0, 0.0, 1.0);
        float minor = lineMask(p / uCell) * density;
        float major = lineMask(p / (uCell * 10.0));
        vec3 col = mix(uMinor, uMajor, major);
        float a = max(minor * 0.5, major * 0.95);
        vec2 ad = max(fwidth(p), vec2(1e-6));
        float xAxis = 1.0 - min(abs(p.y) / (ad.y * 1.4), 1.0);
        float zAxis = 1.0 - min(abs(p.x) / (ad.x * 1.4), 1.0);
        col = mix(col, vec3(0.80, 0.18, 0.24), xAxis);
        col = mix(col, vec3(0.20, 0.38, 0.92), zAxis);
        a = max(a, max(xAxis, zAxis) * 0.9);
        float dist = length(p - uCenter.xz);
        a *= (1.0 - smoothstep(uFade * 0.3, uFade, dist)) * uOpacity;
        if (a <= 0.004) discard;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

export class Viewer extends EventTarget {
  constructor(container) {
    super();
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.tabIndex = 0;
    container.prepend(renderer.domElement);

    this.scene = new THREE.Scene();
    this.perspCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    this.orthoHalfHeight = 1;
    this.camera = this.perspCamera;
    this.camera.position.set(2.2, 1.7, 4);

    const controls = this.controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 1.1;
    controls.autoRotateSpeed = 2.0;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.DOLLY };
    controls.target.set(0, 0.8, 0);
    controls.update();

    // Sahne yapısı: scene → wrapper (yerleştirme ötelemesi) → pivot (kullanıcı döndürmesi) → model
    this.modelWrapper = new THREE.Group();
    this.modelWrapper.name = '__wrapper';
    this.modelPivot = new THREE.Group();
    this.modelPivot.name = '__pivot';
    this.modelWrapper.add(this.modelPivot);
    this.scene.add(this.modelWrapper);
    this.helpers = new THREE.Group();
    this.helpers.name = '__helpers';
    this.scene.add(this.helpers);

    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), createGridMaterial());
    this.grid.renderOrder = -1;
    this.grid.raycast = () => {};
    this.helpers.add(this.grid);

    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.35, depthWrite: false }),
    );
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = -2;
    this.shadowCatcher.raycast = () => {};
    this.helpers.add(this.shadowCatcher);

    this.bboxHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#d7dbe2'));
    this.bboxHelper.material.transparent = true;
    this.bboxHelper.material.opacity = 0.55;
    this.bboxHelper.material.toneMapped = false;
    this.bboxHelper.visible = false;
    this.helpers.add(this.bboxHelper);

    this.selectionHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffb02e'));
    this.selectionHelper.material.toneMapped = false;
    this.selectionHelper.material.depthTest = false;
    this.selectionHelper.material.transparent = true;
    this.selectionHelper.renderOrder = 999;
    this.selectionHelper.visible = false;
    this.helpers.add(this.selectionHelper);

    this.gizmo = new AxisGizmo();
    this.flags = { grid: true, shadowCatcher: true, axes: true, bbox: false, autoRotate: false, ortho: false };
    this.model = null;
    this.selection = null;
    this.box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    this.center = new THREE.Vector3(0, 1, 0);
    this.radius = 1.5;
    this.clock = new THREE.Clock();
    this.needsRender = true;
    this.updaters = new Set();
    this.tween = null;
    this.raycaster = new THREE.Raycaster();
    this.width = 1;
    this.height = 1;

    this._applyBounds();
    this._installPointer();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    controls.addEventListener('change', () => { this.needsRender = true; });
    controls.addEventListener('start', () => { this.tween = null; this.dispatchEvent(new Event('interact')); });
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ sizing */
  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, true);
    this.perspCamera.aspect = w / h;
    this.perspCamera.updateProjectionMatrix();
    this._updateOrthoFrustum();
    this.dispatchEvent(new Event('resize'));
    this.render();
  }

  _updateOrthoFrustum() {
    const a = this.width / this.height;
    const hh = this.orthoHalfHeight;
    Object.assign(this.orthoCamera, { left: -hh * a, right: hh * a, top: hh, bottom: -hh });
    this.orthoCamera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------- model */
  /** rotateX: açılışta uygulanacak X ekseni döndürmesi (derece), ör. Z-yukarı modeller için -90. */
  setModel(object, { rotateX = 0 } = {}) {
    this.clearModel(false);
    this.model = object;
    this.baseRotateX = rotateX;
    this.modelPivot.rotation.set(THREE.MathUtils.degToRad(rotateX), 0, 0);
    this.modelPivot.add(object);
    this.modelPivot.updateMatrixWorld(true);
    this.updatePlacement();
    this.fitCamera({ instant: true });
    this.dispatchEvent(new Event('modelchange'));
  }

  clearModel(notify = true) {
    this.setSelection(null);
    if (this.model) {
      this.modelPivot.remove(this.model);
      disposeObject(this.model);
      this.model = null;
    }
    this.modelPivot.rotation.set(0, 0, 0);
    this.box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    this._applyBounds();
    this.needsRender = true;
    if (notify) this.dispatchEvent(new Event('modelchange'));
  }

  /** Modeli zeminin ortasına oturtur ve sınır kutusuna göre ızgara/gölge ölçeğini ayarlar. */
  updatePlacement() {
    this.modelWrapper.position.set(0, 0, 0);
    this.modelWrapper.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (this.model) {
      this.model.traverse(o => {
        if (o.userData.isOverlay || !(o.isMesh || o.isPoints || o.isLine)) return;
        if (!isVisibleDeep(o)) return;
        const b = new THREE.Box3().setFromObject(o, false);
        if (!b.isEmpty() && Number.isFinite(b.min.x) && Number.isFinite(b.max.x)) box.union(b);
      });
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const c = box.getCenter(new THREE.Vector3());
    this.modelWrapper.position.set(-c.x, -box.min.y, -c.z);
    this.modelWrapper.updateMatrixWorld(true);
    this.box.copy(box).translate(this.modelWrapper.position);
    this._applyBounds();
    this.dispatchEvent(new Event('placement'));
  }

  _applyBounds() {
    const size = this.box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.length() / 2, 1e-4);
    this.box.getCenter(this.center);
    const R = this.radius;
    const extent = R * 40;
    this.grid.scale.set(extent, 1, extent);
    this.grid.position.set(this.center.x, -R * 0.0015, this.center.z);
    const cell = Math.pow(10, Math.round(Math.log10((2 * R) / 12)));
    this.gridCell = cell;
    const u = this.grid.material.uniforms;
    u.uCell.value = cell;
    u.uFade.value = R * 9;
    u.uCenter.value.copy(this.center);
    this.shadowCatcher.scale.set(extent, 1, extent);
    this.shadowCatcher.position.set(this.center.x, -R * 0.001, this.center.z);
    this.bboxHelper.box.copy(this.box);
    this.controls.maxDistance = R * 60;
    this.controls.minDistance = R * 0.005;
    this.dispatchEvent(new Event('bounds'));
    this.needsRender = true;
  }

  rotateModel(axis, deg) {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
      THREE.MathUtils.degToRad(deg));
    this.modelPivot.quaternion.premultiply(q);
    this.modelPivot.updateMatrixWorld(true);
    this.updatePlacement();
    this.refreshSelectionBox();
    this.fitCamera();
  }

  /** Kullanıcı döndürmelerini atıp modeli açılış yönüne (veya verilen X açısına) getirir. */
  setBaseRotation(rotateX = this.baseRotateX || 0) {
    this.baseRotateX = rotateX;
    this.modelPivot.rotation.set(THREE.MathUtils.degToRad(rotateX), 0, 0);
    this.modelPivot.updateMatrixWorld(true);
    this.updatePlacement();
    this.refreshSelectionBox();
    this.fitCamera();
  }

  resetModelRotation() {
    this.setBaseRotation();
  }

  /* ------------------------------------------------------------ camera */
  fitCamera({ instant = false, view = 'home', box = null } = {}) {
    const b = box || this.box;
    const sphere = b.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 1e-4);
    const dir = new THREE.Vector3(...(VIEW_DIRS[view] || VIEW_DIRS.home)).normalize();
    const cam = this.perspCamera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    const dist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * 1.06;
    const target = sphere.center.clone();
    if (this.camera.isOrthographicCamera) {
      const a = this.width / this.height;
      this.orthoHalfHeight = r * 1.12 * Math.max(1, 1 / a);
      this.orthoCamera.zoom = 1;
      this._updateOrthoFrustum();
    }
    this.animateCamera(target.clone().addScaledVector(dir, dist), target, instant ? 0 : 520);
  }

  /** Mevcut uzaklığı koruyarak verilen yönden bakar (eksen göstergesi, standart görünümler). */
  lookFrom(dirVec, instant = false) {
    const dir = dirVec.clone().normalize();
    if (Math.abs(dir.y) > 0.999) dir.z += 1e-4;
    const t = this.controls.target.clone();
    const d = this.camera.position.distanceTo(t);
    this.animateCamera(t.clone().addScaledVector(dir.normalize(), d), t, instant ? 0 : 450);
  }

  focusObject(obj) {
    if (!obj) return;
    const box = new THREE.Box3();
    for (const r of selectionRoots(obj)) box.union(new THREE.Box3().setFromObject(r, false));
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const vFov = THREE.MathUtils.degToRad(this.perspCamera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.perspCamera.aspect);
    const dist = (Math.max(sphere.radius, 1e-4) / Math.sin(Math.min(vFov, hFov) / 2)) * 1.15;
    if (this.camera.isOrthographicCamera) {
      this.orthoCamera.zoom = this.orthoHalfHeight / (sphere.radius * 1.2);
      this.orthoCamera.updateProjectionMatrix();
    }
    this.animateCamera(sphere.center.clone().addScaledVector(dir, dist), sphere.center.clone(), 480);
  }

  animateCamera(toPos, toTarget, duration = 450) {
    const cam = this.camera;
    if (duration <= 0) {
      this.tween = null;
      cam.position.copy(toPos);
      this.controls.target.copy(toTarget);
      cam.lookAt(toTarget);
      this.controls.update();
      this.needsRender = true;
      return;
    }
    const fromDir = cam.position.clone().sub(this.controls.target);
    const toDir = toPos.clone().sub(toTarget);
    this.tween = {
      t: 0,
      duration: duration / 1000,
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
      fromLen: fromDir.length(),
      toLen: toDir.length(),
      fromDirN: fromDir.normalize(),
      rot: new THREE.Quaternion().setFromUnitVectors(fromDir.clone(), toDir.clone().normalize()),
    };
  }

  _stepTween(dt) {
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    const k = easeInOut(tw.t);
    const target = tw.fromTarget.clone().lerp(tw.toTarget, k);
    const q = new THREE.Quaternion().slerp(tw.rot, k);
    const dir = tw.fromDirN.clone().applyQuaternion(q);
    const len = THREE.MathUtils.lerp(tw.fromLen, tw.toLen, k);
    this.camera.position.copy(target).addScaledVector(dir, len);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    if (tw.t >= 1) {
      this.tween = null;
      this.controls.update();
    }
  }

  setOrtho(on) {
    if (on === this.flags.ortho) return;
    const from = this.camera;
    const target = this.controls.target;
    const dist = from.position.distanceTo(target);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov) / 2);
    if (on) {
      this.orthoHalfHeight = dist * tanHalf;
      this.orthoCamera.zoom = 1;
      this.orthoCamera.position.copy(from.position);
      this.orthoCamera.quaternion.copy(from.quaternion);
      this._updateOrthoFrustum();
      this.camera = this.orthoCamera;
    } else {
      const visibleHalf = this.orthoHalfHeight / this.orthoCamera.zoom;
      const d = visibleHalf / tanHalf;
      const dir = from.position.clone().sub(target).normalize();
      this.perspCamera.position.copy(target).addScaledVector(dir, d);
      this.perspCamera.quaternion.copy(from.quaternion);
      this.camera = this.perspCamera;
    }
    this.flags.ortho = on;
    this.controls.object = this.camera;
    this.controls.update();
    this.needsRender = true;
  }

  _updateClipping() {
    const cam = this.camera;
    const R = this.radius;
    const d = cam.position.distanceTo(this.center);
    let near;
    let far;
    if (cam.isPerspectiveCamera) {
      const s = d - R;
      near = Math.max(s * 0.25, d * 0.002, R * 1e-4);
      far = d + R * 30;
    } else {
      near = Math.max(R * 1e-3, 1e-5);
      far = d + R * 30;
    }
    if (Math.abs(cam.near - near) > near * 0.01 || Math.abs(cam.far - far) > far * 0.01) {
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  }

  getCameraAzimuth() {
    return this.controls.getAzimuthalAngle();
  }

  /* --------------------------------------------------------- toggles */
  setFlag(name, value) {
    this.flags[name] = value;
    if (name === 'grid') this.grid.visible = value;
    if (name === 'shadowCatcher') this.shadowCatcher.visible = value;
    if (name === 'bbox') this.bboxHelper.visible = value && !!this.model;
    if (name === 'autoRotate') this.controls.autoRotate = value;
    if (name === 'ortho') this.setOrtho(value);
    this.needsRender = true;
  }

  setGridColors(minor, major, opacity) {
    const u = this.grid.material.uniforms;
    u.uMinor.value.set(minor);
    u.uMajor.value.set(major);
    u.uOpacity.value = opacity;
    this.needsRender = true;
  }

  /* --------------------------------------------------------- selection */
  setSelection(obj) {
    this.selection = obj || null;
    this.refreshSelectionBox();
  }

  refreshSelectionBox() {
    const roots = selectionRoots(this.selection).filter(isVisibleDeep);
    if (roots.length) {
      const box = this.selectionHelper.box.makeEmpty();
      for (const r of roots) {
        // kemikli mesh'lerin önbellekteki kutusu eski pozdan kalmış olabilir
        r.traverse(o => { if (o.isSkinnedMesh && !o.userData.isOverlay) o.computeBoundingBox(); });
        box.union(new THREE.Box3().setFromObject(r, false));
      }
      this.selectionHelper.visible = !box.isEmpty();
    } else {
      this.selectionHelper.visible = false;
    }
    this.bboxHelper.visible = this.flags.bbox && !!this.model;
    this.needsRender = true;
  }

  /** Ekran koordinatındaki ilk görünür model yüzeyini bulur. */
  pickAt(clientX, clientY) {
    if (!this.model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.model, true);
    for (const hit of hits) {
      const o = hit.object;
      if (o.userData.isOverlay || !isVisibleDeep(o)) continue;
      return { object: o, point: hit.point, materialIndex: hit.face ? hit.face.materialIndex : 0 };
    }
    return null;
  }

  _installPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
      el.focus({ preventScroll: true });
    });
    el.addEventListener('pointerup', e => {
      if (!down || e.button !== down.button) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4 || e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      if (this.flags.axes) {
        const dir = this.gizmo.pick(e.clientX, e.clientY, rect);
        if (dir && dir !== 'inside') { this.lookFrom(dir); return; }
        if (dir === 'inside') return;
      }
      const hit = this.pickAt(e.clientX, e.clientY);
      this.dispatchEvent(Object.assign(new Event('pick'), { hit, shiftKey: e.shiftKey }));
    });
    el.addEventListener('dblclick', e => {
      const hit = this.pickAt(e.clientX, e.clientY);
      if (hit) this.dispatchEvent(Object.assign(new Event('focuspick'), { hit }));
    });
    el.addEventListener('pointermove', e => {
      if (this.flags.axes && e.buttons === 0 && this.gizmo.hover(e.clientX, e.clientY, el.getBoundingClientRect())) {
        this.needsRender = true;
      }
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* --------------------------------------------------------- rendering */
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    let dirty = this.needsRender;
    this.needsRender = false;
    if (this.tween) {
      this._stepTween(dt);
      dirty = true;
    } else if (this.controls.update(dt)) {
      dirty = true;
    }
    for (const fn of this.updaters) if (fn(dt)) dirty = true;
    if (dirty) this.render();
  }

  render() {
    this._updateClipping();
    this.dispatchEvent(new Event('beforerender'));
    const r = this.renderer;
    r.setViewport(0, 0, this.width, this.height);
    r.render(this.scene, this.camera);
    if (this.flags.axes) this.gizmo.render(r, this.camera, this.width, this.height);
  }

  /** Mevcut görünümün PNG data URL'si (göstergeler ve seçim kutusu hariç). */
  capture({ transparent = false, scale = 1 } = {}) {
    const r = this.renderer;
    const prevBg = this.scene.background;
    const prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevPR = r.getPixelRatio();
    const hidden = [this.selectionHelper, this.bboxHelper].filter(o => o.visible);
    hidden.forEach(o => { o.visible = false; });
    const gridVisible = this.grid.visible;
    if (transparent) {
      this.scene.background = null;
      r.setClearColor(0x000000, 0);
      this.grid.visible = false;
    }
    if (scale !== 1) r.setPixelRatio(prevPR * scale);
    this._updateClipping();
    this.dispatchEvent(new Event('beforerender'));
    r.setViewport(0, 0, this.width, this.height);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    if (scale !== 1) r.setPixelRatio(prevPR);
    this.scene.background = prevBg;
    r.setClearColor(prevColor, prevAlpha);
    this.grid.visible = gridVisible;
    hidden.forEach(o => { o.visible = true; });
    this.render();
    return url;
  }
}

export function isVisibleDeep(o) {
  if (o?.isSelectionGroup) return o.members.some(isVisibleDeep);
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Seçim tek bir nesne ya da sahne ağacındaki sanal bir grup (materyale / ada göre) olabilir.
 * Sanal grup: { isSelectionGroup: true, name, members: Object3D[] }.
 */
export function selectionRoots(sel) {
  if (!sel) return [];
  return sel.isSelectionGroup ? sel.members : [sel];
}

export function makeSelectionGroup(name, members, kind = 'group') {
  return { isSelectionGroup: true, name, kind, members, type: 'Group' };
}

export function disposeObject(root) {
  const geos = new Set();
  const mats = new Set();
  const texs = new Set();
  root.traverse(o => {
    if (o.geometry) {
      geos.add(o.geometry);
      if (o.geometry.userData.wireGeometry) geos.add(o.geometry.userData.wireGeometry);
    }
    const list = [o.material, o.userData.origMaterial].flat().filter(Boolean);
    for (const m of list) {
      if (m.userData.shared) continue;
      mats.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
      const stash = m.userData.__stash;
      if (stash) Object.values(stash).forEach(t => t && texs.add(t));
    }
    if (o.skeleton) o.skeleton.dispose?.();
  });
  geos.forEach(g => g.dispose());
  texs.forEach(t => t.dispose());
  mats.forEach(m => { if (!m.userData.shared) m.dispose(); });
}
