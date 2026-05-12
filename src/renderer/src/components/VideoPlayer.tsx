import React, { useRef, useState, useEffect, useCallback } from 'react'
import { timecodeToFrames, framesToTimecode } from '../utils/formatters'
import type { BadgeType } from '../types'
import { SourceBadge } from './player/SourceBadge'
import { AudioChannelPanel } from './player/AudioChannelPanel'
import { PlayerControls } from './player/PlayerControls'

interface AudioStream {
  index: number
  codec: string
  channels: number
  sampleRate: number
  bitrate?: number
  channelLayout?: string
}

interface VideoPlayerProps {
  videoPath: string
  badgeType?: BadgeType
  isMxfStream?: boolean
  hasMainFile?: boolean
  onSwitchToMain?: () => void
  metadata?: {
    startTimecode?: string
    duration?: string
    frameRate?: string
    dropFrame?: boolean
    audio?: AudioStream[]
  }
  onClose: () => void
}

// ─── Main VideoPlayer Component ────────────────────────────────

export function VideoPlayer({
  videoPath,
  badgeType = 'proxy',
  isMxfStream = false,
  hasMainFile = false,
  onSwitchToMain,
  metadata,
  onClose
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  // createMediaElementSource() permanently binds to the DOM element — can only be
  // called ONCE per HTMLVideoElement for the entire lifetime of the element.
  // Store the node here and reuse it across source changes (proxy → original).
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const channelGainsRef = useRef<GainNode[]>([])
  // Tracks whether the video was playing immediately before a src change so we can
  // auto-resume after the new source loads (e.g. proxy → Play Original switch)
  const wasPlayingRef = useRef(false)
  // Tracks latest playing state for effects that only depend on source changes.
  const isPlayingRef = useRef(false)

  // For mxfstream:// we track the active src URL so we can update it on seek
  const [activeSrc, setActiveSrc] = useState<string>(videoPath)
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [currentTimecode, setCurrentTimecode] = useState('00:00:00:00')
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Audio channel controls
  const [enabledChannels, setEnabledChannels] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5, 6, 7, 8])
  )

  // Derived values
  const totalAudioChannels = Math.min(
    metadata?.audio?.reduce((acc, stream) => acc + stream.channels, 0) || 0,
    8
  )
  const fps = metadata?.frameRate ? parseFloat(metadata.frameRate) : null

  // ─── Timecode conversion ──────────────────────────────────

  const toTimecode = useCallback(
    (seconds: number): string => {
      const effectiveFps = fps || 24
      const roundedFps = Math.round(effectiveFps)
      // Convert start TC string directly to frame count (no float drift)
      const startFrames = metadata?.startTimecode
        ? timecodeToFrames(metadata.startTimecode, effectiveFps)
        : 0
      // Convert elapsed seconds to frames using the same rounded fps
      const elapsedFrames = Math.round(seconds * roundedFps)
      // Convert back to timecode — all arithmetic uses rounded fps
      return framesToTimecode(
        startFrames + elapsedFrames,
        effectiveFps,
        metadata?.dropFrame || false
      )
    },
    [fps, metadata?.startTimecode, metadata?.dropFrame]
  )

  // Format elapsed time as MM:SS
  const formatTime = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
      return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  // ─── Event handlers ───────────────────────────────────────

  const togglePlayPause = useCallback((): void => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleTimeUpdate = useCallback((): void => {
    if (!videoRef.current) return
    const time = videoRef.current.currentTime
    setCurrentTime(time)
    setCurrentTimecode(toTimecode(time))
  }, [toTimecode])

  const handleLoadedMetadata = useCallback((): void => {
    if (!videoRef.current) return
    const videoDuration = videoRef.current.duration

    // For mxfstream:// playback, Chromium receives a fragmented MP4 with no moov
    // atom — videoElement.duration only reflects the buffered portion (~8s), not
    // the full clip length.  Prefer the FFprobe-derived metadata.duration which
    // was extracted from the original MXF file on disk.
    if (isMxfStream && metadata?.duration) {
      const metaDuration = parseFloat(metadata.duration)
      if (isFinite(metaDuration) && metaDuration > 0) {
        setDuration(metaDuration)
        return
      }
    }

    // For local files (proxy / native MP4) the browser's moov-atom duration is
    // authoritative.  Fall back to metadata only when the element reports 0/NaN.
    if (isFinite(videoDuration) && videoDuration > 0) {
      setDuration(videoDuration)
    } else if (metadata?.duration) {
      const metaDuration = parseFloat(metadata.duration)
      if (isFinite(metaDuration) && metaDuration > 0) {
        setDuration(metaDuration)
      }
    }
  }, [isMxfStream, metadata?.duration])

  const handleLoadedData = useCallback((): void => {
    setIsLoading(false)
    setVideoError(null)
    // If this load was triggered by a source switch (proxy → original) while playing,
    // resume playback automatically so the user doesn't have to click play again.
    if (wasPlayingRef.current && videoRef.current) {
      wasPlayingRef.current = false
      setIsPlaying(true)
      videoRef.current.play().catch(() => {
        // Autoplay blocked by browser policy — user can press play manually
        setIsPlaying(false)
      })
    }
  }, [])

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>): void => {
      const videoEl = e.currentTarget
      console.error('Video error:', videoEl.error)

      // Transient seek error — auto-recover by reloading at the last known position
      if (
        videoEl.error?.code === MediaError.MEDIA_ERR_DECODE ||
        videoEl.error?.message?.includes('seek failed')
      ) {
        console.warn('Transient seek error — attempting auto-recovery')
        const lastTime = currentTime
        const wasPlaying = isPlaying
        // Reload the video element
        videoEl.load()
        videoEl.currentTime = lastTime
        if (wasPlaying) {
          videoEl.play().catch(() => {
            /* ignore */
          })
        }
        return
      }

      let errorMessage = 'Failed to load video'
      if (videoEl.error) {
        switch (videoEl.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Video loading was aborted'
            break
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error while loading video'
            break
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Video file is corrupted or unsupported format'
            break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Video format not supported by your browser'
            break
        }
      }
      setVideoError(errorMessage)
      setIsLoading(false)
    },
    [currentTime, isPlaying]
  )

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const time = parseFloat(e.target.value)
      // Update the UI immediately for responsiveness
      setCurrentTime(time)
      setCurrentTimecode(toTimecode(time))
      // Debounce the actual video.currentTime update to avoid overwhelming Chromium's
      // demuxer with overlapping range requests during rapid scrubbing
      if (seekDebounceRef.current) {
        clearTimeout(seekDebounceRef.current)
      }
      seekDebounceRef.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = time
        }
        seekDebounceRef.current = null
      }, 100)
    },
    [toTimecode]
  )

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const vol = parseFloat(e.target.value)
    setVolume(vol)
    if (videoRef.current) {
      videoRef.current.volume = vol
    }
  }, [])

  const handlePlaybackRateChange = useCallback((rate: number): void => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }, [])

  const skipBack = useCallback((): void => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
    }
  }, [])

  const skipForward = useCallback((): void => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5)
    }
  }, [duration])

  // MXF stream seek: restart FFmpeg from new position
  const handleMxfStreamSeek = useCallback((): void => {
    if (!isMxfStream || !videoRef.current) return
    const seekTime = videoRef.current.currentTime
    const base = videoPath.split('?')[0]
    const newSrc = `${base}?seek=${seekTime.toFixed(3)}`
    if (newSrc !== activeSrc) {
      console.log('mxfstream seek: restarting FFmpeg at', seekTime, 's')
      setActiveSrc(newSrc)
      setIsLoading(true)
    }
  }, [isMxfStream, videoPath, activeSrc])

  // Toggle audio channel on/off
  const toggleAudioChannel = useCallback((channelNum: number): void => {
    setEnabledChannels((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(channelNum)) {
        newSet.delete(channelNum)
      } else {
        newSet.add(channelNum)
      }
      const gain = channelGainsRef.current[channelNum - 1]
      if (gain) {
        gain.gain.value = newSet.has(channelNum) ? 1 : 0
      }
      return newSet
    })
  }, [])

  // ─── Fullscreen handling ──────────────────────────────────

  const toggleFullscreen = useCallback((): void => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err)
      })
    } else {
      document.exitFullscreen()
    }
  }, [])

  // Sync isFullscreen state with actual fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // ─── Effects ──────────────────────────────────────────────

  // Keep a live ref so source-change logic can read the latest play state
  // without depending on `isPlaying` in that effect.
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // Reset state when video source changes
  useEffect(() => {
    // Capture current playing state BEFORE resetting — used by handleLoadedData to
    // decide whether to auto-resume after the new source finishes loading.
    wasPlayingRef.current = isPlayingRef.current
    setIsLoading(true)
    setVideoError(null)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setActiveSrc(videoPath)
    // Explicitly call .load() so Chromium/Electron reliably picks up the new src.
    // Changing the src attribute alone does not always trigger a reload when a
    // local:// source was already playing.
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [videoPath])

  // Web Audio API for per-channel control
  useEffect(() => {
    const video = videoRef.current
    if (!video || totalAudioChannels === 0) return
    if (audioContextRef.current) return

    let ctx: AudioContext | null = null

    const setupAudio = (): void => {
      try {
        let source = audioSourceRef.current

        if (!source) {
          // First-time setup: create context and permanently bind source node.
          // createMediaElementSource() can only be called once per element — ever.
          ctx = new AudioContext()
          source = ctx.createMediaElementSource(video)
          audioSourceRef.current = source
          audioContextRef.current = ctx
        } else {
          // Source already bound (e.g. totalAudioChannels changed after a src switch).
          // Reuse the existing context; just rebuild the downstream gain graph.
          ctx = audioContextRef.current!
          source.disconnect()
        }

        // Use the FFprobe-derived channel count (totalAudioChannels) rather than
        // source.channelCount, which defaults to 2 (stereo) regardless of the
        // actual media content.  Force the source to pass all channels through
        // without downmixing.
        const actualChannels = totalAudioChannels
        source.channelCount = actualChannels
        source.channelCountMode = 'explicit'
        source.channelInterpretation = 'discrete'

        if (actualChannels === 0) return

        const splitter = ctx.createChannelSplitter(actualChannels)
        const merger = ctx.createChannelMerger(actualChannels)
        source.connect(splitter)

        const gains: GainNode[] = []
        for (let i = 0; i < actualChannels; i++) {
          const gain = ctx.createGain()
          gain.gain.value = enabledChannels.has(i + 1) ? 1 : 0
          splitter.connect(gain, i)
          // Route each channel to the same output index to preserve position
          gain.connect(merger, 0, Math.min(i, 1))
          gains.push(gain)
        }

        merger.connect(ctx.destination)
        channelGainsRef.current = gains
      } catch (err) {
        console.warn('Web Audio API setup failed:', err)
        ctx?.close()
      }
    }

    const onCanPlay = (): void => {
      // Always (re-)run setup: if source node already exists, setupAudio rebuilds
      // only the downstream gain graph without calling createMediaElementSource again.
      setupAudio()
    }
    video.addEventListener('canplay', onCanPlay, { once: true })

    return () => {
      video.removeEventListener('canplay', onCanPlay)
      // Do NOT close the AudioContext or null audioSourceRef here — the
      // MediaElementSourceNode is permanently bound to this element and cannot be
      // recreated. Only reset the per-run gain list; context lives until unmount.
      channelGainsRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAudioChannels, videoPath])

  // Close the AudioContext when the VideoPlayer component is fully unmounted.
  // This cannot live in the audio setup effect above because that effect must not
  // close the context on re-runs (createMediaElementSource can only be called once).
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
        audioSourceRef.current = null
        channelGainsRef.current = []
      }
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          skipBack()
          break
        case 'ArrowRight':
          e.preventDefault()
          skipForward()
          break
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen()
          } else {
            onClose()
          }
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isPlaying, isFullscreen, onClose, togglePlayPause, skipBack, skipForward, toggleFullscreen])

  // Derived display values
  const filename = videoPath.split('/').pop()?.split('?')[0] || ''
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // ─── Render ───────────────────────────────────────────────

  return (
    <div ref={containerRef} className="fixed inset-0 bg-app-black z-50 flex flex-col">
      {/* Header Bar */}
      <div className="bg-surface/95 border-b border-surface-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-icon" title="Back to browser (Esc)">
            <svg
              className="w-5 h-5 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="item-title max-w-md">{filename}</h2>
          <SourceBadge badgeType={badgeType} />
          {/* Proxy → Full File toggle — only shown when a higher-res file exists */}
          {hasMainFile && onSwitchToMain && (
            <button
              id="player-switch-to-main"
              onClick={onSwitchToMain}
              className="px-3 py-1 rounded text-special font-bold transition-colors bg-surface-raised hover:bg-accent text-muted hover:text-app-white border border-surface-border hover:border-accent"
              title="Switch to full-resolution main file"
            >
              Play Original ▶
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Metadata pills */}
          {!!metadata?.frameRate && (
            <span className="text-special text-muted bg-surface-raised px-2 py-0.5 rounded">
              {parseFloat(metadata.frameRate).toFixed(2)} fps
            </span>
          )}
          {metadata?.dropFrame !== undefined && metadata.dropFrame && (
            <span className="badge-warning">DF</span>
          )}
          {/* X close button — top right */}
          <button onClick={onClose} className="btn-icon" title="Close player (Esc)">
            <svg
              className="w-5 h-5 text-muted hover:text-app-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Video Area — fills remaining space */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-app-black">
        <video
          ref={videoRef}
          src={
            isMxfStream
              ? activeSrc
              : `local://${videoPath.split('/').map(encodeURIComponent).join('/')}`
          }
          className="max-w-full max-h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onError={handleVideoError}
          onSeeked={handleMxfStreamSeek}
          onClick={togglePlayPause}
        />

        {/* Loading Indicator */}
        {isLoading && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-app-black/50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-white mx-auto mb-3"></div>
              <p className="text-app-white text-body">Loading video...</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {!!videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-app-black/90">
            <div className="bg-danger/20 border border-danger rounded-lg p-8 max-w-lg mx-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-danger text-5xl">⚠️</div>
                <h3 className="text-header text-app-white">Cannot Play Video</h3>
              </div>
              <p className="text-danger text-subheader mb-4">{videoError}</p>
              <div className="bg-app-black/50 p-3 rounded mb-4">
                <p className="text-special text-muted mb-1">File Path:</p>
                <p className="text-body text-app-white font-mono break-all">{videoPath}</p>
              </div>
              <button onClick={onClose} className="btn-danger w-full py-3">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Timecode Overlay — top right */}
        <div className="absolute top-3 right-3 bg-app-black/80 px-3 py-1.5 rounded-lg border border-warning/50 text-right">
          <div className="timecode">{currentTimecode}</div>
          <div className="text-special text-muted mt-0.5">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Audio Channel Controls */}
        <AudioChannelPanel
          totalAudioChannels={totalAudioChannels}
          enabledChannels={enabledChannels}
          onToggle={toggleAudioChannel}
        />

        {/* Play/Pause Overlay (when paused) */}
        {!isPlaying && !isLoading && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <svg
                className="w-12 h-12 text-app-white ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <PlayerControls
        duration={duration}
        currentTime={currentTime}
        progressPercent={progressPercent}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        volume={volume}
        isFullscreen={isFullscreen}
        onSeek={handleSeek}
        onSkipBack={skipBack}
        onSkipForward={skipForward}
        onTogglePlayPause={togglePlayPause}
        onPlaybackRateChange={handlePlaybackRateChange}
        onVolumeChange={handleVolumeChange}
        onToggleFullscreen={toggleFullscreen}
        formatTime={formatTime}
      />
    </div>
  )
}
