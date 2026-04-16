# Project Structure Summary

## 📁 Directory Structure

```
Media-Reader/
├── src/
│   ├── main/                           # Electron Main Process (Node.js → CJS)
│   │   ├── index.ts                   # App entry, window creation, custom protocols
│   │   ├── ipc.ts                     # IPC handlers (file ops, settings, export, merge)
│   │   ├── ffmpeg.ts                  # FFmpeg metadata extraction, proxy generation
│   │   ├── ffmpeg-spawn.ts            # FFmpeg/FFprobe binary resolution, spawn helpers
│   │   ├── drives.ts                  # External drive scanning, Sony XML parsing, LTC decode
│   │   ├── merge-engine.ts            # Batch MXF clip merging via FFmpeg
│   │   ├── camera-cards.config.ts     # Sony camera card path/suffix/extension config
│   │   ├── path-utils.ts             # File path security validation
│   │   └── __tests__/                 # Unit tests (vitest)
│   │       ├── camera-cards.config.test.ts  (11 tests)
│   │       ├── ffmpeg-spawn.test.ts         (7 tests)
│   │       ├── path-utils.test.ts           (8 tests)
│   │       └── sony-ltc-decode.test.ts      (10 tests)
│   │
│   ├── preload/                        # Bridge (sandboxed, CJS output)
│   │   ├── index.ts                   # contextBridge IPC exposure
│   │   └── index.d.ts                 # Type declarations for renderer
│   │
│   ├── shared/                         # Code shared across main + renderer
│   │   ├── timecode.ts                # SMPTE timecode utilities
│   │   └── __tests__/
│   │       └── timecode.test.ts             (30 tests)
│   │
│   └── renderer/                       # React Application (Chromium → ESM)
│       ├── index.html                 # HTML entry point
│       └── src/
│           ├── App.tsx                # Main React component, file loading
│           ├── main.tsx               # React DOM entry point
│           ├── env.d.ts               # Vite environment types
│           ├── components/
│           │   ├── DriveBrowser.tsx    # Camera card scanner, file grid, metadata display
│           │   ├── VideoPlayer.tsx     # Video player with TC overlay, J/K/L controls
│           │   ├── MetadataViewer.tsx  # XML metadata display panel
│           │   ├── MergePanel.tsx      # Batch merge UI with progress tracking
│           │   ├── ErrorBoundary.tsx   # React error boundary wrapper
│           │   └── Versions.tsx        # Electron/Node/Chrome version display
│           ├── store/
│           │   └── mediaStore.ts      # Zustand store (file state, settings, player)
│           ├── types/
│           │   └── index.ts           # Canonical type definitions (shared across IPC)
│           ├── utils/
│           │   ├── formatters.ts      # File size, duration, bitrate, path formatters
│           │   └── __tests__/
│           │       └── formatters.test.ts   (32 tests)
│           └── assets/
│               └── main.css           # Tailwind CSS + custom component styles
│
├── build/                              # Build resources (icons)
├── resources/                          # App resources (icon.png)
├── scripts/
│   └── increment-build.js            # Auto-increment build number
├── copilot/                            # Copilot agent config
├── out/                                # Build output (git-ignored)
│   ├── main/index.js                  # Bundled main process (CJS)
│   ├── preload/index.js               # Bundled preload (CJS)
│   └── renderer/                      # Bundled React app
│
├── package.json
├── electron.vite.config.ts             # Vite configuration for Electron
├── electron-builder.yml                # Packaging configuration
├── vitest.config.ts                    # Test configuration (separate from build)
├── tsconfig.json                       # Base TypeScript config
├── tsconfig.node.json                  # Main + preload TS config
├── tsconfig.web.json                   # Renderer TS config
├── tailwind.config.js                  # Tailwind CSS configuration
├── postcss.config.js                   # PostCSS configuration
├── eslint.config.mjs                   # ESLint rules
├── .prettierrc.yaml                    # Prettier formatting rules
├── .editorconfig                       # Editor configuration
│
├── AGENTS.md                           # Agent coding guide (critical rules)
├── SONY_XML_METADATA.md               # Sony XDCAM XML format & BCD timecodes
├── FFMPEG_BATCH_MERGE_PLAN.md         # Batch merge design doc
├── MXF_READER_DESIGN.md              # Architecture & UI layout doc
├── IMPLEMENTATION_PLAN.md             # Development roadmap
└── README.md                           # User-facing documentation
```

## 📦 Dependencies

### Runtime

| Package | Purpose |
|---|---|
| `@electron-toolkit/preload` | Preload script utilities |
| `@electron-toolkit/utils` | Electron utility helpers |
| `@ffprobe-installer/ffprobe` | Bundled FFprobe binary |
| `chokidar` | File system watching (drive events) |
| `electron-store` | Persistent settings storage |
| `fast-xml-parser` | Sony XDCAM XML sidecar parsing |
| `ffprobe-static` | Static FFprobe binary path resolution |
| `wavesurfer.js` | Audio waveform visualization |
| `zustand` | Lightweight state management |

### Development

| Package | Purpose |
|---|---|
| `electron` | Desktop app framework (v39) |
| `electron-vite` | Vite integration for Electron (v5) |
| `electron-builder` | App packaging & distribution |
| `react` / `react-dom` | UI library (v19) |
| `typescript` | Type safety (v5.9) |
| `vite` | Build tool (v7) |
| `vitest` | Unit testing framework (v4) |
| `tailwindcss` | Utility-first CSS framework |
| `eslint` / `prettier` | Code quality & formatting |

## 🚀 Available Scripts

```bash
# Development
npm run dev              # Start dev server + Electron (renderer hot-reload only)

# Testing
npm test                 # Run 98 unit tests (vitest)
npm run test:watch       # Watch mode for TDD

# Building
npm run build            # Typecheck + production build
npm run build:mac        # Package for macOS (.dmg)
npm run build:win        # Package for Windows
npm run build:linux      # Package for Linux

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier
npm run typecheck        # TypeScript type checking only
```

## 🔧 Configuration Files

### TypeScript
- `tsconfig.json` — Base config (references node + web)
- `tsconfig.node.json` — Main process + preload (CJS target)
- `tsconfig.web.json` — Renderer process (ESM target)

### Build
- `electron.vite.config.ts` — Vite configuration for all 3 Electron processes
- `electron-builder.yml` — App packaging, signing, distribution config
- `vitest.config.ts` — Test runner config (separate from build to avoid conflicts)

### Code Quality
- `eslint.config.mjs` — ESLint flat config with TypeScript rules
- `.prettierrc.yaml` — Single quotes, no semicolons, 100 char width
- `.editorconfig` — Editor settings (indent, EOL, charset)

## 🔌 API Surface (window.api)

### File Operations
```typescript
window.api.selectFile()                          // Open file dialog
window.api.loadFile(filepath)                    // Load MXF file with metadata
```

### Metadata
```typescript
window.api.extractMetadata(filepath)             // FFprobe metadata extraction
```

### Proxy Operations
```typescript
window.api.findProxy(mxfPath)                    // Find matching proxy file
window.api.generateProxy(mxfPath, quality)       // Generate proxy via FFmpeg
window.api.onProxyProgress(callback)             // Progress events (0-100)
```

### External Drives
```typescript
window.api.getExternalDrives()                   // Scan /Volumes for drives/cards
window.api.getMXFFileInfo(filepath)              // Get file details
window.api.onDriveMounted(callback)              // Drive plug-in events
window.api.onDriveUnmounted(callback)            // Drive removal events
```

### Batch Merge
```typescript
window.api.validateMerge(clipPaths)              // Pre-validate clip compatibility
window.api.mergeClips(mergeOptions)              // Start merge operation
window.api.cancelMerge()                         // Cancel in-progress merge
window.api.selectMergeOutput()                   // Choose output directory
window.api.onMergeProgress(callback)             // Merge progress events
```

### Transcode Playback
```typescript
window.api.startTranscodePlayback(mxfPath)       // MXF → temp MP4 for playback
window.api.cancelTranscodePlayback()             // Cancel transcode
window.api.cleanupTranscodeFile(tempPath)        // Delete temp file
window.api.onTranscodePlaybackProgress(callback) // Transcode progress events
```

### Settings & Export
```typescript
window.api.getSettings()                         // Get app settings
window.api.saveSettings(settings)                // Save settings
window.api.exportFrame(filepath, time)           // Export single frame
window.api.exportClip(filepath, start, end)      // Export clip segment
```

## 📊 State Management (Zustand)

```typescript
useMediaStore()
  .currentFile      // Currently loaded file path
  .metadata         // File metadata (codec, resolution, timecode, etc.)
  .proxy            // Proxy file information (path, exists, resolution)
  .playerState      // Playback state (playing, currentTime, volume, speed)
  .markers          // Timeline markers
  .settings         // App settings (theme, proxy convention, etc.)
  .isLoading        // Loading state flag
  .error            // Error message string
```

## 🧪 Test Coverage

| Test File | Tests | Covers |
|---|---|---|
| `timecode.test.ts` | 30 | SMPTE timecode conversion, drop-frame, round-trips |
| `formatters.test.ts` | 32 | File sizes, durations, bitrates, paths |
| `camera-cards.config.test.ts` | 11 | Sony card detection, path/suffix building |
| `ffmpeg-spawn.test.ts` | 7 | Framerate parsing, binary path resolution |
| `path-utils.test.ts` | 8 | File path security validation |
| `sony-ltc-decode.test.ts` | 10 | Sony hex BCD timecode decoding |
| **Total** | **98** | |

## 📚 Documentation

| Doc | Purpose |
|---|---|
| [README.md](README.md) | User-facing features, install, usage, API |
| [AGENTS.md](AGENTS.md) | Agent coding guide with critical rules |
| [SONY_XML_METADATA.md](SONY_XML_METADATA.md) | Sony XML sidecar format & BCD timecodes |
| [FFMPEG_BATCH_MERGE_PLAN.md](FFMPEG_BATCH_MERGE_PLAN.md) | Batch merge design |
| [MXF_READER_DESIGN.md](MXF_READER_DESIGN.md) | Architecture & UI layout |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Development roadmap |
| This file | Project structure overview |
