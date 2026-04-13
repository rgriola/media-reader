import { app, shell, BrowserWindow, protocol } from 'electron'
import { join, resolve as pathResolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIPCHandlers } from './ipc'
import { watchExternalDrives } from './drives'

/**
 * Get allowed root directories for file access
 */
function getAllowedRoots(): string[] {
  const roots = ['/Volumes']
  const home = app.getPath('home')
  if (home) roots.push(home)
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

  // Set Content Security Policy to allow media loading from local protocol
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "media-src 'self' local: file:; " +
            "img-src 'self' data: local: file:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline';"
        ]
      }
    })
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
  }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.mxf-media-reader')

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
      const fs = require('fs')
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

        return new Response(stream as any, {
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
      return new Response(stream as any, {
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
