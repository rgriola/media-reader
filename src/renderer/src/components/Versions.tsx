import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(() => {
    try {
      return window.api.getVersions()
    } catch {
      return { electron: 'n/a', chrome: 'n/a', node: 'n/a' }
    }
  })

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
