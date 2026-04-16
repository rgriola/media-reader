/**
 * FFmpeg integration for metadata extraction and proxy generation.
 * Uses direct child_process.spawn (via ffmpeg-spawn helper) instead of fluent-ffmpeg.
 */
import type { MXFMetadata, AudioStream, ProxyFile } from '../renderer/src/types'
import { runFfprobe, runFfmpeg, parseFramerate, type FfprobeStream } from './ffmpeg-spawn'

/**
 * Extract metadata from MXF file using FFprobe
 */
export async function extractMetadata(filepath: string): Promise<MXFMetadata> {
  try {
    const metadata = await runFfprobe(filepath)

    const videoStream = metadata.streams.find((s: FfprobeStream) => s.codec_type === 'video')
    const audioStreams = metadata.streams.filter((s: FfprobeStream) => s.codec_type === 'audio')

    if (!videoStream) {
      throw new Error('No video stream found in file')
    }

    // Parse framerate safely
    const framerate = videoStream.r_frame_rate ? parseFramerate(videoStream.r_frame_rate) : 24

    // Extract audio stream information
    const audio: AudioStream[] = audioStreams.map((stream: FfprobeStream, index: number) => ({
      index,
      codec: stream.codec_name || 'unknown',
      channels: stream.channels || 2,
      sampleRate: stream.sample_rate || 48000,
      bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
      channelLayout: stream.channel_layout
    }))

    // Get filename from path
    const filename = filepath.split('/').pop() || ''

    // Build metadata object
    const mxfMetadata: MXFMetadata = {
      filename,
      filepath,
      duration: metadata.format.duration ? parseFloat(metadata.format.duration) : 0,
      timecode: metadata.format.tags?.timecode || '00:00:00:00',
      resolution: {
        width: videoStream.width || 0,
        height: videoStream.height || 0
      },
      framerate,
      codec: videoStream.codec_name || 'unknown',
      pixelFormat: videoStream.pix_fmt,
      bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : 0,
      fileSize: metadata.format.size ? parseInt(metadata.format.size) : 0,
      createdDate: metadata.format.tags?.creation_time
        ? new Date(metadata.format.tags.creation_time)
        : undefined,
      video: {
        codec: videoStream.codec_name || 'unknown',
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        framerate,
        pixelFormat: videoStream.pix_fmt,
        bitrate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : undefined
      },
      audio,
      production: extractProductionMetadata(metadata.format.tags)
    }

    return mxfMetadata
  } catch (error) {
    console.error('Error extracting metadata:', error)
    throw new Error(`Failed to extract metadata: ${error}`)
  }
}

/**
 * Extract production metadata from tags
 */
function extractProductionMetadata(
  tags: Record<string, string> | undefined
): MXFMetadata['production'] {
  if (!tags) return undefined

  return {
    camera: tags.camera || tags.Camera,
    scene: tags.scene || tags.Scene,
    take: tags.take || tags.Take,
    director: tags.director || tags.Director,
    project: tags.project || tags.Project
  }
}

/**
 * Find proxy file for given MXF file
 */
export async function findProxyFile(
  mxfPath: string,
  convention: 'suffix' | 'folder' = 'suffix'
): Promise<ProxyFile> {
  const fs = await import('fs/promises')
  const path = await import('path')
  const { detectCameraCardType, buildFilePath } = await import('./camera-cards.config')

  const basename = path.basename(mxfPath, path.extname(mxfPath))

  // Try to detect camera card type from the path
  let cameraConfig: Awaited<ReturnType<typeof detectCameraCardType>> = null

  // Extract volume path (everything before /XDROOT/ or similar)
  const volumeMatch = mxfPath.match(/^(.+?)\/[^/]+\/[^/]+\/[^/]+$/)
  if (volumeMatch) {
    const volumePath = volumeMatch[1]
    try {
      const rootContents = await fs.readdir(volumePath)
      cameraConfig = detectCameraCardType(rootContents)
    } catch (error) {
      console.error('Error detecting camera card:', error)
    }
  }

  const possiblePaths: string[] = []

  // If we detected a camera config, use it
  if (cameraConfig) {
    const volumePath = mxfPath.split(cameraConfig.paths.clipDir)[0]
    const configPaths = buildFilePath(volumePath, cameraConfig, basename, 'proxy')
    possiblePaths.push(...configPaths)
    console.log('Using camera config for proxy detection:', cameraConfig.name)
    console.log('Checking proxy paths:', configPaths)
  } else {
    // Fallback to generic naming conventions
    const dir = path.dirname(mxfPath)

    if (convention === 'suffix') {
      possiblePaths.push(
        path.join(dir, `${basename}_proxy.mp4`),
        path.join(dir, `${basename}_proxy.mov`),
        path.join(dir, `${basename}.mp4`)
      )
    } else {
      possiblePaths.push(
        path.join(dir, 'proxies', `${basename}.mp4`),
        path.join(dir, 'proxies', `${basename}.mov`),
        path.join(dir, 'Proxies', `${basename}.mp4`)
      )
    }
    console.log('Using generic proxy detection, checking paths:', possiblePaths)
  }

  // Check each possible path
  for (const proxyPath of possiblePaths) {
    try {
      await fs.access(proxyPath)

      console.log('Found proxy file:', proxyPath)

      // File exists, get its metadata
      const metadata = await runFfprobe(proxyPath)
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')

      return {
        exists: true,
        path: proxyPath,
        format: path.extname(proxyPath).slice(1),
        resolution: videoStream
          ? {
              width: videoStream.width || 0,
              height: videoStream.height || 0
            }
          : undefined
      }
    } catch {
      // File doesn't exist, continue
      continue
    }
  }

  console.log('No proxy file found for', basename)

  // No proxy found
  return { exists: false }
}

/**
 * Default timeout for FFmpeg operations (30 minutes)
 */
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Transcode an MXF (or any unsupported format) to a temp MP4 for in-app playback.
 * Uses fast preset + CRF 23 — speed over quality since this is a preview only.
 * Returns a cancellable handle; caller is responsible for deleting tempOutputPath when done.
 */
export function transcodeForPlayback(
  inputPath: string,
  tempOutputPath: string,
  onProgress?: (percent: number) => void,
  timeoutMs: number = FFMPEG_TIMEOUT_MS
): { promise: Promise<string>; cancel: () => void } {
  let innerCancel: (() => void) | null = null
  let cancelled = false

  const promise = (async (): Promise<string> => {
    // Probe duration first so progress reporting is accurate
    let totalDuration = 0
    try {
      const probe = await runFfprobe(inputPath)
      totalDuration = probe.format.duration ? parseFloat(probe.format.duration) : 0
    } catch {
      // proceed without progress accuracy
    }

    if (cancelled) throw new Error('Transcode cancelled')

    const args = [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast', // prioritise speed for live preview
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-map',
      '0:v',
      '-map',
      '0:a', // carry all audio streams
      '-movflags',
      '+faststart',
      '-y',
      tempOutputPath
    ]

    const handle = runFfmpeg(args, { timeoutMs, onProgress, totalDuration })
    innerCancel = handle.kill
    await handle.promise
    return tempOutputPath
  })()

  const cancel = (): void => {
    cancelled = true
    innerCancel?.()
  }

  return { promise, cancel }
}

export async function generateProxy(
  mxfPath: string,
  outputPath: string,
  quality: '720p' | '1080p' | '2160p' = '1080p',
  onProgress?: (percent: number) => void,
  timeoutMs: number = FFMPEG_TIMEOUT_MS
): Promise<string> {
  const resolutions = {
    '720p': '1280:720',
    '1080p': '1920:1080',
    '2160p': '3840:2160'
  }

  // Get duration for progress calculation
  let totalDuration = 0
  try {
    const probe = await runFfprobe(mxfPath)
    totalDuration = probe.format.duration ? parseFloat(probe.format.duration) : 0
  } catch {
    // proceed without progress reporting
  }

  const args = [
    '-i',
    mxfPath,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-vf',
    `scale=${resolutions[quality]}:force_original_aspect_ratio=decrease`,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath
  ]

  const handle = runFfmpeg(args, { timeoutMs, onProgress, totalDuration })
  await handle.promise
  return outputPath
}

/**
 * Export a single frame as image
 */
export async function exportFrame(
  filepath: string,
  time: number,
  outputPath: string
): Promise<void> {
  const args = ['-ss', time.toString(), '-i', filepath, '-frames:v', '1', '-y', outputPath]

  const handle = runFfmpeg(args, { timeoutMs: 2 * 60 * 1000 })
  await handle.promise
}

/**
 * Export a clip segment
 */
export async function exportClip(
  filepath: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  timeoutMs: number = FFMPEG_TIMEOUT_MS
): Promise<void> {
  const duration = endTime - startTime

  const args = [
    '-ss',
    startTime.toString(),
    '-i',
    filepath,
    '-t',
    duration.toString(),
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
    '-y',
    outputPath
  ]

  const handle = runFfmpeg(args, { timeoutMs, totalDuration: duration })
  await handle.promise
}
