import React from 'react'

interface AudioChannelPanelProps {
  totalAudioChannels: number
  enabledChannels: Set<number>
  onToggle: (channelNum: number) => void
}

export function AudioChannelPanel({
  totalAudioChannels,
  enabledChannels,
  onToggle
}: AudioChannelPanelProps): React.ReactElement {
  return (
    <div className="absolute bottom-4 right-3 bg-app-black/90 px-3 py-2 rounded-lg border border-surface-border">
      <div className="text-special font-bold text-app-white mb-1.5 text-center">Audio</div>
      <div className="flex flex-col gap-1">
        {[1, 2, 3, 4].map((channelNum) => {
          const exists = channelNum <= totalAudioChannels
          const enabled = enabledChannels.has(channelNum)
          return (
            <button
              key={channelNum}
              onClick={() => exists && onToggle(channelNum)}
              disabled={!exists}
              title={exists ? `Toggle channel ${channelNum}` : `Channel ${channelNum} not present`}
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
  )
}
