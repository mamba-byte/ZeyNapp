// Qt (QWebChannel) köprüsü. Uygulama dışında (tarayıcıda) çalışırken null döner.
export function connectBridge(timeout = 3000) {
  return new Promise(resolve => {
    if (!(window.qt && window.qt.webChannelTransport && window.QWebChannel)) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeout);
    // eslint-disable-next-line no-undef
    new QWebChannel(window.qt.webChannelTransport, channel => {
      clearTimeout(timer);
      resolve(wrap(channel.objects.bridge));
    });
  });
}

function wrap(b) {
  return {
    raw: b,
    ready: () => b.ready(),
    openFileDialog: () => b.openFileDialog(),
    reloadModel: () => b.reloadModel(),
    saveImage: (dataUrl, name) => b.saveImage(dataUrl, name),
    copyImage: dataUrl => b.copyImage(dataUrl),
    deliverCapture: dataUrl => b.deliverCapture(dataUrl),
    exportSettings: (json, name) => b.exportSettings(json, name),
    importSettingsDialog: () => b.importSettingsDialog(),
    chooseTexture: payload => b.chooseTexture(JSON.stringify(payload)),
    reportState: state => b.reportState(JSON.stringify(state)),
    notify: (kind, data) => b.notify(kind, JSON.stringify(data || {})),
    savePreferences: json => b.savePreferences(json),
    loadPreferences: () => new Promise(resolve => b.loadPreferences(resolve)),
    toggleFullscreen: () => b.toggleFullscreen(),
    log: (level, msg) => b.log(level, String(msg)),
  };
}
