import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  selectFile: () => Promise<string | null>
  loadFile: (filepath: string) => Promise<any>
  extractMetadata: (filepath: string) => Promise<any>
  findProxy: (mxfPath: string) => Promise<any>
  generateProxy: (mxfPath: string, quality: string) => Promise<string>
  onProxyProgress: (callback: (percent: number) => void) => () => void
  getSettings: () => Promise<any>
  saveSettings: (settings: any) => Promise<void>
  exportFrame: (filepath: string, time: number) => Promise<void>
  exportClip: (filepath: string, startTime: number, endTime: number) => Promise<void>
  getExternalDrives: () => Promise<any>
  getMXFFileInfo: (filepath: string) => Promise<any>
  onDriveMounted: (callback: (drive: any) => void) => () => void
  onDriveUnmounted: (callback: (drivePath: string) => void) => () => void
  // Batch merge operations
  validateMerge: (clipPaths: string[]) => Promise<any>
  mergeClips: (opts: any) => Promise<any>
  cancelMerge: () => Promise<{ cancelled: boolean }>
  selectMergeOutput: () => Promise<string | null>
  onMergeProgress: (callback: (percent: number) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
