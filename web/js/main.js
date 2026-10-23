// Uygulama: bileşenleri bağlar, komutları (menü / kısayol / panel) yürütür
import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { Viewer, selectionRoots } from './viewer.js';
import { ModelLoader, createServerSource, createFileMapSource, formatName, MODEL_EXTS, IMAGE_EXTS } from './loader.js';
import { ShadingManager, materialsOf, TECHNICAL_MODES } from './shading.js';
import { EnvironmentManager, renderThemeThumbnails } from './environment.js';
import { AnimationController } from './animation.js';
import { computeStats, computeTopology } from './stats.js';
import { connectBridge } from './bridge.js';
import { Hud } from './ui/hud.js';
import { AnimBar } from './ui/animbar.js';
import { Panel } from './ui/panel.js';
import { fmtShort } from './ui/dom.js';
import { hydrateIcons } from './ui/icons.js';
import { installTooltips } from './ui/dom.js';

// Buraya gelindiyse tüm modüller (three.js dahil) yüklenmiştir
window.__diag?.('info', 'main.js ve modüller yüklendi');

const PREFS_KEY = 'modelviewer3d.prefs';
const SRGB_SLOTS = new Set(['map', 'emissiveMap', 'specularColorMap', 'sheenColorMap']);
const extOf = name => (String(name).split(/[?#]/)[0].match(/\.([^./\\]+)$/)?.[1] || '').toLowerCase();
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function friendlyError(err) {
  const msg = String(err?.message || err || 'Bilinmeyen hata');
  if (/FBX version not supported/i.test(msg)) {
    const v = msg.match(/FileVersion:\s*(\d+)/)?.[1];
    return `Bu FBX sürümü desteklenmiyor${v ? ` (${(v / 1000).toFixed(1)})` : ''}. Modeli FBX 7.x (2011 ve üzeri) olarak yeniden dışa aktarın.`;
  }
  if (/Cannot find the version number/i.test(msg)) return 'FBX dosyası okunamadı: sürüm bilgisi bulunamadı (dosya bozuk olabilir).';
  if (/Unexpected token|JSON/i.test(msg)) return `Dosya ayrıştırılamadı: ${msg}`;
  if (/HTTP 404/.test(msg)) return 'Dosya bulunamadı veya erişilemiyor.';
  return `Model yüklenemedi: ${msg}`;
}

class App {
  constructor() {
    this.bridge = null;
    this.source = null;
    this.modelInfo = null;
    this.loadToken = 0;
    this.ui = { panel: true, animBar: true };
    this.threeRevision = THREE.REVISION;
    this._persistTimer = 0;
    this._stateTimer = 0;
    this._pendingTexture = null;
    this.openRotation = -90; // açılışta X ekseninde döndürme (Z-yukarı modeller için)
    this._autoMatColor = false;
  }

  async init() {
    this.bridge = await connectBridge();
    // Teşhis: betikler çalışıyor (WebGL'den önce). Python'daki bekçi bu sinyali bekler.
    this.bridge?.notify('boot', { userAgent: navigator.userAgent });
    window.addEventListener('error', e => this.bridge?.log('error', `${e.message} @ ${e.filename}:${e.lineno}`));
    window.addEventListener('unhandledrejection', e => this.bridge?.log('error', `Promise: ${e.reason?.stack || e.reason}`));
    hydrateIcons();
    // WebGL'e bağlı olmayan etkileşimler önce bağlanır; 3B motor takılsa bile buton çalışır
    document.getElementById('empty-open').addEventListener('click', () => this.command('openDialog'));
    await new Promise(r => setTimeout(r, 30)); // sayfa önce çizilsin

    const viewport = document.getElementById('viewport');
    window.__diag?.('info', '3B motor (WebGL) oluşturuluyor…');
    try {
      this.viewer = new Viewer(viewport);
      this.glInfo = this._glInfo();
      this.env = new EnvironmentManager(this.viewer);
      this.shading = new ShadingManager(this.viewer);
      this.anim = new AnimationController(this.viewer);
      this.loader = new ModelLoader(this.viewer.renderer);
      this.hud = new Hud(this);
      this.panel = new Panel(this);
      this.animBar = new AnimBar(document.getElementById('animbar'), this.anim);
    } catch (err) {
      this._fatal('3B motor (WebGL) başlatılamadı. Ekran kartı sürücülerinizi güncelleyin veya Araçlar › Görüntüleme Motoru menüsünden başka bir mod seçin.', err);
      return;
    }

    this._wireEvents();
    this._installKeyboard();
    this._installDropFallback();
    this._installFileInputs();

    const prefs = await this._loadPrefs();
    if (prefs) {
      if (prefs.shading) delete prefs.shading.mode; // her açılış "Lit" modunda başlar
      this.applySettings(prefs, false);
    } else {
      this.syncAll();
    }
    setTimeout(async () => {
      try { this.panel.env.setThumbnails(await renderThemeThumbnails()); } catch (e) { console.warn('Tema önizlemeleri üretilemedi', e); }
    }, 500);

    this.bridge?.notify('ready', { gl: this.glInfo });
    this.bridge?.ready();
    this.reportState();
    // geliştirme: "python main.py --serve-only model.fbx" ile tarayıcıda açma
    const params = new URLSearchParams(location.search);
    if (!this.bridge && params.get('open')) this.command('openModel', JSON.parse(params.get('open')));
    else if (!this.bridge && params.get('model')) this._openUrl(params.get('model'));
  }

  _fatal(text, err) {
    console.error(err);
    const card = document.querySelector('.empty-card');
    card.querySelector('h1').textContent = 'Görüntüleme başlatılamadı';
    card.querySelector('p').textContent = text;
    this.bridge?.log('error', `${text} ${err?.stack || err}`);
    this.bridge?.notify('fatal', { message: text, error: String(err?.message || err) });
  }

  _glInfo() {
    try {
      const gl = this.viewer.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) {
      return 'WebGL 2';
    }
  }

  /* ================================================================ events */
  _wireEvents() {
    const v = this.viewer;
    v.addEventListener('pick', e => {
      if (!e.hit) { this.select(null); return; }
      const mats = materialsOf(e.hit.object.userData.origMaterial || e.hit.object.material);
      this.select(e.hit.object, mats[e.hit.materialIndex] || mats[0]);
    });
    v.addEventListener('focuspick', e => { this.select(e.hit.object); v.focusObject(e.hit.object); });
    v.addEventListener('bounds', () => this.panel?.env.syncFlags());
    this.shading.addEventListener('change', () => {
      this.env.setShadowsAllowed(this.shading.litMode);
      this.hud.syncMode(this.shading.mode);
      this.panel.shading.syncMode();
      this.hud.syncFlags(this._flags());
      this.reportState();
      this.persist();
    });
    this.shading.addEventListener('warn', e => this.hud.toast(e.text, 'warn'));
    this.env.addEventListener('change', () => { this.reportState(); this.persist(); });
    this.anim.addEventListener('state', () => this.reportState());
    // animasyon oynarken seçim kutusunu poza göre güncel tut
    let selTimer = 0;
    v.updaters.add(dt => {
      if (!this.anim.playing || !v.selection) return false;
      selTimer += dt;
      if (selTimer > 0.12) { selTimer = 0; v.refreshSelectionBox(); }
      return false;
    });
  }

  _flags() {
    return { ...this.viewer.flags, textures: this.shading.settings.textures, panel: this.ui.panel, animBar: this.ui.animBar };
  }

  syncAll() {
    this.panel.env.sync();
    this.panel.shading.sync();
    this.hud.syncMode(this.shading.mode);
    this.hud.syncFlags(this._flags());
    this.env.setShadowsAllowed(this.shading.litMode);
    document.getElementById('app').classList.toggle('panel-collapsed', !this.ui.panel);
    document.getElementById('app').classList.toggle('anim-hidden', !this.ui.animBar);
  }

  /* ============================================================== commands */
  command(name, p) {
    switch (name) {
      case 'openModel': return this.openSource(createServerSource(p));
      case 'openDialog':
        if (this.bridge) this.bridge.openFileDialog(); else document.getElementById('file-input').click();
        return undefined;
      case 'closeModel': return this.closeModel();
      case 'setShading': return this.shading.setMode(p);
      case 'cycleTechnical': return this.shading.cycleTechnical();
      case 'materialColors':
        this._autoMatColor = false;
        if (this.shading.mode === 'matcolor') this.shading.reroll(); else this.shading.setMode('matcolor');
        return undefined;
      case 'setOpenRotation':
        this.openRotation = Number(p) || 0;
        if (this.viewer.model) { this.viewer.setBaseRotation(this.openRotation); this._refreshStats(); }
        this.panel.env.syncFlags();
        this.reportState();
        return this.persist();
      case 'toggle': return this.toggle(p);
      case 'setFlag': return this.setFlag(p.name, p.value);
      case 'setTextures': return this.shading.set('textures', !!p);
      case 'resetCamera': return this.viewer.fitCamera();
      case 'focusSelection': return this.viewer.focusObject(this.viewer.selection || this.viewer.model);
      case 'focusObject': this.select(p); return this.viewer.focusObject(p);
      case 'view': return this.viewer.fitCamera({ view: p });
      case 'rotateModel':
        if (!this.viewer.model) return undefined;
        if (p?.reset) this.viewer.resetModelRotation(); else this.viewer.rotateModel(p.axis, p.deg);
        return this._refreshStats();
      case 'screenshot': return this.screenshot(p || {});
      case 'capture': return this.bridge?.deliverCapture(this.viewer.capture({}));
      case 'exportSettings': return this.exportSettings();
      case 'importSettings':
        if (this.bridge) this.bridge.importSettingsDialog(); else document.getElementById('settings-input').click();
        return undefined;
      case 'applySettings': return this.applySettings(p, true);
      case 'theme':
        this.env.applyTheme(p);
        this.panel.env.sync();
        return undefined;
      case 'assignTexture': return this.assignTexture(p);
      case 'requestTexture': return this.requestTexture(p || {});
      case 'resetMaterials':
        this.shading.resetAll();
        this.panel.shading.renderEditor();
        return this.hud.toast('Tüm materyaller sıfırlandı.', 'success');
      case 'select': return this.select(p);
      case 'clearSelection': return this.select(null);
      case 'setVisible': return this.setVisible(p.object, p.visible);
      case 'hideSelected':
        if (this.viewer.selection) { this.setVisible(this.viewer.selection, false); this.select(null); }
        return undefined;
      case 'isolateSelected': return this.isolateSelected();
      case 'showAll': return this.showAll();
      case 'toast': return this.hud.toast(p.text, p.kind || 'info');
      case 'showHelp': return this.hud.showHelp(p.topic, p.info);
      case 'animation': return this.anim.toggle();
      default:
        console.warn('Bilinmeyen komut:', name);
        return undefined;
    }
  }

  toggle(key) {
    if (key === 'panel') {
      this.ui.panel = !this.ui.panel;
      document.getElementById('app').classList.toggle('panel-collapsed', !this.ui.panel);
    } else if (key === 'animBar') {
      this.ui.animBar = !this.ui.animBar;
      document.getElementById('app').classList.toggle('anim-hidden', !this.ui.animBar);
    } else if (key === 'textures') {
      this.shading.set('textures', !this.shading.settings.textures);
      this.panel.shading.textures.set(this.shading.settings.textures);
      this.hud.toast(this.shading.settings.textures ? 'Dokular açık' : 'Dokular kapalı', 'info', 1400);
      return;
    } else if (key === 'normalLines') {
      this.shading.set('normalLines', !this.shading.settings.normalLines);
      this.panel.shading.normalLines.set(this.shading.settings.normalLines);
      return;
    } else {
      this.setFlag(key, !this.viewer.flags[key]);
      return;
    }
    this.hud.syncFlags(this._flags());
    this.reportState();
    this.persist();
  }

  setFlag(name, value) {
    this.viewer.setFlag(name, value);
    if (name === 'shadowCatcher') this.env.applyShadows();
    if (name === 'bbox') this.viewer.refreshSelectionBox();
    this.panel.env.syncFlags();
    this.hud.syncFlags(this._flags());
    this.reportState();
    this.persist();
  }

  /* =============================================================== loading */
  async openSource(source) {
    const token = ++this.loadToken;
    this.hud.closeModal();
    this.hud.showLoading(source.name);
    const t0 = performance.now();
    let result;
    try {
      result = await this.loader.load(source, {
        onProgress: p => { if (token === this.loadToken) this.hud.setProgress(p); },
        onStage: s => { if (token === this.loadToken) this.hud.setStage(s); },
      });
    } catch (err) {
      if (token !== this.loadToken) return;
      console.error(err);
      this.hud.hideLoading();
      const text = friendlyError(err);
      this.hud.toast(text, 'error', 7000);
      this.bridge?.notify('loadError', { message: text });
      source.dispose();
      return;
    }
    if (token !== this.loadToken) { source.dispose(); return; }

    const { object, animations, warnings, missing } = result;
    this.anim.dispose();
    this.select(null);
    this.source?.dispose();
    this.source = source;
    this.format = source.ext;
    object.updateMatrixWorld(true);
    this.rawBox = new THREE.Box3().setFromObject(object); // dosya koordinatlarında (döndürmeden önce)
    this.viewer.setModel(object, { rotateX: this.openRotation });
    this.shading.setModel(object);
    this.env.setModel(object);
    this.anim.setModel(object, animations);
    const loadMs = performance.now() - t0;
    this.modelInfo = { name: source.name, format: formatName(source.ext), size: source.size, loadMs };
    document.getElementById('app').classList.remove('no-model');
    this.hud.hideLoading();
    this.panel.scene.buildTree(object);
    this.panel.shading.syncMaterials();
    this._refreshStats(true);
    // dokusuz (düz beyaz/gri) modellerde parçaları ayırt etmek için rastgele materyal renkleri
    const untextured = this.stats.textures === 0 && this.stats.meshes > 0;
    if (this.shading.settings.autoMatColors && untextured && this.shading.mode === 'lit') {
      this.shading.setMode('matcolor');
      this._autoMatColor = true;
    } else if (this._autoMatColor && !untextured && this.shading.mode === 'matcolor') {
      this.shading.setMode('lit');
      this._autoMatColor = false;
    }

    for (const w of warnings) this.hud.toast(w, 'warn', 5000);
    if (missing.length) {
      const list = missing.slice(0, 4).join(', ') + (missing.length > 4 ? ` … (+${missing.length - 4})` : '');
      this.hud.toast(`${missing.length} doku bulunamadı: ${list}`, 'warn', 7000);
      console.warn('Eksik dokular:', missing);
    }
    this.bridge?.notify('loaded', {
      name: source.name, triangles: this.stats.triangles, meshes: this.stats.meshes,
      materials: this.stats.materials, animations: this.anim.clips.length, missingTextures: missing.length, ms: Math.round(loadMs),
    });
    this.reportState();
  }

  _openUrl(url) {
    const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop());
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    this.openSource({ name, ext: extOf(name), url, size: 0, resourcePath: base, modifyURL: u => u, dispose() {} });
  }

  closeModel() {
    this.loadToken++;
    this.anim.setModel(null, []);
    this.select(null);
    this.shading.setModel(null);
    this.env.setModel(null);
    this.viewer.clearModel();
    this.source?.dispose();
    this.source = null;
    this.modelInfo = null;
    this.stats = null;
    this.rawBox = null;
    document.getElementById('app').classList.add('no-model');
    this.hud.setBadge('');
    this.panel.scene.buildTree(null);
    this.panel.scene.setStats(null);
    this.panel.shading.syncMaterials();
    this.reportState();
  }

  _refreshStats(full = false) {
    const model = this.viewer.model;
    if (!model) return;
    this.stats = computeStats(model, this.anim.clips);
    this.panel.scene.setStats(this.stats, this.topology, this.modelInfo);
    this._updateBadge();
    if (full) {
      this.topology = null;
      const token = this.loadToken;
      computeTopology(model, () => token !== this.loadToken).then(topo => {
        if (!topo || token !== this.loadToken) return;
        this.topology = topo;
        this.panel.scene.setStats(this.stats, topo, this.modelInfo);
      });
    }
  }

  _updateBadge() {
    if (!this.viewer.model || !this.stats) { this.hud.setBadge(''); return; }
    const sel = this.viewer.selection;
    let html = `<b>${escapeHtml(this.modelInfo?.name || '')}</b> · ${fmtShort(this.stats.triangles)} üçgen · ${this.stats.meshes} parça · ${this.stats.materials} materyal`;
    if (sel) html += ` · Seçili: <b>${escapeHtml(sel.name || sel.type)}</b>`;
    this.hud.setBadge(html);
  }

  /* ============================================================ selection */
  select(obj, material = null) {
    if (obj && !this.viewer.model) return;
    this.viewer.setSelection(obj || null);
    this.panel.scene.setSelected(obj || null);
    if (obj) {
      // materyal grubu seçildiyse o materyal; değilse seçimdeki ilk parçanın materyali
      let m = material || (obj.isSelectionGroup ? obj.material : null);
      if (!m) {
        let mesh = null;
        for (const r of selectionRoots(obj)) r.traverse(o => { if (!mesh && o.isMesh && !o.userData.isOverlay) mesh = o; });
        if (mesh) m = materialsOf(mesh.userData.origMaterial || mesh.material)[0];
      }
      if (m?.isMaterial && this.shading.materials().includes(m)) this.panel.shading.selectMaterial(m);
    }
    if (this.panel.current === 'shading') this.panel.shading.drawUV();
    this._updateBadge();
    this.reportState();
  }

  setVisible(obj, visible) {
    for (const r of selectionRoots(obj)) r.visible = visible;
    this._afterVisibility();
  }

  showAll() {
    this.viewer.model?.traverse(o => { if (!o.userData.isOverlay && !o.isLight) o.visible = true; });
    this._afterVisibility();
  }

  isolateSelected() {
    const sel = this.viewer.selection;
    if (!sel || !this.viewer.model) { this.hud.toast('Önce bir parça seçin.', 'warn', 2000); return; }
    const roots = new Set(selectionRoots(sel));
    const inSel = o => { for (let p = o; p; p = p.parent) if (roots.has(p)) return true; return false; };
    this.viewer.model.traverse(o => {
      if (o.userData.isOverlay || o.isLight) return;
      if (o.isMesh || o.isPoints || o.isLine) o.visible = inSel(o);
      else o.visible = true;
    });
    for (const r of roots) for (let p = r; p; p = p.parent) p.visible = true;
    this._afterVisibility();
  }

  _afterVisibility() {
    this.viewer.refreshSelectionBox();
    this.shading.syncNormalHelpers();
    this.panel.scene.refreshVisibility();
    this.viewer.needsRender = true;
  }

  onMaterialEdited(material, rerender = false) {
    this.shading.refresh();
    if (rerender) this.panel.shading.renderEditor();
    this.viewer.needsRender = true;
  }

  /* ============================================================= textures */
  requestTexture(p) {
    if (!this.viewer.model) { this.hud.toast('Önce bir model açın.', 'warn'); return; }
    let uuid = p.materialUuid;
    if (!uuid) {
      const sel = this.viewer.selection;
      const m = sel?.isMesh ? materialsOf(sel.userData.origMaterial)[0] : this.panel.shading.currentMat;
      uuid = m?.uuid;
    }
    const payload = { slot: p.slot || 'map', materialUuid: uuid };
    if (this.bridge) this.bridge.chooseTexture(payload);
    else { this._pendingTexture = payload; document.getElementById('texture-input').click(); }
  }

  async assignTexture(p) {
    if (!this.viewer.model) { this.hud.toast('Önce bir model açın.', 'warn'); return; }
    let material = null;
    let mesh = null;
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const hit = this.viewer.pickAt(p.x, p.y);
      if (hit) {
        mesh = hit.object;
        const mats = materialsOf(mesh.userData.origMaterial);
        material = mats[hit.materialIndex] || mats[0];
      }
    }
    const all = this.shading.materials();
    if (!material && p.materialUuid) material = all.find(m => m.uuid === p.materialUuid) || null;
    if (!material && !Number.isFinite(p.x)) material = this.panel.shading.currentMat;
    if (!material && all.length === 1) material = all[0];
    if (!material) {
      this.hud.toast('Dokuyu atamak için modelin bir parçasının üzerine bırakın veya panelden bir materyal seçin.', 'warn', 5000);
      return;
    }
    const slot = p.slot || 'map';
    let tex;
    try {
      tex = await new Promise((resolve, reject) => {
        const ext = p.ext || extOf(p.name);
        const loader = ext === 'tga' ? new TGALoader() : new THREE.TextureLoader();
        loader.load(p.url, resolve, undefined, () => reject(new Error('Doku yüklenemedi')));
      });
    } catch (err) {
      this.hud.toast(`Doku yüklenemedi: ${p.name}`, 'error');
      return;
    }
    tex.userData.fileName = p.name;
    tex.name = p.name;
    tex.colorSpace = SRGB_SLOTS.has(slot) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.viewer.renderer.capabilities.getMaxAnisotropy();
    const prev = this.shading.getMap(material, slot);
    if (prev) {
      tex.repeat.copy(prev.repeat);
      tex.offset.copy(prev.offset);
      tex.rotation = prev.rotation;
      tex.wrapS = prev.wrapS;
      tex.wrapT = prev.wrapT;
      tex.channel = prev.channel;
      tex.flipY = prev.flipY;
    } else if (this.format === 'glb' || this.format === 'gltf') {
      tex.flipY = false;
    }
    tex.needsUpdate = true;
    this.shading.setMap(material, slot, tex);
    if (slot === 'map' && material.color && material.color.getHSL({}).l < 0.04) material.color.set('#ffffff');
    if (mesh && !mesh.geometry.attributes.uv) this.hud.toast('Bu parçada UV koordinatı yok; doku düzgün görünmeyebilir.', 'warn', 5000);
    if (!this.shading.settings.textures) this.hud.toast('Dokular şu an kapalı (T ile açın).', 'info');
    this.panel.shading.selectMaterial(material);
    this.onMaterialEdited(material);
    this._refreshStats();
    this.hud.toast(`Doku atandı: ${p.name} → ${material.name || 'materyal'}`, 'success');
  }

  /* =========================================================== screenshot */
  screenshot({ transparent = false, clipboard = false }) {
    const url = this.viewer.capture({ transparent });
    if (clipboard) {
      if (this.bridge) { this.bridge.copyImage(url); return; }
      fetch(url).then(r => r.blob()).then(b => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]))
        .then(() => this.hud.toast('Görüntü panoya kopyalandı.', 'success'))
        .catch(() => this.hud.toast('Panoya kopyalanamadı.', 'error'));
      return;
    }
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const base = (this.modelInfo?.name || 'goruntu').replace(/\.[^.]+$/, '');
    const name = `${base}_${stamp}.png`;
    if (this.bridge) this.bridge.saveImage(url, name);
    else this._download(url, name);
  }

  _download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }

  /* ============================================================= settings */
  getSettings() {
    return {
      app: 'ModelViewer3D',
      version: 1,
      environment: this.env.getState(),
      shading: this.shading.getSettings(),
      view: {
        grid: this.viewer.flags.grid,
        shadowCatcher: this.viewer.flags.shadowCatcher,
        axes: this.viewer.flags.axes,
        bbox: this.viewer.flags.bbox,
        autoRotate: this.viewer.flags.autoRotate,
        autoRotateSpeed: this.viewer.controls.autoRotateSpeed,
        openRotation: this.openRotation,
      },
      ui: { panel: this.ui.panel, animBar: this.ui.animBar, tab: this.panel.current, treeGrouping: this.panel.scene.grouping },
    };
  }

  applySettings(s, fromFile) {
    if (!s || typeof s !== 'object' || (!s.environment && !s.shading && !s.view)) {
      if (fromFile) this.hud.toast('Geçersiz ayar dosyası.', 'error');
      return;
    }
    if (s.environment) this.env.setState(s.environment);
    if (s.shading) this.shading.applySettings(s.shading);
    if (s.view) {
      for (const k of ['grid', 'shadowCatcher', 'axes', 'bbox', 'autoRotate']) if (k in s.view) this.viewer.setFlag(k, !!s.view[k]);
      if (s.view.autoRotateSpeed) this.viewer.controls.autoRotateSpeed = s.view.autoRotateSpeed;
      if ('openRotation' in s.view) this.openRotation = Number(s.view.openRotation) || 0;
    }
    if (s.ui) {
      if ('panel' in s.ui) this.ui.panel = !!s.ui.panel;
      if ('animBar' in s.ui) this.ui.animBar = !!s.ui.animBar;
      if (s.ui.tab) this.panel.show(s.ui.tab);
      if (s.ui.treeGrouping) this.panel.scene.setGrouping(s.ui.treeGrouping);
    }
    this.env.applyShadows();
    this.syncAll();
    this.reportState();
    this.persist();
    if (fromFile) this.hud.toast('Ayarlar yüklendi.', 'success');
  }

  exportSettings() {
    const json = JSON.stringify(this.getSettings(), null, 2);
    const name = `aydinlatma-${this.env.state.theme}.json`;
    if (this.bridge) this.bridge.exportSettings(json, name);
    else this._download(URL.createObjectURL(new Blob([json], { type: 'application/json' })), name);
  }

  persist() {
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      const json = JSON.stringify(this.getSettings());
      if (this.bridge) this.bridge.savePreferences(json);
      else try { localStorage.setItem(PREFS_KEY, json); } catch (e) { /* depolama yok */ }
    }, 600);
  }

  async _loadPrefs() {
    try {
      const raw = this.bridge ? await this.bridge.loadPreferences() : localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  reportState() {
    if (!this.bridge) return;
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => {
      const f = this._flags();
      this.bridge.reportState({
        hasModel: !!this.viewer.model,
        modelName: this.modelInfo?.name || '',
        shading: this.shading.mode,
        theme: this.env.state.theme,
        openRotation: this.openRotation,
        grid: f.grid, shadowCatcher: f.shadowCatcher, axes: f.axes, bbox: f.bbox, autoRotate: f.autoRotate,
        ortho: f.ortho, textures: f.textures, panel: f.panel, animBar: f.animBar,
        normalLines: this.shading.settings.normalLines,
        hasSelection: !!this.viewer.selection,
        hasAnimation: this.anim.hasAnimation,
        playing: this.anim.playing,
      });
    }, 30);
  }

  /* ============================================================= keyboard */
  _installKeyboard() {
    window.addEventListener('keydown', e => {
      const t = e.target;
      if (t.matches?.('input:not([type=range]):not([type=checkbox]), select, textarea')) return;
      if (e.key === 'Escape' && this.hud.closeModal()) return;
      if (e.ctrlKey || e.metaKey) {
        if (this.bridge) return; // Qt menü kısayolları devrede
        const k = e.key.toLowerCase();
        if (k === 'o') { e.preventDefault(); this.command('openDialog'); }
        if (k === 's' && e.shiftKey) { e.preventDefault(); this.screenshot({}); }
        if (k === 'c' && e.shiftKey) { e.preventDefault(); this.screenshot({ clipboard: true }); }
        return;
      }
      // Blender gibi: H gizle, Shift+H seçili dışındakileri gizle, Alt+H hepsini geri getir
      if (e.code === 'KeyH' && e.altKey && !e.shiftKey) { e.preventDefault(); this.command('showAll'); return; }
      if (e.code === 'KeyH' && e.shiftKey && !e.altKey) { e.preventDefault(); this.command('isolateSelected'); return; }
      if (e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const modes = { 1: 'lit', 2: 'litwire', 3: 'wire', 4: 'unlit', 5: 'clay' };
      let handled = true;
      if (modes[k]) this.command('setShading', modes[k]);
      else if (k === '6') this.command('cycleTechnical');
      else if (k === '7') this.command('materialColors');
      else if (k === 'f' || k === 'Home') this.command('resetCamera');
      else if (k === '.') this.command('focusSelection');
      else if (k === 'g') this.toggle('grid');
      else if (k === 'b') this.toggle('bbox');
      else if (k === 'x') this.toggle('axes');
      else if (k === 't') this.toggle('textures');
      else if (k === 'r') this.toggle('autoRotate');
      else if (k === 'p') this.toggle('ortho');
      else if (k === 'n') this.toggle('panel');
      else if (k === ' ') this.anim.toggle();
      else if (k === 'ArrowLeft' && this.anim.hasAnimation) this.anim.step(-1);
      else if (k === 'ArrowRight' && this.anim.hasAnimation) this.anim.step(1);
      else if (k === 'h') this.command('hideSelected');
      else if (k === 'i') this.command('isolateSelected');
      else if (k === 'u') this.command('showAll');
      else if (k === 'Escape') this.select(null);
      else if (k === 'F11' && this.bridge) this.bridge.toggleFullscreen();
      else handled = false;
      if (handled) e.preventDefault();
    });
  }

  /* ============================================= browser fallbacks (no Qt) */
  _installDropFallback() {
    const vp = document.getElementById('viewport');
    const overlay = document.getElementById('drop-overlay');
    let depth = 0;
    vp.addEventListener('dragenter', e => { e.preventDefault(); depth++; overlay.hidden = false; });
    vp.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
    vp.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    vp.addEventListener('drop', e => {
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      this._handleFiles([...e.dataTransfer.files], e.clientX, e.clientY);
    });
  }

  _handleFiles(files, x, y) {
    if (!files.length) return;
    const model = files.find(f => MODEL_EXTS.includes(extOf(f.name)));
    const image = files.find(f => IMAGE_EXTS.includes(extOf(f.name)));
    const json = files.find(f => extOf(f.name) === 'json');
    if (model) this.openSource(createFileMapSource(files));
    else if (image) this.assignTexture({ url: URL.createObjectURL(image), name: image.name, ext: extOf(image.name), slot: 'map', x, y });
    else if (json) json.text().then(t => this.applySettings(JSON.parse(t), true)).catch(() => this.hud.toast('Geçersiz ayar dosyası.', 'error'));
    else this.hud.toast('Desteklenmeyen dosya türü.', 'error');
  }

  _installFileInputs() {
    const fileInput = document.getElementById('file-input');
    fileInput.accept = [...MODEL_EXTS, ...IMAGE_EXTS, 'mtl', 'bin'].map(e => `.${e}`).join(',');
    fileInput.addEventListener('change', () => { this._handleFiles([...fileInput.files]); fileInput.value = ''; });
    const settingsInput = document.getElementById('settings-input');
    settingsInput.addEventListener('change', async () => {
      const f = settingsInput.files[0];
      settingsInput.value = '';
      if (!f) return;
      try { this.applySettings(JSON.parse(await f.text()), true); } catch (e) { this.hud.toast('Geçersiz ayar dosyası.', 'error'); }
    });
    const texInput = document.getElementById('texture-input');
    texInput.addEventListener('change', () => {
      const f = texInput.files[0];
      texInput.value = '';
      if (!f || !this._pendingTexture) return;
      this.assignTexture({ ...this._pendingTexture, url: URL.createObjectURL(f), name: f.name, ext: extOf(f.name) });
      this._pendingTexture = null;
    });
  }
}

installTooltips();
const app = new App();
window.viewerApp = app;
app.init().catch(err => {
  console.error(err);
  app.bridge?.log('error', `Başlatma hatası: ${err?.stack || err}`);
});
