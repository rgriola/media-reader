/**
 * Shared timecode utilities used by both main and renderer processes.
 * Pure functions only — no Node.js or DOM dependencies.
 *
 * IMPORTANT: SMPTE timecode arithmetic uses the ROUNDED frame rate (30, 24, 60)
 * for all division/modulo. The fractional rate (29.97, 23.976) only affects
 * drop-frame compensation. All functions here use Math.round(framerate) consistently
 * to prevent cumulative drift at high timecode values.
 */

/**
 * Pad number with leading zero
 */
function pad(num: number): string {
  return num.toString().padStart(2, '0')
}

/**
 * Check if a framerate is a drop-frame rate (29.97 or 59.94)
 */
export function isDropFrameRate(framerate: number): boolean {
  return Math.abs(framerate - 29.97) < 0.1 || Math.abs(framerate - 59.94) < 0.1
}

/**
 * Convert a frame count to SMPTE timecode format (HH:MM:SS:FF)
 * Handles drop-frame for 29.97 and 59.94 fps.
 */
export function framesToTimecode(
  totalFrames: number,
  framerate: number,
  dropFrame: boolean = false
): string {
  if (isNaN(totalFrames) || totalFrames < 0) return '00:00:00:00'

  const roundedFps = Math.round(framerate)
  let frames = totalFrames

  // Drop-frame compensation for 29.97 and 59.94 fps
  if (dropFrame && isDropFrameRate(framerate)) {
    const dropCount = roundedFps === 30 ? 2 : 4 // 2 for 29.97, 4 for 59.94
    const framesPerMin = roundedFps * 60 - dropCount
    const framesPer10Min = framesPerMin * 10 + dropCount

    const d = Math.floor(frames / framesPer10Min)
    const m = frames % framesPer10Min

    frames =
      frames +
      dropCount * 18 * d +
      dropCount * Math.max(0, Math.floor((m - dropCount) / framesPerMin))
  }

  const ff = frames % roundedFps
  const ss = Math.floor(frames / roundedFps) % 60
  const mm = Math.floor(frames / (roundedFps * 60)) % 60
  const hh = Math.floor(frames / (roundedFps * 60 * 60))

  const separator = dropFrame ? ';' : ':'
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${pad(ff)}`
}

/**
 * Convert seconds to SMPTE timecode format (HH:MM:SS:FF)
 *
 * Uses the ROUNDED frame rate for the seconds-to-frames multiplication
 * so the result is consistent with framesToTimecode's division.
 * This prevents cumulative drift at high timecode values.
 */
export function secondsToTimecode(
  seconds: number,
  framerate: number = 24,
  dropFrame: boolean = false
): string {
  const roundedFps = Math.round(framerate)
  const totalFrames = Math.round(seconds * roundedFps)
  return framesToTimecode(totalFrames, framerate, dropFrame)
}

/**
 * Convert SMPTE timecode string to a frame count.
 * This is the exact inverse of framesToTimecode — no floating-point drift.
 * Supports both : and ; separators (drop-frame uses ;).
 */
export function timecodeToFrames(timecode: string, framerate: number = 24): number {
  const parts = timecode.split(/[:;]/).map(Number)
  if (parts.length !== 4) {
    throw new Error('Invalid timecode format. Expected HH:MM:SS:FF')
  }

  const [hours, minutes, seconds, frames] = parts
  const roundedFps = Math.round(framerate)
  return hours * roundedFps * 60 * 60 + minutes * roundedFps * 60 + seconds * roundedFps + frames
}

/**
 * Convert SMPTE timecode to seconds.
 * Uses rounded fps for the frame-to-seconds conversion to stay consistent
 * with the rest of the timecode arithmetic.
 * Supports both : and ; separators (drop-frame uses ;).
 */
export function timecodeToSeconds(timecode: string, framerate: number = 24): number {
  const frames = timecodeToFrames(timecode, framerate)
  const roundedFps = Math.round(framerate)
  return frames / roundedFps
}
