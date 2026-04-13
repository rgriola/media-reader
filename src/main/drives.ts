/**
 * SD Card and External Drive Management
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import { watch } from 'chokidar'
import { BrowserWindow } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import { framesToTimecode } from '../shared/timecode'
import type { XMLMetadata, MXFFileInfo, ExternalDrive } from '../renderer/src/types'

/**
 * Check if a drive is a network drive (Tailscale, SMB, NFS, etc.)
 */
async function isNetworkDrive(drivePath: string): Promise<boolean> {
  try {
    // On macOS, we can check if the volume is a network mount
    // Network drives typically have different filesystem types
    const { execSync } = await import('child_process')

    // Use 'mount' command to check filesystem type
    const mountOutput = execSync('mount', { encoding: 'utf-8' })
    const lines = mountOutput.split('\n')

    for (const line of lines) {
      if (line.includes(drivePath)) {
        // Check for network filesystem types
        if (
          line.includes('smbfs') || // SMB/CIFS
          line.includes('nfs') || // NFS
          line.includes('afp') || // AFP (Apple Filing Protocol)
          line.includes('fuse') || // FUSE (often used by Tailscale)
          line.includes('osxfuse') || // macFUSE
          line.includes('macfuse')
        ) {
          // macFUSE
          return true
        }
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Check if a volume is the system/boot volume
 */
async function isSystemVolume(volumePath: string): Promise<boolean> {
  try {
    // Check if this volume is a symlink or mount point to the root filesystem
    const realPath = await fs.realpath(volumePath)

    // The system volume's real path will be '/' or start with '/System/Volumes'
    if (realPath === '/' || realPath.startsWith('/System/Volumes')) {
      return true
    }

    // Alternative check: see if the volume contains typical system directories
    try {
      const contents = await fs.readdir(volumePath)
      const systemDirs = ['System', 'Library', 'Applications', 'Users']
      const hasSystemDirs = systemDirs.filter((dir) => contents.includes(dir)).length >= 3

      if (hasSystemDirs) {
        return true
      }
    } catch {
      // Can't read contents, not a system volume
    }

    return false
  } catch {
    return false
  }
}

/**
 * Get all mounted external drives (macOS)
 */
export async function getExternalDrives(): Promise<ExternalDrive[]> {
  const volumesPath = '/Volumes'
  const drives: ExternalDrive[] = []

  try {
    const volumes = await fs.readdir(volumesPath)

    for (const volumeName of volumes) {
      // Skip hidden volumes
      if (volumeName.startsWith('.')) {
        continue
      }

      const drivePath = path.join(volumesPath, volumeName)

      try {
        const stats = await fs.stat(drivePath)
        if (!stats.isDirectory()) continue

        // Check if this is the system volume
        const isSystem = await isSystemVolume(drivePath)
        if (isSystem) {
          console.log(`Skipping system volume: ${volumeName}`)
          continue
        }

        console.log(`Scanning drive: ${drivePath}`)

        // Check if this is a network drive
        const isNetwork = await isNetworkDrive(drivePath)
        console.log(`  Is network drive: ${isNetwork}`)

        // Check if this is a Sony camera card
        const isSonyCard = await checkIfSonyCard(drivePath)
        console.log(`  Is Sony card: ${isSonyCard}`)

        // Scan for MXF files (with timeout for network drives)
        const mxfFiles = isSonyCard
          ? await scanSonyCardForMXF(drivePath)
          : await scanDriveForMXF(drivePath, isNetwork ? 2 : 3) // Shallower scan for network drives

        console.log(`  Found ${mxfFiles.length} MXF files`)

        // Only add drives that have MXF files
        if (mxfFiles.length === 0) {
          console.log(`  Skipping drive with no MXF files: ${volumeName}`)
          continue
        }

        // Calculate total size
        let totalSize = 0
        for (const file of mxfFiles) {
          try {
            const fileStats = await fs.stat(file.path)
            totalSize += fileStats.size
          } catch (err) {
            console.error(`  Error accessing file ${file.path}:`, err)
          }
        }

        drives.push({
          name: volumeName,
          path: drivePath,
          isSonyCard,
          isNetworkDrive: isNetwork,
          mxfFiles,
          totalSize,
          fileCount: mxfFiles.length
        })
      } catch (err) {
        console.error(`Error scanning drive ${volumeName} (${drivePath}):`, err)
      }
    }
  } catch (err) {
    console.error('Error reading volumes:', err)
  }

  return drives
}

/**
 * Check if a drive is a Sony camera card
 * Sony cards must have ONLY /SONY and /XDROOT directories (plus hidden files)
 */
async function checkIfSonyCard(drivePath: string): Promise<boolean> {
  try {
    const contents = await fs.readdir(drivePath)

    // Filter out hidden files/directories (starting with .)
    const visibleContents = contents.filter((item) => !item.startsWith('.'))

    // Sony cards must have exactly SONY and XDROOT directories, nothing else
    const hasSony = visibleContents.includes('SONY')
    const hasXDRoot = visibleContents.includes('XDROOT')
    const hasOnlyTheseTwo = visibleContents.length === 2

    return hasSony && hasXDRoot && hasOnlyTheseTwo
  } catch {
    return false
  }
}

/**
 * Convert raw timecode value to HH:MM:SS:FF format
 * @param rawValue - Raw timecode value (could be frame count or formatted string)
 * @param frameRate - Frame rate (e.g., "29.97", "30", "23.98")
 * @param dropFrame - Whether this is drop-frame timecode
 */
function formatTimecode(
  rawValue: string | number,
  frameRate?: string,
  dropFrame?: boolean
): string {
  // If it's already formatted (contains colons), return as-is
  if (typeof rawValue === 'string' && rawValue.includes(':')) {
    return rawValue
  }

  // Convert to number if it's a string
  const totalFrames = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10)

  if (isNaN(totalFrames)) {
    return String(rawValue)
  }

  // Parse frame rate, default to 30 if not provided
  const fps = frameRate ? parseFloat(frameRate) : 30

  return framesToTimecode(totalFrames, fps, dropFrame || false)
}

/**
 * Parse Sony XDCAM XML metadata file
 */
async function parseXMLMetadata(xmlPath: string): Promise<XMLMetadata | null> {
  try {
    const xmlContent = await fs.readFile(xmlPath, 'utf-8')
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const result = parser.parse(xmlContent)
    const meta = result.NonRealTimeMeta || {}

    const metadata: XMLMetadata = {
      // Store complete raw XML data
      rawXML: result,
      xmlFilePath: xmlPath
    }

    // Extract timecode
    if (meta.LtcChangeTable?.LtcChange) {
      const ltcChange = Array.isArray(meta.LtcChangeTable.LtcChange)
        ? meta.LtcChangeTable.LtcChange[0]
        : meta.LtcChangeTable.LtcChange
      const rawTimecode = ltcChange?.['@_value']
      metadata.dropFrame = meta.LtcChangeTable?.['@_tcDropFrame'] === 'true'

      // Get frame rate first (needed for timecode conversion)
      const rawFrameRate = meta.VideoFormat?.VideoFrame?.['@_captureFps']

      // Format timecode using the helper function
      if (rawTimecode) {
        metadata.startTimecode = formatTimecode(rawTimecode, rawFrameRate, metadata.dropFrame)
      }
    }

    // Extract duration
    if (meta.Duration?.['@_value']) {
      const rawDuration = meta.Duration['@_value']
      const rawFrameRate = meta.VideoFormat?.VideoFrame?.['@_captureFps']
      metadata.duration = formatTimecode(rawDuration, rawFrameRate, metadata.dropFrame)
    }

    // Extract creation date
    if (meta.CreationDate?.['@_value']) {
      metadata.creationDate = meta.CreationDate['@_value']
    }

    // Extract video format info
    if (meta.VideoFormat?.VideoFrame) {
      const videoFrame = meta.VideoFormat.VideoFrame
      metadata.videoCodec = videoFrame?.['@_videoCodec']

      // Format frame rate with 'p' suffix (e.g., "29.97p")
      const rawFrameRate = videoFrame?.['@_captureFps']
      if (rawFrameRate) {
        metadata.frameRate = `${rawFrameRate}p`
      }

      if (videoFrame.VideoLayout) {
        metadata.resolution = videoFrame.VideoLayout?.['@_pixel']
        metadata.aspectRatio = videoFrame.VideoLayout?.['@_aspectRatio']
      }
    }

    return metadata
  } catch (error) {
    console.error(`Failed to parse XML metadata from ${xmlPath}:`, error)
    return null
  }
}

/**
 * Scan Sony camera card for MXF files in standard locations
 */
async function scanSonyCardForMXF(drivePath: string): Promise<MXFFileInfo[]> {
  const mxfFiles: MXFFileInfo[] = []

  // Import camera card configuration
  const { detectCameraCardType } = await import('./camera-cards.config')

  // Detect which camera card type this is
  const contents = await fs.readdir(drivePath)
  const visibleContents = contents.filter((item) => !item.startsWith('.'))
  const cardConfig = detectCameraCardType(visibleContents)

  if (!cardConfig) {
    console.log('  Could not detect Sony camera card type')
    return []
  }

  console.log(`  Detected card type: ${cardConfig.name}`)

  // First, scan for thumbnails
  const thumbnailMap = new Map<string, string>()
  const thumbnailPath = path.join(drivePath, cardConfig.paths.thumbnailDir)

  try {
    const thumbFiles = await fs.readdir(thumbnailPath)

    for (const thumbFile of thumbFiles) {
      if (thumbFile.startsWith('._') || thumbFile.startsWith('.')) {
        continue
      }

      // Check if file matches any of the configured extensions
      const matchesExtension = cardConfig.extensions.thumbnail.some((ext) =>
        thumbFile.toLowerCase().endsWith(ext.toLowerCase())
      )

      if (matchesExtension) {
        // Extract base name by removing the suffix and extension
        // e.g., 918_1001T01.JPG -> 918_1001
        const suffixPattern = new RegExp(`${cardConfig.suffixes.thumbnail}\\.(jpg|jpeg|bmp)$`, 'i')
        const baseName = thumbFile.replace(suffixPattern, '')
        thumbnailMap.set(baseName, path.join(thumbnailPath, thumbFile))
      }
    }
  } catch {
    // Thumbnail directory doesn't exist, continue
  }

  console.log(`  Found ${thumbnailMap.size} thumbnails`)

  // Scan for proxy files
  const proxyMap = new Map<string, string>()
  const proxyPath = path.join(drivePath, cardConfig.paths.proxyDir)

  try {
    const proxyFiles = await fs.readdir(proxyPath)

    for (const proxyFile of proxyFiles) {
      if (proxyFile.startsWith('._') || proxyFile.startsWith('.')) {
        continue
      }

      // Check if file matches any of the configured extensions
      const matchesExtension = cardConfig.extensions.proxy.some((ext) =>
        proxyFile.toLowerCase().endsWith(ext.toLowerCase())
      )

      if (matchesExtension) {
        // Extract base name by removing the suffix and extension
        // e.g., 918_0990S03.MP4 -> 918_0990
        const suffixPattern = new RegExp(`${cardConfig.suffixes.proxy}\\.(mp4|mov)$`, 'i')
        const baseName = proxyFile.replace(suffixPattern, '')
        proxyMap.set(baseName, path.join(proxyPath, proxyFile))
      }
    }
  } catch {
    // Proxy directory doesn't exist, continue
  }

  console.log(`  Found ${proxyMap.size} proxy files`)

  // Scan for MXF files in clip directory
  const clipPath = path.join(drivePath, cardConfig.paths.clipDir)

  try {
    const files = await fs.readdir(clipPath)

    for (const file of files) {
      // Skip macOS resource fork files (._*) and hidden files
      if (file.startsWith('._') || file.startsWith('.')) {
        continue
      }

      if (file.toLowerCase().endsWith('.mxf')) {
        const filePath = path.join(clipPath, file)
        const baseName = path.basename(file, path.extname(file))
        const thumbnail = thumbnailMap.get(baseName)
        const proxy = proxyMap.get(baseName)

        // Look for XML metadata file using config
        let metadata: XMLMetadata | undefined
        try {
          const xmlDir = path.join(drivePath, cardConfig.paths.xmlDir)
          const xmlFiles = await fs.readdir(xmlDir)

          // Find XML file that matches the base name and configured suffix
          const xmlFile = xmlFiles.find((f) => {
            const matchesBaseName = f.toLowerCase().startsWith(baseName.toLowerCase())
            const matchesExtension = cardConfig.extensions.xml.some((ext) =>
              f.toLowerCase().endsWith(ext.toLowerCase())
            )
            return matchesBaseName && matchesExtension
          })

          if (xmlFile) {
            const xmlPath = path.join(xmlDir, xmlFile)
            const parsedMetadata = await parseXMLMetadata(xmlPath)
            if (parsedMetadata) {
              metadata = parsedMetadata
            }
          }
        } catch (error) {
          // XML parsing failed, continue without metadata
          console.warn(`Could not parse XML for ${file}:`, error)
        }

        mxfFiles.push({
          path: filePath,
          name: file,
          thumbnail,
          proxy,
          metadata
        })
      }
    }
  } catch (err) {
    console.error(`  Error scanning clip directory ${clipPath}:`, err)
  }

  return mxfFiles
}

/**
 * Scan entire drive for MXF files (for non-Sony cards)
 */
async function scanDriveForMXF(drivePath: string, maxDepth: number = 3): Promise<MXFFileInfo[]> {
  const mxfFiles: MXFFileInfo[] = []

  async function scanDirectory(dirPath: string, depth: number) {
    if (depth > maxDepth) return

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Skip hidden directories and system folders
          if (!entry.name.startsWith('.') && entry.name !== 'System Volume Information') {
            await scanDirectory(fullPath, depth + 1)
          }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mxf')) {
          // Skip macOS resource fork files (._*)
          if (!entry.name.startsWith('._') && !entry.name.startsWith('.')) {
            mxfFiles.push({
              path: fullPath,
              name: entry.name
              // No thumbnails for non-Sony cards
            })
          }
        }
      }
    } catch (err) {
      // Skip directories we can't access
    }
  }

  await scanDirectory(drivePath, 0)
  return mxfFiles
}

/**
 * Watch for drive mount/unmount events
 */
export function watchExternalDrives(mainWindow: BrowserWindow): void {
  const watcher = watch('/Volumes', {
    depth: 0,
    ignoreInitial: true,
    persistent: true
  })

  watcher.on('addDir', async (drivePath) => {
    console.log('New drive mounted:', drivePath)

    // Wait a bit for the drive to fully mount
    setTimeout(async () => {
      const drives = await getExternalDrives()
      const newDrive = drives.find((d) => d.path === drivePath)

      if (newDrive) {
        mainWindow.webContents.send('drive-mounted', newDrive)
      }
    }, 2000)
  })

  watcher.on('unlinkDir', (drivePath) => {
    console.log('Drive unmounted:', drivePath)
    mainWindow.webContents.send('drive-unmounted', drivePath)
  })
}

/**
 * Get detailed information about MXF files on a drive
 */
export async function getMXFFileInfo(filePath: string): Promise<{
  path: string
  name: string
  size: number
  modified: Date
}> {
  const stats = await fs.stat(filePath)

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    modified: stats.mtime
  }
}
