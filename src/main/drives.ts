/**
 * SD Card and External Drive Management
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import { watch } from 'chokidar'
import { BrowserWindow } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import { framesToTimecode } from '../shared/timecode'
import type { XMLMetadata, MXFFileInfo, ExternalDrive, CardIntegrity } from '../renderer/src/types'

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
      if (volumeName.startsWith('.')) continue

      const drivePath = path.join(volumesPath, volumeName)

      try {
        const stats = await fs.stat(drivePath)
        if (!stats.isDirectory()) continue

        const isSystem = await isSystemVolume(drivePath)
        if (isSystem) {
          console.log(`Skipping system volume: ${volumeName}`)
          continue
        }

        console.log(`Scanning drive: ${drivePath}`)

        const isNetwork = await isNetworkDrive(drivePath)
        console.log(`  Is network drive: ${isNetwork}`)

        const isSonyCard = await checkIfSonyCard(drivePath)
        console.log(`  Is Sony card: ${isSonyCard}`)

        // Scan for MXF files — Sony cards try MEDIAPRO.XML first
        let mxfFiles: MXFFileInfo[]
        let cameraModel: string | undefined
        let cardId: string | undefined
        let mediaProMissing: boolean | undefined
        let cardIntegrity: import('../renderer/src/types').CardIntegrity | undefined

        if (isSonyCard) {
          const sonyResult = await scanSonyCardForMXF(drivePath)
          mxfFiles = sonyResult.files
          cameraModel = sonyResult.cameraModel
          cardId = sonyResult.cardId
          mediaProMissing = sonyResult.mediaProMissing
          cardIntegrity = sonyResult.integrity
        } else {
          mxfFiles = await scanDriveForMXF(drivePath, isNetwork ? 2 : 3)
        }

        console.log(`  Found ${mxfFiles.length} MXF files`)

        if (mxfFiles.length === 0) {
          console.log(`  Skipping drive with no MXF files: ${volumeName}`)
          continue
        }

        // Calculate total size in parallel
        const sizeResults = await Promise.all(
          mxfFiles.map(async (file): Promise<number> => {
            try {
              return (await fs.stat(file.path)).size
            } catch {
              return 0
            }
          })
        )
        const totalSize = sizeResults.reduce((sum, s) => sum + s, 0)

        drives.push({
          name: volumeName,
          path: drivePath,
          isSonyCard,
          isNetworkDrive: isNetwork,
          mxfFiles,
          totalSize,
          fileCount: mxfFiles.length,
          cameraModel,
          cardId,
          mediaProMissing,
          cardIntegrity
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
 * Decode a Sony XDCAM LtcChange hex-encoded timecode value.
 *
 * The @_value attribute is an 8-character hex string laid out as:
 *   FF SS MM HH  (little-endian byte order)
 *
 * Each byte is BCD-encoded (e.g. 0x19 = 19 decimal).
 * High bits in each byte carry SMPTE flag data and must be masked:
 *   HH: mask 0x3F (bits 0-5)
 *   MM: mask 0x7F (bits 0-6)
 *   SS: mask 0x7F (bits 0-6)
 *   FF: mask 0x3F (bits 0-5)
 */
function decodeSonyLtcHex(hexStr: string, dropFrame?: boolean): string | null {
  // Must be exactly 8 hex chars
  if (!/^[0-9a-fA-F]{8}$/.test(hexStr)) return null

  const val = parseInt(hexStr, 16)

  // Extract raw bytes (FF SS MM HH layout, big-endian in the 32-bit int)
  const ffRaw = (val >>> 24) & 0xff
  const ssRaw = (val >>> 16) & 0xff
  const mmRaw = (val >>> 8) & 0xff
  const hhRaw = val & 0xff

  // Mask SMPTE flag bits, then BCD-decode each byte
  const bcd = (byte: number): number => {
    const tens = (byte >> 4) & 0x0f
    const units = byte & 0x0f
    return tens * 10 + units
  }

  const hh = bcd(hhRaw & 0x3f)
  const mm = bcd(mmRaw & 0x7f)
  const ss = bcd(ssRaw & 0x7f)
  const ff = bcd(ffRaw & 0x3f)

  // Sanity check
  if (hh > 23 || mm > 59 || ss > 59 || ff > 59) return null

  const pad = (n: number): string => n.toString().padStart(2, '0')
  const separator = dropFrame ? ';' : ':'
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${pad(ff)}`
}

/**
 * Convert raw timecode value to HH:MM:SS:FF format.
 *
 * Handles three input shapes:
 *  1. Already formatted (contains colons) — returned as-is
 *  2. Sony hex-encoded LTC (8-char hex string) — decoded via decodeSonyLtcHex
 *  3. Plain frame count — converted via framesToTimecode()
 *
 * @param rawValue - Raw timecode value from XML
 * @param frameRate - Frame rate string (e.g., "29.97p", "30")
 * @param dropFrame - Whether this is drop-frame timecode
 */
function formatTimecode(
  rawValue: string | number,
  frameRate?: string,
  dropFrame?: boolean
): string {
  // 1. Already formatted (contains colons or semicolons) — return as-is
  if (typeof rawValue === 'string' && /[:;]/.test(rawValue)) {
    return rawValue
  }

  // 2. Try Sony hex-encoded LTC timecode (8-char hex string)
  if (typeof rawValue === 'string' && /^[0-9a-fA-F]{8}$/.test(rawValue)) {
    const decoded = decodeSonyLtcHex(rawValue, dropFrame)
    if (decoded) return decoded
  }

  // 3. Fallback: treat as a frame count
  const totalFrames = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10)

  if (isNaN(totalFrames)) {
    return String(rawValue)
  }

  // Parse frame rate, default to 30 if not provided
  const fps = frameRate ? parseFloat(frameRate) : 30

  return framesToTimecode(totalFrames, fps, dropFrame || false)
}

// ---------------------------------------------------------------------------
// MEDIAPRO.XML types (internal to drives.ts)
// ---------------------------------------------------------------------------

interface MediaProMaterial {
  mxfUri: string
  proxyUri?: string
  xmlUri?: string
  thumbnailUri?: string
  durationFrames: number
  fps: string
  audioChannels: number
  videoType: string
  audioType: string
  umid: string
}

interface MediaProParseResult {
  cameraModel: string | undefined
  cardId: string | undefined
  materials: MediaProMaterial[]
}

/**
 * Parse MEDIAPRO.XML content into a structured result.
 * Pure function — no filesystem access. Exported for unit testing.
 *
 * @param xmlContent - String content of MEDIAPRO.XML
 */
export function parseMediaProXML(xmlContent: string): MediaProParseResult | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const result = parser.parse(xmlContent)
    const profile = result.MediaProfile
    if (!profile) return null

    const cameraModel =
      typeof profile.Properties?.System?.['@_systemKind'] === 'string'
        ? (profile.Properties.System['@_systemKind'] as string)
        : undefined

    const cardId =
      typeof profile.Properties?.Attached?.['@_mediaId'] === 'string'
        ? (profile.Properties.Attached['@_mediaId'] as string)
        : undefined

    const rawMaterials: unknown = profile.Contents?.Material
    const materialArray = Array.isArray(rawMaterials)
      ? rawMaterials
      : rawMaterials != null
        ? [rawMaterials]
        : []

    const materials: MediaProMaterial[] = []

    for (const mat of materialArray) {
      const m = mat as Record<string, unknown>
      const mxfUri = typeof m['@_uri'] === 'string' ? m['@_uri'] : null
      if (!mxfUri) continue

      // Proxy element
      let proxyUri: string | undefined
      if (m.Proxy && typeof (m.Proxy as Record<string, unknown>)['@_uri'] === 'string') {
        proxyUri = (m.Proxy as Record<string, unknown>)['@_uri'] as string
      }

      // RelevantInfo elements (XML sidecar + thumbnail)
      let xmlUri: string | undefined
      let thumbnailUri: string | undefined
      const rawRI: unknown = m.RelevantInfo
      const riArray = Array.isArray(rawRI) ? rawRI : rawRI != null ? [rawRI] : []
      for (const ri of riArray) {
        const r = ri as Record<string, unknown>
        const riType = typeof r['@_type'] === 'string' ? r['@_type'] : ''
        const riUri = typeof r['@_uri'] === 'string' ? r['@_uri'] : ''
        if (riType === 'XML') xmlUri = riUri
        else if (riType === 'JPG') thumbnailUri = riUri
      }

      const toInt = (v: unknown): number => {
        const s = typeof v === 'string' || typeof v === 'number' ? String(v) : ''
        const n = parseInt(s, 10)
        return isNaN(n) ? 0 : n
      }
      const toStr = (v: unknown): string => (typeof v === 'string' ? v : '')

      materials.push({
        mxfUri,
        proxyUri,
        xmlUri,
        thumbnailUri,
        durationFrames: toInt(m['@_dur']),
        fps: toStr(m['@_fps']),
        audioChannels: toInt(m['@_ch']),
        videoType: toStr(m['@_videoType']),
        audioType: toStr(m['@_audioType']),
        umid: toStr(m['@_umid'])
      })
    }

    return { cameraModel, cardId, materials }
  } catch (error) {
    console.error('Failed to parse MEDIAPRO XML content:', error)
    return null
  }
}

/**
 * Read MEDIAPRO.XML from an XDROOT directory and validate listed files against disk.
 *
 * Returns null if MEDIAPRO.XML does not exist or cannot be parsed — the caller
 * should fall back to legacy filesystem scanning and set mediaProMissing = true.
 */
async function parseMediaPro(xdRootPath: string): Promise<{
  files: MXFFileInfo[]
  cameraModel: string | undefined
  cardId: string | undefined
  integrity: CardIntegrity
} | null> {
  const mediaProPath = path.join(xdRootPath, 'MEDIAPRO.XML')

  let xmlContent: string
  try {
    xmlContent = await fs.readFile(mediaProPath, 'utf-8')
  } catch {
    return null // File absent — caller uses legacy fallback
  }

  const parsed = parseMediaProXML(xmlContent)
  if (!parsed) return null

  const missingMxf: string[] = []
  const missingProxy: string[] = []
  const missingThumbnail: string[] = []

  /** Resolve a MEDIAPRO relative URI ("./Clip/foo.MXF") to an absolute path. */
  const resolveUri = (uri: string): string =>
    path.resolve(xdRootPath, uri.replace(/^\.\//u, ''))

  // Validate all materials concurrently and parse each sidecar XML
  const fileResults = await Promise.all(
    parsed.materials.map(async (mat): Promise<MXFFileInfo | null> => {
      const mxfAbsPath = resolveUri(mat.mxfUri)
      const basename = path.basename(mxfAbsPath)

      // Confirm MXF exists on disk
      try {
        await fs.access(mxfAbsPath)
      } catch {
        missingMxf.push(basename)
        return null
      }

      // Validate proxy
      let proxyPath: string | undefined
      if (mat.proxyUri) {
        const resolved = resolveUri(mat.proxyUri)
        try {
          await fs.access(resolved)
          proxyPath = resolved
        } catch {
          missingProxy.push(basename)
        }
      }

      // Validate thumbnail
      let thumbnailPath: string | undefined
      if (mat.thumbnailUri) {
        const resolved = resolveUri(mat.thumbnailUri)
        try {
          await fs.access(resolved)
          thumbnailPath = resolved
        } catch {
          missingThumbnail.push(basename)
        }
      }

      // Parse sidecar XML metadata (same parser as before)
      let metadata: XMLMetadata | undefined
      if (mat.xmlUri) {
        const xmlPath = resolveUri(mat.xmlUri)
        try {
          await fs.access(xmlPath)
          const sidecar = await parseXMLMetadata(xmlPath)
          if (sidecar) metadata = sidecar
        } catch {
          // XML sidecar missing — not critical, continue without metadata
        }
      }

      return {
        path: mxfAbsPath,
        name: basename,
        thumbnail: thumbnailPath,
        proxy: proxyPath,
        metadata,
        durationFrames: mat.durationFrames || undefined,
        fps: mat.fps || undefined,
        audioChannels: mat.audioChannels || undefined,
        videoType: mat.videoType || undefined,
        audioType: mat.audioType || undefined,
        umid: mat.umid || undefined
      }
    })
  )

  const files = fileResults.filter((f): f is MXFFileInfo => f !== null)

  return {
    files,
    cameraModel: parsed.cameraModel,
    cardId: parsed.cardId,
    integrity: {
      totalExpected: parsed.materials.length,
      missingMxf,
      missingProxy,
      missingThumbnail
    }
  }
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
 * Scan a Sony camera card using legacy file-by-file filesystem discovery.
 * Used as fallback when MEDIAPRO.XML is absent or unparseable.
 */
async function scanSonyCardLegacy(drivePath: string): Promise<MXFFileInfo[]> {
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
 * Scan a Sony camera card for MXF files.
 * Tries MEDIAPRO.XML first for fast, validated scanning.
 * Falls back to legacy file-by-file discovery if MEDIAPRO.XML is absent or malformed.
 */
async function scanSonyCardForMXF(drivePath: string): Promise<{
  files: MXFFileInfo[]
  cameraModel: string | undefined
  cardId: string | undefined
  mediaProMissing: boolean
  integrity: import('../renderer/src/types').CardIntegrity | undefined
}> {
  const xdRootPath = path.join(drivePath, 'XDROOT')
  const mediaProResult = await parseMediaPro(xdRootPath)

  if (mediaProResult) {
    console.log(
      `  Parsed MEDIAPRO.XML: ${mediaProResult.files.length} clips,` +
        ` missing: ${mediaProResult.integrity.missingMxf.length} MXF,` +
        ` ${mediaProResult.integrity.missingProxy.length} proxy`
    )
    return {
      files: mediaProResult.files,
      cameraModel: mediaProResult.cameraModel,
      cardId: mediaProResult.cardId,
      mediaProMissing: false,
      integrity: mediaProResult.integrity
    }
  }

  // MEDIAPRO.XML absent or unparseable — fall back to legacy scan
  console.log('  MEDIAPRO.XML missing or invalid — falling back to filesystem scan')
  const legacyFiles = await scanSonyCardLegacy(drivePath)
  return {
    files: legacyFiles,
    cameraModel: undefined,
    cardId: undefined,
    mediaProMissing: true,
    integrity: undefined
  }
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
