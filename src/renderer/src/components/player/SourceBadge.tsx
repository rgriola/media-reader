import React from 'react'
import type { BadgeType } from '../../types'

export function SourceBadge({ badgeType }: { badgeType: BadgeType }): React.ReactElement {
  if (badgeType === 'mxf-stream') {
    return <span className="badge-mxf">🟠 MXF Stream</span>
  }
  if (badgeType === 'native-mp4') {
    return <span className="badge-success">🟢 MP4</span>
  }
  return <span className="badge-accent">🔵 Proxy</span>
}
