import { createHash } from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import { app } from 'electron'

function getUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    // Fallback when app path is not yet available (e.g. very early process startup)
    return path.join(os.homedir(), 'Library', 'Application Support', 'mxf-media-reader')
  }
}

export function getRawPreviewDir(): string {
  return path.join(getUserDataPath(), 'raw-previews')
}

export function getRawPreviewPath(rawPath: string): string {
  const basename = path.basename(rawPath, path.extname(rawPath))
  const hash = createHash('sha1').update(rawPath).digest('hex').slice(0, 12)
  return path.join(getRawPreviewDir(), `${basename}-${hash}-preview.jpg`)
}
