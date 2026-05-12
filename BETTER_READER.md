# MXF Media Reader — Evaluation & Improvement Plan

> Generated: April 12, 2026
> Last updated: 2026-05-12

- next itemt to address is Audio only support.

---

## Project Overview

A professional Electron + React app for browsing Sony camera cards, playing MXF video files, reviewing still photos, and viewing production metadata. The core architecture (main/preload/renderer separation, Zustand store, TypeScript types) is well thought out. The project is roughly at a "functional prototype" stage — solid foundations but several critical gaps before it's production-ready.

**Overall Rating: 8/10**

> **Note (user):** ffmpeg may need an update. A security issue was found recently.
> **Resolved:** `npm audit fix` applied April 12 2026 — all 18 vulnerabilities patched (including CRITICAL `fast-xml-parser`, HIGH `electron`, `vite`). Zero remaining.
> **Re-audited:** May 12, 2026 — 6 new vulnerabilities (PostCSS) resolved with `npm audit fix`. Zero remaining.

---

## Full Findings

### Critical Issues

| #   | Issue                                     | File               | Details                                                                                               |
| --- | ----------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| C1  | Memory leak: drive event listeners        | `DriveBrowser.tsx` | `onDriveMounted` / `onDriveUnmounted` never cleaned up; new listener added on every remount           |
| C2  | No React Error Boundary                   | `App.tsx`          | Any component throw = blank app                                                                       |
| C3  | FFmpeg has no timeout                     | `ffmpeg.ts`        | `generateProxy()` / `exportClip()` can hang forever on corrupted/large files                          |
| C4  | `sandbox: false`                          | `index.ts (main)`  | Sandbox disabled; `contextIsolation: true` partially mitigates but correct posture is `sandbox: true` |
| C5  | Directory traversal in `local://` handler | `index.ts (main)`  | Path normalization never strips `..` sequences                                                        |

### High-Priority Issues

| #   | Issue                               | File              | Details                                                          |
| --- | ----------------------------------- | ----------------- | ---------------------------------------------------------------- |
| H1  | Audio channel toggle non-functional | `VideoPlayer.tsx` | CH1–CH8 UI updates state but never affects actual audio playback |

| H2 | `fluent-ffmpeg` is abandoned | `package.json` | Last meaningful update ~2019; uses `as any` on ffprobe output |
| H3 | Duplicate timecode logic in 3 places | `formatters.ts`, `VideoPlayer.tsx`, `drives.ts` | Should be consolidated in `formatters.ts` |
| H4 | Drop-frame timecode only handles 29.97 fps | `drives.ts` | 59.94 fps (common on FX6) uses different drop counts → wrong timecodes |
| H5 | macOS-only paths and commands | `drives.ts`, `ffmpeg.ts` | `/Volumes`, `execSync('mount')`, FFprobe paths are all darwin-specific |
H5 - Right now this is mac centric so its fine.

### Medium-Priority Issues

| #   | Issue                                        | File                         | Details                                                                    |
| --- | -------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| M1  | IPC input not validated                      | `preload/index.ts`, `ipc.ts` | File paths forwarded to main process without traversal/boundary checks     |
| M2  | `strict` mode missing from renderer tsconfig | `tsconfig.web.json`          | Main process has it; renderer does not — many implicit `any` silently pass |
| M3  | `baseUrl` deprecated in tsconfig             | `tsconfig.web.json`          | Deprecated in TS 5.x, removed in TS 7.0                                    |
| M4  | MetadataViewer has no virtualization         | `MetadataViewer.tsx`         | Large Sony XML files will tank render performance                          |
| M5  | Error state never displayed                  | `App.tsx`                    | `store.error` is set on failure but no UI reads or shows it                |

### Quick Wins

| #   | Issue                            | File                 | Fix                                                                    |
| --- | -------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| Q1  | Raw DOM manipulation in JSX      | `DriveBrowser.tsx`   | Replace `classList`/`style` in `onError` with React state (`imgError`) |
| Q2  | Default fps fallback is 30       | `VideoPlayer.tsx`    | Fall back to actual metadata framerate or warn the user                |
| Q3  | No copy-to-clipboard on metadata | `MetadataViewer.tsx` | One-button JSON export for debugging                                   |

### Architectural Observations

- **Async operations belong in the store**: `loadFile`, proxy generation, and settings loading are handled ad-hoc in components. Move these into Zustand actions with co-located loading/error state.
- **Camera config is Sony-only**: The config-per-camera pattern in `camera-cards.config.ts` is correct and extensible — but detection needs a proper fallback to generic scanning for non-Sony cards.
- **No progressive scan UX**: Scans can take seconds. Emit progress events from main (same pattern as `proxy-progress`) and show a progress bar in `DriveBrowser`.

---

## Phased Improvement Plan

### Phase 1 — Stability & Security ✅ COMPLETE (April 12, 2026)

_Goal: fix anything that can crash the app, corrupt data, or create a security hole._

- [x] **C1** — Fix memory leak: return unsubscribe functions from `onDriveMounted`/`onDriveUnmounted` in preload; call them in `DriveBrowser` `useEffect` cleanup
- [x] **C2** — Add a top-level React `<ErrorBoundary>` wrapping `App`; add a secondary one around `VideoPlayer`
- [x] **C3** — Add a configurable timeout (default 30 min) and cancellation signal to `generateProxy()` and `exportClip()`; surface cancellation UI in the renderer
- [x] **C4** — Audit what breaks with `sandbox: true`; fix those breakages and enable the sandbox
- [x] **C5** — Add explicit `..` / path traversal guard in the `local://` protocol handler before any file read
- [x] **M1** — Add server-side filepath validation in IPC handlers: absolute path required, no `..`, must start with `/Volumes` or `app.getPath('home')`
- [x] **M5** — Add a toast/banner component that reads `store.error` and displays it; clear on dismiss
- [x] **Security audit** — `npm audit fix` resolved all 18 vulnerabilities (0 remaining)

**Files changed:**
| File | Changes |
|------|--------|
| `src/preload/index.ts` | `onDriveMounted`, `onDriveUnmounted`, `onProxyProgress` return cleanup functions |
| `src/preload/index.d.ts` | Return types updated to `() => void` |
| `src/renderer/src/components/DriveBrowser.tsx` | `useEffect` cleanup calls unsubscribers on unmount |
| `src/renderer/src/components/ErrorBoundary.tsx` | **New** — reusable error boundary with retry |
| `src/renderer/src/App.tsx` | Wrapped in `ErrorBoundary`; error banner reads `store.error` |
| `src/main/index.ts` | `sandbox: true`; `isPathAllowed()` guard on `local://` handler |
| `src/main/ffmpeg.ts` | 30-min timeout + `kill('SIGKILL')` on `generateProxy`, `exportClip`, `exportFrame` |
| `src/main/ipc.ts` | `validateFilePath()` applied to all 7 path-accepting IPC handlers |

**Exit criteria:** ✅ App does not crash on bad input, event listeners are cleaned up, no path traversal possible.

---

### Phase 2 — Correctness ✅ COMPLETE (April 12, 2026)

_Goal: fix wrong behaviour that silently produces bad output._

- [x] **H1** — Wire audio channel toggles to the Web Audio API (`AudioContext` → `GainNode` per channel); disable channels that don't exist in the current file's metadata
- [x] **H3** — Delete timecode helpers from `VideoPlayer.tsx` and `drives.ts`; re-export from `formatters.ts` and update all import sites
- [x] **H4** — Extend drop-frame timecode math to handle 59.94 fps; write unit tests for both `29.97` and `59.94` edge cases
- [x] **Q2** — Propagate `metadata.framerate` into the `parseTimecode` fallback; throw/warn instead of silently using 30

**Files changed:**
| File | Changes |
|------|--------|
| `src/shared/timecode.ts` | **New** — single source of truth for all timecode operations |
| `src/renderer/src/utils/formatters.ts` | Timecode functions replaced with re-exports from shared |
| `src/renderer/src/components/VideoPlayer.tsx` | Inline timecode logic removed; Web Audio API wired for channel toggles |
| `src/main/drives.ts` | Imports `framesToTimecode` from shared |

**Exit criteria:** ✅ Timecodes are accurate, audio channel UI affects playback.

---

### Phase 3 — Code Quality & TypeScript ✅ COMPLETE (April 12, 2026)

_Goal: eliminate technical debt and improve long-term maintainability._

- [x] **H2** — Replaced `fluent-ffmpeg` with direct `child_process.spawn` calls via `src/main/ffmpeg-spawn.ts` helper; typed all ffprobe output — removed every `as any`
- [x] **M2** — Added `"noImplicitAny": true` to both `tsconfig.web.json` and `tsconfig.node.json`; fixed all resulting type errors
- [x] **M3** — Removed `baseUrl` from `tsconfig.web.json`; migrated paths to relative (`./src/...`) compatible with TS 7.0
- [x] **Q1** — Replaced DOM manipulation in `DriveBrowser` image `onError` with React `FileThumbnail` component using `useState<boolean>`
- [x] **Cleanup** — Removed unused `react-player` and `fluent-ffmpeg` + `@types/fluent-ffmpeg` from `package.json`
- [x] **Async in store** — Moved `loadFile` from `App.tsx` into typed Zustand action; components are pure consumers
- [x] **Types consolidation** — Moved `XMLMetadata`, `MXFFileInfo`, `ExternalDrive` interfaces to shared `types/index.ts`; eliminated duplicate definitions in `DriveBrowser.tsx` and `drives.ts`
- [x] **tsconfig includes** — Added `src/shared/**/*` and `src/renderer/src/types/**/*` to project includes; fixed cross-project reference errors

**Files changed:**
| File | Changes |
|------|--------|
| `src/main/ffmpeg-spawn.ts` | **New** — typed spawn helpers for FFprobe/FFmpeg with timeout and progress |
| `src/main/ffmpeg.ts` | Rewritten to use `ffmpeg-spawn` instead of `fluent-ffmpeg`; zero `as any` |
| `src/main/merge-engine.ts` | Rewritten to use `ffmpeg-spawn`; removed duplicated path logic |
| `src/main/ipc.ts` | Typed `electron-store` with `StoreSchema` generic; removed all `as AppSettings` casts |
| `src/main/drives.ts` | Imports shared types from `types/index.ts` instead of local defs |
| `src/renderer/src/types/index.ts` | Added `XMLMetadata`, `MXFFileInfo`, `ExternalDrive` interfaces |
| `src/renderer/src/store/mediaStore.ts` | Added async `loadFile` action |
| `src/renderer/src/App.tsx` | Refactored to use store `loadFile`; removed inline async logic |
| `src/renderer/src/components/DriveBrowser.tsx` | Replaced DOM manipulation with `FileThumbnail` component; uses shared types |
| `src/renderer/src/components/MetadataViewer.tsx` | Imports `XMLMetadata` from shared types |
| `tsconfig.web.json` | Removed `baseUrl`, added `noImplicitAny`, relative paths, `src/shared` include |
| `tsconfig.node.json` | Added `noImplicitAny`, `src/shared` and `src/renderer/src/types` includes |

**Exit criteria:** ✅ `tsc --noEmit` passes with `noImplicitAny: true` in both tsconfigs; zero `as any`; no abandoned dependencies.

---

### Phase 4 — Performance & UX Polish (Week 7–8)

_Goal: make the app feel fast and professional._

- [x] **M4** — Implement collapse-by-default for XML tree nodes deeper than 2 levels; add a "Expand All" toggle; evaluate `react-window` or `react-virtual` if node counts exceed ~500
- [x] **Q4** — Add "Copy as JSON" button to `MetadataViewer`
- [x] **Progressive scan** — Emit `scan-progress` IPC events from `drives.ts` as files are discovered; add an indeterminate progress bar to `DriveBrowser`'s loading state
- [ ] **Async store** — Ensure all loading states are granular (per-panel, not one global `isLoading`) so the file browser and video player can load independently

**Exit criteria:** Large XML files render without jank; drive scan provides visible progress feedback.

---

### Phase 4.5 — Photo Workflow & RAW Support ✅ COMPLETE (May 9, 2026)

_Goal: make still-photo review first-class alongside video playback._

- [x] **RAW format coverage** — Expanded DCIM photo scan support for `.ARW`, `.CR2`, `.CR3`, `.NEF`, `.NRW`, `.RAF`, `.ORF`, `.RW2`, `.DNG`, `.PEF`, `.SRW`
- [x] **Photo viewer overlay** — Added full-screen viewer with keyboard navigation (`Left`, `Right`, `Esc`) and per-photo details panel
- [x] **RAW extraction reliability** — Added fallback chain: FFmpeg mapped stream, FFmpeg auto stream, then macOS `sips`
- [x] **Background thumbnail generation** — Added sequential auto-preview queue for RAW-only photos with progress indicator
- [x] **Persistent RAW preview cache** — Added deterministic cache paths and scan-time preview rehydration
- [x] **Metadata completeness** — Added title, caption, white balance Kelvin, and optional "Show Empty Fields" mode
- [x] **Proxy -> Original playback stability** — Fixed Web Audio source-node reuse for source switching in `VideoPlayer`

**Files changed:**
| File | Changes |
|------|--------|
| `src/main/drives.ts` | Added broad RAW extension support, photo-inclusive scan summaries, and persisted preview reattachment |
| `src/main/ipc.ts` | Added robust RAW preview extraction fallback chain and expanded EXIF mapping |
| `src/main/raw-preview-cache.ts` | **New** — deterministic RAW preview cache directory/path helpers |
| `src/preload/index.ts` | Added `extractRawPreview()` and `onScanProgress()` bridge APIs |
| `src/preload/index.d.ts` | Added typed photo + scan-progress API declarations |
| `src/renderer/src/components/DriveBrowser.tsx` | Added Photos panel auto-preview queue, progress UI, and viewer integration |
| `src/renderer/src/components/drive/PhotoCard.tsx` | **New** — photo card UI, manual extraction control, metadata accordion |
| `src/renderer/src/components/drive/PhotoViewer.tsx` | **New** — full-screen photo viewer with keyboard navigation |
| `src/renderer/src/components/drive/photoUtils.ts` | **New** — RAW extension and preferred preview path helpers |
| `src/renderer/src/types/index.ts` | Added `PhotoMetadata` fields (`title`, `caption`, `whiteBalanceKelvin`) |
| `src/renderer/src/components/VideoPlayer.tsx` | Fixed `createMediaElementSource` lifecycle by reusing bound source node |

**Exit criteria:** ✅ RAW photos preview reliably, photo metadata coverage is expanded, and proxy-to-original switch is stable.

---

### Phase 4.6 — MXF Stream Quality & Architecture ✅ COMPLETE (May 12, 2026)

_Goal: fix MXF stream playback quality and decompose large components._

- [x] **MXF Stream duration fix** — Player now trusts FFprobe-derived `metadata.duration` for fragmented-MP4 streams instead of the browser's partial buffer duration (~8s)
- [x] **MXF Stream multi-channel audio** — Added `amerge` filter to combine all mono audio streams into a single multi-channel track; fixed Web Audio `channelCount`/`channelCountMode` to preserve all channels through the splitter/gain graph
- [x] **DriveBrowser decomposition** — Split 925-line component into `DriveList` (326 LOC), `VideoFileList` (237 LOC), `PhotosPanel` (133 LOC), and a thin `DriveBrowser` shell (318 LOC)
- [x] **Electron-store type safety** — Typed store with `StoreSchema` generic; removed all 5 `as AppSettings` casts
- [x] **Renderer tests** — Added 16 Zustand store tests (mediaStore.test.ts) covering sync actions, async loadFile, error handling
- [x] **Dependency cleanup** — Removed unused `wavesurfer.js`; ran `npm audit fix` (0 vulnerabilities)

**Files changed:**
| File | Changes |
|------|---------|
| `src/main/index.ts` | Added audio stream probe + `amerge` filter to `mxfstream://` handler; async protocol handler |
| `src/main/ipc.ts` | Typed `ElectronStore<StoreSchema>`; removed all `as AppSettings` casts; added timestamp |
| `src/renderer/src/components/VideoPlayer.tsx` | Fixed duration priority for MXF streams; fixed Web Audio channelCount/channelCountMode |
| `src/renderer/src/components/DriveBrowser.tsx` | Rewritten as thin layout shell composing sub-components |
| `src/renderer/src/components/drive/DriveList.tsx` | **New** — drive sidebar with local/network sections and eject logic |
| `src/renderer/src/components/drive/VideoFileList.tsx` | **New** — video file cards with metadata accordions |
| `src/renderer/src/components/drive/PhotosPanel.tsx` | **New** — extracted from DriveBrowser with auto-preview queue |
| `src/renderer/src/store/__tests__/mediaStore.test.ts` | **New** — 16 tests for Zustand store actions |

**Exit criteria:** ✅ MXF streams show correct duration and all audio channels; DriveBrowser decomposed; 156 tests pass.

---

### Phase 5 — Extensibility (Week 9–10)

_Goal: make the app useful beyond Sony FX6 and macOS._

- [ ] **H4 / H5** — Abstract all platform-specific path/command logic behind a `platform.ts` utility; add Windows (`%SYSTEMDRIVE%`) and Linux (`/media`, `/mnt`) volume roots
- [ ] **H5 (ffprobe)** — Add Windows and Linux FFprobe path lookups in `getFfprobePath()`
- [ ] **H5 (camera config)** — Add Canon C-series (CRM/XF-AVC), Panasonic (P2/MXF), and RED (R3D) card configs; implement graceful fallback in `detectCameraCardType()` → generic scan
- [ ] **Proxy progress** — Apply the same progress-event pattern used for proxy generation to frame export and clip export
- [ ] **Security gate (future untrusted audio/network sources)** — Add explicit threat model + trust boundaries before enabling non-local ingestion
- [ ] **Merge output destination policy** — Replace raw renderer-provided `outputPath` with main-process allowlist validation for untrusted/network workflows

**Exit criteria:** App can be built and run on Windows; at least one non-Sony camera card is detected correctly.

---

## Dependency Notes

> > update documentation when finished with codiing.

| Package         | Status                                     | Action                                                       |
| --------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `fluent-ffmpeg` | Abandoned (last update ~2019)              | **Removed in Phase 3** — replaced with `child_process.spawn` |
| `electron`      | v39 — current                              | Keep, monitor updates                                        |
| `react`         | v19 — current                              | Keep                                                         |
| `zustand`       | v5 — current                               | Keep                                                         |
| `wavesurfer.js` | v7 — was unused                            | **Removed in Phase 4.6** — no imports existed in codebase    |
| `react-player`  | v3 — not imported anywhere in the codebase | **Removed in Phase 3**                                       |
