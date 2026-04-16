# MXF Media Reader

A professional Electron-based media reader for MXF (Material Exchange Format) files with Sony XDCAM camera card support, proxy playback, MXF streaming, batch merging, and XML metadata extraction.

## Features

- ✅ **Sony Camera Card Browser**: Auto-detect Sony XDCAM cards, scan for MXF clips with thumbnails
- ✅ **Proxy Playback**: Automatically detect and play MP4 proxy files alongside MXF originals
- ✅ **MXF Streaming**: Real-time FFmpeg transcode of MXF files to fragmented MP4 for playback
- ✅ **XML Metadata Extraction**: Parse Sony XDCAM XML sidecars including hex-encoded BCD timecodes
- ✅ **SMPTE Timecode Display**: Accurate HH:MM:SS:FF timecode from Sony LTC data
- ✅ **Batch Merge**: Select and merge multiple MXF clips via FFmpeg with progress tracking
- ✅ **Professional Playback Controls**: Frame-by-frame stepping, J/K/L speed control
- ✅ **Drive Monitoring**: Watch for external drive mount/unmount events in real-time
- ✅ **Dark Theme**: Professional dark interface optimized for video work
- ✅ **Keyboard Shortcuts**: J/K/L playback controls, space for play/pause, arrow keys for frame step

## Technology Stack

### Frontend

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7 + electron-vite 5
- **Styling**: Tailwind CSS 3
- **State Management**: Zustand 5
- **Video Player**: HTML5 Video with custom controls

### Backend (Electron Main Process)

- **Runtime**: Electron 39
- **Media Processing**: FFmpeg/FFprobe (bundled via `ffprobe-static` + system FFmpeg)
- **XML Parsing**: fast-xml-parser (Sony XDCAM metadata)
- **File Watching**: chokidar (drive mount/unmount events)
- **Settings Storage**: electron-store
- **IPC**: Electron IPC with typed preload bridge

### Testing

- **Framework**: Vitest 4
- **Coverage**: 98 unit tests across 6 test files

## Project Structure

```
Media-Reader/
├── src/
│   ├── main/                           # Electron Main Process (Node.js → CJS)
│   │   ├── index.ts                   # App entry, window, custom protocols
│   │   ├── ipc.ts                     # IPC handlers for all renderer communication
│   │   ├── ffmpeg.ts                  # FFmpeg metadata extraction, proxy gen
│   │   ├── ffmpeg-spawn.ts            # FFmpeg binary resolution, spawn helpers
│   │   ├── drives.ts                  # External drive scanning, Sony card detection
│   │   ├── merge-engine.ts            # Batch clip merging via FFmpeg
│   │   ├── camera-cards.config.ts     # Sony camera card path/suffix configuration
│   │   ├── path-utils.ts             # File path security validation
│   │   └── __tests__/                 # Main process unit tests
│   │       ├── camera-cards.config.test.ts
│   │       ├── ffmpeg-spawn.test.ts
│   │       ├── path-utils.test.ts
│   │       └── sony-ltc-decode.test.ts
│   │
│   ├── preload/                        # Bridge (Node.js → CJS)
│   │   ├── index.ts                   # IPC bridge via contextBridge
│   │   └── index.d.ts                 # Type declarations for renderer
│   │
│   ├── shared/                         # Code shared across processes
│   │   ├── timecode.ts                # SMPTE timecode conversion utilities
│   │   └── __tests__/
│   │       └── timecode.test.ts
│   │
│   └── renderer/                       # React Application (Chromium → ESM)
│       ├── index.html
│       └── src/
│           ├── App.tsx                # Main React component, routing
│           ├── main.tsx               # React entry point
│           ├── components/
│           │   ├── DriveBrowser.tsx    # Camera card browser with file grid
│           │   ├── VideoPlayer.tsx     # Video player with TC overlay
│           │   ├── MetadataViewer.tsx  # XML metadata display panel
│           │   ├── MergePanel.tsx      # Batch merge UI with progress
│           │   ├── ErrorBoundary.tsx   # React error boundary
│           │   └── Versions.tsx       # Electron version display
│           ├── store/
│           │   └── mediaStore.ts      # Zustand store for app state
│           ├── types/
│           │   └── index.ts           # Canonical type definitions
│           ├── utils/
│           │   ├── formatters.ts      # File size, duration, bitrate formatters
│           │   └── __tests__/
│           │       └── formatters.test.ts
│           └── assets/
│               └── main.css           # Tailwind CSS + custom styles
│
├── build/                              # Build resources (icons)
├── resources/                          # App resources (icon.png)
├── scripts/                            # Build helper scripts
│   └── increment-build.js
├── copilot/                            # Copilot agent configuration
│
├── package.json                        # Dependencies & scripts
├── electron.vite.config.ts             # Vite config for Electron
├── electron-builder.yml                # Packaging configuration
├── vitest.config.ts                    # Test configuration
├── tsconfig.json                       # Base TypeScript config
├── tsconfig.node.json                  # Main + preload TS config
├── tsconfig.web.json                   # Renderer TS config
├── tailwind.config.js                  # Tailwind CSS config
├── postcss.config.js                   # PostCSS config
├── eslint.config.mjs                   # ESLint rules
├── .prettierrc.yaml                    # Prettier formatting
│
├── AGENTS.md                           # Agent coding guide (rules & gotchas)
├── SONY_XML_METADATA.md               # Sony XDCAM XML format & BCD timecodes
├── FFMPEG_BATCH_MERGE_PLAN.md         # Batch merge design
├── MXF_READER_DESIGN.md              # Architecture options & UI layout
├── IMPLEMENTATION_PLAN.md             # Development roadmap
└── PROJECT_STRUCTURE.md               # This file's companion doc
```

## Making it Prettier

```bash
npx prettier --write "src/**/*.{ts,tsx}"
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- FFmpeg installed on your system

### Install FFmpeg (macOS)

```bash
brew install ffmpeg
```

### Install Dependencies

```bash
npm install
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This will:

- Start the Vite dev server for hot reloading (renderer only)
- Launch the Electron app
- Open DevTools automatically

> **Note:** Changes to `src/main/` and `src/preload/` require restarting `npm run dev`.
> Only renderer changes hot-reload.

### Run Tests

```bash
npm test              # Run all 98 unit tests
npm run test:watch    # Watch mode for development
```

### Build for Production

```bash
npm run build         # Typecheck + bundle (no packaging)
```

### Package the App

```bash
# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

The packaged app will be in the `dist/` directory.

## Usage

### Drive Browser

The app automatically scans `/Volumes` for mounted external drives:

1. **Sony camera cards** (XDCAM): Detected by SONY + XDROOT directory structure
2. **Generic drives**: Recursively scanned for MXF files (max depth 3)

Each detected MXF file shows:
- Thumbnail (from Sony card)
- Start timecode (decoded from XML sidecar)
- Duration, frame rate, codec
- Proxy file availability

### Video Playback Modes

| Badge | Source | How it works |
|---|---|---|
| 🔵 Proxy | Pre-existing MP4 proxy | Served via `local://` protocol |
| 🟠 MXF Stream | FFmpeg live transcode | Served via `mxfstream://` protocol |
| 🟡 Preview | Full transcode to temp file | One-time conversion, then served |

### Keyboard Shortcuts

- `Space`: Play/Pause
- `→`: Next frame
- `←`: Previous frame
- `L`: Speed up playback
- `J`: Slow down playback
- `K`: Normal speed

### Batch Merging

1. Select multiple clips in the drive browser
2. Open the Merge panel
3. Choose output location and format
4. Monitor progress in real-time

## Configuration

### Settings

Access settings via the menu or `Cmd/Ctrl + ,`:

- **Proxy Quality**: Default quality for proxy generation
- **Naming Convention**: How to find proxy files
- **Theme**: Dark mode (default)

Settings are stored in:

- macOS: `~/Library/Application Support/mxf-media-reader/config.json`
- Windows: `%APPDATA%/mxf-media-reader/config.json`
- Linux: `~/.config/mxf-media-reader/config.json`

## API Reference

### Electron API (window.api)

```typescript
// File operations
await window.api.selectFile()
await window.api.loadFile(filepath)

// Metadata
const metadata = await window.api.extractMetadata(filepath)

// Proxy operations
const proxy = await window.api.findProxy(mxfPath)
await window.api.generateProxy(mxfPath, quality)
window.api.onProxyProgress((percent) => { /* 0-100 */ })

// External drive operations
const drives = await window.api.getExternalDrives()
const fileInfo = await window.api.getMXFFileInfo(filepath)
window.api.onDriveMounted((drive) => { /* ExternalDrive */ })
window.api.onDriveUnmounted((path) => { /* string */ })

// Batch merge operations
const validation = await window.api.validateMerge(clipPaths)
await window.api.mergeClips(mergeOptions)
await window.api.cancelMerge()
await window.api.selectMergeOutput()
window.api.onMergeProgress((percent) => { /* 0-100 */ })

// Transcode for playback
const tempPath = await window.api.startTranscodePlayback(mxfPath)
await window.api.cancelTranscodePlayback()
await window.api.cleanupTranscodeFile(tempPath)
window.api.onTranscodePlaybackProgress((percent) => { /* 0-100 */ })

// Settings
const settings = await window.api.getSettings()
await window.api.saveSettings({ theme: 'dark' })

// Export
await window.api.exportFrame(filepath, timeInSeconds)
await window.api.exportClip(filepath, startTime, endTime)
```

## Distribution

### For Internal Team Sharing

1. **Build the app**:

   ```bash
   npm run build:mac
   ```

2. **Share the DMG**:
   - Located in `dist/mxf-media-reader-1.0.0.dmg`
   - Share via file server, cloud storage, or email

3. **First-time users** (if not code-signed):
   ```bash
   xattr -cr /Applications/MXF\ Media\ Reader.app
   ```

### Code Signing (Optional)

To remove Gatekeeper warnings:

1. Get an Apple Developer account ($99/year)
2. Create a Developer ID certificate
3. Update `electron-builder.yml` with your signing identity
4. Build with signing:
   ```bash
   npm run build:mac
   ```

## Troubleshooting

### FFmpeg Not Found

If you see "FFmpeg not found" errors:

```bash
# macOS
brew install ffmpeg

# Verify installation
ffmpeg -version
```

### Video Won't Play

- Try the proxy file first (🔵 badge) — most reliable
- MXF streaming (🟠 badge) requires FFmpeg to be installed
- Check the DevTools console for CSP or protocol errors

### Performance Issues

- Use proxy files instead of MXF streaming where possible
- Close other applications
- Check available RAM

## Contributing

This is an internal tool, but contributions are welcome:

1. Create a feature branch
2. Make your changes
3. Run `npm test && npm run build` to verify
4. Submit a pull request

## License

Proprietary - Internal Use Only

## Support

For issues or questions, contact the development team.

---

**Built with ❤️ for professional video workflows**
