import { app, shell, BrowserWindow, protocol, session } from 'electron'
import { join, resolve as pathResolve } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIPCHandlers } from './ipc'
import { watchExternalDrives } from './drives'
import { getFfmpegPath } from './ffmpeg-spawn'
import { spawn } from 'child_process'

/**
 * Get allowed root directories for file access
 */
function getAllowedRoots(): string[] {
  const roots = ['/Volumes']
  const home = app.getPath('home')
  if (home) roots.push(home)
  // Also allow the parent of home (e.g. /Users) so any user under it is covered
  const homeParent = home ? home.split('/').slice(0, -1).join('/') : null
  if (homeParent) roots.push(homeParent)
  return roots
}

/**
 * Validate that a file path is safe to access (no traversal, within allowed roots)
 */
function isPathAllowed(filePath: string): boolean {
  const resolved = pathResolve(filePath)
  // Block directory traversal: resolved path must match the input intent
  if (resolved !== filePath && resolved !== decodeURIComponent(filePath)) {
    // Path was normalized differently — likely contains ..
    // Allow only if the resolved path is still within allowed roots
  }
  const roots = getAllowedRoots()
  return roots.some((root) => resolved.startsWith(root + '/') || resolved === root)
}

/**
 * Get content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    mxf: 'application/mxf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp'
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}

function createWindow(): BrowserWindow {
  // Create the browser window optimized for video playback
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    titleBarStyle: 'default', // Allow window dragging
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // Open DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Register custom protocol as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  },
  {
    scheme: 'mxfstream',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mxf-media-reader')

  // Set CSP on the default session BEFORE the window loads any URL.
  // Using session.defaultSession ensures it applies in both dev (localhost:5173)
  // and production (file://) modes, and covers mxfstream:// media sources.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Remove any existing CSP header (check both casings servers may send)
    const headers: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(details.responseHeaders ?? {})) {
      if (k.toLowerCase() !== 'content-security-policy') {
        headers[k] = Array.isArray(v) ? v : [v]
      }
    }
    headers['Content-Security-Policy'] = [
      "default-src 'self'; " +
        "media-src 'self' local: mxfstream: file: blob:; " +
        "img-src 'self' data: local: file:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline';"
    ]
    callback({ responseHeaders: headers })
  })

  // Register custom protocol to serve local files with streaming support
  protocol.handle('local', (request) => {
    // Parse the URL - browser lowercases the "hostname" part after local://
    // So local:///Volumes/file becomes local://volumes/file
    // We need to add back the leading slash
    let filePath = request.url.replace('local://', '')

    // If path doesn't start with /, add it (browser removes it treating first part as hostname)
    if (!filePath.startsWith('/')) {
      filePath = '/' + filePath
    }

    // Decode and capitalize 'Volumes' if needed (macOS specific)
    filePath = decodeURIComponent(filePath)
    if (filePath.toLowerCase().startsWith('/volumes/')) {
      filePath = '/Volumes' + filePath.substring(8)
    }

    // Resolve to canonical path and validate against allowed roots
    filePath = pathResolve(filePath)
    if (!isPathAllowed(filePath)) {
      console.error('Blocked access to disallowed path:', filePath)
      return new Response('Forbidden', { status: 403 })
    }

    console.log('Serving file via local:// protocol:', filePath)

    try {
      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const range = request.headers.get('range')

      // Handle range requests (required for video seeking)
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = end - start + 1

        const stream = fs.createReadStream(filePath, { start, end })

        return new Response(stream as unknown as ReadableStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': getContentType(filePath)
          }
        })
      }

      // Handle normal requests
      const stream = fs.createReadStream(filePath)
      return new Response(stream as unknown as ReadableStream, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Type': getContentType(filePath)
        }
      })
    } catch (error) {
      console.error('Failed to load local file:', error)
      return new Response('File not found', { status: 404 })
    }
  })

  // ---------------------------------------------------------------------------
  // mxfstream:// — FFmpeg live-transcode streaming protocol (no temp files)
  // mxfstream:///path/to/file.mxf          — play from start
  // mxfstream:///path/to/file.mxf?seek=30  — play from 30 seconds
  // ---------------------------------------------------------------------------
  protocol.handle('mxfstream', (request) => {
    // Use the same path-reconstruction approach as the local:// handler.
    // The browser treats the first path segment as a "hostname" and lowercases it,
    // so we recover the full path via string-replace and then normalise casing.
    let filePath = request.url.replace('mxfstream://', '')
    if (!filePath.startsWith('/')) {
      filePath = '/' + filePath
    }
    filePath = decodeURIComponent(filePath)

    // Restore casing for well-known macOS root dirs
    if (filePath.toLowerCase().startsWith('/volumes/')) {
      filePath = '/Volumes' + filePath.substring(8)
    } else if (filePath.toLowerCase().startsWith('/users/')) {
      filePath = '/Users' + filePath.substring(6)
    }

    // Strip ?seek=N query string from the file path before resolving
    const qIdx = filePath.indexOf('?')
    const seekParam = qIdx >= 0 ? filePath.substring(qIdx + 1) : ''
    if (qIdx >= 0) filePath = filePath.substring(0, qIdx)

    filePath = pathResolve(filePath)

    if (!isPathAllowed(filePath)) {
      console.error('mxfstream: blocked disallowed path:', filePath)
      return new Response('Forbidden', { status: 403 })
    }

    const seekSeconds = parseFloat(new URLSearchParams(seekParam).get('seek') ?? '0') || 0
    console.log(`mxfstream: streaming ${filePath} from ${seekSeconds}s`)

    const ffmpegArgs = [
      ...(seekSeconds > 0 ? ['-ss', seekSeconds.toString()] : []),
      '-i',
      filePath,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    ]

    const ffmpeg = spawn(getFfmpegPath(), ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })

    const readable = new ReadableStream({
      start(controller) {
        let closed = false

        const safeClose = (): void => {
          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          }
        }

        ffmpeg.stdout.on('data', (chunk: Buffer) => {
          if (closed) return
          try {
            controller.enqueue(new Uint8Array(chunk))
          } catch {
            // controller may have been cancelled mid-stream
          }
        })
        ffmpeg.stdout.on('end', safeClose)
        ffmpeg.stdout.on('error', (err) => {
          console.error('mxfstream FFmpeg stdout error:', err)
          safeClose()
        })
        ffmpeg.on('error', (err) => {
          console.error('mxfstream FFmpeg process error:', err)
          safeClose()
        })
      },
      cancel() {
        // Player closed or seek triggered a new request — kill the old FFmpeg process.
        // 'end' fires on stdout after the kill, but safeClose prevents double-close.
        ffmpeg.kill('SIGKILL')
        console.log('mxfstream: FFmpeg process killed (stream cancelled)')
      }
    })

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        // Allow Chromium to buffer without knowing the total size
        'X-Content-Type-Options': 'nosniff'
      }
    })
  })

  // Register IPC handlers
  registerIPCHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Start watching for external drive changes
  watchExternalDrives(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
