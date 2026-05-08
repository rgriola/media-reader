/**
 * IPC Handlers for communication between main and renderer processes
 */
import { ipcMain, dialog } from 'electron'
import { resolve as pathResolve } from 'path'
import os from 'os'
import path from 'path'
import { validateFilePath } from './path-utils'
import fs from 'fs'
import ElectronStoreModule from 'electron-store'

// electron-store v11 is ESM but electron-vite bundles main process as CJS.
// The default export may land on .default after interop — handle both cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ElectronStore = (ElectronStoreModule as any).default || ElectronStoreModule
import {
  extractMetadata,
  findProxyFile,
  generateProxy,
  exportFrame,
  exportClip,
  transcodeForPlayback
} from './ffmpeg'
import { getExternalDrives, getMXFFileInfo } from './drives'
import {
  validateClipsForConcat,
  buildConcatFileList,
  mergeClipsLossless,
  mergeClipsReencode
} from './merge-engine'
import type { AppSettings, FileLoadResult, MergeOptions } from '../renderer/src/types'

// Initialize electron-store with default settings
const store = new ElectronStore({
  defaults: {
    settings: {
      theme: 'dark',
      defaultProxyQuality: '1080p',
      autoDetectProxy: true,
      proxyNamingConvention: 'suffix',
      keyboardShortcuts: {
        playPause: 'Space',
        frameForward: 'ArrowRight',
        frameBackward: 'ArrowLeft',
        speedUp: 'L',
        slowDown: 'J',
        normalSpeed: 'K',
        fullscreen: 'F'
      },
      recentFiles: [],
      maxRecentFiles: 10
    }
  }
})

/**
 * Track active merge operation for cancellation support
 */
let activeMergeCancel: (() => void) | null = null
let activeTranscodeCancel: (() => void) | null = null

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  // File selection
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mxf', 'mp4', 'mov', 'avi', 'mkv'] },
        { name: 'MXF Files', extensions: ['mxf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  // Load file (metadata + proxy detection)
  ipcMain.handle('load-file', async (_event, filepath: string): Promise<FileLoadResult> => {
    try {
      filepath = validateFilePath(filepath)
      console.log('Loading file:', filepath)

      // ── Guard: check file exists and has data before doing any FFprobe work ──
      let fileStats: { size: number }
      try {
        fileStats = fs.statSync(filepath)
      } catch {
        return {
          success: false,
          error: `File not found or inaccessible:\n${filepath}`
        }
      }

      if (fileStats.size === 0) {
        console.warn('Rejecting empty file (0 bytes):', filepath)
        return {
          success: false,
          error:
            'This file is empty (0 bytes) and cannot be played.\n\n' +
            'This usually means the recording was interrupted before any data was written — ' +
            'the file was created on the card but no video data was saved to it.\n\n' +
            `File: ${filepath.split('/').pop()}`
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      // Find proxy file first
      const settings = store.get('settings') as AppSettings
      const convention = settings.proxyNamingConvention
      const proxy = await findProxyFile(filepath, convention)

      console.log('Proxy detection result:', proxy)

      // Extract metadata from proxy if available, otherwise from original file
      // This ensures audio channel counts match the playable file
      const metadataSource = proxy?.exists && proxy.path ? proxy.path : filepath
      console.log('Extracting metadata from:', metadataSource)
      const metadata = await extractMetadata(metadataSource)

      // Add to recent files
      addToRecentFiles(filepath)

      return {
        success: true,
        metadata,
        proxy
      }
    } catch (error) {
      console.error('Error loading file:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Extract metadata only
  ipcMain.handle('extract-metadata', async (_event, filepath: string) => {
    return await extractMetadata(validateFilePath(filepath))
  })

  // Find proxy file
  ipcMain.handle('find-proxy', async (_event, mxfPath: string) => {
    const settings = store.get('settings') as AppSettings
    const convention = settings.proxyNamingConvention
    return await findProxyFile(validateFilePath(mxfPath), convention)
  })

  // Generate proxy
  ipcMain.handle('generate-proxy', async (event, mxfPath: string, quality: string) => {
    mxfPath = validateFilePath(mxfPath)
    const path = await import('path')
    const dir = path.dirname(mxfPath)
    const basename = path.basename(mxfPath, path.extname(mxfPath))
    const outputPath = path.join(dir, `${basename}_proxy.mp4`)

    // Send progress updates
    const onProgress = (percent: number): void => {
      event.sender.send('proxy-progress', percent)
    }

    await generateProxy(mxfPath, outputPath, quality as '720p' | '1080p' | '2160p', onProgress)
    return outputPath
  })

  // Get settings
  ipcMain.handle('get-settings', async () => {
    return store.get('settings') as AppSettings
  })

  // Save settings
  ipcMain.handle('save-settings', async (_event, settings: Partial<AppSettings>) => {
    const currentSettings = store.get('settings') as AppSettings
    store.set('settings', { ...currentSettings, ...settings })
  })

  // Export frame
  ipcMain.handle('export-frame', async (_event, filepath: string, time: number) => {
    filepath = validateFilePath(filepath)
    const result = await dialog.showSaveDialog({
      defaultPath: `frame-${time.toFixed(2)}s.png`,
      filters: [
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return
    }

    await exportFrame(filepath, time, result.filePath)
  })

  // Export clip
  ipcMain.handle(
    'export-clip',
    async (_event, filepath: string, startTime: number, endTime: number) => {
      filepath = validateFilePath(filepath)
      const result = await dialog.showSaveDialog({
        defaultPath: `clip-${startTime.toFixed(2)}-${endTime.toFixed(2)}.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
      })

      if (result.canceled || !result.filePath) {
        return
      }

      await exportClip(filepath, startTime, endTime, result.filePath)
    }
  )

  // External drive management
  ipcMain.handle('get-external-drives', async () => {
    return await getExternalDrives()
  })

  ipcMain.handle('get-mxf-file-info', async (_event, filePath: string) => {
    return await getMXFFileInfo(validateFilePath(filePath))
  })

  // -----------------------------------------------------------------------
  // Batch Merge operations
  // -----------------------------------------------------------------------

  // Validate clip compatibility for merging
  ipcMain.handle('validate-merge', async (_event, clipPaths: string[]) => {
    const validated = clipPaths.map(validateFilePath)
    return await validateClipsForConcat(validated)
  })

  // Merge clips
  ipcMain.handle('merge-clips', async (event, opts: MergeOptions) => {
    const validatedPaths = opts.clipPaths.map(validateFilePath)

    const onProgress = (percent: number): void => {
      event.sender.send('merge-progress', percent)
    }

    // Determine how many audio streams to include based on user's channel mode toggle.
    // 'ch1-4' = max 4 streams (indices 0–3), 'ch1-8' = max 8 streams (indices 0–7).
    // We also probe the first clip so we never request more streams than exist.
    const channelCap = opts.audioChannelMode === 'ch1-8' ? 8 : 4
    const { runFfprobe } = await import('./ffmpeg-spawn')
    let detectedStreamCount = channelCap
    if (validatedPaths.length > 0) {
      try {
        const probe = await runFfprobe(validatedPaths[0])
        const found = probe.streams.filter((s) => s.codec_type === 'audio').length
        detectedStreamCount = Math.min(found, channelCap)
      } catch {
        detectedStreamCount = channelCap
      }
    }

    if (opts.mode === 'lossless') {
      const filelistPath = await buildConcatFileList(validatedPaths)
      const validation = await validateClipsForConcat(validatedPaths)

      // Pass stream count so lossless concat maps the right number of audio streams
      const { promise, cancel } = mergeClipsLossless(
        filelistPath,
        opts.outputPath,
        validation.totalDuration,
        onProgress,
        undefined, // use default timeoutMs
        detectedStreamCount
      )

      activeMergeCancel = cancel
      const result = await promise
      activeMergeCancel = null
      return result
    } else {
      // Re-encode mode
      const validation = await validateClipsForConcat(validatedPaths)

      const { promise, cancel } = mergeClipsReencode(
        validatedPaths,
        opts.outputPath,
        opts.preset || 'h264-high',
        validation.totalDuration,
        onProgress,
        undefined, // use default timeoutMs
        detectedStreamCount
      )

      activeMergeCancel = cancel

      const result = await promise
      activeMergeCancel = null
      return result
    }
  })

  // Cancel active merge
  ipcMain.handle('cancel-merge', async () => {
    if (activeMergeCancel) {
      activeMergeCancel()
      activeMergeCancel = null
      return { cancelled: true }
    }
    return { cancelled: false }
  })

  // -----------------------------------------------------------------------
  // On-the-fly transcode for playback (MXF → temp MP4)
  // -----------------------------------------------------------------------

  ipcMain.handle('start-transcode-playback', async (event, mxfPath: string) => {
    mxfPath = validateFilePath(mxfPath)

    const path = await import('path')
    const os = await import('os')
    const basename = path.basename(mxfPath, path.extname(mxfPath))
    const tempPath = path.join(os.tmpdir(), `mxfreader-preview-${basename}-${Date.now()}.mp4`)

    const onProgress = (percent: number): void => {
      event.sender.send('transcode-playback-progress', percent)
    }

    const { promise, cancel } = transcodeForPlayback(mxfPath, tempPath, onProgress)
    activeTranscodeCancel = cancel

    try {
      const outputPath = await promise
      activeTranscodeCancel = null
      return { success: true, outputPath }
    } catch (err) {
      activeTranscodeCancel = null
      return { success: false, error: err instanceof Error ? err.message : 'Transcode failed' }
    }
  })

  ipcMain.handle('cancel-transcode-playback', async () => {
    if (activeTranscodeCancel) {
      activeTranscodeCancel()
      activeTranscodeCancel = null
      return { cancelled: true }
    }
    return { cancelled: false }
  })

  ipcMain.handle('cleanup-transcode-file', async (_event, tempPath: string): Promise<void> => {
    try {
      const resolved = pathResolve(tempPath)
      const systemTmp = os.tmpdir()
      const basename = path.basename(resolved)
      // Safety check: must be inside the system temp dir and carry our app prefix.
      // This prevents a compromised renderer from deleting arbitrary user files.
      if (!resolved.startsWith(systemTmp + path.sep) || !basename.startsWith('mxfreader-')) {
        console.error('cleanup-transcode-file: rejected suspicious path:', resolved)
        return
      }
      const fsp = await import('fs/promises')
      await fsp.unlink(resolved)
      console.log('Cleaned up temp transcode file:', resolved)
    } catch {
      // ignore — file may already be gone
    }
  })

  // Select output file for merge
  ipcMain.handle(
    'select-merge-output',
    async (_event, sampleClipPath?: string): Promise<string | null> => {
      // Infer the preferred output format from the input clip extension.
      // An A7S III card produces .MP4; FX6 produces .MXF. Default to matching.
      const inputExt = sampleClipPath
        ? path.extname(sampleClipPath).toLowerCase().replace('.', '')
        : 'mxf'
      const isMp4Input = inputExt === 'mp4' || inputExt === 'mov'

      const defaultName = `merged_${new Date().toISOString().slice(0, 10)}.${isMp4Input ? 'mp4' : 'mxf'}`

      // Put the matching format first so it's pre-selected in the Finder dialog
      const filters = isMp4Input
        ? [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'MOV Video', extensions: ['mov'] },
            { name: 'MXF Video', extensions: ['mxf'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        : [
            { name: 'MXF Video', extensions: ['mxf'] },
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'MOV Video', extensions: ['mov'] },
            { name: 'All Files', extensions: ['*'] }
          ]

      const result = await dialog.showSaveDialog({
        title: 'Save Merged Video',
        defaultPath: defaultName,
        filters
      })

      if (result.canceled || !result.filePath) {
        return null
      }
      return result.filePath
    }
  )

  // -----------------------------------------------------------------------
  // Photo metadata extraction — reads EXIF from ARW/JPG via exifreader
  // (ffprobe returns empty tags from JPEG; exifreader parses APP1 directly)
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'get-photo-metadata',
    async (
      _event,
      filePath: string
    ): Promise<{
      success: boolean
      metadata?: import('../renderer/src/types').PhotoMetadata
      error?: string
    }> => {
      try {
        filePath = validateFilePath(filePath)

        // Import exifreader (CJS) — no .default interop needed (no "type":"module")
        const ExifReaderModule = await import('exifreader')
        const ExifReader = ExifReaderModule.default ?? ExifReaderModule

        // Read only the first 512 KB — EXIF/XMP always lives in the header
        const EXIF_READ_BYTES = 512 * 1024
        const fileHandle = await fs.promises.open(filePath, 'r')
        const stat = await fileHandle.stat()
        const readSize = Math.min(EXIF_READ_BYTES, stat.size)
        const buffer = Buffer.allocUnsafe(readSize)
        await fileHandle.read(buffer, 0, readSize, 0)
        await fileHandle.close()

        // exifreader expects an ArrayBuffer
        const arrayBuf = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tags = (ExifReader as any).load(arrayBuf, { expanded: false }) as Record<
          string,
          { description: string; value: unknown }
        >

        // Helper: read tag description, return undefined when absent
        const t = (key: string): string | undefined => {
          const tag = tags[key]
          if (!tag) return undefined
          const desc = tag.description
          if (desc === undefined || desc === null || desc === '') return undefined
          return String(desc)
        }

        // Dimensions — exifreader tag names for JPEG vs TIFF differ;
        // fall back to ffprobe for reliability on ARW files.
        let width: number | undefined = undefined
        let height: number | undefined = undefined

        const exifW = t('Image Width') ?? t('ImageWidth') ?? t('PixelXDimension')
        const exifH = t('Image Height') ?? t('ImageHeight') ?? t('PixelYDimension')
        if (exifW && exifH) {
          width = parseInt(exifW)
          height = parseInt(exifH)
        } else {
          // ffprobe fallback (especially for ARW)
          try {
            const { runFfprobe } = await import('./ffmpeg-spawn')
            const probe = await runFfprobe(filePath)
            const vs = probe.streams.find((s) => s.codec_type === 'video')
            width = vs?.width
            height = vs?.height
          } catch {
            // ignore — dimensions stay undefined
          }
        }

        const metadata: import('../renderer/src/types').PhotoMetadata = {
          make: t('Make'),
          model: t('Model'),
          lens: t('LensModel') ?? t('Lens') ?? t('LensInfo'),
          exposureTime: t('ExposureTime'),
          fNumber: t('FNumber'),
          iso: t('ISOSpeedRatings') ?? t('PhotographicSensitivity'),
          focalLength: t('FocalLength'),
          focalLengthIn35mm: t('FocalLengthIn35mmFilm'),
          exposureMode: t('ExposureMode'),
          meteringMode: t('MeteringMode'),
          whiteBalance: t('WhiteBalance'),
          colorSpace: t('ColorSpace'),
          dateTimeOriginal: t('DateTimeOriginal') ?? t('DateTime'),
          gpsLatitude: t('GPSLatitude'),
          gpsLongitude: t('GPSLongitude'),
          width,
          height
        }

        // Strip undefined fields
        Object.keys(metadata).forEach((k) => {
          if (metadata[k as keyof typeof metadata] === undefined) {
            delete metadata[k as keyof typeof metadata]
          }
        })

        return { success: true, metadata }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Metadata extraction failed'
        }
      }
    }
  )

  // -----------------------------------------------------------------------
  // ARW preview extraction — extracts embedded JPEG from Sony RAW file
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'extract-arw-preview',
    async (
      _event,
      arwPath: string
    ): Promise<{
      success: boolean
      previewPath?: string
      error?: string
    }> => {
      try {
        arwPath = validateFilePath(arwPath)
        const { app } = await import('electron')
        const { getFfmpegPath } = await import('./ffmpeg-spawn')
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)
        const fsp = await import('fs/promises')

        // Extract to userData dir (inside home, always allowed by local:// protocol)
        const previewDir = path.join(app.getPath('userData'), 'arw-previews')
        await fsp.mkdir(previewDir, { recursive: true })

        const basename = path.basename(arwPath, path.extname(arwPath))
        const previewPath = path.join(previewDir, `${basename}-preview.jpg`)

        // FFmpeg extracts the embedded JPEG preview from the ARW file
        await execFileAsync(getFfmpegPath(), [
          '-y',
          '-i',
          arwPath,
          '-map',
          '0:v:0',
          '-vframes',
          '1',
          '-f',
          'image2',
          previewPath
        ])

        console.log('Extracted ARW preview:', previewPath)
        return { success: true, previewPath }
      } catch (err) {
        console.error('ARW preview extraction failed:', err)
        return { success: false, error: err instanceof Error ? err.message : 'Extraction failed' }
      }
    }
  )

  // -----------------------------------------------------------------------
  // Eject / unmount a volume — macOS only (diskutil eject)
  // Returns { success: true } on clean unmount, { success: false, error } on failure.
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'eject-drive',
    async (
      _event,
      drivePath: string
    ): Promise<{ success: boolean; error?: string }> => {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)

      // Validate the path is under /Volumes to prevent arbitrary command injection
      if (!drivePath.startsWith('/Volumes/')) {
        return { success: false, error: 'Only volumes under /Volumes can be ejected' }
      }

      try {
        console.log('Ejecting drive:', drivePath)
        await execFileAsync('/usr/sbin/diskutil', ['eject', drivePath])
        console.log('Ejected successfully:', drivePath)
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Eject failed'
        console.error('Eject failed:', msg)
        return { success: false, error: msg }
      }
    }
  )
}

/**
 * Add file to recent files list
 */
export function addToRecentFiles(filepath: string): void {
  const settings = store.get('settings') as AppSettings
  const recentFiles = settings.recentFiles.filter((f: string) => f !== filepath)
  recentFiles.unshift(filepath)

  // Limit to maxRecentFiles
  if (recentFiles.length > settings.maxRecentFiles) {
    recentFiles.pop()
  }

  store.set('settings', { ...settings, recentFiles })
}
