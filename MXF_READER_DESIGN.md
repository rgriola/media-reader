# MXF Media Reader - Design Document

## Overview
This document outlines the architecture and implementation approach for a professional MXF (Material Exchange Format) media reader capable of displaying broadcast-quality recordings in a web environment.

## Technical Challenges

### Native Browser Limitations
- **No native MXF support**: Browsers only support MP4, WebM, HLS, DASH
- **Complex container format**: MXF uses SMPTE standards (377M, 378, etc.)
- **Professional codecs**: Often contains DNxHD, ProRes, JPEG2000, etc.
- **Large file sizes**: Broadcast recordings can be 10GB+

## Architecture Options

### Option 1: Server-Side Transcoding (Recommended for Production)

**Pros:**
- Best performance and compatibility
- Can handle any MXF variant
- Supports adaptive streaming (HLS/DASH)
- Offloads processing from client devices
- Can cache converted files

**Cons:**
- Requires server infrastructure
- Storage costs for transcoded files
- Upload time for large files

**Technology Stack:**
```
Backend:
- Node.js/Python/Go server
- FFmpeg for transcoding
- Redis/PostgreSQL for job queue
- S3/Cloud storage for files

Frontend:
- Video.js or Plyr.js player
- React/Vue for UI
- WebSocket for progress updates
```

**Workflow:**
1. User uploads MXF file
2. Server extracts metadata (timecode, production info, audio channels)
3. Background job transcodes to MP4/WebM + HLS variants
4. Client receives playback URL when ready
5. Player loads adaptive stream

---

### Option 2: Client-Side Processing (ffmpeg.wasm)

**Pros:**
- No server infrastructure needed
- Complete privacy (files never leave device)
- Instant start (no upload wait)
- Lower operational costs

**Cons:**
- Large initial download (~22MB for ffmpeg.wasm)
- Performance depends on client device
- May struggle with large files (>2GB)
- Limited codec support

**Technology Stack:**
```
Frontend Only:
- ffmpeg.wasm for transcoding
- Web Workers for background processing
- IndexedDB for file caching
- Custom HTML5 video player
```

**Workflow:**
1. User selects local MXF file
2. File loaded into browser memory
3. ffmpeg.wasm transcodes in background (Web Worker)
4. Progress bar shows conversion status
5. Converted video plays in HTML5 player
6. Original file never uploaded

---

### Option 3: Hybrid Approach (Best of Both Worlds)

**Pros:**
- Flexibility for different use cases
- Small files: client-side processing
- Large files: server-side processing
- Fallback options

**Cons:**
- More complex implementation
- Need to maintain both code paths

**Decision Logic:**
```javascript
if (fileSize < 500MB && browserSupportsWasm) {
  // Use client-side ffmpeg.wasm
  processClientSide(file);
} else {
  // Upload and transcode server-side
  processServerSide(file);
}
```

---

## Feature Requirements

### Core Features
1. **Video Playback**
   - Play/Pause controls
   - Seek/scrub timeline
   - Playback speed control (0.25x - 2x)
   - Frame-by-frame stepping
   - Fullscreen mode

2. **Metadata Display**
   - File information (codec, resolution, framerate)
   - Timecode display (SMPTE format)
   - Production metadata (camera, scene, take)
   - Audio channel configuration
   - Creation date/time

3. **Professional Tools**
   - Waveform visualization
   - Thumbnail preview on hover
   - Keyboard shortcuts (J/K/L for playback)
   - Export frame as image
   - Clip/trim functionality

### Advanced Features
4. **Multi-track Audio**
   - Individual channel muting
   - Volume control per channel
   - Stereo/mono switching

5. **Analysis Tools**
   - Histogram display
   - Vectorscope
   - Audio levels meter
   - Quality metrics

6. **Collaboration**
   - Timestamp comments/notes
   - Share specific timecode links
   - Export EDL/XML

---

## UI/UX Design Principles

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│  Header: File Info & Controls                   │
├─────────────────────────────────────────────────┤
│                                                  │
│                                                  │
│           Video Player Canvas                    │
│                                                  │
│                                                  │
├─────────────────────────────────────────────────┤
│  Timeline: Waveform + Thumbnails                │
├─────────────────────────────────────────────────┤
│  Controls: Play/Pause, Speed, Volume, etc.      │
├─────────────────────────────────────────────────┤
│  Sidebar: Metadata & Tools (collapsible)        │
└─────────────────────────────────────────────────┘
```

### Visual Design
- **Dark theme** (industry standard for video editing)
- **High contrast** controls for visibility
- **Glassmorphism** for overlay panels
- **Smooth animations** for professional feel
- **Monospace fonts** for timecode display

---

## Implementation Roadmap

### Phase 1: MVP (Week 1-2)
- [ ] Basic file upload/selection
- [ ] Server-side FFmpeg transcoding
- [ ] Simple HTML5 video player
- [ ] Basic metadata extraction
- [ ] Timecode display

### Phase 2: Enhanced Player (Week 3-4)
- [ ] Custom video player UI
- [ ] Waveform visualization
- [ ] Thumbnail preview
- [ ] Keyboard shortcuts
- [ ] Frame-by-frame controls

### Phase 3: Professional Tools (Week 5-6)
- [ ] Multi-track audio support
- [ ] Export functionality
- [ ] Analysis tools (histogram, etc.)
- [ ] Collaboration features

### Phase 4: Optimization (Week 7-8)
- [ ] Client-side processing option
- [ ] Adaptive streaming (HLS)
- [ ] Performance optimization
- [ ] Mobile responsive design

---

## Technology Recommendations

### Recommended Stack for Full Implementation

**Backend:**
- **Runtime**: Node.js (Express) or Python (FastAPI)
- **Transcoding**: FFmpeg (via fluent-ffmpeg or python-ffmpeg)
- **Queue**: Bull (Redis-based) for job processing
- **Storage**: AWS S3 or local filesystem
- **Database**: PostgreSQL for metadata

**Frontend:**
- **Framework**: React or Vue 3
- **Video Player**: Video.js (extensible, professional)
- **Waveform**: WaveSurfer.js
- **UI Components**: Custom components with Tailwind CSS
- **State Management**: Zustand or Pinia

**Optional Client-Side:**
- **ffmpeg.wasm**: For browser-based transcoding
- **Web Workers**: For background processing
- **IndexedDB**: For caching

---

## Code Examples

### Server-Side Transcoding (Node.js + FFmpeg)

```javascript
const ffmpeg = require('fluent-ffmpeg');

async function transcodeMXF(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',      // H.264 video codec
        '-preset medium',     // Encoding speed/quality
        '-crf 23',           // Quality (lower = better)
        '-c:a aac',          // AAC audio codec
        '-b:a 192k',         // Audio bitrate
        '-movflags +faststart' // Web optimization
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}
```

### Metadata Extraction

```javascript
async function extractMXFMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
      
      resolve({
        duration: metadata.format.duration,
        fileSize: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        video: {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          framerate: eval(videoStream.r_frame_rate), // e.g., "24000/1001"
          pixelFormat: videoStream.pix_fmt
        },
        audio: audioStreams.map(stream => ({
          codec: stream.codec_name,
          channels: stream.channels,
          sampleRate: stream.sample_rate,
          bitrate: stream.bit_rate
        })),
        timecode: metadata.format.tags?.timecode || 'N/A'
      });
    });
  });
}
```

### Client-Side Processing (ffmpeg.wasm)

```javascript
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

async function convertMXFInBrowser(file) {
  const ffmpeg = createFFmpeg({ 
    log: true,
    progress: ({ ratio }) => {
      console.log(`Progress: ${(ratio * 100).toFixed(2)}%`);
    }
  });
  
  await ffmpeg.load();
  
  // Write input file to virtual filesystem
  ffmpeg.FS('writeFile', 'input.mxf', await fetchFile(file));
  
  // Run conversion
  await ffmpeg.run(
    '-i', 'input.mxf',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-c:a', 'aac',
    'output.mp4'
  );
  
  // Read output file
  const data = ffmpeg.FS('readFile', 'output.mp4');
  
  // Create blob URL for playback
  const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
  return URL.createObjectURL(videoBlob);
}
```

---

## Performance Considerations

### Server-Side
- **Parallel processing**: Use job queue for multiple files
- **Caching**: Store transcoded files, don't re-process
- **Adaptive streaming**: Generate multiple quality variants
- **CDN**: Serve video files from edge locations

### Client-Side
- **Lazy loading**: Load player components on demand
- **Web Workers**: Keep UI responsive during processing
- **Chunk processing**: Handle large files in segments
- **Memory management**: Clean up blob URLs when done

---

## Security Considerations

1. **File validation**: Check file type and size before processing
2. **Sandboxing**: Run FFmpeg in isolated environment
3. **Rate limiting**: Prevent abuse of transcoding service
4. **Authentication**: Require login for uploads
5. **Encryption**: Use HTTPS for all transfers
6. **Temporary files**: Clean up after processing

---

## Cost Estimation (Server-Side Approach)

**Infrastructure:**
- Server: $20-100/month (depending on scale)
- Storage: $0.023/GB/month (AWS S3)
- Bandwidth: $0.09/GB (egress)
- Transcoding: CPU-intensive, ~$0.01-0.05 per minute of video

**Example:**
- 100 users uploading 10GB each/month
- 1TB storage: ~$23/month
- 1TB bandwidth: ~$90/month
- Server: ~$50/month
- **Total: ~$163/month**

---

## Conclusion

For a **professional MXF media reader**, I recommend:

1. **Start with server-side transcoding** (Option 1) for reliability
2. **Use Video.js** as the player foundation
3. **Build custom UI** for professional tools
4. **Add client-side processing** (Option 3) as enhancement later

This approach provides the best balance of performance, compatibility, and user experience for professional broadcast workflows.
