/**
 * Utility functions for timecode conversion and formatting
 */

// Re-export timecode utilities from shared module (single source of truth)
export {
  secondsToTimecode,
  timecodeToSeconds,
  framesToTimecode,
  isDropFrameRate
} from '../../../shared/timecode'

/**
 * Format file size in human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * Format duration in human-readable format
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "1h 23m 45s")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

/**
 * Format bitrate in human-readable format
 * @param bps - Bitrate in bits per second
 * @returns Formatted string (e.g., "50 Mbps")
 */
export function formatBitrate(bps: number): string {
  const mbps = bps / 1_000_000
  if (mbps >= 1) {
    return `${mbps.toFixed(2)} Mbps`
  }
  const kbps = bps / 1_000
  return `${kbps.toFixed(2)} Kbps`
}

/**
 * Get file extension from path
 */
export function getFileExtension(filepath: string): string {
  return filepath.split('.').pop()?.toLowerCase() || ''
}

/**
 * Get filename without extension
 */
export function getFilenameWithoutExtension(filepath: string): string {
  const filename = filepath.split('/').pop() || ''
  return filename.replace(/\.[^/.]+$/, '')
}

/**
 * Check if file is a video file
 */
export function isVideoFile(filepath: string): boolean {
  const videoExtensions = ['mxf', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'mpg', 'mpeg']
  const ext = getFileExtension(filepath)
  return videoExtensions.includes(ext)
}

/**
 * Generate proxy filename based on naming convention
 */
export function getProxyFilename(
  mxfPath: string,
  convention: 'suffix' | 'folder' = 'suffix'
): string {
  const dir = mxfPath.substring(0, mxfPath.lastIndexOf('/'))
  const filename = getFilenameWithoutExtension(mxfPath)

  if (convention === 'suffix') {
    return `${dir}/${filename}_proxy.mp4`
  } else {
    return `${dir}/proxies/${filename}.mp4`
  }
}

/**
 * Parse framerate from string (e.g., "24000/1001" -> 23.976)
 */
export function parseFramerate(framerateStr: string | number): number {
  if (typeof framerateStr === 'number') {
    return framerateStr
  }

  if (framerateStr.includes('/')) {
    const [num, den] = framerateStr.split('/').map(Number)
    return num / den
  }

  return parseFloat(framerateStr)
}
