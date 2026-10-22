// Python köprüsü: Qt uygulaması içinde yerel sunucunun /api uç noktasıyla konuşur.
// Adresteki "t" belirteci yalnızca uygulama tarafından verilir; tarayıcıda (geliştirme) null döner.
export function connectBridge() {
  const token = new URLSearchParams(location.search).get('t');
  if (!token) return Promise.resolve(null);
  const call = (method, ...args) => fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MV-Token': token },
    body: JSON.stringify(args),
  })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(j => j?.result)
    .catch(err => { console.error(`Köprü çağrısı başarısız: ${method}`, err); return null; });
  return Promise.resolve({
    ready: () => call('ready'),
    openFileDialog: () => call('openFileDialog'),
    reloadModel: () => call('reloadModel'),
    saveImage: (dataUrl, name) => call('saveImage', dataUrl, name),
    copyImage: dataUrl => call('copyImage', dataUrl),
    deliverCapture: dataUrl => call('deliverCapture', dataUrl),
    exportSettings: (json, name) => call('exportSettings', json, name),
    importSettingsDialog: () => call('importSettingsDialog'),
    chooseTexture: payload => call('chooseTexture', payload),
    reportState: state => call('reportState', state),
    notify: (kind, data) => call('notify', kind, data || {}),
    savePreferences: json => call('savePreferences', json),
    loadPreferences: () => call('loadPreferences').then(r => r || ''),
    toggleFullscreen: () => call('toggleFullscreen'),
    log: (level, msg) => call('log', level, String(msg)),
  });
}
