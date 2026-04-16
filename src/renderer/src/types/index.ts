/**
 * MXF Media Reader Type Definitions
 */

export interface MXFMetadata {
  filename: string
  filepath: string
  duration: number // in seconds
  timecode: string // SMPTE format (HH:MM:SS:FF)
  resolution: {
    width: number
    height: number
  }
  framerate: number
  codec: string
  pixelFormat?: string
  bitrate: number
  fileSize: number // in bytes
  createdDate?: Date

  // Video stream info
  video: {
    codec: string
    width: number
    height: number
    framerate: number
    pixelFormat?: string
    bitrate?: number
  }

  // Audio streams
  audio: AudioStream[]

  // Production metadata (if available)
  production?: {
    camera?: string
    scene?: string
    take?: string
    director?: string
    project?: string
  }
}

export interface AudioStream {
  index: number
  codec: string
  channels: number
  sampleRate: number
  bitrate?: number
  channelLayout?: string
}

export interface ProxyFile {
  exists: boolean
  path?: string
  format?: string // 'mp4', 'mov', etc.
  resolution?: {
    width: number
    height: number
  }
}

export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
  isMuted: boolean
  isFullscreen: boolean
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  color?: string
  note?: string
}

export interface AppSettings {
  theme: 'dark' | 'light'
  defaultProxyQuality: '720p' | '1080p' | '2160p'
  autoDetectProxy: boolean
  proxyNamingConvention: 'suffix' | 'folder'
  keyboardShortcuts: Record<string, string>
  recentFiles: string[]
  maxRecentFiles: number
}

export interface FileLoadResult {
  success: boolean
  metadata?: MXFMetadata
  proxy?: ProxyFile
  error?: string
}

// Batch Merge Types
export interface ClipInfo {
  path: string
  filename: string
  codec: string
  resolution: { width: number; height: number }
  framerate: number
  duration: number
  audioCodec: string
  audioChannels: number
  sampleRate: number
  fileSize: number
}

export interface MergeValidation {
  compatible: boolean
  clips: ClipInfo[]
  mismatches: string[]
  totalDuration: number
  totalSize: number
}

export type MergePreset = 'match-source' | 'prores-422' | 'h264-high' | 'dnxhd'

export interface XMLMetadata {
  startTimecode?: string
  duration?: string
  frameRate?: string
  dropFrame?: boolean
  creationDate?: string
  videoCodec?: string
  resolution?: string
  aspectRatio?: string
  rawXML?: Record<string, unknown>
  xmlFilePath?: string
}

export interface MXFFileInfo {
  path: string
  name: string
  thumbnail?: string
  proxy?: string
  metadata?: XMLMetadata
}

export interface ExternalDrive {
  name: string
  path: string
  isSonyCard: boolean
  isNetworkDrive: boolean
  mxfFiles: MXFFileInfo[]
  totalSize: number
  fileCount: number
}

/** Controls how many audio streams are included in the merged output.
 *  'ch1-4' — channels 1–4 only (streams 0–3, typical broadcast camera)
 *  'ch1-8' — all channels 1–8 (streams 0–7, include empty tracks if present)
 */
export type AudioChannelMode = 'ch1-4' | 'ch1-8'

export interface MergeOptions {
  clipPaths: string[]
  outputPath: string
  mode: 'lossless' | 'reencode'
  preset?: MergePreset
  /** How many audio streams to pass through. Defaults to 'ch1-4'. */
  audioChannelMode?: AudioChannelMode
}

export interface MergeResult {
  success: boolean
  outputPath?: string
  duration?: number
  fileSize?: number
  error?: string
}

// IPC Communication Types
export interface ElectronAPI {
  // File operations
  selectFile: () => Promise<string | null>
  loadFile: (filepath: string) => Promise<FileLoadResult>

  // Metadata operations
  extractMetadata: (filepath: string) => Promise<MXFMetadata>

  // Proxy operations
  findProxy: (mxfPath: string) => Promise<ProxyFile>
  generateProxy: (mxfPath: string, quality: string) => Promise<string>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>

  // Export operations
  exportFrame: (filepath: string, time: number, outputPath: string) => Promise<void>
  exportClip: (
    filepath: string,
    startTime: number,
    endTime: number,
    outputPath: string
  ) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
