// Prosedürel dokular: UV dama tahtası, matcap küreleri, gradyan arka plan, ortam (env) sahnesi
import * as THREE from 'three';

/* ------------------------------------------------------------- UV checker */
// Satırlar A–H (üstten alta), sütunlar 0–7 (soldan sağa). Her hücredeki ↑ oku +V yönünü
// gösterir: ok aşağı bakıyorsa UV dikeyde ters, etiket aynalanmışsa UV yatayda ters çevrilmiştir.
const CHECKER_COLORS = ['#22506e', '#7fd3c8', '#f6e3a1', '#f29a7e', '#c9406c', '#2b2b2e', '#8c8c8f', '#d9d9db'];

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export function makeCheckerTexture(size = 1024, cells = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = size / cells;
  const letters = 'ABCDEFGHIJKLMNOP';
  for (let r = 0; r < cells; r++) {
    for (let col = 0; col < cells; col++) {
      const bg = CHECKER_COLORS[(r * 3 + col * 5 + (r >> 1)) % CHECKER_COLORS.length];
      const x = col * s;
      const y = r * s;
      const light = luminance(bg) > 0.55;
      const ink = light ? '#1d2228' : '#ffffff';
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, s, s);
      // ince iç ızgara
      ctx.strokeStyle = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = Math.max(1, size / 1024);
      for (let i = 1; i < 8; i++) {
        const o = Math.round((i * s) / 8) + 0.5;
        ctx.beginPath(); ctx.moveTo(x + o, y); ctx.lineTo(x + o, y + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + o); ctx.lineTo(x + s, y + o); ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.font = `600 ${Math.round(s * 0.26)}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${letters[r]}${col}`, x + s / 2, y + s * 0.3);
      // +V yönünü gösteren ok
      const ax = x + s / 2;
      const top = y + s * 0.5;
      const bottom = y + s * 0.86;
      const head = s * 0.11;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(2, s * 0.035);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ax, bottom); ctx.lineTo(ax, top + head * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - head, top + head); ctx.lineTo(ax, top); ctx.lineTo(ax + head, top + head); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, size / 512);
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ matcap */
export const MATCAP_PRESETS = [
  { id: 'clay', name: 'Gri Kil', base: '#c9c5bf', shadow: '#3f3c3a', spec: 0.22, shin: 14, rim: '#ffffff', rimK: 0.12 },
  { id: 'redwax', name: 'Kırmızı Mum', base: '#d4473a', shadow: '#3a0c09', spec: 0.55, shin: 42, rim: '#ffb3a8', rimK: 0.15 },
  { id: 'jade', name: 'Yeşim', base: '#6cc59c', shadow: '#0f3326', spec: 0.5, shin: 30, rim: '#d6fff0', rimK: 0.3 },
  { id: 'skin', name: 'Ten', base: '#e3ae92', shadow: '#5e3123', spec: 0.25, shin: 20, rim: '#ffd8c8', rimK: 0.25 },
  { id: 'chrome', name: 'Krom', chrome: true, sky: '#f4f8ff', horizon: '#3a3f48', ground: '#8d96a3', spec: 1, shin: 80 },
  { id: 'gold', name: 'Altın', chrome: true, sky: '#fff1c2', horizon: '#5a3a08', ground: '#c08a2a', spec: 1, shin: 70 },
];

const hex2rgb = h => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b].map(v => THREE.MathUtils.clamp(Math.pow(v, 1 / 2.2), 0, 1));
};

export function makeMatcapTexture(p, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const L = new THREE.Vector3(-0.5, 0.6, 0.65).normalize();
  const base = p.base ? hex2rgb(p.base) : null;
  const shadow = p.shadow ? hex2rgb(p.shadow) : null;
  const rim = p.rim ? hex2rgb(p.rim) : null;
  const sky = p.sky ? hex2rgb(p.sky) : null;
  const hor = p.horizon ? hex2rgb(p.horizon) : null;
  const gnd = p.ground ? hex2rgb(p.ground) : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = -(((y + 0.5) / size) * 2 - 1);
      let r2 = nx * nx + ny * ny;
      const edge = r2 > 1;
      if (edge) r2 = 1;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const ndl = nx * L.x + ny * L.y + nz * L.z;
      // yansıma vektörü (göz +Z)
      const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
      const rdl = Math.max(0, rx * L.x + ry * L.y + rz * L.z);
      const spec = Math.pow(rdl, p.shin) * p.spec;
      let col;
      if (p.chrome) {
        const t = ry;
        const a = t > 0 ? Math.pow(t, 0.55) : Math.pow(-t, 0.5);
        const from = hor, to = t > 0 ? sky : gnd;
        col = from.map((v, i) => v + (to[i] - v) * a);
        col = col.map(v => v + spec * 0.6);
      } else {
        const wrap = THREE.MathUtils.clamp((ndl + 0.35) / 1.35, 0, 1);
        const fres = Math.pow(1 - nz, 3) * p.rimK;
        col = shadow.map((v, i) => v + (base[i] - v) * wrap + spec + rim[i] * fres);
      }
      const k = (y * size + x) * 4;
      img.data[k] = Math.min(255, col[0] * 255);
      img.data[k + 1] = Math.min(255, col[1] * 255);
      img.data[k + 2] = Math.min(255, col[2] * 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.preview = c.toDataURL();
  return tex;
}

/* --------------------------------------------------------- gradient bg */
export function drawGradient(canvas, bg) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  let g;
  if (bg.type === 'radial') {
    g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.hypot(w, h) * 0.62);
  } else {
    const a = THREE.MathUtils.degToRad(bg.angle ?? 180);
    const dx = Math.sin(a) * 0.5, dy = -Math.cos(a) * 0.5;
    g = ctx.createLinearGradient(w * (0.5 - dx), h * (0.5 - dy), w * (0.5 + dx), h * (0.5 + dy));
  }
  g.addColorStop(0, bg.color1);
  g.addColorStop(1, bg.color2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 8-bit gradyan bantlaşmasını azaltmak için hafif gürültü
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2.2;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function makeGradientTexture(bg, aspect) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = Math.max(64, Math.round(640 / Math.max(aspect, 0.1)));
  if (c.height > 1600) { c.height = 1600; c.width = Math.round(1600 * aspect); }
  drawGradient(c, bg);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------- environment */
const PANEL_SPOTS = [[40, 42], [-125, 24], [165, 58], [-40, 70], [95, 12]];

/** Tema ortam ayarlarından PMREM'e verilecek basit bir "stüdyo" sahnesi kurar. */
export function buildEnvScene(env) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        sky: { value: new THREE.Color(env.sky) },
        horizon: { value: new THREE.Color(env.horizon) },
        ground: { value: new THREE.Color(env.ground) },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sky; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
        void main(){ float h = normalize(vDir).y;
          vec3 c = h > 0.0 ? mix(horizon, sky, pow(h, 0.6)) : mix(horizon, ground, pow(-h, 0.4));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  scene.add(dome);
  (env.panels || []).forEach((color, i) => {
    const [az, el] = PANEL_SPOTS[i % PANEL_SPOTS.length];
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(env.panelStrength ?? 3.2), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(i === 0 ? 4.2 : 3, i === 0 ? 3 : 2.2), mat);
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    panel.position.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).multiplyScalar(7);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  });
  return scene;
}

export function disposeScene(scene) {
  scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
}
