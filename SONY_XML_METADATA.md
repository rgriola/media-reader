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

## Conclusion

The XML metadata files are **essential** for professional workflows. While MXF and proxy files contain some metadata, the XML provides:
- **Authoritative timecode** for frame-accurate editing
- **Complete camera settings** for color grading
- **User metadata** for organization
- **Technical specs** for validation

**Recommendation**: Parse and store this metadata alongside the MXF file info to enable professional-grade features in your media reader.
