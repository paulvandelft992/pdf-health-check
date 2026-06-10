const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog:        ()       => ipcRenderer.invoke('open-file-dialog'),
  readFile:              (p)      => ipcRenderer.invoke('read-file', p),
  openExternal:          (url)    => ipcRenderer.invoke('open-external', url),
  getSettings:           ()       => ipcRenderer.invoke('get-settings'),
  saveSettings:          (s)      => ipcRenderer.invoke('save-settings', s),
  adobeUploadAsset:      (args)   => ipcRenderer.invoke('adobe-upload-asset', args),
  carwashProcess:        (args)   => ipcRenderer.invoke('adobe-carwash-process', args),
  adobeGetProperties:    (args)   => ipcRenderer.invoke('adobe-get-properties', args),
  adobeGetAccessibility: (args)   => ipcRenderer.invoke('adobe-get-accessibility', args),
  exportReportPdf:       (args)   => ipcRenderer.invoke('export-report-pdf', args),
  exportExcel:           (args)   => ipcRenderer.invoke('export-excel', args),
  crawlDiscover:         (config) => ipcRenderer.invoke('crawl-discover', config),
  crawlFetchPdf:         (url)    => ipcRenderer.invoke('crawl-fetch-pdf', url),
  revealExtension:       ()       => ipcRenderer.invoke('reveal-extension'),
  updateInstallNow:      ()       => ipcRenderer.invoke('update-install-now'),
  onUpdateAvailable:     (cb)     => ipcRenderer.on('update-available',  (_e, info) => cb(info)),
  onUpdateDownloaded:    (cb)     => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
  platform:   process.platform,
  appVersion: process.env.npm_package_version || require('../package.json').version,
});
