import React, { useRef, useState, useEffect, useCallback } from 'react'
import { secondsToTimecode, timecodeToSeconds } from '../utils/formatters'

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

export function VideoPlayer({
  videoPath,
  isTranscoded = false,
  isMxfStream = false,
  metadata,
  onClose,
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const channelGainsRef = useRef<GainNode[]>([])
  // For mxfstream:// we track the active src URL so we can update it on seek
  const [activeSrc, setActiveSrc] = useState<string>(videoPath)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [currentTimecode, setCurrentTimecode] = useState('00:00:00:00')
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Audio channel controls - track which channels are enabled (1-8)
  const [enabledChannels, setEnabledChannels] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5, 6, 7, 8])
  )

  // Get total number of audio channels from metadata.
  // NOTE: We clamp to 8 max and will validate against the decoded stream at runtime.
  const totalAudioChannels = Math.min(
    metadata?.audio?.reduce((acc, stream) => acc + stream.channels, 0) || 0,
    8
  )

  // Get framerate from metadata (no silent fallback to 30)
  const fps = metadata?.frameRate ? parseFloat(metadata.frameRate) : null

  // Convert current time to timecode using shared formatter
  const toTimecode = useCallback(
    (seconds: number): string => {
      const effectiveFps = fps || 24
      const startTCSeconds = metadata?.startTimecode
        ? timecodeToSeconds(metadata.startTimecode, effectiveFps)
        : 0
      const totalSeconds = startTCSeconds + seconds
      return secondsToTimecode(totalSeconds, effectiveFps, metadata?.dropFrame || false)
    },
    [fps, metadata?.startTimecode, metadata?.dropFrame]
  )

  // Update timecode display
  useEffect(() => {
    if (videoRef.current) {
      const updateTimecode = (): void => {
        const tc = toTimecode(videoRef.current?.currentTime || 0)
        setCurrentTimecode(tc)
      }
      const video = videoRef.current
      video.addEventListener('timeupdate', updateTimecode)
      return () => {
        video.removeEventListener('timeupdate', updateTimecode)
      }
    }
    return undefined
  }, [metadata, toTimecode])

  // Handle play/pause
  const togglePlayPause = useCallback((): void => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying])

  // Handle time update
  const handleTimeUpdate = (): void => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  // Handle video error
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>): void => {
    const videoEl = e.currentTarget
    console.error('Video error:', videoEl.error)

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
  }

  // Handle video loaded
  const handleLoadedData = (): void => {
    setIsLoading(false)
    setVideoError(null)
  }

  // Reset loading state and active src when the video source changes
  useEffect(() => {
    setIsLoading(true)
    setVideoError(null)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setActiveSrc(videoPath)
  }, [videoPath])

  // For mxfstream:// sources: when the user seeks, restart FFmpeg from the new position
  // by updating the src URL with ?seek=N — the browser will cancel the old stream
  // (triggering ffmpeg.kill) and open a new one from the seek point.
  const handleMxfStreamSeek = useCallback((): void => {
    if (!isMxfStream || !videoRef.current) return
    const seekTime = videoRef.current.currentTime
    // Build new URL with updated seek param
    const base = videoPath.split('?')[0]
    const newSrc = `${base}?seek=${seekTime.toFixed(3)}`
    if (newSrc !== activeSrc) {
      console.log('mxfstream seek: restarting FFmpeg at', seekTime, 's')
      setActiveSrc(newSrc)
      setIsLoading(true)
    }
  }, [isMxfStream, videoPath, activeSrc])

  // Toggle audio channel on/off — updates both state and Web Audio gain
  const toggleAudioChannel = (channelNum: number): void => {
    setEnabledChannels((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(channelNum)) {
        newSet.delete(channelNum)
      } else {
        newSet.add(channelNum)
      }
      // Update the gain node for this channel (0-indexed)
      const gain = channelGainsRef.current[channelNum - 1]
      if (gain) {
        gain.gain.value = newSet.has(channelNum) ? 1 : 0
      }
      return newSet
    })
  }

  // Set up Web Audio API for per-channel control.
  // The proxy MP4 may have fewer channels than the MXF metadata reports,
  // so we guard with try/catch and detect the actual decoded channel count
  // from the video element's audio output channel count.
  useEffect(() => {
    const video = videoRef.current
    if (!video || totalAudioChannels === 0) return

    // Only create the audio context once per video element
    if (audioContextRef.current) return

    let ctx: AudioContext | null = null

    const setupAudio = (): void => {
      try {
        ctx = new AudioContext()
        const source = ctx.createMediaElementSource(video)

        // Use the smaller of metadata channels vs what the browser actually decoded.
        // MediaElementSourceNode exposes channelCount after connection.
        source.connect(ctx.destination) // temporary connect to read channelCount
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
        console.warn('Web Audio API setup failed (channel count mismatch or unsupported):', err)
        // Graceful degradation — audio still plays through default pipeline
        ctx?.close()
      }
    }

    // Audio context must be created/resumed after a user gesture.
    // The 'canplay' event fires after the browser has decoded enough to know channel count.
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
  }, [totalAudioChannels, videoPath]) // Re-create when channel count or source changes

  // Handle loaded metadata
  const handleLoadedMetadata = (): void => {
    if (!videoRef.current) return
    const videoDuration = videoRef.current.duration
    if (isFinite(videoDuration) && videoDuration > 0) {
      // Normal file — use the video element's reported duration
      setDuration(videoDuration)
    } else if (metadata?.duration) {
      // Streaming (mxfstream://) — video.duration is Infinity; use FFprobe metadata
      const metaDuration = parseFloat(metadata.duration)
      if (isFinite(metaDuration) && metaDuration > 0) {
        setDuration(metaDuration)
      }
    }
  }

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const vol = parseFloat(e.target.value)
    setVolume(vol)
    if (videoRef.current) {
      videoRef.current.volume = vol
    }
  }

  // Handle playback rate change
  const handlePlaybackRateChange = (rate: number): void => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5)
        }
      } else if (e.code === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isPlaying, duration, onClose, togglePlayPause])

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">Video Player</h2>
          <div className="text-sm text-gray-400">
            {(isMxfStream ? videoPath : videoPath).split('/').pop()?.split('?')[0]}
          </div>
          {isMxfStream && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-600/30 text-orange-300 border border-orange-600/40">
              MXF Stream
            </span>
          )}
          {!isMxfStream && isTranscoded && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-600/30 text-amber-300 border border-amber-600/40">
              Preview
            </span>
          )}
          {!isMxfStream && !isTranscoded && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-600/30 text-blue-300 border border-blue-600/40">
              Proxy
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <svg
            className="w-6 h-6 text-gray-400"
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

      {/* Video Container */}
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={isMxfStream ? activeSrc : `local://${videoPath}`}
          className="max-w-full max-h-full"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onError={handleVideoError}
          onSeeked={handleMxfStreamSeek}
          onClick={togglePlayPause}
        />

        {/* Loading Indicator */}
        {isLoading && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white text-lg">Loading video...</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90">
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-8 max-w-lg mx-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-red-500 text-5xl">⚠️</div>
                <h3 className="text-2xl font-bold text-white">Cannot Play Video</h3>
              </div>
              <p className="text-red-200 text-lg mb-4">{videoError}</p>
              <div className="bg-black/50 p-3 rounded mb-4">
                <p className="text-xs text-gray-400 mb-1">File Path:</p>
                <p className="text-sm text-gray-300 font-mono break-all">{videoPath}</p>
              </div>
              <button
                onClick={onClose}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Timecode Overlay */}
        <div className="absolute top-4 right-4 bg-black/80 px-4 py-2 rounded-lg font-mono text-2xl text-white border border-yellow-500/50">
          {currentTimecode}
        </div>

        {/* Metadata Info Overlay */}
        {metadata && (
          <div className="absolute top-4 left-4 bg-black/80 px-4 py-2 rounded-lg text-sm text-white space-y-1">
            {metadata?.frameRate && (
              <div>
                <span className="text-gray-400">Frame Rate:</span>{' '}
                {parseFloat(metadata.frameRate).toFixed(2)}
              </div>
            )}
            {metadata?.startTimecode && (
              <div>
                <span className="text-gray-400">Start TC:</span> {metadata.startTimecode}
              </div>
            )}
            {metadata?.dropFrame !== undefined && (
              <div>
                <span className="text-gray-400">Drop Frame:</span>{' '}
                {metadata.dropFrame ? 'Yes' : 'No'}
              </div>
            )}
          </div>
        )}

        {/* Audio Channel Controls - Bottom Right — always show Ch 1–4 */}
        <div className="absolute bottom-24 right-4 bg-black/90 px-3 py-3 rounded-lg border border-gray-700">
          <div className="text-xs font-semibold text-gray-300 mb-2 text-center">Audio</div>
          <div className="flex flex-col gap-1.5">
            {[1, 2, 3, 4].map((channelNum) => {
              const exists = channelNum <= totalAudioChannels
              const enabled = enabledChannels.has(channelNum)
              return (
                <button
                  key={channelNum}
                  onClick={() => exists && toggleAudioChannel(channelNum)}
                  disabled={!exists}
                  title={exists ? `Toggle channel ${channelNum}` : `Channel ${channelNum} not present in this clip`}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    !exists
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-40'
                      : enabled
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  CH {channelNum}
                </button>
              )
            })}
          </div>
        </div>

        {/* Play/Pause Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Controls - Always Visible */}
      <div className="bg-gray-900 border-t border-gray-700 p-4">
        {/* Timeline */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #374151 ${(currentTime / duration) * 100}%, #374151 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="p-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isPlaying ? (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip Back */}
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
                }
              }}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
                />
              </svg>
            </button>

            {/* Skip Forward */}
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.min(
                    duration,
                    videoRef.current.currentTime + 5
                  )
                }
              }}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
                />
              </svg>
            </button>

            {/* Playback Speed */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Speed:</span>
              {[0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    playbackRate === rate
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-sm text-gray-400 w-8">{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
