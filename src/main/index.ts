import { app, shell, BrowserWindow, protocol, session } from 'electron'
import { join, resolve as pathResolve } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIPCHandlers } from './ipc'
import { watchExternalDrives } from './drives'
import { getFfmpegPath, getFfprobePath } from './ffmpeg-spawn'
import { spawn, execFileSync } from 'child_process'

/**
 * Get allowed root directories for file access.
 * Restricted to /Volumes and the current user's home directory only.
 */
function getAllowedRoots(): string[] {
  const roots = ['/Volumes']
  const home = app.getPath('home')
  if (home) roots.push(home)
  return roots
}

/**
 * Validate that a file path is within allowed roots.
 * path.resolve() eliminates any .. traversal before the roots check.
 */
function isPathAllowed(filePath: string): boolean {
  const resolved = pathResolve(filePath)
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
    // Only open http/https URLs externally — block file:// and URI-scheme attacks
    const url = details.url
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
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
        // unsafe-inline + unsafe-eval are required by Vite HMR in dev.
        // Production builds use a strict script-src so eval is blocked.
        (is.dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " : "script-src 'self'; ") +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com;"
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

    // Decode and capitalize well-known macOS root dirs if needed
    // (browser lowercases the first path segment, treating it as a hostname)
    filePath = decodeURIComponent(filePath)
    if (filePath.toLowerCase().startsWith('/volumes/')) {
      filePath = '/Volumes' + filePath.substring(8)
    } else if (filePath.toLowerCase().startsWith('/users/')) {
      filePath = '/Users' + filePath.substring(6)
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
  protocol.handle('mxfstream', async (request) => {
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

    // Guard: if the file is a browser-native format (MP4/MOV) there's no need to
    // transcode it — serve it directly as a static file to avoid wasted CPU.
    const nativeExts = ['.mp4', '.mov', '.m4v', '.webm']
    const fileExt = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
    if (nativeExts.includes(fileExt)) {
      console.warn(
        `mxfstream: received native-format file (${fileExt}) — serving via local:// passthrough instead of transcoding`
      )
      try {
        const stat = fs.statSync(filePath)
        const stream = fs.createReadStream(filePath)
        return new Response(stream as unknown as ReadableStream, {
          status: 200,
          headers: {
            'Content-Length': stat.size.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': fileExt === '.webm' ? 'video/webm' : 'video/mp4'
          }
        })
      } catch {
        return new Response('File not found', { status: 404 })
      }
    }

    const seekSeconds = parseFloat(new URLSearchParams(seekParam).get('seek') ?? '0') || 0
    console.log(`mxfstream: streaming ${filePath} from ${seekSeconds}s`)

    // Probe the number of audio streams so we can merge them into one track.
    // Sony MXF files typically have 4 separate mono streams — `-map 0:a` would
    // create 4 independent audio tracks in the output MP4, but browsers only
    // play the first track.  amerge combines them into a single multi-channel
    // track that the Web Audio API channel splitter can then control.
    let audioStreamCount = 0
    try {
      const probeArgs = [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=index',
        '-of', 'csv=p=0',
        '-i', filePath
      ]
      const probeOut = execFileSync(getFfprobePath(), probeArgs, {
        encoding: 'utf-8',
        timeout: 5000
      }).trim()
      audioStreamCount = probeOut ? probeOut.split('\n').length : 0
    } catch {
      console.warn('mxfstream: audio probe failed, falling back to -map 0:a')
    }

    // Build audio mapping args
    let audioArgs: string[]
    if (audioStreamCount > 1) {
      // Merge N mono streams → 1 multi-channel track
      const inputs = Array.from({ length: audioStreamCount }, (_, i) => `[0:a:${i}]`).join('')
      audioArgs = [
        '-filter_complex',
        `${inputs}amerge=inputs=${audioStreamCount}[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-ac', audioStreamCount.toString()
      ]
    } else {
      // Single audio stream or probe failed — simple mapping
      audioArgs = ['-map', '0:v', '-map', '0:a?']
    }

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
      ...audioArgs,
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
