import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('gitbar', {
  updateBadge: (count: number) => ipcRenderer.send('update-badge', count),
  showNotification: (data: { title: string; body: string; url?: string }) =>
    ipcRenderer.send('show-notification', data),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  hideWindow: () => ipcRenderer.send('hide-window'),
  storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  storeRemove: (key: string) => ipcRenderer.invoke('store-remove', key),
  installUpdate: () => ipcRenderer.send('install-update'),
  getPendingUpdate: () => ipcRenderer.invoke('get-pending-update'),
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_event: unknown, info: { version: string }) => callback(info)
    ipcRenderer.on('update-available', listener)
    return () => {
      ipcRenderer.off('update-available', listener)
    }
  }
})
