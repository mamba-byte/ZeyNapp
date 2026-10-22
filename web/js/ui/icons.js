// Satır içi SVG ikonları (24x24, çizgi stili)
const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  tree: '<path d="M4 4h6v5H4zM14 10h6v4h-6zM14 17h6v4h-6z"/><path d="M7 9v10h7M7 12h7"/>',
  shading: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" opacity=".35"/><path d="M3.5 9h17M3.5 15h17M12 3c-2.5 2.4-3.5 5.6-3.5 9s1 6.6 3.5 9"/>',
  cube: '<path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z"/><path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  play: '<path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  stepBack: '<path d="M6 5v14"/><path d="M18 6l-8 6 8 6z" fill="currentColor"/>',
  stepFwd: '<path d="M18 5v14"/><path d="M6 6l8 6-8 6z" fill="currentColor"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path d="M12 8.5l3 1.75v3.5L12 15.5l-3-1.75v-3.5z"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  panelClose: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M8 10l2 2-2 2"/>',
  chevRight: '<path d="M9 6l6 6-6 6"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  rotate: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1L20.5 8"/><path d="M20.5 3v5h-5"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8"/><path d="M3.5 3v5h5"/>',
  focus: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  mesh: '<path d="M12 3l9 16H3z"/><path d="M7.5 11h9M12 3v16"/>',
  skinned: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M8 10h8M12 14l-3.5 6M12 14l3.5 6"/>',
  group: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  points: '<circle cx="6" cy="7" r="1.5" fill="currentColor"/><circle cx="17" cy="6" r="1.5" fill="currentColor"/><circle cx="11" cy="12" r="1.5" fill="currentColor"/><circle cx="7" cy="18" r="1.5" fill="currentColor"/><circle cx="18" cy="17" r="1.5" fill="currentColor"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.9-.6-1.2-.6-2 0-.8.6-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
  ortho: '<path d="M4 7h16v10H4z"/><path d="M4 7l4-3h16l-4 3M20 17l4-3V4"/>',
  axes: '<path d="M5 19V5M5 19h14M5 19l9-9"/><path d="M3 7l2-2 2 2M17 17l2 2-2 2"/>',
  bbox: '<path d="M4 4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 8V4M20 8v8M4 16V8"/><path d="M9 9h6v6H9z" stroke-dasharray="2 2"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  // gölgelendirme modları
  modeLit: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" opacity=".25" stroke="none"/><circle cx="9" cy="9" r="2" fill="currentColor" stroke="none" opacity=".9"/>',
  modeLitWire: '<circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".22" stroke="none"/><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-2.6 2.3-3.8 5.2-3.8 8.5s1.2 6.2 3.8 8.5M12 3.5c2.6 2.3 3.8 5.2 3.8 8.5s-1.2 6.2-3.8 8.5"/>',
  modeWire: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M5.2 7h13.6M5.2 17h13.6M12 3.5c-2.6 2.3-3.8 5.2-3.8 8.5s1.2 6.2 3.8 8.5M12 3.5c2.6 2.3 3.8 5.2 3.8 8.5s-1.2 6.2-3.8 8.5"/>',
  modeUnlit: '<circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".55" stroke="none"/><circle cx="12" cy="12" r="8.5"/>',
  modeClay: '<circle cx="12" cy="12" r="8.5"/><path d="M8 7.5a5.5 5.5 0 0 1 4-1.5" /><circle cx="15" cy="15" r="3" fill="currentColor" opacity=".3" stroke="none"/>',
  modeTech: '<path d="M4 4h8v8H4zM12 12h8v8h-8z" fill="currentColor" opacity=".45" stroke="none"/><path d="M4 4h16v16H4z"/>',
};

export function iconSvg(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.cube}</svg>`;
}

export function icon(name, size = 18) {
  const tpl = document.createElement('template');
  tpl.innerHTML = iconSvg(name, size);
  return tpl.content.firstChild;
}

/** HTML içindeki data-icon yer tutucularını gerçek SVG ile doldurur. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.prepend(icon(el.dataset.icon, Number(el.dataset.size) || 18));
    el.removeAttribute('data-icon');
  });
}
