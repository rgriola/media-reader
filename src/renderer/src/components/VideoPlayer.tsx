import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { timecodeToFrames, framesToTimecode } from '../utils/formatters'

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
  isTranscoded?: boolean
  isMxfStream?: boolean // true when playing via mxfstream:// protocol
  metadata?: {
    startTimecode?: string
    duration?: string
    frameRate?: string
    dropFrame?: boolean
    audio?: AudioStream[]
  }
  onClose: () => void
}

// ─── Icon Components ───────────────────────────────────────────

function PlayIcon(): React.ReactElement {
  return (
    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon(): React.ReactElement {
  return (
    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  )
}

function SkipBackIcon(): React.ReactElement {
  return (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
      />
    </svg>
  )
}

function SkipForwardIcon(): React.ReactElement {
  return (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
      />
    </svg>
  )
}




function FullscreenIcon(): React.ReactElement {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
      />
    </svg>
  )
}

function ExitFullscreenIcon(): React.ReactElement {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 9V4H4m0 0l5 5M9 15v5H4m0 0l5-5m6-6V4h5m0 0l-5 5m5 6v5h-5m0 0l5-5"
      />
    </svg>
  )
}

function VolumeIcon(): React.ReactElement {
  return (
    <svg className="w-5 h-5 text-muted" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  )
}

// ─── Timeline Tick Marks Component ─────────────────────────────

function TimelineTicks({
  duration,
  className
}: {
  duration: number
  className?: string
}): React.ReactElement {
  const ticks = useMemo(() => {
    if (duration <= 0) return []
    const result: { position: number; isMajor: boolean }[] = []
    // Generate ticks every 5 seconds, major ticks at 10s intervals
    const interval = 5
    for (let t = interval; t < duration; t += interval) {
      result.push({ position: (t / duration) * 100, isMajor: t % 10 === 0 })
    }
    return result
  }, [duration])

  return (
    <div className={`absolute inset-0 pointer-events-none ${className || ''}`}>
      {ticks.map((tick) => (
        <div
          key={tick.position}
          className={`absolute ${tick.isMajor ? 'bg-muted' : 'bg-muted/40'}`}
          style={{
            left: `${tick.position}%`,
            width: '1px',
            height: tick.isMajor ? '100%' : '60%',
            bottom: 0
          }}
        />
      ))}
    </div>
  )
}

// ─── Source Badge Component ────────────────────────────────────

function SourceBadge({
  isMxfStream,
  isTranscoded
}: {
  isMxfStream: boolean
  isTranscoded: boolean
}): React.ReactElement {
  if (isMxfStream) {
    return (
      <span className="badge-mxf">
        MXF Stream
      </span>
    )
  }
  if (isTranscoded) {
    return (
      <span className="badge-warning">
        Preview
      </span>
    )
  }
  return (
    <span className="badge-accent">
      Proxy
    </span>
  )
}

// ─── Main VideoPlayer Component ────────────────────────────────

export function VideoPlayer({
  videoPath,
  isTranscoded = false,
  isMxfStream = false,
  metadata,
  onClose
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const channelGainsRef = useRef<GainNode[]>([])

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
      return framesToTimecode(startFrames + elapsedFrames, effectiveFps, metadata?.dropFrame || false)
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
    if (isFinite(videoDuration) && videoDuration > 0) {
      setDuration(videoDuration)
    } else if (metadata?.duration) {
      const metaDuration = parseFloat(metadata.duration)
      if (isFinite(metaDuration) && metaDuration > 0) {
        setDuration(metaDuration)
      }
    }
  }, [metadata?.duration])

  const handleLoadedData = useCallback((): void => {
    setIsLoading(false)
    setVideoError(null)
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
          videoEl.play().catch(() => { /* ignore */ })
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

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
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
  }, [toTimecode])

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
  const toggleAudioChannel = useCallback(
    (channelNum: number): void => {
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
    },
    []
  )

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

  // Reset state when video source changes
  useEffect(() => {
    setIsLoading(true)
    setVideoError(null)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setActiveSrc(videoPath)
  }, [videoPath])

  // Web Audio API for per-channel control
  useEffect(() => {
    const video = videoRef.current
    if (!video || totalAudioChannels === 0) return
    if (audioContextRef.current) return

    let ctx: AudioContext | null = null

    const setupAudio = (): void => {
      try {
        ctx = new AudioContext()
        const source = ctx.createMediaElementSource(video)

        source.connect(ctx.destination)
        const actualChannels = Math.min(
          source.channelCount || totalAudioChannels,
          totalAudioChannels
        )
        source.disconnect()

        if (actualChannels === 0) return

        const splitter = ctx.createChannelSplitter(actualChannels)
        const merger = ctx.createChannelMerger(actualChannels)
        source.connect(splitter)

        const gains: GainNode[] = []
        for (let i = 0; i < actualChannels; i++) {
          const gain = ctx.createGain()
          gain.gain.value = enabledChannels.has(i + 1) ? 1 : 0
          splitter.connect(gain, i)
          gain.connect(merger, 0, i)
          gains.push(gain)
        }

        merger.connect(ctx.destination)
        channelGainsRef.current = gains
        audioContextRef.current = ctx
      } catch (err) {
        console.warn('Web Audio API setup failed:', err)
        ctx?.close()
      }
    }

    const onCanPlay = (): void => {
      if (!audioContextRef.current) setupAudio()
    }
    video.addEventListener('canplay', onCanPlay, { once: true })

    return () => {
      video.removeEventListener('canplay', onCanPlay)
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
        channelGainsRef.current = []
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAudioChannels, videoPath])

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
          <button
            onClick={onClose}
            className="btn-icon"
            title="Back to browser (Esc)"
          >
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
          <h2 className="text-body font-bold text-app-white truncate max-w-md">{filename}</h2>
          <SourceBadge isMxfStream={isMxfStream} isTranscoded={isTranscoded} />
        </div>

        <div className="flex items-center gap-2">
          {/* Metadata pills */}
          {!!metadata?.frameRate && (
            <span className="text-special text-muted bg-surface-raised px-2 py-0.5 rounded">
              {parseFloat(metadata.frameRate).toFixed(2)} fps
            </span>
          )}
          {metadata?.dropFrame !== undefined && metadata.dropFrame && (
            <span className="badge-warning">
              DF
            </span>
          )}
          {/* X close button — top right */}
          <button
            onClick={onClose}
            className="btn-icon"
            title="Close player (Esc)"
          >
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
          src={isMxfStream ? activeSrc : `local://${videoPath}`}
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

        {/* Audio Channel Controls — bottom right */}
        <div className="absolute bottom-4 right-3 bg-app-black/90 px-3 py-2 rounded-lg border border-surface-border">
          <div className="text-special font-bold text-app-white mb-1.5 text-center">Audio</div>
          <div className="flex flex-col gap-1">
            {[1, 2, 3, 4].map((channelNum) => {
              const exists = channelNum <= totalAudioChannels
              const enabled = enabledChannels.has(channelNum)
              return (
                <button
                  key={channelNum}
                  onClick={() => exists && toggleAudioChannel(channelNum)}
                  disabled={!exists}
                  title={
                    exists
                      ? `Toggle channel ${channelNum}`
                      : `Channel ${channelNum} not present`
                  }
                  className={`px-2.5 py-0.5 rounded text-special transition-colors ${
                    !exists
                      ? 'bg-surface text-muted cursor-not-allowed opacity-40'
                      : enabled
                        ? 'bg-success text-app-white hover:bg-success/80'
                        : 'bg-surface-raised text-muted hover:bg-surface-border'
                  }`}
                >
                  CH {channelNum}
                </button>
              )
            })}
          </div>
        </div>

        {/* Play/Pause Overlay (when paused) */}
        {!isPlaying && !isLoading && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <svg className="w-12 h-12 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar — pinned to bottom */}
      <div className="bg-surface/95 border-t border-surface-border px-4 py-3 shrink-0">
        {/* Timeline with tick marks */}
        <div className="mb-3">
          <div className="relative h-2">
            <TimelineTicks duration={duration} />
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="any"
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer z-10"
              style={{
                background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${progressPercent}%, #333333 ${progressPercent}%, #333333 100%)`
              }}
            />
          </div>
          <div className="flex justify-between text-special text-muted mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Skip Back */}
            <button
              onClick={skipBack}
              className="btn-icon p-2"
              title="Skip back 5s (←)"
            >
              <SkipBackIcon />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="p-3 bg-accent hover:bg-accent-hover rounded-lg transition-colors"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            {/* Skip Forward */}
            <button
              onClick={skipForward}
              className="btn-icon p-2"
              title="Skip forward 5s (→)"
            >
              <SkipForwardIcon />
            </button>

            {/* Playback Speed */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-special text-muted">Speed:</span>
              {[0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-2 py-0.5 rounded text-special transition-colors ${
                    playbackRate === rate
                      ? 'bg-accent text-app-white'
                      : 'bg-surface-raised text-muted hover:bg-surface-border'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Right side: Volume + Fullscreen */}
          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <VolumeIcon />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1.5 bg-surface-border rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <span className="text-special text-muted w-7">{Math.round(volume * 100)}%</span>
            </div>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="btn-icon p-2"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
