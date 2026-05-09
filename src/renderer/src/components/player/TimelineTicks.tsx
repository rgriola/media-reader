import React, { useMemo } from 'react'

interface TimelineTicksProps {
  duration: number
  className?: string
}

export function TimelineTicks({ duration, className }: TimelineTicksProps): React.ReactElement {
  const ticks = useMemo(() => {
    if (duration <= 0) return []
    const result: { position: number; isMajor: boolean }[] = []
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
