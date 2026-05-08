## What this repo is

Electron + React + TypeScript desktop app for browsing camera media (especially Sony card structures), reading MXF metadata, playing proxy or live-transcoded MXF, and batch-merging clips.

## Architecture (high level)

Main process: /home/runner/work/media-reader/media-reader/src/main
App/window/bootstrap + custom protocols: index.ts
IPC handlers + settings + orchestration: ipc.ts
Media ops via ffmpeg/ffprobe spawn wrappers: ffmpeg.ts, ffmpeg-spawn.ts
Drive/card scanning + XML parsing + mount watch: drives.ts
Batch merge engine: merge-engine.ts
Camera-card conventions: camera-cards.config.ts
Preload bridge: /home/runner/work/media-reader/media-reader/src/preload/index.ts
Renderer: /home/runner/work/media-reader/media-reader/src/renderer/src
App shell: App.tsx
Main UX: components/DriveBrowser.tsx, VideoPlayer.tsx, MergePanel.tsx
State: store/mediaStore.ts (Zustand)
Shared logic: /home/runner/work/media-reader/media-reader/src/shared/timecode.ts

## Core runtime flows

Renderer requests file/drive actions via window.api (preload).
Main validates paths (home + /Volumes), probes/transcodes/merges with FFmpeg.
Playback path:
Proxy exists → local:// protocol serves file stream.
No proxy → mxfstream:// protocol spawns ffmpeg live transcode stream.
Merge flow:
Validate clips → choose lossless concat or re-encode → progress via IPC events.

## Important strengths

Clear main/preload/renderer separation with contextIsolation + sandbox.
Path validation is present for most file IPC operations.
Custom streaming protocols support seek and range handling.
Merge pipeline has compatibility checks + cancellation.

## Risks / weak points

No tests (no test files found), so regressions are likely during refactors.
Docs drift: README/PROJECT_STRUCTURE include stale references (some features/deps mismatch actual code).
Renderer has very large components (DriveBrowser, VideoPlayer) with mixed UI/business logic.
Platform assumptions are largely macOS-centric (/Volumes, mount parsing).
CSP still allows 'unsafe-inline' and 'unsafe-eval' in index.ts.

## Build/quality commands

From package.json:

npm run lint
npm run typecheck
npm run build (No test command currently.) 7) Guidance for future agents
For backend/media behavior: start in src/main/ipc.ts and trace into ffmpeg.ts / merge-engine.ts.
For playback bugs: check protocol logic in src/main/index.ts + renderer/components/VideoPlayer.tsx.
For drive/card detection issues: src/main/drives.ts + camera-cards.config.ts.
Keep changes surgical; this app is tightly coupled through IPC contracts and shared types.
