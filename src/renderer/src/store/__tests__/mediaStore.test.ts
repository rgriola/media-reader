/**
 * Renderer store unit tests — Zustand mediaStore
 * Created: May 12, 2026 - 4:30pm
 *
 * These tests verify the Zustand store actions without touching IPC.
 * The window.api bridge is mocked so tests run in plain Node (vitest).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMediaStore } from '../mediaStore'
import type { MXFMetadata, ProxyFile, FileLoadResult } from '../../types'

// ---------------------------------------------------------------------------
// Mock window.api — the IPC bridge the store calls via loadFile()
// ---------------------------------------------------------------------------

const mockApi = {
  loadFile: vi.fn()
}

// Attach to globalThis so the store's `window.api.loadFile` resolves
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true
})

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleMetadata: MXFMetadata = {
  filename: 'clip001.MXF',
  filepath: '/Volumes/CARD/Clip/clip001.MXF',
  duration: 30,
  timecode: '01:00:00:00',
  resolution: { width: 1920, height: 1080 },
  framerate: 29.97,
  codec: 'mpeg2video',
  bitrate: 50_000_000,
  fileSize: 200_000_000,
  video: {
    codec: 'mpeg2video',
    width: 1920,
    height: 1080,
    framerate: 29.97
  },
  audio: [
    { index: 0, codec: 'pcm_s24le', channels: 1, sampleRate: 48000 },
    { index: 1, codec: 'pcm_s24le', channels: 1, sampleRate: 48000 }
  ]
}

const sampleProxy: ProxyFile = {
  exists: true,
  path: '/Volumes/CARD/Sub/clip001_proxy.mp4',
  format: 'mp4',
  resolution: { width: 1280, height: 720 }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mediaStore', () => {
  beforeEach(() => {
    // Reset to initial state between tests
    useMediaStore.getState().reset()
    vi.clearAllMocks()
  })

  // ── Synchronous actions ──────────────────────────────────

  describe('setCurrentFile', () => {
    it('sets the current file path', () => {
      useMediaStore.getState().setCurrentFile('/path/to/file.mxf')
      expect(useMediaStore.getState().currentFile).toBe('/path/to/file.mxf')
    })

    it('clears the current file when null', () => {
      useMediaStore.getState().setCurrentFile('/path/to/file.mxf')
      useMediaStore.getState().setCurrentFile(null)
      expect(useMediaStore.getState().currentFile).toBeNull()
    })
  })

  describe('setMetadata', () => {
    it('stores metadata', () => {
      useMediaStore.getState().setMetadata(sampleMetadata)
      expect(useMediaStore.getState().metadata).toEqual(sampleMetadata)
    })
  })

  describe('setProxy', () => {
    it('stores proxy info', () => {
      useMediaStore.getState().setProxy(sampleProxy)
      const proxy = useMediaStore.getState().proxy
      expect(proxy?.exists).toBe(true)
      expect(proxy?.path).toBe('/Volumes/CARD/Sub/clip001_proxy.mp4')
    })
  })

  describe('setPlayerState', () => {
    it('partially updates player state', () => {
      useMediaStore.getState().setPlayerState({ isPlaying: true, volume: 0.5 })
      const ps = useMediaStore.getState().playerState
      expect(ps.isPlaying).toBe(true)
      expect(ps.volume).toBe(0.5)
      // Unchanged fields retain defaults
      expect(ps.currentTime).toBe(0)
      expect(ps.playbackRate).toBe(1)
    })
  })

  describe('markers', () => {
    it('adds and removes markers', () => {
      const marker = { id: 'm1', time: 10.5, label: 'Take 2' }
      useMediaStore.getState().addMarker(marker)
      expect(useMediaStore.getState().markers).toHaveLength(1)
      expect(useMediaStore.getState().markers[0].label).toBe('Take 2')

      useMediaStore.getState().removeMarker('m1')
      expect(useMediaStore.getState().markers).toHaveLength(0)
    })

    it('does nothing when removing a non-existent marker', () => {
      useMediaStore.getState().addMarker({ id: 'm1', time: 0, label: 'A' })
      useMediaStore.getState().removeMarker('nonexistent')
      expect(useMediaStore.getState().markers).toHaveLength(1)
    })
  })

  describe('updateSettings', () => {
    it('partially updates settings', () => {
      useMediaStore.getState().updateSettings({ theme: 'light' })
      expect(useMediaStore.getState().settings.theme).toBe('light')
      // Other settings untouched
      expect(useMediaStore.getState().settings.defaultProxyQuality).toBe('1080p')
    })
  })

  describe('setError / setLoading', () => {
    it('sets and clears error', () => {
      useMediaStore.getState().setError('Something broke')
      expect(useMediaStore.getState().error).toBe('Something broke')

      useMediaStore.getState().setError(null)
      expect(useMediaStore.getState().error).toBeNull()
    })

    it('sets loading state', () => {
      useMediaStore.getState().setLoading(true)
      expect(useMediaStore.getState().isLoading).toBe(true)
    })
  })

  describe('reset', () => {
    it('restores all state to defaults', () => {
      // Mutate everything
      useMediaStore.getState().setCurrentFile('/file.mxf')
      useMediaStore.getState().setMetadata(sampleMetadata)
      useMediaStore.getState().setProxy(sampleProxy)
      useMediaStore.getState().setError('error')
      useMediaStore.getState().setLoading(true)
      useMediaStore.getState().addMarker({ id: 'm1', time: 0, label: 'A' })

      // Reset
      useMediaStore.getState().reset()

      const s = useMediaStore.getState()
      expect(s.currentFile).toBeNull()
      expect(s.metadata).toBeNull()
      expect(s.proxy).toBeNull()
      expect(s.error).toBeNull()
      expect(s.isLoading).toBe(false)
      expect(s.markers).toHaveLength(0)
    })
  })

  // ── Async actions ─────────────────────────────────────────

  describe('loadFile', () => {
    it('loads file successfully — stores metadata and proxy', async () => {
      const result: FileLoadResult = {
        success: true,
        metadata: sampleMetadata,
        proxy: sampleProxy
      }
      mockApi.loadFile.mockResolvedValue(result)

      const success = await useMediaStore.getState().loadFile('/path/to/clip.mxf')

      expect(success).toBe(true)
      expect(mockApi.loadFile).toHaveBeenCalledWith('/path/to/clip.mxf')
      expect(useMediaStore.getState().currentFile).toBe('/path/to/clip.mxf')
      expect(useMediaStore.getState().metadata).toEqual(sampleMetadata)
      expect(useMediaStore.getState().proxy).toEqual(sampleProxy)
      expect(useMediaStore.getState().isLoading).toBe(false)
      expect(useMediaStore.getState().error).toBeNull()
    })

    it('handles API failure — sets error', async () => {
      const result: FileLoadResult = {
        success: false,
        error: 'File not found or inaccessible'
      }
      mockApi.loadFile.mockResolvedValue(result)

      const success = await useMediaStore.getState().loadFile('/bad/path.mxf')

      expect(success).toBe(false)
      expect(useMediaStore.getState().error).toBe('File not found or inaccessible')
      expect(useMediaStore.getState().isLoading).toBe(false)
      expect(useMediaStore.getState().metadata).toBeNull()
    })

    it('handles unexpected exception — sets error', async () => {
      mockApi.loadFile.mockRejectedValue(new Error('IPC channel closed'))

      const success = await useMediaStore.getState().loadFile('/some/file.mxf')

      expect(success).toBe(false)
      expect(useMediaStore.getState().error).toBe('IPC channel closed')
      expect(useMediaStore.getState().isLoading).toBe(false)
    })

    it('sets isLoading=true during load', async () => {
      // Use a deferred promise so we can inspect state mid-flight
      let resolveLoad: (v: FileLoadResult) => void
      const deferred = new Promise<FileLoadResult>((r) => {
        resolveLoad = r
      })
      mockApi.loadFile.mockReturnValue(deferred)

      const loadPromise = useMediaStore.getState().loadFile('/file.mxf')

      // Should be loading before the IPC call resolves
      expect(useMediaStore.getState().isLoading).toBe(true)

      // Resolve the promise
      resolveLoad!({ success: true, metadata: sampleMetadata })
      await loadPromise

      expect(useMediaStore.getState().isLoading).toBe(false)
    })

    it('stores proxy as null when no proxy returned', async () => {
      const result: FileLoadResult = {
        success: true,
        metadata: sampleMetadata
        // proxy intentionally omitted
      }
      mockApi.loadFile.mockResolvedValue(result)

      await useMediaStore.getState().loadFile('/clip.mxf')

      expect(useMediaStore.getState().proxy).toBeNull()
    })
  })
})
