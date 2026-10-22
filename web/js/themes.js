// 9 hazır ortam/aydınlatma teması
// background.color1 = üst/iç renk, color2 = alt/dış renk
export const THEMES = [
  {
    id: 'default', name: 'Varsayılan',
    background: { mode: 'gradient', type: 'radial', color1: '#596170', color2: '#1b1e24', angle: 180 },
    key: { color: '#ffffff', intensity: 2.87, azimuth: 35, elevation: 48 },
    fill: { color: '#d4e3ff', intensity: 0.8 }, rim: { color: '#ffffff', intensity: 1.2 },
    ambient: { color: '#ffffff', intensity: 0.09 }, hemi: { sky: '#eef3ff', ground: '#3b3631', intensity: 0.25 },
    env: { preset: 'room', intensity: 0.45 }, exposure: 1.0,
  },
  {
    id: 'sunset', name: 'Gün Batımı / Sıcak',
    background: { mode: 'gradient', type: 'linear', color1: '#e8935a', color2: '#2c1a2e', angle: 180 },
    key: { color: '#ffb36b', intensity: 3.54, azimuth: 70, elevation: 18 },
    fill: { color: '#7b6dff', intensity: 0.7 }, rim: { color: '#ff7a59', intensity: 1.8 },
    ambient: { color: '#ffd9b0', intensity: 0.07 }, hemi: { sky: '#ffc58a', ground: '#3a2333', intensity: 0.23 },
    env: { sky: '#ffb070', horizon: '#ff7a50', ground: '#2a1626', panels: ['#ffd29a', '#ff8a5c', '#8c7bff'], intensity: 0.49 },
    exposure: 1.05,
  },
  {
    id: 'cool', name: 'Soğuk / Siyan',
    background: { mode: 'gradient', type: 'radial', color1: '#1f5a68', color2: '#061519', angle: 180 },
    key: { color: '#c4f4ff', intensity: 2.87, azimuth: 20, elevation: 50 },
    fill: { color: '#3aa6ff', intensity: 0.9 }, rim: { color: '#5ff5ff', intensity: 1.9 },
    ambient: { color: '#a9e8ff', intensity: 0.07 }, hemi: { sky: '#b8f0ff', ground: '#0b2730', intensity: 0.23 },
    env: { sky: '#9fe6ff', horizon: '#2b7d99', ground: '#06161b', panels: ['#d8f8ff', '#40c8ff'], intensity: 0.49 },
    exposure: 1.0,
  },
  {
    id: 'neon', name: 'Neon Yeşil',
    background: { mode: 'gradient', type: 'radial', color1: '#14421d', color2: '#030805', angle: 180 },
    key: { color: '#a4ff8f', intensity: 2.65, azimuth: -30, elevation: 40 },
    fill: { color: '#18ff6d', intensity: 0.8 }, rim: { color: '#e6ff3a', intensity: 2.3 },
    ambient: { color: '#7dff9a', intensity: 0.05 }, hemi: { sky: '#8cff9a', ground: '#041006', intensity: 0.17 },
    env: { sky: '#69ff87', horizon: '#0f5a22', ground: '#020803', panels: ['#b8ff9e', '#2bff72', '#e6ff3a'], intensity: 0.49 },
    exposure: 1.0,
  },
  {
    id: 'neutral', name: 'Nötr Gri',
    background: { mode: 'solid', type: 'radial', color1: '#7a7a7a', color2: '#5a5a5a', angle: 180 },
    key: { color: '#ffffff', intensity: 2.21, azimuth: 30, elevation: 55 },
    fill: { color: '#ffffff', intensity: 0.9 }, rim: { color: '#ffffff', intensity: 0.6 },
    ambient: { color: '#ffffff', intensity: 0.15 }, hemi: { sky: '#ffffff', ground: '#808080', intensity: 0.29 },
    env: { sky: '#d0d0d0', horizon: '#9a9a9a', ground: '#555555', panels: ['#ffffff', '#e0e0e0'], intensity: 0.44 },
    exposure: 1.0,
  },
  {
    id: 'purple', name: 'Yumuşak Mor',
    background: { mode: 'gradient', type: 'radial', color1: '#5b4479', color2: '#191223', angle: 180 },
    key: { color: '#e8d6ff', intensity: 2.54, azimuth: 40, elevation: 45 },
    fill: { color: '#ff9ad5', intensity: 0.8 }, rim: { color: '#a98bff', intensity: 1.7 },
    ambient: { color: '#d9c6ff', intensity: 0.09 }, hemi: { sky: '#e3d1ff', ground: '#2a1f38', intensity: 0.25 },
    env: { sky: '#d8c2ff', horizon: '#8a66c4', ground: '#1d1529', panels: ['#f3e8ff', '#ffa8de'], intensity: 0.49 },
    exposure: 1.0,
  },
  {
    id: 'contrast', name: 'Yüksek Kontrast Siyah',
    background: { mode: 'solid', type: 'radial', color1: '#000000', color2: '#000000', angle: 180 },
    key: { color: '#ffffff', intensity: 4.64, azimuth: 60, elevation: 35 },
    fill: { color: '#ffffff', intensity: 0.0 }, rim: { color: '#ffffff', intensity: 2.6 },
    ambient: { color: '#ffffff', intensity: 0.01 }, hemi: { sky: '#ffffff', ground: '#000000', intensity: 0.03 },
    env: { sky: '#1a1a1a', horizon: '#000000', ground: '#000000', panels: ['#ffffff'], panelStrength: 5, intensity: 0.56 },
    exposure: 1.0,
  },
  {
    id: 'studio', name: 'Parlak Beyaz Stüdyo',
    background: { mode: 'gradient', type: 'radial', color1: '#ffffff', color2: '#d5d9df', angle: 180 },
    key: { color: '#ffffff', intensity: 2.43, azimuth: 25, elevation: 60 },
    fill: { color: '#ffffff', intensity: 1.0 }, rim: { color: '#ffffff', intensity: 0.8 },
    ambient: { color: '#ffffff', intensity: 0.2 }, hemi: { sky: '#ffffff', ground: '#c8c8c8', intensity: 0.36 },
    env: { sky: '#ffffff', horizon: '#eeeeee', ground: '#bdbdbd', panels: ['#ffffff', '#ffffff', '#ffffff'], intensity: 0.54 },
    exposure: 1.08,
  },
  {
    id: 'multicolor', name: 'Çok Renkli Kontrast',
    background: { mode: 'gradient', type: 'radial', color1: '#2b2142', color2: '#09070f', angle: 180 },
    key: { color: '#ff4d6d', intensity: 3.09, azimuth: 60, elevation: 30 },
    fill: { color: '#3d7bff', intensity: 1.9 }, rim: { color: '#38ff9c', intensity: 2.3 },
    ambient: { color: '#ffffff', intensity: 0.03 }, hemi: { sky: '#ff9de0', ground: '#102040', intensity: 0.15 },
    env: { sky: '#ff6fa0', horizon: '#5a3cff', ground: '#0b1a3a', panels: ['#ff3d6a', '#3d7bff', '#38ff9c'], intensity: 0.49 },
    exposure: 1.0,
  },
];

export const BG_PRESETS = [
  { name: 'Koyu Gri', bg: { mode: 'solid', color1: '#7a7a7a', color2: '#4a4a4a' } },
  { name: 'Zifiri Siyah', bg: { mode: 'solid', color1: '#000000', color2: '#000000' } },
  { name: 'Stüdyo Beyazı', bg: { mode: 'solid', color1: '#f2f2f2', color2: '#d9d9d9' } },
  { name: 'Lacivert', bg: { mode: 'solid', color1: '#0b1a3a', color2: '#050b1a' } },
];

export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];
