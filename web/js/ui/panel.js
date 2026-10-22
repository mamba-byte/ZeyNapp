// Sağ panel: (1) Ortam ve Aydınlatma, (2) İstatistikler ve Sahne Ağacı, (3) Gölgelendirme ve Materyal
import * as THREE from 'three';
import { h, section, slider, colorPicker, toggle, select, segmented, button, row, fmtNum, fmtShort, fmtBytes } from './dom.js';
import { icon } from './icons.js';
import { LightDial } from './lightdial.js';
import { THEMES, BG_PRESETS } from '../themes.js';
import { MODE_INFO, MODES, materialsOf } from '../shading.js';
import { MATCAP_PRESETS } from '../textures.js';
import { triangleCount } from '../stats.js';

const TABS = [
  { id: 'env', icon: 'sun', title: 'Ortam ve Aydınlatma' },
  { id: 'scene', icon: 'tree', title: 'İstatistikler ve Sahne Ağacı' },
  { id: 'shading', icon: 'shading', title: 'Gölgelendirme, Tel Kafes ve Materyal' },
];

export class Panel {
  constructor(app) {
    this.app = app;
    this.nav = document.querySelector('.panel-tabs');
    this.body = document.getElementById('panel-body');
    this.titleEl = document.getElementById('panel-title');
    this.buttons = new Map();
    for (const t of TABS) {
      const b = h('button', { class: 'panel-tab', role: 'tab', 'data-tip': t.title, onclick: () => this.show(t.id) }, icon(t.icon, 20));
      this.nav.append(b);
      this.buttons.set(t.id, b);
    }
    this.nav.append(h('button', {
      class: 'panel-tab collapse', 'data-tip': 'Paneli gizle', 'data-key': 'N', onclick: () => app.command('toggle', 'panel'),
    }, icon('panelClose', 18)));
    this.env = new EnvTab(app);
    this.scene = new SceneTab(app);
    this.shading = new ShadingTab(app);
    this.pages = { env: this.env.el, scene: this.scene.el, shading: this.shading.el };
    Object.values(this.pages).forEach(p => this.body.append(p));
    this.current = 'env';
    this.show('env');
  }

  show(id) {
    if (!this.pages[id]) return;
    this.current = id;
    for (const [k, b] of this.buttons) b.classList.toggle('active', k === id);
    for (const [k, p] of Object.entries(this.pages)) p.classList.toggle('active', k === id);
    this.titleEl.textContent = TABS.find(t => t.id === id).title;
    if (id === 'shading') this.shading.drawUV();
  }
}

/* ======================================================================= */
/*  1) Ortam ve Aydınlatma                                                 */
/* ======================================================================= */
class EnvTab {
  constructor(app) {
    this.app = app;
    const env = app.env;
    this.el = h('div', { class: 'tab-page' });
    const changed = () => { env.dispatchEvent(new Event('change')); };
    const lights = () => { env.applyLightsAll(); changed(); };

    // --- temalar
    const themes = section('Temalar');
    this.cards = new Map();
    const grid = h('div', { class: 'theme-grid' });
    for (const t of THEMES) {
      const thumb = h('div', { class: 'theme-thumb' });
      thumb.style.background = `radial-gradient(circle at 40% 38%, ${t.key.color} 0%, ${t.rim.color} 26%, ${t.background.color2} 70%)`;
      const card = h('button', { class: 'theme-card', onclick: () => app.command('theme', t.id) }, thumb, h('div', { class: 'theme-name', text: t.name }));
      grid.append(card);
      this.cards.set(t.id, { card, thumb });
    }
    themes.body.append(grid, h('div', { class: 'btn-row' },
      button('Ayarları kaydet', { icon: 'save', cls: 'btn-sm', onClick: () => app.command('exportSettings') }),
      button('Ayarları yükle', { icon: 'upload', cls: 'btn-sm', onClick: () => app.command('importSettings') })));
    this.el.append(themes.el);

    // --- arka plan
    const bg = section('Arka Plan');
    const patchBg = patch => { Object.assign(env.state.background, patch); env.applyBackground(); changed(); this.syncBg(); };
    this.bgMode = segmented({
      options: [['solid', 'Düz'], ['linear', 'Doğrusal'], ['radial', 'Radyal'], ['environment', 'Ortam']],
      value: 'radial',
      onChange: v => patchBg(v === 'linear' || v === 'radial' ? { mode: 'gradient', type: v } : { mode: v }),
    });
    this.bgColor1 = colorPicker({ label: 'Renk', value: '#596170', onInput: v => patchBg({ color1: v }) });
    this.bgColor2 = colorPicker({ label: 'Dış / alt renk', value: '#1b1e24', onInput: v => patchBg({ color2: v }) });
    this.bgAngle = slider({ label: 'Geçiş açısı', min: 0, max: 360, step: 1, value: 180, format: v => `${v}°`, onInput: v => patchBg({ angle: v }) });
    this.bgBlur = slider({ label: 'Bulanıklık', min: 0, max: 1, step: 0.01, value: 0.35, onInput: v => patchBg({ blur: v }) });
    const chips = h('div', { class: 'chips' }, ...BG_PRESETS.map(p => h('button', {
      class: 'chip', onclick: () => patchBg({ ...p.bg }),
    }, h('span', { class: 'dot', style: { background: p.bg.color1 } }), p.name)));
    bg.body.append(this.bgMode.el, this.bgColor1.el, this.bgColor2.el, this.bgAngle.el, this.bgBlur.el,
      h('div', { class: 'sub-label', text: 'Hızlı önayarlar' }), chips);
    this.el.append(bg.el);

    // --- ışık
    const light = section('Işık');
    this.dialAz = h('b');
    this.dialEl = h('b');
    this.dial = new LightDial({
      onChange: (az, el) => {
        env.state.key.azimuth = az;
        env.state.key.elevation = el;
        this.az.set(az);
        this.elev.set(el);
        this.syncDialInfo();
        lights();
      },
    });
    light.body.append(h('div', { class: 'dial-wrap' }, this.dial.svg,
      h('div', { class: 'dial-info' }, h('div', {}, 'Azimut', this.dialAz), h('div', {}, 'Yükseklik', this.dialEl),
        h('div', { class: 'hint', text: 'Güneşi sürükleyerek ana ışığı döndürün.' }))));
    const keyUpdate = (k, v) => { env.state.key[k] = v; this.dial.set(env.state.key.azimuth, env.state.key.elevation); this.syncDialInfo(); lights(); };
    this.az = slider({ label: 'Azimut', min: -180, max: 180, step: 1, value: 35, format: v => `${v}°`, onInput: v => keyUpdate('azimuth', v) });
    this.elev = slider({ label: 'Yükseklik', min: 2, max: 90, step: 1, value: 48, format: v => `${v}°`, onInput: v => keyUpdate('elevation', v) });
    this.keyColor = colorPicker({ label: 'Işık rengi', value: '#ffffff', onInput: v => keyUpdate('color', v) });
    this.keyInt = slider({ label: 'Işık şiddeti', min: 0, max: 8, step: 0.05, value: 2.6, onInput: v => keyUpdate('intensity', v) });
    this.rotateRig = toggle({ label: 'Tüm ışık düzenini döndür', value: true, tip: 'Dolgu/kenar ışıkları ve yansımalar ana ışıkla birlikte döner', onChange: v => { env.state.rotateRig = v; lights(); } });
    this.follow = toggle({ label: 'Işık kamerayı takip etsin', value: false, onChange: v => { env.state.followCamera = v; lights(); } });
    this.ambColor = colorPicker({ label: 'Ortam rengi', value: '#ffffff', onInput: v => { env.state.ambient.color = v; lights(); } });
    this.ambInt = slider({ label: 'Ortam faktörü', min: 0, max: 3, step: 0.01, value: 0.3, onInput: v => { env.state.ambient.intensity = v; lights(); } });
    this.hemiInt = slider({ label: 'Gökyüzü ışığı', min: 0, max: 3, step: 0.01, value: 0.6, onInput: v => { env.state.hemi.intensity = v; lights(); } });
    this.fillInt = slider({ label: 'Dolgu ışığı', min: 0, max: 5, step: 0.05, value: 0.8, onInput: v => { env.state.fill.intensity = v; lights(); } });
    this.rimInt = slider({ label: 'Kenar ışığı', min: 0, max: 6, step: 0.05, value: 1.2, onInput: v => { env.state.rim.intensity = v; lights(); } });
    this.envInt = slider({ label: 'Yansımalar', min: 0, max: 3, step: 0.01, value: 1, onInput: v => env.update('envIntensity', v) });
    this.exposure = slider({ label: 'Pozlama', min: 0.1, max: 3, step: 0.01, value: 1, onInput: v => env.update('exposure', v) });
    this.tone = select({
      label: 'Ton eşleme', value: 'neutral',
      options: [['neutral', 'Nötr (PBR Neutral)'], ['aces', 'ACES Filmic'], ['agx', 'AgX'], ['none', 'Yok (Doğrusal)']],
      onChange: v => env.update('toneMapping', v),
    });
    light.body.append(this.az.el, this.elev.el, this.keyColor.el, this.keyInt.el, this.rotateRig.el, this.follow.el,
      h('div', { class: 'sub-label', text: 'Ortam ve dolgu' }), this.ambColor.el, this.ambInt.el, this.hemiInt.el, this.fillInt.el, this.rimInt.el,
      h('div', { class: 'sub-label', text: 'Yansıma ve ton' }), this.envInt.el, this.exposure.el, this.tone.el);
    this.el.append(light.el);

    // --- gölgeler
    const sh = section('Gölgeler');
    this.shOn = toggle({ label: 'Gölgeleri göster', value: true, onChange: v => env.update('shadows.enabled', v) });
    this.shOpacity = slider({ label: 'Zemin gölgesi', min: 0, max: 1, step: 0.01, value: 0.38, onInput: v => env.update('shadows.opacity', v) });
    this.shSoft = slider({ label: 'Yumuşaklık', min: 0, max: 8, step: 0.1, value: 2, format: v => v.toFixed(1), onInput: v => env.update('shadows.softness', v) });
    this.shSelf = toggle({ label: 'Model üzerine gölge düşür', value: true, onChange: v => env.update('shadows.selfShadow', v) });
    sh.body.append(this.shOn.el, this.shOpacity.el, this.shSoft.el, this.shSelf.el);
    this.el.append(sh.el);

    // --- sahne yardımcıları
    const sc = section('Sahne');
    const flag = (label, name, key) => toggle({ label: key ? `${label}  (${key})` : label, value: false, onChange: v => app.command('setFlag', { name, value: v }) });
    this.flags = {
      grid: flag('Zemin ızgarası', 'grid', 'G'),
      shadowCatcher: flag('Gölge yakalayıcı zemin', 'shadowCatcher'),
      axes: flag('Eksen göstergesi', 'axes', 'X'),
      bbox: flag('Sınır kutusu', 'bbox', 'B'),
      autoRotate: flag('Otomatik döndür', 'autoRotate', 'R'),
    };
    this.rotSpeed = slider({ label: 'Dönüş hızı', min: 0.2, max: 12, step: 0.1, value: 2, format: v => v.toFixed(1), onInput: v => { app.viewer.controls.autoRotateSpeed = v; app.persist(); } });
    sc.body.append(...Object.values(this.flags).map(f => f.el), this.rotSpeed.el,
      h('div', { class: 'hint' }, 'Izgara hücresi: ', this.cellInfo = h('span', { text: '—' })));
    this.el.append(sc.el);
  }

  setThumbnails(map) {
    for (const [id, url] of map) {
      const c = this.cards.get(id);
      if (c) { c.thumb.style.background = ''; c.thumb.innerHTML = ''; c.thumb.append(h('img', { src: url, alt: '' })); }
    }
  }

  syncDialInfo() {
    const k = this.app.env.state.key;
    this.dialAz.textContent = `${Math.round(k.azimuth)}°`;
    this.dialEl.textContent = `${Math.round(k.elevation)}°`;
  }

  syncBg() {
    const b = this.app.env.state.background;
    this.bgMode.set(b.mode === 'gradient' ? b.type : b.mode);
    this.bgColor1.set(b.color1);
    this.bgColor2.set(b.color2);
    this.bgAngle.set(b.angle ?? 180);
    this.bgBlur.set(b.blur ?? 0.35);
    const grad = b.mode === 'gradient';
    this.bgColor1.el.querySelector('label').textContent = grad ? (b.type === 'radial' ? 'İç renk' : 'Başlangıç rengi') : 'Renk';
    this.bgColor1.el.hidden = b.mode === 'environment';
    this.bgColor2.el.hidden = !grad;
    this.bgColor2.el.querySelector('label').textContent = b.type === 'radial' ? 'Dış renk' : 'Bitiş rengi';
    this.bgAngle.el.hidden = !(grad && b.type === 'linear');
    this.bgBlur.el.hidden = b.mode !== 'environment';
  }

  sync() {
    const s = this.app.env.state;
    for (const [id, c] of this.cards) c.card.classList.toggle('active', id === s.theme);
    this.syncBg();
    this.dial.set(s.key.azimuth, s.key.elevation);
    this.syncDialInfo();
    this.az.set(s.key.azimuth);
    this.elev.set(s.key.elevation);
    this.keyColor.set(s.key.color);
    this.keyInt.set(s.key.intensity);
    this.rotateRig.set(s.rotateRig);
    this.follow.set(s.followCamera);
    this.ambColor.set(s.ambient.color);
    this.ambInt.set(s.ambient.intensity);
    this.hemiInt.set(s.hemi.intensity);
    this.fillInt.set(s.fill.intensity);
    this.rimInt.set(s.rim.intensity);
    this.envInt.set(s.envIntensity);
    this.exposure.set(s.exposure);
    this.tone.set(s.toneMapping);
    this.shOn.set(s.shadows.enabled);
    this.shOpacity.set(s.shadows.opacity);
    this.shSoft.set(s.shadows.softness);
    this.shSelf.set(s.shadows.selfShadow);
    this.syncFlags();
  }

  syncFlags() {
    const f = this.app.viewer.flags;
    for (const [k, t] of Object.entries(this.flags)) t.set(f[k]);
    this.rotSpeed.set(this.app.viewer.controls.autoRotateSpeed);
    const cell = this.app.viewer.gridCell;
    this.cellInfo.textContent = cell ? `${cell.toLocaleString('tr-TR', { maximumSignificantDigits: 3 })} birim (kalın çizgi: ×10)` : '—';
  }
}

/* ======================================================================= */
/*  2) İstatistikler ve Sahne Ağacı                                        */
/* ======================================================================= */
class SceneTab {
  constructor(app) {
    this.app = app;
    this.el = h('div', { class: 'tab-page' });
    this.collapsed = new Set();
    this.rows = new Map();
    this.filter = '';

    const st = section('İstatistikler');
    this.statGrid = h('div', { class: 'stat-grid' });
    this.kv = h('div', { class: 'kv' });
    st.body.append(this.statGrid, this.kv);
    this.el.append(st.el);

    const tr = section('Sahne Ağacı');
    this.treeCount = tr.extra || null;
    const search = h('input', { class: 'text-input', placeholder: 'Parça ara…', spellcheck: 'false' });
    search.addEventListener('input', () => { this.filter = search.value.trim().toLocaleLowerCase('tr'); this.renderTree(); });
    search.addEventListener('keydown', e => e.stopPropagation());
    this.tree = h('div', { class: 'tree' });
    tr.body.append(
      h('div', { class: 'search' }, icon('search', 15), search),
      h('div', { class: 'btn-row' },
        button('Tümünü göster', { icon: 'eye', cls: 'btn-sm', onClick: () => app.command('showAll') }),
        button('Seçiliyi yalıt', { icon: 'focus', cls: 'btn-sm', onClick: () => app.command('isolateSelected') })),
      this.tree,
      h('div', { class: 'hint', text: 'Satıra tıklayarak seçin, çift tıklayarak odaklanın. Göz ikonu parçayı gizler/gösterir.' }));
    this.el.append(tr.el);
    this.setStats(null);
  }

  setStats(stats, topo = null, info = null) {
    this.statGrid.innerHTML = '';
    this.kv.innerHTML = '';
    const cell = (k, v, tip) => this.statGrid.append(h('div', { class: 'stat', 'data-tip': tip || null }, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })));
    if (!stats) {
      this.statGrid.append(h('div', { class: 'hint', text: 'Model yüklendiğinde istatistikler burada görünür.' }));
      return;
    }
    cell('Vertex', topo ? fmtNum(topo.vertices) : 'hesaplanıyor…', 'Konumuna göre birleştirilmiş benzersiz vertex sayısı');
    cell('Poligon (üçgen)', fmtNum(stats.triangles));
    cell('Kenar (edge)', topo ? fmtNum(topo.edges) : 'hesaplanıyor…', 'Benzersiz üçgen kenarı sayısı');
    cell('Materyal', fmtNum(stats.materials));
    cell('Mesh (alt parça)', fmtNum(stats.meshes));
    cell('Doku', fmtNum(stats.textures));
    cell('Kemik', fmtNum(stats.bones));
    cell('Animasyon', fmtNum(stats.animations));
    cell('GPU vertex', fmtNum(stats.gpuVertices), 'Çizim için GPU\'ya gönderilen (bölünmüş) vertex sayısı');
    cell('Morph hedefi', fmtNum(stats.morphTargets));
    const kv = (k, v) => this.kv.append(h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v, title: v }));
    if (info) {
      kv('Dosya', info.name);
      kv('Format', info.format);
      if (info.size) kv('Boyut', fmtBytes(info.size));
      kv('Yükleme süresi', `${(info.loadMs / 1000).toFixed(2).replace('.', ',')} sn`);
    }
    const v = this.app.viewer;
    const size = v.box.getSize(new THREE.Vector3());
    const f = n => n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
    kv('Boyutlar (G×Y×D)', `${f(size.x)} × ${f(size.y)} × ${f(size.z)}`);
    const raw = this.app.rawBox;
    if (raw) {
      kv('BBoxMin', `${f(raw.min.x)}, ${f(raw.min.y)}, ${f(raw.min.z)}`);
      kv('BBoxMax', `${f(raw.max.x)}, ${f(raw.max.y)}, ${f(raw.max.z)}`);
    }
    if (stats.skinned) kv('Kemikli mesh', fmtNum(stats.skinned));
    if (stats.instanced) kv('Örneklenmiş mesh', fmtNum(stats.instanced));
    kv('UV içeren mesh', `${stats.hasUV} / ${stats.meshes}`);
    kv('Vertex rengi olan', `${stats.hasVertexColors} / ${stats.meshes}`);
    if (stats.fileLights) kv('Dosyadaki ışıklar', `${stats.fileLights} (devre dışı)`);
    kv('Çizim çağrısı', fmtNum(v.renderer.info.render.calls));
  }

  /* ------------------------------------------------------------- tree */
  buildTree(root) {
    this.root = root;
    this.collapsed.clear();
    this.meta = new Map();
    if (root) {
      let total = 0;
      const visit = o => {
        if (o.userData.isOverlay || o.isBone || o.isLight || o.isCamera) return null;
        const kids = o.children.map(visit).filter(Boolean);
        const drawable = o.isMesh || o.isPoints || o.isLine;
        if (!drawable && kids.length === 0) return null;
        total++;
        const tris = triangleCount(o) + kids.reduce((a, k) => a + this.meta.get(k).tris, 0);
        this.meta.set(o, { kids, tris });
        return o;
      };
      visit(root);
      if (total > 150) {
        for (const [o, m] of this.meta) if (o !== root && m.kids.length) this.collapsed.add(o);
      }
    }
    this.renderTree();
  }

  renderTree() {
    this.tree.innerHTML = '';
    this.rows.clear();
    const root = this.root;
    if (!root || !this.meta.has(root)) {
      this.tree.append(h('div', { class: 'tree-empty', text: 'Model yüklü değil.' }));
      return;
    }
    const q = this.filter;
    const matches = new Map();
    const test = o => {
      const m = this.meta.get(o);
      const self = !q || (o.name || '').toLocaleLowerCase('tr').includes(q);
      const any = m.kids.map(test).some(Boolean) || self;
      matches.set(o, { self, any });
      return any;
    };
    test(root);
    const frag = document.createDocumentFragment();
    const add = (o, depth) => {
      const m = this.meta.get(o);
      const mt = matches.get(o);
      if (!mt.any) return;
      const open = q ? true : !this.collapsed.has(o);
      const kind = o.isSkinnedMesh ? 'skinned' : o.isMesh ? 'mesh' : o.isPoints ? 'points' : 'group';
      const caret = m.kids.length
        ? h('span', { class: `caret${open ? ' open' : ''}`, onclick: e => { e.stopPropagation(); this.toggleCollapse(o); } }, icon('chevRight', 12))
        : h('span', { class: 'caret' });
      const eye = h('button', { class: 'tree-eye', 'data-tip': 'Gizle / göster', onclick: e => { e.stopPropagation(); this.app.command('setVisible', { object: o, visible: !o.visible }); } },
        icon(o.visible ? 'eye' : 'eyeOff', 15));
      const r = h('div', {
        class: `tree-row${o === this.app.viewer.selection ? ' selected' : ''}${o.visible ? '' : ' hidden-obj'}`,
        style: { paddingLeft: `${4 + depth * 14}px` },
        onclick: () => this.app.command('select', o),
        ondblclick: () => this.app.command('focusObject', o),
      }, caret, h('span', { class: 'kind' }, icon(kind, 14)), h('span', { class: 'tree-name', text: o.name || o.type, title: o.name || o.type }),
      m.tris ? h('span', { class: 'tree-meta', text: fmtShort(m.tris) }) : null, eye);
      frag.append(r);
      this.rows.set(o, r);
      if (open) m.kids.forEach(k => add(k, depth + 1));
    };
    add(root, 0);
    this.tree.append(frag);
    if (!this.rows.size) this.tree.append(h('div', { class: 'tree-empty', text: 'Eşleşen parça yok.' }));
  }

  toggleCollapse(o) {
    if (this.collapsed.has(o)) this.collapsed.delete(o); else this.collapsed.add(o);
    this.renderTree();
  }

  setSelected(obj) {
    if (obj) {
      // seçili öğenin üst düğümlerini aç
      let changed = false;
      for (let p = obj.parent; p; p = p.parent) if (this.collapsed.delete(p)) changed = true;
      if (changed || (!this.rows.has(obj) && this.meta?.has(obj))) this.renderTree();
    }
    for (const [o, r] of this.rows) r.classList.toggle('selected', o === obj);
    this.rows.get(obj)?.scrollIntoView({ block: 'nearest' });
  }

  refreshVisibility() {
    for (const [o, r] of this.rows) {
      r.classList.toggle('hidden-obj', !o.visible);
      const eye = r.querySelector('.tree-eye');
      eye.innerHTML = '';
      eye.append(icon(o.visible ? 'eye' : 'eyeOff', 15));
    }
  }
}

/* ======================================================================= */
/*  3) Gölgelendirme, Tel Kafes ve Materyal                                */
/* ======================================================================= */
const SLOT_LABELS = {
  map: 'Diffuse / Albedo', normalMap: 'Normal', bumpMap: 'Bump', roughnessMap: 'Pürüzlülük',
  metalnessMap: 'Metaliklik', aoMap: 'Ortam Kapatma (AO)', emissiveMap: 'Emissive', specularMap: 'Specular',
  alphaMap: 'Opaklık (Alpha)', lightMap: 'Işık haritası', displacementMap: 'Yer değiştirme',
};
const MATERIAL_TYPES = {
  MeshPhongMaterial: 'Phong', MeshLambertMaterial: 'Lambert', MeshStandardMaterial: 'PBR (Standard)',
  MeshPhysicalMaterial: 'PBR (Physical)', MeshBasicMaterial: 'Basic (ışıksız)', MeshToonMaterial: 'Toon',
  PointsMaterial: 'Nokta', LineBasicMaterial: 'Çizgi',
};

function drawTextureThumb(canvas, tex) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const hgt = canvas.height;
  ctx.clearRect(0, 0, w, hgt);
  const img = tex?.image;
  if (!img) return false;
  try {
    if (img.data && img.width && img.data.length === img.width * img.height * 4) {
      const tmp = document.createElement('canvas');
      tmp.width = img.width;
      tmp.height = img.height;
      const data = img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length);
      tmp.getContext('2d').putImageData(new ImageData(data, img.width, img.height), 0, 0);
      ctx.save();
      if (tex.flipY) { ctx.translate(0, hgt); ctx.scale(1, -1); }
      ctx.drawImage(tmp, 0, 0, w, hgt);
      ctx.restore();
      return true;
    }
    if (img.width) {
      ctx.drawImage(img, 0, 0, w, hgt);
      return true;
    }
  } catch (e) { /* çizilemeyen doku */ }
  return false;
}

function textureName(tex) {
  if (!tex) return '';
  if (tex.userData?.fileName) return tex.userData.fileName;
  const src = tex.image?.currentSrc || tex.image?.src || tex.source?.data?.src || '';
  if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
    const p = decodeURIComponent(src.includes('?p=') ? src.split('?p=')[1] : src);
    return p.split(/[\\/]/).pop();
  }
  return tex.name || (tex.isCompressedTexture ? 'Sıkıştırılmış doku' : 'Gömülü doku');
}

class ShadingTab {
  constructor(app) {
    this.app = app;
    const sh = app.shading;
    this.el = h('div', { class: 'tab-page' });
    this.currentMat = null;

    // --- mod kartları
    const modes = section('Gölgelendirme Modu');
    this.modeCards = new Map();
    const grid = h('div', { class: 'mode-grid' });
    for (const m of MODES) {
      const info = MODE_INFO[m];
      const card = h('button', { class: 'mode-card', onclick: () => app.command('setShading', m) },
        icon(info.icon, 20), h('span', { class: 'mode-text' }, h('span', { class: 'mode-name', text: info.name }), h('span', { class: 'mode-sub', text: info.sub })),
        h('kbd', { text: info.key }));
      grid.append(card);
      this.modeCards.set(m, card);
    }
    this.doubleSided = toggle({ label: 'İnceleme modlarında çift taraflı', value: true, tip: 'Kil, normal, UV ve vertex rengi modlarında arka yüzleri de çiz', onChange: v => sh.set('doubleSided', v) });
    modes.body.append(grid, this.doubleSided.el);
    this.el.append(modes.el);

    // --- tel kafes
    const wire = section('Tel Kafes (Wireframe)');
    this.wireColor = colorPicker({ label: 'Çizgi rengi', value: sh.settings.wireColor, onInput: v => sh.set('wireColor', v) });
    this.wireWidth = slider({ label: 'Çizgi kalınlığı', min: 0.5, max: 6, step: 0.1, value: sh.settings.wireWidth, format: v => `${v.toFixed(1)} px`, onInput: v => sh.set('wireWidth', v) });
    this.wireOpacity = slider({ label: 'Opaklık', min: 0.05, max: 1, step: 0.01, value: sh.settings.wireOpacity, onInput: v => sh.set('wireOpacity', v) });
    this.wireXray = toggle({ label: 'Arka kenarları göster (X-Ray)', value: sh.settings.wireXray, tip: 'Saf tel kafes modunda gizli çizgileri de çiz', onChange: v => sh.set('wireXray', v) });
    const wirePresets = h('div', { class: 'chips' }, ...[['#4fc3ff', 'Mavi'], ['#000000', 'Siyah'], ['#ffffff', 'Beyaz'], ['#ffb02e', 'Turuncu'], ['#7dff6a', 'Yeşil']]
      .map(([c, n]) => h('button', { class: 'chip', onclick: () => { sh.set('wireColor', c); this.wireColor.set(c); } }, h('span', { class: 'dot', style: { background: c } }), n)));
    wire.body.append(this.wireColor.el, wirePresets, this.wireWidth.el, this.wireOpacity.el, this.wireXray.el);
    this.el.append(wire.el);

    // --- kil / matcap
    const clay = section('Kil / Matcap');
    this.clayChips = new Map();
    const chips = h('div', { class: 'chips' });
    const addChip = (id, name, preview) => {
      const c = h('button', { class: 'chip', onclick: () => { sh.set('clayStyle', id); if (sh.mode !== 'clay') app.command('setShading', 'clay'); this.syncClay(); } },
        preview ? h('img', { src: preview, alt: '' }) : h('span', { class: 'dot', style: { background: 'radial-gradient(circle at 35% 30%, #fff, #8d8a85 60%, #3f3c3a)' } }), name);
      chips.append(c);
      this.clayChips.set(id, c);
    };
    addChip('lit', 'Işıklı kil');
    for (const p of MATCAP_PRESETS) addChip(p.id, p.name, sh.matcapPreview(p.id));
    this.clayColor = colorPicker({ label: 'Kil rengi', value: sh.settings.clayColor, onInput: v => sh.set('clayColor', v) });
    clay.body.append(chips, this.clayColor.el, h('div', { class: 'hint', text: 'Dokular devre dışı bırakılır; yalnızca yüzey formu ve topoloji incelenir.' }));
    this.el.append(clay.el);

    // --- teknik
    const tech = section('Teknik İnceleme');
    this.techSeg = segmented({
      options: [['normals', 'Normal'], ['uv', 'UV Dama'], ['vcolor', 'Vertex Rengi']],
      value: 'normals', onChange: v => app.command('setShading', v),
    });
    this.flat = toggle({ label: 'Poligon (düz) normalleri', value: false, tip: 'Kapalı: vertex (yumuşak) normalleri', onChange: v => sh.set('normalsFlat', v) });
    this.normalLines = toggle({ label: 'Normal vektörlerini çiz', value: false, onChange: v => { sh.set('normalLines', v); app.reportState(); } });
    this.normalLen = slider({ label: 'Vektör uzunluğu', min: 0.1, max: 5, step: 0.05, value: 1, onInput: v => sh.set('normalLength', v) });
    this.uvRepeat = slider({ label: 'Dama tekrarı', min: 1, max: 32, step: 1, value: 4, format: v => `${v}×`, onInput: v => sh.set('uvRepeat', v) });
    this.uvCanvas = h('canvas', { class: 'uv-canvas', width: 512, height: 512 });
    this.uvCaption = h('div', { class: 'hint', text: 'UV yerleşimi: sahneden bir parça seçin.' });
    tech.body.append(this.techSeg.el, this.flat.el, this.normalLines.el, this.normalLen.el, this.uvRepeat.el,
      h('div', { class: 'sub-label', text: 'UV yerleşimi (seçili parça)' }), this.uvCanvas, this.uvCaption);
    this.el.append(tech.el);

    // --- materyaller
    const mats = section('Materyal ve Dokular');
    this.textures = toggle({ label: 'Dokuları göster  (T)', value: true, onChange: v => app.command('setTextures', v) });
    this.matSelect = select({ label: 'Materyal', options: [], value: '', onChange: v => this.selectMaterial(this.app.shading.materials().find(m => m.uuid === v)) });
    this.editor = h('div', { class: 'section-body', style: { padding: 0 } });
    mats.body.append(this.textures.el, this.matSelect.el, this.editor,
      h('div', { class: 'btn-row' }, button('Tüm materyalleri sıfırla', { icon: 'reset', cls: 'btn-sm', onClick: () => app.command('resetMaterials') })),
      h('div', { class: 'hint', text: 'İpucu: Bir doku dosyasını (.png/.jpg/.tga) doğrudan modelin üzerine sürükleyip bırakarak o parçaya atayabilirsiniz.' }));
    this.el.append(mats.el);
    this.syncMaterials();
  }

  syncMode() {
    const sh = this.app.shading;
    for (const [m, c] of this.modeCards) c.classList.toggle('active', m === sh.mode);
    this.techSeg.set(sh.lastTechnical);
    this.syncClay();
  }

  syncClay() {
    const sh = this.app.shading;
    for (const [id, c] of this.clayChips) c.classList.toggle('active', id === sh.settings.clayStyle);
    this.clayColor.el.hidden = sh.settings.clayStyle !== 'lit';
  }

  sync() {
    const s = this.app.shading.settings;
    this.syncMode();
    this.doubleSided.set(s.doubleSided);
    this.wireColor.set(s.wireColor);
    this.wireWidth.set(s.wireWidth);
    this.wireOpacity.set(s.wireOpacity);
    this.wireXray.set(s.wireXray);
    this.clayColor.set(s.clayColor);
    this.flat.set(s.normalsFlat);
    this.normalLines.set(s.normalLines);
    this.normalLen.set(s.normalLength);
    this.uvRepeat.set(s.uvRepeat);
    this.textures.set(s.textures);
  }

  /* -------------------------------------------------------- materials */
  syncMaterials(preferred = null) {
    const list = this.app.shading.materials();
    if (!list.length) {
      this.matSelect.setOptions([['', '— model yok —']], '');
      this.currentMat = null;
      this.renderEditor();
      return;
    }
    const counts = new Map();
    this.matSelect.setOptions(list.map((m, i) => {
      const base = m.name || `Materyal ${i + 1}`;
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);
      return [m.uuid, n > 1 ? `${base} (${n})` : base];
    }));
    const pick = preferred && list.includes(preferred) ? preferred : (list.includes(this.currentMat) ? this.currentMat : list[0]);
    this.selectMaterial(pick);
  }

  selectMaterial(m) {
    this.currentMat = m || null;
    if (m) this.matSelect.set(m.uuid);
    this.renderEditor();
  }

  renderEditor() {
    const ed = this.editor;
    ed.innerHTML = '';
    const m = this.currentMat;
    if (!m) {
      ed.append(h('div', { class: 'hint', text: 'Materyal düzenlemek için bir model açın.' }));
      return;
    }
    const app = this.app;
    const sh = app.shading;
    const changed = (recompile = false) => { if (recompile) m.needsUpdate = true; app.onMaterialEdited(m); };
    const users = sh.meshes.filter(x => materialsOf(x.userData.origMaterial).includes(m)).length;
    ed.append(h('div', { class: 'kv' },
      h('span', { class: 'k', text: 'Tür' }), h('span', { class: 'v', text: MATERIAL_TYPES[m.type] || m.type }),
      h('span', { class: 'k', text: 'Kullanan parça' }), h('span', { class: 'v', text: String(users) })));

    if (m.color?.isColor) ed.append(colorPicker({ label: 'Diffuse rengi', value: `#${m.color.getHexString()}`, onInput: v => { m.color.set(v); changed(); } }).el);
    if (m.specular?.isColor) ed.append(colorPicker({ label: 'Specular', value: `#${m.specular.getHexString()}`, onInput: v => { m.specular.set(v); changed(); } }).el);
    if (typeof m.shininess === 'number') ed.append(slider({ label: 'Parlaklık', min: 0, max: 256, step: 1, value: m.shininess, format: v => v.toFixed(0), onInput: v => { m.shininess = v; changed(); } }).el);
    if (typeof m.roughness === 'number') ed.append(slider({ label: 'Pürüzlülük', min: 0, max: 1, step: 0.01, value: m.roughness, onInput: v => { m.roughness = v; changed(); } }).el);
    if (typeof m.metalness === 'number') ed.append(slider({ label: 'Metaliklik', min: 0, max: 1, step: 0.01, value: m.metalness, onInput: v => { m.metalness = v; changed(); } }).el);
    const snapTransparent = m.userData.__snapshot?.transparent ?? m.transparent;
    ed.append(slider({
      label: 'Opaklık', min: 0, max: 1, step: 0.01, value: m.opacity ?? 1,
      onInput: v => {
        const t = v < 1 || snapTransparent;
        const recompile = t !== m.transparent;
        m.opacity = v;
        m.transparent = t;
        changed(recompile);
      },
    }).el);
    if (m.emissive?.isColor) {
      ed.append(colorPicker({ label: 'Emissive', value: `#${m.emissive.getHexString()}`, onInput: v => { m.emissive.set(v); changed(); } }).el);
      ed.append(slider({ label: 'Emissive şiddeti', min: 0, max: 10, step: 0.05, value: m.emissiveIntensity ?? 1, onInput: v => { m.emissiveIntensity = v; changed(); } }).el);
    }
    if (m.normalScale && sh.getMap(m, 'normalMap')) {
      const sign = Math.sign(m.normalScale.y) || 1;
      ed.append(slider({ label: 'Normal etkisi', min: 0, max: 3, step: 0.01, value: Math.abs(m.normalScale.x), onInput: v => { m.normalScale.set(v, v * sign); changed(); } }).el);
    }
    if (typeof m.bumpScale === 'number' && sh.getMap(m, 'bumpMap')) {
      ed.append(slider({ label: 'Bump etkisi', min: 0, max: 10, step: 0.01, value: m.bumpScale, onInput: v => { m.bumpScale = v; changed(); } }).el);
    }
    ed.append(toggle({ label: 'Çift taraflı', value: m.side === THREE.DoubleSide, onChange: v => { m.side = v ? THREE.DoubleSide : THREE.FrontSide; changed(true); } }).el);
    if ('flatShading' in m) ed.append(toggle({ label: 'Düz gölgeleme', value: !!m.flatShading, onChange: v => { m.flatShading = v; changed(true); } }).el);

    // doku yuvaları
    ed.append(h('div', { class: 'sub-label', text: 'Dokular' }));
    const list = h('div', { class: 'tex-list' });
    const slots = ['map', 'normalMap'];
    if ('roughnessMap' in m) slots.push('roughnessMap', 'metalnessMap');
    if ('specularMap' in m) slots.push('specularMap');
    if ('bumpMap' in m) slots.push('bumpMap');
    if ('emissiveMap' in m) slots.push('emissiveMap');
    if ('aoMap' in m) slots.push('aoMap');
    slots.push('alphaMap');
    for (const slot of slots) {
      if (!(slot in m)) continue;
      const tex = sh.getMap(m, slot);
      const isMain = slot === 'map' || slot === 'normalMap';
      if (!tex && !isMain) continue;
      const cv = h('canvas', { width: 76, height: 76 });
      const ok = tex ? drawTextureThumb(cv, tex) : false;
      const thumb = ok ? cv : h('div', { class: 'tex-ph', text: tex ? 'GPU' : '—' });
      list.append(h('div', { class: 'tex-item' }, thumb,
        h('div', { class: 'tex-info' }, h('span', { class: 'tex-slot', text: SLOT_LABELS[slot] || slot }),
          h('span', { class: 'tex-file', text: tex ? textureName(tex) : 'Doku yok', title: tex ? textureName(tex) : '' })),
        h('button', { class: 'btn btn-sm btn-icon btn-ghost', 'data-tip': tex ? 'Dokuyu değiştir' : 'Doku ekle', onclick: () => app.command('requestTexture', { slot, materialUuid: m.uuid }) }, icon('folder', 15)),
        tex ? h('button', { class: 'btn btn-sm btn-icon btn-ghost', 'data-tip': 'Dokuyu kaldır', onclick: () => { sh.setMap(m, slot, null); app.onMaterialEdited(m, true); } }, icon('x', 15)) : null));
    }
    ed.append(list);
    ed.append(h('div', { class: 'btn-row' },
      button('Bu materyali sıfırla', { icon: 'reset', cls: 'btn-sm', onClick: () => { sh.resetMaterial(m); app.onMaterialEdited(m, true); } }),
      button('Parçaya odaklan', { icon: 'focus', cls: 'btn-sm', onClick: () => { const mesh = sh.meshes.find(x => materialsOf(x.userData.origMaterial).includes(m)); if (mesh) app.command('select', mesh); } })));
  }

  /* ------------------------------------------------------------- UV */
  drawUV() {
    const cv = this.uvCanvas;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    ctx.fillStyle = '#15171b';
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const p = Math.round((i / 8) * (W - 1)) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    }
    const sel = this.app.viewer.selection;
    const meshes = [];
    if (sel) sel.traverse(o => { if (o.isMesh && !o.userData.isOverlay) meshes.push(o); });
    if (!meshes.length) {
      this.uvCaption.textContent = 'UV yerleşimi: sahneden bir parça seçin.';
      return;
    }
    let tris = 0;
    let withUV = 0;
    ctx.strokeStyle = 'rgba(79,195,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const LIMIT = 400_000;
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const uv = g.attributes.uv;
      if (!uv) continue;
      withUV++;
      const idx = g.index;
      const n = Math.floor((idx ? idx.count : uv.count) / 3);
      const step = Math.max(1, Math.ceil(n / LIMIT));
      for (let t = 0; t < n; t += step) {
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = uv.getX(i) * W;
          const y = (1 - uv.getY(i)) * W;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        tris++;
      }
    }
    ctx.stroke();
    this.uvCaption.textContent = withUV
      ? `${sel.name || 'Seçili parça'} — ${fmtNum(tris)} üçgen çizildi (0–1 UV alanı).`
      : `${sel.name || 'Seçili parça'} — UV koordinatı yok.`;
  }
}
