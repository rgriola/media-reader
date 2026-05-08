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

/**
 * A still photo found in the DCIM folder of a mirrorless camera card.
 * ARW is Sony RAW; JPG is a companion JPEG (shot in RAW+JPEG mode) or standalone.
 */
export interface PhotoFile {
  path: string // absolute path to the primary file (ARW or standalone JPG)
  name: string // filename (e.g. "_DSC6072.ARW")
  size: number // bytes
  extension: string // uppercase: 'ARW', 'JPG', 'JPEG'
  jpgCompanion?: string // path to matching .JPG if camera shot RAW+JPEG
  extractedPreview?: string // path to FFmpeg-extracted preview (populated on demand)
}

/**
 * Structured EXIF/image metadata extracted via exifreader from a still photo.
 * Fields are optional — EXIF coverage varies by file type and camera.
 */
export interface PhotoMetadata {
  // Camera
  make?: string // e.g. "SONY"
  model?: string // e.g. "ILCE-7SM3"
  lens?: string // e.g. "FE 50mm F1.8"
  // Exposure
  exposureTime?: string // e.g. "1/125"
  fNumber?: string // e.g. "f/2.2"
  iso?: string // e.g. "100"
  focalLength?: string // e.g. "50 mm"
  focalLengthIn35mm?: string // e.g. "50mm"
  exposureMode?: string
  meteringMode?: string // e.g. "Spot"
  whiteBalance?: string
  // Image
  width?: number
  height?: number
  colorSpace?: string
  // Time
  dateTimeOriginal?: string // e.g. "2026:05:05 14:16:34"
  // GPS (if available)
  gpsLatitude?: string
  gpsLongitude?: string
}

export interface MXFFileInfo {
  path: string
  name: string
  size?: number // bytes — 0 means empty/corrupt recording
  thumbnail?: string
  proxy?: string
  metadata?: XMLMetadata
  // From MEDIAPRO.XML (available immediately on card mount, no per-file I/O needed)
  durationFrames?: number // raw frame count from @dur attribute
  fps?: string // e.g. "29.97p" from @fps attribute
  audioChannels?: number // e.g. 8 from @ch attribute
  videoType?: string // e.g. "AVC100CBG_1920_1080_H422IP@L41"
  audioType?: string // e.g. "LPCM24"
  umid?: string // clip UMID — future use for multi-cam sync
}

/**
 * Card integrity report — derived by comparing MEDIAPRO.XML index against files on disk.
 * A mismatch typically means the card has been partially copied.
 */
export interface CardIntegrity {
  totalExpected: number // clips listed in MEDIAPRO.XML
  missingMxf: string[] // basenames listed in MEDIAPRO but not found on disk
  missingProxy: string[] // basenames whose proxy file is listed but missing
  missingThumbnail: string[] // basenames whose thumbnail is listed but missing
}

export interface ExternalDrive {
  name: string
  path: string
  isSonyCard: boolean
  isNetworkDrive: boolean
  mxfFiles: MXFFileInfo[]
  totalSize: number
  fileCount: number
  // From MEDIAPRO.XML Properties block
  cameraModel?: string // e.g. "ILME-FX6V ver.6.000" or "ILCE-7SM3"
  cardId?: string // ProavId UUID from MEDIAPRO / DISCMETA
  // Set to true when MEDIAPRO.XML was absent — filesystem fallback was used instead
  mediaProMissing?: boolean
  // Populated only when parsed from MEDIAPRO.XML (undefined in fallback mode)
  cardIntegrity?: CardIntegrity
  // Which Sony root structure was found on this card
  cardFormat?: 'xdcam' | 'm4root'
  // Still photos from DCIM/ — only present on mirrorless cards (m4root)
  photos?: PhotoFile[]
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
