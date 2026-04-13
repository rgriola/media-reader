import { create } from 'zustand'
import type { MXFMetadata, ProxyFile, PlayerState, TimelineMarker, AppSettings } from '../types'

interface MediaStore {
  // Current file
  currentFile: string | null
  metadata: MXFMetadata | null
  proxy: ProxyFile | null

  // Player state
  playerState: PlayerState

  // Timeline markers
  markers: TimelineMarker[]

  // App settings
  settings: AppSettings

  // Loading states
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentFile: (filepath: string | null) => void
  setMetadata: (metadata: MXFMetadata | null) => void
  setProxy: (proxy: ProxyFile | null) => void
  setPlayerState: (state: Partial<PlayerState>) => void
  addMarker: (marker: TimelineMarker) => void
  removeMarker: (id: string) => void
  updateSettings: (settings: Partial<AppSettings>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void

  // Async actions
  loadFile: (filepath: string) => Promise<boolean>
}

const defaultPlayerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  playbackRate: 1,
  isMuted: false,
  isFullscreen: false
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  defaultProxyQuality: '1080p',
  autoDetectProxy: true,
  proxyNamingConvention: 'suffix',
  keyboardShortcuts: {
    playPause: 'Space',
    frameForward: 'ArrowRight',
    frameBackward: 'ArrowLeft',
    speedUp: 'L',
    slowDown: 'J',
    normalSpeed: 'K',
    fullscreen: 'F'
  },
  recentFiles: [],
  maxRecentFiles: 10
}

export const useMediaStore = create<MediaStore>((set) => ({
  // Initial state
  currentFile: null,
  metadata: null,
  proxy: null,
  playerState: defaultPlayerState,
  markers: [],
  settings: defaultSettings,
  isLoading: false,
  error: null,

  // Actions
  setCurrentFile: (filepath) => set({ currentFile: filepath }),

  setMetadata: (metadata) => set({ metadata }),

  setProxy: (proxy) => set({ proxy }),

  setPlayerState: (state) =>
    set((prev) => ({
      playerState: { ...prev.playerState, ...state }
    })),

  addMarker: (marker) =>
    set((prev) => ({
      markers: [...prev.markers, marker]
    })),

  removeMarker: (id) =>
    set((prev) => ({
      markers: prev.markers.filter((m) => m.id !== id)
    })),

  updateSettings: (settings) =>
    set((prev) => ({
      settings: { ...prev.settings, ...settings }
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      currentFile: null,
      metadata: null,
      proxy: null,
      playerState: defaultPlayerState,
      markers: [],
      isLoading: false,
      error: null
    }),

  loadFile: async (filepath: string): Promise<boolean> => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.loadFile(filepath)
      if (result.success && result.metadata) {
        set({
          currentFile: filepath,
          metadata: result.metadata,
          proxy: result.proxy || null,
          isLoading: false
        })
        return true
      } else {
        set({ error: result.error || 'Failed to load file', isLoading: false })
        return false
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false
      })
      return false
    }
  }
}))
