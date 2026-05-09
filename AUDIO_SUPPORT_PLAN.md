# Audio File Support — Implementation Plan

> **Status:** Planned — not yet started
> **Prerequisite:** 4 code quality fixes from Phase 3 review are complete and merged.

---

## Overview

Add support for audio files (WAV, AIFF, BWF/BWAV, MP3, AAC) from camera cards and
on-premise media. Common on news/doc shoots alongside video — field recorders
(Zoom F-series, Sound Devices), camera scratch tracks, and music assets.

The app currently supports **video** and **photos** only. This plan extends all three
layers (scanning, metadata, playback/UI) to support audio as a first-class media type.

---

## Phase A — Scanning & Type System

### A1. Drive scanner (`src/main/drives.ts`)

Add audio extensions to the file scanner alongside the existing MXF/MP4/photo scan:

```
.wav  .aiff  .aif  .bwav  .mp3  .aac  .flac
```

Return audio files as part of the `ExternalDrive` payload, parallel to the existing
`VideoFileInfo` array.

### A2. New types (`src/renderer/src/types/index.ts`)

```typescript
export interface AudioFileInfo {
  path: string
  filename: string
  extension: string
  fileSize: number
  duration?: number // seconds (from FFprobe)
  sampleRate?: number // e.g. 48000
  bitDepth?: number // e.g. 24
  channels?: number // 1, 2, 4, 8
  codec?: string // 'PCM' | 'AAC' | 'MP3' | 'FLAC'
  bitrate?: number // bits per second
  createdDate?: string
  bwfDescription?: string // BWF Description chunk
  bwfOriginatorRef?: string // BWF Originator Reference (timecode-syncable)
  timecodeStart?: string // decoded from BWF TimeReference field
}
```

**Files to touch:** `drives.ts`, `types/index.ts`
**Effort:** Small

---

## Phase B — Metadata Extraction

### B1. FFprobe audio probe (`src/main/ffmpeg.ts`)

FFprobe is already bundled and used for video. Add `extractAudioMetadata(filepath)`:

- Duration, sample rate, bit depth, channel count
- BWF metadata tags: `description`, `originator`, `time_reference`
- The BWF `TimeReference` field is a sample count from midnight — convert to
  HH:MM:SS:FF using `timecodeStart = samples / sampleRate`

### B2. IPC handler (`src/main/ipc.ts`)

New channel: `get-audio-file-info`

- Validates path via `validateFilePath()` (existing security guard)
- Calls `extractAudioMetadata()`
- Returns `AudioFileInfo`

### B3. Preload bridge

Per the AGENTS.md IPC checklist — update **all four files**:

| File                              | Change                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `src/renderer/src/types/index.ts` | `AudioFileInfo` type (done in A2)                                    |
| `src/main/ipc.ts`                 | `get-audio-file-info` handler                                        |
| `src/preload/index.ts`            | Expose `getAudioFileInfo(filepath)`                                  |
| `src/preload/index.d.ts`          | Declare `getAudioFileInfo(filepath: string): Promise<AudioFileInfo>` |

**Files to touch:** `ffmpeg.ts`, `ipc.ts`, `preload/index.ts`, `preload/index.d.ts`
**Effort:** Small

---

## Phase C — Playback

### C1. Route audio files in `App.tsx`

`isBrowserNativeFormat()` already returns `true` for `.mp3`/`.aac`. Extend it to cover
`.wav`, `.aiff`, `.flac`. Electron's Chromium supports PCM WAV natively via `local://` —
no FFmpeg transcoding needed for common formats.

Audio files route to the new `AudioPlayer` component instead of `VideoPlayer`.

### C2. New `AudioPlayer.tsx` component (`src/renderer/src/components/`)

- HTML5 `<audio>` element served via `local://` protocol
- **Waveform display** using `wavesurfer.js` (already installed as a dependency)
- Play/pause, scrub, volume controls
- Timecode display (start TC if BWF, else elapsed time)
- Metadata sidebar: sample rate, bit depth, channels, codec, BWF description
- No timeline tick component needed — the waveform IS the timeline

**Styling approach:**

- New design token in `tailwind.config.js`: `'audio': '#8B5CF6'` (purple — distinct from
  video orange and photo blue)
- New badge class in `main.css`: `.badge-audio` (follows the existing badge pattern)
- `text-special font-mono` for sample rate / bit-depth / timecode displays

**Files to touch:** `App.tsx`, new `AudioPlayer.tsx`, `tailwind.config.js`, `main.css`
**Effort:** Medium (waveform wiring is the largest single task)

---

## Phase D — Drive Browser & Merge

### D1. Audio tab in `DriveBrowser.tsx`

The drive browser has Video / Photos tabs today. Add an **Audio** tab.

Each card (`AudioCard` component) shows:

- Filename + format badge (`.badge-audio` with extension label)
- Duration (HH:MM:SS — use existing `formatDurationHMS`)
- Sample rate + bit depth + channel count
- BWF description if present
- Play button → routes to `AudioPlayer`

### D2. Merge panel (`MergePanel.tsx`)

Audio-only merges follow the same lossless concat pattern already used for video.
The merge engine (`merge-engine.ts`) just needs an audio-only FFmpeg concat code path
tested end-to-end. No new UI needed — the existing merge panel handles it once the
audio clip type is passed in.

**Files to touch:** `DriveBrowser.tsx`, `MergePanel.tsx`, `merge-engine.ts`
**Effort:** Medium

---

## Effort Summary

| Phase                        | Files                                                          | Effort |
| ---------------------------- | -------------------------------------------------------------- | ------ |
| A — Types + scanning         | `drives.ts`, `types/index.ts`                                  | Small  |
| B — Metadata + IPC           | `ffmpeg.ts`, `ipc.ts`, `preload/*`                             | Small  |
| C — Playback + AudioPlayer   | `App.tsx`, `AudioPlayer.tsx`, `tailwind.config.js`, `main.css` | Medium |
| D — DriveBrowser tab + Merge | `DriveBrowser.tsx`, `MergePanel.tsx`, `merge-engine.ts`        | Medium |

**Suggested order:** A → B → C → D. Each phase is independently testable.
After each phase, run `npm run build` + `npm test` before moving to the next.
