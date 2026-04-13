/**
 * IPC Handlers for communication between main and renderer processes
 */
import { ipcMain, dialog, app } from 'electron'
import { resolve as pathResolve } from 'path'
import { extractMetadata, findProxyFile, generateProxy, exportFrame, exportClip } from './ffmpeg'
import { getExternalDrives, getMXFFileInfo } from './drives'
import {
  validateClipsForConcat,
  buildConcatFileList,
  mergeClipsLossless,
  mergeClipsReencode
} from './merge-engine'
import type { AppSettings, FileLoadResult, MergeOptions } from '../renderer/src/types'

// Use require for electron-store to avoid ESM/CJS issues
const Store = require('electron-store').default || require('electron-store')

/**
 * Validate that a file path is absolute and within allowed directories
 */
function validateFilePath(filepath: string): string {
  const resolved = pathResolve(filepath)
  const allowedRoots = ['/Volumes', app.getPath('home')]
  const allowed = allowedRoots.some((root) => resolved.startsWith(root + '/') || resolved === root)
  if (!allowed) {
    throw new Error(`Access denied: path outside allowed directories`)
  }
  return resolved
}

// Initialize electron-store for settings
const store = new Store({
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
      const settings = store.get('settings')
      const proxy = await findProxyFile(filepath, settings.proxyNamingConvention)

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
    const settings = store.get('settings')
    return await findProxyFile(validateFilePath(mxfPath), settings.proxyNamingConvention)
  })

  // Generate proxy
  ipcMain.handle('generate-proxy', async (event, mxfPath: string, quality: string) => {
    mxfPath = validateFilePath(mxfPath)
    const path = await import('path')
    const dir = path.dirname(mxfPath)
    const basename = path.basename(mxfPath, path.extname(mxfPath))
    const outputPath = path.join(dir, `${basename}_proxy.mp4`)

    // Send progress updates
    const onProgress = (percent: number) => {
      event.sender.send('proxy-progress', percent)
    }

    await generateProxy(mxfPath, outputPath, quality as any, onProgress)
    return outputPath
  })

  // Get settings
  ipcMain.handle('get-settings', async () => {
    return store.get('settings')
  })

  // Save settings
  ipcMain.handle('save-settings', async (_event, settings: Partial<AppSettings>) => {
    const currentSettings = store.get('settings')
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

    if (opts.mode === 'lossless') {
      const filelistPath = await buildConcatFileList(validatedPaths)

      // Get total duration for progress calculation
      const validation = await validateClipsForConcat(validatedPaths)

      const { promise, cancel } = mergeClipsLossless(
        filelistPath,
        opts.outputPath,
        validation.totalDuration,
        onProgress
      )

      // Store cancel function so it can be called via cancel-merge
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
        onProgress
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
function addToRecentFiles(filepath: string): void {
  const settings = store.get('settings') as AppSettings
  const recentFiles = settings.recentFiles.filter((f: string) => f !== filepath)
  recentFiles.unshift(filepath)

  // Limit to maxRecentFiles
  if (recentFiles.length > settings.maxRecentFiles) {
    recentFiles.pop()
  }

  store.set('settings', { ...settings, recentFiles })
}
