import { useState } from 'react'

function Versions(): React.JSX.Element {
  // Fallback for versions if not available in API
  const [versions] = useState((window.electron as any)?.process?.versions || {})

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
