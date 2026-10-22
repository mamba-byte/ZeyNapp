// Küçük DOM yardımcıları ve panel kontrolleri (kaydırıcı, renk, anahtar, seçim...)
import { icon } from './icons.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('tr-TR');
}

export function fmtShort(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.', ',') + ' B';
  return fmtNum(n);
}

export function fmtBytes(b) {
  if (!b && b !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0).replace('.', ',')} ${u[i]}`;
}

/* ------------------------------------------------------------- tooltip */
let tipEl = null;
export function installTooltips() {
  document.addEventListener('pointerover', e => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return;
    if (!tipEl) tipEl = h('div', { class: 'tip' });
    tipEl.innerHTML = '';
    tipEl.append(t.dataset.tip);
    if (t.dataset.key) tipEl.append(h('kbd', { text: t.dataset.key }));
    document.body.append(tipEl);
    const r = t.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    let y = r.bottom + 8;
    if (y + tr.height > innerHeight - 4) y = r.top - tr.height - 8;
    x = Math.max(6, Math.min(innerWidth - tr.width - 6, x));
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  });
  document.addEventListener('pointerout', e => {
    if (tipEl && e.target.closest?.('[data-tip]')) tipEl.remove();
  });
  document.addEventListener('pointerdown', () => tipEl?.remove(), true);
}

/* -------------------------------------------------------------- section */
export function section(title, { open = true, extra = null } = {}) {
  const body = h('div', { class: 'section-body' });
  const extraEl = extra ? h('span', { class: 'extra' }, extra) : null;
  const el = h('div', { class: 'section' + (open ? '' : ' closed') },
    h('button', { class: 'section-head', onclick: () => el.classList.toggle('closed') },
      h('span', { class: 'chev' }, icon('chevDown', 14)), title, extraEl),
    body);
  return { el, body, extra: extraEl };
}

export function row(label, ...controls) {
  return h('div', { class: 'row' }, h('label', { text: label }), h('div', { class: 'ctl' }, ...controls));
}

function setRangeFill(input) {
  const min = Number(input.min), max = Number(input.max);
  const pct = ((Number(input.value) - min) / (max - min || 1)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}

export function slider({ label, min = 0, max = 1, step = 0.01, value = 0, format = v => v.toFixed(2), onInput }) {
  const input = h('input', { type: 'range', min, max, step, value });
  const val = h('span', { class: 'val' });
  const sync = v => { input.value = v; val.textContent = format(Number(v)); setRangeFill(input); };
  input.addEventListener('input', () => { sync(input.value); onInput?.(Number(input.value)); });
  input.addEventListener('dblclick', () => {
    if (input.dataset.default === undefined) return;
    sync(input.dataset.default);
    onInput?.(Number(input.value));
  });
  input.dataset.default = value;
  sync(value);
  const el = row(label, input, val);
  return { el, input, set: v => sync(v), setEnabled: on => { input.disabled = !on; } };
}

export function colorPicker({ label, value = '#ffffff', onInput }) {
  const picker = h('input', { type: 'color', value });
  const hex = h('input', { class: 'hex', value, spellcheck: 'false', maxlength: 7 });
  const sync = v => { picker.value = v; hex.value = v; };
  picker.addEventListener('input', () => { hex.value = picker.value; onInput?.(picker.value); });
  hex.addEventListener('change', () => {
    let v = hex.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
    if (/^#[0-9a-f]{6}$/i.test(v)) { sync(v.toLowerCase()); onInput?.(v.toLowerCase()); } else hex.value = picker.value;
  });
  hex.addEventListener('keydown', e => e.stopPropagation());
  const el = label ? row(label, h('div', { class: 'color-ctl' }, picker, hex)) : h('div', { class: 'color-ctl' }, picker, hex);
  return { el, set: sync };
}

export function toggle({ label, value = false, onChange, tip }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = value;
  input.addEventListener('change', () => onChange?.(input.checked));
  const el = h('div', { class: 'row toggle-row' },
    h('label', { text: label, 'data-tip': tip || null, onclick: () => input.click() }),
    h('label', { class: 'switch' }, input, h('span', { class: 'slider' })));
  return { el, set: v => { input.checked = !!v; } };
}

export function select({ label, options, value, onChange }) {
  const sel = h('select', {}, ...options.map(([v, t]) => h('option', { value: v, text: t })));
  sel.value = value;
  sel.addEventListener('change', () => onChange?.(sel.value));
  sel.addEventListener('keydown', e => e.stopPropagation());
  const el = label ? row(label, sel) : sel;
  return {
    el, sel,
    set: v => { sel.value = v; },
    setOptions(opts, v) {
      sel.innerHTML = '';
      opts.forEach(([ov, t]) => sel.append(h('option', { value: ov, text: t })));
      if (v !== undefined) sel.value = v;
    },
  };
}

export function segmented({ options, value, onChange }) {
  const el = h('div', { class: 'segmented' });
  const buttons = options.map(([v, text, ic, tip]) => {
    const b = h('button', { 'data-tip': tip || null, onclick: () => { set(v); onChange?.(v); } },
      ic ? icon(ic, 14) : null, text);
    b.dataset.value = v;
    el.append(b);
    return b;
  });
  const set = v => buttons.forEach(b => b.classList.toggle('active', b.dataset.value === String(v)));
  set(value);
  return { el, set };
}

export function button(text, { icon: ic, onClick, cls = '', tip } = {}) {
  return h('button', { class: `btn ${cls}`, onclick: onClick, 'data-tip': tip || null }, ic ? icon(ic, 15) : null, text);
}
