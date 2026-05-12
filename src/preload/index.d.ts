import type {
  AppSettings,
  FileLoadResult,
  MXFMetadata,
  ProxyFile,
  ExternalDrive,
  VideoFileInfo,
  ClipValidationResult,
  MergeOptions,
  PhotoMetadata
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
  getVersions: () => { electron: string; chrome: string; node: string }
  exportFrame: (filepath: string, time: number) => Promise<void>
  exportClip: (filepath: string, startTime: number, endTime: number) => Promise<void>
  getExternalDrives: () => Promise<ExternalDrive[]>
  getMXFFileInfo: (filepath: string) => Promise<VideoFileInfo>
  onDriveMounted: (callback: (drive: ExternalDrive) => void) => () => void
  onDriveUnmounted: (callback: (drivePath: string) => void) => () => void
  // Batch merge operations
  validateMerge: (clipPaths: string[]) => Promise<ClipValidationResult>
  mergeClips: (
    opts: MergeOptions
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  cancelMerge: () => Promise<{ cancelled: boolean }>
  selectMergeOutput: (sampleClipPath?: string) => Promise<string | null>
  onMergeProgress: (callback: (percent: number) => void) => () => void
  // Transcode for playback
  startTranscodePlayback: (
    mxfPath: string
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  cancelTranscodePlayback: () => Promise<{ cancelled: boolean }>
  cleanupTranscodeFile: (tempPath: string) => Promise<void>
  onTranscodePlaybackProgress: (callback: (percent: number) => void) => () => void
  // Rip MXF to MP4
  selectRipOutput: () => Promise<string | null>
  ripClips: (
    clipPaths: string[],
    outputDir: string,
    quality: string
  ) => Promise<{ success: boolean; outputPaths?: string[]; error?: string }>
  cancelRip: () => Promise<{ cancelled: boolean }>
  onRipProgress: (
    callback: (percent: number, currentClip: number, totalClips: number) => void
  ) => () => void
  // RAW preview extraction
  extractRawPreview: (
    rawPath: string
  ) => Promise<{ success: boolean; previewPath?: string; error?: string }>
  // Backward-compatible alias
  extractArwPreview: (
    arwPath: string
  ) => Promise<{ success: boolean; previewPath?: string; error?: string }>
  // Photo metadata
  getPhotoMetadata: (
    filePath: string
  ) => Promise<{ success: boolean; metadata?: PhotoMetadata; error?: string }>
  // Drive management
  ejectDrive: (drivePath: string) => Promise<{ success: boolean; error?: string }>
  // Scan progress
  onScanProgress: (callback: (msg: string) => void) => () => void
}

declare global {
  interface Window {
    api: CustomAPI
  }
}
