// Sağ alt köşedeki 3B eksen göstergesi (tıklanınca o eksenden bakar)
import * as THREE from 'three';

const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), color: '#ff4f62', label: 'X' },
  { dir: new THREE.Vector3(0, 1, 0), color: '#72d34f', label: 'Y' },
  { dir: new THREE.Vector3(0, 0, 1), color: '#4d8dff', label: 'Z' },
];

function labelTexture(color, text, dim) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(32, 32, dim ? 20 : 28, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fill();
  if (dim) {
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (text) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#101216';
    ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class AxisGizmo {
  constructor() {
    this.size = 112;
    this.margin = 10;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0, 10);
    this.camera.position.set(0, 0, 5);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.sprites = [];
    this.raycaster = new THREE.Raycaster();

    const backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(1.42, 48),
      new THREE.MeshBasicMaterial({ color: 0x0c0e12, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }),
    );
    backdrop.position.z = -3;
    backdrop.renderOrder = -1;
    this.scene.add(backdrop);

    for (const a of AXES) {
      const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8);
      geo.translate(0, 0.39, 0);
      const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: a.color, toneMapped: false }));
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      this.root.add(line);
      for (const sign of [1, -1]) {
        const mat = new THREE.SpriteMaterial({ map: labelTexture(a.color, sign > 0 ? a.label : '', sign < 0), toneMapped: false });
        const sp = new THREE.Sprite(mat);
        sp.scale.setScalar(sign > 0 ? 0.5 : 0.36);
        sp.position.copy(a.dir).multiplyScalar(sign);
        sp.userData.dir = a.dir.clone().multiplyScalar(sign);
        sp.userData.baseScale = sp.scale.x;
        this.root.add(sp);
        this.sprites.push(sp);
      }
    }
    this.hovered = null;
  }

  render(renderer, camera, width, height) {
    this.root.quaternion.copy(camera.quaternion).invert();
    this.root.updateMatrixWorld();
    const s = this.size;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.setViewport(width - s - this.margin, this.margin, s, s);
    renderer.render(this.scene, this.camera);
    renderer.setViewport(0, 0, width, height);
    renderer.autoClear = auto;
  }

  /** İstemci koordinatlarındaki tıklama bir eksene denk geliyorsa bakış yönünü döndürür. */
  pick(clientX, clientY, rect) {
    const s = this.size;
    const lx = clientX - rect.left - (rect.width - s - this.margin);
    const ly = clientY - rect.top - (rect.height - s - this.margin);
    if (lx < 0 || ly < 0 || lx > s || ly > s) return null;
    const ndc = new THREE.Vector2((lx / s) * 2 - 1, -(ly / s) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.sprites, false);
    return hits.length ? hits[0].object.userData.dir.clone() : 'inside';
  }

  hover(clientX, clientY, rect) {
    const dir = this.pick(clientX, clientY, rect);
    let target = null;
    if (dir && dir !== 'inside') target = this.sprites.find(sp => sp.userData.dir.equals(dir));
    if (target === this.hovered) return false;
    if (this.hovered) this.hovered.scale.setScalar(this.hovered.userData.baseScale);
    this.hovered = target;
    if (target) target.scale.setScalar(target.userData.baseScale * 1.22);
    return true;
  }
}
