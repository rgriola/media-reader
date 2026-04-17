# Agent Coding Guide — MXF Media Reader

> **Read this file before making any code changes.** It documents architecture decisions,
> known gotchas, and strict rules that prevent common breakage patterns in this codebase.

---

## Project Overview

MXF Media Reader is an **Electron desktop app** for viewing professional MXF video files
with proxy support, batch merging, metadata extraction, and MXF streaming via FFmpeg.

| Layer        | Technology                               | Build target       |
| ------------ | ---------------------------------------- | ------------------ |
| Main process | TypeScript → **CJS** (via electron-vite) | Node.js / Electron |
| Preload      | TypeScript → **CJS** (via electron-vite) | Sandboxed bridge   |
| Renderer     | React 18 + TypeScript → **ESM** (Vite)   | Chromium browser   |

### Key documentation

| Doc                                                      | Purpose                                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| [README.md](README.md)                                   | User-facing features, install, usage, API reference |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)             | File tree, dependencies, scripts, state management  |
| [MXF_READER_DESIGN.md](MXF_READER_DESIGN.md)             | Architecture options, UI layout, roadmap            |
| [SONY_XML_METADATA.md](SONY_XML_METADATA.md)             | Sony XDCAM XML sidecar format and parsing details   |
| [FFMPEG_BATCH_MERGE_PLAN.md](FFMPEG_BATCH_MERGE_PLAN.md) | Batch clip merging design                           |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)         | Development roadmap and phases                      |

---

## ⚠️ Critical Rule #1 — ESM / CJS Interop

**This is the single most dangerous pitfall in this codebase.**

### The problem

Electron-vite compiles the **main process** and **preload** to **CommonJS** (`out/main/index.js`).
But many npm packages (including `electron-store` v11) ship as **pure ESM**.

When Vite bundles an ESM default export into CJS, the result is:

```js
// What you write in TypeScript:
import ElectronStore from 'electron-store'
new ElectronStore()  // ← TypeError: ElectronStore is not a constructor

// What Vite actually produces in CJS output:
const ElectronStore = { default: [Function: Store] }
// The class is on .default, not at the top level
```

### The solution — always use the `.default` fallback pattern

```typescript
// ✅ CORRECT — handles both ESM and CJS interop
import ElectronStoreModule from 'electron-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ElectronStore = (ElectronStoreModule as any).default || ElectronStoreModule
```

### When does this apply?

- **Any ESM-only npm package** imported in `src/main/` or `src/preload/`
- Common culprits: `electron-store`, `conf`, `got`, `execa`, `p-queue`, `chalk` v5+
- **Does NOT apply** to renderer code (`src/renderer/`) — Vite serves that as native ESM

### How to check before adding a dependency

```bash
# Check if a package is ESM-only:
cat node_modules/<package>/package.json | grep '"type"'
# If output is "type": "module" → ESM-only → needs the .default fallback
```

---

## ⚠️ Critical Rule #2 — No `require()` Imports

ESLint rule: `@typescript-eslint/no-require-imports`

```typescript
// ❌ FORBIDDEN — will fail lint
const fs = require('fs')
const Store = require('electron-store')

// ✅ CORRECT — use ES import syntax
import fs from 'fs'
import { join } from 'path'
```

Even though the main process compiles to CJS, all source code must use ES `import` syntax.
The bundler handles the conversion.

---

## ⚠️ Critical Rule #3 — No `any` Types

ESLint rule: `@typescript-eslint/no-explicit-any`

| Situation          | Wrong                          | Right                                            |
| ------------------ | ------------------------------ | ------------------------------------------------ |
| Unknown data shape | `data: any`                    | `data: unknown` (then narrow before use)         |
| Parsed XML         | `rawXML: any`                  | `rawXML: Record<string, unknown>`                |
| Store values       | `store.get('settings') as any` | Type the store with generics (see below)         |
| IPC params         | `(opts: any)`                  | Use the actual interface: `(opts: MergeOptions)` |
| Recursive renderer | `renderValue(value: any)`      | Acceptable — exhaustive narrowing inside         |
| CJS interop cast   | `(Module as any).default`      | Acceptable — add `eslint-disable` comment        |

### electron-store typing pattern

```typescript
// ✅ Type the store once at creation — all .get()/.set() calls become type-safe
const store = new ElectronStore<{ settings: AppSettings }>({
  defaults: {
    settings: { theme: 'dark', proxyNamingConvention: 'suffix' /* ... */ }
  }
})

// Now this is fully typed — no casting anywhere:
const settings = store.get('settings') // → AppSettings
settings.proxyNamingConvention // → 'suffix' | 'folder'
```

### IPC bridge typing

All types flow through three files that must stay in sync:

```
src/renderer/src/types/index.ts    ← Canonical type definitions
       ↓ imported by
src/preload/index.ts               ← Runtime IPC bridge
src/preload/index.d.ts             ← Type declarations for renderer
src/main/ipc.ts                    ← IPC handler implementations
```

When adding a new IPC channel, update **all four files**.

---

## ⚠️ Critical Rule #4 — Explicit Return Types

ESLint rule: `@typescript-eslint/explicit-function-return-type`

```typescript
// ❌ Missing return type
const onProgress = (percent: number) => {
  event.sender.send('proxy-progress', percent)
}

// ✅ Explicit return type
const onProgress = (percent: number): void => {
  event.sender.send('proxy-progress', percent)
}

// ✅ React components
export function MetadataViewer(props: Props): React.ReactElement {
```

---

## ⚠️ Critical Rule #5 — JSX Conditional Rendering

When a value might be `unknown`, `string | undefined`, or `Record<...> | undefined`,
use `!!` to coerce to boolean before `&&`:

```tsx
// ❌ TypeScript error — unknown && ReactNode = unknown
{
  metadata.rawXML && <div>...</div>
}

// ✅ Forces boolean — false | ReactNode
{
  !!metadata.rawXML && <div>...</div>
}
```

This applies to any optional or non-boolean value used in JSX `&&` conditions.

---

## Formatting Rules (Prettier)

Config: `.prettierrc.yaml`

```yaml
singleQuote: true
semi: false
printWidth: 100
trailingComma: none
```

### Key behaviors

| Situation                     | Prettier behavior                |
| ----------------------------- | -------------------------------- |
| Import with >100 char line    | Expands to one import per line   |
| JSX props fitting on one line | Collapses to single line         |
| JSX props exceeding 100 chars | Expands to one prop per line     |
| Ternary object literals       | Indented 2 extra spaces from `?` |

### Auto-format command

```bash
npx prettier --write "src/**/*.{ts,tsx}"
```

VS Code is configured for Format on Save via `.vscode/settings.json`.

---

## Architecture Quick Reference

### Three-Process Model

```
┌─────────────────────────────────────────────────────┐
│ Main Process (src/main/)                             │
│ • Node.js APIs, filesystem, FFmpeg, electron-store   │
│ • Compiled to CJS by electron-vite                   │
│ • Files: index.ts, ipc.ts, ffmpeg.ts, drives.ts,     │
│          merge-engine.ts, ffmpeg-spawn.ts,            │
│          camera-cards.config.ts                       │
├─────────────────────────────────────────────────────┤
│ Preload (src/preload/)                               │
│ • Bridge — exposes IPC to renderer via contextBridge │
│ • Compiled to CJS                                    │
│ • Files: index.ts (runtime), index.d.ts (types)      │
├─────────────────────────────────────────────────────┤
│ Renderer (src/renderer/)                             │
│ • React app — runs in Chromium                       │
│ • Served as ESM by Vite dev server                   │
│ • Files: App.tsx, components/, store/, types/         │
└─────────────────────────────────────────────────────┘
```

### Custom Protocol Handlers (main process)

| Protocol       | Purpose                                           | File                |
| -------------- | ------------------------------------------------- | ------------------- |
| `local://`     | Serve local files (video, thumbnails) to renderer | `src/main/index.ts` |
| `mxfstream://` | Live-transcode MXF → MP4 via FFmpeg pipe          | `src/main/index.ts` |

Both are registered in `protocol.handle()` inside `app.whenReady()`.

**CSP must include both protocols:**

```
media-src 'self' local: mxfstream: file:
```

The CSP is set on `session.defaultSession` **before** `createWindow()` — not on the
window's session (which is too late in dev mode).

### Video Playback Modes

| Badge         | Source                   | How it works                                   |
| ------------- | ------------------------ | ---------------------------------------------- |
| 🔵 Proxy      | `local://<proxy.mp4>`    | Pre-existing MP4 proxy, served as static file  |
| 🟠 MXF Stream | `mxfstream://<file.mxf>` | FFmpeg transcodes on-the-fly to fragmented MP4 |
| 🟡 Preview    | `local://<temp.mp4>`     | Full transcode to temp file, then serve        |

### File Path Security

All file access goes through `validateFilePath()` which restricts to:

- `/Volumes/*` (external drives)
- `app.getPath('home')` and its parent (user home directory)

Never bypass this validation when adding new file-serving endpoints.

---

## Build & Dev Commands

```bash
npm run dev          # Start dev server + Electron (hot reload for renderer only)
npm run build        # Typecheck + production build
npm run build:mac    # Package macOS .dmg
npm run lint         # ESLint check
```

**Important:** Changes to `src/main/` and `src/preload/` require a full restart of
`npm run dev`. Only renderer changes hot-reload.

---

## Adding a New IPC Channel — Checklist

1. **Define types** in `src/renderer/src/types/index.ts`
2. **Add handler** in `src/main/ipc.ts` with proper typed params and return type
3. **Expose in preload** — add to `src/preload/index.ts` with typed params
4. **Declare for renderer** — add to `src/preload/index.d.ts` with matching signature
5. **Verify build** — run `npm run build` (catches type mismatches across all three processes)

---

## Adding a New npm Dependency — Checklist

1. Check if the package is ESM-only: `cat node_modules/<pkg>/package.json | grep type`
2. If ESM-only and used in `src/main/` or `src/preload/`:
   - Use the `.default` fallback pattern (see Rule #1)
   - Add an `eslint-disable` comment for the single `any` cast
3. If used in `src/renderer/` — standard `import` works fine (Vite serves ESM natively)
4. Run `npm run build` to verify

---

## Common Mistakes to Avoid

| Mistake                                         | Why it breaks                                 | Fix                                                     |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `import X from 'esm-package'` in main process   | `.default` interop issue at runtime           | Use `.default` fallback pattern                         |
| `const x = require('foo')`                      | ESLint `no-require-imports`                   | Use `import` syntax                                     |
| `param: any`                                    | ESLint `no-explicit-any`                      | Use proper interface or `unknown`                       |
| Missing return type on function                 | ESLint `explicit-function-return-type`        | Add `: void`, `: ReactElement`, etc.                    |
| `stream as any` in Response                     | `no-explicit-any`                             | `stream as unknown as ReadableStream`                   |
| `{value && <JSX>}` with non-boolean value       | TS error: unknown not assignable to ReactNode | Use `{!!value && <JSX>}`                                |
| Editing main process, expecting hot reload      | Main process doesn't hot reload               | Restart `npm run dev`                                   |
| CSP set on `mainWindow.webContents.session`     | Too late — URL already loading in dev         | Set on `session.defaultSession` before `createWindow()` |
| Adding `mxfstream:` protocol without CSP update | Browser blocks media load                     | Add to `media-src` in CSP                               |
| Treating Sony LTC `@_value` as a frame count    | Produces 400+ hour timecodes (e.g. `445:...`) | Decode as hex BCD — see `SONY_XML_METADATA.md`          |
| Using `seconds * 29.97` then `frames % 30`      | ~1 min drift at TC hour 19 (asymmetric rounding) | Use `Math.round(fps)` for ALL frame↔time math — see `SONY_XML_METADATA.md` |
| Bypassing `src/shared/timecode.ts` utilities     | Drift, rounding, or drop-frame bugs           | Always use the shared utility — never hand-roll TC math |

---

## Testing Changes

Always run tests and a full build before committing:

```bash
npm test             # Run unit tests (vitest)
npm run build        # Typecheck + production build
```

This runs:

1. **Tests**: 109 unit tests across 6 test files covering timecode, formatters,
   camera card detection, path validation, FFmpeg helpers, and Sony LTC decoding
2. `tsc --noEmit` for both `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer)
3. `electron-vite build` — bundles all three processes

If the build passes, the types are consistent across all process boundaries.
