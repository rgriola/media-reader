# Security Notes — MXF Media Reader

> Last updated: 2026-05-12
> Last reviewed: 2026-05-12 | Reviewer: Antigravity (Gemini Deep Research)

This document tracks the security posture of the app, known-fixed issues, and outstanding to-do items. Update it whenever a security fix is applied or a new risk is identified.

---

## Baseline — Core Security (Non-Negotiable)

These settings are correctly configured and must **never be changed**:

| Setting                | Value                               | Where                                  |
| ---------------------- | ----------------------------------- | -------------------------------------- |
| `nodeIntegration`      | `false`                             | `src/main/index.ts` → `webPreferences` |
| `contextIsolation`     | `true`                              | `src/main/index.ts` → `webPreferences` |
| `sandbox`              | `true`                              | `src/main/index.ts` → `webPreferences` |
| `setWindowOpenHandler` | `deny` + URL allowlist              | `src/main/index.ts`                    |
| `validateFilePath()`   | called on all IPC file inputs       | `src/main/ipc.ts`                      |
| `isPathAllowed()`      | gates both custom protocol handlers | `src/main/index.ts`                    |

---

## Fixed Issues

### ✅ HIGH — `cleanup-transcode-file` accepted arbitrary delete path

**Fixed:** 2026-04-17 | `src/main/ipc.ts`

The `cleanup-transcode-file` IPC handler previously called `fs.unlink(tempPath)` on whatever path the renderer sent — with no validation. A compromised renderer could have deleted any file on disk.

**Fix applied:** Path is now resolved to canonical form, then validated against two independent checks before unlink is allowed:

1. Must be inside the system's `os.tmpdir()` directory
2. Filename must start with `mxfreader-` (our app's transcode prefix)

Any path that fails either check is rejected and logged with an error.

---

### ✅ HIGH — `shell.openExternal` opened any URL scheme

**Fixed:** 2026-04-17 | `src/main/index.ts`

`setWindowOpenHandler` was calling `shell.openExternal(details.url)` unconditionally. A link rendered in the UI (e.g. from clip metadata) with a `file://` path, `zoommtg://`, or other custom URI scheme would be passed directly to the OS and executed.

**Fix applied:** `shell.openExternal` is now gated to `http://` and `https://` URLs only. All other schemes are silently dropped.

---

### ✅ MEDIUM — CSP allowed `unsafe-eval` in production builds

**Fixed:** 2026-04-17 | `src/main/index.ts`

The Content-Security-Policy was identical in dev and production, including `'unsafe-eval'` which enables `eval()` and `new Function()` in the renderer — bypassing CSP's primary XSS protection.

**Fix applied:** `'unsafe-inline'` and `'unsafe-eval'` in `script-src` are now conditional on `is.dev`. Production builds receive a strict `script-src 'self'`. Dev keeps HMR working as before.

---

### ✅ MEDIUM — `getAllowedRoots()` included all of `/Users`

**Fixed:** 2026-04-17 | `src/main/index.ts`

The `local://` and `mxfstream://` protocol handlers called `getAllowedRoots()` which included the _parent_ of the home directory (`/Users` on a standard Mac). This meant the protocol handlers would serve files from any other user account on a shared machine (e.g. `/Users/otheruser/Documents/private.pdf`).

The IPC path validator (`validateFilePath()`) was already restricted to the current user's home — the protocol handlers were unintentionally more permissive.

**Fix applied:** Removed the `homeParent` addition. Both the protocol handlers and IPC handlers now share the same allowed roots: `/Volumes` and `~/`.

---

### ✅ MEDIUM — Dead code branch in `isPathAllowed()`

**Fixed:** 2026-04-17 | `src/main/index.ts`

The function had an `if` block whose comment described a strict traversal check, but whose body was empty — the code fell through and applied the root check for all paths regardless. The outcome was accidentally correct (roots check still catches traversal), but the misleading comment could lead a future developer to believe the check was already handled inside the `if` block.

**Fix applied:** Removed the empty `if` block and its comment. The function now clearly shows: resolve the path (which eliminates `..`), then check roots. No ambiguity.

---

### ✅ MEDIUM — `electronAPI` raw IPC surface removed from renderer global

**Fixed:** 2026-05-09 | `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/Versions.tsx`

`@electron-toolkit/preload`'s `electronAPI` was exposed as `window.electron`, which gave renderer code direct access to raw `ipcRenderer.invoke/send/on`.

**Fix applied:** Removed `window.electron` exposure and moved renderer version display to a scoped `window.api.getVersions()` method. The renderer now only receives the typed, explicitly allowed bridge methods.

---

### ✅ LOW — FFprobe process timeout guard added

**Fixed:** 2026-05-09 | `src/main/ffmpeg-spawn.ts`

`runFfprobe()` previously had no timeout, so a malformed or pathological input could keep probe processes alive indefinitely.

**Fix applied:** Added a default 30-second timeout with `SIGKILL` termination and single-settle promise handling to prevent hung FFprobe subprocesses.

---

## Open To-Do List

### 🔲 LOW — `merge-clips` output path not validated

`src/main/ipc.ts` → `merge-clips` handler

The merged file's destination path comes from the renderer (`opts.outputPath`) and is not passed through `validateFilePath()`. Input clip paths are validated, but the output path is not.

**Deferred reason:** Current releases do not load networked content, and merges are initiated by trusted local workflows. For future untrusted-audio or network-connected ingestion, this must be upgraded to an allowlist-based output destination policy (not just a home-directory check).

**Risk without fix:** A compromised renderer could write a merged file to an arbitrary filesystem location if it supplies a crafted `outputPath`.

---

### 🔲 LOW — Seek parameter not clamped in `mxfstream://`

`src/main/index.ts` → `mxfstream` protocol handler

The `?seek=N` query parameter is parsed with `parseFloat()` but not validated for range (negative values, non-finite values, extremely large values). FFmpeg handles these gracefully, but it wastes resources and may cause FFmpeg to run indefinitely on pathological input.

**Fix when ready:**

```typescript
const rawSeek = parseFloat(new URLSearchParams(seekParam).get('seek') ?? '0')
const seekSeconds = isFinite(rawSeek) && rawSeek >= 0 ? rawSeek : 0
```

---

## Dependency Audit

Run before each release:

```bash
npm audit
```

Last result: **0 vulnerabilities** (2026-05-12)

Known-safe versions in use:

- `electron` ^39.2.6
- `electron-store` ^11.0.2
- `fast-xml-parser` ^5.3.3
- `chokidar` ^5.0.0
