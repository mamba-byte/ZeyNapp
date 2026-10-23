// Görüntü alanı üstündeki araç çubukları, yükleme ekranı, bildirimler ve iletişim kutuları
import { h } from './dom.js';
import { icon } from './icons.js';
import { MODE_INFO, TECHNICAL_MODES } from '../shading.js';

const TOP_MODES = ['lit', 'litwire', 'wire', 'unlit', 'clay'];

export class Hud {
  constructor(app) {
    this.app = app;
    this.app.el = document.getElementById('app');
    this.modeButtons = new Map();
    const bar = document.getElementById('mode-toolbar');
    for (const mode of TOP_MODES) {
      const info = MODE_INFO[mode];
      const b = h('button', {
        class: 'tool-btn', 'data-tip': `${info.name} (${info.sub})`, 'data-key': info.key,
        onclick: () => app.command('setShading', mode),
      }, icon(info.icon, 19), h('span', { class: 'key', text: info.key }));
      bar.append(b);
      this.modeButtons.set(mode, b);
    }
    this.techButton = h('button', {
      class: 'tool-btn', 'data-tip': 'Teknik: Normal / UV / Vertex rengi (tekrar basınca değişir)', 'data-key': '6',
      onclick: () => app.command('cycleTechnical'),
    }, icon('modeTech', 19), h('span', { class: 'key', text: '6' }));
    bar.append(this.techButton);
    bar.append(h('div', { class: 'sep' }));
    this.texButton = h('button', {
      class: 'tool-btn', 'data-tip': 'Dokuları aç/kapat', 'data-key': 'T',
      onclick: () => app.command('toggle', 'textures'),
    }, icon('image', 19));
    bar.append(this.texButton);
    this.colorButton = h('button', {
      class: 'tool-btn', 'data-tip': 'Materyallere rastgele renk ver (tekrar tıkla: yeni renkler)', 'data-key': '7',
      onclick: () => app.command('materialColors'),
    }, icon('palette', 19), h('span', { class: 'key', text: '7' }));
    bar.append(this.colorButton);

    const right = document.getElementById('view-toolbar');
    const vbtn = (ic, tip, key, cmd, arg) => {
      const b = h('button', { class: 'tool-btn', 'data-tip': tip, 'data-key': key || null, onclick: () => app.command(cmd, arg) }, icon(ic, 18));
      right.append(b);
      return b;
    };
    this.viewButtons = {
      panel: vbtn('panel', 'Sağ paneli göster/gizle', 'N', 'toggle', 'panel'),
      fit: vbtn('fit', 'Kamerayı sıfırla / sığdır', 'F', 'resetCamera'),
      grid: vbtn('grid', 'Zemin ızgarası', 'G', 'toggle', 'grid'),
      ortho: vbtn('ortho', 'Ortografik kamera', 'P', 'toggle', 'ortho'),
      autoRotate: vbtn('rotate', 'Otomatik döndür', 'R', 'toggle', 'autoRotate'),
      shot: vbtn('camera', 'Ekran görüntüsü al', 'Ctrl+Shift+S', 'screenshot', {}),
    };

    this.badge = document.getElementById('model-badge');
    this.loading = document.getElementById('loading');
    this.loadingBar = document.getElementById('loading-bar');
    this.loadingStage = document.getElementById('loading-stage');
    this.loadingName = document.getElementById('loading-name');
    this.toasts = document.getElementById('toasts');
    this.modalRoot = document.getElementById('modal-root');
  }

  syncMode(mode) {
    for (const [m, b] of this.modeButtons) b.classList.toggle('active', m === mode);
    this.colorButton?.classList.toggle('active', mode === 'matcolor');
    const tech = TECHNICAL_MODES.includes(mode);
    this.techButton.classList.toggle('active', tech);
    if (tech) this.techButton.dataset.tip = `Teknik: ${MODE_INFO[mode].name} (6 ile değiştir)`;
  }

  syncFlags(flags) {
    for (const [k, b] of Object.entries(this.viewButtons)) if (k in flags) b.classList.toggle('active', !!flags[k]);
    this.texButton.classList.toggle('active', !!flags.textures);
  }

  setBadge(html) {
    this.badge.innerHTML = html || '';
    this.badge.hidden = !html;
  }

  /* -------------------------------------------------------- loading */
  showLoading(name) {
    this.loadingName.textContent = name;
    this.loadingStage.textContent = 'Yükleniyor…';
    this.loadingBar.style.width = '0%';
    this.loadingBar.parentElement.classList.remove('indeterminate');
    this.loading.hidden = false;
  }

  setProgress(p) {
    this.loadingBar.parentElement.classList.remove('indeterminate');
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
    this.loadingStage.textContent = `Dosya okunuyor… %${Math.round(p * 100)}`;
  }

  setStage(text) {
    this.loadingStage.textContent = text;
    if (!text.startsWith('Dosya okunuyor')) this.loadingBar.parentElement.classList.add('indeterminate');
  }

  hideLoading() { this.loading.hidden = true; }

  /* --------------------------------------------------------- toasts */
  toast(text, kind = 'info', ms = 3400) {
    const ic = { success: 'check', error: 'alert', warn: 'alert' }[kind] || 'info';
    const el = h('div', { class: `toast ${kind}` }, icon(ic, 16), h('span', { text }));
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  /* --------------------------------------------------------- modal */
  modal(title, body) {
    this.closeModal();
    const close = () => this.closeModal();
    const backdrop = h('div', { class: 'modal-backdrop', onclick: e => { if (e.target === backdrop) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', { text: title }),
          h('button', { class: 'btn btn-ghost btn-icon', onclick: close, 'aria-label': 'Kapat' }, icon('x', 16))),
        h('div', { class: 'modal-body' }, body)));
    this.modalRoot.append(backdrop);
    this._modal = backdrop;
  }

  closeModal() {
    if (!this._modal) return false;
    this._modal.remove();
    this._modal = null;
    return true;
  }

  showHelp(topic, info = {}) {
    if (topic === 'shortcuts') {
      // "~" ile başlayan parçalar düz metin, diğerleri tuş olarak gösterilir
      const rows = [
        ['Gölgelendirme modları', ['1', '~ – ', '6']],
        ['Teknik modlar arasında geçiş', ['6', '~ (tekrar basın)']],
        ['Rastgele materyal renkleri / yeni renkler', ['7']],
        ['Kamerayı sıfırla / sığdır', ['F', '~ veya ', 'Home']],
        ['Seçili parçaya odaklan', ['.', '~ veya çift tık']],
        ['Döndür', ['~Sol fare tuşu ile sürükle']],
        ['Kaydır (pan)', ['~Orta tuş veya ', 'Shift', '~ + Sol tuş']],
        ['Yakınlaş / uzaklaş', ['~Tekerlek veya sağ tuşla sürükle']],
        ['Zemin ızgarası', ['G']],
        ['Sınır kutusu', ['B']],
        ['Eksen göstergesi', ['X']],
        ['Dokuları aç/kapat', ['T']],
        ['Otomatik döndür', ['R']],
        ['Perspektif / ortografik', ['P']],
        ['Sağ panel', ['N']],
        ['Animasyon oynat / duraklat', ['Boşluk']],
        ['Animasyonda kare adımı', ['←', '~ / ', '→']],
        ['Seçiliyi gizle', ['H']],
        ['Seçili dışındakileri gizle', ['Shift', '~ + ', 'H']],
        ['Gizlenenleri geri getir', ['Alt', '~ + ', 'H']],
        ['Seçimi temizle', ['Esc']],
        ['Model aç', ['Ctrl+O']],
        ['Yeniden yükle', ['F5']],
        ['Ekran görüntüsü', ['Ctrl+Shift+S']],
        ['Görüntüyü panoya kopyala', ['Ctrl+Shift+C']],
        ['Tam ekran', ['F11']],
      ];
      this.modal('Klavye Kısayolları', h('table', {}, ...rows.map(([a, keys]) => h('tr', {}, h('td', { text: a }),
        h('td', {}, ...keys.map(k => (k.startsWith('~') ? k.slice(1) : h('kbd', { text: k }))))))));
    } else if (topic === 'formats') {
      this.modal('Desteklenen Formatlar', h('div', {},
        h('table', {},
          ...[
            ['.fbx', 'Autodesk FBX 7.x — binary ve ASCII, çoklu alt-mesh, Phong/PBR materyaller, katmanlı normal/UV, vertex color, iskelet ve anahtar kare animasyonları, gömülü dokular'],
            ['.glb / .gltf', 'glTF 2.0 — PBR, iskelet/morph animasyonları, Draco, Meshopt, KTX2 sıkıştırma'],
            ['.obj (+ .mtl)', 'Wavefront OBJ — MTL materyalleri ve doku dosyaları'],
            ['.stl', 'Binary ve ASCII STL (Z-yukarı otomatik düzeltilir)'],
            ['.ply / .dae / .3mf', 'Ek formatlar'],
            ['Dokular', 'PNG, JPG, TGA, BMP, WEBP; TIF/PSD/DDS otomatik dönüştürülür'],
          ].map(([a, b]) => h('tr', {}, h('td', {}, h('code', { text: a })), h('td', { text: b })))),
        h('p', { class: 'hint', text: 'Dokular bulunamazsa model klasörü, alt klasörleri (textures, maps, *.fbm …) ve üst klasör dosya adına göre otomatik taranır.' })));
    } else if (topic === 'about') {
      this.modal('Hakkında', h('div', {},
        h('p', {}, h('b', { text: '3B Model Görüntüleyici' }), ` — sürüm ${info.version || '1.0.0'}`),
        h('p', { text: 'FBX, glTF/GLB, OBJ ve STL modelleri için modern masaüstü görüntüleyici.' }),
        h('h3', { text: 'Bileşenler' }),
        h('table', {},
          h('tr', {}, h('td', { text: 'Python' }), h('td', { text: info.python || '—' })),
          h('tr', {}, h('td', { text: 'Qt / PySide6' }), h('td', { text: `${info.qt || '—'} / ${info.pyside || '—'}` })),
          h('tr', {}, h('td', { text: 'Three.js' }), h('td', { text: `r${this.app.threeRevision}` })),
          h('tr', {}, h('td', { text: 'WebGL' }), h('td', { text: this.app.glInfo || '—' })),
          info.log ? h('tr', {}, h('td', { text: 'Günlük dosyası' }), h('td', {}, h('code', { text: info.log }))) : null)));
    }
  }
}
