# MXF Media Reader

A professional Electron-based media reader for MXF (Material Exchange Format) files with proxy file support, built with React, TypeScript, and Tailwind CSS.

## Features

- ✅ **MXF File Support**: Read and display professional MXF recordings
- ✅ **Proxy File Detection**: Automatically detect and use proxy files (MP4/MOV)
- ✅ **Metadata Extraction**: Display comprehensive file metadata (codec, resolution, timecode, etc.)
- ✅ **Professional Playback Controls**: Frame-by-frame stepping, playback speed control
- ✅ **SMPTE Timecode Display**: Professional timecode format (HH:MM:SS:FF)
- ✅ **Multi-channel Audio**: Support for multiple audio tracks
- ✅ **Export Functionality**: Export frames and clip segments
- ✅ **Dark Theme**: Professional dark interface optimized for video work
- ✅ **Keyboard Shortcuts**: J/K/L playback controls and more

## Technology Stack

### Frontend

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite + Electron-Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Video Player**: HTML5 Video (with proxy files)

### Backend (Electron Main Process)

- **Runtime**: Electron 39
- **Media Processing**: FFmpeg (fluent-ffmpeg)
- **Settings Storage**: electron-store
- **IPC**: Electron IPC for main-renderer communication

## Project Structure

```
Media-Reader/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts            # Main entry point
│   │   ├── ipc.ts              # IPC handlers
│   │   └── ffmpeg.ts           # FFmpeg integration
│   ├── preload/                # Preload scripts
│   │   ├── index.ts            # API exposure
│   │   └── index.d.ts          # Type definitions
│   └── renderer/               # React app
│       ├── index.html
│       └── src/
│           ├── App.tsx         # Main app component
│           ├── components/     # React components
│           │   ├── player/     # Video player components
│           │   ├── metadata/   # Metadata display
│           │   ├── controls/   # Playback controls
│           │   └── waveform/   # Audio waveform
│           ├── hooks/          # Custom React hooks
│           ├── store/          # Zustand stores
│           │   └── mediaStore.ts
│           ├── types/          # TypeScript types
│           │   └── index.ts
│           ├── utils/          # Utility functions
│           │   └── formatters.ts
│           └── assets/         # CSS and images
│               └── main.css
├── build/                      # Build resources
├── resources/                  # App resources
├── electron-builder.yml        # Build configuration
├── package.json
└── README.md
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

- Start the Vite dev server for hot reloading
- Launch the Electron app
- Open DevTools automatically

### Build for Production

```bash
npm run build
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

### Opening Files

1. **File Menu**: Use the "Open File" option
2. **Drag & Drop**: Drag MXF files onto the app window
3. **Recent Files**: Access recently opened files

### Proxy Files

The app automatically detects proxy files using these naming conventions:

**Suffix Convention** (default):

- `filename.mxf` → `filename_proxy.mp4`
- `filename.mxf` → `filename.mp4`

**Folder Convention**:

- `filename.mxf` → `proxies/filename.mp4`

Configure in Settings to change the convention.

### Keyboard Shortcuts

- `Space`: Play/Pause
- `→`: Next frame
- `←`: Previous frame
- `L`: Speed up playback
- `J`: Slow down playback
- `K`: Normal speed
- `F`: Fullscreen

### Generating Proxies

If no proxy file is found, you can generate one:

1. Click "Generate Proxy" button
2. Select quality (720p, 1080p, 2160p)
3. Wait for conversion to complete

### Exporting

- **Export Frame**: Right-click on video → "Export Frame"
- **Export Clip**: Select in/out points → "Export Clip"

## Configuration

### Settings

Access settings via the menu or `Cmd/Ctrl + ,`:

- **Proxy Quality**: Default quality for proxy generation
- **Naming Convention**: How to find proxy files
- **Keyboard Shortcuts**: Customize shortcuts
- **Theme**: Dark/Light mode

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
await window.api.generateProxy(mxfPath, '1080p')

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

### Proxy Files Not Detected

- Check naming convention in Settings
- Ensure proxy files are in the correct location
- Try both suffix and folder conventions

### Video Won't Play

- Ensure you're using a proxy file (MP4/MOV)
- MXF files may not play directly in browser
- Generate a proxy file if needed

### Performance Issues

- Use lower quality proxies (720p instead of 1080p)
- Close other applications
- Check available RAM

## Development Roadmap

### Phase 1: Core Functionality ✅

- [x] Project setup
- [x] File loading
- [x] Metadata extraction
- [x] Basic playback
- [x] Proxy detection

### Phase 2: Enhanced Player (In Progress)

- [ ] Custom video player UI
- [ ] Waveform visualization
- [ ] Thumbnail timeline
- [ ] Frame-by-frame controls
- [ ] Keyboard shortcuts

### Phase 3: Professional Tools

- [ ] Multi-track audio mixer
- [ ] Color scopes (histogram, vectorscope)
- [ ] Markers and annotations
- [ ] EDL/XML export
- [ ] Batch proxy generation

### Phase 4: Collaboration

- [ ] Comments/notes system
- [ ] Share timecode links
- [ ] Export reports
- [ ] Team settings sync

## Contributing

This is an internal tool, but contributions are welcome:

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Proprietary - Internal Use Only

## Support

For issues or questions, contact the development team.

---

**Built with ❤️ for professional video workflows**
