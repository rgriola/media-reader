# Sony XDCAM XML Metadata Files

## Overview

Sony XDCAM cameras create XML sidecar files alongside each MXF video file. These XML files contain critical metadata about the recording that may not be fully embedded in the MXF or proxy files themselves.

## File Structure

For each MXF file, Sony creates a corresponding XML file:
```
/XDROOT/Clip/918_0990.MXF     ← Video file
/XDROOT/Clip/918_0990M01.XML  ← Metadata file
```

## What's in the XML Files?

### 1. **Timecode Information** ⏱️
- **Start Timecode**: The exact timecode where recording began
- **Duration**: Precise frame count and duration
- **Drop Frame vs Non-Drop Frame**: Critical for accurate editing
- **Frame Rate**: 23.98, 24, 25, 29.97, 30, 50, 59.94, 60 fps

**Why it matters**: MXF and proxy files may have embedded timecode, but the XML provides the authoritative source. This is essential for:
- Multi-camera sync
- Conforming to edit decision lists (EDLs)
- Matching to audio recordings
- Professional post-production workflows

### 2. **Camera Settings** 📹
- **Lens Information**: Focal length, iris, zoom position
- **White Balance**: Color temperature settings
- **Gain/ISO**: Sensitivity settings
- **Shutter Speed**: Exposure settings
- **Picture Profile**: Color grading presets used

### 3. **Recording Format** 🎬
- **Codec**: MPEG HD422, XAVC, etc.
- **Resolution**: 1920x1080, 3840x2160, etc.
- **Bit Rate**: 50Mbps, 100Mbps, etc.
- **Color Space**: Rec.709, Rec.2020, S-Log, etc.

### 4. **GPS & Location Data** 🗺️
- **Coordinates**: Latitude/Longitude (if camera has GPS)
- **Altitude**: Elevation data
- **Timestamp**: When and where the clip was recorded

### 5. **User Metadata** 📝
- **Clip Name**: Custom naming
- **Shot Mark**: In/Out points marked in-camera
- **User Bits**: Custom metadata fields
- **Planning Metadata**: Scene, take, camera roll info

### 6. **Technical Metadata** ⚙️
- **Audio Channels**: Number and configuration
- **Audio Sample Rate**: 48kHz, etc.
- **Aspect Ratio**: 16:9, 4:3, etc.
- **Scan Type**: Progressive or Interlaced

## Use Cases for This Application

### **Immediate Uses:**

1. **Display Accurate Timecode**
   - Show start TC in the file browser
   - Essential for editors to identify clips

2. **Proxy Validation**
   - Verify proxy and MXF have matching timecode
   - Ensure frame-accurate proxy playback

3. **Metadata Display**
   - Show camera settings in UI
   - Help users identify clips without playing them

4. **Search & Filter**
   - Filter by frame rate
   - Search by date/time
   - Find clips by location (if GPS data present)

### **Future Enhancements:**

1. **Timeline Integration**
   - Use timecode for accurate scrubbing
   - Display TC overlay during playback

2. **Multi-Cam Sync**
   - Auto-sync clips based on timecode
   - Group clips shot simultaneously

3. **Export Metadata**
   - Generate EDLs with accurate timecode
   - Export to editing software (Premiere, Resolve, etc.)

4. **Clip Validation**
   - Verify MXF integrity
   - Check for timecode breaks

## XML Structure Example

### Older Sony cameras (PMW, PDW) — plain text timecodes

```xml
<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.00">
  <Duration value="00:00:10:00"/>
  <LtcChangeTable tcFps="30" tcDropFrame="false">
    <LtcChange frameCount="0" value="01:00:00:00"/>
  </LtcChangeTable>
  <CreationDate value="2024-01-15"/>
  <LastUpdateDate value="2024-01-15"/>
  <Device manufacturer="Sony" modelName="PMW-300K1" serialNo="12345"/>
  <VideoFormat>
    <VideoFrame videoCodec="MPEG HD422" captureFps="30p">
      <VideoLayout pixel="1920x1080" aspectRatio="16:9"/>
    </VideoFrame>
  </VideoFormat>
  <AudioFormat>
    <AudioTrack audioCodec="PCM" sampleRate="48kHz" bitsPerSample="24"/>
  </AudioFormat>
</NonRealTimeMeta>
```

### Modern Sony Cinema Line (FX6, FX9, Venice) — hex-encoded BCD timecodes

```xml
<?xml version="1.0" encoding="UTF-8"?>
<NonRealTimeMeta xmlns="urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.00"
                 lastUpdate="2026-04-04T19:02:33-05:00">
  <Duration value="710"/>
  <LtcChangeTable tcFps="30" halfStep="false" tcDropFrame="false">
    <LtcChange frameCount="0" value="48090219" status="increment"/>
    <LtcChange frameCount="709" value="38330319" status="end"/>
  </LtcChangeTable>
  <CreationDate value="2026-04-04T19:02:09-05:00"/>
  <VideoFormat>
    <VideoFrame videoCodec="AVC100CBG_1920_1080_H422IP@L41" captureFps="29.97p">
      <VideoLayout pixel="1920x1080" aspectRatio="16:9"/>
    </VideoFrame>
  </VideoFormat>
  <AudioFormat numOfTrack="4">
    <AudioTrack audioCodec="LPCM16" sampleRate="48000"/>
  </AudioFormat>
</NonRealTimeMeta>
```

---

## ⚠️ Sony LTC Hex-Encoded BCD Timecodes

> **Critical encoding detail.** Modern Sony Cinema Line cameras (FX6, FX9, Venice,
> FX3, FX30) store the `LtcChange @_value` as an **8-character hex string** — NOT
> a plain timecode string. Older cameras (PMW, PDW series) may use colon-separated
> strings like `"01:00:00:00"`. The decoder must handle both.

### Byte Layout

The 8-hex-char string represents 4 bytes in the order: **FF SS MM HH** (little-endian)

```
  48090219
  ├──┤├──┤├──┤├──┤
  FF  SS  MM  HH
```

### BCD Decoding with SMPTE Flag Masking

Each byte uses Binary-Coded Decimal (BCD). The high bits carry SMPTE control flags
(drop-frame, color frame, etc.) and must be masked before decoding:

| Component | Byte position | Mask   | Valid range |
| --------- | ------------- | ------ | ----------- |
| Frames    | byte 0 (MSB)  | `0x3F` | 0–29 (30fps), 0–23 (24fps) |
| Seconds   | byte 1        | `0x7F` | 0–59        |
| Minutes   | byte 2        | `0x7F` | 0–59        |
| Hours     | byte 3 (LSB)  | `0x3F` | 0–23        |

### Decoding Algorithm

```typescript
// 1. Parse hex string as 32-bit integer
const val = parseInt('48090219', 16)

// 2. Extract bytes (FF SS MM HH from MSB to LSB)
const ffRaw = (val >>> 24) & 0xFF  // 0x48
const ssRaw = (val >>> 16) & 0xFF  // 0x09
const mmRaw = (val >>>  8) & 0xFF  // 0x02
const hhRaw = (val       ) & 0xFF  // 0x19

// 3. Mask SMPTE flags, then BCD-decode
const bcd = (byte) => ((byte >> 4) & 0x0F) * 10 + (byte & 0x0F)
const ff = bcd(ffRaw & 0x3F)  // 0x08 → 8
const ss = bcd(ssRaw & 0x7F)  // 0x09 → 9
const mm = bcd(mmRaw & 0x7F)  // 0x02 → 2
const hh = bcd(hhRaw & 0x3F)  // 0x19 → 19

// Result: 19:02:09:08
```

### Real-World Examples (Sony FX6, 29.97fps NDF)

| Hex value    | Decoded TC      | Notes                        |
| ------------ | --------------- | ---------------------------- |
| `48090219`   | `19:02:09:08`   | First clip of session        |
| `57510219`   | `19:02:51:17`   | 42s after first clip         |
| `60000220`   | `20:02:00:20`   | Crosses hour boundary        |
| `29595923`   | `23:59:59:29`   | End-of-day max TC            |
| `00000000`   | `00:00:00:00`   | Midnight / reset             |

### Duration vs Timecode

| Field              | Format       | Example    | Meaning                      |
| ------------------ | ------------ | ---------- | ---------------------------- |
| `Duration @_value` | Frame count  | `"710"`    | Total frames (710 ÷ 29.97 ≈ 23.69s) |
| `LtcChange @_value`| Hex BCD TC   | `"48090219"`| SMPTE timecode at that point |
| `LtcChange @_frameCount` | Frame offset | `"0"`, `"709"` | Frame position within clip |

### Framerate Considerations

- The BCD hex decoder is **framerate-agnostic** — it decodes bytes to HH:MM:SS:FF
  regardless of capture rate
- `tcFps` in the XML is the TC clock rate (usually 24 or 30), not the capture rate
- `captureFps` (e.g., `29.97p`, `23.98p`, `59.94p`, `120p` for slo-mo) is the actual
  recording rate. For slo-motion, TC still runs at the configured `tcFps` rate
- The `halfStep` attribute relates to NDF timecode at fractional rates (29.97, 23.976)

### Implementation

The decoder lives in `src/main/drives.ts` → `decodeSonyLtcHex()`.
Tests are in `src/main/__tests__/sony-ltc-decode.test.ts`.

The `formatTimecode()` function tries three strategies in order:
1. If the value already has colons/semicolons → return as-is (older cameras)
2. If it's an 8-char hex string → decode via `decodeSonyLtcHex()` (modern cameras)
3. Otherwise → treat as a frame count and convert via `framesToTimecode()`

---

## ⚠️ SMPTE Timecode Math — Rounded FPS Rule

> **Critical pitfall.** All SMPTE timecode arithmetic must use `Math.round(framerate)`
> for EVERY multiplication and division. Mixing the real rate (29.97) with the rounded
> rate (30) causes **cumulative drift** that grows with the timecode value.

### The Problem

When converting between seconds and timecode at non-integer frame rates (29.97, 23.976, 59.94):

```typescript
// ❌ WRONG — causes ~1 minute drift by TC hour 19
const frames = Math.round(seconds * 29.97)  // multiplied by REAL fps
const ff = frames % 30                       // divided by ROUNDED fps
// Error: 1 extra frame every ~33 seconds → 68.4 seconds at 19 hours
```

```typescript
// ✅ CORRECT — zero drift at any timecode value
const roundedFps = Math.round(29.97)          // = 30
const frames = Math.round(seconds * roundedFps) // multiplied by ROUNDED fps
const ff = frames % roundedFps                  // divided by ROUNDED fps
```

### Why This Happens

SMPTE timecode is a **display format**, not a real-time clock. At 29.97fps:
- The timecode **pretends** to run at 30fps
- Drop-frame mode compensates by skipping frame numbers periodically
- Non-drop-frame mode simply drifts from real time (intentionally)

The `framesToTimecode()` function divides frame counts by `roundedFps` (30).
If `secondsToTimecode()` multiplies by the real rate (29.97), those two operations
are asymmetric — the frame count is ~0.1% too small, and the error compounds linearly
with the timecode value.

### The Rule

**Always use `Math.round(framerate)` for all frame ↔ time conversions.**

This is enforced in the shared utility at `src/shared/timecode.ts`.

### Shared Timecode Utility

**Location**: `src/shared/timecode.ts` — importable from both main and renderer processes.

**Renderer import**: `import { ... } from '../utils/formatters'` (re-exports from shared)

| Function | Purpose |
|---|---|
| `framesToTimecode(frames, fps, dropFrame?)` | Frame count → `HH:MM:SS:FF` string |
| `timecodeToFrames(tc, fps)` | `HH:MM:SS:FF` string → frame count (exact inverse) |
| `secondsToTimecode(secs, fps, dropFrame?)` | Seconds → `HH:MM:SS:FF` (uses rounded fps internally) |
| `timecodeToSeconds(tc, fps)` | `HH:MM:SS:FF` → seconds (uses rounded fps internally) |
| `isDropFrameRate(fps)` | Check if rate is 29.97 or 59.94 |

**Usage pattern for playback overlay** (VideoPlayer):

```typescript
// Convert start TC to frames (no floating-point drift)
const startFrames = timecodeToFrames('19:02:09:08', 29.97)   // = 2055878

// Convert elapsed seconds to frames using the same rounded fps
const elapsedFrames = Math.round(elapsedSeconds * Math.round(29.97)) // uses 30

// Add and convert back — all arithmetic stays in frame domain
const displayTC = framesToTimecode(startFrames + elapsedFrames, 29.97, false)
// Result: "19:02:16:08" (exactly 7 seconds later — no drift)
```

**Tests**: `src/shared/__tests__/timecode.test.ts` — 41 tests including high-TC-value
round-trip regression tests that verify zero drift at 19+ hours.

## Implementation Recommendations

### **Phase 1: Parse & Display**
1. Parse XML files when scanning MXF files
2. Extract timecode and basic metadata
3. Display in file browser UI

### **Phase 2: Proxy Playback**
1. Use XML timecode for accurate scrubbing
2. Display TC overlay during playback
3. Validate proxy/MXF sync

### **Phase 3: Advanced Features**
1. Multi-cam sync based on TC
2. Export EDL/XML for editing software
3. GPS mapping of shooting locations

## Technical Notes

- **XML Schema**: Sony uses the `NonRealTimeMeta` schema
- **Namespace**: `urn:schemas-professionalDisc:nonRealTimeMeta:ver.2.00`
- **Encoding**: UTF-8
- **File Size**: Typically 5-20KB per clip
- **Timecode encoding**: Modern cameras use hex-encoded BCD (see section above);
  older cameras use plain `HH:MM:SS:FF` strings
- **MXF timecode**: The MXF file itself also contains embedded timecode accessible
  via FFprobe (`format.tags.timecode`), but the XML sidecar is the authoritative
  source with richer data (drop-frame flag, frame-accurate change points)

## Conclusion

The XML metadata files are **essential** for professional workflows. While MXF and proxy files contain some metadata, the XML provides:
- **Authoritative timecode** for frame-accurate editing
- **Complete camera settings** for color grading
- **User metadata** for organization
- **Technical specs** for validation

**Recommendation**: Parse and store this metadata alongside the MXF file info to enable professional-grade features in your media reader.
