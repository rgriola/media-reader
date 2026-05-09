import React from 'react'
import { TimelineTicks } from './TimelineTicks'
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  FullscreenIcon,
  ExitFullscreenIcon,
  VolumeIcon
} from './PlayerIcons'

interface PlayerControlsProps {
  duration: number
  currentTime: number
  progressPercent: number
  isPlaying: boolean
  playbackRate: number
  volume: number
  isFullscreen: boolean
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSkipBack: () => void
  onSkipForward: () => void
  onTogglePlayPause: () => void
  onPlaybackRateChange: (rate: number) => void
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onToggleFullscreen: () => void
  formatTime: (seconds: number) => string
}

export function PlayerControls({
  duration,
  currentTime,
  progressPercent,
  isPlaying,
  playbackRate,
  volume,
  isFullscreen,
  onSeek,
  onSkipBack,
  onSkipForward,
  onTogglePlayPause,
  onPlaybackRateChange,
  onVolumeChange,
  onToggleFullscreen,
  formatTime
}: PlayerControlsProps): React.ReactElement {
  return (
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
            onChange={onSeek}
            className="absolute inset-0 w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer z-10"
            style={{
              background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${progressPercent}%, var(--color-surface-border) ${progressPercent}%, var(--color-surface-border) 100%)`
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
          <button onClick={onSkipBack} className="btn-icon p-2" title="Skip back 5s (←)">
            <SkipBackIcon />
          </button>

          <button
            onClick={onTogglePlayPause}
            className="p-3 bg-accent hover:bg-accent-hover rounded-lg transition-colors"
            title="Play/Pause (Space)"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button onClick={onSkipForward} className="btn-icon p-2" title="Skip forward 5s (→)">
            <SkipForwardIcon />
          </button>

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-special text-muted">Speed:</span>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => onPlaybackRateChange(rate)}
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <VolumeIcon />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={onVolumeChange}
              className="w-20 h-1.5 bg-surface-border rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <span className="text-special text-muted w-7">{Math.round(volume * 100)}%</span>
          </div>

          <button
            onClick={onToggleFullscreen}
            className="btn-icon p-2"
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
