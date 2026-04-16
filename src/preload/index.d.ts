import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  FileLoadResult,
  MXFMetadata,
  ProxyFile,
  ExternalDrive,
  MXFFileInfo,
  ClipValidationResult,
  MergeOptions
} from '../renderer/src/types'

interface CustomAPI {
  selectFile: () => Promise<string | null>
  loadFile: (filepath: string) => Promise<FileLoadResult>
  extractMetadata: (filepath: string) => Promise<MXFMetadata>
  findProxy: (mxfPath: string) => Promise<ProxyFile>
  generateProxy: (mxfPath: string, quality: string) => Promise<string>
  onProxyProgress: (callback: (percent: number) => void) => () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>
  exportFrame: (filepath: string, time: number) => Promise<void>
  exportClip: (filepath: string, startTime: number, endTime: number) => Promise<void>
  getExternalDrives: () => Promise<ExternalDrive[]>
  getMXFFileInfo: (filepath: string) => Promise<MXFFileInfo>
  onDriveMounted: (callback: (drive: ExternalDrive) => void) => () => void
  onDriveUnmounted: (callback: (drivePath: string) => void) => () => void
  // Batch merge operations
  validateMerge: (clipPaths: string[]) => Promise<ClipValidationResult>
  mergeClips: (
    opts: MergeOptions
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  cancelMerge: () => Promise<{ cancelled: boolean }>
  selectMergeOutput: () => Promise<string | null>
  onMergeProgress: (callback: (percent: number) => void) => () => void
  // Transcode for playback
  startTranscodePlayback: (
    mxfPath: string
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  cancelTranscodePlayback: () => Promise<{ cancelled: boolean }>
  cleanupTranscodeFile: (tempPath: string) => Promise<void>
  onTranscodePlaybackProgress: (callback: (percent: number) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
