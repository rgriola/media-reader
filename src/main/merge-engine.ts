/**
 * FFmpeg Batch Merge Engine
 *
 * Merges multiple MXF/video clips from a camera card into a single contiguous file.
 * Supports lossless concat (identical codecs) and re-encode fallback (mixed formats).
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import { runFfprobe, runFfmpeg, parseFramerate, type FfprobeStream } from './ffmpeg-spawn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface MergeOptions {
  clipPaths: string[]
  outputPath: string
  mode: 'lossless' | 'reencode'
  preset?: MergePreset
}

export interface MergeResult {
  success: boolean
  outputPath?: string
  duration?: number
  fileSize?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Probe a single clip and return its technical details.
 */
async function probeClip(clipPath: string): Promise<ClipInfo> {
  const metadata = await runFfprobe(clipPath)

  const videoStream = metadata.streams.find((s: FfprobeStream) => s.codec_type === 'video')
  // Use ALL audio streams — MXF files often have 4 separate mono streams
  const audioStreams = metadata.streams.filter((s: FfprobeStream) => s.codec_type === 'audio')
  const primaryAudio = audioStreams[0]

  if (!videoStream) {
    throw new Error(`No video stream found in ${path.basename(clipPath)}`)
  }

  const framerate = videoStream.r_frame_rate ? parseFramerate(videoStream.r_frame_rate) : 0

  const stat = fs.statSync(clipPath)

  // Sum channels across all audio streams (e.g. 4 mono streams = 4 total channels)
  const totalAudioChannels = audioStreams.reduce((sum, s) => sum + (s.channels || 1), 0)

  return {
    path: clipPath,
    filename: path.basename(clipPath),
    codec: videoStream.codec_name || 'unknown',
    resolution: {
      width: videoStream.width || 0,
      height: videoStream.height || 0
    },
    framerate,
    duration: metadata.format.duration ? parseFloat(metadata.format.duration) : 0,
    audioCodec: primaryAudio?.codec_name || 'none',
    audioChannels: totalAudioChannels,
    sampleRate: primaryAudio?.sample_rate || 0,
    fileSize: stat.size
  }
}

/**
 * Validate whether an array of clips can be losslessly concatenated.
 * All clips must share the same video codec, resolution, framerate,
 * audio codec, channel count, and sample rate.
 */
export async function validateClipsForConcat(clipPaths: string[]): Promise<MergeValidation> {
  if (clipPaths.length === 0) {
    return {
      compatible: false,
      clips: [],
      mismatches: ['No clips provided'],
      totalDuration: 0,
      totalSize: 0
    }
  }

  const clips: ClipInfo[] = []
  const errors: string[] = []

  for (const clipPath of clipPaths) {
    try {
      clips.push(await probeClip(clipPath))
    } catch (err) {
      errors.push(`Failed to probe ${path.basename(clipPath)}: ${err}`)
    }
  }

  if (clips.length === 0) {
    return { compatible: false, clips: [], mismatches: errors, totalDuration: 0, totalSize: 0 }
  }

  // Compare every clip against the first clip
  const ref = clips[0]
  const mismatches: string[] = [...errors]

  for (let i = 1; i < clips.length; i++) {
    const clip = clips[i]

    if (clip.codec !== ref.codec) {
      mismatches.push(`${clip.filename}: video codec "${clip.codec}" differs from "${ref.codec}"`)
    }
    if (
      clip.resolution.width !== ref.resolution.width ||
      clip.resolution.height !== ref.resolution.height
    ) {
      mismatches.push(
        `${clip.filename}: resolution ${clip.resolution.width}x${clip.resolution.height} differs from ${ref.resolution.width}x${ref.resolution.height}`
      )
    }
    // Compare framerate with a small tolerance (e.g., 29.97 vs 30.00 would differ)
    if (Math.abs(clip.framerate - ref.framerate) > 0.05) {
      mismatches.push(
        `${clip.filename}: framerate ${clip.framerate.toFixed(2)} differs from ${ref.framerate.toFixed(2)}`
      )
    }
    if (clip.audioCodec !== ref.audioCodec) {
      mismatches.push(
        `${clip.filename}: audio codec "${clip.audioCodec}" differs from "${ref.audioCodec}"`
      )
    }
    if (clip.sampleRate !== ref.sampleRate) {
      mismatches.push(
        `${clip.filename}: sample rate ${clip.sampleRate} differs from ${ref.sampleRate}`
      )
    }
  }

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0)
  const totalSize = clips.reduce((sum, c) => sum + c.fileSize, 0)

  return {
    compatible: mismatches.length === 0,
    clips,
    mismatches,
    totalDuration,
    totalSize
  }
}

/**
 * Write a concat demuxer file list to a temp directory.
 * Returns the absolute path to the file list.
 */
export async function buildConcatFileList(clipPaths: string[]): Promise<string> {
  const tmpDir = app.getPath('temp')
  const listPath = path.join(tmpDir, `merge-filelist-${Date.now()}.txt`)

  const lines = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
  await fsp.writeFile(listPath, lines.join('\n'), 'utf-8')

  return listPath
}

/**
 * Merge clips losslessly using the FFmpeg concat demuxer (-c copy).
 * All clips must have identical codec parameters.
 */
export function mergeClipsLossless(
  filelistPath: string,
  outputPath: string,
  totalDuration: number,
  onProgress?: (percent: number) => void,
  timeoutMs: number = 60 * 60 * 1000, // 1 hour default
  audioStreamCount?: number // if set, map only this many audio streams (0-indexed)
): { promise: Promise<MergeResult>; cancel: () => void } {
  // -map 0:v — all video; audio mapped per-stream to honour channel selection
  const args = ['-f', 'concat', '-safe', '0', '-i', filelistPath, '-map', '0:v']

  if (audioStreamCount && audioStreamCount > 0) {
    // Explicit per-stream maps: -map 0:a:0 -map 0:a:1 ... up to audioStreamCount-1
    for (let i = 0; i < audioStreamCount; i++) {
      args.push('-map', `0:a:${i}`)
    }
  } else {
    // Fallback: copy all audio streams
    args.push('-map', '0:a')
  }

  args.push('-c', 'copy', '-y', outputPath)

  const handle = runFfmpeg(args, { timeoutMs, onProgress, totalDuration })

  const promise = handle.promise
    .then(async () => {
      try {
        await fsp.unlink(filelistPath)
      } catch {
        /* ignore */
      }
      try {
        const stat = fs.statSync(outputPath)
        return { success: true, outputPath, fileSize: stat.size } as MergeResult
      } catch {
        return { success: true, outputPath } as MergeResult
      }
    })
    .catch(async (err: Error) => {
      try {
        await fsp.unlink(filelistPath)
      } catch {
        /* ignore */
      }
      return { success: false, error: err.message } as MergeResult
    })

  return { promise, cancel: handle.kill }
}

/**
 * Merge clips with re-encoding using the concat filter.
 * Used when clips have different codecs, resolutions, or framerates.
 */
export function mergeClipsReencode(
  clipPaths: string[],
  outputPath: string,
  preset: MergePreset = 'h264-high',
  totalDuration: number,
  onProgress?: (percent: number) => void,
  timeoutMs: number = 2 * 60 * 60 * 1000, // 2 hours for re-encode
  audioStreamCount: number = 1 // number of audio streams per clip (e.g. 4 for 4-ch MXF)
): { promise: Promise<MergeResult>; cancel: () => void } {
  const n = clipPaths.length

  // Build filter_complex that maps ALL audio streams from every clip.
  // For a 4-stream MXF: [0:v:0][0:a:0][0:a:1][0:a:2][0:a:3][1:v:0][1:a:0]...
  // Then concat with a=audioStreamCount, producing [outv][outa0][outa1]...
  const audioInputsPerClip = (i: number): string =>
    Array.from({ length: audioStreamCount }, (_, ch) => `[${i}:a:${ch}]`).join('')

  const filterInputs = clipPaths.map((_, i) => `[${i}:v:0]${audioInputsPerClip(i)}`).join('')
  // prettier-ignore
  const audioOutputLabels = Array.from({ length: audioStreamCount }, (_, ch) => `[outa${ch}]`).join('')
  const filterComplex = `${filterInputs}concat=n=${n}:v=1:a=${audioStreamCount}[outv]${audioOutputLabels}`

  const presetOpts = getPresetOutputOptions(preset)

  const args: string[] = []
  for (const clipPath of clipPaths) {
    args.push('-i', clipPath)
  }

  // Map video output
  args.push('-filter_complex', filterComplex, ...presetOpts, '-map', '[outv]')

  // Map each audio output stream
  for (let ch = 0; ch < audioStreamCount; ch++) {
    args.push('-map', `[outa${ch}]`)
  }

  args.push('-y', outputPath)

  const handle = runFfmpeg(args, { timeoutMs, onProgress, totalDuration })

  const promise = handle.promise
    .then(() => {
      try {
        const stat = fs.statSync(outputPath)
        return { success: true, outputPath, fileSize: stat.size } as MergeResult
      } catch {
        return { success: true, outputPath } as MergeResult
      }
    })
    .catch((err: Error) => {
      return { success: false, error: err.message } as MergeResult
    })

  return { promise, cancel: handle.kill }
}

/**
 * Return FFmpeg output options for a given preset.
 */
function getPresetOutputOptions(preset: MergePreset): string[] {
  switch (preset) {
    case 'prores-422':
      return ['-c:v', 'prores_ks', '-profile:v', '2', '-c:a', 'pcm_s16le']
    case 'h264-high':
      return [
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart'
      ]
    case 'dnxhd':
      return ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-c:a', 'pcm_s16le']
    case 'match-source':
    default:
      // Re-encode with same codec family but standardized params
      return [
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '16',
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        '-movflags',
        '+faststart'
      ]
  }
}

/**
 * Detect and sort clips from a camera card or directory.
 * Uses the existing camera-card detection, then sorts by filename.
 */
export async function detectAndSortClips(dirPath: string): Promise<string[]> {
  const { detectCameraCardType } = await import('./camera-cards.config')

  // Try camera card detection first
  try {
    const contents = await fsp.readdir(dirPath)
    const visibleContents = contents.filter((item) => !item.startsWith('.'))
    const cardConfig = detectCameraCardType(visibleContents)

    if (cardConfig) {
      // Scan the card's clip directory
      const clipDir = path.join(dirPath, cardConfig.paths.clipDir)
      const files = await fsp.readdir(clipDir)
      const mxfFiles = files
        .filter(
          (f) => !f.startsWith('.') && !f.startsWith('._') && f.toLowerCase().endsWith('.mxf')
        )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f) => path.join(clipDir, f))

      return mxfFiles
    }
  } catch {
    // Not a camera card or can't read; fall through to generic scan
  }

  // Generic scan: look for video files directly in the directory
  const videoExtensions = ['.mxf', '.mp4', '.mov']
  try {
    const files = await fsp.readdir(dirPath)
    return files
      .filter((f) => {
        const ext = path.extname(f).toLowerCase()
        return !f.startsWith('.') && !f.startsWith('._') && videoExtensions.includes(ext)
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => path.join(dirPath, f))
  } catch {
    return []
  }
}
