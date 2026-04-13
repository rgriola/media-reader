/**
 * Low-level FFmpeg/FFprobe spawn helpers.
 * Replaces fluent-ffmpeg with typed child_process.spawn calls.
 */
import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
// @ts-ignore - ffprobe-installer doesn't have types
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FfprobeStream {
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  pix_fmt?: string
  bit_rate?: string
  channels?: number
  sample_rate?: number
  channel_layout?: string
}

export interface FfprobeData {
  streams: FfprobeStream[]
  format: {
    duration?: string
    bit_rate?: string
    size?: string
    tags?: Record<string, string>
  }
}

export interface FfmpegRunOptions {
  timeoutMs?: number
  onProgress?: (percent: number) => void
  totalDuration?: number
}

export interface FfmpegHandle {
  promise: Promise<void>
  kill: () => void
}

// ---------------------------------------------------------------------------
// Binary path resolution
// ---------------------------------------------------------------------------

let _ffprobePath: string | null = null

export function getFfprobePath(): string {
  if (_ffprobePath) return _ffprobePath

  if (app.isPackaged) {
    const resourcePath = process.resourcesPath
    const possiblePaths = [
      path.join(
        resourcePath,
        'app.asar.unpacked',
        'node_modules',
        '@ffprobe-installer',
        'darwin-arm64',
        'ffprobe'
      ),
      path.join(
        resourcePath,
        'app.asar.unpacked',
        'node_modules',
        '@ffprobe-installer',
        'darwin-x64',
        'ffprobe'
      ),
      ffprobeInstaller.path
    ]
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        _ffprobePath = p
        console.log('Found ffprobe at:', p)
        return p
      }
    }
    console.error('Could not find ffprobe binary. Tried:', possiblePaths)
    _ffprobePath = ffprobeInstaller.path
    return _ffprobePath
  }

  _ffprobePath = ffprobeInstaller.path
  return _ffprobePath
}

let _ffmpegPath: string | null = null

export function getFfmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath

  const possiblePaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      _ffmpegPath = p
      return p
    }
  }
  _ffmpegPath = 'ffmpeg'
  return _ffmpegPath
}

// ---------------------------------------------------------------------------
// Framerate parsing
// ---------------------------------------------------------------------------

export function parseFramerate(framerateStr: string): number {
  if (framerateStr.includes('/')) {
    const [num, den] = framerateStr.split('/').map(Number)
    return num / den
  }
  return parseFloat(framerateStr)
}

// ---------------------------------------------------------------------------
// FFprobe
// ---------------------------------------------------------------------------

export function runFfprobe(filepath: string): Promise<FfprobeData> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfprobePath(), [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filepath
    ])

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`))
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`))
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeData)
      } catch {
        reject(new Error('Failed to parse ffprobe JSON output'))
      }
    })
  })
}

// ---------------------------------------------------------------------------
// FFmpeg
// ---------------------------------------------------------------------------

/**
 * Parse a timemark string like "00:05:23.45" into seconds.
 */
function parseTimemark(timemark: string): number {
  const match = timemark.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return 0
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
}

/**
 * Spawn an FFmpeg process with the given arguments.
 * Returns a handle with a promise and a kill function.
 */
export function runFfmpeg(args: string[], opts: FfmpegRunOptions = {}): FfmpegHandle {
  const { timeoutMs, onProgress, totalDuration } = opts
  let proc: ChildProcess | null = null
  let timer: NodeJS.Timeout | null = null
  let killed = false

  const promise = new Promise<void>((resolve, reject) => {
    proc = spawn(getFfmpegPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''

    proc.stderr?.on('data', (d: Buffer) => {
      const chunk = d.toString()
      stderr += chunk

      // Parse progress from stderr: "time=00:01:23.45"
      if (onProgress && totalDuration && totalDuration > 0) {
        const timeMatch = chunk.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/)
        if (timeMatch) {
          const currentSeconds = parseTimemark(timeMatch[1])
          const percent = Math.min(99, (currentSeconds / totalDuration) * 100)
          onProgress(Math.round(percent))
        }
      }
    })

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`))
    })

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (killed) return // timeout already rejected
      if (code !== 0) {
        // Extract the last few lines of stderr for the error message
        const lines = stderr.trim().split('\n')
        const tail = lines.slice(-3).join('\n')
        return reject(new Error(`ffmpeg exited with code ${code}: ${tail}`))
      }
      resolve()
    })

    if (timeoutMs) {
      timer = setTimeout(() => {
        killed = true
        proc?.kill('SIGKILL')
        reject(new Error(`FFmpeg timed out after ${timeoutMs / 60000} minutes`))
      }, timeoutMs)
    }
  })

  const kill = (): void => {
    killed = true
    proc?.kill('SIGKILL')
    if (timer) clearTimeout(timer)
  }

  return { promise, kill }
}
