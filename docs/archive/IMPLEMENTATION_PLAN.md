# MXF Media Reader - Implementation Plan

## Project Status: ✅ Initial Setup Complete

### Completed
- [x] Electron + React + TypeScript project scaffolding
- [x] Tailwind CSS configuration
- [x] Project structure created
- [x] Type definitions for MXF metadata and API
- [x] Zustand store for state management
- [x] Utility functions (timecode, formatters)
- [x] FFmpeg integration module
- [x] IPC handlers for main-renderer communication
- [x] Preload script with custom API
- [x] Main process configuration
- [x] Comprehensive README

## Next Steps

### Phase 1: Basic UI Components (Next)

#### 1. Update App.tsx
Create the main application layout with:
- Header with file selection
- Video player area
- Metadata sidebar
- Controls bar

#### 2. Create FileSelector Component
```typescript
// src/renderer/src/components/FileSelector.tsx
- Button to open file dialog
- Drag & drop zone
- Recent files list
- Loading state
```

#### 3. Create VideoPlayer Component
```typescript
// src/renderer/src/components/player/VideoPlayer.tsx
- HTML5 video element
- Play/pause controls
- Seek bar
- Volume control
- Fullscreen toggle
```

#### 4. Create MetadataPanel Component
```typescript
// src/renderer/src/components/metadata/MetadataPanel.tsx
- File information display
- Video codec details
- Audio streams info
- Timecode display
- Production metadata (if available)
```

#### 5. Create PlaybackControls Component
```typescript
// src/renderer/src/components/controls/PlaybackControls.tsx
- Play/Pause button
- Frame forward/backward
- Playback speed selector
- Current time / duration display
- Export buttons
```

### Phase 2: Integration & Functionality

#### 6. Create useMediaFile Hook
```typescript
// src/renderer/src/hooks/useMediaFile.ts
- Load file logic
- Metadata extraction
- Proxy detection
- Error handling
```

#### 7. Create useVideoPlayer Hook
```typescript
// src/renderer/src/hooks/useVideoPlayer.ts
- Video element ref management
- Playback state
- Time updates
- Keyboard shortcuts
```

#### 8. Wire Up IPC Communication
- Connect file selection to Electron API
- Load metadata on file open
- Display proxy status
- Handle errors gracefully

### Phase 3: Enhanced Features

#### 9. Waveform Visualization
```typescript
// src/renderer/src/components/waveform/Waveform.tsx
- Integrate WaveSurfer.js
- Display audio waveform
- Sync with video playback
- Click to seek
```

#### 10. Timeline Component
```typescript
// src/renderer/src/components/player/Timeline.tsx
- Thumbnail preview on hover
- Markers support
- In/Out points for export
```

#### 11. Keyboard Shortcuts
```typescript
// src/renderer/src/hooks/useKeyboardShortcuts.ts
- J/K/L playback controls
- Frame stepping
- Fullscreen toggle
- Export shortcuts
```

#### 12. Settings Panel
```typescript
// src/renderer/src/components/settings/SettingsPanel.tsx
- Proxy quality selection
- Naming convention toggle
- Keyboard shortcut customization
- Theme toggle
```

### Phase 4: Polish & Testing

#### 13. Error Handling
- File loading errors
- FFmpeg errors
- Proxy generation errors
- User-friendly error messages

#### 14. Loading States
- File loading spinner
- Metadata extraction progress
- Proxy generation progress
- Skeleton loaders

#### 15. Performance Optimization
- Lazy load components
- Memoize expensive calculations
- Optimize re-renders
- Clean up resources

#### 16. Testing
- Test with various MXF files
- Test proxy detection
- Test export functionality
- Cross-platform testing (if needed)

## File Creation Order

### Immediate Next Steps (Start Here)

1. **Create Basic Layout** (`App.tsx`)
   - Main application structure
   - Routing (if needed)
   - Global error boundary

2. **File Selector** (`components/FileSelector.tsx`)
   - Open file dialog
   - Display selected file
   - Recent files

3. **Video Player** (`components/player/VideoPlayer.tsx`)
   - Basic HTML5 video
   - Play/pause
   - Seek functionality

4. **Metadata Display** (`components/metadata/MetadataPanel.tsx`)
   - Show file info
   - Format metadata nicely
   - Use utility formatters

5. **Playback Controls** (`components/controls/PlaybackControls.tsx`)
   - Control buttons
   - Time display
   - Speed control

6. **Custom Hooks** (`hooks/`)
   - `useMediaFile.ts` - File loading logic
   - `useVideoPlayer.ts` - Player state management
   - `useKeyboardShortcuts.ts` - Keyboard handling

## Code Style Guidelines

### Component Structure
```typescript
import React from 'react';
import { useMediaStore } from '../store/mediaStore';

interface ComponentProps {
  // Props here
}

export function ComponentName({ prop }: ComponentProps) {
  // Hooks
  const store = useMediaStore();
  
  // State
  const [state, setState] = React.useState();
  
  // Effects
  React.useEffect(() => {
    // Effect logic
  }, []);
  
  // Handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Render
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
}
```

### Tailwind Usage
- Use Tailwind classes for styling
- Create custom classes in `main.css` for reusable patterns
- Use `glass` class for glassmorphism effects
- Use `timecode` class for monospace timecode display

### State Management
- Use Zustand store for global state
- Use local state for component-specific state
- Keep state minimal and derived where possible

## Testing Strategy

### Manual Testing Checklist
- [ ] Open MXF file
- [ ] Detect proxy file
- [ ] Display metadata correctly
- [ ] Play proxy video
- [ ] Pause/resume playback
- [ ] Seek to different times
- [ ] Frame-by-frame stepping
- [ ] Change playback speed
- [ ] Export single frame
- [ ] Export clip segment
- [ ] Generate proxy file
- [ ] Save/load settings
- [ ] Keyboard shortcuts work

### Test Files Needed
- Sample MXF file (with proxy)
- Sample MXF file (without proxy)
- Various codecs (ProRes, DNxHD, etc.)
- Different resolutions
- Different framerates

## Known Issues to Address

### TypeScript Errors
The following TypeScript errors need to be fixed:

1. **FFmpeg metadata typing** - Add proper types for fluent-ffmpeg
2. **Type imports** - Move shared types to a common location
3. **Tailwind CSS linting** - Configure CSS linting to recognize Tailwind directives

### Solutions
```bash
# Install FFmpeg types
npm install -D @types/fluent-ffmpeg

# Create shared types folder
# Move types from renderer to shared location
```

## Build & Distribution

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run build:mac
```

### Distribution Checklist
- [ ] Update version in package.json
- [ ] Update app icon
- [ ] Test build on clean machine
- [ ] Create release notes
- [ ] Package DMG
- [ ] Share with team

## Resources

### Documentation
- [Electron Docs](https://www.electronjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Zustand](https://github.com/pmndrs/zustand)
- [FFmpeg](https://ffmpeg.org/documentation.html)

### Similar Projects
- DaVinci Resolve (inspiration for UI)
- Adobe Premiere Pro (professional controls)
- VLC Media Player (playback features)

## Timeline Estimate

- **Phase 1** (Basic UI): 2-3 days
- **Phase 2** (Integration): 2-3 days
- **Phase 3** (Enhanced Features): 3-4 days
- **Phase 4** (Polish): 2-3 days

**Total**: ~2 weeks for full implementation

## Success Criteria

The project is successful when:
1. ✅ Users can open MXF files
2. ✅ Proxy files are automatically detected and used
3. ✅ Metadata is accurately displayed
4. ✅ Video playback is smooth and responsive
5. ✅ Keyboard shortcuts work intuitively
6. ✅ Export functionality works reliably
7. ✅ App is easy to distribute to team members
8. ✅ Performance is acceptable on target hardware

---

**Ready to start Phase 1: Basic UI Components!**
