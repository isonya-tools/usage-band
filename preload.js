const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s)),
  onConfig: cb => ipcRenderer.on('config', (_e, c) => cb(c)),
  reportSize: h => ipcRenderer.send('size', h),
  showMenu: () => ipcRenderer.send('show-menu'),
  resizeStart: edge => ipcRenderer.send('resize-start', edge),
  resizeMove: () => ipcRenderer.send('resize-move'),
  resizeEnd: () => ipcRenderer.send('resize-end'),
})
