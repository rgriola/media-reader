/**
 * IPC Handlers for communication between main and renderer processes
 */
import { ipcMain, dialog } from 'electron'
import { resolve as pathResolve } from 'path'
import os from 'os'
import path from 'path'
import { validateFilePath } from './path-utils'
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
  ipcMain.handle('select-merge-output', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save Merged Video',
      defaultPath: `merged_${new Date().toISOString().slice(0, 10)}.mxf`,
      filters: [
        { name: 'MXF Video', extensions: ['mxf'] },
        { name: 'MP4 Video', extensions: ['mp4'] },
        { name: 'MOV Video', extensions: ['mov'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return null
    }
    return result.filePath
  })
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
