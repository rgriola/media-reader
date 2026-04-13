import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  loadFile: (filepath: string) => ipcRenderer.invoke('load-file', filepath),

  // Metadata operations
  extractMetadata: (filepath: string) => ipcRenderer.invoke('extract-metadata', filepath),

  // Proxy operations
  findProxy: (mxfPath: string) => ipcRenderer.invoke('find-proxy', mxfPath),
  generateProxy: (mxfPath: string, quality: string) =>
    ipcRenderer.invoke('generate-proxy', mxfPath, quality),
  onProxyProgress: (callback: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number): void => callback(percent)
    ipcRenderer.on('proxy-progress', handler)
    return () => {
      ipcRenderer.removeListener('proxy-progress', handler)
    }
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

  // Export operations
  exportFrame: (filepath: string, time: number) =>
    ipcRenderer.invoke('export-frame', filepath, time),
  exportClip: (filepath: string, startTime: number, endTime: number) =>
    ipcRenderer.invoke('export-clip', filepath, startTime, endTime),

  // External drive operations
  getExternalDrives: () => ipcRenderer.invoke('get-external-drives'),
  getMXFFileInfo: (filepath: string) => ipcRenderer.invoke('get-mxf-file-info', filepath),
  onDriveMounted: (callback: (drive: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, drive: any): void => callback(drive)
    ipcRenderer.on('drive-mounted', handler)
    return () => {
      ipcRenderer.removeListener('drive-mounted', handler)
    }
  },
  onDriveUnmounted: (callback: (drivePath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, drivePath: string): void =>
      callback(drivePath)
    ipcRenderer.on('drive-unmounted', handler)
    return () => {
      ipcRenderer.removeListener('drive-unmounted', handler)
    }
  },

  // Batch merge operations
  validateMerge: (clipPaths: string[]) => ipcRenderer.invoke('validate-merge', clipPaths),
  mergeClips: (opts: any) => ipcRenderer.invoke('merge-clips', opts),
  cancelMerge: () => ipcRenderer.invoke('cancel-merge'),
  selectMergeOutput: () => ipcRenderer.invoke('select-merge-output'),
  onMergeProgress: (callback: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number): void => callback(percent)
    ipcRenderer.on('merge-progress', handler)
    return () => {
      ipcRenderer.removeListener('merge-progress', handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
