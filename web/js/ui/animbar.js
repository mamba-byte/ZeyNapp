// Alt animasyon kontrol çubuğu
import { h } from './dom.js';
import { icon } from './icons.js';

const fmtTime = t => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

export class AnimBar {
  constructor(el, anim) {
    this.el = el;
    this.anim = anim;
    this.scrubbing = false;
    this.wasPlaying = false;

    this.playBtn = h('button', { class: 'anim-play anim-ctl', 'data-tip': 'Oynat / Duraklat', 'data-key': 'Boşluk', onclick: () => anim.toggle() });
    this.backBtn = h('button', { class: 'anim-btn anim-ctl', 'data-tip': 'Önceki kare', 'data-key': '←', onclick: () => anim.step(-1) }, icon('stepBack', 16));
    this.fwdBtn = h('button', { class: 'anim-btn anim-ctl', 'data-tip': 'Sonraki kare', 'data-key': '→', onclick: () => anim.step(1) }, icon('stepFwd', 16));
    this.loopBtn = h('button', { class: 'anim-btn anim-ctl', 'data-tip': 'Döngü (Loop)', onclick: () => anim.setLoop(!anim.loop) }, icon('repeat', 17));
    this.range = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, class: 'anim-ctl' });
    this.timeEl = h('span', { class: 'anim-time anim-ctl', text: '00:00.00 / 00:00.00' });
    this.clipSel = h('select', { class: 'anim-ctl', 'data-tip': 'Animasyon seçici' });
    this.speedSel = h('select', { class: 'speed anim-ctl', 'data-tip': 'Oynatma hızı' },
      ...[0.25, 0.5, 1, 1.5, 2].map(s => h('option', { value: s, text: `x ${s.toFixed(s < 1 ? 2 : 1)}` })));
    this.speedSel.value = '1';
    this.label = h('span', { class: 'anim-label', text: 'Animasyon yok' });

    el.append(this.playBtn, this.backBtn, this.fwdBtn, this.loopBtn,
      h('div', { class: 'anim-timeline anim-ctl' }, this.range), this.timeEl, this.label, this.clipSel, this.speedSel);

    this.range.addEventListener('pointerdown', () => {
      this.scrubbing = true;
      this.wasPlaying = anim.playing;
      if (anim.playing) anim.pause();
    });
    const endScrub = () => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      if (this.wasPlaying) anim.play();
    };
    this.range.addEventListener('pointerup', endScrub);
    this.range.addEventListener('change', endScrub);
    this.range.addEventListener('input', () => {
      anim.seek(Number(this.range.value));
      this._fill();
    });
    this.range.addEventListener('keydown', e => e.stopPropagation());
    this.clipSel.addEventListener('change', () => anim.select(Number(this.clipSel.value)));
    this.speedSel.addEventListener('change', () => anim.setSpeed(Number(this.speedSel.value)));
    for (const s of [this.clipSel, this.speedSel]) s.addEventListener('keydown', e => e.stopPropagation());

    anim.addEventListener('clips', () => this.syncClips());
    anim.addEventListener('state', () => this.syncState());
    anim.addEventListener('time', () => this.syncTime());
    this.syncClips();
    this.syncState();
  }

  syncClips() {
    const a = this.anim;
    this.clipSel.innerHTML = '';
    a.clips.forEach((c, i) => this.clipSel.append(h('option', { value: i, text: c.name || `Animasyon ${i + 1}` })));
    this.el.classList.toggle('disabled', !a.hasAnimation);
    this.label.hidden = a.hasAnimation;
    this.clipSel.hidden = !a.hasAnimation;
    this.label.textContent = 'Animasyon yok';
  }

  syncState() {
    const a = this.anim;
    this.playBtn.innerHTML = '';
    this.playBtn.append(icon(a.playing ? 'pause' : 'play', 18));
    this.loopBtn.classList.toggle('active', a.loop);
    if (a.index >= 0) this.clipSel.value = String(a.index);
    this.speedSel.value = String(a.speed);
    this.range.max = Math.max(a.duration, 0.001);
    this.syncTime();
  }

  syncTime() {
    const a = this.anim;
    if (!this.scrubbing) this.range.value = a.time;
    this._fill();
    this.timeEl.textContent = `${fmtTime(a.time)} / ${fmtTime(a.duration)}`;
  }

  _fill() {
    const max = Number(this.range.max) || 1;
    this.range.style.setProperty('--pct', `${(Number(this.range.value) / max) * 100}%`);
  }
}
