// Güneş ikonlu 360° ışık yönü kadranı: açı = azimut, merkeze uzaklık = yükseklik
const NS = 'http://www.w3.org/2000/svg';
const SIZE = 150;
const C = SIZE / 2;
const R = 62;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

export class LightDial {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.az = 0;
    this.el = 45;
    const svg = this.svg = el('svg', { class: 'dial', viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'slider', 'aria-label': 'Işık yönü' });
    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: 'dialbg' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#2e333d' }, grad);
    el('stop', { offset: '100%', 'stop-color': '#1c1f25' }, grad);
    el('circle', { cx: C, cy: C, r: R + 6, fill: 'url(#dialbg)', stroke: '#3a3f4a', 'stroke-width': 1 }, svg);
    for (const e of [30, 60]) el('circle', { cx: C, cy: C, r: R * (1 - e / 90), fill: 'none', stroke: '#3a404b', 'stroke-dasharray': '2 3' }, svg);
    for (let a = 0; a < 360; a += 15) {
      const rad = (a * Math.PI) / 180;
      const long = a % 90 === 0;
      el('line', {
        x1: C + Math.sin(rad) * (R + (long ? 0 : 2)), y1: C + Math.cos(rad) * (R + (long ? 0 : 2)),
        x2: C + Math.sin(rad) * (R + 6), y2: C + Math.cos(rad) * (R + 6),
        stroke: long ? '#6b7280' : '#454b57', 'stroke-width': long ? 1.5 : 1,
      }, svg);
    }
    const lbl = (x, y, t) => { const e = el('text', { x, y, fill: '#7d848f', 'font-size': 9, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': 'Segoe UI, sans-serif' }, svg); e.textContent = t; };
    lbl(C, C + R - 9, 'ÖN');
    lbl(C, C - R + 9, 'ARKA');
    lbl(C - R + 11, C, 'SOL');
    lbl(C + R - 11, C, 'SAĞ');
    el('circle', { cx: C, cy: C, r: 2.5, fill: '#5d6470' }, svg);
    this.ray = el('line', { x1: C, y1: C, x2: C, y2: C, stroke: '#f5b84a', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: 0.8 }, svg);
    this.sun = el('g', { style: 'cursor:grab' }, svg);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      el('line', { x1: Math.cos(a) * 9, y1: Math.sin(a) * 9, x2: Math.cos(a) * 13, y2: Math.sin(a) * 13, stroke: '#ffc75a', 'stroke-width': 2, 'stroke-linecap': 'round' }, this.sun);
    }
    el('circle', { r: 7, fill: '#ffcf5c', stroke: '#fff3c9', 'stroke-width': 1.2 }, this.sun);

    let dragging = false;
    const update = e => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * SIZE - C;
      const y = ((e.clientY - rect.top) / rect.height) * SIZE - C;
      const az = (Math.atan2(x, y) * 180) / Math.PI;
      const r = Math.min(Math.hypot(x, y), R);
      const elv = Math.max(2, Math.min(90, (1 - r / R) * 90));
      this.set(az, elv);
      this.onChange?.(Math.round(this.az), Math.round(this.el));
    };
    svg.addEventListener('pointerdown', e => { dragging = true; svg.setPointerCapture(e.pointerId); update(e); });
    svg.addEventListener('pointermove', e => { if (dragging) update(e); });
    svg.addEventListener('pointerup', e => { dragging = false; svg.releasePointerCapture(e.pointerId); });
    this.set(0, 45);
  }

  set(az, elv) {
    this.az = ((az + 540) % 360) - 180;
    this.el = elv;
    const rad = (this.az * Math.PI) / 180;
    const r = R * (1 - elv / 90);
    const x = C + Math.sin(rad) * r;
    const y = C + Math.cos(rad) * r;
    this.sun.setAttribute('transform', `translate(${x} ${y})`);
    this.ray.setAttribute('x2', x);
    this.ray.setAttribute('y2', y);
  }
}
